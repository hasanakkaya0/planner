/* Planner — UI: "Yenilikler" (what's new). After an update, a returning user sees the big changes once, each with a
   button that opens the feature. New users get the welcome card instead (and are marked as up to date).
   To announce something later: add an entry at the TOP of NEWS (a new id); everybody who has seen an older id sees
   just the newer entries. Settings → Yardım → "Yenilikler" shows the whole list again.
   Shared mutable state lives on S and shared functions on App (both created in app-state.js). */
(function () {
  "use strict";
  const KEY = "gunDefteri.news";

  /* newest first */
  const NEWS = [
    {
      id: "2026-11", date: "Kasım 2026", title: "Büyük güncelleme",
      items: [
        { t: "Renk paletleri ve temalar", d: "Mandalina, Sakız, Akuamarin ve gözü yormayan Sakin paleti. Hepsinin açık ve koyu hâli var; bir de tam siyah (OLED) tema. Yazı boyutunu ve yerleşimi de değiştirebilirsin.", w: "Ayarlar → Görünüm", open: "settings", b: "Paletlere bak" },
        { t: "Notlar ve ortalama (GANO)", d: "ODTÜ harf notlarıyla dönem GPA'sı ve GANO. Tekrar alınan derste yeni not geçerli. “Ya olursa” modu, hedef GANO ve arkadaşların için kaydedilmeyen bir Hızlı hesap.", w: "Üst çubuk → mezuniyet kepi", open: "grades", b: "Notlara git" },
        { t: "Tekrarlayan görevler, not ve alt görevler", d: "“Her pazartesi spor” gibi görevler; her günü ayrı tamamlarsın. Her göreve not ve küçük bir yapılacaklar listesi ekleyebilirsin.", w: "Görevler → ↻ Tekrarlayan" },
        { t: "İstatistikler", d: "Son 7, 30 ya da 90 günde odak süren, biten görevlerin, rutin oranın ve hangi derse ne kadar çalıştığın.", w: "Üst çubuk → grafik düğmesi (I)", open: "stats", b: "İstatistiklere bak" },
        { t: "Bugün ekranı", d: "Şimdi ya da Sıradaki dersi gösteren şerit, günün ilerleme halkası, selamlama ve devam eden bloğun vurgusu.", w: "Gün görünümü" },
        { t: "Telefonda kolaylıklar", d: "Görev satırını sağa kaydır: tamam, sola kaydır: yarına. Ay görünümünde güne dokununca o günün listesi altta açılır.", w: "Telefonda" },
        { t: "Hatırlatmalar", d: "Ders başlamadan ve sınav ya da teslim gününün sabahı ile bir gün önce akşamı haber verir. Uygulama açıkken çalışır.", w: "Ayarlar → Hatırlatmalar…", open: "remind", b: "Hatırlatmaları aç" },
        { t: "Hafta görünümü ve küçük iyileştirmeler", d: "Görevleri haftadan tamamla; görev arama ve filtre, dönem sonu aracı, çevrimdışı rozeti, açılış ekranı, tam yedek ve toplu geri yükleme.", w: "Hafta görünümü, Ayarlar" }
      ]
    }
  ];

  const seen = () => { try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; } };
  const markSeen = () => { try { localStorage.setItem(KEY, NEWS[0].id); } catch (e) { /* none */ } };
  function unseen() {
    const i = NEWS.findIndex((n) => n.id === seen());
    return i < 0 ? NEWS : NEWS.slice(0, i);
  }

  const OPENERS = {
    settings: () => App.openSettings(), grades: () => App.openGrades(), stats: () => App.openStats(), remind: () => App.openReminders()
  };

  /* all = true: the whole list (from Settings); otherwise only what this device has not seen yet */
  function openNews(all) {
    const list = all ? NEWS : unseen();
    if (!list.length) return;
    const body = list.map((n) => '<h3 class="nw-h">' + esc(n.title) + '<span>' + esc(n.date) + "</span></h3><ul class=\"news\">" + n.items.map((it) =>
      "<li><b>" + esc(it.t) + "</b><p>" + esc(it.d) + '</p><div class="nw-row"><span class="nw-where">' + esc(it.w) + "</span>" +
      (it.open ? '<button type="button" class="btn-ghost" data-news-open="' + it.open + '">' + esc(it.b || "Aç") + "</button>" : "") + "</div></li>").join("") + "</ul>").join("");
    S.modalOnClose = markSeen;
    App.openModal("Planner'a neler geldi?", '<p class="info">Son güncellemelerde eklenenler. İstediğin zaman Ayarlar → Yenilikler’den tekrar bakabilirsin.</p>' + body,
      '<button type="submit" class="btn">Tamam</button>', () => App.closeModal(), true);
    $("modal").onclick = (e) => {
      const x = e.target.closest("[data-news-open]");
      if (!x) return;
      App.closeModal();
      OPENERS[x.dataset.newsOpen]();
    };
  }

  /* a returning user who has not seen the latest entry; a brand-new user gets the welcome card instead */
  function maybeNews() {
    if (!unseen().length) return;
    if (!$("modalBg").hidden) { markSeen(); return; }   /* the welcome card is open: that is the tour */
    openNews(false);
  }

  /* shared with the other app-*.js files */
  Object.assign(App, {
    openNews,
    maybeNews,
    markNewsSeen: markSeen
  });
})();
