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
const TODAY = "2026-10-16"; // Friday

/* 1) dates */
eq("month rollover", GD.addDays("2026-10-31", 1), "2026-11-01");
eq("year rollover", GD.addDays("2026-12-31", 1), "2027-01-01");
eq("backwards, February", GD.addDays("2028-03-01", -1), "2028-02-29");
eq("DST safe (25 Oct 2026 Europe)", GD.addDays("2026-10-24", 2), "2026-10-26");
eq("ISO day: Friday = 5", GD.isoDow(TODAY), 5);
eq("ISO day: Sunday = 7", GD.isoDow("2026-10-18"), 7);
eq("week starts Monday", GD.weekStart(TODAY), "2026-10-12");
eq("Sunday's week", GD.weekStart("2026-10-18"), "2026-10-12");
eq("day difference", GD.diffDays("2026-10-16", "2026-11-02"), 17);
eq("isKey", [GD.isKey("2026-10-16"), GD.isKey("2026-1-6"), GD.isKey(null)], [true, false, false]);

/* 2) times */
eq("toMin", GD.toMin("09:30"), 570);
eq("toMin single digit", GD.toMin("9:05"), 545);
eq("toMin 24:00", GD.toMin("24:00"), 1440);
eq("toMin invalid", [GD.toMin("25:00"), GD.toMin("10:60"), GD.toMin(""), GD.toMin("24:30")], [null, null, null, null]);
eq("fmtMin", GD.fmtMin(545), "09:05");
eq("duration text", [GD.durText(45), GD.durText(120), GD.durText(150)], ["45 dk", "2 sa", "2 sa 30 dk"]);
eq("block error: title", GD.blockError(540, 600, " "), "Başlık yaz.");
eq("block error: reversed", GD.blockError(600, 540, "x"), "Bitiş saati başlangıçtan sonra olmalı.");
eq("block error: too early", GD.blockError(300, 400, "x"), "Çizelge 06:00'da başlıyor.");
eq("valid block", GD.blockError(540, 1440, "x"), null);

/* 3) weekly recurrence */
const rec = [
  { id: "r1", t: "Matematik", c: "ders", s: 600, e: 710, dow: [1, 3], from: "2026-10-01", until: null },
  { id: "r2", t: "Kulüp toplantısı", c: "is", s: 1080, e: 1140, dow: [5], from: "2026-10-16", until: "2026-12-31" }
];
eq("Pzt'de Matematik", GD.recurringOn(rec[0], "2026-10-19"), true);
eq("not on Tuesday", GD.recurringOn(rec[0], "2026-10-20"), false);
eq("not before start", GD.recurringOn(rec[0], "2026-09-28"), false);
eq("not after end", GD.recurringOn(rec[1], "2027-01-01"), false);
eq("end day included", GD.recurringOn(rec[1], "2026-12-25"), true);
const day = { blocks: [{ id: "b1", s: 540, e: 600, t: "Kahvaltı", c: "kisisel" }], skip: [] };
eq("Friday blocks: one-off + recurring, by time", GD.blocksForDay(day, rec, TODAY).map((b) => b.id), ["b1", "r2"]);
eq("skipped recurrence hidden", GD.blocksForDay({ blocks: [], skip: ["r2"] }, rec, TODAY).length, 0);
eq("no day document: recurring only", GD.blocksForDay(null, rec, "2026-10-21").map((b) => b.id), ["r1"]);
eq("recurring flag", GD.blocksForDay(day, rec, TODAY).map((b) => b.rec), [false, true]);

/* 4) overlap lanes */
{
  const L = GD.lanes([
    { id: "a", s: 540, e: 660 }, { id: "b", s: 600, e: 720 }, { id: "c", s: 660, e: 700 }, { id: "d", s: 800, e: 860 }
  ]);
  const by = {}; L.forEach((b) => { by[b.id] = [b._lane, b._lanes]; });
  eq("a lane 0/2", by.a, [0, 2]);
  eq("b lane 1/2", by.b, [1, 2]);
  eq("c takes a's lane", by.c, [0, 2]);
  eq("d on its own", by.d, [0, 1]);
}
eq("lanes doesn't mutate input", (() => { const x = [{ s: 1, e: 2 }]; GD.lanes(x); return x[0]._lane; })(), undefined);

/* 5) free slots and planned time */
{
  const bl = [{ s: 600, e: 720 }, { s: 690, e: 780 }, { s: 900, e: 960 }];
  eq("planned time (overlap counted once)", GD.plannedMinutes(bl), 240);
  eq("free slots", GD.freeSlots(bl, 480, 1380, 60), [{ s: 480, e: 600 }, { s: 780, e: 900 }, { s: 960, e: 1380 }]);
  eq("short gap dropped", GD.freeSlots(bl, 480, 1380, 130), [{ s: 960, e: 1380 }]);
  eq("empty day", GD.freeSlots([], 480, 600, 60), [{ s: 480, e: 600 }]);
}

/* 6) task visibility */
const T = [
  { id: "t1", date: "2026-10-16", done: false, kind: "normal" },
  { id: "t2", date: "2026-10-14", done: false, kind: "normal" },  // overdue
  { id: "t3", date: "2026-10-14", done: true, kind: "normal" },   // finished, old
  { id: "t4", date: null, done: false, kind: "normal" },          // undated
  { id: "t5", date: null, done: true, kind: "normal" },           // finished, undated
  { id: "t6", date: "2026-10-20", done: false, kind: "sinav", createdAt: 2 },
  { id: "t7", date: "2026-10-18", done: false, kind: "teslim", createdAt: 1 },
  { id: "t8", date: "2026-11-15", done: false, kind: "sinav" },   // more than 14 days away
  { id: "t9", date: "2026-10-19", done: true, kind: "sinav" }     // finished exam
];
const ids = (arr) => arr.map((x) => (x.t ? x.t.id + (x.late ? "!" : "") : x.id));
eq("today: own + overdue + undated", ids(GD.visibleTasks(T, TODAY, TODAY)), ["t1", "t2!", "t4"]);
eq("tomorrow: today's task is NOT overdue (old bug)", ids(GD.visibleTasks(T, "2026-10-17", TODAY)), ["t4"]);
eq("past day: only that day's tasks + undated", ids(GD.visibleTasks(T, "2026-10-14", TODAY)), ["t2", "t3", "t4"]);
eq("overdue list", GD.overdue(T, TODAY).map((t) => t.id), ["t2"]);
eq("upcoming 14 days, by date", GD.upcoming(T, TODAY, 14).map((t) => t.id), ["t7", "t6"]);
eq("open tasks on a day", GD.openCountByDay(T, "2026-10-14"), 1);
eq("days-left text", [GD.untilText(TODAY, TODAY), GD.untilText(TODAY, "2026-10-17"), GD.untilText(TODAY, "2026-10-20"), GD.untilText(TODAY, "2026-10-14")],
  ["bugün", "yarın", "4 gün kaldı", "2 gün geçti"]);

/* 7) habits */
{
  const logs = {
    "2026-10-13": { h: true, s: true },
    "2026-10-14": { h: true },
    "2026-10-15": { h: true, s: true },
    "2026-10-16": {}
  };
  eq("streak: not done today, counts 3 incl. yesterday", GD.streak(logs, "h", TODAY), 3);
  logs["2026-10-16"] = { h: true };
  eq("streak: 4 once done today", GD.streak(logs, "h", TODAY), 4);
  eq("streak breaks on a gap", GD.streak(logs, "s", TODAY), 1);
  eq("weekly count (Mon-Sun)", GD.weekCount(logs, "s", TODAY), 2);
  eq("weekly target progress", GD.habitProgress(logs, { id: "s", target: 3 }, TODAY), { mode: "weekly", count: 2, target: 3, weeks: 0 });
  eq("daily progress", GD.habitProgress(logs, { id: "h", target: 7 }, TODAY), { mode: "daily", streak: 4 });
  eq("no target = daily", GD.habitProgress(logs, { id: "h" }, TODAY).mode, "daily");
  const lw = {
    "2026-09-29": { s: true }, "2026-10-01": { s: true },  // 2 weeks ago: 2
    "2026-10-06": { s: true }, "2026-10-08": { s: true },  // last week: 2
    "2026-10-13": { s: true }                               // this week: 1 (ongoing)
  };
  eq("weekly streak: counts from last week if this week isn't done", GD.weekStreak(lw, "s", TODAY, 2), 2);
  eq("weekly streak: a missed week breaks it", GD.weekStreak(lw, "s", TODAY, 3), 0);
}

/* 7b) week / month */
eq("days of the week", GD.weekDays(TODAY), ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
eq("start of month", GD.monthStart(TODAY), "2026-10-01");
eq("add month", GD.addMonths(TODAY, 1), "2026-11-16");
eq("add month: Jan 31 → Feb 28", GD.addMonths("2027-01-31", 1), "2027-02-28");
eq("add month: leap year", GD.addMonths("2028-01-31", 1), "2028-02-29");
eq("subtract month: previous year", GD.addMonths("2026-01-15", -1), "2025-12-15");
eq("add month: 12 months", GD.addMonths(TODAY, 12), "2027-10-16");
{
  const g = GD.monthGrid(TODAY);
  eq("month grid has 42 days", g.length, 42);
  eq("Oct 2026 grid starts Mon 28 Sep", g[0], "2026-09-28");
  eq("last day of the grid", g[41], "2026-11-08");
  eq("first cell when the 1st is a Monday", GD.monthGrid("2026-06-10")[0], "2026-06-01");
}
eq("ISO week: 16 Oct 2026 = 42", GD.isoWeek(TODAY), 42);
eq("ISO week: 1 Jan 2027 (Fri) = 53", GD.isoWeek("2027-01-01"), 53);
eq("ISO week: 4 Jan 2027 = 1", GD.isoWeek("2027-01-04"), 1);
eq("ISO week: 29 Dec 2025 = 1", GD.isoWeek("2025-12-29"), 1);
eq("week label same month", GD.weekLabel(TODAY), "12–18 Ekim");
eq("week label across months", GD.weekLabel("2026-09-30"), "28 Eylül – 4 Ekim");
eq("week label across years", GD.weekLabel("2026-12-30"), "28 Aralık 2026 – 3 Ocak 2027");
{
  const s = GD.daySummary({ blocks: [{ id: "b", s: 540, e: 600, t: "x", c: "is" }], note: " ", skip: [] }, rec, T, "2026-10-19");
  eq("day summary: one-off + weekly block", s.blocks.map((b) => b.id), ["b", "r1"]);
  eq("day summary: planned time", s.mins, 60 + 110);
  eq("day summary: blank note doesn't count", s.note, false);
  const s2 = GD.daySummary(null, [], T, "2026-10-20");
  eq("day summary: exam", [s2.key.map((t) => t.id), s2.open, s2.done], [["t6"], 1, 0]);
}

/* 7c) settings */
{
  const d = GD.normalizeSettings(null);
  eq("default categories", d.cats.map((c) => c.id), ["ders", "is", "kisisel"]);
  eq("default highlighted kinds", d.kinds.filter((k) => k.key).map((k) => k.id), ["teslim", "sinav"]);
  const s = GD.normalizeSettings({
    cats: [{ id: "okul", name: "  Okul ", color: "pink" }, { id: "okul", name: "çift" }, { id: "bad id!", name: "x" }, { id: "spor", name: "", color: "neon" }],
    kinds: [{ id: "odev", name: "Ödev", color: "teal", key: true }, { id: "normal", name: "Yapılacak", key: true }],
    defaultCat: "yok", dayStart: 8, dayEnd: 22, upcomingDays: 30, accent: "pink"
  });
  eq("kategori temizleme", s.cats, [{ id: "okul", name: "Okul", color: "pink" }, { id: "spor", name: "spor", color: "slate" }]);
  eq("normal kind goes first, can be highlighted", s.kinds.map((k) => [k.id, k.key]), [["normal", true], ["odev", true]]);
  eq("normal kind can be renamed", s.kinds[0].name, "Yapılacak");
  eq("missing default category → first one", s.defaultCat, "okul");
  eq("hour range / upcoming / color", [s.dayStart, s.dayEnd, s.upcomingDays, s.accent], [8, 22, 30, "pink"]);
  const bad = GD.normalizeSettings({ cats: [], kinds: "x", dayStart: 10, dayEnd: 14, upcomingDays: 9, accent: "neon" });
  eq("invalid values fall back to defaults", [bad.cats.length, bad.kinds.length, bad.dayStart, bad.dayEnd, bad.upcomingDays, bad.accent], [3, 3, 6, 24, 14, "violet"]);
  eq("normal kind added if missing", GD.normalizeSettings({ kinds: [{ id: "quiz", name: "Quiz", key: true }] }).kinds.map((k) => k.id), ["normal", "quiz"]);
  eq("upcoming with highlighted kinds", GD.upcoming([{ id: "a", kind: "odev", date: TODAY }, { id: "b", kind: "sinav", date: TODAY }], TODAY, 7, ["odev"]).map((t) => t.id), ["a"]);
  GD.setDayRange(8, 22);
  eq("hour range: early block rejected", GD.blockError(420, 480, "x"), "Çizelge 08:00'da başlıyor.");
  eq("hour range: late block rejected", GD.blockError(1300, 1350, "x"), "Bitiş en geç 22:00 olabilir.");
  eq("hour range in GD", [GD.DAY_START, GD.DAY_END], [8, 22]);
  GD.setDayRange(6, 24);
}

/* 7d) quick add (today: Fri 16 Oct 2026) */
{
  const S = GD.normalizeSettings({ kinds: [{ id: "normal", name: "Görev" }, { id: "teslim", name: "Teslim", key: true }, { id: "sinav", name: "Sınav", key: true }, { id: "k_q", name: "Quiz", key: true }] });
  const P = (s, base) => GD.parseQuick(s, TODAY, base || TODAY, S.cats, S.kinds);
  const pick = (r, keys) => keys.map((k) => r[k]);
  eq("tomorrow time range category → block", pick(P("yarın 14:00-15:30 Matematik #ders"), ["type", "title", "date", "s", "e", "cat"]), ["block", "Matematik", "2026-10-17", 840, 930, "ders"]);
  eq("day name + kind → task", pick(P("cuma STAT quiz !sınav"), ["type", "title", "date", "kind"]), ["task", "STAT quiz", "2026-10-16", "sinav"]);
  eq("pazartesi = gelecek pazartesi", P("pazartesi sunum").date, "2026-10-19");
  eq("next week Friday", P("haftaya cuma rapor").date, "2026-10-23");
  eq("next week alone = +7", P("haftaya toplantı").date, "2026-10-23");
  eq("short day name: çar", P("çar 9:30 kahve").date, "2026-10-21");
  eq("suffixed day name: cuma'ya", P("cuma'ya kadar ödev").date, "2026-10-16");
  eq("kind + time → task and block", pick(P("haftaya pzt 10:00 sunum !teslim"), ["type", "date", "s", "e", "kind"]), ["both", "2026-10-19", 600, 660, "teslim"]);
  eq("weekly", pick(P("her pzt çar 10:40-12:30 STAT 311 #ders"), ["type", "dow", "s", "e", "title"]), ["recurring", [1, 3], 640, 750, "STAT 311"]);
  eq("weekly with 've'", P("her salı ve perşembe 13:40-15:30 MATH 219").dow, [2, 4]);
  eq("weekdays", P("hafta içi 08:00 koşu").dow, [1, 2, 3, 4, 5]);
  eq("weekly without time is an error", P("her pzt yoga").error, "Haftalık blok için saat yaz (ör. 10:40-12:30).");
  eq("in N days", pick(P("kitap iade 3 gün sonra"), ["date", "title"]), ["2026-10-19", "kitap iade"]);
  eq("in 2 weeks", P("vize 2 hafta sonra !sınav").date, "2026-10-30");
  eq("day after tomorrow", P("öbür gün market").date, "2026-10-18");
  eq("'16 ekim' form", P("5 kasım teslim !teslim").date, "2026-11-05");
  eq("month abbreviation", P("12 ara final !sınav").date, "2026-12-12");
  eq("past date → next year", P("3 ocak kayıt").date, "2027-01-03");
  eq("dotted date 20.10", P("20.10 kulüp toplantısı").date, "2026-10-20");
  eq("slashed date", P("2/11 seminer").date, "2026-11-02");
  eq("dotted time 14.30 (second number > 12)", pick(P("14.30 ders"), ["s", "date"]), [870, "2026-10-16"]);
  eq("date with year", P("1.3.2027 başvuru").date, "2027-03-01");
  eq("duration: 90dk", pick(P("16:00 kodlama 90dk"), ["s", "e"]), [960, 1050]);
  eq("duration: 2 saat", pick(P("saat 9 kütüphane 2 saat"), ["s", "e", "title"]), [540, 660, "kütüphane"]);
  eq("time range 'saat 14-16'", pick(P("saat 14-16 lab"), ["s", "e", "title"]), [840, 960, "lab"]);
  eq("undated task = selected day", P("market", "2026-10-20").date, "2026-10-20");
  eq("category prefix: #kul", P("toplantı #kul").cat, "is");
  eq("category with Turkish letters: #kisisel", P("berber #kisisel").cat, "kisisel");
  eq("new kind: !quiz", P("cuma !quiz bölüm 3").kind, "k_q");
  eq("unknown category warning", P("x #yok").warnings.length, 1);
  eq("empty title error", P("yarın 14:00").error, "Başlık yaz.");
  eq("empty input", P("   ").ok, false);
  eq("numbers stay in the title", P("STAT 311 ödev 2").title, "STAT 311 ödev 2");
  eq("@yer", pick(P("her pzt çar 10:40-12:30 STAT 311 @MM-101 #ders"), ["type", "title", "loc", "cat"]), ["recurring", "STAT 311", "MM-101", "ders"]);
  eq("place carried on a weekly block", GD.blocksForDay(null, [{ id: "r", t: "x", c: "ders", s: 600, e: 660, dow: [5], loc: "U-203" }], TODAY)[0].loc, "U-203");
}
{
  const s = GD.normalizeSettings({ focusMins: 50, breakMins: 10 });
  eq("focus settings", [s.focusMins, s.breakMins], [50, 10]);
  eq("invalid focus → default", [GD.normalizeSettings({ focusMins: 7 }).focusMins, GD.normalizeSettings({ breakMins: 99 }).breakMins], [25, 5]);
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
  eq("name match: Stat363 Quiz → Stat363", L.byTask.a && L.byTask.a.id, "r1");
  eq("longest match: 'stat363recit' → Recit block", L.byTask.b && L.byTask.b.id, "r3");
  eq("manual link wins", L.byTask.c && L.byTask.c.id, "r2");
  eq("normal task not linked", L.byTask.d, undefined);
  eq("'-' disables linking", L.byTask.e, undefined);
  eq("other day not linked", L.byTask.f, undefined);
  eq("list per block", Object.keys(L.byBlock).sort(), ["r1", "r2", "r3"]);
  const L2 = GD.linkKeyTasks(bl, [{ id: "n1", title: "slaytları getir", kind: "normal", date: D, blk: "r3" }, { id: "n2", title: "Stat363 notları", kind: "normal", date: D }], D, kk);
  eq("normal task linked manually", L2.byTask.n1 && L2.byTask.n1.id, "r3");
  eq("normal task not auto-linked", L2.byTask.n2, undefined);
  /* starring a single task (imp) */
  const im = { id: "i1", title: "Stat363 notları", kind: "normal", imp: true, date: D };
  eq("starred task is highlighted", GD.isKeyTask(im, kk), true);
  eq("unstarred normal task isn't highlighted", GD.isKeyTask({ kind: "normal" }, kk), false);
  eq("starred task linked by name", (GD.linkKeyTasks(bl, [im], D, kk).byTask.i1 || {}).id, "r1");
  eq("starred task in upcoming", GD.upcoming([im, { id: "i2", title: "x", kind: "normal", date: D }], D, 7, kk).map((t) => t.id), ["i1"]);
  eq("starred task in day summary", GD.daySummary(null, [], [im], D, kk).key.map((t) => t.id), ["i1"]);
  eq("highlighting the Task kind includes all", GD.upcoming([{ id: "i3", title: "x", kind: "normal", date: D }], D, 7, ["normal"]).length, 1);
}

/* 8) backup validation */
throws("wrong app", () => GD.normalizeBackup({ app: "kart-takip", data: {} }), /Planner/);
throws("empty", () => GD.normalizeBackup(null), /boş/);
throws("corrupt section", () => GD.normalizeBackup({ app: "planner", data: { tasks: [1, 2] } }), /tasks/);
{
  const n = GD.normalizeBackup({ app: "gun-defteri", data: { tasks: { ok: { title: "a" }, "bad/id": { title: "b" } }, other: { x: {} } } });
  eq("invalid ids and unknown sections dropped", [Object.keys(n.tasks), Object.keys(n).length], [["ok"], 7]);
  eq("yeni adla yedek", Object.keys(GD.normalizeBackup({ app: "planner", data: { habits: { h: { name: "x" } } } }).habits), ["h"]);
}

/* 9) local storage (with a fake localStorage) */
(async () => {
  const mem = {};
  global.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
  global.addEventListener = () => {};
  delete require.cache[require.resolve("../js/store.js")];
  const S = require("../js/store.js").localStore();
  eq("starts empty", S.isEmpty(), true);
  let seen = null;
  S.watch("tasks", (rows) => { seen = rows; });
  await S.set("tasks", "a", { title: "x", createdAt: 1 });
  await S.set("tasks", "b", { title: "y", createdAt: 2 });
  eq("watcher ordered (createdAt desc)", seen.map((r) => r.id), ["b", "a"]);
  await S.update("tasks", "a", { done: true });
  eq("update merges", seen.find((r) => r.id === "a"), { id: "a", title: "x", createdAt: 1, done: true });
  let err = null; await S.update("tasks", "zz", { done: true }).catch((e) => { err = e.code; });
  eq("update on missing document rejected", err, "invalid_argument");
  let docSeen = "unset";
  S.watchDoc("days", TODAY, (d) => { docSeen = d; });
  await S.set("days", TODAY, { date: TODAY, note: "n" });
  eq("day watcher", docSeen.note, "n");
  let range = null;
  S.watchRange("days", "date", "2026-10-12", "2026-10-18", (rows) => { range = rows; });
  await S.set("days", "2026-10-20", { date: "2026-10-20", note: "dışarıda" });
  eq("range watcher: only in-range docs", range.map((r) => r.id), [TODAY]);
  await S.del("tasks", "b");
  eq("silme", seen.map((r) => r.id), ["a"]);
  eq("persisted", JSON.parse(mem["gunDefteri.v1"]).days[TODAY].note, "n");
  const S2 = require("../js/store.js").localStore();
  const dump = await S2.dump();
  eq("data comes back after reopening", Object.keys(dump.tasks), ["a"]);
  const n = await S2.bulk({ tasks: { c: { title: "z" } }, habits: { h: { name: "Spor" } } });
  eq("bulk load count", n, 2);
  eq("after bulk load", Object.keys((await S2.dump()).tasks).sort(), ["a", "c"]);

  console.log((fail ? "✗ " : "✓ ") + pass + " tests passed" + (fail ? ", " + fail + " failed" : ""));
  process.exit(fail ? 1 : 0);
})();
