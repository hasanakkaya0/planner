/* node tests/store.test.js — cloudStore against a small fake Firestore (limits, backup, batched restore) */
const GDStore = require("../js/store.js");
let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) pass++; else { fail++; console.log("✗ " + name + "\n   got:  " + a + "\n   want: " + b); }
};

/* fake Firestore: data = { "users/u/tasks": { id: fields } } */
function fakeDb(data, opts) {
  const log = { queries: [], batches: [], singles: 0 };
  const snap = (col, order, lim) => {
    let docs = Object.keys(data[col] || {}).map((id) => ({ id, data: () => data[col][id] }));
    if (order) {   /* like Firestore: orderBy skips documents that lack the field */
      docs = docs.filter((d) => d.data()[order[0]] !== undefined)
        .sort((a, b) => (a.data()[order[0]] < b.data()[order[0]] ? -1 : 1) * (order[1] === "desc" ? -1 : 1));
    }
    if (lim) docs = docs.slice(0, lim);
    return { docs };
  };
  const coll = (col, order, lim) => ({
    orderBy: (f, d) => coll(col, [f, d], lim),
    limit: (n) => coll(col, order, n),
    onSnapshot: (cb) => { log.queries.push({ col, order, lim }); cb(snap(col, order, lim)); return () => {}; },
    get: () => { log.queries.push({ col, order, lim, get: true }); return Promise.resolve(snap(col, order, lim)); }
  });
  const ref = (path) => ({ path, set: (v) => { log.singles++; const i = path.lastIndexOf("/"); (data[path.slice(0, i)] = data[path.slice(0, i)] || {})[path.slice(i + 1)] = v; return Promise.resolve(); } });
  const db = { collection: coll, doc: ref };
  if (!opts || opts.batch !== false) {
    db.batch = () => {
      const ops = [];
      return {
        set: (r, v) => ops.push([r, v]),
        commit: () => { log.batches.push(ops.length); ops.forEach(([r, v]) => { const i = r.path.lastIndexOf("/"); (data[r.path.slice(0, i)] = data[r.path.slice(0, i)] || {})[r.path.slice(i + 1)] = v; }); return Promise.resolve(); }
      };
    };
  }
  return { db, log };
}

(async () => {
  /* 1) backup is complete: no limit, no orderBy, includes docs missing the sort field */
  const tasks = {};
  for (let i = 0; i < 3500; i++) tasks["t" + i] = { title: "x", createdAt: i };
  tasks.legacy = { title: "no createdAt" };
  const f1 = fakeDb({ "users/u/tasks": tasks });
  const S1 = GDStore.cloudStore(f1.db, "users/u/");
  const dump = await S1.dump();
  eq("dump has every task", Object.keys(dump.tasks).length, 3501);
  eq("dump includes doc without createdAt", !!dump.tasks.legacy, true);
  eq("dump queries are unlimited and unordered", f1.log.queries.filter((q) => q.get).every((q) => !q.lim && !q.order), true);

  /* 2) live list full → onLimit fires once per snapshot; not full → silent */
  const f2 = fakeDb({ "users/u/tasks": tasks });
  const S2 = GDStore.cloudStore(f2.db, "users/u/");
  const hits = [];
  S2.onLimit = (col, lim) => hits.push([col, lim]);
  let rowsSeen = 0;
  S2.watch("tasks", (r) => { rowsSeen = r.length; });
  eq("watch is capped at the limit", rowsSeen, 3000);
  eq("onLimit reported", hits, [["tasks", 3000]]);
  const f3 = fakeDb({ "users/u/tasks": { a: { createdAt: 1 } } });
  const S3 = GDStore.cloudStore(f3.db, "users/u/");
  let called = false;
  S3.onLimit = () => { called = true; };
  S3.watch("tasks", () => {});
  eq("onLimit silent when list is not full", called, false);

  /* 3) restore uses batches of ≤ 400 */
  const data = { tasks: {} };
  for (let i = 0; i < 1000; i++) data.tasks["t" + i] = { title: "n" + i };
  const store = {};
  const f4 = fakeDb(store);
  const S4 = GDStore.cloudStore(f4.db, "users/u/");
  const n = await S4.bulk(data);
  eq("bulk returns the count", n, 1000);
  eq("bulk writes in batches", f4.log.batches, [400, 400, 200]);
  eq("bulk wrote the documents", Object.keys(store["users/u/tasks"]).length, 1000);

  /* 4) database without batch support falls back to single writes */
  const store5 = {};
  const f5 = fakeDb(store5, { batch: false });
  const S5 = GDStore.cloudStore(f5.db, "");
  await S5.bulk({ tasks: { a: { title: "x" }, b: { title: "y" } } });
  eq("fallback: single writes", f5.log.singles, 2);

  console.log((fail ? "✗ " : "✓ ") + pass + " store tests passed" + (fail ? ", " + fail + " failed" : ""));
  process.exit(fail ? 1 : 0);
})();
