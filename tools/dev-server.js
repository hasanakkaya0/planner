/* Local preview server:  npm run dev  →  http://localhost:4173
   Serves the repository as it is, with two differences so the app can be tried without an account:
     - js/firebase-config.js answers "no Firebase" → the app keeps its data in this browser (localStorage);
     - sw.js is empty → no service worker caching while you edit files.
   PLANNER_FIREBASE=1 npm run dev  serves the real config and service worker (sign-in screen, real data: be careful). */
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const PORT = +process.env.PORT || 4173;
const REAL = process.env.PLANNER_FIREBASE === "1";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".json": "application/json" };

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const send = (code, type, body) => { res.writeHead(code, { "content-type": type, "cache-control": "no-store" }); res.end(body); };
  if (!REAL && p === "/js/firebase-config.js") return send(200, "text/javascript", "window.PLANNER_FIREBASE = null;");
  if (!REAL && p === "/sw.js") return send(200, "text/javascript", "/* disabled by tools/dev-server.js */");
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) return send(403, "text/plain", "forbidden");
  fs.readFile(file, (err, data) => (err ? send(404, "text/plain", "not found") : send(200, TYPES[path.extname(file)] || "application/octet-stream", data)));
}).listen(PORT, () => console.log("Planner on http://localhost:" + PORT + (REAL ? "  (real Firebase config)" : "  (local storage mode, no service worker)")));
