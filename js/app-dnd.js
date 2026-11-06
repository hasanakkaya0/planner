/* Planner — UI: drag and drop: move / resize / create blocks, drop tasks on the timeline.
   Shared mutable state lives on S and shared functions on App (both created in app-state.js). */
(function () {
  "use strict";
  /* ---------- drag & drop: move, resize, drag to create ---------- */
  const snapTo = (m, st) => Math.round(m / st) * st;
  function geom(mode) {
    if (mode === "day") { const L = $("tl").querySelector(".blocks"); return { hh: S.dayHH, cols: [{ k: S.sel, el: L, r: L.getBoundingClientRect() }] }; }
    return { hh: S.weekHH, cols: Array.from($("wkGrid").querySelectorAll(".wk-col")).map((el, i) => ({ k: S.weekDaysCache[i], el: el, r: el.getBoundingClientRect() })) };
  }
  const minAt = (g, col, y) => GD.DAY_START * 60 + (y - col.r.top) / g.hh * 60;
  function srcBlock(k, id, rec) {
    if (rec) return S.recurring.find((x) => x.id === id);
    const d = k === S.sel && S.dayLoaded ? S.dayDoc : S.rangeDays[k];
    return d && (d.blocks || []).find((x) => x.id === id);
  }
  function onDown(e, mode) {
    if (e.button !== 0 || e.pointerType === "touch" || !S.store || !S.writable) return;
    const g = geom(mode);
    const ci = g.cols.findIndex((c) => e.clientX >= c.r.left && e.clientX <= c.r.right);
    if (ci < 0) return;
    const bEl = e.target.closest(".blk,.wblk");
    if (bEl) {
      const k = bEl.dataset.day || S.sel, rec = bEl.dataset.rec === "1", b = srcBlock(k, bEl.dataset.blk, rec);
      if (!b) return;
      S.drag = { mode: mode, g: g, kind: e.target.closest(".rsz") ? "resize" : "move", el: bEl, k: k, nk: k, ci: ci, id: bEl.dataset.blk, rec: rec, s0: b.s, e0: b.e, ns: b.s, ne: b.e, x0: e.clientX, y0: e.clientY, moved: false };
    } else if (e.target.closest(".slot,.wslot")) {
      const a = Math.floor(minAt(g, g.cols[ci], e.clientY) / 15) * 15;
      S.drag = { mode: mode, g: g, kind: "create", k: g.cols[ci].k, ci: ci, a: a, ns: a, ne: a + 60, x0: e.clientX, y0: e.clientY, moved: false, ghost: null };
    } else return;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }
  function onMove(e) {
    const d = S.drag; if (!d) return;
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
    const d = S.drag; S.drag = null;
    document.body.classList.remove("dragging");
    if (!d || !d.moved) return;
    S.suppressClick = true; setTimeout(() => { S.suppressClick = false; }, 0);
    if (d.ghost) d.ghost.remove();
    if (d.kind === "create") {
      const o = { s: d.ns, e: Math.min(d.ne, GD.DAY_END * 60) };
      if (d.mode === "day") App.openBlockModal(o); else App.openFromRange(d.k, o);
      return;
    }
    if (d.ns === d.s0 && d.ne === d.e0 && d.nk === d.k) { App.renderAll(); return; }
    commitDrag(d);
  }
  function commitDrag(d) {
    if (!App.guard()) { App.renderAll(); return; }
    const label = GD.fmtMin(d.ns) + "–" + GD.fmtMin(d.ne);
    if (d.rec) {
      const old = { s: d.s0, e: d.e0 };
      App.w(S.store.update("recurring", d.id, { s: d.ns, e: d.ne }));
      App.toast("Haftalık blok tüm haftalarda " + label, () => App.w(S.store.update("recurring", d.id, old)));
      return;
    }
    const b = srcBlock(d.k, d.id, false);
    if (!b) { App.renderAll(); return; }
    const setTime = (s0, e0) => (doc) => { doc.blocks = doc.blocks.map((x) => (x.id === d.id ? Object.assign({}, x, { s: s0, e: e0 }) : x)); };
    if (d.nk === d.k) {
      App.mutateDay(d.k, setTime(d.ns, d.ne));
      App.toast("“" + b.t.slice(0, 30) + "” " + label, () => App.mutateDay(d.k, setTime(d.s0, d.e0)));
    } else {
      const moved = { id: b.id, t: b.t, c: b.c, loc: b.loc || "", s: d.ns, e: d.ne }, orig = Object.assign({}, b);
      App.mutateDay(d.k, (doc) => { doc.blocks = doc.blocks.filter((x) => x.id !== d.id); })
        .then(() => App.mutateDay(d.nk, (doc) => { doc.blocks.push(moved); }));
      App.toast("“" + b.t.slice(0, 30) + "” → " + App.fmtDayShort(d.nk) + " " + label, () =>
        App.mutateDay(d.nk, (doc) => { doc.blocks = doc.blocks.filter((x) => x.id !== d.id); })
          .then(() => App.mutateDay(d.k, (doc) => { doc.blocks.push(orig); })));
    }
  }
  $("tl").addEventListener("pointerdown", (e) => onDown(e, "day"));
  $("wkGrid").addEventListener("pointerdown", (e) => onDown(e, "week"));
  document.addEventListener("click", (e) => { if (S.suppressClick) { e.stopPropagation(); e.preventDefault(); S.suppressClick = false; } }, true);

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
    const over = App.currentBlocks().find((b) => exact >= b.s && exact < b.e);
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
    if (!App.guardDay()) return;
    const t = App.findTask(data.slice(13)); if (!t) return;
    if (onBlk) {
      const b = App.currentBlocks().find((x) => x.id === onBlk); if (!b) return;
      const old = { blk: t.blk || null, date: t.date || null };
      App.w(S.store.update("tasks", t.id, { blk: b.id, date: S.sel }));
      App.toast("“" + t.title.slice(0, 30) + "” → " + b.t + " bloğuna eklendi", () => App.w(S.store.update("tasks", t.id, old)));
      return;
    }
    if (m == null || isNaN(m)) return;
    const bid = uid();
    App.mutateDay(S.sel, (doc) => { doc.blocks.push({ id: bid, s: m, e: m + 60, t: t.title, c: t.cat }); });
    App.toast("“" + t.title.slice(0, 30) + "” " + GD.fmtMin(m) + "–" + GD.fmtMin(m + 60) + " arasına yerleşti", () => App.mutateDay(S.sel, (doc) => { doc.blocks = doc.blocks.filter((x) => x.id !== bid); }));
  });
})();
