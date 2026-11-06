/* Planner — UI: day view: task list, habits and note.
   Shared mutable state lives on S and shared functions on App (both created in app-state.js). */
(function () {
  "use strict";
  function renderTasks() {
    const items = GD.visibleTasks(S.tasks, S.sel, S.TODAY);
    const open = items.filter((x) => !x.t.done).length;
    $("tCount").textContent = items.length ? open + " açık / " + items.length : "";

    const od = S.sel === S.TODAY ? GD.overdue(S.tasks, S.TODAY) : [];
    $("overdueBar").innerHTML = od.length ? '<div class="overdue"><span>' + od.length + " gecikmiş görev</span>" + '<button class="linkbtn" id="moveOverdue">Hepsini bugüne taşı</button></div>' : "";

    let html = "";
    if (!items.length) {
      html = '<div class="empty"><strong>' + (S.sel < S.TODAY ? "Bu günde görev yok" : "Bu gün için görev yok") + "</strong>Yukarıdan ekle. Öne çıkan türler ayrıca Yaklaşanlar listesinde görünür.</div>";
    } else {
      const known = S.cfg.cats.map((c) => c.id);
      const groups = S.cfg.cats.map((c) => ({ c: c, items: items.filter((x) => x.t.cat === c.id) }));
      const other = items.filter((x) => known.indexOf(x.t.cat) < 0);
      if (other.length) groups.push({ c: { id: "_other", name: "Diğer", color: "slate" }, items: other });
      const selLinks = GD.linkKeyTasks(App.currentBlocks(), S.tasks, S.sel, App.keyKinds()).byTask;
      groups.forEach((gr) => {
        const g = gr.items, c = gr.c;
        if (!g.length) return;
        g.sort((a, b) => (a.t.done - b.t.done) || (App.kindRank(a.t) - App.kindRank(b.t)) || (b.late - a.late) || ((a.t.createdAt || 0) - (b.t.createdAt || 0)));
        html += '<div class="tgroup"><h3><span class="swatch c-' + c.color + '"></span>' + esc(c.name) + '<span class="n">' + g.filter((x) => !x.t.done).length + "</span></h3><ul class=\"tasks\">";
        g.forEach((x) => {
          const t = x.t;
          let meta = "";
          if (t.imp) meta += '<span class="pill imp">★ önemli</span>';
          if (t.kind !== "normal") meta += App.kindPill(t);
          if (x.late) meta += '<span class="pill late">' + GD.untilText(S.TODAY, t.date) + "</span>";
          else if (!t.date) meta += '<span class="pill nodate">tarihsiz</span>';
          if (selLinks[t.id]) { const lb = selLinks[t.id]; meta += '<span class="pill at">' + GD.fmtMin(lb.s) + " · " + esc(lb.t) + (lb.loc ? " · " + esc(lb.loc) : "") + "</span>"; }
          if (S.focusByTask[t.id]) meta += '<span class="pill fc">odak ' + GD.durText(S.focusByTask[t.id]) + "</span>";
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
    if (!S.habits.length) {
      $("habitList").innerHTML = '<div class="empty"><strong>Henüz rutin yok</strong>Her gün ya da haftada birkaç gün yaptığın şeyleri ekle; seri kendiliğinden sayılır.</div>';
      $("hCount").textContent = "";
      return;
    }
    const lg = S.logs[S.sel] || {}, future = S.sel > S.TODAY;
    let html = '<ul class="habits">';
    S.habits.forEach((h) => {
      let sp = "";
      for (let i = 6; i >= 0; i--) {
        const k = GD.addDays(S.sel, -i);
        sp += '<i class="' + (GD.doneOn(S.logs, k, h.id) ? "f" : "") + (i === 0 ? " sel" : "") + '" title="' + k + '"></i>';
      }
      const p = GD.habitProgress(S.logs, h, S.sel);
      const prog = p.mode === "daily"
        ? '<span class="streak" title="Kesintisiz gün">' + (p.streak ? "<b>" + p.streak + "</b>g" : "–") + "</span>"
        : '<span class="streak" title="Bu hafta / hedef' + (p.weeks ? " · " + p.weeks + " haftadır tutuyor" : "") + '"><b>' + p.count + "</b>/" + p.target + "</span>";
      html += '<li class="habit' + (lg[h.id] ? " on" : "") + '">' +
        '<button class="htoggle" data-habit="' + esc(h.id) + '" aria-pressed="' + !!lg[h.id] + '" aria-label="' + esc(h.name) + ' yapıldı"' + (future ? " disabled title=\"Gelecek gün işaretlenemez\"" : "") + ">" + CHECK + "</button>" +
        '<button class="hn" data-edit-habit="' + esc(h.id) + '">' + esc(h.name) + "<small>" + (p.mode === "daily" ? "her gün" : "haftada " + p.target) + "</small></button>" +
        '<span class="spark" aria-hidden="true">' + sp + "</span>" + prog + "</li>";
    });
    $("habitList").innerHTML = html + "</ul>";
    $("hCount").textContent = S.habits.filter((h) => lg[h.id]).length + "/" + S.habits.length;
  }

  function renderNote() {
    if (!S.pendingNote) $("note").value = S.dayDoc.note || "";
    $("note").placeholder = S.sel < S.TODAY ? "Bu güne dair not…" : "Bugüne dair not, yarına kalanlar…";
  }

  function renderAll() {
    if (S.view !== "day") { App.renderRange(); return; }
    App.renderHead(); App.renderWeek(); App.renderTL(); App.renderUpcoming(); renderTasks(); renderHabits(); renderNote();
  }

  /* ---------- tasks ---------- */
  function addTask() {
    const t = $("tTitle").value.trim();
    if (!t) { $("tTitle").focus(); return; }
    if (!App.guard()) return;
    const kind = $("tKind").value;
    const date = $("tDate").value || null;
    if (App.kindOf(kind).key && !date) { App.banner(App.kindOf(kind).name + " için tarih ver ki Yaklaşanlar listesinde görünsün."); }
    App.w(S.store.set("tasks", uid(), { title: t, cat: $("tCat").value, kind: kind, date: date, done: false, createdAt: Date.now() }));
    $("tTitle").value = ""; $("tKind").value = "normal"; $("tTitle").focus();
  }
  const findTask = (id) => S.tasks.find((x) => x.id === id);
  function rawTask(t) { const o = Object.assign({}, t); delete o.id; return o; }

  function toggleTask(id) {
    const t = findTask(id); if (!t || !App.guard()) return;
    App.w(S.store.update("tasks", id, { done: !t.done, doneAt: !t.done ? Date.now() : null }));
  }
  function postpone(id) {
    const t = findTask(id); if (!t || !App.guard()) return;
    const base = t.date && t.date >= S.TODAY ? t.date : S.TODAY;
    const nd = GD.addDays(base, 1), old = t.date || null;
    App.w(S.store.update("tasks", id, { date: nd }));
    App.toast("“" + t.title.slice(0, 40) + "” → " + App.fmtShort(nd), () => App.w(S.store.update("tasks", id, { date: old })));
  }
  function delTask(id) {
    const t = findTask(id); if (!t || !App.guard()) return;
    const raw = rawTask(t);
    App.w(S.store.del("tasks", id));
    App.toast("Görev silindi", () => App.w(S.store.set("tasks", id, raw)));
  }
  function moveOverdue() {
    if (!App.guard()) return;
    const od = GD.overdue(S.tasks, S.TODAY);
    const olds = od.map((t) => [t.id, t.date]);
    od.reduce((p, t) => p.then(() => S.store.update("tasks", t.id, { date: S.TODAY })), Promise.resolve()).catch(App.onErr);
    App.toast(od.length + " görev bugüne taşındı", () => {
      olds.reduce((p, x) => p.then(() => S.store.update("tasks", x[0], { date: x[1] })), Promise.resolve()).catch(App.onErr);
    });
  }
  function openTaskModal(id) {
    const t = findTask(id); if (!t) return;
    const body =
      '<label class="field"><span>Görev</span><input type="text" id="mT" maxlength="140" value="' + esc(t.title) + '" autocomplete="off"></label>' +
      '<div class="row"><label class="field"><span>Kategori</span><select id="mC">' + App.catOptions(t.cat) + "</select></label>" +
      '<label class="field"><span>Tür</span><select id="mK">' + App.kindOptions(t.kind) + "</select></label></div>" +
      '<div class="row"><label class="field"><span>Tarih</span><input type="date" id="mD" value="' + (t.date || "") + '"></label>' +
      '<div class="field"><span>&nbsp;</span><button type="button" class="btn-ghost" id="mNoDate">Tarihsiz yap</button></div></div>' +
      '<label class="field" id="mBWrap" hidden><span>Hangi derste / blokta</span><select id="mB"><option value="">Otomatik (adından bul)</option></select></label>' +
      '<div class="row checks"><label class="check" title="Yaklaşanlar listesinde ve haftalık/aylık takvimde göster"><input type="checkbox" id="mImp"' + (t.imp ? " checked" : "") + "> ★ Öne çıkar</label>" +
      '<label class="check"><input type="checkbox" id="mDone"' + (t.done ? " checked" : "") + "> Tamamlandı</label></div>";
    const footer = '<button type="submit" class="btn">Kaydet</button><span class="sp"></span><button type="button" class="btn-danger" id="mDel">Sil</button>';
    App.openModal("Görevi düzenle", body, footer, () => {
      const title = $("mT").value.trim();
      if (!title) { App.mErr("Görev boş olamaz."); return; }
      const date = $("mD").value || null, kind = $("mK").value;
      const imp = $("mImp").checked;
      if (App.kindOf(kind).key && !date) { App.mErr(App.kindOf(kind).name + " için tarih seç."); return; }
      if (imp && !date) { App.mErr("Öne çıkan görev için tarih seç."); return; }
      if (!App.guard()) return;
      const done = $("mDone").checked;
      const blk = $("mBWrap").hidden ? t.blk : ($("mB").value || null);
      App.w(S.store.update("tasks", id, { title: title, cat: $("mC").value, kind: kind, imp: imp, date: date, done: done, doneAt: done ? (t.doneAt || Date.now()) : null, blk: blk }));
      App.closeModal();
    });
    $("mNoDate").onclick = () => { $("mD").value = ""; };
    if (t.date) App.blocksOn(t.date).then((bl) => {
      if (!$("mB") || !bl.length) return;
      $("mB").innerHTML = App.opt("", "Otomatik (adından bul)", t.blk || "") + App.opt("-", "Hiçbir derse bağlama", t.blk || "") +
        bl.map((b) => App.opt(b.id, GD.fmtMin(b.s) + "–" + GD.fmtMin(b.e) + " · " + b.t + (b.loc ? " · " + b.loc : ""), t.blk || "")).join("");
      $("mBWrap").hidden = false;
    });
    App.armed($("mDel"), () => { App.closeModal(); delTask(id); });
  }

  /* ---------- rutinler ---------- */
  function addHabit() {
    const n = $("hTitle").value.trim();
    if (!n) { $("hTitle").focus(); return; }
    if (!App.guard()) return;
    const order = S.habits.reduce((m, h) => Math.max(m, h.order || 0), 0) + 1;
    App.w(S.store.set("habits", uid(), { name: n, target: +$("hTarget").value, order: order, createdAt: Date.now() }));
    $("hTitle").value = ""; $("hTarget").value = "7";
  }
  function toggleHabit(id, k) {
    k = k || S.sel;
    if (!GD.isKey(k) || k > S.TODAY || !App.guard()) return;
    const cur = Object.assign({}, S.logs[k] || {});
    if (cur[id]) delete cur[id]; else cur[id] = true;
    S.logs = Object.assign({}, S.logs); S.logs[k] = cur;
    renderHabits(); App.renderHead();
    if (S.view !== "day") App.renderRange();
    App.w(S.store.set("habitlog", k, { date: k, done: cur }));
  }
  function openHabitModal(id) {
    const h = S.habits.find((x) => x.id === id); if (!h) return;
    const tg = h.target && h.target < 7 ? h.target : 7;
    let opts = "";
    for (let i = 7; i >= 1; i--) opts += '<option value="' + i + '"' + (i === tg ? " selected" : "") + ">" + (i === 7 ? "Her gün" : "Haftada " + i) + "</option>";
    const p = GD.habitProgress(S.logs, h, S.sel);
    const info = p.mode === "daily" ? (p.streak ? p.streak + " gündür kesintisiz." : "Seri henüz başlamadı.") : "Bu hafta " + p.count + "/" + p.target + (p.weeks ? " · " + p.weeks + " haftadır hedefi tutturuyorsun." : ".");
    const body =
      '<label class="field"><span>Rutin</span><input type="text" id="mT" maxlength="40" value="' + esc(h.name) + '" autocomplete="off"></label>' +
      '<label class="field"><span>Sıklık</span><select id="mF">' + opts + "</select></label>" +
      '<p class="info">' + info + " Haftada birkaç gün yapılan rutinlerde seri yerine haftalık hedef sayılır.</p>";
    const footer = '<button type="submit" class="btn">Kaydet</button><span class="sp"></span><button type="button" class="btn-danger" id="mDel">Rutini sil</button>';
    App.openModal("Rutini düzenle", body, footer, () => {
      const n = $("mT").value.trim();
      if (!n) { App.mErr("İsim boş olamaz."); return; }
      if (!App.guard()) return;
      App.w(S.store.update("habits", id, { name: n, target: +$("mF").value }));
      App.closeModal();
    });
    App.armed($("mDel"), () => {
      if (!App.guard()) return;
      const raw = Object.assign({}, h); delete raw.id;
      App.w(S.store.del("habits", id)); App.closeModal();
      App.toast("Rutin silindi", () => App.w(S.store.set("habits", id, raw)));
    });
  }

  /* shared with the other app-*.js files */
  Object.assign(App, {
    renderTasks,
    renderHabits,
    renderNote,
    renderAll,
    addTask,
    findTask,
    toggleTask,
    postpone,
    delTask,
    moveOverdue,
    openTaskModal,
    addHabit,
    toggleHabit,
    openHabitModal
  });
})();
