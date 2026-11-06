/* Planner — UI: week view and fit-to-screen.
   Shared mutable state lives on S and shared functions on App (both created in app-state.js). */
(function () {
  "use strict";
  /* ---------- week view ---------- */
  /* ---------- fit to screen (desktop) ----------
     Measures the real top edge of the timeline / grid / calendar and divides the remaining window height.
     That way the page never overflows, whatever the browser zoom or header height. */
  const fitScreen = () => window.innerWidth >= 1100 && window.innerHeight >= 700;
  let wkScrolledFor = "";
  /* on desktop the page fits the window: the page doesn't scroll, panels scroll internally */
  const isFit = () => document.body.classList.contains("fit");
  function applyFit() { document.body.classList.toggle("fit", fitScreen()); }
  function fitRows(el, rows, reserve, min, max) {
    const top = el.getBoundingClientRect().top + window.scrollY;
    return Math.max(min, Math.min(max, Math.floor((window.innerHeight - top - reserve) / rows)));
  }
  let lastWK = 46;
  function renderWeekView(fitted) {
    const days = GD.weekDays(S.sel);
    const WK = fitted || (isFit() ? lastWK : App.WK_H);
    $("wkGrid").style.setProperty("--wk-h", WK + "px");
    const kk = App.keyKinds();
    const sums = days.map((k) => GD.daySummary(S.rangeDays[k] || null, S.recurring, App.allTasks(), k, kk));

    /* desktop grid */
    let g = '<div class="wk-corner"></div>';
    days.forEach((k, i) => {
      const dd = GD.parseKey(k);
      g += '<button class="wk-day' + (k === S.TODAY ? " today" : "") + '" data-go="' + k + '" title="' + dd.getDate() + " " + GD.AY[dd.getMonth()] + ' — güne git">' +
        '<span class="dn">' + App.dayName(dd) + '</span><span class="dd">' + dd.getDate() + '</span><span class="pl">' + (sums[i].mins ? GD.durText(sums[i].mins) : "") + (S.focusByDay[k] ? '<span class="fc"> · odak ' + GD.durText(S.focusByDay[k]) + "</span>" : "") + "</span></button>";
    });
    g += '<div class="wk-lbl">görev</div>';
    days.forEach((k, i) => {
      const s = sums[i];
      let inner = s.key.slice(0, 3).map((t) => '<span class="wk-key c-' + App.keyColor(t) + (t.done ? " done" : "") + '" title="' + esc(App.keyName(t) + ": " + t.title) + '">' + esc(t.title) + "</span>").join("");
      if (s.key.length > 3) inner += '<span class="wk-cnt">+' + (s.key.length - 3) + " " + esc(App.keyLabel()) + "</span>";
      const nt = App.allTasks().filter((t) => t.date === k && !App.isKeyTask(t)).sort((a, b) => (a.done - b.done) || ((a.createdAt || 0) - (b.createdAt || 0)));
      const room = Math.max(1, 3 - Math.min(s.key.length, 3) + 1);
      inner += nt.slice(0, room).map((t) => '<span class="wk-task c-' + App.catOf(t.cat).color + (t.done ? " done" : "") + '" title="' + esc(t.title) + '">' + esc(t.title) + "</span>").join("");
      if (nt.length > room) inner += '<span class="wk-cnt">+' + (nt.length - room) + " görev</span>";
      g += '<button class="wk-all" data-go="' + k + '" data-tab="gorevler" aria-label="' + k + ' görevleri">' + inner + "</button>";
    });
    g += '<div class="wk-hours">';
    for (let h = GD.DAY_START + 1; h < GD.DAY_END; h++) g += '<span style="top:' + ((h - GD.DAY_START) * WK) + 'px">' + GD.pad(h) + ":00</span>";
    g += "</div>";
    const now = new Date(), nm = now.getHours() * 60 + now.getMinutes();
    days.forEach((k, i) => {
      g += '<div class="wk-col' + (k === S.TODAY ? " today" : "") + '">';
      for (let h = GD.DAY_START; h < GD.DAY_END; h++) g += '<button class="wslot" data-day="' + k + '" data-h="' + h + '" style="top:' + ((h - GD.DAY_START) * WK) + 'px" aria-label="' + k + " " + GD.pad(h) + ':00 blok ekle"></button>';
      const wl = GD.linkKeyTasks(sums[i].blocks, App.allTasks(), k, kk);
      GD.lanes(sums[i].blocks).forEach((b) => {
        const kd = App.keyDeco(wl.byBlock[b.id]);
        const top = (Math.max(b.s, GD.DAY_START * 60) - GD.DAY_START * 60) / 60 * WK;
        const hgt = Math.max((Math.min(b.e, GD.DAY_END * 60) - Math.max(b.s, GD.DAY_START * 60)) / 60 * WK - 2, 16);
        const wdt = 100 / b._lanes, left = b._lane * wdt;
        g += '<button class="wblk c-' + App.catOf(b.c).color + (hgt < 26 ? " tiny" : "") + kd.cls + '" data-day="' + k + '" data-blk="' + esc(b.id) + '" data-rec="' + (b.rec ? 1 : 0) + '" ' +
          'style="top:' + top + "px;height:" + hgt + "px;left:calc(" + left + "% + 2px);width:calc(" + wdt + '% - 4px)" title="' + esc(b.t) + " · " + GD.fmtMin(b.s) + "–" + GD.fmtMin(b.e) + (b.loc ? " · " + esc(b.loc) : "") + (b.rec ? " · her hafta" : "") + esc(kd.tip) + '">' + kd.html +
          /* line count follows the block's real height: 3 lines / 2 lines / single line */
          (hgt >= 62 && b.loc
            ? '<span class="bt">' + esc(b.t) + '</span><span class="bh">' + GD.fmtMin(b.s) + "–" + GD.fmtMin(b.e) + '</span><span class="bl">' + esc(b.loc) + "</span>"
            : hgt >= 40
              ? '<span class="bt">' + esc(b.t) + '</span><span class="bh">' + GD.fmtMin(b.s) + "–" + GD.fmtMin(b.e) + (b.loc ? '<span class="bl-in"> · ' + esc(b.loc) + "</span>" : "") + "</span>"
              : '<span class="bt"><span class="bh-in">' + GD.fmtMin(b.s) + "</span> " + esc(b.t) + (b.loc ? '<span class="bl-in"> · ' + esc(b.loc) + "</span>" : "") + "</span>") +
          '<span class="rsz" aria-hidden="true"></span></button>';
      });
      if (k === S.TODAY && nm >= GD.DAY_START * 60) g += '<div class="wk-now" style="top:' + ((nm - GD.DAY_START * 60) / 60 * WK) + 'px"></div>';
      g += "</div>";
    });
    $("wkGrid").innerHTML = g;
    S.weekHH = WK; S.weekDaysCache = days;
    if (!fitted && S.view === "week" && isFit()) {
      const col = $("wkGrid").querySelector(".wk-col"), panel = $("wkGrid").parentElement;
      const fit = col ? Math.max(34, Math.min(84, Math.floor((panel.getBoundingClientRect().bottom - col.getBoundingClientRect().top - 2) / (GD.DAY_END - GD.DAY_START)))) : WK;
      lastWK = fit;
      if (fit !== WK) return renderWeekView(fit);
      /* if it doesn't fit, the grid scrolls internally: bring it to the current hour / 08:00 once */
      const wkKey = days[0];
      if (wkScrolledFor !== wkKey && panel.scrollHeight > panel.clientHeight + 4) {
        wkScrolledFor = wkKey;
        const nowM = new Date().getHours() * 60 + new Date().getMinutes();
        const target = days.indexOf(S.TODAY) >= 0 ? nowM - 60 : 8 * 60;
        panel.scrollTop = Math.max(0, (target - GD.DAY_START * 60) / 60 * WK);
      }
    }

    /* telefon listesi */
    let a = "";
    days.forEach((k, i) => {
      const s = sums[i], dd = GD.parseKey(k);
      const dts = App.allTasks().filter((t) => t.date === k).sort((x, y) => (x.done - y.done) || (App.kindRank(x) - App.kindRank(y)));
      let items = s.blocks.map((b) => '<li><span class="tm">' + GD.fmtMin(b.s) + "–" + GD.fmtMin(b.e) + '</span><span class="ti c-' + App.catOf(b.c).color + '">' + esc(b.t) + (b.rec ? " ↻" : "") + "</span></li>").join("");
      items += dts.slice(0, 6).map((t) => { const kd = App.kindOf(t.kind); return '<li><span class="tm' + (App.isKeyTask(t) ? " key c-" + App.keyColor(t) : "") + '">' + (t.done ? "✓ " : "○ ") + esc(kd.name.toLocaleLowerCase("tr")) + '</span><span class="ti c-' + App.catOf(t.cat).color + (t.done ? " done" : "") + '">' + esc(t.title) + "</span></li>"; }).join("");
      if (dts.length > 6) items += '<li><span class="tm"></span><span class="ti">+' + (dts.length - 6) + " görev daha</span></li>";
      const pl = [s.mins ? GD.durText(s.mins) : "", s.open ? s.open + " açık" : ""].filter(Boolean).join(" · ");
      a += '<div class="ag-day' + (k === S.TODAY ? " today" : "") + '"><button class="ag-head" data-go="' + k + '"><span class="dd">' + dd.getDate() + '</span><span class="dn">' + GD.GUN[dd.getDay()] + '</span><span class="pl">' + pl + "</span></button>" +
        (items ? '<ul class="ag-list">' + items + "</ul>" : '<div class="ag-empty">Plan yok</div>') + "</div>";
    });
    $("wkAgenda").innerHTML = a;
    renderHabitTable(days);
  }

  function renderHabitTable(days) {
    if (!S.habits.length) {
      $("wkHabits").innerHTML = '<tbody><tr><td class="empty">Henüz rutin yok. Gün görünümündeki Rutinler bölümünden ekleyebilirsin.</td></tr></tbody>';
      $("wkHabCount").textContent = "";
      return;
    }
    let h = "<thead><tr><th></th>" + days.map((k) => { const d = GD.parseKey(k); return '<th class="' + (k === S.TODAY ? "today" : "") + '">' + App.dayName(d) + "<br>" + d.getDate() + "</th>"; }).join("") + "<th></th></tr></thead><tbody>";
    let hit = 0, want = 0;
    S.habits.forEach((hb) => {
      const tg = hb.target && hb.target < 7 ? hb.target : 7;
      let n = 0;
      h += '<tr><td class="nm">' + esc(hb.name) + "<small>" + (tg === 7 ? "her gün" : "haftada " + tg) + "</small></td>";
      days.forEach((k) => {
        const on = GD.doneOn(S.logs, k, hb.id); if (on) n++;
        h += '<td><button class="hcell' + (on ? " on" : "") + '" data-hab="' + esc(hb.id) + '" data-day="' + k + '" aria-pressed="' + on + '" aria-label="' + esc(hb.name) + " " + k + '"' + (k > S.TODAY ? " disabled" : "") + ">" + CHECK + "</button></td>";
      });
      hit += Math.min(n, tg); want += tg;
      h += '<td class="sc"><b>' + n + "</b>/" + tg + "</td></tr>";
    });
    $("wkHabits").innerHTML = h + "</tbody>";
    $("wkHabCount").textContent = "hedefin %" + Math.round(hit / want * 100) + "'i";
  }

  /* shared with the other app-*.js files */
  Object.assign(App, {
    isFit,
    applyFit,
    renderWeekView
  });
})();
