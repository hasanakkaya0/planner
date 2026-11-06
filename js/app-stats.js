/* Planner — UI: statistics window (focus time, finished tasks, habits over the last 7 / 30 / 90 days).
   The numbers come from GD.statsRange; the charts are plain CSS bars.
   Shared mutable state lives on S and shared functions on App (both created in app-state.js). */
(function () {
  "use strict";
  const PERIODS = [[7, "7 gün"], [30, "30 gün"], [90, "90 gün"]];

  const pct = (x) => Math.round(x * 100) + "%";
  function dayBars(days, values, fmt) {
    const max = Math.max(1, ...days.map((k) => values[k] || 0));
    const bars = days.map((k) => {
      const v = values[k] || 0;
      return '<i class="' + (v ? "" : "zero") + '" style="height:' + (v ? Math.max(4, Math.round(v / max * 100)) : 0) + '%" title="' + App.fmtShort(k) + ": " + (v ? fmt(v) : "–") + '"></i>';
    }).join("");
    return '<div class="bars">' + bars + '</div><div class="axis"><span>' + App.fmtShort(days[0]) + "</span><span>" + App.fmtShort(days[days.length - 1]) + "</span></div>";
  }

  function statsHtml(n) {
    const to = S.TODAY, from = GD.addDays(to, -(n - 1));
    const r = GD.statsRange({ tasks: S.tasks, focus: S.focusRows, logs: S.logs, habits: S.habits }, from, to);
    const tile = (num, label) => '<div class="st-tile"><b>' + num + "</b><span>" + label + "</span></div>";
    let h = '<div class="st-tiles">' +
      tile(r.focusTotal ? GD.durText(r.focusTotal) : "–", "odak süresi") +
      tile(r.tasksTotal, "biten görev") +
      tile(r.habitRate == null ? "–" : pct(r.habitRate), "rutin tamamlama") +
      tile(r.activeDays + "/" + r.days.length, "aktif gün") + "</div>";
    h += '<h3 class="st-h">Günlük odak</h3>' + dayBars(r.days, r.focusByDay, (v) => GD.durText(v));
    h += '<h3 class="st-h">Biten görevler</h3>' + dayBars(r.days, r.tasksByDay, (v) => v + " görev");
    const cats = Object.keys(r.byCat).sort((a, b) => r.byCat[b] - r.byCat[a]);
    h += '<h3 class="st-h">Odak, kategoriye göre</h3>';
    h += cats.length ? '<div class="st-rows">' + cats.map((id) => {
      const c = App.catOf(id === "_" ? "" : id);
      return '<div class="st-row c-' + c.color + '"><span class="n"><i></i>' + esc(c.name) + '</span><span class="bar"><b style="width:' + Math.round(r.byCat[id] / r.focusTotal * 100) + '%"></b></span><span class="v">' + GD.durText(r.byCat[id]) + "</span></div>";
    }).join("") + "</div>" : '<p class="set-hint">Bu dönemde odak kaydı yok. Odak sayacını başlatınca burada görünür.</p>';
    h += '<h3 class="st-h">Rutinler</h3>';
    h += r.habits.length ? '<div class="st-rows">' + r.habits.map((x) =>
      '<div class="st-row"><span class="n">' + esc(x.name) + '</span><span class="bar"><b style="width:' + (x.rate == null ? 0 : Math.round(x.rate * 100)) + '%"></b></span><span class="v">' + x.done + "/" + x.expected + "</span></div>").join("") + "</div>"
      : '<p class="set-hint">Henüz rutin yok.</p>';
    return h;
  }

  function openStats() {
    const seg = '<div class="seg" id="stPeriod" role="tablist" aria-label="Dönem">' +
      PERIODS.map((p) => '<button type="button" role="tab" data-days="' + p[0] + '" aria-selected="' + (p[0] === S.statsDays) + '">' + p[1] + "</button>").join("") + "</div>";
    App.openModal("İstatistikler", seg + '<div id="stBody">' + statsHtml(S.statsDays) + "</div>",
      '<button type="submit" class="btn">Kapat</button>', () => App.closeModal(), true);
    $("stPeriod").onclick = (e) => {
      const b = e.target.closest("[data-days]"); if (!b) return;
      S.statsDays = +b.dataset.days;
      $("stPeriod").querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", x === b));
      $("stBody").innerHTML = statsHtml(S.statsDays);
    };
  }

  /* shared with the other app-*.js files */
  Object.assign(App, {
    openStats
  });
})();
