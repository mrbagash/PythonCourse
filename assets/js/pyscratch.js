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

  // Demo mode — activated by ?pyscratch_demo (the guard above already matches it).
  // The lesson embeds  <iframe src="scratch/editor.html?pyscratch_demo=1&project_url=...">
  // and the iframe auto-runs the code stored in the .psb3, loops every N seconds,
  // shows a read-only highlighted code panel, and blocks stage interaction.
  var DEMO_MODE      = /[?&]pyscratch_demo/.test(location.search);
  var DEMO_LOOP_SECS = parseInt(((location.search.match(/[?&]demo_loop=(\d+)/) || [])[1]) || '8', 10) || 8;
  var DEMO_SPRITE    = decodeURIComponent(((location.search.match(/[?&]demo_sprite=([^&]*)/) || [])[1]) || '');


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

  // ── Tutorial data ─────────────────────────────────────────────
  // Each step:
  //   title    {string}   Shown in the tutorial bar header
  //   text     {string}   Instruction HTML
  //   starter  {string|null}  Pre-fill editor when this step loads (null = keep current)
  //   target   {string|null}  Code shown as a hint block
  //   requires {string[]} All must appear in editor before Next unlocks ([] = always unlocked)
  var TUTORIALS = [
    {
      id: 'if-statements',
      title: 'If Statements',
      emoji: '❓',
      desc: 'Learn to make decisions in Python — check a condition and run different code depending on whether it\'s true or false.',
      steps: [
        {
          title: 'Type the game loop',
          text: 'Every PyScratch program starts with a <code>game_start()</code> function. The <code>while True:</code> loop inside keeps it running every frame. Clear the editor and type this:',
          starter: '',
          target: 'def game_start():\n    while True:',
          newLines: ['def game_start():', '    while True:'],
          requires: ['def game_start():', '    while True:']
        },
        {
          title: 'Your first if statement',
          text: 'An <strong>if statement</strong> runs its code only when the condition is true. Add an if block inside the loop that checks whether the right arrow key is held:',
          starter: 'def game_start():\n    while True:',
          target: 'def game_start():\n    while True:\n        if key_pressed("right"):\n            change_x(5)',
          newLines: ['        if key_pressed("right"):', '            change_x(5)'],
          requires: ['        if key_pressed("right"):', '            change_x(5)']
        },
        {
          title: 'A second if for the left key',
          text: 'Add another <code>if</code> block below the first. Using two separate <code>if</code> blocks (rather than <code>elif</code>) means both can fire at once — useful for diagonal movement later.',
          starter: 'def game_start():\n    while True:\n        if key_pressed("right"):\n            change_x(5)',
          target: 'def game_start():\n    while True:\n        if key_pressed("right"):\n            change_x(5)\n        if key_pressed("left"):\n            change_x(-5)',
          newLines: ['        if key_pressed("left"):', '            change_x(-5)'],
          requires: ['        if key_pressed("left"):', '            change_x(-5)']
        },
        {
          title: '✅ Try it!',
          text: 'Click the <strong>green flag ▶</strong> and press the left and right arrow keys. The sprite should move — Scratch keeps it on screen automatically.<br><br><strong>Challenge:</strong> Add <code>if</code> blocks for the up and down keys using <code>change_y(5)</code> and <code>change_y(-5)</code>.',
          starter: null, target: null, newLines: [], requires: []
        }
      ]
    },
    {
      id: 'for-loops',
      title: 'For Loops',
      emoji: '🔁',
      desc: 'Repeat a block of code a fixed number of times using a for loop and range().',
      steps: [
        {
          title: 'Your first for loop',
          text: 'A <strong>for loop</strong> repeats its code a fixed number of times — no <code>while True:</code> needed. <code>range(5)</code> means "do this 5 times". Type the full function:',
          starter: '',
          target: 'def game_start():\n    for i in range(5):\n        change_x(30)\n        wait(0.3)',
          newLines: ['    for i in range(5):', '        change_x(30)', '        wait(0.3)'],
          requires: ['    for i in range(5):', '        change_x(30)', '        wait(0.3)']
        },
        {
          title: 'Use the loop variable',
          text: '<code>i</code> is the <strong>loop variable</strong> — Python sets it to the current count (0, 1, 2…). Add <code>say(str(i))</code> as the first line inside the loop. <code>str()</code> converts the number to text so <code>say()</code> can display it.',
          starter: 'def game_start():\n    for i in range(5):\n        change_x(30)\n        wait(0.3)',
          target: 'def game_start():\n    for i in range(5):\n        say(str(i))\n        change_x(30)\n        wait(0.3)',
          newLines: ['        say(str(i))'],
          requires: ['        say(str(i))']
        },
        {
          title: 'range() with a start and end',
          text: '<code>range()</code> can take two arguments: a start and a stop. <code>range(1, 6)</code> counts 1, 2, 3, 4, 5 — starting at 1 instead of 0. Update your range:',
          starter: 'def game_start():\n    for i in range(5):\n        say(str(i))\n        change_x(30)\n        wait(0.3)',
          target: 'def game_start():\n    for i in range(1, 6):\n        say(str(i))\n        change_x(30)\n        wait(0.3)',
          newLines: ['    for i in range(1, 6):'],
          requires: ['range(1, 6)']
        },
        {
          title: '✅ Try it!',
          text: 'Click the <strong>green flag ▶</strong>. The sprite should move five steps right, counting 1 to 5 as it goes, then stop.<br><br><strong>Challenge:</strong> Change to <code>range(1, 11)</code> for 10 steps. Try counting backwards with <code>range(10, 0, -1)</code>.',
          starter: null, target: null, newLines: [], requires: []
        }
      ]
    },
    {
      id: 'while-loops',
      title: 'While Loops',
      emoji: '🔄',
      desc: 'Keep repeating code until a condition becomes false — useful for countdowns, timers and waiting.',
      steps: [
        {
          title: 'Set up with a counter',
          text: 'Type the <code>game_start()</code> function and create a variable called <code>count</code> starting at 0. This will track how many times the loop has run.',
          starter: '',
          target: 'def game_start():\n    count = 0',
          newLines: ['def game_start():', '    count = 0'],
          requires: ['def game_start():', '    count = 0']
        },
        {
          title: 'A while loop with a condition',
          text: 'A <strong>while loop</strong> keeps running as long as its condition is true. Add the loop below — it moves the sprite right and counts up until <code>count</code> reaches 5:',
          starter: 'def game_start():\n    count = 0',
          target: 'def game_start():\n    count = 0\n    while count < 5:\n        change_x(25)\n        count = count + 1\n        wait(0.2)',
          newLines: ['    while count < 5:', '        change_x(25)', '        count = count + 1', '        wait(0.2)'],
          requires: ['    while count < 5:', '        count = count + 1', '        wait(0.2)']
        },
        {
          title: 'Code after the loop',
          text: 'Once <code>count</code> reaches 5 the condition is false and the loop ends. Python then runs whatever comes next. Add <code>say("Done!")</code> — with <strong>no</strong> indent, so it\'s outside the loop:',
          starter: 'def game_start():\n    count = 0\n    while count < 5:\n        change_x(25)\n        count = count + 1\n        wait(0.2)',
          target: 'def game_start():\n    count = 0\n    while count < 5:\n        change_x(25)\n        count = count + 1\n        wait(0.2)\n    say("Done!")',
          newLines: ['    say("Done!")'],
          requires: ['    say("Done!")']
        },
        {
          title: '✅ Try it!',
          text: 'Click the <strong>green flag ▶</strong>. The sprite should slide right five times, then show a speech bubble saying "Done!".<br><br><strong>Challenge:</strong> Change <code>count < 5</code> to <code>count < 10</code>. Or count backwards — start at <code>count = 10</code> and use <code>while count > 0</code>, subtracting 1 each time.',
          starter: null, target: null, newLines: [], requires: []
        }
      ]
    },
    {
      id: 'left-right-movement',
      title: 'Left & Right Movement',
      emoji: '🎮',
      desc: 'Make your sprite walk left and right with the arrow keys, facing the correct direction and bouncing off the edges.',
      steps: [
        {
          title: 'The game loop',
          text: 'Type the game loop. <code>set_rotation_style("left-right")</code> before the loop means the sprite will only flip horizontally — it will never tilt upside-down.',
          starter: '',
          target: 'def game_start():\n    set_rotation_style("left-right")\n    while True:',
          newLines: ['def game_start():', '    set_rotation_style("left-right")', '    while True:'],
          requires: ['def game_start():', '    set_rotation_style("left-right")', '    while True:']
        },
        {
          title: 'Move right',
          text: 'Add a right-key check inside the loop. <code>change_x(5)</code> moves 5 pixels right each frame. <code>point_in_direction(90)</code> faces the sprite right.',
          starter: 'def game_start():\n    set_rotation_style("left-right")\n    while True:',
          target: 'def game_start():\n    set_rotation_style("left-right")\n    while True:\n        if key_pressed("right"):\n            change_x(5)\n            point_in_direction(90)',
          newLines: ['        if key_pressed("right"):', '            change_x(5)', '            point_in_direction(90)'],
          requires: ['        if key_pressed("right"):', '            change_x(5)', '            point_in_direction(90)']
        },
        {
          title: 'Move left',
          text: 'Add a second <code>if</code> block below. <code>change_x(-5)</code> moves left. <code>point_in_direction(-90)</code> flips the sprite to face left.',
          starter: 'def game_start():\n    set_rotation_style("left-right")\n    while True:\n        if key_pressed("right"):\n            change_x(5)\n            point_in_direction(90)',
          target: 'def game_start():\n    set_rotation_style("left-right")\n    while True:\n        if key_pressed("right"):\n            change_x(5)\n            point_in_direction(90)\n        if key_pressed("left"):\n            change_x(-5)\n            point_in_direction(-90)',
          newLines: ['        if key_pressed("left"):', '            change_x(-5)', '            point_in_direction(-90)'],
          requires: ['        if key_pressed("left"):', '            change_x(-5)', '            point_in_direction(-90)']
        },
        {
          title: '✅ Try it!',
          text: 'Click the <strong>green flag ▶</strong> and press the arrow keys. Your sprite should move and face the right way — Scratch keeps it on screen automatically.<br><br><strong>Challenge:</strong> Add up and down movement with <code>change_y(5)</code> and <code>change_y(-5)</code>.',
          starter: null, target: null, newLines: [], requires: []
        }
      ]
    },
    {
      id: 'costume-animation',
      title: 'Costume Animation',
      emoji: '🎭',
      desc: 'Animate your sprite through its costumes when it moves and snap back to the idle pose when still.',
      steps: [
        {
          title: 'Starting point',
          text: 'The movement code has been loaded for you — read through it before continuing. Notice the structure: rotation style, loop, then two if blocks.<br><br>⚠️ Make sure your sprite has <strong>at least 2 costumes</strong>.',
          starter: 'def game_start():\n    set_rotation_style("left-right")\n    while True:\n        if key_pressed("right"):\n            change_x(5)\n            point_in_direction(90)\n        if key_pressed("left"):\n            change_x(-5)\n            point_in_direction(-90)',
          target: null, newLines: [], requires: []
        },
        {
          title: 'Animate while moving',
          text: 'Add <code>next_costume()</code> inside <strong>both</strong> if blocks, after each <code>point_in_direction</code> line. Each frame the key is held, the sprite advances one costume.',
          starter: 'def game_start():\n    set_rotation_style("left-right")\n    while True:\n        if key_pressed("right"):\n            change_x(5)\n            point_in_direction(90)\n        if key_pressed("left"):\n            change_x(-5)\n            point_in_direction(-90)',
          target: 'def game_start():\n    set_rotation_style("left-right")\n    while True:\n        if key_pressed("right"):\n            change_x(5)\n            point_in_direction(90)\n            next_costume()\n        if key_pressed("left"):\n            change_x(-5)\n            point_in_direction(-90)\n            next_costume()\n        if_on_edge_bounce()',
          newLines: ['            next_costume()'],
          requires: ['next_costume()']
        },
        {
          title: 'Idle pose when still',
          text: 'Right now the sprite freezes mid-walk when you stop. Add a <code>moved</code> flag — set it <code>True</code> inside each key block, then use it to either animate or snap to costume 1:',
          starter: 'def game_start():\n    set_rotation_style("left-right")\n    while True:\n        if key_pressed("right"):\n            change_x(5)\n            point_in_direction(90)\n            next_costume()\n        if key_pressed("left"):\n            change_x(-5)\n            point_in_direction(-90)\n            next_costume()\n        if_on_edge_bounce()',
          target: 'def game_start():\n    set_rotation_style("left-right")\n    while True:\n        moved = False\n        if key_pressed("right"):\n            change_x(5)\n            point_in_direction(90)\n            moved = True\n        if key_pressed("left"):\n            change_x(-5)\n            point_in_direction(-90)\n            moved = True\n        if moved:\n            next_costume()\n        else:\n            set_costume(1)\n        if_on_edge_bounce()',
          newLines: ['        moved = False', '            moved = True', '        if moved:', '            next_costume()', '        else:', '            set_costume(1)'],
          requires: ['moved = False', 'moved = True', 'set_costume(1)']
        },
        {
          title: 'Control animation speed',
          text: 'Costumes are changing every frame — too fast. Add <code>wait(0.08)</code> before <code>if_on_edge_bounce()</code> to cap animation at about 12 changes per second.',
          starter: 'def game_start():\n    set_rotation_style("left-right")\n    while True:\n        moved = False\n        if key_pressed("right"):\n            change_x(5)\n            point_in_direction(90)\n            moved = True\n        if key_pressed("left"):\n            change_x(-5)\n            point_in_direction(-90)\n            moved = True\n        if moved:\n            next_costume()\n        else:\n            set_costume(1)\n        if_on_edge_bounce()',
          target: 'def game_start():\n    set_rotation_style("left-right")\n    while True:\n        moved = False\n        if key_pressed("right"):\n            change_x(5)\n            point_in_direction(90)\n            moved = True\n        if key_pressed("left"):\n            change_x(-5)\n            point_in_direction(-90)\n            moved = True\n        if moved:\n            next_costume()\n        else:\n            set_costume(1)\n        wait(0.08)\n        if_on_edge_bounce()',
          newLines: ['        wait(0.08)'],
          requires: ['wait(0.08)']
        },
        {
          title: '✅ Try it!',
          text: 'Click the <strong>green flag ▶</strong> and walk left and right — your sprite should animate while moving and snap to idle when still.<br><br><strong>Challenge:</strong> Try <code>wait(0.2)</code> for a slow walk or <code>wait(0.04)</code> for a sprint.',
          starter: null, target: null, newLines: [], requires: []
        }
      ]
    },
    {
      id: 'gravity',
      title: 'Gravity & Jumping',
      emoji: '⬇️',
      desc: 'Add a velocity variable, pull the sprite down each frame, and let the player jump by pressing the up arrow.',
      steps: [
        {
          title: 'Create the velocity variable',
          text: 'Type <code>vy = 0</code> at the very top of the editor, before any function. This stores the vertical velocity — how fast the sprite moves up or down. Starting at 0 means it is stationary.',
          starter: '',
          target: 'vy = 0\n\ndef game_start():',
          newLines: ['vy = 0', '', 'def game_start():'],
          requires: ['vy = 0', 'def game_start():']
        },
        {
          title: 'The game loop with global',
          text: 'Add <code>global vy</code> and <code>while True:</code> inside the function. Without <code>global</code>, Python would create a new local copy of <code>vy</code> instead of using the one you just created.',
          starter: 'vy = 0\n\ndef game_start():',
          target: 'vy = 0\n\ndef game_start():\n    global vy\n    while True:',
          newLines: ['    global vy', '    while True:'],
          requires: ['    global vy', '    while True:']
        },
        {
          title: 'Apply gravity',
          text: 'Each frame, subtract 0.5 from <code>vy</code> (it becomes more negative = faster downward), then move the sprite by that amount. Add both lines inside the loop:',
          starter: 'vy = 0\n\ndef game_start():\n    global vy\n    while True:',
          target: 'vy = 0\n\ndef game_start():\n    global vy\n    while True:\n        vy = vy - 0.5\n        change_y(vy)',
          newLines: ['        vy = vy - 0.5', '        change_y(vy)'],
          requires: ['        vy = vy - 0.5', '        change_y(vy)']
        },
        {
          title: 'Add a floor',
          text: 'Without a floor the sprite falls forever. When it drops below y = −150, reset velocity to 0 and snap it back:',
          starter: 'vy = 0\n\ndef game_start():\n    global vy\n    while True:\n        vy = vy - 0.5\n        change_y(vy)',
          target: 'vy = 0\n\ndef game_start():\n    global vy\n    while True:\n        vy = vy - 0.5\n        change_y(vy)\n        if y_position() < -150:\n            vy = 0\n            set_y(-150)',
          newLines: ['        if y_position() < -150:', '            vy = 0', '            set_y(-150)'],
          requires: ['        if y_position() < -150:', '            set_y(-150)']
        },
        {
          title: 'Jumping',
          text: 'When the sprite is on the floor <em>and</em> the up key is pressed, set <code>vy</code> to 8 — this launches it upward. Gravity pulls it back down automatically:',
          starter: 'vy = 0\n\ndef game_start():\n    global vy\n    while True:\n        vy = vy - 0.5\n        change_y(vy)\n        if y_position() < -150:\n            vy = 0\n            set_y(-150)',
          target: 'vy = 0\n\ndef game_start():\n    global vy\n    while True:\n        vy = vy - 0.5\n        change_y(vy)\n        if y_position() < -150:\n            vy = 0\n            set_y(-150)\n        if key_pressed("up") and y_position() <= -149:\n            vy = 8',
          newLines: ['        if key_pressed("up") and y_position() <= -149:', '            vy = 8'],
          requires: ['        if key_pressed("up")', '            vy = 8']
        },
        {
          title: '✅ Try it!',
          text: 'Click the <strong>green flag ▶</strong> and press the up arrow to jump. The sprite should fall with gravity, land, and jump on command.<br><br><strong>Challenge:</strong> Add left and right movement: <code>if key_pressed("right"): change_x(4)</code> and the same for left.',
          starter: null, target: null, newLines: [], requires: []
        }
      ]
    },
    {
      id: 'bouncing-ball',
      title: 'Bouncing Ball',
      emoji: '🎱',
      desc: 'Make a sprite bounce around the stage by tracking its speed with variables and reversing direction when it hits a wall.',
      steps: [
        {
          title: 'Set up the velocity variables',
          text: 'A bouncing ball needs to track speed in both directions. <code>vx</code> is horizontal speed (positive = right), <code>vy</code> is vertical speed (positive = up). Type both at the top of the editor:',
          starter: '',
          target: 'vx = 3\nvy = 3\n\ndef game_start():',
          newLines: ['vx = 3', 'vy = 3', '', 'def game_start():'],
          requires: ['vx = 3', 'vy = 3', 'def game_start():']
        },
        {
          title: 'Move every frame',
          text: 'Add the game loop. Each frame, move the sprite by <code>vx</code> horizontally and <code>vy</code> vertically. <code>global vx, vy</code> lets the loop change both variables later when bouncing:',
          starter: 'vx = 3\nvy = 3\n\ndef game_start():',
          target: 'vx = 3\nvy = 3\n\ndef game_start():\n    global vx, vy\n    while True:\n        change_x(vx)\n        change_y(vy)',
          newLines: ['    global vx, vy', '    while True:', '        change_x(vx)', '        change_y(vy)'],
          requires: ['    global vx, vy', '    while True:', '        change_x(vx)', '        change_y(vy)']
        },
        {
          title: 'Bounce off left and right walls',
          text: 'When the ball hits the left or right edge, reverse its horizontal direction by flipping the sign of <code>vx</code>. Multiplying by <code>-1</code> turns 3 into -3 and vice versa:',
          starter: 'vx = 3\nvy = 3\n\ndef game_start():\n    global vx, vy\n    while True:\n        change_x(vx)\n        change_y(vy)',
          target: 'vx = 3\nvy = 3\n\ndef game_start():\n    global vx, vy\n    while True:\n        change_x(vx)\n        change_y(vy)\n        if x_position() > 220 or x_position() < -220:\n            vx = vx * -1',
          newLines: ['        if x_position() > 220 or x_position() < -220:', '            vx = vx * -1'],
          requires: ['        if x_position() > 220 or x_position() < -220:', '            vx = vx * -1']
        },
        {
          title: 'Bounce off top and bottom',
          text: 'Do the same for the top and bottom edges — flip <code>vy</code> when the ball goes above or below the stage:',
          starter: 'vx = 3\nvy = 3\n\ndef game_start():\n    global vx, vy\n    while True:\n        change_x(vx)\n        change_y(vy)\n        if x_position() > 220 or x_position() < -220:\n            vx = vx * -1',
          target: 'vx = 3\nvy = 3\n\ndef game_start():\n    global vx, vy\n    while True:\n        change_x(vx)\n        change_y(vy)\n        if x_position() > 220 or x_position() < -220:\n            vx = vx * -1\n        if y_position() > 160 or y_position() < -160:\n            vy = vy * -1',
          newLines: ['        if y_position() > 160 or y_position() < -160:', '            vy = vy * -1'],
          requires: ['        if y_position() > 160 or y_position() < -160:', '            vy = vy * -1']
        },
        {
          title: '✅ Try it!',
          text: 'Click the <strong>green flag ▶</strong>. The ball should bounce around forever without escaping.<br><br><strong>Challenge:</strong> Change <code>vx = 3</code> and <code>vy = 3</code> to different numbers so the ball takes a less predictable path. Try <code>vx = 4</code> and <code>vy = 3</code>. Can you add a second bouncing sprite?',
          starter: null, target: null, newLines: [], requires: []
        }
      ]
    },
    {
      id: 'flappy-bird',
      title: 'Flappy Bird',
      emoji: '🐦',
      desc: 'Build the Flappy Bird mechanic — gravity, tap-to-flap, tilting, and a pipe sprite that loops across the screen. You\'ll use two sprites: one for the bird, one for the pipe.',
      steps: [
        {
          title: 'Set up the velocity variable',
          text: 'Flappy Bird is all about vertical velocity. Type <code>vy = 0</code> before the function — the bird starts stationary and gravity will pull it down from there.',
          starter: '',
          target: 'vy = 0\n\ndef game_start():',
          newLines: ['vy = 0', '', 'def game_start():'],
          requires: ['vy = 0', 'def game_start():']
        },
        {
          title: 'Apply gravity',
          text: 'Add the game loop with <code>global vy</code> so gravity can update the velocity each frame, then move the sprite by it:',
          starter: 'vy = 0\n\ndef game_start():',
          target: 'vy = 0\n\ndef game_start():\n    global vy\n    while True:\n        vy = vy - 0.3\n        change_y(vy)',
          newLines: ['    global vy', '    while True:', '        vy = vy - 0.3', '        change_y(vy)'],
          requires: ['    global vy', '    while True:', '        vy = vy - 0.3', '        change_y(vy)']
        },
        {
          title: 'Add a floor and ceiling',
          text: 'Without limits the bird falls forever or flies off screen. Add both boundaries — floor at y = −150 and ceiling at y = 150:',
          starter: 'vy = 0\n\ndef game_start():\n    global vy\n    while True:\n        vy = vy - 0.3\n        change_y(vy)',
          target: 'vy = 0\n\ndef game_start():\n    global vy\n    while True:\n        vy = vy - 0.3\n        change_y(vy)\n        if y_position() < -150:\n            set_y(-150)\n            vy = 0\n        if y_position() > 150:\n            set_y(150)\n            vy = 0',
          newLines: ['        if y_position() < -150:', '            set_y(-150)', '            vy = 0', '        if y_position() > 150:', '            set_y(150)', '            vy = 0'],
          requires: ['y_position() < -150', 'y_position() > 150']
        },
        {
          title: 'Flap with the Space key',
          text: 'In Flappy Bird the player <strong>taps</strong> — not holds — a key. <code>when_key_pressed</code> fires <em>once</em> per tap, unlike <code>key_pressed()</code> which is true every frame the key is held down. Add a new function <strong>below</strong> <code>game_start</code>:',
          starter: 'vy = 0\n\ndef game_start():\n    global vy\n    while True:\n        vy = vy - 0.3\n        change_y(vy)\n        if y_position() < -150:\n            set_y(-150)\n            vy = 0\n        if y_position() > 150:\n            set_y(150)\n            vy = 0',
          target: 'vy = 0\n\ndef game_start():\n    global vy\n    while True:\n        vy = vy - 0.3\n        change_y(vy)\n        if y_position() < -150:\n            set_y(-150)\n            vy = 0\n        if y_position() > 150:\n            set_y(150)\n            vy = 0\n\ndef when_key_pressed(key):\n    global vy\n    if key == "space":\n        vy = 5',
          newLines: ['def when_key_pressed(key):', '    global vy', '    if key == "space":', '        vy = 5'],
          requires: ['def when_key_pressed(key):', 'if key == "space":', 'vy = 5']
        },
        {
          title: 'Tilt with velocity',
          text: 'A real Flappy Bird tilts up when rising and droops when falling. Add <code>set_rotation_style("all around")</code> before the loop, then tilt based on <code>vy</code> inside it:',
          starter: 'vy = 0\n\ndef game_start():\n    global vy\n    while True:\n        vy = vy - 0.3\n        change_y(vy)\n        if y_position() < -150:\n            set_y(-150)\n            vy = 0\n        if y_position() > 150:\n            set_y(150)\n            vy = 0\n\ndef when_key_pressed(key):\n    global vy\n    if key == "space":\n        vy = 5',
          target: 'vy = 0\n\ndef game_start():\n    global vy\n    set_rotation_style("all around")\n    while True:\n        vy = vy - 0.3\n        change_y(vy)\n        if vy > 0:\n            point_in_direction(-20)\n        else:\n            point_in_direction(20)\n        if y_position() < -150:\n            set_y(-150)\n            vy = 0\n        if y_position() > 150:\n            set_y(150)\n            vy = 0\n\ndef when_key_pressed(key):\n    global vy\n    if key == "space":\n        vy = 5',
          newLines: ['    set_rotation_style("all around")', '        if vy > 0:', '            point_in_direction(-20)', '        else:', '            point_in_direction(20)'],
          requires: ['set_rotation_style("all around")', 'point_in_direction(-20)', 'point_in_direction(20)']
        },
        {
          title: 'Add your obstacle sprite',
          text: 'Threads let one sprite do multiple things at once — but an obstacle is a <strong>completely different object</strong> in the game. It needs its own sprite with its own position.<br><br>Click the glowing <strong>sprite panel</strong> at the bottom of TurboWarp and add a new sprite. Choose anything — a ball, a block, a drawn shape — as long as it\'s something to dodge. Then click your new sprite to select it.',
          highlight: 'add-sprite-btn',
          highlightLabel: 'Add a sprite here',
          requiresSpriteCount: 2,
          requiresSpriteHint: 'Add a new sprite using the highlighted buttons',
          starter: null,
          target: null,
          newLines: [],
          requires: []
        },
        {
          title: 'Move the obstacle left',
          text: 'You\'re now editing the <strong>obstacle sprite\'s</strong> code — completely separate from the bird. Start it off-screen to the right at a <strong>random height</strong> using <code>pick_random</code>, then slide it left every frame:',
          starter: '',
          target: 'def game_start():\n    go_to_xy(240, pick_random(-100, 100))\n    while True:\n        change_x(-3)',
          newLines: ['def game_start():', '    go_to_xy(240, pick_random(-100, 100))', '    while True:', '        change_x(-3)'],
          requires: ['go_to_xy(240', 'pick_random(-100, 100)', 'change_x(-3)']
        },
        {
          title: 'Loop back at a new random height',
          text: 'When the obstacle slides past the left edge, reset it to the right at another <strong>random height</strong>. Each pass the player has to dodge a different position:',
          starter: 'def game_start():\n    go_to_xy(240, pick_random(-100, 100))\n    while True:\n        change_x(-3)',
          target: 'def game_start():\n    go_to_xy(240, pick_random(-100, 100))\n    while True:\n        change_x(-3)\n        if x_position() < -260:\n            go_to_xy(260, pick_random(-100, 100))',
          newLines: ['        if x_position() < -260:', '            go_to_xy(260, pick_random(-100, 100))'],
          requires: ['x_position() < -260', 'go_to_xy(260', 'pick_random(-100, 100)']
        },
        {
          title: '✅ Try it!',
          text: 'Click the <strong>green flag ▶</strong> and tap <strong>Space</strong> to flap. The bird should fall with gravity, tilt with velocity, and a pipe should scroll across from right to left on a loop.<br><br><strong>Challenge:</strong> Give the pipe sprite a tall thin costume so it actually looks like a pipe. Try <code>go_to_xy(pick_random(200, 280), pick_random(-80, 80))</code> when resetting so each pipe appears at a random height.',
          starter: null, target: null, newLines: [], requires: []
        }
      ]
    },
    {
      id: 'doodle-jump',
      title: 'Doodle Jump',
      emoji: '🦘',
      desc: 'Build the Doodle Jump mechanic — the character bounces upward automatically, moves left and right, and wraps around the screen edges.',
      steps: [
        {
          title: 'Starting velocity',
          text: 'In Doodle Jump the character immediately shoots upward. Set <code>vy = 8</code> (positive = upward) so it launches straight away — gravity will curve it back down.',
          starter: '',
          target: 'vy = 8\n\ndef game_start():',
          newLines: ['vy = 8', '', 'def game_start():'],
          requires: ['vy = 8', 'def game_start():']
        },
        {
          title: 'Gravity',
          text: 'Add the game loop with <code>global vy</code>, apply gravity each frame, and move the sprite by the velocity:',
          starter: 'vy = 8\n\ndef game_start():',
          target: 'vy = 8\n\ndef game_start():\n    global vy\n    while True:\n        vy = vy - 0.4\n        change_y(vy)',
          newLines: ['    global vy', '    while True:', '        vy = vy - 0.4', '        change_y(vy)'],
          requires: ['    global vy', '    while True:', '        vy = vy - 0.4', '        change_y(vy)']
        },
        {
          title: 'Bounce off the floor',
          text: 'Instead of stopping at the floor like in the gravity tutorial, set <code>vy</code> back to <code>8</code> when the sprite lands — this launches it upward again automatically:',
          starter: 'vy = 8\n\ndef game_start():\n    global vy\n    while True:\n        vy = vy - 0.4\n        change_y(vy)',
          target: 'vy = 8\n\ndef game_start():\n    global vy\n    while True:\n        vy = vy - 0.4\n        change_y(vy)\n        if y_position() < -150:\n            set_y(-150)\n            vy = 8',
          newLines: ['        if y_position() < -150:', '            set_y(-150)', '            vy = 8'],
          requires: ['y_position() < -150', 'set_y(-150)', 'vy = 8']
        },
        {
          title: 'Left and right movement',
          text: 'Add horizontal controls. <code>set_rotation_style("left-right")</code> goes before the loop so the sprite only flips — it never tilts:',
          starter: 'vy = 8\n\ndef game_start():\n    global vy\n    while True:\n        vy = vy - 0.4\n        change_y(vy)\n        if y_position() < -150:\n            set_y(-150)\n            vy = 8',
          target: 'vy = 8\n\ndef game_start():\n    global vy\n    set_rotation_style("left-right")\n    while True:\n        vy = vy - 0.4\n        change_y(vy)\n        if y_position() < -150:\n            set_y(-150)\n            vy = 8\n        if key_pressed("right"):\n            change_x(4)\n            point_in_direction(90)\n        if key_pressed("left"):\n            change_x(-4)\n            point_in_direction(-90)',
          newLines: ['    set_rotation_style("left-right")', '        if key_pressed("right"):', '            change_x(4)', '            point_in_direction(90)', '        if key_pressed("left"):', '            change_x(-4)', '            point_in_direction(-90)'],
          requires: ['set_rotation_style("left-right")', 'key_pressed("right")', 'key_pressed("left")', 'change_x(4)', 'change_x(-4)']
        },
        {
          title: 'Wrap around the screen',
          text: 'In Doodle Jump, going off the left edge brings you back on the right and vice versa. Add checks for both horizontal edges:',
          starter: 'vy = 8\n\ndef game_start():\n    global vy\n    set_rotation_style("left-right")\n    while True:\n        vy = vy - 0.4\n        change_y(vy)\n        if y_position() < -150:\n            set_y(-150)\n            vy = 8\n        if key_pressed("right"):\n            change_x(4)\n            point_in_direction(90)\n        if key_pressed("left"):\n            change_x(-4)\n            point_in_direction(-90)',
          target: 'vy = 8\n\ndef game_start():\n    global vy\n    set_rotation_style("left-right")\n    while True:\n        vy = vy - 0.4\n        change_y(vy)\n        if y_position() < -150:\n            set_y(-150)\n            vy = 8\n        if key_pressed("right"):\n            change_x(4)\n            point_in_direction(90)\n        if key_pressed("left"):\n            change_x(-4)\n            point_in_direction(-90)\n        if x_position() > 240:\n            set_x(-240)\n        if x_position() < -240:\n            set_x(240)',
          newLines: ['        if x_position() > 240:', '            set_x(-240)', '        if x_position() < -240:', '            set_x(240)'],
          requires: ['x_position() > 240', 'set_x(-240)', 'x_position() < -240', 'set_x(240)']
        },
        {
          title: 'Add the platform sprite',
          text: 'Platforms are their own game object — they need a <strong>separate sprite</strong> with their own position and code. Click the highlighted button to add a new sprite, give it a <strong>flat wide rectangular costume</strong>, and name it <strong>Platform</strong>.',
          highlight: 'add-sprite-btn',
          highlightLabel: 'Add a sprite here',
          requiresSpriteCount: 2,
          requiresSpriteHint: 'Add a new sprite for the platform',
          starter: null, target: null, newLines: [], requires: []
        },
        {
          title: 'Platform falls down',
          text: 'You\'re now editing the <strong>Platform sprite\'s</strong> code — completely separate from the player. Start it at a random horizontal position and make it fall steadily:',
          starter: '',
          target: 'def game_start():\n    go_to_xy(pick_random(-150, 150), 0)\n    while True:\n        change_y(-2)',
          newLines: ['def game_start():', '    go_to_xy(pick_random(-150, 150), 0)', '    while True:', '        change_y(-2)'],
          requires: ['go_to_xy(pick_random(-150, 150), 0)', 'change_y(-2)']
        },
        {
          title: 'Reset to the top',
          text: 'When the platform falls off the bottom, jump it back to the top at a new random x position — this makes it loop forever:',
          starter: 'def game_start():\n    go_to_xy(pick_random(-150, 150), 0)\n    while True:\n        change_y(-2)',
          target: 'def game_start():\n    go_to_xy(pick_random(-150, 150), 0)\n    while True:\n        change_y(-2)\n        if y_position() < -185:\n            go_to_xy(pick_random(-150, 150), 185)',
          newLines: ['        if y_position() < -185:', '            go_to_xy(pick_random(-150, 150), 185)'],
          requires: ['y_position() < -185', 'go_to_xy(pick_random(-150, 150), 185)']
        },
        {
          title: 'Bounce on the platform',
          text: 'Click your <strong>player sprite</strong> in the sprite panel to switch back to its code. Add a check inside the loop — when the player is falling (<code>vy</code> is negative) and touching the platform, launch back up:',
          starter: null,
          target: '        if touching("Platform") and vy < 0:\n            vy = 8',
          newLines: ['        if touching("Platform") and vy < 0:', '            vy = 8'],
          requires: ['touching("Platform")', 'vy < 0']
        },
        {
          title: 'Add the death barrier',
          text: 'Add one more sprite as the death zone. Click the highlighted button, give it a <strong>wide flat costume</strong> that spans the full width of the stage, and name it <strong>Death</strong>. Position it at the very bottom of the stage.',
          highlight: 'add-sprite-btn',
          highlightLabel: 'Add a sprite here',
          requiresSpriteCount: 3,
          requiresSpriteHint: 'Add a new sprite for the death barrier',
          starter: null, target: null, newLines: [], requires: []
        },
        {
          title: 'Game over',
          text: 'Click your <strong>player sprite</strong> again. Add a game over check inside the loop — if the player touches the Death barrier, show a message and use <code>break</code> to exit the loop and stop the game:',
          starter: null,
          target: '        if touching("Death"):\n            say("Game Over!")\n            break',
          newLines: ['        if touching("Death"):', '            say("Game Over!")', '            break'],
          requires: ['touching("Death")', 'say("Game Over!")', 'break']
        },
        {
          title: '✅ Try it!',
          text: 'Click the <strong>green flag ▶</strong>. Bounce on the platform to stay alive — fall into the death zone and it\'s game over.<br><br><strong>Challenge:</strong> Add 2 or 3 more Platform sprites at different starting heights so there are always several platforms to land on. Try making them fall at different speeds using different values instead of <code>-2</code>.',
          starter: null, target: null, newLines: [], requires: []
        }
      ]
    }
  ];

  // ── Intellisense completions ──────────────────────────────────
  // t: trigger word   ins: text to insert   back: cursor back N chars after insert
  // kind: 'kw'=keyword  'fn'=function  'sn'=snippet
  var PS_COMPLETIONS = [
    // Python keywords
    {t:'def',                   ins:'def ',                                         detail:'Define a function',              kind:'kw'},
    {t:'if',                    ins:'if ',                                           detail:'If statement',                   kind:'kw'},
    {t:'elif',                  ins:'elif ',                                         detail:'Else-if branch',                 kind:'kw'},
    {t:'else',                  ins:'else:',                                         detail:'Else branch',                    kind:'kw'},
    {t:'while',                 ins:'while ',                                        detail:'While loop',                     kind:'kw'},
    {t:'for',                   ins:'for ',                                          detail:'For loop',                       kind:'kw'},
    {t:'return',                ins:'return ',                                       detail:'Return from function',           kind:'kw'},
    {t:'global',                ins:'global ',                                       detail:'Access a global variable',       kind:'kw'},
    {t:'True',                  ins:'True',                                          detail:'Boolean true',                   kind:'kw'},
    {t:'False',                 ins:'False',                                         detail:'Boolean false',                  kind:'kw'},
    {t:'break',                 ins:'break',                                         detail:'Exit the loop',                  kind:'kw'},
    {t:'and',                   ins:'and ',                                          detail:'Logical and',                    kind:'kw'},
    {t:'or',                    ins:'or ',                                           detail:'Logical or',                     kind:'kw'},
    {t:'not',                   ins:'not ',                                          detail:'Logical not',                    kind:'kw'},
    // Python builtins
    {t:'range',                 ins:'range()',                                       detail:'Number range',                   kind:'fn', back:1},
    {t:'str',                   ins:'str()',                                         detail:'Convert to string',              kind:'fn', back:1},
    {t:'int',                   ins:'int()',                                         detail:'Convert to integer',             kind:'fn', back:1},
    {t:'float',                 ins:'float()',                                       detail:'Convert to decimal',             kind:'fn', back:1},
    {t:'len',                   ins:'len()',                                         detail:'Length of a list or string',     kind:'fn', back:1},
    {t:'print',                 ins:'print()',                                       detail:'Print to console',               kind:'fn', back:1},
    // PyScratch snippets
    {t:'game_start',            ins:'def game_start():\n    ',                      detail:'Main game loop',                 kind:'sn'},
    {t:'when_key_pressed',      ins:'def when_key_pressed(key):\n    ',             detail:'Key press event',                kind:'sn'},
    {t:'when_I_start_as_a_clone', ins:'def when_I_start_as_a_clone():\n    ',      detail:'Clone start event',              kind:'sn'},
    // Movement
    {t:'change_x',              ins:'change_x()',                                   detail:'Move sprite left/right',         kind:'fn', back:1},
    {t:'change_y',              ins:'change_y()',                                   detail:'Move sprite up/down',            kind:'fn', back:1},
    {t:'set_x',                 ins:'set_x()',                                      detail:'Set x position',                 kind:'fn', back:1},
    {t:'set_y',                 ins:'set_y()',                                      detail:'Set y position',                 kind:'fn', back:1},
    {t:'x_position',            ins:'x_position()',                                 detail:'Current x position',             kind:'fn'},
    {t:'y_position',            ins:'y_position()',                                 detail:'Current y position',             kind:'fn'},
    {t:'move_steps',            ins:'move_steps()',                                 detail:'Move forward N steps',           kind:'fn', back:1},
    {t:'go_to',                 ins:'go_to("")',                                    detail:'Teleport to target/random',      kind:'fn', back:2},
    {t:'go_to_xy',              ins:'go_to_xy(0, 0)',                               detail:'Teleport to x, y',              kind:'fn', back:4},
    {t:'glide_to_xy',           ins:'glide_to_xy(0, 0, 1)',                         detail:'Glide to x, y over N secs',     kind:'fn', back:6},
    {t:'point_in_direction',    ins:'point_in_direction()',                         detail:'Face a direction (90=right)',     kind:'fn', back:1},
    {t:'point_towards',         ins:'point_towards("")',                            detail:'Face a sprite or mouse',         kind:'fn', back:2},
    {t:'turn_right',            ins:'turn_right()',                                 detail:'Rotate clockwise',               kind:'fn', back:1},
    {t:'turn_left',             ins:'turn_left()',                                  detail:'Rotate anticlockwise',           kind:'fn', back:1},
    {t:'set_rotation_style',    ins:'set_rotation_style("left-right")',             detail:'left-right / all-around / none', kind:'fn'},
    {t:'if_on_edge_bounce',     ins:'if_on_edge_bounce()',                          detail:'Bounce off stage edges',         kind:'fn'},
    // Input
    {t:'key_pressed',           ins:'key_pressed("")',                              detail:'True while key is held',         kind:'fn', back:2},
    {t:'mouse_x',               ins:'mouse_x()',                                    detail:'Mouse x position',               kind:'fn'},
    {t:'mouse_y',               ins:'mouse_y()',                                    detail:'Mouse y position',               kind:'fn'},
    {t:'mouse_down',            ins:'mouse_down()',                                 detail:'True while mouse button held',   kind:'fn'},
    // Looks
    {t:'next_costume',          ins:'next_costume()',                               detail:'Advance to next costume',        kind:'fn'},
    {t:'set_costume',           ins:'set_costume()',                                detail:'Switch to a specific costume',   kind:'fn', back:1},
    {t:'say',                   ins:'say("")',                                      detail:'Show speech bubble',             kind:'fn', back:2},
    {t:'think',                 ins:'think("")',                                    detail:'Show thought bubble',            kind:'fn', back:2},
    {t:'show',                  ins:'show()',                                       detail:'Make sprite visible',            kind:'fn'},
    {t:'hide',                  ins:'hide()',                                       detail:'Hide the sprite',                kind:'fn'},
    {t:'set_size',              ins:'set_size()',                                   detail:'Set sprite size %',              kind:'fn', back:1},
    {t:'change_size',           ins:'change_size()',                                detail:'Change sprite size %',           kind:'fn', back:1},
    // Clones & misc
    {t:'wait',                  ins:'wait()',                                       detail:'Pause this thread N seconds',    kind:'fn', back:1},
    {t:'pick_random',           ins:'pick_random(1, 10)',                           detail:'Random integer in range',        kind:'fn', back:5},
    {t:'create_clone',          ins:'create_clone()',                              detail:'Spawn a copy of this sprite',    kind:'fn'},
    {t:'delete_clone',          ins:'delete_clone()',                              detail:'Remove this clone',              kind:'fn'},
    {t:'touching',              ins:'touching("")',                                 detail:'True when touching target',      kind:'fn', back:2},
    {t:'on_edge',               ins:'on_edge()',                                    detail:'True when touching edge',        kind:'fn'},
    {t:'timer',                 ins:'timer()',                                      detail:'Seconds since last reset',       kind:'fn'},
    {t:'reset_timer',           ins:'reset_timer()',                               detail:'Reset the timer to 0',           kind:'fn'},
  ];

  var _icsActive   = -1;  // currently highlighted row in the intellisense dropdown
  var _tutPollTid  = null; // setInterval id used when a tut step needs sprite-count polling

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
    activeSpriteId:   null, // target.id of the active sprite (stable across renames)
    activeThreadIdx:  0,
    themeSignature:   '',
    activeTut:        null  // { tutIdx, stepIdx } when a tutorial bar is running
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
  // Key by the sprite's stable target UUID so that:
  //   • renames don't break the lookup (t.id stays the same after rename)
  //   • different projects with the same sprite name use different keys
  //     (each new project assigns fresh UUIDs to its targets)
  function storeKey(spriteName) {
    try {
      var t = getTargetByName(spriteName);
      if (t && t.id) return 'pyscratch:' + t.id;
    } catch(e) {}
    // Fallback: name-based key (used before the VM is ready)
    return 'pyscratch:name:' + spriteName;
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

  // ── Project save / load ───────────────────────────────────────
  // Python code is stored as a "pyscratch" array directly on each target in
  // project.json (inside the standard .sb3 ZIP).  vm.toJSON() is patched to
  // inject the data; vm.loadProject() is patched to extract it.  Regular
  // Scratch/TurboWarp ignores unknown target fields, so files remain valid .sb3.
  // Legacy .psb3 files (which used a separate pyscratch.json in the ZIP) are
  // still loaded correctly by extractPyScratchData.

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

  // Extract Python code from a project file, returning { buffer, pyCode }.
  //
  // Supports two formats (in priority order):
  //   1. Legacy .psb3: separate "pyscratch.json" file inside the ZIP.
  //   2. New format:   "pyscratch" field on each target inside project.json.
  //
  // In both cases the field is stripped from the buffer before it is handed to
  // TurboWarp's loader, so scratch-parser never sees unknown fields.
  function extractPyScratchData(input) {
    var isBinary = (input instanceof ArrayBuffer) || (input instanceof Uint8Array) ||
                   (typeof Blob !== 'undefined' && input instanceof Blob);
    if (!isBinary) return Promise.resolve({ buffer: input, pyCode: null });

    return ensureJSZip().then(function (JSZip) {
      return toArrayBuffer(input).then(function (buf) {
        return JSZip.loadAsync(buf.slice(0) /* clone so original is preserved */).then(function (zip) {

          // ── Legacy: separate pyscratch.json ─────────────────────
          var psFile = zip.file('pyscratch.json');
          if (psFile) {
            return psFile.async('string').then(function (raw) {
              var pyCode = null;
              try { var p = JSON.parse(raw); pyCode = p.sprites || p; } catch(e) {}
              zip.remove('pyscratch.json');
              return zip.generateAsync({ type: 'arraybuffer' }).then(function (clean) {
                return { buffer: clean, pyCode: pyCode };
              });
            });
          }

          // ── New: pyscratch fields inline on each target ──────────
          var projFile = zip.file('project.json');
          if (!projFile) return { buffer: buf, pyCode: null };

          return projFile.async('string').then(function (raw) {
            var proj;
            try { proj = JSON.parse(raw); } catch(e) { return { buffer: buf, pyCode: null }; }
            if (!proj || !Array.isArray(proj.targets)) return { buffer: buf, pyCode: null };

            var extracted = {};
            var found = false;
            proj.targets.forEach(function (t) {
              if (t.pyscratch) {
                extracted[t.name] = t.pyscratch;
                delete t.pyscratch;   // strip before TurboWarp's parser sees it
                found = true;
              }
            });

            if (!found) return { buffer: buf, pyCode: null };

            // Re-pack project.json without the pyscratch fields
            zip.file('project.json', JSON.stringify(proj));
            return zip.generateAsync({ type: 'arraybuffer' }).then(function (clean) {
              return { buffer: clean, pyCode: extracted };
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

      '#ps-help-btn,#ps-tut-btn{position:absolute;top:7px;z-index:3;background:var(--ps-panel-3,#252537);border:1px solid var(--ps-border-strong,#45456a);color:var(--ps-text,#cdd6f4);cursor:pointer;padding:4px 8px;border-radius:6px;font-size:12px;font-family:inherit;line-height:1.2;box-shadow:0 2px 8px var(--ps-shadow,rgba(0,0,0,.24))}',
      '#ps-help-btn{right:10px}',
      '#ps-tut-btn{right:62px}',
      '#ps-help-btn:hover,#ps-tut-btn:hover{background:var(--ps-accent-soft,#303052);color:var(--ps-text-strong,#fff);border-color:var(--ps-accent,#6366f1)}',
      '#ps-tut-btn{border-color:var(--ps-tut-border,#3d3555)}',
      '#ps-tut-btn:hover{border-color:var(--ps-tut-accent,#7c5fcf) !important}',
      '#ps-status{position:absolute;top:10px;right:152px;z-index:3;font-size:11px;color:var(--ps-success,#a6e3a1);opacity:.85;pointer-events:none}',

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
      '.ps-hitem p{margin:4px 0 0;font-size:12px;color:var(--ps-muted,#9090b0);line-height:1.4}',

      // Tutorial pick modal
      '#ps-tut{position:fixed;inset:0;background:var(--ps-modal-scrim,rgba(0,0,0,.65));z-index:20000;display:flex;align-items:center;justify-content:center}',
      '#ps-tut.hidden{display:none}',
      '.ps-tbox{background:var(--ps-panel,#1e1e2e);color:var(--ps-text,#cdd6f4);border-radius:10px;width:680px;max-width:96vw;max-height:88vh;display:flex;flex-direction:column;border:1px solid var(--ps-border-strong,#3f3f5a);font-family:"Roboto","Segoe UI",Arial,sans-serif;overflow:hidden}',
      '.ps-thead{padding:12px 16px;border-bottom:1px solid var(--ps-border-strong,#3f3f5a);display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:15px;flex-shrink:0}',
      '.ps-thead button{background:none;border:none;color:var(--ps-muted,#888);font-size:22px;cursor:pointer;line-height:1}',
      '.ps-thead button:hover{color:var(--ps-text-strong,#ccc)}',
      '.ps-tgrid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:16px;overflow-y:auto}',
      '.ps-tcard{background:var(--ps-panel-2,#18182a);border:1px solid var(--ps-border-strong,#3f3f5a);border-radius:8px;padding:14px 16px;cursor:default;transition:border-color .12s}',
      '.ps-tcard:hover{border-color:var(--ps-accent,#7c5fcf)}',
      '.ps-tcard-top{display:flex;align-items:center;gap:10px;margin-bottom:8px}',
      '.ps-tcard-emoji{font-size:22px;line-height:1}',
      '.ps-tcard-title{font-size:13px;font-weight:700;color:var(--ps-text-strong,#fff)}',
      '.ps-tcard-desc{font-size:12px;color:var(--ps-muted,#9090b0);line-height:1.5;margin-bottom:10px}',
      '.ps-tcard-start{display:block;width:100%;background:var(--ps-accent,#7c5fcf);border:none;color:#fff;cursor:pointer;padding:6px 0;border-radius:5px;font-size:12px;font-weight:600;font-family:inherit;transition:opacity .1s}',
      '.ps-tcard-start:hover{opacity:.85}',

      // Tutorial bar (inline, above the editor)
      '#ps-tut-bar{background:var(--ps-panel-2,#18182a);border-bottom:2px solid var(--ps-accent,#7c5fcf);display:flex;flex-direction:column;flex-shrink:0;max-height:26vh;overflow-y:auto}',
      '#ps-tut-bar.ps-tb-hidden{display:none}',
      '.ps-tb-head{display:flex;align-items:center;gap:6px;padding:4px 8px;background:var(--ps-panel,#1e1e2e);border-bottom:1px solid var(--ps-border,#2a2a44);flex-shrink:0}',
      '.ps-tb-tut-name{font-size:10px;font-weight:700;color:var(--ps-accent,#a78bfa);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.ps-tb-stepcount{font-size:10px;color:var(--ps-muted,#6a6a8a);white-space:nowrap;flex-shrink:0}',
      '.ps-tb-exit{background:none;border:1px solid var(--ps-border-strong,#45456a);color:var(--ps-muted,#888);cursor:pointer;padding:1px 6px;border-radius:4px;font-size:10px;font-family:inherit;flex-shrink:0}',
      '.ps-tb-exit:hover{color:var(--ps-text-strong,#fff);border-color:var(--ps-muted,#888)}',
      '.ps-tb-dots{display:flex;gap:4px;padding:3px 8px 0;flex-shrink:0}',
      '.ps-tb-dot{width:6px;height:6px;border-radius:50%;background:var(--ps-border,#2a2a44);transition:background .12s,transform .12s}',
      '.ps-tb-dot.tb-done{background:var(--ps-accent,#7c5fcf)}',
      '.ps-tb-dot.tb-cur{background:var(--ps-accent,#a78bfa);transform:scale(1.4)}',
      '.ps-tb-body{padding:4px 8px 2px;flex-shrink:0}',
      '.ps-tb-title{font-size:11px;font-weight:700;color:var(--ps-text-strong,#fff);margin-bottom:3px}',
      '.ps-tb-text{font-size:11px;color:var(--ps-text,#cdd6f4);line-height:1.45}',
      '.ps-tb-text code{background:var(--ps-code-bg,#312d4b);padding:1px 3px;border-radius:3px;font-family:monospace;font-size:10px;color:#cba6f7}',
      '.ps-tb-text strong{color:var(--ps-text-strong,#fff)}',
      // Code block — split into per-line divs so new vs context can be styled separately
      '.ps-tb-code-wrap{position:relative;margin:3px 8px 0;flex-shrink:0}',
      '.ps-tb-code-wrap.ps-tb-no-target{display:none}',
      '.ps-tb-code-block{background:#0d1117;border:1px solid #30363d;border-radius:4px;padding:5px 8px;overflow-x:auto;font-family:"Roboto Mono","Consolas","Courier New",monospace;font-size:10px;line-height:1.55}',
      '.ps-tb-cl{white-space:pre;display:block}',
      '.ps-tb-cl.old{color:#374151}',
      '.ps-tb-cl.new{color:#fbbf24;font-weight:600}',
      '.ps-tb-cl.new.typed{color:#4ade80}',
      // Prevent selecting or copying the reference code — students must type it themselves
      '.ps-tb-code-block{user-select:none;-webkit-user-select:none;-moz-user-select:none}',
      // Checklist
      '.ps-tb-checks{padding:3px 8px 1px;flex-shrink:0}',
      '.ps-tb-checks.ps-tb-no-checks{display:none}',
      '.ps-tb-ck{display:flex;align-items:center;gap:5px;padding:1px 0;font-size:10px;font-family:"Roboto Mono","Consolas","Courier New",monospace}',
      '.ps-tb-ck-icon{width:12px;text-align:center;font-style:normal;flex-shrink:0}',
      '.ps-tb-ck.ck-wait{color:var(--ps-muted,#4b5563)}',
      '.ps-tb-ck.ck-ok{color:#4ade80}',
      '.ps-tb-foot{display:flex;align-items:center;gap:5px;padding:4px 8px;border-top:1px solid var(--ps-border,#2a2a44);margin-top:2px;flex-shrink:0}',
      '.ps-tb-valid{flex:1;font-size:10px;color:var(--ps-muted,#888)}',
      '.ps-tb-valid.tb-ok{color:#4ade80}',
      '.ps-tb-btn{background:var(--ps-panel-3,#252537);border:1px solid var(--ps-border-strong,#45456a);color:var(--ps-text,#cdd6f4);cursor:pointer;padding:3px 10px;border-radius:4px;font-size:10px;font-family:inherit;flex-shrink:0}',
      '.ps-tb-btn:hover:not(:disabled){background:var(--ps-accent,#7c5fcf);border-color:var(--ps-accent,#7c5fcf);color:#fff}',
      '.ps-tb-btn:disabled{opacity:.3;cursor:not-allowed}',
      '.ps-tb-btn.tb-primary{background:var(--ps-accent,#7c5fcf);border-color:var(--ps-accent,#7c5fcf);color:#fff}',
      '.ps-tb-btn.tb-primary:hover:not(:disabled){opacity:.85}',

      // Indent tip banner (shown when a step requires indented lines)
      '.ps-tb-indent-tip{margin:3px 8px 0;padding:3px 7px;background:var(--ps-panel,#1a1a2e);border:1px solid var(--ps-border,#2d2b55);border-radius:4px;font-size:10px;color:var(--ps-muted,#9ca3af);line-height:1.4;flex-shrink:0}',
      '.ps-tb-indent-tip.ps-tb-tip-hidden{display:none}',
      '.ps-tb-indent-tip strong{color:var(--ps-accent,#c4b5fd)}',
      '.ps-tb-indent-tip code{background:var(--ps-code-bg,#312d4b);padding:1px 3px;border-radius:2px;font-family:monospace;font-size:10px;color:var(--ps-accent,#a78bfa)}',

      // Intellisense dropdown
      '#ps-icsense{position:fixed;background:var(--ps-panel,#1e1e2e);border:1px solid #7c5fcf;border-radius:6px;z-index:30000;min-width:280px;max-width:400px;max-height:210px;overflow-y:auto;box-shadow:0 6px 20px rgba(0,0,0,.6);font-family:"Roboto Mono","Consolas","Courier New",monospace;font-size:12px}',
      '#ps-icsense.ps-ics-hidden{display:none}',
      '.ps-ics-item{padding:5px 10px;cursor:pointer;display:flex;gap:8px;align-items:center;border-bottom:1px solid var(--ps-border,#2a2a44)}',
      '.ps-ics-item:last-child{border-bottom:none}',
      '.ps-ics-item:hover,.ps-ics-item.ps-ics-sel{background:#2d2b55}',
      '.ps-ics-kind{width:18px;height:18px;border-radius:3px;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-family:"Segoe UI",sans-serif}',
      '.ps-ics-kind.kw{background:#1d3a5f;color:#60a5fa}',
      '.ps-ics-kind.fn{background:#1a3a2a;color:#4ade80}',
      '.ps-ics-kind.sn{background:#3a1a3a;color:#c084fc}',
      '.ps-ics-label{color:#e2e8f0;flex:1;white-space:nowrap}',
      '.ps-ics-detail{color:#4b5563;font-size:10px;font-family:"Segoe UI",sans-serif;white-space:nowrap;overflow:hidden;max-width:140px;text-overflow:ellipsis}'
    ].join('\n');
    document.head.appendChild(style);

    // Build overlay HTML
    var o = document.createElement('div');
    o.id = 'ps-overlay';
    o.innerHTML = [
      '<div id="ps-body">',
        '<div id="ps-left">',
          '<button id="ps-help-btn" title="PyScratch reference">Help</button>',
          '<button id="ps-tut-btn" title="Step-by-step tutorials">Tutorials</button>',
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
              '<div id="ps-tut-bar" class="ps-tb-hidden">',
                '<div class="ps-tb-head">',
                  '<span class="ps-tb-tut-name"></span>',
                  '<span class="ps-tb-stepcount"></span>',
                  '<button class="ps-tb-exit">✕ Exit tutorial</button>',
                '</div>',
                '<div class="ps-tb-dots"></div>',
                '<div class="ps-tb-body">',
                  '<div class="ps-tb-title"></div>',
                  '<div class="ps-tb-text"></div>',
                '</div>',
                '<div class="ps-tb-code-wrap ps-tb-no-target">',
                  '<div class="ps-tb-code-block"></div>',
                '</div>',
                '<div class="ps-tb-indent-tip ps-tb-tip-hidden">',
                  '↹ Press <strong>Tab</strong> to indent (on some keyboards the key shows two arrows ↹ instead of "Tab") · 4 spaces per indent level',
                '</div>',
                '<div class="ps-tb-checks ps-tb-no-checks"></div>',
                '<div class="ps-tb-foot">',
                  '<span class="ps-tb-valid"></span>',
                  '<button class="ps-tb-btn" data-tb="prev">← Back</button>',
                  '<button class="ps-tb-btn tb-primary" data-tb="next">Next →</button>',
                '</div>',
              '</div>',
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

    // Tutorial modal
    var tm = document.createElement('div');
    tm.id = 'ps-tut';
    tm.className = 'hidden';
    tm.innerHTML = buildTutorialHTML();
    document.body.appendChild(tm);
    initTutorialModal(tm);
    initTutorialBar();

    // Intellisense dropdown (shared singleton)
    var icsEl = document.createElement('div');
    icsEl.id = 'ps-icsense';
    icsEl.className = 'ps-ics-hidden';
    document.body.appendChild(icsEl);

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
    document.getElementById('ps-tut-btn').onclick = function () { tm.classList.remove('hidden'); };
    tm.onclick = function (e) { if (e.target === tm) tm.classList.add('hidden'); };

    // Editor behaviour
    ui.editor.addEventListener('keydown', function (e) {
      var dd         = _icsEl();
      var icsVisible = dd && !dd.classList.contains('ps-ics-hidden');

      // ── Escape: dismiss intellisense ──
      if (e.key === 'Escape') { hideICSense(); return; }

      // ── Intellisense navigation (takes priority over Tab / Enter) ──
      if (icsVisible) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          _icsActive = Math.min(_icsActive + 1, (dd._hits || []).length - 1);
          dd.querySelectorAll('.ps-ics-item').forEach(function (el, i) {
            el.classList.toggle('ps-ics-sel', i === _icsActive);
          });
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          _icsActive = Math.max(_icsActive - 1, 0);
          dd.querySelectorAll('.ps-ics-item').forEach(function (el, i) {
            el.classList.toggle('ps-ics-sel', i === _icsActive);
          });
          return;
        }
        if (e.key === 'Tab' || e.key === 'Enter') {
          e.preventDefault();
          if (_icsActive >= 0 && dd._hits && dd._hits[_icsActive]) {
            applyCompletion(dd._hits[_icsActive]);
          }
          return;
        }
      }

      // ── Smart backspace: delete a whole indent block (4 spaces) ──
      // Only fires when the cursor is at an indent boundary (nothing but spaces
      // between the start of the line and the cursor).
      if (e.key === 'Backspace' && !e.ctrlKey && !e.metaKey &&
          ui.editor.selectionStart === ui.editor.selectionEnd) {
        var bs  = ui.editor.selectionStart;
        var bv  = ui.editor.value;
        var bls = bv.lastIndexOf('\n', bs - 1) + 1;
        var bpx = bv.substring(bls, bs); // text on this line before cursor
        if (/^ +$/.test(bpx)) {
          e.preventDefault();
          // Snap to previous 4-space boundary (delete the 'overhang')
          var del = bpx.length % 4 === 0 ? 4 : bpx.length % 4;
          del = Math.min(del, bpx.length);
          ui.editor.setSelectionRange(bs - del, bs);
          document.execCommand('insertText', false, '');
          saveCurrentCode();
          return;
        }
      }

      // ── Tab: insert 4-space indent ──
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        document.execCommand('insertText', false, '    ');
        saveCurrentCode();
        return;
      }

      // ── Shift+Tab: remove one indent level from the current line ──
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        var ts  = ui.editor.selectionStart;
        var tv  = ui.editor.value;
        var tls = tv.lastIndexOf('\n', ts - 1) + 1;
        var m   = tv.substring(tls).match(/^( {1,4})/);
        if (m) {
          var sp = m[1].length;
          ui.editor.setSelectionRange(tls, tls + sp);
          document.execCommand('insertText', false, '');
          // Keep cursor at sensible position (clamp to line start if needed)
          var newPos = Math.max(tls, ts - sp);
          ui.editor.setSelectionRange(newPos, newPos);
          saveCurrentCode();
        }
        return;
      }

      // ── Enter: auto-indent, matching current line + extra level after colon ──
      if (e.key === 'Enter') {
        e.preventDefault();
        var es  = ui.editor.selectionStart;
        var ev  = ui.editor.value;
        var els = ev.lastIndexOf('\n', es - 1) + 1;
        var el  = ev.substring(els, es);
        var ind = (el.match(/^(\s*)/) || ['', ''])[1];
        if (el.trimEnd().endsWith(':')) ind += '    ';
        document.execCommand('insertText', false, '\n' + ind);
      }
    });
    ui.editor.addEventListener('input', function () {
      saveCurrentCode();
      if (S.activeTut) checkTutBar();
      updateCompletions();
    });
    ui.editor.addEventListener('blur', function () {
      // Small delay so mousedown on a dropdown item fires first
      setTimeout(hideICSense, 150);
    });

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

  // ── Tutorial pick modal ───────────────────────────────────────
  function buildTutorialHTML() {
    var cards = TUTORIALS.map(function (t, i) {
      return '<div class="ps-tcard" data-idx="' + i + '">' +
        '<div class="ps-tcard-top">' +
          '<span class="ps-tcard-emoji">' + t.emoji + '</span>' +
          '<span class="ps-tcard-title">' + t.title + '</span>' +
        '</div>' +
        '<div class="ps-tcard-desc">' + t.desc + '</div>' +
        '<button class="ps-tcard-start" data-idx="' + i + '">▶ Start (' + t.steps.length + ' steps)</button>' +
      '</div>';
    }).join('');
    return '<div class="ps-tbox">' +
      '<div class="ps-thead"><span>📚 Tutorials</span><button title="Close">&times;</button></div>' +
      '<div class="ps-tgrid">' + cards + '</div>' +
    '</div>';
  }

  function initTutorialModal(tm) {
    var closeBtn = tm.querySelector('.ps-thead button');
    closeBtn.addEventListener('click', function () { tm.classList.add('hidden'); });

    document.addEventListener('keydown', function (e) {
      if (!tm.classList.contains('hidden') && e.key === 'Escape') tm.classList.add('hidden');
    });

    tm.querySelectorAll('.ps-tcard-start').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.dataset.idx, 10);
        tm.classList.add('hidden');
        startTutorial(idx);
      });
    });
  }

  // ── Tutorial bar (interactive in-editor walkthrough) ──────────
  function startTutorial(tutIdx) {
    S.activeTut = { tutIdx: tutIdx, stepIdx: 0 };
    // Hide the Help/Tutorials buttons — they sit at the same y as the tutorial bar
    // header and would overlap it. Restored when the tutorial exits.
    var hb = document.getElementById('ps-help-btn');
    var tb = document.getElementById('ps-tut-btn');
    if (hb) hb.style.display = 'none';
    if (tb) tb.style.display = 'none';
    applyTutBar(true);
  }

  function applyTutBar(isNewStep) {
    var at   = S.activeTut;
    if (!at) return;
    var tut  = TUTORIALS[at.tutIdx];
    var step = tut.steps[at.stepIdx];
    var bar  = document.getElementById('ps-tut-bar');
    if (!bar) return;

    bar.classList.remove('ps-tb-hidden');

    // Header
    bar.querySelector('.ps-tb-tut-name').textContent = tut.emoji + '  ' + tut.title;
    bar.querySelector('.ps-tb-stepcount').textContent = 'Step ' + (at.stepIdx + 1) + ' of ' + tut.steps.length;

    // Progress dots
    var dotsEl = bar.querySelector('.ps-tb-dots');
    dotsEl.innerHTML = tut.steps.map(function (_, i) {
      var cls = i < at.stepIdx ? 'tb-done' : (i === at.stepIdx ? 'tb-cur' : '');
      return '<div class="ps-tb-dot ' + cls + '" title="Step ' + (i + 1) + '"></div>';
    }).join('');

    // Body
    bar.querySelector('.ps-tb-title').textContent = step.title;
    bar.querySelector('.ps-tb-text').innerHTML    = step.text;

    // Code block — highlight new lines in amber, dim context lines
    var codeWrap  = bar.querySelector('.ps-tb-code-wrap');
    var codeBlock = bar.querySelector('.ps-tb-code-block');
    if (step.target) {
      codeWrap.classList.remove('ps-tb-no-target');
      var newSet  = {};
      (step.newLines || []).forEach(function (l) { newSet[l] = true; });
      codeBlock.innerHTML = step.target.split('\n').map(function (line) {
        var cls = newSet[line] ? 'new' : 'old';
        return '<span class="ps-tb-cl ' + cls + '">' +
               line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') +
               '</span>';
      }).join('');
    } else {
      codeWrap.classList.add('ps-tb-no-target');
      codeBlock.innerHTML = '';
    }

    // Indent tip — show whenever any new line has leading spaces
    var indentTip = bar.querySelector('.ps-tb-indent-tip');
    var needsIndent = (step.newLines || []).some(function (l) { return /^ /.test(l); });
    indentTip.classList.toggle('ps-tb-tip-hidden', !needsIndent);

    // Checklist — one row per requires item
    var checksEl = bar.querySelector('.ps-tb-checks');
    var reqs     = step.requires || [];
    if (reqs.length > 0) {
      checksEl.classList.remove('ps-tb-no-checks');
      checksEl.innerHTML = reqs.map(function (r) {
        return '<div class="ps-tb-ck ck-wait" data-req="' + r.replace(/"/g, '&quot;') + '">' +
               '<i class="ps-tb-ck-icon">⏳</i>' +
               '<span>' + r.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</span>' +
               '</div>';
      }).join('');
    } else {
      checksEl.classList.add('ps-tb-no-checks');
      checksEl.innerHTML = '';
    }

    // Buttons
    var prevBtn = bar.querySelector('[data-tb="prev"]');
    var nextBtn = bar.querySelector('[data-tb="next"]');
    prevBtn.disabled    = (at.stepIdx === 0);
    nextBtn.textContent = (at.stepIdx === tut.steps.length - 1) ? 'Finish ✓' : 'Next →';

    // Pre-fill editor if this step has a starter
    if (isNewStep && step.starter !== null && step.starter !== undefined) {
      if (ui.editor) {
        var threads = loadThreads(S.activeSprite);
        if (!S.activeThreadIdx) S.activeThreadIdx = 0;
        if (threads[S.activeThreadIdx]) {
          threads[S.activeThreadIdx].code = step.starter;
          saveThreads(S.activeSprite);
          loadCodeToEditor();
        }
      }
    }

    // Highlight a TurboWarp / PyScratch UI element if the step asks for it
    if (_tutPollTid) { clearInterval(_tutPollTid); _tutPollTid = null; }
    if (step.highlight) {
      showHighlight(step.highlight, step.highlightLabel || '');
    } else {
      clearHighlight();
    }

    // Poll sprite count for steps that wait for the student to add a sprite
    if (step.requiresSpriteCount !== undefined) {
      _tutPollTid = setInterval(checkTutBar, 600);
    }

    // Scroll bar to top
    bar.scrollTop = 0;

    checkTutBar();
  }

  function checkTutBar() {
    var at = S.activeTut;
    if (!at) return;
    var step    = TUTORIALS[at.tutIdx].steps[at.stepIdx];
    var code    = ui.editor ? ui.editor.value : '';
    var reqs    = step.requires || [];
    var bar     = document.getElementById('ps-tut-bar');
    if (!bar) return;

    var allOk = true;

    // ── Code string checks ────────────────────────────────────────
    reqs.forEach(function (r) {
      var found = code.indexOf(r) !== -1;
      if (!found) allOk = false;
      var ckEl = bar.querySelector('.ps-tb-ck[data-req="' + r.replace(/"/g, '&quot;') + '"]');
      if (ckEl) {
        ckEl.className = 'ps-tb-ck ' + (found ? 'ck-ok' : 'ck-wait');
        ckEl.querySelector('.ps-tb-ck-icon').textContent = found ? '✓' : '⏳';
      }
      // Turn matching new-line spans green when found
      bar.querySelectorAll('.ps-tb-cl.new').forEach(function (sp) {
        if (sp.textContent.indexOf(r) !== -1) {
          sp.classList.toggle('typed', found);
        }
      });
    });

    // ── Sprite count check ────────────────────────────────────────
    if (step.requiresSpriteCount !== undefined) {
      var spriteCount = 0;
      try { spriteCount = vm.runtime.targets.filter(function (t) { return !t.isStage; }).length; } catch(e) {}
      var spriteOk = spriteCount >= step.requiresSpriteCount;
      if (!spriteOk) allOk = false;

      // Update the sprite-count checklist row (keyed by data-req="__sprite__")
      var scEl = bar.querySelector('.ps-tb-ck[data-req="__sprite__"]');
      if (!scEl) {
        // First time: inject the row into the checks container
        var checksEl = bar.querySelector('.ps-tb-checks');
        checksEl.classList.remove('ps-tb-no-checks');
        scEl = document.createElement('div');
        scEl.className = 'ps-tb-ck ck-wait';
        scEl.dataset.req = '__sprite__';
        scEl.innerHTML = '<i class="ps-tb-ck-icon">⏳</i><span>' +
          (step.requiresSpriteHint || 'Add a new sprite in the sprite panel') + '</span>';
        checksEl.insertBefore(scEl, checksEl.firstChild);
      }
      scEl.className = 'ps-tb-ck ' + (spriteOk ? 'ck-ok' : 'ck-wait');
      scEl.querySelector('.ps-tb-ck-icon').textContent = spriteOk ? '✓' : '⏳';

      // Clear the highlight once the sprite is added
      if (spriteOk && step.highlight) clearHighlight();
    }

    // ── Footer status ─────────────────────────────────────────────
    var nextBtn = bar.querySelector('[data-tb="next"]');
    var validEl = bar.querySelector('.ps-tb-valid');
    var hasAnyReq = reqs.length > 0 || step.requiresSpriteCount !== undefined;
    nextBtn.disabled = hasAnyReq && !allOk;
    if (!hasAnyReq) {
      validEl.textContent = '';
      validEl.className   = 'ps-tb-valid';
    } else if (allOk) {
      validEl.textContent = '✓ All done — click Next';
      validEl.className   = 'ps-tb-valid tb-ok';
    } else {
      var codeReqsDone = reqs.filter(function (r) { return code.indexOf(r) !== -1; }).length;
      var total = reqs.length + (step.requiresSpriteCount !== undefined ? 1 : 0);
      var spriteDone = 0;
      if (step.requiresSpriteCount !== undefined) {
        try { spriteDone = vm.runtime.targets.filter(function(t){return !t.isStage;}).length >= step.requiresSpriteCount ? 1 : 0; } catch(e){}
      }
      var done  = codeReqsDone + spriteDone;
      validEl.textContent = done + ' / ' + total + ' tasks complete';
      validEl.className   = 'ps-tb-valid';
    }
  }

  function exitTutorial() {
    S.activeTut = null;
    if (_tutPollTid) { clearInterval(_tutPollTid); _tutPollTid = null; }
    clearHighlight();
    var bar = document.getElementById('ps-tut-bar');
    if (bar) bar.classList.add('ps-tb-hidden');
    // Restore the Help/Tutorials buttons that were hidden when the tutorial started
    var hb = document.getElementById('ps-help-btn');
    var tb = document.getElementById('ps-tut-btn');
    if (hb) hb.style.display = '';
    if (tb) tb.style.display = '';
  }

  // ── Intellisense ──────────────────────────────────────────────
  function _icsEl() { return document.getElementById('ps-icsense'); }

  function _getCaretPos(editor) {
    // Approximate pixel position of the cursor inside the textarea
    var text  = editor.value.substring(0, editor.selectionStart);
    var lines = text.split('\n');
    var lineN = lines.length - 1;
    var cs    = getComputedStyle(editor);
    var lh    = parseFloat(cs.lineHeight)  || 21;
    var pt    = parseFloat(cs.paddingTop)  || 12;
    var pl    = parseFloat(cs.paddingLeft) || 12;
    if (!editor._icsCharW) {
      try {
        var cvs = document.createElement('canvas');
        var ctx = cvs.getContext('2d');
        ctx.font = cs.fontSize + ' ' + cs.fontFamily;
        editor._icsCharW = ctx.measureText('m').width || 7.8;
      } catch(e) { editor._icsCharW = 7.8; }
    }
    var colN  = lines[lineN].length;
    var rect  = editor.getBoundingClientRect();
    return {
      top:  rect.top  + pt + (lineN + 1) * lh - editor.scrollTop + 2,
      left: rect.left + pl + colN * editor._icsCharW
    };
  }

  function _getCurrentWord(editor) {
    var pos = editor.selectionStart;
    var txt = editor.value;
    var wordStart = pos;
    while (wordStart > 0 && /\w/.test(txt[wordStart - 1])) wordStart--;
    return { word: txt.substring(wordStart, pos), wordStart: wordStart, end: pos };
  }

  function hideICSense() {
    var dd = _icsEl();
    if (dd) dd.classList.add('ps-ics-hidden');
    _icsActive = -1;
  }

  function applyCompletion(comp) {
    if (!ui.editor || !comp) return;
    var w   = _getCurrentWord(ui.editor);
    var ins = comp.ins;

    // Look at the text on this line BEFORE the current word (e.g. "def " or "    def ").
    // Strip any leading indent to get the non-indent prefix (e.g. "def ").
    // If ins starts with that prefix, extend the replacement range leftward to consume
    // the existing prefix and avoid duplication ("def def game_start" bug).
    var rawBefore  = ui.editor.value.substring(0, w.wordStart);
    var lineStart  = rawBefore.lastIndexOf('\n') + 1;
    var linePre    = rawBefore.substring(lineStart);     // e.g. "def " or "    def "
    var trimmed    = linePre.trimStart();                // e.g. "def "
    var indentLen  = linePre.length - trimmed.length;   // leading spaces count

    var replStart;
    if (trimmed.length > 0 && ins.toLowerCase().startsWith(trimmed.toLowerCase())) {
      // Replace from just after the indent, consuming the existing prefix
      replStart = lineStart + indentLen;
    } else {
      // Normal case: just replace the current identifier
      replStart = w.wordStart;
    }

    var before = ui.editor.value.substring(0, replStart);
    var after  = ui.editor.value.substring(w.end);
    ui.editor.value = before + ins + after;
    var cur = before.length + ins.length - (comp.back || 0);
    ui.editor.selectionStart = ui.editor.selectionEnd = cur;
    hideICSense();
    saveCurrentCode();
    if (S.activeTut) checkTutBar();
  }

  function updateCompletions() {
    if (!ui.editor) return;
    var dd   = _icsEl();
    if (!dd) return;
    var w    = _getCurrentWord(ui.editor);
    var lLow = w.word.toLowerCase();
    if (lLow.length < 2) { hideICSense(); return; }
    var hits = PS_COMPLETIONS.filter(function (c) {
      var cL = c.t.toLowerCase();
      return cL.startsWith(lLow) && cL !== lLow;
    }).slice(0, 8);
    if (!hits.length) { hideICSense(); return; }

    _icsActive = 0;
    dd._hits   = hits;
    dd.innerHTML = hits.map(function (c, i) {
      var kindLabel = c.kind === 'kw' ? 'KW' : c.kind === 'sn' ? 'SN' : 'fn';
      return '<div class="ps-ics-item' + (i === 0 ? ' ps-ics-sel' : '') + '" data-i="' + i + '">' +
             '<span class="ps-ics-kind ' + c.kind + '">' + kindLabel + '</span>' +
             '<span class="ps-ics-label">' + c.t + '</span>' +
             '<span class="ps-ics-detail">' + c.detail + '</span>' +
             '</div>';
    }).join('');

    var pos = _getCaretPos(ui.editor);
    // Keep dropdown on screen
    var ddH = Math.min(hits.length * 29, 210);
    var top = (pos.top + ddH > window.innerHeight - 10) ? pos.top - ddH - 4 : pos.top;
    dd.style.top  = Math.max(4, top) + 'px';
    dd.style.left = Math.min(pos.left, window.innerWidth - 410) + 'px';
    dd.classList.remove('ps-ics-hidden');

    dd.querySelectorAll('.ps-ics-item').forEach(function (item) {
      item.addEventListener('mousedown', function (e) {
        e.preventDefault();
        applyCompletion(hits[parseInt(item.dataset.i, 10)]);
      });
    });
  }

  function initTutorialBar() {
    var bar = document.getElementById('ps-tut-bar');
    if (!bar) return;

    // Exit button
    bar.querySelector('.ps-tb-exit').addEventListener('click', exitTutorial);

    // Prev / Next buttons
    bar.querySelector('[data-tb="prev"]').addEventListener('click', function () {
      if (!S.activeTut || S.activeTut.stepIdx === 0) return;
      S.activeTut.stepIdx--;
      applyTutBar(true);
    });
    bar.querySelector('[data-tb="next"]').addEventListener('click', function () {
      if (!S.activeTut) return;
      var tut = TUTORIALS[S.activeTut.tutIdx];
      if (S.activeTut.stepIdx >= tut.steps.length - 1) {
        exitTutorial();
      } else {
        S.activeTut.stepIdx++;
        applyTutBar(true);
      }
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
      // Save editor content into S.spriteCode before we switch
      saveCurrentCode();

      // ── Rename detection ──────────────────────────────────────────
      // If the old sprite name has vanished from the VM but the editing
      // target has the same ID as before, the sprite was renamed (not
      // replaced).  Migrate the in-memory code to the new name so work
      // isn't lost, and tidy up any stale fallback localStorage entry.
      if (S.activeSprite && selectedName !== S.activeSprite &&
          !getTargetByName(S.activeSprite)) {
        var selTarget = null;
        try { selTarget = S.vm && S.vm.editingTarget; } catch(e) {}
        if (selTarget && S.activeSpriteId && selTarget.id === S.activeSpriteId) {
          if (S.spriteCode[S.activeSprite]) {
            S.spriteCode[selectedName] = S.spriteCode[S.activeSprite];
            delete S.spriteCode[S.activeSprite];
            // storeKey now resolves correctly via the target ID, so just
            // re-save under the new name and remove the stale fallback entry.
            saveThreads(selectedName);
            try { localStorage.removeItem('pyscratch:name:' + S.activeSprite); } catch(e) {}
          }
        }
      }
      // ── End rename detection ──────────────────────────────────────

      S.activeSprite    = selectedName;
      S.activeThreadIdx = 0;

      // Track the target's stable UUID so future rename detection works
      try {
        var activeTarget = getTargetByName(selectedName);
        S.activeSpriteId = activeTarget ? activeTarget.id : null;
      } catch(e) { S.activeSpriteId = null; }

      renderThreadList();
      loadCodeToEditor();
    }
  }

  function renderThreadList() {
    if (!ui.threadList || !S.activeSprite) { emitState(); return; }
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
    emitState(); // notify parent lesson page of current thread names / code
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
    if (!el || el.id === 'ps-overlay' || el.closest('#ps-overlay') || el.closest('#ps-help') || el.closest('#ps-tut')) return false;
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

  // ── Demo mode ─────────────────────────────────────────────────

  // Very lightweight Python syntax highlighter.
  // Processes line-by-line so comments can't span into adjacent tokens.
  function highlightPython(code) {
    var KW = ['def','return','if','elif','else','while','for','in','and','or','not',
              'True','False','None','global','import','from','class','lambda','pass',
              'break','continue','is','with','as','try','except','finally','raise'];
    var kwRe = new RegExp('\\b(' + KW.join('|') + ')\\b', 'g');

    function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    // Split a code segment (no comment) on string literals (capturing group → alternating pieces)
    var strRe = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/;

    function processCodeSegment(seg) {
      var pieces = seg.split(strRe); // [non-str, str, non-str, str, ...]
      return pieces.map(function(p, i) {
        if (i % 2 === 1) return '<span class="py-s">' + esc(p) + '</span>';
        return esc(p)
          .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="py-n">$1</span>')
          .replace(/\b([A-Za-z_]\w*)\s*(?=\()/g, '<span class="py-f">$1</span>')
          .replace(kwRe, '<span class="py-k">$1</span>');
      }).join('');
    }

    return code.split('\n').map(function(line) {
      // Locate first un-quoted '#'
      var inStr = false, sc = null, ci = -1;
      for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (inStr) { if (ch === sc && line[i-1] !== '\\') inStr = false; }
        else if (ch === '"' || ch === "'") { inStr = true; sc = ch; }
        else if (ch === '#') { ci = i; break; }
      }
      var codePart    = ci >= 0 ? line.slice(0, ci) : line;
      var commentPart = ci >= 0 ? line.slice(ci)    : '';
      return processCodeSegment(codePart) +
        (commentPart ? '<span class="py-c">' + esc(commentPart) + '</span>' : '');
    }).join('\n');
  }

  // Snapshot every non-stage target's visual state so we can restore it on loop reset.
  function captureSpritesState() {
    var snap = {};
    var targets = (S.vm && S.vm.runtime && S.vm.runtime.targets) || [];
    targets.forEach(function(t) {
      if (t.isStage || t.isClone) return;
      snap[t.id] = {
        x: t.x, y: t.y,
        direction: t.direction,
        currentCostume: t.currentCostume,
        size: t.size,
        visible: t.visible
      };
    });
    return snap;
  }

  function restoreSpritesState(snap) {
    if (!S.vm || !S.vm.runtime) return;
    // Dispose any clones spawned during the run
    S.vm.runtime.targets.filter(function(t) { return t.isClone; }).forEach(function(t) {
      try { S.vm.runtime.disposeTarget(t); } catch(e) {}
    });
    // Restore original sprite states
    S.vm.runtime.targets.forEach(function(t) {
      if (t.isStage || !snap[t.id]) return;
      var s = snap[t.id];
      try { t.setXY(s.x, s.y); }          catch(e) { t.x = s.x; t.y = s.y; }
      try { t.setDirection(s.direction); }  catch(e) { t.direction = s.direction; }
      try { t.setCostume(s.currentCostume); } catch(e) {}
      try { t.setSize(s.size); }            catch(e) { t.size = s.size; }
      try { t.setVisible(s.visible); }      catch(e) { t.visible = s.visible; }
      // Clear any say/think speech bubble
      try { S.vm.runtime.emit('SAY', t, 'say', ''); }   catch(e) {}
      try { S.vm.runtime.emit('SAY', t, 'think', ''); } catch(e) {}
    });
  }

  function adjustDemoOverlay() {
    var canvas  = document.querySelector('canvas');
    var overlay = document.getElementById('ps-demo');
    var leftEl  = document.getElementById('ps-demo-left');
    if (!canvas || !overlay || !leftEl) return;
    var rect = canvas.getBoundingClientRect();
    if (rect.top > 40 && rect.top < window.innerHeight - 80) {
      overlay.style.top    = Math.round(rect.top) + 'px';
      overlay.style.bottom = '0px';
    }
    if (rect.left > 60 && rect.left < window.innerWidth - 60) {
      leftEl.style.width = rect.left + 'px';
    }
  }

  function buildDemoUI() {
    var style = document.createElement('style');
    style.textContent = [
      // Hide TurboWarp editing chrome; keep stage visible
      '.ps-demo-active .blocklyDiv,.ps-demo-active .blocklyToolboxDiv,.ps-demo-active .blocklyFlyout{display:none!important}',
      // Demo overlay — mirrors #ps-overlay geometry but is built differently
      '#ps-demo{position:fixed;left:0;right:0;top:92px;bottom:0;z-index:45;display:flex;pointer-events:none}',
      // Left code panel
      '#ps-demo-left{display:flex;flex-direction:column;background:#0d1117;pointer-events:auto;border-right:2px solid #21262d;box-shadow:4px 0 24px rgba(0,0,0,.5);flex-shrink:0;width:50%;overflow:hidden}',
      '#ps-demo-header{padding:7px 14px;background:#161b22;border-bottom:1px solid #21262d;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;gap:8px}',
      '#ps-demo-sprite{font-size:12px;font-weight:700;color:#c9d1d9;font-family:"Roboto","Segoe UI",sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.ps-demo-badge{font-size:10px;background:#1f6feb;color:#fff;padding:2px 8px;border-radius:99px;font-family:"Roboto","Segoe UI",sans-serif;flex-shrink:0;letter-spacing:.04em}',
      '#ps-demo-code{flex:1;overflow:auto;padding:14px 16px;min-height:0}',
      '#ps-demo-pre{margin:0;font-family:"Roboto Mono","Consolas","Courier New",monospace;font-size:13px;line-height:1.75;color:#e6edf3;white-space:pre;tab-size:4}',
      // Syntax highlight colours (GitHub dark palette)
      '.py-k{color:#ff7b72}',     // keywords
      '.py-s{color:#a5d6ff}',     // strings
      '.py-n{color:#79c0ff}',     // numbers
      '.py-f{color:#d2a8ff}',     // function calls
      '.py-c{color:#8b949e}',     // comments
      // Footer: looping progress bar
      '#ps-demo-footer{padding:7px 14px 8px;background:#161b22;border-top:1px solid #21262d;flex-shrink:0}',
      '#ps-demo-bar-wrap{height:3px;background:#21262d;border-radius:2px;overflow:hidden}',
      '#ps-demo-bar{height:100%;width:0%;background:#238636;border-radius:2px}',
      '#ps-demo-footer-label{font-size:10px;color:#8b949e;font-family:"Roboto","Segoe UI",sans-serif;margin-bottom:4px;letter-spacing:.03em}',
      // Transparent blocker over the stage — prevents mouse interaction
      '#ps-demo-blocker{flex:1;pointer-events:auto;cursor:default;background:transparent;user-select:none}'
    ].join('\n');
    document.head.appendChild(style);

    var overlay = document.createElement('div');
    overlay.id = 'ps-demo';
    overlay.innerHTML =
      '<div id="ps-demo-left">' +
        '<div id="ps-demo-header">' +
          '<span id="ps-demo-sprite">Loading…</span>' +
          '<span class="ps-demo-badge">▶ Demo</span>' +
        '</div>' +
        '<div id="ps-demo-code"><pre id="ps-demo-pre"></pre></div>' +
        '<div id="ps-demo-footer">' +
          '<div id="ps-demo-footer-label">Loops every ' + DEMO_LOOP_SECS + 's</div>' +
          '<div id="ps-demo-bar-wrap"><div id="ps-demo-bar"></div></div>' +
        '</div>' +
      '</div>' +
      '<div id="ps-demo-blocker"></div>';
    document.body.appendChild(overlay);
  }

  function startDemoLoop() {
    var sprites = getSprites();
    if (!sprites.length) {
      // Retry shortly if sprites haven't loaded yet
      setTimeout(startDemoLoop, 400);
      return;
    }

    // Determine which sprite to display
    var spriteName = DEMO_SPRITE ||
      (sprites[0].sprite && sprites[0].sprite.name) || '';
    if (!spriteName) { setTimeout(startDemoLoop, 400); return; }

    // Update header
    var headerEl = document.getElementById('ps-demo-sprite');
    if (headerEl) headerEl.textContent = spriteName;

    // Render highlighted code
    var threads = loadThreads(spriteName);
    var fullCode = threads.map(function(t) { return t.code; }).join('\n\n');
    var preEl = document.getElementById('ps-demo-pre');
    if (preEl) preEl.innerHTML = highlightPython(fullCode);

    // Fit left panel to stage edge
    adjustDemoOverlay();
    window.addEventListener('resize', adjustDemoOverlay);

    // Snapshot initial sprite state for reset
    var snap = captureSpritesState();

    var barEl    = document.getElementById('ps-demo-bar');
    var loopMs   = DEMO_LOOP_SECS * 1000;
    var rafId    = null;
    var loopTid  = null;

    function animate(startTime) {
      function tick() {
        var pct = Math.min(100, ((Date.now() - startTime) / loopMs) * 100);
        if (barEl) barEl.style.width = pct + '%';
        if (pct < 100) rafId = requestAnimationFrame(tick);
      }
      if (barEl) barEl.style.width = '0%';
      rafId = requestAnimationFrame(tick);
    }

    function runCycle() {
      // Cancel any in-flight animation/timeout from previous cycle
      if (rafId)   { cancelAnimationFrame(rafId);  rafId   = null; }
      if (loopTid) { clearTimeout(loopTid);         loopTid = null; }

      // Restore scene, then run
      restoreSpritesState(snap);
      startAll();
      animate(Date.now());

      loopTid = setTimeout(function() {
        stopAll();
        // Brief pause so students can see the end state before reset
        setTimeout(runCycle, 600);
      }, loopMs);
    }

    runCycle();
  }

  // ── Highlight overlay ─────────────────────────────────────────
  // Draws a pulsing amber box around a named or CSS-selected element.
  //
  // postMessage API (sent from the parent lesson page):
  //   { type: 'PS_HIGHLIGHT', target: 'green-flag', label: 'Click here!' }
  //   { type: 'PS_HIGHLIGHT', selector: '#my-element' }   // raw CSS selector
  //   { type: 'PS_HIGHLIGHT_CLEAR' }                       // remove highlight
  //
  // URL param (persistent on page load):
  //   ?ps_highlight=green-flag&ps_highlight_label=Click+here%21
  //
  // Named presets resolve to robust multi-selector strings that survive
  // TurboWarp's hashed class names:
  var HIGHLIGHT_PRESETS = {
    'green-flag':   '[class*="green-flag_"],[class*="greenFlag"],[aria-label*="Green Flag"],[title*="Green Flag"]',
    'stop':         '[class*="stop-all_"],[class*="stopAll"],[aria-label*="Stop All"],[title*="Stop"]',
    'stage':        'canvas',
    'sprite-panel': '[class*="sprite-selector_scroll"],[class*="spriteSelector"]',
    'costumes-tab': '[class*="tab_tab"]:nth-child(2),[id*="react-tabs-2"]',
    'sounds-tab':   '[class*="tab_tab"]:nth-child(3),[id*="react-tabs-4"]',
    'editor':          '#ps-editor',
    'threads':         '#ps-left',        // entire left panel (thread list + editor)
    'thread-list':     '#ps-threads',     // narrow thread-list column only
    'add-thread':      '#ps-add-thread',  // the + button
    'rename-thread-1': '#ps-thread-list .ps-titem:first-child .ps-tactions button',
    'rename-thread-2': '#ps-thread-list .ps-titem:nth-child(2) .ps-tactions button',
    'help':            '#ps-help-btn',
    'tutorials':    '#ps-tut-btn',
    'console':      '#ps-console',
    // TurboWarp sprite panel — the action-menu + buttons at the bottom-left
    'add-sprite-btn': '[class*="action-menu_"],[class*="actionMenu_"]',
  };

  // Named targets for PS_HIDE / PS_SHOW postMessages.
  // These hide TurboWarp chrome elements that are distracting in lesson context.
  // Selectors are best-effort against TurboWarp's hashed class names.
  var UI_HIDE_TARGETS = {
    // Bottom panel: sprite list + backdrop selector
    'sprite-panel':   '[class*="sprite-selector_"],[class*="spriteSelector_"]',
    'backdrop-panel': '[class*="stage-selector_"],[class*="stageSelector_"]',
    // Stage header resize / fullscreen buttons
    'stage-controls': '[class*="stage-header_stageSizeRow"],[class*="stageHeader_stageSizeRow"],[class*="stage-header_controls"]',
    // Left tab bar (Code / Costumes / Sounds)
    'tab-bar':        '[class*="tab-selector_"],[class*="tabSelector_"],[role="tablist"]',
    // "Add sprite" action button
    'add-sprite':     '[class*="action-menu_"],[class*="actionMenu_"]',
    // PyScratch thread management controls
    'thread-add-btn':    '#ps-add-thread',
    'thread-delete-btn': '#ps-thread-list button[title="Delete"]',
  };

  var _uiHideStyle = null;
  var _hiddenUiSet = {};

  function _syncUiHideStyle() {
    if (!_uiHideStyle) {
      _uiHideStyle = document.createElement('style');
      _uiHideStyle.id = 'ps-ui-hide';
      document.head.appendChild(_uiHideStyle);
    }
    var rules = Object.keys(_hiddenUiSet)
      .filter(function(k) { return _hiddenUiSet[k]; })
      .map(function(k) { return UI_HIDE_TARGETS[k] || k; });
    _uiHideStyle.textContent = rules.length ? rules.join(',') + '{display:none!important}' : '';
  }

  function hideUiElements(names) {
    (names || []).forEach(function(n) { _hiddenUiSet[n] = true; });
    _syncUiHideStyle();
  }
  function showUiElements(names) {
    (names || []).forEach(function(n) { delete _hiddenUiSet[n]; });
    _syncUiHideStyle();
  }
  function clearUiHides() { _hiddenUiSet = {}; _syncUiHideStyle(); }

  var _hlBox       = null;  // the highlight overlay div
  var _hlRafId     = null;  // rAF handle for position tracking
  var _hlTargetEl  = null;  // currently highlighted element

  function _ensureHighlightBox() {
    if (_hlBox) return;
    var s = document.createElement('style');
    s.textContent = [
      /* Alternate border + glow between amber and cyan for maximum contrast */
      '@keyframes ps-hl-pulse{' +
        '0%,100%{border-color:#fbbf24;' +
          'box-shadow:0 0 0 3px #fbbf24,0 0 16px 5px rgba(251,191,36,.75)}' +
        '50%{border-color:#22d3ee;' +
          'box-shadow:0 0 0 3px #22d3ee,0 0 16px 5px rgba(34,211,238,.75)}' +
      '}',
      '@keyframes ps-hl-label-pulse{' +
        '0%,100%{background:#fbbf24;color:#1a1200}' +
        '50%{background:#22d3ee;color:#0a2030}' +
      '}',
      '#ps-hl{position:fixed;pointer-events:none;z-index:99999;border:3px solid #fbbf24;' +
        'border-radius:7px;animation:ps-hl-pulse 1.2s ease-in-out infinite;' +
        'display:none;box-sizing:border-box;transition:left .12s,top .12s,width .12s,height .12s}',
      '#ps-hl-label{position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);' +
        'background:#fbbf24;color:#1a1200;font-size:11px;font-weight:700;' +
        'font-family:"Roboto","Segoe UI",sans-serif;padding:3px 10px;border-radius:99px;' +
        'white-space:nowrap;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.45);' +
        'animation:ps-hl-label-pulse 1.2s ease-in-out infinite}',
    ].join('\n');
    document.head.appendChild(s);
    _hlBox = document.createElement('div');
    _hlBox.id = 'ps-hl';
    _hlBox.innerHTML = '<span id="ps-hl-label"></span>';
    document.body.appendChild(_hlBox);
  }

  function _positionHighlight() {
    if (!_hlBox || !_hlTargetEl) return;
    var r = _hlTargetEl.getBoundingClientRect();
    if (!r.width && !r.height) return;
    var P = 5;
    _hlBox.style.left   = (r.left   - P) + 'px';
    _hlBox.style.top    = (r.top    - P) + 'px';
    _hlBox.style.width  = (r.width  + P * 2) + 'px';
    _hlBox.style.height = (r.height + P * 2) + 'px';
  }

  function showHighlight(targetOrSelector, label) {
    _ensureHighlightBox();
    clearHighlight();

    // Resolve: named preset → multi-selector string, or use as raw CSS selector
    var sel = HIGHLIGHT_PRESETS[targetOrSelector] || targetOrSelector;
    var el = null;
    try { el = sel ? document.querySelector(sel) : null; } catch(e) {}
    if (!el) { console.warn('[PyScratch] highlight: no element found for', sel); return; }

    _hlTargetEl = el;

    var labelEl = document.getElementById('ps-hl-label');
    if (labelEl) {
      labelEl.textContent  = label || '';
      labelEl.style.display = label ? '' : 'none';
    }

    _positionHighlight();
    _hlBox.style.display = 'block';

    // Track position every frame so the box stays aligned after layout changes
    (function track() { _positionHighlight(); _hlRafId = requestAnimationFrame(track); })();
  }

  function clearHighlight() {
    if (_hlRafId) { cancelAnimationFrame(_hlRafId); _hlRafId = null; }
    if (_hlBox)   { _hlBox.style.display = 'none'; }
    _hlTargetEl = null;
  }

  // ── State emission ─────────────────────────────────────────────
  // Posts current thread state to the parent frame (the lesson page).
  // Called whenever threads change so pyscratch-lesson.js can validate.
  function emitState() {
    try {
      if (!window.parent || window.parent === window) return;
      var state = { type: 'PS_STATE', threads: {} };
      Object.keys(S.spriteCode).forEach(function(spriteName) {
        state.threads[spriteName] = (S.spriteCode[spriteName] || []).map(function(t) {
          return { name: t.name || '', code: t.code || '' };
        });
      });
      window.parent.postMessage(state, '*');
    } catch(e) {}
  }

  // ── Boot ──────────────────────────────────────────────────────
  // IMPORTANT: return window.vm (the VirtualMachine), not window.vm.runtime.
  // `window.vm && window.vm.runtime` returns the Runtime due to && semantics.
  waitFor(function () {
    return (window.vm && window.vm.runtime) ? window.vm : null;
  }).then(function (vm) {
    S.vm = vm; // S.vm = VirtualMachine; S.vm.runtime = Runtime ✓

    loadSkulpt(function () {
      if (DEMO_MODE) {
        buildDemoUI();
        document.body.classList.add('ps-demo-active');
      } else {
        buildUI();
      }
      applyPyScratchTheme();
      watchPyScratchTheme();

      // Register Skulpt bridge builtins once — these are static functions
      // that receive the thread's gen token as an argument, so they never
      // need to be re-registered per thread.
      setupBridge();

      // ── Highlight postMessage API ────────────────────────────────
      // Parent lesson page sends: { type:'PS_HIGHLIGHT', target:'green-flag', label:'...' }
      // or:                       { type:'PS_HIGHLIGHT_CLEAR' }
      window.addEventListener('message', function(e) {
        if (!e.data) return;
        if (e.data.type === 'PS_HIGHLIGHT') {
          var t = e.data.target || e.data.selector || '';
          if (t) showHighlight(t, e.data.label || '');
          else   clearHighlight();
        }
        if (e.data.type === 'PS_HIGHLIGHT_CLEAR') clearHighlight();
        if (e.data.type === 'PS_RUN')       { if (!S.running) startAll(); }
        if (e.data.type === 'PS_STOP')      { if (S.running)  stopAll();  }
        if (e.data.type === 'PS_HIDE')      { hideUiElements(e.data.elements || []); }
        if (e.data.type === 'PS_SHOW')      { showUiElements(e.data.elements || []); }
        if (e.data.type === 'PS_CLEAR_UI')  { clearUiHides(); }
        if (e.data.type === 'PS_GET_STATE') { emitState(); }
        // Force thread action buttons (pencil / delete) always visible so the
        // highlight can find and frame them even without a mouse hover.
        if (e.data.type === 'PS_SHOW_THREAD_ACTIONS') {
          var _sa = document.getElementById('ps-action-override') || document.createElement('style');
          _sa.id = 'ps-action-override';
          _sa.textContent = '.ps-tactions{display:flex!important}';
          document.head.appendChild(_sa);
        }
        if (e.data.type === 'PS_HIDE_THREAD_ACTIONS') {
          var _sa = document.getElementById('ps-action-override');
          if (_sa) _sa.remove();
        }
        // Select a thread by name and optionally lock switching to others.
        if (e.data.type === 'PS_SELECT_THREAD') {
          var _stName = (e.data.name || '').toLowerCase().trim();
          var _stList = loadThreads(S.activeSprite);
          var _stIdx  = -1;
          _stList.forEach(function(t, i) {
            if ((t.name || '').toLowerCase().trim() === _stName) _stIdx = i;
          });
          if (_stIdx !== -1) {
            saveCurrentCode();
            S.activeThreadIdx = _stIdx;
            renderThreadList();
            loadCodeToEditor();
          }
          if (e.data.lock) {
            var _tl = document.getElementById('ps-thread-lock') || document.createElement('style');
            _tl.id = 'ps-thread-lock';
            _tl.textContent = '.ps-titem:not(.active){opacity:0.3;pointer-events:none;cursor:default}';
            document.head.appendChild(_tl);
          }
        }
        if (e.data.type === 'PS_UNLOCK_THREADS') {
          var _tl = document.getElementById('ps-thread-lock');
          if (_tl) _tl.remove();
        }
      });
      // URL param: ?ps_highlight=green-flag&ps_highlight_label=Click+this!
      (function() {
        var hl  = decodeURIComponent(((location.search.match(/[?&]ps_highlight=([^&]*)/)       || [])[1]) || '');
        var lbl = decodeURIComponent(((location.search.match(/[?&]ps_highlight_label=([^&]*)/) || [])[1]) || '');
        if (hl) setTimeout(function() { showHighlight(hl, lbl); }, 2200);
      })();

      if (DEMO_MODE) {
        // Demo mode: wait for project + sprites to fully load, then start loop
        setTimeout(function() { adjustDemoOverlay(); startDemoLoop(); }, 1800);
        try { vm.runtime.on('TARGETS_UPDATE', adjustDemoOverlay); } catch(e) {}
      } else {
        // Normal editor mode: sync UI and wire up editing events
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

      // ── Project save: embed Python inside project.json ──────────
      // Patch vm.toJSON() — called by every TurboWarp save path:
      //   • File → Save (saveProjectSb3 → _saveProjectZip → toJSON)
      //   • Ctrl+S toolbar button
      //   • TurboWarp restore-point system (saveProjectSb3DontZip → toJSON)
      // Python code is added as a "pyscratch" array on each non-stage target.
      // Standard .sb3 files: TurboWarp/Scratch ignores unknown target fields,
      // and our extractPyScratchData strips them back out on load so the parser
      // never sees them.  No custom .psb3 extension needed.
      if (!DEMO_MODE) {
        try {
          var _origToJSON = vm.toJSON.bind(vm);
          vm.toJSON = function (optTargetId, serializationOptions) {
            saveCurrentCode();   // flush editor textarea into S.spriteCode first
            var jsonStr = _origToJSON(optTargetId, serializationOptions);
            try {
              var proj = JSON.parse(jsonStr);
              (proj.targets || []).forEach(function (t) {
                if (!t.isStage && S.spriteCode[t.name] && S.spriteCode[t.name].length) {
                  t.pyscratch = S.spriteCode[t.name];
                }
              });
              return JSON.stringify(proj);
            } catch(e) {
              return jsonStr;   // fallback: return original if anything goes wrong
            }
          };
        } catch(e) {
          console.warn('[PyScratch] Could not patch vm.toJSON:', e);
        }
      }

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
