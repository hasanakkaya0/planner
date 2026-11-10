/* Planner — UI: reminders (class / block about to start, exam or deadline today / tomorrow evening).
   They are checked every ~30 s while the app is open and sent as a system notification when the browser
   allows it, otherwise shown as an in-app message. The choice is per device (localStorage), because notification
   permission is per device too. The due-ness itself is GD.dueReminders.
   Shared mutable state lives on S and shared functions on App (both created in app-state.js). */
(function () {
  "use strict";
  const KEY = "gunDefteri.notif", FKEY = "gunDefteri.notified";
  const DEFAULTS = { on: false, lead: 10, keys: true };
  const LEADS = [[0, "Hatırlatma yok"], [5, "5 dk önce"], [10, "10 dk önce"], [15, "15 dk önce"], [30, "30 dk önce"]];

  function load() { try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { return Object.assign({}, DEFAULTS); } }
  function save(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* none */ } }
  function loadFired() {
    let f = {};
    try { f = JSON.parse(localStorage.getItem(FKEY) || "{}") || {}; } catch (e) { f = {}; }
    const cut = Date.now() - 3 * 864e5;
    Object.keys(f).forEach((k) => { if (f[k] < cut) delete f[k]; });
    return f;
  }
  const saveFired = (f) => { try { localStorage.setItem(FKEY, JSON.stringify(f)); } catch (e) { /* none */ } };

  const canNotify = () => typeof Notification !== "undefined";
  const useSystem = () => canNotify() && Notification.permission === "granted";
  function systemNotify(title, body, tag) {
    const opts = { body: body, tag: tag, icon: "icons/icon-192.png" };
    const plain = () => { try { new Notification(title, opts); } catch (e) { App.toast(title + " · " + body, null, 8000); } };
    /* an installed app can only notify through its service worker */
    if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, opts)).catch(plain);
    else plain();
  }
  /* list: [{id, title, body}] — system notifications one by one, otherwise ONE in-app message (a second toast would replace the first) */
  function notifyAll(list) {
    if (useSystem()) list.forEach((d) => systemNotify(d.title, d.body, d.id));
    else App.toast(list.map((d) => d.title + " · " + d.body).join("   |   "), null, 8000);
  }

  async function check() {
    const c = load();
    if (!c.on || !S.store) return;
    const now = new Date(), today = GD.key(now);
    let blocks = [];
    try { blocks = await App.blocksOn(today); } catch (e) { /* not readable right now */ }
    const keyTasks = c.keys ? App.allTasks().filter((t) => !t.done && t.date && App.isKeyTask(t)) : [];
    const fired = loadFired();
    const due = GD.dueReminders({ now: now, today: today, blocks: blocks, keyTasks: keyTasks, lead: c.lead, fired: fired, kindName: (t) => App.kindOf(t.kind).name });
    if (!due.length) return;
    due.forEach((d) => { fired[d.id] = Date.now(); });
    saveFired(fired);
    notifyAll(due);
  }

  function startReminders() {
    setInterval(check, 30000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
    setTimeout(check, 4000);
  }

  function stateText() {
    if (!canNotify()) return "Bu tarayıcı bildirim göstermiyor; hatırlatmalar uygulama içinde mesaj olarak çıkar.";
    if (Notification.permission === "granted") return "Bildirim izni verilmiş.";
    if (Notification.permission === "denied") return "Bildirimler tarayıcıda engelli; hatırlatmalar uygulama içinde mesaj olarak çıkar. İstersen site ayarlarından izni açabilirsin.";
    return "Kaydedince tarayıcı bildirim izni isteyecek.";
  }

  function openReminders() {
    const c = load();
    const body =
      '<label class="check"><input type="checkbox" id="rmOn"' + (c.on ? " checked" : "") + "> Hatırlatmaları aç (yalnız bu cihazda)</label>" +
      '<label class="field"><span>Ders / blok başlamadan</span><select id="rmLead">' + LEADS.map((l) => '<option value="' + l[0] + '"' + (l[0] === c.lead ? " selected" : "") + ">" + l[1] + "</option>").join("") + "</select></label>" +
      '<label class="check"><input type="checkbox" id="rmKeys"' + (c.keys ? " checked" : "") + "> Sınav / teslim: günün sabahı (08:00) ve bir gün önce akşam (20:00)</label>" +
      '<p class="info" id="rmState">' + stateText() + "</p>" +
      '<p class="set-hint">Hatırlatmalar uygulama (ya da sekmesi) açıkken çalışır. Kapalıyken telefon bildirim göndermez. iPhone’da bildirim için uygulamanın ana ekrana eklenmiş olması gerekir (iOS 16.4 ve üstü).</p>';
    const footer = '<button type="submit" class="btn">Kaydet</button><span class="sp"></span><button type="button" class="btn-ghost" id="rmTest">Deneme gönder</button>';
    App.openModal("Hatırlatmalar", body, footer, async () => {
      const next = { on: $("rmOn").checked, lead: +$("rmLead").value, keys: $("rmKeys").checked };
      save(next);
      if (next.on && canNotify() && Notification.permission === "default") { try { await Notification.requestPermission(); } catch (e) { /* ignore */ } }
      App.closeModal();
      App.toast(next.on ? "Hatırlatmalar açık" : "Hatırlatmalar kapalı");
      check();
    });
    $("rmTest").onclick = async () => {
      if (canNotify() && Notification.permission === "default") { try { await Notification.requestPermission(); } catch (e) { /* ignore */ } }
      $("rmState").textContent = stateText();
      notifyAll([{ id: "test", title: "Planner", body: "Deneme hatırlatması" }]);
    };
  }

  /* shared with the other app-*.js files */
  Object.assign(App, {
    check,
    startReminders,
    openReminders
  });
})();
