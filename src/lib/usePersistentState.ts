import { useEffect, useState } from "react";

/**
 * Stav uložený v sessionStorage – filtre a vyhľadávanie zostanú zachované
 * pri prepínaní medzi sekciami (Výdaje a príjmy / Spoločníci).
 */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.sessionStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage nedostupné – ignorujeme */
    }
  }, [key, value]);

  return [value, setValue] as const;
}
