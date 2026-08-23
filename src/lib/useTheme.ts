import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "taskflow-theme";

export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = theme === "dark" ? "#0b1220" : "#3b82f6";
}

// Jednoduchý globálny store — všetky prepínače témy v appke sú vždy zosynchronizované.
let current: Theme = typeof window === "undefined" ? "light" : getInitialTheme();
const listeners = new Set<(t: Theme) => void>();

function setGlobalTheme(next: Theme) {
  current = next;
  applyTheme(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage môže byť nedostupné v private/embedded režime.
  }
  listeners.forEach((l) => l(next));
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(current);

  useEffect(() => {
    applyTheme(current);
    const listener = (t: Theme) => setThemeState(t);
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && (e.newValue === "light" || e.newValue === "dark")) {
        current = e.newValue;
        applyTheme(current);
        listeners.forEach((l) => l(current));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return {
    theme,
    setTheme: setGlobalTheme,
    toggle: () => setGlobalTheme(current === "dark" ? "light" : "dark"),
  };
}
