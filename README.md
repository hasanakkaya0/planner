# Planner

A day / week / month planner that runs in the browser: an hour-by-hour schedule, a weekly class timetable,
exams and deadlines, habit streaks, a focus timer and a daily note. It syncs between phone and computer, works offline
and can be added to the iPhone home screen like a native app.

**Live:** [hasanakkaya0.github.io/planner](https://hasanakkaya0.github.io/planner/). Create an account and your data stays private to you.

> The interface is in Turkish.

## Features

- **Three views:** day (timeline, tasks, habits, note), week (7-column timeline) and month (calendar with each day's exams, tasks and classes).
- **Quick add:** type one line such as `yarın 14:00-15:30 Matematik @MM-101 #ders` and the date, time, place and category are parsed for you.
- **Weekly classes:** enter your timetable once and it repeats every week. You can skip a single day (a holiday) or end the series (end of term).
- **Palettes** (Settings → Palet): four whole-app colour schemes — three taken from a colour-combination reel (below) and "Sakin", a soft one (warm greige instead of white in light, soft charcoal with muted pastels and no neon in dark, with softened category colours) — Mandalina (charcoal #21232E, royal blue #105BFF, tangerine #FE8500), Sakız (marshmallow #F0F0F0, violet #5841FF, bubblegum #FF6AD2) and Akuamarin (midnight #171F44, aqua #74FFED, baby pink #FE81D1). Each has a light and a dark variant that follows the theme choice (Açık / Koyu / Cihaza göre, or the K key); previewed live in the settings window.
- **Appearance:** reading size (4 steps) and layout density (comfortable / compact) per device; type scale with clear hierarchy; an opening screen; the status-bar colour follows the theme; small line drawings in empty lists; the main colour in the small places (focus ring, selection, scrollbars).
- **Polish:** category icons and durations on timeline blocks, a progress fill on the block in progress, a progress ring and a greeting next to the date, tick / modal / view transitions (all off with reduced motion).
- **Today strip:** above today's timeline, "Şimdi" (block in progress, time left) or "Sıradaki" (next block, time until it), the day's task count and the next exam / deadline. The block in progress is outlined and the now line shows the time.
- **Swipe on a phone:** right = done, left = move to tomorrow (on a mouse the same actions are the row buttons, now always faintly visible).
- **Reminders** (Settings → Hatırlatmalar…): a class / block is announced a few minutes before it starts; exams and deadlines the morning of the day (08:00) and the evening before (20:00). Works while the app (or its tab) is open: it checks every ~30 s and uses a system notification when permitted, otherwise an in-app message. The choice is per device.
- **End of term** (Settings → Dönem sonu…): end the weekly classes on a chosen day and clear old finished tasks (a backup has to be downloaded first). Past days stay as they were.
- **Statistics** (chart button or `I`): focus time, finished tasks, habit completion and active days over the last 7 / 30 / 90 days, with daily bars and a per-category breakdown.
- **Notes and sub-tasks:** any task can carry a note and a checklist; the row shows progress (`1/3`) and expands in place. Search also looks inside them.
- **Recurring tasks:** "every Monday and Wednesday: gym". Each occurrence is ticked off separately; a single day can be skipped or the series ended.
- **Exams, quizzes and deadlines:** shown in an "Upcoming" list and highlighted on the calendars. They attach themselves to the matching class
  block as a badge (`Stat363 quiz` → the Stat363 block that day). Any task can be pinned to a block, and any task can be starred.
- **Drag and drop** (desktop): move or resize blocks, drag across the empty timeline to create one, or drop a task onto the timeline or onto a block.
- **Focus timer:** a Pomodoro timer for a task, a block or a free session. Focus time is logged per day, week and task.
- **Habits:** daily or N-times-a-week goals with streaks.
- **Settings:** categories, task types, colors, theme (light / dark / black / system), accent color, day range and timer lengths.
- **Sync and offline:** Firebase email/password sign-in. Data is cached on the device and syncs when a connection is back.
- **Backup:** export and import everything as JSON.

## Keyboard

`/` quick add · `G` `H` `A` day / week / month · `←` `→` previous / next · `T` today · `N` new task · `B` new block ·
`O` start / pause focus · `I` statistics · `K` theme · `,` settings · `Esc` close

## Tech

Plain HTML, CSS and JavaScript, with no framework and no build step required to run.

```
index.html             app shell
css/style.css          design: pastel light and soft dark themes, responsive layout
js/core.js             pure logic (dates, timeline lanes, quick-add parser, streaks, week/month grids); UI-independent and unit-tested
js/store.js            storage layer with one interface over three backends: Firebase Firestore, localStorage, or a claude.ai artifact database
js/sync.js             Firebase sign-in and connection
js/firebase-config.js  Firebase web config (null = data stays in this browser only)
js/app-state.js        shared basics: S (shared mutable state), App (shared functions), DOM helpers
js/app-ui.js           settings helpers, banner / toast / modal
js/app-day.js          day view: header, timeline, blocks, day document
js/app-lists.js        day view: tasks, habits, note
js/app-week.js         week view and fit-to-screen
js/app-month.js        month view and range navigation
js/app-settings.js     theme, backup (export / import), settings window
js/app-quickadd.js     quick add bar
js/app-dnd.js          drag and drop on the timeline
js/app-focus.js        focus timer
js/app.js              event wiring, subscriptions, start-up (loaded last)
sw.js, manifest.webmanifest, icons/   installable PWA and offline support
fonts/                 Plus Jakarta Sans (latin + latin-ext, SIL OFL; see fonts/LICENSE.txt), served from this site so it works offline
build.js               node build.js → stamps the cache version into sw.js / index.html, writes dist/planner.html (single-file build)
tests/core.test.js     node tests/core.test.js (157 tests)
tests/store.test.js    node tests/store.test.js (cloud store: limits, full backup, batched restore)
tests/colors.test.js   node tests/colors.test.js (WCAG contrast of every colour pair in light / dark / black)
tests/ui.test.js       node tests/ui.test.js (jsdom: boots dist/planner.html and drives the main flows; run `npm test`)
```

### Data model

Each user's data lives under `users/<uid>/` in Firestore. Security rules allow a signed-in user to read and write only their own documents:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

| Collection | Document | Fields |
|---|---|---|
| `tasks` | random id | title, cat, kind, imp (starred), date (YYYY-MM-DD or null), done, doneAt, createdAt, blk (linked block id, "-" = none), note, subs [{t, d}] |
| `days` | date | date, blocks [{id, s, e, t, c, loc}] (s/e = minutes from midnight), note, skip [weekly block ids skipped that day] |
| `recurring` | random id | t, c, loc, s, e, dow [1=Mon … 7=Sun], from, until, createdAt |<br>recurring tasks use the same collection with `task: true`: title, cat, kind, dow, from, until, doneOn {date: ts}, skip [dates], createdAt
| `habits` | random id | name, target (7 = daily), order, createdAt |
| `habitlog` | date | date, done {habitId: true} |
| `settings` | `main` | cats, kinds, defaultCat, dayStart, dayEnd, upcomingDays, accent, focusMins, breakMins |
| `focus` | random id | date, start, mins, title, cat, taskId |

## Author

**Hasan Akkaya** · [GitHub](https://github.com/hasanakkaya0) · [LinkedIn](https://www.linkedin.com/in/hasanakkaya0)

## License

© 2026 Hasan Akkaya. All rights reserved.
The source code is published for viewing only. It may not be copied, modified, redistributed or used in other projects
without written permission. You are welcome to use the app itself at the link above.
