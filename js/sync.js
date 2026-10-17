/* Planner — Firebase sync (GitHub Pages / phone build).
   Active when window.PLANNER_FIREBASE is set in js/firebase-config.js:
   email + password sign-in, data in Firestore under users/<uid>/...,
   offline cache enabled (works without internet, syncs when back online). */
(function (root) {
  "use strict";

  function configured() {
    var c = root.PLANNER_FIREBASE;
    return !!(c && c.apiKey && c.projectId && root.firebase && root.firebase.initializeApp);
  }

  var ERR = {
    "auth/invalid-email": "E-posta adresi geçersiz.",
    "auth/missing-password": "Şifreyi yaz.",
    "auth/weak-password": "Şifre en az 6 karakter olmalı.",
    "auth/email-already-in-use": "Bu e-postayla zaten hesap var; giriş yap.",
    "auth/invalid-credential": "E-posta ya da şifre yanlış.",
    "auth/wrong-password": "E-posta ya da şifre yanlış.",
    "auth/user-not-found": "Bu e-postayla hesap yok; önce hesap aç.",
    "auth/too-many-requests": "Çok fazla deneme. Biraz bekleyip tekrar dene.",
    "auth/network-request-failed": "İnternet bağlantısı yok gibi görünüyor.",
    "auth/operation-not-allowed": "Firebase'de E-posta/Şifre girişi açık değil (Authentication → Sign-in method)."
  };
  function msg(e) { return (e && ERR[e.code]) || (e && e.message) || "Bir şeyler ters gitti."; }

  function loginScreen(auth) {
    return new Promise(function (resolve) {
      var el = document.createElement("div");
      el.className = "auth-bg";
      el.innerHTML =
        '<form class="auth" novalidate>' +
          '<div class="auth-brand"><svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="alg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c6cf6"/><stop offset="1" stop-color="#4a8af0"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#alg)"/><rect x="7.5" y="9.5" width="17" height="15.5" rx="3.2" fill="#fff"/><path d="M7.5 14.2h17" stroke="#c9c2fb" stroke-width="1.4"/><path d="M12 6.8v4.6M20 6.8v4.6" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><path d="M12.4 19.6l2.5 2.4 4.8-4.8" fill="none" stroke="#5a4bd1" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg><b>Planner</b></div>' +
          '<p class="auth-sub">Giriş yap; telefon ve bilgisayar aynı veriyi görür.</p>' +
          '<label class="field"><span>E-posta</span><input type="email" id="auE" autocomplete="username" inputmode="email" autocapitalize="off" required></label>' +
          '<label class="field"><span>Şifre</span><input type="password" id="auP" autocomplete="current-password" minlength="6" required></label>' +
          '<p class="auth-err" id="auErr" role="alert"></p>' +
          '<button type="submit" class="btn" id="auGo">Giriş yap</button>' +
          '<div class="auth-alt"><button type="button" class="linkbtn" id="auSwap">Hesabın yok mu? Hesap aç</button>' +
          '<button type="button" class="linkbtn" id="auReset">Şifremi unuttum</button></div>' +
        "</form>";
      document.body.appendChild(el);
      var signup = false, $ = function (id) { return el.querySelector("#" + id); };
      var err = function (t, ok) { $("auErr").textContent = t || ""; $("auErr").classList.toggle("ok", !!ok); };
      $("auSwap").onclick = function () {
        signup = !signup;
        $("auGo").textContent = signup ? "Hesap aç" : "Giriş yap";
        $("auSwap").textContent = signup ? "Hesabın var mı? Giriş yap" : "Hesabın yok mu? Hesap aç";
        $("auP").setAttribute("autocomplete", signup ? "new-password" : "current-password");
        err("");
      };
      $("auReset").onclick = function () {
        var e = $("auE").value.trim();
        if (!e) { err("Önce e-postanı yaz."); $("auE").focus(); return; }
        auth.sendPasswordResetEmail(e).then(function () { err("Sıfırlama bağlantısı e-postana gönderildi.", true); }, function (x) { err(msg(x)); });
      };
      el.querySelector("form").onsubmit = function (ev) {
        ev.preventDefault();
        var e = $("auE").value.trim(), p = $("auP").value;
        if (!e || !p) { err("E-posta ve şifreyi yaz."); return; }
        $("auGo").disabled = true; err("");
        var job = signup ? auth.createUserWithEmailAndPassword(e, p) : auth.signInWithEmailAndPassword(e, p);
        job.then(function (cred) { el.remove(); resolve(cred.user); }, function (x) { $("auGo").disabled = false; err(msg(x)); });
      };
      setTimeout(function () { $("auE").focus(); }, 50);
    });
  }

  var app = null;
  function connect() {
    if (!app) app = root.firebase.initializeApp(root.PLANNER_FIREBASE);
    var auth = root.firebase.auth(), db = root.firebase.firestore();
    try { db.settings({ ignoreUndefinedProperties: true }); } catch (e) { /* already configured */ }
    var persist = db.enablePersistence({ synchronizeTabs: true }).catch(function () { /* not supported: online only */ });
    var first = new Promise(function (res) { var off = auth.onAuthStateChanged(function (u) { off(); res(u); }); });
    return Promise.all([persist, first]).then(function (r) {
      return r[1] || loginScreen(auth);
    }).then(function (user) {
      /* reload the page if signed out on another device/tab */
      auth.onAuthStateChanged(function (u) { if (!u) root.location.reload(); });
      return {
        db: db,
        user: { uid: user.uid, email: user.email || "" },
        signOut: function () { return auth.signOut(); }
      };
    });
  }

  root.PlannerSync = { configured: configured, connect: connect };
})(window);
