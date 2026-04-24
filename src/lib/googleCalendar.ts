import { supabase } from "./supabase";

const REQUIRED_GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar";

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

export interface PullResult {
  ok: boolean;
  imported: number;
  updated: number;
  deleted: number;
  not_connected?: boolean;
}

export interface GoogleSyncResult {
  ok?: boolean;
  error?: string;
  detail?: string;
  skipped?: boolean | string;
  recreated?: boolean;
  event_id?: string;
}

/** Pull events FROM Google INTO TaskFlow tasks. Returns counts of changes. */
export async function pullGoogleEvents(): Promise<PullResult | null> {
  const { data, error } = await supabase.functions.invoke<PullResult>("google-calendar-pull", { body: {} });
  if (error) {
    const message = error.message || "";
    if (message.includes("reauth_required") || message.includes("insufficientPermissions") || message.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT")) {
      throw new GoogleReconnectRequiredError();
    }
    return null;
  }
  return data ?? null;
}

export async function syncTaskToGoogle(taskId: string, action: "upsert" | "delete" = "upsert"): Promise<GoogleSyncResult> {
  const { data, error } = await supabase.functions.invoke<GoogleSyncResult>("google-calendar-sync", {
    body: { action, task_id: taskId },
  });

  if (error) {
    const message = error.message || "";
    if (message.includes("reauth_required") || message.includes("insufficientPermissions") || message.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT")) {
      throw new GoogleReconnectRequiredError();
    }
    throw error;
  }

  if (data?.error) {
    throw new Error(data.detail || data.error);
  }

  return data ?? { ok: true };
}

export async function isGoogleConnected(): Promise<{ connected: boolean; email: string | null }> {
  const { data, error } = await supabase
    .from("google_calendar_tokens")
    .select("google_email, scope")
    .maybeSingle();
  if (error) return { connected: false, email: null };
  const connected = !!data && !!data.scope?.split(/\s+/).includes(REQUIRED_GOOGLE_SCOPE);
  return { connected, email: connected ? (data?.google_email ?? null) : null };
}