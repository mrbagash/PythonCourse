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
      '.jhncc-tb-color{display:inline-flex;align-items:center;gap:3px;height:26px;padding:0 5px;' +
      'background:#fff;border:1px solid #d0d0d0;border-radius:3px;cursor:pointer;font-size:13px}' +
      '.jhncc-tb-color input{width:20px;height:18px;border:0;padding:0;background:none;cursor:pointer}' +
      '.jhncc-tb-sep{width:1px;align-self:stretch;background:#d0d0d0;margin:2px 4px}' +
      '.jhncc-cf-pop{border:1px solid #cfcfcf;background:#fff;border-radius:6px;padding:10px;' +
      'margin-top:6px;font-family:Calibri,"Segoe UI",Arial,sans-serif;font-size:13px;color:#222}' +
      '.jhncc-cf-pop select,.jhncc-cf-pop input{border:1px solid #c8c8c8;border-radius:4px;' +
      'padding:3px 6px;font-size:13px;margin:0 4px 4px 0}';
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

  window.JHNCCAddFormulaBar = function (holder, sheet) {
    if (!holder || !sheet || !holder.parentNode) return;
    if (holder.previousSibling && holder.previousSibling.classList &&
        holder.previousSibling.classList.contains('jhncc-fbar')) return; // already added
    ensureStyles();

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
      if (typeof prevSel === 'function') prevSel.apply(this, arguments);
    };

    function mergeStyle(cell, props) {
      var m = parseCss(sheet.getStyle(cell) || '');
      Object.keys(props).forEach(function (k) { if (props[k] === null) delete m[k]; else m[k] = props[k]; });
      return cssToString(m);
    }
    function applyToSelection(props) {
      var updates = {};
      for (var y = sel.y1; y <= sel.y2; y++) {
        for (var x = sel.x1; x <= sel.x2; x++) {
          var cn = colName(x) + (y + 1);
          updates[cn] = mergeStyle(cn, props);
        }
      }
      try { sheet.setStyle(updates); } catch (e) {}
    }
    function anchorHas(prop, val) {
      var cur = parseCss(sheet.getStyle(colName(sel.x1) + (sel.y1 + 1)) || '');
      return (cur[prop] || '').indexOf(val) !== -1;
    }
    function toggle(prop, val) { var p = {}; p[prop] = anchorHas(prop, val) ? null : val; applyToSelection(p); }

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

    btn('jhncc-tb-b', 'B', 'Bold', function () { toggle('font-weight', 'bold'); });
    btn('jhncc-tb-i', 'I', 'Italic', function () { toggle('font-style', 'italic'); });
    btn('jhncc-tb-u', 'U', 'Underline', function () { toggle('text-decoration', 'underline'); });
    sep();
    colorPicker('A', 'Font colour', '#c00000', function (v) { applyToSelection({ 'color': v }); });
    colorPicker('Fill', 'Fill (cell shading)', '#ffff00', function (v) { applyToSelection({ 'background-color': v }); });
    sep();
    btn('', 'Borders', 'Add borders to the selected cells', function () { applyToSelection({ 'border': '1px solid #444' }); });
    btn('', 'No border', 'Remove borders from the selected cells', function () { applyToSelection({ 'border': null }); });
    sep();
    btn('', '&#8676;', 'Align left', function () { applyToSelection({ 'text-align': 'left' }); });
    btn('', '&#8596;', 'Align centre', function () { applyToSelection({ 'text-align': 'center' }); });
    btn('', '&#8677;', 'Align right', function () { applyToSelection({ 'text-align': 'right' }); });
    sep();

    var cfPop = null;
    btn('', 'Conditional&hellip;', 'Conditional formatting', function () {
      if (cfPop) { cfPop.parentNode.removeChild(cfPop); cfPop = null; return; }
      cfPop = document.createElement('div');
      cfPop.className = 'jhncc-cf-pop';
      var grid0 = sheet.getData();
      var ncols = grid0[0] ? grid0[0].length : 6;
      var colOpts = '';
      for (var i = 0; i < ncols; i++) colOpts += '<option value="' + i + '">Column ' + colName(i) + '</option>';
      cfPop.innerHTML =
        '<div style="margin-bottom:6px"><strong>Highlight cells</strong> that meet a rule (e.g. make &ldquo;Shop&rdquo; stand out):</div>' +
        'in <select class="cf-col">' + colOpts + '</select> ' +
        '<select class="cf-op"><option value="eq">is equal to</option><option value="contains">contains</option><option value="gt">is greater than</option><option value="lt">is less than</option></select> ' +
        '<input class="cf-val" placeholder="value" style="width:90px"> ' +
        'colour <input class="cf-color" type="color" value="#ffe08a"> ' +
        '<button class="jhncc-tb-btn cf-apply">Apply</button>';
      bar.parentNode.insertBefore(cfPop, bar.nextSibling);
      cfPop.querySelector('.cf-apply').onclick = function () {
        var col = parseInt(cfPop.querySelector('.cf-col').value, 10);
        var op = cfPop.querySelector('.cf-op').value;
        var val = cfPop.querySelector('.cf-val').value;
        var colr = cfPop.querySelector('.cf-color').value;
        var grid = sheet.getData();
        var updates = {};
        for (var y = 0; y < grid.length; y++) {
          var s = String(grid[y][col] == null ? '' : grid[y][col]).trim();
          var num = parseFloat(s), vnum = parseFloat(val);
          var match = false;
          if (op === 'eq') match = s.toLowerCase() === String(val).trim().toLowerCase();
          else if (op === 'contains') match = val !== '' && s.toLowerCase().indexOf(String(val).trim().toLowerCase()) !== -1;
          else if (op === 'gt') match = !isNaN(num) && !isNaN(vnum) && num > vnum;
          else if (op === 'lt') match = !isNaN(num) && !isNaN(vnum) && num < vnum;
          if (match) { var cn = colName(col) + (y + 1); updates[cn] = mergeStyle(cn, { 'background-color': colr }); }
        }
        try { sheet.setStyle(updates); } catch (e) {}
        if (cfPop) { cfPop.parentNode.removeChild(cfPop); cfPop = null; }
      };
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
