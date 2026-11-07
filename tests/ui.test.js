/* node tests/ui.test.js — loads the single-file build (dist/planner.html) in jsdom (local-storage mode)
   and drives the main flows. It catches wiring mistakes: a missing function, a broken handler, a render that throws.
   Layout-dependent behaviour (drag and drop, pixel sizes) is not covered: jsdom has no layout. */
const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const file = path.join(__dirname, "..", "dist", "planner.html");
if (!fs.existsSync(file)) { console.log("✗ dist/planner.html is missing: run `node build.js` first"); process.exit(1); }
/* the build is a page fragment (the host adds <html>); drop the external font link so nothing is fetched */
const html = "<!doctype html><html lang=\"tr\"><head><meta charset=\"utf-8\"></head><body>" +
  fs.readFileSync(file, "utf8").replace(/<link[^>]*>/g, "") + "</body></html>";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) pass++; else { fail++; console.log("✗ " + name + "\n   got:  " + a + "\n   want: " + b); }
};

const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push(String((e && e.detail) || (e && e.message) || e)));
vc.on("error", (m) => errors.push(String(m)));

const dom = new JSDOM(html, {
  runScripts: "dangerously", url: "http://localhost/", pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    w.localStorage.setItem("gunDefteri.welcome", "1");   /* no welcome card unless a test asks for it */
    w.matchMedia = w.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
    w.addEventListener("error", (e) => errors.push("error: " + e.message));
    w.addEventListener("unhandledrejection", (e) => errors.push("rejection: " + ((e.reason && e.reason.message) || e.reason)));
  }
});
const w = dom.window, d = w.document;
const $ = (id) => d.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const key = (k) => d.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, bubbles: true }));
const view = (v) => d.querySelector('[data-view="' + v + '"]').click();

(async () => {
  await wait(300);
  eq("app booted (S and App exist)", [typeof w.eval("S"), typeof w.eval("App")], ["object", "object"]);

  /* first-run welcome card */
  w.localStorage.removeItem("gunDefteri.welcome"); w.eval("App.maybeWelcome()");
  eq("welcome card shows on first run", [$("modalBg").hidden, $("modal").textContent.includes("Hoş geldin")], [false, true]);
  $("modal").querySelector("button[type=submit]").click(); await wait(50);
  eq("welcome closes and is remembered", [$("modalBg").hidden, w.localStorage.getItem("gunDefteri.welcome")], [true, "1"]);
  w.eval("App.maybeWelcome()");
  eq("welcome does not repeat", $("modalBg").hidden, true);
  $("setBtn").click(); await wait(100); $("sWelcome").click(); await wait(50);
  eq("settings can reopen the welcome card", $("modal").textContent.includes("Hoş geldin"), true);
  key("Escape"); await wait(50);

  $("tTitle").value = "Test görevi"; $("tAdd").click(); await wait(100);
  eq("task added", $("taskList").textContent.includes("Test görevi"), true);
  $("taskList").querySelector(".chk").click(); await wait(100);
  eq("task toggled done", $("taskList").querySelector("li").classList.contains("done"), true);
  eq("a task ticked a moment ago carries the pop class", $("taskList").querySelector("li.task").classList.contains("just"), true);

  $("tTitle").value = "Başka iş"; $("tAdd").click(); await wait(100);
  $("tSearch").value = "TEST"; $("tSearch").dispatchEvent(new w.Event("input", { bubbles: true }));
  eq("search keeps matching tasks only", [$("taskList").textContent.includes("Test görevi"), $("taskList").textContent.includes("Başka iş")], [true, false]);
  eq("search shows result count", $("tCount").textContent, "1 sonuç");
  $("tSearch").value = "yokboyle"; $("tSearch").dispatchEvent(new w.Event("input", { bubbles: true }));
  eq("search with no match says so", $("taskList").textContent.includes("Eşleşen görev yok"), true);
  $("tSearch").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  eq("Escape clears the search", [$("tSearch").value, $("taskList").textContent.includes("Başka iş")], ["", true]);
  $("tFilter").value = "done"; $("tFilter").dispatchEvent(new w.Event("change", { bubbles: true }));
  eq("status filter: done only", [$("taskList").textContent.includes("Test görevi"), $("taskList").textContent.includes("Başka iş")], [true, false]);
  $("tFilter").value = "all"; $("tFilter").dispatchEvent(new w.Event("change", { bubbles: true }));

  /* "Şimdi / Sıradaki" strip and the block in progress */
  w.eval("App.go(S.TODAY)"); d.querySelector('[data-view="day"]').click(); await wait(100);
  const nm = new Date().getHours() * 60 + new Date().getMinutes();
  if (nm >= 10 && nm + 90 < 24 * 60 - 1) {
    w.eval('S.store.set("days", S.TODAY, { date: S.TODAY, blocks: [{ id: "nb1", s: ' + (nm - 10) + ', e: ' + (nm + 50) + ', t: "Şimdiki ders", c: "ders", loc: "A-1" }, { id: "nb2", s: ' + (nm + 90) + ', e: ' + (nm + 120 > 1439 ? 1439 : nm + 120) + ', t: "Sonraki ders", c: "ders" }], note: "", skip: [] })'); await wait(120);
    eq("strip shows the block in progress", [$("nextBar").hidden, $("nextBar").textContent.includes("Şimdi"), $("nextBar").textContent.includes("Şimdiki ders"), $("nextBar").textContent.includes("kaldı")], [false, true, true, true]);
    eq("block in progress has a progress fill", !!d.querySelector("#tl .blk.now .bprog"), true);
    if (nm - 10 >= w.eval("GD.DAY_START") * 60 && nm + 50 <= w.eval("GD.DAY_END") * 60) eq("blocks carry their category icon", !!d.querySelector("#tl .blk .bi"), true);   /* only when the block is inside the visible day range */
    eq("day ring and greeting are shown for today", [$("dayRing").hasAttribute("hidden"), /%$/.test($("dayRingTx").textContent), /^(Günaydın|İyi günler|İyi akşamlar|İyi geceler)/.test($("greet").textContent)], [false, true, true]);
    eq("timeline highlights the block in progress", [d.querySelectorAll("#tl .blk.now").length, d.querySelector("#tl .blk.now").textContent.includes("Şimdiki ders")], [1, true]);
    if (nm >= w.eval("GD.DAY_START") * 60 && nm <= w.eval("GD.DAY_END") * 60) eq("the now line carries the time", d.querySelector("#tl .nowline .nl-t").textContent.length, 5);   /* only inside the visible day range */
    w.eval('S.store.set("days", S.TODAY, { date: S.TODAY, blocks: [{ id: "nb2", s: ' + (nm + 90) + ', e: ' + (nm + 120 > 1439 ? 1439 : nm + 120) + ', t: "Sonraki ders", c: "ders" }], note: "", skip: [] })'); await wait(120);
    eq("strip shows the next block when none is running", [$("nextBar").textContent.includes("Sıradaki"), $("nextBar").textContent.includes("Sonraki ders"), $("nextBar").textContent.includes("sonra")], [true, true, true]);
    w.eval('S.store.del("days", S.TODAY)'); await wait(80);
  }

  /* swipe a task row (touch) */
  const touch = (type, el, x, y) => { const ev = new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }); Object.defineProperty(ev, "pointerType", { value: "touch" }); Object.defineProperty(ev, "pointerId", { value: 7 }); el.dispatchEvent(ev); };
  const swipe = async (title, dx) => { const li = [...$("taskList").querySelectorAll("li.task")].find((l) => l.textContent.includes(title)); touch("pointerdown", li, 100, 100); touch("pointermove", w, 100 + dx / 4, 101); touch("pointermove", w, 100 + dx, 102); eq("swipe moves the row (" + title + ")", li.style.transform.includes("translateX"), true); touch("pointerup", w, 100 + dx, 102); await wait(80); };
  $("tTitle").value = "Sağa kaydır"; $("tAdd").click(); $("tTitle").value = "Sola kaydır"; $("tAdd").click(); await wait(120);
  await swipe("Sağa kaydır", 140);
  eq("swiping right completes the task", w.eval('S.tasks.find(t => t.title === "Sağa kaydır").done'), true);
  await swipe("Sola kaydır", -140);
  eq("swiping left moves the task to tomorrow", w.eval('S.tasks.find(t => t.title === "Sola kaydır").date') === w.eval("GD.addDays(S.TODAY, 1)"), true);
  await swipe("Test görevi", 30);
  eq("a short swipe does nothing", w.eval('S.tasks.find(t => t.title === "Test görevi").done'), true);   /* it was already done: unchanged */
  w.eval('S.tasks.filter(t => /kaydır$/.test(t.title)).forEach(t => S.store.del("tasks", t.id))'); await wait(80);

  /* black theme */
  $("setBtn").click(); await wait(60);
  d.querySelector('[data-theme-opt="black"]').click();
  $("mForm").dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true })); await wait(100);
  eq("the black theme is applied and remembered", [d.documentElement.getAttribute("data-theme"), w.localStorage.getItem("gunDefteri.theme")], ["black", "black"]);
  w.localStorage.removeItem("gunDefteri.theme"); d.documentElement.removeAttribute("data-theme");

  /* palettes: every palette follows the light / dark theme choice */
  const root = d.documentElement;
  const choose = async (palette, theme) => { $("setBtn").click(); await wait(60); if (palette) d.querySelector('[data-palette-opt="' + palette + '"]').click(); if (theme) d.querySelector('[data-theme-opt="' + theme + '"]').click(); };
  const save = async () => { $("mForm").dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true })); await wait(100); };
  const attrs = () => [root.getAttribute("data-palette"), root.getAttribute("data-theme")];
  await choose("sakiz", "light");
  eq("palette previews live together with the theme", attrs(), ["sakiz", "light"]);
  d.querySelector('[data-theme-opt="dark"]').click();
  eq("switching the theme in the window switches the palette variant (Sakız koyu)", attrs(), ["sakiz", "dark"]);
  key("Escape"); await wait(60);
  eq("closing without saving reverts the preview", attrs(), [null, null]);
  
  await choose("sakiz", "dark");
  eq("with a palette the main-colour row is hidden", $("sAccRow").hidden, true);
  d.querySelector('[data-palette-opt="default"]').click();
  eq("and it comes back with the default palette", $("sAccRow").hidden, false);
  d.querySelector('[data-palette-opt="sakiz"]').click(); await save();

  eq("saved: Sakız in dark, remembered, no accent override", [attrs(), root.hasAttribute("data-accent"), w.localStorage.getItem("gunDefteri.palette"), w.localStorage.getItem("gunDefteri.theme")], [["sakiz", "dark"], false, "sakiz", "dark"]);
  key("k"); await wait(60);
  eq("the theme key flips the variant inside a palette (dark to light)", attrs(), ["sakiz", "light"]);
  key("k"); await wait(60);
  eq("and back", attrs(), ["sakiz", "dark"]);
  await choose("akuamarin", "light"); await save();
  eq("another palette in light", attrs(), ["akuamarin", "light"]);
  await choose("sakin", "dark"); await save();
  eq("the soft palette Sakin works in dark and light", [attrs()], [["sakin", "dark"]]);
  key("k"); await wait(60);
  eq("Sakin flips to its light variant", attrs(), ["sakin", "light"]);
  await choose("default", "system"); await save();
  eq("choosing Mor goes back to the normal themes", [root.hasAttribute("data-palette"), root.hasAttribute("data-theme"), w.localStorage.getItem("gunDefteri.palette")], [false, false, null]);

  /* reminders */
  $("setBtn").click(); await wait(60); $("sRemind").click(); await wait(60);
  eq("reminder window opens", $("modal").textContent.includes("Hatırlatmalar"), true);
  $("rmOn").checked = true; $("rmLead").value = "10";
  $("mForm").dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true })); await wait(80);
  eq("reminder choice is stored on this device", JSON.parse(w.localStorage.getItem("gunDefteri.notif")), { on: true, lead: 10, keys: true });
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  if (nowMin + 6 < 24 * 60) {
    w.eval('S.store.set("days", S.TODAY, { date: S.TODAY, blocks: [{ id: "rb", s: ' + (nowMin + 5) + ', e: ' + (nowMin + 35) + ', t: "Hatırlatma dersi", c: "ders" }], note: "", skip: [] })'); await wait(100);
    $("toast").hidden = true; await w.eval("App.check()");
    eq("a block about to start triggers a reminder (message: no system notifications here)", [$("toast").hidden, $("toast").textContent.includes("Hatırlatma dersi")], [false, true]);
    $("toast").hidden = true; await w.eval("App.check()");
    eq("the same reminder is not repeated", $("toast").hidden, true);
    w.eval('S.store.del("days", S.TODAY)'); await wait(60);
  }
  w.localStorage.removeItem("gunDefteri.notif");

  /* end of term */
  w.eval('S.store.set("recurring", "cls1", { t: "Ders A", c: "ders", s: 540, e: 630, dow: [1, 3], from: "2026-01-05", until: null })');
  w.eval('S.store.set("tasks", "oldA", { title: "Eski biten", cat: "ders", kind: "normal", date: GD.addDays(S.TODAY, -200), done: true, createdAt: 1 })');
  w.eval('S.store.set("tasks", "oldB", { title: "Yeni biten", cat: "ders", kind: "normal", date: GD.addDays(S.TODAY, -5), done: true, createdAt: 2 })');
  await wait(80);
  $("setBtn").click(); await wait(80); $("sTerm").click(); await wait(80);
  eq("term-end window lists the running class", $("tmSeries").textContent.includes("Ders A"), true);
  eq("old finished tasks are counted (cutoff 60 days)", $("tmCount").textContent, "1 biten görev silinebilir.");
  eq("delete stays locked until a backup was downloaded", $("tmDel").disabled, true);
  w.URL.createObjectURL = () => "blob:x"; w.URL.revokeObjectURL = () => {}; w.HTMLAnchorElement.prototype.click = () => {};
  $("tmBackup").click(); await wait(150);
  eq("after the backup, delete unlocks", [$("tmDel").disabled, $("tmBackup").textContent.includes("✓")], [false, true]);
  $("tmDel").click(); $("tmDel").click(); await wait(200);
  eq("old finished tasks are deleted, newer ones stay", [w.eval('S.tasks.some(t => t.id === "oldA")'), w.eval('S.tasks.some(t => t.id === "oldB")')], [false, true]);
  $("tmDate").value = w.eval("S.TODAY"); $("tmEnd").click(); await wait(100);
  eq("classes end on the chosen day", w.eval('S.recurring.find(r => r.id === "cls1").until') === w.eval("S.TODAY"), true);
  $("undoBtn").click(); await wait(100);
  eq("undo restores the open end", w.eval('S.recurring.find(r => r.id === "cls1").until'), null);
  key("Escape"); await wait(40);
  w.eval('S.store.del("recurring", "cls1")'); w.eval('S.store.del("tasks", "oldB")'); await wait(60);

  /* opening screen: gone once the app is up */
  eq("the opening screen has been removed after start", d.getElementById("splash"), null);
  d.head.insertAdjacentHTML("beforeend", '<meta name="theme-color" content="#fff" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#000" media="(prefers-color-scheme: dark)">');
  w.eval('App.setPalette("sakin")');
  const metas = d.querySelectorAll('meta[name="theme-color"]');
  eq("the browser colour follows the palette: a single meta without media, with the top-bar colour", [metas.length, metas[0].hasAttribute("media"), /^#[0-9a-fA-F]{6}$/.test(metas[0].getAttribute("content"))], [1, false, true]);
  w.eval('App.setPalette("default")'); d.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());

  /* week view: tick boxes and the weekend / past classes */
  d.querySelector('[data-view="week"]').click(); await wait(150);
  eq("week grid: today's tasks have a tick box", d.querySelectorAll("#wkGrid .wk-task .wk-chk, #wkGrid .wk-key .wk-chk").length > 0, true);
  eq("week grid: weekend and past columns are marked", [d.querySelectorAll("#wkGrid .wk-col.we").length, d.querySelectorAll("#wkGrid .wk-col.today").length], [w.eval("GD.weekDays(S.sel).filter(k => GD.isoDow(k) >= 6).length"), 1]);
  const wkBox = [...d.querySelectorAll("#wkGrid .wk-chk")].find((c) => c.getAttribute("aria-checked") === "false");
  if (wkBox) {
    const wkId = wkBox.dataset.wkToggle; wkBox.click(); await wait(120);
    eq("ticking in the week view completes that task and stays in the week view", [w.eval("App.allTasks().find(t => t.id === " + JSON.stringify(wkId) + ").done"), $("weekView").hidden], [true, false]);
  }
  d.querySelector('[data-view="day"]').click(); await wait(100);

  /* statistics window */
  w.eval('S.store.set("focus", "f1", { date: S.TODAY, start: Date.now(), mins: 25, title: "x", cat: "ders" })'); await wait(80);
  $("statsBtn").click(); await wait(80);
  eq("stats window opens with tiles and charts", [$("modal").textContent.includes("İstatistikler"), $("modal").querySelectorAll(".st-tile").length, $("modal").querySelectorAll(".bars i").length], [true, 4, 60]);  /* two charts × 30 days */
  eq("stats counts the focus session", $("modal").querySelector(".st-tile b").textContent.includes("25"), true);
  $("stPeriod").querySelector('[data-days="7"]').click(); await wait(40);
  eq("stats period switch redraws", [$("modal").querySelectorAll(".bars i").length, w.eval("S.statsDays")], [14, 7]);
  key("Escape"); await wait(40);

  /* notes and sub-tasks */
  [...$("taskList").querySelectorAll("li.task")].find((l) => l.textContent.includes("Test görevi")).querySelector(".tx").click(); await wait(80);
  $("mNote").value = "Hocaya mail at";
  $("mSubAdd").click(); $("mSubs").querySelector("input[type=text]").value = "Taslak";
  $("mSubAdd").click(); $("mSubs").lastElementChild.querySelector("input[type=text]").value = "Son okuma";
  eq("modal has two sub-task rows", $("mSubs").children.length, 2);
  $("mForm").dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true })); await wait(120);
  eq("note and sub-tasks saved on the task", [w.eval("S.tasks.find(t => t.title === 'Test görevi').note"), w.eval("S.tasks.find(t => t.title === 'Test görevi').subs.length")], ["Hocaya mail at", 2]);
  const subPill = () => $("taskList").querySelector("[data-subs-toggle]");
  eq("row shows sub-task progress", subPill().textContent.includes("0/2"), true);
  subPill().click(); await wait(60);
  eq("expanding shows the note and the checklist", [$("taskList").textContent.includes("Hocaya mail at"), $("taskList").querySelectorAll("li.sub").length], [true, 2]);
  $("taskList").querySelector("li.sub .chk").click(); await wait(100);
  eq("ticking a sub-task updates progress", [subPill().textContent.includes("1/2"), $("taskList").querySelector("li.sub").classList.contains("done")], [true, true]);
  $("tSearch").value = "taslak"; $("tSearch").dispatchEvent(new w.Event("input", { bubbles: true }));
  eq("search finds a task by its sub-task text", $("tCount").textContent, "1 sonuç");
  $("tSearch").value = ""; $("tSearch").dispatchEvent(new w.Event("input", { bubbles: true }));

  /* recurring tasks */
  $("tTitle").value = "Tekrar işi"; $("tRep").click(); await wait(80);
  eq("recurring modal opens prefilled with today's weekday", [$("mT").value, w.document.querySelectorAll("#modal .chip[aria-pressed=true]").length], ["Tekrar işi", 1]);
  $("mForm").dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true })); await wait(150);
  eq("series created and shown in today's list", [w.eval("S.rtasks.length"), $("taskList").textContent.includes("Tekrar işi"), $("taskList").textContent.includes("tekrar")], [1, true, true]);
  eq("add row cleared after creating a series", $("tTitle").value, "");
  const repLi = () => [...$("taskList").querySelectorAll("li.task")].find((l) => l.textContent.includes("Tekrar işi"));
  repLi().querySelector(".chk").click(); await wait(100);
  eq("ticking an occurrence stores it in doneOn", [Object.keys(w.eval("S.rtasks[0].doneOn")).length, repLi().classList.contains("done")], [1, true]);
  d.querySelector('[data-view="month"]').click(); await wait(100);
  eq("month view lists the occurrence too", d.querySelector("#moGrid").textContent.includes("Tekrar işi"), true);
  d.querySelector('[data-view="day"]').click(); await wait(100);
  repLi().querySelector(".tx").click(); await wait(80);
  eq("clicking an occurrence edits the series", [$("modal").textContent.includes("Tekrarlayan görevi düzenle"), !!$("mSkip"), !!$("mDel")], [true, true, true]);
  $("mSkip").click(); await wait(100);
  eq("'Bu gün yok' skips only that day", [w.eval("S.rtasks[0].skip.length"), !!repLi()], [1, false]);
  $("undoBtn").click(); await wait(100);
  eq("undo brings the occurrence back", [w.eval("S.rtasks[0].skip.length"), !!repLi()], [0, true]);
  repLi().querySelector(".tx").click(); await wait(80);
  $("mDel").click(); $("mDel").click(); await wait(150);
  eq("deleting the series removes all occurrences", [w.eval("S.rtasks.length"), !!repLi()], [0, false]);

  $("bTitle").value = "Test bloğu"; $("bAdd").click(); await wait(150);
  eq("block added", $("tl").textContent.includes("Test bloğu"), true);

  $("hTitle").value = "Test rutini"; $("hAdd").click(); await wait(100);
  eq("habit added", $("habitList").textContent.includes("Test rutini"), true);

  const qa = $("qa"); qa.value = "yarın 14:00-15:00 Matematik @MM-101 #ders"; qa.dispatchEvent(new w.Event("input", { bubbles: true }));
  eq("quick-add preview shown", $("qaPrev").hidden, false);
  qa.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await wait(200);
  eq("quick-add cleared after commit", qa.value, "");

  for (const v of ["week", "month", "day"]) {
    view(v); await wait(150);
    const el = v === "week" ? $("wkGrid") : v === "month" ? $("moGrid") : $("tl");
    eq(v + " view renders", el.innerHTML.length > 300, true);
  }
  /* phone month view: first tap selects a day and lists it, the button opens it */
  const mm = w.matchMedia; w.matchMedia = (q) => ({ matches: /max-width:\s*880/.test(q), media: q, addEventListener() {}, removeEventListener() {} });
  view("month"); await wait(100);
  const cells = [...d.querySelectorAll("#moGrid .mo-cell")], other = cells.find((c) => c.dataset.go !== w.eval("S.sel") && !c.classList.contains("out"));
  other.click(); await wait(100);
  eq("phone: tapping a day keeps the month view", [$("monthView").hidden, w.eval("S.sel") === other.dataset.go], [false, true]);
  eq("phone: the day list shows under the calendar", $("moDayTitle").textContent.length > 3 && $("moDayList").children.length > 0, true);
  $("moDayOpen").click(); await wait(100);
  eq("phone: 'Günü aç' opens the day view", [$("dayView").hidden, $("monthView").hidden], [false, true]);
  w.matchMedia = mm;
  view("week"); $("next").click(); $("prev").click(); $("todayBtn").click();
  view("month"); $("next").click(); $("todayBtn").click(); view("day"); await wait(100);

  $("bMore").click(); await wait(100);
  eq("block modal opens", !$("modalBg").hidden, true); key("Escape"); await wait(50);
  eq("Escape closes the modal", $("modalBg").hidden, true);
  $("setBtn").click(); await wait(100);
  eq("settings modal opens", $("modal").innerHTML.length > 500, true); key("Escape"); await wait(50);

  d.querySelectorAll(".tab").forEach((t) => t.click());
  key("k"); key("g"); key("h"); key("a"); key("g"); await wait(100);

  $("focusBtn").click(); $("fpTitle").value = "Odak"; $("fpStart").click(); await wait(200);
  eq("focus timer starts", $("focus").hidden, false);

  /* connection badge (Firebase build only): fake a firebase-like store */
  const st = w.eval("S.store"); st.pending = 0;
  w.eval("App.initSync()");
  eq("badge hidden while online and idle", $("syncBadge").hidden, true);
  Object.defineProperty(w.navigator, "onLine", { get: () => false, configurable: true });
  st.pending = 2; w.dispatchEvent(new w.Event("offline"));
  eq("offline badge shows pending writes", [$("syncBadge").hidden, $("syncBadge").textContent], [false, "Çevrimdışı · 2 bekliyor"]);
  Object.defineProperty(w.navigator, "onLine", { get: () => true, configurable: true });
  st.pending = 1; st.onPending(1); w.dispatchEvent(new w.Event("online"));
  eq("short saves do not flash the badge", $("syncBadge").hidden, true);
  await wait(800);
  eq("slow save shows Kaydediliyor…", $("syncBadge").textContent, "Kaydediliyor…");
  st.pending = 0; st.onPending(0);
  eq("badge hides when everything is saved", $("syncBadge").hidden, true);

  eq("no script errors", errors, []);
  console.log((fail ? "✗ " : "✓ ") + pass + " UI tests passed" + (fail ? ", " + fail + " failed" : ""));
  w.close();
  process.exit(fail ? 1 : 0);
})();
