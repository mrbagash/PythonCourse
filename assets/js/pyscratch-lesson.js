/**
 * pyscratch-lesson.js
 * Lesson integration utilities for PyScratch.
 *
 * Exposes window.PyScratchLesson with:
 *
 *   PyScratchLesson.createStepper(opts)
 *     Embeds a PyScratch iframe with a guided step-through overlay.
 *     Arrow keys / Prev-Next buttons move between sub-steps.
 *     Each step can be interactive or read-only (blocker + highlight).
 *
 * Used inside lesson JSON step `js` fields, exactly like BinaryLesson.createStepper.
 *
 * Example:
 *   PyScratchLesson.createStepper({
 *     containerId: 'ps-intro-1',
 *     projectUrl:  '../lessons/assets/threads-demo.psb3',
 *     height: 540,
 *     steps: [
 *       {
 *         title: 'Add a thread',
 *         text:  'See the <strong>Threads</strong> panel on the left. Click the <strong>+</strong> to add a new one.',
 *         interactive: false,
 *         highlight: 'threads',
 *         highlightLabel: 'Click + here',
 *       },
 *       {
 *         title: 'Name your threads',
 *         text:  'Click the pencil icon next to a thread to rename it.',
 *         interactive: false,
 *         highlight: 'threads',
 *       },
 *       {
 *         title: 'Try it yourself',
 *         text:  'Now add two threads and name them <strong>movement</strong> and <strong>animation</strong>.',
 *         interactive: true,
 *       },
 *     ],
 *   });
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
      // Outer wrapper — matches ex-box dark aesthetic
      '.ps-ls-wrap{border-radius:8px;overflow:hidden;border:1px solid #1e293b;background:#0f172a;font-family:"Segoe UI",system-ui,sans-serif}',

      // ── Info panel (top) ────────────────────────────────────────────────────
      '.ps-ls-info{padding:14px 18px 12px;background:#1e293b;border-bottom:1px solid #0f172a}',
      '.ps-ls-info-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}',
      '.ps-ls-title{font-size:15px;font-weight:700;color:#f1f5f9;line-height:1.3}',
      '.ps-ls-pill{font-size:11px;color:#64748b;white-space:nowrap;flex-shrink:0;margin-left:12px}',

      // Step dots
      '.ps-ls-dots{display:flex;gap:6px;margin-bottom:10px}',
      '.ps-ls-dot{width:8px;height:8px;border-radius:50%;background:#334155;' +
        'transition:background .15s,transform .15s;cursor:pointer;flex-shrink:0}',
      '.ps-ls-dot.done{background:var(--jhncc-red,#b01c23)}',
      '.ps-ls-dot.cur{background:var(--jhncc-yellow,#f5ba29);transform:scale(1.35)}',

      // Step text
      '.ps-ls-text{font-size:13px;color:#94a3b8;line-height:1.6;margin:0}',
      '.ps-ls-text strong{color:#e2e8f0}',
      '.ps-ls-text em{color:#cbd5e1}',
      '.ps-ls-text code{background:#0f172a;padding:1px 5px;border-radius:3px;' +
        'font-family:"Courier New",monospace;font-size:12px;color:#a78bfa}',

      // ── Stage area ─────────────────────────────────────────────────────────
      '.ps-ls-stage{position:relative;background:#000;line-height:0}',
      '.ps-ls-frame{display:block;width:100%;border:none}',

      // Transparent blocker — sits over the iframe when non-interactive
      '.ps-ls-blocker{position:absolute;inset:0;z-index:10;background:transparent;cursor:default}',
      '.ps-ls-blocker.hidden{display:none}',

      // Non-interactive badge shown in top-right of stage
      '.ps-ls-badge{position:absolute;top:10px;right:10px;z-index:11;background:rgba(15,23,42,.82);' +
        'color:#94a3b8;font-size:10px;padding:3px 9px;border-radius:99px;pointer-events:none;' +
        'font-family:"Segoe UI",system-ui,sans-serif;letter-spacing:.04em;border:1px solid #334155}',
      '.ps-ls-badge.hidden{display:none}',

      // ── Nav bar (bottom) ───────────────────────────────────────────────────
      '.ps-ls-nav{display:flex;align-items:center;justify-content:space-between;' +
        'padding:10px 14px;background:#1e293b;border-top:1px solid #0f172a}',
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── createStepper ───────────────────────────────────────────────────────────
  /**
   * opts:
   *   containerId  {string}   id of the target <div> in the lesson HTML
   *   projectUrl   {string?}  URL of a .psb3 file to load (optional)
   *   height       {number?}  iframe height in px (default 560)
   *   completeOnEnd {bool?}   mark lesson step complete on Finish (default true)
   *   steps        {Array}    sub-step definitions (see below)
   *
   * Each step:
   *   title          {string}   Bold header text
   *   text           {string}   Instruction HTML (supports <strong>, <code> etc.)
   *   interactive    {bool}     true = fully usable iframe; false = view-only with blocker
   *   highlight      {string?}  Named preset or CSS selector to highlight (see HIGHLIGHT_PRESETS)
   *   highlightLabel {string?}  Text label on the highlight box
   *   autoRun        {bool?}    Send PS_RUN when this step activates (default false)
   *   autoStop       {bool?}    Send PS_STOP when this step activates (default: true when non-interactive)
   */
  function createStepper(opts) {
    _injectStyles();

    var el = document.getElementById(opts.containerId);
    if (!el) { console.warn('[PyScratchLesson] container not found:', opts.containerId); return; }

    var steps = opts.steps || [];
    if (!steps.length) return;

    var iframeHeight = opts.height || 560;
    var idx          = 0;
    var iframeReady  = false;
    var completed    = false;

    // ── Build DOM ─────────────────────────────────────────────────────────────
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
            ' style="height:' + iframeHeight + 'px"></iframe>' +
          '<div class="ps-ls-blocker"></div>' +
          '<div class="ps-ls-badge">👁 View only</div>' +
        '</div>' +
        '<div class="ps-ls-nav">' +
          '<button class="ex-btn ps-ls-prev">← Previous</button>' +
          '<span class="ps-ls-pill ps-ls-nav-pill"></span>' +
          '<button class="ex-btn ps-ls-next">Next →</button>' +
        '</div>' +
      '</div>';

    var wrap      = el.querySelector('.ps-ls-wrap');
    var frameEl   = el.querySelector('.ps-ls-frame');
    var blockerEl = el.querySelector('.ps-ls-blocker');
    var badgeEl   = el.querySelector('.ps-ls-badge');
    var titleEl   = el.querySelector('.ps-ls-title');
    var pillEl    = el.querySelector('.ps-ls-pill');
    var navPill   = el.querySelector('.ps-ls-nav-pill');
    var dotsEl    = el.querySelector('.ps-ls-dots');
    var textEl    = el.querySelector('.ps-ls-text');
    var prevBtn   = el.querySelector('.ps-ls-prev');
    var nextBtn   = el.querySelector('.ps-ls-next');

    // ── postMessage helper ────────────────────────────────────────────────────
    function send(msg) {
      try { if (frameEl.contentWindow) frameEl.contentWindow.postMessage(msg, '*'); }
      catch (e) {}
    }

    // ── Render current step ───────────────────────────────────────────────────
    function applyStep() {
      var step = steps[idx];

      // Text / header
      titleEl.textContent = step.title || '';
      textEl.innerHTML    = step.text  || '';
      pillEl.textContent  = 'Step ' + (idx + 1) + ' of ' + steps.length;
      navPill.textContent = pillEl.textContent;

      // Dots
      dotsEl.innerHTML = steps.map(function (_, i) {
        var cls = 'ps-ls-dot' +
          (i === idx ? ' cur' : '') +
          (i < idx   ? ' done' : '');
        return '<span class="' + cls + '" data-step="' + i + '" title="Step ' + (i + 1) + '"></span>';
      }).join('');
      dotsEl.querySelectorAll('.ps-ls-dot').forEach(function (dot) {
        dot.onclick = function () {
          idx = parseInt(dot.dataset.step, 10);
          applyStep();
        };
      });

      // Buttons
      prevBtn.disabled    = idx === 0;
      nextBtn.disabled    = false;
      nextBtn.textContent = idx === steps.length - 1 ? 'Finish ✓' : 'Next →';

      // Interactivity
      var isInteractive = !!step.interactive;
      blockerEl.classList.toggle('hidden', isInteractive);
      badgeEl.classList.toggle('hidden',   isInteractive);

      // postMessages (only once the iframe is initialised)
      if (iframeReady) {
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
      }
    }

    // ── Load iframe ──────────────────────────────────────────────────────────
    var baseSrc = '../scratch/editor.html?pyscratch=1' +
      (opts.projectUrl ? '&project_url=' + encodeURIComponent(opts.projectUrl) : '');

    frameEl.addEventListener('load', function () {
      // PyScratch + TurboWarp need ~2 s after DOMContentLoaded to finish booting
      setTimeout(function () {
        iframeReady = true;
        applyStep();   // re-apply current step now that postMessages will land
      }, 2200);
    });
    frameEl.src = baseSrc;

    // ── Navigation ────────────────────────────────────────────────────────────
    prevBtn.onclick = function () {
      if (idx > 0) { idx--; applyStep(); }
    };

    nextBtn.onclick = function () {
      if (completed) return;
      if (idx < steps.length - 1) {
        idx++;
        applyStep();
      } else {
        if (opts.completeOnEnd !== false) {
          completed = true;
          nextBtn.textContent = 'Complete ✓';
          nextBtn.disabled = true;
          window.__markStepComplete && window.__markStepComplete();
        }
      }
    };

    // Arrow-key navigation on the info / nav areas (outside the iframe)
    function onKey(e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        if (idx < steps.length - 1) { idx++; applyStep(); e.preventDefault(); }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        if (idx > 0) { idx--; applyStep(); e.preventDefault(); }
      }
    }
    el.querySelector('.ps-ls-info').setAttribute('tabindex', '0');
    el.querySelector('.ps-ls-nav' ).setAttribute('tabindex', '0');
    el.querySelector('.ps-ls-info').addEventListener('keydown', onKey);
    el.querySelector('.ps-ls-nav' ).addEventListener('keydown', onKey);

    // Initial render (pre-iframe-ready: no postMessages yet, just DOM)
    applyStep();
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  return { createStepper: createStepper };
})();
