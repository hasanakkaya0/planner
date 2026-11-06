/* Planner — UI: quick add bar.
   Shared mutable state lives on S and shared functions on App (both created in app-state.js). */
(function () {
  "use strict";
  /* ---------- quick add ---------- */
  const qaParse = () => GD.parseQuick($("qa").value, S.TODAY, S.sel, S.cfg.cats, S.cfg.kinds);
  function renderQaPreview() {
    const box = $("qaPrev");
    if (!$("qa").value.trim()) { box.hidden = true; return; }
    const r = qaParse();
    let html;
    if (!r.ok) html = r.error ? '<span class="qa-err">' + esc(r.error) + "</span>" : '<span class="qa-dim">yazmaya devam et…</span>';
    else {
      const type = { block: "Blok", task: "Görev", both: "Görev + blok", recurring: "Haftalık blok" }[r.type];
      const c = App.catOf(r.cat || S.cfg.defaultCat);
      const parts = ["<b>" + type + "</b>", '<span class="qa-t">' + esc(r.title) + "</span>",
        r.type === "recurring" ? "her " + r.dow.map((d) => GD.ISO_KISA[d]).join(", ") : App.fmtDayShort(r.date)];
      if (r.s != null) parts.push(GD.fmtMin(r.s) + "–" + GD.fmtMin(r.e));
      if (r.loc) parts.push("@" + esc(r.loc));
      parts.push('<span class="swatch c-' + c.color + '"></span>' + esc(c.name));
      if (r.kind && r.kind !== "normal") parts.push(App.kindPill({ kind: r.kind }));
      html = parts.join('<span class="qa-sep">·</span>') + '<kbd class="qa-hint">Enter</kbd>';
      if (r.warnings.length) html += '<div class="qa-warn">' + esc(r.warnings.join(" · ")) + "</div>";
    }
    html += '<div class="qa-help">yarın 14:00-15:30 · cuma · haftaya pzt · 5 kasım · her pzt çar · 90dk · #kategori · !tür · @yer</div>';
    box.innerHTML = html; box.hidden = false;
  }
  async function qaCommit() {
    const r = qaParse();
    if (!r.ok) { renderQaPreview(); return; }
    if (!App.guard()) return;
    if (r.s != null) { const err = GD.blockError(r.s, r.e, r.title); if (err) { App.banner(err); return; } }
    const cat = r.cat || S.cfg.defaultCat, undo = [];
    try {
      if (r.type === "recurring") {
        const id = uid();
        await S.store.set("recurring", id, { t: r.title, c: cat, loc: r.loc, s: r.s, e: r.e, dow: r.dow, from: GD.weekStart(S.sel), until: null, createdAt: Date.now() });
        undo.push(() => S.store.del("recurring", id));
      }
      if (r.type === "task" || r.type === "both") {
        const id = uid();
        await S.store.set("tasks", id, { title: r.title, cat: cat, kind: r.kind || "normal", date: r.date, done: false, createdAt: Date.now() });
        undo.push(() => S.store.del("tasks", id));
      }
      if (r.type === "block" || r.type === "both") {
        const bid = uid(), k = r.date;
        await App.mutateDay(k, (d) => { d.blocks.push({ id: bid, s: r.s, e: r.e, t: r.title, c: cat, loc: r.loc }); });
        undo.push(() => App.mutateDay(k, (d) => { d.blocks = d.blocks.filter((b) => b.id !== bid); }));
      }
    } catch (e) { App.onErr(e); return; }
    $("qa").value = ""; renderQaPreview();
    const where = r.type === "recurring" ? "her " + r.dow.map((d) => GD.ISO_KISA[d]).join(", ") : App.fmtDayShort(r.date);
    App.toast("Eklendi: " + r.title.slice(0, 40) + " · " + where, () => undo.reduce((p, f) => p.then(f), Promise.resolve()).catch(App.onErr));
  }
  $("qa").addEventListener("input", renderQaPreview);
  $("qa").addEventListener("focus", renderQaPreview);
  $("qa").addEventListener("blur", () => setTimeout(() => { $("qaPrev").hidden = true; }, 150));
  $("qa").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); qaCommit(); }
    else if (e.key === "Escape") { $("qa").value = ""; $("qaPrev").hidden = true; $("qa").blur(); }
  });
})();
