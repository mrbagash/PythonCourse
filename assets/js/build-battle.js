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
    // board extras
    spinOn: true,      // auto-rotate the model on the board
    spinTimer: null,
    reactRef: null,
    reactListener: null,
    reactSince: 0,
    reactionsOn: true, // shared toggle (teacher can mute)
    _lastReact: 0,
    _reactCount: 0,    // per-build reaction count for this student
    _reactBuild: null,
    draftTimer: null,  // student build autosave (survives refresh)
  };

  // Emoji students can fling onto the board while voting.
  var REACTIONS = ['🔥', '👏', '😮', '😂', '❤️', '🤯'];

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
      // Dark classroom-projection theme (#111827) — high contrast, full width.
      '#bb-host-screen,#bb-student-screen{position:fixed;inset:0;z-index:60;background:#111827;color:#f3f4f6;overflow:auto;font-family:"Montserrat",system-ui,sans-serif}' +
      '.bb-wrap{max-width:1500px;margin:0 auto;padding:22px 32px 56px}' +
      '.bb-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:20px;background:#1f2937;padding:14px 22px;border-radius:10px;border:1px solid #374151}' +
      '.bb-title{font-size:1.5rem;font-weight:800;color:#f9fafb}' +
      '.bb-title .bb-muted{color:#9ca3af}' +
      '.bb-code{font-family:"Courier New",monospace;font-size:3.6rem;font-weight:900;letter-spacing:.18em;color:#60a5fa;margin:10px 0}' +
      '.bb-btn{cursor:pointer;border:none;border-radius:8px;padding:12px 22px;font-weight:800;font-size:1rem;transition:all .1s;display:inline-flex;align-items:center;justify-content:center}' +
      '.bb-btn:active:not(:disabled){transform:translateY(3px);box-shadow:none !important}' +
      '.bb-btn-primary{background:#2563eb;color:#fff;box-shadow:0 4px 0 #1e40af}.bb-btn-primary:hover:not(:disabled){background:#1d4ed8}' +
      '.bb-btn-ghost{background:#374151;color:#f3f4f6;border:1px solid #4b5563;box-shadow:0 4px 0 #1f2937}.bb-btn-ghost:hover:not(:disabled){background:#4b5563}' +
      '.bb-btn-danger{background:#ef4444;color:#fff;box-shadow:0 4px 0 #991b1b}.bb-btn-danger:hover:not(:disabled){background:#dc2626}' +
      '.bb-btn:disabled{opacity:.5;cursor:not-allowed}' +
      '.bb-card{background:#1f2937;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #374151}' +
      '.bb-muted{color:#9ca3af;font-size:.95rem;font-weight:600}' +
      '.bb-banner{text-align:center;font-weight:800;font-size:1.3rem;padding:18px;margin-bottom:16px;background:#1d4ed8;color:#fff;border-radius:12px}' +
      '.bb-frame{width:100%;height:74vh;min-height:460px;border:1px solid #374151;border-radius:12px;background:#1e1e2e}' +
      '.bb-view-wrap{position:relative;margin-top:8px}' +
      '.bb-view{width:100%;height:60vh;min-height:380px;border:1px solid #374151;border-radius:12px;background:#1e1e2e;display:block}' +
      '.bb-view-status{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;' +
      'background:rgba(17,24,39,.9);color:#f3f4f6;border-radius:12px;font-weight:700;font-size:1.25rem;padding:24px;gap:14px}' +
      '.bb-view-status .bb-btn{margin-left:14px}' +
      '.bb-view-full{position:absolute;top:12px;right:12px;z-index:3;font-size:.9rem;padding:8px 14px}' +
      '.bb-view-spin{position:absolute;top:12px;left:12px;z-index:3;font-size:.9rem;padding:8px 14px}' +
      '.bb-view-debug{position:absolute;bottom:12px;left:12px;font-size:.78rem;color:#6b7280;z-index:2;pointer-events:none}' +
      '#bb-view-wrap:fullscreen,#bb-build-wrap:fullscreen{background:#000;display:flex;flex-direction:column;border:none}' +
      '#bb-view-wrap:fullscreen .bb-view,#bb-build-wrap:fullscreen .bb-frame{height:100%;width:100%;border:0;border-radius:0}' +
      '#bb-view-wrap:-webkit-full-screen .bb-view,#bb-build-wrap:-webkit-full-screen .bb-frame{height:100%;width:100%;border:0;border-radius:0}' +
      '.bb-timer{font-size:3rem;font-weight:900;font-variant-numeric:tabular-nums;color:#f9fafb}' +
      '.bb-timer.low{color:#f87171;animation:bb-pulse-fast 1s infinite}' +
      '@keyframes bb-pulse-fast{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}' +
      '.bb-players{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:12px}' +
      '.bb-chip{background:#111827;border:1px solid #374151;border-radius:8px;padding:8px 16px;font-size:1.05rem;font-weight:700;color:#e5e7eb}' +
      '.bb-chip.done{border-color:#22c55e;background:rgba(34,197,94,.15);color:#86efac}' +
      '.bb-stars{display:flex;gap:10px;justify-content:center;margin:14px 0;min-height:40px}' +
      '.bb-star{cursor:pointer;font-size:2.6rem;line-height:1;color:#4b5563;background:none;border:none;transition:transform .1s,color .15s}' +
      '.bb-star:hover{transform:scale(1.2);color:#fbbf24}' +
      '.bb-star.on{color:#f59e0b;transform:scale(1.05)}' +
      '.bb-star:disabled{cursor:default;transform:none}' +
      '.bb-wait{text-align:center;font-weight:800;color:#f3f4f6;margin:10px 0;min-height:26px;font-size:1.3rem}' +
      '.bb-vote-screen{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:70vh;gap:22px;padding:24px}' +
      '.bb-vote-prompt{font-size:1.7rem;font-weight:800;text-align:center;color:#f9fafb}' +
      '.bb-stars-big{gap:20px}.bb-stars-big .bb-star{font-size:4.5rem}.bb-stars-big .bb-star:hover:not(:disabled){transform:scale(1.15)}' +
      '.bb-react-area{margin-top:14px;text-align:center;transition:opacity .2s}' +
      '.bb-react-label{font-size:.9rem;font-weight:800;color:#9ca3af;letter-spacing:.05em;text-transform:uppercase;margin-bottom:10px}' +
      '.bb-react-row{display:flex;gap:14px;flex-wrap:wrap;justify-content:center}' +
      '.bb-react{font-size:2.2rem;background:#1f2937;border:1px solid #374151;border-radius:12px;padding:10px 16px;cursor:pointer;transition:all .1s;box-shadow:0 4px 0 #111827}' +
      '.bb-react:hover{background:#374151;transform:translateY(-2px)}.bb-react:active{transform:translateY(4px);box-shadow:none}' +
      '.bb-react-area.maxed{opacity:.3;pointer-events:none}' +
      '.bb-float{position:absolute;bottom:12px;font-size:2.8rem;pointer-events:none;z-index:5;will-change:transform,opacity;animation:bb-rise 3s ease-out forwards}' +
      '@keyframes bb-rise{0%{opacity:0;transform:translateY(0) scale(.6)}12%{opacity:1;transform:translateY(-10vh) scale(1)}100%{opacity:0;transform:translateY(-65vh) scale(1.4)}}' +
      '.bb-results{width:100%;margin:0 auto;text-align:center}' +
      '.bb-results-title{font-size:2.2rem;font-weight:900;margin:20px 0 10px;color:#f9fafb;text-transform:uppercase;letter-spacing:1px}' +
      '.bb-awards{display:flex;gap:16px;justify-content:center;flex-wrap:wrap;margin:18px 0 26px}' +
      '.bb-award{background:#1f2937;border-radius:12px;padding:16px 24px;text-align:center;min-width:200px;border:1px solid #b45309}' +
      '.bb-award strong{display:block;margin:4px 0;color:#fbbf24;font-size:1.15rem;font-weight:900}' +
      '.bb-icon-btn{width:50px;height:50px;border-radius:10px;background:#374151;color:#f3f4f6;border:2px solid #4b5563;font-size:1.5rem;cursor:pointer;line-height:1;padding:0;box-shadow:0 4px 0 #111827;transition:all .1s;display:inline-flex;align-items:center;justify-content:center}' +
      '.bb-icon-btn:hover{background:#4b5563}' +
      '.bb-icon-btn:active{transform:translateY(4px);box-shadow:none}' +
      '.bb-icon-btn.ok{border-color:#22c55e;color:#86efac}' +
      '.bb-icon-btn.off{border-color:#ef4444;color:#fca5a5}' +
      '.bb-icon-btn.drive{border-color:#ef4444;color:#fca5a5}' +
      '.bb-icon-btn.drive.ok{border-color:#22c55e;color:#86efac}' +
      '.bb-icon-btn.busy{border-color:#f59e0b;color:#fcd34d;animation:bb-pulse 1s ease-in-out infinite}' +
      '@keyframes bb-pulse{0%,100%{opacity:1}50%{opacity:.6}}' +
      '.bb-navrow{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-top:14px;background:#1f2937;padding:14px 18px;border-radius:12px;border:1px solid #374151}' +
      '.bb-rank{display:flex;align-items:center;gap:16px;padding:13px 18px;border-bottom:1px solid #374151;font-size:1.1rem}' +
      '.bb-rank:last-child{border-bottom:none}' +
      '.bb-rank .pos{font-weight:900;width:42px;color:#9ca3af;font-size:1.2rem}' +
      '.bb-rank .nm{flex:1;font-weight:700;color:#f3f4f6}' +
      '.bb-rank .sc{font-weight:900;color:#fbbf24;font-size:1.2rem}' +
      '.bb-podium{display:flex;gap:18px;justify-content:center;align-items:flex-end;flex-wrap:wrap;margin:28px 0;min-height:240px}' +
      '.bb-pod{background:#1f2937;border-radius:12px 12px 0 0;padding:18px 18px 20px;text-align:center;min-width:170px;width:200px;border:1px solid #374151;border-bottom:4px solid #374151;display:flex;flex-direction:column;justify-content:flex-end;gap:4px;opacity:0;transform:translateY(40px);transition:opacity .6s ease,transform .6s cubic-bezier(.34,1.56,.64,1)}' +
      '.bb-pod.show{opacity:1;transform:translateY(0)}' +
      '.bb-pod .medal{font-size:3rem;display:block}' +
      '.bb-pod .who{font-weight:800;font-size:1.2rem;color:#f9fafb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.bb-pod .avg{color:#fbbf24;font-weight:900;font-size:1.5rem}' +
      '.bb-pod.second{min-height:200px;border-bottom-color:#9ca3af}' +
      '.bb-pod.first{min-height:240px;background:#27314a;border-color:#fbbf24;border-bottom-color:#fbbf24;z-index:2}' +
      '.bb-pod.third{min-height:170px;border-bottom-color:#b45309}' +
      '#bb-modal-setup{position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center}' +
      '#bb-modal-setup .box{background:#fff;color:#111827;border-radius:12px;padding:28px;max-width:460px;width:92%}' +
      '#bb-modal-setup label{display:block;font-weight:700;margin:14px 0 6px;font-size:1rem;color:#374151}' +
      '#bb-modal-setup input,#bb-modal-setup select{width:100%;border:2px solid #d1d5db;border-radius:8px;padding:11px 13px;font-size:1.05rem;background:#fff;font-weight:600}' +
      '#bb-modal-setup input:focus,#bb-modal-setup select:focus{border-color:#2563eb;outline:none}' +
      '.bb-hidden{display:none!important}' +
      '.bb-big{text-align:center;padding:48px 20px;background:#1f2937;border-radius:12px;border:1px solid #374151}' +
      '.bb-big .num{font-size:4rem;font-weight:900;color:#60a5fa;margin-bottom:12px}' +
      '.bb-big p{font-size:1.3rem;font-weight:700;color:#e5e7eb;margin:8px 0}';
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

  // Rebuild geometry/faces and re-attach the project's 3D group to the
  // scene. The programmatic project switch doesn't reliably leave the
  // loaded model's `model_3d` in the rendered scene, which is why the
  // model showed in the outliner but not the viewport — an explicit
  // unselect()/select() forces scene.add(model_3d) again.
  function refreshViewer(cw, project) {
    try {
      if (project && project.select) {
        try { if (project.unselect) project.unselect(); } catch (e) {}
        try { project.select(); } catch (e) {}
      }
      var C = cw.Canvas;
      if (C) {
        if (C.updateAllPositions) C.updateAllPositions(); // re-parents elements into model_3d
        if (C.updateAllFaces) C.updateAllFaces();
        if (C.updateVisibility) C.updateVisibility();
        if (C.updateAllBones) C.updateAllBones();
        if (C.updateAll) C.updateAll();
      }
      if (cw.Preview && cw.Preview.selected && cw.Preview.selected.resize) cw.Preview.selected.resize();
      if (typeof cw.Event !== 'undefined') cw.dispatchEvent(new cw.Event('resize'));
    } catch (e) {}
  }

  // Point the camera at the whole model so it isn't framed out of view.
  function focusViewerCamera(cw) {
    try {
      var els = (cw.Outliner && cw.Outliner.elements) ? cw.Outliner.elements.slice() : [];
      if (!els.length) return;
      if (Array.isArray(cw.selected)) { cw.selected.length = 0; }
      els.forEach(function (el) {
        try { el.selected = true; if (Array.isArray(cw.selected)) cw.selected.push(el); } catch (e) {}
      });
      if (cw.updateSelection) cw.updateSelection();
      var act = cw.BarItems && cw.BarItems.focus_on_selection;
      if (act && act.click) { try { act.click(); } catch (e) {} }
      // Deselect again so the viewer isn't cluttered with gizmos/outlines.
      els.forEach(function (el) { try { el.selected = false; } catch (e) {} });
      if (Array.isArray(cw.selected)) cw.selected.length = 0;
      if (cw.updateSelection) cw.updateSelection();
    } catch (e) {}
  }

  // ── Shared viewer status overlay ──
  function setViewerStatus(txt) {
    var el = document.getElementById('bb-view-status');
    if (!el) return;
    if (txt) { el.innerHTML = txt; el.style.display = 'flex'; }
    else { el.innerHTML = ''; el.style.display = 'none'; }
  }
  function setViewerDebug(txt) {
    var el = document.getElementById('bb-view-debug');
    if (el) el.textContent = txt || '';
  }

  // Fetch a submission's model JSON. Prefer the archived Google Drive copy
  // (smaller Firebase footprint); fall back to the live Firebase copy only
  // if it hasn't been freed yet. Logs which source was used.
  async function fetchBoardJson(code) {
    var sub = await BB.ref.child('submissions/' + code).get();
    var fileId = sub.child('driveFileId').val();
    var fbModel = sub.child('model').val();

    if (fileId) {
      var token = (BB.driveToken && BB.driveTokenExp > Date.now() + 10000) ? BB.driveToken : null;
      // If the Firebase copy was already freed, we MUST use Drive — get a token.
      if (!token && !fbModel) { try { token = await getDriveToken(); } catch (e) { token = null; } }
      if (token) {
        try {
          var resp = await fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media&supportsAllDrives=true',
            { headers: { Authorization: 'Bearer ' + token } });
          if (resp.ok) { console.log('[BuildBattle] model ' + code + ' loaded from GOOGLE DRIVE'); return await resp.text(); }
          console.warn('[BuildBattle] Drive fetch failed (' + resp.status + ') for ' + code + ' — falling back');
        } catch (e) { console.warn('[BuildBattle] Drive fetch error for ' + code, e); }
      }
    }

    if (fbModel) { console.log('[BuildBattle] model ' + code + ' loaded from FIREBASE' + (fileId ? ' (Drive fallback)' : '')); return fbModel; }
    console.warn('[BuildBattle] no model available for ' + code);
    return null;
  }

  // Load a model by booting a FRESH Blockbench instance: we REPLACE the
  // iframe element so there's never a stale Blockbench document to race
  // with (that race was why the board sometimes stayed blank until you
  // pressed Next/Prev). A clean boot also fixes the scene-switch issues.
  function bootViewerWithModel(json, token) {
    var wrap = document.getElementById('bb-view-wrap');
    if (!wrap) return;
    var old = document.getElementById('bb-view-frame');
    var frame = document.createElement('iframe');
    frame.id = 'bb-view-frame';
    frame.className = 'bb-view';
    frame.src = './blockbench/index.html?bb=' + token + '_' + Date.now();
    if (old) old.replaceWith(frame); else wrap.insertBefore(frame, wrap.firstChild);
    BB.viewFrame = frame;
    whenBlockbenchReady(frame, function (cw) {
      if (token !== BB._loadToken) return;
      try {
        var obj = (typeof json === 'string') ? JSON.parse(json) : json;
        if (!obj || !obj.meta) { setViewerStatus('⚠️ This submission isn\'t a valid model.'); return; }
        if (typeof cw.loadModelFile === 'function') {
          cw.loadModelFile({ content: (typeof json === 'string') ? json : JSON.stringify(json), path: 'battle.bbmodel', name: 'battle' });
        } else {
          cw.Codecs.project.load(obj, { path: 'battle.bbmodel' });
        }
        var loaded = cw.Project;
        var apply = function () {
          if (token !== BB._loadToken) return;
          refreshViewer(cw, loaded);
          focusViewerCamera(cw);
          try {
            var n = (cw.Outliner && cw.Outliner.elements) ? cw.Outliner.elements.length : 0;
            setViewerDebug('loaded ' + n + ' element' + (n === 1 ? '' : 's'));
            if (!n) setViewerStatus('This model has no shapes in it.');
          } catch (e) {}
        };
        apply();
        setTimeout(apply, 300);
        setTimeout(apply, 900);
        setViewerStatus('');
      } catch (e) { setViewerStatus('⚠️ Could not display this model.'); }
    }, 0, function () { if (token === BB._loadToken) setViewerStatus('⚠️ The 3D editor failed to load.'); });
  }

  // Host board: show the current build. Latest-wins via _loadToken.
  function loadCurrentModel(code) {
    if (!BB.viewFrame) return;
    var token = ++BB._loadToken;
    if (!code) { setViewerStatus('Waiting to choose a build…'); setViewerDebug(''); return; }
    setViewerStatus('⏳ Loading model…');
    setViewerDebug('');
    fetchBoardJson(code).then(function (json) {
      if (token !== BB._loadToken) return;
      if (!json) { setViewerStatus('No model was submitted for this build.'); return; }
      bootViewerWithModel(json, token);
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
          if ((createdAt && now - createdAt > staleMs) || st === 'finished' || st === 'ended' || staleReservation) {
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
    // Default ON when possible — forcing pulls in late joiners and lets
    // students who refresh auto-rejoin the battle.
    if (forceBox) forceBox.checked = !!(canForce && cls);
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
      // Lightweight index entry so the battle shows up in the admin
      // "Active sessions" list (Rejoin / Force End), like quizzes/AP.
      try {
        await state.db.ref('activeSessions/' + code).set({
          className: cls || null,
          lessonId: 'build-battle',
          hostUid: hostUid || null,
          root: root,
          startedAt: Date.now()
        });
      } catch (e) {}
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
      '<div style="display:flex;align-items:center;gap:8px">' +
      '<button id="bb-react-btn" class="bb-icon-btn ok hidden" title="Reactions on — click to mute">😀</button>' +
      '<button id="bb-drive-btn" class="bb-icon-btn drive hidden" title="Archive models to Google Drive">☁</button>' +
      '<button id="bb-host-exit" class="bb-btn bb-btn-danger">End battle &amp; wipe</button></div></div>' +
      '<div id="bb-host-body"></div></div>';
    document.body.appendChild(s);
    document.getElementById('bb-host-exit').onclick = endBattleHost;
    document.getElementById('bb-drive-btn').onclick = function () { archiveToDrive(); };
    document.getElementById('bb-react-btn').onclick = function () {
      var on = !(BB.reactionsOn === false); // currently on?
      BB.ref.update({ reactionsOn: !on });   // toggle for everyone
    };
  }

  function enterAsHost(code, root) {
    root = root || ROOT_LIVE;
    BB.role = 'host';
    BB.code = code;
    BB.rootPath = root;
    BB.ref = state.db.ref(root + '/' + code);
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
    if (phase === 'ended' || phase === 'finished') { hostBattleGone(); return; }
    document.getElementById('bb-host-phase').textContent = '· ' + phase + (d.sandbox ? ' · 🧪 sandbox' : '');
    var body = document.getElementById('bb-host-body');
    var players = d.players || {};
    var subs = d.submissions || {};
    var playerCodes = Object.keys(players);
    var changed = (phase !== BB.lastHostState);
    BB.lastHostState = phase;

    // Recover the forced-class link after a rejoin so "End battle" can clear it.
    if (!BB.hostClassName && d.forced && d.className) BB.hostClassName = d.className;

    // Track the shared reactions toggle (used by floatReaction + buttons).
    BB.reactionsOn = d.reactionsOn !== false;

    // Drive button only matters once there are submissions to archive.
    var dbtn = document.getElementById('bb-drive-btn');
    if (dbtn) {
      if (phase === 'voting' || phase === 'results') updateDriveBtn(d);
      else dbtn.classList.add('hidden');
    }

    // Reactions mute toggle — only on the voting board.
    var rbtn = document.getElementById('bb-react-btn');
    if (rbtn) {
      if (phase === 'voting') {
        rbtn.classList.remove('hidden');
        rbtn.classList.toggle('ok', BB.reactionsOn);
        rbtn.classList.toggle('off', !BB.reactionsOn);
        rbtn.textContent = BB.reactionsOn ? '😀' : '🔇';
        rbtn.title = BB.reactionsOn ? 'Reactions on — click to mute' : 'Reactions muted — click to allow';
      } else { rbtn.classList.add('hidden'); }
    }

    // Spin + reactions only run on the voting board.
    if (phase !== 'voting') { stopSpin(); stopReactionsListener(); }

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
        // Pre-authorise Google Drive now (this click is a user gesture) so
        // models can be archived to Drive automatically once voting starts.
        try { getDriveToken().catch(function () {}); } catch (e) {}
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
        // Use this click's gesture to archive to Drive first (so the board
        // can load each model from Drive), then start voting.
        archiveToDrive();
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
        '<div class="bb-results">' +
        '<div class="bb-results-title">🏆 Results</div>' +
        podiumHtml(tallyR) +
        awardsHtml(subs, d.votes || {}) +
        '<div class="bb-card" style="text-align:left"><strong>Full ranking</strong>' + rankingHtml(tallyR, null) + '</div>' +
        '</div>';
      revealPodium(changed); // animate only when results first appear
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
    // Drive-first: archive automatically. If the token was pre-authorised at
    // "Start building" this runs with no popup; otherwise it falls back to
    // the manual cloud button (and the board still works off Firebase).
    archiveToDrive();
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
        '<div class="bb-muted">You are showing the class (students vote on their own screens)</div>' +
        '<div id="bb-host-now" style="font-weight:700;font-size:1.1rem"></div></div>' +
        '<div id="bb-view-wrap" class="bb-view-wrap">' +
        '<iframe id="bb-view-frame" class="bb-view"></iframe>' +
        '<div id="bb-view-status" class="bb-view-status"></div>' +
        '<button id="bb-view-spin" class="bb-btn bb-btn-ghost bb-view-spin">⟳ Spin: On</button>' +
        '<button id="bb-view-full" class="bb-btn bb-btn-ghost bb-view-full">⛶ Fullscreen</button>' +
        '<div id="bb-view-debug" class="bb-view-debug"></div></div>' +
        '<div class="bb-navrow">' +
        '<button id="bb-host-prev" class="bb-btn bb-btn-ghost">◀ Prev</button>' +
        '<span id="bb-host-pos" class="bb-muted"></span>' +
        '<button id="bb-host-next" class="bb-btn bb-btn-primary">Next ▶</button></div>' +
        '<div class="bb-card" style="margin-top:14px"><strong>Live standings</strong><div id="bb-host-standings"></div></div>' +
        '<button id="bb-end-vote" class="bb-btn bb-btn-primary">End voting &amp; show results →</button>';
      BB.viewFrame = document.getElementById('bb-view-frame');
      BB.lastReviewCode = null;
      document.getElementById('bb-host-prev').onclick = function () { hostStep(-1); };
      document.getElementById('bb-host-next').onclick = function () { hostStep(1); };
      document.getElementById('bb-view-full').onclick = function () { toggleFullscreen('bb-view-wrap'); };
      var spinBtn = document.getElementById('bb-view-spin');
      spinBtn.textContent = '⟳ Spin: ' + (BB.spinOn ? 'On' : 'Off');
      spinBtn.onclick = function () {
        BB.spinOn = !BB.spinOn;
        spinBtn.textContent = '⟳ Spin: ' + (BB.spinOn ? 'On' : 'Off');
      };
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
      startSpin();
      startReactionsListener();
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

    // Drive button colour (don't stomp a live archive run)
    if (!BB.archiveRunning) updateDriveBtn(d);

    // Load the model only when the pointer actually changes
    if (cur !== BB.lastReviewCode) { BB.lastReviewCode = cur; loadCurrentModel(cur); }
  }

  // ── Board extras: auto-rotate + floating reactions ──
  function startSpin() {
    if (BB.spinTimer) return;
    BB.spinTimer = setInterval(function () {
      if (!BB.spinOn) return;
      try {
        var cw = BB.viewFrame && BB.viewFrame.contentWindow;
        if (cw && cw.Project && cw.Project.model_3d) cw.Project.model_3d.rotation.y += 0.012;
      } catch (e) {}
    }, 30);
  }
  function stopSpin() { if (BB.spinTimer) { clearInterval(BB.spinTimer); BB.spinTimer = null; } }

  function startReactionsListener() {
    stopReactionsListener();
    if (!BB.ref) return;
    BB.reactRef = BB.ref.child('reactions');
    // Snapshot existing keys first so attaching doesn't replay the whole
    // backlog, and so we don't depend on synced clocks between devices.
    BB.reactRef.once('value').then(function (snap) {
      var seen = {};
      snap.forEach(function (c) { seen[c.key] = true; });
      BB.reactListener = BB.reactRef.on('child_added', function (cs) {
        if (seen[cs.key]) return;
        seen[cs.key] = true;
        var v = cs.val() || {};
        if (v.e) floatReaction(v.e);
      });
    }).catch(function () {});
  }
  function stopReactionsListener() {
    if (BB.reactRef && BB.reactListener) { try { BB.reactRef.off('child_added', BB.reactListener); } catch (e) {} }
    BB.reactRef = null; BB.reactListener = null;
  }
  // Floats rise along the left/right edges (never over the centred model) and
  // live inside #bb-view-wrap so they also show while fullscreen.
  function floatReaction(emoji) {
    if (BB.reactionsOn === false) return;
    var wrap = document.getElementById('bb-view-wrap');
    if (!wrap) return;
    if (wrap.querySelectorAll('.bb-float').length > 20) return; // cap on screen
    var span = document.createElement('span');
    span.className = 'bb-float';
    span.textContent = emoji;
    if (Math.random() < 0.5) span.style.left = (1 + Math.random() * 8) + '%';
    else span.style.right = (1 + Math.random() * 8) + '%';
    span.style.animationDuration = (2.6 + Math.random() * 1.6) + 's';
    wrap.appendChild(span);
    setTimeout(function () { try { wrap.removeChild(span); } catch (e) {} }, 4400);
  }

  function toggleFullscreen(id) {
    var el = document.getElementById(id);
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else if (el.requestFullscreen) {
        el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
    } catch (e) {}
  }
  function exitFullscreenIfAny() {
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
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
      // Fresh reactions for the next build (keeps the node small too).
      try { BB.ref.child('reactions').remove(); } catch (e) {}
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
    var ref = BB.ref, code = BB.code, root = BB.rootPath || ROOT_LIVE;
    await clearForcedBattle();
    // Best-effort: refresh the Drive manifest with final results before wiping
    // Firebase, while we may still have a valid token (no new prompt).
    try {
      if (BB.driveToken && BB.driveTokenExp > Date.now() + 10000 && ref) {
        var s = await ref.get();
        if (s.exists() && s.val().drive && s.val().drive.sessionFolderId) {
          await writeManifest(BB.driveToken, s.val().drive.sessionFolderId, s.val());
        }
      }
    } catch (e) {}
    // Release the host screen immediately; the wipe runs in the background.
    leaveBattle();
    await wipeBattle(code, root, ref);
  }

  // End any battle by code (used by the admin "Active sessions" list).
  async function forceEndBattle(code, root, d) {
    root = root || ROOT_LIVE;
    try {
      if (d && d.forced && d.className) {
        var fr = state.db.ref('classes/' + d.className + '/forcedQuiz');
        var fs = await fr.get();
        if (fs.child('lobbyCode').val() === code) await fr.update({ active: false, endedAt: Date.now() });
      }
    } catch (e) {}
    if (BB.code === code) leaveBattle();
    await wipeBattle(code, root, state.db.ref(root + '/' + code));
  }

  // Tear down a battle robustly. We first flag state:'ended' (so students
  // are released even if the delete is somehow denied), then remove the
  // node + index. Errors are surfaced instead of silently swallowed.
  async function wipeBattle(code, root, ref) {
    if (!code) return;
    ref = ref || state.db.ref((root || ROOT_LIVE) + '/' + code);
    try { await ref.update({ state: 'ended', endedAt: Date.now() }); }
    catch (e) { console.error('[BuildBattle] could not flag battle ended:', e); }
    try { await state.db.ref('activeSessions/' + code).remove(); }
    catch (e) { console.warn('[BuildBattle] activeSessions cleanup failed:', e); }
    try {
      await ref.remove();
      console.log('[BuildBattle] battle ' + code + ' wiped');
    } catch (e) {
      console.error('[BuildBattle] battle wipe failed:', e);
      alert('Could not fully wipe the battle: ' + (e.message || e) + '\nStudents were released, but check your database rules.');
    }
  }

  // ════════════════════════════════════════════════════════════
  //  STUDENT
  // ════════════════════════════════════════════════════════════
  function buildStudentScreen() {
    if (document.getElementById('bb-student-screen')) return;
    var s = document.createElement('div');
    s.id = 'bb-student-screen';
    s.className = 'bb-hidden';
    // No "Leave" button — students stay in the battle until the teacher ends it.
    s.innerHTML =
      '<div class="bb-wrap">' +
      '<div class="bb-top"><div class="bb-title">🏗️ Build Battle <span id="bb-stu-phase" class="bb-muted"></span></div></div>' +
      '<div id="bb-stu-body"></div></div>';
    document.body.appendChild(s);
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
      body.innerHTML = '<div class="bb-big"><div class="num">🏁</div><p>The battle has ended.</p>' + line +
        '<div style="margin-top:18px"><button id="bb-stu-leave" class="bb-btn bb-btn-primary">Leave</button></div></div>';
      var lv = document.getElementById('bb-stu-leave');
      if (lv) lv.onclick = leaveBattle;
    }
    stopTimer();
    stopDraftAutosave();
    clearDraft();
    exitFullscreenIfAny();
  }

  function renderStudent(d) {
    var phase = d.state;
    // Battle wound down (teacher ended it) — release the student.
    if (phase === 'ended' || phase === 'finished') { studentBattleGone(); return; }
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
      exitFullscreenIfAny();   // building ended — drop out of fullscreen
      saveDraft();             // capture latest work before submitting
      stopDraftAutosave();
      // Keep the build iframe; auto-submit the current project if needed.
      ensureFinalisingBanner(d);
      if (!BB.submitted) autoSubmitLoop(0);
      return;
    }

    if (phase === 'voting') {
      stopTimer();
      stopDraftAutosave();
      if (changedPhase || !document.getElementById('bb-stars')) renderVotingUI(d);
      updateVotingTarget(d);
      return;
    }

    if (phase === 'results') {
      stopTimer();
      stopDraftAutosave();
      clearDraft();
      var tally = computeResults(d.submissions || {}, d.votes || {}, d.results);
      BB.resultsCache = tally;
      var aw = computeAwards(d.submissions || {}, d.votes || {});
      var myBadges = '';
      if (aw.creative === BB.myCode) myBadges += '<div class="bb-award">🎨 <strong>Most Creative!</strong>That\'s you</div>';
      if (aw.crowd === BB.myCode) myBadges += '<div class="bb-award">💖 <strong>Crowd Favourite!</strong>' + aw.crowdCount + ' × ★5</div>';
      body.innerHTML =
        '<div class="bb-big">' + myResultLine(tally) + '</div>' +
        (myBadges ? '<div class="bb-awards">' + myBadges + '</div>' : '') +
        '<div class="bb-card"><strong>Top builders</strong>' + rankingHtml(tally, BB.myCode, 5) + '</div>' +
        '<div style="text-align:center;margin-top:18px"><button id="bb-stu-leave" class="bb-btn bb-btn-ghost">Leave</button></div>';
      var lv = document.getElementById('bb-stu-leave');
      if (lv) lv.onclick = studentLeave;
      return;
    }
  }

  function studentLeave() {
    if (BB.ref && BB.myCode) { try { BB.ref.child('players/' + BB.myCode).remove(); } catch (e) {} }
    // Stop the forced-class watcher so a forced battle doesn't immediately
    // pull the student back in after they choose to leave.
    try { if (typeof stopForcedQuizWatcher === 'function') stopForcedQuizWatcher(); } catch (e) {}
    leaveBattle();
  }

  // ── Student building UI ──
  function renderBuildUI(d) {
    var body = document.getElementById('bb-stu-body');
    body.innerHTML =
      '<div class="bb-card" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
      '<div><div class="bb-muted">🎯 Build this</div><strong style="font-size:1.5rem">' + esc(d.brief) + '</strong></div>' +
      '<div style="text-align:right"><div class="bb-muted">Time left</div><div id="bb-stu-timer" class="bb-timer">--:--</div></div>' +
      '</div>' +
      '<div id="bb-build-wrap" class="bb-view-wrap">' +
      '<iframe id="bb-build-frame" class="bb-frame" src="./blockbench/index.html" allow="fullscreen"></iframe>' +
      '<button id="bb-build-full" class="bb-btn bb-btn-ghost bb-view-full">⛶ Fullscreen</button></div>' +
      '<div style="display:flex;align-items:center;gap:12px;margin-top:12px">' +
      '<button id="bb-submit" class="bb-btn bb-btn-primary">Submit my build</button>' +
      '<span id="bb-submit-fb" class="bb-muted"></span></div>';
    BB.buildFrame = document.getElementById('bb-build-frame');
    document.getElementById('bb-build-full').onclick = function () { toggleFullscreen('bb-build-wrap'); };
    whenBlockbenchReady(BB.buildFrame, function (cw) {
      // Restore work-in-progress after an accidental refresh: prefer the
      // locally autosaved draft, else the last submitted model from Firebase.
      var saved = null;
      try { saved = localStorage.getItem(buildDraftKey()); } catch (e) {}
      if (!saved && d.submissions && d.submissions[BB.myCode]) saved = d.submissions[BB.myCode].model;
      if (saved) {
        try {
          var obj = JSON.parse(saved);
          if (obj && obj.meta) { cw.Codecs.project.load(obj, { path: 'battle.bbmodel' }); return; }
        } catch (e) {}
      }
      ensureBlankProject(cw);
    });
    startDraftAutosave();
    document.getElementById('bb-submit').onclick = function () { submitBuild(false); };
  }

  // ── Student build autosave (so a refresh doesn't lose their work) ──
  function buildDraftKey() { return 'bb_draft_' + BB.code + '_' + BB.myCode; }
  function saveDraft() {
    try {
      if (!BB.buildFrame) return;
      var m = compileModel(BB.buildFrame);
      if (m && m.length < 800000) localStorage.setItem(buildDraftKey(), m);
    } catch (e) {}
  }
  function clearDraft() { try { localStorage.removeItem(buildDraftKey()); } catch (e) {} }
  function startDraftAutosave() { stopDraftAutosave(); BB.draftTimer = setInterval(saveDraft, 8000); }
  function stopDraftAutosave() { if (BB.draftTimer) { clearInterval(BB.draftTimer); BB.draftTimer = null; } }

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
        banner.className = 'bb-banner';
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

  // ── Student voting UI (teacher-driven; no 3D viewer, no navigation) ──
  // The model is shown by the teacher on the board. Students just get the
  // stars + a small reactions strip (hidden when the teacher mutes).
  var MAX_REACTS_PER_BUILD = 10;
  function renderVotingUI(d) {
    BB.myVotes = (d.votes && d.votes[BB.myCode]) || {};
    BB.lastReviewCode = null;
    BB._reactBuild = null;
    BB._reactCount = 0;
    var body = document.getElementById('bb-stu-body');
    body.innerHTML =
      '<div class="bb-vote-screen">' +
      '<div id="bb-vote-msg" class="bb-wait"></div>' +
      '<div id="bb-stars" class="bb-stars bb-stars-big"></div>' +
      '<div id="bb-react-area" class="bb-react-area">' +
      '<div class="bb-react-label">Send a reaction</div>' +
      '<div class="bb-react-row">' +
      REACTIONS.map(function (e) { return '<button class="bb-react" data-e="' + e + '">' + e + '</button>'; }).join('') +
      '</div></div></div>';
    body.querySelectorAll('.bb-react').forEach(function (btn) {
      btn.onclick = function () { sendReaction(btn.dataset.e); };
    });
  }

  function sendReaction(emoji) {
    if (!BB.ref || !emoji || BB.reactionsOn === false) return;
    var now = Date.now();
    if (now - BB._lastReact < 350) return;                 // throttle bursts
    if (BB._reactCount >= MAX_REACTS_PER_BUILD) return;    // per-build cap
    BB._lastReact = now;
    BB._reactCount++;
    try { BB.ref.child('reactions').push({ e: emoji, at: now }); } catch (e) {}
    if (BB._reactCount >= MAX_REACTS_PER_BUILD) {
      var area = document.getElementById('bb-react-area');
      if (area) area.classList.add('maxed');
    }
  }

  function updateVotingTarget(d) {
    var review = d.review || {};
    var cur = review.currentCode || null;
    BB.myVotes = (d.votes && d.votes[BB.myCode]) || BB.myVotes || {};
    BB.reactionsOn = d.reactionsOn !== false;
    var stars = document.getElementById('bb-stars');
    var msg = document.getElementById('bb-vote-msg');
    if (!stars || !msg) return;
    BB.lastReviewCode = cur;

    // Reset the per-build reaction budget when the teacher moves on, and
    // show/hide the reaction strip according to the teacher's mute toggle.
    var area = document.getElementById('bb-react-area');
    if (cur !== BB._reactBuild) { BB._reactBuild = cur; BB._reactCount = 0; if (area) area.classList.remove('maxed'); }
    if (area) area.style.display = (BB.reactionsOn === false || !cur) ? 'none' : 'block';

    if (!cur) {
      stars.innerHTML = '';
      msg.textContent = 'Waiting for the next build…';
      return;
    }

    if (cur === BB.myCode) {
      stars.innerHTML = '';
      msg.textContent = '⭐ Your build is up — others are voting';
      return;
    }

    if (BB.myVotes[cur]) {
      renderStars(cur, true);
      msg.textContent = '✓ Voted — nice!';
    } else {
      renderStars(cur, false);
      msg.textContent = 'Tap to rate';
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

  function withTimeout(promise, ms, msg) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error(msg || 'Timed out')); }, ms);
      promise.then(function (v) { clearTimeout(t); resolve(v); },
        function (e) { clearTimeout(t); reject(e); });
    });
  }

  async function archiveToDrive() {
    if (BB.archiveRunning || !BB.ref) return;
    BB.archiveRunning = true;
    setArchiveStatus('Connecting to Google Drive… (approve the Google popup)');
    try {
      // Request the token first so the click's user-gesture is still active.
      var token = await withTimeout(getDriveToken(), 120000, 'Google sign-in timed out — click Archive to Drive to try again.');
      var snap = await BB.ref.get();
      if (!snap.exists()) { BB.archiveRunning = false; return; }
      var d = snap.val();
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
          // Storage saver: once the model is safely on Drive, drop the big
          // JSON from Firebase. The board reloads it from Drive; metadata
          // (driveFileId etc.) stays so we always know where it lives.
          try {
            await BB.ref.child('submissions/' + c + '/model').remove();
            console.log('[BuildBattle] archived ' + c + ' to Drive (' + file.id + ') and freed Firebase copy');
          } catch (e3) {}
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

  // ── Host Drive button (small square in the top bar) ──
  // Red outline = not archived yet; green outline = all models archived.
  function updateDriveBtn(d) {
    var b = document.getElementById('bb-drive-btn');
    if (!b) return;
    var subs = d.submissions || {};
    var codes = Object.keys(subs);
    var done = codes.filter(function (c) { return subs[c].uploadStatus === 'done'; }).length;
    var err = codes.filter(function (c) { return subs[c].uploadStatus === 'error'; }).length;
    var archived = d.drive && d.drive.sessionFolderName && codes.length > 0 && done === codes.length;
    b.classList.remove('hidden');
    b.classList.toggle('ok', !!archived);
    b.classList.toggle('busy', !!BB.archiveRunning);
    b.title = archived
      ? ('✅ Archived to Drive (' + done + '/' + codes.length + ')')
      : (BB.archiveRunning ? 'Archiving to Google Drive…'
        : ('☁ Click to archive ' + codes.length + ' model' + (codes.length === 1 ? '' : 's') + ' to Drive' + (err ? (' · ' + err + ' failed') : '')));
  }

  // Called during an archive run to reflect progress on the button tooltip.
  function setArchiveStatus(txt) {
    var b = document.getElementById('bb-drive-btn');
    if (b) { b.title = txt; b.classList.toggle('busy', !!BB.archiveRunning); }
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
      var podClass = idx === 0 ? ' first' : (idx === 1 ? ' second' : ' third');
      return '<div class="bb-pod' + podClass + '" data-rank="' + idx + '">' +
        '<div class="medal">' + medals[idx] + '</div>' +
        '<div class="who">' + esc(nameFor(r.code)) + '</div>' +
        '<div class="avg">★ ' + r.avg.toFixed(2) + '</div>' +
        '<div class="bb-muted">' + r.count + ' votes</div></div>';
    }).join('');
    return '<div class="bb-podium">' + pods + '</div>';
  }

  // Reveal the podium 3rd → 2nd → 1st for a bit of suspense.
  function revealPodium(animate) {
    var pods = document.querySelectorAll('#bb-host-body .bb-pod');
    if (!animate) { pods.forEach(function (p) { p.classList.add('show'); }); return; }
    [2, 1, 0].forEach(function (rank, i) {
      setTimeout(function () {
        document.querySelectorAll('#bb-host-body .bb-pod[data-rank="' + rank + '"]').forEach(function (p) { p.classList.add('show'); });
      }, 350 + i * 850);
    });
  }

  // Fun bonus awards beyond the top 3.
  function computeAwards(subs, votes) {
    var fives = {}, best = {};
    Object.keys(subs || {}).forEach(function (c) { fives[c] = 0; best[c] = 0; });
    Object.keys(votes || {}).forEach(function (voter) {
      var row = votes[voter] || {};
      Object.keys(row).forEach(function (t) {
        if (voter === t) return;
        var v = Number(row[t]);
        if (!(v >= 1 && v <= 5)) return;
        if (!(t in fives)) { fives[t] = 0; best[t] = 0; }
        if (v === 5) fives[t]++;
        if (v > best[t]) best[t] = v;
      });
    });
    var crowd = null, creative = null;
    Object.keys(fives).forEach(function (c) { if (fives[c] > 0 && (crowd === null || fives[c] > fives[crowd])) crowd = c; });
    Object.keys(best).forEach(function (c) { if (best[c] > 0 && (creative === null || best[c] > best[creative])) creative = c; });
    return { crowd: crowd, crowdCount: crowd ? fives[crowd] : 0, creative: creative, creativeScore: creative ? best[creative] : 0 };
  }

  function awardsHtml(subs, votes) {
    var a = computeAwards(subs, votes);
    var items = [];
    if (a.creative) items.push('<div class="bb-award">🎨 <strong>Most Creative</strong>' + esc(nameFor(a.creative)) + '</div>');
    if (a.crowd) items.push('<div class="bb-award">💖 <strong>Crowd Favourite</strong>' + esc(nameFor(a.crowd)) + ' · ' + a.crowdCount + ' × ★5</div>');
    return items.length ? '<div class="bb-awards">' + items.join('') + '</div>' : '';
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
    stopSpin();
    stopReactionsListener();
    stopDraftAutosave();
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

  // (a2) Active sessions — add Build Battle rows (Rejoin / Force End) to the
  //      admin list, the same way quizzes/AP appear. We wrap the host app's
  //      loadActiveSessions so our rows are appended after it renders; if this
  //      file is removed, the admin list behaves exactly as before.
  function hookActiveSessions() {
    if (typeof window.loadActiveSessions !== 'function' || window.loadActiveSessions.__bbWrapped) return;
    var orig = window.loadActiveSessions;
    var wrapped = function () {
      var r;
      try { r = orig.apply(this, arguments); } catch (e) { r = null; }
      Promise.resolve(r).then(injectBattleSessions, injectBattleSessions);
      return r;
    };
    wrapped.__bbWrapped = true;
    window.loadActiveSessions = wrapped;
  }

  async function injectBattleSessions() {
    if (!ready()) return;
    var list = document.getElementById('admin-sessions-list');
    var panel = document.getElementById('admin-sessions-panel');
    if (!list || !panel) return;
    var uid = state.auth.currentUser && state.auth.currentUser.uid;
    if (!uid) return;
    // Clear any rows we added on a previous pass.
    list.querySelectorAll('.bb-sess-row').forEach(function (n) { n.remove(); });
    try {
      var idx = await state.db.ref('activeSessions').get();
      var entries = [];
      if (idx.exists()) idx.forEach(function (ch) {
        var s = ch.val() || {};
        if (s.lessonId === 'build-battle' && s.hostUid === uid) {
          entries.push({ code: ch.key, root: s.root || ROOT_LIVE, className: s.className || '—' });
        }
      });
      if (!entries.length) return;
      // Read just the small fields per battle (never the model JSON).
      var rows = await Promise.all(entries.map(async function (e) {
        var base = state.db.ref(e.root + '/' + e.code);
        try {
          var parts = await Promise.all([
            base.child('state').get(), base.child('players').get(),
            base.child('sandbox').get(), base.child('forced').get(), base.child('className').get()
          ]);
          var st = parts[0].val();
          if (!parts[0].exists() || st === 'ended' || st === 'finished') {
            try { await state.db.ref('activeSessions/' + e.code).remove(); } catch (x) {}
            return null;
          }
          var players = parts[1].exists() ? Object.keys(parts[1].val() || {}).length : 0;
          return { code: e.code, root: e.root, state: parts[0].val(), players: players,
            sandbox: parts[2].val() === true, forced: parts[3].val() === true,
            className: parts[4].val() || e.className };
        } catch (x) { return null; }
      }));
      rows = rows.filter(Boolean);
      if (!rows.length) return;
      panel.classList.remove('hidden');
      rows.forEach(function (s) {
        var stateLabel = ({ lobby: 'Lobby', building: 'Building', finalising: 'Finalising', voting: 'Voting', results: 'Results' })[s.state] || s.state;
        var row = document.createElement('div');
        row.className = 'flex flex-wrap items-center gap-2 px-4 py-2 text-sm border-t border-gray-100 bb-sess-row';
        row.innerHTML =
          '<span class="font-semibold text-gray-700 w-10">Build</span>' +
          '<span class="font-mono text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-0.5 text-xs">' + esc(s.code) + '</span>' +
          '<span class="text-gray-600">Class: <strong>' + esc(s.className) + '</strong></span>' +
          '<span class="text-gray-400 text-xs">' + esc(stateLabel) + ' &middot; ' + s.players + ' players' + (s.sandbox ? ' &middot; 🧪' : '') + '</span>' +
          '<div class="ml-auto flex gap-2">' +
          '<button class="bb-sess-rejoin px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">Rejoin</button>' +
          '<button class="bb-sess-end px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">Force End</button>' +
          '</div>';
        row.querySelector('.bb-sess-rejoin').onclick = function () {
          var adm = document.getElementById('modal-admin');
          if (adm) adm.classList.add('hidden');
          enterAsHost(s.code, s.root);
        };
        row.querySelector('.bb-sess-end').onclick = async function () {
          if (!confirm('Force-end this Build Battle for class ' + s.className + '? Students will be released.')) return;
          await forceEndBattle(s.code, s.root, { forced: s.forced, className: s.className });
          if (typeof window.loadActiveSessions === 'function') window.loadActiveSessions();
        };
        list.appendChild(row);
      });
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
    hookActiveSessions();
    var tries = 0;
    var iv = setInterval(function () {
      injectAdminButton();
      hookStudentJoin();
      hookActiveSessions();
      if (++tries > 20) clearInterval(iv);
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
