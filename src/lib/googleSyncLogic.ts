// Pure helpers for Google Calendar sync logic.
// Kept framework-agnostic so they can be unit-tested in Vitest (Node)
// and re-used by the Deno edge function (`supabase/functions/google-calendar-sync`).

export const SPECIAL_EVENT_CONFLICT_RE =
  /malformedFocusTimeEvent|malformedOutOfOfficeEvent|malformedWorkingLocationEvent|cannotChangeOrganizer|invalidEventType|focus time event|out of office event|working location/i;

/**
 * Build a deterministic Google Calendar event ID from a task UUID.
 * Google requires base32hex (a-v + 0-9), 5–1024 chars. Using the same ID
 * for retries makes POST idempotent (Google returns 409 instead of creating
 * a duplicate event).
 */
export function deterministicEventId(taskId: string): string {
  const cleaned = taskId
    .toLowerCase()
    .replace(/-/g, "")
    .replace(/[^a-v0-9]/g, "0");
  return `tf${cleaned}`;
}

export function isSpecialTypeConflict(detail: string): boolean {
  if (SPECIAL_EVENT_CONFLICT_RE.test(detail)) return true;
  try {
    const parsed = JSON.parse(detail);
    const pieces = [
      parsed?.error?.message,
      ...(parsed?.error?.errors ?? []).flatMap(
        (item: { reason?: string; message?: string }) => [item.reason, item.message]
      ),
    ]
      .filter(Boolean)
      .join(" ");
    return SPECIAL_EVENT_CONFLICT_RE.test(pieces);
  } catch {
    return false;
  }
}

export function hasTime(iso: string): boolean {
  if (!iso.includes("T")) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  return d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0 || d.getUTCSeconds() !== 0;
}

export interface FetchRetryOptions {
  retries?: number;
  retryOn?: number[];
  /** Override sleep for tests (default: real setTimeout). */
  sleepFn?: (ms: number) => Promise<void>;
  /** Override backoff (default: 400 * 2^attempt + jitter). Used in tests. */
  backoffMs?: (attempt: number) => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function fetchWithRetry(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  opts: FetchRetryOptions = {}
): Promise<Response> {
  const retries = opts.retries ?? 3;
  const retryOn = opts.retryOn ?? [500, 502, 503, 504];
  const sleep = opts.sleepFn ?? defaultSleep;
  const backoff =
    opts.backoffMs ?? ((attempt: number) => 400 * Math.pow(2, attempt) + Math.floor(Math.random() * 200));
  let lastRes: Response | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, init);
      if (!retryOn.includes(res.status)) return res;
      lastRes = res;
    } catch (e) {
      if (attempt === retries) throw e;
    }
    if (attempt < retries) await sleep(backoff(attempt));
  }
  return lastRes!;
}

export interface UpsertEventArgs {
  fetchImpl: typeof fetch;
  base: string;
  token: string;
  taskId: string;
  existingEventId: string | null;
  eventBody: Record<string, unknown>;
  retryOpts?: FetchRetryOptions;
}

export interface UpsertEventResult {
  ok: boolean;
  status: number;
  eventId?: string;
  deduped?: boolean;
  detail?: string;
}

/**
 * POST (with deterministic id) or PATCH a calendar event, with idempotent
 * 409 handling: if the deterministic id already exists (because a previous
 * retry succeeded on Google's side after a transient 5xx), fall back to PATCH
 * instead of creating a duplicate.
 */
export async function upsertCalendarEvent(args: UpsertEventArgs): Promise<UpsertEventResult> {
  const { fetchImpl, base, token, taskId, existingEventId, eventBody, retryOpts } = args;
  const desiredEventId = deterministicEventId(taskId);

  const url = existingEventId ? `${base}/${existingEventId}` : base;
  const method: "PATCH" | "POST" = existingEventId ? "PATCH" : "POST";
  const bodyToSend = method === "POST" ? { ...eventBody, id: desiredEventId } : eventBody;

  let res = await fetchWithRetry(
    fetchImpl,
    url,
    {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(bodyToSend),
    },
    retryOpts
  );

  if (method === "POST" && res.status === 409) {
    const patchUrl = `${base}/${desiredEventId}`;
    const patchRes = await fetchWithRetry(
      fetchImpl,
      patchUrl,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(eventBody),
      },
      { ...retryOpts, retries: retryOpts?.retries ?? 2 }
    );
    if (patchRes.ok) {
      const ev = await patchRes.json().catch(() => ({}));
      return {
        ok: true,
        status: patchRes.status,
        eventId: (ev as { id?: string })?.id ?? desiredEventId,
        deduped: true,
      };
    }
    res = patchRes;
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, status: res.status, detail };
  }

  const ev = await res.json().catch(() => ({}));
  return { ok: true, status: res.status, eventId: (ev as { id?: string })?.id };
}