// Spoločné utility pre porovnávanie a popis dní v lokálnej časovej zóne používateľa.
// `new Date(iso).getFullYear()/getMonth()/getDate()` automaticky vracia hodnoty
// v lokálnej TZ prehliadača, takže úloha s due_date 2026-04-30T22:30:00Z sa
// pre používateľa v Bratislave (UTC+2) korektne zobrazí ako 1. mája.

const WEEKDAYS_SHORT = ["Ne", "Po", "Ut", "St", "Št", "Pi", "So"];
const MONTHS_SHORT = ["jan", "feb", "mar", "apr", "máj", "jún", "júl", "aug", "sep", "okt", "nov", "dec"];

/** Začiatok dňa (00:00:00.000) v lokálnej TZ. */
export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Stabilný kľúč dňa v lokálnej TZ — vhodný do Map / group-by. */
export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Porovnanie dvoch dátumov na úrovni dňa v lokálnej TZ. */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Vráti dnešok a zajtra (začiatok dňa) v lokálnej TZ — voláme raz pri renderi. */
export function localTodayTomorrow(now: Date = new Date()): { today: Date; tomorrow: Date; yesterday: Date } {
  const today = startOfLocalDay(now);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  return { today, tomorrow, yesterday };
}

/**
 * Popis dňa pre header sekcie ("Dnes" / "Zajtra" / "Včera" / "Po 5. máj").
 * Porovnanie je dôsledne v lokálnej TZ používateľa — tým zabraňujeme posunu
 * (napr. UTC due_date večer sa nesmie zobraziť pod "Zajtra" pre používateľa v EU).
 */
export function formatLocalDayHeader(d: Date, now: Date = new Date()): string {
  const { today, tomorrow, yesterday } = localTodayTomorrow(now);
  if (isSameLocalDay(d, today)) return "Dnes";
  if (isSameLocalDay(d, tomorrow)) return "Zajtra";
  if (isSameLocalDay(d, yesterday)) return "Včera";
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()}. ${MONTHS_SHORT[d.getMonth()]}`;
}