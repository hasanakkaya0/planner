/* Planner — UI: settings helpers, shared state declarations, banner / toast / modal helpers.
   Shared mutable state lives on S and shared functions on App (both created in app-state.js). */
(function () {
  "use strict";
  /* ---------- settings (categories, kinds, appearance) ---------- */
    const catOf = (id) => S.cfg.cats.find((c) => c.id === id) || { id: id, name: "Diğer", color: "slate", other: true };
  const kindOf = (id) => S.cfg.kinds.find((k) => k.id === id) || S.cfg.kinds[0];
  const keyKinds = () => S.cfg.kinds.filter((k) => k.key).map((k) => k.id);
  const isKeyTask = (t) => !!t.imp || !!kindOf(t.kind).key;
  const kindRank = (t) => { const i = S.cfg.kinds.findIndex((k) => k.id === t.kind); return (isKeyTask(t) ? 0 : 100) + (i < 0 ? 99 : i); };
  const keyLabel = () => { const n = S.cfg.kinds.filter((k) => k.key).map((k) => k.name.toLocaleLowerCase("tr")); return n.length ? n.join("/") : "önemli"; };
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
    if (c === "invalid_argument") { S.writable = false; banner("Değişiklik kaydedilemedi: bu sayfada yazma yetkin yok.", true); }
    else if (c === "quota_exceeded") banner("Depolama doldu. Eski günlerin notlarını / bitmiş görevleri silmen gerekiyor.", true);
    else if (c === "resource_exhausted") banner("Çok hızlı gitti, bir saniye bekle ve tekrar dene.");
    else if (c === "revoked") banner("Erişim değişti; sayfayı yenile.", true);
    else banner("Kaydedilemedi, tekrar dene.");
  }
  const w = (p) => Promise.resolve(p).catch(onErr);
  function guard() {
    if (!S.store) { banner("Kayıt bağlantısı henüz hazır değil, bir saniye."); return false; }
    if (!S.writable) { banner("Görüntüleme modundasın; değişiklik kaydedilmez."); return false; }
    return true;
  }
  function guardDay() {
    if (!guard()) return false;
    if (!S.dayLoaded) { banner("Gün yükleniyor, bir saniye."); return false; }
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
    if (S.modalOnClose) { const f = S.modalOnClose; S.modalOnClose = null; f(); }
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
  const catOptions = (v) => S.cfg.cats.map((c) => opt(c.id, c.name, v)).join("") + (v && !S.cfg.cats.some((c) => c.id === v) ? opt(v, "Diğer", v) : "");
  const kindOptions = (v) => S.cfg.kinds.map((k) => opt(k.id, k.name, v)).join("");
  const dowChips = (arr) => [1, 2, 3, 4, 5, 6, 7].map((d) => '<button type="button" class="chip" data-dow="' + d + '" aria-pressed="' + (arr.indexOf(d) >= 0) + '">' + GD.ISO_KISA[d] + "</button>").join("");
  const pickedDows = () => Array.from(document.querySelectorAll("#modal .chip[data-dow]")).filter((c) => c.getAttribute("aria-pressed") === "true").map((c) => +c.dataset.dow);

  /* ---------- hesaplanan ---------- */
  const currentBlocks = () => GD.blocksForDay(S.dayDoc, S.recurring, S.sel);

  /* shared with the other app-*.js files */
  Object.assign(App, {
    catOf,
    kindOf,
    keyKinds,
    isKeyTask,
    kindRank,
    keyLabel,
    keyDeco,
    keyColor,
    keyName,
    kindPill,
    WK_H,
    banner,
    onErr,
    w,
    guard,
    guardDay,
    toast,
    openModal,
    closeModal,
    modalOpen,
    mErr,
    armed,
    dayName,
    opt,
    catOptions,
    kindOptions,
    dowChips,
    pickedDows,
    currentBlocks
  });
})();
