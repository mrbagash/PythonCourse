// ════════════════════════════════════════════════════════════════
//  BUILD BATTLE — self-contained 3D modelling vote-off add-on
// ────────────────────────────────────────────────────────────────
//  A teacher hosts a timed build (e.g. "Build a house"). Students
//  build in Blockbench, submit, then the TEACHER drives a shared
//  review: everyone's screen shows the same model at the same time
//  and students rate the current model out of 5 stars. Results show
//  the host the top 3 and show each student their own place/score.
//
//  MODULAR / REMOVABLE — this whole feature is contained in:
//    1. this file (assets/js/build-battle.js)
//    2. one <script> tag in index.html
//    3. the "buildBattles"/"buildBattlesSandbox" blocks in firebase-rules.json
//  Delete those things and the app behaves exactly as before. No
//  other behaviour is touched: this module injects its own CSS, its
//  own screens/modals, its own admin button, and hooks student join
//  by wrapping the existing global joinQuizByCode (auto-reverts when
//  this file is absent).
//
//  FLOW
//    lobby → building → finalising → voting → results
//    • finalising: every student client auto-submits its current
//      Blockbench project if it hasn't already. The host advances to
//      voting once all joined students have a submission or a short
//      grace timeout passes.
//    • voting: the teacher controls a shared review pointer
//        review/order        ordered list of submission codes
//        review/currentIndex pointer into that list
//        review/currentCode  the code currently on every screen
//      Students have NO navigation. They can only rate the current
//      build; once they vote, their stars lock until the teacher moves
//      on. If currentCode is the student's own code they just wait.
//
//  STORAGE — Firebase is the live transport. Submitted models are
//  additionally archived to Google Drive by the HOST browser (via
//  Google Identity Services), so students never need Drive access.
//  Drive failures never block voting. Ending the battle wipes the
//  transient Firebase node (model JSON included) but leaves the Drive
//  archive intact.
//
//  DATA / PRIVACY — mirrors the existing quiz system: everything in
//  Firebase is keyed by the anonymous login code, never by name.
//  Names are resolved locally on the teacher's machine via the
//  existing studentName().
// ════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ── Defensive guards: if the host app isn't present, do nothing ──
  function ready() {
    return typeof state === 'object' && state && state.db && state.auth;
  }

  var BB = {
    code: null,          // active battle code
    ref: null,           // Firebase ref to <root>/<code>
    listener: null,      // value listener
    role: null,          // 'host' | 'student'
    lastState: null,     // last phase seen by the student renderer
    lastHostState: null, // last phase seen by the host renderer
    timer: null,         // countdown interval
    finaliseTimer: null, // host grace-period timeout
    buildFrame: null,    // student build iframe
    viewFrame: null,     // shared voting viewer iframe (host or student)
    submitted: false,
    myVotes: {},
    myCode: null,
    lastReviewCode: null,// last review code rendered in the viewer
    resultsCache: null,
    hostClassName: null,
    // host transition guards
    _finalising: false,
    _startedVoting: false,
    // drive archive
    driveToken: null,
    driveTokenExp: 0,
    archiveRunning: false,
    _manifestId: null,
    // viewer load latest-wins guard
    _loadToken: 0,
  };

  // Preset objects the teacher can pick for students to build.
  var BUILD_PRESETS = [
    '🏠 House', '🌍 Earth', '🌳 Tree', '🏰 Castle', '🚗 Car',
    '🚀 Rocket', '🤖 Robot', '🐶 Animal', '⛄ Snowman', '⚔️ Sword',
    '✈️ Plane', '🍔 Burger', '🗼 Tower', '⛵ Boat', '🪑 Chair'
  ];

  // Storage roots: real battles vs isolated sandbox/test battles.
  var ROOT_LIVE = 'buildBattles';
  var ROOT_SANDBOX = 'buildBattlesSandbox';
  var ALL_ROOTS = [ROOT_LIVE, ROOT_SANDBOX];

  // How long the host waits in "finalising" for stragglers before
  // forcing voting to start anyway.
  var FINALISE_GRACE_MS = 10000;
  // Default Drive parent folder for archives (overridable via config).
  var DEFAULT_BB_DRIVE_FOLDER = '1Cs3fibUY49M-icJPeGaLaioCc0Ew5Uha';
  var DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

  function esc(s) {
    return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s == null ? '' : s);
  }
  function nameFor(code) {
    var n = (typeof studentName === 'function') ? studentName(code) : null;
    return n || code;
  }

  // ════════════════════════════════════════════════════════════
  //  STYLES (injected — no external CSS file touched)
  // ════════════════════════════════════════════════════════════
  function injectStyles() {
    if (document.getElementById('bb-battle-styles')) return;
    var css =
      '#bb-host-screen,#bb-student-screen{position:fixed;inset:0;z-index:60;background:#0f172a;color:#e2e8f0;overflow:auto;font-family:inherit}' +
      '.bb-wrap{max-width:1100px;margin:0 auto;padding:20px 16px 60px}' +
      '.bb-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}' +
      '.bb-title{font-size:1.25rem;font-weight:700}' +
      '.bb-code{font-family:monospace;font-size:2rem;font-weight:800;letter-spacing:.25em;color:#38bdf8}' +
      '.bb-btn{cursor:pointer;border:none;border-radius:8px;padding:10px 18px;font-weight:600;font-size:.95rem}' +
      '.bb-btn-primary{background:#0ea5e9;color:#fff}.bb-btn-primary:hover{background:#0284c7}' +
      '.bb-btn-ghost{background:#1e293b;color:#cbd5e1;border:1px solid #334155}.bb-btn-ghost:hover{background:#334155}' +
      '.bb-btn-danger{background:#7f1d1d;color:#fecaca}.bb-btn-danger:hover{background:#991b1b}' +
      '.bb-btn:disabled{opacity:.45;cursor:not-allowed}' +
      '.bb-card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;margin-bottom:14px}' +
      '.bb-muted{color:#94a3b8;font-size:.85rem}' +
      '.bb-frame{width:100%;height:68vh;min-height:420px;border:1px solid #334155;border-radius:10px;background:#000}' +
      '.bb-view-wrap{position:relative;margin-top:4px}' +
      '.bb-view{width:100%;height:46vh;min-height:300px;border:1px solid #334155;border-radius:10px;background:#000;display:block}' +
      '.bb-view-status{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;' +
      'background:rgba(15,23,42,.78);color:#e2e8f0;border-radius:10px;font-weight:600;padding:16px;gap:10px}' +
      '.bb-view-status .bb-btn{margin-left:10px}' +
      '.bb-timer{font-size:2.2rem;font-weight:800;font-variant-numeric:tabular-nums}' +
      '.bb-timer.low{color:#f87171}' +
      '.bb-players{display:flex;flex-wrap:wrap;gap:8px}' +
      '.bb-chip{background:#0f172a;border:1px solid #334155;border-radius:999px;padding:4px 12px;font-size:.85rem}' +
      '.bb-chip.done{border-color:#16a34a;color:#86efac}' +
      '.bb-stars{display:flex;gap:6px;justify-content:center;margin:10px 0;min-height:34px}' +
      '.bb-star{cursor:pointer;font-size:2.1rem;line-height:1;color:#475569;background:none;border:none;transition:transform .08s}' +
      '.bb-star:hover{transform:scale(1.15)}' +
      '.bb-star.on{color:#fbbf24}' +
      '.bb-star:disabled{cursor:default;transform:none}' +
      '.bb-wait{text-align:center;font-weight:700;color:#86efac;margin:8px 0;min-height:22px}' +
      '.bb-navrow{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:8px}' +
      '.bb-rank{display:flex;align-items:center;gap:12px;padding:8px 12px;border-bottom:1px solid #1e293b}' +
      '.bb-rank .pos{font-weight:800;width:34px;color:#94a3b8}' +
      '.bb-rank .nm{flex:1}.bb-rank .sc{font-weight:700;color:#fbbf24}' +
      '.bb-podium{display:flex;gap:12px;justify-content:center;align-items:flex-end;flex-wrap:wrap;margin:18px 0}' +
      '.bb-pod{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;text-align:center;min-width:150px}' +
      '.bb-pod .medal{font-size:2.4rem}.bb-pod .who{font-weight:700;margin-top:6px}.bb-pod .avg{color:#fbbf24;font-weight:800;font-size:1.3rem}' +
      '.bb-pod.first{transform:scale(1.08);border-color:#fbbf24}' +
      '#bb-modal-setup{position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center}' +
      '#bb-modal-setup .box{background:#fff;color:#1e293b;border-radius:14px;padding:22px;max-width:440px;width:92%}' +
      '#bb-modal-setup label{display:block;font-weight:600;margin:12px 0 4px;font-size:.9rem}' +
      '#bb-modal-setup input,#bb-modal-setup select{width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:9px 11px;font-size:.95rem;background:#fff}' +
      '.bb-hidden{display:none!important}' +
      '.bb-big{text-align:center;padding:40px 16px}.bb-big .num{font-size:3rem;font-weight:800;color:#38bdf8}';
    var st = document.createElement('style');
    st.id = 'bb-battle-styles';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ════════════════════════════════════════════════════════════
  //  Blockbench iframe helpers
  // ════════════════════════════════════════════════════════════
  // Wait until the embedded Blockbench is genuinely usable. We also
  // require Canvas, because setupProject()/the project codec touch the
  // 3D scene — checking it earlier was the main reason models loaded
  // before the viewer was ready and silently failed to display.
  function whenBlockbenchReady(frame, cb, tries, onFail) {
    tries = tries || 0;
    try {
      var cw = frame && frame.contentWindow;
      if (cw && cw.Blockbench && cw.Codecs && cw.Codecs.project && cw.Formats && cw.Canvas) {
        cb(cw);
        return;
      }
    } catch (e) {}
    if (tries > 150) { if (onFail) onFail(); return; } // ~30s
    setTimeout(function () { whenBlockbenchReady(frame, cb, tries + 1, onFail); }, 200);
  }

  function ensureBlankProject(cw) {
    try { if (!cw.Project) cw.Formats.free.new(); } catch (e) {}
  }

  function compileModel(frame) {
    try {
      var cw = frame.contentWindow;
      if (!cw || !cw.Codecs || !cw.Codecs.project || !cw.Project) return null;
      var out = cw.Codecs.project.compile();
      if (typeof out !== 'string') out = JSON.stringify(out);
      return out;
    } catch (e) { return null; }
  }

  function countCubes(frame) {
    try {
      var els = frame.contentWindow.Outliner.elements || [];
      return els.filter(function (el) { return el.faces && Object.keys(el.faces).length >= 6; }).length;
    } catch (e) { return 0; }
  }

  // Robust model load with success/failure callback. The project codec
  // needs a parsed object that has `.meta`; after load we nudge the
  // preview to resize/redraw so it renders at the iframe's real size.
  function loadModelInto(frame, modelStr, done) {
    whenBlockbenchReady(frame, function (cw) {
      try {
        var obj = (typeof modelStr === 'string') ? JSON.parse(modelStr) : modelStr;
        if (!obj || !obj.meta) { if (done) done(false); return; }
        cw.Codecs.project.load(obj, { path: 'battle.bbmodel' });
        setTimeout(function () {
          try {
            if (cw.Canvas && cw.Canvas.updateAll) cw.Canvas.updateAll();
            if (cw.Preview && cw.Preview.selected && cw.Preview.selected.resize) cw.Preview.selected.resize();
            if (typeof cw.Event !== 'undefined') cw.dispatchEvent(new cw.Event('resize'));
          } catch (e) {}
        }, 80);
        if (done) done(true);
      } catch (e) { if (done) done(false); }
    }, 0, function () { if (done) done(false); });
  }

  // ── Shared viewer status overlay + latest-wins model loading ──
  function setViewerStatus(txt) {
    var el = document.getElementById('bb-view-status');
    if (!el) return;
    if (txt) { el.innerHTML = txt; el.style.display = 'flex'; }
    else { el.innerHTML = ''; el.style.display = 'none'; }
  }

  function loadCurrentModel(code) {
    if (!BB.viewFrame) return;
    var token = ++BB._loadToken;
    if (!code) { setViewerStatus('Waiting for the teacher to choose a build…'); return; }
    setViewerStatus('⏳ Loading model…');
    BB.ref.child('submissions/' + code + '/model').get().then(function (snap) {
      if (token !== BB._loadToken) return; // a newer load superseded us
      var model = snap.val();
      if (!model) { setViewerStatus('No model was submitted for this build.'); return; }
      loadModelInto(BB.viewFrame, model, function (ok) {
        if (token !== BB._loadToken) return;
        if (ok) setViewerStatus('');
        else setViewerStatus('⚠️ Could not display this model.' +
          '<button class="bb-btn bb-btn-ghost" onclick="window.BBretryModel&&window.BBretryModel()">Retry</button>');
      });
    }).catch(function () {
      if (token === BB._loadToken) setViewerStatus('⚠️ Could not load this model.' +
        '<button class="bb-btn bb-btn-ghost" onclick="window.BBretryModel&&window.BBretryModel()">Retry</button>');
    });
  }
  // exposed so the inline Retry button can re-trigger the current load
  window.BBretryModel = function () { loadCurrentModel(BB.lastReviewCode); };

  // ════════════════════════════════════════════════════════════
  //  Code generation (own namespace; avoids quiz-code collisions)
  // ════════════════════════════════════════════════════════════
  async function genBattleCode(rootPath) {
    var now = Date.now();
    var staleMs = 12 * 60 * 60 * 1000;
    var otherRoot = (rootPath === ROOT_SANDBOX) ? ROOT_LIVE : ROOT_SANDBOX;
    for (var attempt = 0; attempt < 60; attempt++) {
      var code = String(Math.floor(1000 + Math.random() * 9000));
      var bbRef = state.db.ref(rootPath + '/' + code);
      try {
        var qSnap = await state.db.ref('quizSessions/' + code).get();
        if (qSnap.exists()) continue;
        var oSnap = await state.db.ref(otherRoot + '/' + code).get();
        if (oSnap.exists()) continue;
      } catch (e) {}
      try {
        var snap = await bbRef.get();
        if (snap.exists()) {
          var createdAt = Number(snap.child('createdAt').val()) || 0;
          var reservedAt = Number(snap.child('reservedAt').val()) || 0;
          var st = snap.child('state').val();
          var staleReservation = snap.child('reserved').val() === true && reservedAt && now - reservedAt > 120000;
          if ((createdAt && now - createdAt > staleMs) || st === 'finished' || staleReservation) {
            try { await bbRef.remove(); } catch (e) {}
          } else { continue; }
        }
        var tx = await bbRef.transaction(function (cur) {
          if (cur === null) return { reserved: true, reservedAt: Date.now() };
          return; // abort
        });
        if (tx && tx.committed) return code;
      } catch (e) {}
    }
    throw new Error('No free battle codes available right now. End an old battle and try again.');
  }

  // ════════════════════════════════════════════════════════════
  //  HOST — setup modal
  // ════════════════════════════════════════════════════════════
  function buildSetupModal() {
    if (document.getElementById('bb-modal-setup')) return;
    var m = document.createElement('div');
    m.id = 'bb-modal-setup';
    m.className = 'bb-hidden';
    m.innerHTML =
      '<div class="box">' +
      '<h2 style="font-size:1.2rem;font-weight:700;margin-bottom:4px">🏗️ Host a Build Battle</h2>' +
      '<p style="font-size:.85rem;color:#64748b">Students build in Blockbench against a timer, then you walk the class through each model and they vote.</p>' +
      '<label>What should they build?</label>' +
      '<select id="bb-setup-object">' +
      BUILD_PRESETS.map(function (p) { return '<option value="' + esc(p) + '">' + esc(p) + '</option>'; }).join('') +
      '<option value="__custom__">✏️ Custom…</option></select>' +
      '<input id="bb-setup-brief" type="text" maxlength="120" placeholder="Type a custom thing to build" class="bb-hidden" style="margin-top:8px" />' +
      '<label>Build time (minutes)</label>' +
      '<input id="bb-setup-minutes" type="number" min="1" max="60" value="10" />' +
      '<label style="display:flex;align-items:center;gap:8px;font-weight:500;margin-top:14px;cursor:pointer">' +
      '<input id="bb-setup-sandbox" type="checkbox" style="width:auto" /> 🧪 Sandbox / test mode <span class="bb-muted" style="font-weight:400">(kept separate from real data)</span></label>' +
      '<label id="bb-setup-force-row" class="bb-hidden" style="display:flex;align-items:center;gap:8px;font-weight:500;margin-top:14px;cursor:pointer">' +
      '<input id="bb-setup-force" type="checkbox" style="width:auto" /> Force to whole class <span id="bb-setup-force-class" style="color:#0ea5e9"></span></label>' +
      '<div style="display:flex;gap:10px;margin-top:20px">' +
      '<button id="bb-setup-cancel" class="bb-btn bb-btn-ghost" style="flex:1">Cancel</button>' +
      '<button id="bb-setup-start" class="bb-btn bb-btn-primary" style="flex:1">Create lobby</button>' +
      '</div></div>';
    document.body.appendChild(m);
    document.getElementById('bb-setup-cancel').onclick = function () {
      m.classList.add('bb-hidden');
      var adm = document.getElementById('modal-admin');
      if (adm) adm.classList.remove('hidden');
    };
    document.getElementById('bb-setup-object').onchange = function () {
      var custom = this.value === '__custom__';
      var inp = document.getElementById('bb-setup-brief');
      inp.classList.toggle('bb-hidden', !custom);
      if (custom) inp.focus();
    };
    document.getElementById('bb-setup-start').onclick = startHostedBattle;
  }

  function currentAdminClass() {
    var sel = document.getElementById('admin-class-select');
    return (sel && sel.value) ? sel.value : (state.className || null);
  }

  function openSetup() {
    buildSetupModal();
    var cls = currentAdminClass();
    var canForce = (typeof canDo === 'function') ? canDo('forceQuiz') : false;
    var row = document.getElementById('bb-setup-force-row');
    var forceBox = document.getElementById('bb-setup-force');
    if (forceBox) forceBox.checked = false;
    var sandboxBox = document.getElementById('bb-setup-sandbox');
    if (sandboxBox) sandboxBox.checked = false;
    if (row) {
      row.classList.toggle('bb-hidden', !(canForce && cls));
      var lbl = document.getElementById('bb-setup-force-class');
      if (lbl) lbl.textContent = cls ? '(' + cls + ')' : '';
    }
    document.getElementById('bb-modal-setup').classList.remove('bb-hidden');
    var adm = document.getElementById('modal-admin');
    if (adm) adm.classList.add('hidden');
  }

  async function startHostedBattle() {
    var objSel = document.getElementById('bb-setup-object');
    var brief;
    if (objSel && objSel.value === '__custom__') {
      brief = (document.getElementById('bb-setup-brief').value || '').trim() || 'Build something';
    } else {
      brief = (objSel && objSel.value) || 'Build something';
    }
    var minutes = Math.max(1, Math.min(60, parseInt(document.getElementById('bb-setup-minutes').value) || 10));
    var cls = currentAdminClass();
    var sandboxBox = document.getElementById('bb-setup-sandbox');
    var sandbox = !!(sandboxBox && sandboxBox.checked);
    var root = sandbox ? ROOT_SANDBOX : ROOT_LIVE;
    var forceBox = document.getElementById('bb-setup-force');
    var canForce = (typeof canDo === 'function') ? canDo('forceQuiz') : false;
    var forceClass = !!(forceBox && forceBox.checked && canForce && cls);
    var btn = document.getElementById('bb-setup-start');
    btn.disabled = true; btn.textContent = 'Creating…';
    try {
      var code = await genBattleCode(root);
      var hostUid = state.auth.currentUser && state.auth.currentUser.uid;
      await state.db.ref(root + '/' + code).set({
        hostUid: hostUid,
        state: 'lobby',
        className: cls || null,
        brief: brief,
        buildSeconds: minutes * 60,
        buildEndsAt: 0,
        forced: forceClass,
        sandbox: sandbox,
        createdAt: Date.now()
      });
      BB.hostClassName = forceClass ? cls : null;
      if (forceClass) {
        try {
          await state.db.ref('classes/' + cls + '/forcedQuiz').set({
            active: true,
            lobbyCode: code,
            hostUid: hostUid || null,
            lessonId: 'build-battle',
            startedAt: Date.now()
          });
        } catch (e) { console.warn('Could not force Build Battle:', e.message); }
      }
      document.getElementById('bb-modal-setup').classList.add('bb-hidden');
      enterAsHost(code, root);
    } catch (e) {
      alert(e.message || 'Could not start the battle.');
    }
    btn.disabled = false; btn.textContent = 'Create lobby';
  }

  async function clearForcedBattle() {
    if (!BB.hostClassName || !BB.code || !state.db) return;
    try {
      var ref = state.db.ref('classes/' + BB.hostClassName + '/forcedQuiz');
      var snap = await ref.get();
      if (snap.child('lobbyCode').val() === BB.code) {
        await ref.update({ active: false, endedAt: Date.now() });
      }
    } catch (e) { console.warn('Could not clear forced Build Battle:', e.message); }
  }

  // ════════════════════════════════════════════════════════════
  //  HOST — screen + render
  // ════════════════════════════════════════════════════════════
  function buildHostScreen() {
    if (document.getElementById('bb-host-screen')) return;
    var s = document.createElement('div');
    s.id = 'bb-host-screen';
    s.className = 'bb-hidden';
    s.innerHTML =
      '<div class="bb-wrap">' +
      '<div class="bb-top"><div class="bb-title">🏗️ Build Battle <span id="bb-host-phase" class="bb-muted"></span></div>' +
      '<button id="bb-host-exit" class="bb-btn bb-btn-danger">End battle &amp; wipe</button></div>' +
      '<div id="bb-host-body"></div></div>';
    document.body.appendChild(s);
    document.getElementById('bb-host-exit').onclick = endBattleHost;
  }

  function enterAsHost(code, root) {
    BB.role = 'host';
    BB.code = code;
    BB.ref = state.db.ref((root || ROOT_LIVE) + '/' + code);
    BB.lastState = null;
    BB.lastHostState = null;
    BB.lastReviewCode = null;
    BB._finalising = false;
    BB._startedVoting = false;
    BB._manifestId = null;
    buildHostScreen();
    document.getElementById('bb-host-screen').classList.remove('bb-hidden');
    BB.listener = BB.ref.on('value', function (snap) {
      if (!snap.exists()) { hostBattleGone(); return; }
      renderHost(snap.val());
    });
  }

  function hostBattleGone() {
    var body = document.getElementById('bb-host-body');
    if (body) body.innerHTML = '<div class="bb-big"><div class="num">—</div><p>This battle has ended.</p></div>';
  }

  function renderHost(d) {
    var phase = d.state;
    document.getElementById('bb-host-phase').textContent = '· ' + phase + (d.sandbox ? ' · 🧪 sandbox' : '');
    var body = document.getElementById('bb-host-body');
    var players = d.players || {};
    var subs = d.submissions || {};
    var playerCodes = Object.keys(players);
    var changed = (phase !== BB.lastHostState);
    BB.lastHostState = phase;

    // Leaving finalising → cancel the grace timer.
    if (phase !== 'finalising' && BB.finaliseTimer) { clearTimeout(BB.finaliseTimer); BB.finaliseTimer = null; }

    if (phase === 'lobby') {
      stopTimer();
      body.innerHTML =
        '<div class="bb-card" style="text-align:center">' +
        '<p class="bb-muted">Students join with this code</p>' +
        '<div class="bb-code">' + esc(BB.code) + '</div>' +
        '<p style="margin-top:8px">Brief: <strong>' + esc(d.brief) + '</strong> · ' + Math.round((d.buildSeconds || 0) / 60) + ' min</p>' +
        '</div>' +
        '<div class="bb-card"><div style="display:flex;justify-content:space-between;margin-bottom:8px">' +
        '<strong>' + playerCodes.length + ' in lobby</strong></div>' +
        '<div class="bb-players">' + (playerCodes.map(function (c) { return '<span class="bb-chip">' + esc(nameFor(c)) + '</span>'; }).join('') || '<span class="bb-muted">Waiting for students…</span>') + '</div></div>' +
        '<button id="bb-start-build" class="bb-btn bb-btn-primary" ' + (playerCodes.length ? '' : 'disabled') + '>Start building →</button>';
      document.getElementById('bb-start-build').onclick = function () {
        BB._finalising = false; BB._startedVoting = false;
        BB.ref.update({ state: 'building', buildEndsAt: Date.now() + (d.buildSeconds || 600) * 1000 });
      };
      return;
    }

    if (phase === 'building') {
      var submittedCount = Object.keys(subs).length;
      body.innerHTML =
        '<div class="bb-card" style="text-align:center"><p class="bb-muted">Time remaining</p>' +
        '<div id="bb-host-timer" class="bb-timer">--:--</div>' +
        '<p class="bb-muted">Brief: ' + esc(d.brief) + '</p></div>' +
        '<div class="bb-card"><strong>' + submittedCount + ' / ' + playerCodes.length + ' submitted</strong>' +
        '<div class="bb-players" style="margin-top:8px">' +
        playerCodes.map(function (c) {
          return '<span class="bb-chip' + (subs[c] ? ' done' : '') + '">' + (subs[c] ? '✓ ' : '') + esc(nameFor(c)) + '</span>';
        }).join('') + '</div></div>' +
        '<button id="bb-end-build" class="bb-btn bb-btn-primary">End building &amp; start voting →</button>';
      document.getElementById('bb-end-build').onclick = beginFinalising;
      startHostTimer(d.buildEndsAt);
      return;
    }

    if (phase === 'finalising') {
      stopTimer();
      var subN = Object.keys(subs).length;
      var total = playerCodes.length;
      body.innerHTML =
        '<div class="bb-card" style="text-align:center"><div class="num bb-timer">⏳</div>' +
        '<p style="font-weight:700;margin-top:6px">Finalising builds…</p>' +
        '<p class="bb-muted">Collecting every student\'s work before voting. ' + subN + ' / ' + total + ' in.</p></div>' +
        '<div class="bb-card"><div class="bb-players">' +
        playerCodes.map(function (c) {
          return '<span class="bb-chip' + (subs[c] ? ' done' : '') + '">' + (subs[c] ? '✓ ' : '… ') + esc(nameFor(c)) + '</span>';
        }).join('') + '</div></div>' +
        '<button id="bb-force-vote" class="bb-btn bb-btn-primary">Start voting now →</button>';
      document.getElementById('bb-force-vote').onclick = function () {
        BB.ref.get().then(function (s) { if (s.exists()) startVoting(s.val()); });
      };
      maybeStartVoting(d);
      return;
    }

    if (phase === 'voting') {
      stopTimer();
      renderHostVoting(d, changed);
      return;
    }

    if (phase === 'results') {
      stopTimer();
      var tallyR = computeResults(subs, d.votes || {}, d.results);
      body.innerHTML =
        podiumHtml(tallyR) +
        '<div class="bb-card"><strong>Full ranking</strong>' + rankingHtml(tallyR, null) + '</div>' +
        drivePanelHtml(d) +
        '<p class="bb-muted">When you end the battle, all submitted models are wiped from the database (the Drive archive is kept).</p>';
      wireDrivePanel();
      return;
    }
  }

  // ── Host finalising → voting transition ──
  function beginFinalising() {
    if (BB._finalising) return;
    BB._finalising = true;
    BB.ref.update({ state: 'finalising', finaliseStartedAt: Date.now() });
  }

  function maybeStartVoting(d) {
    var players = Object.keys(d.players || {});
    var subs = d.submissions || {};
    var allIn = players.length > 0 && players.every(function (c) { return subs[c]; });
    if (allIn) { startVoting(d); return; }
    // Otherwise arm a one-shot grace timer (only once).
    if (!BB.finaliseTimer) {
      var started = d.finaliseStartedAt || Date.now();
      var wait = Math.max(1500, FINALISE_GRACE_MS - (Date.now() - started));
      BB.finaliseTimer = setTimeout(function () {
        BB.finaliseTimer = null;
        BB.ref.get().then(function (s) {
          if (s.exists() && s.val().state === 'finalising') startVoting(s.val());
        });
      }, wait);
    }
  }

  function startVoting(d) {
    if (BB._startedVoting) return;
    BB._startedVoting = true;
    if (BB.finaliseTimer) { clearTimeout(BB.finaliseTimer); BB.finaliseTimer = null; }
    var order = Object.keys(d.submissions || {});
    BB.ref.update({
      state: 'voting',
      review: { order: order, currentIndex: 0, currentCode: order[0] || null }
    });
    // Fire-and-forget Drive archive; never blocks voting.
    archiveToDrive(d).catch(function () {});
  }

  // ── Host voting screen (Prev/Next drive the shared review) ──
  function renderHostVoting(d, changed) {
    var body = document.getElementById('bb-host-body');
    var subs = d.submissions || {};
    var review = d.review || {};
    var order = review.order && review.order.length ? review.order : Object.keys(subs);
    var idx = (typeof review.currentIndex === 'number') ? review.currentIndex : 0;
    if (idx < 0) idx = 0;
    if (idx > order.length - 1) idx = Math.max(0, order.length - 1);
    var cur = review.currentCode || order[idx] || null;

    if (changed || !document.getElementById('bb-view-frame')) {
      body.innerHTML =
        '<div class="bb-card" style="text-align:center">' +
        '<div class="bb-muted">You are showing the class</div>' +
        '<div id="bb-host-now" style="font-weight:700;font-size:1.1rem"></div></div>' +
        '<div class="bb-view-wrap"><iframe id="bb-view-frame" class="bb-view" src="./blockbench/index.html"></iframe>' +
        '<div id="bb-view-status" class="bb-view-status"></div></div>' +
        '<div class="bb-navrow">' +
        '<button id="bb-host-prev" class="bb-btn bb-btn-ghost">◀ Prev</button>' +
        '<span id="bb-host-pos" class="bb-muted"></span>' +
        '<button id="bb-host-next" class="bb-btn bb-btn-primary">Next ▶</button></div>' +
        '<div class="bb-card" style="margin-top:14px"><strong>Live standings</strong><div id="bb-host-standings"></div></div>' +
        drivePanelHtml(d) +
        '<button id="bb-end-vote" class="bb-btn bb-btn-primary">End voting &amp; show results →</button>';
      BB.viewFrame = document.getElementById('bb-view-frame');
      BB.lastReviewCode = null;
      document.getElementById('bb-host-prev').onclick = function () { hostStep(-1); };
      document.getElementById('bb-host-next').onclick = function () { hostStep(1); };
      document.getElementById('bb-end-vote').onclick = function () {
        BB.ref.get().then(function (s) {
          if (!s.exists()) return;
          var dd = s.val();
          var finalT = computeResults(dd.submissions || {}, dd.votes || {});
          var resultsMap = {};
          finalT.forEach(function (r) { resultsMap[r.code] = { avg: r.avg, count: r.count }; });
          BB.ref.update({ state: 'results', results: resultsMap });
        });
      };
      wireDrivePanel();
    }

    // Position + nav state
    var posEl = document.getElementById('bb-host-pos');
    if (posEl) posEl.textContent = order.length ? ('Build ' + (idx + 1) + ' of ' + order.length) : 'No submissions';
    var prevBtn = document.getElementById('bb-host-prev');
    var nextBtn = document.getElementById('bb-host-next');
    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) nextBtn.disabled = idx >= order.length - 1;
    var nowEl = document.getElementById('bb-host-now');
    if (nowEl) nowEl.textContent = cur ? nameFor(cur) + '’s build' : 'No submissions to review';

    // Standings
    var stEl = document.getElementById('bb-host-standings');
    if (stEl) stEl.innerHTML = rankingHtml(computeResults(subs, d.votes || {}), null);

    // Drive status (don't stomp a live archive run)
    if (!BB.archiveRunning) setArchiveStatus(driveStatusText(d));

    // Load the model only when the pointer actually changes
    if (cur !== BB.lastReviewCode) { BB.lastReviewCode = cur; loadCurrentModel(cur); }
  }

  function hostStep(dir) {
    BB.ref.get().then(function (s) {
      if (!s.exists()) return;
      var d = s.val();
      var review = d.review || {};
      var order = review.order && review.order.length ? review.order : Object.keys(d.submissions || {});
      if (!order.length) return;
      var idx = (typeof review.currentIndex === 'number') ? review.currentIndex : 0;
      idx = Math.max(0, Math.min(order.length - 1, idx + dir));
      BB.ref.child('review').update({ currentIndex: idx, currentCode: order[idx] });
    });
  }

  function startHostTimer(endsAt) {
    stopTimer();
    function tick() {
      var node = document.getElementById('bb-host-timer');
      if (!node) { stopTimer(); return; }
      var rem = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      node.textContent = fmtTime(rem);
      node.classList.toggle('low', rem <= 30);
      if (rem <= 0) { stopTimer(); beginFinalising(); }
    }
    tick();
    BB.timer = setInterval(tick, 500);
  }

  async function endBattleHost() {
    if (!confirm('End this battle and permanently wipe all submitted models from the database? (Any Google Drive archive is kept.)')) return;
    await clearForcedBattle();
    // Best-effort: refresh the Drive manifest with final results before wiping
    // Firebase, while we may still have a valid token (no new prompt).
    try {
      if (BB.driveToken && BB.driveTokenExp > Date.now() + 10000) {
        var s = await BB.ref.get();
        if (s.exists() && s.val().drive && s.val().drive.sessionFolderId) {
          await writeManifest(BB.driveToken, s.val().drive.sessionFolderId, s.val());
        }
      }
    } catch (e) {}
    try { if (BB.ref) await BB.ref.remove(); } catch (e) {}
    leaveBattle();
  }

  // ════════════════════════════════════════════════════════════
  //  STUDENT
  // ════════════════════════════════════════════════════════════
  function buildStudentScreen() {
    if (document.getElementById('bb-student-screen')) return;
    var s = document.createElement('div');
    s.id = 'bb-student-screen';
    s.className = 'bb-hidden';
    s.innerHTML =
      '<div class="bb-wrap">' +
      '<div class="bb-top"><div class="bb-title">🏗️ Build Battle <span id="bb-stu-phase" class="bb-muted"></span></div>' +
      '<button id="bb-stu-exit" class="bb-btn bb-btn-ghost">Leave</button></div>' +
      '<div id="bb-stu-body"></div></div>';
    document.body.appendChild(s);
    document.getElementById('bb-stu-exit').onclick = function () {
      if (BB.ref && BB.myCode) { try { BB.ref.child('players/' + BB.myCode).remove(); } catch (e) {} }
      leaveBattle();
    };
  }

  async function joinBuildBattle(code, root, data) {
    if (state.isAdmin) { throw new Error('Hosts run Build Battle from the Admin panel.'); }
    if (BB.role === 'student' && BB.code === code && BB.ref) return;
    if (BB.ref && BB.code !== code) leaveBattle();
    BB.role = 'student';
    BB.code = code;
    BB.myCode = state.uid;
    BB.ref = state.db.ref((root || ROOT_LIVE) + '/' + code);
    BB.submitted = false;
    BB.myVotes = {};
    BB.lastState = null;
    BB.lastReviewCode = null;
    try {
      await BB.ref.child('players/' + BB.myCode).update({ joinedAt: Date.now(), lastSeenAt: Date.now() });
    } catch (e) {}
    buildStudentScreen();
    document.getElementById('bb-student-screen').classList.remove('bb-hidden');
    BB.listener = BB.ref.on('value', function (snap) {
      if (!snap.exists()) { studentBattleGone(); return; }
      renderStudent(snap.val());
    });
  }

  function studentBattleGone() {
    var body = document.getElementById('bb-stu-body');
    if (body) {
      var line = '';
      if (BB.resultsCache) line = myResultLine(BB.resultsCache);
      body.innerHTML = '<div class="bb-big"><div class="num">🏁</div><p>The battle has ended.</p>' + line + '</div>';
    }
    stopTimer();
  }

  function renderStudent(d) {
    var phase = d.state;
    document.getElementById('bb-stu-phase').textContent = '· ' + phase;
    var body = document.getElementById('bb-stu-body');
    var changedPhase = (phase !== BB.lastState);
    BB.lastState = phase;

    if (phase === 'lobby') {
      body.innerHTML =
        '<div class="bb-big"><div class="num">⏳</div>' +
        '<p>You\'re in the lobby. Brief: <strong>' + esc(d.brief) + '</strong></p>' +
        '<p class="bb-muted">Waiting for your teacher to start the build…</p></div>';
      return;
    }

    if (phase === 'building') {
      if (changedPhase || !document.getElementById('bb-build-frame')) renderBuildUI(d);
      startStudentTimer(d.buildEndsAt);
      var subs = d.submissions || {};
      if (subs[BB.myCode]) { BB.submitted = true; markSubmittedUI(); }
      return;
    }

    if (phase === 'finalising') {
      stopTimer();
      // Keep the build iframe; auto-submit the current project if needed.
      ensureFinalisingBanner(d);
      if (!BB.submitted) autoSubmitLoop(0);
      return;
    }

    if (phase === 'voting') {
      stopTimer();
      if (changedPhase || !document.getElementById('bb-view-frame')) renderVotingUI(d);
      updateVotingTarget(d);
      return;
    }

    if (phase === 'results') {
      stopTimer();
      var tally = computeResults(d.submissions || {}, d.votes || {}, d.results);
      BB.resultsCache = tally;
      body.innerHTML =
        '<div class="bb-big">' + myResultLine(tally) + '</div>' +
        '<div class="bb-card"><strong>Top builders</strong>' + rankingHtml(tally, BB.myCode, 5) + '</div>';
      return;
    }
  }

  // ── Student building UI ──
  function renderBuildUI(d) {
    var body = document.getElementById('bb-stu-body');
    body.innerHTML =
      '<div class="bb-card" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
      '<div><div class="bb-muted">🎯 Build this</div><strong style="font-size:1.15rem">' + esc(d.brief) + '</strong></div>' +
      '<div style="text-align:right"><div class="bb-muted">Time left</div><div id="bb-stu-timer" class="bb-timer">--:--</div></div>' +
      '</div>' +
      '<iframe id="bb-build-frame" class="bb-frame" src="./blockbench/index.html" allow="fullscreen"></iframe>' +
      '<div style="display:flex;align-items:center;gap:12px;margin-top:12px">' +
      '<button id="bb-submit" class="bb-btn bb-btn-primary">Submit my build</button>' +
      '<span id="bb-submit-fb" class="bb-muted"></span></div>';
    BB.buildFrame = document.getElementById('bb-build-frame');
    whenBlockbenchReady(BB.buildFrame, function (cw) { ensureBlankProject(cw); });
    document.getElementById('bb-submit').onclick = function () { submitBuild(false); };
  }

  function ensureFinalisingBanner(d) {
    // If the student still has their build iframe, overlay a banner above it
    // rather than wiping it (we need the iframe to compile the model).
    var hasFrame = !!document.getElementById('bb-build-frame');
    var banner = document.getElementById('bb-finalising-banner');
    var msg = BB.submitted
      ? '✅ Submitted — waiting for the teacher to start voting…'
      : '⏳ Time\'s up! Submitting your build automatically…';
    if (hasFrame) {
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'bb-finalising-banner';
        banner.className = 'bb-card';
        banner.style.textAlign = 'center';
        banner.style.fontWeight = '700';
        var body = document.getElementById('bb-stu-body');
        body.insertBefore(banner, body.firstChild);
      }
      banner.textContent = msg;
      var btn = document.getElementById('bb-submit');
      if (btn) btn.disabled = true;
    } else {
      var bodyEl = document.getElementById('bb-stu-body');
      bodyEl.innerHTML = '<div class="bb-big"><div class="num">⏳</div><p>' + esc(msg) + '</p>' +
        '<p class="bb-muted">Sit tight — voting is about to begin.</p></div>';
    }
  }

  // Retry auto-submit a few times in case Blockbench is still warming up.
  function autoSubmitLoop(n) {
    if (BB.submitted || BB.lastState !== 'finalising') return;
    if (n > 20) return;
    submitBuild(true).then(function (ok) {
      if (!ok && !BB.submitted && BB.lastState === 'finalising') {
        setTimeout(function () { autoSubmitLoop(n + 1); }, 700);
      } else {
        ensureFinalisingBanner(null);
      }
    });
  }

  async function submitBuild(auto) {
    var fb = document.getElementById('bb-submit-fb');
    if (!BB.buildFrame) return false;
    var model = compileModel(BB.buildFrame);
    if (!model) {
      if (fb && !auto) fb.textContent = 'Editor still loading — add a cube then try again.';
      return false;
    }
    if (model.length > 700000) {
      if (fb) fb.textContent = 'Model is too large to submit — simplify it a little.';
      return false;
    }
    if (countCubes(BB.buildFrame) < 1 && !auto) {
      if (fb) fb.textContent = 'Add at least one cube before submitting.';
      return false;
    }
    try {
      await BB.ref.child('submissions/' + BB.myCode).update({ model: model, submittedAt: Date.now() });
      BB.submitted = true;
      markSubmittedUI(auto);
      return true;
    } catch (e) {
      if (fb) fb.textContent = 'Could not submit: ' + (e.message || 'error');
      return false;
    }
  }

  function markSubmittedUI(auto) {
    var btn = document.getElementById('bb-submit');
    var fb = document.getElementById('bb-submit-fb');
    if (btn) btn.textContent = 'Update my build';
    if (fb) fb.textContent = (auto ? 'Time up — your build was submitted automatically. ' : 'Submitted! ') + 'You can keep editing and update until voting starts.';
  }

  // ── Student voting UI (teacher-driven; no navigation) ──
  function renderVotingUI(d) {
    BB.myVotes = (d.votes && d.votes[BB.myCode]) || {};
    BB.lastReviewCode = null;
    var body = document.getElementById('bb-stu-body');
    body.innerHTML =
      '<div class="bb-card" style="text-align:center">' +
      '<div id="bb-vote-info" class="bb-muted">Waiting for the teacher…</div></div>' +
      '<div class="bb-view-wrap"><iframe id="bb-view-frame" class="bb-view" src="./blockbench/index.html"></iframe>' +
      '<div id="bb-view-status" class="bb-view-status"></div></div>' +
      '<div id="bb-stars" class="bb-stars"></div>' +
      '<div id="bb-vote-msg" class="bb-wait"></div>';
    BB.viewFrame = document.getElementById('bb-view-frame');
  }

  function updateVotingTarget(d) {
    var review = d.review || {};
    var cur = review.currentCode || null;
    BB.myVotes = (d.votes && d.votes[BB.myCode]) || BB.myVotes || {};
    var info = document.getElementById('bb-vote-info');
    var stars = document.getElementById('bb-stars');
    var msg = document.getElementById('bb-vote-msg');
    if (!info || !stars || !msg) return;

    if (!cur) {
      info.textContent = 'Waiting for the teacher to choose a build…';
      stars.innerHTML = '';
      msg.textContent = '';
      if (BB.lastReviewCode !== null) { BB.lastReviewCode = null; loadCurrentModel(null); }
      return;
    }

    var changed = (cur !== BB.lastReviewCode);
    if (changed) { BB.lastReviewCode = cur; loadCurrentModel(cur); }

    if (cur === BB.myCode) {
      info.textContent = 'This is your build';
      stars.innerHTML = '';
      msg.textContent = '⭐ This is your build — sit tight while everyone else votes.';
      return;
    }

    info.textContent = 'Rate this build out of 5 stars';
    if (BB.myVotes[cur]) {
      renderStars(cur, true);
      msg.textContent = '✅ Vote recorded — waiting for the teacher to show the next build.';
    } else {
      renderStars(cur, false);
      msg.textContent = '';
    }
  }

  function renderStars(target, locked) {
    var holder = document.getElementById('bb-stars');
    if (!holder) return;
    var current = BB.myVotes[target] || 0;
    var html = '';
    for (var i = 1; i <= 5; i++) {
      html += '<button class="bb-star' + (i <= current ? ' on' : '') + '" data-v="' + i + '"' +
        (locked ? ' disabled' : '') + '>' + (i <= current ? '★' : '☆') + '</button>';
    }
    holder.innerHTML = html;
    if (locked) return;
    holder.querySelectorAll('.bb-star').forEach(function (btn) {
      btn.onclick = function () { castVote(target, parseInt(btn.dataset.v)); };
    });
  }

  async function castVote(target, value) {
    if (!target || target === BB.myCode) return;
    // Only ever vote on the currently displayed build.
    if (target !== BB.lastReviewCode) return;
    BB.myVotes[target] = value;
    renderStars(target, true);
    var msg = document.getElementById('bb-vote-msg');
    if (msg) msg.textContent = '✅ Vote recorded — waiting for the teacher to show the next build.';
    try {
      await BB.ref.child('votes/' + BB.myCode + '/' + target).set(value);
    } catch (e) {
      if (msg) msg.textContent = '⚠️ Could not save your vote — tap a star again.';
      renderStars(target, false);
    }
  }

  function startStudentTimer(endsAt) {
    stopTimer();
    function tick() {
      var node = document.getElementById('bb-stu-timer');
      if (!node) { stopTimer(); return; }
      var rem = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      node.textContent = fmtTime(rem);
      node.classList.toggle('low', rem <= 30);
      if (rem <= 0) stopTimer(); // host moves everyone to "finalising"
    }
    tick();
    BB.timer = setInterval(tick, 500);
  }

  // ════════════════════════════════════════════════════════════
  //  GOOGLE DRIVE ARCHIVE (host browser only)
  // ════════════════════════════════════════════════════════════
  function bbDriveFolderId() {
    var c = (state && state.config) || {};
    return (c.buildBattleDriveFolderId && String(c.buildBattleDriveFolderId).trim()) || DEFAULT_BB_DRIVE_FOLDER;
  }

  function getDriveToken() {
    return new Promise(function (resolve, reject) {
      if (BB.driveToken && BB.driveTokenExp > Date.now() + 10000) { resolve(BB.driveToken); return; }
      var clientId = state.config && state.config.googleClientId;
      if (!clientId) { reject(new Error('googleClientId is not configured')); return; }
      if (!window.google || !google.accounts || !google.accounts.oauth2) {
        reject(new Error('Google Identity Services not loaded — try again in a moment.')); return;
      }
      var client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        callback: function (resp) {
          if (resp.error) { reject(new Error(resp.error_description || resp.error)); return; }
          BB.driveToken = resp.access_token;
          BB.driveTokenExp = Date.now() + (Number(resp.expires_in || 3600) * 1000);
          resolve(resp.access_token);
        },
        error_callback: function (err) { reject(new Error(err.type || 'OAuth error')); }
      });
      client.requestAccessToken();
    });
  }

  async function driveCreateFolder(token, name, parentId) {
    var meta = { name: name, mimeType: 'application/vnd.google-apps.folder' };
    if (parentId) meta.parents = [parentId];
    var resp = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink&supportsAllDrives=true', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(meta)
    });
    if (!resp.ok) throw new Error('Drive folder create failed (' + resp.status + ')');
    return resp.json();
  }

  async function driveUploadFile(token, name, parentId, content, mimeType) {
    var meta = { name: name };
    if (parentId) meta.parents = [parentId];
    var boundary = 'bb' + Date.now() + Math.random().toString(36).slice(2);
    var body =
      '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(meta) + '\r\n' +
      '--' + boundary + '\r\nContent-Type: ' + (mimeType || 'application/octet-stream') + '\r\n\r\n' +
      content + '\r\n' +
      '--' + boundary + '--';
    var resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink&supportsAllDrives=true', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + boundary },
      body: body
    });
    if (!resp.ok) throw new Error('Drive upload failed (' + resp.status + ')');
    return resp.json();
  }

  function stampNow() {
    var n = new Date();
    function p(x) { return (x < 10 ? '0' : '') + x; }
    return '' + n.getFullYear() + p(n.getMonth() + 1) + p(n.getDate()) + '-' + p(n.getHours()) + p(n.getMinutes());
  }

  async function writeManifest(token, sessionId, d) {
    var subs = d.submissions || {};
    var manifest = {
      battleCode: BB.code,
      brief: d.brief || null,
      className: d.className || null,
      sandbox: !!d.sandbox,
      createdAt: d.createdAt || null,
      archivedAt: Date.now(),
      submissions: {},
      results: d.results || null
    };
    Object.keys(subs).forEach(function (c) {
      var s = subs[c] || {};
      manifest.submissions[c] = {
        name: nameFor(c),
        submittedAt: s.submittedAt || null,
        driveFolderId: s.driveFolderId || null,
        driveFileId: s.driveFileId || null,
        driveWebViewLink: s.driveWebViewLink || null,
        uploadStatus: s.uploadStatus || null
      };
    });
    var content = JSON.stringify(manifest, null, 2);
    var manifestId = (d.drive && d.drive.manifestFileId) || BB._manifestId;
    if (manifestId) {
      try {
        var patch = await fetch('https://www.googleapis.com/upload/drive/v3/files/' + manifestId + '?uploadType=media&supportsAllDrives=true', {
          method: 'PATCH',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: content
        });
        if (patch.ok) return;
      } catch (e) {}
    }
    var file = await driveUploadFile(token, 'manifest.json', sessionId, content, 'application/json');
    BB._manifestId = file.id;
    try { await BB.ref.child('drive').update({ manifestFileId: file.id }); } catch (e) {}
  }

  async function archiveToDrive(d) {
    if (BB.archiveRunning) return;
    BB.archiveRunning = true;
    setArchiveStatus('Connecting to Google Drive…');
    try {
      var token = await getDriveToken();
      var snap = await BB.ref.get();
      if (!snap.exists()) { BB.archiveRunning = false; return; }
      d = snap.val();
      var subs = d.submissions || {};
      var parent = bbDriveFolderId();
      var driveMeta = d.drive || {};
      var sessionId = driveMeta.sessionFolderId;

      if (!sessionId) {
        var folderName = 'build-battle-' + BB.code + '-' + stampNow();
        var f = await driveCreateFolder(token, folderName, parent);
        sessionId = f.id;
        driveMeta = {
          parentFolderId: parent,
          sessionFolderId: sessionId,
          sessionFolderName: folderName,
          webViewLink: f.webViewLink || null,
          createdAt: Date.now()
        };
        await BB.ref.child('drive').update(driveMeta);
      }

      var codes = Object.keys(subs);
      var anyError = false;
      for (var i = 0; i < codes.length; i++) {
        var c = codes[i];
        var sub = subs[c] || {};
        if (sub.uploadStatus === 'done' && sub.driveFileId) {
          setArchiveStatus('Uploaded ' + (i + 1) + '/' + codes.length + '…');
          continue;
        }
        if (!sub.model) continue;
        try {
          await BB.ref.child('submissions/' + c).update({ uploadStatus: 'uploading' });
          var stuFolder = await driveCreateFolder(token, c, sessionId);
          var file = await driveUploadFile(token, c + '.bbmodel', stuFolder.id, sub.model, 'application/json');
          await BB.ref.child('submissions/' + c).update({
            driveFolderId: stuFolder.id,
            driveFileId: file.id,
            driveWebViewLink: file.webViewLink || null,
            uploadStatus: 'done'
          });
        } catch (e) {
          anyError = true;
          try { await BB.ref.child('submissions/' + c).update({ uploadStatus: 'error' }); } catch (e2) {}
        }
        setArchiveStatus('Uploaded ' + (i + 1) + '/' + codes.length + (anyError ? ' · some failed' : '') + '…');
      }

      try {
        var fresh = await BB.ref.get();
        if (fresh.exists()) await writeManifest(token, sessionId, fresh.val());
      } catch (e) {}

      setArchiveStatus(anyError
        ? '⚠️ Some uploads failed — click "Archive to Drive" to retry. Voting is unaffected.'
        : '✅ Archived to Drive.');
    } catch (e) {
      setArchiveStatus('⚠️ Drive archive failed: ' + (e.message || 'error') + ' — voting still works. Click "Archive to Drive" to retry.');
    }
    BB.archiveRunning = false;
  }

  // ── Host Drive panel helpers ──
  function driveStatusText(d) {
    var subs = d.submissions || {};
    var codes = Object.keys(subs);
    var done = codes.filter(function (c) { return subs[c].uploadStatus === 'done'; }).length;
    var err = codes.filter(function (c) { return subs[c].uploadStatus === 'error'; }).length;
    if (d.drive && d.drive.sessionFolderName) {
      return 'Folder: ' + d.drive.sessionFolderName + ' · ' + done + '/' + codes.length + ' uploaded' + (err ? (' · ' + err + ' failed') : '');
    }
    return 'Not archived yet — uploads start automatically when voting begins.';
  }

  function drivePanelHtml(d) {
    return '<div class="bb-card" id="bb-drive-panel">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">' +
      '<div><strong>☁️ Drive archive</strong>' +
      '<div id="bb-drive-status" class="bb-muted">' + esc(driveStatusText(d)) + '</div></div>' +
      '<button id="bb-drive-go" class="bb-btn bb-btn-ghost">Archive to Drive</button></div></div>';
  }

  function wireDrivePanel() {
    var b = document.getElementById('bb-drive-go');
    if (b) b.onclick = function () {
      BB.ref.get().then(function (s) { if (s.exists()) archiveToDrive(s.val()); });
    };
  }

  function setArchiveStatus(txt) {
    var el = document.getElementById('bb-drive-status');
    if (el) el.textContent = txt;
  }

  // ════════════════════════════════════════════════════════════
  //  Shared: results computation + rendering
  // ════════════════════════════════════════════════════════════
  function computeResults(subs, votes, storedResults) {
    var agg = {};
    Object.keys(subs || {}).forEach(function (c) { agg[c] = { code: c, sum: 0, count: 0 }; });
    Object.keys(votes || {}).forEach(function (voter) {
      var row = votes[voter] || {};
      Object.keys(row).forEach(function (target) {
        if (voter === target) return; // never count self-votes
        var v = Number(row[target]);
        if (!agg[target]) agg[target] = { code: target, sum: 0, count: 0 };
        if (v >= 1 && v <= 5) { agg[target].sum += v; agg[target].count++; }
      });
    });
    var list = Object.keys(agg).map(function (c) {
      var a = agg[c];
      var avg = a.count ? a.sum / a.count : 0;
      if (storedResults && storedResults[c] && typeof storedResults[c].avg === 'number') {
        avg = storedResults[c].avg;
        a.count = storedResults[c].count != null ? storedResults[c].count : a.count;
      }
      return { code: c, avg: avg, count: a.count };
    });
    list.sort(function (x, y) {
      if (y.avg !== x.avg) return y.avg - x.avg;
      if (y.count !== x.count) return y.count - x.count;
      return x.code < y.code ? -1 : 1;
    });
    return list;
  }

  function rankingHtml(list, highlightCode, limit) {
    if (!list.length) return '<p class="bb-muted" style="margin-top:8px">No votes yet.</p>';
    var rows = list.slice(0, limit || list.length).map(function (r, i) {
      var me = (r.code === highlightCode);
      return '<div class="bb-rank"' + (me ? ' style="background:#0b3a52"' : '') + '>' +
        '<span class="pos">#' + (i + 1) + '</span>' +
        '<span class="nm">' + esc(me ? 'You' : nameFor(r.code)) + '</span>' +
        '<span class="sc">★ ' + r.avg.toFixed(2) + ' <span class="bb-muted" style="font-weight:400">(' + r.count + ')</span></span>' +
        '</div>';
    }).join('');
    return '<div style="margin-top:8px">' + rows + '</div>';
  }

  function podiumHtml(list) {
    var medals = ['🥇', '🥈', '🥉'];
    var top = list.slice(0, 3);
    if (!top.length) return '<div class="bb-card"><p class="bb-muted">No submissions were voted on.</p></div>';
    var order = top.length === 3 ? [1, 0, 2] : (top.length === 2 ? [1, 0] : [0]);
    var pods = order.map(function (idx) {
      var r = top[idx];
      return '<div class="bb-pod' + (idx === 0 ? ' first' : '') + '">' +
        '<div class="medal">' + medals[idx] + '</div>' +
        '<div class="who">' + esc(nameFor(r.code)) + '</div>' +
        '<div class="avg">★ ' + r.avg.toFixed(2) + '</div>' +
        '<div class="bb-muted">' + r.count + ' votes</div></div>';
    }).join('');
    return '<div class="bb-podium">' + pods + '</div>';
  }

  function myResultLine(list) {
    var rank = -1;
    for (var i = 0; i < list.length; i++) { if (list[i].code === BB.myCode) { rank = i; break; } }
    if (rank === -1) return '<div class="num">—</div><p>You didn\'t submit a model this time.</p>';
    var r = list[rank];
    var medal = rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : '🎉';
    return '<div class="num">' + medal + ' #' + (rank + 1) + ' <span class="bb-muted" style="font-size:1.2rem">of ' + list.length + '</span></div>' +
      '<p style="font-size:1.3rem;margin-top:6px">Your average: <strong style="color:#fbbf24">★ ' + r.avg.toFixed(2) + '</strong> <span class="bb-muted">(' + r.count + ' votes)</span></p>';
  }

  // ════════════════════════════════════════════════════════════
  //  Lifecycle helpers
  // ════════════════════════════════════════════════════════════
  function fmtTime(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function stopTimer() { if (BB.timer) { clearInterval(BB.timer); BB.timer = null; } }

  function leaveBattle() {
    stopTimer();
    if (BB.finaliseTimer) { clearTimeout(BB.finaliseTimer); BB.finaliseTimer = null; }
    if (BB.ref && BB.listener) { try { BB.ref.off('value', BB.listener); } catch (e) {} }
    BB.ref = null; BB.listener = null; BB.role = null; BB.code = null;
    BB.buildFrame = null; BB.viewFrame = null; BB.lastState = null; BB.lastHostState = null;
    BB.lastReviewCode = null; BB.hostClassName = null;
    BB._finalising = false; BB._startedVoting = false; BB.archiveRunning = false; BB._manifestId = null;
    var h = document.getElementById('bb-host-screen'); if (h) h.classList.add('bb-hidden');
    var st = document.getElementById('bb-student-screen'); if (st) st.classList.add('bb-hidden');
    // Clear bodies so background Blockbench iframes stop running.
    var hb = document.getElementById('bb-host-body'); if (hb) hb.innerHTML = '';
    var sb = document.getElementById('bb-stu-body'); if (sb) sb.innerHTML = '';
  }

  // ════════════════════════════════════════════════════════════
  //  Integration hooks (the only places we touch the host app)
  // ════════════════════════════════════════════════════════════

  // (a) Admin button — mirror visibility of the existing Host Quiz button.
  function injectAdminButton() {
    var anchor = document.getElementById('btn-admin-host-quiz');
    if (!anchor || document.getElementById('btn-admin-build-battle')) return;
    var btn = document.createElement('button');
    btn.id = 'btn-admin-build-battle';
    btn.className = anchor.className;
    btn.innerHTML = '🏗️ Build Battle';
    btn.onclick = openSetup;
    anchor.parentNode.insertBefore(btn, anchor.nextSibling);
    function sync() { btn.classList.toggle('hidden', anchor.classList.contains('hidden')); }
    sync();
    try {
      new MutationObserver(sync).observe(anchor, { attributes: true, attributeFilter: ['class'] });
    } catch (e) {}
  }

  // (b) Student join — wrap the global joinQuizByCode so the shared
  //     code box also routes Build Battle codes. Falls back cleanly.
  function hookStudentJoin() {
    if (typeof window.joinQuizByCode !== 'function' || window.joinQuizByCode.__bbWrapped) return;
    var orig = window.joinQuizByCode;
    var wrapped = async function (code, opts) {
      try {
        if (ready() && code && String(code).length === 4 && !state.isAdmin) {
          for (var i = 0; i < ALL_ROOTS.length; i++) {
            var snap = await state.db.ref(ALL_ROOTS[i] + '/' + code).get();
            if (snap.exists()) { return await joinBuildBattle(String(code), ALL_ROOTS[i], snap.val()); }
          }
        }
      } catch (e) { /* fall through to normal quiz join */ }
      return orig.apply(this, arguments);
    };
    wrapped.__bbWrapped = true;
    window.joinQuizByCode = wrapped;
  }

  // ════════════════════════════════════════════════════════════
  //  Init
  // ════════════════════════════════════════════════════════════
  function init() {
    injectStyles();
    injectAdminButton();
    hookStudentJoin();
    var tries = 0;
    var iv = setInterval(function () {
      injectAdminButton();
      hookStudentJoin();
      if (++tries > 20) clearInterval(iv);
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
