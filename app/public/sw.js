// Minimal offline shell. API calls always go to the network.
// Bumping CACHE discards every older cache on activation.
const CACHE = "late-ice-v4";
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/api/") || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      // Only keep clean same-origin answers: never a redirect (e.g. a login wall) or another site's page.
      if (res.ok && res.type === "basic" && !res.redirected) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match("/")))
  );
});
