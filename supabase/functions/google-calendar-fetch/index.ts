// Fetch events from the current user's Google Calendar.
// Body: { time_min: string, time_max: string }

import { corsHeaders } from "../_shared/cors.ts";
import {
  adminClient,
  getUserFromAuthHeader,
  getValidAccessToken,
} from "../_shared/google.ts";

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

    const { time_min, time_max } = await req.json();
    if (!time_min || !time_max) {
      return new Response(JSON.stringify({ error: "time_min and time_max required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = adminClient();
    const tok = await getValidAccessToken(admin, user.id);
    if (!tok) {
      return new Response(JSON.stringify({ ok: true, events: [], not_connected: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(tok.calendarId)}/events`
    );
    url.searchParams.set("timeMin", new Date(time_min).toISOString());
    url.searchParams.set("timeMax", new Date(time_max).toISOString());
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "250");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${tok.token}` },
    });
    if (!res.ok) {
      const t = await res.text();
      console.error("calendar list failed", res.status, t);
      return new Response(JSON.stringify({ error: "calendar_api_failed", detail: t }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await res.json();

    // Filter out events that originate from our own task sync to avoid duplicates
    const events = (data.items ?? [])
      .filter((e: { source?: { title?: string } }) => e.source?.title !== "TaskFlow")
      .map((e: {
        id: string;
        summary?: string;
        description?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
        htmlLink?: string;
      }) => ({
        id: e.id,
        title: e.summary ?? "(bez názvu)",
        description: e.description ?? null,
        start: e.start?.dateTime ?? e.start?.date ?? null,
        end: e.end?.dateTime ?? e.end?.date ?? null,
        all_day: !e.start?.dateTime,
        url: e.htmlLink ?? null,
      }));

    return new Response(JSON.stringify({ ok: true, events }), {
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