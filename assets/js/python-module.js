// ════════════════════════════════════════════════════════════════
//  window.PyLearn  —  Skulpt-powered Python runner + editor factory
//
//  Lesson JS has access to this global for all Python execution.
//
//  API:
//    PyLearn.runPython(code, [inputFn])
//      → Promise<{ output: string, error: string|null }>
//
//    PyLearn.createEditor(options)
//      options {
//        containerId  : string   – id of the <div> to mount inside
//        initialCode  : string   – starter code shown in editor
//        label        : string   – header label (default "Python Editor")
//        readOnly     : bool     – lock the textarea
//        showOutput   : bool     – show output panel (default true)
//        validate     : async (output, error, code)
//                         => { pass: bool, message: string } | null
//        onPass       : async () => void  – called when validate passes
//      }
//      → { getCode(), setCode(str), run() }
// ════════════════════════════════════════════════════════════════
window.PyLearn = (() => {

  // ── Core runner ─────────────────────────────────────────────
  // opts:
  //   onOutput?(text)     — called live as Python prints
  //   inputs?: string[]   — pre-supplied answers for input() calls (validator mode)
  //                         Prepends a Python input() shim — prompts never hit stdout
  //   inputFn?(p)->str    — legacy / live keyboard handler (no prompt suppression)
  //
  // Returns { output, error }
  // When opts.inputs is supplied, output contains ONLY print() text.
  function runPython(code, opts) {
    // Back-compat: bare function as second arg → live inputFn
    if (typeof opts === 'function') opts = { inputFn: opts };
    opts = opts || {};

    const onOutput = opts.onOutput || null;

    // ── Validator mode: inputs array ──────────────────────────
    // Prepend a Python input() shim that returns answers from a list.
    // Skulpt's built-in input() is never called, so nothing touches stdout.
    if (Array.isArray(opts.inputs)) {
      var pyList = '[' + opts.inputs.map(function(s) {
        // Escape backslashes and single quotes for safe embedding in Python string
        return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
      }).join(', ') + ']';

      var shim = (
        '_pylearn_answers = ' + pyList + '\n' +
        '_pylearn_idx = [0]\n' +
        'def input(prompt=""):\n' +
        '    i = _pylearn_idx[0]\n' +
        '    _pylearn_idx[0] = i + 1\n' +
        '    if i < len(_pylearn_answers):\n' +
        '        return _pylearn_answers[i]\n' +
        '    return ""\n' +
        '\n'
      );

      return new Promise(function(resolve) {
        var output = '';
        Sk.configure({
          output: function(text) {
            output += text;
            if (onOutput) onOutput(text);
          },
          read: function(file) {
            if (!Sk.builtinFiles || !Sk.builtinFiles.files[file])
              throw new Error("File not found: '" + file + "'");
            return Sk.builtinFiles.files[file];
          },
          inputfun: function() { return Promise.resolve(''); },
          inputfunTakesPromise: true,
          execLimit: opts.execLimit || 5000,
        });
        Sk.misceval.asyncToPromise(
          function() { return Sk.importMainWithBody('<stdin>', false, shim + code, true); }
        ).then(
          function()    { resolve({ output: output, error: null }); },
          function(err) { resolve({ output: output, error: err.toString() }); }
        );
      });
    }

    // ── Live / inputFn mode ───────────────────────────────────
    // Used for the interactive editor (user types) or legacy single-answer inputFn.
    // Prompts appear in output — do not use for output comparison.
    var liveFn = opts.inputFn || function() { return Promise.resolve(''); };
    return new Promise(function(resolve) {
      var output = '';
      Sk.configure({
        output: function(text) {
          output += text;
          if (onOutput) onOutput(text);
        },
        read: function(file) {
          if (!Sk.builtinFiles || !Sk.builtinFiles.files[file])
            throw new Error("File not found: '" + file + "'");
          return Sk.builtinFiles.files[file];
        },
          inputfun: liveFn,
          inputfunTakesPrompt: true,
          inputfunTakesPromise: true,
          execLimit: opts.execLimit || 10000,
      });
      Sk.misceval.asyncToPromise(
        function() { return Sk.importMainWithBody('<stdin>', false, code, true); }
      ).then(
        function()    { resolve({ output: output, error: null }); },
        function(err) { resolve({ output: output, error: err.toString() }); }
      );
    });
  }

  // ── Editor factory ───────────────────────────────────────────
  function createEditor(opts) {
    opts = opts || {};
    const containerId = opts.containerId;
    const initialCode = opts.initialCode || '';
    const label       = opts.label       || 'Python Editor';
    const readOnly    = opts.readOnly    || false;
    const showOutput  = opts.showOutput  !== false;
    const validate    = opts.validate    || null;
    const onPass      = opts.onPass      || null;
    const persist     = opts.persist     !== false;  // Save code to localStorage by default

    const container = document.getElementById(containerId);
    if (!container) {
      console.error('PyLearn.createEditor: #' + containerId + ' not found');
      return null;
    }

    // Build markup
    const uid = containerId;

    // Storage key — saves student's code per step so it persists across navigation
    var storageKey = null;
    if (persist) {
      try {
        var lid = window.__pylearnCurrentLessonId;
        var sid = window.__pylearnCurrentStepId;
        if (lid && sid) {
          storageKey = 'pylearn_code:' + lid + ':' + sid + ':' + containerId;
        }
      } catch(e) {}
    }

    // Try to load previously saved code for this editor
    var startingCode = initialCode;
    if (storageKey) {
      try {
        var saved = localStorage.getItem(storageKey);
        if (saved !== null) startingCode = saved;
      } catch(e) {}
    }

    container.innerHTML =
      '<div class="pylearn-editor-wrap">' +
        '<div class="pylearn-editor-header">' +
          '<span>&#x1F40D; ' + label + '</span>' +
          '<span class="pylearn-header-tools">' +
            (storageKey && !readOnly ? '<button class="pylearn-btn-reset" id="' + uid + '-reset" title="Reset to starter code">&#x21BA; Reset</button>' : '') +
            '<span class="pylearn-status" id="' + uid + '-status">ready</span>' +
          '</span>' +
        '</div>' +
        '<textarea id="' + uid + '-code" class="pylearn-code-area"' +
          (readOnly ? ' readonly' : '') +
          ' spellcheck="false">' + escHtml(startingCode) + '</textarea>' +
        (showOutput
          ? '<div class="pylearn-output-area" id="' + uid + '-output" tabindex="0">Output will appear here\u2026</div>'
          : '') +
        '<div class="pylearn-toolbar">' +
          '<button class="pylearn-btn-run" id="' + uid + '-run">&#9654; Run</button>' +
          (showOutput ? '<button class="pylearn-btn-clear" id="' + uid + '-clear">Clear</button>' : '') +
        '</div>' +
      '</div>' +
      '<div id="' + uid + '-feedback"></div>';

    const textarea   = document.getElementById(uid + '-code');
    const statusEl   = document.getElementById(uid + '-status');
    const outputEl   = showOutput ? document.getElementById(uid + '-output') : null;
    const runBtn     = document.getElementById(uid + '-run');
    const clearBtn   = showOutput ? document.getElementById(uid + '-clear') : null;
    const resetBtn   = (storageKey && !readOnly) ? document.getElementById(uid + '-reset') : null;
    const feedbackEl = document.getElementById(uid + '-feedback');

    // Auto-size: minimum 8 lines; if code is longer, grow to fit (cap 20 lines)
    var lineCount = (startingCode.match(/\n/g) || []).length + 1;
    var lines = Math.min(Math.max(lineCount + 2, 8), 20);
    textarea.style.height = (lines * 1.6) + 'rem';

    // Save on every keystroke
    if (storageKey) {
      textarea.addEventListener('input', function() {
        try { localStorage.setItem(storageKey, textarea.value); } catch(e) {}
      });
    }

    // Reset button: restore original starter code
    if (resetBtn) {
      resetBtn.onclick = function() {
        if (!confirm('Reset your code to the starting code? Your changes will be lost.')) return;
        textarea.value = initialCode;
        try { localStorage.removeItem(storageKey); } catch(e) {}
        if (outputEl) { outputEl.textContent = 'Output will appear here\u2026'; outputEl.classList.remove('has-error'); }
        feedbackEl.innerHTML = '';
        // Re-size textarea for the original code
        var lc = (initialCode.match(/\n/g) || []).length + 1;
        var ln = Math.min(Math.max(lc + 2, 8), 20);
        textarea.style.height = (ln * 1.6) + 'rem';
      };
    }

    // Tab key → 4 spaces
    textarea.addEventListener('keydown', function(e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        var s = textarea.selectionStart, v = textarea.value;
        textarea.value = v.substring(0, s) + '    ' + v.substring(textarea.selectionEnd);
        textarea.selectionStart = textarea.selectionEnd = s + 4;
        // Trigger save
        if (storageKey) { try { localStorage.setItem(storageKey, textarea.value); } catch(e) {} }
      }
    });

    // Tell the Next button that this step has an editor (so it requires Run before completing)
    if (typeof window.__pylearnStepHasEditor !== 'undefined') {
      window.__pylearnStepHasEditor = true;
    }

    if (clearBtn) {
      clearBtn.onclick = function() {
        if (outputEl) { outputEl.textContent = ''; outputEl.classList.remove('has-error'); }
        feedbackEl.innerHTML = '';
        setStatus('', 'ready');
      };
    }

    function setStatus(type, msg) {
      statusEl.className = 'pylearn-status' + (type ? ' ' + type : '');
      statusEl.textContent = msg;
    }

    function showFeedback(type, msg) {
      feedbackEl.innerHTML = '<div class="pylearn-feedback ' + type + '">' + escHtml(msg) + '</div>';
    }

    runBtn.onclick = async function() {
      // Signal that the student has run the code on this step
      if (typeof window.__pylearnStepRan !== 'undefined') {
        window.__pylearnStepRan = true;
      }
      var code = textarea.value;
      runBtn.disabled = true;
      setStatus('run', 'running\u2026');
      if (outputEl) {
        outputEl.textContent = '';
        outputEl.classList.remove('has-error');
      }
      feedbackEl.innerHTML = '';

      // Live output streaming: append each chunk to the output element as it arrives
      var liveText = '';
      var onOutput = outputEl ? function(text) {
        liveText += text;
        outputEl.textContent = liveText;
        outputEl.scrollTop = outputEl.scrollHeight;
      } : null;

      // Live input: when Python calls input(prompt), show the prompt and let the
      // user type into the output area until they press Enter.
      var liveInputFn = outputEl ? function(prompt) {
        return new Promise(function(resolve) {
          // Show prompt as part of the output (prompt has no trailing newline)
          var promptText = prompt || '';
          if (promptText && liveText && !liveText.endsWith('\n')) liveText += '\n';
          liveText += promptText;
          outputEl.textContent = liveText;

          // Track what the user is typing (highlighted at the end of output)
          var typed = '';
          var promptLen = liveText.length;
          var previousTabIndex = outputEl.getAttribute('tabindex');
          outputEl.setAttribute('tabindex', '0');

          function render() {
            // Show the live output + a visual cursor
            outputEl.textContent = liveText.substring(0, promptLen) + typed + '\u2588';
            outputEl.scrollTop = outputEl.scrollHeight;
          }

          function onKeyDown(e) {
            if (e.__pylearnInputHandled) return;
            e.__pylearnInputHandled = true;
            // Don't capture keys typed in inputs/textareas elsewhere
            var t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
            if (e.key === 'Enter') {
              e.preventDefault();
              outputEl.removeEventListener('keydown', onKeyDown);
              document.removeEventListener('keydown', onKeyDown, true);
              outputEl.classList.remove('pylearn-output-listening');
              if (previousTabIndex === null) outputEl.removeAttribute('tabindex');
              else outputEl.setAttribute('tabindex', previousTabIndex);
              // Commit: append the typed text + newline to liveText
              liveText = liveText.substring(0, promptLen) + typed + '\n';
              outputEl.textContent = liveText;
              outputEl.scrollTop = outputEl.scrollHeight;
              resolve(typed);
            } else if (e.key === 'Backspace') {
              e.preventDefault();
              typed = typed.slice(0, -1);
              render();
            } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
              // printable character
              e.preventDefault();
              typed += e.key;
              render();
            }
          }

          outputEl.classList.add('pylearn-output-listening');
          // Move focus away from the code textarea so keystrokes hit our handler
          outputEl.focus();
          render();
          outputEl.addEventListener('keydown', onKeyDown);
          document.addEventListener('keydown', onKeyDown, true);
        });
      } : null;

      // If caller provided an explicit inputFn override, prefer that (used by validators)
      var effectiveInputFn = (typeof runBtn._inputFnOverride === 'function')
        ? runBtn._inputFnOverride
        : liveInputFn;

      var result = await runPython(code, {
        onOutput: onOutput,
        inputFn: effectiveInputFn,
      });

      if (outputEl) {
        // Final state
        if (result.error) {
          outputEl.textContent = (liveText || '') + (liveText && !liveText.endsWith('\n') ? '\n' : '') + result.error;
          outputEl.classList.add('has-error');
        } else if (!liveText) {
          outputEl.textContent = '(no output)';
        }
      }

      setStatus(result.error ? 'err' : 'ok', result.error ? 'error' : 'done');

      if (validate) {
        try {
          var fb = await validate(result.output, result.error, code);
          if (fb) {
            showFeedback(fb.pass ? 'pass' : 'fail', fb.message);
            if (fb.pass && onPass) await onPass();
          }
        } catch(ve) { console.error('Validation error:', ve); }
      }

      runBtn.disabled = false;
    };

    return {
      getCode: function()  { return textarea.value; },
      setCode: function(c) {
        textarea.value = c;
        if (storageKey) { try { localStorage.setItem(storageKey, c); } catch(e) {} }
      },
      run:     function()  { runBtn.click(); },
      // Set a function to provide input() answers automatically instead of asking the user.
      // Pass null to restore live keyboard input. Useful for demos where the answer is fixed.
      setInputFn: function(fn) { runBtn._inputFnOverride = fn || null; },
    };
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { runPython, createEditor };
})();
