import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "./supabase";

const REQUIRED_GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar";
const REQUIRED_GOOGLE_TASKS_SCOPE = "https://www.googleapis.com/auth/tasks.readonly";
const FULL_GOOGLE_TASKS_SCOPE = "https://www.googleapis.com/auth/tasks";

/**
 * Pending retries queued while the user was unauthenticated (401 from edge fn).
 * Replayed automatically when Supabase emits SIGNED_IN / TOKEN_REFRESHED / INITIAL_SESSION.
 */
type PendingRetry = () => void;
const pendingRetries = new Set<PendingRetry>();
let authListenerInstalled = false;

function installAuthRetryListener() {
  if (authListenerInstalled) return;
  authListenerInstalled = true;
  supabase.auth.onAuthStateChange((event, session) => {
    if (!session?.access_token) return;
    if (event !== "SIGNED_IN" && event !== "TOKEN_REFRESHED" && event !== "INITIAL_SESSION") return;
    if (pendingRetries.size === 0) return;
    const queued = Array.from(pendingRetries);
    pendingRetries.clear();
    queued.forEach((fn) => {
      try { fn(); } catch (err) { console.warn("Google retry failed", err); }
    });
  });
}

function queueRetryUntilAuthenticated(retry: PendingRetry) {
  installAuthRetryListener();
  pendingRetries.add(retry);
}

/** Returns true if there is a valid, non-expired Supabase session. */
async function hasActiveSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return !!data.session?.access_token;
}

async function callGoogleFunction<T>(functionName: string, payload: unknown, unauthorizedFallback: T): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("No active session");

  const bodyPayload = payload && typeof payload === "object"
    ? { ...(payload as Record<string, unknown>), __user_jwt: accessToken }
    : { value: payload, __user_jwt: accessToken };

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Send the real user JWT in Authorization so both the Supabase gateway
      // (if verify_jwt is still enabled on a stale deploy) AND our in-function
      // validation accept the request. We also mirror it in the body and a
      // custom header for redundancy.
      Authorization: `Bearer ${accessToken}`,
      "x-user-authorization": `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(bodyPayload),
  });

  if (!response.ok) {
    if (response.status === 401) return unauthorizedFallback;
    const body = await response.text();
    const error = new Error(`Edge function returned ${response.status}: ${body}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  return (await response.json()) as T;
}

function hasGoogleTasksScope(scopes: string[]) {
  return scopes.includes(REQUIRED_GOOGLE_TASKS_SCOPE) || scopes.includes(FULL_GOOGLE_TASKS_SCOPE);
}

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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

function getFunctionErrorStatus(error: unknown): number | null {
  const directStatus = (error as { status?: unknown })?.status;
  if (typeof directStatus === "number") return directStatus;
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) return context.status;
  if (context && typeof context === "object" && "status" in context) {
    const status = (context as { status?: unknown }).status;
    return typeof status === "number" ? status : null;
  }
  return null;
}

async function getFunctionErrorBody(error: unknown): Promise<string> {
  const context = (error as { context?: unknown })?.context;
  if (!(context instanceof Response)) return "";
  try {
    return await context.clone().text();
  } catch {
    return "";
  }
}

function isReconnectRequired(error: unknown): boolean {
  const message = getErrorMessage(error);
  const status = getFunctionErrorStatus(error);
  return status === 409 || message.includes("reauth_required") || message.includes("insufficientPermissions") || message.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT");
}

function isTransientFunctionError(error: unknown): boolean {
  const message = getErrorMessage(error);
  const status = getFunctionErrorStatus(error);
  return (
    status === 503 ||
    message.includes("503") ||
    message.includes("temporarily unavailable") ||
    message.includes("SUPABASE_EDGE_RUNTIME_ERROR")
  );
}

function isSpecialCalendarConflict(value: unknown): boolean {
  return /malformedFocusTimeEvent|malformedOutOfOfficeEvent|malformedWorkingLocationEvent|cannotChangeOrganizer|invalidEventType|focus time event|out of office event|working location/i.test(
    getErrorMessage(value)
  );
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
  // No session yet (first paint / signed out) — skip silently to avoid 401 noise.
  if (!(await hasActiveSession())) {
    queueRetryUntilAuthenticated(() => { void fetchGoogleEvents(timeMin, timeMax); });
    return [];
  }
  try {
    const data = await callGoogleFunction<{ events: GoogleEvent[]; not_connected?: boolean }>("google-calendar-fetch", {
      time_min: timeMin.toISOString(),
      time_max: timeMax.toISOString(),
    }, { events: [], not_connected: true });
    if (data?.not_connected) return [];
    return data?.events ?? [];
  } catch (error) {
    const message = error.message || "";
    if (message.includes("reauth_required") || message.includes("insufficientPermissions") || message.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT")) {
      throw new GoogleReconnectRequiredError();
    }
    // 401 = auth race. Queue a retry to fire as soon as the user is authenticated.
    if (getFunctionErrorStatus(error) === 401) {
      queueRetryUntilAuthenticated(() => { void fetchGoogleEvents(timeMin, timeMax); });
      return [];
    }
    throw error;
  }
}

export interface PullResult {
  ok: boolean;
  imported: number;
  updated: number;
  deleted: number;
  not_connected?: boolean;
  imported_breakdown?: { todo: number; done: number };
  sample?: Array<{ title: string; end: string | null; status: "todo" | "done"; reason: string }>;
  audit?: {
    total_google_tasks: number;
    todo_future_ok: number;
    done_past_ok: number;
    todo_past_inconsistent: number;
    done_future_inconsistent: number;
  };
}

export interface GoogleSyncResult {
  ok?: boolean;
  error?: string;
  detail?: string;
  skipped?: boolean | string;
  fallback?: boolean;
  recreated?: boolean;
  event_id?: string;
}

/** Pull events FROM Google INTO TaskFlow tasks. Returns counts of changes. */
export async function pullGoogleEvents(): Promise<PullResult | null> {
  // Skip if not authenticated yet — invoke would send no Authorization header
  // and the edge function would return 401.
  if (!(await hasActiveSession())) {
    queueRetryUntilAuthenticated(() => { void pullGoogleEvents(); });
    return null;
  }
  // Edge runtime občas vráti 503 (studený štart / dočasná nedostupnosť).
  // Skúsime až 5x s narastajúcim backoffom — ostatné chyby propagujeme hneď.
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await callGoogleFunction<PullResult>("google-calendar-pull", {}, {
        ok: true,
        imported: 0,
        updated: 0,
        deleted: 0,
        not_connected: true,
      });
    } catch (error) {
    if (isReconnectRequired(error)) {
      throw new GoogleReconnectRequiredError();
    }
    // 401 = auth race. Queue a retry that fires after re-authentication.
    if (getFunctionErrorStatus(error) === 401) {
      queueRetryUntilAuthenticated(() => { void pullGoogleEvents(); });
      return null;
    }
    lastErr = error;
    if (!isTransientFunctionError(error)) return null;
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1) + Math.random() * 400));
    }
  }
  console.warn("pullGoogleEvents failed after retries", lastErr);
  return null;
}

export interface FixStatusesResult {
  ok: boolean;
  action?: "fix" | "rollback";
  scanned: number;
  fixed_to_done: number;
  fixed_to_todo: number;
  snapshot_id?: string | null;
}

/** Auto-oprava statusov Google-importovaných úloh podľa end-dátumu. */
export async function fixGoogleTaskStatuses(): Promise<FixStatusesResult | null> {
  const { data, error } = await supabase.functions.invoke<FixStatusesResult>(
    "google-calendar-fix-statuses",
    { body: { action: "fix" } }
  );
  if (error) return null;
  return data ?? null;
}

export interface RollbackStatusesResult {
  ok: boolean;
  action?: "rollback";
  restored: number;
}

/** Vráti statusy späť podľa snapshotu vytvoreného pri poslednom fix-e. */
export async function rollbackGoogleTaskStatuses(
  snapshotId: string
): Promise<RollbackStatusesResult | null> {
  const { data, error } = await supabase.functions.invoke<RollbackStatusesResult>(
    "google-calendar-fix-statuses",
    { body: { action: "rollback", snapshot_id: snapshotId } }
  );
  if (error) return null;
  return data ?? null;
}

export async function syncTaskToGoogle(taskId: string, action: "upsert" | "delete" = "upsert"): Promise<GoogleSyncResult> {
  // Ak používateľ ešte nie je prihlásený (auth race po reloade), edge funkcia
  // vráti 401 a `supabase.functions.invoke` to propaguje ako error → biela
  // obrazovka. Preskočíme sync, zaradíme retry po prihlásení.
  if (!(await hasActiveSession())) {
    queueRetryUntilAuthenticated(() => { void syncTaskToGoogle(taskId, action); });
    return { ok: true, fallback: true, skipped: "no_session" };
  }
  // Edge runtime občas vráti 503 (studený štart / dočasná nedostupnosť).
  // Skúsime až 3x s krátkym backoffom — ostatné chyby propagujeme hneď.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase.functions.invoke<GoogleSyncResult>("google-calendar-sync", {
      body: { action, task_id: taskId },
    });

    if (!error) {
      if (data?.error) {
        if (isSpecialCalendarConflict(data.detail || data.error)) {
          return { ok: true, fallback: true, skipped: "special_event_conflict", detail: data.detail };
        }
        if (data.fallback || data.skipped) return data;
        throw new Error(data.detail || data.error);
      }
      return data ?? { ok: true };
    }

    const errorBody = await getFunctionErrorBody(error);
    if (isSpecialCalendarConflict(errorBody || error)) {
      return { ok: true, fallback: true, skipped: "special_event_conflict", detail: errorBody || getErrorMessage(error) };
    }

    if (isReconnectRequired(error)) {
      throw new GoogleReconnectRequiredError();
    }
    // 401 = auth race (token ešte nedorazil / dočasne neplatný). Neviešať
    // celú akciu na tom — zaradíme retry a vrátime skip.
    if (getFunctionErrorStatus(error) === 401) {
      queueRetryUntilAuthenticated(() => { void syncTaskToGoogle(taskId, action); });
      return { ok: true, fallback: true, skipped: "unauthorized" };
    }
    lastError = error;
    if (!isTransientFunctionError(error)) throw error;
    await new Promise((r) => setTimeout(r, 1_000 * (attempt + 1)));
  }
  throw lastError instanceof Error ? lastError : new Error("google-calendar-sync unavailable");
}

export async function isGoogleConnected(): Promise<{ connected: boolean; email: string | null }> {
  const { data, error } = await supabase
    .from("google_calendar_tokens")
    .select("google_email, scope")
    .maybeSingle();
  if (error) return { connected: false, email: null };
  const scopes = data?.scope?.split(/\s+/) ?? [];
  // Connected = aspoň Calendar scope. Tasks scope je voliteľný bonus (Google Tasks import).
  const connected = !!data && scopes.includes(REQUIRED_GOOGLE_SCOPE);
  return { connected, email: connected ? (data?.google_email ?? null) : null };
}

export async function getGoogleConnectionStatus(): Promise<{
  connected: boolean;
  email: string | null;
  hasTasksScope: boolean;
}> {
  const { data, error } = await supabase
    .from("google_calendar_tokens")
    .select("google_email, scope")
    .maybeSingle();
  if (error || !data) return { connected: false, email: null, hasTasksScope: false };
  const scopes = data.scope?.split(/\s+/) ?? [];
  const connected = scopes.includes(REQUIRED_GOOGLE_SCOPE);
  const hasTasksScope = hasGoogleTasksScope(scopes);
  return { connected, email: connected ? (data.google_email ?? null) : null, hasTasksScope };
}