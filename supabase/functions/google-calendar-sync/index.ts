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
}

function hasTime(iso: string) {
  const d = new Date(iso);
  return d.getHours() !== 0 || d.getMinutes() !== 0;
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

    const { action, task_id } = await req.json();
    if (!task_id || !["upsert", "delete"].includes(action)) {
      return new Response(JSON.stringify({ error: "invalid_payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = adminClient();
    const { data: taskData, error: taskErr } = await admin
      .from("tasks")
      .select("id, title, description, due_date, due_end, assignee_id, google_event_id, google_calendar_owner")
      .eq("id", task_id)
      .maybeSingle();
    if (taskErr || !taskData) {
      return new Response(JSON.stringify({ error: "task_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
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
        return new Response(JSON.stringify({ error: "reauth_required", detail: "missing_calendar_scope" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ---- DELETE
    if (action === "delete") {
      if (!task.google_event_id || !targetUserId) {
        return new Response(JSON.stringify({ ok: true, skipped: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- UPSERT
    // Skip if no time (we only sync timed tasks)
    if (!task.due_date || !hasTime(task.due_date)) {
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
      return new Response(JSON.stringify({ ok: true, skipped: "no_time" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!targetUserId) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_assignee" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    const tok = await getValidAccessToken(admin, targetUserId);
    if (!tok) {
      return new Response(JSON.stringify({ ok: true, skipped: "user_not_connected" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const start = new Date(task.due_date);
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

    // If we have an existing event, check its eventType. Special types
    // (focusTime, outOfOffice, workingLocation, fromGmail) cannot be PATCH-ed
    // as a normal event — delete it and create a fresh default event instead.
    if (task.google_event_id) {
      try {
        const getRes = await fetch(`${base}/${task.google_event_id}`, {
          headers: { Authorization: `Bearer ${tok.token}` },
        });
        if (getRes.ok) {
          const existing = await getRes.json();
          if (existing?.eventType && existing.eventType !== "default") {
            await fetch(`${base}/${task.google_event_id}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${tok.token}` },
            });
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

    const evRes = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${tok.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(eventBody),
    });

    if (!evRes.ok) {
      const t = await evRes.text();
      console.error("Calendar API failed", evRes.status, t);
      // If event was deleted on Google side, retry once as POST
      if (evRes.status === 404 && task.google_event_id) {
        const retry = await fetch(base, {
          method: "POST",
          headers: { Authorization: `Bearer ${tok.token}`, "Content-Type": "application/json" },
          body: JSON.stringify(eventBody),
        });
        if (retry.ok) {
          const ev = await retry.json();
          await admin.from("tasks").update({
            google_event_id: ev.id,
            google_calendar_owner: targetUserId,
          }).eq("id", task.id);
          return new Response(JSON.stringify({ ok: true, event_id: ev.id }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      // If PATCH failed because the existing event is a special type
      // (focus time, OOO, working location, fromGmail), delete + recreate.
      const isSpecialTypeConflict =
        evRes.status === 400 &&
        /malformedFocusTimeEvent|malformedOutOfOfficeEvent|malformedWorkingLocationEvent|cannotChangeOrganizer|invalidEventType/i.test(t);
      if (isSpecialTypeConflict) {
        if (task.google_event_id) {
          await fetch(`${base}/${task.google_event_id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${tok.token}` },
          });
        }
        const retry = await fetch(base, {
          method: "POST",
          headers: { Authorization: `Bearer ${tok.token}`, "Content-Type": "application/json" },
          body: JSON.stringify(eventBody),
        });
        if (retry.ok) {
          const ev = await retry.json();
          await admin.from("tasks").update({
            google_event_id: ev.id,
            google_calendar_owner: targetUserId,
          }).eq("id", task.id);
          return new Response(JSON.stringify({ ok: true, event_id: ev.id, recreated: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const retryText = await retry.text();
        console.error("Calendar special-type recreate failed", retry.status, retryText);
        await admin
          .from("tasks")
          .update({ google_event_id: null, google_calendar_owner: null })
          .eq("id", task.id);
        return new Response(JSON.stringify({ ok: true, skipped: "special_event_conflict", detail: retryText || t }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "calendar_api_failed", detail: t }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ev = await evRes.json();
    await admin.from("tasks").update({
      google_event_id: ev.id,
      google_calendar_owner: targetUserId,
    }).eq("id", task.id);

    return new Response(JSON.stringify({ ok: true, event_id: ev.id }), {
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