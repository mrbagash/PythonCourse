/*
 * JHNCC chart addon for jspreadsheet-ce v4.
 * Adds a Chart.js chart below a sheet with an Excel-style right-click menu:
 *   - Change Chart Type (column, bar, line, pie, doughnut)
 *   - Select Data Source (choose series columns and label column)
 *   - Delete Chart
 *
 * Usage (after JHNCCAddFormulaBar / JHNCCAddFormatToolbar / JHNCCAddSheetTabs):
 *   JHNCCAddChart(document.getElementById('my-sheet'), sheetInstance);
 *   JHNCCAddChart(el, sheet, { type: 'pie', labelCol: 0, series: [1] });
 *
 * Returns a controller: { setType(t), update(), destroy() }
 */
(function () {
  if (window.JHNCCAddChart) return;

  var CHARTJS_URL = 'assets/js/chart.umd.min.js';

  // Excel-style palette
  var PALETTE = [
    '#4472C4','#ED7D31','#A9D18E','#FFC000','#5B9BD5',
    '#70AD47','#255E91','#9E480E','#997300','#636363',
    '#C00000','#FF0000','#7030A0','#00B0F0','#92D050'
  ];

  var CHART_TYPES = [
    { id: 'column',   label: 'Column' },
    { id: 'bar',      label: 'Bar (horizontal)' },
    { id: 'line',     label: 'Line' },
    { id: 'pie',      label: 'Pie' },
    { id: 'doughnut', label: 'Doughnut' }
  ];

  // ── Chart.js loader ──────────────────────────────────────────
  function loadChartJs(cb) {
    if (window.Chart) { cb(); return; }
    var ex = document.querySelector('script[data-jhncc-chartjs]');
    if (ex) { ex.addEventListener('load', cb); return; }
    var s = document.createElement('script');
    s.setAttribute('data-jhncc-chartjs', '1');
    s.src = CHARTJS_URL;
    s.onload = cb;
    s.onerror = function () {
      console.error('JHNCCAddChart: failed to load Chart.js from CDN.');
    };
    document.head.appendChild(s);
  }

  // ── Styles ───────────────────────────────────────────────────
  function ensureStyles() {
    if (document.getElementById('jhncc-chart-styles')) return;
    var s = document.createElement('style');
    s.id = 'jhncc-chart-styles';
    s.textContent =
      /* chart container */
      '.jhncc-chart-outer{width:100%;margin-top:0;padding:14px 14px 10px;box-sizing:border-box;' +
        'background:#fff;border:1px solid #d6d6d6;border-top:none;border-radius:0 0 4px 4px;' +
        'font-family:Calibri,"Segoe UI",Arial,sans-serif}' +
      '.jhncc-chart-canvas{display:block;width:100%!important;max-height:280px}' +
      /* Select Data modal */
      '.jhncc-sd-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;min-width:480px}' +
      '.jhncc-sd-panel-head{font-size:12px;font-weight:700;color:#444;text-transform:uppercase;' +
        'letter-spacing:.04em;padding:6px 10px;background:#f3f3f3;' +
        'border:1px solid #d0d0d0;border-radius:3px 3px 0 0}' +
      '.jhncc-sd-list{border:1px solid #d0d0d0;border-top:none;border-radius:0 0 3px 3px;' +
        'max-height:200px;overflow-y:auto}' +
      '.jhncc-sd-row{display:flex;align-items:center;gap:8px;padding:5px 10px;' +
        'font-size:13px;color:#222;cursor:pointer;' +
        'font-family:Calibri,"Segoe UI",Arial,sans-serif}' +
      '.jhncc-sd-row:hover{background:#eef4ff}' +
      '.jhncc-sd-row input{accent-color:#107c41;cursor:pointer;width:14px;height:14px;flex-shrink:0}' +
      /* context menu (mirrors jhncc-menu from formula-bar if not already loaded) */
      '.jhncc-menu{position:fixed;z-index:10000;background:#fff;border:1px solid #b0b0b0;' +
        'border-radius:4px;box-shadow:0 4px 18px rgba(0,0,0,.22);min-width:190px;padding:4px 0;' +
        'font-family:Calibri,"Segoe UI",Arial,sans-serif;font-size:13px;color:#222}' +
      '.jhncc-menu-item{display:flex;justify-content:space-between;align-items:center;gap:18px;' +
        'padding:6px 14px;cursor:pointer;white-space:nowrap}' +
      '.jhncc-menu-item:hover{background:#eef4ff}' +
      '.jhncc-menu-sep{height:1px;background:#e3e3e3;margin:4px 0}' +
      '.jhncc-menu-arrow{color:#999;font-size:11px}' +
      /* modal (mirrors jhncc-modal from formula-bar if not already loaded) */
      '.jhncc-modal-ov{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:10001;' +
        'display:flex;align-items:center;justify-content:center}' +
      '.jhncc-modal{background:#fff;border-radius:8px;min-width:360px;max-width:94vw;' +
        'box-shadow:0 12px 44px rgba(0,0,0,.3);font-family:Calibri,"Segoe UI",Arial,sans-serif}' +
      '.jhncc-modal-h{display:flex;justify-content:space-between;align-items:center;' +
        'padding:12px 16px;font-weight:700;font-size:15px;border-bottom:1px solid #eee}' +
      '.jhncc-modal-x{cursor:pointer;color:#888;font-size:20px;line-height:1}' +
      '.jhncc-modal-b{padding:16px;font-size:14px;color:#222}' +
      '.jhncc-modal-f{display:flex;justify-content:flex-end;gap:8px;' +
        'padding:12px 16px;border-top:1px solid #eee}' +
      '.jhncc-modal-btn{padding:6px 18px;border-radius:5px;border:1px solid #c8c8c8;' +
        'cursor:pointer;font-size:13px;background:#fff;font-family:inherit}' +
      '.jhncc-modal-btn.ok{background:#107c41;color:#fff;border-color:#107c41}';
    document.head.appendChild(s);
  }

  // ── Shared modal helper ──────────────────────────────────────
  function showModal(title, bodyHtml, onOk) {
    var ov = document.createElement('div');
    ov.className = 'jhncc-modal-ov';
    ov.innerHTML =
      '<div class="jhncc-modal">' +
        '<div class="jhncc-modal-h"><span>' + title + '</span>' +
          '<span class="jhncc-modal-x">&times;</span></div>' +
        '<div class="jhncc-modal-b">' + bodyHtml + '</div>' +
        '<div class="jhncc-modal-f">' +
          '<button class="jhncc-modal-btn cancel">Cancel</button>' +
          '<button class="jhncc-modal-btn ok">OK</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.querySelector('.jhncc-modal-x').onclick = close;
    ov.querySelector('.cancel').onclick = close;
    ov.onclick = function (e) { if (e.target === ov) close(); };
    ov.querySelector('.ok').onclick = function () { if (onOk(ov) !== false) close(); };
    var fi = ov.querySelector('input,select');
    if (fi) try { fi.focus(); } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Main function ────────────────────────────────────────────
  window.JHNCCAddChart = function (holder, sheet, opts) {
    opts = opts || {};
    ensureStyles();

    // Mutable chart state
    var ctype    = opts.type     || 'bar';
    var labelCol = opts.labelCol != null ? opts.labelCol : 0;
    var series   = opts.series   ? opts.series.slice() : null; // null = auto-detect

    function resolvedSeries() {
      if (series !== null) return series;
      var hdr = (sheet.getData()[0] || []);
      var cols = [];
      for (var i = 0; i < hdr.length; i++) { if (i !== labelCol) cols.push(i); }
      return cols;
    }

    function buildData() {
      var raw = sheet.getData();
      if (!raw.length) return { labels: [], datasets: [] };
      var headers = raw[0] || [];
      var rows = raw.slice(1).filter(function (r) {
        // Only include rows where the label column has a value — this prevents
        // raw-data rows with an empty label column from appearing in the chart
        // when the sheet contains both a summary table and a raw data block.
        return r[labelCol] !== '' && r[labelCol] != null;
      });
      var sc = resolvedSeries();
      var labels = rows.map(function (r) {
        return String(r[labelCol] == null ? '' : r[labelCol]);
      });
      var isPie = ctype === 'pie' || ctype === 'doughnut';

      if (isPie) {
        var col = sc.length ? sc[0] : (labelCol === 0 ? 1 : 0);
        return {
          labels: labels,
          datasets: [{
            label: String(headers[col] == null ? '' : headers[col]),
            data: rows.map(function (r) { return parseFloat(r[col]) || 0; }),
            backgroundColor: PALETTE.slice(0, rows.length),
            borderWidth: 1,
            borderColor: '#fff'
          }]
        };
      }

      return {
        labels: labels,
        datasets: sc.map(function (col, idx) {
          var color = PALETTE[idx % PALETTE.length];
          var isLine = ctype === 'line';
          return {
            label: String(headers[col] == null ? '' : headers[col]),
            data: rows.map(function (r) { return parseFloat(r[col]) || 0; }),
            backgroundColor: isLine ? color + '22' : color,
            borderColor: color,
            borderWidth: isLine ? 2 : 0,
            fill: isLine,
            tension: 0.3,
            pointRadius: isLine ? 3 : 0,
            pointBackgroundColor: color
          };
        })
      };
    }

    // ── DOM ───────────────────────────────────────────────────
    var outer = document.createElement('div');
    outer.className = 'jhncc-chart-outer';
    var canvas = document.createElement('canvas');
    canvas.className = 'jhncc-chart-canvas';
    outer.appendChild(canvas);

    // Insert immediately after the sheet tabs wrapper (or the holder itself)
    var anchor = (holder.closest && holder.closest('.jhncc-sheets')) || holder;
    if (anchor.nextSibling) anchor.parentNode.insertBefore(outer, anchor.nextSibling);
    else anchor.parentNode.appendChild(outer);

    var chartInst = null;

    function ajsType() {
      // Chart.js uses 'bar' for both column (vertical) and bar (horizontal)
      return (ctype === 'column' || ctype === 'bar') ? 'bar' : ctype;
    }

    function render() {
      loadChartJs(function () {
        if (chartInst) { chartInst.destroy(); chartInst = null; }
        var cd    = buildData();
        var isHBar = ctype === 'bar';
        var isPie  = ctype === 'pie' || ctype === 'doughnut';
        chartInst = new Chart(canvas, {
          type: ajsType(),
          data: cd,
          options: {
            responsive: true,
            maintainAspectRatio: true,
            indexAxis: isHBar ? 'y' : 'x',
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  font: { family: 'Calibri,"Segoe UI",Arial,sans-serif', size: 12 },
                  padding: 14
                }
              },
              tooltip: { enabled: true }
            },
            scales: isPie ? {} : {
              x: { ticks: { font: { family: 'Calibri,"Segoe UI",Arial', size: 11 } } },
              y: { ticks: { font: { family: 'Calibri,"Segoe UI",Arial', size: 11 } } }
            }
          }
        });
      });
    }

    function update() {
      if (!chartInst) { render(); return; }
      chartInst.data = buildData();
      chartInst.update();
    }

    render();

    // Auto-update when sheet values change
    var prevChange = sheet.options.onchange;
    sheet.options.onchange = function (el, cell, x, y, val) {
      if (typeof prevChange === 'function') prevChange.apply(this, arguments);
      setTimeout(update, 0);
    };

    // ── Context menu ─────────────────────────────────────────
    var ctxMenu = null, subMenu = null;

    function closeMenus() {
      [subMenu, ctxMenu].forEach(function (m) {
        if (m && m.parentNode) m.parentNode.removeChild(m);
      });
      ctxMenu = subMenu = null;
    }

    document.addEventListener('mousedown', function (e) {
      if (!ctxMenu) return;
      if (!ctxMenu.contains(e.target) && (!subMenu || !subMenu.contains(e.target))) closeMenus();
    });

    canvas.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      closeMenus();
      ctxMenu = buildContextMenu();
      ctxMenu.style.position = 'fixed';
      document.body.appendChild(ctxMenu);
      clamp(ctxMenu, e.clientX, e.clientY);
    });

    function clamp(el, x, y) {
      el.style.left = x + 'px'; el.style.top = y + 'px';
      var r = el.getBoundingClientRect();
      if (r.right  > window.innerWidth)  el.style.left = Math.max(4, window.innerWidth  - r.width  - 4) + 'px';
      if (r.bottom > window.innerHeight) el.style.top  = Math.max(4, window.innerHeight - r.height - 4) + 'px';
    }

    function mItem(html, hasArrow) {
      var el = document.createElement('div');
      el.className = 'jhncc-menu-item';
      el.innerHTML = '<span>' + html + '</span>' +
        (hasArrow ? '<span class="jhncc-menu-arrow">&#9656;</span>' : '');
      return el;
    }

    function buildContextMenu() {
      var menu = document.createElement('div');
      menu.className = 'jhncc-menu';

      // Change Chart Type → submenu
      var typeEl = mItem('Change Chart Type…', true);
      typeEl.onmouseenter = function () {
        if (subMenu && subMenu.parentNode) subMenu.parentNode.removeChild(subMenu);
        subMenu = document.createElement('div');
        subMenu.className = 'jhncc-menu';
        subMenu.style.position = 'fixed';
        CHART_TYPES.forEach(function (t) {
          var isCur = t.id === ctype;
          var row = mItem((isCur ? '✓ ' : '  ') + t.label, false);
          row.onclick = function () { ctype = t.id; closeMenus(); render(); };
          subMenu.appendChild(row);
        });
        var r = typeEl.getBoundingClientRect();
        subMenu.style.left = r.right + 'px';
        subMenu.style.top  = r.top   + 'px';
        document.body.appendChild(subMenu);
        var sr = subMenu.getBoundingClientRect();
        if (sr.right  > window.innerWidth)  subMenu.style.left = (r.left - sr.width) + 'px';
        if (sr.bottom > window.innerHeight) subMenu.style.top  = (window.innerHeight - sr.height - 4) + 'px';
      };
      typeEl.onmouseleave = function (e) {
        if (subMenu && !subMenu.contains(e.relatedTarget)) {
          if (subMenu.parentNode) subMenu.parentNode.removeChild(subMenu);
          subMenu = null;
        }
      };

      // Select Data
      var dataEl = mItem('Select Data…', false);
      dataEl.onclick = function () { closeMenus(); showSelectData(); };

      var sep = document.createElement('div');
      sep.className = 'jhncc-menu-sep';

      // Delete Chart
      var delEl = mItem('Delete Chart', false);
      delEl.onclick = function () {
        closeMenus();
        if (chartInst) { chartInst.destroy(); chartInst = null; }
        if (outer.parentNode) outer.parentNode.removeChild(outer);
      };

      menu.appendChild(typeEl);
      menu.appendChild(dataEl);
      menu.appendChild(sep);
      menu.appendChild(delEl);
      return menu;
    }

    // ── Select Data Source modal ─────────────────────────────
    function showSelectData() {
      var raw     = sheet.getData();
      var headers = raw[0] || [];
      var sc      = resolvedSeries();
      var serHtml = '', lblHtml = '';

      for (var i = 0; i < headers.length; i++) {
        var name   = esc(String(headers[i] == null ? 'Column ' + (i + 1) : headers[i]));
        var inSer  = sc.indexOf(i) !== -1;
        var isLbl  = i === labelCol;
        serHtml += '<div class="jhncc-sd-row">' +
          '<input type="checkbox" class="jhncc-sd-ser" data-col="' + i + '"' + (inSer ? ' checked' : '') + '> ' +
          name + '</div>';
        lblHtml += '<div class="jhncc-sd-row">' +
          '<input type="radio" name="jhncc-sd-lbl" value="' + i + '"' + (isLbl ? ' checked' : '') + '> ' +
          name + '</div>';
      }

      var body =
        '<div class="jhncc-sd-grid">' +
          '<div>' +
            '<div class="jhncc-sd-panel-head">Legend Entries (Series)</div>' +
            '<div class="jhncc-sd-list">' + serHtml + '</div>' +
          '</div>' +
          '<div>' +
            '<div class="jhncc-sd-panel-head">Horizontal (Category) Axis Labels</div>' +
            '<div class="jhncc-sd-list">' + lblHtml + '</div>' +
          '</div>' +
        '</div>';

      showModal('Select Data Source', body, function (ov) {
        // Read label column
        ov.querySelectorAll('input[name="jhncc-sd-lbl"]').forEach(function (r) {
          if (r.checked) labelCol = parseInt(r.value, 10);
        });
        // Read series columns
        series = [];
        ov.querySelectorAll('.jhncc-sd-ser').forEach(function (cb) {
          if (cb.checked) series.push(parseInt(cb.dataset.col, 10));
        });
        render();
      });
    }

    // Public controller
    return {
      setType:   function (t) { ctype = t; render(); },
      update:    update,
      getConfig: function () {
        return { type: ctype, labelCol: labelCol, series: series ? series.slice() : null };
      },
      destroy: function () {
        if (chartInst) { chartInst.destroy(); chartInst = null; }
        if (outer.parentNode) outer.parentNode.removeChild(outer);
      }
    };
  };
})();
