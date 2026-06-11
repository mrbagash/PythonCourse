/*
 * PyScratch — Python code editor overlay for TurboWarp
 *
 * Activated when the URL contains ?pyscratch (or ?pyscratch=1).
 * The blocks workspace is hidden; a Python editor panel overlays the left side.
 * TurboWarp's stage (right side) remains fully interactive.
 * Uses Skulpt (loaded dynamically) to execute real Python that controls
 * Scratch sprites via window.vm.
 *
 * Usage in a lesson:
 *   scratch/editor.html?pyscratch=1&project_url=https://...
 *
 * DOES NOT alter TurboWarp when ?pyscratch is absent.
 */
(function () {
  'use strict';

  if (!/[?&]pyscratch/.test(location.search)) return; // no-op for normal TurboWarp

  // ── Constants ─────────────────────────────────────────────────
  var FRAME_MS = 1000 / 60;
  var SKULPT_BASE = '../assets/js/';


  var API_LIST = [
    // Movement
    { n: 'move_steps',    s: 'move_steps(steps)',       c: 'mov'  },
    { n: 'turn',          s: 'turn(degrees)',            c: 'mov'  },
    { n: 'go_to',         s: 'go_to(x, y)',              c: 'mov'  },
    { n: 'glide_to',      s: 'glide_to(x, y, secs)',     c: 'mov'  },
    { n: 'point_towards', s: 'point_towards(target)',    c: 'mov'  },
    { n: 'change_x',      s: 'change_x(dx)',             c: 'mov'  },
    { n: 'change_y',      s: 'change_y(dy)',             c: 'mov'  },
    { n: 'set_x',         s: 'set_x(x)',                 c: 'mov'  },
    { n: 'set_y',         s: 'set_y(y)',                 c: 'mov'  },
    { n: 'get_x',         s: 'get_x()',                  c: 'mov'  },
    { n: 'get_y',         s: 'get_y()',                  c: 'mov'  },
    { n: 'get_direction', s: 'get_direction()',          c: 'mov'  },
    { n: 'on_edge',       s: 'on_edge()',                c: 'mov'  },
    { n: 'bounce',        s: 'bounce()',                 c: 'mov'  },
    // Looks
    { n: 'say',           s: 'say(message, secs=2)',     c: 'look' },
    { n: 'think',         s: 'think(message, secs=2)',   c: 'look' },
    { n: 'set_costume',   s: 'set_costume(name)',        c: 'look' },
    { n: 'next_costume',  s: 'next_costume()',           c: 'look' },
    { n: 'set_size',      s: 'set_size(percent)',        c: 'look' },
    { n: 'change_size',   s: 'change_size(amount)',      c: 'look' },
    { n: 'show',          s: 'show()',                   c: 'look' },
    { n: 'hide',          s: 'hide()',                   c: 'look' },
    // Sensing
    { n: 'touching',      s: 'touching(target)',         c: 'sens' },
    { n: 'distance_to',   s: 'distance_to(target)',      c: 'sens' },
    { n: 'key_pressed',   s: 'key_pressed(key)',         c: 'sens' },
    { n: 'mouse_x',       s: 'mouse_x()',                c: 'sens' },
    { n: 'mouse_y',       s: 'mouse_y()',                c: 'sens' },
  ];

  // ── Runtime state ─────────────────────────────────────────────
  var S = {
    vm:               null,
    running:          false,
    gen:              0,    // incremented on every stop; threads check this to self-terminate
    pressedKeys:      {},
    mouse:            { x: 0, y: 0 },
    spriteCode:       {},   // spriteName → [{ id, name, code }]
    activeSprite:     null,
    activeThreadIdx:  0
  };

  // ── DOM helpers ───────────────────────────────────────────────
  var ui = {}; // will hold references to key elements

  function waitFor(test) {
    return new Promise(function (resolve) {
      (function check() {
        var r = test();
        if (r) resolve(r); else setTimeout(check, 100);
      })();
    });
  }

  // ── Skulpt loader ─────────────────────────────────────────────
  function loadSkulpt(cb) {
    if (window.Sk) { cb(); return; }
    function loadScript(src, next) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = next;
      s.onerror = function () { console.error('PyScratch: could not load', src); };
      document.head.appendChild(s);
    }
    loadScript(SKULPT_BASE + 'skulpt.min.js', function () {
      loadScript(SKULPT_BASE + 'skulpt-stdlib.js', cb);
    });
  }

  // ── Thread storage ────────────────────────────────────────────
  function storeKey(spriteName) {
    return 'pyscratch:' + location.pathname + location.search + ':' + spriteName;
  }

  function loadThreads(spriteName) {
    if (S.spriteCode[spriteName]) return S.spriteCode[spriteName];
    try {
      var saved = localStorage.getItem(storeKey(spriteName));
      if (saved) { S.spriteCode[spriteName] = JSON.parse(saved); return S.spriteCode[spriteName]; }
    } catch (e) {}
    var def = [{ id: 't_' + Date.now(), name: 'Main',
      code: 'def game_start():\n    while True:\n        move_steps(5)\n        if on_edge():\n            bounce()\n' }];
    S.spriteCode[spriteName] = def;
    return def;
  }

  function saveThreads(spriteName) {
    try { localStorage.setItem(storeKey(spriteName), JSON.stringify(S.spriteCode[spriteName])); }
    catch (e) {}
  }

  // ── VM helpers ────────────────────────────────────────────────
  function getSprites() {
    try {
      if (!S.vm || !S.vm.runtime || !S.vm.runtime.targets) return [];
      return S.vm.runtime.targets.filter(function (t) { return !t.isStage && t.sprite; });
    } catch (e) { return []; }
  }

  function getTargetByName(name) {
    try {
      if (!S.vm || !S.vm.runtime || !S.vm.runtime.targets) return null;
      if (name === '__stage__') return S.vm.runtime.targets.find(function (t) { return t.isStage; });
      return S.vm.runtime.targets.find(function (t) { return t.sprite && t.sprite.name === name; });
    } catch (e) { return null; }
  }

  // ── Python prologue generator ─────────────────────────────────
  // Uses Sk.builtins for __ps_call, __ps_wait, __ps_stop (set by setupBridge).
  // Fixed-arg _psc helper avoids *args unpacking which varies across Skulpt versions.
  function makePrologue(spriteName) {
    var n = JSON.stringify(spriteName);
    return [
      '__ps_sprite__ = ' + n,
      'def _psc(f,a0=None,a1=None,a2=None): return __ps_call(f,__ps_sprite__,a0,a1,a2)',
      // Movement
      'def move_steps(s): return _psc("move_steps",s)',
      'def turn(d): return _psc("turn",d)',
      'def go_to(x,y=None): return _psc("go_to",x,y)',
      'def glide_to(x,y,s=1): return _psc("glide_to",x,y,s)',
      'def point_towards(t,b=None): return _psc("point_towards",t,b)',
      'def change_x(v): return _psc("change_x",v)',
      'def change_y(v): return _psc("change_y",v)',
      'def set_x(v): return _psc("set_x",v)',
      'def set_y(v): return _psc("set_y",v)',
      'def get_x(): return _psc("get_x")',
      'def get_y(): return _psc("get_y")',
      'def get_direction(): return _psc("get_direction")',
      'def on_edge(): return _psc("on_edge")',
      'def bounce(): return _psc("bounce")',
      // Looks
      'def say(m,s=2): return _psc("say",m,s)',
      'def think(m,s=2): return _psc("think",m,s)',
      'def set_costume(c): return _psc("set_costume",c)',
      'def next_costume(): return _psc("next_costume")',
      'def set_size(s): return _psc("set_size",s)',
      'def change_size(s): return _psc("change_size",s)',
      'def show(): return _psc("show")',
      'def hide(): return _psc("hide")',
      // Sensing
      'def touching(t): return _psc("touching",t)',
      'def distance_to(t): return _psc("distance_to",t)',
      'def key_pressed(k): return _psc("key_pressed",k)',
      'def mouse_x(): return _psc("mouse_x")',
      'def mouse_y(): return _psc("mouse_y")',
      // Control — backed by __ps_wait / __ps_stop in Sk.builtins
      'def wait(s=0): __ps_wait(s)',
      'def stop(): __ps_stop()',
    ].join('\n') + '\n';
  }

  // ── Skulpt bridge ─────────────────────────────────────────────
  // Adds __ps_call, __ps_wait, __ps_stop to Sk.builtins so they are
  // accessible as Python built-in names without any import.
  function setupBridge() {
    function jsArg(a) {
      if (!a || a instanceof Sk.builtin.none) return null;
      try { return Sk.ffi.remapToJs(a); } catch (e) { return null; }
    }
    function skVal(r) {
      if (r === null || r === undefined) return Sk.builtin.none.none$;
      if (r && typeof r.then === 'function') {
        var susp = new Sk.misceval.Suspension();
        susp.data = { type: 'Sk.promise', promise: r.then(function () { return undefined; }) };
        susp.resume = function () { return Sk.builtin.none.none$; };
        return susp;
      }
      if (typeof r === 'boolean') return r ? Sk.builtin.bool.true$ : Sk.builtin.bool.false$;
      if (typeof r === 'number')  return new Sk.builtin.float_(r);
      if (typeof r === 'string')  return new Sk.builtin.str(r);
      return Sk.builtin.none.none$;
    }

    Sk.builtins['__ps_call'] = new Sk.builtin.func(function (fn, sp, a0, a1, a2) {
      return skVal(callAPI(
        Sk.ffi.remapToJs(fn),
        Sk.ffi.remapToJs(sp),
        [jsArg(a0), jsArg(a1), jsArg(a2)]
      ));
    });

    Sk.builtins['__ps_wait'] = new Sk.builtin.func(function (secsArg) {
      var ms = Math.max(0, (Sk.ffi.remapToJs(secsArg) || 0) * 1000);
      var myGen = S.gen;  // snapshot generation at the moment this wait begins
      var susp = new Sk.misceval.Suspension();
      susp.data = {
        type: 'Sk.promise',
        promise: new Promise(function (resolve) {
          setTimeout(function () {
            // Stop if running was cancelled OR a new run started (gen changed)
            resolve((S.running && S.gen === myGen) ? null : '__ps_stop__');
          }, ms || FRAME_MS);
        })
      };
      susp.resume = function (val) {
        if (val === '__ps_stop__') throw new Error('__pyscratch_stopped__');
        return Sk.builtin.none.none$;
      };
      return susp;
    });

    Sk.builtins['__ps_stop'] = new Sk.builtin.func(function () {
      stopAll();
      return Sk.builtin.none.none$;
    });
  }

  // ── Scratch API implementation ────────────────────────────────
  function d2r(deg) { return ((90 - deg) * Math.PI) / 180; }

  function callAPI(fn, spriteName, args) {
    var target = getTargetByName(spriteName);
    var a = args[0], b = args[1], c = args[2];

    if (!target && fn !== 'stop' && fn !== 'key_pressed' && fn !== 'mouse_x' && fn !== 'mouse_y') return null;

    switch (fn) {
      // ── Movement ───────────────────────────────────────────────
      case 'move_steps': {
        var rad = d2r(target.direction);
        target.setXY(target.x + a * Math.cos(rad), target.y + a * Math.sin(rad));
        break;
      }
      case 'turn':
        target.setDirection(target.direction + a);
        break;
      case 'go_to':
        if (a === 'random') {
          target.setXY((Math.random() - 0.5) * 480, (Math.random() - 0.5) * 360);
        } else {
          target.setXY(a || 0, b || 0);
        }
        break;
      case 'glide_to':
        return glide(target, a, b, c);
      case 'point_towards':
        if (typeof a === 'number' && b === undefined) {
          target.setDirection(a);
        } else if (a === 'mouse_pointer' || a === 'mouse pointer') {
          var dx = S.mouse.x - target.x;
          var dy = S.mouse.y - target.y;
          target.setDirection(90 - Math.atan2(dy, dx) * 180 / Math.PI);
        } else if (typeof a === 'number' && typeof b === 'number') {
          target.setDirection(90 - Math.atan2(b - target.y, a - target.x) * 180 / Math.PI);
        } else {
          var t2 = getTargetByName(a);
          if (t2) target.setDirection(90 - Math.atan2(t2.y - target.y, t2.x - target.x) * 180 / Math.PI);
        }
        break;
      case 'change_x': target.setXY(target.x + a, target.y); break;
      case 'change_y': target.setXY(target.x, target.y + a); break;
      case 'set_x':    target.setXY(a, target.y); break;
      case 'set_y':    target.setXY(target.x, a); break;
      case 'get_x':    return target.x;
      case 'get_y':    return target.y;
      case 'get_direction': return target.direction;
      case 'on_edge': {
        var hw = 240, hh = 180;
        return target.x <= -hw || target.x >= hw || target.y <= -hh || target.y >= hh;
      }
      case 'bounce': {
        var dir = target.direction;
        var hw2 = 240, hh2 = 180;
        var vx = Math.sin(dir * Math.PI / 180);
        var vy = Math.cos(dir * Math.PI / 180);
        if ((target.x <= -hw2 && vx < 0) || (target.x >= hw2 && vx > 0)) dir = -dir;
        if ((target.y >= hh2  && vy > 0) || (target.y <= -hh2 && vy < 0)) dir = 180 - dir;
        target.setDirection(dir);
        break;
      }

      // ── Looks ──────────────────────────────────────────────────
      case 'say':
        return bubbleAsync(target, a == null ? '' : String(a), 'say', b != null ? b : 2);
      case 'think':
        return bubbleAsync(target, a == null ? '' : String(a), 'think', b != null ? b : 2);
      case 'set_costume': {
        var costumes = target.sprite.costumes;
        var idx = costumes.findIndex(function (co) { return co.name === String(a); });
        if (idx === -1) idx = parseInt(a, 10);
        if (idx >= 0 && idx < costumes.length) target.setCostume(idx);
        break;
      }
      case 'next_costume':
        target.setCostume((target.currentCostume + 1) % target.sprite.costumes.length);
        break;
      case 'set_size':    target.setSize(a); break;
      case 'change_size': target.setSize(target.size + a); break;
      case 'show':        target.setVisible(true); break;
      case 'hide':        target.setVisible(false); break;

      // ── Control ────────────────────────────────────────────────
      case 'stop': stopAll(); break;

      // ── Sensing ────────────────────────────────────────────────
      case 'touching': {
        if (!target) return false;
        if (a === 'mouse_pointer' || a === 'mouse pointer') {
          try {
            return !!(S.vm.runtime.renderer &&
              S.vm.runtime.renderer.isTouchingDrawable(target.drawableID, S.mouse.x, S.mouse.y));
          } catch (e) { return false; }
        }
        var other = getTargetByName(a);
        if (!other) return false;
        try {
          return !!(S.vm.runtime.renderer &&
            S.vm.runtime.renderer.isTouchingDrawables(target.drawableID, [other.drawableID]));
        } catch (e) {
          return Math.abs(target.x - other.x) < 30 && Math.abs(target.y - other.y) < 30;
        }
      }
      case 'distance_to': {
        var tgt = (a === 'mouse_pointer' || a === 'mouse pointer')
          ? S.mouse
          : getTargetByName(a);
        if (!tgt) return 9999;
        return Math.sqrt(Math.pow(target.x - tgt.x, 2) + Math.pow(target.y - tgt.y, 2));
      }
      case 'key_pressed':
        return !!S.pressedKeys[String(a).toLowerCase()];
      case 'mouse_x': return S.mouse.x;
      case 'mouse_y': return S.mouse.y;

      default:
        console.warn('PyScratch: unknown API:', fn);
    }
    return null;
  }

  function glide(target, x, y, dur) {
    var tx = x, ty = y, secs = dur;
    if (x === 'random') {
      tx = (Math.random() - 0.5) * 480;
      ty = (Math.random() - 0.5) * 360;
      secs = y;
    }
    secs = (secs == null ? 1 : secs);
    var sx = target.x, sy = target.y;
    var start = Date.now();
    var ms = secs * 1000;
    return (function tick() {
      if (!S.running) return Promise.resolve();
      var elapsed = Date.now() - start;
      if (elapsed >= ms) { target.setXY(tx, ty); return Promise.resolve(); }
      var p = elapsed / ms;
      target.setXY(sx + (tx - sx) * p, sy + (ty - sy) * p);
      return new Promise(function (r) { setTimeout(r, FRAME_MS); }).then(tick);
    })();
  }

  function bubbleAsync(target, text, type, secs) {
    try { target.runtime.emit('SAY', target, type, text); } catch (e) {}
    return new Promise(function (r) { setTimeout(r, secs * 1000); })
      .then(function () {
        try { target.runtime.emit('SAY', target, type, ''); } catch (e) {}
      });
  }

  // ── Auto-yield injection ──────────────────────────────────────
  // Injects wait(0) as the first line of every `while True:` body.
  // This gives exactly one-iteration-per-frame behaviour — like Scratch's
  // `forever` block — without students needing to write wait(0) manually.
  // Only `while True:` is targeted; `for` loops are left untouched so data
  // processing loops don't become unexpectedly slow.
  function injectFrameYields(code) {
    var lines = code.split('\n');
    var output = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var stripped = line.trimStart();
      var loopIndent = line.length - stripped.length;

      output.push(line);

      // Match `while True:` (with optional whitespace / comment after colon)
      if (/^while\s+(True|true)\s*:/.test(stripped)) {
        // Find first non-empty, non-comment body line to measure body indent
        for (var j = i + 1; j < lines.length; j++) {
          var next = lines[j];
          var nextStrip = next.trimStart();
          if (nextStrip && nextStrip.charAt(0) !== '#') {
            var bodyIndent = next.length - nextStrip.length;
            if (bodyIndent > loopIndent) {
              // Inject wait(0) as the very first line of the loop body
              output.push(new Array(bodyIndent + 1).join(' ') + 'wait(0)');
            }
            break;
          }
        }
      }
    }

    return output.join('\n');
  }

  // ── Thread runner ─────────────────────────────────────────────
  function runThread(spriteName, thread) {
    var prologue = makePrologue(spriteName);
    // Auto-call game_start if defined.
    // IMPORTANT: only catch NameError for game_start itself, NOT for errors
    // that occur inside game_start() — those should surface as real errors.
    var postlude = [
      '',
      'try:',
      '    _ps_fn = game_start',
      'except NameError:',
      '    _ps_fn = None',
      'if _ps_fn is not None:',
      '    _ps_fn()',
      ''
    ].join('\n');
    // Inject frame yields into while True: loops before running
    var userCode = injectFrameYields(thread.code);
    var fullCode = prologue + userCode + postlude;

    Sk.configure({
      output: function (text) { log(text); },
      read: function (x) {
        if (Sk.builtinFiles && Sk.builtinFiles.files[x]) return Sk.builtinFiles.files[x];
        throw new Error("File not found: '" + x + "'");
      },
      execLimit: undefined,
      // Safety net: yield every 1000 ops for infinite loops that aren't `while True:`
      yieldLimit: 1000
    });
    // Register _ps module and window bridge globals
    setupBridge();

    return Sk.misceval.asyncToPromise(function () {
      return Sk.importMainWithBody('<ps:' + spriteName + ':' + thread.name + '>', false, fullCode, true);
    }).catch(function (err) {
      if (!err) return;
      var msg = (err.args && err.args.v && err.args.v[0] && err.args.v[0].v) || err.toString();
      if (msg.indexOf('__pyscratch_stopped__') !== -1) return;
      logError(spriteName + ' / ' + thread.name + ': ' + msg);
    });
  }

  function startAll() {
    if (!S.vm) return;
    // Always stop first — this increments S.gen, poisoning any sleeping old threads.
    // They will see gen !== myGen on their next wake and throw __pyscratch_stopped__.
    stopAll();
    S.running = true;
    clearConsole();

    var sprites = getSprites();
    sprites.forEach(function (t) {
      var name = t.sprite.name;
      loadThreads(name).forEach(function (thread) {
        runThread(name, thread);
      });
    });

    updateRunState(true);
  }

  function stopAll() {
    S.running = false;
    S.gen++;              // invalidates ALL sleeping threads from previous runs
    if (S.vm) {
      try { S.vm.stopAll(); } catch (e) {}
    }
    updateRunState(false);
  }

  // ── Build UI ──────────────────────────────────────────────────
  function buildUI() {
    // Inject styles
    var style = document.createElement('style');
    style.textContent = [
      // Overlay container
      '#ps-overlay{position:fixed;inset:0;z-index:10000;display:flex;flex-direction:column;pointer-events:none;font-family:"Roboto","Segoe UI",Arial,sans-serif;font-size:14px}',

      // Top bar
      '#ps-bar{height:44px;background:#4f46e5;color:#fff;display:flex;align-items:center;padding:0 12px;gap:8px;flex-shrink:0;pointer-events:auto;box-shadow:0 2px 8px rgba(0,0,0,.3);z-index:10001}',
      '#ps-bar .ps-logo{font-weight:700;font-size:15px;letter-spacing:-.3px;margin-right:4px}',
      '#ps-bar .ps-sep{width:1px;height:22px;background:rgba(255,255,255,.25);margin:0 4px}',
      '#ps-bar button{background:none;border:none;color:#fff;cursor:pointer;padding:4px 9px;border-radius:6px;font-size:13px;display:flex;align-items:center;gap:5px;font-family:inherit;line-height:1}',
      '#ps-bar button:hover{background:rgba(255,255,255,.18)}',
      '#ps-status{margin-left:auto;font-size:12px;opacity:.75}',

      // Body split — width of ps-left is set dynamically by adjustOverlay()
      '#ps-body{flex:1;display:flex;overflow:hidden;pointer-events:none}',
      '#ps-left{width:50%;display:flex;flex-direction:column;background:#1e1e2e;pointer-events:auto;border-right:2px solid #312d4b;box-shadow:4px 0 20px rgba(0,0,0,.4);flex-shrink:0}',
      '#ps-right{flex:1;pointer-events:none;background:transparent}', // Pass-through to TurboWarp stage

      // Sprite tab bar
      '#ps-sprite-bar{height:38px;background:#252537;border-bottom:1px solid #312d4b;display:flex;align-items:center;overflow-x:auto;padding:0 8px;gap:4px;flex-shrink:0}',
      '.ps-stab{padding:3px 12px;border-radius:14px;background:#333350;color:#9999bb;border:1px solid transparent;cursor:pointer;font-size:12px;white-space:nowrap;font-family:inherit}',
      '.ps-stab.active{background:#4f46e5;color:#fff;border-color:#6366f1}',
      '.ps-stab:hover:not(.active){background:#3e3e58;color:#c0c0dd}',

      // Code area
      '#ps-code-area{flex:1;display:flex;overflow:hidden}',

      // Thread sidebar
      '#ps-threads{width:152px;background:#18182a;border-right:1px solid #312d4b;display:flex;flex-direction:column;flex-shrink:0}',
      '#ps-thread-head{padding:5px 8px;background:#1f1f33;font-size:10px;font-weight:700;color:#7777aa;text-transform:uppercase;letter-spacing:.07em;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #312d4b}',
      '#ps-thread-head button{background:none;border:none;color:#6666aa;cursor:pointer;font-size:16px;line-height:1;padding:0 2px}',
      '#ps-thread-head button:hover{color:#aaaaee}',
      '#ps-thread-list{flex:1;overflow-y:auto;padding:5px}',
      '.ps-titem{padding:5px 8px;border-radius:6px;background:#252538;color:#b0b0cc;border:1px solid transparent;cursor:pointer;font-size:12px;margin-bottom:3px;display:flex;justify-content:space-between;align-items:center}',
      '.ps-titem.active{background:#36365a;border-color:#5a5a8a;color:#fff}',
      '.ps-titem:hover:not(.active){background:#2d2d48}',
      '.ps-tactions{display:none;gap:2px}',
      '.ps-titem:hover .ps-tactions{display:flex}',
      '.ps-tactions button{background:none;border:none;cursor:pointer;color:#777;font-size:11px;padding:1px 4px;border-radius:3px}',
      '.ps-tactions button:hover{color:#fff;background:#444}',

      // Editor + console
      '#ps-editor-wrap{flex:1;display:flex;flex-direction:column;overflow:hidden}',
      '#ps-editor{flex:1;background:#1e1e2e;color:#cdd6f4;border:none;outline:none;resize:none;font-family:"Roboto Mono","Consolas","Courier New",monospace;font-size:13px;line-height:1.65;padding:12px;tab-size:4;overflow-y:auto;min-height:0}',
      '#ps-editor::selection{background:#3b3b5a}',
      '#ps-console{height:72px;background:#13131f;color:#a6e3a1;font-family:"Roboto Mono","Consolas",monospace;font-size:11px;padding:5px 10px;overflow-y:auto;border-top:1px solid #312d4b;flex-shrink:0;line-height:1.5}',
      '.ps-con-err{color:#f38ba8}',

      // Hide TurboWarp blocks and related elements when PyScratch is active
      '.blocklyDiv,.blocklyToolboxDiv,.blocklyFlyout,.blocklyWidgetDiv{display:none !important}',

      // Help modal
      '#ps-help{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:20000;display:flex;align-items:center;justify-content:center}',
      '#ps-help.hidden{display:none}',
      '.ps-mbox{background:#1e1e2e;color:#cdd6f4;border-radius:10px;width:680px;max-width:94vw;max-height:82vh;display:flex;flex-direction:column;border:1px solid #3f3f5a;font-family:"Roboto","Segoe UI",Arial,sans-serif}',
      '.ps-mhead{padding:12px 16px;border-bottom:1px solid #3f3f5a;display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:16px}',
      '.ps-mhead button{background:none;border:none;color:#888;font-size:22px;cursor:pointer}',
      '.ps-mhead button:hover{color:#ccc}',
      '.ps-mbody{flex:1;overflow-y:auto;padding:14px 18px}',
      '.ps-hsec{margin-bottom:16px;border-radius:8px;overflow:hidden;border:1px solid #3f3f5a}',
      '.ps-hcat{padding:7px 12px;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.06em}',
      '.ps-hcat.mov{background:#1a3458;color:#7dd3fc}',
      '.ps-hcat.look{background:#331b52;color:#d8b4fe}',
      '.ps-hcat.ctrl{background:#332514;color:#fcd34d}',
      '.ps-hcat.sens{background:#143232;color:#67e8f9}',
      '.ps-hitems{padding:10px 14px;background:#252538}',
      '.ps-hitem{margin-bottom:10px}',
      '.ps-hitem:last-child{margin-bottom:0}',
      '.ps-hitem code{background:#312d4b;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:12px;color:#cba6f7}',
      '.ps-hitem p{margin:4px 0 0;font-size:12px;color:#9090b0;line-height:1.4}'
    ].join('\n');
    document.head.appendChild(style);

    // Build overlay HTML
    var o = document.createElement('div');
    o.id = 'ps-overlay';
    o.innerHTML = [
      '<div id="ps-bar">',
        '<span class="ps-logo">🐍 PyScratch</span>',
        '<span class="ps-sep"></span>',
        '<button id="ps-help-btn">❓ Help</button>',
        '<span id="ps-status"></span>',
      '</div>',
      '<div id="ps-body">',
        '<div id="ps-left">',
          '<div id="ps-sprite-bar"></div>',
          '<div id="ps-code-area">',
            '<div id="ps-threads">',
              '<div id="ps-thread-head">',
                '<span>Threads</span>',
                '<button id="ps-add-thread" title="Add thread">+</button>',
              '</div>',
              '<div id="ps-thread-list"></div>',
            '</div>',
            '<div id="ps-editor-wrap">',
              '<textarea id="ps-editor" spellcheck="false"></textarea>',
              '<div id="ps-console"></div>',
            '</div>',
          '</div>',
        '</div>',
        '<div id="ps-right"></div>',
      '</div>'
    ].join('');
    document.body.appendChild(o);

    // Help modal
    var hm = document.createElement('div');
    hm.id = 'ps-help';
    hm.className = 'hidden';
    hm.innerHTML = buildHelpHTML();
    document.body.appendChild(hm);

    // Assign references
    ui.editor       = document.getElementById('ps-editor');
    ui.threadList   = document.getElementById('ps-thread-list');
    ui.spriteBar    = document.getElementById('ps-sprite-bar');
    ui.console      = document.getElementById('ps-console');
    ui.status       = document.getElementById('ps-status');

    // Button events
    document.getElementById('ps-add-thread').onclick = addThread;
    document.getElementById('ps-help-btn').onclick = function () { hm.classList.remove('hidden'); };
    hm.querySelector('.ps-mhead button').onclick = function () { hm.classList.add('hidden'); };
    hm.onclick = function (e) { if (e.target === hm) hm.classList.add('hidden'); };

    // Editor behaviour
    ui.editor.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        var s = ui.editor.selectionStart, v = ui.editor.value;
        ui.editor.value = v.substring(0, s) + '    ' + v.substring(ui.editor.selectionEnd);
        ui.editor.selectionStart = ui.editor.selectionEnd = s + 4;
        saveCurrentCode();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        var s2 = ui.editor.selectionStart, v2 = ui.editor.value;
        var lineStart = v2.lastIndexOf('\n', s2 - 1) + 1;
        var line = v2.substring(lineStart, s2);
        var indent = (line.match(/^(\s*)/) || ['', ''])[1];
        if (line.trimEnd().endsWith(':')) indent += '    ';
        document.execCommand('insertText', false, '\n' + indent);
      }
    });
    ui.editor.addEventListener('input', saveCurrentCode);

    // Key tracking
    var normKey = function (k) {
      if (k === ' ') return 'space';
      var map = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right', Enter:'enter' };
      return map[k] || k.toLowerCase();
    };
    window.addEventListener('keydown', function (e) { S.pressedKeys[normKey(e.key)] = true; });
    window.addEventListener('keyup',   function (e) { S.pressedKeys[normKey(e.key)] = false; });

    // Mouse tracking (map to Scratch coords: centre=0,0; Y-up)
    window.addEventListener('mousemove', function (e) {
      var canvas = document.querySelector('canvas');
      if (!canvas) return;
      var r = canvas.getBoundingClientRect();
      S.mouse.x =  ((e.clientX - r.left) / r.width)  * 480 - 240;
      S.mouse.y = -(((e.clientY - r.top)  / r.height) * 360 - 180);
    });
  }

  // ── Help modal HTML ───────────────────────────────────────────
  function buildHelpHTML() {
    var sections = [
      { cat:'mov', title:'Movement', items:[
        { code:'move_steps(steps)', desc:'Move the sprite forward in its current direction.' },
        { code:'turn(degrees)', desc:'Rotate clockwise by the given degrees.' },
        { code:'go_to(x, y)', desc:'Teleport to coordinates. go_to("random") goes to a random position.' },
        { code:'glide_to(x, y, secs)', desc:'Smoothly glide to (x, y) over secs seconds.' },
        { code:'point_towards(target)', desc:'Point at a sprite name, "mouse_pointer", or pass (x, y) coordinates.' },
        { code:'change_x(dx) / change_y(dy)', desc:'Move relative to current position.' },
        { code:'set_x(x) / set_y(y)', desc:'Set absolute position.' },
        { code:'get_x() / get_y() / get_direction()', desc:'Read current position or direction.' },
        { code:'on_edge()', desc:'Returns True when touching the stage boundary.' },
        { code:'bounce()', desc:'Reflect direction when on_edge() is True.' },
      ]},
      { cat:'look', title:'Looks', items:[
        { code:'say(message, secs=2)', desc:'Show a speech bubble for secs seconds.' },
        { code:'think(message, secs=2)', desc:'Show a thought bubble.' },
        { code:'set_costume(name)', desc:'Switch costume by name.' },
        { code:'next_costume()', desc:'Advance to the next costume.' },
        { code:'set_size(percent)', desc:'Set sprite size (100 = default).' },
        { code:'show() / hide()', desc:'Show or hide the sprite.' },
      ]},
      { cat:'ctrl', title:'Control', items:[
        { code:'def game_start():', desc:'Entry point — runs when the green flag is clicked.' },
        { code:'wait(secs)', desc:'Pause this thread for secs seconds. wait(0.5) pauses half a second.' },
        { code:'while True:', desc:'Standard game loop — automatically runs once per frame (like Scratch\'s forever block). No wait(0) needed.' },
        { code:'stop()', desc:'Stop all threads immediately.' },
      ]},
      { cat:'sens', title:'Sensing', items:[
        { code:'touching("SpriteName")', desc:'True if this sprite is touching another sprite.' },
        { code:'touching("mouse_pointer")', desc:'True if touching the mouse cursor.' },
        { code:'distance_to("SpriteName")', desc:'Pixel distance to another sprite or "mouse_pointer".' },
        { code:'key_pressed("space")', desc:'True while a key is held. Keys: space, up, down, left, right, a–z, 0–9.' },
        { code:'mouse_x() / mouse_y()', desc:'Mouse position in Scratch coordinates (0,0 = centre).' },
      ]},
    ];

    var inner = sections.map(function (s) {
      var items = s.items.map(function (i) {
        return '<div class="ps-hitem"><code>' + i.code + '</code><p>' + i.desc + '</p></div>';
      }).join('');
      return '<div class="ps-hsec"><div class="ps-hcat ' + s.cat + '">' + s.title + '</div>' +
             '<div class="ps-hitems">' + items + '</div></div>';
    }).join('');

    return '<div class="ps-mbox">' +
      '<div class="ps-mhead"><span>🐍 PyScratch Reference</span><button title="Close">&times;</button></div>' +
      '<div class="ps-mbody">' + inner + '</div>' +
      '</div>';
  }

  // ── Sprite / thread UI ────────────────────────────────────────
  function renderSpriteBar() {
    if (!ui.spriteBar) return;
    var sprites = getSprites();
    if (sprites.length && !S.activeSprite) S.activeSprite = sprites[0].sprite.name;
    ui.spriteBar.innerHTML = '';
    sprites.forEach(function (t) {
      var name = t.sprite.name;
      var btn = document.createElement('button');
      btn.className = 'ps-stab' + (name === S.activeSprite ? ' active' : '');
      btn.textContent = name;
      btn.onclick = function () {
        saveCurrentCode();
        S.activeSprite = name;
        S.activeThreadIdx = 0;
        renderSpriteBar();
        renderThreadList();
        loadCodeToEditor();
      };
      ui.spriteBar.appendChild(btn);
    });
  }

  function renderThreadList() {
    if (!ui.threadList || !S.activeSprite) return;
    var threads = loadThreads(S.activeSprite);
    ui.threadList.innerHTML = '';
    threads.forEach(function (thread, idx) {
      var div = document.createElement('div');
      div.className = 'ps-titem' + (idx === S.activeThreadIdx ? ' active' : '');

      var nameEl = document.createElement('span');
      nameEl.textContent = thread.name;
      div.appendChild(nameEl);

      var acts = document.createElement('div');
      acts.className = 'ps-tactions';

      var renBtn = document.createElement('button');
      renBtn.textContent = '✎'; renBtn.title = 'Rename';
      renBtn.onclick = function (e) {
        e.stopPropagation();
        var n = prompt('Rename thread:', thread.name);
        if (n && n.trim()) { thread.name = n.trim(); saveThreads(S.activeSprite); renderThreadList(); }
      };
      acts.appendChild(renBtn);

      if (threads.length > 1) {
        var delBtn = document.createElement('button');
        delBtn.textContent = '✕'; delBtn.title = 'Delete';
        delBtn.onclick = function (e) {
          e.stopPropagation();
          if (!confirm('Delete "' + thread.name + '"?')) return;
          threads.splice(idx, 1);
          if (S.activeThreadIdx >= threads.length) S.activeThreadIdx = threads.length - 1;
          saveThreads(S.activeSprite);
          renderThreadList();
          loadCodeToEditor();
        };
        acts.appendChild(delBtn);
      }

      div.appendChild(acts);
      div.onclick = function () {
        saveCurrentCode();
        S.activeThreadIdx = idx;
        renderThreadList();
        loadCodeToEditor();
      };

      ui.threadList.appendChild(div);
    });
  }

  function addThread() {
    if (!S.activeSprite) return;
    var threads = loadThreads(S.activeSprite);
    threads.push({ id: 't_' + Date.now(), name: 'Thread ' + (threads.length + 1),
      code: 'def game_start():\n    pass\n' });
    S.activeThreadIdx = threads.length - 1;
    saveThreads(S.activeSprite);
    renderThreadList();
    loadCodeToEditor();
  }

  function loadCodeToEditor() {
    if (!S.activeSprite || !ui.editor) return;
    var threads = loadThreads(S.activeSprite);
    var t = threads[S.activeThreadIdx];
    ui.editor.value = t ? t.code : '';
  }

  function saveCurrentCode() {
    if (!S.activeSprite || !ui.editor) return;
    var threads = loadThreads(S.activeSprite);
    if (threads[S.activeThreadIdx]) {
      threads[S.activeThreadIdx].code = ui.editor.value;
      saveThreads(S.activeSprite);
    }
  }

  // ── Console ───────────────────────────────────────────────────
  function log(text) {
    if (!ui.console) return;
    var span = document.createElement('span');
    span.textContent = text;
    ui.console.appendChild(span);
    ui.console.scrollTop = ui.console.scrollHeight;
  }
  function logError(msg) {
    if (!ui.console) return;
    var span = document.createElement('span');
    span.className = 'ps-con-err';
    span.textContent = '⚠ ' + msg + '\n';
    ui.console.appendChild(span);
    ui.console.scrollTop = ui.console.scrollHeight;
    if (ui.status) ui.status.textContent = '⚠ Error';
  }
  function clearConsole() {
    if (ui.console) ui.console.innerHTML = '';
  }
  function updateRunState(running) {
    if (ui.status) ui.status.textContent = running ? '● Running' : '';
  }

  // ── Overlay width: align left panel to the TurboWarp stage edge ─
  // TurboWarp's code area is NOT exactly 50% — it depends on the stage's
  // rendered size. We measure the canvas left edge and snap the panel to it.
  function adjustOverlay() {
    var canvas = document.querySelector('canvas');
    var leftEl  = document.getElementById('ps-left');
    if (!canvas || !leftEl) return;
    var rect = canvas.getBoundingClientRect();
    // Only update if the canvas is plausibly on the right side of the screen
    if (rect.left > 60 && rect.left < window.innerWidth - 60) {
      leftEl.style.width = rect.left + 'px';
    }
  }

  // ── Sync ──────────────────────────────────────────────────────
  function sync() {
    renderSpriteBar();
    renderThreadList();
    loadCodeToEditor();
    adjustOverlay();
  }

  // ── Boot ──────────────────────────────────────────────────────
  // IMPORTANT: return window.vm (the VirtualMachine), not window.vm.runtime.
  // `window.vm && window.vm.runtime` returns the Runtime due to && semantics.
  waitFor(function () {
    return (window.vm && window.vm.runtime) ? window.vm : null;
  }).then(function (vm) {
    S.vm = vm; // S.vm = VirtualMachine; S.vm.runtime = Runtime ✓

    loadSkulpt(function () {
      buildUI();

      // Initial sync after TurboWarp finishes loading its project
      setTimeout(sync, 600);
      // Second pass in case TurboWarp takes longer on slow connections
      setTimeout(sync, 1500);

      // Re-sync (including overlay width) whenever sprites change or window resizes
      try { vm.runtime.on('TARGETS_UPDATE', function () { sync(); }); } catch(e) {}
      window.addEventListener('resize', adjustOverlay);

      // Hook TurboWarp's green flag → start Python.
      try {
        vm.runtime.on('PROJECT_START', function () {
          setTimeout(startAll, 0);
        });
      } catch(e) {
        console.warn('[PyScratch] Could not attach PROJECT_START:', e);
      }

      // Hook TurboWarp's stop button → stop Python.
      // Patch vm.stopAll directly — more reliable than PROJECT_STOP_ALL event
      // since TurboWarp's fork doesn't always emit it consistently.
      try {
        var _origStop = vm.stopAll.bind(vm);
        vm.stopAll = function () {
          stopAll();            // stop Python threads
          return _origStop();  // let TurboWarp stop its own threads
        };
        // Also listen for the runtime event as a fallback
        vm.runtime.on('PROJECT_STOP_ALL', function () {
          if (S.running) stopAll();
        });
      } catch(e) {
        console.warn('[PyScratch] Could not hook stopAll:', e);
      }

      console.log('[PyScratch] Ready. vm=', vm, 'runtime=', vm.runtime);
    });
  });

})();
