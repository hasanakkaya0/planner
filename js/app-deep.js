/* Planner — UI: deep focus. A full-screen view of the running focus timer: the time, a progress ring, the task and
   a few buttons, nothing else. It mirrors S.focus (the timer itself lives in app-focus.js); closing it with Esc only
   hides the view, the timer keeps running. Where the browser allows it the page also goes full screen and the
   screen is kept awake. Space pauses / resumes while it is open.
   Shared mutable state lives on S and shared functions on App (both created in app-state.js). */
(function () {
  "use strict";
  const FLAG = "gunDefteri.deep";   /* set while the view is open, so a reload brings it back */
  let shapeKey = "", wakeLock = null;

  const left = () => (!S.focus ? 0 : S.focus.paused != null ? S.focus.paused : Math.max(0, S.focus.endsAt - Date.now()));

  async function keepAwake() {
    try { if (navigator.wakeLock && !wakeLock) { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); } } catch (e) { /* not allowed: fine */ }
  }
  function letSleep() { try { if (wakeLock) wakeLock.release(); } catch (e) { /* none */ } wakeLock = null; }
  document.addEventListener("visibilitychange", () => { if (S.deep && document.visibilityState === "visible") keepAwake(); });

  /* fromBoot: reopened after a reload — the browser only allows full screen after a click, so skip it then */
  function enterDeep(fromBoot) {
    if (!S.focus) { App.toast("Önce bir odak başlat (Odak düğmesi)."); return; }
    S.deep = true; shapeKey = "";
    document.body.classList.add("deep-on");
    try { localStorage.setItem(FLAG, "1"); } catch (e) { /* none */ }
    renderDeep();
    keepAwake();
    if (!fromBoot) { try { const r = document.documentElement.requestFullscreen; if (r) r.call(document.documentElement).catch(() => {}); } catch (e) { /* not supported (iPhone) */ } }
  }
  function exitDeep() {
    if (!S.deep) return;
    S.deep = false; shapeKey = "";
    document.body.classList.remove("deep-on");
    $("deepFocus").hidden = true; $("deepFocus").innerHTML = "";
    try { localStorage.removeItem(FLAG); } catch (e) { /* none */ }
    letSleep();
    try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (e) { /* none */ }
  }

  /* called from renderFocus on every tick */
  function renderDeep() {
    const el = $("deepFocus");
    if (!S.deep) return;
    if (!S.focus) { exitDeep(); return; }   /* the timer was stopped */
    const f = S.focus, paused = f.paused != null && f.phase !== "done";
    const mins = Math.floor(left() / 60000), secs = Math.floor(left() / 1000) % 60;
    const time = f.phase === "done" ? "00:00" : GD.pad(mins) + ":" + GD.pad(secs);
    const pct = f.phase === "done" ? 100 : Math.max(0, Math.min(100, Math.round((1 - left() / (f.mins * 60000)) * 100)));
    const key = f.phase + "|" + paused + "|" + f.title + "|" + (f.cat || "");
    if (key !== shapeKey) {   /* rebuild only when something other than the clock changed */
      shapeKey = key;
      const label = { focus: "Odak", break: "Mola", done: "Mola bitti" }[f.phase] + (paused ? " · duraklatıldı" : "");
      const color = f.cat ? App.catOf(f.cat).color : "violet";
      el.className = "deep c-" + color + " ph-" + f.phase + (paused ? " paused" : "");
      el.innerHTML = '<div class="d-in"><div class="d-ph">' + esc(label) + "</div>" +
        '<div class="d-ring"><svg viewBox="0 0 200 200" aria-hidden="true"><circle class="r-bg" cx="100" cy="100" r="92"/><circle class="r-fg" id="dfFg" cx="100" cy="100" r="92" pathLength="100" stroke-dasharray="0 100"/></svg><div class="d-time" id="dfTime" role="timer"></div></div>' +
        '<div class="d-title">' + esc(f.title) + "</div>" +
        '<div class="d-btns">' + (f.phase === "done"
          ? '<button type="button" class="btn" data-d="again">Yeni odak</button><button type="button" class="btn-ghost" data-d="stop">Kapat</button>'
          : '<button type="button" class="btn" data-d="pause">' + (paused ? "Devam" : "Duraklat") + "</button>" +
            (f.phase === "break" ? '<button type="button" class="btn-ghost" data-d="again">Molayı geç</button>' : "") +
            '<button type="button" class="btn-ghost" data-d="stop">' + (f.phase === "focus" ? "Bitir" : "Kapat") + "</button>") +
          '<button type="button" class="btn-ghost" data-d="min">Küçült</button></div>' +
        '<div class="d-hint">Esc: küçült · Boşluk: duraklat / devam</div></div>';
      el.hidden = false;
    }
    $("dfTime").textContent = time;
    $("dfFg").setAttribute("stroke-dasharray", pct + " 100");
  }

  $("deepFocus").addEventListener("click", (e) => {
    const b = e.target.closest("[data-d]"); if (!b || !S.focus) return;
    const a = b.dataset.d;
    if (a === "pause") App.pauseFocus();
    else if (a === "stop") { App.stopFocus(); }
    else if (a === "min") exitDeep();
    else if (a === "again") { const f = S.focus; App.startFocus({ title: f.title, cat: f.cat, taskId: f.taskId }); }
  });

  /* shared with the other app-*.js files */
  Object.assign(App, {
    enterDeep,
    exitDeep,
    renderDeep
  });
})();
