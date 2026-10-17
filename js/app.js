/* Planner — UI. Calculations live in core.js (GD), storage in store.js (GDStore). */
(function () {
  "use strict";
  const GD = window.GD;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3.2L13 5"/></svg>';
  const COLORNAME = { blue: "Mavi", violet: "Mor", green: "Yeşil", amber: "Turuncu", red: "Kırmızı", pink: "Pembe", teal: "Turkuaz", slate: "Gri" };
  const ACCENTNAME = { violet: "Mor", blue: "Mavi", green: "Yeşil", pink: "Pembe", orange: "Turuncu" };

  /* ---------- settings (categories, kinds, appearance) ---------- */
  let cfg = GD.normalizeSettings(null);
  const catOf = (id) => cfg.cats.find((c) => c.id === id) || { id: id, name: "Diğer", color: "slate", other: true };
  const kindOf = (id) => cfg.kinds.find((k) => k.id === id) || cfg.kinds[0];
  const keyKinds = () => cfg.kinds.filter((k) => k.key).map((k) => k.id);
  const isKeyTask = (t) => !!t.imp || !!kindOf(t.kind).key;
  const kindRank = (t) => { const i = cfg.kinds.findIndex((k) => k.id === t.kind); return (isKeyTask(t) ? 0 : 100) + (i < 0 ? 99 : i); };
  const keyLabel = () => { const n = cfg.kinds.filter((k) => k.key).map((k) => k.name.toLocaleLowerCase("tr")); return n.length ? n.join("/") : "önemli"; };
  /* highlighted tasks linked to a block: badge + ring */
  function keyDeco(list) {
    if (!list || !list.length) return { cls: "", html: "", tip: "" };
    const k0 = kindOf((list.find((t) => kindOf(t.kind).key) || list[0]).kind), star = !list.some((t) => kindOf(t.kind).key) && list.some((t) => t.imp);
    return {
      cls: " keyed",
      html: '<span class="kring c-' + (star ? "amber" : k0.color) + '"></span><span class="kbadges">' +
        list.slice(0, 2).map((t) => {
          const kd = kindOf(t.kind), tl = t.title.length > 18 ? t.title.slice(0, 17) + "…" : t.title, lbl = kd.key ? kd.name : (t.imp ? "★ " : "") + tl;
          return '<span class="kbadge c-' + (kd.key || !t.imp ? kd.color : "amber") + (kd.key || t.imp ? "" : " plain") + (t.done ? " done" : "") + '">' + esc(lbl) + "</span>";
        }).join("") + (list.length > 2 ? '<span class="kbadge plain">+' + (list.length - 2) + "</span>" : "") + "</span>",
      tip: " · " + list.map((t) => kindOf(t.kind).name + ": " + t.title).join(", ")
    };
  }
  /* color of a highlighted task: the kind's color if the kind is highlighted, amber if only the task is starred */
  const keyColor = (t) => { const k = kindOf(t.kind); return !k.key && t.imp ? "amber" : k.color; };
  const keyName = (t) => { const k = kindOf(t.kind); return !k.key && t.imp ? "★ " + k.name : k.name; };
  const kindPill = (t) => { const k = kindOf(t.kind); return '<span class="pill k c-' + k.color + '">' + esc(k.name) + "</span>"; };

  /* ---------- durum ---------- */
  let TODAY = GD.key(new Date());
  let sel = TODAY;
  let store = null, writable = true;
  let tasks = [], habits = [], logs = {}, recurring = [];
  let dayDoc = { blocks: [], note: "", skip: [] }, dayLoaded = false, unsubDay = null;
  let pendingNote = null, noteTimer = null;
  let view = "day", rangeDays = {}, unsubRange = null, rangeKey = "", pendingOpen = null;
  let dayHH = 54, weekHH = 42, weekDaysCache = [], drag = null, suppressClick = false;
  let focus = null, focusTick = null, audioCtx = null, focusByDay = {}, focusByTask = {};
  const WK_H = 42; // height of one hour in the week grid (same as css --wk-h)

  /* ---------- helpers ---------- */
  function banner(msg, sticky) {
    const b = $("banner");
    b.textContent = msg; b.hidden = false;
    clearTimeout(banner._t);
    if (!sticky) banner._t = setTimeout(() => { b.hidden = true; }, 4500);
  }
  function onErr(e) {
    const c = e && e.code;
    if (c === "invalid_argument") { writable = false; banner("Değişiklik kaydedilemedi: bu sayfada yazma yetkin yok.", true); }
    else if (c === "quota_exceeded") banner("Depolama doldu. Eski günlerin notlarını / bitmiş görevleri silmen gerekiyor.", true);
    else if (c === "resource_exhausted") banner("Çok hızlı gitti, bir saniye bekle ve tekrar dene.");
    else if (c === "revoked") banner("Erişim değişti; sayfayı yenile.", true);
    else banner("Kaydedilemedi, tekrar dene.");
  }
  const w = (p) => Promise.resolve(p).catch(onErr);
  function guard() {
    if (!store) { banner("Kayıt bağlantısı henüz hazır değil, bir saniye."); return false; }
    if (!writable) { banner("Görüntüleme modundasın; değişiklik kaydedilmez."); return false; }
    return true;
  }
  function guardDay() {
    if (!guard()) return false;
    if (!dayLoaded) { banner("Gün yükleniyor, bir saniye."); return false; }
    return true;
  }

  let toastT = null;
  function toast(msg, undo) {
    const t = $("toast");
    t.innerHTML = "<span>" + esc(msg) + "</span>" + (undo ? '<button type="button" id="undoBtn">Geri al</button>' : "");
    t.hidden = false;
    if (undo) $("undoBtn").onclick = () => { t.hidden = true; undo(); };
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.hidden = true; }, undo ? 6000 : 2500);
  }

  /* ---------- pencere ---------- */
  let modalOnClose = null;
  function openModal(title, body, footer, onSubmit, wide) {
    const m = $("modal");
    m.className = "modal" + (wide ? " wide" : "");
    m.innerHTML = '<form id="mForm" novalidate><header><h2>' + esc(title) + '</h2><button type="button" class="x" data-close aria-label="Kapat">×</button></header>' +
      '<div class="body">' + body + '<div class="err" id="mErr"></div></div><footer>' + footer + "</footer></form>";
    $("modalBg").hidden = false;
    $("mForm").onsubmit = (e) => { e.preventDefault(); onSubmit && onSubmit(); };
    const f = wide ? null : m.querySelector("input[type=text],input,select");
    if (f) setTimeout(() => { f.focus(); if (f.select && f.type === "text") f.select(); }, 20);
  }
  function closeModal() {
    $("modalBg").hidden = true; $("modal").innerHTML = "";
    if (modalOnClose) { const f = modalOnClose; modalOnClose = null; f(); }
  }
  const modalOpen = () => !$("modalBg").hidden;
  function mErr(msg) { const e = $("mErr"); if (e) e.textContent = msg || ""; }
  $("modalBg").addEventListener("mousedown", (e) => { if (e.target === $("modalBg")) closeModal(); });
  $("modal").addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) { closeModal(); return; }
    const chip = e.target.closest(".chip");
    if (chip) { chip.setAttribute("aria-pressed", chip.getAttribute("aria-pressed") === "true" ? "false" : "true"); return; }
  });
  /* two-step delete: first click asks "Emin misin?", second click runs it */
  function armed(btn, fn) {
    btn.onclick = () => {
      if (btn.classList.contains("arm")) { fn(); return; }
      const txt = btn.textContent;
      btn.classList.add("arm"); btn.textContent = "Emin misin?";
      setTimeout(() => { if (btn.isConnected) { btn.classList.remove("arm"); btn.textContent = txt; } }, 3000);
    };
  }
  /* day name: full on wide screens ("Pazartesi"), short on phones ("Pzt") — css .dn-full / .dn-short */
  const dayName = (d) => '<span class="dn-full">' + GD.GUN[d.getDay()] + '</span><span class="dn-short">' + GD.GUNK[d.getDay()] + "</span>";
  const opt = (val, label, cur) => '<option value="' + esc(val) + '"' + (val === cur ? " selected" : "") + ">" + esc(label) + "</option>";
  const catOptions = (v) => cfg.cats.map((c) => opt(c.id, c.name, v)).join("") + (v && !cfg.cats.some((c) => c.id === v) ? opt(v, "Diğer", v) : "");
  const kindOptions = (v) => cfg.kinds.map((k) => opt(k.id, k.name, v)).join("");
  const dowChips = (arr) => [1, 2, 3, 4, 5, 6, 7].map((d) => '<button type="button" class="chip" data-dow="' + d + '" aria-pressed="' + (arr.indexOf(d) >= 0) + '">' + GD.ISO_KISA[d] + "</button>").join("");
  const pickedDows = () => Array.from(document.querySelectorAll("#modal .chip[data-dow]")).filter((c) => c.getAttribute("aria-pressed") === "true").map((c) => +c.dataset.dow);

  /* ---------- hesaplanan ---------- */
  const currentBlocks = () => GD.blocksForDay(dayDoc, recurring, sel);

  /* ---------- rendering ---------- */
  function rangeStats(days) {
    let total = 0, done = 0, key = 0, mins = 0, fmin = 0;
    const kk = keyKinds();
    days.forEach((k) => {
      const s = GD.daySummary(rangeDays[k] || null, recurring, tasks, k, kk);
      total += s.open + s.done; done += s.done; key += s.key.filter((t) => !t.done).length; mins += s.mins; fmin += focusByDay[k] || 0;
    });
    return { total: total, done: done, key: key, mins: mins, fmin: fmin };
  }
  function statLine(s) {
    return "görev <b>" + s.done + "/" + s.total + "</b> · " + esc(keyLabel()) + " <b>" + s.key + "</b> · plan <b>" + (s.mins ? GD.durText(s.mins) : "–") + "</b>" + (s.fmin ? " · odak <b>" + GD.durText(s.fmin) + "</b>" : "");
  }

  function renderHead() {
    const d = GD.parseKey(sel);
    if (view === "week") {
      const days = GD.weekDays(sel);
      $("dateTitle").textContent = GD.weekLabel(sel);
      $("dateSub").textContent = GD.isoWeek(sel) + ". hafta" + (days.indexOf(TODAY) >= 0 ? " · bu hafta" : "");
      $("stat").innerHTML = statLine(rangeStats(days));
      return;
    }
    if (view === "month") {
      const mon = sel.slice(0, 7);
      $("dateTitle").textContent = GD.AY[d.getMonth()] + " " + d.getFullYear();
      $("dateSub").textContent = mon === TODAY.slice(0, 7) ? "bu ay" : "";
      $("stat").innerHTML = statLine(rangeStats(GD.monthGrid(sel).filter((k) => k.slice(0, 7) === mon)));
      return;
    }
    $("dateTitle").textContent = d.getDate() + " " + GD.AY[d.getMonth()];
    let rel = "";
    if (sel === TODAY) rel = " · bugün";
    else if (sel === GD.addDays(TODAY, 1)) rel = " · yarın";
    else if (sel === GD.addDays(TODAY, -1)) rel = " · dün";
    $("dateSub").textContent = GD.GUN[d.getDay()] + ", " + d.getFullYear() + rel;

    const dayTasks = tasks.filter((t) => t.date === sel);
    const done = dayTasks.filter((t) => t.done).length;
    const lg = logs[sel] || {};
    const hd = habits.filter((h) => lg[h.id]).length;
    const mins = GD.plannedMinutes(currentBlocks());
    $("stat").innerHTML = "görev <b>" + done + "/" + dayTasks.length + "</b> · rutin <b>" + hd + "/" + habits.length + "</b> · plan <b>" + (mins ? GD.durText(mins) : "–") + "</b>" + (focusByDay[sel] ? " · odak <b>" + GD.durText(focusByDay[sel]) + "</b>" : "");
  }

  function renderWeek() {
    const ws = GD.weekStart(sel);
    let html = "";
    for (let i = 0; i < 7; i++) {
      const k = GD.addDays(ws, i), dd = GD.parseKey(k);
      const n = GD.openCountByDay(tasks, k);
      const ex = tasks.some((t) => t.date === k && !t.done && isKeyTask(t));
      let pips = ex ? '<span class="pip ex"></span>' : "";
      for (let j = 0; j < Math.min(n - (ex ? 1 : 0), ex ? 2 : 3); j++) pips += '<span class="pip"></span>';
      html += '<button class="wd' + (k === sel ? " sel" : "") + (k === TODAY ? " today" : "") + '" data-k="' + k + '" aria-label="' + dd.getDate() + " " + GD.AY[dd.getMonth()] + (n ? ", " + n + " açık görev" : "") + '">' +
        '<span class="dn">' + dayName(dd) + '</span><span class="dd">' + dd.getDate() + '</span><span class="pips">' + pips + "</span></button>";
    }
    $("week").innerHTML = html;
  }

  function renderTL() {
    renderFreeHint();
    let hh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hour-h")) || 54;
    if (view === "day" && isFit()) {
      /* the inner height of the timeline box (sized by flex) is divided across the hours */
      const box = $("tl").parentElement, cs = getComputedStyle(box);
      const avail = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 4;
      /* at least 40px: anything smaller is unreadable; hours that don't fit scroll inside the timeline */
      if (avail > 120) hh = Math.max(40, Math.min(84, Math.floor(avail / (GD.DAY_END - GD.DAY_START))));
    }
    $("tl").style.setProperty("--hour-h", hh + "px");
    let html = "";
    for (let h = GD.DAY_START; h < GD.DAY_END; h++) {
      html += '<div class="hour"><span class="hl">' + GD.pad(h) + ':00</span><button class="slot" data-h="' + h + '" aria-label="' + GD.pad(h) + ':00 için blok ekle"></button></div>';
    }
    const blocks = currentBlocks();
    const links = GD.linkKeyTasks(blocks, tasks, sel, keyKinds());
    let bh = "";
    GD.lanes(blocks).forEach((b) => {
      const kd = keyDeco(links.byBlock[b.id]);
      const top = (Math.max(b.s, GD.DAY_START * 60) - GD.DAY_START * 60) / 60 * hh;
      const hgt = Math.max((Math.min(b.e, GD.DAY_END * 60) - Math.max(b.s, GD.DAY_START * 60)) / 60 * hh - 3, 20);
      const wdt = 100 / b._lanes, left = b._lane * wdt;
      const loc = b.loc ? '<span class="loc">' + esc(b.loc) + "</span>" : "";
      bh += '<button class="blk c-' + catOf(b.c).color + (hgt < 50 ? " short" : "") + (hgt < 28 ? " tiny" : "") + kd.cls + '" data-blk="' + esc(b.id) + '" data-rec="' + (b.rec ? 1 : 0) + '" ' +
        'style="top:' + top + "px;height:" + hgt + "px;left:calc(" + left + "% + 2px);width:calc(" + wdt + '% - 6px)" title="' + esc(b.t) + " · " + GD.fmtMin(b.s) + "–" + GD.fmtMin(b.e) + (b.loc ? " · " + esc(b.loc) : "") + (b.rec ? " · her hafta" : "") + esc(kd.tip) + '">' + kd.html +
        '<span class="bt">' + esc(b.t) + (b.rec ? '<span class="rec">↻</span>' : "") + "</span>" +
        '<span class="bh">' + GD.fmtMin(b.s) + "–" + GD.fmtMin(b.e) + loc + "</span>" +
        '<span class="rsz" aria-hidden="true"></span></button>';
    });
    if (sel === TODAY) {
      const now = new Date(), nm = now.getHours() * 60 + now.getMinutes();
      if (nm >= GD.DAY_START * 60 && nm <= GD.DAY_END * 60) bh += '<div class="nowline" style="top:' + ((nm - GD.DAY_START * 60) / 60 * hh) + 'px;left:0"></div>';
    }
    $("tl").innerHTML = html + '<div class="blocks">' + bh + "</div>";
    dayHH = hh;
    const box = $("tl").parentElement;
    if (view === "day" && tlScrolledFor !== sel && box.scrollHeight > box.clientHeight + 4) {
      tlScrolledFor = sel;
      const nowM = new Date().getHours() * 60 + new Date().getMinutes();
      const target = sel === TODAY ? nowM - 60 : (blocks.length ? blocks[0].s - 30 : 8 * 60);
      box.scrollTop = Math.max(0, (target - GD.DAY_START * 60) / 60 * hh);
    }
    $("blkCount").textContent = blocks.length ? blocks.length + " blok · " + GD.durText(GD.plannedMinutes(blocks)) : "";

  }

  function renderFreeHint() {
    const blocks = currentBlocks();
    let hint = "";
    if (sel >= TODAY) {
      let from = Math.max(GD.DAY_START, 8) * 60;
      if (sel === TODAY) { const n = new Date(); from = Math.max(from, Math.ceil((n.getHours() * 60 + n.getMinutes()) / 15) * 15); }
      const slots = GD.freeSlots(blocks, from, Math.min(GD.DAY_END, 23) * 60, 60);
      if (slots.length) {
        const best = slots.slice().sort((a, b) => (b.e - b.s) - (a.e - a.s))[0];
        hint = "en uzun boş aralık <b>" + GD.fmtMin(best.s) + "–" + GD.fmtMin(best.e) + "</b> (" + GD.durText(best.e - best.s) + ")";
      }
    }
    $("freeHint").innerHTML = hint;
    $("freeHint").hidden = !hint;
  }

  function keyRow(t) {
    const d = GD.parseKey(t.date), diff = GD.diffDays(TODAY, t.date);
    const right = t.done ? "tamamlandı" : GD.untilText(TODAY, t.date);
    return '<li' + (t.done ? ' class="done"' : "") + '><button data-go="' + t.date + '"><span class="ud"><b>' + d.getDate() + " " + GD.AY[d.getMonth()].slice(0, 3) + "</b>" + GD.GUNK[d.getDay()] + "</span>" +
      '<span class="ut"><span class="pill k c-' + keyColor(t) + '">' + esc(keyName(t)) + '</span><span class="utt">' + esc(t.title) + "</span></span>" +
      '<span class="ul' + (!t.done && diff >= 0 && diff <= 2 ? " soon" : "") + '">' + right + "</span></button></li>";
  }
  function renderUpcoming() {
    const list = GD.upcoming(tasks, TODAY, cfg.upcomingDays, keyKinds());
    $("upcPanel").hidden = !list.length;
    $("upcDays").textContent = cfg.upcomingDays + " gün";
    $("upcList").innerHTML = list.map(keyRow).join("");
  }

  /* ---------- week view ---------- */
  /* ---------- fit to screen (desktop) ----------
     Measures the real top edge of the timeline / grid / calendar and divides the remaining window height.
     That way the page never overflows, whatever the browser zoom or header height. */
  const fitScreen = () => window.innerWidth >= 1100 && window.innerHeight >= 700;
  let tlScrolledFor = "", wkScrolledFor = "";
  /* on desktop the page fits the window: the page doesn't scroll, panels scroll internally */
  const isFit = () => document.body.classList.contains("fit");
  function applyFit() { document.body.classList.toggle("fit", fitScreen()); }
  function fitRows(el, rows, reserve, min, max) {
    const top = el.getBoundingClientRect().top + window.scrollY;
    return Math.max(min, Math.min(max, Math.floor((window.innerHeight - top - reserve) / rows)));
  }
  let lastWK = 46;
  function renderWeekView(fitted) {
    const days = GD.weekDays(sel);
    const WK = fitted || (isFit() ? lastWK : WK_H);
    $("wkGrid").style.setProperty("--wk-h", WK + "px");
    const kk = keyKinds();
    const sums = days.map((k) => GD.daySummary(rangeDays[k] || null, recurring, tasks, k, kk));

    /* desktop grid */
    let g = '<div class="wk-corner"></div>';
    days.forEach((k, i) => {
      const dd = GD.parseKey(k);
      g += '<button class="wk-day' + (k === TODAY ? " today" : "") + '" data-go="' + k + '" title="' + dd.getDate() + " " + GD.AY[dd.getMonth()] + ' — güne git">' +
        '<span class="dn">' + dayName(dd) + '</span><span class="dd">' + dd.getDate() + '</span><span class="pl">' + (sums[i].mins ? GD.durText(sums[i].mins) : "") + (focusByDay[k] ? '<span class="fc"> · odak ' + GD.durText(focusByDay[k]) + "</span>" : "") + "</span></button>";
    });
    g += '<div class="wk-lbl">görev</div>';
    days.forEach((k, i) => {
      const s = sums[i];
      let inner = s.key.slice(0, 3).map((t) => '<span class="wk-key c-' + keyColor(t) + (t.done ? " done" : "") + '" title="' + esc(keyName(t) + ": " + t.title) + '">' + esc(t.title) + "</span>").join("");
      if (s.key.length > 3) inner += '<span class="wk-cnt">+' + (s.key.length - 3) + " " + esc(keyLabel()) + "</span>";
      const nt = tasks.filter((t) => t.date === k && !isKeyTask(t)).sort((a, b) => (a.done - b.done) || ((a.createdAt || 0) - (b.createdAt || 0)));
      const room = Math.max(1, 3 - Math.min(s.key.length, 3) + 1);
      inner += nt.slice(0, room).map((t) => '<span class="wk-task c-' + catOf(t.cat).color + (t.done ? " done" : "") + '" title="' + esc(t.title) + '">' + esc(t.title) + "</span>").join("");
      if (nt.length > room) inner += '<span class="wk-cnt">+' + (nt.length - room) + " görev</span>";
      g += '<button class="wk-all" data-go="' + k + '" data-tab="gorevler" aria-label="' + k + ' görevleri">' + inner + "</button>";
    });
    g += '<div class="wk-hours">';
    for (let h = GD.DAY_START + 1; h < GD.DAY_END; h++) g += '<span style="top:' + ((h - GD.DAY_START) * WK) + 'px">' + GD.pad(h) + ":00</span>";
    g += "</div>";
    const now = new Date(), nm = now.getHours() * 60 + now.getMinutes();
    days.forEach((k, i) => {
      g += '<div class="wk-col' + (k === TODAY ? " today" : "") + '">';
      for (let h = GD.DAY_START; h < GD.DAY_END; h++) g += '<button class="wslot" data-day="' + k + '" data-h="' + h + '" style="top:' + ((h - GD.DAY_START) * WK) + 'px" aria-label="' + k + " " + GD.pad(h) + ':00 blok ekle"></button>';
      const wl = GD.linkKeyTasks(sums[i].blocks, tasks, k, kk);
      GD.lanes(sums[i].blocks).forEach((b) => {
        const kd = keyDeco(wl.byBlock[b.id]);
        const top = (Math.max(b.s, GD.DAY_START * 60) - GD.DAY_START * 60) / 60 * WK;
        const hgt = Math.max((Math.min(b.e, GD.DAY_END * 60) - Math.max(b.s, GD.DAY_START * 60)) / 60 * WK - 2, 16);
        const wdt = 100 / b._lanes, left = b._lane * wdt;
        g += '<button class="wblk c-' + catOf(b.c).color + (hgt < 26 ? " tiny" : "") + kd.cls + '" data-day="' + k + '" data-blk="' + esc(b.id) + '" data-rec="' + (b.rec ? 1 : 0) + '" ' +
          'style="top:' + top + "px;height:" + hgt + "px;left:calc(" + left + "% + 2px);width:calc(" + wdt + '% - 4px)" title="' + esc(b.t) + " · " + GD.fmtMin(b.s) + "–" + GD.fmtMin(b.e) + (b.loc ? " · " + esc(b.loc) : "") + (b.rec ? " · her hafta" : "") + esc(kd.tip) + '">' + kd.html +
          /* line count follows the block's real height: 3 lines / 2 lines / single line */
          (hgt >= 62 && b.loc
            ? '<span class="bt">' + esc(b.t) + '</span><span class="bh">' + GD.fmtMin(b.s) + "–" + GD.fmtMin(b.e) + '</span><span class="bl">' + esc(b.loc) + "</span>"
            : hgt >= 40
              ? '<span class="bt">' + esc(b.t) + '</span><span class="bh">' + GD.fmtMin(b.s) + "–" + GD.fmtMin(b.e) + (b.loc ? '<span class="bl-in"> · ' + esc(b.loc) + "</span>" : "") + "</span>"
              : '<span class="bt"><span class="bh-in">' + GD.fmtMin(b.s) + "</span> " + esc(b.t) + (b.loc ? '<span class="bl-in"> · ' + esc(b.loc) + "</span>" : "") + "</span>") +
          '<span class="rsz" aria-hidden="true"></span></button>';
      });
      if (k === TODAY && nm >= GD.DAY_START * 60) g += '<div class="wk-now" style="top:' + ((nm - GD.DAY_START * 60) / 60 * WK) + 'px"></div>';
      g += "</div>";
    });
    $("wkGrid").innerHTML = g;
    weekHH = WK; weekDaysCache = days;
    if (!fitted && view === "week" && isFit()) {
      const col = $("wkGrid").querySelector(".wk-col"), panel = $("wkGrid").parentElement;
      const fit = col ? Math.max(34, Math.min(84, Math.floor((panel.getBoundingClientRect().bottom - col.getBoundingClientRect().top - 2) / (GD.DAY_END - GD.DAY_START)))) : WK;
      lastWK = fit;
      if (fit !== WK) return renderWeekView(fit);
      /* if it doesn't fit, the grid scrolls internally: bring it to the current hour / 08:00 once */
      const wkKey = days[0];
      if (wkScrolledFor !== wkKey && panel.scrollHeight > panel.clientHeight + 4) {
        wkScrolledFor = wkKey;
        const nowM = new Date().getHours() * 60 + new Date().getMinutes();
        const target = days.indexOf(TODAY) >= 0 ? nowM - 60 : 8 * 60;
        panel.scrollTop = Math.max(0, (target - GD.DAY_START * 60) / 60 * WK);
      }
    }

    /* telefon listesi */
    let a = "";
    days.forEach((k, i) => {
      const s = sums[i], dd = GD.parseKey(k);
      const dts = tasks.filter((t) => t.date === k).sort((x, y) => (x.done - y.done) || (kindRank(x) - kindRank(y)));
      let items = s.blocks.map((b) => '<li><span class="tm">' + GD.fmtMin(b.s) + "–" + GD.fmtMin(b.e) + '</span><span class="ti c-' + catOf(b.c).color + '">' + esc(b.t) + (b.rec ? " ↻" : "") + "</span></li>").join("");
      items += dts.slice(0, 6).map((t) => { const kd = kindOf(t.kind); return '<li><span class="tm' + (isKeyTask(t) ? " key c-" + keyColor(t) : "") + '">' + (t.done ? "✓ " : "○ ") + esc(kd.name.toLocaleLowerCase("tr")) + '</span><span class="ti c-' + catOf(t.cat).color + (t.done ? " done" : "") + '">' + esc(t.title) + "</span></li>"; }).join("");
      if (dts.length > 6) items += '<li><span class="tm"></span><span class="ti">+' + (dts.length - 6) + " görev daha</span></li>";
      const pl = [s.mins ? GD.durText(s.mins) : "", s.open ? s.open + " açık" : ""].filter(Boolean).join(" · ");
      a += '<div class="ag-day' + (k === TODAY ? " today" : "") + '"><button class="ag-head" data-go="' + k + '"><span class="dd">' + dd.getDate() + '</span><span class="dn">' + GD.GUN[dd.getDay()] + '</span><span class="pl">' + pl + "</span></button>" +
        (items ? '<ul class="ag-list">' + items + "</ul>" : '<div class="ag-empty">Plan yok</div>') + "</div>";
    });
    $("wkAgenda").innerHTML = a;
    renderHabitTable(days);
  }

  function renderHabitTable(days) {
    if (!habits.length) {
      $("wkHabits").innerHTML = '<tbody><tr><td class="empty">Henüz rutin yok. Gün görünümündeki Rutinler bölümünden ekleyebilirsin.</td></tr></tbody>';
      $("wkHabCount").textContent = "";
      return;
    }
    let h = "<thead><tr><th></th>" + days.map((k) => { const d = GD.parseKey(k); return '<th class="' + (k === TODAY ? "today" : "") + '">' + dayName(d) + "<br>" + d.getDate() + "</th>"; }).join("") + "<th></th></tr></thead><tbody>";
    let hit = 0, want = 0;
    habits.forEach((hb) => {
      const tg = hb.target && hb.target < 7 ? hb.target : 7;
      let n = 0;
      h += '<tr><td class="nm">' + esc(hb.name) + "<small>" + (tg === 7 ? "her gün" : "haftada " + tg) + "</small></td>";
      days.forEach((k) => {
        const on = GD.doneOn(logs, k, hb.id); if (on) n++;
        h += '<td><button class="hcell' + (on ? " on" : "") + '" data-hab="' + esc(hb.id) + '" data-day="' + k + '" aria-pressed="' + on + '" aria-label="' + esc(hb.name) + " " + k + '"' + (k > TODAY ? " disabled" : "") + ">" + CHECK + "</button></td>";
      });
      hit += Math.min(n, tg); want += tg;
      h += '<td class="sc"><b>' + n + "</b>/" + tg + "</td></tr>";
    });
    $("wkHabits").innerHTML = h + "</tbody>";
    $("wkHabCount").textContent = "hedefin %" + Math.round(hit / want * 100) + "'i";
  }

  /* ---------- month view ---------- */
  let moCap = 4;   /* number of lines that fit in a month cell (set by measuring) */
  function renderMonthView(measured) {
    const grid = GD.monthGrid(sel), mon = sel.slice(0, 7), kk = keyKinds();
    let g = GD.weekDays(sel).map((k) => '<div class="mo-dn">' + dayName(GD.parseKey(k)) + "</div>").join("");
    grid.forEach((k) => {
      const s = GD.daySummary(rangeDays[k] || null, recurring, tasks, k, kk);
      const dd = GD.parseKey(k), inMon = k.slice(0, 7) === mon;
      const keyOpen = s.key.filter((t) => !t.done).length;
      const metaTxt = (s.mins ? GD.durText(s.mins) : "") + (focusByDay[k] ? (s.mins ? " · " : "") + "odak " + GD.durText(focusByDay[k]) : "");
      let inner = '<span class="mo-head"><span class="mo-num">' + dd.getDate() + '</span><span class="mo-meta" title="Planlı süre">' + metaTxt + "</span></span>";
      /* order: highlighted → tasks → classes/blocks (by time); what doesn't fit becomes "+N daha" */
      const nt = tasks.filter((t) => t.date === k && !isKeyTask(t)).sort((a, b) => (a.done - b.done) || ((a.createdAt || 0) - (b.createdAt || 0)));
      const items = s.key.map((t) => '<span class="mo-key c-' + keyColor(t) + (t.done ? " done" : "") + '">' + esc(t.title) + "</span>")
        .concat(nt.map((t) => '<span class="mo-task c-' + catOf(t.cat).color + (t.done ? " done" : "") + '"><i></i><span class="tx">' + esc(t.title) + "</span></span>"))
        .concat(s.blocks.map((b) => '<span class="mo-ev c-' + catOf(b.c).color + '"><i></i><b>' + GD.fmtMin(b.s) + '</b><span class="tx">' + esc(b.t) + "</span></span>"));
      const shown = items.length > moCap ? moCap - 1 : items.length;
      inner += items.slice(0, shown).join("");
      if (items.length > shown) inner += '<span class="mo-more">+' + (items.length - shown) + " daha</span>";
      const normal = s.open - keyOpen;
      let dots = s.key.slice(0, 3).map((t) => '<i class="c-' + keyColor(t) + '"></i>').join("");
      if (normal > 0) dots += "<i></i>";
      if (s.mins) dots += '<i class="plan"></i>';
      inner += '<span class="mo-dots">' + dots + "</span>";
      if (habits.length && k <= TODAY && inMon) {
        const L = logs[k] || {}, n = habits.filter((h) => L[h.id]).length;
        if (n) inner += '<span class="mo-bar" title="Rutin: ' + n + "/" + habits.length + '"><b style="width:' + Math.round(n / habits.length * 100) + '%"></b></span>';
      }
      const lbl = dd.getDate() + " " + GD.AY[dd.getMonth()] + (keyOpen ? ", " + keyOpen + " " + keyLabel() : "") + (s.open ? ", " + s.open + " açık görev" : "");
      g += '<button class="mo-cell' + (inMon ? "" : " out") + (k === TODAY ? " today" : "") + (k === sel ? " sel" : "") + '" data-go="' + k + '" aria-label="' + lbl + '">' + inner + "</button>";
    });
    $("moGrid").innerHTML = g;
    /* set the line count once, based on the cell height */
    if (!measured && view === "month" && window.innerWidth > 880) {
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


    const list = tasks.filter((t) => t.date && t.date.slice(0, 7) === mon && isKeyTask(t))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    $("moKeyCount").textContent = list.length ? list.filter((t) => !t.done).length + " açık / " + list.length : "";
    $("moKeyList").innerHTML = list.length ? list.map(keyRow).join("")
      : '<li class="empty">Bu ay öne çıkan bir şey yok. Görev eklerken öne çıkan bir tür (ör. ' + esc(cfg.kinds.filter((k) => k.key).map((k) => k.name).join(", ") || "Ayarlar → Görev türleri") + ") seçersen burada görünür.</li>";
  }

  function renderRange() {
    renderHead();
    if (view === "week") renderWeekView();
    else if (view === "month") renderMonthView();
  }
  function subRange() {
    if (view === "day" || !store) {
      if (view === "day" && unsubRange) { unsubRange(); unsubRange = null; rangeKey = ""; }
      return;
    }
    let from, to;
    if (view === "week") { const d = GD.weekDays(sel); from = d[0]; to = d[6]; }
    else { const g = GD.monthGrid(sel); from = g[0]; to = g[41]; }
    const rk = from + "|" + to;
    if (rk === rangeKey) return;
    if (unsubRange) unsubRange();
    rangeKey = rk; rangeDays = {};
    unsubRange = store.watchRange("days", "date", from, to, (rows) => {
      if (rangeKey !== rk) return;
      const m = {};
      rows.forEach((r) => { m[GD.isKey(r.date) ? r.date : r.id] = r; });
      rangeDays = m;
      if (view !== "day") renderRange();
    }, onErr);
  }

  function setView(v) {
    if (["day", "week", "month"].indexOf(v) < 0) v = "day";
    view = v;
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
    renderAll();
  }
  function nav(dir) {
    if (view === "week") go(GD.addDays(sel, 7 * dir));
    else if (view === "month") go(GD.addMonths(sel, dir));
    else go(GD.addDays(sel, dir));
  }
  /* clicking a block / empty hour in the week view: load that day without changing the view, open the dialog */
  function openFromRange(k, opt) {
    pendingOpen = { k: k, opt: opt };
    if (k === sel && dayLoaded) { pendingOpen = null; openBlockModal(opt); return; }
    go(k);
  }

  /* ---------- tema ---------- */
  function effectiveTheme() {
    const a = document.documentElement.getAttribute("data-theme");
    if (a === "dark" || a === "light") return a;
    return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function toggleTheme() {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("gunDefteri.theme", next); } catch (e) { /* none */ }
    toast(next === "dark" ? "Koyu tema" : "Açık tema");
  }
  $("themeBtn").innerHTML =
    '<svg class="moon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1z"/></svg>' +
    '<svg class="sun" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="8" cy="8" r="2.8"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/></svg>';
  $("themeBtn").onclick = toggleTheme;

  function renderTasks() {
    const items = GD.visibleTasks(tasks, sel, TODAY);
    const open = items.filter((x) => !x.t.done).length;
    $("tCount").textContent = items.length ? open + " açık / " + items.length : "";

    const od = sel === TODAY ? GD.overdue(tasks, TODAY) : [];
    $("overdueBar").innerHTML = od.length ? '<div class="overdue"><span>' + od.length + " gecikmiş görev</span>" + '<button class="linkbtn" id="moveOverdue">Hepsini bugüne taşı</button></div>' : "";

    let html = "";
    if (!items.length) {
      html = '<div class="empty"><strong>' + (sel < TODAY ? "Bu günde görev yok" : "Bu gün için görev yok") + "</strong>Yukarıdan ekle. Öne çıkan türler ayrıca Yaklaşanlar listesinde görünür.</div>";
    } else {
      const known = cfg.cats.map((c) => c.id);
      const groups = cfg.cats.map((c) => ({ c: c, items: items.filter((x) => x.t.cat === c.id) }));
      const other = items.filter((x) => known.indexOf(x.t.cat) < 0);
      if (other.length) groups.push({ c: { id: "_other", name: "Diğer", color: "slate" }, items: other });
      const selLinks = GD.linkKeyTasks(currentBlocks(), tasks, sel, keyKinds()).byTask;
      groups.forEach((gr) => {
        const g = gr.items, c = gr.c;
        if (!g.length) return;
        g.sort((a, b) => (a.t.done - b.t.done) || (kindRank(a.t) - kindRank(b.t)) || (b.late - a.late) || ((a.t.createdAt || 0) - (b.t.createdAt || 0)));
        html += '<div class="tgroup"><h3><span class="swatch c-' + c.color + '"></span>' + esc(c.name) + '<span class="n">' + g.filter((x) => !x.t.done).length + "</span></h3><ul class=\"tasks\">";
        g.forEach((x) => {
          const t = x.t;
          let meta = "";
          if (t.imp) meta += '<span class="pill imp">★ önemli</span>';
          if (t.kind !== "normal") meta += kindPill(t);
          if (x.late) meta += '<span class="pill late">' + GD.untilText(TODAY, t.date) + "</span>";
          else if (!t.date) meta += '<span class="pill nodate">tarihsiz</span>';
          if (selLinks[t.id]) { const lb = selLinks[t.id]; meta += '<span class="pill at">' + GD.fmtMin(lb.s) + " · " + esc(lb.t) + (lb.loc ? " · " + esc(lb.loc) : "") + "</span>"; }
          if (focusByTask[t.id]) meta += '<span class="pill fc">odak ' + GD.durText(focusByTask[t.id]) + "</span>";
          html += '<li class="task' + (t.done ? " done" : "") + '"' + (t.done ? "" : ' draggable="true" data-tid="' + esc(t.id) + '" title="Çizelgeye sürükleyip saat ver"') + ">" +
            '<button class="chk" data-toggle="' + esc(t.id) + '" aria-label="Tamamlandı" aria-pressed="' + t.done + '">' + CHECK + "</button>" +
            '<button class="tx" data-edit-task="' + esc(t.id) + '"><span class="tt">' + esc(t.title) + "</span>" + (meta ? '<span class="meta">' + meta + "</span>" : "") + "</button>" +
            '<span class="tact">' + (t.done ? "" : '<button class="star' + (t.imp ? " on" : "") + '" data-star="' + esc(t.id) + '" title="' + (t.imp ? "Öne çıkarmayı kaldır" : "Öne çıkar: Yaklaşanlar ve takvimde göster") + '" aria-label="Öne çıkar" aria-pressed="' + !!t.imp + '">★</button><button data-focus-task="' + esc(t.id) + '" title="Odak başlat" aria-label="Odak başlat">▶</button><button data-postpone="' + esc(t.id) + '" title="Ertesi güne ertele" aria-label="Ertele">→1g</button>') +
            '<button class="del" data-del-task="' + esc(t.id) + '" title="Sil" aria-label="Görevi sil">×</button></span></li>';
        });
        html += "</ul></div>";
      });
    }
    $("taskList").innerHTML = html;
  }

  function renderHabits() {
    if (!habits.length) {
      $("habitList").innerHTML = '<div class="empty"><strong>Henüz rutin yok</strong>Her gün ya da haftada birkaç gün yaptığın şeyleri ekle; seri kendiliğinden sayılır.</div>';
      $("hCount").textContent = "";
      return;
    }
    const lg = logs[sel] || {}, future = sel > TODAY;
    let html = '<ul class="habits">';
    habits.forEach((h) => {
      let sp = "";
      for (let i = 6; i >= 0; i--) {
        const k = GD.addDays(sel, -i);
        sp += '<i class="' + (GD.doneOn(logs, k, h.id) ? "f" : "") + (i === 0 ? " sel" : "") + '" title="' + k + '"></i>';
      }
      const p = GD.habitProgress(logs, h, sel);
      const prog = p.mode === "daily"
        ? '<span class="streak" title="Kesintisiz gün">' + (p.streak ? "<b>" + p.streak + "</b>g" : "–") + "</span>"
        : '<span class="streak" title="Bu hafta / hedef' + (p.weeks ? " · " + p.weeks + " haftadır tutuyor" : "") + '"><b>' + p.count + "</b>/" + p.target + "</span>";
      html += '<li class="habit' + (lg[h.id] ? " on" : "") + '">' +
        '<button class="htoggle" data-habit="' + esc(h.id) + '" aria-pressed="' + !!lg[h.id] + '" aria-label="' + esc(h.name) + ' yapıldı"' + (future ? " disabled title=\"Gelecek gün işaretlenemez\"" : "") + ">" + CHECK + "</button>" +
        '<button class="hn" data-edit-habit="' + esc(h.id) + '">' + esc(h.name) + "<small>" + (p.mode === "daily" ? "her gün" : "haftada " + p.target) + "</small></button>" +
        '<span class="spark" aria-hidden="true">' + sp + "</span>" + prog + "</li>";
    });
    $("habitList").innerHTML = html + "</ul>";
    $("hCount").textContent = habits.filter((h) => lg[h.id]).length + "/" + habits.length;
  }

  function renderNote() {
    if (!pendingNote) $("note").value = dayDoc.note || "";
    $("note").placeholder = sel < TODAY ? "Bu güne dair not…" : "Bugüne dair not, yarına kalanlar…";
  }

  function renderAll() {
    if (view !== "day") { renderRange(); return; }
    renderHead(); renderWeek(); renderTL(); renderUpcoming(); renderTasks(); renderHabits(); renderNote();
  }

  /* ---------- day document ---------- */
  function saveDay(k, doc) {
    const blocks = (doc.blocks || []).map((b) => { const o = { id: b.id, s: b.s, e: b.e, t: b.t, c: b.c }; if (b.loc) o.loc = b.loc; return o; });
    return w(store.set("days", k, { date: k, blocks: blocks, note: doc.note || "", skip: doc.skip || [] }));
  }
  function subDay() {
    if (unsubDay) { unsubDay(); unsubDay = null; }
    if (!store) return;
    const k = sel;
    dayLoaded = false;
    unsubDay = store.watchDoc("days", k, (d) => {
      if (k !== sel) return;
      dayDoc = {
        /* known fields only (v1 also saved the overlap fields _lane/_lanes) */
        blocks: d && Array.isArray(d.blocks) ? d.blocks.map((b) => ({ id: b.id, s: b.s, e: b.e, t: b.t, c: b.c, loc: b.loc || "" })) : [],
        note: d && typeof d.note === "string" ? d.note : "",
        skip: d && Array.isArray(d.skip) ? d.skip : []
      };
      if (pendingNote && pendingNote.k === k) dayDoc.note = pendingNote.text;
      dayLoaded = true;
      renderHead(); renderTL(); renderNote();
      if (pendingOpen && pendingOpen.k === k) { const po = pendingOpen; pendingOpen = null; openBlockModal(po.opt); }
    }, onErr);
  }
  function flushNote() {
    clearTimeout(noteTimer);
    if (!pendingNote || !store || !writable) return;
    const p = pendingNote; pendingNote = null;
    if (p.k !== sel || !dayLoaded) return; // shouldn't happen: flushed before the day changes
    dayDoc.note = p.text;
    saveDay(p.k, dayDoc).then(() => {
      const n = new Date();
      $("noteSaved").textContent = "kaydedildi " + GD.pad(n.getHours()) + ":" + GD.pad(n.getMinutes());
    });
  }

  function go(k) {
    if (!GD.isKey(k)) return;
    flushNote();
    sel = k;
    dayDoc = { blocks: [], note: "", skip: [] };
    $("tDate").value = k;
    $("noteSaved").textContent = "";
    subRange();
    renderAll();
    subDay();
  }

  /* ---------- bloklar ---------- */
  function addBlockQuick() {
    const t = $("bTitle").value.trim(), s = GD.toMin($("bStart").value), e = GD.toMin($("bEnd").value);
    if (!t) { $("bTitle").focus(); return; }
    const err = GD.blockError(s, e, t);
    if (err) { banner(err); return; }
    if (!guardDay()) return;
    dayDoc.blocks = dayDoc.blocks.concat([{ id: uid(), s: s, e: e, t: t, c: $("bCat").value }]);
    saveDay(sel, dayDoc);
    renderHead(); renderTL();
    $("bTitle").value = "";
    $("bStart").value = GD.fmtMin(Math.min(e, 23 * 60));
    $("bEnd").value = GD.fmtMin(Math.min(e + 60, 24 * 60 - 1));
  }

  function openBlockModal(opt) {
    /* opt: {id, rec} to edit or {s, e, repeat} for a new one */
    let b = null, r = null;
    if (opt.id) {
      if (opt.rec) r = recurring.find((x) => x.id === opt.id);
      else b = dayDoc.blocks.find((x) => x.id === opt.id);
      if (!r && !b) return;
    }
    const src = r || b || { t: "", s: opt.s, e: opt.e, c: $("bCat").value };
    const editing = !!(r || b);
    const isRec = !!r;
    const dows = r ? r.dow : [GD.isoDow(sel)];
    const body =
      '<label class="field"><span>Başlık</span><input type="text" id="mT" maxlength="80" value="' + esc(src.t) + '" placeholder="ör. Matematik dersi" autocomplete="off"></label>' +
      '<div class="row"><label class="field"><span>Başlangıç</span><input type="time" id="mS" step="300" value="' + GD.fmtMin(src.s) + '"></label>' +
      '<label class="field"><span>Bitiş</span><input type="time" id="mE" step="300" value="' + GD.fmtMin(Math.min(src.e, 24 * 60 - 1)) + '"></label>' +
      '<label class="field"><span>Tür</span><select id="mC">' + catOptions(src.c) + "</select></label></div>" +
      '<label class="field"><span>Yer / not</span><input type="text" id="mL" maxlength="60" value="' + esc(src.loc || "") + '" placeholder="ör. MM-101, Kütüphane 2. kat" autocomplete="off"></label>' +
      (isRec ? "" : '<label class="check"><input type="checkbox" id="mRep"' + (opt.repeat ? " checked" : "") + "> Her hafta tekrarla</label>") +
      '<div id="mDowWrap"' + (isRec || opt.repeat ? "" : " hidden") + '><div class="field"><span>Günler</span><div class="chips">' + dowChips(dows) + "</div></div></div>" +
      (editing ? keySection(src) : "") +
      (isRec ? '<p class="info">Haftalık blok. Kaydettiğin değişiklik tüm haftalara uygulanır' + (r.from ? " (" + fmtShort(r.from) + "'den beri)" : "") + ".</p>" : "");
    let footer = '<button type="submit" class="btn">' + (editing ? "Kaydet" : "Ekle") + "</button><span class=\"sp\"></span>";
    if (editing) footer += '<button type="button" class="btn-ghost" id="mFocus" title="Bu blok için odak sayacını başlat">▶ Odak</button>';
    if (b) footer += '<button type="button" class="btn-danger" id="mDel">Sil</button>';
    if (r) footer += '<button type="button" class="btn-ghost" id="mSkip" title="Sadece bu gün gösterme">Bu gün yok</button><button type="button" class="btn-danger" id="mEnd">Bu günden itibaren kaldır</button>';

    openModal(editing ? (isRec ? "Haftalık bloğu düzenle" : "Bloğu düzenle") : "Yeni blok", body, footer, () => {
      const t = $("mT").value.trim(), s = GD.toMin($("mS").value), e = GD.toMin($("mE").value === "23:59" ? "24:00" : $("mE").value), c = $("mC").value, loc = $("mL").value.trim();
      const err = GD.blockError(s, e, t);
      if (err) { mErr(err); return; }
      const rep = isRec || ($("mRep") && $("mRep").checked);
      const dow = pickedDows();
      if (rep && !dow.length) { mErr("En az bir gün seç."); return; }
      if (!guardDay()) return;
      if (r) {
        w(store.update("recurring", r.id, { t: t, s: s, e: e, c: c, loc: loc, dow: dow }));
      } else if (rep) {
        w(store.set("recurring", uid(), { t: t, s: s, e: e, c: c, loc: loc, dow: dow, from: GD.weekStart(sel), until: null, createdAt: Date.now() }));
        if (b) { dayDoc.blocks = dayDoc.blocks.filter((x) => x.id !== b.id); saveDay(sel, dayDoc); }
        toast("Haftalık blok eklendi: " + dow.map((d) => GD.ISO_KISA[d]).join(", "));
      } else if (b) {
        dayDoc.blocks = dayDoc.blocks.map((x) => x.id === b.id ? Object.assign({}, x, { t: t, s: s, e: e, c: c, loc: loc }) : x);
        saveDay(sel, dayDoc);
      } else {
        dayDoc.blocks = dayDoc.blocks.concat([{ id: uid(), s: s, e: e, t: t, c: c, loc: loc }]);
        saveDay(sel, dayDoc);
      }
      closeModal(); renderHead(); renderTL();
    });

    const rep = $("mRep");
    if (rep) rep.onchange = () => { $("mDowWrap").hidden = !rep.checked; };
    if ($("mFocus")) $("mFocus").onclick = () => { closeModal(); startFocus({ title: src.t, cat: src.c }); };
    $("modal").querySelectorAll("[data-addkey]").forEach((btn) => {
      btn.onclick = () => {
        if (!guard()) return;
        const kind = kindOf(btn.dataset.addkey), id = uid(), typed = $("mKT") ? $("mKT").value.trim() : "";
        const title = typed || (src.t + " " + kind.name);
        w(store.set("tasks", id, { title: title, cat: src.c, kind: kind.id, date: sel, blk: src.id, done: false, createdAt: Date.now() }));
        closeModal();
        toast(fmtShort(sel) + " · " + src.t + ": " + kind.name + " eklendi", () => w(store.del("tasks", id)));
      };
    });
    if ($("mKT")) $("mKT").addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault(); e.stopPropagation();
      if (!$("mKT").value.trim()) return;
      const nb = $("modal").querySelector('[data-addkey="normal"]');
      if (nb) nb.click();
    });
    $("modal").querySelectorAll("[data-unlink]").forEach((btn) => {
      btn.onclick = () => { closeModal(); delTask(btn.dataset.unlink); };
    });
    if (b) armed($("mDel"), () => {
      if (!guardDay()) return;
      const before = dayDoc.blocks;
      dayDoc.blocks = dayDoc.blocks.filter((x) => x.id !== b.id);
      saveDay(sel, dayDoc); closeModal(); renderHead(); renderTL();
      const k = sel;
      toast("Blok silindi", () => { if (sel === k) { dayDoc.blocks = before; saveDay(k, dayDoc); renderHead(); renderTL(); } });
    });
    if (r) {
      $("mSkip").onclick = () => {
        if (!guardDay()) return;
        dayDoc.skip = (dayDoc.skip || []).concat([r.id]);
        saveDay(sel, dayDoc); closeModal(); renderHead(); renderTL();
        const k = sel;
        toast("Bu gün için kaldırıldı", () => { if (sel === k) { dayDoc.skip = dayDoc.skip.filter((x) => x !== r.id); saveDay(k, dayDoc); renderHead(); renderTL(); } });
      };
      armed($("mEnd"), () => {
        if (!guard()) return;
        const snapshot = Object.assign({}, r); delete snapshot.id;
        if (!r.from || r.from >= sel) w(store.del("recurring", r.id));
        else w(store.update("recurring", r.id, { until: GD.addDays(sel, -1) }));
        closeModal();
        toast("Haftalık blok kaldırıldı (geçmiş günler duruyor)", () => w(store.set("recurring", r.id, snapshot)));
      });
    }
  }
  /* in the block dialog: what's on in this class that day (quiz, exam…) */
  function keySection(src) {
    const linked = GD.linkKeyTasks(currentBlocks(), tasks, sel, keyKinds()).byBlock[src.id] || [];
    const kinds = cfg.kinds.filter((k) => k.key).concat(cfg.kinds.filter((k) => !k.key));
    return '<div class="field"><span>Bu derste / blokta · ' + fmtShort(sel) + '</span>' +
      '<input type="text" id="mKT" maxlength="140" placeholder="Bu bloğa görev ekle, ör. slaytları getir (Enter)" autocomplete="off">' +
      '<div class="keyrow">' +
      linked.map((t) => '<span class="pill k c-' + keyColor(t) + '">' + esc(keyName(t)) + ": " + esc(t.title) +
        '<button type="button" data-unlink="' + esc(t.id) + '" title="Sil" aria-label="Sil">×</button></span>').join("") +
      kinds.map((k) => '<button type="button" class="kchip c-' + k.color + '" data-addkey="' + esc(k.id) + '">+ ' + esc(k.name) + "</button>").join("") +
      "</div></div>";
  }
  function fmtShort(k) { const d = GD.parseKey(k); return d.getDate() + " " + GD.AY[d.getMonth()]; }

  /* ---------- tasks ---------- */
  function addTask() {
    const t = $("tTitle").value.trim();
    if (!t) { $("tTitle").focus(); return; }
    if (!guard()) return;
    const kind = $("tKind").value;
    const date = $("tDate").value || null;
    if (kindOf(kind).key && !date) { banner(kindOf(kind).name + " için tarih ver ki Yaklaşanlar listesinde görünsün."); }
    w(store.set("tasks", uid(), { title: t, cat: $("tCat").value, kind: kind, date: date, done: false, createdAt: Date.now() }));
    $("tTitle").value = ""; $("tKind").value = "normal"; $("tTitle").focus();
  }
  const findTask = (id) => tasks.find((x) => x.id === id);
  function rawTask(t) { const o = Object.assign({}, t); delete o.id; return o; }

  function toggleTask(id) {
    const t = findTask(id); if (!t || !guard()) return;
    w(store.update("tasks", id, { done: !t.done, doneAt: !t.done ? Date.now() : null }));
  }
  function postpone(id) {
    const t = findTask(id); if (!t || !guard()) return;
    const base = t.date && t.date >= TODAY ? t.date : TODAY;
    const nd = GD.addDays(base, 1), old = t.date || null;
    w(store.update("tasks", id, { date: nd }));
    toast("“" + t.title.slice(0, 40) + "” → " + fmtShort(nd), () => w(store.update("tasks", id, { date: old })));
  }
  function delTask(id) {
    const t = findTask(id); if (!t || !guard()) return;
    const raw = rawTask(t);
    w(store.del("tasks", id));
    toast("Görev silindi", () => w(store.set("tasks", id, raw)));
  }
  function moveOverdue() {
    if (!guard()) return;
    const od = GD.overdue(tasks, TODAY);
    const olds = od.map((t) => [t.id, t.date]);
    od.reduce((p, t) => p.then(() => store.update("tasks", t.id, { date: TODAY })), Promise.resolve()).catch(onErr);
    toast(od.length + " görev bugüne taşındı", () => {
      olds.reduce((p, x) => p.then(() => store.update("tasks", x[0], { date: x[1] })), Promise.resolve()).catch(onErr);
    });
  }
  function openTaskModal(id) {
    const t = findTask(id); if (!t) return;
    const body =
      '<label class="field"><span>Görev</span><input type="text" id="mT" maxlength="140" value="' + esc(t.title) + '" autocomplete="off"></label>' +
      '<div class="row"><label class="field"><span>Kategori</span><select id="mC">' + catOptions(t.cat) + "</select></label>" +
      '<label class="field"><span>Tür</span><select id="mK">' + kindOptions(t.kind) + "</select></label></div>" +
      '<div class="row"><label class="field"><span>Tarih</span><input type="date" id="mD" value="' + (t.date || "") + '"></label>' +
      '<div class="field"><span>&nbsp;</span><button type="button" class="btn-ghost" id="mNoDate">Tarihsiz yap</button></div></div>' +
      '<label class="field" id="mBWrap" hidden><span>Hangi derste / blokta</span><select id="mB"><option value="">Otomatik (adından bul)</option></select></label>' +
      '<div class="row checks"><label class="check" title="Yaklaşanlar listesinde ve haftalık/aylık takvimde göster"><input type="checkbox" id="mImp"' + (t.imp ? " checked" : "") + "> ★ Öne çıkar</label>" +
      '<label class="check"><input type="checkbox" id="mDone"' + (t.done ? " checked" : "") + "> Tamamlandı</label></div>";
    const footer = '<button type="submit" class="btn">Kaydet</button><span class="sp"></span><button type="button" class="btn-danger" id="mDel">Sil</button>';
    openModal("Görevi düzenle", body, footer, () => {
      const title = $("mT").value.trim();
      if (!title) { mErr("Görev boş olamaz."); return; }
      const date = $("mD").value || null, kind = $("mK").value;
      const imp = $("mImp").checked;
      if (kindOf(kind).key && !date) { mErr(kindOf(kind).name + " için tarih seç."); return; }
      if (imp && !date) { mErr("Öne çıkan görev için tarih seç."); return; }
      if (!guard()) return;
      const done = $("mDone").checked;
      const blk = $("mBWrap").hidden ? t.blk : ($("mB").value || null);
      w(store.update("tasks", id, { title: title, cat: $("mC").value, kind: kind, imp: imp, date: date, done: done, doneAt: done ? (t.doneAt || Date.now()) : null, blk: blk }));
      closeModal();
    });
    $("mNoDate").onclick = () => { $("mD").value = ""; };
    if (t.date) blocksOn(t.date).then((bl) => {
      if (!$("mB") || !bl.length) return;
      $("mB").innerHTML = opt("", "Otomatik (adından bul)", t.blk || "") + opt("-", "Hiçbir derse bağlama", t.blk || "") +
        bl.map((b) => opt(b.id, GD.fmtMin(b.s) + "–" + GD.fmtMin(b.e) + " · " + b.t + (b.loc ? " · " + b.loc : ""), t.blk || "")).join("");
      $("mBWrap").hidden = false;
    });
    armed($("mDel"), () => { closeModal(); delTask(id); });
  }

  /* ---------- rutinler ---------- */
  function addHabit() {
    const n = $("hTitle").value.trim();
    if (!n) { $("hTitle").focus(); return; }
    if (!guard()) return;
    const order = habits.reduce((m, h) => Math.max(m, h.order || 0), 0) + 1;
    w(store.set("habits", uid(), { name: n, target: +$("hTarget").value, order: order, createdAt: Date.now() }));
    $("hTitle").value = ""; $("hTarget").value = "7";
  }
  function toggleHabit(id, k) {
    k = k || sel;
    if (!GD.isKey(k) || k > TODAY || !guard()) return;
    const cur = Object.assign({}, logs[k] || {});
    if (cur[id]) delete cur[id]; else cur[id] = true;
    logs = Object.assign({}, logs); logs[k] = cur;
    renderHabits(); renderHead();
    if (view !== "day") renderRange();
    w(store.set("habitlog", k, { date: k, done: cur }));
  }
  function openHabitModal(id) {
    const h = habits.find((x) => x.id === id); if (!h) return;
    const tg = h.target && h.target < 7 ? h.target : 7;
    let opts = "";
    for (let i = 7; i >= 1; i--) opts += '<option value="' + i + '"' + (i === tg ? " selected" : "") + ">" + (i === 7 ? "Her gün" : "Haftada " + i) + "</option>";
    const p = GD.habitProgress(logs, h, sel);
    const info = p.mode === "daily" ? (p.streak ? p.streak + " gündür kesintisiz." : "Seri henüz başlamadı.") : "Bu hafta " + p.count + "/" + p.target + (p.weeks ? " · " + p.weeks + " haftadır hedefi tutturuyorsun." : ".");
    const body =
      '<label class="field"><span>Rutin</span><input type="text" id="mT" maxlength="40" value="' + esc(h.name) + '" autocomplete="off"></label>' +
      '<label class="field"><span>Sıklık</span><select id="mF">' + opts + "</select></label>" +
      '<p class="info">' + info + " Haftada birkaç gün yapılan rutinlerde seri yerine haftalık hedef sayılır.</p>";
    const footer = '<button type="submit" class="btn">Kaydet</button><span class="sp"></span><button type="button" class="btn-danger" id="mDel">Rutini sil</button>';
    openModal("Rutini düzenle", body, footer, () => {
      const n = $("mT").value.trim();
      if (!n) { mErr("İsim boş olamaz."); return; }
      if (!guard()) return;
      w(store.update("habits", id, { name: n, target: +$("mF").value }));
      closeModal();
    });
    armed($("mDel"), () => {
      if (!guard()) return;
      const raw = Object.assign({}, h); delete raw.id;
      w(store.del("habits", id)); closeModal();
      toast("Rutin silindi", () => w(store.set("habits", id, raw)));
    });
  }

  /* ---------- yedek ---------- */
  async function exportData() {
    try {
      const data = await store.dump();
      const json = JSON.stringify({ app: "planner", version: 1, exportedAt: new Date().toISOString(), data: data }, null, 2);
      const name = "planner-yedek-" + TODAY + ".json";
      if (store.mode === "cloud") {
        const dl = await window.claude.use("downloads");
        if (!dl) { banner("Bu görünümde dosya indirilemiyor."); return; }
        try { await dl.save({ filename: name, data: json }); toast("Yedek indirildi"); }
        catch (e) { if (e && e.code !== "declined") banner("Yedek indirilemedi."); }
      } else {
        /* iPhone / iPad: "Save to Files" through the share sheet */
        const file = typeof File === "function" ? new File([json], name, { type: "application/json" }) : null;
        if (file && navigator.canShare && matchMedia("(hover:none)").matches && navigator.canShare({ files: [file] })) {
          try { await navigator.share({ files: [file] }); } catch (e) { /* cancelled */ }
          return;
        }
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
        a.download = name; document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        toast("Yedek indirildi");
      }
    } catch (e) { banner("Yedek hazırlanamadı."); }
  }
  function importFile(file) {
    const rd = new FileReader();
    rd.onload = () => {
      let data;
      try { data = GD.normalizeBackup(JSON.parse(rd.result)); }
      catch (e) { banner(e && e.message && !/JSON/.test(e.message) ? e.message : "Dosya okunamadı: geçerli bir Planner yedeği değil."); return; }
      const n = Object.keys(data).reduce((s, c) => s + Object.keys(data[c]).length, 0);
      openModal("Yedeği yükle", '<p class="info">' + n + " kayıt yüklenecek. Aynı kayıtlar yedektekiyle değişir, diğerleri olduğu gibi kalır.</p>",
        '<button type="submit" class="btn">Yükle</button><button type="button" class="btn-ghost" data-close>Vazgeç</button>', () => {
          if (!guard()) return;
          closeModal();
          banner("Yükleniyor… (" + n + " kayıt)", true);
          store.bulk(data).then((cnt) => { $("banner").hidden = true; toast(cnt + " kayıt yüklendi"); }, onErr);
        });
    };
    rd.readAsText(file);
  }

  /* ---------- theme preference (per device) ---------- */
  function themePref() {
    try { const t = localStorage.getItem("gunDefteri.theme"); return t === "light" || t === "dark" ? t : "system"; } catch (e) { return "system"; }
  }
  function setThemePref(p) {
    const root = document.documentElement;
    if (p === "light" || p === "dark") { root.setAttribute("data-theme", p); try { localStorage.setItem("gunDefteri.theme", p); } catch (e) { /* none */ } }
    else { root.removeAttribute("data-theme"); try { localStorage.removeItem("gunDefteri.theme"); } catch (e) { /* none */ } }
  }

  /* ---------- apply settings ---------- */
  let selectsFilled = false, lastDefCat = null;
  function fillSelects() {
    const defChanged = lastDefCat !== cfg.defaultCat;
    lastDefCat = cfg.defaultCat;
    const pickCat = (v) => (selectsFilled && !defChanged && cfg.cats.some((c) => c.id === v) ? v : cfg.defaultCat);
    const bc = pickCat($("bCat").value), tc = pickCat($("tCat").value), tk = $("tKind").value;
    $("bCat").innerHTML = catOptions(bc);
    $("tCat").innerHTML = catOptions(tc);
    $("tKind").innerHTML = kindOptions(cfg.kinds.some((k) => k.id === tk) ? tk : "normal");
    selectsFilled = true;
  }
  function applyCfg() {
    GD.setDayRange(cfg.dayStart, cfg.dayEnd);
    const root = document.documentElement;
    root.style.setProperty("--hours", String(cfg.dayEnd - cfg.dayStart));
    if (cfg.accent === "violet") root.removeAttribute("data-accent"); else root.setAttribute("data-accent", cfg.accent);
    try { localStorage.setItem("gunDefteri.accent", cfg.accent); } catch (e) { /* none */ }
    fillSelects();
    renderAll();
  }

  /* ---------- ayarlar penceresi ---------- */
  let modeHtml = "bağlanıyor…", canExport = false;
  const ACCENT_HEX = { violet: "#5a4bd1", blue: "#2f6fdb", green: "#2f7d58", pink: "#c03d8a", orange: "#c2611a" };

  function openSettings(draft) {
    const d = JSON.parse(JSON.stringify(draft || cfg));
    let theme = themePref(), picker = null;
    const swBtn = (type, i, color) => '<button type="button" class="sw c-' + color + '" data-pick="' + type + '" data-i="' + i + '" title="Renk: ' + COLORNAME[color] + '" aria-label="Rengi değiştir (' + COLORNAME[color] + ')"></button>';
    const palette = (type, i, cur) => '<div class="palette">' + GD.COLORS.map((c) => '<button type="button" class="sw c-' + c + '" data-setcolor="' + type + '" data-i="' + i + '" data-c="' + c + '" aria-pressed="' + (c === cur) + '" title="' + COLORNAME[c] + '" aria-label="' + COLORNAME[c] + '"></button>').join("") + "</div>";
    const catRows = () => d.cats.map((c, i) =>
      '<div class="set-item">' + swBtn("cat", i, c.color) +
      '<input type="text" maxlength="24" value="' + esc(c.name) + '" data-name="cat" data-i="' + i + '" aria-label="Kategori adı">' +
      '<button type="button" class="x-del" data-del="cat" data-i="' + i + '" aria-label="Kategoriyi sil"' + (d.cats.length <= 1 ? " disabled" : "") + ">×</button></div>" +
      (picker && picker.type === "cat" && picker.i === i ? palette("cat", i, c.color) : "")).join("");
    const kindRows = () => d.kinds.map((k, i) => {
      const base = k.id === "normal";
      return '<div class="set-item">' + swBtn("kind", i, k.color) +
        '<input type="text" maxlength="24" value="' + esc(k.name) + '" data-name="kind" data-i="' + i + '" aria-label="Tür adı">' +
        '<label class="check small" title="' + (base ? "Bütün görevler Yaklaşanlar'da ve takvimde görünür" : "Yaklaşanlarda ve takvimde göster") + '"><input type="checkbox" data-key="' + i + '"' + (k.key ? " checked" : "") + "> Öne çıkar</label>" +
        (base ? '<span class="x-del ph" title="Temel tür silinemez"></span>' : '<button type="button" class="x-del" data-del="kind" data-i="' + i + '" aria-label="Türü sil">×</button>') + "</div>" +
        (picker && picker.type === "kind" && picker.i === i ? palette("kind", i, k.color) : "");
    }).join("");
    const defCatOpts = () => d.cats.map((c) => opt(c.id, c.name, d.defaultCat)).join("");
    let startOpts = "", endOpts = "";
    for (let h = 0; h <= 12; h++) startOpts += opt(String(h), GD.pad(h) + ":00", String(d.dayStart));
    for (let h = 14; h <= 24; h++) endOpts += opt(String(h), GD.pad(h) + ":00", String(d.dayEnd));
    const upcOpts = GD.UPC_DAYS.map((n) => opt(String(n), n + " gün", String(d.upcomingDays))).join("");
    const focOpts = GD.FOCUS_OPTS.map((n) => opt(String(n), n + " dk odak", String(d.focusMins))).join("");
    const brkOpts = GD.BREAK_OPTS.map((n) => opt(String(n), n + " dk mola", String(d.breakMins))).join("");
    const themeOpts = [["system", "Cihaza göre"], ["light", "Açık"], ["dark", "Koyu"]].map((x) => '<button type="button" class="opt" data-theme-opt="' + x[0] + '" aria-pressed="' + (theme === x[0]) + '">' + x[1] + "</button>").join("");
    const accOpts = GD.ACCENTS.map((a) => '<button type="button" class="sw acc" data-acc="' + a + '" style="background:' + ACCENT_HEX[a] + '" aria-pressed="' + (d.accent === a) + '" title="' + ACCENTNAME[a] + '" aria-label="' + ACCENTNAME[a] + '"></button>').join("");

    const body =
      '<section class="set-sec"><h3>Görünüm</h3>' +
        '<div class="set-row"><span class="set-l">Tema</span><div class="opts" id="sTheme">' + themeOpts + "</div></div>" +
        '<div class="set-row"><span class="set-l">Ana renk</span><div class="sws" id="sAcc">' + accOpts + "</div></div>" +
        '<div class="set-row"><span class="set-l">Saat çizelgesi</span><select id="sStart" aria-label="Başlangıç saati">' + startOpts + '</select><span class="dash">–</span><select id="sEnd" aria-label="Bitiş saati">' + endOpts + "</select></div>" +
        '<div class="set-row"><span class="set-l">Yaklaşanlar</span><select id="sUpc" aria-label="Yaklaşanlar süresi">' + upcOpts + "</select></div>" +
        '<div class="set-row"><span class="set-l">Odak sayacı</span><select id="sFoc" aria-label="Odak süresi">' + focOpts + '</select><select id="sBrk" aria-label="Mola süresi">' + brkOpts + "</select></div>" +
      "</section>" +
      '<section class="set-sec"><h3>Kategoriler</h3><p class="set-hint">Görev ve blokların ayrıldığı gruplar. Renk kutusuna tıklayıp rengi değiştir. Silinen kategorideki kayıtlar “Diğer” altında görünmeye devam eder.</p>' +
        '<div class="set-list" id="sCats">' + catRows() + "</div>" +
        '<div class="set-row"><button type="button" class="linkbtn" id="sCatAdd">+ Kategori ekle</button><span class="sp"></span><span class="set-l" title="Hızlı eklemede #kategori yazmazsan ve yeni blok/görev açtığında seçili gelen kategori">Yeni kayıtlarda</span><select id="sDefCat" aria-label="Yeni kayıtlarda seçili gelen kategori">' + defCatOpts() + "</select></div>" +
        '<p class="set-hint">“Yeni kayıtlarda” seçtiğin kategori, yeni blok ve görev açtığında seçili gelir. Hızlı eklemede #kategori yazmazsan da bu kullanılır.</p>' +
      "</section>" +
      '<section class="set-sec"><h3>Görev türleri</h3><p class="set-hint">“Öne çıkar” işaretli türler (sınav, teslim gibi) Yaklaşanlar listesinde, haftalık ve aylık takvimde görünür; bunlara tarih vermek gerekir. Bütün türü değil de tek bir görevi öne çıkarmak için görev listesindeki ★ düğmesini kullan.</p>' +
        '<div class="set-list" id="sKinds">' + kindRows() + "</div>" +
        '<div class="set-row"><button type="button" class="linkbtn" id="sKindAdd">+ Tür ekle</button></div>' +
      "</section>" +
      '<section class="set-sec"><h3>Kayıt</h3><p class="set-hint">' + modeHtml + "</p>" +
        '<div class="set-row">' + (canExport ? '<button type="button" class="btn-ghost" id="sExport">Yedek indir</button>' : "") +
        '<label class="btn-ghost filebtn">Yedek yükle<input type="file" id="sImport" accept="application/json,.json" hidden></label>' +
        (store && store.signOut ? '<span class="sp"></span><button type="button" class="btn-ghost" id="sSignOut">Çıkış yap</button>' : "") + "</div>" +
      "</section>" +
      '<section class="set-sec about"><h3>Hakkında</h3>' +
        '<div class="about-row">' + document.querySelector(".brand .logo").outerHTML + '<div><b>Planner</b><br><span>Hasan Akkaya · <a href="https://github.com/hasanakkaya0" target="_blank" rel="noopener">GitHub</a> · <a href="https://www.linkedin.com/in/hasanakkaya0" target="_blank" rel="noopener">LinkedIn</a></span></div></div>' +
        '<p class="set-hint">Kısayollar: / hızlı ekle · G / H / A gün-hafta-ay · ← → önceki/sonraki · T bugün · N görev · B blok · O odak · K tema · , ayarlar</p>' +
      "</section>";
    const footer = '<button type="submit" class="btn">Kaydet</button><button type="button" class="btn-ghost" data-close>Vazgeç</button><span class="sp"></span><button type="button" class="btn-ghost" id="sReset" title="Kategoriler, türler ve görünüm varsayılana döner (kayıtlar silinmez)">Varsayılanlar</button>';

    openModal("Ayarlar", body, footer, () => {
      const empty = d.cats.concat(d.kinds).some((x) => !String(x.name || "").trim());
      if (empty) { mErr("Boş isim bırakma."); return; }
      if (d.dayEnd - d.dayStart < 6) { mErr("Saat çizelgesi en az 6 saat olmalı."); return; }
      if (!guard()) return;
      setThemePref(theme);
      const clean = GD.normalizeSettings(d);
      w(store.set("settings", "main", Object.assign({}, clean, { updatedAt: Date.now() })));
      cfg = clean; closeModal(); applyCfg();
      toast("Ayarlar kaydedildi");
    }, true);

    const M = $("modal");
    const redrawCats = () => { $("sCats").innerHTML = catRows(); $("sDefCat").innerHTML = defCatOpts(); };
    const redrawKinds = () => { $("sKinds").innerHTML = kindRows(); };
    const nextColor = (list) => GD.COLORS.find((c) => !list.some((x) => x.color === c)) || "slate";
    M.oninput = (e) => {
      const t = e.target;
      if (t.dataset.name === "cat") { d.cats[+t.dataset.i].name = t.value; $("sDefCat").innerHTML = defCatOpts(); }
      else if (t.dataset.name === "kind") d.kinds[+t.dataset.i].name = t.value;
    };
    M.onchange = (e) => {
      const t = e.target;
      if (t.dataset.key != null) d.kinds[+t.dataset.key].key = t.checked;
      else if (t.id === "sStart") d.dayStart = +t.value;
      else if (t.id === "sEnd") d.dayEnd = +t.value;
      else if (t.id === "sUpc") d.upcomingDays = +t.value;
      else if (t.id === "sFoc") d.focusMins = +t.value;
      else if (t.id === "sBrk") d.breakMins = +t.value;
      else if (t.id === "sDefCat") d.defaultCat = t.value;
      else if (t.id === "sImport" && t.files && t.files[0]) { importFile(t.files[0]); t.value = ""; }
    };
    M.onclick = (e) => {
      let x;
      if ((x = e.target.closest("[data-theme-opt]"))) {
        theme = x.dataset.themeOpt;
        M.querySelectorAll("[data-theme-opt]").forEach((b) => b.setAttribute("aria-pressed", String(b === x)));
      } else if ((x = e.target.closest("[data-acc]"))) {
        d.accent = x.dataset.acc;
        M.querySelectorAll("[data-acc]").forEach((b) => b.setAttribute("aria-pressed", String(b === x)));
      } else if ((x = e.target.closest("[data-pick]"))) {
        const p = { type: x.dataset.pick, i: +x.dataset.i };
        picker = picker && picker.type === p.type && picker.i === p.i ? null : p;
        redrawCats(); redrawKinds();
      } else if ((x = e.target.closest("[data-setcolor]"))) {
        (x.dataset.setcolor === "cat" ? d.cats : d.kinds)[+x.dataset.i].color = x.dataset.c;
        picker = null; redrawCats(); redrawKinds();
      } else if ((x = e.target.closest("[data-del]"))) {
        const i = +x.dataset.i;
        if (x.dataset.del === "cat") {
          if (d.cats.length <= 1) return;
          const gone = d.cats.splice(i, 1)[0];
          if (d.defaultCat === gone.id) d.defaultCat = d.cats[0].id;
        } else d.kinds.splice(i, 1);
        picker = null; redrawCats(); redrawKinds();
      } else if (e.target.closest("#sCatAdd")) {
        if (d.cats.length >= 10) { mErr("En fazla 10 kategori."); return; }
        d.cats.push({ id: "c_" + uid(), name: "Yeni kategori", color: nextColor(d.cats) });
        redrawCats();
        const ins = $("sCats").querySelectorAll("input"); const last = ins[ins.length - 1]; last.focus(); last.select();
      } else if (e.target.closest("#sKindAdd")) {
        if (d.kinds.length >= 10) { mErr("En fazla 10 tür."); return; }
        d.kinds.push({ id: "k_" + uid(), name: "Yeni tür", color: nextColor(d.kinds), key: true });
        redrawKinds();
        const ins = $("sKinds").querySelectorAll("input[type=text]"); const last = ins[ins.length - 1]; last.focus(); last.select();
      } else if (e.target.closest("#sSignOut")) {
        closeModal(); store.signOut().then(() => location.reload());
      } else if (e.target.closest("#sExport")) {
        exportData();
      } else if (e.target.closest("#sReset")) {
        const keepAccentTheme = GD.normalizeSettings(null);
        closeModal(); openSettings(keepAccentTheme);
        mErr("Varsayılanlar yüklendi; kaydedersen uygulanır.");
      }
    };
    modalOnClose = () => { M.oninput = M.onchange = M.onclick = null; };
    const first = $("modal").querySelector(".body");
    if (first) first.scrollTop = 0;
  }


  /* all blocks of a day (one-off + weekly), reading them if needed */
  async function blocksOn(k) {
    if (k === sel && dayLoaded) return currentBlocks();
    const base = rangeDays[k] || (store ? await store.getDoc("days", k) : null);
    return GD.blocksForDay(base, recurring, k);
  }
  /* ---------- change a day's blocks (reads it first if not loaded) ---------- */
  async function mutateDay(k, fn) {
    let base;
    if (k === sel && dayLoaded) base = dayDoc;
    else if (rangeDays[k]) base = rangeDays[k];
    else base = await store.getDoc("days", k);
    const doc = {
      blocks: ((base && base.blocks) || []).map((b) => ({ id: b.id, s: b.s, e: b.e, t: b.t, c: b.c, loc: b.loc || "" })),
      note: base && typeof base.note === "string" ? base.note : "",
      skip: base && Array.isArray(base.skip) ? base.skip.slice() : []
    };
    fn(doc);
    if (k === sel) {
      if (pendingNote && pendingNote.k === k) doc.note = pendingNote.text;
      dayDoc = doc; renderHead(); renderTL();
    }
    return saveDay(k, doc);
  }
  const fmtDayShort = (k) => {
    if (k === TODAY) return "bugün";
    if (k === GD.addDays(TODAY, 1)) return "yarın";
    const d = GD.parseKey(k); return d.getDate() + " " + GD.AY[d.getMonth()].slice(0, 3) + " " + GD.GUNK[d.getDay()];
  };

  /* ---------- quick add ---------- */
  const qaParse = () => GD.parseQuick($("qa").value, TODAY, sel, cfg.cats, cfg.kinds);
  function renderQaPreview() {
    const box = $("qaPrev");
    if (!$("qa").value.trim()) { box.hidden = true; return; }
    const r = qaParse();
    let html;
    if (!r.ok) html = r.error ? '<span class="qa-err">' + esc(r.error) + "</span>" : '<span class="qa-dim">yazmaya devam et…</span>';
    else {
      const type = { block: "Blok", task: "Görev", both: "Görev + blok", recurring: "Haftalık blok" }[r.type];
      const c = catOf(r.cat || cfg.defaultCat);
      const parts = ["<b>" + type + "</b>", '<span class="qa-t">' + esc(r.title) + "</span>",
        r.type === "recurring" ? "her " + r.dow.map((d) => GD.ISO_KISA[d]).join(", ") : fmtDayShort(r.date)];
      if (r.s != null) parts.push(GD.fmtMin(r.s) + "–" + GD.fmtMin(r.e));
      if (r.loc) parts.push("@" + esc(r.loc));
      parts.push('<span class="swatch c-' + c.color + '"></span>' + esc(c.name));
      if (r.kind && r.kind !== "normal") parts.push(kindPill({ kind: r.kind }));
      html = parts.join('<span class="qa-sep">·</span>') + '<kbd class="qa-hint">Enter</kbd>';
      if (r.warnings.length) html += '<div class="qa-warn">' + esc(r.warnings.join(" · ")) + "</div>";
    }
    html += '<div class="qa-help">yarın 14:00-15:30 · cuma · haftaya pzt · 5 kasım · her pzt çar · 90dk · #kategori · !tür · @yer</div>';
    box.innerHTML = html; box.hidden = false;
  }
  async function qaCommit() {
    const r = qaParse();
    if (!r.ok) { renderQaPreview(); return; }
    if (!guard()) return;
    if (r.s != null) { const err = GD.blockError(r.s, r.e, r.title); if (err) { banner(err); return; } }
    const cat = r.cat || cfg.defaultCat, undo = [];
    try {
      if (r.type === "recurring") {
        const id = uid();
        await store.set("recurring", id, { t: r.title, c: cat, loc: r.loc, s: r.s, e: r.e, dow: r.dow, from: GD.weekStart(sel), until: null, createdAt: Date.now() });
        undo.push(() => store.del("recurring", id));
      }
      if (r.type === "task" || r.type === "both") {
        const id = uid();
        await store.set("tasks", id, { title: r.title, cat: cat, kind: r.kind || "normal", date: r.date, done: false, createdAt: Date.now() });
        undo.push(() => store.del("tasks", id));
      }
      if (r.type === "block" || r.type === "both") {
        const bid = uid(), k = r.date;
        await mutateDay(k, (d) => { d.blocks.push({ id: bid, s: r.s, e: r.e, t: r.title, c: cat, loc: r.loc }); });
        undo.push(() => mutateDay(k, (d) => { d.blocks = d.blocks.filter((b) => b.id !== bid); }));
      }
    } catch (e) { onErr(e); return; }
    $("qa").value = ""; renderQaPreview();
    const where = r.type === "recurring" ? "her " + r.dow.map((d) => GD.ISO_KISA[d]).join(", ") : fmtDayShort(r.date);
    toast("Eklendi: " + r.title.slice(0, 40) + " · " + where, () => undo.reduce((p, f) => p.then(f), Promise.resolve()).catch(onErr));
  }
  $("qa").addEventListener("input", renderQaPreview);
  $("qa").addEventListener("focus", renderQaPreview);
  $("qa").addEventListener("blur", () => setTimeout(() => { $("qaPrev").hidden = true; }, 150));
  $("qa").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); qaCommit(); }
    else if (e.key === "Escape") { $("qa").value = ""; $("qaPrev").hidden = true; $("qa").blur(); }
  });

  /* ---------- drag & drop: move, resize, drag to create ---------- */
  const snapTo = (m, st) => Math.round(m / st) * st;
  function geom(mode) {
    if (mode === "day") { const L = $("tl").querySelector(".blocks"); return { hh: dayHH, cols: [{ k: sel, el: L, r: L.getBoundingClientRect() }] }; }
    return { hh: weekHH, cols: Array.from($("wkGrid").querySelectorAll(".wk-col")).map((el, i) => ({ k: weekDaysCache[i], el: el, r: el.getBoundingClientRect() })) };
  }
  const minAt = (g, col, y) => GD.DAY_START * 60 + (y - col.r.top) / g.hh * 60;
  function srcBlock(k, id, rec) {
    if (rec) return recurring.find((x) => x.id === id);
    const d = k === sel && dayLoaded ? dayDoc : rangeDays[k];
    return d && (d.blocks || []).find((x) => x.id === id);
  }
  function onDown(e, mode) {
    if (e.button !== 0 || e.pointerType === "touch" || !store || !writable) return;
    const g = geom(mode);
    const ci = g.cols.findIndex((c) => e.clientX >= c.r.left && e.clientX <= c.r.right);
    if (ci < 0) return;
    const bEl = e.target.closest(".blk,.wblk");
    if (bEl) {
      const k = bEl.dataset.day || sel, rec = bEl.dataset.rec === "1", b = srcBlock(k, bEl.dataset.blk, rec);
      if (!b) return;
      drag = { mode: mode, g: g, kind: e.target.closest(".rsz") ? "resize" : "move", el: bEl, k: k, nk: k, ci: ci, id: bEl.dataset.blk, rec: rec, s0: b.s, e0: b.e, ns: b.s, ne: b.e, x0: e.clientX, y0: e.clientY, moved: false };
    } else if (e.target.closest(".slot,.wslot")) {
      const a = Math.floor(minAt(g, g.cols[ci], e.clientY) / 15) * 15;
      drag = { mode: mode, g: g, kind: "create", k: g.cols[ci].k, ci: ci, a: a, ns: a, ne: a + 60, x0: e.clientX, y0: e.clientY, moved: false, ghost: null };
    } else return;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }
  function onMove(e) {
    const d = drag; if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;
    if (!d.moved) { d.moved = true; document.body.classList.add("dragging"); if (d.el) d.el.classList.add("drag"); }
    e.preventDefault();
    const lo = GD.DAY_START * 60, hi = GD.DAY_END * 60, hh = d.g.hh;
    if (d.kind === "move") {
      const dur = d.e0 - d.s0;
      d.ns = Math.max(lo, Math.min(hi - dur, d.s0 + snapTo((e.clientY - d.y0) / hh * 60, 5)));
      d.ne = d.ns + dur;
      if (d.mode === "week" && !d.rec) {
        const ci = d.g.cols.findIndex((c) => e.clientX >= c.r.left && e.clientX <= c.r.right);
        if (ci >= 0 && ci !== d.ci) { d.ci = ci; d.nk = d.g.cols[ci].k; d.g.cols[ci].el.appendChild(d.el); d.el.style.left = "2px"; d.el.style.width = "calc(100% - 4px)"; }
      }
      d.el.style.top = ((d.ns - lo) / 60 * hh) + "px";
    } else if (d.kind === "resize") {
      d.ne = Math.max(d.s0 + 10, Math.min(hi, d.e0 + snapTo((e.clientY - d.y0) / hh * 60, 5)));
      d.el.style.height = Math.max((d.ne - d.s0) / 60 * hh - 3, 16) + "px";
    } else {
      const col = d.g.cols[d.ci], m = Math.max(lo, Math.min(hi, snapTo(minAt(d.g, col, e.clientY), 15)));
      if (m >= d.a) { d.ns = d.a; d.ne = Math.max(m, d.a + 15); } else { d.ns = m; d.ne = d.a + 15; }
      if (!d.ghost) { d.ghost = document.createElement("div"); d.ghost.className = "ghost"; col.el.appendChild(d.ghost); }
      d.ghost.style.top = ((d.ns - lo) / 60 * hh) + "px";
      d.ghost.style.height = Math.max((d.ne - d.ns) / 60 * hh - 2, 16) + "px";
      d.ghost.textContent = GD.fmtMin(d.ns) + "–" + GD.fmtMin(d.ne);
    }
    if (d.el) {
      const bh = d.el.querySelector(".bh"), bi = d.el.querySelector(".bh-in");
      if (bh) bh.firstChild.textContent = GD.fmtMin(d.ns) + "–" + GD.fmtMin(d.ne);
      if (bi) bi.textContent = GD.fmtMin(d.ns);
    }
  }
  function onUp() {
    window.removeEventListener("pointermove", onMove);
    const d = drag; drag = null;
    document.body.classList.remove("dragging");
    if (!d || !d.moved) return;
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
    if (d.ghost) d.ghost.remove();
    if (d.kind === "create") {
      const o = { s: d.ns, e: Math.min(d.ne, GD.DAY_END * 60) };
      if (d.mode === "day") openBlockModal(o); else openFromRange(d.k, o);
      return;
    }
    if (d.ns === d.s0 && d.ne === d.e0 && d.nk === d.k) { renderAll(); return; }
    commitDrag(d);
  }
  function commitDrag(d) {
    if (!guard()) { renderAll(); return; }
    const label = GD.fmtMin(d.ns) + "–" + GD.fmtMin(d.ne);
    if (d.rec) {
      const old = { s: d.s0, e: d.e0 };
      w(store.update("recurring", d.id, { s: d.ns, e: d.ne }));
      toast("Haftalık blok tüm haftalarda " + label, () => w(store.update("recurring", d.id, old)));
      return;
    }
    const b = srcBlock(d.k, d.id, false);
    if (!b) { renderAll(); return; }
    const setTime = (s0, e0) => (doc) => { doc.blocks = doc.blocks.map((x) => (x.id === d.id ? Object.assign({}, x, { s: s0, e: e0 }) : x)); };
    if (d.nk === d.k) {
      mutateDay(d.k, setTime(d.ns, d.ne));
      toast("“" + b.t.slice(0, 30) + "” " + label, () => mutateDay(d.k, setTime(d.s0, d.e0)));
    } else {
      const moved = { id: b.id, t: b.t, c: b.c, loc: b.loc || "", s: d.ns, e: d.ne }, orig = Object.assign({}, b);
      mutateDay(d.k, (doc) => { doc.blocks = doc.blocks.filter((x) => x.id !== d.id); })
        .then(() => mutateDay(d.nk, (doc) => { doc.blocks.push(moved); }));
      toast("“" + b.t.slice(0, 30) + "” → " + fmtDayShort(d.nk) + " " + label, () =>
        mutateDay(d.nk, (doc) => { doc.blocks = doc.blocks.filter((x) => x.id !== d.id); })
          .then(() => mutateDay(d.k, (doc) => { doc.blocks.push(orig); })));
    }
  }
  $("tl").addEventListener("pointerdown", (e) => onDown(e, "day"));
  $("wkGrid").addEventListener("pointerdown", (e) => onDown(e, "week"));
  document.addEventListener("click", (e) => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false; } }, true);

  /* ---------- drag a task onto the timeline ---------- */
  let dropGhost = null;
  const clearDropGhost = () => { if (dropGhost) { dropGhost.remove(); dropGhost = null; } };
  $("taskList").addEventListener("dragstart", (e) => {
    const li = e.target.closest("li.task[data-tid]"); if (!li) return;
    e.dataTransfer.setData("text/plain", "planner-task:" + li.dataset.tid);
    e.dataTransfer.effectAllowed = "copy";
    document.body.classList.add("dragging-task");
  });
  $("taskList").addEventListener("dragend", () => { document.body.classList.remove("dragging-task"); clearDropGhost(); });
  $("tl").addEventListener("dragover", (e) => {
    if (!document.body.classList.contains("dragging-task")) return;
    e.preventDefault(); e.dataTransfer.dropEffect = "copy";
    const g = geom("day"), col = g.cols[0];
    const exact = minAt(g, col, e.clientY);
    const over = currentBlocks().find((b) => exact >= b.s && exact < b.e);
    const m = Math.max(GD.DAY_START * 60, Math.min(GD.DAY_END * 60 - 60, Math.floor(exact / 15) * 15));
    if (!dropGhost) { dropGhost = document.createElement("div"); dropGhost.className = "ghost"; col.el.appendChild(dropGhost); }
    dropGhost.dataset.blk = over ? over.id : "";
    if (over) {
      dropGhost.style.top = ((over.s - GD.DAY_START * 60) / 60 * g.hh) + "px";
      dropGhost.style.height = Math.max((over.e - over.s) / 60 * g.hh - 3, 16) + "px";
      dropGhost.textContent = "“" + over.t + "” bloğuna ekle";
      dropGhost.classList.add("onblk");
      return;
    }
    dropGhost.classList.remove("onblk");
    dropGhost.style.top = ((m - GD.DAY_START * 60) / 60 * g.hh) + "px";
    dropGhost.style.height = Math.max(g.hh - 2, 16) + "px";
    dropGhost.textContent = GD.fmtMin(m) + "–" + GD.fmtMin(m + 60);
    dropGhost.dataset.m = m;
    dropGhost.style.top = ((m - GD.DAY_START * 60) / 60 * g.hh) + "px";
    dropGhost.style.height = Math.max(g.hh - 2, 16) + "px";
    dropGhost.textContent = GD.fmtMin(m) + "–" + GD.fmtMin(m + 60);
  });
  $("tl").addEventListener("dragleave", (e) => { if (!$("tl").contains(e.relatedTarget)) clearDropGhost(); });
  $("tl").addEventListener("drop", (e) => {
    const data = e.dataTransfer.getData("text/plain");
    if (!/^planner-task:/.test(data)) return;
    e.preventDefault();
    const m = dropGhost ? +dropGhost.dataset.m : null, onBlk = dropGhost ? dropGhost.dataset.blk : "";
    clearDropGhost(); document.body.classList.remove("dragging-task");
    if (!guardDay()) return;
    const t = findTask(data.slice(13)); if (!t) return;
    if (onBlk) {
      const b = currentBlocks().find((x) => x.id === onBlk); if (!b) return;
      const old = { blk: t.blk || null, date: t.date || null };
      w(store.update("tasks", t.id, { blk: b.id, date: sel }));
      toast("“" + t.title.slice(0, 30) + "” → " + b.t + " bloğuna eklendi", () => w(store.update("tasks", t.id, old)));
      return;
    }
    if (m == null || isNaN(m)) return;
    const bid = uid();
    mutateDay(sel, (doc) => { doc.blocks.push({ id: bid, s: m, e: m + 60, t: t.title, c: t.cat }); });
    toast("“" + t.title.slice(0, 30) + "” " + GD.fmtMin(m) + "–" + GD.fmtMin(m + 60) + " arasına yerleşti", () => mutateDay(sel, (doc) => { doc.blocks = doc.blocks.filter((x) => x.id !== bid); }));
  });

  /* ---------- focus timer ---------- */
  const FKEY = "gunDefteri.focus", BASE_TITLE = document.title || "Planner";
  function fSave() { try { if (focus) localStorage.setItem(FKEY, JSON.stringify(focus)); else localStorage.removeItem(FKEY); } catch (e) { /* none */ } }
  function ensureAudio() { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.resume) audioCtx.resume(); } catch (e) { audioCtx = null; } }
  function beep() {
    if (!audioCtx) return;
    try {
      const t0 = audioCtx.currentTime;
      [0, 0.28, 0.56].forEach((d, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.frequency.value = i === 2 ? 1046 : 880;
        g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.22, t0 + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.22);
        o.connect(g); g.connect(audioCtx.destination); o.start(t0 + d); o.stop(t0 + d + 0.25);
      });
    } catch (e) { /* no audio */ }
  }
  const fLeft = () => (!focus ? 0 : focus.paused != null ? focus.paused : Math.max(0, focus.endsAt - Date.now()));
  const fElapsed = () => focus.activeMs + (focus.paused == null ? Date.now() - focus.lastResume : 0);
  function logFocus(full) {
    if (!focus || focus.phase !== "focus") return 0;
    const ms = full ? focus.mins * 60000 : Math.min(fElapsed(), focus.mins * 60000);
    const mins = Math.round(ms / 60000);
    if (mins >= 1 && store && writable) {
      w(store.set("focus", uid(), { date: GD.key(new Date(focus.startedAt)), start: focus.startedAt, mins: mins, title: focus.title, cat: focus.cat, taskId: focus.taskId }));
    }
    return mins;
  }
  function startFocus(info) {
    ensureAudio();
    if (focus && focus.phase === "focus") logFocus(false);
    const now = Date.now(), mins = info.mins || cfg.focusMins;
    focus = { phase: "focus", title: info.title || "Serbest odak", cat: info.cat || null, taskId: info.taskId || null, mins: mins, startedAt: now, endsAt: now + mins * 60000, paused: null, activeMs: 0, lastResume: now };
    fSave(); runFocus(); renderFocus();
    toast("Odak başladı · " + mins + " dk");
  }
  function phaseEnd(quiet) {
    if (!quiet) beep();
    if (focus.phase === "focus") {
      const m = logFocus(true), brk = cfg.breakMins, now = Date.now();
      focus = Object.assign({}, focus, { phase: "break", mins: brk, startedAt: now, endsAt: now + brk * 60000, paused: null, activeMs: 0, lastResume: now });
      if (!quiet) toast("Odak bitti, " + m + " dk kaydedildi · " + brk + " dk mola");
    } else {
      focus = Object.assign({}, focus, { phase: "done", paused: 0 });
      if (!quiet) toast("Mola bitti");
    }
    fSave(); renderFocus();
  }
  function runFocus() {
    clearInterval(focusTick);
    focusTick = setInterval(() => {
      if (!focus) { clearInterval(focusTick); return; }
      if (focus.phase !== "done" && focus.paused == null && Date.now() >= focus.endsAt) phaseEnd();
      renderFocus();
    }, 1000);
  }
  function pauseFocus() {
    if (!focus || focus.phase === "done") return;
    const now = Date.now();
    if (focus.paused == null) { focus.activeMs += now - focus.lastResume; focus.paused = Math.max(0, focus.endsAt - now); }
    else { focus.endsAt = now + focus.paused; focus.paused = null; focus.lastResume = now; }
    fSave(); renderFocus();
  }
  function stopFocus() {
    if (!focus) return;
    const m = focus.phase === "focus" ? logFocus(false) : 0;
    focus = null; fSave(); clearInterval(focusTick); renderFocus();
    if (m) toast(m + " dk odak kaydedildi");
  }
  function renderFocusBtn() {
    const btn = $("focusBtn"), txt = $("focusBtnTxt");
    if (!focus) { btn.className = "focus-btn"; txt.textContent = "Odak"; btn.title = "Serbest odak (O)"; return; }
    const left = fLeft(), paused = focus.paused != null && focus.phase !== "done";
    btn.className = "focus-btn on ph-" + focus.phase + (paused ? " paused" : "");
    txt.textContent = focus.phase === "done" ? "Mola bitti" : GD.pad(Math.floor(left / 60000)) + ":" + GD.pad(Math.floor(left / 1000) % 60);
    btn.title = focus.phase === "done" ? "Yeni odak başlat" : (paused ? "Devam ettir" : "Duraklat") + " · " + focus.title;
  }
  function renderFocus() {
    const el = $("focus");
    renderFocusBtn();
    if (!focus) { el.hidden = true; document.title = BASE_TITLE; return; }
    const left = fLeft(), mm = Math.floor(left / 60000), ss = Math.floor(left / 1000) % 60;
    const pct = focus.phase === "done" ? 100 : Math.round((1 - left / (focus.mins * 60000)) * 100);
    const color = focus.cat ? catOf(focus.cat).color : "violet";
    const label = { focus: "Odak", break: "Mola", done: "Mola bitti" }[focus.phase];
    const paused = focus.paused != null && focus.phase !== "done";
    el.hidden = false;
    el.className = "focus c-" + color + " ph-" + focus.phase + (paused ? " paused" : "");
    const time = focus.phase === "done" ? "00:00" : GD.pad(mm) + ":" + GD.pad(ss);
    el.innerHTML = '<div class="f-top"><span class="f-ph">' + label + (paused ? " · duraklatıldı" : "") + '</span><span class="f-title">' + esc(focus.title) + "</span></div>" +
      '<div class="f-time">' + time + "</div>" +
      '<div class="f-bar"><b style="width:' + Math.max(0, Math.min(100, pct)) + '%"></b></div>' +
      '<div class="f-btns">' + (focus.phase === "done"
        ? '<button type="button" class="btn" data-f="again">Yeni odak</button><button type="button" class="btn-ghost" data-f="stop">Kapat</button>'
        : '<button type="button" class="btn-ghost" data-f="pause">' + (paused ? "Devam" : "Duraklat") + "</button>" +
          (focus.phase === "break" ? '<button type="button" class="btn-ghost" data-f="again">Molayı geç</button>' : "") +
          '<button type="button" class="btn-ghost" data-f="stop">' + (focus.phase === "focus" ? "Bitir" : "Kapat") + "</button>") + "</div>";
    document.title = focus.phase === "done" ? "Mola bitti — Planner" : time + " · " + label + " — Planner";
  }
  $("focus").addEventListener("click", (e) => {
    const b = e.target.closest("[data-f]"); if (!b || !focus) return;
    const a = b.dataset.f;
    if (a === "pause") pauseFocus();
    else if (a === "stop") stopFocus();
    else if (a === "again") { const f = focus; startFocus({ title: f.title, cat: f.cat, taskId: f.taskId }); }
  });
  /* focus button in the top bar: opens the free-focus popover when idle, pause/resume while running */
  let fpMins = 25;
  function openFocusPop() {
    fpMins = cfg.focusMins;
    $("fpMins").innerHTML = GD.FOCUS_OPTS.map((n) => '<button type="button" class="chip" data-m="' + n + '" aria-pressed="' + (n === fpMins) + '">' + n + "</button>").join("");
    $("fpCat").innerHTML = '<option value="">Kategorisiz</option>' + cfg.cats.map((c) => opt(c.id, c.name, "")).join("");
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
    if (!focus) { if ($("focusPop").hidden) openFocusPop(); else closeFocusPop(); }
    else if (focus.phase === "done") { const f = focus; startFocus({ title: f.title, cat: f.cat, taskId: f.taskId }); }
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
    try { const x = JSON.parse(localStorage.getItem(FKEY) || "null"); if (x && x.phase) focus = x; } catch (e) { focus = null; }
    if (!focus) return;
    let guardN = 0;
    while (focus && focus.phase !== "done" && focus.paused == null && Date.now() >= focus.endsAt && guardN++ < 3) {
      if (focus.phase === "focus" && !store) { setTimeout(fBoot, 800); return; }
      phaseEnd(true);
    }
    runFocus(); renderFocus();
  }

  /* ---------- olaylar ---------- */
  $("prev").onclick = () => nav(-1);
  $("next").onclick = () => nav(1);
  $("todayBtn").onclick = () => { TODAY = GD.key(new Date()); go(TODAY); };
  $("viewSeg").onclick = (e) => { const b = e.target.closest("[data-view]"); if (b) setView(b.dataset.view); };
  $("weekView").onclick = (e) => {
    let x;
    if ((x = e.target.closest(".wblk"))) return openFromRange(x.dataset.day, { id: x.dataset.blk, rec: x.dataset.rec === "1" });
    if ((x = e.target.closest(".wslot"))) { const h = +x.dataset.h; return openFromRange(x.dataset.day, { s: h * 60, e: Math.min((h + 1) * 60, 24 * 60) }); }
    if ((x = e.target.closest(".hcell"))) return toggleHabit(x.dataset.hab, x.dataset.day);
    if ((x = e.target.closest("[data-go]"))) { if (x.dataset.tab) setTab(x.dataset.tab); go(x.dataset.go); setView("day"); }
  };
  $("monthView").onclick = (e) => {
    const x = e.target.closest("[data-go]");
    if (x) { go(x.dataset.go); setView("day"); }
  };
  $("week").onclick = (e) => { const b = e.target.closest(".wd"); if (b) go(b.dataset.k); };

  function setTab(name) {
    document.body.dataset.tab = name;
    document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
    try { localStorage.setItem("gunDefteri.tab", name); } catch (e) { /* none */ }
  }
  document.querySelector(".tabs").onclick = (e) => { const b = e.target.closest(".tab"); if (b) setTab(b.dataset.tab); };

  $("bAdd").onclick = addBlockQuick;
  $("bTitle").onkeydown = (e) => { if (e.key === "Enter") addBlockQuick(); };
  $("bMore").onclick = () => openBlockModal({ s: GD.toMin($("bStart").value) || 540, e: GD.toMin($("bEnd").value) || 600, repeat: true });
  $("tl").onclick = (e) => {
    const b = e.target.closest("[data-blk]");
    if (b) { openBlockModal({ id: b.dataset.blk, rec: b.dataset.rec === "1" }); return; }
    const slot = e.target.closest(".slot");
    if (slot) { const h = +slot.dataset.h; openBlockModal({ s: h * 60, e: Math.min((h + 1) * 60, 24 * 60) }); }
  };

  $("tAdd").onclick = addTask;
  $("tTitle").onkeydown = (e) => { if (e.key === "Enter") addTask(); };
  $("taskList").onclick = (e) => {
    let x;
    if ((x = e.target.closest("[data-toggle]"))) return toggleTask(x.dataset.toggle);
    if ((x = e.target.closest("[data-star]"))) {
      const t = findTask(x.dataset.star); if (!t || !guard()) return;
      const ch = { imp: !t.imp }; if (!t.imp && !t.date) ch.date = sel;
      w(store.update("tasks", t.id, ch)); toast(t.imp ? "Öne çıkarma kaldırıldı" : "Öne çıkarıldı: Yaklaşanlar ve takvimde görünecek"); return;
    }
    if ((x = e.target.closest("[data-postpone]"))) return postpone(x.dataset.postpone);
    if ((x = e.target.closest("[data-focus-task]"))) { const t = findTask(x.dataset.focusTask); if (t) startFocus({ title: t.title, cat: t.cat, taskId: t.id }); return; }
    if ((x = e.target.closest("[data-del-task]"))) return delTask(x.dataset.delTask);
    if ((x = e.target.closest("[data-edit-task]"))) return openTaskModal(x.dataset.editTask);
  };
  $("overdueBar").onclick = (e) => { if (e.target.closest("#moveOverdue")) moveOverdue(); };
  $("upcList").onclick = (e) => { const b = e.target.closest("[data-go]"); if (b) go(b.dataset.go); };

  $("hAdd").onclick = addHabit;
  $("hTitle").onkeydown = (e) => { if (e.key === "Enter") addHabit(); };
  $("habitList").onclick = (e) => {
    let x;
    if ((x = e.target.closest("[data-habit]"))) return toggleHabit(x.dataset.habit);
    if ((x = e.target.closest("[data-edit-habit]"))) return openHabitModal(x.dataset.editHabit);
  };

  $("note").oninput = function () {
    pendingNote = { k: sel, text: this.value };
    $("noteSaved").textContent = "yazılıyor…";
    clearTimeout(noteTimer);
    noteTimer = setTimeout(flushNote, 800);
  };
  $("note").onblur = flushNote;
  window.addEventListener("pagehide", flushNote);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushNote(); });

  $("setBtn").onclick = () => openSettings();

  document.addEventListener("keydown", (e) => {
    if (modalOpen()) { if (e.key === "Escape") { e.preventDefault(); closeModal(); } return; }
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") { if (e.key === "Escape") e.target.blur(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLocaleLowerCase("tr");
    if (e.key === "ArrowLeft") { e.preventDefault(); nav(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); nav(1); }
    else if (key === "t") { TODAY = GD.key(new Date()); go(TODAY); }
    else if (key === "g") setView("day");
    else if (key === "h") setView("week");
    else if (key === "a") setView("month");
    else if (key === "k") toggleTheme();
    else if (e.key === "/") { e.preventDefault(); $("qa").focus(); }
    else if (key === "o") { e.preventDefault(); if (!focus) openFocusPop(); else if (focus.phase === "done") stopFocus(); else pauseFocus(); }
    else if (e.key === ",") openSettings();
    else if (key === "n") { e.preventDefault(); if (view !== "day") setView("day"); setTab("gorevler"); $("tTitle").focus(); }
    else if (key === "b") {
      e.preventDefault();
      if (view !== "day") setView("day");
      setTab("program");
      if (dayLoaded) openBlockModal({ s: GD.toMin($("bStart").value) || 540, e: GD.toMin($("bEnd").value) || 600 });
    }
  });

  /* redraw measurement-dependent views when the window is resized */
  let resizeT = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { applyFit(); if (view === "week") renderWeekView(); else if (view === "month") renderMonthView(); else renderTL(); }, 150);
  });

  /* midnight rollover and the "now" line */
  setInterval(() => {
    const nk = GD.key(new Date());
    if (nk !== TODAY) { const was = sel === TODAY; TODAY = nk; if (was) go(nk); else renderAll(); return; }
    if (modalOpen() || drag) return;
    if (view === "day" && sel === TODAY) renderTL();
    else if (view === "week" && GD.weekDays(sel).indexOf(TODAY) >= 0) renderWeekView();
  }, 60000);

  /* ---------- start ---------- */
  const SEED_HABITS = [["h_ders", "Ders tekrarı", 7], ["h_spor", "Spor", 3], ["h_kitap", "Kitap okuma", 7], ["h_erken", "Erken kalkma", 5]];

  function startSubs() {
    store.watchDoc("settings", "main", (d) => { cfg = GD.normalizeSettings(d); applyCfg(); }, onErr);
    store.watch("tasks", (rows) => {
      tasks = rows.map((o) => ({
        id: o.id, title: o.title || "", cat: typeof o.cat === "string" && o.cat ? o.cat : cfg.defaultCat,
        kind: typeof o.kind === "string" && o.kind ? o.kind : "normal",
        date: GD.isKey(o.date) ? o.date : null, done: !!o.done, imp: !!o.imp, doneAt: o.doneAt || null, createdAt: o.createdAt || 0,
        blk: typeof o.blk === "string" && o.blk ? o.blk : null
      }));
      renderHead(); renderWeek(); renderUpcoming(); renderTasks();
      if (view === "day" && !drag) renderTL();   /* quiz/exam badges on blocks depend on tasks */
      if (view !== "day") renderRange();
    }, onErr);
    store.watch("habits", (rows) => {
      habits = rows.map((o) => ({ id: o.id, name: o.name || "", order: o.order || 0, target: +o.target || 7 }))
        .sort((a, b) => a.order - b.order);
      renderHead(); renderHabits();
      if (view !== "day") renderRange();
    }, onErr);
    store.watch("focus", (rows) => {
      const byDay = {}, byTask = {};
      rows.forEach((r) => {
        const m = +r.mins || 0;
        if (GD.isKey(r.date)) byDay[r.date] = (byDay[r.date] || 0) + m;
        if (r.taskId) byTask[r.taskId] = (byTask[r.taskId] || 0) + m;
      });
      focusByDay = byDay; focusByTask = byTask;
      renderHead(); renderTasks();
      if (view !== "day") renderRange();
    }, onErr);
    store.watch("habitlog", (rows) => {
      const L = {};
      rows.forEach((o) => { L[GD.isKey(o.date) ? o.date : o.id] = o.done || {}; });
      logs = L; renderHead(); renderHabits();
      if (view !== "day") renderRange();
    }, onErr);
    store.watch("recurring", (rows) => {
      recurring = rows.filter((o) => Array.isArray(o.dow) && typeof o.s === "number" && typeof o.e === "number")
        .map((o) => ({ id: o.id, t: o.t || "", c: o.c || cfg.defaultCat, loc: o.loc || "", s: o.s, e: o.e, dow: o.dow, from: o.from || null, until: o.until || null }));
      renderHead(); renderTL();
      if (view !== "day") renderRange();
    }, onErr);
    subDay();
    subRange();
  }

  async function boot() {
    let tab = "program";
    try { tab = localStorage.getItem("gunDefteri.tab") || "program"; } catch (e) { /* none */ }
    setTab(["program", "gorevler", "rutinler"].indexOf(tab) >= 0 ? tab : "program");
    $("tDate").value = sel;
    let v = "day";
    try { v = localStorage.getItem("gunDefteri.view") || "day"; } catch (e) { /* none */ }
    applyFit();
    setView(v);
    fBoot();

    store = await window.GDStore.create();
    if (store.mode === "cloud") {
      modeHtml = "<b>Bulutta</b> · bu linki hangi cihazda açarsan aynı veriyi görürsün";
      try {
        const u = await window.claude.use("user");
        const can = u ? await u.can("data.write") : null;
        if (can === false) { writable = false; banner("Görüntüleme modundasın; değişiklik kaydedilmez.", true); }
      } catch (e) { /* unknown: try writing */ }
      window.claude.use("downloads").then((d) => { canExport = !!d; }).catch(() => {});
    } else if (store.mode === "firebase") {
      modeHtml = "<b>Senkron</b> · " + esc(store.user.email) + " · telefon ve bilgisayar aynı veriyi görür; internet yokken de çalışır";
      canExport = true;
    } else {
      modeHtml = store.fallback
        ? "<b>Bu tarayıcıda</b> · bulut bağlantısı kurulamadı"
        : "<b>Bu tarayıcıda</b> · veriler bu tarayıcıda durur; ayda bir yedek indir";
      if (!store.persistent) banner("Tarayıcı kayda izin vermiyor (gizli pencere?). Kapatınca veriler gider.", true);
      canExport = true;
      let seeded = false;
      try { seeded = !!localStorage.getItem("gunDefteri.seeded"); localStorage.setItem("gunDefteri.seeded", "1"); } catch (e) { seeded = true; }
      if (!seeded && store.isEmpty()) {
        SEED_HABITS.forEach((h, i) => store.set("habits", h[0], { name: h[1], target: h[2], order: i + 1, createdAt: Date.now() + i }));
      }
    }
    startSubs();
    if (focus) renderFocus();
  }
  boot().catch(() => { modeHtml = "Kayıt bağlantısı kurulamadı. Sayfayı yenile."; banner(modeHtml, true); });
})();
