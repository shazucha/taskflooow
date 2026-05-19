// Edge function: posiela Web Push notifikácie zadaným používateľom.
// Volá sa z klienta po vložení DM / team-chat správy / priradení úlohy.
// Quiet hours (22:00–07:00 Europe/Bratislava) sú vynútené tu, na serveri.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VAPID_PUBLIC_KEY =
  "BEfdTMgeg7tO--F6E7nP2vTCy1ZOlLrQx08Yz822Na1fZv9REeg5Hey3TwowTGt4qUpFvjfUugUyU98YiYtSne0";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Vráti aktuálnu hodinu v Europe/Bratislava (0–23). */
function bratislavaHour(): number {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Bratislava",
    hour: "2-digit",
    hour12: false,
  });
  return Number.parseInt(fmt.format(new Date()), 10);
}

function isQuietHours(): boolean {
  const h = bratislavaHour();
  // Tichý režim: 22:00 (vrátane) – 07:00 (vrátane do 06:59)
  return h >= 22 || h < 7;
}

interface Payload {
  user_ids: string[];
  title: string;
  body: string;
  url?: string;
  tag?: string;
  /** Ak je true, posiela aj v tichom režime (urgentné). */
  force?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  // Overíme volajúceho cez JWT (verify_jwt = true je default).
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return new Response(JSON.stringify({ error: "missing auth" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const targets = (payload.user_ids ?? []).filter((x) => typeof x === "string");
  if (targets.length === 0 || !payload.title || !payload.body) {
    return new Response(JSON.stringify({ sent: 0, skipped: "no targets" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!payload.force && isQuietHours()) {
    return new Response(JSON.stringify({ sent: 0, skipped: "quiet-hours" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, user_id")
    .in("user_id", targets);

  if (error) {
    console.error("load subs failed:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const notifPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/",
    tag: payload.tag ?? "taskflow",
  });

  const deadEndpoints: string[] = [];
  let sent = 0;

  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          notifPayload,
          { TTL: 60 * 60 * 24 }
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410 = subscription expirovala alebo bola zrušená → vymazať.
        if (status === 404 || status === 410) {
          deadEndpoints.push(s.endpoint);
        } else {
          console.warn("push send failed:", status, err);
        }
      }
    })
  );

  if (deadEndpoints.length > 0) {
    await admin.from("push_subscriptions").delete().in("endpoint", deadEndpoints);
  }

  return new Response(
    JSON.stringify({ sent, dead: deadEndpoints.length, total: subs?.length ?? 0 }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});