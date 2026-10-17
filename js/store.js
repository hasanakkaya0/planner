/* Planner — depolama katmanı.
   İki uygulama, aynı arayüz:
     cloud    : claude.ai'de yayınlanan sayfa → artifact veritabanı
     firebase : GitHub Pages'teki sürüm → Firebase Firestore (giriş yapılır; telefon + bilgisayar senkron)
     local : index.html'i doğrudan açınca → bu tarayıcının localStorage'ı
   Arayüz:
     watch(col, cb)        → unsub   cb([{id, ...alanlar}])
     watchDoc(col, id, cb) → unsub   cb(alanlar | null)
     set / update / del    → Promise
     dump()                → Promise<{col: {id: alanlar}}>
     bulk(data)            → Promise   (yedekten geri yükleme; aynı id'liler üzerine yazılır) */
(function (root) {
  "use strict";

  var COLS = ["tasks", "habits", "habitlog", "days", "recurring", "settings", "focus"];
  var QUERY = {
    tasks: { order: ["createdAt", "desc"], limit: 1000 },
    habits: { order: ["order", "asc"], limit: 100 },
    habitlog: { order: ["date", "desc"], limit: 400 },
    recurring: { order: ["createdAt", "asc"], limit: 200 },
    days: { order: ["date", "desc"], limit: 1000 },
    focus: { order: ["start", "desc"], limit: 1000 }
  };
  var LS_KEY = "gunDefteri.v1";

  function rows(snapDocs) {
    return snapDocs.map(function (d) { return Object.assign({ id: d.id }, d.data() || {}); });
  }

  /* ---------- bulut ---------- */
  /* pre: koleksiyon yolu öneki (Firebase'de "users/<uid>/"; claude.ai'de boş) */
  function cloudStore(db, pre) {
    pre = pre || "";
    function q(col) {
      var c = db.collection(pre + col), o = QUERY[col];
      return o ? c.orderBy(o.order[0], o.order[1]).limit(o.limit) : c;
    }
    return {
      mode: "cloud",
      persistent: true,
      watch: function (col, cb, onErr) {
        return q(col).onSnapshot(function (s) { cb(rows(s.docs)); }, onErr);
      },
      watchDoc: function (col, id, cb, onErr) {
        return db.doc(pre + col + "/" + id).onSnapshot(function (s) { cb(s.exists ? (s.data() || {}) : null); }, onErr);
      },
      /* alan değeri [from, to] aralığında olan belgeler (ör. bir haftanın / ayın günleri) */
      watchRange: function (col, field, from, to, cb, onErr) {
        return db.collection(pre + col).where(field, ">=", from).where(field, "<=", to).limit(100)
          .onSnapshot(function (s) { cb(rows(s.docs)); }, onErr);
      },
      getDoc: function (col, id) { return db.doc(pre + col + "/" + id).get().then(function (d) { return d.exists ? (d.data() || {}) : null; }); },
      set: function (col, id, data) { return db.doc(pre + col + "/" + id).set(data); },
      update: function (col, id, patch) { return db.doc(pre + col + "/" + id).update(patch); },
      del: function (col, id) { return db.doc(pre + col + "/" + id).delete(); },
      dump: function () {
        var out = {};
        return COLS.reduce(function (p, col) {
          return p.then(function () {
            return q(col).get().then(function (s) {
              out[col] = {};
              s.docs.forEach(function (d) { out[col][d.id] = d.data(); });
            });
          });
        }, Promise.resolve()).then(function () { return out; });
      },
      bulk: function (data) {
        var jobs = [];
        COLS.forEach(function (col) {
          Object.keys(data[col] || {}).forEach(function (id) { jobs.push([col, id, data[col][id]]); });
        });
        /* belge başına tek yazma, sırayla — hız sınırına takılmamak için */
        return jobs.reduce(function (p, j) {
          return p.then(function () { return db.doc(pre + j[0] + "/" + j[1]).set(j[2]); });
        }, Promise.resolve()).then(function () { return jobs.length; });
      }
    };
  }

  /* ---------- yerel ---------- */
  function localStore() {
    var state = {}, persistent = true;
    COLS.forEach(function (c) { state[c] = {}; });
    try {
      var raw = root.localStorage.getItem(LS_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        COLS.forEach(function (c) { if (parsed[c] && typeof parsed[c] === "object") state[c] = parsed[c]; });
      }
    } catch (e) { persistent = false; }

    var colL = {}, docL = {};
    function save() {
      try { root.localStorage.setItem(LS_KEY, JSON.stringify(state)); }
      catch (e) { persistent = false; api.persistent = false; }
    }
    function list(col) {
      var o = QUERY[col], arr = Object.keys(state[col]).map(function (id) { return Object.assign({ id: id }, state[col][id]); });
      if (o) {
        var f = o.order[0], dir = o.order[1] === "desc" ? -1 : 1;
        arr.sort(function (a, b) {
          var x = a[f], y = b[f];
          if (x === y) return a.id < b.id ? -1 : 1;
          if (x === undefined) return 1;
          if (y === undefined) return -1;
          return (x < y ? -1 : 1) * dir;
        });
      }
      return arr;
    }
    function emit(col, id) {
      (colL[col] || []).forEach(function (cb) { cb(list(col)); });
      var k = col + "/" + id;
      (docL[k] || []).forEach(function (cb) { cb(state[col][id] ? Object.assign({}, state[col][id]) : null); });
    }
    function emitAll() {
      COLS.forEach(function (col) { (colL[col] || []).forEach(function (cb) { cb(list(col)); }); });
      Object.keys(docL).forEach(function (k) {
        var p = k.split("/"), v = state[p[0]][p[1]];
        docL[k].forEach(function (cb) { cb(v ? Object.assign({}, v) : null); });
      });
    }
    function merge(a, b) {
      var out = Object.assign({}, a);
      Object.keys(b).forEach(function (k) {
        var v = b[k];
        if (v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" && !Array.isArray(out[k])) out[k] = merge(out[k], v);
        else out[k] = v;
      });
      return out;
    }
    /* başka sekmede yapılan değişiklikleri al */
    try {
      root.addEventListener("storage", function (e) {
        if (e.key !== LS_KEY || !e.newValue) return;
        try {
          var p = JSON.parse(e.newValue);
          COLS.forEach(function (c) { state[c] = (p[c] && typeof p[c] === "object") ? p[c] : {}; });
          emitAll();
        } catch (err) { /* bozuk veri: yok say */ }
      });
    } catch (e) { /* node */ }

    var api = {
      mode: "local",
      persistent: persistent,
      watch: function (col, cb) {
        (colL[col] = colL[col] || []).push(cb);
        setTimeout(function () { cb(list(col)); }, 0);
        return function () { colL[col] = (colL[col] || []).filter(function (x) { return x !== cb; }); };
      },
      watchRange: function (col, field, from, to, cb) {
        function wrap(all) { cb(all.filter(function (r) { return r[field] >= from && r[field] <= to; })); }
        (colL[col] = colL[col] || []).push(wrap);
        setTimeout(function () { wrap(list(col)); }, 0);
        return function () { colL[col] = (colL[col] || []).filter(function (x) { return x !== wrap; }); };
      },
      watchDoc: function (col, id, cb) {
        var k = col + "/" + id;
        (docL[k] = docL[k] || []).push(cb);
        setTimeout(function () { cb(state[col][id] ? Object.assign({}, state[col][id]) : null); }, 0);
        return function () { docL[k] = (docL[k] || []).filter(function (x) { return x !== cb; }); };
      },
      getDoc: function (col, id) { return Promise.resolve(state[col][id] ? JSON.parse(JSON.stringify(state[col][id])) : null); },
      set: function (col, id, data) {
        state[col][id] = JSON.parse(JSON.stringify(data)); save(); emit(col, id); return Promise.resolve();
      },
      update: function (col, id, patch) {
        if (!state[col][id]) return Promise.reject({ code: "invalid_argument", message: "Belge yok." });
        state[col][id] = merge(state[col][id], JSON.parse(JSON.stringify(patch))); save(); emit(col, id); return Promise.resolve();
      },
      del: function (col, id) { delete state[col][id]; save(); emit(col, id); return Promise.resolve(); },
      dump: function () { return Promise.resolve(JSON.parse(JSON.stringify(state))); },
      bulk: function (data) {
        var n = 0;
        COLS.forEach(function (col) {
          Object.keys(data[col] || {}).forEach(function (id) { state[col][id] = data[col][id]; n++; });
        });
        save(); emitAll(); return Promise.resolve(n);
      },
      isEmpty: function () { return COLS.every(function (c) { return !Object.keys(state[c]).length; }); }
    };
    return api;
  }

  /* claude.ai içindeyse onun veritabanı; Firebase ayarı varsa Firebase (GitHub Pages / telefon); yoksa yerel */
  function create() {
    var c = root.claude;
    if ((!c || typeof c.use !== "function") && root.PlannerSync && root.PlannerSync.configured()) {
      return root.PlannerSync.connect().then(function (r) {
        var s = cloudStore(r.db, "users/" + r.user.uid + "/");
        s.mode = "firebase"; s.user = r.user; s.signOut = r.signOut;
        return s;
      });
    }
    if (!c || typeof c.use !== "function") return Promise.resolve(localStore());
    return c.use("db").then(function (db) {
      if (!db) { var s = localStore(); s.fallback = true; return s; }
      return cloudStore(db);
    }, function () { var s = localStore(); s.fallback = true; return s; });
  }

  var GDStore = { create: create, localStore: localStore, cloudStore: cloudStore, COLS: COLS };
  if (typeof module !== "undefined" && module.exports) module.exports = GDStore;
  else root.GDStore = GDStore;
})(typeof window !== "undefined" ? window : globalThis);
