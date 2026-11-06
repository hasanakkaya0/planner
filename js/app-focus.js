/* Planner — UI: focus timer.
   Shared mutable state lives on S and shared functions on App (both created in app-state.js). */
(function () {
  "use strict";
  /* ---------- focus timer ---------- */
  const FKEY = "gunDefteri.focus", BASE_TITLE = document.title || "Planner";
  function fSave() { try { if (S.focus) localStorage.setItem(FKEY, JSON.stringify(S.focus)); else localStorage.removeItem(FKEY); } catch (e) { /* none */ } }
  function ensureAudio() { try { S.audioCtx = S.audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (S.audioCtx.resume) S.audioCtx.resume(); } catch (e) { S.audioCtx = null; } }
  function beep() {
    if (!S.audioCtx) return;
    try {
      const t0 = S.audioCtx.currentTime;
      [0, 0.28, 0.56].forEach((d, i) => {
        const o = S.audioCtx.createOscillator(), g = S.audioCtx.createGain();
        o.frequency.value = i === 2 ? 1046 : 880;
        g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.22, t0 + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.22);
        o.connect(g); g.connect(S.audioCtx.destination); o.start(t0 + d); o.stop(t0 + d + 0.25);
      });
    } catch (e) { /* no audio */ }
  }
  const fLeft = () => (!S.focus ? 0 : S.focus.paused != null ? S.focus.paused : Math.max(0, S.focus.endsAt - Date.now()));
  const fElapsed = () => S.focus.activeMs + (S.focus.paused == null ? Date.now() - S.focus.lastResume : 0);
  function logFocus(full) {
    if (!S.focus || S.focus.phase !== "focus") return 0;
    const ms = full ? S.focus.mins * 60000 : Math.min(fElapsed(), S.focus.mins * 60000);
    const mins = Math.round(ms / 60000);
    if (mins >= 1 && S.store && S.writable) {
      App.w(S.store.set("focus", uid(), { date: GD.key(new Date(S.focus.startedAt)), start: S.focus.startedAt, mins: mins, title: S.focus.title, cat: S.focus.cat, taskId: S.focus.taskId }));
    }
    return mins;
  }
  function startFocus(info) {
    ensureAudio();
    if (S.focus && S.focus.phase === "focus") logFocus(false);
    const now = Date.now(), mins = info.mins || S.cfg.focusMins;
    S.focus = { phase: "focus", title: info.title || "Serbest odak", cat: info.cat || null, taskId: info.taskId || null, mins: mins, startedAt: now, endsAt: now + mins * 60000, paused: null, activeMs: 0, lastResume: now };
    fSave(); runFocus(); renderFocus();
    App.toast("Odak başladı · " + mins + " dk");
  }
  function phaseEnd(quiet) {
    if (!quiet) beep();
    if (S.focus.phase === "focus") {
      const m = logFocus(true), brk = S.cfg.breakMins, now = Date.now();
      S.focus = Object.assign({}, S.focus, { phase: "break", mins: brk, startedAt: now, endsAt: now + brk * 60000, paused: null, activeMs: 0, lastResume: now });
      if (!quiet) App.toast("Odak bitti, " + m + " dk kaydedildi · " + brk + " dk mola");
    } else {
      S.focus = Object.assign({}, S.focus, { phase: "done", paused: 0 });
      if (!quiet) App.toast("Mola bitti");
    }
    fSave(); renderFocus();
  }
  function runFocus() {
    clearInterval(S.focusTick);
    S.focusTick = setInterval(() => {
      if (!S.focus) { clearInterval(S.focusTick); return; }
      if (S.focus.phase !== "done" && S.focus.paused == null && Date.now() >= S.focus.endsAt) phaseEnd();
      renderFocus();
    }, 1000);
  }
  function pauseFocus() {
    if (!S.focus || S.focus.phase === "done") return;
    const now = Date.now();
    if (S.focus.paused == null) { S.focus.activeMs += now - S.focus.lastResume; S.focus.paused = Math.max(0, S.focus.endsAt - now); }
    else { S.focus.endsAt = now + S.focus.paused; S.focus.paused = null; S.focus.lastResume = now; }
    fSave(); renderFocus();
  }
  function stopFocus() {
    if (!S.focus) return;
    const m = S.focus.phase === "focus" ? logFocus(false) : 0;
    S.focus = null; fSave(); clearInterval(S.focusTick); renderFocus();
    if (m) App.toast(m + " dk odak kaydedildi");
  }
  function renderFocusBtn() {
    const btn = $("focusBtn"), txt = $("focusBtnTxt");
    if (!S.focus) { btn.className = "focus-btn"; txt.textContent = "Odak"; btn.title = "Serbest odak (O)"; return; }
    const left = fLeft(), paused = S.focus.paused != null && S.focus.phase !== "done";
    btn.className = "focus-btn on ph-" + S.focus.phase + (paused ? " paused" : "");
    txt.textContent = S.focus.phase === "done" ? "Mola bitti" : GD.pad(Math.floor(left / 60000)) + ":" + GD.pad(Math.floor(left / 1000) % 60);
    btn.title = S.focus.phase === "done" ? "Yeni odak başlat" : (paused ? "Devam ettir" : "Duraklat") + " · " + S.focus.title;
  }
  function renderFocus() {
    const el = $("focus");
    renderFocusBtn();
    if (!S.focus) { el.hidden = true; document.title = BASE_TITLE; return; }
    const left = fLeft(), mm = Math.floor(left / 60000), ss = Math.floor(left / 1000) % 60;
    const pct = S.focus.phase === "done" ? 100 : Math.round((1 - left / (S.focus.mins * 60000)) * 100);
    const color = S.focus.cat ? App.catOf(S.focus.cat).color : "violet";
    const label = { focus: "Odak", break: "Mola", done: "Mola bitti" }[S.focus.phase];
    const paused = S.focus.paused != null && S.focus.phase !== "done";
    el.hidden = false;
    el.className = "focus c-" + color + " ph-" + S.focus.phase + (paused ? " paused" : "");
    const time = S.focus.phase === "done" ? "00:00" : GD.pad(mm) + ":" + GD.pad(ss);
    el.innerHTML = '<div class="f-top"><span class="f-ph">' + label + (paused ? " · duraklatıldı" : "") + '</span><span class="f-title">' + esc(S.focus.title) + "</span></div>" +
      '<div class="f-time">' + time + "</div>" +
      '<div class="f-bar"><b style="width:' + Math.max(0, Math.min(100, pct)) + '%"></b></div>' +
      '<div class="f-btns">' + (S.focus.phase === "done"
        ? '<button type="button" class="btn" data-f="again">Yeni odak</button><button type="button" class="btn-ghost" data-f="stop">Kapat</button>'
        : '<button type="button" class="btn-ghost" data-f="pause">' + (paused ? "Devam" : "Duraklat") + "</button>" +
          (S.focus.phase === "break" ? '<button type="button" class="btn-ghost" data-f="again">Molayı geç</button>' : "") +
          '<button type="button" class="btn-ghost" data-f="stop">' + (S.focus.phase === "focus" ? "Bitir" : "Kapat") + "</button>") + "</div>";
    document.title = S.focus.phase === "done" ? "Mola bitti — Planner" : time + " · " + label + " — Planner";
  }
  $("focus").addEventListener("click", (e) => {
    const b = e.target.closest("[data-f]"); if (!b || !S.focus) return;
    const a = b.dataset.f;
    if (a === "pause") pauseFocus();
    else if (a === "stop") stopFocus();
    else if (a === "again") { const f = S.focus; startFocus({ title: f.title, cat: f.cat, taskId: f.taskId }); }
  });
  /* focus button in the top bar: opens the free-focus popover when idle, pause/resume while running */
  let fpMins = 25;
  function openFocusPop() {
    fpMins = S.cfg.focusMins;
    $("fpMins").innerHTML = GD.FOCUS_OPTS.map((n) => '<button type="button" class="chip" data-m="' + n + '" aria-pressed="' + (n === fpMins) + '">' + n + "</button>").join("");
    $("fpCat").innerHTML = '<option value="">Kategorisiz</option>' + S.cfg.cats.map((c) => App.opt(c.id, c.name, "")).join("");
    $("focusPop").hidden = false; $("focusBtn").setAttribute("aria-expanded", "true");
    setTimeout(() => $("fpTitle").focus(), 20);
  }
  function closeFocusPop() { $("focusPop").hidden = true; $("focusBtn").setAttribute("aria-expanded", "false"); }
  function startFromPop() {
    closeFocusPop();
    startFocus({ title: $("fpTitle").value.trim() || "Serbest odak", cat: $("fpCat").value || null, mins: fpMins });
    $("fpTitle").value = "";
  }
  $("focusBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    if (!S.focus) { if ($("focusPop").hidden) openFocusPop(); else closeFocusPop(); }
    else if (S.focus.phase === "done") { const f = S.focus; startFocus({ title: f.title, cat: f.cat, taskId: f.taskId }); }
    else pauseFocus();
  });
  $("fpMins").addEventListener("click", (e) => {
    const b = e.target.closest("[data-m]"); if (!b) return;
    fpMins = +b.dataset.m;
    $("fpMins").querySelectorAll("[data-m]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  });
  $("fpStart").addEventListener("click", startFromPop);
  $("fpTitle").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); startFromPop(); } else if (e.key === "Escape") closeFocusPop(); });
  document.addEventListener("mousedown", (e) => { if (!$("focusPop").hidden && !e.target.closest(".fb-wrap")) closeFocusPop(); });

  /* resumes where it left off after a reload; if time ran out while closed, logs it silently */
  function fBoot() {
    try { const x = JSON.parse(localStorage.getItem(FKEY) || "null"); if (x && x.phase) S.focus = x; } catch (e) { S.focus = null; }
    if (!S.focus) return;
    let guardN = 0;
    while (S.focus && S.focus.phase !== "done" && S.focus.paused == null && Date.now() >= S.focus.endsAt && guardN++ < 3) {
      if (S.focus.phase === "focus" && !S.store) { setTimeout(fBoot, 800); return; }
      phaseEnd(true);
    }
    runFocus(); renderFocus();
  }

  /* shared with the other app-*.js files */
  Object.assign(App, {
    startFocus,
    pauseFocus,
    stopFocus,
    renderFocus,
    openFocusPop,
    fBoot
  });
})();
