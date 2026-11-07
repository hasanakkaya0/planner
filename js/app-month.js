/* Planner — UI: month view and range navigation.
   Shared mutable state lives on S and shared functions on App (both created in app-state.js). */
(function () {
  "use strict";
  /* ---------- month view ---------- */
  let moCap = 4;   /* number of lines that fit in a month cell (set by measuring) */
  function renderMonthView(measured) {
    const grid = GD.monthGrid(S.sel), mon = S.sel.slice(0, 7), kk = App.keyKinds();
    let g = GD.weekDays(S.sel).map((k) => '<div class="mo-dn">' + App.dayName(GD.parseKey(k)) + "</div>").join("");
    grid.forEach((k) => {
      const s = GD.daySummary(S.rangeDays[k] || null, S.recurring, App.allTasks(), k, kk);
      const dd = GD.parseKey(k), inMon = k.slice(0, 7) === mon;
      const keyOpen = s.key.filter((t) => !t.done).length;
      const metaTxt = (s.mins ? GD.durText(s.mins) : "") + (S.focusByDay[k] ? (s.mins ? " · " : "") + "odak " + GD.durText(S.focusByDay[k]) : "");
      let inner = '<span class="mo-head"><span class="mo-num">' + dd.getDate() + '</span><span class="mo-meta" title="Planlı süre">' + metaTxt + "</span></span>";
      /* order: highlighted → tasks → classes/blocks (by time); what doesn't fit becomes "+N daha" */
      const nt = App.allTasks().filter((t) => t.date === k && !App.isKeyTask(t)).sort((a, b) => (a.done - b.done) || ((a.createdAt || 0) - (b.createdAt || 0)));
      const items = s.key.map((t) => '<span class="mo-key c-' + App.keyColor(t) + (t.done ? " done" : "") + '">' + esc(t.title) + "</span>")
        .concat(nt.map((t) => '<span class="mo-task c-' + App.catOf(t.cat).color + (t.done ? " done" : "") + '"><i></i><span class="tx">' + esc(t.title) + "</span></span>"))
        .concat(s.blocks.map((b) => '<span class="mo-ev c-' + App.catOf(b.c).color + '"><i></i><b>' + GD.fmtMin(b.s) + '</b><span class="tx">' + esc(b.t) + "</span></span>"));
      const shown = items.length > moCap ? moCap - 1 : items.length;
      inner += items.slice(0, shown).join("");
      if (items.length > shown) inner += '<span class="mo-more">+' + (items.length - shown) + " daha</span>";
      const normal = s.open - keyOpen;
      let dots = s.key.slice(0, 3).map((t) => '<i class="c-' + App.keyColor(t) + '"></i>').join("");
      if (normal > 0) dots += "<i></i>";
      if (s.mins) dots += '<i class="plan"></i>';
      inner += '<span class="mo-dots">' + dots + "</span>";
      if (S.habits.length && k <= S.TODAY && inMon) {
        const L = S.logs[k] || {}, n = S.habits.filter((h) => L[h.id]).length;
        if (n) inner += '<span class="mo-bar" title="Rutin: ' + n + "/" + S.habits.length + '"><b style="width:' + Math.round(n / S.habits.length * 100) + '%"></b></span>';
      }
      const lbl = dd.getDate() + " " + GD.AY[dd.getMonth()] + (keyOpen ? ", " + keyOpen + " " + App.keyLabel() : "") + (s.open ? ", " + s.open + " açık görev" : "");
      g += '<button class="mo-cell' + (inMon ? "" : " out") + (k === S.TODAY ? " today" : "") + (k === S.sel ? " sel" : "") + '" data-go="' + k + '" aria-label="' + lbl + '">' + inner + "</button>";
    });
    $("moGrid").innerHTML = g;
    /* set the line count once, based on the cell height */
    if (!measured && S.view === "month" && window.innerWidth > 880) {
      /* real measurement: cell inner height − header row, divided by the height of one line */
      const cells = Array.from($("moGrid").querySelectorAll(".mo-cell"));
      const cell = cells.find((c) => c.querySelector(".mo-ev,.mo-task,.mo-key")) || cells[0];
      if (cell) {
        const cs = getComputedStyle(cell), gap = parseFloat(cs.rowGap) || 2;
        const item = cell.querySelector(".mo-ev,.mo-task,.mo-key,.mo-more");
        const itemH = (item ? item.getBoundingClientRect().height : 17) + gap;
        const avail = cell.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - cell.querySelector(".mo-head").getBoundingClientRect().height;
        const cap = Math.max(1, Math.min(8, Math.floor(avail / itemH)));
        if (cap !== moCap) { moCap = cap; return renderMonthView(true); }
      }
    }

    renderMonthDay();
    const list = App.allTasks().filter((t) => t.date && t.date.slice(0, 7) === mon && App.isKeyTask(t))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    $("moKeyCount").textContent = list.length ? list.filter((t) => !t.done).length + " açık / " + list.length : "";
    $("moKeyList").innerHTML = list.length ? list.map(App.keyRow).join("")
      : '<li class="empty">' + App.emptyArt("flag") + 'Bu ay öne çıkan bir şey yok. Görev eklerken öne çıkan bir tür (ör. ' + esc(S.cfg.kinds.filter((k) => k.key).map((k) => k.name).join(", ") || "Ayarlar → Görev türleri") + ") seçersen burada görünür.</li>";
  }

  /* phone: the selected day's list under the calendar (the grid itself only has dots there) */
  function renderMonthDay() {
    const k = S.sel, dd = GD.parseKey(k), s = GD.daySummary(S.rangeDays[k] || null, S.recurring, App.allTasks(), k, App.keyKinds());
    $("moDayTitle").textContent = dd.getDate() + " " + GD.AY[dd.getMonth()] + " · " + GD.GUNK[dd.getDay()];
    const nt = App.allTasks().filter((t) => t.date === k && !App.isKeyTask(t)).sort((a, b) => (a.done - b.done) || ((a.createdAt || 0) - (b.createdAt || 0)));
    const rows = s.key.map((t) => '<li class="md-row' + (t.done ? " done" : "") + '"><span class="md-t"><span class="pill k c-' + App.keyColor(t) + '">' + esc(App.keyName(t)) + '</span></span><span class="md-x">' + esc(t.title) + "</span></li>")
      .concat(s.blocks.map((b) => '<li class="md-row c-' + App.catOf(b.c).color + '"><span class="md-t">' + GD.fmtMin(b.s) + '</span><span class="md-x"><i></i>' + esc(b.t) + (b.loc ? ' <small>' + esc(b.loc) + "</small>" : "") + "</span></li>"))
      .concat(nt.map((t) => '<li class="md-row c-' + App.catOf(t.cat).color + (t.done ? " done" : "") + '"><span class="md-t">görev</span><span class="md-x"><i></i>' + esc(t.title) + "</span></li>"));
    $("moDayList").innerHTML = rows.length ? rows.join("") : '<li class="empty">Bu günde kayıt yok.</li>';
  }

  function renderRange() {
    App.renderHead();
    if (S.view === "week") App.renderWeekView();
    else if (S.view === "month") renderMonthView();
  }
  function subRange() {
    if (S.view === "day" || !S.store) {
      if (S.view === "day" && S.unsubRange) { S.unsubRange(); S.unsubRange = null; S.rangeKey = ""; }
      return;
    }
    let from, to;
    if (S.view === "week") { const d = GD.weekDays(S.sel); from = d[0]; to = d[6]; }
    else { const g = GD.monthGrid(S.sel); from = g[0]; to = g[41]; }
    const rk = from + "|" + to;
    if (rk === S.rangeKey) return;
    if (S.unsubRange) S.unsubRange();
    S.rangeKey = rk; S.rangeDays = {};
    S.unsubRange = S.store.watchRange("days", "date", from, to, (rows) => {
      if (S.rangeKey !== rk) return;
      const m = {};
      rows.forEach((r) => { m[GD.isKey(r.date) ? r.date : r.id] = r; });
      S.rangeDays = m;
      if (S.view !== "day") renderRange();
    }, App.onErr);
  }

  function setView(v) {
    if (["day", "week", "month"].indexOf(v) < 0) v = "day";
    S.view = v;
    document.body.dataset.view = v;
    $("dayView").hidden = v !== "day";
    $("weekView").hidden = v !== "week";
    $("monthView").hidden = v !== "month";
    document.querySelectorAll("#viewSeg button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === v)));
    const unit = { day: "gün", week: "hafta", month: "ay" }[v];
    $("prev").title = "Önceki " + unit + " (←)"; $("prev").setAttribute("aria-label", "Önceki " + unit);
    $("next").title = "Sonraki " + unit + " (→)"; $("next").setAttribute("aria-label", "Sonraki " + unit);
    try { localStorage.setItem("gunDefteri.view", v); } catch (e) { /* none */ }
    subRange();
    App.renderAll();
  }
  function nav(dir) {
    if (S.view === "week") App.go(GD.addDays(S.sel, 7 * dir));
    else if (S.view === "month") App.go(GD.addMonths(S.sel, dir));
    else App.go(GD.addDays(S.sel, dir));
  }
  /* clicking a block / empty hour in the week view: load that day without changing the view, open the dialog */
  function openFromRange(k, opt) {
    S.pendingOpen = { k: k, opt: opt };
    if (k === S.sel && S.dayLoaded) { S.pendingOpen = null; App.openBlockModal(opt); return; }
    App.go(k);
  }

  /* shared with the other app-*.js files */
  Object.assign(App, {
    renderMonthView,
    renderRange,
    subRange,
    setView,
    nav,
    openFromRange
  });
})();
