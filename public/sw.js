/* Service worker — PWA installability + Web Push notifications.
 * Žiadny cache (vždy fresh updaty).
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

// ---------- Web Push ----------
self.addEventListener("push", (event) => {
  let data = { title: "TaskFlow", body: "Máš novú notifikáciu", url: "/", tag: "taskflow" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_e) {
    if (event.data) data.body = event.data.text();
  }
  const options = {
    body: data.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag,
    renotify: true,
    data: { url: data.url || "/" },
    vibrate: [80, 40, 80],
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        try {
          const u = new URL(client.url);
          if (u.origin === self.location.origin && "focus" in client) {
            client.navigate(targetUrl).catch(() => {});
            return client.focus();
          }
        } catch (_e) { /* ignore */ }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});