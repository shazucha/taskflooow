// Upsert or delete a Google Calendar event for a task.
// Body: { action: "upsert" | "delete", task_id: string }
// App is source of truth — we always overwrite the Google event with task data.

import { corsHeaders } from "../_shared/cors.ts";
import {
  adminClient,
  getUserFromAuthHeader,
  getValidAccessToken,
  hasRequiredGoogleCalendarScope,
} from "../_shared/google.ts";

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  due_end: string | null;
  assignee_id: string | null;
  google_event_id: string | null;
  google_calendar_owner: string | null;
  google_imported: boolean | null;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fallbackResponse(body: Record<string, unknown>) {
  return jsonResponse({ ok: true, fallback: true, ...body });
}

const SPECIAL_EVENT_CONFLICT_RE = /malformedFocusTimeEvent|malformedOutOfOfficeEvent|malformedWorkingLocationEvent|cannotChangeOrganizer|invalidEventType|focus time event|out of office event|working location/i;
const GOOGLE_ERROR_STATUS_RE = /"code"\s*:\s*(\d{3})/;

function effectiveGoogleStatus(responseStatus: number, detail: string) {
  const match = detail.match(GOOGLE_ERROR_STATUS_RE);
  return match?.[1] ? Number(match[1]) : responseStatus;
}

// Google Calendar event IDs musia byť base32hex (a-v + 0-9), 5–1024 znakov.
// Vytvoríme deterministické ID z task_id, aby bol POST idempotentný:
// pri retry po 5xx Google vráti 409 "duplicate" namiesto vytvorenia
// druhého eventu. Tým sa eliminujú duplikáty v kalendári.
function deterministicEventId(taskId: string): string {
  // taskId je UUID (hex + pomlčky). Odstránime pomlčky a namapujeme hex
  // znaky 'w'-'z' (nedovolené v base32hex) preč. UUID hex obsahuje len 0-9a-f,
  // čo je validná podmnožina base32hex, takže stačí odstrániť pomlčky.
  const cleaned = taskId.toLowerCase().replace(/-/g, "").replace(/[^a-v0-9]/g, "0");
  // Prefix musí začínať písmenom (nepovinné, ale bezpečné) — pridáme "tf".
  return `tf${cleaned}`;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: { retries?: number; retryOn?: number[] } = {}
): Promise<Response> {
  const retries = opts.retries ?? 3;
  const retryOn = opts.retryOn ?? [500, 502, 503, 504];
  let lastRes: Response | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (!retryOn.includes(res.status)) return res;
      lastRes = res;
    } catch (e) {
      if (attempt === retries) throw e;
    }
    if (attempt < retries) await sleep(400 * Math.pow(2, attempt) + Math.floor(Math.random() * 200));
  }
  return lastRes!;
}

function isSpecialTypeConflict(detail: string) {
  if (SPECIAL_EVENT_CONFLICT_RE.test(detail)) return true;
  // Some Google error payloads nest the reason inside error.errors[].reason
  // — also try to extract those before falling through.
  try {
    const parsed = JSON.parse(detail);
    const pieces = [
      parsed?.error?.message,
      ...(parsed?.error?.errors ?? []).flatMap((item: { reason?: string; message?: string }) => [
        item.reason,
        item.message,
      ]),
    ]
      .filter(Boolean)
      .join(" ");
    return SPECIAL_EVENT_CONFLICT_RE.test(pieces);
  } catch {
    return false;
  }
}

async function clearGoogleMapping(admin: ReturnType<typeof adminClient>, taskId: string) {
  await admin
    .from("tasks")
    .update({ google_event_id: null, google_calendar_owner: null })
    .eq("id", taskId);
}

function hasTime(iso: string) {
  // Pracujeme s reťazcom v UTC (z DB chodí "...Z"), aby sme nezáviseli od
  // timezone servera. Mobil aj desktop posielajú ISO; ak hodina/minúta
  // v UTC nie je 00:00, považujeme to za "má čas".
  // Zároveň: ak má string vôbec časovú časť ("T..."), berieme to za čas.
  // (Predtým funkcia používala lokálne getHours/getMinutes, čo na rôznych
  // platformách viedlo k preskakovaniu syncu.)
  if (!iso.includes("T")) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  return d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0 || d.getUTCSeconds() !== 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const user = await getUserFromAuthHeader(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { action, task_id } = await req.json();
    if (!task_id || !["upsert", "delete"].includes(action)) return jsonResponse({ error: "invalid_payload" }, 400);

    const admin = adminClient();
    const { data: taskData, error: taskErr } = await admin
      .from("tasks")
      .select("id, title, description, due_date, due_end, assignee_id, google_event_id, google_calendar_owner, google_imported")
      .eq("id", task_id)
      .maybeSingle();
    if (taskErr || !taskData) return jsonResponse({ error: "task_not_found" }, 404);
    const task = taskData as TaskRow;

    // Determine which user's calendar should hold this event.
    // Prefer existing owner mapping; otherwise the assignee.
    let targetUserId = task.google_calendar_owner ?? task.assignee_id;

    if (targetUserId) {
      const { data: tokenRow } = await admin
        .from("google_calendar_tokens")
        .select("scope")
        .eq("user_id", targetUserId)
        .maybeSingle();

        if (tokenRow && !hasRequiredGoogleCalendarScope(tokenRow.scope)) {
          return jsonResponse({ error: "reauth_required", detail: "missing_calendar_scope" }, 409);
        }
    }

    // ---- DELETE
    if (action === "delete") {
      if (!task.google_event_id || !targetUserId) {
        return jsonResponse({ ok: true, skipped: true });
      }
      const tok = await getValidAccessToken(admin, targetUserId);
      if (tok) {
        await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(tok.calendarId)}/events/${task.google_event_id}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${tok.token}` } }
        );
      }
      await admin
        .from("tasks")
        .update({ google_event_id: null, google_calendar_owner: null })
        .eq("id", task.id);
      return jsonResponse({ ok: true });
    }

    // ---- UPSERT
    // Google-imported rows mirror Google Calendar/Tasks and must not be pushed
    // back as Calendar event PATCH requests. Special Google event types like
    // Focus Time reject normal updates with malformedFocusTimeEvent.
    if (task.google_imported) {
      return jsonResponse({ ok: true, skipped: "google_imported_readonly" });
    }

    // Synchronizujeme iba úlohy, ktoré majú definovaný interval:
    //   - musia mať due_date (začiatok)
    //   - a buď due_end (koniec) alebo non-zero čas v due_date.
    // Toto rovnako funguje na desktope aj mobile (predtým spoliehalo na
    // lokálny getHours, čo pri rôznych timezone fallback-och viedlo k
    // preskakovaniu syncu na mobile).
    const hasInterval = !!task.due_date && (!!task.due_end || hasTime(task.due_date));
    if (!hasInterval) {
      // If we previously synced and now lost the time, delete the event
      if (task.google_event_id && targetUserId) {
        const tok = await getValidAccessToken(admin, targetUserId);
        if (tok) {
          await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(tok.calendarId)}/events/${task.google_event_id}`,
            { method: "DELETE", headers: { Authorization: `Bearer ${tok.token}` } }
          );
        }
        await admin
          .from("tasks")
          .update({ google_event_id: null, google_calendar_owner: null })
          .eq("id", task.id);
      }
      return jsonResponse({ ok: true, skipped: "no_time" });
    }

    if (!targetUserId) {
      return jsonResponse({ ok: true, skipped: "no_assignee" });
    }

    // If the assignee changed, delete event from previous owner first
    if (task.google_event_id && task.google_calendar_owner && task.google_calendar_owner !== task.assignee_id) {
      const oldTok = await getValidAccessToken(admin, task.google_calendar_owner);
      if (oldTok) {
        await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(oldTok.calendarId)}/events/${task.google_event_id}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${oldTok.token}` } }
        );
      }
      task.google_event_id = null;
      targetUserId = task.assignee_id;
    }

    if (!targetUserId) {
      return jsonResponse({ ok: true, skipped: "no_assignee" });
    }

    const tok = await getValidAccessToken(admin, targetUserId);
    if (!tok) {
      return jsonResponse({ ok: true, skipped: "user_not_connected" });
    }

    // hasInterval kontrola vyššie už zaručila task.due_date != null
    const start = new Date(task.due_date!);
    const end = task.due_end ? new Date(task.due_end) : new Date(start.getTime() + 30 * 60 * 1000);
    const eventBody = {
      summary: task.title,
      description: task.description ?? undefined,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      source: { title: "TaskFlow", url: "https://taskflow.digitance.eu" },
    };

    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(tok.calendarId)}/events`;
    let url = task.google_event_id ? `${base}/${task.google_event_id}` : base;
    let method: "PATCH" | "POST" = task.google_event_id ? "PATCH" : "POST";

    // Pre POST (nový event) použijeme deterministické ID — robí operáciu
    // idempotentnou: opakovaný POST s rovnakým ID vráti 409 "duplicate"
    // namiesto vytvorenia druhého eventu.
    const desiredEventId = deterministicEventId(task.id);
    const eventBodyForCreate = { ...eventBody, id: desiredEventId };

    // If we have an existing event, check its eventType. Special types
    // (focusTime, outOfOffice, workingLocation, fromGmail) cannot be PATCH-ed
    // or deleted as normal events. Leave the Google-owned event untouched,
    // clear our stale mapping, then create a fresh default TaskFlow event.
    if (task.google_event_id) {
      try {
        const getRes = await fetchWithRetry(`${base}/${task.google_event_id}`, {
          headers: { Authorization: `Bearer ${tok.token}` },
        }, { retries: 2 });
        if (getRes.ok) {
          const existing = await getRes.json();
          if (existing?.eventType && existing.eventType !== "default") {
            await clearGoogleMapping(admin, task.id);
            task.google_event_id = null;
            url = base;
            method = "POST";
          }
        } else if (getRes.status === 404) {
          task.google_event_id = null;
          url = base;
          method = "POST";
        } else {
          await getRes.text();
        }
      } catch (e) {
        console.warn("eventType pre-check failed", e);
      }
    }

    const bodyToSend = method === "POST" ? eventBodyForCreate : eventBody;
    let evRes = await fetchWithRetry(url, {
      method,
      headers: { Authorization: `Bearer ${tok.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(bodyToSend),
    }, { retries: 3 });

    // Idempotency: ak POST narazí na 409 (event s naším deterministickým ID
    // už existuje — typicky kvôli predošlému retry), namapujeme ho a pre
    // istotu spravíme PATCH na aktualizáciu polí.
    if (method === "POST" && evRes.status === 409) {
      const patchUrl = `${base}/${desiredEventId}`;
      const patchRes = await fetchWithRetry(patchUrl, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${tok.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(eventBody),
      }, { retries: 2 });
      if (patchRes.ok) {
        const ev = await patchRes.json();
        await admin.from("tasks").update({
          google_event_id: ev.id ?? desiredEventId,
          google_calendar_owner: targetUserId,
        }).eq("id", task.id);
        return jsonResponse({ ok: true, event_id: ev.id ?? desiredEventId, deduped: true });
      }
      evRes = patchRes;
    }

    if (!evRes.ok) {
      const t = await evRes.text();
      const googleStatus = effectiveGoogleStatus(evRes.status, t);
      console.error("Calendar API failed", evRes.status, t);
      if (isSpecialTypeConflict(t)) {
        await clearGoogleMapping(admin, task.id);
        return jsonResponse({
          ok: true,
          fallback: true,
          skipped: "special_event_conflict",
          detail: t,
        });
      }
      // If event was deleted on Google side, retry once as POST
      if (evRes.status === 404 && task.google_event_id) {
        const retry = await fetchWithRetry(base, {
          method: "POST",
          headers: { Authorization: `Bearer ${tok.token}`, "Content-Type": "application/json" },
          body: JSON.stringify(eventBodyForCreate),
        }, { retries: 2 });
        if (retry.ok) {
          const ev = await retry.json();
          await admin.from("tasks").update({
            google_event_id: ev.id,
            google_calendar_owner: targetUserId,
          }).eq("id", task.id);
          return jsonResponse({ ok: true, event_id: ev.id });
        }
      }

      // Never propagate as a hard error — return 200 with fallback signal so
      // the client doesn't crash. Also clear stale event mapping for 4xx.
      if (googleStatus >= 400 && googleStatus < 500 && task.google_event_id) {
        await clearGoogleMapping(admin, task.id);
      }
      return fallbackResponse({
        error: "calendar_api_failed",
        detail: t,
        skipped: "calendar_api_failed",
        status: googleStatus,
      });
    }

    const ev = await evRes.json();
    await admin.from("tasks").update({
      google_event_id: ev.id,
      google_calendar_owner: targetUserId,
    }).eq("id", task.id);

    return jsonResponse({ ok: true, event_id: ev.id });
  } catch (e) {
    console.error(e);
    return fallbackResponse({ error: e instanceof Error ? e.message : "error" });
  }
});