/* Planner — UI: grades and averages (ODTÜ letter system). Two tabs in one window:
   "Notlarım" — your own transcript (previous total, terms with courses; saved and synced), and
   "Hızlı hesap" — the same calculator for anybody else's grades (a friend's): not saved, kept only until the page is reloaded.
   Each term card can be collapsed. The numbers come from GD.gpaStats / GD.neededAverage.
   Stored in the `grades` collection: a "base" document and one document per term.
   Shared mutable state lives on S and shared functions on App (both created in app-state.js). */
(function () {
  "use strict";
  const f2 = (x) => (x == null ? "–" : (Math.round(x * 100) / 100).toFixed(2));
  const letterOpts = (cur, withOther, blank) => '<option value="">' + blank + "</option>" +
    GD.GRADE_LETTERS.concat(withOther ? GD.GRADE_OTHER : []).map((g) => '<option value="' + g + '"' + (g === cur ? " selected" : "") + ">" + g + "</option>").join("");
  const newCourse = () => ({ id: uid(), name: "", credit: "", grade: "", old: "", scn: "" });
  const newTerm = (n) => ({ id: uid(), name: n + ". Dönem", courses: [newCourse()], collapsed: false });
  const emptyDraft = () => ({ base: { cgpa: "", credits: "" }, terms: [newTerm(1)], scenario: false, target: "" });

  let quickDraft = emptyDraft();   /* the friend's calculator survives closing the window, not a page reload */

  function openGrades(startTab) {
    let tab = startTab === "quick" ? "quick" : "mine";
    /* your own data: a working copy, nothing is stored until "Kaydet"; older terms start collapsed */
    const mine = {
      base: { cgpa: S.gradeBase ? S.gradeBase.cgpa : "", credits: S.gradeBase ? S.gradeBase.credits : "" },
      terms: S.gradeTerms.map((t, i, all) => ({ id: t.id, name: t.name, courses: t.courses.map((c) => Object.assign({}, c)), collapsed: all.length > 1 && i < all.length - 1 })),
      scenario: false,
      target: (() => { try { return localStorage.getItem("gunDefteri.gradeTarget") || ""; } catch (e) { return ""; } })()
    };
    if (!mine.terms.length) mine.terms.push(newTerm(1));
    let draft = tab === "quick" ? quickDraft : mine;

    const input = () => ({ base: { cgpa: draft.base.cgpa === "" ? null : +draft.base.cgpa, credits: +draft.base.credits || 0 },
      terms: draft.terms.map((t) => ({ courses: t.courses.map((c) => ({ credit: +c.credit || 0, grade: c.grade, old: c.old, scn: c.scn })) })) });

    function summaryHtml() {
      const real = GD.gpaStats(input(), false), scn = draft.scenario ? GD.gpaStats(input(), true) : null, main = scn || real;
      const last = [...main.terms].reverse().find((t) => t.gpa != null);
      const target = +draft.target;
      const need = GD.neededAverage(main, target);
      let needTxt = "";
      if (target > 0 && main.cgpa != null) {
        if (need.state === "reached") needTxt = '<span class="ok">Bu kadar kredide hedefe zaten ulaşırsın.</span>';
        else if (need.state === "possible") needTxt = "Notu girilmemiş <b>" + main.open + " kredide</b> en az <b>" + f2(need.needed) + "</b> ortalama gerekir (yaklaşık <b>" + GD.letterFor(need.needed) + "</b>).";
        else if (need.state === "impossible") needTxt = '<span class="bad">Kalan ' + main.open + " kredi hepsi AA olsa bile " + f2(target) + " olmaz (gerekli " + f2(need.needed) + ").</span>";
        else needTxt = "Notu girilmemiş ders yok; hedef için ders ekle ya da senaryo notu gir.";
      }
      const honor = GD.honorOf(last ? last.gpa : null);
      return '<div class="gr-big"><b>' + f2(main.cgpa) + "</b><span>" + (scn ? "senaryo GANO" : "GANO") + (scn ? " · gerçek " + f2(real.cgpa) : "") + "</span></div>" +
        '<div class="gr-mini"><b>' + (main.credits || 0) + "</b><span>kredi</span></div>" +
        '<div class="gr-mini"><b>' + f2(last ? last.gpa : null) + "</b><span>" + (tab === "quick" ? "bu dönem GPA" : "son dönem GPA") + (honor ? " · " + honor : "") + "</span></div>" +
        '<label class="gr-target"><span>Hedef GANO</span><input type="number" id="grTarget" min="0" max="4" step="0.01" placeholder="ör. 3.00" value="' + esc(draft.target) + '"></label>' +
        '<p class="gr-need">' + needTxt + "</p>";
    }
    function termSumText(i) {
      const st = GD.gpaStats(input(), draft.scenario).terms[i];
      return st && st.gpa != null ? "GPA <b>" + f2(st.gpa) + "</b> · " + st.credits + " kredi" + (GD.honorOf(st.gpa) ? " · " + GD.honorOf(st.gpa) : "") : "notu girilen ders yok";
    }
    function rowsHtml(t, i) {
      return t.courses.map((c, j) =>
        '<div class="gr-row" data-t="' + i + '" data-c="' + j + '">' +
          '<input type="text" class="gr-name" data-f="name" maxlength="40" placeholder="Ders (ör. STAT 363)" value="' + esc(c.name) + '" autocomplete="off">' +
          '<input type="number" class="gr-cr" data-f="credit" min="0" max="12" step="0.5" placeholder="Kredi" value="' + esc(c.credit) + '">' +
          '<select data-f="grade" aria-label="Not">' + letterOpts(c.grade, true, "Not –") + "</select>" +
          '<select data-f="old" aria-label="Eski not (tekrar)" title="Bu dersi tekrar alıyorsan eski notu">' + letterOpts(c.old, false, "Eski –") + "</select>" +
          (draft.scenario ? '<select data-f="scn" class="gr-scn" aria-label="Senaryo notu" title="Ya olursa: bu notu alırsam">' + letterOpts(c.scn, true, "Ya olursa –") + "</select>" : "") +
          '<button type="button" class="gr-x" data-del-course aria-label="Dersi sil">×</button></div>').join("");
    }
    /* the quick calculator has no terms: one plain list of this term's courses */
    function flatHtml(t) {
      return '<section class="gr-term flat"><h4 class="gr-h">Bu dönem dersleri</h4>' + rowsHtml(t, 0) +
        '<div class="gr-foot"><button type="button" class="linkbtn" data-add-course="0">+ Ders ekle</button><span class="gr-tsum" id="grTerm0">Dönem ' + termSumText(0) + "</span></div></section>";
    }
    function termHtml(t, i) {
      if (tab === "quick") return flatHtml(t);
      const open = !t.collapsed;
      const head = '<button type="button" class="gr-chev" data-toggle-term="' + i + '" aria-expanded="' + open + '" aria-label="' + (open ? "Dönemi kapat" : "Dönemi aç") + '">' + (open ? "▾" : "▸") + "</button>" +
        (open
          ? '<input type="text" class="gr-tname" data-tname="' + i + '" maxlength="30" value="' + esc(t.name) + '" aria-label="Dönem adı"><button type="button" class="linkbtn" data-del-term="' + i + '">Dönemi sil</button>'
          : '<button type="button" class="gr-tname-btn" data-toggle-term="' + i + '">' + esc(t.name) + '</button><span class="gr-tsum" id="grTerm' + i + '">' + termSumText(i) + "</span>");
      if (!open) return '<section class="gr-term collapsed"><header>' + head + "</header></section>";
      const rows = rowsHtml(t, i);
      return '<section class="gr-term"><header>' + head + "</header>" + rows +
        '<div class="gr-foot"><button type="button" class="linkbtn" data-add-course="' + i + '">+ Ders ekle</button><span class="gr-tsum" id="grTerm' + i + '">Dönem ' + termSumText(i) + "</span></div></section>";
    }
    function bodyHtml() {
      const tabs = '<div class="seg gr-tabs" role="tablist" aria-label="Notlar"><button type="button" role="tab" data-gr-tab="mine" aria-selected="' + (tab === "mine") + '">Notlarım</button>' +
        '<button type="button" role="tab" data-gr-tab="quick" aria-selected="' + (tab === "quick") + '">Hızlı hesap</button></div>';
      const quickNote = tab === "quick" ? '<p class="info">Arkadaşının ya da denemek istediğin notlar için. <b>Kaydedilmez</b> ve senin notlarına karışmaz; sayfayı yenileyince silinir.</p>' : "";
      const quick = tab === "quick";
      const tools = quick ? '<div class="gr-tools"><span class="sp"></span><button type="button" class="linkbtn" id="grClear">Temizle</button></div>'
        : draft.terms.length > 1 ? '<div class="gr-tools"><button type="button" class="linkbtn" data-collapse="all">Hepsini kapat</button><button type="button" class="linkbtn" data-collapse="none">Hepsini aç</button></div>' : "";
      const baseFields = '<div class="row"><label class="field"><span>GANO</span><input type="number" id="grBaseC" min="0" max="4" step="0.01" placeholder="ör. 2.65" value="' + esc(draft.base.cgpa) + '"></label>' +
        '<label class="field"><span>Toplam kredi</span><input type="number" id="grBaseK" min="0" step="0.5" placeholder="ör. 62" value="' + esc(draft.base.credits) + '"></label></div>';
      const baseBox = quick
        ? '<section class="gr-base fixed"><h4 class="gr-h">Önceki dönemler</h4>' + baseFields + '<p class="set-hint">Şimdiye kadarki genel ortalaması ve toplam kredisi. Bu dönem tekrar aldığı dersin eski notunu derse yazarsan yeni not eskisinin yerine geçer, kredisi ikinci kez eklenmez.</p></section>'
        : '<details class="gr-base"' + (draft.base.credits || draft.base.cgpa ? " open" : "") + '><summary>Önceki toplam (bu listede olmayan dönemler)</summary>' + baseFields +
          '<p class="set-hint">Tekrar aldığın dersin eski notu bu toplamda sayılıyor kabul edilir: yeni not eskisinin yerine geçer, kredisi ikinci kez eklenmez.</p></details>';
      return tabs + quickNote + '<div class="gr-sum" id="grSum">' + summaryHtml() + "</div>" +
        '<label class="check gr-scn-toggle"><input type="checkbox" id="grScn"' + (draft.scenario ? " checked" : "") + '> Ya olursa modu (notu girilmemiş derslere ve hâlihazırdaki notlara senaryo notu ver)</label>' +
        baseBox + tools + '<div id="grTerms">' + draft.terms.map(termHtml).join("") + "</div>" +
        (quick ? "" : '<button type="button" class="btn-ghost" id="grAddTerm">+ Dönem ekle</button>');
    }
    function refresh() {
      $("grSum").innerHTML = summaryHtml();
      draft.terms.forEach((t, i) => { const el = $("grTerm" + i); if (el) el.innerHTML = (t.collapsed ? "" : "Dönem ") + termSumText(i); });
    }
    function rebuild() {
      $("grBody").innerHTML = bodyHtml();
      const save = $("modal").querySelector('footer button[type="submit"]');
      if (save) save.hidden = tab === "quick";   /* the friend's calculator is never saved */
    }

    App.openModal("Notlar ve ortalama", '<div id="grBody"></div>',
      '<button type="submit" class="btn">Kaydet</button><button type="button" class="btn-ghost" data-close>Kapat</button>', () => {
        if (tab !== "mine" || !App.guard()) return;
        const keep = new Set();
        mine.terms.forEach((t, i) => {
          const courses = t.courses.filter((c) => c.name.trim() || +c.credit > 0)
            .map((c) => ({ id: c.id, name: c.name.trim(), credit: +c.credit || 0, grade: c.grade || "", old: c.old || "", scn: c.scn || "" }));
          keep.add(t.id);
          App.w(S.store.set("grades", t.id, { kind: "term", name: t.name.trim() || (i + 1) + ". Dönem", order: i, courses: courses, createdAt: Date.now() }));
        });
        S.gradeTerms.forEach((t) => { if (!keep.has(t.id)) App.w(S.store.del("grades", t.id)); });
        const hasBase = mine.base.credits !== "" || mine.base.cgpa !== "";
        if (hasBase) App.w(S.store.set("grades", "base", { kind: "base", order: -1, cgpa: +mine.base.cgpa || 0, credits: +mine.base.credits || 0 }));
        else if (S.gradeBase) App.w(S.store.del("grades", "base"));
        try { if (mine.target) localStorage.setItem("gunDefteri.gradeTarget", mine.target); else localStorage.removeItem("gunDefteri.gradeTarget"); } catch (e) { /* none */ }
        App.closeModal(); App.toast("Notlar kaydedildi");
      }, true);
    rebuild();

    const M = $("modal");
    M.addEventListener("input", (e) => {
      const el = e.target;
      if (el.id === "grBaseC") draft.base.cgpa = el.value;
      else if (el.id === "grBaseK") draft.base.credits = el.value;
      else if (el.id === "grTarget") draft.target = el.value;
      else if (el.dataset.tname != null) draft.terms[+el.dataset.tname].name = el.value;
      else if (el.dataset.f) { const row = el.closest(".gr-row"); draft.terms[+row.dataset.t].courses[+row.dataset.c][el.dataset.f] = el.value; }
      else return;
      if (el.id === "grTarget") $("grSum").querySelector(".gr-need").outerHTML = summaryHtml().match(/<p class="gr-need">[\s\S]*<\/p>/)[0];
      else refresh();
    });
    M.addEventListener("change", (e) => { if (e.target.id === "grScn") { draft.scenario = e.target.checked; rebuild(); } else if (e.target.dataset && e.target.dataset.f) refresh(); });
    M.addEventListener("click", (e) => {
      let x;
      if ((x = e.target.closest("[data-gr-tab]"))) { tab = x.dataset.grTab; draft = tab === "quick" ? quickDraft : mine; rebuild(); }
      else if ((x = e.target.closest("[data-toggle-term]"))) { const t = draft.terms[+x.dataset.toggleTerm]; t.collapsed = !t.collapsed; rebuild(); }
      else if ((x = e.target.closest("[data-collapse]"))) { draft.terms.forEach((t) => { t.collapsed = x.dataset.collapse === "all"; }); rebuild(); }
      else if ((x = e.target.closest("[data-add-course]"))) { draft.terms[+x.dataset.addCourse].courses.push(newCourse()); rebuild(); }
      else if ((x = e.target.closest("[data-del-course]"))) { const r = x.closest(".gr-row"); draft.terms[+r.dataset.t].courses.splice(+r.dataset.c, 1); rebuild(); }
      else if ((x = e.target.closest("[data-del-term]"))) { draft.terms.splice(+x.dataset.delTerm, 1); if (!draft.terms.length) draft.terms.push(newTerm(1)); rebuild(); }
      else if (e.target.closest("#grAddTerm")) { if (tab === "mine") draft.terms.forEach((t) => { t.collapsed = true; });   /* the older terms fold away, the new one is open */
        draft.terms.push(newTerm(draft.terms.length + 1)); rebuild(); }
      else if (e.target.closest("#grClear")) { quickDraft = emptyDraft(); draft = quickDraft; rebuild(); }
    });
  }

  /* shared with the other app-*.js files */
  Object.assign(App, {
    openGrades
  });
})();
