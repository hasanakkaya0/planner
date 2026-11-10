# Planner — guide for whoever works on this next

Planner is a day / week / month planner for a university student (ODTÜ), written in plain HTML, CSS and JavaScript:
no framework, no bundler, nothing to compile to run it. It is an installable PWA with Firebase sync.

- Live: https://hasanakkaya0.github.io/planner/ (GitHub Pages, deployed from `main` on every push)
- Repo: https://github.com/hasanakkaya0/planner — owner and only user-facing decision maker: Hasan Akkaya
- The interface is Turkish. Code, comments, commit messages and this file are English (a deliberate choice).
- `README.md` is the public description (features, file list, data model). Keep it true when you change things.

State of this guide: written 2026-11-10, after the app grew from one 1700-line `app.js` to the modules below.


## Working with Hasan

- Talk to him in Turkish, informally. He writes short, fast messages with typos; read for intent.
- He is not reviewing code line by line. He looks at the result in the app and at your summary. So the summary must be
  plain and complete: what changed for the user, what you verified and how, and what you did **not** verify.
- He usually says "devam" and expects you to carry a list through on your own, in the order he gave. Do the work,
  test it, push it, then report. Do not ask permission for each step of something he already approved.
- Do ask first before a risky or wide refactor, before deleting data-related behaviour, and when a decision is his
  (wording he will be judged on, visual taste, anything needing his Firebase console).
- Run the checks yourself (`npm run check`); never tell him to run them.
- He decided **not** to do these; do not re-propose them unprompted: accessibility work (keyboard block moving,
  screen-reader pass), .ics import / export, Google sign-in (needs Firebase console setup), checking the Firestore
  rules in the console, a real-browser (Playwright-style) CI test.
- Colours and look are his taste. Offer, show a screenshot, adjust when he reacts.


## Commands

```bash
npm run check   # = npm test: core + store + colour tests, then the build, then the jsdom UI test
npm run build   # stamps the version into index.html / sw.js and writes dist/planner.html
npm run dev     # local preview on http://localhost:4173 (local-storage mode, no service worker)
```

`.claude/launch.json` starts the same preview server (`planner-local`). `gh` is not installed on Hasan's PC; read CI
results with the public API: `https://api.github.com/repos/hasanakkaya0/planner/actions/runs?per_page=1`.


## Shipping a change

1. Make the change; add or extend tests (see "Tests").
2. `npm run check`. It must be fully green. The build rewrites the version stamp in `index.html` and `sw.js`;
   those two files are part of your commit. CI fails if the committed stamp is stale.
3. Look at it in a browser through the dev server (both a phone-sized and a wide viewport when layout is involved,
   light and dark when colour is involved). jsdom has no layout: a green UI test says nothing about how it looks.
4. Commit (English, imperative subject, a body that says why) and push to `main`. That is the release.
5. Confirm the CI run is green and the live site serves the new file.
6. If users should notice it, add an entry to the "what's new" list (see recipes).

Line endings are normalised to LF by `.gitattributes`; the version hash ignores CRLF / LF on purpose.


## How the code is organised

```
index.html            app shell; one inline script applies theme / palette / size before first paint
css/style.css         all styles; colour tokens at the top, later sections appended in the order they were built
js/core.js            GD: pure logic (dates, lanes, quick-add parser, streaks, stats, grades, reminders…). No DOM.
js/store.js           GDStore: one interface over three backends (Firestore, localStorage, claude.ai artifact db)
js/sync.js            Firebase sign-in and connection
js/firebase-config.js public web config (not a secret; Firestore rules protect the data)
js/app-state.js       loaded first: DOM helpers ($, esc, uid), `S` (shared mutable state), `App` (shared functions)
js/app-*.js           one feature each, an IIFE that ends with Object.assign(App, { …what others may call… })
js/app.js             loaded last: event wiring, store subscriptions, boot
sw.js                 service worker: network first for app files, offline cache
build.js              version stamp + single-file build + a check that the three file lists agree
tools/dev-server.js   the preview server
tests/                core / store / colours / ui (see below)
```

Rules that hold everywhere:

- **`S` and `App`.** State used by more than one file lives on `S` (declared in `app-state.js`). A function used by
  another file is exported with `Object.assign(App, {...})` and called as `App.name()`. Anything else stays local to
  its file. Scripts are classic scripts (not modules) and load in the order listed in `index.html`.
- **Pure logic goes in `core.js`** with a test in `tests/core.test.js`; the UI file only renders and wires.
- **Rendering is string building + `innerHTML`.** Every piece of user text goes through `esc()`. No exceptions.
- **Three stores, one interface** (`watch`, `watchDoc`, `watchRange`, `getDoc`, `set`, `update`, `del`, `dump`,
  `bulk`). Write through `App.w(S.store.set(...))` so errors reach the banner; call `App.guard()` before writing.
  `update` fails on a missing document (also in the local store): use `set` when it may not exist.
- **Tasks:** read `App.allTasks()` for anything shown to the user (real tasks + occurrences of recurring tasks);
  `S.tasks` is only the stored ones. Occurrences are virtual: `id` = `r:<series>:<date>`, `virtual: true`; their
  completion lives in the series' `doneOn` map (`js/app-repeat.js`).
- **The day range is a setting** (`GD.DAY_START`, `GD.DAY_END`, hours). Never hard-code 08:00 or 23:00.
- **Undo instead of confirm** for single deletions (`App.toast(msg, undoFn)`); two-step `App.armed(btn, fn)` for
  things that cannot be undone.

### Per-device settings (localStorage, prefix `gunDefteri.`)

`theme` (light / dark / black; absent = follow the device), `palette`, `fs` (reading size), `dens` (density),
`accent` (cache of the synced main colour, for the pre-paint script), `view`, `tab`, `notif` + `notified`
(reminders), `welcome`, `news` (last "what's new" id seen), `gradeTarget`, `focus` (running timer), `seeded`,
`v1` (all data, local-storage mode). Synced settings (categories, kinds, day range, main colour, timer lengths)
are the `settings/main` document.

### Data

Under `users/<uid>/` in Firestore: `tasks`, `days`, `recurring` (weekly blocks **and** recurring tasks, the latter
with `task: true`), `habits`, `habitlog`, `settings`, `focus`, `grades` (`base` + one document per term). Field
lists are in the README. Live lists are limited (`QUERY` in `store.js`: 3000 tasks…) and warn when full; `dump()`
(backup) reads everything.


## Recipes

**Add a feature file `js/app-foo.js`.** Copy the shape of a small one (`app-stats.js`). Then add it in three places,
in load order: the `<script>` tags of `index.html`, `APP_FILES` in `build.js`, `SHELL` in `sw.js`. `node build.js`
refuses to build if they disagree.

**Add a window (modal).** `App.openModal(title, bodyHtml, footerHtml, onSubmit, wide)`. For events inside it set
`$("modal").oninput / .onchange / .onclick` (properties) or handlers on elements you just created. Never
`addEventListener` on `#modal` or `#modalBg`: those elements live for the whole session and the listeners pile up.
`closeModal()` clears the three properties. `S.modalOnClose = fn` runs once when it closes.

**Add a stored collection.** `COLS` and `QUERY` in `store.js` (the `orderBy` field must exist on every document or
Firestore silently skips it), the empty object in `GD.normalizeBackup`, a `watch` in `startSubs()` (`app.js`), the
README table. The existing Firestore rule already covers anything under `users/<uid>/`.

**Add a colour or a palette.** Colours are tokens (`--paper`, `--card`, `--ink`, `--accent`, `--moss`, `--ochre`,
`--rose`, `--tint-*`, category colours `.c-*`). A palette is a pair of blocks
`:root[data-palette="x"][data-theme="light|dark"]` plus its id in `PALETTES` / `PALETTE_IDS` (`app-settings.js`)
and in the pre-paint script of `index.html`. `node tests/colors.test.js` checks WCAG contrast (4.5:1 for text) for
every theme and palette and expects exactly 8 palette variants: update that number when you add one. Never put a
raw hex colour in a component rule.

**Add text sizes.** Write `font-size:calc(13px * var(--fs,1))`, never a bare px size, or the reading-size setting
skips it. (The 16px rule for inputs on phones is the one exception: it stops iOS zooming.)

**Announce a change to users.** Add an entry at the **top** of `NEWS` in `js/app-news.js` with a new `id`. People who
saw an older id get only the newer entries, once per device. Keep it to what a user would notice, in his words.

**Add a quick-add phrase, a statistic, a rule.** It is logic: `core.js` + a test first, then the UI.


## Tests

| File | What it covers |
|---|---|
| `tests/core.test.js` | `GD` pure logic, plus the local store. The numbers of real examples are pinned (e.g. the metugpa.com GPA example). |
| `tests/store.test.js` | The cloud store against a fake Firestore: limits, full backup, batched restore, pending-write counter. |
| `tests/colors.test.js` | Contrast of every colour pair, all themes and palettes. |
| `tests/ui.test.js` | Loads `dist/planner.html` in jsdom (local-storage mode) and drives the app: adds tasks, opens every window, switches views, palettes… Fails on any script error. |

Things to know before touching `ui.test.js`:

- It is one long async script; sections depend on state left by earlier ones. Append near related sections and
  clean up what you create.
- The app has its own timers (reminder check 4 s after start and every 30 s, first-run check, a one-minute tick).
  A test must not depend on *which* call did something. A reminder test failed for exactly this reason once the
  file grew: assert on the outcome (a recorded message, a stored flag), not on "my call showed the toast".
- Some checks depend on the wall clock (a block "in progress" needs to fit inside the day range). They are guarded
  with `if`. If you add one, guard it too, and think about 23:55 and about UTC on CI.
- jsdom has no layout, no `matchMedia`, no notifications, no service worker. Stubs are at the top of the file.
- After writing a test, break the code on purpose once and see the test go red. A test that cannot fail is noise.
- An SVG element has no `.hidden` property: use `setAttribute("hidden", "")`. jsdom did not catch that; a browser did.

There is no linter in the repo. The UI test catches syntax and reference errors that happen at load or on the
paths it drives; a typo in a rarely used branch can still slip through, so drive new branches in the test.


## What has never been verified

Be honest about this in every summary until someone does it:

- **The signed-in Firebase build.** Everything was exercised in local-storage mode, in jsdom and against a fake
  Firestore. Real sign-in, real sync between two devices, offline writes catching up, and the "pending writes"
  badge were not tried by the assistant (no credentials, by design).
- **A real phone.** Touch swipes, the installed PWA, the opening screen on iOS, system notifications (iOS needs the
  app on the home screen, 16.4+), safe-area insets. Only viewport emulation was used.
- **Backup download and restore end to end** in a real browser against real data.
- **The claude.ai artifact build** (`dist/planner.html` with the artifact database) after the recent features.

Do not enter credentials or create accounts. Ask Hasan to try it and tell you what he sees.


## Known limits and rough edges

- Reminders work only while the app or its tab is open. No server, no push.
- The opening screen appears after iOS's own launch screen; it does not replace it.
- Grades: letter points and the "new grade replaces the old one" rule are what Hasan asked for and what the two
  METU calculators do. Honour thresholds (3.00 / 3.50) come from a calculator's FAQ, not from the regulation.
  A retake finds its first attempt by course name (letters and digits only, case-insensitive) when it is in the
  list; otherwise it assumes the old attempt is inside "previous total".
- Recurring tasks: no notes or sub-tasks, not found by search, not counted in statistics, edits apply to the series.
- `font-size:clamp(...)` values (the date title) do not follow the reading-size setting. At "Çok büyük" some
  one-line labels are cut with an ellipsis.
- "New user" is a guess: no tasks, no weekly blocks, no days in range once the first task list has arrived.
- The week view's tick boxes are spans inside buttons (works, not valid nesting).
- `app-settings.js` holds too much (theme, palettes, size, backup, the settings window). Splitting it is fair game,
  with Hasan's go-ahead.
- Drag and drop has no automated test at all.
- `css/style.css` is append-ordered: later blocks override earlier ones on purpose. Search before adding a rule.


## Ideas not done yet (Hasan picks)

Grades: "which course should I retake" table (CGPA gain per course), GPA / CGPA chart per term, progress to the
graduation credit total, course-name autocomplete and filling this term from the weekly schedule, gentle warning
thresholds, a shareable summary card.
Planning: paste the university schedule or exam list and get blocks / tasks, duration estimates with "today's load"
and "place it in a free gap", study-plan suggestion before an exam, day templates, hide / reorder panels.
Focus and habits: estimate vs. actual time, a distraction-free focus screen, streak badges, a weekly review screen,
an evening summary.
Small: richer quick-add ("her pazartesi spor"), voice input, a 30-day bin for deleted things, print / PDF,
an English interface, an error log he can copy, notes and sub-tasks on recurring tasks, sliding the statistics
period, a monthly "take a backup" nudge, a CSV export.
