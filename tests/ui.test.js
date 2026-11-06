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

  $("tTitle").value = "Test görevi"; $("tAdd").click(); await wait(100);
  eq("task added", $("taskList").textContent.includes("Test görevi"), true);
  $("taskList").querySelector(".chk").click(); await wait(100);
  eq("task toggled done", $("taskList").querySelector("li").classList.contains("done"), true);

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

  eq("no script errors", errors, []);
  console.log((fail ? "✗ " : "✓ ") + pass + " UI tests passed" + (fail ? ", " + fail + " failed" : ""));
  w.close();
  process.exit(fail ? 1 : 0);
})();
