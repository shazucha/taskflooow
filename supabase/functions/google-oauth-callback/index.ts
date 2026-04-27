import { corsHeaders } from "../_shared/cors.ts";
import {
  GOOGLE_CALENDAR_SCOPE,
  GOOGLE_TASKS_SCOPE,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  adminClient,
  getUserFromAuthHeader,
  hasRequiredGoogleCalendarScope,
  hasRequiredGoogleTasksScope,
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

    const { code, redirect_uri } = await req.json();
    if (!code || !redirect_uri) {
      return new Response(JSON.stringify({ error: "code and redirect_uri required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      console.error("token exchange failed", tokenRes.status, t);
      return new Response(JSON.stringify({ error: "token_exchange_failed", detail: t }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
    };

    if (!hasRequiredGoogleCalendarScope(tokens.scope)) {
      return new Response(JSON.stringify({
        error: "insufficient_scope",
        message: `Google nevrátil povolenie ${GOOGLE_CALENDAR_SCOPE}`,
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Tasks scope je voliteľný — ak ho používateľ neudelil, pripojenie aj tak uložíme,
    // len bez možnosti importovať Google Tasks. Frontend zobrazí warning banner.
    const hasTasksScope = hasRequiredGoogleTasksScope(tokens.scope);

    if (!tokens.refresh_token) {
      return new Response(JSON.stringify({
        error: "no_refresh_token",
        message: "Google did not return a refresh token. Revoke previous access at https://myaccount.google.com/permissions and try again.",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user email
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = profileRes.ok ? await profileRes.json() : {};

    const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const admin = adminClient();
    const { error: upsertError } = await admin
      .from("google_calendar_tokens")
      .upsert({
        user_id: user.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry,
        calendar_id: "primary",
        google_email: profile.email ?? null,
        scope: tokens.scope,
      });

    if (upsertError) {
      console.error(upsertError);
      return new Response(JSON.stringify({ error: upsertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      email: profile.email ?? null,
      has_tasks_scope: hasTasksScope,
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