/**
 * pyscratch-lesson.js  —  lesson integration utilities for PyScratch
 *
 * PyScratchLesson.createStepper(opts)
 *
 * Each step can specify:
 *   title        {string}   Bold heading
 *   text         {string}   Instruction HTML
 *   interactive  {bool}     false = blocker over iframe (view-only)
 *   highlight    {string?}  Named preset or CSS selector → PS_HIGHLIGHT
 *   highlightLabel {string?}
 *   autoRun      {bool?}    Send PS_RUN when step activates
 *   hide         {string[]} Extra elements to hide this step (added to defaultHide)
 *   show         {string[]} Elements to UN-hide this step (overrides defaultHide)
 *   requires     {object?}  Validation that must pass before Next is allowed:
 *     threads      {string[]}  Thread names that must exist on ANY sprite
 *     codeContains {object}    { threadName: ['substr1', 'substr2'] }
 *   requiresHint {string?}  Message shown when validation fails
 *
 * Stepper-level opts:
 *   containerId   {string}
 *   projectUrl    {string?}
 *   height        {number?}   iframe height px (default 560)
 *   defaultHide   {string[]}  Elements hidden on EVERY step unless overridden by show
 *   completeOnEnd {bool?}     Mark lesson step complete on Finish (default true)
 */
window.PyScratchLesson = (function () {
  'use strict';

  // ── Styles ──────────────────────────────────────────────────────────────────
  var _stylesInjected = false;
  function _injectStyles() {
    if (_stylesInjected) return;
    _stylesInjected = true;
    var s = document.createElement('style');
    s.textContent = [
      '.ps-ls-wrap{border-radius:8px;overflow:hidden;border:1px solid #1e293b;background:#0f172a;font-family:"Segoe UI",system-ui,sans-serif}',

      // Info panel
      '.ps-ls-info{padding:14px 18px 12px;background:#1e293b;border-bottom:1px solid #0f172a}',
      '.ps-ls-info-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px}',
      '.ps-ls-title{font-size:15px;font-weight:700;color:#f1f5f9;line-height:1.3}',
      '.ps-ls-pill{font-size:11px;color:#64748b;white-space:nowrap;flex-shrink:0;margin-top:2px}',
      '.ps-ls-dots{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap}',
      '.ps-ls-dot{width:8px;height:8px;border-radius:50%;background:#334155;transition:background .15s,transform .15s;cursor:pointer;flex-shrink:0}',
      '.ps-ls-dot.done{background:var(--jhncc-red,#b01c23)}',
      '.ps-ls-dot.cur{background:var(--jhncc-yellow,#f5ba29);transform:scale(1.35)}',
      '.ps-ls-text{font-size:13px;color:#94a3b8;line-height:1.65;margin:0}',
      '.ps-ls-text strong{color:#e2e8f0}',
      '.ps-ls-text em{color:#cbd5e1}',
      '.ps-ls-text code{background:#0f172a;padding:1px 5px;border-radius:3px;font-family:"Courier New",monospace;font-size:12px;color:#a78bfa}',
      '.ps-ls-text br+code{display:inline-block;margin-top:3px}',

      // Stage
      '.ps-ls-stage{position:relative;background:#000;line-height:0}',
      '.ps-ls-frame{display:block;width:100%;border:none}',
      '.ps-ls-blocker{position:absolute;inset:0;z-index:10;background:transparent;cursor:default}',
      '.ps-ls-blocker.hidden{display:none}',
      '.ps-ls-badge{position:absolute;top:10px;right:10px;z-index:11;background:rgba(15,23,42,.82);color:#94a3b8;font-size:10px;padding:3px 9px;border-radius:99px;pointer-events:none;font-family:"Segoe UI",system-ui,sans-serif;letter-spacing:.04em;border:1px solid #334155}',
      '.ps-ls-badge.hidden{display:none}',

      // Validation hint bar
      '.ps-ls-hint{padding:8px 14px;background:#450a0a;border-top:1px solid #7f1d1d;display:flex;align-items:center;gap:8px}',
      '.ps-ls-hint.hidden{display:none}',
      '.ps-ls-hint-text{font-size:12px;color:#fca5a5;font-family:"Segoe UI",system-ui,sans-serif;line-height:1.4}',
      '.ps-ls-hint-text::before{content:"⚠ "}',

      // Nav
      '.ps-ls-nav{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#1e293b;border-top:1px solid #0f172a}',
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── createStepper ───────────────────────────────────────────────────────────
  function createStepper(opts) {
    _injectStyles();

    var el = document.getElementById(opts.containerId);
    if (!el) { console.warn('[PyScratchLesson] container not found:', opts.containerId); return; }

    var steps       = opts.steps || [];
    var defaultHide = opts.defaultHide || [];
    var iframeH     = opts.height || 560;
    var idx         = 0;
    var iframeReady = false;
    var completed   = false;

    // Live state received from the iframe via PS_STATE postMessage
    var currentState = { threads: {} };

    // ── DOM ──────────────────────────────────────────────────────────────────
    el.innerHTML =
      '<div class="ps-ls-wrap">' +
        '<div class="ps-ls-info">' +
          '<div class="ps-ls-info-row">' +
            '<span class="ps-ls-title"></span>' +
            '<span class="ps-ls-pill"></span>' +
          '</div>' +
          '<div class="ps-ls-dots"></div>' +
          '<p class="ps-ls-text"></p>' +
        '</div>' +
        '<div class="ps-ls-stage">' +
          '<iframe class="ps-ls-frame" sandbox="allow-scripts allow-same-origin"' +
            ' style="height:' + iframeH + 'px"></iframe>' +
          '<div class="ps-ls-blocker"></div>' +
          '<div class="ps-ls-badge">👁 View only</div>' +
        '</div>' +
        '<div class="ps-ls-hint hidden">' +
          '<span class="ps-ls-hint-text"></span>' +
        '</div>' +
        '<div class="ps-ls-nav">' +
          '<button class="ex-btn ps-ls-prev">← Previous</button>' +
          '<span class="ps-ls-pill ps-ls-nav-pill"></span>' +
          '<button class="ex-btn ps-ls-next">Next →</button>' +
        '</div>' +
      '</div>';

    var frameEl   = el.querySelector('.ps-ls-frame');
    var blockerEl = el.querySelector('.ps-ls-blocker');
    var badgeEl   = el.querySelector('.ps-ls-badge');
    var titleEl   = el.querySelector('.ps-ls-title');
    var pillEl    = el.querySelector('.ps-ls-pill');
    var navPill   = el.querySelector('.ps-ls-nav-pill');
    var dotsEl    = el.querySelector('.ps-ls-dots');
    var textEl    = el.querySelector('.ps-ls-text');
    var hintEl    = el.querySelector('.ps-ls-hint');
    var hintText  = el.querySelector('.ps-ls-hint-text');
    var prevBtn   = el.querySelector('.ps-ls-prev');
    var nextBtn   = el.querySelector('.ps-ls-next');

    // ── postMessage helpers ───────────────────────────────────────────────────
    function send(msg) {
      try { if (frameEl.contentWindow) frameEl.contentWindow.postMessage(msg, '*'); }
      catch(e) {}
    }

    // ── Validation ───────────────────────────────────────────────────────────
    function validateStep(step) {
      var req = step.requires;
      if (!req) return { valid: true };

      // Thread names check
      if (req.threads) {
        var allNames = [];
        Object.keys(currentState.threads || {}).forEach(function(sp) {
          (currentState.threads[sp] || []).forEach(function(t) {
            allNames.push((t.name || '').toLowerCase().trim());
          });
        });
        var missing = req.threads.filter(function(n) {
          return allNames.indexOf(n.toLowerCase().trim()) === -1;
        });
        if (missing.length) {
          return {
            valid: false,
            hint: step.requiresHint ||
              'You need thread' + (missing.length > 1 ? 's' : '') + ' named: ' +
              missing.map(function(n) { return '"' + n + '"'; }).join(' and ')
          };
        }
      }

      // Code content check: { threadName: ['substr', ...] }
      if (req.codeContains) {
        var allThreads = [];
        Object.keys(currentState.threads || {}).forEach(function(sp) {
          (currentState.threads[sp] || []).forEach(function(t) { allThreads.push(t); });
        });
        var errors = [];
        Object.keys(req.codeContains).forEach(function(tName) {
          var thread = null;
          for (var i = 0; i < allThreads.length; i++) {
            if ((allThreads[i].name || '').toLowerCase().trim() === tName.toLowerCase().trim()) {
              thread = allThreads[i]; break;
            }
          }
          if (!thread) { errors.push('Thread "' + tName + '" not found'); return; }
          var code = thread.code || '';
          (req.codeContains[tName] || []).forEach(function(substr) {
            if (code.indexOf(substr) === -1) {
              errors.push('<code>' + substr + '</code> missing from "' + tName + '"');
            }
          });
        });
        if (errors.length) {
          return {
            valid: false,
            hint: step.requiresHint || errors.join(' · ')
          };
        }
      }

      return { valid: true };
    }

    function showHint(html) {
      hintText.innerHTML = html;
      hintEl.classList.remove('hidden');
    }
    function clearHint() {
      hintEl.classList.add('hidden');
      hintText.innerHTML = '';
    }

    // ── Render ───────────────────────────────────────────────────────────────
    function applyStep() {
      var step = steps[idx];
      clearHint();

      // Text / header
      titleEl.textContent = step.title || '';
      textEl.innerHTML    = step.text  || '';
      pillEl.textContent  = 'Step ' + (idx + 1) + ' of ' + steps.length;
      navPill.textContent = pillEl.textContent;

      // Progress dots
      dotsEl.innerHTML = steps.map(function(_, i) {
        var cls = 'ps-ls-dot' +
          (i === idx ? ' cur'  : '') +
          (i < idx   ? ' done' : '');
        return '<span class="' + cls + '" data-i="' + i + '" title="Step ' + (i + 1) + '"></span>';
      }).join('');
      dotsEl.querySelectorAll('.ps-ls-dot').forEach(function(dot) {
        dot.onclick = function() { idx = parseInt(dot.dataset.i, 10); applyStep(); };
      });

      // Buttons
      prevBtn.disabled    = idx === 0;
      nextBtn.disabled    = false;
      nextBtn.textContent = idx === steps.length - 1 ? 'Finish ✓' : 'Next →';

      // Interactivity
      var isInteractive = !!step.interactive;
      blockerEl.classList.toggle('hidden', isInteractive);
      badgeEl.classList.toggle('hidden',   isInteractive);

      // postMessages
      if (iframeReady) {
        // UI visibility: clear previous state, then apply defaultHide, then step overrides
        send({ type: 'PS_CLEAR_UI' });
        var toHide = defaultHide.concat(step.hide || []);
        var toShow = step.show || [];
        toShow.forEach(function(n) {
          var i = toHide.indexOf(n);
          if (i !== -1) toHide.splice(i, 1);
        });
        if (toHide.length) send({ type: 'PS_HIDE', elements: toHide });

        // Highlight
        if (step.highlight) {
          send({ type: 'PS_HIGHLIGHT', target: step.highlight,
                 label: step.highlightLabel || '' });
        } else {
          send({ type: 'PS_HIGHLIGHT_CLEAR' });
        }

        // Run / stop
        if (step.autoRun) {
          send({ type: 'PS_RUN' });
        } else if (!isInteractive && step.autoStop !== false) {
          send({ type: 'PS_STOP' });
        }

        // Ask for latest state so validation is up-to-date
        send({ type: 'PS_GET_STATE' });
      }
    }

    // ── iframe load ───────────────────────────────────────────────────────────
    var baseSrc = '../scratch/editor.html?pyscratch=1' +
      (opts.projectUrl ? '&project_url=' + encodeURIComponent(opts.projectUrl) : '');

    frameEl.addEventListener('load', function() {
      setTimeout(function() {
        iframeReady = true;
        applyStep();
        send({ type: 'PS_GET_STATE' });
      }, 2200);
    });
    frameEl.src = baseSrc;

    // ── Listen for PS_STATE from the iframe ───────────────────────────────────
    function onMessage(e) {
      if (!e.data || e.data.type !== 'PS_STATE') return;
      // Ignore messages not from our iframe
      try { if (e.source !== frameEl.contentWindow) return; } catch(_) {}
      currentState = e.data;
    }
    window.addEventListener('message', onMessage);

    // ── Navigation ────────────────────────────────────────────────────────────
    function tryAdvance() {
      if (completed) return;
      if (idx < steps.length - 1) {
        var check = validateStep(steps[idx]);
        if (!check.valid) { showHint(check.hint); return; }
        clearHint();
        idx++;
        applyStep();
      } else {
        var finalCheck = validateStep(steps[idx]);
        if (!finalCheck.valid) { showHint(finalCheck.hint); return; }
        if (opts.completeOnEnd !== false) {
          completed = true;
          nextBtn.textContent = 'Complete ✓';
          nextBtn.disabled    = true;
          window.__markStepComplete && window.__markStepComplete();
        }
      }
    }

    prevBtn.onclick = function() {
      if (idx > 0) { clearHint(); idx--; applyStep(); }
    };
    nextBtn.onclick = tryAdvance;

    // Arrow-key nav on info / nav areas (outside the iframe)
    function onKey(e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        tryAdvance(); e.preventDefault();
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') && idx > 0) {
        clearHint(); idx--; applyStep(); e.preventDefault();
      }
    }
    el.querySelector('.ps-ls-info').setAttribute('tabindex', '0');
    el.querySelector('.ps-ls-nav' ).setAttribute('tabindex', '0');
    el.querySelector('.ps-ls-info').addEventListener('keydown', onKey);
    el.querySelector('.ps-ls-nav' ).addEventListener('keydown', onKey);

    applyStep(); // initial render (no postMessages yet)
  }

  return { createStepper: createStepper };
})();
