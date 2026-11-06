/* Planner — UI: event wiring, subscriptions and start-up.
   Shared mutable state lives on S and shared functions on App (both created in app-state.js). */
(function () {
  "use strict";
  /* ---------- olaylar ---------- */
  $("prev").onclick = () => App.nav(-1);
  $("next").onclick = () => App.nav(1);
  $("todayBtn").onclick = () => { S.TODAY = GD.key(new Date()); App.go(S.TODAY); };
  $("viewSeg").onclick = (e) => { const b = e.target.closest("[data-view]"); if (b) App.setView(b.dataset.view); };
  $("weekView").onclick = (e) => {
    let x;
    if ((x = e.target.closest(".wblk"))) return App.openFromRange(x.dataset.day, { id: x.dataset.blk, rec: x.dataset.rec === "1" });
    if ((x = e.target.closest(".wslot"))) { const h = +x.dataset.h; return App.openFromRange(x.dataset.day, { s: h * 60, e: Math.min((h + 1) * 60, 24 * 60) }); }
    if ((x = e.target.closest(".hcell"))) return App.toggleHabit(x.dataset.hab, x.dataset.day);
    if ((x = e.target.closest("[data-go]"))) { if (x.dataset.tab) setTab(x.dataset.tab); App.go(x.dataset.go); App.setView("day"); }
  };
  $("monthView").onclick = (e) => {
    const cell = e.target.closest(".mo-cell");
    /* phone: the first tap selects the day (its list shows under the calendar), a tap on the selected day opens it */
    if (cell && window.matchMedia("(max-width:880px)").matches && cell.dataset.go !== S.sel) { App.go(cell.dataset.go); return; }
    const x = e.target.closest("[data-go]");
    if (x) { App.go(x.dataset.go); App.setView("day"); }
  };
  $("moDayOpen").onclick = () => App.setView("day");
  $("week").onclick = (e) => { const b = e.target.closest(".wd"); if (b) App.go(b.dataset.k); };

  function setTab(name) {
    document.body.dataset.tab = name;
    document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
    try { localStorage.setItem("gunDefteri.tab", name); } catch (e) { /* none */ }
  }
  document.querySelector(".tabs").onclick = (e) => { const b = e.target.closest(".tab"); if (b) setTab(b.dataset.tab); };

  $("bAdd").onclick = App.addBlockQuick;
  $("bTitle").onkeydown = (e) => { if (e.key === "Enter") App.addBlockQuick(); };
  $("bMore").onclick = () => App.openBlockModal({ s: GD.toMin($("bStart").value) || 540, e: GD.toMin($("bEnd").value) || 600, repeat: true });
  $("tl").onclick = (e) => {
    const b = e.target.closest("[data-blk]");
    if (b) { App.openBlockModal({ id: b.dataset.blk, rec: b.dataset.rec === "1" }); return; }
    const slot = e.target.closest(".slot");
    if (slot) { const h = +slot.dataset.h; App.openBlockModal({ s: h * 60, e: Math.min((h + 1) * 60, 24 * 60) }); }
  };

  $("tAdd").onclick = App.addTask;
  $("tTitle").onkeydown = (e) => { if (e.key === "Enter") App.addTask(); };
  $("tSearch").addEventListener("input", () => { S.tSearch = $("tSearch").value; App.renderTasks(); });
  $("tSearch").addEventListener("keydown", (e) => { if (e.key === "Escape" && $("tSearch").value) { e.stopPropagation(); $("tSearch").value = ""; S.tSearch = ""; App.renderTasks(); } });
  $("tFilter").addEventListener("change", () => { S.tFilter = $("tFilter").value; App.renderTasks(); });
  $("taskList").onclick = (e) => {
    let x;
    if ((x = e.target.closest("[data-toggle]"))) return App.toggleTask(x.dataset.toggle);
    if ((x = e.target.closest("[data-star]"))) {
      const t = App.findTask(x.dataset.star); if (!t || !App.guard()) return;
      const ch = { imp: !t.imp }; if (!t.imp && !t.date) ch.date = S.sel;
      App.w(S.store.update("tasks", t.id, ch)); App.toast(t.imp ? "Öne çıkarma kaldırıldı" : "Öne çıkarıldı: Yaklaşanlar ve takvimde görünecek"); return;
    }
    if ((x = e.target.closest("[data-postpone]"))) return App.postpone(x.dataset.postpone);
    if ((x = e.target.closest("[data-focus-task]"))) { const t = App.findTask(x.dataset.focusTask); if (t) App.startFocus({ title: t.title, cat: t.cat, taskId: t.id }); return; }
    if ((x = e.target.closest("[data-del-task]"))) return App.delTask(x.dataset.delTask);
    if ((x = e.target.closest("[data-edit-task]"))) return App.openTaskModal(x.dataset.editTask);
  };
  $("overdueBar").onclick = (e) => { if (e.target.closest("#moveOverdue")) App.moveOverdue(); };
  $("upcList").onclick = (e) => { const b = e.target.closest("[data-go]"); if (b) App.go(b.dataset.go); };

  $("hAdd").onclick = App.addHabit;
  $("hTitle").onkeydown = (e) => { if (e.key === "Enter") App.addHabit(); };
  $("habitList").onclick = (e) => {
    let x;
    if ((x = e.target.closest("[data-habit]"))) return App.toggleHabit(x.dataset.habit);
    if ((x = e.target.closest("[data-edit-habit]"))) return App.openHabitModal(x.dataset.editHabit);
  };

  $("note").oninput = function () {
    S.pendingNote = { k: S.sel, text: this.value };
    $("noteSaved").textContent = "yazılıyor…";
    clearTimeout(S.noteTimer);
    S.noteTimer = setTimeout(App.flushNote, 800);
  };
  $("note").onblur = App.flushNote;
  window.addEventListener("pagehide", App.flushNote);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") App.flushNote(); });

  $("setBtn").onclick = () => App.openSettings();

  document.addEventListener("keydown", (e) => {
    if (App.modalOpen()) { if (e.key === "Escape") { e.preventDefault(); App.closeModal(); } return; }
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") { if (e.key === "Escape") e.target.blur(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLocaleLowerCase("tr");
    if (e.key === "ArrowLeft") { e.preventDefault(); App.nav(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); App.nav(1); }
    else if (key === "t") { S.TODAY = GD.key(new Date()); App.go(S.TODAY); }
    else if (key === "g") App.setView("day");
    else if (key === "h") App.setView("week");
    else if (key === "a") App.setView("month");
    else if (key === "k") App.toggleTheme();
    else if (e.key === "/") { e.preventDefault(); $("qa").focus(); }
    else if (key === "o") { e.preventDefault(); if (!S.focus) App.openFocusPop(); else if (S.focus.phase === "done") App.stopFocus(); else App.pauseFocus(); }
    else if (e.key === ",") App.openSettings();
    else if (key === "n") { e.preventDefault(); if (S.view !== "day") App.setView("day"); setTab("gorevler"); $("tTitle").focus(); }
    else if (key === "b") {
      e.preventDefault();
      if (S.view !== "day") App.setView("day");
      setTab("program");
      if (S.dayLoaded) App.openBlockModal({ s: GD.toMin($("bStart").value) || 540, e: GD.toMin($("bEnd").value) || 600 });
    }
  });

  /* redraw measurement-dependent views when the window is resized */
  let resizeT = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { App.applyFit(); if (S.view === "week") App.renderWeekView(); else if (S.view === "month") App.renderMonthView(); else App.renderTL(); }, 150);
  });

  /* midnight rollover and the "now" line */
  setInterval(() => {
    const nk = GD.key(new Date());
    if (nk !== S.TODAY) { const was = S.sel === S.TODAY; S.TODAY = nk; if (was) App.go(nk); else App.renderAll(); return; }
    if (App.modalOpen() || S.drag) return;
    if (S.view === "day" && S.sel === S.TODAY) App.renderTL();
    else if (S.view === "week" && GD.weekDays(S.sel).indexOf(S.TODAY) >= 0) App.renderWeekView();
  }, 60000);

  /* ---------- start ---------- */
  const SEED_HABITS = [["h_ders", "Ders tekrarı", 7], ["h_spor", "Spor", 3], ["h_kitap", "Kitap okuma", 7], ["h_erken", "Erken kalkma", 5]];

  function startSubs() {
    /* a live list hit its size limit: older records may be hidden (a backup still contains everything) */
    const warned = {};
    S.store.onLimit = (col) => {
      if (warned[col]) return;
      warned[col] = true;
      App.toast("Liste çok büyüdü; en eski kayıtlar görünmeyebilir. Yedeğin hepsini içerir.");
    };
    S.store.watchDoc("settings", "main", (d) => { S.cfg = GD.normalizeSettings(d); App.applyCfg(); }, App.onErr);
    S.store.watch("tasks", (rows) => {
      S.tasks = rows.map((o) => ({
        id: o.id, title: o.title || "", cat: typeof o.cat === "string" && o.cat ? o.cat : S.cfg.defaultCat,
        kind: typeof o.kind === "string" && o.kind ? o.kind : "normal",
        date: GD.isKey(o.date) ? o.date : null, done: !!o.done, imp: !!o.imp, doneAt: o.doneAt || null, createdAt: o.createdAt || 0,
        blk: typeof o.blk === "string" && o.blk ? o.blk : null
      }));
      App.renderHead(); App.renderWeek(); App.renderUpcoming(); App.renderTasks();
      if (S.view === "day" && !S.drag) App.renderTL();   /* quiz/exam badges on blocks depend on tasks */
      if (S.view !== "day") App.renderRange();
    }, App.onErr);
    S.store.watch("habits", (rows) => {
      S.habits = rows.map((o) => ({ id: o.id, name: o.name || "", order: o.order || 0, target: +o.target || 7 }))
        .sort((a, b) => a.order - b.order);
      App.renderHead(); App.renderHabits();
      if (S.view !== "day") App.renderRange();
    }, App.onErr);
    S.store.watch("focus", (rows) => {
      const byDay = {}, byTask = {};
      rows.forEach((r) => {
        const m = +r.mins || 0;
        if (GD.isKey(r.date)) byDay[r.date] = (byDay[r.date] || 0) + m;
        if (r.taskId) byTask[r.taskId] = (byTask[r.taskId] || 0) + m;
      });
      S.focusByDay = byDay; S.focusByTask = byTask;
      App.renderHead(); App.renderTasks();
      if (S.view !== "day") App.renderRange();
    }, App.onErr);
    S.store.watch("habitlog", (rows) => {
      const L = {};
      rows.forEach((o) => { L[GD.isKey(o.date) ? o.date : o.id] = o.done || {}; });
      S.logs = L; App.renderHead(); App.renderHabits();
      if (S.view !== "day") App.renderRange();
    }, App.onErr);
    S.store.watch("recurring", (rows) => {
      S.recurring = rows.filter((o) => Array.isArray(o.dow) && typeof o.s === "number" && typeof o.e === "number")
        .map((o) => ({ id: o.id, t: o.t || "", c: o.c || S.cfg.defaultCat, loc: o.loc || "", s: o.s, e: o.e, dow: o.dow, from: o.from || null, until: o.until || null }));
      App.renderHead(); App.renderTL();
      if (S.view !== "day") App.renderRange();
    }, App.onErr);
    App.subDay();
    App.subRange();
  }

  async function boot() {
    let tab = "program";
    try { tab = localStorage.getItem("gunDefteri.tab") || "program"; } catch (e) { /* none */ }
    setTab(["program", "gorevler", "rutinler"].indexOf(tab) >= 0 ? tab : "program");
    $("tDate").value = S.sel;
    let v = "day";
    try { v = localStorage.getItem("gunDefteri.view") || "day"; } catch (e) { /* none */ }
    App.applyFit();
    App.setView(v);
    App.fBoot();

    S.store = await window.GDStore.create();
    if (S.store.mode === "cloud") {
      S.modeHtml = "<b>Bulutta</b> · bu linki hangi cihazda açarsan aynı veriyi görürsün";
      try {
        const u = await window.claude.use("user");
        const can = u ? await u.can("data.write") : null;
        if (can === false) { S.writable = false; App.banner("Görüntüleme modundasın; değişiklik kaydedilmez.", true); }
      } catch (e) { /* unknown: try writing */ }
      window.claude.use("downloads").then((d) => { S.canExport = !!d; }).catch(() => {});
    } else if (S.store.mode === "firebase") {
      S.modeHtml = "<b>Senkron</b> · " + esc(S.store.user.email) + " · telefon ve bilgisayar aynı veriyi görür; internet yokken de çalışır";
      S.canExport = true;
    } else {
      S.modeHtml = S.store.fallback
        ? "<b>Bu tarayıcıda</b> · bulut bağlantısı kurulamadı"
        : "<b>Bu tarayıcıda</b> · veriler bu tarayıcıda durur; ayda bir yedek indir";
      if (!S.store.persistent) App.banner("Tarayıcı kayda izin vermiyor (gizli pencere?). Kapatınca veriler gider.", true);
      S.canExport = true;
      let seeded = false;
      try { seeded = !!localStorage.getItem("gunDefteri.seeded"); localStorage.setItem("gunDefteri.seeded", "1"); } catch (e) { seeded = true; }
      if (!seeded && S.store.isEmpty()) {
        SEED_HABITS.forEach((h, i) => S.store.set("habits", h[0], { name: h[1], target: h[2], order: i + 1, createdAt: Date.now() + i }));
      }
    }
    startSubs();
    if (S.focus) App.renderFocus();
    setTimeout(App.maybeWelcome, 1500);   /* once the first data has arrived */
  }
  boot().catch(() => { S.modeHtml = "Kayıt bağlantısı kurulamadı. Sayfayı yenile."; App.banner(S.modeHtml, true); });
})();
