/* Planner — UI: recurring tasks ("her pazartesi spor"): create / edit a series, complete or skip single days.
   A series is one document in the `recurring` collection with task: true (weekly class blocks live there too).
   Its occurrences are virtual (GD.expandRecurringTasks); completion is stored in the series' doneOn map.
   Shared mutable state lives on S and shared functions on App (both created in app-state.js). */
(function () {
  "use strict";
  const repOf = (rid) => S.rtasks.find((r) => r.id === rid);
  const rawRep = (r) => ({ task: true, title: r.title, cat: r.cat, kind: r.kind, dow: r.dow, from: r.from || null, until: r.until || null, doneOn: r.doneOn || {}, skip: r.skip || [], createdAt: r.createdAt || 0 });

  /* tick / untick one day of a series */
  function toggleRep(id) {
    const v = GD.parseVirtualId(id), r = v && repOf(v.rid);
    if (!r || !App.guard()) return;
    const doneOn = Object.assign({}, r.doneOn);
    if (doneOn[v.date]) delete doneOn[v.date]; else doneOn[v.date] = Date.now();
    App.w(S.store.set("recurring", r.id, Object.assign(rawRep(r), { doneOn: doneOn })));
  }

  /* drop one day of a series */
  function skipRep(id) {
    const v = GD.parseVirtualId(id), r = v && repOf(v.rid);
    if (!r || !App.guard()) return;
    const old = rawRep(r);
    App.w(S.store.set("recurring", r.id, Object.assign(rawRep(r), { skip: (r.skip || []).concat(v.date) })));
    App.toast("Bu günkü tekrar atlandı", () => App.w(S.store.set("recurring", r.id, old)));
  }

  function deleteSeries(r) {
    const old = rawRep(r);
    App.w(S.store.del("recurring", r.id));
    App.toast("Tekrarlayan görev silindi", () => App.w(S.store.set("recurring", r.id, old)));
  }

  /* rid = edit that series (date = the occurrence that was clicked); no rid = new series, prefilled from the add row */
  function openRepModal(rid, date) {
    const r = rid ? repOf(rid) : null;
    if (rid && !r) return;
    const src = r || { title: $("tTitle").value.trim(), cat: $("tCat").value, kind: $("tKind").value, dow: [GD.isoDow(S.sel)], from: S.sel, until: null };
    const body =
      '<label class="field"><span>Görev</span><input type="text" id="mT" maxlength="140" value="' + esc(src.title) + '" placeholder="ör. Spor, Kitap oku" autocomplete="off"></label>' +
      '<div class="row"><label class="field"><span>Kategori</span><select id="mC">' + App.catOptions(src.cat) + "</select></label>" +
      '<label class="field"><span>Tür</span><select id="mK">' + App.kindOptions(src.kind) + "</select></label></div>" +
      '<div class="field"><span>Günler</span><div class="chips">' + App.dowChips(src.dow) + "</div></div>" +
      '<div class="row"><label class="field"><span>Başlangıç</span><input type="date" id="mFrom" value="' + (src.from || S.sel) + '"></label>' +
      '<label class="field"><span>Bitiş (isteğe bağlı)</span><input type="date" id="mUntil" value="' + (src.until || "") + '"></label></div>' +
      '<p class="info">Seçtiğin günlerde her hafta görev listesinde görünür. Her günü ayrı tamamlarsın; kaçırdığın gün gecikmiş sayılmaz.</p>';
    let footer = '<button type="submit" class="btn">' + (r ? "Kaydet" : "Ekle") + '</button><span class="sp"></span>';
    if (r && date) footer += '<button type="button" class="btn-ghost" id="mSkip" title="Sadece ' + esc(App.fmtShort(date)) + ' günü gösterme">Bu gün yok</button><button type="button" class="btn-danger" id="mEnd">Bu günden itibaren bitir</button>';
    if (r) footer += '<button type="button" class="btn-danger" id="mDel">Seriyi sil</button>';
    App.openModal(r ? "Tekrarlayan görevi düzenle" : "Tekrarlayan görev", body, footer, () => {
      const title = $("mT").value.trim(), dow = App.pickedDows(), from = $("mFrom").value, until = $("mUntil").value || null;
      if (!title) { App.mErr("Görev boş olamaz."); return; }
      if (!dow.length) { App.mErr("En az bir gün seç."); return; }
      if (!GD.isKey(from)) { App.mErr("Başlangıç tarihi seç."); return; }
      if (until && (!GD.isKey(until) || until < from)) { App.mErr("Bitiş, başlangıçtan önce olamaz."); return; }
      if (!App.guard()) return;
      const doc = Object.assign(r ? rawRep(r) : { doneOn: {}, skip: [], createdAt: Date.now() },
        { task: true, title: title, cat: $("mC").value, kind: $("mK").value, dow: dow, from: from, until: until });
      App.w(S.store.set("recurring", r ? r.id : uid(), doc));
      if (!r) { $("tTitle").value = ""; App.toast("Tekrarlayan görev eklendi"); }
      App.closeModal();
    });
    if (r && date) {
      $("mSkip").onclick = () => { App.closeModal(); skipRep("r:" + r.id + ":" + date); };
      $("mEnd").onclick = () => {
        if (!App.guard()) return;
        const until = GD.addDays(date, -1);
        App.closeModal();
        if (r.from && until < r.from) { deleteSeries(r); return; }   /* nothing left of the series */
        const old = rawRep(r);
        App.w(S.store.set("recurring", r.id, Object.assign(rawRep(r), { until: until })));
        App.toast("Seri " + App.fmtShort(date) + " gününden itibaren bitti", () => App.w(S.store.set("recurring", r.id, old)));
      };
    }
    if (r) App.armed($("mDel"), () => { if (!App.guard()) return; App.closeModal(); deleteSeries(r); });
  }

  /* shared with the other app-*.js files */
  Object.assign(App, {
    toggleRep,
    skipRep,
    openRepModal
  });
})();
