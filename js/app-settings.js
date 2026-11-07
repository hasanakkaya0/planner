/* Planner — UI: theme, backup (export / import), settings window.
   Shared mutable state lives on S and shared functions on App (both created in app-state.js). */
(function () {
  "use strict";
  /* ---------- tema ---------- */
  function effectiveTheme() {
    const a = document.documentElement.getAttribute("data-theme");
    if (a === "black") return "dark";
    if (a === "dark" || a === "light") return a;
    return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function toggleTheme() {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    setThemePref(next);
    App.toast(next === "dark" ? "Koyu tema" : "Açık tema");
  }
  $("themeBtn").innerHTML =
    '<svg class="moon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1z"/></svg>' +
    '<svg class="sun" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="8" cy="8" r="2.8"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/></svg>';
  $("themeBtn").onclick = toggleTheme;

  /* ---------- yedek ---------- */
  async function exportData() {
    try {
      const data = await S.store.dump();
      const json = JSON.stringify({ app: "planner", version: 1, exportedAt: new Date().toISOString(), data: data }, null, 2);
      const name = "planner-yedek-" + S.TODAY + ".json";
      if (S.store.mode === "cloud") {
        const dl = await window.claude.use("downloads");
        if (!dl) { App.banner("Bu görünümde dosya indirilemiyor."); return; }
        try { await dl.save({ filename: name, data: json }); App.toast("Yedek indirildi"); return true; }
        catch (e) { if (e && e.code !== "declined") App.banner("Yedek indirilemedi."); }
      } else {
        /* iPhone / iPad: "Save to Files" through the share sheet */
        const file = typeof File === "function" ? new File([json], name, { type: "application/json" }) : null;
        if (file && navigator.canShare && matchMedia("(hover:none)").matches && navigator.canShare({ files: [file] })) {
          let shared = false;
          try { await navigator.share({ files: [file] }); shared = true; } catch (e) { /* cancelled */ }
          return shared;
        }
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
        a.download = name; document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        App.toast("Yedek indirildi");
        return true;
      }
    } catch (e) { App.banner("Yedek hazırlanamadı."); }
    return false;
  }
  function importFile(file) {
    const rd = new FileReader();
    rd.onload = () => {
      let data;
      try { data = GD.normalizeBackup(JSON.parse(rd.result)); }
      catch (e) { App.banner(e && e.message && !/JSON/.test(e.message) ? e.message : "Dosya okunamadı: geçerli bir Planner yedeği değil."); return; }
      const n = Object.keys(data).reduce((s, c) => s + Object.keys(data[c]).length, 0);
      App.openModal("Yedeği yükle", '<p class="info">' + n + " kayıt yüklenecek. Aynı kayıtlar yedektekiyle değişir, diğerleri olduğu gibi kalır.</p>",
        '<button type="submit" class="btn">Yükle</button><button type="button" class="btn-ghost" data-close>Vazgeç</button>', () => {
          if (!App.guard()) return;
          App.closeModal();
          App.banner("Yükleniyor… (" + n + " kayıt)", true);
          S.store.bulk(data).then((cnt) => { $("banner").hidden = true; App.toast(cnt + " kayıt yüklendi"); }, App.onErr);
        });
    };
    rd.readAsText(file);
  }

  /* ---------- theme preference (per device) ---------- */
  function themePref() {
    try { const t = localStorage.getItem("gunDefteri.theme"); return t === "light" || t === "dark" || t === "black" ? t : "system"; } catch (e) { return "system"; }
  }
  /* palettes: whole-app colour schemes, each with a light and a dark variant (the data-palette blocks in style.css) */
  const PALETTES = [
    ["default", "Mor", ["#5a4bd1", "#e9e5fd", "#fdfcff"]],
    ["mandalina", "Mandalina", ["#21232E", "#105BFF", "#FE8500"]],
    ["sakiz", "Sakız", ["#F0F0F0", "#5841FF", "#FF6AD2"]],
    ["akuamarin", "Akuamarin", ["#171F44", "#74FFED", "#FE81D1"]]
  ];
  const PALETTE_IDS = ["mandalina", "sakiz", "akuamarin"];
  function palettePref() {
    try { const p = localStorage.getItem("gunDefteri.palette"); return PALETTE_IDS.indexOf(p) >= 0 ? p : "default"; } catch (e) { return "default"; }
  }
  /* palette (or "default") + theme choice ("system" | "light" | "dark" | "black") → the attributes on <html>.
     With a palette the mode is always light or dark (black counts as dark), so the palette's matching variant applies. */
  function applyAppearance(p, t) {
    const root = document.documentElement;
    if (PALETTE_IDS.indexOf(p) >= 0) {
      const dark = t === "dark" || t === "black" || (t !== "light" && !!window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
      root.setAttribute("data-palette", p); root.setAttribute("data-theme", dark ? "dark" : "light");
    } else {
      root.removeAttribute("data-palette");
      if (t === "light" || t === "dark" || t === "black") root.setAttribute("data-theme", t); else root.removeAttribute("data-theme");
    }
    applyAccent();
  }
  function setPalette(p) {
    try { if (PALETTE_IDS.indexOf(p) >= 0) localStorage.setItem("gunDefteri.palette", p); else localStorage.removeItem("gunDefteri.palette"); } catch (e) { /* none */ }
    applyAppearance(palettePref(), themePref());
  }
  /* the main colour of the settings belongs to the default palette; the others bring their own */
  function applyAccent() {
    const root = document.documentElement;
    if (root.hasAttribute("data-palette") || !S.cfg || S.cfg.accent === "violet") root.removeAttribute("data-accent"); else root.setAttribute("data-accent", S.cfg.accent);
  }

  function setThemePref(p) {
    try { if (p === "light" || p === "dark" || p === "black") localStorage.setItem("gunDefteri.theme", p); else localStorage.removeItem("gunDefteri.theme"); } catch (e) { /* none */ }
    applyAppearance(palettePref(), themePref());
  }
  /* "Cihaza göre" + a palette: follow the device when it switches between light and dark */
  if (window.matchMedia) {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onSys = () => { if (themePref() === "system" && palettePref() !== "default") applyAppearance(palettePref(), "system"); };
    if (mq.addEventListener) mq.addEventListener("change", onSys); else if (mq.addListener) mq.addListener(onSys);
  }

  /* ---------- apply settings ---------- */
  let selectsFilled = false, lastDefCat = null;
  function fillSelects() {
    const defChanged = lastDefCat !== S.cfg.defaultCat;
    lastDefCat = S.cfg.defaultCat;
    const pickCat = (v) => (selectsFilled && !defChanged && S.cfg.cats.some((c) => c.id === v) ? v : S.cfg.defaultCat);
    const bc = pickCat($("bCat").value), tc = pickCat($("tCat").value), tk = $("tKind").value;
    $("bCat").innerHTML = App.catOptions(bc);
    $("tCat").innerHTML = App.catOptions(tc);
    $("tKind").innerHTML = App.kindOptions(S.cfg.kinds.some((k) => k.id === tk) ? tk : "normal");
    selectsFilled = true;
  }
  function applyCfg() {
    GD.setDayRange(S.cfg.dayStart, S.cfg.dayEnd);
    const root = document.documentElement;
    root.style.setProperty("--hours", String(S.cfg.dayEnd - S.cfg.dayStart));
    applyAccent();
    try { localStorage.setItem("gunDefteri.accent", S.cfg.accent); } catch (e) { /* none */ }
    fillSelects();
    App.renderAll();
  }

  /* ---------- ayarlar penceresi ---------- */
    const ACCENT_HEX = { violet: "#5a4bd1", blue: "#2f6fdb", green: "#2f7d58", pink: "#c03d8a", orange: "#c2611a" };

  function openSettings(draft) {
    const d = JSON.parse(JSON.stringify(draft || S.cfg));
    let theme = themePref(), picker = null, pal = palettePref(), paletteSaved = false;
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
    const defCatOpts = () => d.cats.map((c) => App.opt(c.id, c.name, d.defaultCat)).join("");
    let startOpts = "", endOpts = "";
    for (let h = 0; h <= 12; h++) startOpts += App.opt(String(h), GD.pad(h) + ":00", String(d.dayStart));
    for (let h = 14; h <= 24; h++) endOpts += App.opt(String(h), GD.pad(h) + ":00", String(d.dayEnd));
    const upcOpts = GD.UPC_DAYS.map((n) => App.opt(String(n), n + " gün", String(d.upcomingDays))).join("");
    const focOpts = GD.FOCUS_OPTS.map((n) => App.opt(String(n), n + " dk odak", String(d.focusMins))).join("");
    const brkOpts = GD.BREAK_OPTS.map((n) => App.opt(String(n), n + " dk mola", String(d.breakMins))).join("");
    const themeOpts = [["system", "Cihaza göre"], ["light", "Açık"], ["dark", "Koyu"], ["black", "Siyah"]].map((x) => '<button type="button" class="opt" data-theme-opt="' + x[0] + '" aria-pressed="' + (theme === x[0]) + '">' + x[1] + "</button>").join("");
    const palOpts = PALETTES.map((x) => '<button type="button" class="pal" data-palette-opt="' + x[0] + '" aria-pressed="' + (pal === x[0]) + '" title="' + x[1] + '"><span class="dots">' + x[2].map((c) => '<i style="background:' + c + '"></i>').join("") + "</span>" + x[1] + "</button>").join("");
    const accOpts = GD.ACCENTS.map((a) => '<button type="button" class="sw acc" data-acc="' + a + '" style="background:' + ACCENT_HEX[a] + '" aria-pressed="' + (d.accent === a) + '" title="' + ACCENTNAME[a] + '" aria-label="' + ACCENTNAME[a] + '"></button>').join("");

    const body =
      '<section class="set-sec"><h3>Görünüm</h3>' +
        '<div class="set-row"><span class="set-l">Tema</span><div class="opts" id="sTheme">' + themeOpts + "</div></div>" +
        '<div class="set-row"><span class="set-l">Palet</span><div class="pals" id="sPal">' + palOpts + "</div></div>" +
        '<p class="set-hint">Her palet açık ve koyu tema ile çalışır. Mor dışındaki paletlerde ana renk paletten gelir.</p>' +
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
      '<section class="set-sec"><h3>Kayıt</h3><p class="set-hint">' + S.modeHtml + "</p>" +
        '<div class="set-row">' + (S.canExport ? '<button type="button" class="btn-ghost" id="sExport">Yedek indir</button>' : "") +
        '<label class="btn-ghost filebtn">Yedek yükle<input type="file" id="sImport" accept="application/json,.json" hidden></label>' +
        (S.store && S.store.signOut ? '<span class="sp"></span><button type="button" class="btn-ghost" id="sSignOut">Çıkış yap</button>' : "") + "</div>" +
      "</section>" +
      '<section class="set-sec"><h3>Hatırlatma, dönem sonu ve yardım</h3><div class="set-row"><button type="button" class="btn-ghost" id="sRemind">Hatırlatmalar…</button><button type="button" class="btn-ghost" id="sTerm">Dönem sonu…</button><button type="button" class="btn-ghost" id="sWelcome">Tanıtımı göster</button></div></section>' +
      '<section class="set-sec about"><h3>Hakkında</h3>' +
        '<div class="about-row">' + document.querySelector(".brand .logo").outerHTML + '<div><b>Planner</b><br><span>Hasan Akkaya · <a href="https://github.com/hasanakkaya0" target="_blank" rel="noopener">GitHub</a> · <a href="https://www.linkedin.com/in/hasanakkaya0" target="_blank" rel="noopener">LinkedIn</a></span></div></div>' +
        '<p class="set-hint">Kısayollar: / hızlı ekle · G / H / A gün-hafta-ay · ← → önceki/sonraki · T bugün · N görev · B blok · O odak · K tema · , ayarlar</p>' +
      "</section>";
    const footer = '<button type="submit" class="btn">Kaydet</button><button type="button" class="btn-ghost" data-close>Vazgeç</button><span class="sp"></span><button type="button" class="btn-ghost" id="sReset" title="Kategoriler, türler ve görünüm varsayılana döner (kayıtlar silinmez)">Varsayılanlar</button>';

    App.openModal("Ayarlar", body, footer, () => {
      const empty = d.cats.concat(d.kinds).some((x) => !String(x.name || "").trim());
      if (empty) { App.mErr("Boş isim bırakma."); return; }
      if (d.dayEnd - d.dayStart < 6) { App.mErr("Saat çizelgesi en az 6 saat olmalı."); return; }
      if (!App.guard()) return;
      setThemePref(theme);
      setPalette(pal); paletteSaved = true;
      const clean = GD.normalizeSettings(d);
      App.w(S.store.set("settings", "main", Object.assign({}, clean, { updatedAt: Date.now() })));
      S.cfg = clean; App.closeModal(); applyCfg();
      App.toast("Ayarlar kaydedildi");
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
        applyAppearance(pal, theme);   /* live preview; reverted if the window is closed without saving */
      } else if ((x = e.target.closest("[data-palette-opt]"))) {
        pal = x.dataset.paletteOpt;
        M.querySelectorAll("[data-palette-opt]").forEach((b) => b.setAttribute("aria-pressed", String(b === x)));
        applyAppearance(pal, theme);
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
        if (d.cats.length >= 10) { App.mErr("En fazla 10 kategori."); return; }
        d.cats.push({ id: "c_" + uid(), name: "Yeni kategori", color: nextColor(d.cats) });
        redrawCats();
        const ins = $("sCats").querySelectorAll("input"); const last = ins[ins.length - 1]; last.focus(); last.select();
      } else if (e.target.closest("#sKindAdd")) {
        if (d.kinds.length >= 10) { App.mErr("En fazla 10 tür."); return; }
        d.kinds.push({ id: "k_" + uid(), name: "Yeni tür", color: nextColor(d.kinds), key: true });
        redrawKinds();
        const ins = $("sKinds").querySelectorAll("input[type=text]"); const last = ins[ins.length - 1]; last.focus(); last.select();
      } else if (e.target.closest("#sSignOut")) {
        App.closeModal(); S.store.signOut().then(() => location.reload());
      } else if (e.target.closest("#sWelcome")) {
        App.closeModal(); App.openWelcome();
      } else if (e.target.closest("#sRemind")) {
        App.closeModal(); App.openReminders();
      } else if (e.target.closest("#sTerm")) {
        App.closeModal(); App.openTermEnd();
      } else if (e.target.closest("#sExport")) {
        exportData();
      } else if (e.target.closest("#sReset")) {
        const keepAccentTheme = GD.normalizeSettings(null);
        App.closeModal(); openSettings(keepAccentTheme);
        App.mErr("Varsayılanlar yüklendi; kaydedersen uygulanır.");
      }
    };
    S.modalOnClose = () => { M.oninput = M.onchange = M.onclick = null; if (!paletteSaved) applyAppearance(palettePref(), themePref()); };
    const first = $("modal").querySelector(".body");
    if (first) first.scrollTop = 0;
  }

  /* shared with the other app-*.js files */
  Object.assign(App, {
    palettePref,
    setPalette,
    exportData,
    toggleTheme,
    applyCfg,
    openSettings
  });
})();
