/* Çalıştır: node build.js
   index.html + css + js → dist/planner.html (tek dosya).
   Bu dosya claude.ai'deki Planner linkine yayınlanan sürümdür; orada veriler bulutta tutulur. */
const fs = require("fs");
const path = require("path");
const R = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");

const html = R("index.html");
const m = html.match(/<!-- BODY START -->([\s\S]*?)<!-- BODY END -->/);
if (!m) throw new Error("index.html içinde BODY START / BODY END işaretleri yok.");
const fonts = (html.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/) || [""])[0];

const js = ["js/core.js", "js/store.js", "js/app.js"].map(R).join("\n");
if (/<\/script/i.test(js)) throw new Error("JS içinde </script geçiyor; tek dosyaya gömülemez.");

const out = [
  "<title>Planner</title>",
  '<meta name="claude:viewport-fit-sides" content="cover">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  fonts,
  "<style>\n" + R("css/style.css") + "\n</style>",
  m[1].trim(),
  "<script>\n" + js + "\n</script>",
  ""
].join("\n");

fs.mkdirSync(path.join(__dirname, "dist"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "dist", "planner.html"), out);
console.log("dist/planner.html yazıldı (" + Math.round(out.length / 1024) + " KB)");
