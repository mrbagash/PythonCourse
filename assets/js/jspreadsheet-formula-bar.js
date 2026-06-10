/*
 * JHNCC formula bar for jspreadsheet-ce v4.
 * jspreadsheet CE has no built-in formula bar, so this adds an Excel-style bar
 * above a sheet: a cell-reference box, an "fx" marker, and an editor that shows
 * (and edits) the raw value/formula of the currently selected cell.
 *
 * Usage:  JHNCCAddFormulaBar(document.getElementById('my-sheet'), sheetInstance);
 */
(function () {
  if (window.JHNCCAddFormulaBar) return;

  // Inject the bar styling once.
  function ensureStyles() {
    if (document.getElementById('jhncc-fbar-styles')) return;
    var s = document.createElement('style');
    s.id = 'jhncc-fbar-styles';
    s.textContent =
      '.jhncc-fbar{display:flex;align-items:center;width:100%;box-sizing:border-box;' +
      'border:1px solid #cfcfcf;background:#fff;font-family:Calibri,"Segoe UI",Arial,sans-serif;' +
      'font-size:13px;border-radius:4px 4px 0 0;overflow:hidden}' +
      '.jhncc-fbar-ref{min-width:78px;padding:5px 8px;border-right:1px solid #cfcfcf;' +
      'color:#333;white-space:nowrap;background:#f7f7f7;text-align:center}' +
      '.jhncc-fbar-fx{padding:5px 11px;border-right:1px solid #cfcfcf;font-style:italic;' +
      'color:#888;background:#fafafa;font-weight:600}' +
      '.jhncc-fbar-input{flex:1;min-width:0;border:0;outline:none;padding:5px 9px;' +
      'font-size:13px;color:#222;background:#fff;font-family:Consolas,"Courier New",monospace}' +
      /* sheet tabs */
      '.jhncc-tabbar{display:flex;align-items:stretch;width:100%;box-sizing:border-box;' +
      'border:1px solid #cfcfcf;border-top:none;background:#f3f3f3;overflow-x:auto;' +
      'font-family:Calibri,"Segoe UI",Arial,sans-serif;font-size:13px;border-radius:0 0 4px 4px}' +
      '.jhncc-tab{padding:5px 14px;background:#e8e8e8;color:#444;border:0;' +
      'border-right:1px solid #d6d6d6;border-bottom:2px solid transparent;cursor:pointer;' +
      'white-space:nowrap;font-family:inherit;font-size:13px}' +
      '.jhncc-tab:hover{background:#ececec}' +
      '.jhncc-tab.active{background:#fff;color:#111;font-weight:700;border-bottom:2px solid #107c41}' +
      '.jhncc-tab-add{padding:4px 13px;background:transparent;border:0;color:#107c41;' +
      'font-size:17px;line-height:1;cursor:pointer}' +
      '.jhncc-tab-add:hover{background:#e0e0e0}' +
      '.jhncc-sheets{display:block;width:100%;clear:both}' +
      '.jhncc-sheet-panel{width:100%}' +
      /* persistent selection marker that survives the sheet losing focus */
      '.jhncc-active-cell{box-shadow:inset 0 0 0 2px #107c41 !important}' +
      /* format toolbar */
      '.jhncc-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:2px;width:100%;' +
      'box-sizing:border-box;border:1px solid #cfcfcf;border-bottom:none;background:#f7f7f7;' +
      'padding:3px 5px;font-family:Calibri,"Segoe UI",Arial,sans-serif;border-radius:4px 4px 0 0}' +
      '.jhncc-tb-btn{min-width:28px;height:26px;padding:0 7px;background:#fff;border:1px solid #d0d0d0;' +
      'border-radius:3px;cursor:pointer;font-size:13px;color:#222;line-height:24px}' +
      '.jhncc-tb-btn:hover{background:#eef4ff;border-color:#9cc0ff}' +
      '.jhncc-tb-btn.on{background:#d4e6ff;border-color:#6aa3ff}' +
      '.jhncc-tb-b{font-weight:800}.jhncc-tb-i{font-style:italic;font-family:Georgia,serif}' +
      '.jhncc-tb-u{text-decoration:underline}' +
      '.jhncc-numfmt{height:26px;min-width:142px;border:1px solid #bfbfbf;border-radius:3px;' +
      'background:#fff;color:#222;font-size:13px;padding:0 6px;font-family:inherit}' +
      '.jhncc-tb-color{display:inline-flex;align-items:center;gap:3px;height:26px;padding:0 5px;' +
      'background:#fff;border:1px solid #d0d0d0;border-radius:3px;cursor:pointer;font-size:13px}' +
      '.jhncc-tb-color input{width:20px;height:18px;border:0;padding:0;background:none;cursor:pointer}' +
      '.jhncc-tb-sep{width:1px;align-self:stretch;background:#d0d0d0;margin:2px 4px}' +
      '.jhncc-cf-pop{border:1px solid #cfcfcf;background:#fff;border-radius:6px;padding:10px;' +
      'margin-top:6px;font-family:Calibri,"Segoe UI",Arial,sans-serif;font-size:13px;color:#222}' +
      '.jhncc-cf-pop select,.jhncc-cf-pop input{border:1px solid #c8c8c8;border-radius:4px;' +
      'padding:3px 6px;font-size:13px;margin:0 4px 4px 0}' +
      /* conditional formatting menu */
      '.jhncc-menu{position:fixed;z-index:10000;background:#fff;border:1px solid #b0b0b0;' +
      'border-radius:4px;box-shadow:0 4px 18px rgba(0,0,0,.22);min-width:200px;padding:4px 0;' +
      'font-family:Calibri,"Segoe UI",Arial,sans-serif;font-size:13px;color:#222}' +
      '.jhncc-menu-item{display:flex;justify-content:space-between;align-items:center;gap:18px;' +
      'padding:6px 12px;cursor:pointer;white-space:nowrap}' +
      '.jhncc-menu-item:hover{background:#eef4ff}' +
      '.jhncc-menu-sep{height:1px;background:#e3e3e3;margin:4px 0}' +
      '.jhncc-menu-arrow{color:#999}' +
      /* conditional formatting modal */
      '.jhncc-modal-ov{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:10001;' +
      'display:flex;align-items:center;justify-content:center}' +
      '.jhncc-modal{background:#fff;border-radius:8px;min-width:360px;max-width:92vw;' +
      'box-shadow:0 12px 44px rgba(0,0,0,.3);font-family:Calibri,"Segoe UI",Arial,sans-serif}' +
      '.jhncc-modal-h{display:flex;justify-content:space-between;align-items:center;' +
      'padding:12px 16px;font-weight:700;font-size:15px;border-bottom:1px solid #eee}' +
      '.jhncc-modal-x{cursor:pointer;color:#888;font-size:20px;line-height:1}' +
      '.jhncc-modal-b{padding:16px;font-size:14px;color:#222}' +
      '.jhncc-modal-b input,.jhncc-modal-b select{border:1px solid #c8c8c8;border-radius:4px;' +
      'padding:5px 8px;font-size:14px;margin:0 5px}' +
      '.jhncc-modal-f{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid #eee}' +
      '.jhncc-modal-btn{padding:6px 18px;border-radius:5px;border:1px solid #c8c8c8;cursor:pointer;font-size:13px;background:#fff}' +
      '.jhncc-modal-btn.ok{background:#107c41;color:#fff;border-color:#107c41}' +
      '.jhncc-format-modal{width:760px;max-width:94vw}.jhncc-format-tabs{display:flex;border-bottom:1px solid #ddd;background:#fafafa}' +
      '.jhncc-format-tab{padding:9px 18px;border-right:1px solid #e5e5e5;background:#f7f7f7;color:#222}.jhncc-format-tab.active{background:#fff;border-bottom:2px solid #fff;font-weight:600}' +
      '.jhncc-format-body{display:grid;grid-template-columns:210px 1fr;gap:18px;min-height:360px}' +
      '.jhncc-format-list{border:1px solid #bfc7d1;background:#fff;padding:4px 0;max-height:300px;overflow-y:auto}' +
      '.jhncc-format-cat{padding:4px 8px;cursor:pointer;color:#111}.jhncc-format-cat:hover{background:#eef4ff}.jhncc-format-cat.active{background:#0078d4;color:#fff}' +
      '.jhncc-format-panel{border:1px solid #ddd;background:#fff;padding:14px;color:#111}.jhncc-format-sample{border:1px solid #ddd;padding:14px 18px;margin:4px 0 16px;min-height:48px;font-size:16px}' +
      '.jhncc-format-row{display:flex;align-items:center;gap:10px;margin:10px 0}.jhncc-format-desc{margin-top:20px;color:#333;line-height:1.35}';
    document.head.appendChild(s);
  }

  // Column index (0-based) -> spreadsheet column letters (A, B, ... Z, AA, ...).
  function colName(n) {
    var s = '';
    n++;
    while (n > 0) {
      var m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function cellToXY(cell) {
    var m = String(cell || '').toUpperCase().match(/^([A-Z]+)([0-9]+)$/);
    if (!m) return null;
    var x = 0;
    for (var i = 0; i < m[1].length; i++) x = x * 26 + (m[1].charCodeAt(i) - 64);
    return [x - 1, parseInt(m[2], 10) - 1];
  }

  function splitFormulaArgs(text) {
    var args = [], cur = '', depth = 0, quote = null;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (quote) {
        cur += ch;
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
        cur += ch;
      } else if (ch === '(') {
        depth++;
        cur += ch;
      } else if (ch === ')') {
        depth--;
        cur += ch;
      } else if ((ch === ',' || ch === ';') && depth === 0) {
        args.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    if (cur.trim()) args.push(cur.trim());
    return args;
  }

  function stripQuotes(value) {
    value = String(value == null ? '' : value).trim();
    if ((value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') ||
        (value.charAt(0) === "'" && value.charAt(value.length - 1) === "'")) {
      return value.slice(1, -1);
    }
    return value;
  }

  function cleanNumber(value) {
    if (typeof value !== 'number' || !isFinite(value)) return value;
    var rounded = Math.round((value + Number.EPSILON) * 100000000) / 100000000;
    return Object.is(rounded, -0) ? 0 : rounded;
  }

  function cleanDisplayValue(value) {
    if (typeof value === 'number') return cleanNumber(value);
    if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) {
      return String(cleanNumber(Number(value)));
    }
    return value;
  }

  function ensureNumberFormats(sheet) {
    if (!sheet._jhnccNumberFormats) sheet._jhnccNumberFormats = {};
    return sheet._jhnccNumberFormats;
  }

  function valueAsNumber(value) {
    if (typeof value === 'number') return isFinite(value) ? value : null;
    var text = String(value == null ? '' : value).trim();
    if (!text) return null;
    var pct = /%$/.test(text);
    text = text.replace(/[£,$,%\s]/g, '');
    var n = Number(text);
    if (!isFinite(n)) return null;
    return pct ? n / 100 : n;
  }

  function addThousands(text) {
    var parts = String(text).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  function formatNumberDisplay(value, fmt) {
    if (!fmt || fmt.type === 'general') return value;
    var n = valueAsNumber(value);
    if (n === null) return value;
    var dec = Math.max(0, Math.min(8, Number(fmt.decimals == null ? (fmt.type === 'currency' ? 2 : 0) : fmt.decimals)));
    if (fmt.type === 'currency') return '£' + addThousands(n.toFixed(dec));
    if (fmt.type === 'percent') return (n * 100).toFixed(dec) + '%';
    if (fmt.type === 'number') return addThousands(n.toFixed(dec));
    return value;
  }

  function cellRawOrCalculated(sheet, x, y, originalGet) {
    var raw = '';
    try { raw = originalGet ? originalGet(x, y, false) : sheet.getValueFromCoords(x, y, false); } catch (e) {}
    var fixed = evaluateSupportedFormula(sheet, raw);
    if (fixed !== null) return fixed;
    try { return originalGet ? originalGet(x, y, true) : sheet.getValueFromCoords(x, y, true); } catch (e2) {}
    return raw;
  }

  function refreshNumberFormats(holder, sheet, originalGet) {
    if (!holder || !sheet || !sheet._jhnccNumberFormats) return;
    Object.keys(sheet._jhnccNumberFormats).forEach(function(cn) {
      var xy = cellToXY(cn);
      if (!xy) return;
      var td = null;
      try { td = sheet.getCellFromCoords(xy[0], xy[1]); } catch (e) {}
      if (!td) td = holder.querySelector('td[data-x="' + xy[0] + '"][data-y="' + xy[1] + '"]');
      if (!td) return;
      var val = cellRawOrCalculated(sheet, xy[0], xy[1], originalGet);
      td.textContent = formatNumberDisplay(val, sheet._jhnccNumberFormats[cn]);
    });
  }

  function rangeValues(sheet, range) {
    range = String(range || '').replace(/\$/g, '').toUpperCase();
    var parts = range.split(':');
    var start = cellToXY(parts[0]);
    var end = cellToXY(parts[1] || parts[0]);
    if (!start || !end) return [];
    var vals = [];
    var x1 = Math.min(start[0], end[0]), x2 = Math.max(start[0], end[0]);
    var y1 = Math.min(start[1], end[1]), y2 = Math.max(start[1], end[1]);
    for (var y = y1; y <= y2; y++) {
      for (var x = x1; x <= x2; x++) {
        var v = '';
        try { v = sheet.getValueFromCoords(x, y, false); } catch (e) {}
        vals.push(v == null ? '' : v);
      }
    }
    return vals;
  }

  function rangeNumbers(sheet, range) {
    return rangeValues(sheet, range).map(function(v) {
      var n = parseFloat(v);
      return isNaN(n) ? null : n;
    }).filter(function(v) { return v !== null; });
  }

  function matchesCriteria(value, criteria) {
    criteria = stripQuotes(criteria);
    var actualText = String(value == null ? '' : value).trim();
    var actualNum = parseFloat(actualText);
    var m = criteria.match(/^(>=|<=|<>|>|<|=)\s*(.+)$/);
    if (m) {
      var rhs = stripQuotes(m[2]);
      var rhsNum = parseFloat(rhs);
      if (!isNaN(actualNum) && !isNaN(rhsNum)) {
        if (m[1] === '>') return actualNum > rhsNum;
        if (m[1] === '<') return actualNum < rhsNum;
        if (m[1] === '>=') return actualNum >= rhsNum;
        if (m[1] === '<=') return actualNum <= rhsNum;
        if (m[1] === '=') return actualNum === rhsNum;
        if (m[1] === '<>') return actualNum !== rhsNum;
      }
      if (m[1] === '=') return actualText.toLowerCase() === rhs.toLowerCase();
      if (m[1] === '<>') return actualText.toLowerCase() !== rhs.toLowerCase();
      return false;
    }
    return actualText.toLowerCase() === criteria.toLowerCase();
  }

  function evalSimpleCondition(sheet, condition) {
    var m = String(condition || '').replace(/\$/g, '').match(/^([A-Z]+[0-9]+)\s*(>=|<=|<>|>|<|=)\s*(.+)$/i);
    if (!m) return false;
    var xy = cellToXY(m[1]);
    var left = '';
    try { left = sheet.getValueFromCoords(xy[0], xy[1], true); } catch (e) {}
    return matchesCriteria(left, m[2] + m[3]);
  }

  function evaluateSupportedFormula(sheet, raw) {
    raw = String(raw == null ? '' : raw).trim();
    var formula = raw.charAt(0) === '=' ? raw.slice(1).trim() : raw;
    var m = formula.match(/^([A-Z]+)\s*\((.*)\)$/i);
    if (!m) return null;
    var fn = m[1].toUpperCase();
    var args = splitFormulaArgs(m[2]);
    if (fn === 'SUM' && args.length >= 1) {
      return cleanNumber(rangeNumbers(sheet, args[0]).reduce(function(t, n) { return t + n; }, 0));
    }
    if (fn === 'AVERAGE' && args.length >= 1) {
      var avgNums = rangeNumbers(sheet, args[0]);
      return avgNums.length ? cleanNumber(avgNums.reduce(function(t, n) { return t + n; }, 0) / avgNums.length) : 0;
    }
    if (fn === 'MAX' && args.length >= 1) {
      var maxNums = rangeNumbers(sheet, args[0]);
      return maxNums.length ? cleanNumber(Math.max.apply(Math, maxNums)) : 0;
    }
    if (fn === 'MIN' && args.length >= 1) {
      var minNums = rangeNumbers(sheet, args[0]);
      return minNums.length ? cleanNumber(Math.min.apply(Math, minNums)) : 0;
    }
    if (fn === 'COUNT' && args.length >= 1) {
      return rangeNumbers(sheet, args[0]).length;
    }
    if (fn === 'COUNTIF' && args.length >= 2) {
      var count = 0;
      rangeValues(sheet, args[0]).forEach(function(v) {
        if (matchesCriteria(v, args[1])) count++;
      });
      return count;
    }
    if (fn === 'SUMIF' && args.length >= 3) {
      var checkVals = rangeValues(sheet, args[0]);
      var sumVals = rangeValues(sheet, args[2]);
      var total = 0;
      checkVals.forEach(function(v, i) {
        if (matchesCriteria(v, args[1])) {
          var n = parseFloat(sumVals[i]);
          if (!isNaN(n)) total += n;
        }
      });
      return cleanNumber(total);
    }
    if (fn === 'IF' && args.length >= 3) {
      return evalSimpleCondition(sheet, args[0]) ? stripQuotes(args[1]) : stripQuotes(args[2]);
    }
    return null;
  }

  function installFormulaFixes(holder, sheet) {
    if (!holder || !sheet || sheet._jhnccFormulaFixes) return;
    sheet._jhnccFormulaFixes = true;
    var originalGet = sheet.getValueFromCoords.bind(sheet);
    sheet.getValueFromCoords = function(x, y, processed) {
      if (processed !== false) {
        var raw = originalGet(x, y, false);
        var fixed = evaluateSupportedFormula(sheet, raw);
        if (fixed !== null) return fixed;
        return cleanDisplayValue(originalGet(x, y, processed));
      }
      return originalGet(x, y, processed);
    };
    sheet._jhnccRefreshFormulaFixes = function() {
      if (!holder) return;
      holder.querySelectorAll('td[data-x][data-y]').forEach(function(td) {
        var x = parseInt(td.getAttribute('data-x'), 10);
        var y = parseInt(td.getAttribute('data-y'), 10);
        var raw = originalGet(x, y, false);
        var fixed = evaluateSupportedFormula(sheet, raw);
        if (fixed !== null) td.textContent = fixed;
      });
      refreshNumberFormats(holder, sheet, originalGet);
    };
    setTimeout(sheet._jhnccRefreshFormulaFixes, 0);
  }

  window.JHNCCAddFormulaBar = function (holder, sheet) {
    if (!holder || !sheet || !holder.parentNode) return;
    if (holder.previousSibling && holder.previousSibling.classList &&
        holder.previousSibling.classList.contains('jhncc-fbar')) return; // already added
    ensureStyles();
    installFormulaFixes(holder, sheet);

    var bar = document.createElement('div');
    bar.className = 'jhncc-fbar';
    var ref = document.createElement('span');
    ref.className = 'jhncc-fbar-ref';
    var fx = document.createElement('span');
    fx.className = 'jhncc-fbar-fx';
    fx.textContent = 'fx';
    var input = document.createElement('input');
    input.className = 'jhncc-fbar-input';
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Formula bar');
    bar.appendChild(ref);
    bar.appendChild(fx);
    bar.appendChild(input);
    holder.parentNode.insertBefore(bar, holder);

    var cur = { x: null, y: null };
    var lastCell = null;

    function rawValue(x, y) {
      try {
        var v = sheet.getValueFromCoords(x, y, false); // false => raw value (the formula text)
        return v == null ? '' : String(v);
      } catch (e) { return ''; }
    }

    // Keep our own marker on the active cell so it stays visible even when the
    // sheet loses focus (jspreadsheet otherwise clears its highlight on blur).
    function markCell(x, y) {
      if (lastCell) { lastCell.classList.remove('jhncc-active-cell'); lastCell = null; }
      var td = null;
      try { td = sheet.getCellFromCoords(x, y); } catch (e) {}
      if (!td && holder) td = holder.querySelector('td[data-x="' + x + '"][data-y="' + y + '"]');
      if (td) { td.classList.add('jhncc-active-cell'); lastCell = td; }
    }

    function show(x, y) {
      if (x == null || y == null) return;
      cur.x = x; cur.y = y;
      ref.textContent = colName(x) + (y + 1);
      input.value = rawValue(x, y);
      markCell(x, y);
    }

    // Preserve any handlers the sheet was created with, then chain ours.
    var prevSel = sheet.options.onselection;
    var prevChange = sheet.options.onchange;
    sheet.options.onselection = function (el, x1, y1, x2, y2, origin) {
      show(x1, y1);
      if (typeof prevSel === 'function') prevSel.apply(this, arguments);
    };
    sheet.options.onchange = function (el, cell, x, y, value) {
      if (Number(x) === cur.x && Number(y) === cur.y) input.value = rawValue(cur.x, cur.y);
      if (typeof sheet._jhnccRefreshFormulaFixes === 'function') setTimeout(sheet._jhnccRefreshFormulaFixes, 0);
      if (typeof prevChange === 'function') prevChange.apply(this, arguments);
    };

    function commit() {
      if (cur.x == null) return;
      try { sheet.setValueFromCoords(cur.x, cur.y, input.value, true); } catch (e) {}
    }
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { input.value = rawValue(cur.x, cur.y); input.blur(); }
    });
    input.addEventListener('blur', commit);

    show(0, 0); // initialise to A1
  };

  // ── Inline-style merge helpers (jspreadsheet setStyle replaces, so we merge ourselves) ──
  function parseCss(str) {
    var m = {};
    (str || '').split(';').forEach(function (p) {
      var i = p.indexOf(':');
      if (i > 0) { var k = p.slice(0, i).trim().toLowerCase(); var v = p.slice(i + 1).trim(); if (k) m[k] = v; }
    });
    return m;
  }
  function cssToString(m) {
    return Object.keys(m).map(function (k) { return k + ':' + m[k]; }).join(';');
  }

  // Excel-style formatting toolbar: bold/italic/underline, font colour, fill colour,
  // borders, alignment and simple conditional formatting. Works fully offline.
  window.JHNCCAddFormatToolbar = function (holder, sheet) {
    if (!holder || !sheet || !holder.parentNode) return;
    ensureStyles();

    var sel = { x1: 0, y1: 0, x2: 0, y2: 0 };
    var prevSel = sheet.options.onselection;
    sheet.options.onselection = function (el, x1, y1, x2, y2, origin) {
      sel = { x1: Math.min(x1, x2), y1: Math.min(y1, y2), x2: Math.max(x1, x2), y2: Math.max(y1, y2) };
      if (typeof fmtSelect !== 'undefined' && fmtSelect) fmtSelect.value = anchorFormat().type || 'general';
      if (typeof prevSel === 'function') prevSel.apply(this, arguments);
    };

    // Write styles by setting individual properties DIRECTLY on each cell element,
    // rather than jspreadsheet's setStyle which clears the whole style attribute first
    // (that wiped jspreadsheet's own rendering styles, e.g. the default centring).
    function cellElOf(cn) { var xy = cellToXY(cn); if (!xy) return null; try { return sheet.getCellFromCoords(xy[0], xy[1]); } catch (e) { return null; } }
    function writeProps(cn, props) {
      var el = cellElOf(cn); if (!el) return;
      Object.keys(props).forEach(function (k) { var v = props[k]; if (v === null || v === undefined) el.style.removeProperty(k); else el.style.setProperty(k, v); });
    }
    function readProps(cn) { var el = cellElOf(cn); return el ? parseCss(el.getAttribute('style') || '') : {}; }
    function mergeStyle(cell, props) { var m = parseCss(sheet.getStyle(cell) || ''); Object.keys(props).forEach(function (k) { if (props[k] === null) delete m[k]; else m[k] = props[k]; }); return cssToString(m); }

    function applyToSelection(props) {
      for (var y = sel.y1; y <= sel.y2; y++) {
        for (var x = sel.x1; x <= sel.x2; x++) {
          var cn = colName(x) + (y + 1);
          writeProps(cn, props); // only the given properties change; everything else is preserved
          // If a CF rule currently overrides one of these props, update the value it would
          // restore to, so manual changes stick rather than being undone on re-evaluation.
          if (sheet._cf && sheet._cf.applied[cn]) {
            Object.keys(props).forEach(function (k) {
              if (k in sheet._cf.applied[cn]) sheet._cf.applied[cn][k] = (props[k] === null ? undefined : props[k]);
            });
          }
        }
      }
    }
    // Robust on/off toggle for a text style. detect(styleMap) decides the current state
    // from the anchor cell; removeNames lists every property to delete when turning it off
    // (text-decoration can serialise to longhands via CSSOM, so we clear the whole family).
    // Each toggle uses a distinct property, so Bold + Italic + Underline stack independently.
    function toggleStyle(detect, setProp, setVal, removeNames) {
      var isOn = detect(readProps(colName(sel.x1) + (sel.y1 + 1)));
      for (var y = sel.y1; y <= sel.y2; y++) {
        for (var x = sel.x1; x <= sel.x2; x++) {
          var cn = colName(x) + (y + 1);
          if (isOn) { var rm = {}; removeNames.forEach(function (n) { rm[n] = null; }); writeProps(cn, rm); }
          else { var ad = {}; ad[setProp] = setVal; writeProps(cn, ad); }
          if (sheet._cf && sheet._cf.applied[cn]) {
            removeNames.forEach(function (n) { if (n in sheet._cf.applied[cn]) sheet._cf.applied[cn][n] = undefined; });
            if (!isOn && setProp in sheet._cf.applied[cn]) sheet._cf.applied[cn][setProp] = setVal;
          }
        }
      }
    }

    // ── Borders (Excel-style, per cell-edge) ─────────────────────────────
    // Borders use per-side longhand properties (border-top/right/bottom/left) so they
    // add and remove reliably (the 'border' shorthand can serialise back as longhands
    // via CSSOM, which made naive removal fail).
    //
    // Like Excel, borders are an EDGE between two cells. "No border" on a range removes
    // only the selected cells' own edges — it does NOT touch the neighbouring cells. So
    // a shared edge stays visible if the cell on the other side still has a border
    // (e.g. clearing B2:B4 leaves the column outline from A and C, but removes the
    // internal dividers between B2/B3/B4).
    var BORDER = '1px solid #555';
    function eachInSel(fn) { for (var y = sel.y1; y <= sel.y2; y++) for (var x = sel.x1; x <= sel.x2; x++) fn(colName(x) + (y + 1), x, y); }
    function applyAllBorders() {
      eachInSel(function (cn) { writeProps(cn, { 'border': null, 'border-top': BORDER, 'border-right': BORDER, 'border-bottom': BORDER, 'border-left': BORDER }); });
    }
    function clearBorders() {
      eachInSel(function (cn) {
        var el = cellElOf(cn); if (!el) return;
        var rm = [];
        for (var i = 0; i < el.style.length; i++) { if (el.style[i].indexOf('border') === 0) rm.push(el.style[i]); }
        rm.forEach(function (p) { el.style.removeProperty(p); });
        if (sheet._cf && sheet._cf.applied[cn]) Object.keys(sheet._cf.applied[cn]).forEach(function (k) { if (k.indexOf('border') === 0) delete sheet._cf.applied[cn][k]; });
      });
    }

    var bar = document.createElement('div');
    bar.className = 'jhncc-toolbar';
    function btn(cls, label, title, onClick) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'jhncc-tb-btn ' + (cls || '');
      b.innerHTML = label; b.title = title; b.onclick = onClick;
      bar.appendChild(b); return b;
    }
    function sep() { var s = document.createElement('span'); s.className = 'jhncc-tb-sep'; bar.appendChild(s); }
    function colorPicker(labelText, title, initial, onPick) {
      var w = document.createElement('label');
      w.className = 'jhncc-tb-color'; w.title = title;
      w.appendChild(document.createTextNode(labelText));
      var inp = document.createElement('input'); inp.type = 'color'; inp.value = initial;
      inp.onchange = function () { onPick(inp.value); };
      w.appendChild(inp); bar.appendChild(w);
    }

    function selectedCellNames() {
      var cells = [];
      for (var y = sel.y1; y <= sel.y2; y++) {
        for (var x = sel.x1; x <= sel.x2; x++) cells.push(colName(x) + (y + 1));
      }
      return cells;
    }

    function anchorFormat() {
      var fmts = ensureNumberFormats(sheet);
      return fmts[colName(sel.x1) + (sel.y1 + 1)] || { type: 'general', decimals: 0 };
    }

    function applyNumberFormat(type, decimals) {
      var fmts = ensureNumberFormats(sheet);
      selectedCellNames().forEach(function(cn) {
        if (type === 'general') delete fmts[cn];
        else fmts[cn] = { type: type, decimals: Math.max(0, Math.min(8, Number(decimals))) };
      });
      if (typeof sheet._jhnccRefreshFormulaFixes === 'function') sheet._jhnccRefreshFormulaFixes();
      else refreshNumberFormats(holder, sheet);
    }

    function changeDecimals(delta) {
      var current = anchorFormat();
      var type = current.type === 'general' ? 'number' : current.type;
      var base = current.decimals == null ? (type === 'currency' ? 2 : 0) : Number(current.decimals);
      applyNumberFormat(type, Math.max(0, Math.min(8, base + delta)));
      fmtSelect.value = type;
    }

    function selectedSampleValue() {
      var x = sel.x1, y = sel.y1;
      try {
        var raw = sheet.getValueFromCoords(x, y, false);
        var fixed = evaluateSupportedFormula(sheet, raw);
        if (fixed !== null) return fixed;
        return sheet.getValueFromCoords(x, y, true);
      } catch (e) {
        return 6500;
      }
    }

    function openFormatCellsModal() {
      closeNumMenu();
      var current = anchorFormat();
      var category = current.type || 'general';
      var decimals = current.decimals == null ? (category === 'currency' ? 2 : 0) : Number(current.decimals);
      var sampleValue = selectedSampleValue();
      if (valueAsNumber(sampleValue) === null) sampleValue = 6500;
      var ov = document.createElement('div');
      ov.className = 'jhncc-modal-ov';
      ov.innerHTML =
        '<div class="jhncc-modal jhncc-format-modal">' +
          '<div class="jhncc-modal-h"><span>Format Cells</span><span class="jhncc-modal-x">&times;</span></div>' +
          '<div class="jhncc-format-tabs"><span class="jhncc-format-tab active">Number</span><span class="jhncc-format-tab">Alignment</span><span class="jhncc-format-tab">Font</span><span class="jhncc-format-tab">Border</span><span class="jhncc-format-tab">Fill</span></div>' +
          '<div class="jhncc-modal-b jhncc-format-body">' +
            '<div><div style="margin-bottom:6px">Category:</div><div class="jhncc-format-list">' +
              ['general','number','currency','percent'].map(function(t) {
                var label = t === 'percent' ? 'Percentage' : t.charAt(0).toUpperCase() + t.slice(1);
                return '<div class="jhncc-format-cat" data-type="' + t + '">' + label + '</div>';
              }).join('') +
            '</div></div>' +
            '<div class="jhncc-format-panel">' +
              '<div>Sample</div><div class="jhncc-format-sample"></div>' +
              '<div class="jhncc-format-row"><label for="jhncc-dec">Decimal places:</label><input id="jhncc-dec" class="jhncc-dec" type="number" min="0" max="8" step="1" style="width:72px"></div>' +
              '<div class="jhncc-format-row jhncc-symbol-row"><label for="jhncc-symbol">Symbol:</label><select id="jhncc-symbol" class="jhncc-symbol" style="min-width:130px"><option value="£">£</option></select></div>' +
              '<div class="jhncc-format-desc"></div>' +
            '</div>' +
          '</div>' +
          '<div class="jhncc-modal-f"><button class="jhncc-modal-btn ok">OK</button><button class="jhncc-modal-btn cancel">Cancel</button></div>' +
        '</div>';
      document.body.appendChild(ov);
      var sample = ov.querySelector('.jhncc-format-sample');
      var decInput = ov.querySelector('.jhncc-dec');
      var symbolRow = ov.querySelector('.jhncc-symbol-row');
      var desc = ov.querySelector('.jhncc-format-desc');

      function setCategory(type) {
        category = type;
        if (category === 'currency' && (decimals == null || decimals === 0)) decimals = 2;
        ov.querySelectorAll('.jhncc-format-cat').forEach(function(el) {
          el.classList.toggle('active', el.getAttribute('data-type') === category);
        });
        decInput.disabled = category === 'general';
        symbolRow.style.display = category === 'currency' ? 'flex' : 'none';
        decInput.value = category === 'general' ? 0 : decimals;
        var previewFmt = category === 'general' ? { type: 'general', decimals: 0 } : { type: category, decimals: decimals };
        sample.textContent = String(formatNumberDisplay(sampleValue, previewFmt));
        if (category === 'currency') desc.textContent = 'Currency formats are used for general monetary values.';
        else if (category === 'number') desc.textContent = 'Number formats let you control how many decimal places are displayed.';
        else if (category === 'percent') desc.textContent = 'Percentage formats display decimal values as percentages.';
        else desc.textContent = 'General format has no specific number format.';
      }
      ov.querySelectorAll('.jhncc-format-cat').forEach(function(el) {
        el.onclick = function() { setCategory(el.getAttribute('data-type')); };
      });
      decInput.oninput = function() {
        decimals = Math.max(0, Math.min(8, Number(decInput.value) || 0));
        setCategory(category);
      };
      function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
      ov.querySelector('.jhncc-modal-x').onclick = close;
      ov.querySelector('.cancel').onclick = close;
      ov.onclick = function(e) { if (e.target === ov) close(); };
      ov.querySelector('.ok').onclick = function() {
        applyNumberFormat(category, category === 'currency' && decimals == null ? 2 : decimals);
        fmtSelect.value = category;
        close();
      };
      setCategory(category);
      try { decInput.focus(); decInput.select(); } catch (e2) {}
    }

    var fmtSelect = document.createElement('select');
    fmtSelect.className = 'jhncc-numfmt';
    fmtSelect.title = 'Number format';
    fmtSelect.innerHTML = '<option value="general">General</option><option value="number">Number</option><option value="currency">Currency</option><option value="percent">Percentage</option>';
    fmtSelect.onchange = function() {
      var type = fmtSelect.value;
      applyNumberFormat(type, type === 'currency' ? 2 : (type === 'percent' ? 0 : 0));
    };
    bar.appendChild(fmtSelect);
    btn('', '&#163;', 'Currency format', function () { fmtSelect.value = 'currency'; applyNumberFormat('currency', 2); });
    btn('', '%', 'Percentage format', function () { fmtSelect.value = 'percent'; applyNumberFormat('percent', 0); });
    btn('', '.00 &#8592;', 'Increase decimal places', function () { changeDecimals(1); });
    btn('', '.0 &#8594;', 'Decrease decimal places', function () { changeDecimals(-1); });
    sep();

    var numMenu = null;
    function closeNumMenu() { if (numMenu && numMenu.parentNode) numMenu.parentNode.removeChild(numMenu); numMenu = null; }
    function openNumberMenu(x, y) {
      closeNumMenu();
      numMenu = document.createElement('div');
      numMenu.className = 'jhncc-menu';
      [
        ['Cut', function(){ try { document.execCommand('cut'); } catch(e) {} }],
        ['Copy', function(){ try { document.execCommand('copy'); } catch(e) {} }],
        ['Paste', function(){ try { document.execCommand('paste'); } catch(e) {} }],
        ['__sep'],
        ['Clear Contents', function(){ selectedCellNames().forEach(function(cn){ var xy = cellToXY(cn); if (xy) sheet.setValueFromCoords(xy[0], xy[1], '', true); }); }],
        ['__sep'],
        ['Format Cells...', openFormatCellsModal]
      ].forEach(function(item) {
        if (item[0] === '__sep') {
          var sepEl = document.createElement('div');
          sepEl.className = 'jhncc-menu-sep';
          numMenu.appendChild(sepEl);
          return;
        }
        var el = document.createElement('div');
        el.className = 'jhncc-menu-item';
        el.textContent = item[0];
        el.onclick = function(ev) { ev.stopPropagation(); closeNumMenu(); item[1](); };
        numMenu.appendChild(el);
      });
      numMenu.style.left = x + 'px';
      numMenu.style.top = y + 'px';
      document.body.appendChild(numMenu);
      var r = numMenu.getBoundingClientRect();
      if (r.right > window.innerWidth) numMenu.style.left = Math.max(4, window.innerWidth - r.width - 4) + 'px';
      if (r.bottom > window.innerHeight) numMenu.style.top = Math.max(4, window.innerHeight - r.height - 4) + 'px';
    }
    holder.addEventListener('contextmenu', function(e) {
      var td = e.target && e.target.closest ? e.target.closest('td[data-x][data-y]') : null;
      if (!td || !holder.contains(td)) return;
      e.preventDefault();
      var x = parseInt(td.getAttribute('data-x'), 10);
      var y = parseInt(td.getAttribute('data-y'), 10);
      if (x < sel.x1 || x > sel.x2 || y < sel.y1 || y > sel.y2) {
        sel = { x1: x, y1: y, x2: x, y2: y };
        try { sheet.updateSelectionFromCoords(x, y, x, y); } catch (err) {}
      }
      fmtSelect.value = anchorFormat().type || 'general';
      openNumberMenu(e.clientX, e.clientY);
    });
    document.addEventListener('mousedown', function(e) {
      if (!numMenu) return;
      if (e.target.closest && e.target.closest('.jhncc-menu')) return;
      closeNumMenu();
    });

    btn('jhncc-tb-b', 'B', 'Bold (click again to remove)', function () { toggleStyle(function (m) { var v = (m['font-weight'] || '').toLowerCase(); return v.indexOf('bold') !== -1 || parseInt(v, 10) >= 600; }, 'font-weight', 'bold', ['font-weight']); });
    btn('jhncc-tb-i', 'I', 'Italic (click again to remove)', function () { toggleStyle(function (m) { return (m['font-style'] || '').indexOf('italic') !== -1; }, 'font-style', 'italic', ['font-style']); });
    btn('jhncc-tb-u', 'U', 'Underline (click again to remove)', function () { toggleStyle(function (m) { return ((m['text-decoration'] || '') + ' ' + (m['text-decoration-line'] || '')).indexOf('underline') !== -1; }, 'text-decoration', 'underline', ['text-decoration', 'text-decoration-line', 'text-decoration-style', 'text-decoration-color']); });
    sep();
    colorPicker('A', 'Font colour', '#c00000', function (v) { applyToSelection({ 'color': v }); });
    colorPicker('Fill', 'Fill (cell shading)', '#ffff00', function (v) { applyToSelection({ 'background-color': v }); });
    sep();
    btn('', 'Borders', 'Add borders to the selected cells', function () { applyAllBorders(); });
    btn('', 'No border', 'Remove borders from the selected cells (and the touching edges of neighbours)', function () { clearBorders(); });
    sep();
    btn('', '&#8676;', 'Align left', function () { applyToSelection({ 'text-align': 'left' }); });
    btn('', '&#8596;', 'Align centre', function () { applyToSelection({ 'text-align': 'center' }); });
    btn('', '&#8677;', 'Align right', function () { applyToSelection({ 'text-align': 'right' }); });
    sep();

    // ── Conditional formatting (Excel-style) ──────────────────────────────
    var CF_PRESETS = [
      { label: 'Light Red Fill with Dark Red Text', css: { 'background-color': '#ffc7ce', 'color': '#9c0006' } },
      { label: 'Yellow Fill with Dark Yellow Text', css: { 'background-color': '#ffeb9c', 'color': '#9c6500' } },
      { label: 'Green Fill with Dark Green Text', css: { 'background-color': '#c6efce', 'color': '#006100' } },
      { label: 'Light Red Fill', css: { 'background-color': '#ffc7ce' } },
      { label: 'Red Text', css: { 'color': '#9c0006' } },
      { label: 'Red Border', css: { 'border': '1px solid #9c0006' } }
    ];
    function presetSelectHtml() {
      return '<select class="cf-fmt">' + CF_PRESETS.map(function (p, i) { return '<option value="' + i + '">' + p.label + '</option>'; }).join('') + '</select>';
    }
    function presetCss(ov) { return CF_PRESETS[parseInt(ov.querySelector('.cf-fmt').value, 10) || 0].css; }

    function cellToXY(cn) {
      var m = /^([A-Z]+)(\d+)$/.exec(cn); if (!m) return null;
      var x = 0; for (var i = 0; i < m[1].length; i++) x = x * 26 + (m[1].charCodeAt(i) - 64);
      return [x - 1, parseInt(m[2], 10) - 1];
    }
    function cnInSelection(cn) { var xy = cellToXY(cn); return xy && xy[0] >= sel.x1 && xy[0] <= sel.x2 && xy[1] >= sel.y1 && xy[1] <= sel.y2; }
    function selCells() {
      var grid = sheet.getData(); var out = [];
      for (var y = sel.y1; y <= sel.y2; y++) for (var x = sel.x1; x <= sel.x2; x++) {
        var raw = (grid[y] && grid[y][x] != null) ? grid[y][x] : '';
        out.push({ cn: colName(x) + (y + 1), x: x, y: y, raw: String(raw).trim(), num: parseFloat(raw) });
      }
      return out;
    }

    // ── Dynamic conditional-formatting engine ──────────────────────────────
    // Rules are stored and re-evaluated whenever data changes, so the formatting
    // updates live (just like Excel). CF manages ONLY the CSS properties it sets,
    // layering them over the cell's manual style (bold, borders, fills) and
    // restoring the underlying value when a rule stops matching. This means manual
    // borders/formatting are never disturbed by a re-evaluation.
    if (!sheet._cf) sheet._cf = { rules: [], applied: {} };  // applied: cn -> {prop: underlyingValue}
    var CF = sheet._cf;

    function rangeCells(r) {
      var grid = sheet.getData(); var out = [];
      for (var y = r.y1; y <= r.y2; y++) for (var x = r.x1; x <= r.x2; x++) {
        var raw = (grid[y] && grid[y][x] != null) ? grid[y][x] : '';
        out.push({ cn: colName(x) + (y + 1), x: x, y: y, raw: String(raw).trim(), num: parseFloat(raw) });
      }
      return out;
    }
    function rangesOverlap(a, b) { return !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2); }
    function minMaxC(cells) { var n = cells.map(function (c) { return c.num; }); var mn = Math.min.apply(null, n), mx = Math.max.apply(null, n); if (mx <= mn) mx = mn + 1; return [mn, mx]; }
    function hx(c) { c = Math.max(0, Math.min(255, Math.round(c))); return ('0' + c.toString(16)).slice(-2); }
    function mix(a, b, t) { return '#' + hx(a[0] + (b[0] - a[0]) * t) + hx(a[1] + (b[1] - a[1]) * t) + hx(a[2] + (b[2] - a[2]) * t); }

    // Each "compute" factory returns fn(cells) -> { cellName: cssProps } evaluated live.
    function cTest(test, css) { return function (cells) { var m = {}; cells.forEach(function (c) { if (test(c)) m[c.cn] = css; }); return m; }; }
    function cTopBottom(n, isPct, isTop, css) { return function (cells) { var nc = cells.filter(function (c) { return !isNaN(c.num); }); nc.sort(function (a, b) { return isTop ? b.num - a.num : a.num - b.num; }); var count = isPct ? Math.max(1, Math.round(nc.length * n / 100)) : n; var m = {}; nc.slice(0, count).forEach(function (c) { m[c.cn] = css; }); return m; }; }
    function cAvg(above, css) { return function (cells) { var nc = cells.filter(function (c) { return !isNaN(c.num); }); if (!nc.length) return {}; var avg = nc.reduce(function (s, c) { return s + c.num; }, 0) / nc.length; var m = {}; nc.forEach(function (c) { if (above ? c.num > avg : c.num < avg) m[c.cn] = css; }); return m; }; }
    function cDup(css) { return function (cells) { var counts = {}; cells.forEach(function (c) { if (c.raw !== '') counts[c.raw.toLowerCase()] = (counts[c.raw.toLowerCase()] || 0) + 1; }); var m = {}; cells.forEach(function (c) { if (c.raw !== '' && counts[c.raw.toLowerCase()] > 1) m[c.cn] = css; }); return m; }; }
    function cDataBars(color) { return function (cells) { var nc = cells.filter(function (c) { return !isNaN(c.num); }); if (!nc.length) return {}; var mm = minMaxC(nc), m = {}; nc.forEach(function (c) { var pct = Math.max(0, Math.min(100, Math.round((c.num - mm[0]) / (mm[1] - mm[0]) * 100))); m[c.cn] = { 'background': 'linear-gradient(90deg, ' + color + ' ' + pct + '%, transparent ' + pct + '%)' }; }); return m; }; }
    function cColourScale(stops) { return function (cells) { var nc = cells.filter(function (c) { return !isNaN(c.num); }); if (!nc.length) return {}; var mm = minMaxC(nc), m = {}; nc.forEach(function (c) { var t = (c.num - mm[0]) / (mm[1] - mm[0]); var col = stops.length === 2 ? mix(stops[0], stops[1], t) : (t < 0.5 ? mix(stops[0], stops[1], t * 2) : mix(stops[1], stops[2], (t - 0.5) * 2)); m[c.cn] = { 'background-color': col }; }); return m; }; }
    function cIcons(redHigh) { return function (cells) { var nc = cells.filter(function (c) { return !isNaN(c.num); }); if (!nc.length) return {}; var mm = minMaxC(nc), pal = redHigh ? ['#e03b3b', '#f0a020', '#2e9e3a'] : ['#2e9e3a', '#f0a020', '#e03b3b'], m = {}; nc.forEach(function (c) { var t = (c.num - mm[0]) / (mm[1] - mm[0]); var idx = t >= 2 / 3 ? 0 : (t >= 1 / 3 ? 1 : 2); m[c.cn] = { 'background-image': 'radial-gradient(circle at 9px center, ' + pal[idx] + ' 0 5px, transparent 6px)', 'background-repeat': 'no-repeat', 'padding-left': '20px' }; }); return m; }; }

    function reevaluate() {
      // 1. Work out the CF properties every rule wants on each cell, right now.
      var newCf = {}; // cn -> { prop: value }
      CF.rules.forEach(function (rule) {
        var contrib = rule.compute(rangeCells(rule.range));
        Object.keys(contrib).forEach(function (cn) {
          if (!newCf[cn]) newCf[cn] = {};
          var props = contrib[cn]; Object.keys(props).forEach(function (k) { newCf[cn][k] = props[k]; });
        });
      });
      // 2. Touch only cells that have (or had) CF, never the rest of the sheet.
      //    Write directly to each cell element so manual styles (alignment, borders,
      //    bold) are never disturbed — only the CF properties are changed.
      var cells = {};
      Object.keys(CF.applied).forEach(function (cn) { cells[cn] = true; });
      Object.keys(newCf).forEach(function (cn) { cells[cn] = true; });
      Object.keys(cells).forEach(function (cn) {
        var el = cellElOf(cn); if (!el) return;
        // Undo last time's CF: restore the underlying (manual) value of each CF prop.
        var prev = CF.applied[cn] || {};
        Object.keys(prev).forEach(function (prop) { if (prev[prop] === undefined) el.style.removeProperty(prop); else el.style.setProperty(prop, prev[prop]); });
        // Apply this time's CF, remembering what was underneath so we can restore it later.
        var now = {}, np = newCf[cn] || {};
        Object.keys(np).forEach(function (prop) { var cur = el.style.getPropertyValue(prop); now[prop] = cur ? cur : undefined; el.style.setProperty(prop, np[prop]); });
        if (Object.keys(now).length) CF.applied[cn] = now; else delete CF.applied[cn];
      });
    }
    function addRule(compute) { CF.rules.push({ range: { x1: sel.x1, y1: sel.y1, x2: sel.x2, y2: sel.y2 }, compute: compute }); reevaluate(); }
    function clearRules(allSheet) {
      if (allSheet) CF.rules = [];
      else CF.rules = CF.rules.filter(function (rule) { return !rangesOverlap(rule.range, sel); });
      reevaluate();
    }

    // Live update: re-evaluate every rule whenever a value changes (chained onchange).
    if (!sheet._cfHooked) {
      sheet._cfHooked = true;
      var prevChange = sheet.options.onchange;
      sheet.options.onchange = function (el, cell, x, y, value) {
        if (typeof prevChange === 'function') prevChange.apply(this, arguments);
        if (typeof sheet._jhnccRefreshFormulaFixes === 'function') setTimeout(sheet._jhnccRefreshFormulaFixes, 0);
        else setTimeout(function() { refreshNumberFormats(holder, sheet); }, 0);
        if (sheet._cf && sheet._cf.rules.length) setTimeout(reevaluate, 0);
      };
    }

    function cfModal(title, bodyHtml, onOk) {
      var ov = document.createElement('div'); ov.className = 'jhncc-modal-ov';
      ov.innerHTML = '<div class="jhncc-modal"><div class="jhncc-modal-h"><span>' + title + '</span><span class="jhncc-modal-x">&times;</span></div>' +
        '<div class="jhncc-modal-b">' + bodyHtml + '</div>' +
        '<div class="jhncc-modal-f"><button class="jhncc-modal-btn cancel">Cancel</button><button class="jhncc-modal-btn ok">OK</button></div></div>';
      document.body.appendChild(ov);
      function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
      ov.querySelector('.jhncc-modal-x').onclick = close;
      ov.querySelector('.cancel').onclick = close;
      ov.onclick = function (e) { if (e.target === ov) close(); };
      ov.querySelector('.ok').onclick = function () { if (onOk(ov) !== false) close(); };
      var fi = ov.querySelector('input,select'); if (fi) { try { fi.focus(); } catch (e) {} }
    }
    function dlgGT() { cfModal('Greater Than', 'Format cells that are GREATER THAN: <input class="v1" type="number" style="width:90px"> with ' + presetSelectHtml(), function (ov) { var v = parseFloat(ov.querySelector('.v1').value); if (isNaN(v)) return false; var css = presetCss(ov); addRule(cTest(function (c) { return !isNaN(c.num) && c.num > v; }, css)); }); }
    function dlgLT() { cfModal('Less Than', 'Format cells that are LESS THAN: <input class="v1" type="number" style="width:90px"> with ' + presetSelectHtml(), function (ov) { var v = parseFloat(ov.querySelector('.v1').value); if (isNaN(v)) return false; var css = presetCss(ov); addRule(cTest(function (c) { return !isNaN(c.num) && c.num < v; }, css)); }); }
    function dlgBT() { cfModal('Between', 'Format cells BETWEEN: <input class="v1" type="number" style="width:70px"> and <input class="v2" type="number" style="width:70px"> with ' + presetSelectHtml(), function (ov) { var a = parseFloat(ov.querySelector('.v1').value), b = parseFloat(ov.querySelector('.v2').value); if (isNaN(a) || isNaN(b)) return false; var lo = Math.min(a, b), hi = Math.max(a, b); var css = presetCss(ov); addRule(cTest(function (c) { return !isNaN(c.num) && c.num >= lo && c.num <= hi; }, css)); }); }
    function dlgEQ() { cfModal('Equal To', 'Format cells that are EQUAL TO: <input class="v1" style="width:110px"> with ' + presetSelectHtml(), function (ov) { var val = String(ov.querySelector('.v1').value).trim(); if (val === '') return false; var vn = parseFloat(val); var css = presetCss(ov); addRule(cTest(function (c) { return (!isNaN(vn) && !isNaN(c.num)) ? c.num === vn : c.raw.toLowerCase() === val.toLowerCase(); }, css)); }); }
    function dlgCONT() { cfModal('Text That Contains', 'Format cells that CONTAIN: <input class="v1" style="width:110px"> with ' + presetSelectHtml(), function (ov) { var val = String(ov.querySelector('.v1').value).trim(); if (val === '') return false; var css = presetCss(ov); addRule(cTest(function (c) { return c.raw.toLowerCase().indexOf(val.toLowerCase()) !== -1; }, css)); }); }
    function dlgDUP() { cfModal('Duplicate Values', 'Format DUPLICATE values with ' + presetSelectHtml(), function (ov) { addRule(cDup(presetCss(ov))); }); }
    function dlgTB(which, isPct) { cfModal(which + (isPct ? ' %' : ' Items'), 'Format the ' + which.toUpperCase() + ': <input class="v1" type="number" value="10" style="width:70px">' + (isPct ? '%' : '') + ' with ' + presetSelectHtml(), function (ov) { var n = parseFloat(ov.querySelector('.v1').value); if (isNaN(n) || n <= 0) return false; addRule(cTopBottom(n, isPct, which === 'Top', presetCss(ov))); }); }

    var MAIN_ITEMS = [
      { label: 'Highlight Cells Rules', submenu: [
        { label: 'Greater Than&hellip;', onClick: dlgGT }, { label: 'Less Than&hellip;', onClick: dlgLT },
        { label: 'Between&hellip;', onClick: dlgBT }, { label: 'Equal To&hellip;', onClick: dlgEQ },
        { label: 'Text that Contains&hellip;', onClick: dlgCONT }, { label: 'Duplicate Values&hellip;', onClick: dlgDUP } ] },
      { label: 'Top/Bottom Rules', submenu: [
        { label: 'Top 10 Items&hellip;', onClick: function () { dlgTB('Top', false); } },
        { label: 'Bottom 10 Items&hellip;', onClick: function () { dlgTB('Bottom', false); } },
        { label: 'Top 10%&hellip;', onClick: function () { dlgTB('Top', true); } },
        { label: 'Bottom 10%&hellip;', onClick: function () { dlgTB('Bottom', true); } },
        { label: 'Above Average', onClick: function () { addRule(cAvg(true, CF_PRESETS[0].css)); } },
        { label: 'Below Average', onClick: function () { addRule(cAvg(false, CF_PRESETS[2].css)); } } ] },
      { sep: true },
      { label: 'Data Bars', submenu: [
        { label: 'Blue', onClick: function () { addRule(cDataBars('#638ec6')); } }, { label: 'Green', onClick: function () { addRule(cDataBars('#63c384')); } },
        { label: 'Red', onClick: function () { addRule(cDataBars('#ff8f8f')); } }, { label: 'Orange', onClick: function () { addRule(cDataBars('#ffb84d')); } },
        { label: 'Purple', onClick: function () { addRule(cDataBars('#b39ddb')); } } ] },
      { label: 'Colour Scales', submenu: [
        { label: 'Green - Yellow - Red', onClick: function () { addRule(cColourScale([[99, 190, 123], [255, 235, 132], [248, 105, 107]])); } },
        { label: 'Red - Yellow - Green', onClick: function () { addRule(cColourScale([[248, 105, 107], [255, 235, 132], [99, 190, 123]])); } },
        { label: 'White - Blue', onClick: function () { addRule(cColourScale([[255, 255, 255], [99, 142, 198]])); } },
        { label: 'Blue - White - Red', onClick: function () { addRule(cColourScale([[90, 138, 198], [255, 255, 255], [230, 90, 90]])); } } ] },
      { label: 'Icon Sets', submenu: [
        { label: '3 Traffic Lights (green = high)', onClick: function () { addRule(cIcons(false)); } },
        { label: '3 Traffic Lights (red = high)', onClick: function () { addRule(cIcons(true)); } } ] },
      { sep: true },
      { label: 'Clear Rules', submenu: [
        { label: 'Clear Rules from Selected Cells', onClick: function () { clearRules(false); } },
        { label: 'Clear Rules from Entire Sheet', onClick: function () { clearRules(true); } } ] }
    ];

    var mainMenu = null, subMenu = null;
    function closeMenus() { [subMenu, mainMenu].forEach(function (m) { if (m && m.parentNode) m.parentNode.removeChild(m); }); mainMenu = subMenu = null; }
    function clampMenu(m) { var r = m.getBoundingClientRect(); if (r.right > window.innerWidth) m.style.left = Math.max(4, window.innerWidth - r.width - 4) + 'px'; if (r.bottom > window.innerHeight) m.style.top = Math.max(4, window.innerHeight - r.height - 4) + 'px'; }
    function buildMenuEl(items, onItem) {
      var menu = document.createElement('div'); menu.className = 'jhncc-menu';
      items.forEach(function (it) {
        if (it.sep) { var s = document.createElement('div'); s.className = 'jhncc-menu-sep'; menu.appendChild(s); return; }
        var el = document.createElement('div'); el.className = 'jhncc-menu-item';
        el.innerHTML = '<span>' + it.label + '</span>' + (it.submenu ? '<span class="jhncc-menu-arrow">&#9656;</span>' : '');
        el.onclick = function (ev) { ev.stopPropagation(); onItem(it, el); };
        menu.appendChild(el);
      });
      return menu;
    }
    function openMain(x, y) {
      closeMenus();
      mainMenu = buildMenuEl(MAIN_ITEMS, function (it, el) {
        if (it.submenu) {
          if (subMenu && subMenu.parentNode) subMenu.parentNode.removeChild(subMenu);
          var r = el.getBoundingClientRect();
          subMenu = buildMenuEl(it.submenu, function (sit) { closeMenus(); if (sit.onClick) sit.onClick(); });
          subMenu.style.left = (r.right - 3) + 'px'; subMenu.style.top = r.top + 'px';
          document.body.appendChild(subMenu); clampMenu(subMenu);
        } else { closeMenus(); if (it.onClick) it.onClick(); }
      });
      mainMenu.style.left = x + 'px'; mainMenu.style.top = y + 'px';
      document.body.appendChild(mainMenu); clampMenu(mainMenu);
    }
    document.addEventListener('mousedown', function (e) {
      if (!mainMenu) return;
      var t = e.target;
      if (t.closest && (t.closest('.jhncc-menu') || t.closest('.jhncc-cf-btn'))) return;
      closeMenus();
    });

    var cfBtn = btn('jhncc-cf-btn', 'Conditional Formatting &#9662;', 'Conditional formatting', function () {
      if (mainMenu) { closeMenus(); return; }
      var r = cfBtn.getBoundingClientRect(); openMain(r.left, r.bottom + 2);
    });

    // Place the toolbar at the very top of this sheet's stack (above the formula bar).
    var top = holder;
    while (top.previousElementSibling && top.previousElementSibling.classList &&
           top.previousElementSibling.classList.contains('jhncc-fbar')) {
      top = top.previousElementSibling;
    }
    top.parentNode.insertBefore(bar, top);
  };

  // Build a blank sheet that mirrors the primary sheet's column setup.
  function defaultMakeSheet(primary, containerEl) {
    var o = (primary && primary.options) || {};
    var cols = o.columns || [];
    var ncols = cols.length || (o.data && o.data[0] ? o.data[0].length : 6);
    var rows = (o.minDimensions && o.minDimensions[1]) || 10;
    var blank = [];
    for (var r = 0; r < rows; r++) blank.push(new Array(ncols).fill(''));
    return window.jspreadsheet(containerEl, {
      data: blank,
      columns: cols.map(function (c) { return Object.assign({}, c); }),
      minDimensions: [ncols, rows],
      tableOverflow: true,
      tableWidth: o.tableWidth || '100%',
      toolbar: o.toolbar !== undefined ? o.toolbar : true,
      about: false
    });
  }

  /*
   * Add an Excel-style sheet-tab bar (with a "+" to add more sheets) under a sheet.
   * The primary sheet becomes the first tab. New tabs are blank sheets that copy the
   * primary's column layout. Each sheet gets its own formula bar.
   *
   * JHNCCAddSheetTabs(holder, primaryInstance, { firstName, makeSheet });
   *   makeSheet(containerEl) -> instance   (optional; defaults to a blank clone)
   */
  window.JHNCCAddSheetTabs = function (holder, primary, opts) {
    if (!holder || !primary || !holder.parentNode) return;
    if (holder.closest && holder.closest('.jhncc-sheets')) return; // already wrapped
    opts = opts || {};
    ensureStyles();
    var makeSheet = typeof opts.makeSheet === 'function'
      ? opts.makeSheet
      : function (el) { return defaultMakeSheet(primary, el); };

    // The primary sheet may already have a format toolbar and/or formula bar above it.
    // Collect all such decoration siblings (in DOM order) so we can move them together.
    var decos = [];
    var prev = holder.previousElementSibling;
    while (prev && prev.classList &&
           (prev.classList.contains('jhncc-fbar') || prev.classList.contains('jhncc-toolbar'))) {
      decos.unshift(prev);
      prev = prev.previousElementSibling;
    }
    var hasToolbar = decos.some(function (d) { return d.classList.contains('jhncc-toolbar'); });
    var topNode = decos.length ? decos[0] : holder;
    var parent = topNode.parentNode;

    var wrapper = document.createElement('div');
    wrapper.className = 'jhncc-sheets';
    parent.insertBefore(wrapper, topNode);

    var panels = document.createElement('div');
    panels.className = 'jhncc-sheet-panels';
    wrapper.appendChild(panels);

    var tabbar = document.createElement('div');
    tabbar.className = 'jhncc-tabbar';
    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'jhncc-tab-add';
    addBtn.title = 'Add a sheet';
    addBtn.textContent = '+';

    var sheets = [];

    function selectIndex(idx) {
      sheets.forEach(function (sh, i) {
        sh.panel.style.display = (i === idx) ? 'block' : 'none';
        sh.tab.classList.toggle('active', i === idx);
      });
    }

    function makeTab(name) {
      var tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'jhncc-tab';
      tab.textContent = name;
      tab.onclick = function () {
        var i = sheets.findIndex(function (sh) { return sh.tab === tab; });
        if (i !== -1) selectIndex(i);
      };
      // Double-click to rename (Excel-like)
      tab.ondblclick = function () {
        var i = sheets.findIndex(function (sh) { return sh.tab === tab; });
        if (i === -1) return;
        var newName = prompt('Rename sheet:', sheets[i].name);
        if (newName && newName.trim()) {
          sheets[i].name = newName.trim();
          tab.textContent = sheets[i].name;
        }
      };
      return tab;
    }

    // First tab = the existing primary sheet. Move its [bar + holder] into a panel.
    // The holder often carries a bottom margin (e.g. Tailwind mb-5) which would leave a
    // gap between the sheet and the tab bar. Move that spacing to the whole widget instead.
    try {
      var holderMb = window.getComputedStyle(holder).marginBottom;
      if (holderMb && holderMb !== '0px') wrapper.style.marginBottom = holderMb;
      holder.style.marginBottom = '0';
    } catch (e) {}
    var panel0 = document.createElement('div');
    panel0.className = 'jhncc-sheet-panel';
    decos.forEach(function (d) { panel0.appendChild(d); });
    panel0.appendChild(holder);
    panels.appendChild(panel0);
    var tab0 = makeTab(opts.firstName || 'Sheet 1');
    sheets.push({ instance: primary, panel: panel0, tab: tab0, name: opts.firstName || 'Sheet 1' });
    tabbar.appendChild(tab0);
    tabbar.appendChild(addBtn);
    wrapper.appendChild(tabbar);
    selectIndex(0);

    // jspreadsheet calculated its pixel widths against the original container before
    // the DOM was restructured. Dispatch a resize event so it recalculates layout in
    // the new wrapper. Must be async so the browser has laid out the new structure first.
    setTimeout(function() {
      try { window.dispatchEvent(new Event('resize')); } catch(e) {}
    }, 0);

    addBtn.onclick = function () {
      var panel = document.createElement('div');
      panel.className = 'jhncc-sheet-panel';
      panels.appendChild(panel);
      var holderN = document.createElement('div');
      holderN.className = 'overflow-x-auto';
      panel.appendChild(holderN);
      // Make this panel visible BEFORE creating the sheet so jspreadsheet sizes correctly
      sheets.forEach(function (sh) { sh.panel.style.display = 'none'; });
      panel.style.display = 'block';
      var inst;
      try { inst = makeSheet(holderN); }
      catch (e) { panel.parentNode.removeChild(panel); selectIndex(sheets.length - 1); return; }
      if (window.JHNCCAddFormulaBar) window.JHNCCAddFormulaBar(holderN, inst);
      if (hasToolbar && window.JHNCCAddFormatToolbar) window.JHNCCAddFormatToolbar(holderN, inst);
      var name = 'Sheet ' + (sheets.length + 1);
      var tab = makeTab(name);
      tabbar.insertBefore(tab, addBtn);
      sheets.push({ instance: inst, panel: panel, tab: tab, name: name });
      selectIndex(sheets.length - 1);
    };

    return { sheets: sheets, select: selectIndex };
  };

  // Load the spreadsheet CSS + libraries (from local vendored copies), then run cb().
  // Lessons bootstrap by loading just this helper, then calling JHNCCLoadSheets.
  window.JHNCCLoadSheets = function (cb) {
    function lcss(u) {
      if (!document.querySelector('link[data-jhncc="' + u + '"]')) {
        var l = document.createElement('link');
        l.rel = 'stylesheet'; l.href = u; l.setAttribute('data-jhncc', u);
        document.head.appendChild(l);
      }
    }
    function ljs(u, next) {
      var ex = document.querySelector('script[data-jhncc-src="' + u + '"]');
      if (ex) {
        if (ex.getAttribute('data-loaded') === '1') next();
        else ex.addEventListener('load', function () { next(); });
        return;
      }
      var s = document.createElement('script');
      s.setAttribute('data-jhncc-src', u);
      s.src = u;
      s.onload = function () { s.setAttribute('data-loaded', '1'); next(); };
      s.onerror = function () { alert('The spreadsheet tool could not load. Please refresh the page and try again.'); };
      document.head.appendChild(s);
    }
    lcss('assets/css/jsuites.css');
    lcss('assets/css/jspreadsheet.css');
    ljs('assets/js/jsuites.js', function () {
      ljs('assets/js/jspreadsheet.js', function () {
        try { cb(); } catch (e) { console.error('Sheet build error:', e); }
      });
    });
  };
})();
