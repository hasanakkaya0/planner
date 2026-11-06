/* Planner — UI: end of term. End the weekly classes on a chosen day, and clear old finished tasks
   (after a backup has been downloaded in this window), so the lists and the 3000-task limit stay roomy.
   Shared mutable state lives on S and shared functions on App (both created in app-state.js). */
(function () {
  "use strict";
  const AGES = [[60, "60 günden"], [90, "90 günden"], [180, "180 günden"], [365, "1 yıldan"]];

  function openTermEnd() {
    const active = GD.activeSeries(S.recurring, S.TODAY).slice().sort((a, b) => a.s - b.s);
    const series = active.length ? active.map((r) =>
      '<label class="check"><input type="checkbox" data-ser="' + esc(r.id) + '" checked> <b>' + esc(r.t) + "</b> · " +
      r.dow.map((d) => GD.ISO_KISA[d]).join(" ") + " " + GD.fmtMin(r.s) + "–" + GD.fmtMin(r.e) + "</label>").join("")
      : '<p class="set-hint">Şu an devam eden haftalık ders yok.</p>';
    const body =
      '<p class="info">Dönem bitince derslerin takvimde ilerleyen haftalarda görünmesini durdurabilir, eski biten görevleri temizleyebilirsin. Geçmiş günler olduğu gibi kalır. İkisi de isteğe bağlı.</p>' +
      '<h3 class="st-h">Haftalık dersler</h3><div class="tm-list" id="tmSeries">' + series + "</div>" +
      (active.length ? '<div class="row"><label class="field"><span>Son ders günü</span><input type="date" id="tmDate" value="' + S.TODAY + '"></label>' +
        '<div class="field"><span>&nbsp;</span><button type="button" class="btn-ghost" id="tmEnd">Seçilenleri bitir</button></div></div>' : "") +
      '<h3 class="st-h">Eski biten görevler</h3>' +
      '<div class="row"><label class="field"><span>Şundan eski olanlar</span><select id="tmAge">' + AGES.map((a) => '<option value="' + a[0] + '">' + a[1] + "</option>").join("") + "</select></label>" +
      '<div class="field"><span>&nbsp;</span><span id="tmCount" class="set-hint"></span></div></div>' +
      '<p class="set-hint">Silmeden önce yedek indirmen gerekir. Silinen görevler geri alınamaz; yedeği “Yedek yükle” ile geri yükleyebilirsin.</p>' +
      '<div class="row"><button type="button" class="btn-ghost" id="tmBackup">1) Yedek indir</button><button type="button" class="btn-danger" id="tmDel" disabled>2) Sil</button></div>';
    App.openModal("Dönem sonu", body, '<button type="submit" class="btn">Kapat</button>', () => App.closeModal(), true);

    const gone = new Set();
    let backedUp = false;
    const old = () => GD.oldDoneTasks(S.tasks.filter((t) => !gone.has(t.id)), GD.addDays(S.TODAY, -(+$("tmAge").value)));
    function refresh() {
      const n = old().length;
      $("tmCount").textContent = n ? n + " biten görev silinebilir." : "Silinecek görev yok.";
      $("tmDel").disabled = !(backedUp && n);
      $("tmDel").textContent = n ? "2) " + n + " görevi sil" : "2) Sil";
    }
    $("tmAge").onchange = refresh;
    refresh();

    $("tmBackup").onclick = async () => {
      if (await App.exportData()) { backedUp = true; $("tmBackup").textContent = "1) Yedek indirildi ✓"; refresh(); }
    };
    App.armed($("tmDel"), async () => {
      if (!App.guard()) return;
      const list = old();
      $("tmDel").disabled = true;
      try {
        for (let i = 0; i < list.length; i += 20) await Promise.all(list.slice(i, i + 20).map((t) => S.store.del("tasks", t.id).then(() => gone.add(t.id))));
        App.toast(list.length + " görev silindi");
      } catch (e) { App.onErr(e); }
      refresh();
    });

    if ($("tmEnd")) $("tmEnd").onclick = () => {
      const date = $("tmDate").value;
      if (!GD.isKey(date)) { App.mErr("Son ders gününü seç."); return; }
      if (!App.guard()) return;
      const picked = Array.from($("tmSeries").querySelectorAll("[data-ser]:checked")).map((c) => S.recurring.find((r) => r.id === c.dataset.ser)).filter(Boolean);
      const todo = picked.filter((r) => !r.from || date >= r.from);
      if (!picked.length) { App.mErr("En az bir ders seç."); return; }
      if (!todo.length) { App.mErr("Seçilen derslerin hepsi bu günden sonra başlıyor."); return; }
      todo.forEach((r) => App.w(S.store.update("recurring", r.id, { until: date })));
      todo.forEach((r) => { const c = $("tmSeries").querySelector('[data-ser="' + r.id + '"]'); c.checked = false; c.disabled = true; c.parentNode.append(" · bitti"); });
      App.mErr("");
      App.toast(todo.length + " ders " + App.fmtShort(date) + " gününde bitti", () => todo.forEach((r) => App.w(S.store.update("recurring", r.id, { until: r.until || null }))));
    };
  }

  /* shared with the other app-*.js files */
  Object.assign(App, {
    openTermEnd
  });
})();
