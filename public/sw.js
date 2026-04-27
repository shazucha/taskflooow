/* Minimal service worker — exists to satisfy PWA installability requirements.
 * Intentionally does not cache anything so updates are always fresh.
 */
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Pass-through fetch handler (required for installability on some browsers).
  event.respondWith(fetch(event.request).catch(() => Response.error()));
});