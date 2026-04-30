import { describe, it, expect, vi } from "vitest";
import {
  deterministicEventId,
  isSpecialTypeConflict,
  hasTime,
  fetchWithRetry,
  upsertCalendarEvent,
} from "@/lib/googleSyncLogic";

const noSleep = () => Promise.resolve();

function mockResponse(status: number, body: unknown = {}): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(text, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("deterministicEventId", () => {
  it("strips dashes and lowercases the UUID", () => {
    const id = deterministicEventId("AB12CDEF-3456-7890-ABCD-EF0123456789");
    expect(id).toBe("tfab12cdef34567890abcdef0123456789");
  });

  it("is stable for the same input (idempotent key)", () => {
    const id1 = deterministicEventId("11111111-2222-3333-4444-555555555555");
    const id2 = deterministicEventId("11111111-2222-3333-4444-555555555555");
    expect(id1).toBe(id2);
  });

  it("produces different ids for different tasks", () => {
    const a = deterministicEventId("11111111-2222-3333-4444-555555555555");
    const b = deterministicEventId("11111111-2222-3333-4444-555555555556");
    expect(a).not.toBe(b);
  });

  it("only contains base32hex characters (a-v, 0-9) plus the 'tf' prefix", () => {
    const id = deterministicEventId("ffffffff-ffff-ffff-ffff-ffffffffffff");
    expect(id.startsWith("tf")).toBe(true);
    expect(/^tf[a-v0-9]+$/.test(id)).toBe(true);
  });

  it("replaces invalid base32hex chars with '0'", () => {
    // 'w','x','y','z' are not valid base32hex — should be sanitized
    const id = deterministicEventId("wxyz0000-0000-0000-0000-000000000000");
    expect(/^tf[a-v0-9]+$/.test(id)).toBe(true);
  });
});

describe("isSpecialTypeConflict", () => {
  it("matches plain-text Focus Time errors", () => {
    expect(isSpecialTypeConflict("malformedFocusTimeEvent")).toBe(true);
    expect(isSpecialTypeConflict("Cannot modify focus time event")).toBe(true);
  });

  it("matches nested Google error JSON payloads", () => {
    const payload = JSON.stringify({
      error: {
        code: 400,
        message: "Some message",
        errors: [{ domain: "calendar", reason: "malformedFocusTimeEvent", message: "nope" }],
      },
    });
    expect(isSpecialTypeConflict(payload)).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isSpecialTypeConflict("rateLimitExceeded")).toBe(false);
    expect(isSpecialTypeConflict('{"error":{"message":"forbidden"}}')).toBe(false);
  });
});

describe("hasTime", () => {
  it("returns true when the ISO string carries a non-midnight UTC time", () => {
    expect(hasTime("2026-04-30T09:30:00Z")).toBe(true);
  });
  it("returns false for date-only or midnight-UTC strings", () => {
    expect(hasTime("2026-04-30")).toBe(false);
    expect(hasTime("2026-04-30T00:00:00Z")).toBe(false);
  });
});

describe("fetchWithRetry", () => {
  it("retries on 500 then succeeds without throwing", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(500, { error: "boom" }))
      .mockResolvedValueOnce(mockResponse(500, { error: "boom" }))
      .mockResolvedValueOnce(mockResponse(200, { ok: true }));

    const res = await fetchWithRetry(fetchImpl as unknown as typeof fetch, "https://x", { method: "POST" }, {
      retries: 3,
      sleepFn: noSleep,
    });
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry on 4xx", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse(404, { error: "nf" }));
    const res = await fetchWithRetry(fetchImpl as unknown as typeof fetch, "https://x", { method: "GET" }, {
      retries: 3,
      sleepFn: noSleep,
    });
    expect(res.status).toBe(404);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns the last response after exhausting retries on persistent 500", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse(500, { error: "still bad" }));
    const res = await fetchWithRetry(fetchImpl as unknown as typeof fetch, "https://x", { method: "POST" }, {
      retries: 2,
      sleepFn: noSleep,
    });
    expect(res.status).toBe(500);
    // attempt 0,1,2 = 3 calls
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe("upsertCalendarEvent (idempotency on retry)", () => {
  const base = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  const taskId = "11111111-2222-3333-4444-555555555555";
  const expectedId = deterministicEventId(taskId);
  const eventBody = { summary: "Test", start: {}, end: {} };

  it("sends POST with deterministic id when no event exists", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse(200, { id: expectedId }));
    const result = await upsertCalendarEvent({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      base,
      token: "tok",
      taskId,
      existingEventId: null,
      eventBody,
      retryOpts: { sleepFn: noSleep },
    });

    expect(result.ok).toBe(true);
    expect(result.eventId).toBe(expectedId);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(base);
    expect((init as RequestInit).method).toBe("POST");
    const sentBody = JSON.parse((init as { body: string }).body);
    expect(sentBody.id).toBe(expectedId);
  });

  it("falls back to PATCH on 409 (deduped) instead of creating a duplicate event", async () => {
    const fetchImpl = vi
      .fn()
      // First POST → 409 (event already exists from a prior retry)
      .mockResolvedValueOnce(mockResponse(409, { error: { message: "duplicate" } }))
      // PATCH → 200
      .mockResolvedValueOnce(mockResponse(200, { id: expectedId }));

    const result = await upsertCalendarEvent({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      base,
      token: "tok",
      taskId,
      existingEventId: null,
      eventBody,
      retryOpts: { sleepFn: noSleep },
    });

    expect(result.ok).toBe(true);
    expect(result.deduped).toBe(true);
    expect(result.eventId).toBe(expectedId);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const [, patchInit] = fetchImpl.mock.calls[1];
    expect((patchInit as RequestInit).method).toBe("PATCH");
    const patchUrl = fetchImpl.mock.calls[1][0];
    expect(patchUrl).toBe(`${base}/${expectedId}`);
  });

  it("retries POST on 500 and uses the same deterministic id (no duplicates)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(500, { error: "boom" }))
      .mockResolvedValueOnce(mockResponse(200, { id: expectedId }));

    const result = await upsertCalendarEvent({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      base,
      token: "tok",
      taskId,
      existingEventId: null,
      eventBody,
      retryOpts: { sleepFn: noSleep, retries: 3 },
    });

    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse((fetchImpl.mock.calls[0][1] as { body: string }).body);
    const secondBody = JSON.parse((fetchImpl.mock.calls[1][1] as { body: string }).body);
    expect(firstBody.id).toBe(expectedId);
    expect(secondBody.id).toBe(expectedId);
  });

  it("uses PATCH (no deterministic id in body) when an existingEventId is provided", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse(200, { id: "existing-evt" }));
    const result = await upsertCalendarEvent({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      base,
      token: "tok",
      taskId,
      existingEventId: "existing-evt",
      eventBody,
      retryOpts: { sleepFn: noSleep },
    });

    expect(result.ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${base}/existing-evt`);
    expect((init as RequestInit).method).toBe("PATCH");
    const sentBody = JSON.parse((init as { body: string }).body);
    expect(sentBody.id).toBeUndefined();
  });

  it("returns ok=false with status+detail when retries are exhausted on persistent 500", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse(500, { error: "boom" }));
    const result = await upsertCalendarEvent({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      base,
      token: "tok",
      taskId,
      existingEventId: null,
      eventBody,
      retryOpts: { sleepFn: noSleep, retries: 1 },
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect(result.detail).toContain("boom");
  });
});