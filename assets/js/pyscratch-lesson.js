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
 *   height        {number?}   iframe height px (default 520)
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
      // Outer shell
      '.ps-ls-wrap{border-radius:8px;overflow:hidden;border:1px solid #1e293b;' +
        'background:#0f172a;font-family:"Segoe UI",system-ui,sans-serif}',

      // ── Header bar: single compact row ───────────────────────────────────
      '.ps-ls-head{display:flex;align-items:center;gap:10px;' +
        'padding:8px 14px;background:#1e293b;border-bottom:1px solid #0f172a;' +
        'flex-wrap:wrap}',
      '.ps-ls-title{font-size:13px;font-weight:700;color:#f1f5f9;flex:1;min-width:0;' +
        'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.ps-ls-pill{font-size:10px;color:#64748b;white-space:nowrap;flex-shrink:0}',
      '.ps-ls-dots{display:flex;gap:5px;align-items:center;flex-shrink:0}',
      '.ps-ls-dot{width:7px;height:7px;border-radius:50%;background:#334155;' +
        'transition:background .15s,transform .15s;cursor:pointer;flex-shrink:0}',
      '.ps-ls-dot.done{background:var(--jhncc-red,#b01c23)}',
      '.ps-ls-dot.cur{background:var(--jhncc-yellow,#f5ba29);transform:scale(1.35)}',

      // ── Instruction text — collapsible/scrollable ─────────────────────────
      '.ps-ls-body{padding:8px 14px;background:#1e293b;border-bottom:1px solid #0f172a;' +
        'max-height:110px;overflow-y:auto}',
      '.ps-ls-text{font-size:12.5px;color:#94a3b8;line-height:1.6;margin:0}',
      '.ps-ls-text strong{color:#e2e8f0}',
      '.ps-ls-text em{color:#cbd5e1}',
      '.ps-ls-text code{background:#0f172a;padding:1px 4px;border-radius:3px;' +
        'font-family:"Courier New",monospace;font-size:11.5px;color:#a78bfa}',
      '.ps-ls-text pre{margin:6px 0;white-space:pre;overflow-x:auto;' +
        'font-family:"Courier New",monospace;line-height:1.5}',

      // ── Stage (iframe fills full width) ───────────────────────────────────
      '.ps-ls-stage{position:relative;background:#000;line-height:0}',
      '.ps-ls-frame{display:block;width:100%;border:none}',
      '.ps-ls-blocker{position:absolute;inset:0;z-index:10;background:transparent;cursor:default}',
      '.ps-ls-blocker.hidden{display:none}',
      '.ps-ls-badge{position:absolute;top:8px;right:8px;z-index:11;' +
        'background:rgba(15,23,42,.82);color:#94a3b8;font-size:10px;padding:2px 8px;' +
        'border-radius:99px;pointer-events:none;font-family:"Segoe UI",system-ui,sans-serif;' +
        'letter-spacing:.04em;border:1px solid #334155}',
      '.ps-ls-badge.hidden{display:none}',

      // ── Bottom bar: validation hint + nav in one strip ────────────────────
      '.ps-ls-foot{display:flex;align-items:center;justify-content:space-between;' +
        'padding:6px 10px;background:#1e293b;border-top:1px solid #0f172a;gap:8px}',
      '.ps-ls-hint-text{font-size:11.5px;color:#fca5a5;flex:1;min-width:0;' +
        'font-family:"Segoe UI",system-ui,sans-serif;line-height:1.35}',
      '.ps-ls-hint-text::before{content:"⚠ "}',
      '.ps-ls-hint-text.hidden{display:none}',
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
    var iframeH     = opts.height || 520;
    var idx         = 0;
    var iframeReady = false;
    var completed   = false;

    // Live state received from the iframe via PS_STATE postMessage
    var currentState = { threads: {} };

    // ── DOM ──────────────────────────────────────────────────────────────────
    el.innerHTML =
      '<div class="ps-ls-wrap">' +
        // ── Compact header row: title | dots | pill ──
        '<div class="ps-ls-head">' +
          '<span class="ps-ls-title"></span>' +
          '<div class="ps-ls-dots"></div>' +
          '<span class="ps-ls-pill"></span>' +
        '</div>' +
        // ── Instruction text ──
        '<div class="ps-ls-body">' +
          '<p class="ps-ls-text"></p>' +
        '</div>' +
        // ── iframe ──
        '<div class="ps-ls-stage">' +
          '<iframe class="ps-ls-frame"' +
            ' sandbox="allow-scripts allow-same-origin allow-modals"' +
            ' style="height:' + iframeH + 'px"></iframe>' +
          '<div class="ps-ls-blocker"></div>' +
          '<div class="ps-ls-badge">👁 View only</div>' +
        '</div>' +
        // ── Bottom strip: hint + nav ──
        '<div class="ps-ls-foot">' +
          '<button class="ex-btn ps-ls-prev">← Prev</button>' +
          '<span class="ps-ls-hint-text hidden"></span>' +
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

      // Thread position check: { '0': 'movement', '1': 'animation' }
      // Verifies that threads at specific list positions have specific names.
      // At least one sprite must satisfy ALL position requirements.
      if (req.threadAtPosition) {
        var spriteNames = Object.keys(currentState.threads || {});
        var posOk = spriteNames.some(function(sp) {
          var list = currentState.threads[sp] || [];
          return Object.keys(req.threadAtPosition).every(function(pos) {
            var t = list[parseInt(pos, 10)];
            return t && (t.name || '').toLowerCase().trim() ===
                        req.threadAtPosition[pos].toLowerCase().trim();
          });
        });
        if (!posOk) {
          // Build a helpful message from the first sprite's actual state
          var sp0   = spriteNames[0] || '';
          var list0 = currentState.threads[sp0] || [];
          var msgs  = [];
          Object.keys(req.threadAtPosition).forEach(function(pos) {
            var expected = req.threadAtPosition[pos];
            var t = list0[parseInt(pos, 10)];
            var actual = t ? (t.name || '(unnamed)') : '(missing)';
            if (actual.toLowerCase().trim() !== expected.toLowerCase().trim()) {
              msgs.push('Thread ' + (parseInt(pos, 10) + 1) +
                        ' should be named <code>' + expected + '</code>' +
                        ' (currently <em>' + actual + '</em>)');
            }
          });
          return { valid: false,
            hint: step.requiresHint || (msgs.join(' · ') + '.') };
        }
      }

      // Thread count check: exact number of threads across all sprites
      if (req.threadCount !== undefined) {
        var total = 0;
        Object.keys(currentState.threads || {}).forEach(function(sp) {
          total += (currentState.threads[sp] || []).length;
        });
        if (total < req.threadCount) {
          return { valid: false,
            hint: step.requiresHint || 'Click the + button to add a new thread.' };
        }
        if (total > req.threadCount) {
          return { valid: false,
            hint: 'You have ' + total + ' threads but need exactly ' + req.threadCount +
                  '. Use the ✕ button to delete the extra ones.' };
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
      hintText.classList.remove('hidden');
    }
    function clearHint() {
      hintText.classList.add('hidden');
      hintText.innerHTML = '';
    }

    // ── Render ───────────────────────────────────────────────────────────────
    function applyStep() {
      var step = steps[idx];
      clearHint();

      // Header
      titleEl.textContent = step.title || '';
      pillEl.textContent  = 'Step ' + (idx + 1) + ' of ' + steps.length;
      navPill.textContent = pillEl.textContent;

      // Text
      textEl.innerHTML = step.text || '';

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
      badgeEl.textContent = '👁 View only';   // reset before any auto-lock may override it
      badgeEl.classList.toggle('hidden',   isInteractive);

      // postMessages (only once iframe has booted)
      if (iframeReady) {
        send({ type: 'PS_CLEAR_UI' });
        var toHide = defaultHide.concat(step.hide || []);
        var toShow = step.show || [];
        toShow.forEach(function(n) {
          var i = toHide.indexOf(n);
          if (i !== -1) toHide.splice(i, 1);
        });
        if (toHide.length) send({ type: 'PS_HIDE', elements: toHide });

        // Force pencil/delete buttons visible before highlighting them
        // (they are display:none by default and only appear on hover).
        if (step.showThreadActions) {
          send({ type: 'PS_SHOW_THREAD_ACTIONS' });
        } else {
          send({ type: 'PS_HIDE_THREAD_ACTIONS' });
        }

        // Thread lock: auto-select the correct thread and dim others.
        if (step.lockThread) {
          send({ type: 'PS_SELECT_THREAD', name: step.lockThread, lock: true });
        } else {
          send({ type: 'PS_UNLOCK_THREADS' });
        }

        if (step.highlight) {
          send({ type: 'PS_HIGHLIGHT', target: step.highlight,
                 label: step.highlightLabel || '' });
        } else {
          send({ type: 'PS_HIGHLIGHT_CLEAR' });
        }

        if (step.autoRun) {
          send({ type: 'PS_RUN' });
        } else if (!isInteractive && step.autoStop !== false) {
          send({ type: 'PS_STOP' });
        }

        send({ type: 'PS_GET_STATE' });
      }
    }

    // ── iframe load ───────────────────────────────────────────────────────────
    var baseSrc = './scratch/editor.html?pyscratch=1' +
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
      try { if (e.source !== frameEl.contentWindow) return; } catch(_) {}
      currentState = e.data;

      // autoLockOnDone: when the step's requirements are satisfied, immediately
      // remove the highlight and block the iframe so students can only click Next.
      var step = steps[idx];
      if (step && step.autoLockOnDone && step.interactive) {
        var check = validateStep(step);
        if (check.valid) {
          clearHint();
          send({ type: 'PS_HIGHLIGHT_CLEAR' });
          send({ type: 'PS_HIDE_THREAD_ACTIONS' });
          blockerEl.classList.remove('hidden');
          badgeEl.textContent = step.doneBadge || '✓ Done — click Next →';
          badgeEl.classList.remove('hidden');
        }
      }
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

    // Arrow-key nav — works when focus is anywhere on the stepper except inside the iframe
    el.setAttribute('tabindex', '0');
    el.addEventListener('keydown', function(e) {
      if (e.target === frameEl || frameEl.contains(e.target)) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        tryAdvance(); e.preventDefault();
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') && idx > 0) {
        clearHint(); idx--; applyStep(); e.preventDefault();
      }
    });

    applyStep(); // initial render (iframe not ready yet — no postMessages)
  }

  return { createStepper: createStepper };
})();
