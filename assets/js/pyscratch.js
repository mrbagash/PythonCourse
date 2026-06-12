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
    { n: 'move_steps',          s: 'move_steps(steps)',                    c: 'mov'  },
    { n: 'turn_right',          s: 'turn_right(degrees)',                  c: 'mov'  },
    { n: 'turn_left',           s: 'turn_left(degrees)',                   c: 'mov'  },
    { n: 'go_to',               s: 'go_to(target_or_x, y=None)',           c: 'mov'  },
    { n: 'go_to_xy',            s: 'go_to_xy(x, y)',                       c: 'mov'  },
    { n: 'glide_to',            s: 'glide_to(target_or_x, y_or_secs, secs=None)', c: 'mov'  },
    { n: 'glide_to_xy',         s: 'glide_to_xy(secs, x, y)',              c: 'mov'  },
    { n: 'point_in_direction',  s: 'point_in_direction(degrees)',          c: 'mov'  },
    { n: 'point_towards',       s: 'point_towards(target)',                c: 'mov'  },
    { n: 'change_x',            s: 'change_x(dx)',                         c: 'mov'  },
    { n: 'change_y',            s: 'change_y(dy)',                         c: 'mov'  },
    { n: 'set_x',               s: 'set_x(x)',                             c: 'mov'  },
    { n: 'set_y',               s: 'set_y(y)',                             c: 'mov'  },
    { n: 'if_on_edge_bounce',   s: 'if_on_edge_bounce()',                  c: 'mov'  },
    { n: 'set_rotation_style',  s: 'set_rotation_style(style)',            c: 'mov'  },
    { n: 'x_position',          s: 'x_position()',                         c: 'mov'  },
    { n: 'y_position',          s: 'y_position()',                         c: 'mov'  },
    { n: 'direction',           s: 'direction()',                          c: 'mov'  },
    // Looks — speech/thought
    { n: 'say',            s: 'say(message)',                    c: 'look' },
    { n: 'say_for',        s: 'say_for(message, secs)',          c: 'look' },
    { n: 'think',          s: 'think(message)',                  c: 'look' },
    { n: 'think_for',      s: 'think_for(message, secs)',        c: 'look' },
    // Looks — costume
    { n: 'set_costume',    s: 'set_costume(name)',               c: 'look' },
    { n: 'next_costume',   s: 'next_costume()',                  c: 'look' },
    { n: 'previous_costume', s: 'previous_costume()',            c: 'look' },
    { n: 'costume_number', s: 'costume_number()',                c: 'look' },
    { n: 'costume_name',   s: 'costume_name()',                  c: 'look' },
    // Looks — backdrop
    { n: 'set_backdrop',   s: 'set_backdrop(name)',              c: 'look' },
    { n: 'next_backdrop',  s: 'next_backdrop()',                 c: 'look' },
    { n: 'previous_backdrop', s: 'previous_backdrop()',          c: 'look' },
    { n: 'backdrop_name',  s: 'backdrop_name()',                 c: 'look' },
    { n: 'backdrop_number', s: 'backdrop_number()',              c: 'look' },
    // Looks — size / visibility
    { n: 'set_size',       s: 'set_size(percent)',               c: 'look' },
    { n: 'change_size',    s: 'change_size(amount)',             c: 'look' },
    { n: 'size',           s: 'size()',                          c: 'look' },
    { n: 'show',           s: 'show()',                          c: 'look' },
    { n: 'hide',           s: 'hide()',                          c: 'look' },
    // Looks — graphic effects
    { n: 'set_effect',     s: 'set_effect(effect, value)',       c: 'look' },
    { n: 'change_effect',  s: 'change_effect(effect, amount)',   c: 'look' },
    { n: 'clear_effects',  s: 'clear_effects()',                 c: 'look' },
    // Looks — layers
    { n: 'go_to_front',    s: 'go_to_front()',                   c: 'look' },
    { n: 'go_to_back',     s: 'go_to_back()',                    c: 'look' },
    { n: 'go_forward',     s: 'go_forward(layers=1)',            c: 'look' },
    { n: 'go_backward',    s: 'go_backward(layers=1)',           c: 'look' },
    // Control
    { n: 'wait_until',       s: 'wait_until(lambda: condition)',  c: 'ctrl' },
    { n: 'create_clone',     s: 'create_clone()',                 c: 'ctrl' },
    { n: 'create_clone_of',  s: 'create_clone_of(sprite)',        c: 'ctrl' },
    { n: 'delete_clone',     s: 'delete_clone()',                 c: 'ctrl' },
    { n: 'is_clone',         s: 'is_clone()',                     c: 'ctrl' },
    // Events — hat blocks (define these functions; PyScratch calls them automatically)
    { n: 'game_start',              s: 'def game_start():',                   c: 'evt'  },
    { n: 'when_clicked',            s: 'def when_clicked():',                 c: 'evt'  },
    { n: 'when_key_pressed',        s: 'def when_key_pressed(key):',          c: 'evt'  },
    { n: 'when_backdrop_switches_to', s: 'def when_backdrop_switches_to(backdrop):', c: 'evt' },
    { n: 'when_message_received',   s: 'def when_message_received(message):', c: 'evt'  },
    // Events — broadcasts
    { n: 'broadcast',               s: 'broadcast(message)',                  c: 'evt'  },
    { n: 'broadcast_and_wait',      s: 'broadcast_and_wait(message)',         c: 'evt'  },
    // Sound
    { n: 'play_sound',            s: 'play_sound(name)',                c: 'snd'  },
    { n: 'play_sound_until_done', s: 'play_sound_until_done(name)',     c: 'snd'  },
    { n: 'stop_all_sounds',       s: 'stop_all_sounds()',               c: 'snd'  },
    { n: 'set_sound_effect',      s: 'set_sound_effect(effect, value)', c: 'snd'  },
    { n: 'change_sound_effect',   s: 'change_sound_effect(effect, amount)', c: 'snd' },
    { n: 'clear_sound_effects',   s: 'clear_sound_effects()',           c: 'snd'  },
    { n: 'set_volume',            s: 'set_volume(percent)',             c: 'snd'  },
    { n: 'change_volume',         s: 'change_volume(amount)',           c: 'snd'  },
    { n: 'volume',                s: 'volume()',                        c: 'snd'  },
    // Sensing
    { n: 'touching',        s: 'touching(target)',                   c: 'sens' },
    { n: 'distance_to',     s: 'distance_to(target)',                c: 'sens' },
    { n: 'key_pressed',     s: 'key_pressed(key)',                   c: 'sens' },
    { n: 'mouse_x',         s: 'mouse_x()',                          c: 'sens' },
    { n: 'mouse_y',         s: 'mouse_y()',                          c: 'sens' },
    { n: 'mouse_down',      s: 'mouse_down()',                       c: 'sens' },
    { n: 'ask',             s: 'ask(question)',                      c: 'sens' },
    { n: 'answer',          s: 'answer()',                           c: 'sens' },
    { n: 'timer',           s: 'timer()',                            c: 'sens' },
    { n: 'reset_timer',     s: 'reset_timer()',                      c: 'sens' },
    { n: 'current',         s: 'current("year"|"month"|"date"|"hour"|"minute"|"second")', c: 'sens' },
    { n: 'days_since_2000', s: 'days_since_2000()',                  c: 'sens' },
    // Operators — things Python doesn't cover without imports
    { n: 'pick_random',  s: 'pick_random(from, to)',  c: 'ops' },
    { n: 'sqrt',         s: 'sqrt(n)',                c: 'ops' },
    { n: 'floor',        s: 'floor(n)',               c: 'ops' },
    { n: 'ceiling',      s: 'ceiling(n)',             c: 'ops' },
    { n: 'sin',          s: 'sin(degrees)',           c: 'ops' },
    { n: 'cos',          s: 'cos(degrees)',           c: 'ops' },
    { n: 'tan',          s: 'tan(degrees)',           c: 'ops' },
    { n: 'asin',         s: 'asin(n)',                c: 'ops' },
    { n: 'acos',         s: 'acos(n)',                c: 'ops' },
    { n: 'atan',         s: 'atan(n)',                c: 'ops' },
    { n: 'ln',           s: 'ln(n)',                  c: 'ops' },
    { n: 'log',          s: 'log(n)',                 c: 'ops' },
    { n: 'e_to',         s: 'e_to(n)',                c: 'ops' },
    { n: 'ten_to',       s: 'ten_to(n)',              c: 'ops' },
  ];

  // ── Runtime state ─────────────────────────────────────────────
  var S = {
    vm:               null,
    running:          false,
    gen:              0,    // incremented on every stop; threads check this to self-terminate
    pressedKeys:      {},
    mouse:            { x: 0, y: 0, down: false },
    timerStart:       0,   // ms timestamp, reset on green flag and reset_timer()
    lastAnswer:       '',  // last answer from ask()
    spriteCode:       {},   // spriteName → [{ id, name, code }]
    handlers:         {},   // spriteName → { event → { fn: SkFn, tgen: Number } }
    activeSprite:     null,
    activeThreadIdx:  0,
    themeSignature:   ''
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
      // Exclude the stage and clones — only original (non-clone) sprites.
      // Clones get their own Python threads via runCloneThreads(), not via startAll().
      return S.vm.runtime.targets.filter(function (t) { return !t.isStage && t.sprite && !t.isClone; });
    } catch (e) { return []; }
  }

  function getTargetByName(name) {
    try {
      if (!S.vm || !S.vm.runtime || !S.vm.runtime.targets) return null;
      if (name === '__stage__') return S.vm.runtime.targets.find(function (t) { return t.isStage; });
      // Check sprite name first (normal sprites), then fall back to target ID (clones).
      return S.vm.runtime.targets.find(function (t) {
        return (t.sprite && t.sprite.name === name) || t.id === name;
      }) || null;
    } catch (e) { return null; }
  }

  // ── Python prologue generator ─────────────────────────────────
  // Uses Sk.builtins for __ps_call, __ps_wait, __ps_stop (set by setupBridge).
  // Fixed-arg _psc helper avoids *args unpacking which varies across Skulpt versions.
  //
  // myGen is embedded as a Python literal (__ps_tgen__) so each thread carries
  // its own generation token inside its own module globals — immune to the shared
  // Sk.builtins being overwritten by later threads.  The static builtins receive
  // __ps_tgen__ as an argument and compare it against S.gen to detect staleness.
  function makePrologue(spriteName, myGen) {
    var n = JSON.stringify(spriteName);
    var g = String(myGen);           // embed as a Python integer literal
    return [
      '__ps_sprite__ = ' + n,
      '__ps_tgen__   = ' + g,        // this thread's immutable generation token
      'def _psc(f,a0=None,a1=None,a2=None): return __ps_call(f,__ps_sprite__,__ps_tgen__,a0,a1,a2)',
      // Movement
      'def move_steps(s): return _psc("move_steps",s)',
      'def turn_right(d): return _psc("turn_right",d)',
      'def turn_left(d): return _psc("turn_left",d)',
      'def turn(d): return turn_right(d)',
      'def go_to(x,y=None): return _psc("go_to",x,y)',
      'def go_to_xy(x,y): return _psc("go_to_xy",x,y)',
      'def glide_to(target_or_x,y_or_secs=None,secs=None): return _psc("glide_to",target_or_x,y_or_secs,secs)',
      'def glide_to_xy(s,x,y): return _psc("glide_to_xy",s,x,y)',
      'def point_in_direction(d): return _psc("point_in_direction",d)',
      'def point_towards(t,b=None): return _psc("point_towards",t,b)',
      'def change_x(v): return _psc("change_x",v)',
      'def change_y(v): return _psc("change_y",v)',
      'def set_x(v): return _psc("set_x",v)',
      'def set_y(v): return _psc("set_y",v)',
      'def if_on_edge_bounce(): return _psc("if_on_edge_bounce")',
      'def set_rotation_style(style): return _psc("set_rotation_style",style)',
      'def x_position(): return _psc("x_position")',
      'def y_position(): return _psc("y_position")',
      'def direction(): return _psc("direction")',
      'def get_x(): return x_position()',
      'def get_y(): return y_position()',
      'def get_direction(): return direction()',
      'def on_edge(): return _psc("on_edge")',
      'def bounce(): return if_on_edge_bounce()',
      // Looks — speech/thought
      // say(message) is non-blocking (shows bubble, continues immediately).
      // say_for(message, secs) blocks for secs seconds, like Scratch's timed bubble.
      'def say(m,s=None): return _psc("say",m,s)',
      'def say_for(m,s): return _psc("say_for",m,s)',
      'def think(m,s=None): return _psc("think",m,s)',
      'def think_for(m,s): return _psc("think_for",m,s)',
      // Looks — costume
      'def set_costume(c): return _psc("set_costume",c)',
      'def next_costume(): return _psc("next_costume")',
      'def previous_costume(): return _psc("previous_costume")',
      'def costume_number(): return _psc("costume_number")',
      'def costume_name(): return _psc("costume_name")',
      // Looks — backdrop (operates on the stage, not the sprite)
      'def set_backdrop(b): return _psc("set_backdrop",b)',
      'def next_backdrop(): return _psc("next_backdrop")',
      'def previous_backdrop(): return _psc("previous_backdrop")',
      'def backdrop_name(): return _psc("backdrop_name")',
      'def backdrop_number(): return _psc("backdrop_number")',
      // Looks — size / visibility
      'def set_size(s): return _psc("set_size",s)',
      'def change_size(s): return _psc("change_size",s)',
      'def size(): return _psc("size")',
      'def show(): return _psc("show")',
      'def hide(): return _psc("hide")',
      // Looks — graphic effects
      'def set_effect(e,v): return _psc("set_effect",e,v)',
      'def change_effect(e,v): return _psc("change_effect",e,v)',
      'def clear_effects(): return _psc("clear_effects")',
      // Looks — layers
      'def go_to_front(): return _psc("go_to_front")',
      'def go_to_back(): return _psc("go_to_back")',
      'def go_forward(n=1): return _psc("go_forward",n)',
      'def go_backward(n=1): return _psc("go_backward",n)',
      // Control
      // wait_until is pure Python — no __ps_call needed
      'def wait_until(cond):',
      '    while not cond(): wait(0)',
      'def create_clone(): return _psc("create_clone")',
      'def create_clone_of(name): return _psc("create_clone_of",name)',
      'def delete_clone(): return _psc("delete_clone")',
      'def is_clone(): return _psc("is_clone")',
      // Events — broadcasts (hat-block functions are defined by the student, not here)
      'def broadcast(m): return _psc("broadcast",m)',
      'def broadcast_and_wait(m): return _psc("broadcast_and_wait",m)',
      // Sound
      'def play_sound(n): return _psc("play_sound",n)',
      'def play_sound_until_done(n): return _psc("play_sound_until_done",n)',
      'def stop_all_sounds(): return _psc("stop_all_sounds")',
      'def set_sound_effect(e,v): return _psc("set_sound_effect",e,v)',
      'def change_sound_effect(e,v): return _psc("change_sound_effect",e,v)',
      'def clear_sound_effects(): return _psc("clear_sound_effects")',
      'def set_volume(v): return _psc("set_volume",v)',
      'def change_volume(v): return _psc("change_volume",v)',
      'def volume(): return _psc("volume")',
      // Sensing
      'def touching(t): return _psc("touching",t)',
      'def distance_to(t): return _psc("distance_to",t)',
      'def key_pressed(k): return _psc("key_pressed",k)',
      'def mouse_x(): return _psc("mouse_x")',
      'def mouse_y(): return _psc("mouse_y")',
      'def mouse_down(): return _psc("mouse_down")',
      'def ask(q=""): return _psc("ask",q)',
      'def answer(): return _psc("answer")',
      'def timer(): return _psc("timer")',
      'def reset_timer(): return _psc("reset_timer")',
      'def current(unit): return _psc("current",unit)',
      'def days_since_2000(): return _psc("days_since_2000")',
      // Operators — Scratch-style equivalents (trig uses degrees, like Scratch)
      'def pick_random(a,b): return _psc("pick_random",a,b)',
      'def sqrt(n): return _psc("sqrt",n)',
      'def floor(n): return _psc("floor",n)',
      'def ceiling(n): return _psc("ceiling",n)',
      'def sin(n): return _psc("sin",n)',
      'def cos(n): return _psc("cos",n)',
      'def tan(n): return _psc("tan",n)',
      'def asin(n): return _psc("asin",n)',
      'def acos(n): return _psc("acos",n)',
      'def atan(n): return _psc("atan",n)',
      'def ln(n): return _psc("ln",n)',
      'def log(n): return _psc("log",n)',
      'def e_to(n): return _psc("e_to",n)',
      'def ten_to(n): return _psc("ten_to",n)',
      // Control — backed by __ps_wait / __ps_stop in Sk.builtins
      'def wait(s=0): __ps_wait(s,__ps_tgen__)',
      'def stop(): __ps_stop()',
    ].join('\n') + '\n';
  }

  // ── Skulpt bridge ─────────────────────────────────────────────
  // Adds __ps_call, __ps_wait, __ps_stop to Sk.builtins.
  //
  // Called ONCE after Skulpt loads (not once per thread).
  // The generation token is NOT captured in a closure here — it is passed as
  // a Python argument (__ps_tgen__) from each thread's own prologue, so the
  // shared builtins always receive the calling thread's immutable token.
  //
  //   __ps_call(fn, sprite, tgen, a0, a1, a2)  ← tgen comes from __ps_tgen__
  //   __ps_wait(secs, tgen)                     ← same
  //
  // Overwriting Sk.builtins for a new run therefore has NO effect on sleeping
  // old threads: they carry their own gen token in their module globals.
  function setupBridge() {
    function jsArg(a) {
      if (a === undefined || a === null) return null;
      if (a instanceof Sk.builtin.none) return null;
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

    // __ps_call(fn, sprite, tgen, a0, a1, a2)
    // tgen: the calling thread's own generation integer, passed from __ps_tgen__
    Sk.builtins['__ps_call'] = new Sk.builtin.func(function (fn, sp, tgen, a0, a1, a2) {
      var g = Sk.ffi.remapToJs(tgen);
      if (!S.running || S.gen !== g) throw new Error('__pyscratch_stopped__');
      return skVal(callAPI(
        Sk.ffi.remapToJs(fn),
        Sk.ffi.remapToJs(sp),
        [jsArg(a0), jsArg(a1), jsArg(a2)]
      ));
    });

    // __ps_wait(secs, tgen)
    Sk.builtins['__ps_wait'] = new Sk.builtin.func(function (secsArg, tgenArg) {
      var g = Sk.ffi.remapToJs(tgenArg);
      // Fast path: already stale before even waiting
      if (!S.running || S.gen !== g) throw new Error('__pyscratch_stopped__');
      var ms = Math.max(0, (Sk.ffi.remapToJs(secsArg) || 0) * 1000);
      var susp = new Sk.misceval.Suspension();
      susp.data = {
        type: 'Sk.promise',
        promise: new Promise(function (resolve) {
          setTimeout(function () {
            // Stop if running was cancelled OR a new run started (gen changed)
            resolve((S.running && S.gen === g) ? null : '__ps_stop__');
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
      // Go through vm.stopAll (the patched version) so TurboWarp sprites also stop.
      if (S.vm) { try { S.vm.stopAll(); } catch(e) { stopAll(); } }
      else stopAll();
      return Sk.builtin.none.none$;
    });

    // __ps_register__(event, fn, sprite, tgen)
    // Called from the postlude to register a hat-block handler function.
    Sk.builtins['__ps_register__'] = new Sk.builtin.func(function (evtArg, fnArg, spriteArg, tgenArg) {
      var evt    = Sk.ffi.remapToJs(evtArg);
      var sprite = Sk.ffi.remapToJs(spriteArg);
      var tgen   = Sk.ffi.remapToJs(tgenArg);
      if (!fnArg || fnArg instanceof Sk.builtin.none) return Sk.builtin.none.none$;
      if (!S.handlers[sprite]) S.handlers[sprite] = {};
      S.handlers[sprite][evt] = { fn: fnArg, tgen: tgen };
      return Sk.builtin.none.none$;
    });
  }

  // ── Scratch API implementation ────────────────────────────────
  function d2r(deg) { return ((90 - deg) * Math.PI) / 180; }

  function randomStagePosition() {
    return {
      x: (Math.random() - 0.5) * 480,
      y: (Math.random() - 0.5) * 360
    };
  }

  function resolvePosition(value, fallbackY) {
    if (value === 'random' || value === 'random position') return randomStagePosition();
    if (value === 'mouse_pointer' || value === 'mouse pointer' || value === 'mouse-pointer') {
      return { x: S.mouse.x, y: S.mouse.y };
    }
    if (typeof value === 'number') return { x: value, y: fallbackY || 0 };
    var target = getTargetByName(value);
    if (target) return { x: target.x, y: target.y };
    return { x: 0, y: 0 };
  }

  function normalizeRotationStyle(style) {
    var s = String(style || '').toLowerCase().replace(/[_-]+/g, ' ').trim();
    if (s === 'left right' || s === 'leftright') return 'left-right';
    if (s === 'do not rotate' || s === "don't rotate" || s === 'dont rotate' || s === 'none') return "don't rotate";
    return 'all around';
  }

  // Normalise Scratch graphic-effect names to lowercase; handle "colour" variant.
  function normalizeEffect(eff) {
    var s = String(eff || '').toLowerCase().trim();
    if (s === 'colour') return 'color';
    return s;
  }

  // Return the stage target (used by backdrop functions regardless of active sprite).
  function getStage() {
    try {
      if (!S.vm || !S.vm.runtime || !S.vm.runtime.targets) return null;
      return S.vm.runtime.targets.find(function (t) { return t.isStage; }) || null;
    } catch(e) { return null; }
  }

  // Switch a target (sprite or stage) to costume by name, number (1-based), or
  // the special strings "next", "previous", "random".
  function setCostumeByValue(t, val) {
    if (!t || !t.sprite) return;
    var costumes = t.sprite.costumes;
    if (val === 'next')     { t.setCostume((t.currentCostume + 1) % costumes.length); return; }
    if (val === 'previous') { t.setCostume((t.currentCostume - 1 + costumes.length) % costumes.length); return; }
    if (val === 'random')   { t.setCostume(Math.floor(Math.random() * costumes.length)); return; }
    var idx = costumes.findIndex(function (co) { return co.name === String(val); });
    if (idx === -1) {
      var n = parseInt(val, 10);
      if (!isNaN(n)) idx = n - 1;   // Scratch costume numbers are 1-based
    }
    if (idx >= 0 && idx < costumes.length) t.setCostume(idx);
  }

  // Resolve a sound from a target by name, or 1-based number.
  function findSound(target, val) {
    if (!target || !target.sprite || !target.sprite.sounds) return null;
    var sounds = target.sprite.sounds;
    if (!sounds.length) return null;
    if (val === null || val === undefined) return sounds[0];
    var s = sounds.find(function (snd) { return snd.name === String(val); });
    if (!s) {
      var n = parseInt(val, 10);
      if (!isNaN(n)) s = sounds[n - 1];  // 1-based
    }
    return s || null;
  }

  // Normalise sound-effect names (distinct from graphic effects).
  // Scratch effects: "pitch", "pan left right"
  function normalizeSoundEffect(eff) {
    var s = String(eff || '').toLowerCase().trim();
    if (s === 'pan' || s === 'panleftright' || s === 'pan left/right') return 'pan left right';
    return s;
  }

  // Functions that work without a sprite target.
  var NOTARGET_FNS = {
    // Stage / backdrop
    set_backdrop:1, next_backdrop:1, previous_backdrop:1,
    backdrop_name:1, backdrop_number:1,
    // Sensing — global state
    mouse_down:1, ask:1, answer:1,
    timer:1, reset_timer:1,
    current:1, days_since_2000:1,
    // Operators
    pick_random:1, sqrt:1, floor:1, ceiling:1,
    sin:1, cos:1, tan:1, asin:1, acos:1, atan:1,
    ln:1, log:1, e_to:1, ten_to:1,
  };
  // Keep the old name as an alias so existing code that references STAGE_FNS still works.
  var STAGE_FNS = NOTARGET_FNS;

  function callAPI(fn, spriteName, args) {
    var target = getTargetByName(spriteName);
    var a = args[0], b = args[1], c = args[2];

    if (!target && !NOTARGET_FNS[fn] && fn !== 'stop' && fn !== 'key_pressed' && fn !== 'mouse_x' && fn !== 'mouse_y') return null;

    switch (fn) {
      // ── Movement ───────────────────────────────────────────────
      case 'move_steps': {
        var rad = d2r(target.direction);
        target.setXY(target.x + a * Math.cos(rad), target.y + a * Math.sin(rad));
        break;
      }
      case 'turn':
      case 'turn_right':
        target.setDirection(target.direction + a);
        break;
      case 'turn_left':
        target.setDirection(target.direction - a);
        break;
      case 'go_to':
      case 'go_to_xy': {
        var pos = resolvePosition(a, b);
        target.setXY(pos.x, pos.y);
        break;
      }
      case 'glide_to':
      case 'glide_to_xy':
        return glide(target, a, b, c, fn === 'glide_to_xy');
      case 'point_in_direction':
        target.setDirection(a);
        break;
      case 'point_towards':
        if (typeof a === 'number' && b === undefined) {
          target.setDirection(a);
        } else if (a === 'random' || a === 'random direction') {
          target.setDirection((Math.random() * 360) - 180);
        } else if (a === 'mouse_pointer' || a === 'mouse pointer' || a === 'mouse-pointer') {
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
      case 'x_position':
      case 'get_x':    return target.x;
      case 'y_position':
      case 'get_y':    return target.y;
      case 'direction':
      case 'get_direction': return target.direction;
      case 'on_edge': {
        var hw = 240, hh = 180;
        return target.x <= -hw || target.x >= hw || target.y <= -hh || target.y >= hh;
      }
      case 'if_on_edge_bounce':
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
      case 'set_rotation_style': {
        var style = normalizeRotationStyle(a);
        if (typeof target.setRotationStyle === 'function') target.setRotationStyle(style);
        else target.rotationStyle = style;
        try { target.setDirection(target.direction); } catch(e) {}
        try { target.runtime.emit('TARGET_INFO_CHANGED', target); } catch(e) {}
        break;
      }

      // ── Looks: speech / thought ───────────────────────────────────
      // say(message)       → non-blocking: shows bubble and returns immediately
      // say_for(msg, secs) → blocking: shows bubble, yields for secs seconds
      case 'say': {
        var msg = a == null ? '' : String(a);
        if (b === null || b === undefined) {
          // Non-blocking — just fire-and-forget the SAY event
          try { target.runtime.emit('SAY', target, 'say', msg); } catch(e) {}
          return null;
        }
        return bubbleAsync(target, msg, 'say', b);
      }
      case 'say_for':
        return bubbleAsync(target, a == null ? '' : String(a), 'say', b != null ? b : 2);
      case 'think': {
        var tmsg = a == null ? '' : String(a);
        if (b === null || b === undefined) {
          try { target.runtime.emit('SAY', target, 'think', tmsg); } catch(e) {}
          return null;
        }
        return bubbleAsync(target, tmsg, 'think', b);
      }
      case 'think_for':
        return bubbleAsync(target, a == null ? '' : String(a), 'think', b != null ? b : 2);

      // ── Looks: costume ─────────────────────────────────────────────
      case 'set_costume':
        setCostumeByValue(target, a);
        break;
      case 'next_costume':
        target.setCostume((target.currentCostume + 1) % target.sprite.costumes.length);
        break;
      case 'previous_costume':
        target.setCostume((target.currentCostume - 1 + target.sprite.costumes.length) % target.sprite.costumes.length);
        break;
      case 'costume_number': return target.currentCostume + 1;  // 1-based, like Scratch
      case 'costume_name': {
        var co = target.sprite.costumes[target.currentCostume];
        return co ? co.name : '';
      }

      // ── Looks: backdrop ────────────────────────────────────────────
      case 'set_backdrop': {
        var stage = getStage();
        if (stage) {
          setCostumeByValue(stage, a);
          // Fire when_backdrop_switches_to handlers on all sprites
          var bName = stage.sprite.costumes[stage.currentCostume];
          if (bName) fireEventHandlers(null, 'backdrop', bName.name);
        }
        break;
      }
      case 'next_backdrop': {
        var stage = getStage();
        if (stage) stage.setCostume((stage.currentCostume + 1) % stage.sprite.costumes.length);
        break;
      }
      case 'previous_backdrop': {
        var stage = getStage();
        if (stage) stage.setCostume((stage.currentCostume - 1 + stage.sprite.costumes.length) % stage.sprite.costumes.length);
        break;
      }
      case 'backdrop_name': {
        var stage = getStage();
        if (!stage) return '';
        var bco = stage.sprite.costumes[stage.currentCostume];
        return bco ? bco.name : '';
      }
      case 'backdrop_number': {
        var stage = getStage();
        return stage ? stage.currentCostume + 1 : 1;
      }

      // ── Looks: size / visibility ───────────────────────────────────
      case 'set_size':    target.setSize(a); break;
      case 'change_size': target.setSize(target.size + a); break;
      case 'size':        return target.size;
      case 'show':        target.setVisible(true); break;
      case 'hide':        target.setVisible(false); break;

      // ── Looks: graphic effects ─────────────────────────────────────
      // effect names: color, fisheye, whirl, pixelate, mosaic, brightness, ghost
      case 'set_effect': {
        var eff = normalizeEffect(a);
        try { target.setEffect(eff, b || 0); } catch(e) {
          try { if (target.effects) target.effects[eff] = b || 0; } catch(e2) {}
        }
        break;
      }
      case 'change_effect': {
        var eff = normalizeEffect(a);
        try { target.changeEffect(eff, b || 0); } catch(e) {
          // Fallback: read current value and call setEffect
          try {
            var cur = (target.effects && target.effects[eff]) || 0;
            target.setEffect(eff, cur + (b || 0));
          } catch(e2) {}
        }
        break;
      }
      case 'clear_effects':
        try { target.clearEffects(); } catch(e) {}
        break;

      // ── Looks: layers ──────────────────────────────────────────────
      case 'go_to_front':
        try { target.goToFront(); } catch(e) {}
        break;
      case 'go_to_back':
        try { target.goToBack(); } catch(e) {}
        break;
      case 'go_forward':
        try { target.goForwardLayers(a != null ? a : 1); } catch(e) {}
        break;
      case 'go_backward':
        try { target.goBackwardLayers(a != null ? a : 1); } catch(e) {}
        break;

      // ── Sound ──────────────────────────────────────────────────
      case 'play_sound': {
        var snd = findSound(target, a);
        if (snd) { try { target.sprite.soundBank.playSound(target, snd.soundId); } catch(e) {} }
        return null;  // non-blocking
      }
      case 'play_sound_until_done': {
        var snd = findSound(target, a);
        if (snd) {
          try {
            var p = target.sprite.soundBank.playSound(target, snd.soundId);
            if (p && typeof p.then === 'function') return p; // suspend until done
          } catch(e) {}
        }
        return null;
      }
      case 'stop_all_sounds':
        try { target.sprite.soundBank.stopAllSounds(); } catch(e) {
          try { S.vm.runtime.audioEngine.stopAll(); } catch(e2) {}
        }
        break;
      case 'set_sound_effect':
        try { if (target.audioPlayer) target.audioPlayer.setEffect(normalizeSoundEffect(a), b || 0); } catch(e) {}
        break;
      case 'change_sound_effect':
        try { if (target.audioPlayer) target.audioPlayer.changeEffect(normalizeSoundEffect(a), b || 0); } catch(e) {}
        break;
      case 'clear_sound_effects':
        try { if (target.audioPlayer) target.audioPlayer.clearEffects(); } catch(e) {}
        break;
      case 'set_volume':
        try { target.setVolume(Math.max(0, Math.min(100, a || 0))); } catch(e) {
          try { target.volume = Math.max(0, Math.min(100, a || 0)); } catch(e2) {}
        }
        break;
      case 'change_volume':
        try {
          var newVol = Math.max(0, Math.min(100, (target.volume || 100) + (a || 0)));
          target.setVolume(newVol);
        } catch(e) {}
        break;
      case 'volume': return (target.volume !== undefined ? target.volume : 100);

      // ── Control: clones ────────────────────────────────────────
      case 'create_clone':
      case 'create_clone_of': {
        // Resolve which sprite to clone: current sprite or a named one
        var cloneSourceName = (fn === 'create_clone' || a === null || a === undefined || a === 'myself')
          ? spriteName
          : String(a);
        // For clones, resolve original sprite name (cloneSourceName may be a target ID)
        var cloneSource = getTargetByName(cloneSourceName);
        if (!cloneSource) break;
        // Use the sprite's display name so we load the right code
        var originalName = (cloneSource.sprite && cloneSource.sprite.name) || cloneSourceName;
        try {
          // makeClone() creates the Target; add it to the runtime
          var newClone = cloneSource.makeClone();
          if (!newClone) break;
          if (typeof S.vm.runtime.addTarget === 'function') {
            S.vm.runtime.addTarget(newClone);
          } else if (typeof S.vm.runtime.requestAddTarget === 'function') {
            S.vm.runtime.requestAddTarget(newClone);
          }
          // Start Python clone thread (when_I_start_as_a_clone)
          runCloneThreads(newClone, originalName, S.gen);
          // Also fire any Scratch hat blocks on the clone
          try { S.vm.runtime.startHats('control_start_as_clone', null, newClone); } catch(e) {}
        } catch(e) {
          console.warn('[PyScratch] create_clone failed:', e);
        }
        break;
      }
      case 'delete_clone':
        if (target && target.isClone) {
          try {
            if (typeof S.vm.runtime.stopForTarget === 'function') {
              S.vm.runtime.stopForTarget(target);
            }
            if (typeof S.vm.runtime.disposeTarget === 'function') {
              S.vm.runtime.disposeTarget(target);
            } else if (typeof S.vm.runtime.removeTarget === 'function') {
              S.vm.runtime.removeTarget(target);
            }
          } catch(e) {}
          // Stop this Python thread immediately — clone is gone
          throw new Error('__pyscratch_stopped__');
        }
        break;
      case 'is_clone':
        return !!(target && target.isClone);

      // ── Events ─────────────────────────────────────────────────
      case 'broadcast':
        // Non-blocking: fire all when_message_received handlers and continue.
        fireEventHandlers(null, 'message', String(a));
        return null;
      case 'broadcast_and_wait': {
        // Blocking: fire all handlers and suspend until every one finishes.
        var bwPromises = fireEventHandlers(null, 'message', String(a));
        if (!bwPromises.length) return null;
        return Promise.all(bwPromises);
      }

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
      case 'mouse_down': return S.mouse.down;

      // ── Sensing: timer ─────────────────────────────────────────
      case 'timer':       return (Date.now() - S.timerStart) / 1000;
      case 'reset_timer': S.timerStart = Date.now(); return null;

      // ── Sensing: ask / answer ──────────────────────────────────
      case 'ask': {
        var askQ = (a == null) ? '' : String(a);
        var askPromise = new Promise(function (resolve) {
          showAskDialog(askQ, resolve);
        }).then(function (ans) {
          S.lastAnswer = String(ans == null ? '' : ans);
        });
        return askPromise;
      }
      case 'answer': return S.lastAnswer;

      // ── Sensing: date / time ───────────────────────────────────
      case 'current': {
        var d = new Date();
        var unit = String(a || '').toLowerCase().trim();
        if (unit === 'year')                         return d.getFullYear();
        if (unit === 'month')                        return d.getMonth() + 1;
        if (unit === 'date' || unit === 'day')       return d.getDate();
        if (unit === 'day of week' || unit === 'dayofweek') return d.getDay() + 1; // 1=Sunday
        if (unit === 'hour')                         return d.getHours();
        if (unit === 'minute')                       return d.getMinutes();
        if (unit === 'second')                       return d.getSeconds();
        return 0;
      }
      case 'days_since_2000':
        return (Date.now() - Date.UTC(2000, 0, 1)) / 86400000;

      // ── Operators ──────────────────────────────────────────────
      case 'pick_random': {
        var lo = Number(a), hi = Number(b);
        // Mirror Scratch: return integer when both bounds are integers
        if (lo === Math.floor(lo) && hi === Math.floor(hi)) {
          return lo + Math.floor(Math.random() * (hi - lo + 1));
        }
        return lo + Math.random() * (hi - lo);
      }
      case 'sqrt':    return Math.sqrt(Number(a));
      case 'floor':   return Math.floor(Number(a));
      case 'ceiling': return Math.ceil(Number(a));
      // Trig — degrees in, degrees out (matching Scratch's operator block)
      case 'sin':     return Math.sin(Number(a) * Math.PI / 180);
      case 'cos':     return Math.cos(Number(a) * Math.PI / 180);
      case 'tan':     return Math.tan(Number(a) * Math.PI / 180);
      case 'asin':    return Math.asin(Number(a))  * 180 / Math.PI;
      case 'acos':    return Math.acos(Number(a))  * 180 / Math.PI;
      case 'atan':    return Math.atan(Number(a))  * 180 / Math.PI;
      case 'ln':      return Math.log(Number(a));
      case 'log':     return Math.log10 ? Math.log10(Number(a)) : Math.log(Number(a)) / Math.LN10;
      case 'e_to':    return Math.exp(Number(a));
      case 'ten_to':  return Math.pow(10, Number(a));

      default:
        console.warn('PyScratch: unknown API:', fn);
    }
    return null;
  }

  function glide(target, x, y, dur, secsFirst) {
    var pos, tx, ty, secs;
    if (secsFirst) {
      secs = x;
      pos = resolvePosition(y, dur);
    } else if (typeof x === 'number') {
      secs = dur;
      pos = resolvePosition(x, y);
    } else {
      secs = y;
      pos = resolvePosition(x, null);
    }
    tx = pos.x;
    ty = pos.y;
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

  // ── Event system ─────────────────────────────────────────────
  // Call a registered Python hat-block handler, launching it as its own
  // async thread (just like runThread does).  Returns the Promise, or null
  // if the handler is stale / not registered.
  function callHandlerFn(h, arg) {
    if (!h || !S.running || S.gen !== h.tgen) return null;
    var fn = h.fn;
    var argList = (arg !== null && arg !== undefined)
      ? [new Sk.builtin.str(String(arg))]
      : [];
    return Sk.misceval.asyncToPromise(function () {
      return fn.tp$call(argList, []);
    }).catch(function (err) {
      if (!err) return;
      var msg = (err.args && err.args.v && err.args.v[0] && err.args.v[0].v) || err.toString();
      if (msg.indexOf('__pyscratch_stopped__') !== -1) return;
      logError('[event] ' + msg);
    });
  }

  // Fire a named event for every sprite that has registered a handler for it.
  // Pass null for spriteName to broadcast to ALL sprites.
  // Returns an array of Promises (one per handler that was started).
  function fireEventHandlers(spriteName, event, arg) {
    if (!S.running) return [];
    var keys = spriteName ? [spriteName] : Object.keys(S.handlers);
    var promises = [];
    keys.forEach(function (sp) {
      var h = S.handlers[sp] && S.handlers[sp][event];
      var p = callHandlerFn(h, arg);
      if (p) promises.push(p);
    });
    return promises;
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
  // spriteName: sprite name OR target ID (for clone threads)
  // threadGen:  generation token embedded in Python as __ps_tgen__
  // isClone:    true → call when_I_start_as_a_clone() instead of game_start()
  function runThread(spriteName, thread, threadGen, isClone) {
    var myGen = (threadGen !== undefined) ? threadGen : S.gen;
    var prologue = makePrologue(spriteName, myGen);

    // Entry-point name depends on whether this is a clone thread
    var entryName = isClone ? 'when_I_start_as_a_clone' : 'game_start';
    var postlude = [
      '',
      '# Register event handlers — silently skip any that are not defined',
      'try: __ps_register__("clicked",  when_clicked,              __ps_sprite__, __ps_tgen__)',
      'except NameError: pass',
      'try: __ps_register__("key",      when_key_pressed,          __ps_sprite__, __ps_tgen__)',
      'except NameError: pass',
      'try: __ps_register__("message",  when_message_received,     __ps_sprite__, __ps_tgen__)',
      'except NameError: pass',
      'try: __ps_register__("backdrop", when_backdrop_switches_to, __ps_sprite__, __ps_tgen__)',
      'except NameError: pass',
      '# Entry point',
      'try:',
      '    _ps_entry = ' + entryName,
      'except NameError:',
      '    _ps_entry = None',
      'if _ps_entry is not None:',
      '    _ps_entry()',
      ''
    ].join('\n');

    var userCode = injectFrameYields(thread.code);
    var fullCode = prologue + userCode + postlude;

    Sk.configure({
      output: function (text) { log(text); },
      read: function (x) {
        if (Sk.builtinFiles && Sk.builtinFiles.files[x]) return Sk.builtinFiles.files[x];
        throw new Error("File not found: '" + x + "'");
      },
      execLimit: undefined,
      yieldLimit: 1000
    });

    var label = '<ps:' + spriteName + ':' + thread.name + (isClone ? ':clone' : '') + '>';
    return Sk.misceval.asyncToPromise(function () {
      return Sk.importMainWithBody(label, false, fullCode, true);
    }).catch(function (err) {
      if (!err) return;
      var msg = (err.args && err.args.v && err.args.v[0] && err.args.v[0].v) || err.toString();
      if (msg.indexOf('__pyscratch_stopped__') !== -1) return;
      logError(spriteName + ' / ' + thread.name + ': ' + msg);
    });
  }

  // Launch all Python threads for a newly created clone.
  // Uses the original sprite's stored code but:
  //   • __ps_sprite__ = clone's target ID (so API calls move THIS clone)
  //   • entry point = when_I_start_as_a_clone() instead of game_start()
  function runCloneThreads(cloneTarget, originalSpriteName, threadGen) {
    var cloneId = cloneTarget.id;
    loadThreads(originalSpriteName).forEach(function (thread) {
      runThread(cloneId, thread, threadGen, true /* isClone */);
    });
  }

  function startAll() {
    if (!S.vm) return;
    // Always stop first — this increments S.gen, poisoning any sleeping old threads.
    // They will see gen !== myGen on their next wake and throw __pyscratch_stopped__.
    stopAll();
    S.running    = true;
    S.timerStart = Date.now();   // timer() counts from green-flag press
    clearConsole();

    // Capture the generation AFTER stopAll() incremented it so every new thread
    // gets the same gen value. Old threads have a smaller gen and die at the very
    // next __ps_call or wait().
    var currentGen = S.gen;

    var sprites = getSprites();
    sprites.forEach(function (t) {
      var name = t.sprite.name;
      loadThreads(name).forEach(function (thread) {
        runThread(name, thread, currentGen);
      });
    });

    updateRunState(true);
  }

  // Stops Python threads only. Does NOT call vm.stopAll — the patched vm.stopAll
  // is the single place that calls both stopAll() + the original TurboWarp stop.
  // Calling vm.stopAll from here would cause infinite recursion.
  function stopAll() {
    S.running = false;
    S.gen++;   // sleeping threads see gen mismatch → throw __pyscratch_stopped__
    updateRunState(false);
  }

  // ── .psb3 save / load ────────────────────────────────────────
  // .psb3 = standard .sb3 ZIP + pyscratch.json bundled inside.
  // TurboWarp's own save/load UI is used unchanged; we intercept at VM level
  // so every path (File menu, Ctrl+S, drag-and-drop) goes through our patches.

  // Returns a Promise<JSZip>, loading the library from CDN on first call.
  function ensureJSZip() {
    return new Promise(function (resolve, reject) {
      if (window.JSZip) { resolve(window.JSZip); return; }
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
      s.onload  = function () { resolve(window.JSZip); };
      s.onerror = function () { reject(new Error('Could not load JSZip')); };
      document.head.appendChild(s);
    });
  }

  // Coerce any binary input (Blob, Uint8Array, ArrayBuffer) to an ArrayBuffer.
  function toArrayBuffer(input) {
    if (input instanceof ArrayBuffer) return Promise.resolve(input);
    if (input instanceof Uint8Array)  return Promise.resolve(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
    // Blob
    if (typeof input.arrayBuffer === 'function') return input.arrayBuffer();
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload  = function (e) { resolve(e.target.result); };
      fr.onerror = reject;
      fr.readAsArrayBuffer(input);
    });
  }

  // Add pyscratch.json to an sb3 Blob/Buffer and return a new Blob.
  function injectPyScratchData(sb3) {
    return ensureJSZip().then(function (JSZip) {
      return toArrayBuffer(sb3).then(function (buf) {
        return JSZip.loadAsync(buf);
      }).then(function (zip) {
        zip.file('pyscratch.json', JSON.stringify({ v: 1, sprites: S.spriteCode }, null, 2));
        return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      });
    });
  }

  // Try to read pyscratch.json from a binary input.
  // Returns { buffer: ArrayBuffer, pyCode: object|null }.
  // If the input is not a ZIP or has no pyscratch.json, pyCode is null and
  // buffer is the original data unchanged (for normal .sb3 files).
  function extractPyScratchData(input) {
    var isBinary = (input instanceof ArrayBuffer) || (input instanceof Uint8Array) ||
                   (typeof Blob !== 'undefined' && input instanceof Blob);
    if (!isBinary) return Promise.resolve({ buffer: input, pyCode: null });

    return ensureJSZip().then(function (JSZip) {
      return toArrayBuffer(input).then(function (buf) {
        return JSZip.loadAsync(buf.slice(0) /* clone so original is preserved */).then(function (zip) {
          var psFile = zip.file('pyscratch.json');
          if (!psFile) return { buffer: buf, pyCode: null };
          return psFile.async('string').then(function (raw) {
            var pyCode = null;
            try { var p = JSON.parse(raw); pyCode = p.sprites || p; } catch(e) {}
            zip.remove('pyscratch.json');
            return zip.generateAsync({ type: 'arraybuffer' }).then(function (clean) {
              return { buffer: clean, pyCode: pyCode };
            });
          });
        }).catch(function () {
          // Not a valid ZIP — treat as plain .sb3
          return toArrayBuffer(input).then(function (buf2) { return { buffer: buf2, pyCode: null }; });
        });
      });
    }).catch(function () {
      // JSZip unavailable — pass input through unchanged
      return { buffer: input, pyCode: null };
    });
  }

  // ── Theme sync ────────────────────────────────────────────────
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function hexToRgb(hex) {
    var value = String(hex || '').trim();
    if (value.charAt(0) === '#') value = value.slice(1);
    if (value.length === 3) value = value.replace(/(.)/g, '$1$1');
    if (!/^[0-9a-f]{6}$/i.test(value)) return { r: 255, g: 76, b: 76 };
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16)
    };
  }

  function rgbToHex(rgb) {
    function part(n) {
      return clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
    }
    return '#' + part(rgb.r) + part(rgb.g) + part(rgb.b);
  }

  function mixHex(a, b, amountA) {
    var ca = hexToRgb(a);
    var cb = hexToRgb(b);
    var w = clamp(amountA, 0, 1);
    return rgbToHex({
      r: ca.r * w + cb.r * (1 - w),
      g: ca.g * w + cb.g * (1 - w),
      b: ca.b * w + cb.b * (1 - w)
    });
  }

  function twAccentColour(accent) {
    if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(String(accent || ''))) return accent;
    if (accent === 'purple') return '#855cd6';
    if (accent === 'blue') return '#4c97ff';
    return '#ff4c4c';
  }

  function cssVar(name, fallback) {
    try {
      var value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return value || fallback;
    } catch(e) {
      return fallback;
    }
  }

  function readTurboWarpTheme() {
    var setting = null;
    var parsed = null;
    try { setting = localStorage.getItem('tw:theme'); } catch(e) {}

    if (setting === 'light' || setting === 'dark') {
      return { gui: setting, accent: '#ff4c4c', signature: setting };
    }

    if (setting) {
      try { parsed = JSON.parse(setting); } catch(e) {}
    }

    var gui = parsed && (parsed.gui === 'light' || parsed.gui === 'dark') ? parsed.gui : null;
    if (!gui) {
      gui = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    return {
      gui: gui,
      accent: twAccentColour(parsed && parsed.accent),
      signature: setting || gui
    };
  }

  function turboWarpThemeSignature(theme) {
    return [
      theme.signature,
      cssVar('--ui-primary', ''),
      cssVar('--ui-secondary', ''),
      cssVar('--ui-tertiary', ''),
      cssVar('--looks-secondary', ''),
      cssVar('--looks-transparent', ''),
      cssVar('--text-primary', '')
    ].join('|');
  }

  function applyPyScratchTheme() {
    var theme = readTurboWarpTheme();
    var dark = theme.gui !== 'light';
    var root = document.documentElement;
    var accent = cssVar('--looks-secondary', theme.accent);
    var accentSoft = cssVar('--looks-transparent', dark ? mixHex(theme.accent, '#1e1e1e', 0.36) : mixHex(theme.accent, '#ffffff', 0.18));
    var vars = dark ? {
      '--ps-accent': accent,
      '--ps-accent-soft': accentSoft,
      '--ps-accent-hover': cssVar('--looks-secondary-dark', accent),
      '--ps-panel': cssVar('--ui-secondary', '#1e1e1e'),
      '--ps-panel-2': cssVar('--ui-primary', '#111111'),
      '--ps-panel-3': cssVar('--ui-tertiary', '#2e2e2e'),
      '--ps-panel-hover': cssVar('--ui-tertiary', '#2e2e2e'),
      '--ps-border': cssVar('--ui-black-transparent', '#ffffff26'),
      '--ps-border-strong': cssVar('--ui-black-transparent', '#ffffff26'),
      '--ps-text': cssVar('--text-primary', '#eeeeee'),
      '--ps-text-strong': '#ffffff',
      '--ps-muted': '#b8b8b8',
      '--ps-muted-2': '#a6a6a6',
      '--ps-console': cssVar('--ui-primary', '#111111'),
      '--ps-success': '#a6e3a1',
      '--ps-error': '#f38ba8',
      '--ps-shadow': cssVar('--shadow', 'rgba(0,0,0,.4)'),
      '--ps-modal-scrim': cssVar('--ui-modal-overlay', '#333333aa'),
      '--ps-code-bg': cssVar('--input-background', '#1e1e1e'),
      '--ps-selection': accentSoft
    } : {
      '--ps-accent': accent,
      '--ps-accent-soft': accentSoft,
      '--ps-accent-hover': cssVar('--looks-secondary-dark', accent),
      '--ps-panel': cssVar('--ui-white', '#ffffff'),
      '--ps-panel-2': cssVar('--ui-primary', '#f9f9f9'),
      '--ps-panel-3': cssVar('--ui-secondary', '#f0f0f0'),
      '--ps-panel-hover': cssVar('--ui-tertiary', '#e8e8e8'),
      '--ps-border': cssVar('--ui-black-transparent', 'rgba(0,0,0,.15)'),
      '--ps-border-strong': cssVar('--ui-black-transparent', 'rgba(0,0,0,.2)'),
      '--ps-text': cssVar('--text-primary', '#575e75'),
      '--ps-text-strong': '#222222',
      '--ps-muted': 'rgba(87,94,117,.78)',
      '--ps-muted-2': 'rgba(87,94,117,.7)',
      '--ps-console': cssVar('--ui-primary', '#f9f9f9'),
      '--ps-success': '#047857',
      '--ps-error': '#b91c1c',
      '--ps-shadow': cssVar('--shadow', 'rgba(15,23,42,.16)'),
      '--ps-modal-scrim': cssVar('--ui-modal-overlay', 'rgba(15,23,42,.35)'),
      '--ps-code-bg': cssVar('--input-background', '#ffffff'),
      '--ps-selection': accentSoft
    };

    Object.keys(vars).forEach(function (name) {
      root.style.setProperty(name, vars[name]);
    });
    root.setAttribute('data-pyscratch-theme', theme.gui);
    S.themeSignature = turboWarpThemeSignature(theme);
  }

  function watchPyScratchTheme() {
    if (watchPyScratchTheme.started) return;
    watchPyScratchTheme.started = true;
    window.addEventListener('storage', function (e) {
      if (!e || e.key === 'tw:theme') applyPyScratchTheme();
    });
    setInterval(function () {
      var theme = readTurboWarpTheme();
      if (turboWarpThemeSignature(theme) !== S.themeSignature) applyPyScratchTheme();
    }, 750);
  }

  // ── Ask dialog ───────────────────────────────────────────────
  // Shows a small input box over the stage (bottom-right) and resolves when
  // the student presses Enter or clicks the tick button.
  function showAskDialog(question, resolve) {
    var wrap  = document.getElementById('ps-ask-wrap');
    if (!wrap) { resolve(''); return; }
    var qEl   = wrap.querySelector('.ps-ask-q');
    var input = wrap.querySelector('.ps-ask-input');
    var btn   = wrap.querySelector('.ps-ask-submit');

    qEl.textContent = question || '';
    input.value = '';
    wrap.classList.add('active');

    function submit() {
      wrap.classList.remove('active');
      resolve(input.value);
      input.removeEventListener('keydown', onKey);
      btn.removeEventListener('click', submit);
    }
    function onKey(e) {
      if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); submit(); }
    }
    input.addEventListener('keydown', onKey);
    btn.addEventListener('click', submit);
    setTimeout(function () { try { input.focus(); } catch(e) {} }, 30);
  }

  // ── Build UI ──────────────────────────────────────────────────
  function buildUI() {
    // Inject styles
    var style = document.createElement('style');
    style.textContent = [
      // Overlay container
      '#ps-overlay{position:fixed;left:0;right:0;top:92px;bottom:0;z-index:45;display:flex;flex-direction:column;pointer-events:none;font-family:"Roboto","Segoe UI",Arial,sans-serif;font-size:14px}',
      '#ps-overlay.ps-suppressed{display:none}',

      '#ps-help-btn{position:absolute;top:7px;right:10px;z-index:3;background:var(--ps-panel-3,#252537);border:1px solid var(--ps-border-strong,#45456a);color:var(--ps-text,#cdd6f4);cursor:pointer;padding:4px 8px;border-radius:6px;font-size:12px;font-family:inherit;line-height:1.2;box-shadow:0 2px 8px var(--ps-shadow,rgba(0,0,0,.24))}',
      '#ps-help-btn:hover{background:var(--ps-accent-soft,#303052);color:var(--ps-text-strong,#fff);border-color:var(--ps-accent,#6366f1)}',
      '#ps-status{position:absolute;top:10px;right:64px;z-index:3;font-size:11px;color:var(--ps-success,#a6e3a1);opacity:.85;pointer-events:none}',

      // Body split — width of ps-left is set dynamically by adjustOverlay()
      '#ps-body{flex:1;display:flex;overflow:hidden;pointer-events:none}',
      '#ps-left{width:50%;display:flex;flex-direction:column;background:var(--ps-panel,#1e1e2e);pointer-events:auto;border-right:2px solid var(--ps-border,#312d4b);box-shadow:4px 0 20px var(--ps-shadow,rgba(0,0,0,.4));flex-shrink:0;position:relative}',
      '#ps-right{flex:1;pointer-events:none;background:transparent}', // Pass-through to TurboWarp stage

      // Code area
      '#ps-code-area{flex:1;display:flex;overflow:hidden}',

      // Thread sidebar
      '#ps-threads{width:152px;background:var(--ps-panel-2,#18182a);border-right:1px solid var(--ps-border,#312d4b);display:flex;flex-direction:column;flex-shrink:0}',
      '#ps-thread-head{padding:5px 8px;background:var(--ps-panel-3,#1f1f33);font-size:10px;font-weight:700;color:var(--ps-muted-2,#7777aa);text-transform:uppercase;letter-spacing:.07em;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--ps-border,#312d4b)}',
      '#ps-thread-head button{background:none;border:none;color:var(--ps-muted,#6666aa);cursor:pointer;font-size:16px;line-height:1;padding:0 2px}',
      '#ps-thread-head button:hover{color:var(--ps-accent,#aaaaee)}',
      '#ps-thread-list{flex:1;overflow-y:auto;padding:5px}',
      '.ps-titem{padding:5px 8px;border-radius:6px;background:var(--ps-panel-3,#252538);color:var(--ps-muted,#b0b0cc);border:1px solid transparent;cursor:pointer;font-size:12px;margin-bottom:3px;display:flex;justify-content:space-between;align-items:center}',
      '.ps-titem.active{background:var(--ps-accent-soft,#36365a);border-color:var(--ps-accent,#5a5a8a);color:var(--ps-text-strong,#fff)}',
      '.ps-titem:hover:not(.active){background:var(--ps-panel-hover,#2d2d48)}',
      '.ps-tactions{display:none;gap:2px}',
      '.ps-titem:hover .ps-tactions{display:flex}',
      '.ps-tactions button{background:none;border:none;cursor:pointer;color:var(--ps-muted,#777);font-size:11px;padding:1px 4px;border-radius:3px}',
      '.ps-tactions button:hover{color:var(--ps-text-strong,#fff);background:var(--ps-accent-soft,#444)}',

      // Editor + console
      '#ps-editor-wrap{flex:1;display:flex;flex-direction:column;overflow:hidden}',
      '#ps-editor{flex:1;background:var(--ps-panel,#1e1e2e);color:var(--ps-text,#cdd6f4);border:none;outline:none;resize:none;font-family:"Roboto Mono","Consolas","Courier New",monospace;font-size:13px;line-height:1.65;padding:12px;tab-size:4;overflow-y:auto;min-height:0}',
      '#ps-editor::selection{background:var(--ps-selection,#3b3b5a)}',
      '#ps-console{height:72px;background:var(--ps-console,#13131f);color:var(--ps-success,#a6e3a1);font-family:"Roboto Mono","Consolas",monospace;font-size:11px;padding:5px 10px;overflow-y:auto;border-top:1px solid var(--ps-border,#312d4b);flex-shrink:0;line-height:1.5}',
      '.ps-con-err{color:var(--ps-error,#f38ba8)}',

      // Hide TurboWarp blocks and related elements when PyScratch is active
      '.blocklyDiv,.blocklyToolboxDiv,.blocklyFlyout,.blocklyWidgetDiv{display:none !important}',

      // Ask dialog — appears over the stage area
      '#ps-ask-wrap{position:fixed;bottom:14px;right:14px;width:300px;z-index:10010;pointer-events:none}',
      '#ps-ask-wrap.active{pointer-events:auto}',
      '.ps-ask-box{display:none;background:var(--ps-panel,#fff);border:2px solid var(--ps-accent,#4c97ff);border-radius:8px;padding:8px 10px;box-shadow:0 4px 20px var(--ps-shadow,rgba(0,0,0,.35))}',
      '#ps-ask-wrap.active .ps-ask-box{display:block}',
      '.ps-ask-q{font-size:12px;color:var(--ps-text,#333);margin-bottom:6px;min-height:1em}',
      '.ps-ask-row{display:flex;gap:5px}',
      '.ps-ask-input{flex:1;padding:4px 8px;border:1.5px solid var(--ps-border,#cbd5e1);border-radius:5px;font-size:13px;font-family:inherit;background:var(--ps-code-bg,#fff);color:var(--ps-text,#333);outline:none}',
      '.ps-ask-input:focus{border-color:var(--ps-accent,#4c97ff)}',
      '.ps-ask-submit{background:var(--ps-accent,#4c97ff);border:none;color:#fff;border-radius:5px;cursor:pointer;padding:0 11px;font-size:15px;line-height:1}',
      '.ps-ask-submit:hover{opacity:.85}',

      // Help modal
      '#ps-help{position:fixed;inset:0;background:var(--ps-modal-scrim,rgba(0,0,0,.65));z-index:20000;display:flex;align-items:center;justify-content:center}',
      '#ps-help.hidden{display:none}',
      '.ps-mbox{background:var(--ps-panel,#1e1e2e);color:var(--ps-text,#cdd6f4);border-radius:10px;width:680px;max-width:94vw;max-height:82vh;display:flex;flex-direction:column;border:1px solid var(--ps-border-strong,#3f3f5a);font-family:"Roboto","Segoe UI",Arial,sans-serif}',
      '.ps-mhead{padding:12px 16px;border-bottom:1px solid var(--ps-border-strong,#3f3f5a);display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:16px}',
      '.ps-mhead button{background:none;border:none;color:var(--ps-muted,#888);font-size:22px;cursor:pointer}',
      '.ps-mhead button:hover{color:var(--ps-text-strong,#ccc)}',
      '.ps-mbody{flex:1;overflow-y:auto;padding:14px 18px}',
      '.ps-hsec{margin-bottom:16px;border-radius:8px;overflow:hidden;border:1px solid var(--ps-border-strong,#3f3f5a)}',
      '.ps-hcat{padding:7px 12px;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.06em}',
      '.ps-hcat.mov{background:#1a3458;color:#7dd3fc}',
      '.ps-hcat.look{background:#331b52;color:#d8b4fe}',
      '.ps-hcat.snd{background:#3b1645;color:#e9b3f4}',
      '.ps-hcat.evt{background:#3a2800;color:#fcd34d}',
      '.ps-hcat.ops{background:#14321e;color:#86efac}',
      '.ps-hcat.ctrl{background:#332514;color:#fcd34d}',
      '.ps-hcat.sens{background:#143232;color:#67e8f9}',
      '.ps-hitems{padding:10px 14px;background:var(--ps-panel-3,#252538)}',
      '.ps-hitem{margin-bottom:10px}',
      '.ps-hitem:last-child{margin-bottom:0}',
      '.ps-hitem code{background:var(--ps-code-bg,#312d4b);padding:2px 6px;border-radius:4px;font-family:monospace;font-size:12px;color:var(--ps-accent,#cba6f7)}',
      '.ps-hitem p{margin:4px 0 0;font-size:12px;color:var(--ps-muted,#9090b0);line-height:1.4}'
    ].join('\n');
    document.head.appendChild(style);

    // Build overlay HTML
    var o = document.createElement('div');
    o.id = 'ps-overlay';
    o.innerHTML = [
      '<div id="ps-body">',
        '<div id="ps-left">',
          '<button id="ps-help-btn" title="PyScratch help">Help</button>',
          '<span id="ps-status"></span>',
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
    // Key tracking — also fire when_key_pressed handlers on rising edge
    window.addEventListener('keydown', function (e) {
      var key = normKey(e.key);
      if (!S.pressedKeys[key]) {
        S.pressedKeys[key] = true;
        if (S.running) fireEventHandlers(null, 'key', key);
      }
    });
    window.addEventListener('keyup', function (e) { S.pressedKeys[normKey(e.key)] = false; });

    // Mouse tracking (map to Scratch coords: centre=0,0; Y-up)
    window.addEventListener('mousemove', function (e) {
      var canvas = document.querySelector('canvas');
      if (!canvas) return;
      var r = canvas.getBoundingClientRect();
      S.mouse.x =  ((e.clientX - r.left) / r.width)  * 480 - 240;
      S.mouse.y = -(((e.clientY - r.top)  / r.height) * 360 - 180);
    });

    // Ask dialog element
    var askWrap = document.createElement('div');
    askWrap.id = 'ps-ask-wrap';
    askWrap.innerHTML = '<div class="ps-ask-box"><div class="ps-ask-q"></div>' +
      '<div class="ps-ask-row">' +
        '<input class="ps-ask-input" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">' +
        '<button class="ps-ask-submit">&#10003;</button>' +
      '</div></div>';
    document.body.appendChild(askWrap);

    // Mouse button tracking (for mouse_down())
    window.addEventListener('mousedown', function (e) { if (e.button === 0) S.mouse.down = true; });
    window.addEventListener('mouseup',   function (e) { if (e.button === 0) S.mouse.down = false; });

    // Sprite click — fire when_clicked handlers using the renderer's pick()
    window.addEventListener('mousedown', function (e) {
      if (!S.running) return;
      var canvas = document.querySelector('canvas');
      if (!canvas) return;
      var r = canvas.getBoundingClientRect();
      var offsetX = e.clientX - r.left;
      var offsetY = e.clientY - r.top;
      if (offsetX < 0 || offsetY < 0 || offsetX > r.width || offsetY > r.height) return;
      try {
        var drawableID = S.vm.runtime.renderer.pick(offsetX, offsetY);
        if (drawableID !== null && drawableID !== undefined) {
          var tgt = S.vm.runtime.targets.find(function (t) {
            return !t.isStage && t.drawableID === drawableID;
          });
          if (tgt && tgt.sprite) fireEventHandlers(tgt.sprite.name, 'clicked', null);
        }
      } catch(e) {}
    });
  }

  // ── Help modal HTML ───────────────────────────────────────────
  function buildHelpHTML() {
    var sections = [
      { cat:'mov', title:'Movement', items:[
        { code:'move_steps(steps)', desc:'Move the sprite forward in its current direction.' },
        { code:'turn_right(degrees) / turn_left(degrees)', desc:'Rotate clockwise or anticlockwise by the given degrees. turn(degrees) still works as a shortcut for turn_right.' },
        { code:'go_to(target) / go_to_xy(x, y)', desc:'Teleport to "random", "mouse_pointer", another sprite name, or exact coordinates.' },
        { code:'glide_to(target, secs) / glide_to_xy(secs, x, y)', desc:'Smoothly glide to a target or to exact coordinates over secs seconds.' },
        { code:'point_in_direction(degrees)', desc:'Face a Scratch direction such as 90 for right, -90 for left, 0 for up, or 180 for down.' },
        { code:'point_towards(target)', desc:'Point at "random", "mouse_pointer", another sprite name, or pass x and y coordinates.' },
        { code:'change_x(dx) / change_y(dy)', desc:'Move relative to current position.' },
        { code:'set_x(x) / set_y(y)', desc:'Set absolute position.' },
        { code:'x_position() / y_position() / direction()', desc:'Read current position or direction. get_x(), get_y(), and get_direction() still work.' },
        { code:'on_edge()', desc:'Returns True when touching the stage boundary.' },
        { code:'if_on_edge_bounce()', desc:'Reflect direction when touching the stage boundary. bounce() still works as a shortcut.' },
        { code:'set_rotation_style(style)', desc:'Use "all around", "left-right", or "don\\\'t rotate".' },
      ]},
      { cat:'look', title:'Looks', items:[
        { code:'say(message)', desc:'Show a speech bubble without pausing. say_for(message, secs) shows it for a set time and waits.' },
        { code:'think(message)', desc:'Show a thought bubble without pausing. think_for(message, secs) shows it for a set time and waits.' },
        { code:'set_costume(name)', desc:'Switch costume by name, number (1-based), "next", "previous", or "random".' },
        { code:'next_costume() / previous_costume()', desc:'Step through costumes one at a time.' },
        { code:'costume_number() / costume_name()', desc:'Return the current costume number (1-based) or name.' },
        { code:'set_backdrop(name)', desc:'Switch the stage backdrop by name, number, "next", "previous", or "random".' },
        { code:'next_backdrop() / previous_backdrop()', desc:'Step through backdrops.' },
        { code:'backdrop_number() / backdrop_name()', desc:'Return the current backdrop number (1-based) or name.' },
        { code:'set_size(percent) / change_size(amount)', desc:'Set or adjust sprite size. 100 is default.' },
        { code:'size()', desc:'Return the current size as a percentage.' },
        { code:'show() / hide()', desc:'Show or hide the sprite.' },
        { code:'set_effect(effect, value)', desc:'Set a graphic effect. Effects: "color", "fisheye", "whirl", "pixelate", "mosaic", "brightness", "ghost".' },
        { code:'change_effect(effect, amount)', desc:'Change a graphic effect by the given amount.' },
        { code:'clear_effects()', desc:'Remove all graphic effects from this sprite.' },
        { code:'go_to_front() / go_to_back()', desc:'Move this sprite to the front or back layer.' },
        { code:'go_forward(n) / go_backward(n)', desc:'Move this sprite forward or backward by n layers (default 1).' },
      ]},
      { cat:'evt', title:'Events', items:[
        { code:'def game_start():', desc:'Runs when the green flag is clicked. This is the main entry point for your code.' },
        { code:'def when_clicked():', desc:'Runs each time this sprite is clicked. Define this function to react to clicks.' },
        { code:'def when_key_pressed(key):', desc:'Called on every key-down. Check which key with: if key == "space": ...' },
        { code:'def when_backdrop_switches_to(backdrop):', desc:'Called after set_backdrop() changes the backdrop. Receives the new backdrop name.' },
        { code:'def when_message_received(message):', desc:'Called when broadcast() or broadcast_and_wait() sends a matching message.' },
        { code:'broadcast(message)', desc:'Send a message to all when_message_received handlers immediately. Does not pause.' },
        { code:'broadcast_and_wait(message)', desc:'Send a message and pause this thread until every handler finishes running.' },
      ]},
      { cat:'snd', title:'Sound', items:[
        { code:'play_sound(name)', desc:'Start playing a sound by name or number without waiting.' },
        { code:'play_sound_until_done(name)', desc:'Play a sound and pause this thread until it finishes.' },
        { code:'stop_all_sounds()', desc:'Stop all currently playing sounds.' },
        { code:'set_sound_effect("pitch", value)', desc:'Set a sound effect. Effects: "pitch" (semitones) and "pan left right" (−100 to 100).' },
        { code:'change_sound_effect("pitch", amount)', desc:'Change a sound effect by the given amount.' },
        { code:'clear_sound_effects()', desc:'Remove all sound effects from this sprite.' },
        { code:'set_volume(percent)', desc:'Set the volume (0–100). Default is 100.' },
        { code:'change_volume(amount)', desc:'Change the volume by the given amount.' },
        { code:'volume()', desc:'Return the current volume as a percentage.' },
      ]},
      { cat:'ctrl', title:'Control', items:[
        { code:'wait(secs)', desc:'Pause this thread for secs seconds. wait(0) yields for one frame.' },
        { code:'wait_until(lambda: condition)', desc:'Yield every frame until the condition is True. Example: wait_until(lambda: touching("Ball"))' },
        { code:'stop()', desc:'Stop all threads and clones immediately.' },
        { code:'create_clone()', desc:'Create a clone of this sprite. The clone runs when_I_start_as_a_clone().' },
        { code:'create_clone_of(sprite)', desc:'Create a clone of another sprite by name.' },
        { code:'delete_clone()', desc:'Delete this clone and stop its thread immediately. Only works inside a clone.' },
        { code:'is_clone()', desc:'Returns True if the current sprite is a clone.' },
        { code:'def when_I_start_as_a_clone():', desc:'Runs automatically for each new clone. Use while True: for a continuous loop, delete_clone() to remove it.' },
      ]},
      { cat:'sens', title:'Sensing', items:[
        { code:'touching("SpriteName")', desc:'True if this sprite is touching another sprite.' },
        { code:'touching("mouse_pointer")', desc:'True if touching the mouse cursor.' },
        { code:'distance_to("SpriteName")', desc:'Pixel distance to another sprite or "mouse_pointer".' },
        { code:'key_pressed("space")', desc:'True while a key is held. Keys: space, up, down, left, right, a–z, 0–9.' },
        { code:'mouse_x() / mouse_y()', desc:'Mouse position in Scratch coordinates (0,0 = centre).' },
        { code:'mouse_down()', desc:'True while the left mouse button is held.' },
        { code:'ask(question)', desc:'Show a text-input dialog over the stage. Waits for the student to type and press Enter.' },
        { code:'answer()', desc:'Return the last text submitted by ask().' },
        { code:'timer()', desc:'Seconds elapsed since the green flag was pressed (or reset_timer() was called).' },
        { code:'reset_timer()', desc:'Reset the timer back to zero.' },
        { code:'current("year")', desc:'Return the current year, month, date, day of week, hour, minute, or second.' },
        { code:'days_since_2000()', desc:'Floating-point number of days elapsed since 1 January 2000.' },
      ]},
      { cat:'ops', title:'Operators', items:[
        { code:'pick_random(1, 10)', desc:'Random integer between the two values (inclusive). Returns a float if either value is a float.' },
        { code:'floor(n) / ceiling(n)', desc:'Round down or up to the nearest integer.' },
        { code:'sqrt(n)', desc:'Square root.' },
        { code:'sin(degrees) / cos(degrees) / tan(degrees)', desc:'Trigonometry using degrees, matching Scratch\'s operator block. Note: Python\'s math.sin uses radians.' },
        { code:'asin(n) / acos(n) / atan(n)', desc:'Inverse trig — return a result in degrees.' },
        { code:'ln(n)', desc:'Natural logarithm (base e).' },
        { code:'log(n)', desc:'Base-10 logarithm.' },
        { code:'e_to(n)', desc:'Raise e to the power n  (e^n).' },
        { code:'ten_to(n)', desc:'Raise 10 to the power n  (10^n).' },
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
  function nativeSelectedSpriteName() {
    try {
      var target = null;
      if (S.vm && S.vm.editingTarget) target = S.vm.editingTarget;
      if (!target && S.vm && S.vm.runtime && typeof S.vm.runtime.getEditingTarget === 'function') {
        target = S.vm.runtime.getEditingTarget();
      }
      if (!target && S.vm && S.vm.runtime && S.vm.runtime._editingTarget) {
        if (typeof S.vm.runtime._editingTarget === 'string') {
          target = S.vm.runtime.targets.find(function(t) { return t.id === S.vm.runtime._editingTarget; });
        } else {
          target = S.vm.runtime._editingTarget;
        }
      }
      if (target && !target.isStage && target.sprite) return target.sprite.name;
    } catch(e) {}
    try {
      var selected = document.querySelector('[class*="sprite-selector-item_is-selected"],[class*="sprite-selector-item_isSelected"]');
      if (selected) {
        var firstLine = (selected.textContent || '').trim().split(/\n/)[0].trim();
        if (firstLine) return firstLine;
      }
    } catch(e) {}
    return null;
  }

  function syncSelectedSprite(force) {
    var sprites = getSprites();
    if (!sprites.length) return;
    var selectedName = nativeSelectedSpriteName() || (S.activeSprite && getTargetByName(S.activeSprite) ? S.activeSprite : sprites[0].sprite.name);
    if (!selectedName) return;
    if (force || selectedName !== S.activeSprite) {
      saveCurrentCode();
      S.activeSprite = selectedName;
      S.activeThreadIdx = 0;
      renderThreadList();
      loadCodeToEditor();
    }
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
    var overlay = document.getElementById('ps-overlay');
    var leftEl  = document.getElementById('ps-left');
    if (!canvas || !leftEl || !overlay) return;
    var rect = canvas.getBoundingClientRect();
    if (rect.top > 40 && rect.top < window.innerHeight - 80) {
      overlay.style.left = '0px';
      overlay.style.right = '0px';
      overlay.style.top = Math.round(rect.top) + 'px';
      overlay.style.bottom = '0px';
    }
    // Only update if the canvas is plausibly on the right side of the screen
    if (rect.left > 60 && rect.left < window.innerWidth - 60) {
      leftEl.style.width = rect.left + 'px';
    }
  }

  function isCodeTabActive() {
    var tabs = document.querySelectorAll('[role="tab"], button, li');
    for (var i = 0; i < tabs.length; i++) {
      var el = tabs[i];
      if ((el.textContent || '').trim() !== 'Code') continue;
      var cls = typeof el.className === 'string' ? el.className : '';
      if (el.getAttribute('aria-selected') === 'true') return true;
      if (cls.indexOf('selected') !== -1 || cls.indexOf('--selected') !== -1) return true;
    }
    return false;
  }

  function isVisibleOverlayElement(el) {
    if (!el || el.id === 'ps-overlay' || el.closest('#ps-overlay') || el.closest('#ps-help')) return false;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    var rect = el.getBoundingClientRect();
    return rect.width > 36 && rect.height > 18 &&
      rect.bottom > 0 && rect.right > 0 &&
      rect.top < window.innerHeight && rect.left < window.innerWidth;
  }

  function hasTurboWarpBlockingOverlayOpen() {
    var nodes = document.body ? document.body.querySelectorAll('body *') : [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!isVisibleOverlayElement(el)) continue;
      var cls = typeof el.className === 'string' ? el.className : '';
      var role = el.getAttribute && el.getAttribute('role');
      var modal = el.getAttribute && el.getAttribute('aria-modal');
      var looksLikeTwOverlay =
        cls.indexOf('modal_') !== -1 ||
        cls.indexOf('library_') !== -1 ||
        cls.indexOf('ReactModal') !== -1 ||
        role === 'dialog' ||
        modal === 'true';
      if (!looksLikeTwOverlay) continue;
      var rect = el.getBoundingClientRect();
      if (role === 'dialog' || modal === 'true') return true;
      if (rect.width > window.innerWidth * 0.45 && rect.height > window.innerHeight * 0.35) return true;
    }
    return false;
  }

  function updateOverlaySuppression() {
    var overlay = document.getElementById('ps-overlay');
    if (!overlay) return;
    overlay.classList.toggle('ps-suppressed', !isCodeTabActive() || hasTurboWarpBlockingOverlayOpen());
  }

  function watchTurboWarpModals() {
    if (!window.MutationObserver || !document.body) return;
    var pending = false;
    function schedule() {
      if (pending) return;
      pending = true;
      setTimeout(function () {
        pending = false;
        updateOverlaySuppression();
        adjustOverlay();
      }, 50);
    }
    var observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'aria-modal', 'role'] });
    schedule();
  }

  // ── Duplicate-sprite detection ────────────────────────────────
  // When TurboWarp duplicates a sprite the copy shares the same costume
  // asset IDs as the original.  We use that to find the code source.
  function findCodeSource(target) {
    if (!target.sprite || !target.sprite.costumes || !target.sprite.costumes.length) return null;
    var firstId = target.sprite.costumes[0].assetId;
    if (!firstId) return null;
    var sprites = getSprites();
    for (var i = 0; i < sprites.length; i++) {
      var t = sprites[i];
      if (t.sprite.name === target.sprite.name) continue; // skip self
      if (!S.spriteCode[t.sprite.name]) continue;         // skip sprites with no code yet
      var costumes = t.sprite.costumes;
      for (var j = 0; j < costumes.length; j++) {
        if (costumes[j].assetId === firstId) return t.sprite.name;
      }
    }
    return null;
  }

  // Called during sync to detect sprites that were just duplicated via
  // TurboWarp's UI and auto-copy the source sprite's Python code to them.
  function inheritCodeFromDuplicates() {
    var sprites = getSprites();
    sprites.forEach(function (t) {
      var name = t.sprite.name;
      // Skip if we already have code for this sprite (in memory or localStorage)
      if (S.spriteCode[name]) return;
      try { if (localStorage.getItem(storeKey(name))) return; } catch(e) {}
      // No code yet — look for a sprite with matching costume assets
      var sourceName = findCodeSource(t);
      if (!sourceName) return;
      // Deep-copy the source threads and assign fresh IDs to avoid collisions
      var copy = JSON.parse(JSON.stringify(S.spriteCode[sourceName]));
      copy.forEach(function (thread) {
        thread.id = 't_' + Date.now() + '_' + (Math.random() * 1e9 | 0);
      });
      S.spriteCode[name] = copy;
      saveThreads(name);
    });
  }

  // ── Sync ──────────────────────────────────────────────────────
  function sync() {
    inheritCodeFromDuplicates();
    syncSelectedSprite(!S.activeSprite);
    renderThreadList();
    updateOverlaySuppression();
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
      applyPyScratchTheme();
      watchPyScratchTheme();

      // Register Skulpt bridge builtins once — these are static functions
      // that receive the thread's gen token as an argument, so they never
      // need to be re-registered per thread.
      setupBridge();

      // Initial sync after TurboWarp finishes loading its project
      setTimeout(sync, 600);
      // Second pass in case TurboWarp takes longer on slow connections
      setTimeout(sync, 1500);

      // Re-sync (including overlay width) whenever sprites change or window resizes
      try { vm.runtime.on('TARGETS_UPDATE', function () { sync(); }); } catch(e) {}
      try { vm.runtime.on('EDITING_TARGET_CHANGED', function () { syncSelectedSprite(false); }); } catch(e) {}
      try { vm.runtime.on('TARGET_SELECTED', function () { syncSelectedSprite(false); }); } catch(e) {}
      setInterval(function () { syncSelectedSprite(false); }, 500);
      window.addEventListener('resize', adjustOverlay);
      watchTurboWarpModals();

      // Hook TurboWarp's green flag → start Python.
      try {
        vm.runtime.on('PROJECT_START', function () {
          setTimeout(startAll, 0);
        });
      } catch(e) {
        console.warn('[PyScratch] Could not attach PROJECT_START:', e);
      }

      // Hook TurboWarp's stop button → stop Python.
      // Patch BOTH vm.stopAll and vm.runtime.stopAll because TurboWarp may call
      // either path depending on context. The `if (S.running)` guard in each hook
      // prevents double-incrementing S.gen when both paths fire in the same tick.
      try {
        var _origStop = vm.stopAll.bind(vm);
        vm.stopAll = function () {
          if (S.running) stopAll();  // stop Python threads (guard vs double-stop)
          return _origStop();        // let TurboWarp stop its own threads
        };
      } catch(e) {
        console.warn('[PyScratch] Could not patch vm.stopAll:', e);
      }

      try {
        var _origRtStop = vm.runtime.stopAll.bind(vm.runtime);
        vm.runtime.stopAll = function () {
          if (S.running) stopAll();  // catch direct runtime.stopAll() calls
          return _origRtStop();
        };
      } catch(e) {
        console.warn('[PyScratch] Could not patch vm.runtime.stopAll:', e);
      }

      // Also listen for the runtime event as a belt-and-braces fallback
      try {
        vm.runtime.on('PROJECT_STOP_ALL', function () {
          if (S.running) stopAll();
        });
      } catch(e) {}

      // ── .psb3 interception ──────────────────────────────────────
      // Wrap vm.saveProjectSb3 so every TurboWarp save path (File menu,
      // Ctrl+S, toolbar button) embeds pyscratch.json in the output blob.
      try {
        var _origSaveSb3 = vm.saveProjectSb3.bind(vm);
        vm.saveProjectSb3 = function () {
          saveCurrentCode();                         // flush editor textarea first
          return _origSaveSb3().then(injectPyScratchData);
        };
      } catch(e) {
        console.warn('[PyScratch] Could not patch saveProjectSb3:', e);
      }

      // Rename the downloaded file from .sb3 → .psb3 by intercepting the
      // anchor.click() call that TurboWarp uses to trigger the download.
      // The check (blob: URL + .sb3 download attribute) is specific enough to
      // avoid affecting any other anchor clicks on the page.
      (function () {
        var _origAnchorClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {
          if (this.download && /\.sb3$/i.test(this.download) && /^blob:/i.test(this.href)) {
            this.download = this.download.replace(/\.sb3$/i, '.psb3');
          }
          return _origAnchorClick.call(this);
        };
      })();

      // Wrap vm.loadProject so any file loaded through TurboWarp's UI
      // (File menu, drag-and-drop) has its pyscratch.json extracted first.
      // Python code is applied BEFORE the project fires TARGETS_UPDATE → sync().
      try {
        var _origLoadProject = vm.loadProject.bind(vm);
        vm.loadProject = function (input) {
          return extractPyScratchData(input).then(function (result) {
            if (result.pyCode) S.spriteCode = result.pyCode;
            return _origLoadProject(result.buffer);
          });
        };
      } catch(e) {
        console.warn('[PyScratch] Could not patch loadProject:', e);
      }

      console.log('[PyScratch] Ready. vm=', vm, 'runtime=', vm.runtime);
    });
  });

})();
