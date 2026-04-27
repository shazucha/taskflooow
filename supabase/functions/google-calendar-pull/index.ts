// Pull events from the user's Google primary calendar into TaskFlow tasks.
// - Events created in Google -> new tasks (assigned to the current user, no project)
// - Events updated in Google -> matching task gets title/description/time updated
// - Events deleted in Google -> matching task is deleted (per user choice)
// We only touch rows where google_calendar_owner = current user, so we never
// overwrite tasks that belong to other people.

import { corsHeaders } from "../_shared/cors.ts";
import {
  adminClient,
  getUserFromAuthHeader,
  getValidAccessToken,
  hasRequiredGoogleCalendarScope,
} from "../_shared/google.ts";

interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  source?: { title?: string };
  updated?: string;
}

function pickStart(e: GoogleEvent): string | null {
  return e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00` : null);
}
function pickEnd(e: GoogleEvent): string | null {
  return e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T00:00:00` : null);
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function projectBaseName(name: string) {
  return normalizeText(name.replace(/\.[a-z]{2,}$/i, ""));
}

function inferProjectId(
  title: string,
  description: string | null,
  projects: Array<{ id: string; name: string }>,
  recurringWorks: Array<{ project_id: string; title: string }>
) {
  const haystack = normalizeText(`${title} ${description ?? ""}`);
  const byProjectName = projects.filter((p) => {
    const full = normalizeText(p.name);
    const base = projectBaseName(p.name);
    return (full.length >= 3 && haystack.includes(full)) || (base.length >= 3 && haystack.includes(base));
  });
  if (byProjectName.length === 1) return byProjectName[0].id;

  const taskTitle = normalizeText(title);
  const byRecurringTitle = recurringWorks.filter((w) => {
    const workTitle = normalizeText(w.title);
    return workTitle.length >= 6 && (taskTitle === workTitle || taskTitle.includes(workTitle) || workTitle.includes(taskTitle));
  });
  const projectIds = [...new Set(byRecurringTitle.map((w) => w.project_id))];
  return projectIds.length === 1 ? projectIds[0] : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const user = await getUserFromAuthHeader(req);
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = adminClient();
    const { data: tokenRow } = await admin
      .from("google_calendar_tokens")
      .select("scope, sync_token")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!tokenRow) {
      return new Response(JSON.stringify({ ok: true, not_connected: true, imported: 0, updated: 0, deleted: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!hasRequiredGoogleCalendarScope(tokenRow.scope)) {
      return new Response(JSON.stringify({ error: "reauth_required", detail: "missing_calendar_scope" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tok = await getValidAccessToken(admin, user.id);
    if (!tok) {
      return new Response(JSON.stringify({ ok: true, not_connected: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Fetch events. Use incremental sync_token if we have one;
    //     otherwise do a full window pull (last 30d -> +180d) and store the new sync token.
    const events: GoogleEvent[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    let usedSyncToken = !!tokenRow.sync_token;
    let attempt = 0;

    while (true) {
      attempt++;
      const url = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(tok.calendarId)}/events`
      );
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("maxResults", "250");
      if (usedSyncToken) {
        url.searchParams.set("syncToken", tokenRow.sync_token!);
      } else {
        // Only pull from "now" forward — never import past events.
        const from = new Date();
        from.setHours(0, 0, 0, 0);
        const to = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
        url.searchParams.set("timeMin", from.toISOString());
        url.searchParams.set("timeMax", to.toISOString());
      }
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${tok.token}` },
      });

      // 410 = sync token expired -> redo full pull
      if (res.status === 410 && usedSyncToken) {
        usedSyncToken = false;
        pageToken = undefined;
        await admin.from("google_calendar_tokens").update({ sync_token: null }).eq("user_id", user.id);
        continue;
      }

      if (!res.ok) {
        const t = await res.text();
        console.error("calendar list failed", res.status, t);
        return new Response(JSON.stringify({ error: "calendar_api_failed", detail: t }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const data = await res.json();
      for (const item of data.items ?? []) events.push(item);
      if (data.nextPageToken) {
        pageToken = data.nextPageToken;
      } else {
        nextSyncToken = data.nextSyncToken;
        break;
      }
      if (attempt > 20) break; // safety
    }

    // Skip events that came from us (we set source.title = "TaskFlow")
    let imported = 0, updated = 0, deleted = 0;
    let importedTodo = 0, importedDone = 0;
    const auditSamples: Array<{
      title: string;
      end: string | null;
      status: "todo" | "done";
      reason: string;
    }> = [];

    // Pre-fetch user's existing google-linked tasks for this owner so we don't
    // do one query per event.
    const eventIds = events.map((e) => e.id).filter(Boolean);
    type ExistingTaskRow = {
      id: string;
      google_event_id: string;
      title: string;
      description: string | null;
      due_date: string | null;
      due_end: string | null;
      google_imported: boolean;
    };

    const { data: existing } = eventIds.length
      ? await admin
          .from("tasks")
          .select("id, google_event_id, title, description, due_date, due_end, google_imported")
          .eq("google_calendar_owner", user.id)
          .in("google_event_id", eventIds)
      : { data: [] as ExistingTaskRow[] };

    const byEventId = new Map<string, ExistingTaskRow>();
    for (const t of existing ?? []) byEventId.set(t.google_event_id, t);

    const { data: projects } = await admin.from("projects").select("id, name");
    const { data: recurringWorks } = await admin.from("project_recurring_works").select("project_id, title");

    for (const ev of events) {
      // Cancelled/deleted in Google
      if (ev.status === "cancelled") {
        const t = byEventId.get(ev.id);
        if (t) {
          await admin.from("tasks").delete().eq("id", t.id);
          deleted++;
        }
        continue;
      }

      // Skip events we created from TaskFlow (already in sync the other way)
      if (ev.source?.title === "TaskFlow") continue;

      const start = pickStart(ev);
      const end = pickEnd(ev);
      if (!start) continue; // ignore events with no time at all

      // Skip events that started before today — user only wants new/future stuff.
      const startMs = new Date(start).getTime();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      if (startMs < todayStart.getTime() && !byEventId.get(ev.id)) {
        // Only skip NEW imports. If we already imported it earlier, keep updating it.
        continue;
      }

      const title = ev.summary?.trim() || "(bez názvu)";
      const description = ev.description ?? null;
      const inferredProjectId = inferProjectId(title, description, projects ?? [], recurringWorks ?? []);

      const existingTask = byEventId.get(ev.id);
      if (existingTask) {
        // Update if anything changed
        const changed =
          existingTask.title !== title ||
          existingTask.description !== description ||
          existingTask.due_date !== start ||
          existingTask.due_end !== end;
        if (changed) {
          await admin
            .from("tasks")
            .update({ title, description, due_date: start, due_end: end })
            .eq("id", existingTask.id);
          updated++;
        }
      } else {
        // New event from Google -> create task.
        // Ak udalosť už skončila, vytvoríme ju rovno ako "done", aby
        // používateľ nemal v zozname stovky historických otvorených úloh.
        const endMs = end ? new Date(end).getTime() : startMs;
        const isPast = endMs < Date.now();
        const initialStatus: "todo" | "done" = isPast ? "done" : "todo";
        const { error: insertErr } = await admin.from("tasks").insert({
          title,
          description,
          priority: "low",
          status: initialStatus,
          project_id: inferredProjectId,
          assignee_id: user.id,
          created_by: user.id,
          due_date: start,
          due_end: end,
          google_event_id: ev.id,
          google_calendar_owner: user.id,
          google_imported: true,
        });
        if (insertErr) {
          console.error("insert task failed", insertErr);
        } else {
          imported++;
          if (initialStatus === "done") importedDone++; else importedTodo++;
          if (auditSamples.length < 10) {
            auditSamples.push({
              title,
              end: end ?? start,
              status: initialStatus,
              reason: isPast ? "end < now() → done" : "end >= now() → todo",
            });
          }
        }
      }
    }

    if (nextSyncToken) {
      await admin
        .from("google_calendar_tokens")
        .update({ sync_token: nextSyncToken, last_pulled_at: new Date().toISOString() })
        .eq("user_id", user.id);
    }

    // Audit: skontroluj konzistenciu už uložených Google-importovaných úloh
    // (či status zodpovedá end-dátumu).
    const { data: allGoogleTasks } = await admin
      .from("tasks")
      .select("id, status, due_date, due_end")
      .eq("google_calendar_owner", user.id)
      .eq("google_imported", true);

    const now = Date.now();
    let auditTotal = 0;
    let auditTodoFuture = 0;
    let auditTodoPast = 0;   // problém: malo by byť done
    let auditDonePast = 0;
    let auditDoneFuture = 0; // problém: označené ako done aj keď ešte len bude
    for (const t of allGoogleTasks ?? []) {
      auditTotal++;
      const endIso = t.due_end ?? t.due_date;
      if (!endIso) continue;
      const endMs = new Date(endIso).getTime();
      const isPast = endMs < now;
      if (t.status === "done" && isPast) auditDonePast++;
      else if (t.status === "done" && !isPast) auditDoneFuture++;
      else if (t.status !== "done" && isPast) auditTodoPast++;
      else auditTodoFuture++;
    }

    return new Response(JSON.stringify({
      ok: true,
      imported,
      updated,
      deleted,
      imported_breakdown: { todo: importedTodo, done: importedDone },
      sample: auditSamples,
      audit: {
        total_google_tasks: auditTotal,
        todo_future_ok: auditTodoFuture,
        done_past_ok: auditDonePast,
        todo_past_inconsistent: auditTodoPast,
        done_future_inconsistent: auditDoneFuture,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});