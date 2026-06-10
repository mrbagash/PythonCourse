/*
 * JHNCC chart addon for jspreadsheet-ce v4.
 * Charts float over the spreadsheet as draggable, resizable overlays — matching
 * Excel's embedded chart behaviour. Right-click the chart for Change Chart Type,
 * Select Data and Delete. A fullscreen button on the sheet container expands the
 * whole view.
 *
 * Usage (after JHNCCAddFormulaBar / JHNCCAddFormatToolbar / JHNCCAddSheetTabs):
 *   JHNCCAddChart(document.getElementById('my-sheet'), sheetInstance);
 *   JHNCCAddChart(el, sheet, { type: 'pie', labelCol: 0, series: [1], x: 200, y: 20, width: 380, height: 270 });
 *
 * Returns a controller: { setType(t), update(), getConfig(), destroy() }
 */
(function () {
  if (window.JHNCCAddChart) return;

  var CHARTJS_URL = 'assets/js/chart.umd.min.js';

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

  // ── Asset loader ─────────────────────────────────────────────
  function loadChartJs(cb) {
    if (window.Chart) { cb(); return; }
    var ex = document.querySelector('script[data-jhncc-chartjs]');
    if (ex) { ex.addEventListener('load', cb); return; }
    var s = document.createElement('script');
    s.setAttribute('data-jhncc-chartjs', '1');
    s.src = CHARTJS_URL;
    s.onload = cb;
    s.onerror = function () { console.error('JHNCCAddChart: failed to load Chart.js.'); };
    document.head.appendChild(s);
  }

  // ── Styles ───────────────────────────────────────────────────
  function ensureStyles() {
    if (document.getElementById('jhncc-chart-styles')) return;
    var s = document.createElement('style');
    s.id = 'jhncc-chart-styles';
    s.textContent =
      /* ── host container ── */
      '.jhncc-chart-host{position:relative;min-height:420px}' +
      '.jhncc-chart-host.jhncc-fullscreen{position:fixed!important;inset:0!important;' +
        'z-index:9999!important;background:#fff;overflow:auto;border-radius:0!important;' +
        'border:none!important;min-height:100vh!important}' +

      /* ── fullscreen toggle button ── */
      '.jhncc-chart-fsBtn{position:absolute;top:6px;right:6px;z-index:300;width:26px;height:26px;' +
        'background:rgba(255,255,255,0.92);border:1px solid #c8c8c8;border-radius:4px;' +
        'cursor:pointer;font-size:14px;line-height:1;display:flex;align-items:center;' +
        'justify-content:center;color:#444;padding:0;font-family:inherit}' +
      '.jhncc-chart-fsBtn:hover{background:#eef4ff;border-color:#9cc0ff;color:#222}' +

      /* ── floating chart frame ── */
      '.jhncc-chart-float{position:absolute;display:flex;flex-direction:column;' +
        'background:#fff;border:2px solid #107c41;border-radius:3px;' +
        'box-shadow:2px 4px 20px rgba(0,0,0,.22);min-width:200px;min-height:160px;z-index:200}' +
      '.jhncc-chart-float:focus{outline:none}' +

      /* ── title bar (drag handle) ── */
      '.jhncc-chart-float-bar{display:flex;align-items:center;gap:6px;padding:4px 6px;' +
        'background:#f2f2f2;border-bottom:1px solid #d6d6d6;cursor:move;user-select:none;' +
        'border-radius:1px 1px 0 0;flex-shrink:0}' +
      '.jhncc-chart-float-title{flex:1;font-size:11px;color:#555;pointer-events:none;' +
        'font-family:Calibri,"Segoe UI",Arial,sans-serif;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}' +
      '.jhncc-chart-float-btn{width:20px;height:20px;border:none;background:transparent;' +
        'cursor:pointer;display:flex;align-items:center;justify-content:center;' +
        'font-size:14px;color:#666;border-radius:3px;padding:0;flex-shrink:0;line-height:1}' +
      '.jhncc-chart-float-btn:hover{background:#ddd;color:#222}' +

      /* ── canvas body ── */
      '.jhncc-chart-float-body{flex:1;min-height:0;overflow:hidden;padding:6px;' +
        'display:flex;align-items:stretch}' +
      '.jhncc-chart-float-body canvas{flex:1;min-width:0;min-height:0;' +
        'width:100%!important;height:100%!important}' +

      /* ── resize handle — bottom-right triangle ── */
      '.jhncc-chart-float-resize{position:absolute;bottom:0;right:0;width:0;height:0;' +
        'border-style:solid;border-width:0 0 14px 14px;' +
        'border-color:transparent transparent #107c41 transparent;' +
        'cursor:se-resize;border-radius:0 0 2px 0}' +

      /* ── reuse / fallback for menus & modals ── */
      '.jhncc-menu{position:fixed;z-index:10000;background:#fff;border:1px solid #b0b0b0;' +
        'border-radius:4px;box-shadow:0 4px 18px rgba(0,0,0,.22);min-width:190px;padding:4px 0;' +
        'font-family:Calibri,"Segoe UI",Arial,sans-serif;font-size:13px;color:#222}' +
      '.jhncc-menu-item{display:flex;justify-content:space-between;align-items:center;gap:18px;' +
        'padding:6px 14px;cursor:pointer;white-space:nowrap}' +
      '.jhncc-menu-item:hover{background:#eef4ff}' +
      '.jhncc-menu-sep{height:1px;background:#e3e3e3;margin:4px 0}' +
      '.jhncc-menu-arrow{color:#999;font-size:11px}' +
      '.jhncc-modal-ov{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:10001;' +
        'display:flex;align-items:center;justify-content:center}' +
      '.jhncc-modal{background:#fff;border-radius:8px;min-width:360px;max-width:94vw;' +
        'box-shadow:0 12px 44px rgba(0,0,0,.3);font-family:Calibri,"Segoe UI",Arial,sans-serif}' +
      '.jhncc-modal-h{display:flex;justify-content:space-between;align-items:center;' +
        'padding:12px 16px;font-weight:700;font-size:15px;border-bottom:1px solid #eee}' +
      '.jhncc-modal-x{cursor:pointer;color:#888;font-size:20px;line-height:1}' +
      '.jhncc-modal-b{padding:16px;font-size:14px;color:#222}' +
      '.jhncc-modal-f{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid #eee}' +
      '.jhncc-modal-btn{padding:6px 18px;border-radius:5px;border:1px solid #c8c8c8;' +
        'cursor:pointer;font-size:13px;background:#fff;font-family:inherit}' +
      '.jhncc-modal-btn.ok{background:#107c41;color:#fff;border-color:#107c41}' +
      '.jhncc-sd-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;min-width:480px}' +
      '.jhncc-sd-panel-head{font-size:12px;font-weight:700;color:#444;text-transform:uppercase;' +
        'letter-spacing:.04em;padding:6px 10px;background:#f3f3f3;border:1px solid #d0d0d0;border-radius:3px 3px 0 0}' +
      '.jhncc-sd-list{border:1px solid #d0d0d0;border-top:none;border-radius:0 0 3px 3px;max-height:200px;overflow-y:auto}' +
      '.jhncc-sd-row{display:flex;align-items:center;gap:8px;padding:5px 10px;font-size:13px;color:#222;cursor:pointer;' +
        'font-family:Calibri,"Segoe UI",Arial,sans-serif}' +
      '.jhncc-sd-row:hover{background:#eef4ff}' +
      '.jhncc-sd-row input{accent-color:#107c41;cursor:pointer;width:14px;height:14px;flex-shrink:0}';
    document.head.appendChild(s);
  }

  // ── Shared modal ─────────────────────────────────────────────
  function showModal(title, bodyHtml, onOk) {
    var ov = document.createElement('div');
    ov.className = 'jhncc-modal-ov';
    ov.innerHTML =
      '<div class="jhncc-modal"><div class="jhncc-modal-h"><span>' + title + '</span>' +
        '<span class="jhncc-modal-x">&times;</span></div>' +
      '<div class="jhncc-modal-b">' + bodyHtml + '</div>' +
      '<div class="jhncc-modal-f">' +
        '<button class="jhncc-modal-btn cancel">Cancel</button>' +
        '<button class="jhncc-modal-btn ok">OK</button>' +
      '</div></div>';
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

  // ── Fullscreen button ────────────────────────────────────────
  function addFullscreenBtn(anchor) {
    if (anchor.querySelector('.jhncc-chart-fsBtn')) return;
    var btn = document.createElement('button');
    btn.className = 'jhncc-chart-fsBtn';
    btn.title = 'Toggle fullscreen (Esc to exit)';
    btn.innerHTML = '&#x26F6;'; // ⛶
    btn.onclick = function () {
      var isFs = anchor.classList.toggle('jhncc-fullscreen');
      btn.innerHTML = isFs ? '&#x2715;' : '&#x26F6;';
      // Trigger Chart.js resize after the CSS transition settles
      setTimeout(function () {
        window.dispatchEvent(new Event('resize'));
      }, 50);
    };
    anchor.appendChild(btn);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && anchor.classList.contains('jhncc-fullscreen')) {
        anchor.classList.remove('jhncc-fullscreen');
        btn.innerHTML = '&#x26F6;';
        setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 50);
      }
    });
  }

  // ── Main ─────────────────────────────────────────────────────
  window.JHNCCAddChart = function (holder, sheet, opts) {
    opts = opts || {};
    ensureStyles();

    var ctype    = opts.type     || 'bar';
    var labelCol = opts.labelCol != null ? opts.labelCol : 0;
    var series   = opts.series   ? opts.series.slice() : null;

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
            borderWidth: 1, borderColor: '#fff'
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
            fill: isLine, tension: 0.3,
            pointRadius: isLine ? 3 : 0,
            pointBackgroundColor: color
          };
        })
      };
    }

    // ── Find / create the host container ─────────────────────
    // Prefer an existing .jhncc-sheets wrapper (created by JHNCCAddSheetTabs).
    // Otherwise wrap the holder in a new relative-positioned div so the chart
    // can be positioned absolutely inside it without disturbing page layout.
    var anchor = holder.closest && holder.closest('.jhncc-sheets');
    if (!anchor) {
      anchor = document.createElement('div');
      anchor.className = 'jhncc-chart-host-wrap';
      holder.parentNode.insertBefore(anchor, holder);
      anchor.appendChild(holder);
    }
    anchor.classList.add('jhncc-chart-host');
    addFullscreenBtn(anchor);

    // ── Build the floating frame ──────────────────────────────
    var FW = opts.width  || 380;
    var FH = opts.height || 270;
    // Default x: 40 % across the container width; default y: 20px from top
    var FX = opts.x != null ? opts.x : Math.max(10, ((anchor.offsetWidth || 640) * 0.38) | 0);
    var FY = opts.y != null ? opts.y : 20;

    var floater = document.createElement('div');
    floater.className = 'jhncc-chart-float';
    floater.style.cssText = 'left:' + FX + 'px;top:' + FY + 'px;width:' + FW + 'px;height:' + FH + 'px;';
    floater.tabIndex = -1; // makes it focusable so clicks register correctly

    // Title bar
    var titleBar = document.createElement('div');
    titleBar.className = 'jhncc-chart-float-bar';

    var titleSpan = document.createElement('span');
    titleSpan.className = 'jhncc-chart-float-title';
    titleSpan.textContent = 'Chart Area';

    var btnDelete = document.createElement('button');
    btnDelete.className = 'jhncc-chart-float-btn';
    btnDelete.innerHTML = '&times;';
    btnDelete.title = 'Delete chart';

    titleBar.appendChild(titleSpan);
    titleBar.appendChild(btnDelete);

    // Canvas body
    var body = document.createElement('div');
    body.className = 'jhncc-chart-float-body';
    var canvas = document.createElement('canvas');
    body.appendChild(canvas);

    // Resize handle
    var resizeHandle = document.createElement('div');
    resizeHandle.className = 'jhncc-chart-float-resize';
    resizeHandle.title = 'Drag to resize';

    floater.appendChild(titleBar);
    floater.appendChild(body);
    floater.appendChild(resizeHandle);
    anchor.appendChild(floater);

    // ── Drag ─────────────────────────────────────────────────
    var drag = null;
    titleBar.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      drag = {
        sx: e.clientX, sy: e.clientY,
        lx: parseInt(floater.style.left) || 0,
        ty: parseInt(floater.style.top)  || 0
      };
      floater.style.transition = 'none';
      e.preventDefault();
    });

    // ── Resize ───────────────────────────────────────────────
    var resz = null;
    resizeHandle.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      resz = {
        sx: e.clientX, sy: e.clientY,
        w0: floater.offsetWidth, h0: floater.offsetHeight
      };
      e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
      if (drag) {
        floater.style.left = Math.max(0, drag.lx + e.clientX - drag.sx) + 'px';
        floater.style.top  = Math.max(0, drag.ty + e.clientY - drag.sy) + 'px';
      }
      if (resz) {
        floater.style.width  = Math.max(200, resz.w0 + e.clientX - resz.sx) + 'px';
        floater.style.height = Math.max(150, resz.h0 + e.clientY - resz.sy) + 'px';
        if (chartInst) chartInst.resize();
      }
    });
    document.addEventListener('mouseup', function () {
      drag = null;
      resz = null;
    });

    // ── Chart rendering ───────────────────────────────────────
    var chartInst = null;

    function ajsType() {
      return (ctype === 'column' || ctype === 'bar') ? 'bar' : ctype;
    }

    function render() {
      loadChartJs(function () {
        if (chartInst) { chartInst.destroy(); chartInst = null; }
        var isPie = ctype === 'pie' || ctype === 'doughnut';
        chartInst = new Chart(canvas, {
          type: ajsType(),
          data: buildData(),
          options: {
            responsive: true,
            maintainAspectRatio: false, // fills the resizable frame
            indexAxis: ctype === 'bar' ? 'y' : 'x',
            plugins: {
              legend: {
                position: 'bottom',
                labels: { font: { family: 'Calibri,"Segoe UI",Arial', size: 11 }, padding: 10 }
              },
              tooltip: { enabled: true }
            },
            scales: isPie ? {} : {
              x: { ticks: { font: { family: 'Calibri,"Segoe UI",Arial', size: 10 } } },
              y: { ticks: { font: { family: 'Calibri,"Segoe UI",Arial', size: 10 } } }
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

    // Defer first render one frame so the floater has layout dimensions
    requestAnimationFrame(render);

    // Live update when sheet values change
    var prevChange = sheet.options.onchange;
    sheet.options.onchange = function (el, cell, x, y, val) {
      if (typeof prevChange === 'function') prevChange.apply(this, arguments);
      setTimeout(update, 0);
    };

    // Delete button
    btnDelete.onclick = function () {
      if (chartInst) { chartInst.destroy(); chartInst = null; }
      if (floater.parentNode) floater.parentNode.removeChild(floater);
    };

    // ── Right-click context menu ──────────────────────────────
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
      ctxMenu = buildMenu();
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

    function buildMenu() {
      var menu = document.createElement('div');
      menu.className = 'jhncc-menu';

      var typeEl = mItem('Change Chart Type…', true);
      typeEl.onmouseenter = function () {
        if (subMenu && subMenu.parentNode) subMenu.parentNode.removeChild(subMenu);
        subMenu = document.createElement('div');
        subMenu.className = 'jhncc-menu';
        subMenu.style.position = 'fixed';
        CHART_TYPES.forEach(function (t) {
          var row = mItem((t.id === ctype ? '✓ ' : '  ') + t.label, false);
          row.onclick = function () { ctype = t.id; closeMenus(); render(); };
          subMenu.appendChild(row);
        });
        var r = typeEl.getBoundingClientRect();
        subMenu.style.left = r.right + 'px'; subMenu.style.top = r.top + 'px';
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

      var dataEl = mItem('Select Data…', false);
      dataEl.onclick = function () { closeMenus(); showSelectData(); };

      var sep = document.createElement('div'); sep.className = 'jhncc-menu-sep';

      var delEl = mItem('Delete Chart', false);
      delEl.onclick = function () {
        closeMenus();
        if (chartInst) { chartInst.destroy(); chartInst = null; }
        if (floater.parentNode) floater.parentNode.removeChild(floater);
      };

      menu.appendChild(typeEl);
      menu.appendChild(dataEl);
      menu.appendChild(sep);
      menu.appendChild(delEl);
      return menu;
    }

    // ── Select Data Source modal ──────────────────────────────
    function showSelectData() {
      var raw = sheet.getData();
      var headers = raw[0] || [];
      var sc = resolvedSeries();
      var serHtml = '', lblHtml = '';
      for (var i = 0; i < headers.length; i++) {
        var name  = esc(String(headers[i] == null ? 'Column ' + (i + 1) : headers[i]));
        var inSer = sc.indexOf(i) !== -1;
        var isLbl = i === labelCol;
        serHtml += '<div class="jhncc-sd-row"><input type="checkbox" class="jhncc-sd-ser" data-col="' + i + '"' + (inSer ? ' checked' : '') + '> ' + name + '</div>';
        lblHtml += '<div class="jhncc-sd-row"><input type="radio" name="jhncc-sd-lbl" value="' + i + '"' + (isLbl ? ' checked' : '') + '> ' + name + '</div>';
      }
      var body =
        '<div class="jhncc-sd-grid">' +
          '<div><div class="jhncc-sd-panel-head">Legend Entries (Series)</div>' +
            '<div class="jhncc-sd-list">' + serHtml + '</div></div>' +
          '<div><div class="jhncc-sd-panel-head">Horizontal (Category) Axis Labels</div>' +
            '<div class="jhncc-sd-list">' + lblHtml + '</div></div>' +
        '</div>';
      showModal('Select Data Source', body, function (ov) {
        ov.querySelectorAll('input[name="jhncc-sd-lbl"]').forEach(function (r) {
          if (r.checked) labelCol = parseInt(r.value, 10);
        });
        series = [];
        ov.querySelectorAll('.jhncc-sd-ser').forEach(function (cb) {
          if (cb.checked) series.push(parseInt(cb.dataset.col, 10));
        });
        render();
      });
    }

    // ── Public controller ────────────────────────────────────
    return {
      setType:   function (t) { ctype = t; render(); },
      update:    update,
      getConfig: function () {
        return { type: ctype, labelCol: labelCol, series: series ? series.slice() : null };
      },
      destroy: function () {
        if (chartInst) { chartInst.destroy(); chartInst = null; }
        if (floater.parentNode) floater.parentNode.removeChild(floater);
      }
    };
  };
})();
