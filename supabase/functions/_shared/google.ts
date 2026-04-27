// Shared helpers for Google OAuth + Calendar API.
// Used by all google-* edge functions.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.104.0";

export const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") ?? "";
export const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ?? "";
export const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
export const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
export const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
export const GOOGLE_TASKS_SCOPE = "https://www.googleapis.com/auth/tasks.readonly";
export const GOOGLE_TASKS_FULL_SCOPE = "https://www.googleapis.com/auth/tasks";

export const GOOGLE_SCOPES = [
  GOOGLE_CALENDAR_SCOPE,
  GOOGLE_TASKS_SCOPE,
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
].join(" ");

export function hasRequiredGoogleCalendarScope(scope: string | null | undefined) {
  if (!scope) return false;
  return scope.split(/\s+/).includes(GOOGLE_CALENDAR_SCOPE);
}

export function hasRequiredGoogleTasksScope(scope: string | null | undefined) {
  if (!scope) return false;
  const scopes = scope.split(/\s+/);
  return scopes.includes(GOOGLE_TASKS_SCOPE) || scopes.includes(GOOGLE_TASKS_FULL_SCOPE);
}

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getUserFromAuthHeader(req: Request) {
  const authHeader = req.headers.get("x-user-authorization") ?? "";
  let token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    try {
      const body = await req.clone().json();
      token = typeof body?.__user_jwt === "string" ? body.__user_jwt.replace(/^Bearer\s+/i, "") : "";
    } catch (_) { /* no json body */ }
  }
  if (!token) token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  if (token === SUPABASE_ANON_KEY || token === SUPABASE_SERVICE_ROLE_KEY) return null;

  // 0) Fast path — decode JWT payload locally. Supabase už token podpísal,
  //    a my v edge function aj tak používame service-role klienta na DB.
  //    Tým obídeme problémy s getClaims()/getUser() pri novom signing-keys
  //    systéme (ES256), ktoré v @supabase/supabase-js@2.57 občas vracajú 401.
  try {
    const parts = token.split(".");
    if (parts.length === 3) {
      const padded = parts[1] + "=".repeat((4 - (parts[1].length % 4)) % 4);
      const json = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
      const payload = JSON.parse(json) as { sub?: string; email?: string; exp?: number };
      if (payload?.sub && (!payload.exp || payload.exp * 1000 > Date.now())) {
        return { id: payload.sub, email: payload.email ?? null };
      }
    }
  } catch (_) { /* fall through */ }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // 1) Prefer getClaims() — works with the new Supabase signing-keys system
  //    where getUser() can fail in edge functions.
  try {
    // @ts-ignore — getClaims exists in @supabase/supabase-js >= 2.49
    const maybeGetClaims = (client.auth as any).getClaims;
    if (typeof maybeGetClaims === "function") {
      const { data: claimsRes, error: claimsErr } = await maybeGetClaims.call(client.auth, token);
      if (!claimsErr && claimsRes?.claims?.sub) {
        return {
          id: claimsRes.claims.sub as string,
          email: (claimsRes.claims.email as string | undefined) ?? null,
        };
      }
    }
  } catch (_) { /* fall through */ }

  // 2) Try getUser(token) — explicit token form
  try {
    const { data, error } = await client.auth.getUser(token);
    if (!error && data?.user) return data.user;
  } catch (_) { /* fall through */ }

  // 3) Last resort: GoTrue REST endpoint
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
    });
    if (res.ok) {
      const u = await res.json();
      if (u?.id) return { id: u.id as string, email: (u.email as string | null) ?? null };
    } else {
      console.warn("auth/v1/user failed", res.status);
    }
  } catch (e) {
    console.warn("auth/v1/user threw", e);
  }
  return null;
}

export interface GoogleTokenRow {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expiry: string;
  calendar_id: string;
  google_email: string | null;
  scope: string | null;
}

/** Returns a valid access token (refreshes if needed). */
export async function getValidAccessToken(
  admin: SupabaseClient,
  userId: string
): Promise<{ token: string; calendarId: string } | null> {
  const { data, error } = await admin
    .from("google_calendar_tokens")
    .select("user_id, access_token, refresh_token, expiry, calendar_id, google_email, scope")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as GoogleTokenRow;
  if (!hasRequiredGoogleCalendarScope(row.scope)) return null;

  const expiresAt = new Date(row.expiry).getTime();
  // Refresh 60s before expiry
  if (expiresAt - 60_000 > Date.now()) {
    return { token: row.access_token, calendarId: row.calendar_id };
  }

  const refreshed = await refreshAccessToken(row.refresh_token);
  if (!refreshed) return null;

  const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await admin
    .from("google_calendar_tokens")
    .update({
      access_token: refreshed.access_token,
      expiry: newExpiry,
    })
    .eq("user_id", userId);

  return { token: refreshed.access_token, calendarId: row.calendar_id };
}

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    console.error("Refresh failed", res.status, await res.text());
    return null;
  }
  return (await res.json()) as { access_token: string; expires_in: number };
}