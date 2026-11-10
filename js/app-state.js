/* Planner — UI: shared basics, loaded first.
   S    = shared mutable state (tasks, selected day, view, …)
   App  = functions shared between the app-*.js files (each file adds its own with Object.assign(App, …)) */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3.2L13 5"/></svg>';
const COLORNAME = { blue: "Mavi", violet: "Mor", green: "Yeşil", amber: "Turuncu", red: "Kırmızı", pink: "Pembe", teal: "Turkuaz", slate: "Gri" };
const ACCENTNAME = { violet: "Mor", blue: "Mavi", green: "Yeşil", pink: "Pembe", orange: "Turuncu" };

const App = {};
const S = {};
S.cfg = GD.normalizeSettings(null);
S.TODAY = GD.key(new Date());
S.sel = S.TODAY;
S.store = null;
S.writable = true;
S.tasks = [];
S.tasksLoaded = false;   /* the first task list has arrived from the store */
S.rtasks = [];
S.habits = [];
S.logs = {};
S.recurring = [];
S.dayDoc = { blocks: [], note: "", skip: [] };
S.dayLoaded = false;
S.unsubDay = null;
S.pendingNote = null;
S.noteTimer = null;
S.view = "day";
S.rangeDays = {};
S.unsubRange = null;
S.rangeKey = "";
S.pendingOpen = null;
S.dayHH = 54;
S.weekHH = 42;
S.weekDaysCache = [];
S.drag = null;
S.suppressClick = false;
S.focus = null;
S.focusTick = null;
S.audioCtx = null;
S.focusByDay = {};
S.focusByTask = {};
S.modalOnClose = null;
S.tlScrolledFor = "";
S.modeHtml = "bağlanıyor…";
S.canExport = false;
S.tSearch = "";
S.tFilter = "all";
S.subsOpen = {};
S.justDone = null;   /* {id, ts}: the thing ticked a moment ago (for the tick animation) */
S.focusRows = [];
S.statsDays = 30;
S.gradeBase = null;   /* {cgpa, credits} of the "previous total" */
S.gradeTerms = [];    /* [{id, name, courses: [{id, name, credit, grade, old, scn}]}] */
