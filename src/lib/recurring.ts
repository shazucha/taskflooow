import type { Task } from "./types";

/**
 * Vráti "kľúč série" pre danú úlohu — buď series_id, alebo (fallback)
 * kombinácia title|project_id|created_by, ak existujú aspoň 2 úlohy s rovnakou
 * kombináciou (legacy úlohy bez series_id, ktoré sa očividne opakujú).
 */
function buildVirtualSeriesMap(tasks: Task[]): Map<string, string> {
  // mapuje task.id -> kľúč série (alebo žiadny záznam ak nie je súčasťou série)
  const map = new Map<string, string>();
  // 1) explicitné series_id
  for (const t of tasks) {
    if (t.series_id) map.set(t.id, `sid:${t.series_id}`);
  }
  // 2) virtuálne podľa title+project+created_by (iba ak ≥2 a žiadna nemá series_id)
  const groups = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.series_id) continue;
    const k = `v:${t.project_id ?? ""}|${t.created_by}|${t.title.trim().toLowerCase()}`;
    const arr = groups.get(k) ?? [];
    arr.push(t);
    groups.set(k, arr);
  }
  for (const [k, list] of groups) {
    if (list.length >= 2) {
      for (const t of list) map.set(t.id, k);
    }
  }
  return map;
}

export function getSeriesKey(tasks: Task[], task: Task): string | null {
  const map = buildVirtualSeriesMap(tasks);
  return map.get(task.id) ?? null;
}

/**
 * Filtruje úlohy podľa mesiaca a zoskupuje série (vrátane virtuálnych).
 * monthKey: "YYYY-MM" alebo null pre "všetko".
 */
export function filterTasksByMonth<T extends Task>(tasks: T[], monthKey: string | null): T[] {
  const seriesMap = buildVirtualSeriesMap(tasks);
  const seriesGroups = new Map<string, T[]>();
  const standalone: T[] = [];
  for (const t of tasks) {
    const key = seriesMap.get(t.id);
    if (key) {
      const arr = seriesGroups.get(key) ?? [];
      arr.push(t);
      seriesGroups.set(key, arr);
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

  for (const t of standalone) {
    if (monthKey === null) {
      result.push(t);
    } else if (t.due_date && inMonth(t.due_date)) {
      result.push(t);
    }
  }

  for (const [, list] of seriesGroups) {
    if (monthKey === null) {
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

export function seriesSize(tasks: Task[], task: Task): number {
  const key = getSeriesKey(tasks, task);
  if (!key) return 0;
  const map = buildVirtualSeriesMap(tasks);
  let count = 0;
  for (const t of tasks) if (map.get(t.id) === key) count++;
  return count;
}

export function seriesIndex(tasks: Task[], task: Task): number {
  const key = getSeriesKey(tasks, task);
  if (!key) return 0;
  const map = buildVirtualSeriesMap(tasks);
  const list = tasks
    .filter((t) => map.get(t.id) === key)
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
