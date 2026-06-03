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
      'font-size:13px;color:#222;background:#fff;font-family:Consolas,"Courier New",monospace}';
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

    function rawValue(x, y) {
      try {
        var v = sheet.getValueFromCoords(x, y, false); // false => raw value (the formula text)
        return v == null ? '' : String(v);
      } catch (e) { return ''; }
    }

    function show(x, y) {
      if (x == null || y == null) return;
      cur.x = x; cur.y = y;
      ref.textContent = colName(x) + (y + 1);
      input.value = rawValue(x, y);
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
})();
