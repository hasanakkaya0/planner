/* Planner — UI: first-run welcome card (and "Tanıtımı göster" in settings).
   Shared mutable state lives on S and shared functions on App (both created in app-state.js). */
(function () {
  "use strict";
  const KEY = "gunDefteri.welcome";
  const seen = () => { try { return !!localStorage.getItem(KEY); } catch (e) { return true; } };
  const markSeen = () => { try { localStorage.setItem(KEY, "1"); } catch (e) { /* none */ } };

  function openWelcome() {
    if (App.markNewsSeen) App.markNewsSeen();   /* a new user gets the tour, not the list of changes */
    const body =
      '<p class="info">Kısa bir tur. İstediğin zaman Ayarlar → Yardım’dan tekrar açabilirsin.</p>' +
      '<ol class="welcome">' +
        "<li><b>Hızlı ekle.</b> Üstteki çubuğa tek satır yaz: <code>yarın 14:00-15:30 Matematik @MM-101 #ders</code>. Tarih, saat, yer ve kategori kendiliğinden ayrılır. Kısayol: <kbd>/</kbd></li>" +
        "<li><b>Ders programı.</b> Gün görünümünde <b>↻ Haftalık</b> ile dersini bir kez gir, her hafta tekrarlanır. Tatil gününü atlayabilir, dönem sonunda serisini bitirebilirsin.</li>" +
        "<li><b>Sınav ve teslimler.</b> Görev türünü <b>Sınav</b> ya da <b>Teslim</b> seç. “Yaklaşanlar” listesinde çıkar, takvimde vurgulanır ve aynı gündeki ders bloğuna rozet olarak yapışır.</li>" +
        "<li><b>Rutinler ve odak.</b> Rutinler seri tutar. <b>Odak</b> düğmesi bir görev ya da blok için Pomodoro sayacı başlatır, süren günlük kaydedilir.</li>" +
        "<li><b>Telefonda.</b> Giriş yaparsan telefon ve bilgisayar aynı veriyi görür. Safari’de Paylaş → Ana Ekrana Ekle ile uygulama gibi açılır.</li>" +
      "</ol>" +
      '<p class="set-hint">Klavye: <kbd>G</kbd> <kbd>H</kbd> <kbd>A</kbd> gün / hafta / ay · <kbd>←</kbd> <kbd>→</kbd> önceki / sonraki · <kbd>T</kbd> bugün · <kbd>N</kbd> görev · <kbd>B</kbd> blok · <kbd>O</kbd> odak · <kbd>K</kbd> tema · <kbd>,</kbd> ayarlar</p>';
    S.modalOnClose = markSeen;
    App.openModal("Hoş geldin", body, '<button type="submit" class="btn">Başla</button>', () => App.closeModal(), true);
  }

  /* first run on this device with no data yet: show the card once */
  function maybeWelcome() {
    if (seen()) return;
    if (S.tasks.length || S.recurring.length || Object.keys(S.rangeDays).length) { markSeen(); return; }
    if (!$("modalBg").hidden) return;
    openWelcome();
  }

  /* shared with the other app-*.js files */
  Object.assign(App, {
    openWelcome,
    maybeWelcome
  });
})();
