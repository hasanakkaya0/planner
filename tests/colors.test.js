/* node tests/colors.test.js — WCAG contrast of the colour tokens in css/style.css (light / dark / black):
   text on its background >= 4.5:1, coloured swatches on cards >= 3:1. Fails when a new colour drops below. */
const fs = require("fs");
const css = fs.readFileSync(require("path").join(__dirname, "..", "css", "style.css"), "utf8").replace(/\r\n/g, "\n");
const lum = (h) => { const n = parseInt(h.slice(1), 16), c = [n >> 16 & 255, n >> 8 & 255, n & 255].map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const vars = (block) => { const o = {}; block.replace(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g, (_, k, v) => { o[k] = v; }); return o; };
const light = vars(css.slice(css.indexOf(":root{"), css.indexOf("@media (prefers-color-scheme: dark)")));
const darkStart = css.indexOf(':root:is([data-theme="dark"],[data-theme="black"]){');
const dark = Object.assign({}, light, vars(css.slice(darkStart, css.indexOf("}", darkStart))));
const bStart = css.indexOf(':root[data-theme="black"]{');
const black = Object.assign({}, dark, vars(css.slice(bStart, css.indexOf("}", bStart))));
const cc = (re) => { const o = {}; let m; while ((m = re.exec(css))) o[m[1]] = { c: m[2], soft: m[3] }; return o; };
const catsLight = cc(/^\.c-([a-z]+)\{--c:(#[0-9a-f]{6});--c-soft:(#[0-9a-f]{6})\}/gm);
const catsDark = cc(/^:root:is\(\[data-theme="dark"\],\[data-theme="black"\]\) \.c-([a-z]+)\{--c:(#[0-9a-f]{6});--c-soft:(#[0-9a-f]{6})\}/gm);
const acc = (re) => { const o = {}; let m; while ((m = re.exec(css))) o[m[1]] = { a: m[2], s: m[3] }; return o; };
const accL = acc(/^:root\[data-accent="([a-z]+)"\]\{--accent:(#[0-9a-f]{6});--accent-soft:(#[0-9a-f]{6})\}/gm);
const accD = acc(/^:root:is\(\[data-theme="dark"\],\[data-theme="black"\]\)\[data-accent="([a-z]+)"\]\{--accent:(#[0-9a-f]{6});--accent-soft:(#[0-9a-f]{6})\}/gm);
const palettes = {};
css.replace(/:root\[data-palette="([a-z]+)"\]\[data-theme="(light|dark)"\]\{([^}]*)\}/g, (_, name, mode, body) => { palettes[name + " " + mode] = vars(body); });
const rows = [];
const add = (theme, name, fg, bg, min) => { const r = ratio(fg, bg); rows.push({ theme, name, r: +r.toFixed(2), min, bad: r < min }); };
const modes = (n) => (n.endsWith("light") ? [light, catsLight] : [dark, catsDark]);
const sets = [["light", light, catsLight, accL], ["dark", dark, catsDark, accD], ["black", black, catsDark, accD]];
/* a palette may soften the category colours too */
const palCats = {};
css.replace(/:root\[data-palette="([a-z]+)"\]\[data-theme="(light|dark)"\] \.c-([a-z]+)\{--c:(#[0-9a-fA-F]{6});--c-soft:(#[0-9a-fA-F]{6})\}/g, (_, p, m, n, c, so) => { ((palCats[p + " " + m] = palCats[p + " " + m] || {})[n] = { c, soft: so }); });
Object.keys(palettes).forEach((n) => sets.push(["pal:" + n, Object.assign({}, modes(n)[0], palettes[n]), Object.assign({}, modes(n)[1], palCats[n] || {}), {}]));
if (Object.keys(palettes).length !== 8) { console.log("✗ expected 8 palette variants (4 palettes × light / dark), found " + Object.keys(palettes).length); process.exit(1); }
for (const [tn, T, cats, accs] of sets) {
  add(tn, "ink / card", T.ink, T.card, 4.5);
  add(tn, "ink-soft / card", T["ink-soft"], T.card, 4.5);
  add(tn, "ink-faint / card (small labels)", T["ink-faint"], T.card, 4.5);
  add(tn, "ink-faint / paper", T["ink-faint"], T.paper, 4.5);
  add(tn, "accent / card", T.accent, T.card, 4.5);
  add(tn, "accent / accent-soft", T.accent, T["accent-soft"], 4.5);
  add(tn, "on-accent / accent (buttons)", T["on-accent"], T.accent, 4.5);
  /* panel header titles sit on the section tints */
  add(tn, "accent / tint-blue (header)", T.accent, T["tint-blue"], 4.5); add(tn, "accent / tint-lilac (header)", T.accent, T["tint-lilac"], 4.5);
  add(tn, "moss / tint-mint (header)", T.moss, T["tint-mint"], 4.5); add(tn, "rose / tint-peach (header)", T.rose, T["tint-peach"], 4.5); add(tn, "ochre / tint-butter (header)", T.ochre, T["tint-butter"], 4.5);
  for (const k of ["moss", "ochre", "rose"]) { add(tn, k + " / card", T[k], T.card, 4.5); add(tn, k + " / " + k + "-soft", T[k], T[k + "-soft"], 4.5); }
  for (const [n, v] of Object.entries(cats)) { add(tn, "c-" + n + " / its soft", v.c, v.soft, 4.5); add(tn, "c-" + n + " / card (swatch, text)", v.c, T.card, 3); }
  for (const [n, v] of Object.entries(accs)) { add(tn, "accent " + n + " / soft", v.a, v.s, 4.5); add(tn, "accent " + n + " / card", v.a, T.card, 4.5); }
}
const bad = rows.filter((x) => x.bad);
bad.forEach((x) => console.log("✗ " + x.theme.padEnd(5), x.name.padEnd(36), x.r, "(need " + x.min + ")"));
console.log((bad.length ? "✗ " : "✓ ") + (rows.length - bad.length) + " colour pairs pass" + (bad.length ? ", " + bad.length + " below target" : ""));
process.exit(bad.length ? 1 : 0);
