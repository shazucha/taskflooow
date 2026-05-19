import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Parzuje created_at z databázy (Supabase/Postgres) do timestampu v ms. */
export function parseMaterialTimestamp(raw: unknown): number | null {
  if (raw == null) return null;
  if (raw instanceof Date) {
    const t = raw.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw < 1e12 ? raw * 1000 : raw;
  }
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  // Čisto číselný string → unix (sekundy alebo ms)
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n;
  }
  // Postgres "YYYY-MM-DD HH:MM:SS[.ms][+TZ]" – doplníme 'T' medzi dátum a čas
  let candidate = s;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(candidate)) {
    candidate = candidate.replace(" ", "T");
  }
  const d = new Date(candidate);
  if (!Number.isNaN(d.getTime())) return d.getTime();
  const p = Date.parse(s);
  return Number.isNaN(p) ? null : p;
}

/** Formátuje dátum pridania materiálu v lokálnej časovej zóne zariadenia (sk-SK). */
export function formatMaterialDate(raw: unknown): string | null {
  const ms = parseMaterialTimestamp(raw);
  if (ms == null) return null;
  const d = new Date(ms);
  return d.toLocaleDateString("sk-SK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
