import type { Task } from "./types";

/**
 * Vráti reprezentatívnu úlohu pre každý rad opakovania pre daný mesiac.
 * - Ak má úloha series_id, ponechá sa max. 1 inštancia patriaca do daného mesiaca.
 *   Ak žiadna inštancia danej série nepatrí do mesiaca, séria sa nezobrazí.
 * - Úlohy bez series_id sa filtrujú podľa mesiaca podľa due_date (ak nie je due_date,
 *   v "all" móde sa zobrazia, v konkrétnom mesiaci sa nezobrazia).
 *
 * monthKey: "YYYY-MM" alebo null pre "všetko".
 */
export function filterTasksByMonth<T extends Task>(tasks: T[], monthKey: string | null): T[] {
  // Najprv zoskupíme podľa série
  const seriesGroups = new Map<string, T[]>();
  const standalone: T[] = [];
  for (const t of tasks) {
    if (t.series_id) {
      const arr = seriesGroups.get(t.series_id) ?? [];
      arr.push(t);
      seriesGroups.set(t.series_id, arr);
    } else {
      standalone.push(t);
    }
  }

  const inMonth = (iso: string | null) => {
    if (!monthKey) return true;
    if (!iso) return false;
    const d = new Date(iso);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return k === monthKey;
  };

  const result: T[] = [];

  // Standalone
  for (const t of standalone) {
    if (monthKey === null || t.due_date === null || inMonth(t.due_date)) {
      // ak nie je due_date a sme v konkrétnom mesiaci, nezobrazíme
      if (monthKey !== null && !t.due_date) continue;
      result.push(t);
    }
  }

  // Série
  for (const [, list] of seriesGroups) {
    if (monthKey === null) {
      // V móde "všetko" zobrazíme len najbližšiu / najstaršiu otvorenú inštanciu série
      const open = list.filter((t) => t.status !== "done");
      const pick =
        (open.length ? open : list).slice().sort((a, b) => {
          const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
          const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
          return da - db;
        })[0];
      if (pick) result.push(pick);
    } else {
      const match = list.find((t) => inMonth(t.due_date));
      if (match) result.push(match);
    }
  }

  return result;
}

export function seriesSize(tasks: Task[], seriesId: string | null | undefined): number {
  if (!seriesId) return 0;
  return tasks.filter((t) => t.series_id === seriesId).length;
}

export function seriesIndex(tasks: Task[], task: Task): number {
  if (!task.series_id) return 0;
  const list = tasks
    .filter((t) => t.series_id === task.series_id)
    .sort((a, b) => {
      const da = a.due_date ? new Date(a.due_date).getTime() : 0;
      const db = b.due_date ? new Date(b.due_date).getTime() : 0;
      return da - db;
    });
  return list.findIndex((t) => t.id === task.id) + 1;
}

export function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("sk-SK", { month: "long", year: "numeric" });
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
