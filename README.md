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
- **Exams, quizzes and deadlines:** shown in an "Upcoming" list and highlighted on the calendars. They attach themselves to the matching class
  block as a badge (`Stat363 quiz` → the Stat363 block that day). Any task can be pinned to a block, and any task can be starred.
- **Drag and drop** (desktop): move or resize blocks, drag across the empty timeline to create one, or drop a task onto the timeline or onto a block.
- **Focus timer:** a Pomodoro timer for a task, a block or a free session. Focus time is logged per day, week and task.
- **Habits:** daily or N-times-a-week goals with streaks.
- **Settings:** categories, task types, colors, theme (light / dark / system), accent color, day range and timer lengths.
- **Sync and offline:** Firebase email/password sign-in. Data is cached on the device and syncs when a connection is back.
- **Backup:** export and import everything as JSON.

## Keyboard

`/` quick add · `G` `H` `A` day / week / month · `←` `→` previous / next · `T` today · `N` new task · `B` new block ·
`O` start / pause focus · `K` theme · `,` settings · `Esc` close

## Tech

Plain HTML, CSS and JavaScript, with no framework and no build step required to run.

```
index.html             app shell
css/style.css          design: pastel light and soft dark themes, responsive layout
js/core.js             pure logic (dates, timeline lanes, quick-add parser, streaks, week/month grids); UI-independent and unit-tested
js/store.js            storage layer with one interface over three backends: Firebase Firestore, localStorage, or a claude.ai artifact database
js/sync.js             Firebase sign-in and connection
js/firebase-config.js  Firebase web config (null = data stays in this browser only)
js/app.js              user interface
sw.js, manifest.webmanifest, icons/   installable PWA and offline support
build.js               node build.js → dist/planner.html (single-file build)
tests/core.test.js     node tests/core.test.js (157 tests)
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
| `tasks` | random id | title, cat, kind, imp (starred), date (YYYY-MM-DD or null), done, doneAt, createdAt, blk (linked block id, "-" = none) |
| `days` | date | date, blocks [{id, s, e, t, c, loc}] (s/e = minutes from midnight), note, skip [weekly block ids skipped that day] |
| `recurring` | random id | t, c, loc, s, e, dow [1=Mon … 7=Sun], from, until, createdAt |
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
