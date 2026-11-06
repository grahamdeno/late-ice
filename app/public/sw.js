// Shell cache, plus a small API cache.
// The new worker waits until a page posts {type:"activate"}. Install does not call skipWaiting.
// Bumping SHELL discards older shell caches on activation. The API cache is separate.
const SHELL = "late-ice-v5";
const API_CACHE = "late-ice-api-v1";
// Exact paths only. Query strings stay in the cache key, but /api/me/spots and other routes do not match.
const API_PATHS = new Set(["/api/bootstrap", "/api/feed", "/api/me", "/api/standings"]);

self.addEventListener("install", () => {
  // Stay in waiting until the open page asks. A forced skipWaiting would reload over unsaved work.
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== SHELL && k !== API_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (e) => {
  const data = e.data || {};
  if (data.type === "activate") self.skipWaiting();
  // Sign-out and account switch: drop cached API responses that belong to any other Authorization hash.
  if (data.type === "auth") e.waitUntil(purgeOtherScopes(typeof data.token === "string" ? data.token : ""));
});

self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = {}; }
  const title = typeof data.title === "string" && data.title ? data.title : "Late Ice";
  const body = typeof data.body === "string" ? data.body : "";
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/";
  e.waitUntil(self.registration.showNotification(title, { body, data: { url } }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const path = e.notification.data && typeof e.notification.data.url === "string" ? e.notification.data.url : "/";
  const url = new URL(path, self.location.origin).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (c.url === url && "focus" in c) return c.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) {
    if (e.request.method !== "GET" || !API_PATHS.has(url.pathname)) return;
    const job = serveApi(e.request);
    e.respondWith(job.response);
    e.waitUntil(job.done);
    return;
  }
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok && res.type === "basic" && !res.redirected) {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put(e.request, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match("/"))),
  );
});

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// The cache key is a synthetic URL. It is never fetched.
// path + the raw query string keep ?rink= and ?season= apart.
// scope is a hash of the Authorization header (or of "" when signed out), so /api/me for one
// account cannot be replayed after sign-out or for the next account on this browser.
async function apiCacheKey(request) {
  const url = new URL(request.url);
  const scope = await sha256(request.headers.get("authorization") || "");
  const key = new URL("/__late_ice_cache__", self.location.origin);
  key.searchParams.set("path", url.pathname);
  key.searchParams.set("q", url.search);
  key.searchParams.set("scope", scope);
  return { request: new Request(key.toString(), { method: "GET" }), scope };
}

async function purgeOtherScopes(token) {
  const keep = await sha256(token || "");
  const cache = await caches.open(API_CACHE);
  const keys = await cache.keys();
  await Promise.all(keys.map(async (req) => {
    const scope = new URL(req.url).searchParams.get("scope");
    if (scope !== keep) await cache.delete(req);
  }));
}

function serveApi(request) {
  let settle = () => {};
  const done = new Promise((r) => { settle = r; });
  const response = (async () => {
    try {
      const cache = await caches.open(API_CACHE);
      const key = await apiCacheKey(request);
      const cached = await cache.match(key.request);
      // null means the network itself failed. A non-200 is an error, not a cacheable response, and not "offline".
      const network = fetch(request).then(async (res) => {
        if (res.status === 200 && res.type === "basic" && !res.redirected) await cache.put(key.request, res.clone());
        return res;
      }).catch(() => null);

      if (cached) {
        network.then((res) => tellOffline(!res)).finally(settle);
        const headers = new Headers(cached.headers);
        headers.set("X-Late-Ice-Cache", "hit");
        return new Response(await cached.blob(), { status: cached.status, statusText: cached.statusText, headers });
      }
      const res = await network;
      settle();
      if (!res) {
        return new Response(JSON.stringify({ message: "Offline" }), {
          status: 503,
          headers: { "Content-Type": "application/json", "X-Late-Ice-Cache": "miss" },
        });
      }
      await tellOffline(false);
      return res;
    } catch (err) {
      settle();
      throw err;
    }
  })();
  return { response, done };
}

async function tellOffline(offline) {
  const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const c of all) c.postMessage({ type: "offline", offline: !!offline });
}
