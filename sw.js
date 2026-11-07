/* Planner — service worker: caches the app files so it opens without internet.
   App files: network first (latest version), cache when offline.
   Firebase library: cache first. Firestore / auth requests are never cached. */
const CACHE = "planner-vbe914832";
const SHELL = ["./", "index.html", "css/style.css", "js/core.js", "js/store.js", "js/sync.js", "js/app-state.js", "js/app-ui.js", "js/app-day.js", "js/app-lists.js", "js/app-week.js", "js/app-month.js", "js/app-settings.js", "js/app-quickadd.js", "js/app-dnd.js", "js/app-focus.js", "js/app-welcome.js", "js/app-sync.js", "js/app-repeat.js", "js/app-stats.js", "js/app-term.js", "js/app-remind.js", "js/app-swipe.js", "js/app.js", "js/firebase-config.js", "manifest.webmanifest", "fonts/plus-jakarta-sans-latin.woff2", "fonts/plus-jakarta-sans-latin-ext.woff2", "icons/apple-touch-icon.png", "icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
/* tapping a reminder brings the app to the front */
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ("focus" in c) return c.focus(); }
    return self.clients.openWindow("./");
  }));
});
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  const lib = u.hostname === "www.gstatic.com" && u.pathname.startsWith("/firebasejs/");
  if (lib) {
    e.respondWith(caches.match(r).then((hit) => hit || fetch(r).then((res) => {
      if (res.ok || res.type === "opaque") { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(r, cp)); }
      return res;
    })));
    return;
  }
  if (u.origin !== self.location.origin) return;
  /* revalidate with the server every time (GitHub Pages sets a 10-minute HTTP cache) */
  e.respondWith(fetch(r, { cache: "no-cache" }).then((res) => {
    if (res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(r, cp)); }
    return res;
  }).catch(() => caches.match(r, { ignoreSearch: true }).then((hit) => hit || caches.match("index.html"))));
});
