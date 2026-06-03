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
      '.jhncc-active-cell{box-shadow:inset 0 0 0 2px #107c41 !important}';
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

    // The primary sheet may already have a formula bar inserted before it.
    var bar = (holder.previousElementSibling &&
               holder.previousElementSibling.classList &&
               holder.previousElementSibling.classList.contains('jhncc-fbar'))
      ? holder.previousElementSibling : null;
    var topNode = bar || holder;
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
    var panel0 = document.createElement('div');
    panel0.className = 'jhncc-sheet-panel';
    if (bar) panel0.appendChild(bar);
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
      var name = 'Sheet ' + (sheets.length + 1);
      var tab = makeTab(name);
      tabbar.insertBefore(tab, addBtn);
      sheets.push({ instance: inst, panel: panel, tab: tab, name: name });
      selectIndex(sheets.length - 1);
    };

    return { sheets: sheets, select: selectIndex };
  };
})();
