window.BinaryLesson = (() => {
  const POWERS = [128,64,32,16,8,4,2,1];
  const NIBBLE = [8,4,2,1,8,4,2,1];
  function esc(str) { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function bitsFromNumber(n) { return Number(n).toString(2).padStart(8,'0').split('').map(Number); }
  function bitTable(bits, headers, useNibbles) {
    headers = headers || (useNibbles ? NIBBLE : POWERS);
    var head = headers.map(function(h, i) { return '<th' + (useNibbles && i === 4 ? ' class="bb-nibble-gap"' : '') + '>' + h + '</th>'; }).join('');
    var cells = bits.map(function(b, i) { return '<td class="' + (b ? 'bb-on' : 'bb-off') + (useNibbles && i === 4 ? ' bb-nibble-gap' : '') + '">' + b + '</td>'; }).join('');
    return '<table class="bb-table"><thead><tr>' + head + '</tr></thead><tbody><tr>' + cells + '</tr></tbody></table>';
  }
  function computeCarries(aBits, bBits) {
    var c = [0,0,0,0,0,0,0,0];
    for (var i = 6; i >= 0; i--) {
      c[i] = Math.floor((aBits[i+1] + bBits[i+1] + c[i+1]) / 2);
    }
    return c;
  }
  function addTable(aBits, bBits, answerBits) {
    function row(label, arr) {
      return '<tr><td class="bb-add-label">' + label + '</td>' + arr.map(function(v) { return '<td class="' + (v === '?' ? '' : (v ? 'bb-on' : 'bb-off')) + '">' + v + '</td>'; }).join('') + '</tr>';
    }
    var carryRow = '';
    if (answerBits) {
      var carries = computeCarries(aBits, bBits);
      carryRow = '<tr><td class="bb-add-label bb-carry-cell">carry</td>' +
        carries.map(function(v) { return '<td class="bb-carry-cell">' + (v ? '1' : '') + '</td>'; }).join('') +
        '</tr>';
    }
    return '<table class="bb-table bb-add-table"><tbody>' + carryRow + row('', aBits) + row('+', bBits) + row('=', answerBits || ['?','?','?','?','?','?','?','?']) + '</tbody></table>';
  }
  function addTablePartial(aBits, bBits, ansPartial, carryPartial) {
    function aCell(b) { return '<td class="' + (b ? 'bb-on' : 'bb-off') + '">' + b + '</td>'; }
    function cCell(v) { return '<td class="bb-carry-cell">' + (v === 1 ? '1' : '') + '</td>'; }
    function aCell2(v) { return v === null ? '<td class="">?</td>' : '<td class="' + (v ? 'bb-on' : 'bb-off') + '">' + v + '</td>'; }
    return '<table class="bb-table bb-add-table"><tbody>' +
      '<tr><td class="bb-add-label bb-carry-cell">carry</td>' + carryPartial.map(cCell).join('') + '</tr>' +
      '<tr><td class="bb-add-label"></td>' + aBits.map(aCell).join('') + '</tr>' +
      '<tr><td class="bb-add-label">+</td>' + bBits.map(aCell).join('') + '</tr>' +
      '<tr><td class="bb-add-label">=</td>' + ansPartial.map(aCell2).join('') + '</tr>' +
      '</tbody></table>';
  }
  function normalise(value) { return String(value || '').trim().replace(/\s+/g,'').toUpperCase(); }

  // ── Interactive bit cells ─────────────────────────────────────
  // Attaches click/keyboard handlers to [data-i] cells inside el.
  // bits[] is updated in place; onChange() fired after each toggle.
  function bindBitCells(el, bits, onChange) {
    el.querySelectorAll('[data-i]').forEach(function(cell) {
      var i = parseInt(cell.dataset.i, 10);
      function setVal(v) {
        bits[i] = v;
        cell.textContent = v;
        var cls = 'bb-bit-btn ' + (v ? 'bb-on' : 'bb-off');
        if (cell.classList.contains('bb-nibble-gap')) cls += ' bb-nibble-gap';
        cell.className = cls;
        if (onChange) onChange();
      }
      cell.onclick = function() { setVal(bits[i] ? 0 : 1); };
      cell.onkeydown = function(e) {
        if (e.key === '0') { e.preventDefault(); setVal(0); }
        else if (e.key === '1') { e.preventDefault(); setVal(1); }
        else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setVal(bits[i] ? 0 : 1); }
        else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); el.querySelectorAll('[data-i]')[i - 1].focus(); }
        else if (e.key === 'ArrowRight' && i < bits.length - 1) { e.preventDefault(); el.querySelectorAll('[data-i]')[i + 1].focus(); }
      };
    });
  }

  // Mount an interactive 8-bit grid into el.
  // opts: { showTotal: bool }
  // Returns { getAnswer(), reset() }
  function mountBitInput(el, opts) {
    opts = opts || {};
    var bits = /^[01]{8}$/.test(String(opts.initialAnswer || '')) ? String(opts.initialAnswer).split('').map(Number) : [0,0,0,0,0,0,0,0];
    function calcValue() { return bits.reduce(function(s, b, i) { return s + b * POWERS[i]; }, 0); }
    function render() {
      var headers = opts.headers || (opts.useNibbles ? NIBBLE : POWERS);
      var headHtml = headers.map(function(h, i) {
        return '<th' + (opts.useNibbles && i === 4 ? ' class="bb-nibble-gap"' : '') + '>' + h + '</th>';
      }).join('');
      var cellHtml = bits.map(function(b, i) {
        return '<td class="bb-bit-btn ' + (b ? 'bb-on' : 'bb-off') + (opts.useNibbles && i === 4 ? ' bb-nibble-gap' : '') + '" tabindex="0" data-i="' + i + '">' + b + '</td>';
      }).join('');
      el.innerHTML =
        '<table class="bb-table"><thead><tr>' + headHtml + '</tr></thead>' +
        '<tbody><tr>' + cellHtml + '</tr></tbody></table>' +
        (opts.showTotal ? '<div class="bb-live-total">Value: <span class="bb-ltv">' + calcValue() + '</span></div>' : '');
      bindBitCells(el, bits, function() {
        var ltv = el.querySelector('.bb-ltv');
        if (ltv) ltv.textContent = calcValue();
        if (opts.onChange) opts.onChange(bits.join(''));
      });
    }
    render();
    return {
      getAnswer: function() { return bits.join(''); },
      reset: function() { bits = [0,0,0,0,0,0,0,0]; render(); }
    };
  }

  // Mount an addition table with interactive answer row into el.
  // Returns { getAnswer(), reset() }
  function mountAddInput(el, aBits, bBits, opts) {
    opts = opts || {};
    var ansBits = /^[01]{8}$/.test(String(opts.initialAnswer || '')) ? String(opts.initialAnswer).split('').map(Number) : [0,0,0,0,0,0,0,0];
    var carryBits = [0,0,0,0,0,0,0,0];
    function staticCells(arr) {
      return arr.map(function(b) { return '<td class="' + (b ? 'bb-on' : 'bb-off') + '">' + b + '</td>'; }).join('');
    }
    function render() {
      var carryRow = carryBits.map(function(b, i) {
        return '<td class="bb-carry-btn ' + (b ? 'bb-on' : '') + '" tabindex="0" data-c="' + i + '">' + (b ? '1' : '') + '</td>';
      }).join('');
      var interactive = ansBits.map(function(b, i) {
        return '<td class="bb-bit-btn ' + (b ? 'bb-on' : 'bb-off') + '" tabindex="0" data-i="' + i + '">' + b + '</td>';
      }).join('');
      el.innerHTML =
        '<table class="bb-table bb-add-table"><tbody>' +
        '<tr><td class="bb-add-label bb-carry-cell">carry</td>' + carryRow + '</tr>' +
        '<tr><td class="bb-add-label"></td>' + staticCells(aBits) + '</tr>' +
        '<tr><td class="bb-add-label">+</td>' + staticCells(bBits) + '</tr>' +
        '<tr><td class="bb-add-label">=</td>' + interactive + '</tr>' +
        '</tbody></table>';
      bindBitCells(el, ansBits, function() {
        if (opts.onChange) opts.onChange(ansBits.join(''));
      });
      el.querySelectorAll('[data-c]').forEach(function(cell) {
        var i = parseInt(cell.dataset.c, 10);
        function toggle() {
          carryBits[i] = carryBits[i] ? 0 : 1;
          cell.textContent = carryBits[i] ? '1' : '';
          cell.className = 'bb-carry-btn' + (carryBits[i] ? ' bb-on' : '');
        }
        cell.onclick = toggle;
        cell.onkeydown = function(e) {
          if (e.key === ' ' || e.key === 'Enter' || e.key === '1' || e.key === '0') { e.preventDefault(); toggle(); }
        };
      });
    }
    render();
    return {
      getAnswer: function() { return ansBits.join(''); },
      reset: function() { ansBits = [0,0,0,0,0,0,0,0]; carryBits = [0,0,0,0,0,0,0,0]; render(); }
    };
  }

  function createStepper(opts) {
    var el = document.getElementById(opts.containerId);
    if (!el) return;
    var idx = 0;
    function render() {
      var step = opts.steps[idx];
      el.innerHTML = '<div class="ex-box"><div class="bb-question-title">' + esc(step.title) + '</div>' + step.html +
        '<p class="ex-feedback hint">' + esc(step.note || '') + '</p><div class="bb-step-controls">' +
        '<button class="ex-btn" id="' + opts.containerId + '-prev">Back</button><span class="bb-step-pill">Step ' + (idx + 1) + ' of ' + opts.steps.length + '</span>' +
        '<button class="ex-btn" id="' + opts.containerId + '-next">' + (idx === opts.steps.length - 1 ? 'Finish example' : 'Next step') + '</button></div></div>';
      document.getElementById(opts.containerId + '-prev').disabled = idx === 0;
      document.getElementById(opts.containerId + '-prev').onclick = function(){ if (idx > 0) { idx--; render(); } };
      document.getElementById(opts.containerId + '-next').onclick = function(){
        if (idx < opts.steps.length - 1) { idx++; render(); }
        else {
          var fb = el.querySelector('.ex-feedback');
          fb.className = 'ex-feedback ok';
          fb.textContent = opts.completeOnEnd === false ? 'Example complete. Now complete the activity below.' : 'Example complete. You can now move on.';
          if (opts.completeOnEnd !== false) window.__markStepComplete && window.__markStepComplete();
        }
      };
    }
    render();
  }

  function createPractice(opts) {
    var el = document.getElementById(opts.containerId);
    if (!el) return;
    var idx = 0, score = 0, answered = false, activeWidget = null;
    function render() {
      if (idx >= opts.questions.length) {
        el.innerHTML = '<div class="ex-box"><p class="ex-feedback ok">Complete: ' + score + '/' + opts.questions.length + ' correct. Review any feedback, then move on.</p></div>';
        window.__markStepComplete && window.__markStepComplete();
        return;
      }
      answered = false;
      activeWidget = null;
      var q = opts.questions[idx];
      if (q && q.generated) q = genQuestion(q.generated) || q;
      var isBinary   = q.type === 'bit_input' || /^[01]{8}$/.test(q.answer);
      var isAddition = q.type === 'addition' || q.type === 'addition_input';
      var useWidget  = isBinary || isAddition;
      var wid = opts.containerId + '-widget';
      el.innerHTML =
        '<div class="ex-box"><div class="ex-progress">Question ' + (idx + 1) + ' of ' + opts.questions.length + '</div>' +
        '<div class="ex-score">Score: ' + score + '</div>' +
        '<div class="bb-question-card"><div class="bb-question-title">' + esc(q.prompt) + '</div>' + (q.html || '') +
        (useWidget
          ? '<div id="' + wid + '" style="margin:0.5rem 0"></div>'
          : '<input id="' + opts.containerId + '-answer" class="ex-input" autocomplete="off" spellcheck="false" placeholder="' + esc(q.placeholder || 'Type your answer') + '">') +
        '<button id="' + opts.containerId + '-check" class="ex-btn" style="margin-top:8px">Check</button>' +
        '<div id="' + opts.containerId + '-fb" class="ex-feedback"></div></div></div>';
      var widgetEl = document.getElementById(wid);
      if (widgetEl) activeWidget = isAddition ? mountAddInput(widgetEl, q.rowA, q.rowB) : mountBitInput(widgetEl, { showTotal: !q.useNibbles, useNibbles: !!q.useNibbles });
      var checkBtn = document.getElementById(opts.containerId + '-check');
      var fbEl     = document.getElementById(opts.containerId + '-fb');
      function getValue() {
        if (activeWidget) return activeWidget.getAnswer();
        var inp = document.getElementById(opts.containerId + '-answer');
        return inp ? inp.value : '';
      }
      function check() {
        if (answered) return;
        var val = getValue();
        var inp = document.getElementById(opts.containerId + '-answer');
        if (!activeWidget && !val.trim()) { fbEl.className = 'ex-feedback hint'; fbEl.textContent = 'Type an answer first.'; return; }
        var answers = Array.isArray(q.answers) ? q.answers : [q.answer];
        var ok = answers.some(function(a) { return normalise(a) === normalise(val); });
        answered = true;
        checkBtn.disabled = true;
        if (inp) { inp.disabled = true; inp.classList.add(ok ? 'correct' : 'wrong'); }
        if (ok) { score++; fbEl.className = 'ex-feedback ok'; fbEl.textContent = q.right || 'Correct.'; setTimeout(function(){ idx++; render(); }, 900); }
        else { fbEl.className = 'ex-feedback err'; fbEl.textContent = q.wrong || ('Not quite. Correct answer: ' + answers[0]); setTimeout(function(){ idx++; render(); }, 1800); }
      }
      checkBtn.onclick = check;
      var inp2 = document.getElementById(opts.containerId + '-answer');
      if (inp2) { inp2.onkeydown = function(e){ if (e.key === 'Enter') check(); }; inp2.focus(); }
    }
    render();
  }

  function genQuestion(mode) {
    var n = Math.floor(Math.random() * 255) + 1;
    var bits = bitsFromNumber(n);
    var hex = n.toString(16).toUpperCase().padStart(2, '0');
    if (mode === 'binary_to_denary') {
      return { type: 'text_input', prompt: 'Convert this binary number to denary.', q: 'Convert this binary number to denary.', html: bitTable(bits), answer: String(n), right: 'Correct: the denary value is ' + n + '.' };
    }
    if (mode === 'denary_to_binary') {
      return { type: 'bit_input', prompt: 'Convert ' + n + ' to 8-bit binary.', q: 'Convert ' + n + ' to 8-bit binary. Click the correct bits.', answer: n.toString(2).padStart(8, '0'), right: 'Correct: ' + n + ' in binary is ' + n.toString(2).padStart(8, '0') + '.' };
    }
    if (mode === 'addition') {
      var m = Math.floor(Math.random() * Math.min(127, 255 - n)) + 1;
      var total = n + m;
      return { type: 'addition_input', prompt: 'Add these two binary numbers.', q: 'Add these two binary numbers. Fill in the carry row and the answer.', rowA: bitsFromNumber(n), rowB: bitsFromNumber(m), answer: total.toString(2).padStart(8, '0'), right: n + ' + ' + m + ' = ' + total + '.' };
    }
    if (mode === 'hex_to_denary') {
      return { type: 'text_input', prompt: 'Convert ' + hex + ' to denary.', q: 'Convert ' + hex + ' to denary.', html: '<div class="bb-hex-pair"><div>' + hex[0] + '</div><div>' + hex[1] + '</div></div>', answer: String(n), right: 'Correct: ' + hex + ' in denary is ' + n + '.' };
    }
    if (mode === 'denary_to_hex') {
      return { type: 'text_input', prompt: 'Convert ' + n + ' to hex.', q: 'Convert ' + n + ' to hex.', answer: hex, right: 'Correct: ' + n + ' in hex is ' + hex + '.' };
    }
    if (mode === 'binary_to_hex') {
      return { type: 'text_input', prompt: 'Convert this binary number to hex.', q: 'Convert this binary number to hex.', html: bitTable(bits, NIBBLE, true), answer: hex, right: 'Correct: this binary is ' + hex + ' in hex.' };
    }
    if (mode === 'hex_to_binary') {
      return { type: 'bit_input', prompt: 'Convert ' + hex + ' to 8-bit binary.', q: 'Convert ' + hex + ' to 8-bit binary. Click the correct bits.', html: '<div class="bb-hex-pair"><div>' + hex[0] + '</div><div>' + hex[1] + '</div></div>', answer: n.toString(2).padStart(8, '0'), useNibbles: true, right: 'Correct: ' + hex + ' in binary is ' + n.toString(2).padStart(8, '0') + '.' };
    }
    return null;
  }

  function createEndless(opts) {
    var el = document.getElementById(opts.containerId);
    if (!el) return;
    var solved = 0, current, activeWidget = null;
    function makeQuestion() {
      var n = Math.floor(Math.random() * 255) + 1, mode = opts.mode;
      if (mode === 'place') return { prompt:'Find the denary value of this binary number.', html:bitTable(bitsFromNumber(n)), answer:String(n), right:'Correct. You added the active place values.' };
      if (mode === 'denary') {
        if (Math.random() < 0.5) return { prompt:'Convert this binary number to denary.', html:bitTable(bitsFromNumber(n)), answer:String(n), right:'Correct conversion.' };
        return { prompt:'Convert this denary number to 8-bit binary: <strong>' + n + '</strong>', answer:n.toString(2).padStart(8,'0'), right:'Correct binary number.' };
      }
      if (mode === 'addition') {
        // cap m so the sum never exceeds 255 (stays within 8 bits)
        var m = Math.floor(Math.random() * Math.min(127, 255 - n)) + 1;
        var total = n + m;
        return { type:'addition', prompt:'Add these binary numbers.', rowA:bitsFromNumber(n), rowB:bitsFromNumber(m), answer:total.toString(2).padStart(8,'0'), right:n + ' + ' + m + ' = ' + total + '.' };
      }
      var hex = n.toString(16).toUpperCase().padStart(2,'0'), choice = Math.floor(Math.random() * 4);
      if (choice === 0) return { prompt:'Convert this hex number to denary: ' + hex, html:'<div class="bb-hex-pair"><div>' + hex[0] + '</div><div>' + hex[1] + '</div></div>', answer:String(n), right:'Correct hex to denary.' };
      if (choice === 1) return { prompt:'Convert this denary number to hex: ' + n, html:'<div class="bb-hex-pair"><div>?</div><div>?</div></div>', answer:hex, right:'Correct hex value.' };
      if (choice === 2) return { prompt:'Convert this binary number to hex.', html:bitTable(bitsFromNumber(n), NIBBLE, true), answer:hex, right:'Correct binary to hex.' };
      return { prompt:'Convert this hex number to 8-bit binary: ' + hex, html:'<div class="bb-hex-pair"><div>' + hex[0] + '</div><div>' + hex[1] + '</div></div>', answer:n.toString(2).padStart(8,'0'), useNibbles:true, right:'Correct hex to binary.' };
    }
    function render() {
      activeWidget = null;
      current = makeQuestion();
      var isBinary   = /^[01]{8}$/.test(current.answer);
      var isAddition = current.type === 'addition';
      var useWidget  = isBinary || isAddition;
      var wid = opts.containerId + '-widget';
      el.innerHTML =
        '<div class="ex-box"><div class="ex-progress">Endless target: 5 correct. Completed: ' + solved + '/5</div>' +
        '<div class="bb-question-card"><div class="bb-question-title">' + current.prompt + '</div>' + (current.html || '') +
        (useWidget
          ? '<div id="' + wid + '" style="margin:0.5rem 0"></div>'
          : '<input id="' + opts.containerId + '-answer" class="ex-input" autocomplete="off" spellcheck="false" placeholder="Type answer">') +
        '<div style="display:flex;gap:6px;margin-top:8px">' +
          '<button id="' + opts.containerId + '-check" class="ex-btn">Check</button>' +
          '<button id="' + opts.containerId + '-skip" class="ex-btn" style="background:#475569">New question</button>' +
        '</div><div id="' + opts.containerId + '-fb" class="ex-feedback"></div></div></div>';
      var widgetEl = document.getElementById(wid);
      if (widgetEl) activeWidget = isAddition ? mountAddInput(widgetEl, current.rowA, current.rowB) : mountBitInput(widgetEl, { showTotal: !current.useNibbles, useNibbles: !!current.useNibbles });
      document.getElementById(opts.containerId + '-skip').onclick = render;
      function getValue() {
        if (activeWidget) return activeWidget.getAnswer();
        var inp = document.getElementById(opts.containerId + '-answer');
        return inp ? inp.value : '';
      }
      function check() {
        var fb = document.getElementById(opts.containerId + '-fb');
        if (normalise(getValue()) === normalise(current.answer)) {
          solved++; fb.className = 'ex-feedback ok'; fb.textContent = current.right + (solved >= 5 ? ' Endless practice complete.' : ' Next challenge loading.');
          document.getElementById(opts.containerId + '-check').disabled = true;
          if (solved >= 5) window.__markStepComplete && window.__markStepComplete(); else setTimeout(render, 900);
        } else { fb.className = 'ex-feedback err'; fb.textContent = 'Not quite. Correct answer: ' + current.answer + '. Try the next one.'; setTimeout(render, 1600); }
      }
      document.getElementById(opts.containerId + '-check').onclick = check;
      var inp = document.getElementById(opts.containerId + '-answer');
      if (inp) { inp.onkeydown = function(e){ if (e.key === 'Enter') check(); }; inp.focus(); }
    }
    render();
  }
  return { bitTable, addTable, addTablePartial, mountBitInput, mountAddInput, createStepper, createPractice, createEndless, genQuestion };
})();


// ════════════════════════════════════════════════════════════════
