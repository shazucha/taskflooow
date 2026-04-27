import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyTheme, getInitialTheme } from "./lib/useTheme";

// Apply persisted theme before React mounts to avoid flash of wrong theme.
applyTheme(getInitialTheme());

// Hard-block pinch-zoom and double-tap-zoom on iOS Safari, which ignores
// `user-scalable=no` in the viewport meta. Multi-touch and gesture* events
// are the only reliable way to suppress it.
(() => {
  const stop = (e: Event) => e.preventDefault();
  document.addEventListener("gesturestart", stop, { passive: false });
  document.addEventListener("gesturechange", stop, { passive: false });
  document.addEventListener("gestureend", stop, { passive: false });
  document.addEventListener(
    "touchmove",
    (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false }
  );
  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    (e: TouchEvent) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) e.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false }
  );
})();

// Capture `beforeinstallprompt` as early as possible (before React mounts),
// so it is not missed when the browser fires it during initial page load
// (e.g. on a hard reload). The event is stashed on `window` and a custom
// `pwa-install-available` event is dispatched so any component can react.
(() => {
  const w = window as typeof window & {
    __deferredInstallPrompt?: Event | null;
    __pwaInstalled?: boolean;
  };
  w.__deferredInstallPrompt = w.__deferredInstallPrompt ?? null;
  w.__pwaInstalled = w.__pwaInstalled ?? false;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    w.__deferredInstallPrompt = e;
    window.dispatchEvent(new CustomEvent("pwa-install-available"));
  });

  window.addEventListener("appinstalled", () => {
    w.__deferredInstallPrompt = null;
    w.__pwaInstalled = true;
    window.dispatchEvent(new CustomEvent("pwa-installed"));
  });
})();

createRoot(document.getElementById("root")!).render(<App />);

// Register service worker for PWA installability.
// Skip in Lovable preview/iframe contexts to avoid stale caches and routing issues.
if ("serviceWorker" in navigator) {
  const isInIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

  const host = window.location.hostname;
  const isPreviewHost =
    host.includes("id-preview--") ||
    host.includes("lovableproject.com") ||
    host.includes("lovable.app") && host.startsWith("id-preview--");

  if (isInIframe || isPreviewHost) {
    // Clean up any previously-registered SW so preview stays fresh.
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
  } else {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.warn("SW registration failed:", err));
    });
  }
}
