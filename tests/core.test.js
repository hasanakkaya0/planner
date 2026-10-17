/* Run: node tests/core.test.js */
const GD = require("../js/core.js");
const GDStore = require("../js/store.js");
let pass = 0, fail = 0;
function eq(name, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  if (ok) pass++; else { fail++; console.log("✗", name, "→ expected", JSON.stringify(exp), "got", JSON.stringify(got)); }
}
function throws(name, fn, re) {
  try { fn(); fail++; console.log("✗", name, "→ expected an error"); }
  catch (e) { if (!re || re.test(e.message)) pass++; else { fail++; console.log("✗", name, "→ wrong error:", e.message); } }
}
const TODAY = "2026-10-16"; // Cuma

/* 1) tarih */
eq("ay sonu geçişi", GD.addDays("2026-10-31", 1), "2026-11-01");
eq("yıl geçişi", GD.addDays("2026-12-31", 1), "2027-01-01");
eq("geri, şubat", GD.addDays("2028-03-01", -1), "2028-02-29");
eq("yaz saati (25 Eki 2026 Avrupa) güvenli", GD.addDays("2026-10-24", 2), "2026-10-26");
eq("ISO gün: Cuma = 5", GD.isoDow(TODAY), 5);
eq("ISO gün: Pazar = 7", GD.isoDow("2026-10-18"), 7);
eq("hafta başı Pazartesi", GD.weekStart(TODAY), "2026-10-12");
eq("Pazar'ın haftası", GD.weekStart("2026-10-18"), "2026-10-12");
eq("gün farkı", GD.diffDays("2026-10-16", "2026-11-02"), 17);
eq("isKey", [GD.isKey("2026-10-16"), GD.isKey("2026-1-6"), GD.isKey(null)], [true, false, false]);

/* 2) saat */
eq("toMin", GD.toMin("09:30"), 570);
eq("toMin tek hane", GD.toMin("9:05"), 545);
eq("toMin 24:00", GD.toMin("24:00"), 1440);
eq("toMin geçersiz", [GD.toMin("25:00"), GD.toMin("10:60"), GD.toMin(""), GD.toMin("24:30")], [null, null, null, null]);
eq("fmtMin", GD.fmtMin(545), "09:05");
eq("süre metni", [GD.durText(45), GD.durText(120), GD.durText(150)], ["45 dk", "2 sa", "2 sa 30 dk"]);
eq("blok hatası: başlık", GD.blockError(540, 600, " "), "Başlık yaz.");
eq("blok hatası: ters", GD.blockError(600, 540, "x"), "Bitiş saati başlangıçtan sonra olmalı.");
eq("blok hatası: erken", GD.blockError(300, 400, "x"), "Çizelge 06:00'da başlıyor.");
eq("blok geçerli", GD.blockError(540, 1440, "x"), null);

/* 3) weekly recurrence */
const rec = [
  { id: "r1", t: "Matematik", c: "ders", s: 600, e: 710, dow: [1, 3], from: "2026-10-01", until: null },
  { id: "r2", t: "Kulüp toplantısı", c: "is", s: 1080, e: 1140, dow: [5], from: "2026-10-16", until: "2026-12-31" }
];
eq("Pzt'de Matematik", GD.recurringOn(rec[0], "2026-10-19"), true);
eq("Salı'da yok", GD.recurringOn(rec[0], "2026-10-20"), false);
eq("başlangıçtan önce yok", GD.recurringOn(rec[0], "2026-09-28"), false);
eq("bitişten sonra yok", GD.recurringOn(rec[1], "2027-01-01"), false);
eq("bitiş günü dahil", GD.recurringOn(rec[1], "2026-12-25"), true);
const day = { blocks: [{ id: "b1", s: 540, e: 600, t: "Kahvaltı", c: "kisisel" }], skip: [] };
eq("Cuma blokları: tek + tekrar, saate göre", GD.blocksForDay(day, rec, TODAY).map((b) => b.id), ["b1", "r2"]);
eq("atlanan tekrar görünmez", GD.blocksForDay({ blocks: [], skip: ["r2"] }, rec, TODAY).length, 0);
eq("gün belgesi yoksa sadece tekrarlar", GD.blocksForDay(null, rec, "2026-10-21").map((b) => b.id), ["r1"]);
eq("tekrar işareti", GD.blocksForDay(day, rec, TODAY).map((b) => b.rec), [false, true]);

/* 4) overlap lanes */
{
  const L = GD.lanes([
    { id: "a", s: 540, e: 660 }, { id: "b", s: 600, e: 720 }, { id: "c", s: 660, e: 700 }, { id: "d", s: 800, e: 860 }
  ]);
  const by = {}; L.forEach((b) => { by[b.id] = [b._lane, b._lanes]; });
  eq("a şerit 0/2", by.a, [0, 2]);
  eq("b şerit 1/2", by.b, [1, 2]);
  eq("c a'nın yerine geçer", by.c, [0, 2]);
  eq("d tek başına", by.d, [0, 1]);
}
eq("lanes girdiyi değiştirmez", (() => { const x = [{ s: 1, e: 2 }]; GD.lanes(x); return x[0]._lane; })(), undefined);

/* 5) free slots and planned time */
{
  const bl = [{ s: 600, e: 720 }, { s: 690, e: 780 }, { s: 900, e: 960 }];
  eq("planlı süre (çakışma bir kez)", GD.plannedMinutes(bl), 240);
  eq("boş aralıklar", GD.freeSlots(bl, 480, 1380, 60), [{ s: 480, e: 600 }, { s: 780, e: 900 }, { s: 960, e: 1380 }]);
  eq("kısa boşluk elenir", GD.freeSlots(bl, 480, 1380, 130), [{ s: 960, e: 1380 }]);
  eq("boş gün", GD.freeSlots([], 480, 600, 60), [{ s: 480, e: 600 }]);
}

/* 6) task visibility */
const T = [
  { id: "t1", date: "2026-10-16", done: false, kind: "normal" },
  { id: "t2", date: "2026-10-14", done: false, kind: "normal" },  // overdue
  { id: "t3", date: "2026-10-14", done: true, kind: "normal" },   // finished, old
  { id: "t4", date: null, done: false, kind: "normal" },          // tarihsiz
  { id: "t5", date: null, done: true, kind: "normal" },           // finished, undated
  { id: "t6", date: "2026-10-20", done: false, kind: "sinav", createdAt: 2 },
  { id: "t7", date: "2026-10-18", done: false, kind: "teslim", createdAt: 1 },
  { id: "t8", date: "2026-11-15", done: false, kind: "sinav" },   // more than 14 days away
  { id: "t9", date: "2026-10-19", done: true, kind: "sinav" }     // finished exam
];
const ids = (arr) => arr.map((x) => (x.t ? x.t.id + (x.late ? "!" : "") : x.id));
eq("bugün: kendi + gecikmiş + tarihsiz", ids(GD.visibleTasks(T, TODAY, TODAY)), ["t1", "t2!", "t4"]);
eq("yarın: bugünün görevi gecikmiş SAYILMAZ (eski hata)", ids(GD.visibleTasks(T, "2026-10-17", TODAY)), ["t4"]);
eq("geçmiş gün: sadece o günün görevleri + tarihsiz", ids(GD.visibleTasks(T, "2026-10-14", TODAY)), ["t2", "t3", "t4"]);
eq("gecikmişler", GD.overdue(T, TODAY).map((t) => t.id), ["t2"]);
eq("yaklaşanlar 14 gün, tarihe göre", GD.upcoming(T, TODAY, 14).map((t) => t.id), ["t7", "t6"]);
eq("günün açık görev sayısı", GD.openCountByDay(T, "2026-10-14"), 1);
eq("kalan gün metni", [GD.untilText(TODAY, TODAY), GD.untilText(TODAY, "2026-10-17"), GD.untilText(TODAY, "2026-10-20"), GD.untilText(TODAY, "2026-10-14")],
  ["bugün", "yarın", "4 gün kaldı", "2 gün geçti"]);

/* 7) rutinler */
{
  const logs = {
    "2026-10-13": { h: true, s: true },
    "2026-10-14": { h: true },
    "2026-10-15": { h: true, s: true },
    "2026-10-16": {}
  };
  eq("seri: bugün yapılmadı ama dün dahil 3", GD.streak(logs, "h", TODAY), 3);
  logs["2026-10-16"] = { h: true };
  eq("seri: bugün yapılınca 4", GD.streak(logs, "h", TODAY), 4);
  eq("seri boşlukta kırılır", GD.streak(logs, "s", TODAY), 1);
  eq("haftalık sayım (Pzt-Paz)", GD.weekCount(logs, "s", TODAY), 2);
  eq("haftalık hedef ilerleme", GD.habitProgress(logs, { id: "s", target: 3 }, TODAY), { mode: "weekly", count: 2, target: 3, weeks: 0 });
  eq("günlük ilerleme", GD.habitProgress(logs, { id: "h", target: 7 }, TODAY), { mode: "daily", streak: 4 });
  eq("hedefsiz = günlük", GD.habitProgress(logs, { id: "h" }, TODAY).mode, "daily");
  const lw = {
    "2026-09-29": { s: true }, "2026-10-01": { s: true },  // 2 weeks ago: 2
    "2026-10-06": { s: true }, "2026-10-08": { s: true },  // last week: 2
    "2026-10-13": { s: true }                               // this week: 1 (ongoing)
  };
  eq("haftalık seri: bu hafta bitmediyse geçen haftadan sayar", GD.weekStreak(lw, "s", TODAY, 2), 2);
  eq("haftalık seri: hedef tutmayan hafta keser", GD.weekStreak(lw, "s", TODAY, 3), 0);
}

/* 7b) hafta / ay */
eq("haftanın günleri", GD.weekDays(TODAY), ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
eq("ay başı", GD.monthStart(TODAY), "2026-10-01");
eq("ay ekle", GD.addMonths(TODAY, 1), "2026-11-16");
eq("ay ekle: 31 Oca → 28 Şub", GD.addMonths("2027-01-31", 1), "2027-02-28");
eq("ay ekle: artık yıl", GD.addMonths("2028-01-31", 1), "2028-02-29");
eq("ay çıkar: yıl geri", GD.addMonths("2026-01-15", -1), "2025-12-15");
eq("ay ekle: 12 ay", GD.addMonths(TODAY, 12), "2027-10-16");
{
  const g = GD.monthGrid(TODAY);
  eq("ay ızgarası 42 gün", g.length, 42);
  eq("Ekim 2026 ızgarası 28 Eyl Pzt'den başlar", g[0], "2026-09-28");
  eq("ızgara son günü", g[41], "2026-11-08");
  eq("ayın 1'i Pazartesi ise ilk hücre", GD.monthGrid("2026-06-10")[0], "2026-06-01");
}
eq("ISO hafta: 16 Eki 2026 = 42", GD.isoWeek(TODAY), 42);
eq("ISO hafta: 1 Oca 2027 (Cuma) = 53", GD.isoWeek("2027-01-01"), 53);
eq("ISO hafta: 4 Oca 2027 = 1", GD.isoWeek("2027-01-04"), 1);
eq("ISO hafta: 29 Ara 2025 = 1", GD.isoWeek("2025-12-29"), 1);
eq("hafta etiketi aynı ay", GD.weekLabel(TODAY), "12–18 Ekim");
eq("hafta etiketi ay geçişi", GD.weekLabel("2026-09-30"), "28 Eylül – 4 Ekim");
eq("hafta etiketi yıl geçişi", GD.weekLabel("2026-12-30"), "28 Aralık 2026 – 3 Ocak 2027");
{
  const s = GD.daySummary({ blocks: [{ id: "b", s: 540, e: 600, t: "x", c: "is" }], note: " ", skip: [] }, rec, T, "2026-10-19");
  eq("gün özeti: tek + haftalık blok", s.blocks.map((b) => b.id), ["b", "r1"]);
  eq("gün özeti: plan süresi", s.mins, 60 + 110);
  eq("gün özeti: boş not sayılmaz", s.note, false);
  const s2 = GD.daySummary(null, [], T, "2026-10-20");
  eq("gün özeti: sınav", [s2.key.map((t) => t.id), s2.open, s2.done], [["t6"], 1, 0]);
}

/* 7c) ayarlar */
{
  const d = GD.normalizeSettings(null);
  eq("varsayılan kategoriler", d.cats.map((c) => c.id), ["ders", "is", "kisisel"]);
  eq("varsayılan öne çıkanlar", d.kinds.filter((k) => k.key).map((k) => k.id), ["teslim", "sinav"]);
  const s = GD.normalizeSettings({
    cats: [{ id: "okul", name: "  Okul ", color: "pink" }, { id: "okul", name: "çift" }, { id: "bad id!", name: "x" }, { id: "spor", name: "", color: "neon" }],
    kinds: [{ id: "odev", name: "Ödev", color: "teal", key: true }, { id: "normal", name: "Yapılacak", key: true }],
    defaultCat: "yok", dayStart: 8, dayEnd: 22, upcomingDays: 30, accent: "pink"
  });
  eq("kategori temizleme", s.cats, [{ id: "okul", name: "Okul", color: "pink" }, { id: "spor", name: "spor", color: "slate" }]);
  eq("normal tür başa alınır, öne çıkabilir", s.kinds.map((k) => [k.id, k.key]), [["normal", true], ["odev", true]]);
  eq("normal tür adı değişebilir", s.kinds[0].name, "Yapılacak");
  eq("olmayan varsayılan kategori → ilki", s.defaultCat, "okul");
  eq("saat aralığı / yaklaşan / renk", [s.dayStart, s.dayEnd, s.upcomingDays, s.accent], [8, 22, 30, "pink"]);
  const bad = GD.normalizeSettings({ cats: [], kinds: "x", dayStart: 10, dayEnd: 14, upcomingDays: 9, accent: "neon" });
  eq("geçersizler varsayılana döner", [bad.cats.length, bad.kinds.length, bad.dayStart, bad.dayEnd, bad.upcomingDays, bad.accent], [3, 3, 6, 24, 14, "violet"]);
  eq("normal tür yoksa eklenir", GD.normalizeSettings({ kinds: [{ id: "quiz", name: "Quiz", key: true }] }).kinds.map((k) => k.id), ["normal", "quiz"]);
  eq("öne çıkan türlerle yaklaşanlar", GD.upcoming([{ id: "a", kind: "odev", date: TODAY }, { id: "b", kind: "sinav", date: TODAY }], TODAY, 7, ["odev"]).map((t) => t.id), ["a"]);
  GD.setDayRange(8, 22);
  eq("saat aralığı: erken blok reddedilir", GD.blockError(420, 480, "x"), "Çizelge 08:00'da başlıyor.");
  eq("saat aralığı: geç blok reddedilir", GD.blockError(1300, 1350, "x"), "Bitiş en geç 22:00 olabilir.");
  eq("saat aralığı GD'de", [GD.DAY_START, GD.DAY_END], [8, 22]);
  GD.setDayRange(6, 24);
}

/* 7d) quick add (today: Fri 16 Oct 2026) */
{
  const S = GD.normalizeSettings({ kinds: [{ id: "normal", name: "Görev" }, { id: "teslim", name: "Teslim", key: true }, { id: "sinav", name: "Sınav", key: true }, { id: "k_q", name: "Quiz", key: true }] });
  const P = (s, base) => GD.parseQuick(s, TODAY, base || TODAY, S.cats, S.kinds);
  const pick = (r, keys) => keys.map((k) => r[k]);
  eq("yarın saat aralığı kategori → blok", pick(P("yarın 14:00-15:30 Matematik #ders"), ["type", "title", "date", "s", "e", "cat"]), ["block", "Matematik", "2026-10-17", 840, 930, "ders"]);
  eq("gün adı + tür → görev", pick(P("cuma STAT quiz !sınav"), ["type", "title", "date", "kind"]), ["task", "STAT quiz", "2026-10-16", "sinav"]);
  eq("pazartesi = gelecek pazartesi", P("pazartesi sunum").date, "2026-10-19");
  eq("haftaya cuma", P("haftaya cuma rapor").date, "2026-10-23");
  eq("haftaya (tek başına) = +7", P("haftaya toplantı").date, "2026-10-23");
  eq("kısa gün adı: çar", P("çar 9:30 kahve").date, "2026-10-21");
  eq("ekli gün adı: cuma'ya", P("cuma'ya kadar ödev").date, "2026-10-16");
  eq("tür + saat → görev ve blok", pick(P("haftaya pzt 10:00 sunum !teslim"), ["type", "date", "s", "e", "kind"]), ["both", "2026-10-19", 600, 660, "teslim"]);
  eq("haftalık", pick(P("her pzt çar 10:40-12:30 STAT 311 #ders"), ["type", "dow", "s", "e", "title"]), ["recurring", [1, 3], 640, 750, "STAT 311"]);
  eq("haftalık 've' ile", P("her salı ve perşembe 13:40-15:30 MATH 219").dow, [2, 4]);
  eq("hafta içi", P("hafta içi 08:00 koşu").dow, [1, 2, 3, 4, 5]);
  eq("haftalık saatsiz hata", P("her pzt yoga").error, "Haftalık blok için saat yaz (ör. 10:40-12:30).");
  eq("N gün sonra", pick(P("kitap iade 3 gün sonra"), ["date", "title"]), ["2026-10-19", "kitap iade"]);
  eq("2 hafta sonra", P("vize 2 hafta sonra !sınav").date, "2026-10-30");
  eq("öbür gün", P("öbür gün market").date, "2026-10-18");
  eq("16 ekim yazımı", P("5 kasım teslim !teslim").date, "2026-11-05");
  eq("ay kısaltması", P("12 ara final !sınav").date, "2026-12-12");
  eq("geçmiş tarih → gelecek yıl", P("3 ocak kayıt").date, "2027-01-03");
  eq("noktalı tarih 20.10", P("20.10 kulüp toplantısı").date, "2026-10-20");
  eq("eğik çizgili tarih", P("2/11 seminer").date, "2026-11-02");
  eq("noktalı saat 14.30 (ikinci sayı > 12)", pick(P("14.30 ders"), ["s", "date"]), [870, "2026-10-16"]);
  eq("yıl içeren tarih", P("1.3.2027 başvuru").date, "2027-03-01");
  eq("süre: 90dk", pick(P("16:00 kodlama 90dk"), ["s", "e"]), [960, 1050]);
  eq("süre: 2 saat", pick(P("saat 9 kütüphane 2 saat"), ["s", "e", "title"]), [540, 660, "kütüphane"]);
  eq("saat aralığı 'saat 14-16'", pick(P("saat 14-16 lab"), ["s", "e", "title"]), [840, 960, "lab"]);
  eq("tarihsiz görev = seçili gün", P("market", "2026-10-20").date, "2026-10-20");
  eq("kategori ön ek: #kul", P("toplantı #kul").cat, "is");
  eq("kategori Türkçe karakter: #kisisel", P("berber #kisisel").cat, "kisisel");
  eq("yeni tür: !quiz", P("cuma !quiz bölüm 3").kind, "k_q");
  eq("bilinmeyen kategori uyarısı", P("x #yok").warnings.length, 1);
  eq("boş başlık hatası", P("yarın 14:00").error, "Başlık yaz.");
  eq("boş girdi", P("   ").ok, false);
  eq("sayılar başlıkta kalır", P("STAT 311 ödev 2").title, "STAT 311 ödev 2");
  eq("@yer", pick(P("her pzt çar 10:40-12:30 STAT 311 @MM-101 #ders"), ["type", "title", "loc", "cat"]), ["recurring", "STAT 311", "MM-101", "ders"]);
  eq("haftalık blokta yer taşınır", GD.blocksForDay(null, [{ id: "r", t: "x", c: "ders", s: 600, e: 660, dow: [5], loc: "U-203" }], TODAY)[0].loc, "U-203");
}
{
  const s = GD.normalizeSettings({ focusMins: 50, breakMins: 10 });
  eq("odak ayarları", [s.focusMins, s.breakMins], [50, 10]);
  eq("geçersiz odak → varsayılan", [GD.normalizeSettings({ focusMins: 7 }).focusMins, GD.normalizeSettings({ breakMins: 99 }).breakMins], [25, 5]);
}

/* 7e) highlighted task ↔ class block */
{
  const D = "2026-11-05";
  const bl = [
    { id: "r1", t: "Stat363", s: 520, e: 630 }, { id: "r2", t: "Stat365", s: 760, e: 870 },
    { id: "r3", t: "Stat363 Recit", s: 940, e: 1050 }, { id: "x", t: "Kahve", s: 700, e: 720 }
  ];
  const kk = ["sinav", "teslim", "k_q"];
  const tk = [
    { id: "a", title: "Stat363 Quiz", kind: "k_q", date: D },
    { id: "b", title: "STAT 363 recit quiz", kind: "k_q", date: D },
    { id: "c", title: "Proje teslimi", kind: "teslim", date: D, blk: "r2" },
    { id: "d", title: "Stat365 ödev", kind: "normal", date: D },
    { id: "e", title: "Stat365 vize", kind: "sinav", date: D, blk: "-" },
    { id: "f", title: "Stat365 vize", kind: "sinav", date: "2026-11-06" }
  ];
  const L = GD.linkKeyTasks(bl, tk, D, kk);
  eq("ad eşleşmesi: Stat363 Quiz → Stat363", L.byTask.a && L.byTask.a.id, "r1");
  eq("en uzun eşleşen: 'stat363recit' → Recit bloğu", L.byTask.b && L.byTask.b.id, "r3");
  eq("elle bağlantı kazanır", L.byTask.c && L.byTask.c.id, "r2");
  eq("normal görev bağlanmaz", L.byTask.d, undefined);
  eq("'-' ile bağlantı kapalı", L.byTask.e, undefined);
  eq("başka gün bağlanmaz", L.byTask.f, undefined);
  eq("blok başına liste", Object.keys(L.byBlock).sort(), ["r1", "r2", "r3"]);
  const L2 = GD.linkKeyTasks(bl, [{ id: "n1", title: "slaytları getir", kind: "normal", date: D, blk: "r3" }, { id: "n2", title: "Stat363 notları", kind: "normal", date: D }], D, kk);
  eq("normal görev elle bağlanır", L2.byTask.n1 && L2.byTask.n1.id, "r3");
  eq("normal görev otomatik bağlanmaz", L2.byTask.n2, undefined);
  /* starring a single task (imp) */
  const im = { id: "i1", title: "Stat363 notları", kind: "normal", imp: true, date: D };
  eq("yıldızlı görev öne çıkar", GD.isKeyTask(im, kk), true);
  eq("yıldızsız normal görev öne çıkmaz", GD.isKeyTask({ kind: "normal" }, kk), false);
  eq("yıldızlı görev adından bağlanır", (GD.linkKeyTasks(bl, [im], D, kk).byTask.i1 || {}).id, "r1");
  eq("yıldızlı görev yaklaşanlarda", GD.upcoming([im, { id: "i2", title: "x", kind: "normal", date: D }], D, 7, kk).map((t) => t.id), ["i1"]);
  eq("yıldızlı görev gün özetinde", GD.daySummary(null, [], [im], D, kk).key.map((t) => t.id), ["i1"]);
  eq("Görev türü öne çıkınca hepsi", GD.upcoming([{ id: "i3", title: "x", kind: "normal", date: D }], D, 7, ["normal"]).length, 1);
}

/* 8) backup validation */
throws("yanlış uygulama", () => GD.normalizeBackup({ app: "kart-takip", data: {} }), /Planner/);
throws("boş", () => GD.normalizeBackup(null), /boş/);
throws("bozuk bölüm", () => GD.normalizeBackup({ app: "planner", data: { tasks: [1, 2] } }), /tasks/);
{
  const n = GD.normalizeBackup({ app: "gun-defteri", data: { tasks: { ok: { title: "a" }, "bad/id": { title: "b" } }, other: { x: {} } } });
  eq("geçersiz id ve bilinmeyen bölüm elenir", [Object.keys(n.tasks), Object.keys(n).length], [["ok"], 7]);
  eq("yeni adla yedek", Object.keys(GD.normalizeBackup({ app: "planner", data: { habits: { h: { name: "x" } } } }).habits), ["h"]);
}

/* 9) local storage (with a fake localStorage) */
(async () => {
  const mem = {};
  global.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
  global.addEventListener = () => {};
  delete require.cache[require.resolve("../js/store.js")];
  const S = require("../js/store.js").localStore();
  eq("boş başlar", S.isEmpty(), true);
  let seen = null;
  S.watch("tasks", (rows) => { seen = rows; });
  await S.set("tasks", "a", { title: "x", createdAt: 1 });
  await S.set("tasks", "b", { title: "y", createdAt: 2 });
  eq("izleyici sıralı (createdAt azalan)", seen.map((r) => r.id), ["b", "a"]);
  await S.update("tasks", "a", { done: true });
  eq("update birleştirir", seen.find((r) => r.id === "a"), { id: "a", title: "x", createdAt: 1, done: true });
  let err = null; await S.update("tasks", "zz", { done: true }).catch((e) => { err = e.code; });
  eq("olmayan belgeye update reddedilir", err, "invalid_argument");
  let docSeen = "unset";
  S.watchDoc("days", TODAY, (d) => { docSeen = d; });
  await S.set("days", TODAY, { date: TODAY, note: "n" });
  eq("gün izleyici", docSeen.note, "n");
  let range = null;
  S.watchRange("days", "date", "2026-10-12", "2026-10-18", (rows) => { range = rows; });
  await S.set("days", "2026-10-20", { date: "2026-10-20", note: "dışarıda" });
  eq("aralık izleyici sadece aralıktakiler", range.map((r) => r.id), [TODAY]);
  await S.del("tasks", "b");
  eq("silme", seen.map((r) => r.id), ["a"]);
  eq("kalıcı yazıldı", JSON.parse(mem["gunDefteri.v1"]).days[TODAY].note, "n");
  const S2 = require("../js/store.js").localStore();
  const dump = await S2.dump();
  eq("yeniden açılınca veri geri gelir", Object.keys(dump.tasks), ["a"]);
  const n = await S2.bulk({ tasks: { c: { title: "z" } }, habits: { h: { name: "Spor" } } });
  eq("toplu yükleme sayısı", n, 2);
  eq("toplu yükleme sonrası", Object.keys((await S2.dump()).tasks).sort(), ["a", "c"]);

  console.log((fail ? "✗ " : "✓ ") + pass + " tests passed" + (fail ? ", " + fail + " failed" : ""));
  process.exit(fail ? 1 : 0);
})();
