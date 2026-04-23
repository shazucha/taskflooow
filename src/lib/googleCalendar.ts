import { supabase } from "./supabase";

export interface GoogleEvent {
  id: string;
  title: string;
  description: string | null;
  start: string | null;
  end: string | null;
  all_day: boolean;
  url: string | null;
}

export class GoogleReconnectRequiredError extends Error {
  constructor(message = "Google kalendár treba znova pripojiť") {
    super(message);
    this.name = "GoogleReconnectRequiredError";
  }
}

function callbackRedirectUri() {
  return `${window.location.origin}/auth/google/callback`;
}

export async function startGoogleOAuth(): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ url: string }>("google-oauth-start", {
    body: { redirect_uri: callbackRedirectUri() },
  });
  if (error) throw error;
  if (!data?.url) throw new Error("No auth URL returned");
  return data.url;
}

export async function completeGoogleOAuth(code: string): Promise<{ email: string | null }> {
  const { data, error } = await supabase.functions.invoke<{ ok: true; email: string | null }>(
    "google-oauth-callback",
    { body: { code, redirect_uri: callbackRedirectUri() } }
  );
  if (error) throw error;
  return { email: data?.email ?? null };
}

export async function disconnectGoogle(): Promise<void> {
  const { error } = await supabase.functions.invoke("google-calendar-disconnect", { body: {} });
  if (error) throw error;
}

export async function fetchGoogleEvents(timeMin: Date, timeMax: Date): Promise<GoogleEvent[]> {
  const { data, error } = await supabase.functions.invoke<{ events: GoogleEvent[]; not_connected?: boolean }>(
    "google-calendar-fetch",
    { body: { time_min: timeMin.toISOString(), time_max: timeMax.toISOString() } }
  );
  if (error) {
    const message = error.message || "";
    if (message.includes("reauth_required") || message.includes("insufficientPermissions") || message.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT")) {
      throw new GoogleReconnectRequiredError();
    }
    throw error;
  }
  if (data?.not_connected) return [];
  return data?.events ?? [];
}

export async function syncTaskToGoogle(taskId: string, action: "upsert" | "delete" = "upsert"): Promise<void> {
  // Fire and forget — never block UI on Google.
  try {
    await supabase.functions.invoke("google-calendar-sync", { body: { action, task_id: taskId } });
  } catch (e) {
    console.warn("Google sync failed (non-fatal)", e);
  }
}

export async function isGoogleConnected(): Promise<{ connected: boolean; email: string | null }> {
  const { data, error } = await supabase
    .from("google_calendar_tokens")
    .select("google_email")
    .maybeSingle();
  if (error) return { connected: false, email: null };
  return { connected: !!data, email: data?.google_email ?? null };
}