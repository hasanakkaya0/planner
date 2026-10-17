/* Planner — service worker: caches the app files so it opens without internet.
   App files: network first (latest version), cache when offline.
   Firebase library and fonts: cache first. Firestore / auth requests are never cached. */
const CACHE = "planner-v23";
const SHELL = ["./", "index.html", "css/style.css", "js/core.js", "js/store.js", "js/sync.js", "js/app.js", "js/firebase-config.js", "manifest.webmanifest", "icons/apple-touch-icon.png", "icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  const lib = u.hostname === "www.gstatic.com" && u.pathname.startsWith("/firebasejs/");
  const font = u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com";
  if (lib || font) {
    e.respondWith(caches.match(r).then((hit) => hit || fetch(r).then((res) => {
      if (res.ok || res.type === "opaque") { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(r, cp)); }
      return res;
    })));
    return;
  }
  if (u.origin !== self.location.origin) return;
  e.respondWith(fetch(r).then((res) => {
    if (res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(r, cp)); }
    return res;
  }).catch(() => caches.match(r, { ignoreSearch: true }).then((hit) => hit || caches.match("index.html"))));
});
