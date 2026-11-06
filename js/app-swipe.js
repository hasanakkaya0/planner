/* Planner — UI: swipe a task row on a touch screen: right = done, left = move to tomorrow.
   (On a mouse the same actions are the buttons that appear on the row.)
   Shared mutable state lives on S and shared functions on App (both created in app-state.js). */
(function () {
  "use strict";
  const START = 12, DONE_AT = 72, MAX = 110;
  let g = null;   /* the gesture in progress */

  function reset(li, animate) {
    if (!li) return;
    li.classList.remove("swiping");
    li.style.transition = animate ? "transform .18s ease" : "";
    li.style.transform = "";
    delete li.dataset.swipe;
  }

  function onMove(e) {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.active) {
      if (Math.abs(dy) > START && Math.abs(dy) > Math.abs(dx)) { cleanup(); return; }   /* a vertical scroll */
      if (Math.abs(dx) < START || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      g.active = true; g.li.classList.add("swiping");
    }
    g.dx = dx;
    const shown = Math.max(-MAX, Math.min(MAX, dx * 0.7));
    g.li.style.transition = "";
    g.li.style.transform = "translateX(" + shown + "px)";
    const virtual = g.tid.indexOf("r:") === 0;
    g.li.dataset.swipe = dx > 0 ? "right" : virtual ? "none" : "left";
    g.li.dataset.hint = dx > 0 ? "✓ Tamam" : virtual ? "" : "→ Yarına";
  }
  function onUp(e) {
    if (!g || e.pointerId !== g.id) return;
    const { li, tid, dx, active } = g;
    cleanup();
    reset(li, true);
    if (!active) return;
    /* the finger lifting after a swipe must not count as a tap on the row */
    const eat = (ev) => {
      window.removeEventListener("click", eat, true);
      if (li.contains(ev.target)) { ev.stopPropagation(); ev.preventDefault(); }
    };
    window.addEventListener("click", eat, true);
    setTimeout(() => window.removeEventListener("click", eat, true), 350);
    if (dx > DONE_AT) App.toggleTask(tid);
    else if (dx < -DONE_AT && tid.indexOf("r:") !== 0) App.postpone(tid);
  }
  function cleanup() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    g = null;
  }
  function onCancel(e) { if (g && e.pointerId === g.id) { const li = g.li; cleanup(); reset(li, true); } }

  $("taskList").addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch" || g || !S.store || !S.writable) return;
    const li = e.target.closest("li.task");
    if (!li || e.target.closest(".tdetail")) return;
    const t = li.querySelector("[data-toggle]");
    if (!t) return;
    g = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, active: false, li: li, tid: t.dataset.toggle };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  });
})();
