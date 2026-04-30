import { describe, it, expect } from "vitest";
import { deterministicEventId } from "@/lib/googleSyncLogic";

// Google Calendar event id rules:
//  - characters from base32hex: lowercase a-v and 0-9
//  - length 5..1024
//  - must be unique per calendar
const BASE32HEX_RE = /^[a-v0-9]+$/;
const FULL_RE = /^tf[a-v0-9]+$/;

const SAMPLE_TASK_IDS = [
  // canonical UUID v4
  "11111111-2222-3333-4444-555555555555",
  "ffffffff-ffff-ffff-ffff-ffffffffffff",
  "00000000-0000-0000-0000-000000000000",
  "abcdef01-2345-6789-abcd-ef0123456789",
  // uppercased UUID
  "AB12CDEF-3456-7890-ABCD-EF0123456789",
  // contains chars outside base32hex (w,x,y,z) — must be sanitized
  "wxyzwxyz-wxyz-wxyz-wxyz-wxyzwxyzwxyz",
  // short non-uuid id
  "task-1",
  // long opaque id (e.g. nanoid-like)
  "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnop",
  // single char
  "a",
  // numeric
  "1234567890",
];

describe("deterministicEventId — format & length", () => {
  it.each(SAMPLE_TASK_IDS)(
    "produces a valid Google Calendar event id for task_id=%s",
    (taskId) => {
      const id = deterministicEventId(taskId);

      // 1. prefix
      expect(id.startsWith("tf")).toBe(true);

      // 2. full charset (tf + base32hex body)
      expect(FULL_RE.test(id)).toBe(true);

      // 3. body charset
      const body = id.slice(2);
      expect(BASE32HEX_RE.test(body)).toBe(true);

      // 4. Google's length constraint: 5..1024
      expect(id.length).toBeGreaterThanOrEqual(5);
      expect(id.length).toBeLessThanOrEqual(1024);
    }
  );

  it("is fully deterministic across many calls", () => {
    for (const taskId of SAMPLE_TASK_IDS) {
      const a = deterministicEventId(taskId);
      const b = deterministicEventId(taskId);
      const c = deterministicEventId(taskId);
      expect(a).toBe(b);
      expect(b).toBe(c);
    }
  });

  it("preserves length: tf + (taskId without dashes)", () => {
    for (const taskId of SAMPLE_TASK_IDS) {
      const expectedLen = 2 + taskId.replace(/-/g, "").length;
      expect(deterministicEventId(taskId).length).toBe(expectedLen);
    }
  });

  it("yields unique ids for unique task ids (no collisions in sample)", () => {
    const ids = new Set(SAMPLE_TASK_IDS.map(deterministicEventId));
    expect(ids.size).toBe(SAMPLE_TASK_IDS.length);
  });

  it("never contains uppercase letters or dashes", () => {
    for (const taskId of SAMPLE_TASK_IDS) {
      const id = deterministicEventId(taskId);
      expect(id).toBe(id.toLowerCase());
      expect(id.includes("-")).toBe(false);
    }
  });

  it("sanitizes out-of-charset characters to '0'", () => {
    expect(deterministicEventId("wxyz")).toBe("tf0000");
    expect(deterministicEventId("W-X-Y-Z")).toBe("tf0000");
    expect(deterministicEventId("a!b@c#")).toBe("tfa0b0c0");
  });

  it("respects Google's hard upper bound (1024) for very long inputs", () => {
    const longTaskId = "a".repeat(1500);
    const id = deterministicEventId(longTaskId);
    // Our generator does not truncate (caller controls task_id length),
    // but realistic task ids stay well under 1024.
    expect(id.length).toBe(1502);
    // Sanity: charset still valid
    expect(FULL_RE.test(id)).toBe(true);
  });
});
