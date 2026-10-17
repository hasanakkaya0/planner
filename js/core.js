/* Planner — hesaplama çekirdeği.
   Arayüzden ve depolamadan bağımsız; tarayıcıda window.GD, node'da require("./core.js"). */
(function (root) {
  "use strict";

  var GUN = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
  var GUNK = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
  var AY = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  /* ISO hafta günü: 1 = Pazartesi … 7 = Pazar */
  var ISO_KISA = { 1: "Pzt", 2: "Sal", 3: "Çar", 4: "Per", 5: "Cum", 6: "Cmt", 7: "Paz" };
  var CATS = ["ders", "is", "kisisel"];
  var CATNAME = { ders: "Ders", is: "Kulüp / İş", kisisel: "Kişisel" };
  var KINDS = ["normal", "teslim", "sinav"];
  var KINDNAME = { normal: "Görev", teslim: "Teslim", sinav: "Sınav" };
  var DAY_START = 6, DAY_END = 24; // ayarlardan setDayRange ile değişir

  /* ---------- tarih ---------- */
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function key(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function isKey(k) { return typeof k === "string" && /^\d{4}-\d{2}-\d{2}$/.test(k); }
  function parseKey(k) { var p = k.split("-"); return new Date(+p[0], +p[1] - 1, +p[2], 12); } // öğlen: DST kaymasına karşı
  function addDays(k, n) { var d = parseKey(k); d.setDate(d.getDate() + n); return key(d); }
  function isoDow(k) { return ((parseKey(k).getDay() + 6) % 7) + 1; }
  function weekStart(k) { return addDays(k, -(isoDow(k) - 1)); }
  function diffDays(a, b) { return Math.round((parseKey(b) - parseKey(a)) / 86400000); } // b - a
  function weekDays(k) { var ws = weekStart(k), out = []; for (var i = 0; i < 7; i++) out.push(addDays(ws, i)); return out; }
  function monthStart(k) { return k.slice(0, 8) + "01"; }
  function daysInMonth(y, m0) { return new Date(y, m0 + 1, 0).getDate(); }
  /* n ay ileri/geri; gün ay sonuna sığmazsa ay sonuna kırpılır (31 Oca + 1 ay = 28/29 Şub) */
  function addMonths(k, n) {
    var p = k.split("-"), y = +p[0], m = +p[1] - 1 + n, d = +p[2];
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + "-" + pad(m + 1) + "-" + pad(Math.min(d, daysInMonth(y, m)));
  }
  /* Ay takvimi: ayın 1'ini içeren haftanın Pazartesi'sinden başlayan 6 hafta (42 gün) */
  function monthGrid(k) {
    var start = weekStart(monthStart(k)), out = [];
    for (var i = 0; i < 42; i++) out.push(addDays(start, i));
    return out;
  }
  /* ISO 8601 hafta numarası */
  function isoWeek(k) {
    var thu = addDays(k, 4 - isoDow(k));          // haftanın Perşembe'si
    var jan1 = thu.slice(0, 4) + "-01-01";
    return Math.floor(diffDays(jan1, thu) / 7) + 1;
  }
  /* "12–18 Ekim" · "28 Eylül – 4 Ekim" · "29 Aralık 2026 – 4 Ocak 2027" */
  function weekLabel(k) {
    var a = parseKey(weekStart(k)), b = parseKey(addDays(weekStart(k), 6));
    if (a.getFullYear() !== b.getFullYear()) return a.getDate() + " " + AY[a.getMonth()] + " " + a.getFullYear() + " – " + b.getDate() + " " + AY[b.getMonth()] + " " + b.getFullYear();
    if (a.getMonth() !== b.getMonth()) return a.getDate() + " " + AY[a.getMonth()] + " – " + b.getDate() + " " + AY[b.getMonth()];
    return a.getDate() + "–" + b.getDate() + " " + AY[a.getMonth()];
  }

  /* ---------- saat ---------- */
  function toMin(t) {
    if (typeof t !== "string" || !/^\d{1,2}:\d{2}$/.test(t)) return null;
    var p = t.split(":"), h = +p[0], m = +p[1];
    if (h > 24 || m > 59 || (h === 24 && m > 0)) return null;
    return h * 60 + m;
  }
  function fmtMin(m) { return pad(Math.floor(m / 60)) + ":" + pad(m % 60); }
  function durText(min) {
    var h = Math.floor(min / 60), m = min % 60;
    if (!h) return m + " dk";
    return m ? h + " sa " + m + " dk" : h + " sa";
  }

  /* blok doğrulama: hata metni ya da null */
  function blockError(s, e, t) {
    if (!t || !String(t).trim()) return "Başlık yaz.";
    if (s == null || e == null) return "Saatleri SS:DD biçiminde gir.";
    if (e <= s) return "Bitiş saati başlangıçtan sonra olmalı.";
    if (s < DAY_START * 60) return "Çizelge " + pad(DAY_START) + ":00'da başlıyor.";
    if (e > DAY_END * 60) return "Bitiş en geç " + pad(DAY_END) + ":00 olabilir.";
    return null;
  }

  /* ---------- çizelge ---------- */
  /* Tekrarlayan ders/blok serisi o gün geçerli mi? r = {dow:[1..7], from, until|null} */
  function recurringOn(r, k) {
    if (!r || !Array.isArray(r.dow) || r.dow.indexOf(isoDow(k)) < 0) return false;
    if (r.from && k < r.from) return false;
    if (r.until && k > r.until) return false;
    return true;
  }

  /* O günün tüm blokları: tek seferlikler + tekrarlayanlar (gün belgesinde atlananlar hariç) */
  function blocksForDay(dayDoc, recurring, k) {
    var out = [];
    var skip = (dayDoc && Array.isArray(dayDoc.skip)) ? dayDoc.skip : [];
    ((dayDoc && dayDoc.blocks) || []).forEach(function (b) {
      if (typeof b.s === "number" && typeof b.e === "number") out.push(Object.assign({}, b, { rec: false }));
    });
    (recurring || []).forEach(function (r) {
      if (skip.indexOf(r.id) >= 0 || !recurringOn(r, k)) return;
      out.push({ id: r.id, s: r.s, e: r.e, t: r.t, c: r.c, loc: r.loc || "", rec: true });
    });
    return out.sort(function (a, b) { return a.s - b.s || a.e - b.e; });
  }

  /* Çakışan blokları yan yana şeritlere dağıtır; her bloğa _lane ve _lanes ekler. */
  function lanes(blocks) {
    var sorted = blocks.map(function (b) { return Object.assign({}, b); })
      .sort(function (a, b) { return a.s - b.s || a.e - b.e; });
    var out = [], cluster = [], clusterEnd = -1;
    function flush() {
      if (!cluster.length) return;
      var ends = [];
      cluster.forEach(function (b) {
        var i = 0;
        while (i < ends.length && ends[i] > b.s) i++;
        if (i === ends.length) ends.push(b.e); else ends[i] = b.e;
        b._lane = i;
      });
      cluster.forEach(function (b) { b._lanes = ends.length; out.push(b); });
      cluster = []; clusterEnd = -1;
    }
    sorted.forEach(function (b) {
      if (cluster.length && b.s >= clusterEnd) flush();
      cluster.push(b); clusterEnd = Math.max(clusterEnd, b.e);
    });
    flush();
    return out;
  }

  /* Plansız boşlukları bul (ör. çalışma için) — min dakikadan uzun olanlar */
  function freeSlots(blocks, from, to, min) {
    var busy = blocks.map(function (b) { return [Math.max(b.s, from), Math.min(b.e, to)]; })
      .filter(function (x) { return x[1] > x[0]; })
      .sort(function (a, b) { return a[0] - b[0]; });
    var out = [], cur = from;
    busy.forEach(function (x) {
      if (x[0] - cur >= min) out.push({ s: cur, e: x[0] });
      cur = Math.max(cur, x[1]);
    });
    if (to - cur >= min) out.push({ s: cur, e: to });
    return out;
  }

  function plannedMinutes(blocks) {
    var segs = blocks.map(function (b) { return [b.s, b.e]; }).sort(function (a, b) { return a[0] - b[0]; });
    var total = 0, cs = -1, ce = -1;
    segs.forEach(function (x) {
      if (x[0] > ce) { if (ce > cs) total += ce - cs; cs = x[0]; ce = x[1]; }
      else ce = Math.max(ce, x[1]);
    });
    if (ce > cs) total += ce - cs;
    return total;
  }

  /* ---------- görevler ---------- */
  /* Seçili günde görünecek görevler.
     - o güne tarihli olanlar
     - seçili gün BUGÜN ise: tarihi geçmiş, bitmemiş olanlar (gecikmiş)
     - tarihsiz ve bitmemiş olanlar (her gün) */
  function visibleTasks(tasks, sel, today) {
    var out = [];
    tasks.forEach(function (t) {
      if (t.date === sel) out.push({ t: t, late: false });
      else if (sel === today && !t.done && t.date && t.date < today) out.push({ t: t, late: true });
      else if (!t.date && !t.done) out.push({ t: t, late: false });
    });
    return out;
  }
  function overdue(tasks, today) {
    return tasks.filter(function (t) { return !t.done && t.date && t.date < today; });
  }
  var DEFAULT_KEY = ["sinav", "teslim"];
  /* öne çıkan görev mi: türü öne çıkıyorsa ya da görev tek başına yıldızlıysa (imp) */
  function isKeyTask(t, kk) { return !!t.imp || (kk || DEFAULT_KEY).indexOf(t.kind) >= 0; }
  /* Önümüzdeki N gündeki öne çıkan görevler (sınav, teslim…; bugün dahil), tarihe göre.
     keyKinds: öne çıkan tür id'leri (ayarlardan) */
  function upcoming(tasks, today, days, keyKinds) {
    var kk = keyKinds || DEFAULT_KEY, last = addDays(today, days);
    return tasks.filter(function (t) {
      return !t.done && isKeyTask(t, kk) && t.date && t.date >= today && t.date <= last;
    }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0); });
  }
  function openCountByDay(tasks, k) {
    var n = 0;
    tasks.forEach(function (t) { if (t.date === k && !t.done) n++; });
    return n;
  }
  function untilText(today, k) {
    var d = diffDays(today, k);
    if (d === 0) return "bugün";
    if (d === 1) return "yarın";
    if (d < 0) return -d + " gün geçti";
    return d + " gün kaldı";
  }

  /* Bir günün özeti (hafta / ay görünümleri için).
     dayDoc: o günün belgesi (yoksa null) · tasks: tüm görevler */
  function daySummary(dayDoc, recurring, tasks, k, keyKinds) {
    var kk = keyKinds || DEFAULT_KEY;
    var blocks = blocksForDay(dayDoc, recurring, k);
    var mine = tasks.filter(function (t) { return t.date === k; });
    var rank = function (t) { var i = kk.indexOf(t.kind); return i < 0 ? kk.length : i; };
    var key = mine.filter(function (t) { return isKeyTask(t, kk); })
      .sort(function (a, b) { return rank(a) - rank(b); });
    return {
      blocks: blocks,
      mins: plannedMinutes(blocks),
      open: mine.filter(function (t) { return !t.done; }).length,
      done: mine.filter(function (t) { return t.done; }).length,
      key: key,                                   // sınav / teslimler (bitmişler dahil)
      note: !!(dayDoc && dayDoc.note && String(dayDoc.note).trim())
    };
  }

  /* Görevleri o günün bloklarına bağlar (bloktaki "balon").
     - her görev elle bağlanabilir (blk); öne çıkan türler (quiz, sınav…) ayrıca adından otomatik bulunur
     - görevde blk = blok id'si varsa ona bağlanır; blk = "-" ise hiçbir bloğa bağlanmaz
     - yoksa otomatik: görev adında bloğun adı geçiyorsa ("Stat363 Quiz" ↔ "Stat363"), en uzun eşleşen ad kazanır
     Döner: { byBlock: {blokId: [görev]}, byTask: {görevId: blok} } */
  function linkKeyTasks(blocks, tasks, k, keyKinds) {
    var kk = keyKinds || DEFAULT_KEY, byBlock = {}, byTask = {};
    var key = function (s) { return fold(s).replace(/[^a-z0-9]/g, ""); };
    var bl = (blocks || []).slice().sort(function (a, b) { return a.s - b.s; });
    (tasks || []).forEach(function (t) {
      if (t.date !== k || t.blk === "-") return;
      var isKey = isKeyTask(t, kk);
      if (!isKey && !t.blk) return;            /* normal görevler yalnızca elle bağlanır */
      var hit = null;
      if (t.blk) hit = bl.filter(function (b) { return b.id === t.blk; })[0] || null;
      if (!hit && isKey) {
        var tk = key(t.title), best = 0;
        bl.forEach(function (b) {
          var bk = key(b.t);
          if (bk.length >= 3 && tk.indexOf(bk) >= 0 && bk.length > best) { best = bk.length; hit = b; }
        });
      }
      if (hit) { (byBlock[hit.id] = byBlock[hit.id] || []).push(t); byTask[t.id] = hit; }
    });
    return { byBlock: byBlock, byTask: byTask };
  }

  /* ---------- rutinler ---------- */
  /* logs: {"2026-10-16": {habitId: true}} */
  function doneOn(logs, k, hid) { return !!(logs[k] && logs[k][hid]); }

  /* Günlük seri: seçili gün yapılmadıysa dünden geriye sayar (gün bitmedi diye seri kırılmaz) */
  function streak(logs, hid, sel) {
    var n = 0, k = sel;
    if (!doneOn(logs, sel, hid)) k = addDays(sel, -1);
    while (doneOn(logs, k, hid)) { n++; k = addDays(k, -1); if (n > 3660) break; }
    return n;
  }
  /* Haftalık (Pzt–Paz) kaç gün yapıldı */
  function weekCount(logs, hid, sel) {
    var ws = weekStart(sel), n = 0;
    for (var i = 0; i < 7; i++) if (doneOn(logs, addDays(ws, i), hid)) n++;
    return n;
  }
  /* Haftalık hedefli rutinde, hedefi tutturan ardışık hafta sayısı (bu hafta tamamlandıysa dahil) */
  function weekStreak(logs, hid, sel, target) {
    var ws = weekStart(sel), n = 0;
    if (weekCount(logs, hid, ws) < target) ws = addDays(ws, -7);
    while (weekCount(logs, hid, ws) >= target) { n++; ws = addDays(ws, -7); if (n > 520) break; }
    return n;
  }
  /* rutin özet metni: günlük → "5g", haftalık hedef → "2/3" */
  function habitProgress(logs, h, sel) {
    var target = h.target && h.target < 7 ? h.target : 7;
    if (target === 7) return { mode: "daily", streak: streak(logs, h.id, sel) };
    return { mode: "weekly", count: weekCount(logs, h.id, sel), target: target, weeks: weekStreak(logs, h.id, sel, target) };
  }

  /* ---------- hızlı ekleme: tek satırdan görev / blok ----------
     "yarın 14:00-15:30 Matematik #ders"      → blok
     "cuma STAT quiz !sınav"                  → görev (öne çıkan tür)
     "haftaya pzt 10:00 sunum !teslim"        → görev + o saate blok
     "her pzt çar 10:40-12:30 STAT 311 #ders" → haftalık blok
     "kitap iade 3 gün sonra"                 → görev */
  var AY_N = ["ocak", "subat", "mart", "nisan", "mayis", "haziran", "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik"];
  var GUN_N = { pazartesi: 1, pzt: 1, sali: 2, sal: 2, carsamba: 3, car: 3, persembe: 4, per: 4, cuma: 5, cum: 5, cumartesi: 6, cmt: 6, pazar: 7, paz: 7 };
  function fold(s) {
    return String(s).toLocaleLowerCase("tr")
      .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c").replace(/â/g, "a").replace(/î/g, "i");
  }
  /* "cuma'ya", "14:00'te" → ek atılır */
  function stem(t) { return fold(t).split(/['’]/)[0].replace(/[.,;:!?]+$/, function (m) { return /^\d/.test(t) ? m : ""; }); }
  function matchNamed(list, q) {
    q = fold(q).replace(/[^a-z0-9]/g, "");
    if (!q) return null;
    var keyOf = function (x) { return fold(x.name).replace(/[^a-z0-9]/g, ""); };
    return list.filter(function (x) { return keyOf(x) === q || x.id === q; })[0] ||
      list.filter(function (x) { return keyOf(x).indexOf(q) === 0; })[0] || null;
  }
  function validDate(y, m, d) { var x = new Date(y, m - 1, d, 12); return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d; }
  /* y yoksa: bugünden önceyse gelecek yıl */
  function mkDate(y, m, d, today) {
    var yy = y || +today.slice(0, 4);
    if (!validDate(yy, m, d)) return null;
    var k = yy + "-" + pad(m) + "-" + pad(d);
    if (!y && k < today) { if (!validDate(yy + 1, m, d)) return null; k = (yy + 1) + "-" + pad(m) + "-" + pad(d); }
    return k;
  }
  function nextDow(today, dow, weekOffset) {
    if (weekOffset) return addDays(weekStart(today), 7 * weekOffset + dow - 1);
    var diff = (dow - isoDow(today) + 7) % 7;
    return addDays(today, diff);
  }
  function hm(h, m) { h = +h; m = m == null || m === "" ? 0 : +m; if (h > 24 || m > 59 || (h === 24 && m)) return null; return h * 60 + m; }

  function parseQuick(text, today, base, cats, kinds) {
    var res = { title: "", date: null, s: null, e: null, dur: null, cat: null, kind: null, loc: "", dow: [], warnings: [] };
    var raw = String(text || "").replace(/[–—]/g, "-").replace(/\s+-\s+/g, "-").trim();
    if (!raw) return { ok: false, error: "" };
    var toks = raw.split(/\s+/), used = toks.map(function () { return false; });
    var f = toks.map(stem);
    var i, m;
    function take() { for (var a = 0; a < arguments.length; a++) used[arguments[a]] = true; }
    for (i = 0; i < toks.length; i++) {
      if (used[i]) continue;
      var t = f[i], nx = f[i + 1], nx2 = f[i + 2];
      /* @yer (ör. @MM-101, @Kütüphane) */
      if (/^@./.test(toks[i])) { res.loc = (res.loc ? res.loc + " " : "") + toks[i].slice(1); take(i); continue; }
      /* #kategori, !tür */
      if (/^#/.test(toks[i])) {
        var c = matchNamed(cats || [], toks[i].slice(1));
        if (c) res.cat = c.id; else res.warnings.push("“" + toks[i] + "” diye bir kategori yok");
        take(i); continue;
      }
      if (/^!/.test(toks[i]) && toks[i].length > 1) {
        var k = matchNamed(kinds || [], toks[i].slice(1));
        if (k) res.kind = k.id; else res.warnings.push("“" + toks[i] + "” diye bir tür yok");
        take(i); continue;
      }
      /* her pzt çar / her gün / hafta içi */
      if (t === "her") {
        var j = i + 1, got = [];
        while (j < toks.length) {
          var w = f[j];
          if (GUN_N[w]) { got.push(GUN_N[w]); j++; continue; }
          if ((w === "ve" || w === ",") && GUN_N[f[j + 1]]) { j++; continue; }
          if (w === "gun" && !got.length) { got = [1, 2, 3, 4, 5, 6, 7]; j++; break; }
          break;
        }
        if (got.length) { for (var q = i; q < j; q++) used[q] = true; res.dow = res.dow.concat(got); i = j - 1; continue; }
      }
      if (t === "hafta" && nx === "ici") { res.dow = res.dow.concat([1, 2, 3, 4, 5]); take(i, i + 1); continue; }
      /* tarih: bugün / yarın / öbür gün / N gün sonra / haftaya [gün] / gün adı */
      if (t === "bugun") { res.date = today; take(i); continue; }
      if (t === "yarin") { res.date = addDays(today, 1); take(i); continue; }
      if ((t === "obur" || t === "ertesi") && nx === "gun") { res.date = addDays(today, 2); take(i, i + 1); continue; }
      if (/^\d{1,3}$/.test(t) && (nx === "gun" || nx === "hafta") && nx2 === "sonra") {
        res.date = addDays(today, +t * (nx === "hafta" ? 7 : 1)); take(i, i + 1, i + 2); continue;
      }
      if (t === "haftaya") {
        if (GUN_N[nx]) { res.date = nextDow(today, GUN_N[nx], 1); take(i, i + 1); }
        else { res.date = addDays(today, 7); take(i); }
        continue;
      }
      if (GUN_N[t]) { res.date = nextDow(today, GUN_N[t]); take(i); continue; }
      /* 16 ekim [2026] (ay adı ya da en az 3 harflik başı: "16 eki") */
      var mi = nx && nx.length >= 3 ? AY_N.findIndex(function (a) { return a.indexOf(nx) === 0; }) : -1;
      if (/^\d{1,2}$/.test(t) && mi >= 0) {
        var yr = /^\d{4}$/.test(nx2 || "") ? +nx2 : null;
        var dk = mkDate(yr, mi + 1, +t, today);
        if (dk) { res.date = dk; take(i, i + 1); if (yr) take(i + 2); continue; }
      }
      /* 2026-10-16 */
      if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)) && validDate(+m[1], +m[2], +m[3])) { res.date = m[0]; take(i); continue; }
      /* saat aralığı: 14:00-15:30, 14-16 (yalnız "saat" ile), 9:30-11 */
      if ((m = /^(\d{1,2})(?::(\d{2}))?-(\d{1,2})(?::(\d{2}))?$/.exec(t)) && (/:/.test(t) || f[i - 1] === "saat")) {
        var a1 = hm(m[1], m[2]), a2 = hm(m[3], m[4]);
        if (a1 != null && a2 != null && a2 > a1) { res.s = a1; res.e = a2; take(i); if (f[i - 1] === "saat") take(i - 1); continue; }
      }
      if ((m = /^(\d{1,2})\.(\d{2})-(\d{1,2})\.(\d{2})$/.exec(t))) {
        var b1 = hm(m[1], m[2]), b2 = hm(m[3], m[4]);
        if (b1 != null && b2 != null && b2 > b1) { res.s = b1; res.e = b2; take(i); continue; }
      }
      /* 16.10 / 16/10 / 16.10.2026 → tarih (ikinci sayı ≤ 12); 14.30 → saat (ikinci sayı > 12) */
      if ((m = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?$/.exec(t))) {
        var mm = +m[2];
        if (mm >= 1 && mm <= 12) {
          var dk2 = mkDate(m[3] ? +m[3] : null, mm, +m[1], today);
          if (dk2) { res.date = dk2; take(i); continue; }
        } else if (t.indexOf(".") >= 0 && !m[3] && m[2].length === 2 && hm(m[1], m[2]) != null) { res.s = hm(m[1], m[2]); take(i); continue; }
      }
      /* tek saat: 14:00 / saat 14 / saat 14:30 */
      if ((m = /^(\d{1,2}):(\d{2})$/.exec(t)) && hm(m[1], m[2]) != null) { res.s = hm(m[1], m[2]); take(i); continue; }
      if (t === "saat" && nx && (m = /^(\d{1,2})(?::(\d{2}))?$/.exec(nx)) && hm(m[1], m[2]) != null && !/^(dk|dakika|saat|sa)$/.test(nx2 || "")) {
        res.s = hm(m[1], m[2]); take(i, i + 1); continue;
      }
      /* süre: 90dk, 1.5saat, 2 saat, 45 dk */
      if ((m = /^(\d+(?:[.,]\d+)?)(dk|dakika|sa|saat|s)$/.exec(t))) {
        res.dur = Math.round(parseFloat(m[1].replace(",", ".")) * (m[2] === "dk" || m[2] === "dakika" ? 1 : 60)); take(i); continue;
      }
      if (/^\d+(?:[.,]\d+)?$/.test(t) && /^(dk|dakika|sa|saat)$/.test(nx || "")) {
        res.dur = Math.round(parseFloat(t.replace(",", ".")) * (nx === "dk" || nx === "dakika" ? 1 : 60)); take(i, i + 1); continue;
      }
    }
    res.title = toks.filter(function (_, x) { return !used[x]; }).join(" ").replace(/\s+/g, " ").trim();
    res.dow = res.dow.filter(function (d, x, arr) { return arr.indexOf(d) === x; }).sort();
    if (res.s != null && res.e == null) res.e = Math.min(res.s + (res.dur || 60), 24 * 60);
    if (!res.title) return { ok: false, error: "Başlık yaz.", parsed: res };
    if (res.dow.length) {
      if (res.s == null) return { ok: false, error: "Haftalık blok için saat yaz (ör. 10:40-12:30).", parsed: res };
      res.type = "recurring";
    } else if (res.s != null && res.kind && res.kind !== "normal") res.type = "both";
    else if (res.s != null) res.type = "block";
    else res.type = "task";
    if (!res.date && res.type !== "recurring") res.date = base || today;
    res.ok = true;
    return res;
  }

  /* ---------- ayarlar ---------- */
  var COLORS = ["blue", "violet", "green", "amber", "red", "pink", "teal", "slate"];
  var ACCENTS = ["violet", "blue", "green", "pink", "orange"];
  var UPC_DAYS = [7, 14, 30];
  var DEFAULT_SETTINGS = {
    cats: [
      { id: "ders", name: "Ders", color: "blue" },
      { id: "is", name: "Kulüp / İş", color: "amber" },
      { id: "kisisel", name: "Kişisel", color: "green" }
    ],
    kinds: [
      { id: "normal", name: "Görev", color: "slate", key: false },
      { id: "teslim", name: "Teslim", color: "amber", key: true },
      { id: "sinav", name: "Sınav", color: "red", key: true }
    ],
    defaultCat: "ders",
    dayStart: 6, dayEnd: 24,
    upcomingDays: 14,
    accent: "violet",
    focusMins: 25, breakMins: 5
  };
  var FOCUS_OPTS = [15, 20, 25, 30, 45, 50, 60, 90], BREAK_OPTS = [3, 5, 10, 15, 20];
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  var ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
  function cleanName(n, fb) { n = typeof n === "string" ? n.trim().slice(0, 24) : ""; return n || fb; }
  function cleanList(arr, fbColor) {
    var seen = {}, out = [];
    (Array.isArray(arr) ? arr : []).forEach(function (x) {
      if (!x || !ID_RE.test(x.id) || seen[x.id] || out.length >= 10) return;
      seen[x.id] = 1;
      out.push({ id: x.id, name: cleanName(x.name, x.id), color: COLORS.indexOf(x.color) >= 0 ? x.color : fbColor, key: !!x.key });
    });
    return out;
  }
  /* Kayıtlı ayar belgesini doğrular, eksikleri varsayılanla doldurur. Ne gelirse gelsin geçerli bir ayar döner. */
  function normalizeSettings(raw) {
    var d = clone(DEFAULT_SETTINGS);
    if (!raw || typeof raw !== "object") return d;
    var cats = cleanList(raw.cats, "slate").map(function (c) { return { id: c.id, name: c.name, color: c.color }; });
    if (cats.length) d.cats = cats;
    var kinds = cleanList(raw.kinds, "slate");
    if (kinds.length) {
      var normal = kinds.filter(function (k) { return k.id === "normal"; })[0] || { id: "normal", name: "Görev", color: "slate" };
      d.kinds = [normal].concat(kinds.filter(function (k) { return k.id !== "normal"; }));
    }
    d.defaultCat = d.cats.some(function (c) { return c.id === raw.defaultCat; }) ? raw.defaultCat : d.cats[0].id;
    var s = Math.round(+raw.dayStart), e = Math.round(+raw.dayEnd);
    if (s >= 0 && s <= 12 && e >= 14 && e <= 24 && e - s >= 6) { d.dayStart = s; d.dayEnd = e; }
    if (UPC_DAYS.indexOf(+raw.upcomingDays) >= 0) d.upcomingDays = +raw.upcomingDays;
    if (ACCENTS.indexOf(raw.accent) >= 0) d.accent = raw.accent;
    if (FOCUS_OPTS.indexOf(+raw.focusMins) >= 0) d.focusMins = +raw.focusMins;
    if (BREAK_OPTS.indexOf(+raw.breakMins) >= 0) d.breakMins = +raw.breakMins;
    return d;
  }
  function setDayRange(s, e) {
    DAY_START = s; DAY_END = e;
    GD.DAY_START = s; GD.DAY_END = e;
  }

  /* ---------- yedek ---------- */
  /* Dışa aktarılan JSON'u doğrular ve normalize eder; hatalıysa Error fırlatır */
  function normalizeBackup(obj) {
    if (!obj || typeof obj !== "object") throw new Error("Dosya boş ya da JSON değil.");
    if (obj.app !== "planner" && obj.app !== "gun-defteri") throw new Error("Bu dosya Planner yedeği değil."); // gun-defteri: eski ad
    var out = { tasks: {}, habits: {}, habitlog: {}, days: {}, recurring: {}, settings: {}, focus: {} };
    Object.keys(out).forEach(function (c) {
      var src = obj.data && obj.data[c];
      if (!src) return;
      if (typeof src !== "object" || Array.isArray(src)) throw new Error(c + " bölümü bozuk.");
      Object.keys(src).forEach(function (id) {
        if (!/^[A-Za-z0-9_\-.~:@+]{1,200}$/.test(id)) return;
        if (src[id] && typeof src[id] === "object") out[c][id] = src[id];
      });
    });
    return out;
  }

  var GD = {
    GUN: GUN, GUNK: GUNK, AY: AY, ISO_KISA: ISO_KISA, CATS: CATS, CATNAME: CATNAME, KINDS: KINDS, KINDNAME: KINDNAME,
    DAY_START: DAY_START, DAY_END: DAY_END,
    pad: pad, key: key, isKey: isKey, parseKey: parseKey, addDays: addDays, isoDow: isoDow, weekStart: weekStart, diffDays: diffDays,
    weekDays: weekDays, monthStart: monthStart, addMonths: addMonths, monthGrid: monthGrid, isoWeek: isoWeek, weekLabel: weekLabel,
    daySummary: daySummary,
    toMin: toMin, fmtMin: fmtMin, durText: durText, blockError: blockError,
    recurringOn: recurringOn, blocksForDay: blocksForDay, lanes: lanes, freeSlots: freeSlots, plannedMinutes: plannedMinutes,
    visibleTasks: visibleTasks, overdue: overdue, upcoming: upcoming, openCountByDay: openCountByDay, untilText: untilText,
    doneOn: doneOn, streak: streak, weekCount: weekCount, weekStreak: weekStreak, habitProgress: habitProgress,
    normalizeBackup: normalizeBackup,
    COLORS: COLORS, ACCENTS: ACCENTS, UPC_DAYS: UPC_DAYS, DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    isKeyTask: isKeyTask, normalizeSettings: normalizeSettings, setDayRange: setDayRange,
    parseQuick: parseQuick, fold: fold, linkKeyTasks: linkKeyTasks, FOCUS_OPTS: FOCUS_OPTS, BREAK_OPTS: BREAK_OPTS
  };
  if (typeof module !== "undefined" && module.exports) module.exports = GD;
  else root.GD = GD;
})(this);
