/* Planner — UI: connection badge (Firebase build only): "Çevrimdışı" and "Kaydediliyor…".
   Shared mutable state lives on S and shared functions on App (both created in app-state.js). */
(function () {
  "use strict";
  let busyTimer = null, busyShown = false;

  function renderSync() {
    const el = $("syncBadge");
    const n = (S.store && S.store.pending) || 0;
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    if (offline) {
      el.hidden = false; el.className = "sync off";
      el.textContent = n ? "Çevrimdışı · " + n + " bekliyor" : "Çevrimdışı";
      el.title = "İnternet yok. Değişikliklerin cihazda saklanır, bağlantı gelince gönderilir.";
    } else if (n && busyShown) {
      el.hidden = false; el.className = "sync busy"; el.textContent = "Kaydediliyor…"; el.title = "Değişiklikler sunucuya gönderiliyor.";
    } else {
      el.hidden = true; el.textContent = "";
    }
  }
  /* a quick save should not flash the badge: show "Kaydediliyor…" only if it takes a moment */
  function onPending(n) {
    clearTimeout(busyTimer);
    if (!n) { busyShown = false; renderSync(); return; }
    if (!busyShown) busyTimer = setTimeout(() => { busyShown = true; renderSync(); }, 700);
    renderSync();
  }
  function initSync() {
    S.store.onPending = onPending;
    window.addEventListener("online", renderSync);
    window.addEventListener("offline", renderSync);
    renderSync();
  }

  /* shared with the other app-*.js files */
  Object.assign(App, {
    renderSync,
    initSync
  });
})();
