/* Planner — UI: day view: header, week strip, timeline, upcoming list, day document, blocks, day mutations.
   Shared mutable state lives on S and shared functions on App (both created in app-state.js). */
(function () {
  "use strict";
  /* ---------- rendering ---------- */
  function rangeStats(days) {
    let total = 0, done = 0, key = 0, mins = 0, fmin = 0;
    const kk = App.keyKinds();
    days.forEach((k) => {
      const s = GD.daySummary(S.rangeDays[k] || null, S.recurring, App.allTasks(), k, kk);
      total += s.open + s.done; done += s.done; key += s.key.filter((t) => !t.done).length; mins += s.mins; fmin += S.focusByDay[k] || 0;
    });
    return { total: total, done: done, key: key, mins: mins, fmin: fmin };
  }
  function statLine(s) {
    return "görev <b>" + s.done + "/" + s.total + "</b> · " + esc(App.keyLabel()) + " <b>" + s.key + "</b> · plan <b>" + (s.mins ? GD.durText(s.mins) : "–") + "</b>" + (s.fmin ? " · odak <b>" + GD.durText(s.fmin) + "</b>" : "");
  }

  function renderHead() {
    const d = GD.parseKey(S.sel);
    if (S.view === "week") {
      const days = GD.weekDays(S.sel);
      $("dateTitle").textContent = GD.weekLabel(S.sel);
      $("dateSub").textContent = GD.isoWeek(S.sel) + ". hafta" + (days.indexOf(S.TODAY) >= 0 ? " · bu hafta" : "");
      $("stat").innerHTML = statLine(rangeStats(days));
      return;
    }
    if (S.view === "month") {
      const mon = S.sel.slice(0, 7);
      $("dateTitle").textContent = GD.AY[d.getMonth()] + " " + d.getFullYear();
      $("dateSub").textContent = mon === S.TODAY.slice(0, 7) ? "bu ay" : "";
      $("stat").innerHTML = statLine(rangeStats(GD.monthGrid(S.sel).filter((k) => k.slice(0, 7) === mon)));
      return;
    }
    $("dateTitle").textContent = d.getDate() + " " + GD.AY[d.getMonth()];
    let rel = "";
    if (S.sel === S.TODAY) rel = " · bugün";
    else if (S.sel === GD.addDays(S.TODAY, 1)) rel = " · yarın";
    else if (S.sel === GD.addDays(S.TODAY, -1)) rel = " · dün";
    $("dateSub").textContent = GD.GUN[d.getDay()] + ", " + d.getFullYear() + rel;

    const dayTasks = App.allTasks().filter((t) => t.date === S.sel);
    const done = dayTasks.filter((t) => t.done).length;
    const lg = S.logs[S.sel] || {};
    const hd = S.habits.filter((h) => lg[h.id]).length;
    const mins = GD.plannedMinutes(App.currentBlocks());
    $("stat").innerHTML = "görev <b>" + done + "/" + dayTasks.length + "</b> · rutin <b>" + hd + "/" + S.habits.length + "</b> · plan <b>" + (mins ? GD.durText(mins) : "–") + "</b>" + (S.focusByDay[S.sel] ? " · odak <b>" + GD.durText(S.focusByDay[S.sel]) + "</b>" : "");
  }

  function renderWeek() {
    const ws = GD.weekStart(S.sel);
    let html = "";
    for (let i = 0; i < 7; i++) {
      const k = GD.addDays(ws, i), dd = GD.parseKey(k);
      const n = GD.openCountByDay(App.allTasks(), k);
      const ex = App.allTasks().some((t) => t.date === k && !t.done && App.isKeyTask(t));
      let pips = ex ? '<span class="pip ex"></span>' : "";
      for (let j = 0; j < Math.min(n - (ex ? 1 : 0), ex ? 2 : 3); j++) pips += '<span class="pip"></span>';
      html += '<button class="wd' + (k === S.sel ? " sel" : "") + (k === S.TODAY ? " today" : "") + '" data-k="' + k + '" aria-label="' + dd.getDate() + " " + GD.AY[dd.getMonth()] + (n ? ", " + n + " açık görev" : "") + '">' +
        '<span class="dn">' + App.dayName(dd) + '</span><span class="dd">' + dd.getDate() + '</span><span class="pips">' + pips + "</span></button>";
    }
    $("week").innerHTML = html;
  }

  function renderTL() {
    renderFreeHint();
    let hh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hour-h")) || 54;
    if (S.view === "day" && App.isFit()) {
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
    const blocks = App.currentBlocks();
    const links = GD.linkKeyTasks(blocks, App.allTasks(), S.sel, App.keyKinds());
    let bh = "";
    GD.lanes(blocks).forEach((b) => {
      const kd = App.keyDeco(links.byBlock[b.id]);
      const top = (Math.max(b.s, GD.DAY_START * 60) - GD.DAY_START * 60) / 60 * hh;
      const hgt = Math.max((Math.min(b.e, GD.DAY_END * 60) - Math.max(b.s, GD.DAY_START * 60)) / 60 * hh - 3, 20);
      const wdt = 100 / b._lanes, left = b._lane * wdt;
      const loc = b.loc ? '<span class="loc">' + esc(b.loc) + "</span>" : "";
      bh += '<button class="blk c-' + App.catOf(b.c).color + (hgt < 50 ? " short" : "") + (hgt < 28 ? " tiny" : "") + kd.cls + '" data-blk="' + esc(b.id) + '" data-rec="' + (b.rec ? 1 : 0) + '" ' +
        'style="top:' + top + "px;height:" + hgt + "px;left:calc(" + left + "% + 2px);width:calc(" + wdt + '% - 6px)" title="' + esc(b.t) + " · " + GD.fmtMin(b.s) + "–" + GD.fmtMin(b.e) + (b.loc ? " · " + esc(b.loc) : "") + (b.rec ? " · her hafta" : "") + esc(kd.tip) + '">' + kd.html +
        '<span class="bt">' + esc(b.t) + (b.rec ? '<span class="rec">↻</span>' : "") + "</span>" +
        '<span class="bh">' + GD.fmtMin(b.s) + "–" + GD.fmtMin(b.e) + loc + "</span>" +
        '<span class="rsz" aria-hidden="true"></span></button>';
    });
    if (S.sel === S.TODAY) {
      const now = new Date(), nm = now.getHours() * 60 + now.getMinutes();
      if (nm >= GD.DAY_START * 60 && nm <= GD.DAY_END * 60) bh += '<div class="nowline" style="top:' + ((nm - GD.DAY_START * 60) / 60 * hh) + 'px;left:0"></div>';
    }
    $("tl").innerHTML = html + '<div class="blocks">' + bh + "</div>";
    S.dayHH = hh;
    const box = $("tl").parentElement;
    if (S.view === "day" && S.tlScrolledFor !== S.sel && box.scrollHeight > box.clientHeight + 4) {
      S.tlScrolledFor = S.sel;
      const nowM = new Date().getHours() * 60 + new Date().getMinutes();
      const target = S.sel === S.TODAY ? nowM - 60 : (blocks.length ? blocks[0].s - 30 : 8 * 60);
      box.scrollTop = Math.max(0, (target - GD.DAY_START * 60) / 60 * hh);
    }
    $("blkCount").textContent = blocks.length ? blocks.length + " blok · " + GD.durText(GD.plannedMinutes(blocks)) : "";

  }

  function renderFreeHint() {
    const blocks = App.currentBlocks();
    let hint = "";
    if (S.sel >= S.TODAY) {
      let from = Math.max(GD.DAY_START, 8) * 60;
      if (S.sel === S.TODAY) { const n = new Date(); from = Math.max(from, Math.ceil((n.getHours() * 60 + n.getMinutes()) / 15) * 15); }
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
    const d = GD.parseKey(t.date), diff = GD.diffDays(S.TODAY, t.date);
    const right = t.done ? "tamamlandı" : GD.untilText(S.TODAY, t.date);
    return '<li' + (t.done ? ' class="done"' : "") + '><button data-go="' + t.date + '"><span class="ud"><b>' + d.getDate() + " " + GD.AY[d.getMonth()].slice(0, 3) + "</b>" + GD.GUNK[d.getDay()] + "</span>" +
      '<span class="ut"><span class="pill k c-' + App.keyColor(t) + '">' + esc(App.keyName(t)) + '</span><span class="utt">' + esc(t.title) + "</span></span>" +
      '<span class="ul' + (!t.done && diff >= 0 && diff <= 2 ? " soon" : "") + '">' + right + "</span></button></li>";
  }
  function renderUpcoming() {
    const list = GD.upcoming(App.allTasks(), S.TODAY, S.cfg.upcomingDays, App.keyKinds());
    $("upcPanel").hidden = !list.length;
    $("upcDays").textContent = S.cfg.upcomingDays + " gün";
    $("upcList").innerHTML = list.map(keyRow).join("");
  }

  /* ---------- day document ---------- */
  function saveDay(k, doc) {
    const blocks = (doc.blocks || []).map((b) => { const o = { id: b.id, s: b.s, e: b.e, t: b.t, c: b.c }; if (b.loc) o.loc = b.loc; return o; });
    return App.w(S.store.set("days", k, { date: k, blocks: blocks, note: doc.note || "", skip: doc.skip || [] }));
  }
  function subDay() {
    if (S.unsubDay) { S.unsubDay(); S.unsubDay = null; }
    if (!S.store) return;
    const k = S.sel;
    S.dayLoaded = false;
    S.unsubDay = S.store.watchDoc("days", k, (d) => {
      if (k !== S.sel) return;
      S.dayDoc = {
        /* known fields only (v1 also saved the overlap fields _lane/_lanes) */
        blocks: d && Array.isArray(d.blocks) ? d.blocks.map((b) => ({ id: b.id, s: b.s, e: b.e, t: b.t, c: b.c, loc: b.loc || "" })) : [],
        note: d && typeof d.note === "string" ? d.note : "",
        skip: d && Array.isArray(d.skip) ? d.skip : []
      };
      if (S.pendingNote && S.pendingNote.k === k) S.dayDoc.note = S.pendingNote.text;
      S.dayLoaded = true;
      renderHead(); renderTL(); App.renderNote();
      if (S.pendingOpen && S.pendingOpen.k === k) { const po = S.pendingOpen; S.pendingOpen = null; openBlockModal(po.opt); }
    }, App.onErr);
  }
  function flushNote() {
    clearTimeout(S.noteTimer);
    if (!S.pendingNote || !S.store || !S.writable) return;
    const p = S.pendingNote; S.pendingNote = null;
    if (p.k !== S.sel || !S.dayLoaded) return; // shouldn't happen: flushed before the day changes
    S.dayDoc.note = p.text;
    saveDay(p.k, S.dayDoc).then(() => {
      const n = new Date();
      $("noteSaved").textContent = "kaydedildi " + GD.pad(n.getHours()) + ":" + GD.pad(n.getMinutes());
    });
  }

  function go(k) {
    if (!GD.isKey(k)) return;
    flushNote();
    S.sel = k;
    S.dayDoc = { blocks: [], note: "", skip: [] };
    $("tDate").value = k;
    $("noteSaved").textContent = "";
    App.subRange();
    App.renderAll();
    subDay();
  }

  /* ---------- bloklar ---------- */
  function addBlockQuick() {
    const t = $("bTitle").value.trim(), s = GD.toMin($("bStart").value), e = GD.toMin($("bEnd").value);
    if (!t) { $("bTitle").focus(); return; }
    const err = GD.blockError(s, e, t);
    if (err) { App.banner(err); return; }
    if (!App.guardDay()) return;
    S.dayDoc.blocks = S.dayDoc.blocks.concat([{ id: uid(), s: s, e: e, t: t, c: $("bCat").value }]);
    saveDay(S.sel, S.dayDoc);
    renderHead(); renderTL();
    $("bTitle").value = "";
    $("bStart").value = GD.fmtMin(Math.min(e, 23 * 60));
    $("bEnd").value = GD.fmtMin(Math.min(e + 60, 24 * 60 - 1));
  }

  function openBlockModal(opt) {
    /* opt: {id, rec} to edit or {s, e, repeat} for a new one */
    let b = null, r = null;
    if (opt.id) {
      if (opt.rec) r = S.recurring.find((x) => x.id === opt.id);
      else b = S.dayDoc.blocks.find((x) => x.id === opt.id);
      if (!r && !b) return;
    }
    const src = r || b || { t: "", s: opt.s, e: opt.e, c: $("bCat").value };
    const editing = !!(r || b);
    const isRec = !!r;
    const dows = r ? r.dow : [GD.isoDow(S.sel)];
    const body =
      '<label class="field"><span>Başlık</span><input type="text" id="mT" maxlength="80" value="' + esc(src.t) + '" placeholder="ör. Matematik dersi" autocomplete="off"></label>' +
      '<div class="row"><label class="field"><span>Başlangıç</span><input type="time" id="mS" step="300" value="' + GD.fmtMin(src.s) + '"></label>' +
      '<label class="field"><span>Bitiş</span><input type="time" id="mE" step="300" value="' + GD.fmtMin(Math.min(src.e, 24 * 60 - 1)) + '"></label>' +
      '<label class="field"><span>Tür</span><select id="mC">' + App.catOptions(src.c) + "</select></label></div>" +
      '<label class="field"><span>Yer / not</span><input type="text" id="mL" maxlength="60" value="' + esc(src.loc || "") + '" placeholder="ör. MM-101, Kütüphane 2. kat" autocomplete="off"></label>' +
      (isRec ? "" : '<label class="check"><input type="checkbox" id="mRep"' + (opt.repeat ? " checked" : "") + "> Her hafta tekrarla</label>") +
      '<div id="mDowWrap"' + (isRec || opt.repeat ? "" : " hidden") + '><div class="field"><span>Günler</span><div class="chips">' + App.dowChips(dows) + "</div></div></div>" +
      (editing ? keySection(src) : "") +
      (isRec ? '<p class="info">Haftalık blok. Kaydettiğin değişiklik tüm haftalara uygulanır' + (r.from ? " (" + fmtShort(r.from) + "'den beri)" : "") + ".</p>" : "");
    let footer = '<button type="submit" class="btn">' + (editing ? "Kaydet" : "Ekle") + "</button><span class=\"sp\"></span>";
    if (editing) footer += '<button type="button" class="btn-ghost" id="mFocus" title="Bu blok için odak sayacını başlat">▶ Odak</button>';
    if (b) footer += '<button type="button" class="btn-danger" id="mDel">Sil</button>';
    if (r) footer += '<button type="button" class="btn-ghost" id="mSkip" title="Sadece bu gün gösterme">Bu gün yok</button><button type="button" class="btn-danger" id="mEnd">Bu günden itibaren kaldır</button>';

    App.openModal(editing ? (isRec ? "Haftalık bloğu düzenle" : "Bloğu düzenle") : "Yeni blok", body, footer, () => {
      const t = $("mT").value.trim(), s = GD.toMin($("mS").value), e = GD.toMin($("mE").value === "23:59" ? "24:00" : $("mE").value), c = $("mC").value, loc = $("mL").value.trim();
      const err = GD.blockError(s, e, t);
      if (err) { App.mErr(err); return; }
      const rep = isRec || ($("mRep") && $("mRep").checked);
      const dow = App.pickedDows();
      if (rep && !dow.length) { App.mErr("En az bir gün seç."); return; }
      if (!App.guardDay()) return;
      if (r) {
        App.w(S.store.update("recurring", r.id, { t: t, s: s, e: e, c: c, loc: loc, dow: dow }));
      } else if (rep) {
        App.w(S.store.set("recurring", uid(), { t: t, s: s, e: e, c: c, loc: loc, dow: dow, from: GD.weekStart(S.sel), until: null, createdAt: Date.now() }));
        if (b) { S.dayDoc.blocks = S.dayDoc.blocks.filter((x) => x.id !== b.id); saveDay(S.sel, S.dayDoc); }
        App.toast("Haftalık blok eklendi: " + dow.map((d) => GD.ISO_KISA[d]).join(", "));
      } else if (b) {
        S.dayDoc.blocks = S.dayDoc.blocks.map((x) => x.id === b.id ? Object.assign({}, x, { t: t, s: s, e: e, c: c, loc: loc }) : x);
        saveDay(S.sel, S.dayDoc);
      } else {
        S.dayDoc.blocks = S.dayDoc.blocks.concat([{ id: uid(), s: s, e: e, t: t, c: c, loc: loc }]);
        saveDay(S.sel, S.dayDoc);
      }
      App.closeModal(); renderHead(); renderTL();
    });

    const rep = $("mRep");
    if (rep) rep.onchange = () => { $("mDowWrap").hidden = !rep.checked; };
    if ($("mFocus")) $("mFocus").onclick = () => { App.closeModal(); App.startFocus({ title: src.t, cat: src.c }); };
    $("modal").querySelectorAll("[data-addkey]").forEach((btn) => {
      btn.onclick = () => {
        if (!App.guard()) return;
        const kind = App.kindOf(btn.dataset.addkey), id = uid(), typed = $("mKT") ? $("mKT").value.trim() : "";
        const title = typed || (src.t + " " + kind.name);
        App.w(S.store.set("tasks", id, { title: title, cat: src.c, kind: kind.id, date: S.sel, blk: src.id, done: false, createdAt: Date.now() }));
        App.closeModal();
        App.toast(fmtShort(S.sel) + " · " + src.t + ": " + kind.name + " eklendi", () => App.w(S.store.del("tasks", id)));
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
      btn.onclick = () => { App.closeModal(); App.delTask(btn.dataset.unlink); };
    });
    if (b) App.armed($("mDel"), () => {
      if (!App.guardDay()) return;
      const before = S.dayDoc.blocks;
      S.dayDoc.blocks = S.dayDoc.blocks.filter((x) => x.id !== b.id);
      saveDay(S.sel, S.dayDoc); App.closeModal(); renderHead(); renderTL();
      const k = S.sel;
      App.toast("Blok silindi", () => { if (S.sel === k) { S.dayDoc.blocks = before; saveDay(k, S.dayDoc); renderHead(); renderTL(); } });
    });
    if (r) {
      $("mSkip").onclick = () => {
        if (!App.guardDay()) return;
        S.dayDoc.skip = (S.dayDoc.skip || []).concat([r.id]);
        saveDay(S.sel, S.dayDoc); App.closeModal(); renderHead(); renderTL();
        const k = S.sel;
        App.toast("Bu gün için kaldırıldı", () => { if (S.sel === k) { S.dayDoc.skip = S.dayDoc.skip.filter((x) => x !== r.id); saveDay(k, S.dayDoc); renderHead(); renderTL(); } });
      };
      App.armed($("mEnd"), () => {
        if (!App.guard()) return;
        const snapshot = Object.assign({}, r); delete snapshot.id;
        if (!r.from || r.from >= S.sel) App.w(S.store.del("recurring", r.id));
        else App.w(S.store.update("recurring", r.id, { until: GD.addDays(S.sel, -1) }));
        App.closeModal();
        App.toast("Haftalık blok kaldırıldı (geçmiş günler duruyor)", () => App.w(S.store.set("recurring", r.id, snapshot)));
      });
    }
  }
  /* in the block dialog: what's on in this class that day (quiz, exam…) */
  function keySection(src) {
    const linked = GD.linkKeyTasks(App.currentBlocks(), App.allTasks(), S.sel, App.keyKinds()).byBlock[src.id] || [];
    const kinds = S.cfg.kinds.filter((k) => k.key).concat(S.cfg.kinds.filter((k) => !k.key));
    return '<div class="field"><span>Bu derste / blokta · ' + fmtShort(S.sel) + '</span>' +
      '<input type="text" id="mKT" maxlength="140" placeholder="Bu bloğa görev ekle, ör. slaytları getir (Enter)" autocomplete="off">' +
      '<div class="keyrow">' +
      linked.map((t) => '<span class="pill k c-' + App.keyColor(t) + '">' + esc(App.keyName(t)) + ": " + esc(t.title) +
        '<button type="button" data-unlink="' + esc(t.id) + '" title="Sil" aria-label="Sil">×</button></span>').join("") +
      kinds.map((k) => '<button type="button" class="kchip c-' + k.color + '" data-addkey="' + esc(k.id) + '">+ ' + esc(k.name) + "</button>").join("") +
      "</div></div>";
  }
  function fmtShort(k) { const d = GD.parseKey(k); return d.getDate() + " " + GD.AY[d.getMonth()]; }

  /* all blocks of a day (one-off + weekly), reading them if needed */
  async function blocksOn(k) {
    if (k === S.sel && S.dayLoaded) return App.currentBlocks();
    const base = S.rangeDays[k] || (S.store ? await S.store.getDoc("days", k) : null);
    return GD.blocksForDay(base, S.recurring, k);
  }
  /* ---------- change a day's blocks (reads it first if not loaded) ---------- */
  async function mutateDay(k, fn) {
    let base;
    if (k === S.sel && S.dayLoaded) base = S.dayDoc;
    else if (S.rangeDays[k]) base = S.rangeDays[k];
    else base = await S.store.getDoc("days", k);
    const doc = {
      blocks: ((base && base.blocks) || []).map((b) => ({ id: b.id, s: b.s, e: b.e, t: b.t, c: b.c, loc: b.loc || "" })),
      note: base && typeof base.note === "string" ? base.note : "",
      skip: base && Array.isArray(base.skip) ? base.skip.slice() : []
    };
    fn(doc);
    if (k === S.sel) {
      if (S.pendingNote && S.pendingNote.k === k) doc.note = S.pendingNote.text;
      S.dayDoc = doc; renderHead(); renderTL();
    }
    return saveDay(k, doc);
  }
  const fmtDayShort = (k) => {
    if (k === S.TODAY) return "bugün";
    if (k === GD.addDays(S.TODAY, 1)) return "yarın";
    const d = GD.parseKey(k); return d.getDate() + " " + GD.AY[d.getMonth()].slice(0, 3) + " " + GD.GUNK[d.getDay()];
  };

  /* shared with the other app-*.js files */
  Object.assign(App, {
    renderHead,
    renderWeek,
    renderTL,
    keyRow,
    renderUpcoming,
    subDay,
    flushNote,
    go,
    addBlockQuick,
    openBlockModal,
    fmtShort,
    blocksOn,
    mutateDay,
    fmtDayShort
  });
})();
