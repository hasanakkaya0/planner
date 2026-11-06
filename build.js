/* Run: node build.js
   1) stamps one version (a hash of the app files) into sw.js (cache name) and index.html (?v=...),
      so a changed file can never be served from an old cache and there is no number to bump by hand;
   2) index.html + css + js → dist/planner.html (single file).
   That file is the version published to the Planner link on claude.ai, where data is stored in the artifact database. */
const fs = require("fs");
const path = require("path");
const R = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");

/* ---- version stamp ---- */
const crypto = require("crypto");
const APP_FILES = ["js/app-state.js", "js/app-ui.js", "js/app-day.js", "js/app-lists.js", "js/app-week.js", "js/app-month.js", "js/app-settings.js", "js/app-quickadd.js", "js/app-dnd.js", "js/app-focus.js", "js/app-welcome.js", "js/app-sync.js", "js/app-repeat.js", "js/app.js"];
const VER_FILES = ["css/style.css", "js/core.js", "js/store.js", "js/sync.js", ...APP_FILES, "js/firebase-config.js", "manifest.webmanifest"];
const norm = (t) => t.replace(/\?v=[0-9a-f]+/g, "?v=X").replace(/planner-v[0-9a-f]+/g, "planner-vX");
const h = crypto.createHash("sha1");
const LF = (t) => t.replace(/\r\n/g, "\n");   /* same hash on Windows (CRLF) and CI (LF) */
VER_FILES.forEach((f) => h.update(LF(R(f))));
["fonts/plus-jakarta-sans-latin.woff2", "fonts/plus-jakarta-sans-latin-ext.woff2"].forEach((f) => h.update(fs.readFileSync(path.join(__dirname, f))));
h.update(LF(norm(R("index.html")))).update(LF(norm(R("sw.js"))));
const VER = h.digest("hex").slice(0, 8);
const stamp = (file) => {
  const cur = R(file);
  const next = cur.replace(/\?v=[0-9a-f]+/g, "?v=" + VER).replace(/planner-v[0-9a-f]+/g, "planner-v" + VER);
  if (next !== cur) fs.writeFileSync(path.join(__dirname, file), next);
};
stamp("index.html");
stamp("sw.js");
console.log("version " + VER);

const html = R("index.html");
const m = html.match(/<!-- BODY START -->([\s\S]*?)<!-- BODY END -->/);
if (!m) throw new Error("index.html is missing the BODY START / BODY END markers.");
/* the single-file build has no folders: the fonts are inlined into the CSS as data URIs */
const css = R("css/style.css").replace(/url\(\.\.\/(fonts\/[^)]+)\)/g, (_, f) => "url(data:font/woff2;base64," + fs.readFileSync(path.join(__dirname, f)).toString("base64") + ")");

const js = ["js/core.js", "js/store.js", ...APP_FILES].map(R).join("\n");
if (/<\/script/i.test(js)) throw new Error("JS contains </script; it cannot be inlined into a single file.");

const out = [
  "<title>Planner</title>",
  '<meta name="claude:viewport-fit-sides" content="cover">',
  "<style>\n" + css + "\n</style>",
  m[1].trim(),
  "<script>\n" + js + "\n</script>",
  ""
].join("\n");

fs.mkdirSync(path.join(__dirname, "dist"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "dist", "planner.html"), out);
console.log("dist/planner.html written (" + Math.round(out.length / 1024) + " KB)");
