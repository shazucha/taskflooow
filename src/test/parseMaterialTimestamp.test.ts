import { describe, it, expect } from "vitest";
import { parseMaterialTimestamp } from "@/lib/utils";

describe("parseMaterialTimestamp", () => {
  it("null/undefined → null", () => {
    expect(parseMaterialTimestamp(null)).toBeNull();
    expect(parseMaterialTimestamp(undefined)).toBeNull();
    expect(parseMaterialTimestamp("")).toBeNull();
    expect(parseMaterialTimestamp("   ")).toBeNull();
  });

  it("Date instance", () => {
    const d = new Date("2026-05-19T12:34:56Z");
    expect(parseMaterialTimestamp(d)).toBe(d.getTime());
  });

  it("invalid Date → null", () => {
    expect(parseMaterialTimestamp(new Date("invalid"))).toBeNull();
  });

  it("unix sekundy (number)", () => {
    expect(parseMaterialTimestamp(1_700_000_000)).toBe(1_700_000_000_000);
  });

  it("unix milisekundy (number)", () => {
    expect(parseMaterialTimestamp(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it("unix sekundy ako string", () => {
    expect(parseMaterialTimestamp("1700000000")).toBe(1_700_000_000_000);
  });

  it("unix ms ako string", () => {
    expect(parseMaterialTimestamp("1700000000000")).toBe(1_700_000_000_000);
  });

  it("ISO 8601 s Z", () => {
    expect(parseMaterialTimestamp("2026-05-19T12:34:56Z")).toBe(
      Date.parse("2026-05-19T12:34:56Z"),
    );
  });

  it("ISO 8601 s offsetom", () => {
    expect(parseMaterialTimestamp("2026-05-19T14:34:56+02:00")).toBe(
      Date.parse("2026-05-19T14:34:56+02:00"),
    );
  });

  it("Postgres formát s medzerou (bez TZ)", () => {
    const got = parseMaterialTimestamp("2026-05-19 12:34:56");
    expect(got).toBe(new Date("2026-05-19T12:34:56").getTime());
  });

  it("Postgres formát s ms a +TZ", () => {
    expect(parseMaterialTimestamp("2026-05-19 12:34:56.123+00")).not.toBeNull();
  });

  it("nesparsovateľný string → null", () => {
    expect(parseMaterialTimestamp("not a date")).toBeNull();
  });
});

describe("triedenie podľa created_at", () => {
  type Row = { id: string; created_at: unknown };
  const ts = (v: unknown) => parseMaterialTimestamp(v) ?? 0;
  // Zoradené tak, aby výsledok nezávisel od lokálnej časovej zóny testovacieho prostredia
  const rows: Row[] = [
    { id: "a", created_at: "2030-01-01T00:00:00Z" }, // najnovšie
    { id: "b", created_at: 1_700_000_000 }, // 2023
    { id: "c", created_at: null }, // 0
    { id: "d", created_at: "2025-06-15T08:00:00Z" }, // medzi b a a
  ];

  it("newest", () => {
    const ids = [...rows].sort((a, b) => ts(b.created_at) - ts(a.created_at)).map((r) => r.id);
    expect(ids).toEqual(["a", "d", "b", "c"]);
  });

  it("oldest", () => {
    const ids = [...rows].sort((a, b) => ts(a.created_at) - ts(b.created_at)).map((r) => r.id);
    expect(ids).toEqual(["c", "b", "d", "a"]);
  });
});