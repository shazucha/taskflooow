// Shared helpers for Google OAuth + Calendar API.
// Used by all google-* edge functions.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") ?? "";
export const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ?? "";
export const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
export const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
export const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
].join(" ");

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getUserFromAuthHeader(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export interface GoogleTokenRow {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expiry: string;
  calendar_id: string;
  google_email: string | null;
}

/** Returns a valid access token (refreshes if needed). */
export async function getValidAccessToken(
  admin: SupabaseClient,
  userId: string
): Promise<{ token: string; calendarId: string } | null> {
  const { data, error } = await admin
    .from("google_calendar_tokens")
    .select("user_id, access_token, refresh_token, expiry, calendar_id, google_email")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as GoogleTokenRow;

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