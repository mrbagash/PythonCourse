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
    { n: 'touching_colour', s: 'touching_colour("#hexcolor")',        c: 'sens' },
    { n: 'touching_color',  s: 'touching_color("#hexcolor")',         c: 'sens' },
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
    // Variables
    { n: 'set_variable',      s: 'set_variable(name, value)',          c: 'var' },
    { n: 'get_variable',      s: 'get_variable(name)',                 c: 'var' },
    { n: 'change_variable',   s: 'change_variable(name, amount)',      c: 'var' },
    { n: 'display_variable',  s: 'display_variable(name, visible)',    c: 'var' },
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
      desc: 'Run different code based on a condition. If the condition is true, one block runs; if not, it skips.',
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
          requires: ['        if key_pressed("right"):', '            change_x(5)'],
          behaviorCheck: {
            hint: 'Hold the right arrow key — the sprite should move right. Check your if statement and <code>change_x(5)</code>.',
            setupMs: 400,
            scenarios: [
              { label: 'right key moves sprite right', holdKey: 'right', durationMs: 400,
                checks: [{ type: 'xChanged', dir: '+' }] }
            ]
          }
        },
        {
          title: 'A second if for the left key',
          text: 'Add another <code>if</code> block below the first. Using two separate <code>if</code> blocks (rather than <code>elif</code>) means both can fire at once — useful for diagonal movement later.',
          starter: 'def game_start():\n    while True:\n        if key_pressed("right"):\n            change_x(5)',
          target: 'def game_start():\n    while True:\n        if key_pressed("right"):\n            change_x(5)\n        if key_pressed("left"):\n            change_x(-5)',
          newLines: ['        if key_pressed("left"):', '            change_x(-5)'],
          requires: ['        if key_pressed("left"):', '            change_x(-5)'],
          behaviorCheck: {
            hint: 'Check both arrow keys work — the sprite should move right when right is held and left when left is held.',
            setupMs: 400,
            scenarios: [
              { label: 'right key moves sprite right', holdKey: 'right', durationMs: 400,
                checks: [{ type: 'xChanged', dir: '+' }] },
              { label: 'left key moves sprite left', holdKey: 'left', durationMs: 400,
                checks: [{ type: 'xChanged', dir: '-' }] }
            ]
          }
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
          text: 'A <strong>for loop</strong> repeats its code a fixed number of times — no <code>while True:</code> needed. <code>range(5)</code> means "do this 5 times". The <code>def game_start():</code> has been provided — add the for loop inside it:',
          starter: 'def game_start():',
          target: 'def game_start():\n    for i in range(5):\n        change_x(30)\n        wait(0.3)',
          newLines: ['    for i in range(5):', '        change_x(30)', '        wait(0.3)'],
          requires: ['    for i in range(5):', '        change_x(30)', '        wait(0.3)'],
          behaviorCheck: {
            hint: 'Run your code — the sprite should move right 5 times automatically. Check <code>change_x(30)</code> is inside the loop.',
            setupMs: 100,
            scenarios: [
              { waitMs: 2200, checks: [{ type: 'xChanged', dir: '+' }] }
            ]
          }
        },
        {
          title: 'Use the loop variable',
          text: '<code>i</code> is the <strong>loop variable</strong> — Python sets it to the current count (0, 1, 2…). Add <code>say(str(i))</code> as the first line inside the loop. <code>str()</code> converts the number to text so <code>say()</code> can display it.',
          starter: 'def game_start():\n    for i in range(5):\n        change_x(30)\n        wait(0.3)',
          target: 'def game_start():\n    for i in range(5):\n        say(str(i))\n        change_x(30)\n        wait(0.3)',
          newLines: ['        say(str(i))'],
          requires: ['        say(str(i))'],
          behaviorCheck: {
            hint: 'Run your code — the sprite should move right and show numbers. Check <code>say(str(i))</code> is inside the loop.',
            setupMs: 100,
            scenarios: [
              { waitMs: 2200, checks: [{ type: 'xChanged', dir: '+' }] }
            ]
          }
        },
        {
          title: 'range() with a start and end',
          text: '<code>range()</code> can take two arguments: a start and a stop. <code>range(1, 6)</code> counts 1, 2, 3, 4, 5 — starting at 1 instead of 0. Update your range:',
          starter: 'def game_start():\n    for i in range(5):\n        say(str(i))\n        change_x(30)\n        wait(0.3)',
          target: 'def game_start():\n    for i in range(1, 6):\n        say(str(i))\n        change_x(30)\n        wait(0.3)',
          newLines: ['    for i in range(1, 6):'],
          requires: ['range(1, 6)'],
          behaviorCheck: {
            hint: 'Run your code — the sprite should move right 5 times counting 1 to 5. Check <code>range(1, 6)</code>.',
            setupMs: 100,
            scenarios: [
              { waitMs: 2200, checks: [{ type: 'xChanged', dir: '+' }] }
            ]
          }
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
      desc: 'Repeat code for as long as a condition is true. Good for countdowns, timers and waiting for something to happen.',
      steps: [
        {
          title: 'Set up with a counter',
          text: 'Type the <code>game_start()</code> function and create a variable called <code>count</code> starting at 0. It tracks how many times the loop has run.',
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
          requires: ['    while count < 5:', '        count = count + 1', '        wait(0.2)'],
          behaviorCheck: {
            hint: 'Run your code — the sprite should slide right 5 times and stop. Check your loop and <code>change_x(25)</code>.',
            setupMs: 100,
            scenarios: [
              { waitMs: 1800, checks: [{ type: 'xChanged', dir: '+' }] }
            ]
          }
        },
        {
          title: 'Code after the loop',
          text: 'Once <code>count</code> reaches 5 the condition is false and the loop ends. Python then runs whatever comes next. Add <code>say("Done!")</code> — with <strong>no</strong> indent, so it\'s outside the loop:',
          starter: 'def game_start():\n    count = 0\n    while count < 5:\n        change_x(25)\n        count = count + 1\n        wait(0.2)',
          target: 'def game_start():\n    count = 0\n    while count < 5:\n        change_x(25)\n        count = count + 1\n        wait(0.2)\n    say("Done!")',
          newLines: ['    say("Done!")'],
          requires: ['    say("Done!")'],
          behaviorCheck: {
            hint: 'Run your code — the sprite should slide right then say "Done!". Check <code>say("Done!")</code> is outside (less indented than) the loop.',
            setupMs: 100,
            scenarios: [
              { waitMs: 1800, checks: [{ type: 'xChanged', dir: '+' }] }
            ]
          }
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
          text: 'Type the game loop. <code>set_rotation_style("left-right")</code> before the loop means the sprite only flips horizontally, never tilting upside-down.',
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
          requires: ['        if key_pressed("right"):', '            change_x(5)', '            point_in_direction(90)'],
          behaviorCheck: {
            hint: 'Hold the right arrow key — the sprite should move right. Check your <code>if key_pressed("right"):</code> block.',
            setupMs: 400,
            scenarios: [
              { label: 'right key moves sprite right', holdKey: 'right', durationMs: 400,
                checks: [{ type: 'xChanged', dir: '+' }] }
            ]
          }
        },
        {
          title: 'Move left',
          text: 'Add a second <code>if</code> block below. <code>change_x(-5)</code> moves left. <code>point_in_direction(-90)</code> flips the sprite to face left.',
          starter: 'def game_start():\n    set_rotation_style("left-right")\n    while True:\n        if key_pressed("right"):\n            change_x(5)\n            point_in_direction(90)',
          target: 'def game_start():\n    set_rotation_style("left-right")\n    while True:\n        if key_pressed("right"):\n            change_x(5)\n            point_in_direction(90)\n        if key_pressed("left"):\n            change_x(-5)\n            point_in_direction(-90)',
          newLines: ['        if key_pressed("left"):', '            change_x(-5)', '            point_in_direction(-90)'],
          requires: ['        if key_pressed("left"):', '            change_x(-5)', '            point_in_direction(-90)'],
          behaviorCheck: {
            hint: 'Check both arrow keys work — right should move the sprite right, left should move it left.',
            setupMs: 400,
            scenarios: [
              { label: 'right key moves sprite right', holdKey: 'right', durationMs: 400,
                checks: [{ type: 'xChanged', dir: '+' }] },
              { label: 'left key moves sprite left', holdKey: 'left', durationMs: 400,
                checks: [{ type: 'xChanged', dir: '-' }] }
            ]
          }
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
          newLines: ['            next_costume()', '            next_costume()'],
          requires: [{ req: '            next_costume()', count: 2, label: 'next_costume() in both if blocks' }],
          behaviorCheck: {
            hint: 'Hold the right arrow key — the sprite should move right. Check both <code>next_costume()</code> calls are inside their if blocks.',
            setupMs: 400,
            scenarios: [
              { label: 'right key moves sprite right', holdKey: 'right', durationMs: 400,
                checks: [{ type: 'xChanged', dir: '+' }] }
            ]
          }
        },
        {
          title: 'Idle pose when still',
          text: 'Right now the sprite freezes mid-walk when you stop. Add a <code>moved</code> flag — set it <code>True</code> inside each key block, then use it to either animate or snap to costume 1:',
          starter: 'def game_start():\n    set_rotation_style("left-right")\n    while True:\n        if key_pressed("right"):\n            change_x(5)\n            point_in_direction(90)\n            next_costume()\n        if key_pressed("left"):\n            change_x(-5)\n            point_in_direction(-90)\n            next_costume()\n        if_on_edge_bounce()',
          target: 'def game_start():\n    set_rotation_style("left-right")\n    while True:\n        moved = False\n        if key_pressed("right"):\n            change_x(5)\n            point_in_direction(90)\n            moved = True\n        if key_pressed("left"):\n            change_x(-5)\n            point_in_direction(-90)\n            moved = True\n        if moved:\n            next_costume()\n        else:\n            set_costume(1)\n        if_on_edge_bounce()',
          newLines: ['        moved = False', '            moved = True', '        if moved:', '            next_costume()', '        else:', '            set_costume(1)'],
          requires: ['moved = False', { req: '            moved = True', count: 2, label: 'moved = True in both if blocks' }, '        if moved:', '            next_costume()', 'set_costume(1)'],
          behaviorCheck: {
            hint: 'Hold the right arrow key — the sprite should move right. Check <code>moved = True</code> is in both if blocks.',
            setupMs: 400,
            scenarios: [
              { label: 'right key moves sprite right', holdKey: 'right', durationMs: 400,
                checks: [{ type: 'xChanged', dir: '+' }] }
            ]
          }
        },
        {
          title: 'Control animation speed',
          text: 'Costumes are changing every frame — too fast. Add <code>wait(0.08)</code> before <code>if_on_edge_bounce()</code> to cap animation at about 12 changes per second.',
          starter: 'def game_start():\n    set_rotation_style("left-right")\n    while True:\n        moved = False\n        if key_pressed("right"):\n            change_x(5)\n            point_in_direction(90)\n            moved = True\n        if key_pressed("left"):\n            change_x(-5)\n            point_in_direction(-90)\n            moved = True\n        if moved:\n            next_costume()\n        else:\n            set_costume(1)\n        if_on_edge_bounce()',
          target: 'def game_start():\n    set_rotation_style("left-right")\n    while True:\n        moved = False\n        if key_pressed("right"):\n            change_x(5)\n            point_in_direction(90)\n            moved = True\n        if key_pressed("left"):\n            change_x(-5)\n            point_in_direction(-90)\n            moved = True\n        if moved:\n            next_costume()\n        else:\n            set_costume(1)\n        wait(0.08)\n        if_on_edge_bounce()',
          newLines: ['        wait(0.08)'],
          requires: ['wait(0.08)'],
          behaviorCheck: {
            hint: 'Hold the right arrow key — the sprite should still move right. Check the overall code structure is intact after adding <code>wait(0.08)</code>.',
            setupMs: 400,
            scenarios: [
              { label: 'right key moves sprite right', holdKey: 'right', durationMs: 500,
                checks: [{ type: 'xChanged', dir: '+' }] }
            ]
          }
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
          text: 'Type <code>vy = 0</code> at the very top of the editor, before any function. <code>vy</code> is the vertical velocity: positive moves up, negative moves down. Starting at 0 means the sprite is stationary.',
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
          requires: ['        vy = vy - 0.5', '        change_y(vy)'],
          behaviorCheck: {
            hint: 'Run your code — the sprite should fall downward automatically. Check <code>vy = vy - 0.5</code> and <code>change_y(vy)</code> are both inside the loop.',
            setupMs: 200,
            scenarios: [
              { waitMs: 700, checks: [{ type: 'yChanged', dir: '-' }] }
            ]
          }
        },
        {
          title: 'Add a floor',
          text: 'Without a floor the sprite falls forever. When it drops below y = −150, reset velocity to 0 and snap it back:',
          starter: 'vy = 0\n\ndef game_start():\n    global vy\n    while True:\n        vy = vy - 0.5\n        change_y(vy)',
          target: 'vy = 0\n\ndef game_start():\n    global vy\n    while True:\n        vy = vy - 0.5\n        change_y(vy)\n        if y_position() < -150:\n            vy = 0\n            set_y(-150)',
          newLines: ['        if y_position() < -150:', '            vy = 0', '            set_y(-150)'],
          requires: ['        if y_position() < -150:', '            set_y(-150)'],
          behaviorCheck: {
            hint: 'Run your code — the sprite should fall and land at y = −150 without falling off-screen. Check your <code>if y_position() &lt; -150:</code> block.',
            setupMs: 1000,
            scenarios: [
              { waitMs: 100, checks: [{ type: 'yAbove', value: -160 }] }
            ]
          }
        },
        {
          title: 'Jumping',
          text: 'When the sprite is on the floor <em>and</em> the up key is pressed, set <code>vy</code> to 8 — this launches it upward. Gravity pulls it back down automatically:',
          starter: 'vy = 0\n\ndef game_start():\n    global vy\n    while True:\n        vy = vy - 0.5\n        change_y(vy)\n        if y_position() < -150:\n            vy = 0\n            set_y(-150)',
          target: 'vy = 0\n\ndef game_start():\n    global vy\n    while True:\n        vy = vy - 0.5\n        change_y(vy)\n        if y_position() < -150:\n            vy = 0\n            set_y(-150)\n        if key_pressed("up") and y_position() <= -149:\n            vy = 8',
          newLines: ['        if key_pressed("up") and y_position() <= -149:', '            vy = 8'],
          requires: ['        if key_pressed("up")', '            vy = 8'],
          behaviorCheck: {
            hint: 'Press the up arrow — the sprite should jump upward from the floor. Check your <code>if key_pressed("up")</code> block and <code>vy = 8</code>.',
            setupMs: 800,
            scenarios: [
              { label: 'up key launches sprite upward', holdKey: 'up', durationMs: 80, waitMs: 300,
                checks: [{ type: 'yAbove', value: -135 }] }
            ]
          }
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
          requires: ['    global vx, vy', '    while True:', '        change_x(vx)', '        change_y(vy)'],
          behaviorCheck: {
            hint: 'Run your code — the ball should move automatically. Check <code>change_x(vx)</code> and <code>change_y(vy)</code> are inside the loop.',
            setupMs: 100,
            scenarios: [
              { waitMs: 500, checks: [{ type: 'moved' }] }
            ]
          }
        },
        {
          title: 'Bounce off left and right walls',
          text: 'When the ball hits the left or right edge, reverse its horizontal direction by flipping the sign of <code>vx</code>. Multiplying by <code>-1</code> turns 3 into -3 and vice versa:',
          starter: 'vx = 3\nvy = 3\n\ndef game_start():\n    global vx, vy\n    while True:\n        change_x(vx)\n        change_y(vy)',
          target: 'vx = 3\nvy = 3\n\ndef game_start():\n    global vx, vy\n    while True:\n        change_x(vx)\n        change_y(vy)\n        if x_position() > 220 or x_position() < -220:\n            vx = vx * -1',
          newLines: ['        if x_position() > 220 or x_position() < -220:', '            vx = vx * -1'],
          requires: ['        if x_position() > 220 or x_position() < -220:', '            vx = vx * -1'],
          behaviorCheck: {
            hint: 'Run your code — the ball should bounce back from the left and right walls, staying on screen. Check your <code>if x_position()</code> block.',
            setupMs: 100,
            scenarios: [
              { waitMs: 2500, checks: [{ type: 'xAbove', value: -225 }, { type: 'xBelow', value: 225 }] }
            ]
          }
        },
        {
          title: 'Bounce off top and bottom',
          text: 'Do the same for the top and bottom edges — flip <code>vy</code> when the ball goes above or below the stage:',
          starter: 'vx = 3\nvy = 3\n\ndef game_start():\n    global vx, vy\n    while True:\n        change_x(vx)\n        change_y(vy)\n        if x_position() > 220 or x_position() < -220:\n            vx = vx * -1',
          target: 'vx = 3\nvy = 3\n\ndef game_start():\n    global vx, vy\n    while True:\n        change_x(vx)\n        change_y(vy)\n        if x_position() > 220 or x_position() < -220:\n            vx = vx * -1\n        if y_position() > 160 or y_position() < -160:\n            vy = vy * -1',
          newLines: ['        if y_position() > 160 or y_position() < -160:', '            vy = vy * -1'],
          requires: ['        if y_position() > 160 or y_position() < -160:', '            vy = vy * -1'],
          behaviorCheck: {
            hint: 'Run your code — the ball should bounce off all four walls and stay on screen. Check your <code>if y_position()</code> block.',
            setupMs: 100,
            scenarios: [
              { waitMs: 3500, checks: [
                  { type: 'xAbove', value: -225 }, { type: 'xBelow', value: 225 },
                  { type: 'yAbove', value: -165 }, { type: 'yBelow', value: 165 }
              ]}
            ]
          }
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
          text: 'Flappy Bird is all about vertical velocity. Type <code>vy = 0</code> before the function. The bird starts stationary and gravity pulls it down from there.',
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
          requires: ['    global vy', '    while True:', '        vy = vy - 0.3', '        change_y(vy)'],
          behaviorCheck: {
            hint: 'Run your code — the bird should fall downward automatically. Check <code>vy = vy - 0.3</code> and <code>change_y(vy)</code> are inside the loop.',
            setupMs: 200,
            scenarios: [
              { waitMs: 600, checks: [{ type: 'yChanged', dir: '-' }] }
            ]
          }
        },
        {
          title: 'Add a floor and ceiling',
          text: 'Without limits the bird falls forever or flies off screen. Add both boundaries — floor at y = −150 and ceiling at y = 150:',
          starter: 'vy = 0\n\ndef game_start():\n    global vy\n    while True:\n        vy = vy - 0.3\n        change_y(vy)',
          target: 'vy = 0\n\ndef game_start():\n    global vy\n    while True:\n        vy = vy - 0.3\n        change_y(vy)\n        if y_position() < -150:\n            set_y(-150)\n            vy = 0\n        if y_position() > 150:\n            set_y(150)\n            vy = 0',
          newLines: ['        if y_position() < -150:', '            set_y(-150)', '            vy = 0', '        if y_position() > 150:', '            set_y(150)', '            vy = 0'],
          requires: ['y_position() < -150', 'y_position() > 150'],
          behaviorCheck: {
            hint: 'Run your code — the bird should fall and land at y = −150 without going off-screen. Check both your floor and ceiling <code>if</code> blocks.',
            setupMs: 900,
            scenarios: [
              { waitMs: 100, checks: [{ type: 'yAbove', value: -155 }] }
            ]
          }
        },
        {
          title: 'Flap with the Space key',
          text: 'In Flappy Bird the player <strong>taps</strong> — not holds — a key. <code>when_key_pressed</code> fires <em>once</em> per tap, unlike <code>key_pressed()</code> which is true every frame the key is held down. Add a new function <strong>below</strong> <code>game_start</code>:',
          starter: 'vy = 0\n\ndef game_start():\n    global vy\n    while True:\n        vy = vy - 0.3\n        change_y(vy)\n        if y_position() < -150:\n            set_y(-150)\n            vy = 0\n        if y_position() > 150:\n            set_y(150)\n            vy = 0',
          target: 'vy = 0\n\ndef game_start():\n    global vy\n    while True:\n        vy = vy - 0.3\n        change_y(vy)\n        if y_position() < -150:\n            set_y(-150)\n            vy = 0\n        if y_position() > 150:\n            set_y(150)\n            vy = 0\n\ndef when_key_pressed(key):\n    global vy\n    if key == "space":\n        vy = 5',
          newLines: ['def when_key_pressed(key):', '    global vy', '    if key == "space":', '        vy = 5'],
          requires: ['def when_key_pressed(key):', 'if key == "space":', 'vy = 5'],
          behaviorCheck: {
            hint: 'Press Space — the bird should flap upward from the floor. Check your <code>when_key_pressed</code> function and <code>vy = 5</code>.',
            setupMs: 800,
            scenarios: [
              { label: 'space key flaps bird upward', holdKey: 'space', durationMs: 80, waitMs: 300,
                checks: [{ type: 'yAbove', value: -130 }] }
            ]
          }
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
          text: 'You\'re now editing the <strong>obstacle sprite\'s</strong> code. Start it off-screen to the right at a <strong>random height</strong> using <code>pick_random</code>, then slide it left every frame:',
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
          requires: ['y_position() < -150', '            set_y(-150)', '            vy = 8']
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
          text: 'Platforms are their own game object: they need a <strong>separate sprite</strong> with their own position and code. Click the highlighted button to add a new sprite, give it a <strong>flat wide rectangular costume</strong>, and name it <strong>Platform</strong>.',
          highlight: 'add-sprite-btn',
          highlightLabel: 'Add a sprite here',
          requiredSpriteNames: ['Platform'],
          requiredSpriteHints: { 'Platform': 'Add a sprite and name it "Platform"' },
          starter: null, target: null, newLines: [], requires: []
        },
        {
          title: 'Platform falls down',
          text: 'You\'re now editing the <strong>Platform sprite\'s</strong> code. Start it at a random horizontal position and make it fall steadily:',
          starter: '',
          target: 'def game_start():\n    go_to_xy(pick_random(-150, 150), 0)\n    while True:\n        change_y(-2)',
          newLines: ['def game_start():', '    go_to_xy(pick_random(-150, 150), 0)', '    while True:', '        change_y(-2)'],
          requires: ['go_to_xy(pick_random(-150, 150), 0)', 'change_y(-2)']
        },
        {
          title: 'Reset to the top',
          text: 'When the platform falls off the bottom, jump it back to the top at a new random x position so it loops forever:',
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
          requiredSpriteNames: ['Platform', 'Death'],
          requiredSpriteHints: { 'Death': 'Add a sprite and name it "Death"' },
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
    },
    {
      emoji: '🦆',
      title: 'Duck Hunt',
      desc: 'A duck zigzags around the screen bouncing off every edge. Click it to shoot — score goes up and the duck reappears at a random new spot with a new speed.',
      steps: [
        {
          title: 'What are we building?',
          text: 'A Duck Hunt clone! The duck moves around the stage bouncing off every edge using two velocity variables. Click the duck with your mouse to shoot it — the score goes up and the duck teleports to a new random location at a new speed.<br><br>You only need <strong>one sprite</strong>: the duck. The Score variable is created by <code>set_variable("Score", 0)</code> and shown on screen by <code>display_variable("Score", True)</code>.',
          starter: null, target: null, newLines: [], requires: []
        },
        {
          title: 'Velocity variables and game loop',
          text: '<code>vx</code> controls left/right speed, <code>vy</code> controls up/down speed. Both are global so <code>when_clicked</code> can change them too. <code>go_to_xy(0, 50)</code> places the duck centre-screen at the start:',
          starter: '',
          target: 'vx = 3\nvy = 2\n\ndef game_start():\n    global vx, vy\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    set_rotation_style("left-right")\n    go_to_xy(0, 50)\n    while True:',
          newLines: ['vx = 3', 'vy = 2', '', 'def game_start():', '    global vx, vy', '    set_variable("Score", 0)', '    display_variable("Score", True)', '    set_rotation_style("left-right")', '    go_to_xy(0, 50)', '    while True:'],
          requires: ['vx = 3', 'vy = 2', 'def game_start():', 'global vx, vy', 'set_variable("Score"', 'display_variable("Score"', 'while True:']
        },
        {
          title: 'Make the duck fly',
          text: 'Each frame, move the duck by its current velocity. Add both lines inside the <code>while True:</code> loop:',
          starter: 'vx = 3\nvy = 2\n\ndef game_start():\n    global vx, vy\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    set_rotation_style("left-right")\n    go_to_xy(0, 50)\n    while True:',
          target: 'vx = 3\nvy = 2\n\ndef game_start():\n    global vx, vy\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    set_rotation_style("left-right")\n    go_to_xy(0, 50)\n    while True:\n        change_x(vx)\n        change_y(vy)',
          newLines: ['        change_x(vx)', '        change_y(vy)'],
          requires: ['change_x(vx)', 'change_y(vy)']
        },
        {
          title: 'Bounce off the edges',
          text: 'When the duck reaches the left or right edge, flip <code>vx</code> — multiplying by <code>-1</code> reverses the sign so it bounces back. Do the same for top and bottom with <code>vy</code>:',
          starter: 'vx = 3\nvy = 2\n\ndef game_start():\n    global vx, vy\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    set_rotation_style("left-right")\n    go_to_xy(0, 50)\n    while True:\n        change_x(vx)\n        change_y(vy)',
          target: 'vx = 3\nvy = 2\n\ndef game_start():\n    global vx, vy\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    set_rotation_style("left-right")\n    go_to_xy(0, 50)\n    while True:\n        change_x(vx)\n        change_y(vy)\n        if x_position() > 220 or x_position() < -220:\n            vx = vx * -1\n        if y_position() > 150 or y_position() < -130:\n            vy = vy * -1',
          newLines: ['        if x_position() > 220 or x_position() < -220:', '            vx = vx * -1', '        if y_position() > 150 or y_position() < -130:', '            vy = vy * -1'],
          requires: ['x_position() > 220', 'x_position() < -220', 'vx = vx * -1', 'y_position() > 150', 'vy = vy * -1']
        },
        {
          title: 'Make the duck face where it\'s flying',
          text: 'After flipping <code>vx</code>, check its new sign to face the duck the right way. <code>set_rotation_style("left-right")</code> (already set) means the sprite only ever flips, never tilts. Add these lines <strong>inside</strong> the <code>x_position</code> block, after <code>vx = vx * -1</code>:',
          starter: 'vx = 3\nvy = 2\n\ndef game_start():\n    global vx, vy\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    set_rotation_style("left-right")\n    go_to_xy(0, 50)\n    while True:\n        change_x(vx)\n        change_y(vy)\n        if x_position() > 220 or x_position() < -220:\n            vx = vx * -1\n        if y_position() > 150 or y_position() < -130:\n            vy = vy * -1',
          target: 'vx = 3\nvy = 2\n\ndef game_start():\n    global vx, vy\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    set_rotation_style("left-right")\n    go_to_xy(0, 50)\n    while True:\n        change_x(vx)\n        change_y(vy)\n        if x_position() > 220 or x_position() < -220:\n            vx = vx * -1\n            if vx > 0:\n                point_in_direction(90)\n            else:\n                point_in_direction(-90)\n        if y_position() > 150 or y_position() < -130:\n            vy = vy * -1',
          newLines: ['            if vx > 0:', '                point_in_direction(90)', '            else:', '                point_in_direction(-90)'],
          requires: ['vx > 0', 'point_in_direction(90)', 'point_in_direction(-90)']
        },
        {
          title: 'Shoot the duck on click',
          text: '<code>def when_clicked():</code> runs every time the player clicks the sprite. Hide the duck (shot!), wait briefly, then send it to a random new location at a random new speed so every duck is different to track:',
          starter: 'vx = 3\nvy = 2\n\ndef game_start():\n    global vx, vy\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    set_rotation_style("left-right")\n    go_to_xy(0, 50)\n    while True:\n        change_x(vx)\n        change_y(vy)\n        if x_position() > 220 or x_position() < -220:\n            vx = vx * -1\n            if vx > 0:\n                point_in_direction(90)\n            else:\n                point_in_direction(-90)\n        if y_position() > 150 or y_position() < -130:\n            vy = vy * -1',
          target: 'def when_clicked():\n    global vx, vy\n    change_variable("Score", 1)\n    hide()\n    wait(0.8)\n    go_to_xy(pick_random(-180, 180), pick_random(0, 120))\n    vx = pick_random(3, 6)\n    vy = pick_random(2, 4)\n    show()',
          newLines: ['def when_clicked():', '    global vx, vy', '    change_variable("Score", 1)', '    hide()', '    wait(0.8)', '    go_to_xy(pick_random(-180, 180), pick_random(0, 120))', '    vx = pick_random(3, 6)', '    vy = pick_random(2, 4)', '    show()'],
          requires: ['def when_clicked():', 'change_variable("Score"', 'hide()', 'wait(0.8)', 'go_to_xy(pick_random(', 'vx = pick_random(', 'show()']
        },
        {
          title: '✅ Try it!',
          text: 'Click the <strong>green flag ▶</strong>, then click the duck as fast as you can! Each hit scores a point and the duck respawns faster and in a new spot.<br><br><strong>Challenges:</strong><ul style="margin-top:0.5rem;padding-left:1.2rem"><li>Add a <code>shots = 3</code> variable — each click costs a shot, game over at 0 (<em>hint: use <code>set_variable("Shots", shots)</code></em>)</li><li>Make the duck speed up after each shot — add a small amount to <code>vx</code> and <code>vy</code> inside <code>when_clicked</code></li><li>Add a timer: use <code>timer()</code> to display how long the player survived before missing</li></ul>',
          starter: null, target: null, newLines: [], requires: []
        }
      ]
    },
    {
      emoji: '⚔️',
      title: 'RPG Survivor',
      desc: 'Enemies clone themselves and walk toward the player. Dodge with arrow keys, attack with space. Score goes up for each kill — survive as long as you can!',
      steps: [
        {
          title: 'What are we building?',
          text: 'An RPG survivor game using clones! Enemy clones spawn from the top of the screen and walk toward the player. Touching an enemy costs HP — attack back with <strong>space</strong> to kill them and earn score.<br><br>Before you start, <strong>rename your sprite to <code>Player</code></strong> using the name box below the stage — the enemy code looks for that name when it checks collisions.<br><br>The <code>HP</code> and <code>Score</code> counters appear on screen because your code calls <code>set_variable()</code> to create them and <code>display_variable()</code> to make them visible — no TurboWarp menus needed.',
          starter: null, target: null, newLines: [], requires: [],
          requiredSpriteNames: ['Player'],
          requiredSpriteHints: { 'Player': 'Rename your sprite to "Player"' }
        },
        {
          title: 'Player: HP variable and game loop',
          text: 'On your <strong>Player</strong> sprite, type this. <code>hp = 3</code> is a Python variable that tracks health. <code>set_variable("HP", hp)</code> creates the variable and keeps it in sync. <code>display_variable("HP", True)</code> makes it appear as an on-screen counter — without it the variable exists but stays invisible. The same pattern creates <em>Score</em>:',
          starter: null,
          target: 'hp = 3\n\ndef game_start():\n    global hp\n    set_variable("HP", hp)\n    display_variable("HP", True)\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    set_rotation_style("left-right")\n    while True:',
          newLines: ['hp = 3', '', 'def game_start():', '    global hp', '    set_variable("HP", hp)', '    display_variable("HP", True)', '    set_variable("Score", 0)', '    display_variable("Score", True)', '    set_rotation_style("left-right")', '    while True:'],
          requires: ['hp = 3', 'def game_start():', 'global hp', 'set_variable("HP"', 'display_variable("HP"', 'set_variable("Score"', 'display_variable("Score"', 'while True:']
        },
        {
          title: 'Player: left and right movement',
          text: 'Add left and right movement inside the <code>while True:</code> loop. <code>point_in_direction</code> makes the sprite face the right way when it flips:',
          starter: 'hp = 3\n\ndef game_start():\n    global hp\n    set_variable("HP", hp)\n    display_variable("HP", True)\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    set_rotation_style("left-right")\n    while True:',
          target: 'hp = 3\n\ndef game_start():\n    global hp\n    set_variable("HP", hp)\n    display_variable("HP", True)\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    set_rotation_style("left-right")\n    while True:\n        if key_pressed("right"):\n            change_x(4)\n            point_in_direction(90)\n        if key_pressed("left"):\n            change_x(-4)\n            point_in_direction(-90)',
          newLines: ['        if key_pressed("right"):', '            change_x(4)', '            point_in_direction(90)', '        if key_pressed("left"):', '            change_x(-4)', '            point_in_direction(-90)'],
          requires: ['key_pressed("right")', 'change_x(4)', 'key_pressed("left")', 'change_x(-4)']
        },
        {
          title: 'Player: up and down movement',
          text: 'Add up and down movement so the player can dodge in all four directions:',
          starter: 'hp = 3\n\ndef game_start():\n    global hp\n    set_variable("HP", hp)\n    display_variable("HP", True)\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    set_rotation_style("left-right")\n    while True:\n        if key_pressed("right"):\n            change_x(4)\n            point_in_direction(90)\n        if key_pressed("left"):\n            change_x(-4)\n            point_in_direction(-90)',
          target: 'hp = 3\n\ndef game_start():\n    global hp\n    set_variable("HP", hp)\n    display_variable("HP", True)\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    set_rotation_style("left-right")\n    while True:\n        if key_pressed("right"):\n            change_x(4)\n            point_in_direction(90)\n        if key_pressed("left"):\n            change_x(-4)\n            point_in_direction(-90)\n        if key_pressed("up"):\n            change_y(4)\n        if key_pressed("down"):\n            change_y(-4)',
          newLines: ['        if key_pressed("up"):', '            change_y(4)', '        if key_pressed("down"):', '            change_y(-4)'],
          requires: ['key_pressed("up")', 'change_y(4)', 'key_pressed("down")', 'change_y(-4)']
        },
        {
          title: 'Player: take damage from enemies',
          text: 'When the player touches an enemy clone, reduce HP, update the display, then teleport to a random position. Add this after the movement checks inside the loop:',
          starter: 'hp = 3\n\ndef game_start():\n    global hp\n    set_variable("HP", hp)\n    display_variable("HP", True)\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    set_rotation_style("left-right")\n    while True:\n        if key_pressed("right"):\n            change_x(4)\n            point_in_direction(90)\n        if key_pressed("left"):\n            change_x(-4)\n            point_in_direction(-90)\n        if key_pressed("up"):\n            change_y(4)\n        if key_pressed("down"):\n            change_y(-4)',
          target: '        if touching("Enemy"):\n            hp = hp - 1\n            set_variable("HP", hp)\n            go_to_xy(pick_random(-200, 200), pick_random(-140, 140))',
          newLines: ['        if touching("Enemy"):', '            hp = hp - 1', '            set_variable("HP", hp)', '            go_to_xy(pick_random(-200, 200), pick_random(-140, 140))'],
          requires: ['touching("Enemy")', 'hp = hp - 1', 'set_variable("HP"', 'go_to_xy(pick_random(']
        },
        {
          title: 'Player: game over at zero HP',
          text: 'Inside the <code>if touching("Enemy"):</code> block, after updating HP, check if the player has run out of health:',
          starter: 'hp = 3\n\ndef game_start():\n    global hp\n    set_variable("HP", hp)\n    display_variable("HP", True)\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    set_rotation_style("left-right")\n    while True:\n        if key_pressed("right"):\n            change_x(4)\n            point_in_direction(90)\n        if key_pressed("left"):\n            change_x(-4)\n            point_in_direction(-90)\n        if key_pressed("up"):\n            change_y(4)\n        if key_pressed("down"):\n            change_y(-4)\n        if touching("Enemy"):\n            hp = hp - 1\n            set_variable("HP", hp)\n            go_to_xy(pick_random(-200, 200), pick_random(-140, 140))',
          target: '        if touching("Enemy"):\n            hp = hp - 1\n            set_variable("HP", hp)\n            go_to_xy(pick_random(-200, 200), pick_random(-140, 140))\n            if hp <= 0:\n                say("Game Over!")\n                stop()',
          newLines: ['            if hp <= 0:', '                say("Game Over!")', '                stop()'],
          requires: ['hp <= 0', 'say("Game Over!")', 'stop()']
        },
        {
          title: 'Player: attack with space',
          text: 'Pressing <strong>space</strong> broadcasts <code>"attack"</code> — enemy clones will listen for this and delete themselves if they are touching the player. Add this at the very end of the <code>while True</code> loop:',
          starter: 'hp = 3\n\ndef game_start():\n    global hp\n    set_variable("HP", hp)\n    display_variable("HP", True)\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    set_rotation_style("left-right")\n    while True:\n        if key_pressed("right"):\n            change_x(4)\n            point_in_direction(90)\n        if key_pressed("left"):\n            change_x(-4)\n            point_in_direction(-90)\n        if key_pressed("up"):\n            change_y(4)\n        if key_pressed("down"):\n            change_y(-4)\n        if touching("Enemy"):\n            hp = hp - 1\n            set_variable("HP", hp)\n            go_to_xy(pick_random(-200, 200), pick_random(-140, 140))\n            if hp <= 0:\n                say("Game Over!")\n                stop()',
          target: '        if key_pressed("space"):\n            broadcast("attack")',
          newLines: ['        if key_pressed("space"):', '            broadcast("attack")'],
          requires: ['key_pressed("space")', 'broadcast("attack")']
        },
        {
          title: 'Add the Enemy sprite',
          text: 'Click the <strong>+</strong> button to add a new sprite. <strong>Name it exactly <code>Enemy</code></strong> — the player code uses <code>touching("Enemy")</code> to detect collisions, so spelling must match.',
          starter: null, target: null, newLines: [], requires: [],
          highlight: 'add-sprite-btn', highlightLabel: 'Add sprite here',
          requiredSpriteNames: ['Player', 'Enemy'],
          requiredSpriteHints: { 'Enemy': 'Add a sprite named "Enemy"' }
        },
        {
          title: 'Enemy: spawn clones every 2 seconds',
          text: 'Click your <strong>Enemy</strong> sprite. Clear the default code and type this. The original stays hidden and just spawns a new clone every 2 seconds:',
          starter: null,
          target: 'def game_start():\n    hide()\n    while True:\n        create_clone()\n        wait(2)',
          newLines: ['def game_start():', '    hide()', '    while True:', '        create_clone()', '        wait(2)'],
          requires: ['def game_start():', 'hide()', 'create_clone()', 'wait(2)']
        },
        {
          title: 'Enemy: clone appears and walks toward player',
          text: 'Each clone spawns at a random x position off the top of the screen, then chases the player. Add this below <code>game_start</code> (leave a blank line between them):',
          starter: 'def game_start():\n    hide()\n    while True:\n        create_clone()\n        wait(2)',
          target: 'def when_I_start_as_a_clone():\n    go_to_xy(pick_random(-240, 240), 190)\n    show()\n    while True:\n        point_towards("Player")\n        move_steps(2)',
          newLines: ['def when_I_start_as_a_clone():', '    go_to_xy(pick_random(-240, 240), 190)', '    show()', '    while True:', '        point_towards("Player")', '        move_steps(2)'],
          requires: ['def when_I_start_as_a_clone():', 'go_to_xy(pick_random(', 'show()', 'point_towards("Player")', 'move_steps(2)']
        },
        {
          title: 'Enemy: die when attacked',
          text: 'Each clone listens for the <code>"attack"</code> broadcast. If it receives it <em>while touching the player</em>, it adds 1 to the Score Scratch variable then deletes itself. <code>change_variable</code> adds to a Scratch variable directly without needing a Python <code>global</code>:',
          starter: 'def game_start():\n    hide()\n    while True:\n        create_clone()\n        wait(2)\n\ndef when_I_start_as_a_clone():\n    go_to_xy(pick_random(-240, 240), 190)\n    show()\n    while True:\n        point_towards("Player")\n        move_steps(2)',
          target: 'def when_message_received(message):\n    if message == "attack":\n        if touching("Player"):\n            change_variable("Score", 1)\n            delete_clone()',
          newLines: ['def when_message_received(message):', '    if message == "attack":', '        if touching("Player"):', '            change_variable("Score", 1)', '            delete_clone()'],
          requires: ['def when_message_received(message):', 'message == "attack"', 'touching("Player")', 'change_variable("Score"', 'delete_clone()']
        },
        {
          title: '✅ Try it!',
          text: 'Click the <strong>green flag ▶</strong>. Move with arrow keys and press <strong>space</strong> when an enemy is right next to you to kill it.<br><br><strong>Challenges:</strong><ul style="margin-top:0.5rem;padding-left:1.2rem"><li>Make enemies spawn faster as Score increases — use <code>get_variable("Score")</code> to read the current score and reduce the <code>wait()</code></li><li>Make enemies move faster as the game goes on — increase <code>move_steps</code> based on Score</li><li>Add a second type of enemy with a different speed or size using another sprite and <code>create_clone_of("FastEnemy")</code></li></ul>',
          starter: null, target: null, newLines: [], requires: []
        }
      ]
    },

    // ── Apple Catcher ─────────────────────────────────────────────
    {
      cat: 'game',
      emoji: '🍎',
      title: 'Apple Catcher',
      desc: 'Catch falling apples with a basket. Move left and right to score — miss one and you lose a life. Two sprites, score and lives counters.',
      steps: [
        {
          title: 'What are we building?',
          text: 'An Apple Catcher game! Apples fall from the top and you move a basket to catch them.<br><br>Before you start: <strong>rename your sprite to <code>Catcher</code></strong> using the name box below the stage. The Apple sprite will use <code>touching("Catcher")</code> to detect a catch.',
          starter: null, target: null, newLines: [], requires: [],
          requiredSpriteNames: ['Catcher'],
          requiredSpriteHints: { 'Catcher': 'Rename your sprite to "Catcher"' }
        },
        {
          title: 'Catcher: position and variables',
          text: 'Write <code>game_start()</code> for the Catcher sprite. Place it at the bottom and create Score and Lives counters using <code>set_variable</code>:',
          starter: '',
          target: 'def game_start():\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    set_variable("Lives", 3)\n    display_variable("Lives", True)\n    go_to_xy(0, -140)\n    while True:',
          newLines: ['def game_start():', '    set_variable("Score", 0)', '    display_variable("Score", True)', '    set_variable("Lives", 3)', '    display_variable("Lives", True)', '    go_to_xy(0, -140)', '    while True:'],
          requires: ['def game_start():', 'set_variable("Score"', 'display_variable("Score"', 'set_variable("Lives"', 'display_variable("Lives"', 'go_to_xy(0, -140)', '    while True:']
        },
        {
          title: 'Catcher: arrow key movement',
          text: 'Inside the loop, move the basket with the arrow keys. The <code>set_x</code> clamps stop it going off screen:',
          starter: 'def game_start():\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    set_variable("Lives", 3)\n    display_variable("Lives", True)\n    go_to_xy(0, -140)\n    while True:',
          target: 'def game_start():\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    set_variable("Lives", 3)\n    display_variable("Lives", True)\n    go_to_xy(0, -140)\n    while True:\n        if key_pressed("right"):\n            change_x(8)\n        if key_pressed("left"):\n            change_x(-8)\n        if x_position() > 210:\n            set_x(210)\n        if x_position() < -210:\n            set_x(-210)',
          newLines: ['        if key_pressed("right"):', '            change_x(8)', '        if key_pressed("left"):', '            change_x(-8)', '        if x_position() > 210:', '            set_x(210)', '        if x_position() < -210:', '            set_x(-210)'],
          requires: ['key_pressed("right")', 'change_x(8)', 'key_pressed("left")', 'change_x(-8)', 'x_position() > 210', 'set_x(210)', 'x_position() < -210', 'set_x(-210)']
        },
        {
          title: 'Add the Apple sprite',
          text: 'Click the <strong>+</strong> sprite button and add a second sprite. <strong>Name it exactly <code>Apple</code></strong>. Then click the Apple sprite in the panel to switch to its code.',
          starter: null, target: null, newLines: [], requires: [],
          highlight: 'add-sprite-btn', highlightLabel: 'Add Apple sprite here',
          requiredSpriteNames: ['Catcher', 'Apple'],
          requiredSpriteHints: { 'Apple': 'Add a sprite named "Apple"' }
        },
        {
          title: 'Apple: fall from the top',
          text: 'With the <strong>Apple</strong> sprite selected, write its <code>game_start()</code>. It starts at a random x position at the top and falls downward every frame:',
          starter: null,
          target: 'def game_start():\n    go_to_xy(pick_random(-200, 200), 180)\n    while True:\n        change_y(-4)',
          newLines: ['def game_start():', '    go_to_xy(pick_random(-200, 200), 180)', '    while True:', '        change_y(-4)'],
          requires: ['def game_start():', 'go_to_xy(pick_random(-200, 200), 180)', '    while True:', 'change_y(-4)']
        },
        {
          title: 'Apple: catch and miss',
          text: 'Add two checks inside the loop. If the apple is touching the basket, score a point and reset to the top. If it falls off the bottom, lose a life and reset:',
          starter: 'def game_start():\n    go_to_xy(pick_random(-200, 200), 180)\n    while True:\n        change_y(-4)',
          target: 'def game_start():\n    go_to_xy(pick_random(-200, 200), 180)\n    while True:\n        change_y(-4)\n        if touching("Catcher"):\n            change_variable("Score", 1)\n            go_to_xy(pick_random(-200, 200), 180)\n        if y_position() < -180:\n            change_variable("Lives", -1)\n            go_to_xy(pick_random(-200, 200), 180)',
          newLines: ['        if touching("Catcher"):', '            change_variable("Score", 1)', '            go_to_xy(pick_random(-200, 200), 180)', '        if y_position() < -180:', '            change_variable("Lives", -1)'],
          requires: ['touching("Catcher")', 'change_variable("Score", 1)', 'y_position() < -180', 'change_variable("Lives", -1)']
        },
        {
          title: '✅ Try it!',
          text: 'Click <strong>▶</strong>. Apples should fall at random positions — catch them with your basket!<br><br><strong>Challenges:</strong><ul style="margin-top:0.5rem;padding-left:1.2rem"><li>Add a game-over check: <code>if get_variable("Lives") &lt;= 0: say("Game Over!") stop()</code></li><li>Add <code>wait(0.3)</code> after the reset so there\'s a brief gap before the apple reappears</li><li>Make apples speed up — use a variable for speed instead of the fixed <code>-4</code></li></ul>',
          starter: null, target: null, newLines: [], requires: []
        }
      ]
    },

    // ── Whack-a-Mole ──────────────────────────────────────────────
    {
      cat: 'game',
      emoji: '🔨',
      title: 'Whack-a-Mole',
      desc: 'Moles pop up at random positions and vanish after a random time. Click them fast to score. Uses timed clone lifetimes and when_clicked on clones.',
      steps: [
        {
          title: 'What are we building?',
          text: 'A Whack-a-Mole game! The original sprite stays hidden. Every 1.5 seconds it spawns a <strong>clone</strong> that appears at a random position for a random amount of time then vanishes. Click a mole to score a point and destroy it instantly.<br><br>You only need <strong>one sprite</strong>: the mole.',
          starter: null, target: null, newLines: [], requires: []
        },
        {
          title: 'Main loop: spawn clones',
          text: 'The original sprite hides itself then spawns a new clone every 1.5 seconds. <code>set_variable("Score", 0)</code> creates the Score variable; <code>display_variable("Score", True)</code> makes it visible on screen as a counter:',
          starter: '',
          target: 'def game_start():\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    hide()\n    while True:\n        create_clone()\n        wait(1.5)',
          newLines: ['def game_start():', '    set_variable("Score", 0)', '    display_variable("Score", True)', '    hide()', '    while True:', '        create_clone()', '        wait(1.5)'],
          requires: ['def game_start():', 'set_variable("Score"', 'display_variable("Score"', 'hide()', 'create_clone()', 'wait(1.5)']
        },
        {
          title: 'Clone: appear at a random spot',
          text: 'Each clone starts its own script. Move it to a random position and show it:',
          starter: 'def game_start():\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    hide()\n    while True:\n        create_clone()\n        wait(1.5)',
          target: 'def game_start():\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    hide()\n    while True:\n        create_clone()\n        wait(1.5)\n\ndef when_I_start_as_a_clone():\n    go_to_xy(pick_random(-180, 180), pick_random(-100, 100))\n    show()',
          newLines: ['def when_I_start_as_a_clone():', '    go_to_xy(pick_random(-180, 180), pick_random(-100, 100))', '    show()'],
          requires: ['def when_I_start_as_a_clone():', 'go_to_xy(pick_random(-180, 180), pick_random(-100, 100))', 'show()']
        },
        {
          title: 'Clone: vanish after a random time',
          text: 'After showing, the clone waits a random amount of time (between 1 and 3 seconds), then hides and deletes itself:',
          starter: 'def game_start():\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    hide()\n    while True:\n        create_clone()\n        wait(1.5)\n\ndef when_I_start_as_a_clone():\n    go_to_xy(pick_random(-180, 180), pick_random(-100, 100))\n    show()',
          target: 'def game_start():\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    hide()\n    while True:\n        create_clone()\n        wait(1.5)\n\ndef when_I_start_as_a_clone():\n    go_to_xy(pick_random(-180, 180), pick_random(-100, 100))\n    show()\n    wait(pick_random(1, 3))\n    hide()\n    delete_clone()',
          newLines: ['    wait(pick_random(1, 3))', '    hide()', '    delete_clone()'],
          requires: ['wait(pick_random(1, 3))', '    delete_clone()']
        },
        {
          title: 'Click handler: whack it!',
          text: '<code>def when_clicked():</code> fires on the clone that was clicked. Add 1 to Score and immediately destroy the clone:',
          starter: 'def game_start():\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    hide()\n    while True:\n        create_clone()\n        wait(1.5)\n\ndef when_I_start_as_a_clone():\n    go_to_xy(pick_random(-180, 180), pick_random(-100, 100))\n    show()\n    wait(pick_random(1, 3))\n    hide()\n    delete_clone()',
          target: 'def game_start():\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    hide()\n    while True:\n        create_clone()\n        wait(1.5)\n\ndef when_I_start_as_a_clone():\n    go_to_xy(pick_random(-180, 180), pick_random(-100, 100))\n    show()\n    wait(pick_random(1, 3))\n    hide()\n    delete_clone()\n\ndef when_clicked():\n    change_variable("Score", 1)\n    hide()\n    delete_clone()',
          newLines: ['def when_clicked():', '    change_variable("Score", 1)', '    hide()', '    delete_clone()'],
          requires: ['def when_clicked():', 'change_variable("Score", 1)']
        },
        {
          title: '✅ Try it!',
          text: 'Click <strong>▶</strong>. Moles should pop up at random spots — click them before they vanish!<br><br><strong>Challenges:</strong><ul style="margin-top:0.5rem;padding-left:1.2rem"><li>Speed up the game over time — reduce the <code>wait(1.5)</code> in <code>game_start</code> based on <code>get_variable("Score")</code></li><li>Add a 30-second time limit using <code>timer()</code> and <code>if timer() &gt; 30: say("Time\'s up!") stop()</code></li><li>Make moles shrink as your score increases using <code>set_size()</code></li></ul>',
          starter: null, target: null, newLines: [], requires: []
        }
      ]
    },

    // ── Space Shooter ─────────────────────────────────────────────
    {
      cat: 'game',
      emoji: '🚀',
      title: 'Space Shooter',
      desc: 'Fly a ship left and right and press space to fire bullets upward. Bullets are clones that delete themselves on impact. Uses the broadcast → clone projectile pattern.',
      steps: [
        {
          title: 'What are we building?',
          text: 'A Space Shooter! Move your ship left and right. Press <strong>space</strong> to fire bullets upward at an enemy that patrols the top of the screen.<br><br>You need <strong>three sprites</strong>: <code>Player</code> (the ship), <code>Bullet</code> (a small projectile), and <code>Enemy</code>. <strong>Rename your default sprite to <code>Player</code></strong> using the name box below the stage.',
          starter: null, target: null, newLines: [], requires: [],
          requiredSpriteNames: ['Player'],
          requiredSpriteHints: { 'Player': 'Rename your sprite to "Player"' }
        },
        {
          title: 'Player: movement and boundary',
          text: 'Write the Player\'s <code>game_start()</code> — left/right movement with arrow keys and clamping so it stays on screen:',
          starter: '',
          target: 'def game_start():\n    go_to_xy(0, -150)\n    set_rotation_style("left-right")\n    while True:\n        if key_pressed("right"):\n            change_x(5)\n            point_in_direction(90)\n        if key_pressed("left"):\n            change_x(-5)\n            point_in_direction(-90)\n        if x_position() > 220:\n            set_x(220)\n        if x_position() < -220:\n            set_x(-220)',
          newLines: ['def game_start():', '    go_to_xy(0, -150)', '    set_rotation_style("left-right")', '    while True:', '        if key_pressed("right"):', '            change_x(5)', '            point_in_direction(90)', '        if key_pressed("left"):', '            change_x(-5)', '            point_in_direction(-90)', '        if x_position() > 220:', '            set_x(220)', '        if x_position() < -220:', '            set_x(-220)'],
          requires: ['go_to_xy(0, -150)', 'key_pressed("right")', 'change_x(5)', 'key_pressed("left")', 'change_x(-5)', 'x_position() > 220', 'set_x(220)', 'x_position() < -220', 'set_x(-220)']
        },
        {
          title: 'Player: fire bullets',
          text: 'At the end of the loop, check whether the space key is pressed and broadcast <code>"fire"</code>. The Bullet sprite will listen for this:',
          starter: 'def game_start():\n    go_to_xy(0, -150)\n    set_rotation_style("left-right")\n    while True:\n        if key_pressed("right"):\n            change_x(5)\n            point_in_direction(90)\n        if key_pressed("left"):\n            change_x(-5)\n            point_in_direction(-90)\n        if x_position() > 220:\n            set_x(220)\n        if x_position() < -220:\n            set_x(-220)',
          target: 'def game_start():\n    go_to_xy(0, -150)\n    set_rotation_style("left-right")\n    while True:\n        if key_pressed("right"):\n            change_x(5)\n            point_in_direction(90)\n        if key_pressed("left"):\n            change_x(-5)\n            point_in_direction(-90)\n        if x_position() > 220:\n            set_x(220)\n        if x_position() < -220:\n            set_x(-220)\n        if key_pressed("space"):\n            broadcast("fire")',
          newLines: ['        if key_pressed("space"):', '            broadcast("fire")'],
          requires: ['key_pressed("space")', 'broadcast("fire")']
        },
        {
          title: 'Add the Bullet and Enemy sprites',
          text: 'Click <strong>+</strong> twice to add two more sprites. Name them exactly <strong><code>Bullet</code></strong> and <strong><code>Enemy</code></strong>. Then click the <strong>Bullet</strong> sprite to switch to its code.',
          starter: null, target: null, newLines: [], requires: [],
          highlight: 'add-sprite-btn', highlightLabel: 'Add sprites here',
          requiredSpriteNames: ['Player', 'Bullet', 'Enemy'],
          requiredSpriteHints: { 'Bullet': 'Add a sprite named "Bullet"', 'Enemy': 'Add a sprite named "Enemy"' }
        },
        {
          title: 'Bullet: listen for "fire" and launch a clone',
          text: 'With the <strong>Bullet</strong> sprite selected, write its code. The base sprite hides itself. When the "fire" broadcast arrives it jumps to the Player\'s position and spawns a clone. The clone then shoots upward:',
          starter: null,
          target: 'def game_start():\n    hide()\n\ndef when_message_received(message):\n    if message == "fire":\n        go_to("Player")\n        create_clone()\n\ndef when_I_start_as_a_clone():\n    show()\n    while True:\n        change_y(8)\n        if y_position() > 180:\n            delete_clone()\n        if touching("Enemy"):\n            change_variable("Score", 1)\n            delete_clone()',
          newLines: ['def game_start():', '    hide()', 'def when_message_received(message):', '    if message == "fire":', '        go_to("Player")', '        create_clone()', 'def when_I_start_as_a_clone():', '    show()', '    while True:', '        change_y(8)', '        if y_position() > 180:', '            delete_clone()', '        if touching("Enemy"):', '            change_variable("Score", 1)', '            delete_clone()'],
          requires: ['def game_start():', 'hide()', 'def when_message_received(message):', 'message == "fire"', 'go_to("Player")', 'create_clone()', 'def when_I_start_as_a_clone():', 'show()', 'change_y(8)', 'y_position() > 180', 'touching("Enemy")', 'change_variable("Score"', 'delete_clone()']
        },
        {
          title: 'Enemy: patrol left and right',
          text: 'Click the <strong>Enemy</strong> sprite. Give it a velocity variable and a simple loop that bounces it off the edges of the screen. <code>set_variable("Score", 0)</code> creates the Score variable; <code>display_variable("Score", True)</code> makes it visible on screen:',
          starter: null,
          target: 'vx = 3\n\ndef game_start():\n    global vx\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    go_to_xy(-200, 120)\n    while True:\n        change_x(vx)\n        if x_position() > 220 or x_position() < -220:\n            vx = vx * -1',
          newLines: ['vx = 3', '', 'def game_start():', '    global vx', '    set_variable("Score", 0)', '    display_variable("Score", True)', '    go_to_xy(-200, 120)', '    while True:', '        change_x(vx)', '        if x_position() > 220 or x_position() < -220:', '            vx = vx * -1'],
          requires: ['vx = 3', 'def game_start():', 'global vx', 'set_variable("Score"', 'display_variable("Score"', 'go_to_xy(-200, 120)', 'change_x(vx)', 'x_position() > 220', 'vx = vx * -1']
        },
        {
          title: '✅ Try it!',
          text: 'Click <strong>▶</strong>. Move with arrow keys, fire with space — hit the enemy to score!<br><br><strong>Challenges:</strong><ul style="margin-top:0.5rem;padding-left:1.2rem"><li>Add a <code>wait(0.2)</code> after <code>broadcast("fire")</code> so bullets have a fire rate limit</li><li>Speed the enemy up as Score increases — use <code>get_variable("Score")</code> to scale <code>vx</code></li><li>Add multiple enemies using <code>create_clone_of("Enemy")</code> from the Player code</li></ul>',
          starter: null, target: null, newLines: [], requires: []
        }
      ]
    },

    // ── Pong ──────────────────────────────────────────────────────
    {
      cat: 'game',
      emoji: '🏓',
      title: 'Pong',
      desc: 'Classic one-player Pong. Bounce the ball off the walls and your paddle — miss it and it\'s game over. Velocity-based bounce across two sprites.',
      steps: [
        {
          title: 'What are we building?',
          text: 'A one-player Pong game! A ball bounces off the left, right, and top walls. Move the paddle to bounce it back up. If the ball gets past the paddle it\'s game over.<br><br>You need <strong>two sprites</strong>: <code>Paddle</code> and <code>Ball</code>. <strong>Rename your default sprite to <code>Paddle</code></strong> using the name box below the stage.',
          starter: null, target: null, newLines: [], requires: [],
          requiredSpriteNames: ['Paddle'],
          requiredSpriteHints: { 'Paddle': 'Rename your sprite to "Paddle"' }
        },
        {
          title: 'Paddle: movement and boundary',
          text: 'Write the Paddle\'s <code>game_start()</code>. Position it at the bottom and move it left and right with the arrow keys:',
          starter: '',
          target: 'def game_start():\n    go_to_xy(0, -150)\n    while True:\n        if key_pressed("right"):\n            change_x(8)\n        if key_pressed("left"):\n            change_x(-8)\n        if x_position() > 200:\n            set_x(200)\n        if x_position() < -200:\n            set_x(-200)',
          newLines: ['def game_start():', '    go_to_xy(0, -150)', '    while True:', '        if key_pressed("right"):', '            change_x(8)', '        if key_pressed("left"):', '            change_x(-8)', '        if x_position() > 200:', '            set_x(200)', '        if x_position() < -200:', '            set_x(-200)'],
          requires: ['go_to_xy(0, -150)', 'key_pressed("right")', 'change_x(8)', 'key_pressed("left")', 'change_x(-8)', 'x_position() > 200', 'set_x(200)', 'x_position() < -200', 'set_x(-200)']
        },
        {
          title: 'Add the Ball sprite',
          text: 'Click <strong>+</strong> to add a second sprite. Name it <strong><code>Ball</code></strong>. Then click the Ball in the sprite panel to switch to its code.',
          starter: null, target: null, newLines: [], requires: [],
          highlight: 'add-sprite-btn', highlightLabel: 'Add Ball sprite here',
          requiredSpriteNames: ['Paddle', 'Ball'],
          requiredSpriteHints: { 'Ball': 'Add a sprite named "Ball"' }
        },
        {
          title: 'Ball: velocity variables',
          text: 'With <strong>Ball</strong> selected, set up two global velocity variables outside <code>game_start</code>. Then start the ball in the centre and set up the Score counter:',
          starter: null,
          target: 'vx = 4\nvy = 3\n\ndef game_start():\n    global vx, vy\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    go_to_xy(0, 50)',
          newLines: ['vx = 4', 'vy = 3', '', 'def game_start():', '    global vx, vy', '    set_variable("Score", 0)', '    display_variable("Score", True)', '    go_to_xy(0, 50)'],
          requires: ['vx = 4', 'vy = 3', 'global vx, vy', 'set_variable("Score"', 'display_variable("Score"', 'go_to_xy(0, 50)']
        },
        {
          title: 'Ball: movement and wall bouncing',
          text: 'Add the <code>while True:</code> loop. The ball moves by its velocity each frame and reverses direction when it hits the left/right walls or the top:',
          starter: 'vx = 4\nvy = 3\n\ndef game_start():\n    global vx, vy\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    go_to_xy(0, 50)',
          target: 'vx = 4\nvy = 3\n\ndef game_start():\n    global vx, vy\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    go_to_xy(0, 50)\n    while True:\n        change_x(vx)\n        change_y(vy)\n        if x_position() > 225 or x_position() < -225:\n            vx = vx * -1\n        if y_position() > 165:\n            vy = vy * -1',
          newLines: ['    while True:', '        change_x(vx)', '        change_y(vy)', '        if x_position() > 225 or x_position() < -225:', '            vx = vx * -1', '        if y_position() > 165:', '            vy = vy * -1'],
          requires: ['    while True:', 'change_x(vx)', 'change_y(vy)', 'x_position() > 225', 'vx = vx * -1', 'y_position() > 165', 'vy = vy * -1']
        },
        {
          title: 'Ball: bounce off paddle and game over',
          text: 'Add two more checks: bounce upward when the ball touches the Paddle (only if already moving downward), and stop the game if it drops off the bottom:',
          starter: 'vx = 4\nvy = 3\n\ndef game_start():\n    global vx, vy\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    go_to_xy(0, 50)\n    while True:\n        change_x(vx)\n        change_y(vy)\n        if x_position() > 225 or x_position() < -225:\n            vx = vx * -1\n        if y_position() > 165:\n            vy = vy * -1',
          target: 'vx = 4\nvy = 3\n\ndef game_start():\n    global vx, vy\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    go_to_xy(0, 50)\n    while True:\n        change_x(vx)\n        change_y(vy)\n        if x_position() > 225 or x_position() < -225:\n            vx = vx * -1\n        if y_position() > 165:\n            vy = vy * -1\n        if touching("Paddle") and vy < 0:\n            vy = vy * -1\n            change_variable("Score", 1)\n        if y_position() < -175:\n            say("Game Over!")\n            stop()',
          newLines: ['        if touching("Paddle") and vy < 0:', '            vy = vy * -1', '            change_variable("Score", 1)', '        if y_position() < -175:', '            say("Game Over!")', '            stop()'],
          requires: ['touching("Paddle") and vy < 0', '            vy = vy * -1', 'change_variable("Score", 1)', 'y_position() < -175', 'say("Game Over!")', 'stop()']
        },
        {
          title: '✅ Try it!',
          text: 'Click <strong>▶</strong>. Keep the ball alive with your paddle — each bounce scores a point!<br><br><strong>Challenges:</strong><ul style="margin-top:0.5rem;padding-left:1.2rem"><li>Speed the ball up over time — add <code>vy = vy * 1.05</code> each time you hit the paddle</li><li>Make the bounce angle depend on where the ball hits the paddle using <code>x_position() - touching("Paddle")</code> — look up how Scratch Pong angle maths works</li><li>Add a two-player mode: second paddle controlled with W/S keys, both using <code>change_y</code></li></ul>',
          starter: null, target: null, newLines: [], requires: []
        }
      ]
    },

    // ── Breakout ──────────────────────────────────────────────────
    {
      cat: 'game',
      emoji: '🧱',
      title: 'Breakout',
      desc: 'Bounce a ball off a paddle to smash rows of brick clones. Each brick deletes itself on impact. Nested loops build the grid, three-sprite collision throughout.',
      steps: [
        {
          title: 'What are we building?',
          text: 'Breakout! A ball bounces around the screen. Use the paddle to keep it alive — when the ball hits a Brick clone it destroys it and you score a point.<br><br>You need <strong>three sprites</strong>: <code>Paddle</code>, <code>Ball</code>, and <code>Brick</code>. <strong>Rename your sprite to <code>Paddle</code></strong> using the name box below the stage.',
          starter: null, target: null, newLines: [], requires: [],
          requiredSpriteNames: ['Paddle'],
          requiredSpriteHints: { 'Paddle': 'Rename your sprite to "Paddle"' }
        },
        {
          title: 'Paddle: movement and boundary',
          text: 'Write the Paddle\'s <code>game_start()</code> — identical to Pong. Place it at the bottom and move left/right with clamping:',
          starter: '',
          target: 'def game_start():\n    go_to_xy(0, -150)\n    while True:\n        if key_pressed("right"):\n            change_x(8)\n        if key_pressed("left"):\n            change_x(-8)\n        if x_position() > 200:\n            set_x(200)\n        if x_position() < -200:\n            set_x(-200)',
          newLines: ['def game_start():', '    go_to_xy(0, -150)', '    while True:', '        if key_pressed("right"):', '            change_x(8)', '        if key_pressed("left"):', '            change_x(-8)', '        if x_position() > 200:', '            set_x(200)', '        if x_position() < -200:', '            set_x(-200)'],
          requires: ['go_to_xy(0, -150)', 'key_pressed("right")', 'change_x(8)', 'key_pressed("left")', 'change_x(-8)', 'x_position() > 200', 'set_x(200)', 'x_position() < -200', 'set_x(-200)']
        },
        {
          title: 'Add Ball and Brick sprites',
          text: 'Click <strong>+</strong> twice. Name the sprites <strong><code>Ball</code></strong> and <strong><code>Brick</code></strong>. Then click <strong>Ball</strong> to switch to its code.',
          starter: null, target: null, newLines: [], requires: [],
          highlight: 'add-sprite-btn', highlightLabel: 'Add sprites here',
          requiredSpriteNames: ['Paddle', 'Ball', 'Brick'],
          requiredSpriteHints: { 'Ball': 'Add a sprite named "Ball"', 'Brick': 'Add a sprite named "Brick"' }
        },
        {
          title: 'Ball: velocity and movement',
          text: 'With <strong>Ball</strong> selected, add velocity variables then write the movement loop with wall and ceiling bouncing:',
          starter: null,
          target: 'vx = 4\nvy = 4\n\ndef game_start():\n    global vx, vy\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    go_to_xy(0, -30)\n    while True:\n        change_x(vx)\n        change_y(vy)\n        if x_position() > 225 or x_position() < -225:\n            vx = vx * -1\n        if y_position() > 165:\n            vy = vy * -1',
          newLines: ['vx = 4', 'vy = 4', '', 'def game_start():', '    global vx, vy', '    set_variable("Score", 0)', '    display_variable("Score", True)', '    go_to_xy(0, -30)', '    while True:', '        change_x(vx)', '        change_y(vy)', '        if x_position() > 225 or x_position() < -225:', '            vx = vx * -1', '        if y_position() > 165:', '            vy = vy * -1'],
          requires: ['vx = 4', 'vy = 4', 'global vx, vy', 'set_variable("Score"', 'display_variable("Score"', 'go_to_xy(0, -30)', 'change_x(vx)', 'change_y(vy)', 'x_position() > 225', 'vx = vx * -1', 'y_position() > 165', 'vy = vy * -1']
        },
        {
          title: 'Ball: paddle bounce, brick bounce, game over',
          text: 'Add three more checks: bounce off the Paddle, bounce off any Brick and score, and stop the game if the ball falls past the bottom:',
          starter: 'vx = 4\nvy = 4\n\ndef game_start():\n    global vx, vy\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    go_to_xy(0, -30)\n    while True:\n        change_x(vx)\n        change_y(vy)\n        if x_position() > 225 or x_position() < -225:\n            vx = vx * -1\n        if y_position() > 165:\n            vy = vy * -1',
          target: 'vx = 4\nvy = 4\n\ndef game_start():\n    global vx, vy\n    set_variable("Score", 0)\n    display_variable("Score", True)\n    go_to_xy(0, -30)\n    while True:\n        change_x(vx)\n        change_y(vy)\n        if x_position() > 225 or x_position() < -225:\n            vx = vx * -1\n        if y_position() > 165:\n            vy = vy * -1\n        if touching("Paddle") and vy < 0:\n            vy = vy * -1\n        if touching("Brick"):\n            vy = vy * -1\n            change_variable("Score", 1)\n        if y_position() < -175:\n            say("Game Over!")\n            stop()',
          newLines: ['        if touching("Paddle") and vy < 0:', '            vy = vy * -1', '        if touching("Brick"):', '            vy = vy * -1', '            change_variable("Score", 1)', '        if y_position() < -175:', '            say("Game Over!")', '            stop()'],
          requires: ['touching("Paddle") and vy < 0', 'touching("Brick")', '            change_variable("Score", 1)', 'y_position() < -175', 'say("Game Over!")', 'stop()']
        },
        {
          title: 'Brick: build the grid',
          text: 'Click the <strong>Brick</strong> sprite. Use two nested <code>for</code> loops to create 3 rows of 8 bricks. The base sprite hides itself — only clones are visible:',
          starter: null,
          target: 'def game_start():\n    hide()\n    for row in range(3):\n        for col in range(8):\n            go_to_xy(-175 + col * 50, 80 - row * 30)\n            create_clone()',
          newLines: ['def game_start():', '    hide()', '    for row in range(3):', '        for col in range(8):', '            go_to_xy(-175 + col * 50, 80 - row * 30)', '            create_clone()'],
          requires: ['def game_start():', 'hide()', 'for row in range(3):', 'for col in range(8):', 'go_to_xy(-175 + col * 50, 80 - row * 30)', 'create_clone()']
        },
        {
          title: 'Brick: clones appear and die on contact',
          text: 'Each brick clone shows itself when created. It watches for the Ball touching it — when hit, it deletes itself (the Ball\'s code already reverses direction):',
          starter: 'def game_start():\n    hide()\n    for row in range(3):\n        for col in range(8):\n            go_to_xy(-175 + col * 50, 80 - row * 30)\n            create_clone()',
          target: 'def game_start():\n    hide()\n    for row in range(3):\n        for col in range(8):\n            go_to_xy(-175 + col * 50, 80 - row * 30)\n            create_clone()\n\ndef when_I_start_as_a_clone():\n    show()\n    while True:\n        if touching("Ball"):\n            delete_clone()',
          newLines: ['def when_I_start_as_a_clone():', '    show()', '    while True:', '        if touching("Ball"):', '            delete_clone()'],
          requires: ['def when_I_start_as_a_clone():', '    show()', 'while True:', 'touching("Ball")', 'delete_clone()']
        },
        {
          title: '✅ Try it!',
          text: 'Click <strong>▶</strong>. Smash all the bricks — each one scores a point!<br><br><strong>Challenges:</strong><ul style="margin-top:0.5rem;padding-left:1.2rem"><li>Add more rows of bricks by changing <code>range(3)</code> to a larger number</li><li>Add a win condition: when Score reaches the total brick count, say "You Win!" and <code>stop()</code></li><li>Make different coloured rows worth different points using <code>set_effect("color", ...)</code> on each clone based on <code>row</code></li></ul>',
          starter: null, target: null, newLines: [], requires: []
        }
      ]
    }
  ];

  // ── Challenge data ────────────────────────────────────────────
  // Each challenge is a standalone game for students to build from scratch.
  // No starter code is given — only a goal, hints, and auto-tests.
  //
  // test shape (extends behaviorCheck scenario):
  //   label       string   — shown in results list
  //   holdKey     string   — hold a key for durationMs (optional)
  //   durationMs  number   — how long to hold the key (default 400)
  //   clickSprite string   — '__active__' or a sprite name to fire a click event (optional)
  //   broadcast   string   — message to fire a broadcast event (optional)
  //   waitMs      number   — wait after input before reading state (default 250)
  //   keepRunning bool     — skip startAll(); continue from previous test (default false)
  //   allowStop   bool     — don't fail if the program stopped naturally (default false)
  //   checks      array    — same check types as behaviorCheck scenarios
  var CHALLENGES = [
    {
      id: 'arrow-mover',
      emoji: '🕹️',
      title: 'Arrow Key Mover',
      difficulty: 1,
      goal: 'Control the sprite with all four arrow keys. Right moves the sprite right, left moves it left, up moves it up and down moves it down. The sprite should keep moving as long as the key is held.',
      hints: [
        'Put a <code>while True:</code> loop inside <code>def game_start():</code> — this keeps checking every frame.',
        'Use <code>if key_pressed("right"):</code> to check if the right arrow is held down.',
        '<code>change_x(5)</code> moves right, <code>change_x(-5)</code> moves left.',
        '<code>change_y(5)</code> moves up, <code>change_y(-5)</code> moves down.',
        'You need four separate <code>if</code> blocks — one for each direction.'
      ],
      setupMs: 500,
      settleMs: 100,
      tests: [
        { label: 'Right arrow moves sprite right',
          holdKey: 'right', durationMs: 400,
          checks: [{ type: 'xChanged', dir: '+' }] },
        { label: 'Left arrow moves sprite left',
          holdKey: 'left', durationMs: 400,
          checks: [{ type: 'xChanged', dir: '-' }] },
        { label: 'Up arrow moves sprite up',
          holdKey: 'up', durationMs: 400,
          checks: [{ type: 'yChanged', dir: '+' }] },
        { label: 'Down arrow moves sprite down',
          holdKey: 'down', durationMs: 400,
          checks: [{ type: 'yChanged', dir: '-' }] }
      ]
    },
    {
      id: 'click-counter',
      emoji: '🖱️',
      title: 'Click Counter',
      difficulty: 2,
      goal: 'When the green flag is pressed, set a variable called <strong>Score</strong> to 0 and display it on screen. Each time the sprite is clicked, Score goes up by 1.',
      hints: [
        'In <code>def game_start():</code>, use <code>set_variable("Score", 0)</code> to reset the score.',
        'Use <code>display_variable("Score", True)</code> to show it on the stage.',
        'Define <code>def when_clicked():</code> — this runs every time the sprite is clicked.',
        'Inside <code>when_clicked()</code>, use <code>change_variable("Score", 1)</code> to add 1.'
      ],
      setupMs: 700,
      settleMs: 400,
      tests: [
        { label: 'Score starts at 0 when the flag is pressed',
          checks: [{ type: 'variable', name: 'Score', op: '=', value: 0 }] },
        { label: 'Clicking the sprite increases Score to 1',
          keepRunning: true, clickSprite: '__active__',
          checks: [{ type: 'variable', name: 'Score', op: '=', value: 1 }] },
        { label: 'Clicking again increases Score to 2',
          keepRunning: true, clickSprite: '__active__',
          checks: [{ type: 'variable', name: 'Score', op: '=', value: 2 }] }
      ]
    },
    {
      id: 'wall-bouncer',
      emoji: '🏓',
      title: 'Wall Bouncer',
      difficulty: 3,
      goal: 'The sprite moves automatically using a speed variable <code>vx</code>. When it reaches the right wall (x > 220) or left wall (x &lt; −220), it reverses direction by flipping <code>vx</code>. The sprite bounces back and forth forever without any key presses.',
      hints: [
        'Create <code>vx = 5</code> at the top of your code — outside any function.',
        'In <code>def game_start():</code>, write <code>global vx</code> first so Python can change it.',
        'Inside a <code>while True:</code> loop, use <code>change_x(vx)</code> to move each frame.',
        'Check <code>if x_position() > 220 or x_position() &lt; -220:</code> to detect the walls.',
        'To bounce: <code>vx = vx * -1</code> — this flips the direction.'
      ],
      setupMs: 300,
      settleMs: 100,
      tests: [
        { label: 'Sprite moves automatically without any key press',
          waitMs: 500,
          checks: [{ type: 'moved' }] },
        { label: 'Sprite travels at a reasonable speed (reaches x > 80 within 600 ms)',
          waitMs: 600,
          checks: [{ type: 'xAbove', value: 80 }] },
        { label: 'Sprite bounces back from the right wall (not stuck at edge after 3 s)',
          waitMs: 3000,
          checks: [{ type: 'xBelow', value: 200 }] }
      ]
    },
    {
      id: 'gravity-jumper',
      emoji: '🚀',
      title: 'Gravity Jumper',
      difficulty: 4,
      goal: 'Build a physics game. A variable <code>vy</code> controls the sprite\'s vertical speed. Every frame, <code>vy</code> decreases by 0.5 (gravity pulls it down). Pressing space sets <code>vy</code> to 8 (a jump). If the sprite falls below y = −160, say <em>"Game Over!"</em> and <code>stop()</code>.',
      hints: [
        'Create <code>vy = 0</code> at the top of your code.',
        'In <code>game_start()</code>, write <code>global vy</code> so the loop can change it.',
        'Each frame: <code>vy = vy - 0.5</code> (gravity), then <code>change_y(vy)</code>.',
        'Add <code>if key_pressed("space"): vy = 8</code> to jump.',
        'Add <code>if y_position() &lt; -160: say("Game Over!"); stop()</code> for the game-over check.',
        'Try adding a Score variable that goes up by 1 each frame — how long can you survive?'
      ],
      setupMs: 150,
      settleMs: 100,
      tests: [
        { label: 'Sprite falls down automatically (gravity works)',
          allowStop: true, waitMs: 900,
          checks: [{ type: 'yChanged', dir: '-' }] },
        { label: 'Space bar makes the sprite jump upwards',
          allowStop: true, holdKey: 'space', durationMs: 50, waitMs: 400,
          checks: [{ type: 'yChanged', dir: '+' }] },
        { label: 'Sprite eventually hits the bottom and game stops',
          allowStop: true, waitMs: 4000,
          checks: [{ type: 'stoppedOrBelow', value: -100 }] }
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
    // PyScratch event handler snippets
    {t:'game_start',              ins:'def game_start():\n    ',                          detail:'Runs when green flag clicked',      kind:'sn'},
    {t:'when_clicked',            ins:'def when_clicked():\n    ',                        detail:'Runs when this sprite is clicked',  kind:'sn'},
    {t:'when_key_pressed',        ins:'def when_key_pressed(key):\n    ',                 detail:'Runs when a key is pressed',        kind:'sn'},
    {t:'when_message_received',   ins:'def when_message_received(message):\n    ',        detail:'Runs when a broadcast is received', kind:'sn'},
    {t:'when_backdrop_switches_to', ins:'def when_backdrop_switches_to(backdrop):\n    ', detail:'Runs when backdrop changes',        kind:'sn'},
    {t:'when_I_start_as_a_clone', ins:'def when_I_start_as_a_clone():\n    ',            detail:'Runs when a clone is created',      kind:'sn'},
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
    {t:'say_for_secs',          ins:'say_for_secs("", 2)',                          detail:'Speech bubble for N seconds',    kind:'fn', back:4},
    {t:'think',                 ins:'think("")',                                    detail:'Show thought bubble',            kind:'fn', back:2},
    {t:'think_for_secs',        ins:'think_for_secs("", 2)',                        detail:'Thought bubble for N seconds',   kind:'fn', back:4},
    {t:'show',                  ins:'show()',                                       detail:'Make sprite visible',            kind:'fn'},
    {t:'hide',                  ins:'hide()',                                       detail:'Hide the sprite',                kind:'fn'},
    {t:'set_size',              ins:'set_size()',                                   detail:'Set sprite size %',              kind:'fn', back:1},
    {t:'change_size',           ins:'change_size()',                                detail:'Change sprite size %',           kind:'fn', back:1},
    {t:'set_effect',            ins:'set_effect("color", 0)',                       detail:'Set a visual effect value',      kind:'fn', back:4},
    {t:'change_effect',         ins:'change_effect("color", 25)',                   detail:'Change a visual effect value',   kind:'fn', back:6},
    {t:'clear_effects',         ins:'clear_effects()',                              detail:'Remove all visual effects',      kind:'fn'},
    {t:'costume_name',          ins:'costume_name()',                               detail:'Name of current costume',        kind:'fn'},
    {t:'costume_number',        ins:'costume_number()',                             detail:'Number of current costume',      kind:'fn'},
    // Backdrop
    {t:'set_backdrop',          ins:'set_backdrop("")',                             detail:'Switch to a backdrop by name',   kind:'fn', back:2},
    {t:'next_backdrop',         ins:'next_backdrop()',                              detail:'Switch to next backdrop',        kind:'fn'},
    {t:'backdrop_name',         ins:'backdrop_name()',                              detail:'Name of current backdrop',       kind:'fn'},
    {t:'backdrop_number',       ins:'backdrop_number()',                            detail:'Number of current backdrop',     kind:'fn'},
    // Sound
    {t:'play_sound',            ins:'play_sound("")',                               detail:'Start playing a sound',          kind:'fn', back:2},
    {t:'play_sound_until_done', ins:'play_sound_until_done("")',                    detail:'Play sound and wait',            kind:'fn', back:2},
    {t:'stop_all_sounds',       ins:'stop_all_sounds()',                            detail:'Stop all playing sounds',        kind:'fn'},
    {t:'set_volume',            ins:'set_volume(100)',                              detail:'Set volume 0-100',               kind:'fn', back:3},
    // Sensing
    {t:'ask',                   ins:'ask("")',                                      detail:'Ask player a question',          kind:'fn', back:2},
    {t:'answer',                ins:'answer()',                                     detail:'Last answer from ask()',          kind:'fn'},
    {t:'distance_to',           ins:'distance_to("")',                              detail:'Distance to sprite or mouse',    kind:'fn', back:2},
    // Clones & misc
    {t:'wait',                  ins:'wait()',                                       detail:'Pause this thread N seconds',    kind:'fn', back:1},
    {t:'pick_random',           ins:'pick_random(1, 10)',                           detail:'Random integer in range',        kind:'fn', back:5},
    {t:'create_clone',          ins:'create_clone()',                               detail:'Spawn a copy of this sprite',   kind:'fn'},
    {t:'delete_clone',          ins:'delete_clone()',                               detail:'Remove this clone',             kind:'fn'},
    {t:'is_clone',              ins:'is_clone()',                                   detail:'True if this is a clone',        kind:'fn'},
    {t:'touching',              ins:'touching("")',                                 detail:'True when touching target',      kind:'fn', back:2},
    {t:'touching_colour',       ins:'touching_colour("")',                          detail:'True when touching a colour',    kind:'fn', back:2},
    {t:'touching_color',        ins:'touching_color("")',                           detail:'True when touching a colour',    kind:'fn', back:2},
    {t:'on_edge',               ins:'on_edge()',                                    detail:'True when touching edge',        kind:'fn'},
    {t:'timer',                 ins:'timer()',                                      detail:'Seconds since last reset',       kind:'fn'},
    {t:'reset_timer',           ins:'reset_timer()',                                detail:'Reset the timer to 0',          kind:'fn'},
    // Scratch variables & events
    {t:'set_variable',          ins:'set_variable("", 0)',                          detail:'Set a Scratch variable value',   kind:'fn', back:4},
    {t:'get_variable',          ins:'get_variable("")',                             detail:'Get a Scratch variable value',   kind:'fn', back:2},
    {t:'change_variable',       ins:'change_variable("", 1)',                       detail:'Add to a Scratch variable',      kind:'fn', back:4},
    {t:'display_variable',      ins:'display_variable("", True)',                   detail:'Show/hide variable on stage',    kind:'fn', back:6},
    {t:'broadcast',             ins:'broadcast("")',                                detail:'Send a message to all handlers', kind:'fn', back:2},
    {t:'broadcast_and_wait',    ins:'broadcast_and_wait("")',                       detail:'Send message and wait for all',  kind:'fn', back:2},
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
    deadClones:       new Set(), // target IDs deleted mid-run; all their coroutines stop
    activeSprite:     null,
    activeSpriteId:   null, // target.id of the active sprite (stable across renames)
    activeThreadIdx:  0,
    themeSignature:   '',
    activeTut:        null,  // { tutIdx, stepIdx } when a tutorial bar is running
    trackedPyVars:    {},    // varName → { capturedGlobals, scratchVarId, visible }
    trackedVarTick:   null   // setInterval id for Python-variable→monitor polling
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
      code: 'def game_start():\n    pass  # Delete this line before writing code\n' }];
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
      // _psc captures __ps_sprite__ and __ps_tgen__ as DEFAULT ARGUMENTS so their
      // values are baked in at definition time (when this module first runs).
      // This prevents any shared-globals interference when the handler is later
      // invoked from callHandlerFn — each thread's _psc always uses its own sprite.
      'def _psc(f,a0=None,a1=None,a2=None,_sp=__ps_sprite__,_tg=__ps_tgen__): return __ps_call(f,_sp,_tg,a0,a1,a2)',
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
      // Scratch variables — sync Python values with the on-screen Scratch display
      'def set_variable(n,v): return _psc("set_variable",n,v)',
      'def get_variable(n): return _psc("get_variable",n)',
      'def change_variable(n,v): return _psc("change_variable",n,v)',
      'def display_variable(n,visible=True): return _psc("display_variable",n,visible)',
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
      'def touching_colour(c): return _psc("touching_colour",c)',
      'def touching_color(c): return _psc("touching_color",c)',
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
      // wait also captures __ps_tgen__ at definition time for the same reason.
      'def wait(s=0,_tg=__ps_tgen__): __ps_wait(s,_tg)',
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
      var g      = Sk.ffi.remapToJs(tgen);
      var spName = Sk.ffi.remapToJs(sp);
      if (!S.running || S.gen !== g || S.deadClones.has(spName)) {
        throw new Error('__pyscratch_stopped__');
      }
      return skVal(callAPI(
        Sk.ffi.remapToJs(fn),
        spName,
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

  // ── Python-variable → monitor polling ────────────────────────
  // When display_variable("score", True) is called from Python, we capture
  // Sk.globals (the current thread's module $d object) and register the
  // variable name in S.trackedPyVars.  A setInterval then reads
  // capturedGlobals["score"] every 50 ms and pushes the value to TurboWarp's
  // _monitorState so the on-screen counter stays in sync with the plain Python
  // variable — no set_variable() / get_variable() needed by the student.
  function startTrackedVarPoll() {
    if (S.trackedVarTick) return;
    S.trackedVarTick = setInterval(function () {
      var rt = S.vm && S.vm.runtime;
      if (!rt) return;
      var ms = rt._monitorState;
      Object.keys(S.trackedPyVars).forEach(function (pyName) {
        var tv = S.trackedPyVars[pyName];
        if (!tv || !tv.visible || !tv.capturedGlobals) return;
        try {
          var pyObj = tv.capturedGlobals[pyName];
          if (pyObj === undefined) return;
          var jsVal = Sk.ffi.remapToJs(pyObj);
          if (jsVal === null || jsVal === undefined) jsVal = 0;
          // Keep the Scratch variable in sync for get_variable() calls.
          var sv = findVariable(pyName);
          if (sv) sv.value = jsVal;
          // Push the new value into the monitor state.
          if (ms && typeof ms.set === 'function') {
            ms.set(tv.scratchVarId, { value: jsVal });
          }
        } catch(e) {}
      });
      try { rt.requestUpdateMonitors(); } catch(e) {}
    }, 50);
  }

  function stopTrackedVarPoll() {
    if (S.trackedVarTick) {
      clearInterval(S.trackedVarTick);
      S.trackedVarTick = null;
    }
    S.trackedPyVars = {};
  }

  // ── Scratch variable bridge ───────────────────────────────────
  // Finds a scalar variable by name across all targets.
  // Stage (global) variables are checked first; sprite-local variables follow.
  // Find an existing scalar variable by name (stage-first).
  function findVariable(name) {
    var targets = S.vm && S.vm.runtime && S.vm.runtime.targets;
    if (!targets) return null;
    var nameStr = String(name);
    var stage = null, sprites = [];
    targets.forEach(function(t) { if (t.isStage) stage = t; else sprites.push(t); });
    var ordered = stage ? [stage].concat(sprites) : sprites;
    for (var i = 0; i < ordered.length; i++) {
      var vars = ordered[i].variables;
      for (var id in vars) {
        var v = vars[id];
        if (v && v.name === nameStr && (v.type === '' || v.type === undefined)) return v;
      }
    }
    return null;
  }

  // Find a variable or create it on the stage if it doesn't exist.
  // Also registers a monitor block so the on-screen counter appears automatically —
  // students don't need to touch TurboWarp's Variables panel at all.
  function findOrCreateVariable(name, initialValue) {
    var existing = findVariable(name);
    if (existing) return existing;

    var rt = S.vm && S.vm.runtime;
    if (!rt) return null;
    var stage = rt.targets && rt.targets.find(function(t) { return t.isStage; });
    if (!stage) return null;

    var nameStr = String(name);
    // Deterministic ID so repeated calls are idempotent
    var vid = 'pyscratch_v_' + nameStr.toLowerCase().replace(/\W/g, '_');
    var v = { id: vid, name: nameStr,
              value: (initialValue !== undefined && initialValue !== null) ? initialValue : 0,
              type: '', isCloud: false };
    stage.variables[vid] = v;

    // Register a monitor block in monitorBlocks so the changeBlock fallback
    // path in display_variable() can find it. Block starts with isMonitored:false
    // so that changeBlock correctly detects the false→true transition and calls
    // requestAddMonitor. The primary display path uses _monitorState.set() directly.
    try {
      var mb = rt.monitorBlocks;
      if (mb) {
        var blockDef = {
          id: vid, opcode: 'data_variable',
          inputs: {}, fields: { VARIABLE: { name: 'VARIABLE', value: nameStr, id: vid } },
          next: null, topLevel: true, parentId: null, shadow: false,
          x: 5, y: 5, isMonitored: false, visible: false
        };
        if (typeof mb.createBlock === 'function') {
          try { mb.createBlock(blockDef); } catch(e2) {}
        }
        // Defensive write in case createBlock failed or doesn't update _blocks/_scripts.
        if (mb._blocks && !mb._blocks[vid]) mb._blocks[vid] = blockDef;
        if (mb._scripts && mb._scripts.indexOf(vid) === -1) mb._scripts.push(vid);
      }
    } catch(e) {}

    return v;
  }

  // Functions that work without a sprite target.
  var NOTARGET_FNS = {
    // Stage / backdrop
    set_backdrop:1, next_backdrop:1, previous_backdrop:1,
    backdrop_name:1, backdrop_number:1,
    // Variables
    set_variable:1, get_variable:1, change_variable:1, display_variable:1,
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
        // target.isClone is a getter (!isOriginal) in TurboWarp; check both to
        // be safe across Scratch VM versions.
        if (target && (target.isClone || target.isOriginal === false)) {
          // Mark dead BEFORE disposing so every other coroutine running for this
          // clone (e.g. a when_I_start_as_a_clone movement loop that is currently
          // suspended) sees the tombstone and stops at its next __ps_call.
          S.deadClones.add(spriteName);
          try {
            if (typeof S.vm.runtime.disposeTarget === 'function') {
              S.vm.runtime.disposeTarget(target);
            } else if (typeof S.vm.runtime.removeTarget === 'function') {
              S.vm.runtime.removeTarget(target);
            }
          } catch(e) {}
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
      case 'touching_colour':
      case 'touching_color': {
        if (!target) return false;
        try {
          var colHex = String(a || '').trim().replace(/^#/, '');
          if (colHex.length === 3) colHex = colHex[0]+colHex[0]+colHex[1]+colHex[1]+colHex[2]+colHex[2];
          if (!/^[0-9a-fA-F]{6}$/.test(colHex)) return false;
          var colR = parseInt(colHex.slice(0,2), 16);
          var colG = parseInt(colHex.slice(2,4), 16);
          var colB = parseInt(colHex.slice(4,6), 16);

          var rdr = S.vm.runtime.renderer;

          // Primary: call exactly as Scratch's own sensing_touchingcolor block does.
          // Going via runtime._primitives ensures TurboWarp's internal render pass fires
          // first, which is why calling target.isTouchingColor() directly returns stale data.
          try {
            var sensFn = S.vm.runtime._primitives && S.vm.runtime._primitives['sensing_touchingcolor'];
            if (typeof sensFn === 'function') {
              var res = sensFn.call(null, {COLOR: '#' + colHex}, {target: target, runtime: S.vm.runtime});
              return !!res;
            }
          } catch(e0) {}

          // Fallback: VM RenderedTarget method
          if (typeof target.isTouchingColor === 'function') {
            try { return !!target.isTouchingColor({r:colR, g:colG, b:colB}); } catch(e1) {}
          }

          // Fallback: renderer method directly
          if (rdr && typeof rdr.isTouchingColor === 'function') {
            try { return !!rdr.isTouchingColor(target.drawableID, [colR, colG, colB]); } catch(e2) {}
          }

        } catch(e) {}
        return false;
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

      // ── Scratch variables ───────────────────────────────────────
      // set_variable(name, value) — write to an existing Scratch variable
      // get_variable(name)        — read its current value
      // change_variable(name, n)  — add n to its value
      // These operate on stage-global variables first (searched by name).
      // The monitor refreshes automatically so the on-screen display updates.
      case 'set_variable': {
        // Creates the variable + its on-screen monitor if they don't exist yet.
        var sv = findOrCreateVariable(a, b);
        if (sv) {
          sv.value = (b !== null && b !== undefined) ? b : 0;
          try { S.vm.runtime.requestUpdateMonitors(); } catch(e) {}
        }
        break;
      }
      case 'get_variable': {
        // Read-only: don't auto-create (return 0 as a safe default).
        var gv = findVariable(a);
        return gv ? Number(gv.value) : 0;
      }
      case 'change_variable': {
        // Creates the variable if it doesn't exist yet, then increments.
        var cv = findOrCreateVariable(a, 0);
        if (cv) {
          cv.value = (Number(cv.value) || 0) + (Number(b) || 0);
          try { S.vm.runtime.requestUpdateMonitors(); } catch(e) {}
        }
        break;
      }
      case 'display_variable': {
        // Creates the variable if needed, then shows or hides its on-screen monitor.
        // b is the Python bool (true/false from Skulpt); default True shows the counter.
        var dvShow = (b !== false && b !== 0 && b !== 'False');
        var dvVarName = String(a);
        var dvVar  = findOrCreateVariable(dvVarName, 0);
        if (!dvVar) break;
        var dvId   = dvVar.id;
        var dvRt   = S.vm && S.vm.runtime;
        if (!dvRt) break;

        // ── Python variable tracking ──────────────────────────────────
        // Capture Sk.globals (the calling thread's module $d object) right now,
        // while we are inside the Python execution. Python keeps this same object
        // alive and mutates its keys in place — so capturedGlobals[dvVarName] will
        // always reflect the latest value of the Python variable.
        // A 50 ms polling interval reads it and pushes updates to the monitor.
        if (dvShow) {
          S.trackedPyVars[dvVarName] = {
            capturedGlobals: Sk.globals,   // live reference to thread's module $d
            scratchVarId:    dvId,
            visible:         true
          };
          startTrackedVarPoll();
        } else {
          if (S.trackedPyVars[dvVarName]) {
            S.trackedPyVars[dvVarName].visible = false;
          }
        }

        // ── Primary path: TurboWarp _monitorState ────────────────────
        // _monitorState.set(id, JSDelta) accepts a plain JS object and marks
        // dirty=true. requestUpdateMonitors() emits _monitorState.shallowClone()
        // as the MONITORS_UPDATE event that the GUI uses to render on-screen counters.
        try {
          var dvMs = dvRt._monitorState;
          if (dvMs && typeof dvMs.set === 'function') {
            dvMs.set(dvId, {
              id: dvId, targetId: null, spriteName: null,
              opcode: 'data_variable', params: { VARIABLE: dvVarName },
              value: (dvVar.value != null ? dvVar.value : 0),
              mode: 'default', visible: dvShow,
              x: 5, y: 5, width: 0, height: 0,
              sliderMin: 0, sliderMax: 100, isDiscrete: true
            });
          }
        } catch(e) {}

        // ── Fallback: standard Scratch VM changeBlock ─────────────────
        // IMPORTANT: do NOT pre-set block.isMonitored before calling changeBlock —
        // changeBlock detects the false→true transition to call requestAddMonitor.
        try {
          var dvMb2 = dvRt.monitorBlocks;
          if (dvMb2 && typeof dvMb2.changeBlock === 'function') {
            dvMb2.changeBlock({ id: dvId, element: 'checkbox', value: dvShow });
          }
        } catch(e) {}

        try { dvRt.requestUpdateMonitors(); } catch(e) {}
        break;
      }

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

  // ── Display-variable global hoisting ─────────────────────────
  // Syntactic sugar: when a student writes display_variable("score", True)
  // anywhere in their code, any function in the same thread that assigns to
  // `score` automatically gets a `global score` declaration injected at the
  // top of its body.  This means students can write:
  //
  //   def game_start():
  //       display_variable("score", True)
  //       score = 0
  //       while True:
  //           score += 1
  //           wait(1)
  //
  // without ever needing to know about Python's global/local distinction.
  // The transform happens before Skulpt compiles the code, so from the VM's
  // perspective the code was always written correctly.
  function injectDisplayVarGlobals(code) {
    // Collect all variable names passed to display_variable("name", ...).
    var tracked = {};
    var dvRe = /display_variable\s*\(\s*["'](\w+)["']/g;
    var m;
    while ((m = dvRe.exec(code)) !== null) tracked[m[1]] = true;
    if (!Object.keys(tracked).length) return code;

    var lines = code.split('\n');
    var out   = [];
    var i     = 0;
    while (i < lines.length) {
      var line = lines[i];
      var defM = line.match(/^(\s*)def\s+\w+\s*\([^)]*\)\s*:/);
      if (!defM) { out.push(line); i++; continue; }

      var defIndent = defM[1];
      out.push(line); i++;

      // Collect all lines that belong to this function body.
      var body = [];
      while (i < lines.length) {
        var bl = lines[i];
        var pastEnd = bl.trim() !== '' && !bl.startsWith(defIndent + ' ') && !bl.startsWith(defIndent + '\t');
        if (pastEnd) break;
        body.push(bl); i++;
      }

      // Determine the body indent level from the first non-blank line.
      var bIndent = defIndent + '    ';
      for (var j = 0; j < body.length; j++) {
        if (body[j].trim()) {
          var bm = body[j].match(/^(\s+)/);
          if (bm) bIndent = bm[1];
          break;
        }
      }

      // Find which tracked vars are assigned in this function but lack a
      // `global` declaration (augmented assignment counts: +=, -=, etc.)
      var bodyStr   = body.join('\n');
      var toGlobal  = [];
      Object.keys(tracked).forEach(function (v) {
        var alreadyGlobal = new RegExp('(?:^|\\n)[ \\t]*global\\b[^\\n]*\\b' + v + '\\b').test(bodyStr);
        if (alreadyGlobal) return;
        var isAssigned = new RegExp('(?:^|\\n)[ \\t]+' + v + '\\s*(?:[+\\-*/%&|^]|\\*\\*|\\/\\/)?=(?!=)').test(bodyStr);
        if (isAssigned) toGlobal.push(v);
      });

      // Inject `global v1, v2` before the first non-blank, non-comment body line.
      if (toGlobal.length) {
        var ins = 0;
        for (var j = 0; j < body.length; j++) {
          if (body[j].trim() && body[j].trim()[0] !== '#') { ins = j; break; }
          ins = j + 1;
        }
        body.splice(ins, 0, bIndent + 'global ' + toGlobal.join(', '));
      }

      out = out.concat(body);
    }
    return out.join('\n');
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

    var userCode = injectFrameYields(injectDisplayVarGlobals(thread.code));
    var fullCode = prologue + userCode + postlude;

    var label = '<ps:' + spriteName + ':' + thread.name + (isClone ? ':clone' : '') + '>';
    return Sk.misceval.asyncToPromise(function () {
      return Sk.importMainWithBody(label, false, fullCode, true);
    }).catch(function (err) {
      if (!err) return;
      var msg = (err.args && err.args.v && err.args.v[0] && err.args.v[0].v)
             || (err.nativeError && (err.nativeError.message || err.nativeError.toString()))
             || err.toString();
      if (msg.indexOf('__pyscratch_stopped__') !== -1) return;
      logError(spriteName + ' / ' + thread.name + ': ' + msg);
    });
  }

  // Launch all Python threads for a newly created clone.
  // Uses the original sprite's stored code but:
  //   • __ps_sprite__ = clone's target ID (so API calls move THIS clone)
  //   • entry point = when_I_start_as_a_clone() instead of game_start()
  //
  // IMPORTANT: deferred to the next JS event-loop tick via setTimeout(0).
  // runCloneThreads is called synchronously from inside callAPI, which itself
  // runs inside an active Skulpt coroutine (__ps_call).  If we called
  // Sk.importMainWithBody here synchronously it would clobber Skulpt's shared
  // module globals (Sk.globals, Sk.breadcrumbs, the module namespace) while the
  // parent thread's __ps_call frame is still live on the call stack.  When
  // callAPI returned the parent coroutine would resume into a corrupted Skulpt
  // state, producing the "no module named …" / "file not found" errors.
  // Deferring one tick lets the parent's suspension save its state cleanly first.
  function runCloneThreads(cloneTarget, originalSpriteName, threadGen) {
    var cloneId   = cloneTarget.id;
    var savedGen  = threadGen;
    setTimeout(function () {
      // Abort if the run was stopped or restarted while we were waiting.
      if (!S.running || S.gen !== savedGen) return;
      loadThreads(originalSpriteName).forEach(function (thread) {
        runThread(cloneId, thread, savedGen, true /* isClone */);
      });
    }, 0);
  }

  function startAll() {
    if (!S.vm) return;
    // Always stop first — this increments S.gen, poisoning any sleeping old threads.
    // They will see gen !== myGen on their next wake and throw __pyscratch_stopped__.
    stopAll();
    S.running    = true;
    S.timerStart = Date.now();   // timer() counts from green-flag press
    clearConsole();
    // Snapshot on every run so the Snapshots panel accumulates history naturally.
    // The "skip if unchanged" check inside takeSnapshot prevents duplicates.
    if (S.activeSprite && !S.activeTut) takeSnapshot(S.activeSprite, 'Run', 'auto');

    // Configure Skulpt ONCE per run, before any threads start.
    // IMPORTANT: Sk.configure resets Sk.sysmodules (the module cache).
    // Calling it inside runThread (once per thread/clone) would clear the cache
    // mid-execution for already-running coroutines, causing "no module found"
    // errors.  A single call here is safe because all threads share the same
    // read/output functions for the entire run.
    Sk.configure({
      output: function (text) { log(text); },
      read: function (x) {
        if (Sk.builtinFiles && Sk.builtinFiles.files[x]) return Sk.builtinFiles.files[x];
        throw new Error("File not found: '" + x + "'");
      },
      execLimit: undefined,
      yieldLimit: 1000
    });

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
    S.running    = false;
    S.gen++;              // sleeping threads see gen mismatch → throw __pyscratch_stopped__
    S.handlers   = {};    // discard all event registrations — threads re-register on startAll()
    S.deadClones = new Set(); // clear per-clone tombstones for a fresh run
    stopTrackedVarPoll(); // cancel Python-variable→monitor polling
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
            var extractedSnaps = {};
            var found = false;
            proj.targets.forEach(function (t) {
              if (t.pyscratch) {
                extracted[t.name] = t.pyscratch;
                delete t.pyscratch;   // strip before TurboWarp's parser sees it
                found = true;
              }
              if (t.pyscratchSnaps) {
                extractedSnaps[t.name] = t.pyscratchSnaps;
                delete t.pyscratchSnaps; // strip before TurboWarp's parser sees it
              }
            });

            // Re-pack project.json to strip pyscratch fields.
            // Always re-pack if we extracted anything (code or snapshots), so
            // TurboWarp's parser never sees the unknown fields.
            var hasSnaps = Object.keys(extractedSnaps).length > 0;
            if (!found && !hasSnaps) return { buffer: buf, pyCode: null, snapshots: {} };

            zip.file('project.json', JSON.stringify(proj));
            return zip.generateAsync({ type: 'arraybuffer' }).then(function (clean) {
              return { buffer: clean, pyCode: found ? extracted : null, snapshots: extractedSnaps };
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

      // Panel tabs (Threads / Snapshots) at top of #ps-threads column
      '#ps-panel-tabs{display:flex;flex-shrink:0;border-bottom:1px solid var(--ps-border,#312d4b)}',
      '.ps-ptab{flex:1;text-align:center;padding:5px 2px;font-size:10px;font-weight:600;cursor:pointer;color:var(--ps-muted,#6666aa);border-bottom:2px solid transparent;margin-bottom:-1px;letter-spacing:.04em;user-select:none;transition:color .1s}',
      '.ps-ptab.ps-ptab-active{color:var(--ps-accent-bright,#a87fff);border-bottom-color:var(--ps-accent-bright,#a87fff)}',
      '.ps-ptab:hover:not(.ps-ptab-active){color:var(--ps-text,#cdd6f4)}',

      // Snapshot list panel
      '#ps-snap-list{flex:1;overflow-y:auto;padding:5px;display:none}',
      '.ps-snap-empty{font-size:10px;color:var(--ps-muted,#6a6a8a);padding:14px 6px;line-height:1.6;text-align:center}',
      '.ps-snap-item{padding:6px 7px;border-radius:5px;background:var(--ps-panel-3,#252538);border:1px solid transparent;margin-bottom:4px}',
      '.ps-snap-item:hover{border-color:var(--ps-border-strong,#45456a)}',
      '.ps-snap-label{font-weight:700;font-size:10px;color:var(--ps-text,#cdd6f4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.ps-snap-time{color:var(--ps-muted,#888);font-size:9px;margin:2px 0 5px}',
      '.ps-snap-restore{background:var(--ps-panel,#1e1e2e);border:1px solid var(--ps-border-strong,#45456a);color:var(--ps-muted,#cdd6f4);cursor:pointer;padding:2px 7px;border-radius:3px;font-size:9px;font-family:inherit;width:100%;transition:background .1s}',
      '.ps-snap-restore:hover{background:var(--ps-accent,#7c5fcf);border-color:var(--ps-accent,#7c5fcf);color:#fff}',

      // Challenge cards inside the tutorial modal
      '.ps-tcard-chal .ps-tcard-top{align-items:baseline}',
      '.ps-tchal-stars{margin-left:auto;font-size:11px;color:var(--ps-accent-bright,#a87fff);flex-shrink:0;letter-spacing:1px}',
      '.ps-tchal-hints{margin:0 0 8px;font-size:11px;color:var(--ps-muted,#9090b0)}',
      '.ps-tchal-hints summary{cursor:pointer;user-select:none;padding:1px 0}',
      '.ps-tchal-hints summary:hover{color:var(--ps-text,#cdd6f4)}',
      '.ps-tchal-hints ol{margin:6px 0 0;padding-left:18px;line-height:1.7;color:var(--ps-muted,#8888aa)}',
      '.ps-tchal-results{margin-top:8px}',
      // Challenge test result rows (used by runChallenge — shared between modal and any future panel)
      '.ps-chal-result-row{display:flex;align-items:flex-start;gap:5px;font-size:11px;padding:2px 0;line-height:1.4}',
      '.ps-cr-icon{flex-shrink:0;width:14px;text-align:center;margin-top:1px}',
      '.ps-cr-label{color:var(--ps-muted,#9ca3af);flex:1}',
      '.ps-cr-label.cr-pass{color:var(--ps-success,#a6e3a1)}',
      '.ps-cr-label.cr-fail{color:var(--ps-error,#f38ba8)}',
      '.ps-chal-overall{font-size:11px;font-weight:700;margin-top:6px;padding:4px 8px;border-radius:4px;text-align:center}',
      '.ps-chal-overall.co-pass{background:rgba(166,227,161,.15);color:var(--ps-success,#a6e3a1)}',
      '.ps-chal-overall.co-fail{background:rgba(243,139,168,.1);color:var(--ps-error,#f38ba8)}',

      // Editor + console
      '#ps-editor-wrap{flex:1;display:flex;flex-direction:column;overflow:hidden;position:relative}',
      '#ps-editor{flex:1;background:var(--ps-panel,#1e1e2e);color:var(--ps-text,#cdd6f4);border:none;outline:none;resize:none;font-family:"Roboto Mono","Consolas","Courier New",monospace;font-size:13px;line-height:1.65;padding:12px;tab-size:4;overflow-y:auto;min-height:0}',
      '#ps-editor::selection{background:var(--ps-selection,#3b3b5a)}',
      '#ps-console{height:72px;background:var(--ps-console,#13131f);color:var(--ps-success,#a6e3a1);font-family:"Roboto Mono","Consolas",monospace;font-size:11px;padding:5px 10px;overflow-y:auto;border-top:1px solid var(--ps-border,#312d4b);flex-shrink:0;line-height:1.5}',
      '.ps-con-err{color:var(--ps-error,#f38ba8)}',

      // Colour picker badge (appears when cursor is inside touching_colour(...))
      '#ps-colour-pick{position:fixed;display:none;align-items:center;gap:6px;background:#2a2a3e;border:1px solid #555;border-radius:6px;padding:4px 9px;z-index:10001;box-shadow:0 2px 10px rgba(0,0,0,.55);cursor:pointer;font-size:11px;color:#cdd6f4;user-select:none;white-space:nowrap}',
      '#ps-colour-pick:hover{background:#333355;border-color:#7878aa}',
      '#ps-cp-swatch{width:16px;height:16px;border-radius:3px;border:1.5px solid rgba(255,255,255,.3);flex-shrink:0;display:inline-block}',
      '#ps-cp-input{position:absolute;opacity:0;pointer-events:none;width:1px;height:1px}',

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
      '.ps-tcard-foot{display:flex;gap:6px;align-items:center}',
      '.ps-tcard-start{flex:1;background:var(--ps-accent,#7c5fcf);border:none;color:#fff;cursor:pointer;padding:6px 0;border-radius:5px;font-size:12px;font-weight:600;font-family:inherit;transition:opacity .1s}',
      '.ps-tcard-start:hover{opacity:.85}',
      '.ps-tcard-reset{background:none;border:1px solid var(--ps-border-strong,#45456a);color:var(--ps-muted,#9090b0);cursor:pointer;padding:5px 8px;border-radius:5px;font-size:12px;font-family:inherit;flex-shrink:0;transition:color .1s,border-color .1s}',
      '.ps-tcard-reset:hover{color:#ef4444;border-color:#ef4444}',
      // Tutorial tab bar
      '.ps-ttabs{display:flex;border-bottom:1px solid var(--ps-border-strong,#3f3f5a);padding:0 16px;flex-shrink:0}',
      '.ps-ttab{padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;color:var(--ps-muted,#9090b0);user-select:none;margin-bottom:-1px;transition:color .1s}',
      '.ps-ttab.ps-ttab-active{color:var(--ps-accent-bright,#a87fff);border-bottom-color:var(--ps-accent-bright,#a87fff)}',
      '.ps-ttab:hover:not(.ps-ttab-active){color:var(--ps-text,#cdd6f4)}',

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
      // Color legend below the code block
      '.ps-tb-code-leg{display:flex;gap:10px;padding:4px 8px 2px;flex-shrink:0;flex-wrap:wrap}',
      '.ps-tb-leg-item{display:flex;align-items:center;gap:4px;font-size:9px;color:var(--ps-muted,#6a6a8a);white-space:nowrap}',
      '.ps-tb-leg-dot{width:8px;height:8px;border-radius:2px;flex-shrink:0}',
      '.ps-tb-leg-dot.ld-old{background:#374151;border:1px solid #4b5563}',
      '.ps-tb-leg-dot.ld-new{background:#fbbf24}',
      '.ps-tb-leg-dot.ld-done{background:#4ade80}',
      // Warning shown when grey lines have been deleted
      '.ps-tb-miss{margin:2px 8px 0;padding:4px 8px;background:#2a1a1a;border:1px solid #7f1d1d;border-radius:4px;font-size:10px;color:#fca5a5;display:flex;align-items:center;gap:6px;flex-shrink:0}',
      '.ps-tb-miss.ps-tb-miss-hidden{display:none}',
      // Indentation structure error — shown when code has Python IndentationError-type problems
      '.ps-tb-ierr{margin:2px 8px 0;padding:4px 8px;background:#1a0d0d;border:1px solid #7f1d1d;border-radius:4px;font-size:10px;color:#fca5a5;flex-shrink:0}',
      '.ps-tb-ierr.ps-tb-ierr-hidden{display:none}',
      '.ps-tb-miss-restore{margin-left:auto;background:none;border:1px solid #f87171;color:#f87171;cursor:pointer;padding:2px 7px;border-radius:3px;font-size:9px;font-family:inherit;flex-shrink:0}',
      '.ps-tb-miss-restore:hover{background:#7f1d1d}',
      // Prevent selecting or copying the reference code — students must type it themselves
      '.ps-tb-code-block{user-select:none;-webkit-user-select:none;-moz-user-select:none}',
      // Expand button — pops code out into a draggable floating window
      '.ps-tb-expand-btn{position:absolute;top:3px;right:3px;background:#161b22;border:1px solid #30363d;border-radius:3px;color:#6e7681;cursor:pointer;font-size:10px;padding:1px 5px;line-height:1.4;z-index:1;font-family:"Segoe UI",sans-serif}',
      '.ps-tb-expand-btn:hover{color:#e2e8f0;border-color:#7c5fcf}',
      // Draggable code pop-out modal
      '#ps-code-modal{position:fixed;top:100px;left:50%;transform:translateX(-50%);width:520px;max-width:90vw;background:#0d1117;border:1px solid #30363d;border-radius:6px;z-index:30001;box-shadow:0 8px 32px rgba(0,0,0,.75);display:none;flex-direction:column;max-height:80vh;min-height:80px}',
      '#ps-code-modal.ps-cm-open{display:flex}',
      '#ps-cm-head{display:flex;align-items:center;gap:7px;padding:6px 10px;background:#161b22;border-bottom:1px solid #30363d;border-radius:6px 6px 0 0;cursor:grab;user-select:none;flex-shrink:0}',
      '#ps-cm-head:active{cursor:grabbing}',
      '#ps-cm-icon{font-size:13px}',
      '#ps-cm-title{flex:1;font-size:11px;font-weight:600;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:"Segoe UI",sans-serif}',
      '#ps-cm-close{background:none;border:none;color:#6e7681;cursor:pointer;font-size:15px;padding:0 2px;line-height:1;flex-shrink:0}',
      '#ps-cm-close:hover{color:#fff}',
      '#ps-cm-body{overflow:auto;padding:8px 10px;flex:1}',
      '#ps-cm-code{font-family:"Roboto Mono","Consolas","Courier New",monospace;font-size:11px;line-height:1.65;white-space:pre;user-select:none;-webkit-user-select:none}',
      '#ps-cm-leg{display:flex;gap:10px;padding:5px 10px;border-top:1px solid #30363d;flex-wrap:wrap;flex-shrink:0}',
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
      '.ps-tb-valid.tb-err{color:#f87171}',
      '.ps-tb-valid.tb-testing{color:#fbbf24;font-style:italic}',
      '.ps-tb-btn{background:var(--ps-panel-3,#252537);border:1px solid var(--ps-border-strong,#45456a);color:var(--ps-text,#cdd6f4);cursor:pointer;padding:3px 10px;border-radius:4px;font-size:10px;font-family:inherit;flex-shrink:0}',
      '.ps-tb-btn:hover:not(:disabled){background:var(--ps-accent,#7c5fcf);border-color:var(--ps-accent,#7c5fcf);color:#fff}',
      '.ps-tb-btn:disabled{opacity:.3;cursor:not-allowed}',
      '.ps-tb-btn.tb-primary{background:var(--ps-accent,#7c5fcf);border-color:var(--ps-accent,#7c5fcf);color:#fff}',
      '.ps-tb-btn.tb-primary:hover:not(:disabled){opacity:.85}',

      // Tutorial dialog (resume / keep-or-restore popups)
      '#ps-tut-dialog{position:fixed;inset:0;z-index:10010;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55)}',
      '#ps-tut-dialog.ps-td-hidden{display:none}',
      '.ps-td-box{background:#1e1e2e;border:1px solid var(--ps-border-strong,#3f3f5a);border-radius:10px;padding:20px 22px 16px;max-width:360px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.6);font-size:13px;color:var(--ps-text,#cdd6f4);text-align:center}',
      '.ps-td-icon{font-size:32px;margin-bottom:8px}',
      '.ps-td-title{font-size:15px;font-weight:700;color:var(--ps-text-strong,#fff);margin-bottom:6px}',
      '.ps-td-body{font-size:12px;color:var(--ps-muted,#9090b0);line-height:1.5;margin-bottom:16px}',
      '.ps-td-btns{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}',
      '.ps-td-btn{padding:7px 16px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid;font-family:inherit;transition:opacity .1s}',
      '.ps-td-btn.td-primary{background:var(--ps-accent,#7c5fcf);border-color:var(--ps-accent,#7c5fcf);color:#fff}',
      '.ps-td-btn.td-primary:hover{opacity:.85}',
      '.ps-td-btn.td-secondary{background:transparent;border-color:var(--ps-border-strong,#45456a);color:var(--ps-text,#cdd6f4)}',
      '.ps-td-btn.td-secondary:hover{border-color:var(--ps-muted,#888);color:#fff}',
      '.ps-td-btn.td-danger{background:transparent;border-color:#ef4444;color:#ef4444}',
      '.ps-td-btn.td-danger:hover{background:#ef4444;color:#fff}',

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
      '.ps-ics-detail{color:#4b5563;font-size:10px;font-family:"Segoe UI",sans-serif;white-space:nowrap;overflow:hidden;max-width:140px;text-overflow:ellipsis}',

      // Indentation error gutter — thin coloured strip on the left edge of the editor
      '#ps-indent-gutter{position:absolute;left:0;top:0;bottom:0;width:7px;pointer-events:none;z-index:6;overflow:hidden}',
      '.ps-ig-mark{position:absolute;left:1px;width:5px;border-radius:2px;animation:ps-ig-pulse 1.3s ease-in-out infinite}',
      '.ps-ig-mark.ig-tab{background:#f59e0b}',
      '.ps-ig-mark.ig-bad{background:#ef4444}',
      '@keyframes ps-ig-pulse{0%,100%{opacity:1}50%{opacity:.15}}',
      // Indentation error tooltip — fixed to screen, appears near the bad line
      '#ps-indent-tip{position:fixed;z-index:40000;background:#1c0a0a;border:1px solid #7f1d1d;border-radius:5px;padding:6px 10px 5px;font-size:10px;font-family:"Segoe UI",sans-serif;color:#fca5a5;line-height:1.5;max-width:320px;pointer-events:none;display:none;box-shadow:0 4px 16px rgba(0,0,0,.6)}',
      '#ps-indent-tip.ps-it-show{display:block}',
      '#ps-indent-tip strong{color:#fbbf24;font-family:"Roboto Mono","Consolas",monospace}',
      '#ps-indent-tip .ps-it-fix{font-size:9px;color:#9ca3af;margin-top:2px}'
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
              '<div id="ps-panel-tabs">',
                '<div class="ps-ptab ps-ptab-active" data-panel="threads">Threads</div>',
                '<div class="ps-ptab" data-panel="snapshots">Snapshots</div>',
              '</div>',
              '<div id="ps-thread-head">',
                '<span>Threads</span>',
                '<button id="ps-add-thread" title="Add thread">+</button>',
              '</div>',
              '<div id="ps-thread-list"></div>',
              '<div id="ps-snap-list"></div>',
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
                  '<button class="ps-tb-expand-btn" title="Pop out code view">⤢</button>',
                  '<div class="ps-tb-code-block"></div>',
                  '<div class="ps-tb-code-leg">',
                    '<span class="ps-tb-leg-item"><span class="ps-tb-leg-dot ld-old"></span>Already in your editor — keep it</span>',
                    '<span class="ps-tb-leg-item"><span class="ps-tb-leg-dot ld-new"></span>Type this</span>',
                    '<span class="ps-tb-leg-item"><span class="ps-tb-leg-dot ld-done"></span>Done ✓</span>',
                  '</div>',
                  '<div class="ps-tb-miss ps-tb-miss-hidden">',
                    '⚠️ Some grey lines have been deleted',
                    '<button class="ps-tb-miss-restore">↺ Restore</button>',
                  '</div>',
                '</div>',
                '<div class="ps-tb-indent-tip ps-tb-tip-hidden">',
                  '↹ Press <strong>Tab</strong> to indent (on some keyboards the key shows two arrows ↹ instead of "Tab") · 4 spaces per indent level',
                '</div>',
                '<div class="ps-tb-checks ps-tb-no-checks"></div>',
                '<div class="ps-tb-ierr ps-tb-ierr-hidden"></div>',
                '<div class="ps-tb-foot">',
                  '<span class="ps-tb-valid"></span>',
                  '<button class="ps-tb-btn" data-tb="prev">← Back</button>',
                  '<button class="ps-tb-btn tb-primary" data-tb="next">Next →</button>',
                '</div>',
              '</div>',
              '<div id="ps-indent-gutter"></div>',
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

    // Floating code pop-out modal (opened via ⤢ button in tutorial bar)
    var cmEl = document.createElement('div');
    cmEl.id = 'ps-code-modal';
    cmEl.innerHTML = [
      '<div id="ps-cm-head">',
        '<span id="ps-cm-icon">📋</span>',
        '<span id="ps-cm-title">Code reference</span>',
        '<button id="ps-cm-close" title="Close">✕</button>',
      '</div>',
      '<div id="ps-cm-body"><div id="ps-cm-code"></div></div>',
      '<div id="ps-cm-leg">',
        '<span class="ps-tb-leg-item"><span class="ps-tb-leg-dot ld-old"></span>Keep it</span>',
        '<span class="ps-tb-leg-item"><span class="ps-tb-leg-dot ld-new"></span>Type this</span>',
        '<span class="ps-tb-leg-item"><span class="ps-tb-leg-dot ld-done"></span>Done ✓</span>',
      '</div>',
    ].join('');
    document.body.appendChild(cmEl);
    (function () {
      var modal    = cmEl;
      var head     = document.getElementById('ps-cm-head');
      var dragging = false, ox = 0, oy = 0, sx = 0, sy = 0;
      head.addEventListener('mousedown', function (e) {
        if (e.target.id === 'ps-cm-close') return;
        dragging = true;
        var r = modal.getBoundingClientRect();
        ox = r.left; oy = r.top;
        sx = e.clientX; sy = e.clientY;
        // Lock position so transform no longer affects it
        modal.style.transform = 'none';
        modal.style.left = ox + 'px';
        modal.style.top  = oy + 'px';
        e.preventDefault();
      });
      document.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        modal.style.left = (ox + e.clientX - sx) + 'px';
        modal.style.top  = (oy + e.clientY - sy) + 'px';
      });
      document.addEventListener('mouseup', function () { dragging = false; });
      document.getElementById('ps-cm-close').addEventListener('click', function () {
        modal.classList.remove('ps-cm-open');
      });
      document.querySelector('.ps-tb-expand-btn').addEventListener('click', function () {
        modal.classList.toggle('ps-cm-open');
      });
    })();

    // Panel tab switching (Threads ↔ Snapshots)
    document.querySelectorAll('.ps-ptab').forEach(function (tab) {
      tab.addEventListener('click', function () { switchPanelTab(tab.dataset.panel); });
    });

    // Auto-snapshot timer — every 3 minutes, skip during tutorials
    startSnapshotTimer();

    // Tutorial dialog (resume / keep-or-restore)
    var tdEl = document.createElement('div');
    tdEl.id = 'ps-tut-dialog';
    tdEl.className = 'ps-td-hidden';
    tdEl.innerHTML = '<div class="ps-td-box"><div class="ps-td-icon" id="ps-td-icon"></div><div class="ps-td-title" id="ps-td-title"></div><div class="ps-td-body" id="ps-td-body"></div><div class="ps-td-btns" id="ps-td-btns"></div></div>';
    document.body.appendChild(tdEl);

    // Intellisense dropdown (shared singleton)
    var icsEl = document.createElement('div');
    icsEl.id = 'ps-icsense';
    icsEl.className = 'ps-ics-hidden';
    document.body.appendChild(icsEl);

    // Indentation error tooltip (shared singleton, position:fixed)
    var itEl = document.createElement('div');
    itEl.id = 'ps-indent-tip';
    document.body.appendChild(itEl);

    // Colour picker badge — appears when cursor is inside touching_colour(...)
    var cpEl = document.createElement('div');
    cpEl.id = 'ps-colour-pick';
    cpEl.innerHTML = '<span id="ps-cp-swatch"></span><span>🎨 Colour</span><input type="color" id="ps-cp-input">';
    document.body.appendChild(cpEl);
    (function () {
      var cpInput  = document.getElementById('ps-cp-input');
      var cpSwatch = document.getElementById('ps-cp-swatch');

      function applyColourPickHex(hex) {
        // Normalise to 6-digit lowercase
        hex = hex.toLowerCase();
        if (/^#[0-9a-f]{3}$/.test(hex)) hex = '#' + hex[1]+hex[1]+hex[2]+hex[2]+hex[3]+hex[3];
        var ctx = getColourPickerCtx(ui.editor);
        if (!ctx) return;
        var ins = '"' + hex + '"';
        var text = ui.editor.value;
        ui.editor.value = text.slice(0, ctx.open) + ins + text.slice(ctx.close);
        ui.editor.selectionStart = ui.editor.selectionEnd = ctx.open + ins.length;
        cpSwatch.style.background = hex;
        cpInput.value = hex;
        saveCurrentCode();
        if (S.activeTut) checkTutBar();
        updateColourPicker();
      }

      cpInput.addEventListener('input', function () { applyColourPickHex(cpInput.value); });

      // Prevent editor blur; open the native colour picker
      cpEl.addEventListener('mousedown', function (e) {
        e.preventDefault();
        cpInput.click();
      });
    }());

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
      updateColourPicker();
      updateIndentGutter();
    });
    ui.editor.addEventListener('click', function () { updateColourPicker(); updateIndentGutter(); });
    ui.editor.addEventListener('keyup', function () { updateColourPicker(); updateIndentGutter(); });
    ui.editor.addEventListener('scroll', function () { updateIndentGutter(); });
    ui.editor.addEventListener('blur', function () {
      // Small delay so mousedown on a dropdown item fires first
      setTimeout(hideICSense, 150);
      // Hide colour picker — delayed so a click on the badge can fire first
      setTimeout(function () {
        var cpEl = document.getElementById('ps-colour-pick');
        if (cpEl && document.activeElement !== document.getElementById('ps-cp-input')) {
          cpEl.style.display = 'none';
        }
      }, 200);
      // Hide indent tooltip when editor loses focus
      var itEl2 = document.getElementById('ps-indent-tip');
      if (itEl2) itEl2.classList.remove('ps-it-show');
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
          if (tgt && tgt.sprite) {
            // Clones register their handler under tgt.id (the clone UUID used as
            // __ps_sprite__ in the prologue). The original sprite registers under
            // tgt.sprite.name. Dispatch to whichever key matches the clicked target
            // so clicking a clone runs the handler in that clone's Python context.
            // TurboWarp may expose clone status as either isClone or !isOriginal.
            var clickKey = (tgt.isClone || tgt.isOriginal === false) ? tgt.id : tgt.sprite.name;
            fireEventHandlers(clickKey, 'clicked', null);
          }
        }
      } catch(e) {}
    });
  }

  // ── Tutorial pick modal ───────────────────────────────────────
  // Tutorials categorised as games (the rest are Concepts)
  var _GAME_TITLES = {
    'Flappy Bird':1,'Doodle Jump':1,'Duck Hunt':1,'RPG Survivor':1,
    'Apple Catcher':1,'Whack-a-Mole':1,'Space Shooter':1,'Pong':1,'Breakout':1
  };

  function buildTutorialHTML() {
    var tutCards = TUTORIALS.map(function (t, i) {
      var cat = (_GAME_TITLES[t.title] || t.cat === 'game') ? 'game' : 'concept';
      return '<div class="ps-tcard" data-idx="' + i + '" data-cat="' + cat + '">' +
        '<div class="ps-tcard-top">' +
          '<span class="ps-tcard-emoji">' + t.emoji + '</span>' +
          '<span class="ps-tcard-title">' + t.title + '</span>' +
        '</div>' +
        '<div class="ps-tcard-desc">' + t.desc + '</div>' +
        '<div class="ps-tcard-foot">' +
          '<button class="ps-tcard-start" data-idx="' + i + '">▶ Start (' + t.steps.length + ' steps)</button>' +
          '<button class="ps-tcard-reset" data-idx="' + i + '" title="Clear saved progress" style="display:none">↺ Reset</button>' +
        '</div>' +
      '</div>';
    }).join('');

    var chalCards = CHALLENGES.map(function (ch, i) {
      var stars = '★'.repeat(ch.difficulty) + '☆'.repeat(4 - ch.difficulty);
      var hintsHTML = ch.hints.map(function (h) { return '<li>' + h + '</li>'; }).join('');
      return '<div class="ps-tcard ps-tcard-chal" data-chal-idx="' + i + '" data-cat="challenge">' +
        '<div class="ps-tcard-top">' +
          '<span class="ps-tcard-emoji">' + ch.emoji + '</span>' +
          '<span class="ps-tcard-title">' + ch.title + '</span>' +
          '<span class="ps-tchal-stars">' + stars + '</span>' +
        '</div>' +
        '<div class="ps-tcard-desc">' + ch.goal + '</div>' +
        '<details class="ps-tchal-hints"><summary>Show hints</summary><ol>' + hintsHTML + '</ol></details>' +
        '<div class="ps-tcard-foot">' +
          '<button class="ps-tcard-start ps-tchal-run" data-chal-idx="' + i + '">▶ Run Tests</button>' +
        '</div>' +
        '<div class="ps-tchal-results"></div>' +
      '</div>';
    }).join('');

    return '<div class="ps-tbox">' +
      '<div class="ps-thead"><span>📚 Tutorials</span><button title="Close">&times;</button></div>' +
      '<div class="ps-ttabs">' +
        '<div class="ps-ttab ps-ttab-active" data-cat="concept">📐 Concepts</div>' +
        '<div class="ps-ttab" data-cat="game">🎮 Games</div>' +
        '<div class="ps-ttab" data-cat="challenge">🎯 Challenges</div>' +
      '</div>' +
      '<div class="ps-tgrid">' + tutCards + chalCards + '</div>' +
    '</div>';
  }

  function initTutorialModal(tm) {
    var closeBtn = tm.querySelector('.ps-thead button');
    closeBtn.addEventListener('click', function () { tm.classList.add('hidden'); });

    document.addEventListener('keydown', function (e) {
      if (!tm.classList.contains('hidden') && e.key === 'Escape') tm.classList.add('hidden');
    });

    // Tab switching
    function switchTab(activeCat) {
      tm.querySelectorAll('.ps-ttab').forEach(function (tab) {
        tab.classList.toggle('ps-ttab-active', tab.dataset.cat === activeCat);
      });
      tm.querySelectorAll('.ps-tcard').forEach(function (card) {
        card.style.display = card.dataset.cat === activeCat ? '' : 'none';
      });
    }
    tm.querySelectorAll('.ps-ttab').forEach(function (tab) {
      tab.addEventListener('click', function () { switchTab(tab.dataset.cat); });
    });
    switchTab('concept'); // start on Concepts tab

    function refreshTutorialCards() {
      tm.querySelectorAll('.ps-tcard').forEach(function (card) {
        if (card.dataset.cat === 'challenge') return; // skip challenge cards
        var idx      = parseInt(card.dataset.idx, 10);
        var tut      = TUTORIALS[idx];
        if (!tut) return;
        var prog     = loadTutProgress(idx);
        var startBtn = card.querySelector('.ps-tcard-start');
        var resetBtn = card.querySelector('.ps-tcard-reset');
        if (prog && prog.stepIdx > 0) {
          startBtn.textContent   = '▶ Resume (step ' + (prog.stepIdx + 1) + ' of ' + tut.steps.length + ')';
          if (resetBtn) resetBtn.style.display = '';
        } else {
          startBtn.textContent   = '▶ Start (' + tut.steps.length + ' steps)';
          if (resetBtn) resetBtn.style.display = 'none';
        }
      });
    }

    tm.querySelectorAll('.ps-tcard-start:not(.ps-tchal-run)').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.dataset.idx, 10);
        tm.classList.add('hidden');
        startTutorial(idx);
      });
    });

    tm.querySelectorAll('.ps-tcard-reset').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var idx = parseInt(btn.dataset.idx, 10);
        clearTutProgress(idx);
        clearTutSnapshot(idx);
        refreshTutorialCards();
      });
    });

    // Challenge Run Tests buttons
    tm.querySelectorAll('.ps-tchal-run').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var idx       = parseInt(btn.dataset.chalIdx, 10);
        var resultsEl = btn.closest('.ps-tcard').querySelector('.ps-tchal-results');
        runChallenge(idx, btn, resultsEl);
      });
    });

    // Refresh card states whenever the modal is opened
    document.getElementById('ps-tut-btn').addEventListener('click', refreshTutorialCards);
    refreshTutorialCards(); // also run once on init
  }

  // ── Tutorial progress & snapshot persistence ─────────────────
  function _tutProgressKey(tutIdx) { return 'pyscratch:tut:' + tutIdx + ':progress'; }
  function _tutSnapshotKey(tutIdx) { return 'pyscratch:tut:' + tutIdx + ':snapshot'; }

  function saveTutProgress() {
    var at = S.activeTut;
    if (!at) return;
    try { localStorage.setItem(_tutProgressKey(at.tutIdx), JSON.stringify({ stepIdx: at.stepIdx })); } catch(e) {}
  }

  function loadTutProgress(tutIdx) {
    try {
      var raw = localStorage.getItem(_tutProgressKey(tutIdx));
      if (raw) { var p = JSON.parse(raw); if (p && p.stepIdx > 0) return p; }
    } catch(e) {}
    return null;
  }

  function clearTutProgress(tutIdx) {
    try { localStorage.removeItem(_tutProgressKey(tutIdx)); } catch(e) {}
  }

  // Save ALL sprites' current threads so we can restore them if the student wants
  function saveTutSnapshot(tutIdx) {
    try {
      saveCurrentCode(); // flush editor → S.spriteCode
      var snap = {};
      Object.keys(S.spriteCode).forEach(function (name) {
        snap[name] = JSON.parse(JSON.stringify(S.spriteCode[name]));
      });
      localStorage.setItem(_tutSnapshotKey(tutIdx), JSON.stringify(snap));
    } catch(e) {}
  }

  function loadTutSnapshot(tutIdx) {
    try {
      var raw = localStorage.getItem(_tutSnapshotKey(tutIdx));
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  }

  function clearTutSnapshot(tutIdx) {
    try { localStorage.removeItem(_tutSnapshotKey(tutIdx)); } catch(e) {}
  }

  // Restore all sprites' code from a snapshot
  function restoreTutSnapshot(tutIdx) {
    var snap = loadTutSnapshot(tutIdx);
    if (!snap) return;
    Object.keys(snap).forEach(function (name) {
      S.spriteCode[name] = snap[name];
      saveThreads(name);
    });
    // Reload editor if the active sprite is in the snapshot
    if (S.activeSprite && snap[S.activeSprite]) {
      S.activeThreadIdx = 0;
      loadCodeToEditor();
    }
  }

  // ── Tutorial dialog (resume / keep-or-restore) ────────────────
  function showTutDialog(icon, title, body, buttons) {
    // buttons: [{label, cls, cb}]
    var dlg   = document.getElementById('ps-tut-dialog');
    if (!dlg) return;
    document.getElementById('ps-td-icon').textContent  = icon;
    document.getElementById('ps-td-title').textContent = title;
    document.getElementById('ps-td-body').innerHTML    = body;
    var btnsEl = document.getElementById('ps-td-btns');
    btnsEl.innerHTML = '';
    buttons.forEach(function (b) {
      var btn = document.createElement('button');
      btn.className = 'ps-td-btn ' + (b.cls || 'td-secondary');
      btn.textContent = b.label;
      btn.addEventListener('click', function () {
        dlg.classList.add('ps-td-hidden');
        if (b.cb) b.cb();
      });
      btnsEl.appendChild(btn);
    });
    dlg.classList.remove('ps-td-hidden');
    // Click backdrop to dismiss (treat as primary action)
    dlg.onclick = function (e) {
      if (e.target === dlg) {
        dlg.classList.add('ps-td-hidden');
        if (buttons[0] && buttons[0].cb) buttons[0].cb();
      }
    };
  }

  // ── Tutorial bar (interactive in-editor walkthrough) ──────────
  function _doStartTutorial(tutIdx, stepIdx) {
    S.activeTut = { tutIdx: tutIdx, stepIdx: stepIdx };
    var hb = document.getElementById('ps-help-btn');
    var tb = document.getElementById('ps-tut-btn');
    if (hb) hb.style.display = 'none';
    if (tb) tb.style.display = 'none';
    saveTutProgress();
    applyTutBar(true);
  }

  function startTutorial(tutIdx) {
    var tut      = TUTORIALS[tutIdx];
    var saved    = loadTutProgress(tutIdx);
    var hasSnap  = !!loadTutSnapshot(tutIdx);

    if (saved && hasSnap) {
      // Student has unfinished progress — offer to resume
      showTutDialog(
        tut.emoji || '📚',
        tut.title,
        'You left off at <strong>Step ' + (saved.stepIdx + 1) + ' of ' + tut.steps.length + '</strong>. Want to pick up where you left off?',
        [
          { label: 'Resume →', cls: 'td-primary', cb: function () {
              _doStartTutorial(tutIdx, saved.stepIdx);
          }},
          { label: 'Start Fresh', cls: 'td-secondary', cb: function () {
              clearTutProgress(tutIdx);
              saveTutSnapshot(tutIdx); // overwrite snapshot with current code
              _doStartTutorial(tutIdx, 0);
          }}
        ]
      );
    } else {
      // Fresh start — save a named "before tutorial" snapshot then begin
      if (S.activeSprite) takeSnapshot(S.activeSprite, 'Before ' + tut.title, 'before-tutorial');
      saveTutSnapshot(tutIdx);
      _doStartTutorial(tutIdx, 0);
    }
  }

  // ── Context-aware code search helpers ────────────────────────
  // Extracts just the body of one named def function from a block of code.
  // Lines at the same (top-level, column 0) indentation as the def statement
  // terminate the extraction, so nested defs work correctly.
  function getCodeInContext(code, fn) {
    var re = new RegExp('^def\\s+' + fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(');
    var lines  = code.split('\n');
    var out    = [];
    var inside = false;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (!inside) {
        if (re.test(l)) { inside = true; out.push(l); }
      } else {
        // Empty lines are fine; any non-blank non-indented line ends the function.
        if (l.length && l[0] !== ' ' && l[0] !== '\t') break;
        out.push(l);
      }
    }
    return out.join('\n');
  }

  // Given a target string, returns an array (parallel to target.split('\n')) where
  // each element is the name of the def-function that line sits inside, or null.
  function buildTargetCtxArray(target) {
    var ctx = null;
    return (target || '').split('\n').map(function (line) {
      var m = line.match(/^def\s+(\w+)\s*\(/);
      if (m) ctx = m[1];
      return ctx;
    });
  }

  // For a requires string, find which function it belongs to in target.
  // Returns the function name if the string exists in exactly ONE function;
  // returns null if it appears in multiple functions (ambiguous) or nowhere.
  function reqContextInTarget(target, reqStr) {
    if (!target || !reqStr) return null;
    var lines = target.split('\n');
    var ctx = null; var found = null; var ambiguous = false;
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^def\s+(\w+)\s*\(/);
      if (m) ctx = m[1];
      if (lines[i] === reqStr) {
        if (found === null) found = ctx;
        else if (found !== ctx) { ambiguous = true; break; }
      }
    }
    return ambiguous ? null : found;
  }

  // Flexible requires matcher.
  // Leading whitespace is matched exactly (Python indentation is significant).
  // Internal spaces are made flexible so minor variations like extra spaces
  // inside parentheses or around operators don't block validation.
  // e.g. 'change_x( 5 )' and 'vx=3' both satisfy the right requires string.
  // ── Python indentation structure checker ─────────────────────
  // Lightweight stack-based parser that detects Python IndentationError-type
  // problems: unexpected indents and unmatched dedents.
  //
  // This catches the gap in tutReqMatches — requires without leading whitespace
  // (the common case) match a line at ANY indent depth.  _pyIndentCheck validates
  // the block structure independently and gates the Next button when the code
  // would fail Python's own indentation rules.
  //
  // NOT handled: backslash continuations, multi-line strings (rare in PyScratch).
  function _pyLineOpensBlock(content) {
    // Returns true when a trimmed line should be followed by a deeper-indented block.
    // Only fires for recognised block-introducing keywords — avoids false positives
    // from dict literals (key: value), ternary expressions, etc.
    if (!/^(def|class|if|elif|else|for|while|with|try|except|finally)\b/.test(content)) return false;
    // Strip inline comment (conservative — enough for single-line comments after code)
    var nc = content.replace(/#[^'"]*$/, '').trimRight();
    // Strip simple single-line string literals so a colon inside a string doesn't fire
    nc = nc.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");
    return nc.trimRight().endsWith(':');
  }

  function _pyIndentCheck(code) {
    var lines   = code.split('\n');
    var stack   = [0];      // indent-level stack; bottom is always 0
    var expectDeeper = false; // true after a block-opening colon

    for (var i = 0; i < lines.length; i++) {
      var raw     = lines[i].replace(/\t/g, '    ');   // expand tabs → 4 spaces
      var stripped = raw.trimRight();
      var content  = stripped.trim();
      if (content === '' || content.charAt(0) === '#') continue; // blank / comment

      var indent = stripped.length - content.length;

      if (expectDeeper) {
        if (indent <= stack[stack.length - 1]) {
          return {
            lineIdx: i,
            msg: 'Line ' + (i + 1) + ': expected an indented block here — ' +
                 'the line before ends with \':\' so this line needs more than ' +
                 stack[stack.length - 1] + ' leading spaces'
          };
        }
        stack.push(indent);
        expectDeeper = false;
      } else {
        var top = stack[stack.length - 1];
        if (indent > top) {
          return {
            lineIdx: i,
            msg: 'Line ' + (i + 1) + ': unexpected indent — ' + indent + ' spaces, ' +
                 'but this block uses ' + top + ' spaces'
          };
        } else if (indent < top) {
          // Dedent: pop stack until we find a matching level
          while (stack.length > 1 && stack[stack.length - 1] > indent) stack.pop();
          if (stack[stack.length - 1] !== indent) {
            return {
              lineIdx: i,
              msg: 'Line ' + (i + 1) + ': indentation of ' + indent + ' spaces doesn\'t match ' +
                   'any outer block — valid levels here are ' + stack.join(', ') + ' spaces'
            };
          }
        }
        // indent === top → same level, fine
      }

      if (_pyLineOpensBlock(content)) expectDeeper = true;
    }
    return null; // no structural indentation errors found
  }

  // ── Block-context validation helpers ─────────────────────────
  // Count leading spaces (tabs expanded to 4 spaces).
  function _lineIndent(line) {
    var exp = line.replace(/\t/g, '    ');
    var m   = exp.match(/^( *)/);
    return m ? m[1].length : 0;
  }

  // True if a single trimmed code line matches a requires pattern (flex spacing).
  function _lineMatchesReq(codeLine, reqStr) {
    var tl = codeLine.trim(), tr = reqStr.trim();
    if (!tl || !tr) return false;
    if (tl === tr) return true;
    try {
      var esc  = tr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var flex = esc.replace(/ /g, '[ \\t]*').replace(/\\\(/g, '[ \\t]*\\(');
      return new RegExp('^' + flex + '$').test(tl);
    } catch(e) { return false; }
  }

  // Core positional check:
  //   1. Find reqStr in step.target to get its expected location.
  //   2. Build the FULL ancestor chain from the target (every enclosing block
  //      from outermost to innermost: e.g. ['def game_start():', 'while True:',
  //      'if key_pressed("right"):'] for a deeply nested line).
  //   3. Verify each ancestor is correctly nested inside the previous one in the
  //      student's code, then confirm reqStr is in the innermost block's body.
  //
  // This catches "code at the wrong level" bugs:
  //   • everything at module level (no def game_start)
  //   • while True: at module level instead of inside game_start
  //   • change_x(5) in the wrong if block
  //
  // Returns true (pass) when reqStr isn't found in the target.
  // Returns false when reqStr IS in the target but not in the correct
  // nested structure in the student's code.

  // Walk the chain from the outermost ancestor inward, drilling into each
  // matching block.  Returns true if reqStr exists inside the innermost block.
  function _walkChain(cLines, chain, chainIdx, searchFrom, parentIndent, finalReq) {
    var header = chain[chainIdx];
    var isLast = (chainIdx === chain.length - 1);

    for (var k = searchFrom; k < cLines.length; k++) {
      if (cLines[k].trim() === '') continue;
      var lineInd = _lineIndent(cLines[k]);
      // Stop if we've left the parent block
      if (parentIndent >= 0 && lineInd <= parentIndent) break;
      if (!_lineMatchesReq(cLines[k], header)) continue;

      // Found a matching block header
      var blockInd = lineInd;
      if (isLast) {
        // Collect this block's body and check for finalReq
        var body = [];
        for (var l = k + 1; l < cLines.length; l++) {
          if (cLines[l].trim() === '') continue;
          if (_lineIndent(cLines[l]) <= blockInd) break;
          body.push(cLines[l]);
        }
        if (tutReqMatches(body.join('\n'), finalReq)) return true;
      } else {
        // Recurse into the next level of the chain
        if (_walkChain(cLines, chain, chainIdx + 1, k + 1, blockInd, finalReq)) return true;
      }
    }
    return false;
  }

  function _reqWithinTargetBlock(code, reqStr, target) {
    var tLines = target.split('\n');
    var trimReq = reqStr.trim();
    if (!trimReq) return true;

    // Find the FIRST target line that matches reqStr
    var tIdx = -1;
    for (var i = 0; i < tLines.length; i++) {
      if (_lineMatchesReq(tLines[i], trimReq)) { tIdx = i; break; }
    }
    if (tIdx === -1) return true; // not in target → no positional constraint

    // Build the full ancestor chain (outermost → innermost)
    var chain = [];
    var curInd = _lineIndent(tLines[tIdx]);
    for (var j = tIdx - 1; j >= 0; j--) {
      if (tLines[j].trim() === '') continue;
      var pInd = _lineIndent(tLines[j]);
      if (pInd < curInd && _pyLineOpensBlock(tLines[j].trim())) {
        chain.unshift(tLines[j].trim()); // prepend so [0] = outermost
        curInd = pInd;
        if (pInd === 0) break; // reached module level
      }
    }

    var cLines = code.split('\n');

    if (chain.length === 0) {
      // Module-level line — must appear at indent 0, not inside any block
      for (var ki = 0; ki < cLines.length; ki++) {
        if (cLines[ki].trim() === '' || cLines[ki].charAt(0) === '#') continue;
        if (_lineIndent(cLines[ki]) === 0 && _lineMatchesReq(cLines[ki], trimReq)) return true;
      }
      return false;
    }

    // Walk the full ancestor chain starting at the top of the student's code.
    // Each level must be correctly nested inside the previous one.
    return _walkChain(cLines, chain, 0, 0, -1, reqStr);
  }

  // ── Full-line context check ───────────────────────────────────
  // Catches "partial condition" bugs:
  //   requires 'x > 5' but student writes `if x > 5:` when target is `if x > 5 and x < 10:`
  //   requires 'x > 5 and < 10' (missing x)
  //
  // Algorithm:
  //   1. Skip truncated requires (unbalanced parens — e.g. set_variable("Score" ).
  //   2. Find the FIRST target line that contains reqStr as a substring.
  //   3. If reqStr IS the whole target line, the content check is already sufficient → skip.
  //   4. Otherwise reqStr is a FRAGMENT of a larger expression.
  //      The student must have a line that flex-matches the full target line.
  //
  // Returns true (pass) when:
  //   • reqStr has unbalanced parens (intentional truncation)
  //   • reqStr not found as substring in any target line
  //   • reqStr equals the full target line (content check is enough)
  //   • student has a line matching the full target line
  function _reqLineMatchesTarget(code, reqStr, target) {
    var trimReq = reqStr.trim();
    if (!trimReq) return true;

    // Detect intentionally truncated requires (e.g. 'set_variable("Score"')
    var pd = 0;
    for (var pi = 0; pi < trimReq.length; pi++) {
      var pc = trimReq[pi];
      if (pc === '(' || pc === '[') pd++;
      else if (pc === ')' || pc === ']') pd--;
    }
    if (pd !== 0) return true; // unbalanced → intentional fragment → no constraint

    // Find FIRST target line whose TRIMMED content contains reqStr as a substring
    var tLines = target.split('\n');
    var targetLine = null;
    for (var ti = 0; ti < tLines.length; ti++) {
      var tl = tLines[ti].trim();
      if (tl && tl.indexOf(trimReq) !== -1) { targetLine = tl; break; }
    }
    if (!targetLine) return true;         // not in target → no constraint
    if (targetLine === trimReq) return true; // reqStr IS the full line → content check sufficient

    // reqStr is a fragment of a larger target line.
    // The student must have a line that flex-matches the FULL target line.
    var cLines = code.split('\n');
    for (var ci = 0; ci < cLines.length; ci++) {
      if (_lineMatchesReq(cLines[ci], targetLine)) return true;
    }
    return false; // fragment found but full line not present → partial condition
  }

  function tutReqMatches(code, req) {
    if (!req) return true;
    var m      = req.match(/^([ \t]*)([\s\S]*)$/);
    var indent = m[1];
    if (indent.length > 0) {
      // ── Indented requires: line-anchored ──────────────────────────
      // Leading whitespace must match exactly at the start of a line so that
      // over-indented code (e.g. 12 spaces when 8 are expected) is rejected.
      if (('\n' + code).indexOf('\n' + req) !== -1) return true;
      try {
        var escaped = m[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Allow flexible spacing between tokens AND before opening parentheses,
        // so touching ("Paddle") matches touching("Paddle") and vice-versa.
        var flex    = escaped.replace(/ /g, '[ \\t]*').replace(/\\\(/g, '[ \\t]*\\(');
        return new RegExp('^' + indent + flex, 'm').test(code);
      } catch(e) { return false; }
    } else {
      // ── Unindented requires: match anywhere (indent-agnostic) ─────
      // Many requires deliberately omit indentation so they pass regardless
      // of nesting depth (e.g. 'next_costume()' inside any if block).
      if (code.indexOf(req) !== -1) return true;
      try {
        var escaped2 = req.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var flex2    = escaped2.replace(/ /g, '[ \\t]*').replace(/\\\(/g, '[ \\t]*\\(');
        return new RegExp(flex2).test(code);
      } catch(e) { return false; }
    }
  }

  // Count how many times a line-anchored req appears in code (for count-based checks).
  function tutReqCount(code, req) {
    var count  = 0;
    var search = '\n' + code;
    var needle = '\n' + req;
    var pos    = 0;
    while ((pos = search.indexOf(needle, pos)) !== -1) { count++; pos += needle.length; }
    if (count > 0) return count;
    // Flex-spacing fallback
    try {
      var mm      = req.match(/^([ \t]*)([\s\S]*)$/);
      var escaped = mm[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var flex    = escaped.replace(/ /g, '[ \\t]*').replace(/\\\(/g, '[ \\t]*\\(');
      var hits    = code.match(new RegExp('^' + mm[1] + flex, 'gm'));
      return hits ? hits.length : 0;
    } catch(e) { return 0; }
  }

  // Normalise a requires entry to { reqStr, count, label, context }.
  // Entries can be:
  //   'some code line'                  → plain string, count=1, context=null (auto-derived)
  //   { req, count, label }             → object form (context=null → auto-derived)
  //   { req, context: 'when_clicked' }  → explicit function context (overrides auto-derive)
  function _normReq(r) {
    if (typeof r === 'object' && r !== null) {
      return { reqStr: r.req, count: r.count || 1,
               label: r.label || r.req, context: r.context || null };
    }
    return { reqStr: r, count: 1, label: r, context: null };
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
    // Keep pop-out modal title in sync with the current step
    var _cmTitle = document.getElementById('ps-cm-title');
    if (_cmTitle) _cmTitle.textContent = step.title || 'Code reference';

    // Code block — highlight new lines in amber, dim context lines
    var codeWrap  = bar.querySelector('.ps-tb-code-wrap');
    var codeBlock = bar.querySelector('.ps-tb-code-block');
    if (step.target) {
      codeWrap.classList.remove('ps-tb-no-target');
      var newSet  = {};
      (step.newLines || []).forEach(function (l) { newSet[l] = true; });
      // Build a per-line context array so each span knows which def-function it
      // lives in. This lets the green-check pass restrict its search to the right
      // function instead of matching the same line in ANY function.
      var tgtCtxArr = buildTargetCtxArray(step.target);
      codeBlock.innerHTML = step.target.split('\n').map(function (line, idx) {
        // Empty lines are never individually "typed" by the student — always dim.
        var cls    = (newSet[line] && line.trim() !== '') ? 'new' : 'old';
        var ctxVal = tgtCtxArr[idx];
        var ctxAttr = ctxVal ? ' data-ctx="' + ctxVal + '"' : '';
        return '<span class="ps-tb-cl ' + cls + '"' + ctxAttr + '>' +
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
        var n    = _normReq(r);
        var dReq = n.reqStr.replace(/"/g, '&quot;');
        var lbl  = n.label + (n.count > 1 ? ' <em>×' + n.count + '</em>' : '');
        lbl = lbl.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                 .replace(/&lt;em&gt;/g,'<em>').replace(/&lt;\/em&gt;/g,'</em>');
        // Stamp the context (which def-function this requires item lives in)
        // so checkTutBar can restrict its search to the right function.
        // Explicit context wins; otherwise auto-derive from target.
        var ctx = n.context || reqContextInTarget(step.target, n.reqStr);
        var ctxAttr = ctx ? ' data-ctx="' + ctx + '"' : '';
        return '<div class="ps-tb-ck ck-wait" data-req="' + dReq + '"' + ctxAttr + '>' +
               '<i class="ps-tb-ck-icon">⏳</i><span>' + lbl + '</span>' +
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

    // Poll sprite count / sprite names for steps that wait for the student to add/rename a sprite
    if (step.requiresSpriteCount !== undefined || (step.requiredSpriteNames || []).length > 0) {
      _tutPollTid = setInterval(checkTutBar, 600);
    }

    // Scroll bar to top
    bar.scrollTop = 0;

    checkTutBar();
  }

  // ── Indentation error highlighting ────────────────────────────
  // Detects lines whose leading whitespace is not a multiple of 4 spaces,
  // or that contain literal tab characters.  Only flags non-blank lines.
  var _INDENT_LINE_H  = 13 * 1.65; // must match #ps-editor line-height in CSS
  var _INDENT_PAD_TOP = 12;         // must match #ps-editor padding in CSS

  function _detectIndentErrors(code) {
    var errors = [];
    code.split('\n').forEach(function (line, i) {
      if (line.trim() === '') return; // blank / whitespace-only lines are fine
      if (/^\t/.test(line)) {
        errors.push({ line: i, type: 'tab',
          msg: 'Tab character detected — use spaces instead',
          fix: 'Your Tab key already inserts 4 spaces in this editor. If you pasted this code, replace the tab with 4 spaces.' });
        return;
      }
      var m = line.match(/^( +)/);
      if (m) {
        var n = m[1].length;
        if (n % 4 !== 0) {
          var nearest = Math.round(n / 4) * 4 || 4;
          var level   = nearest / 4;
          errors.push({ line: i, type: 'bad', spaces: n, nearest: nearest,
            msg: '<strong>' + n + '</strong> space' + (n === 1 ? '' : 's') + ' — Python needs a multiple of 4&nbsp;&nbsp;(4, 8, 12…)',
            fix: 'Expected <strong>' + nearest + '</strong> spaces here (indent level ' + level + '). Use Shift+Tab / Tab to adjust.' });
        }
      }
    });
    return errors;
  }

  function updateIndentGutter() {
    var gutter = document.getElementById('ps-indent-gutter');
    var tip    = document.getElementById('ps-indent-tip');
    var editor = ui.editor;
    if (!gutter || !editor) return;

    var code   = editor.value;
    var errors = _detectIndentErrors(code);

    // ── Rebuild gutter marks ──────────────────────────────────
    gutter.innerHTML = '';
    var edTop   = editor.offsetTop;   // textarea's top within #ps-editor-wrap
    var edH     = editor.offsetHeight;
    var scrollY = editor.scrollTop;

    errors.forEach(function (err) {
      var lineTop  = edTop + _INDENT_PAD_TOP + err.line * _INDENT_LINE_H - scrollY;
      var markTop  = lineTop + (_INDENT_LINE_H - 14) / 2;
      if (markTop < edTop - 2 || markTop > edTop + edH - 6) return; // outside visible area
      var mark = document.createElement('div');
      mark.className = 'ps-ig-mark ig-' + err.type;
      mark.style.top    = Math.round(markTop) + 'px';
      mark.style.height = '14px';
      gutter.appendChild(mark);
    });

    // ── Show / update cursor-line tooltip ─────────────────────
    if (!tip) return;
    if (errors.length === 0 || document.activeElement !== editor) {
      tip.classList.remove('ps-it-show');
      return;
    }
    var curLine = editor.value.substring(0, editor.selectionStart).split('\n').length - 1;
    var lineErr = null;
    for (var ei = 0; ei < errors.length; ei++) {
      if (errors[ei].line === curLine) { lineErr = errors[ei]; break; }
    }
    if (!lineErr) { tip.classList.remove('ps-it-show'); return; }

    // Position the tooltip: prefer above the bad line, flip below if too close to top
    var editorRect = editor.getBoundingClientRect();
    var lineScreenY = editorRect.top + _INDENT_PAD_TOP + lineErr.line * _INDENT_LINE_H - scrollY;
    var tipH  = 56; // approximate tooltip height
    var tipY  = lineScreenY - tipH - 6;
    if (tipY < editorRect.top + 4) tipY = lineScreenY + _INDENT_LINE_H + 4;
    // clamp to viewport bottom
    tipY = Math.min(tipY, window.innerHeight - tipH - 8);

    tip.style.top   = Math.round(tipY) + 'px';
    tip.style.left  = Math.round(editorRect.left + 10) + 'px';
    tip.style.width = Math.min(320, editorRect.width - 20) + 'px';
    tip.innerHTML   = '<div>⚠ ' + lineErr.msg + '</div><div class="ps-it-fix">' + lineErr.fix + '</div>';
    tip.classList.add('ps-it-show');
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
    // Helper: get the code to search for a given checklist element.
    // If the element has data-ctx, restrict the search to that def-function's body.
    function _searchCode(ckEl) {
      var ctx = ckEl && ckEl.dataset && ckEl.dataset.ctx;
      return ctx ? getCodeInContext(code, ctx) : code;
    }

    // First pass: evaluate every requires item and update its checklist row.
    reqs.forEach(function (r) {
      var n    = _normReq(r);
      var ckEl = bar.querySelector('.ps-tb-ck[data-req="' + n.reqStr.replace(/"/g, '&quot;') + '"]');
      var sc   = _searchCode(ckEl);
      var found = n.count > 1
        ? tutReqCount(sc, n.reqStr) >= n.count
        : tutReqMatches(sc, n.reqStr);

      // ── Block-context check ───────────────────────────────────────
      // If content was found and the requires item has NO leading whitespace
      // (the common case — most requires omit indent to be flexible), verify
      // the line actually lives inside the CORRECT BLOCK as shown in step.target.
      // This catches "line exists but in the wrong if/while/def block" cases
      // that content-only matching cannot see.
      // Skipped for: indented requires (already enforce exact indent), count-based
      // items (multiple occurrences, harder to pin to one block), and steps without
      // a target (no oracle to compare against).
      if (found && !n.count && step.target && !/^[ \t]/.test(n.reqStr)) {
        // Block-context check: line must be in the correct nested block
        found = _reqWithinTargetBlock(code, n.reqStr, step.target);
        // Full-line check: when reqStr is a fragment (e.g. 'x > 5' in 'if x > 5 and x < 10:')
        // the student must have written the COMPLETE target line, not just the fragment.
        if (found) found = _reqLineMatchesTarget(code, n.reqStr, step.target);
      }

      if (!found) allOk = false;
      if (ckEl) {
        ckEl.className = 'ps-tb-ck ' + (found ? 'ck-ok' : 'ck-wait');
        ckEl.querySelector('.ps-tb-ck-icon').textContent = found ? '✓' : '⏳';
      }
    });

    // Second pass: colour code-block spans.
    // A span turns green when EITHER:
    //   (a) its exact line text is present in the editor within the span's function
    //       context (data-ctx). If no context, searches all code — handles context
    //       lines of if-blocks that have no dedicated requires item.
    //   (b) a satisfied requires item whose text is a substring of this span's line,
    //       and the req's context matches this span's context.
    // Separate pass so no unsatisfied req can undo a green already set.
    bar.querySelectorAll('.ps-tb-cl.new').forEach(function (sp) {
      var lineText = sp.textContent;
      var ctx  = sp.dataset && sp.dataset.ctx;
      var sc   = ctx ? getCodeInContext(code, ctx) : code;
      // (a) direct match within context
      var lineInCode = tutReqMatches(sc, lineText);
      // (b) a satisfied req whose text is a substring of this span's line,
      //     searched in the same context as this span
      var covByReq = !lineInCode && reqs.some(function (r) {
        var n    = _normReq(r);
        var ckEl = bar.querySelector('.ps-tb-ck[data-req="' + n.reqStr.replace(/"/g, '&quot;') + '"]');
        var rsc  = _searchCode(ckEl);
        return tutReqMatches(rsc, n.reqStr) && tutReqMatches(lineText, n.reqStr);
      });
      sp.classList.toggle('typed', lineInCode || covByReq);
    });

    // Mirror updated typed/green state into the pop-out modal (if open)
    var _cmCode = document.getElementById('ps-cm-code');
    if (_cmCode) {
      var _cbEl = bar.querySelector('.ps-tb-code-block');
      if (_cbEl) _cmCode.innerHTML = _cbEl.innerHTML;
    }

    // ── Missing grey-line detection ──────────────────────────────
    // Check if any "old" (grey, context) lines have been deleted from the editor.
    // Old lines = non-empty lines that appear in target but are NOT in newLines.
    var missWarn = bar.querySelector('.ps-tb-miss');
    if (missWarn && step.target) {
      var newLineSet = {};
      (step.newLines || []).forEach(function (l) { newLineSet[l] = true; });
      var _haystack = '\n' + code;
      var missingOld = step.target.split('\n').some(function (line) {
        // Use newline-anchored search so a grey line at 8 spaces is NOT treated
        // as present just because the student has the same text at 4 or 12 spaces.
        return line.trim() !== '' && !newLineSet[line] &&
               _haystack.indexOf('\n' + line) === -1;
      });
      if (missingOld) allOk = false;
      missWarn.classList.toggle('ps-tb-miss-hidden', !missingOld);
    } else if (missWarn) {
      missWarn.classList.add('ps-tb-miss-hidden');
    }

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

    // ── Required sprite names check ───────────────────────────────
    // Each entry in step.requiredSpriteNames must match a live (non-stage) sprite name.
    // step.requiredSpriteHints is an optional { Name: 'label text' } map.
    var spriteNamesReq = step.requiredSpriteNames || [];
    if (spriteNamesReq.length > 0) {
      var liveNames = [];
      try {
        liveNames = vm.runtime.targets
          .filter(function (t) { return !t.isStage; })
          .map(function (t) { return t.sprite.name; });
      } catch(e) {}
      var hintMap = step.requiredSpriteHints || {};
      var namesChecksEl = bar.querySelector('.ps-tb-checks');
      namesChecksEl.classList.remove('ps-tb-no-checks');
      spriteNamesReq.forEach(function (name) {
        var key = '__sprite_' + name + '__';
        var ok  = liveNames.indexOf(name) !== -1;
        if (!ok) allOk = false;
        var row = bar.querySelector('.ps-tb-ck[data-req="' + key + '"]');
        if (!row) {
          row = document.createElement('div');
          row.className   = 'ps-tb-ck ck-wait';
          row.dataset.req = key;
          var hint = hintMap[name] || ('Sprite named "' + name + '"');
          row.innerHTML = '<i class="ps-tb-ck-icon">⏳</i><span>' + hint + '</span>';
          namesChecksEl.appendChild(row);
        }
        row.className = 'ps-tb-ck ' + (ok ? 'ck-ok' : 'ck-wait');
        row.querySelector('.ps-tb-ck-icon').textContent = ok ? '✓' : '⏳';
      });
      if (step.highlight) {
        var allNamesOk = spriteNamesReq.every(function (n) { return liveNames.indexOf(n) !== -1; });
        if (allNamesOk) clearHighlight();
      }
    }

    // ── Python indentation structure check ────────────────────────
    // Runs only when all other checks already pass AND a target exists.
    // Catches structural IndentationError conditions that tutReqMatches misses
    // (requires without leading whitespace match at any depth).
    var ierrEl = bar.querySelector('.ps-tb-ierr');
    if (ierrEl) {
      if (allOk && step.target && code.trim()) {
        var _indErr = _pyIndentCheck(code);
        if (_indErr) {
          allOk = false;
          ierrEl.textContent = '⚠ ' + _indErr.msg;
          ierrEl.classList.remove('ps-tb-ierr-hidden');
        } else {
          ierrEl.classList.add('ps-tb-ierr-hidden');
        }
      } else {
        ierrEl.classList.add('ps-tb-ierr-hidden');
      }
    }

    // ── Footer status ─────────────────────────────────────────────
    var nextBtn = bar.querySelector('[data-tb="next"]');
    var validEl = bar.querySelector('.ps-tb-valid');
    var hasAnyReq = reqs.length > 0 || step.requiresSpriteCount !== undefined || (step.requiredSpriteNames || []).length > 0;
    nextBtn.disabled = hasAnyReq && !allOk;
    if (!hasAnyReq) {
      validEl.textContent = '';
      validEl.className   = 'ps-tb-valid';
    } else if (allOk) {
      validEl.textContent = '✓ All done — click Next';
      validEl.className   = 'ps-tb-valid tb-ok';
    } else {
      var codeReqsDone = reqs.filter(function (r) {
        var n    = _normReq(r);
        var ckEl = bar.querySelector('.ps-tb-ck[data-req="' + n.reqStr.replace(/"/g, '&quot;') + '"]');
        var sc   = _searchCode(ckEl);
        return n.count > 1 ? tutReqCount(sc, n.reqStr) >= n.count : tutReqMatches(sc, n.reqStr);
      }).length;
      var total = reqs.length + (step.requiresSpriteCount !== undefined ? 1 : 0) + (step.requiredSpriteNames || []).length;
      var spriteDone = 0;
      if (step.requiresSpriteCount !== undefined) {
        try { spriteDone = vm.runtime.targets.filter(function(t){return !t.isStage;}).length >= step.requiresSpriteCount ? 1 : 0; } catch(e){}
      }
      var spriteNamesDone = (step.requiredSpriteNames || []).filter(function (name) {
        try { return vm.runtime.targets.some(function (t) { return !t.isStage && t.sprite.name === name; }); } catch(e) { return false; }
      }).length;
      var done  = codeReqsDone + spriteDone + spriteNamesDone;
      validEl.textContent = done + ' / ' + total + ' tasks complete';
      validEl.className   = 'ps-tb-valid';
    }
  }

  // Low-level exit — clears state, hides bar, shows buttons
  function _doExitTutorial() {
    S.activeTut = null;
    if (_tutPollTid) { clearInterval(_tutPollTid); _tutPollTid = null; }
    clearHighlight();
    var bar = document.getElementById('ps-tut-bar');
    if (bar) bar.classList.add('ps-tb-hidden');
    // Close pop-out code modal when tutorial exits
    var cmEl2 = document.getElementById('ps-code-modal');
    if (cmEl2) cmEl2.classList.remove('ps-cm-open');
    var hb = document.getElementById('ps-help-btn');
    var tb = document.getElementById('ps-tut-btn');
    if (hb) hb.style.display = '';
    if (tb) tb.style.display = '';
  }

  // Public exit — prompts for keep/restore then cleans up
  function exitTutorial(isFinished) {
    var at = S.activeTut;
    if (!at) { _doExitTutorial(); return; }
    var tutIdx  = at.tutIdx;
    var tut     = TUTORIALS[tutIdx];
    var hasSnap = !!loadTutSnapshot(tutIdx);

    if (!hasSnap) {
      // No snapshot means nothing to restore — just exit
      if (isFinished) clearTutProgress(tutIdx);
      _doExitTutorial();
      return;
    }

    // Save "after tutorial" snapshot so the code written during the tutorial
    // is always recoverable from the Snapshots panel, regardless of keep/restore choice.
    if (isFinished && S.activeSprite) {
      takeSnapshot(S.activeSprite, tut.title + ' — finished', 'after-tutorial');
    }

    var icon  = isFinished ? '🎉' : '📚';
    var title = isFinished ? 'Tutorial Complete!' : 'Exit Tutorial';
    var body  = isFinished
      ? 'Great work finishing <strong>' + tut.title + '</strong>! What would you like to do with the code you wrote?'
      : 'What would you like to do with the code you typed during <strong>' + tut.title + '</strong>?';

    showTutDialog(icon, title, body, [
      { label: 'Keep My Code', cls: 'td-primary', cb: function () {
          clearTutSnapshot(tutIdx);
          clearTutProgress(tutIdx);
          _doExitTutorial();
      }},
      { label: 'Restore Original Code', cls: 'td-danger', cb: function () {
          restoreTutSnapshot(tutIdx);
          clearTutSnapshot(tutIdx);
          clearTutProgress(tutIdx);
          _doExitTutorial();
      }}
    ]);
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

  // ── Colour picker ─────────────────────────────────────────────
  // Returns {open, close, hex} when the cursor is between the parentheses of
  // touching_colour(...) or touching_color(...), otherwise null.
  function getColourPickerCtx(editor) {
    if (!editor) return null;
    var pos  = editor.selectionStart;
    var text = editor.value;
    var re   = /touching_colou?r\(/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      var open = m.index + m[0].length;
      var lineEnd = text.indexOf('\n', open);
      if (lineEnd === -1) lineEnd = text.length;
      var close = text.indexOf(')', open);
      if (close === -1 || close > lineEnd) continue;
      if (pos >= open && pos <= close) {
        var inner = text.slice(open, close);
        var hexM  = inner.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/);
        var hex   = hexM ? '#' + hexM[1] : '#ff0000';
        // Normalise 3-digit → 6-digit
        if (hex.length === 4) hex = '#' + hex[1]+hex[1]+hex[2]+hex[2]+hex[3]+hex[3];
        return { open: open, close: close, hex: hex };
      }
    }
    return null;
  }

  // Show or hide the colour picker badge near the caret.
  function updateColourPicker() {
    var cpEl = document.getElementById('ps-colour-pick');
    if (!cpEl || !ui.editor) return;
    var ctx = getColourPickerCtx(ui.editor);
    if (!ctx) { cpEl.style.display = 'none'; return; }
    var hex = ctx.hex;
    document.getElementById('ps-cp-input').value  = hex;
    document.getElementById('ps-cp-swatch').style.background = hex;
    // Approximate caret Y: 13px font × 1.65 line-height = ~21.45 px per line
    var textBefore = ui.editor.value.substring(0, ui.editor.selectionStart);
    var lineNum    = (textBefore.match(/\n/g) || []).length;
    var rect       = ui.editor.getBoundingClientRect();
    var lineH      = Math.round(13 * 1.65);
    var caretY     = rect.top + 12 + lineNum * lineH;
    caretY = Math.max(rect.top + 4, Math.min(caretY, rect.bottom - 44));
    cpEl.style.top  = (caretY + lineH + 2) + 'px';
    cpEl.style.left = (rect.left + 8) + 'px';
    cpEl.style.display = 'flex';
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

  // ── Behavioural test runner ─────────────────────────────────────────────────
  // Runs step.behaviorCheck by actually starting the student's code, simulating
  // key/mouse inputs, reading the runtime state, and verifying the result.
  //
  // step.behaviorCheck shape:
  //   {
  //     hint:     string    — shown to student if any scenario fails
  //     setupMs:  number    — wait after green-flag before snapshotting (default 400)
  //     settleMs: number    — default wait after input before reading state (default 120)
  //     scenarios: [
  //       {
  //         label:      string   — appended to hint on failure (optional)
  //         holdKey:    string   — key name to hold, e.g. 'right', 'up', 'space' (optional)
  //         durationMs: number   — how long to hold the key (default 400)
  //         waitMs:     number   — override settleMs for this scenario (for auto-run code)
  //         checks: [
  //           { type:'xChanged',  dir: '+' | '-' }  — active sprite x increased / decreased
  //           { type:'yChanged',  dir: '+' | '-' }  — active sprite y increased / decreased
  //           { type:'moved' }                       — sprite moved at all (x or y)
  //           { type:'costumeChanged' }              — costume index changed
  //           { type:'xAbove',  value: N }           — final sprite x > N
  //           { type:'xBelow',  value: N }           — final sprite x < N
  //           { type:'yAbove',  value: N }           — final sprite y > N
  //           { type:'yBelow',  value: N }           — final sprite y < N
  //           { type:'variable', name:'n', op:'>', value: V }  — variable check
  //         ]
  //       }
  //     ]
  //   }
  //
  // Calls onPass() when all scenarios pass, or onFail(hint) on first failure.

  function runBehaviorCheck(step, onPass, onFail) {
    var bc = step.behaviorCheck;
    if (!bc || !bc.scenarios || !bc.scenarios.length) { onPass(); return; }
    var setupMs  = bc.setupMs  || 400;
    var settleMs = bc.settleMs || 120;
    _bcRunScenario(bc.scenarios, 0, setupMs, settleMs, bc.hint, onPass, onFail);
  }

  function _bcRunScenario(scenarios, idx, setupMs, settleMs, hint, onPass, onFail) {
    if (idx >= scenarios.length) {
      if (S.running) stopAll();
      onPass();
      return;
    }

    var sc = scenarios[idx];
    var waitAfter  = (sc.waitMs    != null) ? sc.waitMs    : settleMs;
    var keepRun    = sc.keepRunning === true;
    var allowStop  = sc.allowStop   === true;

    if (!keepRun) {
      // Fresh start each scenario so position is always predictable.
      if (S.running) stopAll();
      // Centre the active sprite so there's room to move in any direction.
      try {
        var sp = getSprites();
        if (sp.length) sp[0].setXY(0, 0);
      } catch(e) {}
      startAll();
    }

    setTimeout(function () {
      // Guard: code must still be running after setup time (unless allowStop).
      if (!S.running && !allowStop) {
        stopAll();
        onFail(hint || 'Your code didn\'t start — make sure it has a <code>def game_start():</code> function.');
        return;
      }

      // Snapshot initial state after setup (before stimulus).
      var sp0      = getSprites()[0] || null;
      var initX    = sp0 ? sp0.x              : 0;
      var initY    = sp0 ? sp0.y              : 0;
      var initCos  = sp0 ? sp0.currentCostume : -1;

      // Press key.
      if (sc.holdKey) {
        S.pressedKeys[sc.holdKey] = true;
        if (S.running) fireEventHandlers(null, 'key', sc.holdKey);
      }
      // Click a sprite by name (or '__active__' for the currently selected sprite).
      if (sc.clickSprite && S.running) {
        var clickKey2 = sc.clickSprite === '__active__' ? S.activeSprite : sc.clickSprite;
        if (clickKey2) fireEventHandlers(clickKey2, 'clicked', null);
      }
      // Fire a broadcast.
      if (sc.broadcast && S.running) {
        fireEventHandlers(null, 'message', sc.broadcast);
      }

      setTimeout(function () {
        // Release key.
        if (sc.holdKey) S.pressedKeys[sc.holdKey] = false;

        setTimeout(function () {
          // Read final state.
          var sp1      = getSprites()[0] || null;
          var finalX   = sp1 ? sp1.x              : 0;
          var finalY   = sp1 ? sp1.y              : 0;
          var finalCos = sp1 ? sp1.currentCostume : -1;
          var didStop  = !S.running;

          // Run checks.
          var passed = true;
          (sc.checks || []).forEach(function (ck) {
            if (!passed) return;
            var ok = true;
            if (ck.type === 'xChanged') {
              if      (ck.dir === '+') ok = finalX > initX;
              else if (ck.dir === '-') ok = finalX < initX;
              else                     ok = finalX !== initX;
            } else if (ck.type === 'yChanged') {
              if      (ck.dir === '+') ok = finalY > initY;
              else if (ck.dir === '-') ok = finalY < initY;
              else                     ok = finalY !== initY;
            } else if (ck.type === 'moved') {
              ok = Math.abs(finalX - initX) > 0.5 || Math.abs(finalY - initY) > 0.5;
            } else if (ck.type === 'costumeChanged') {
              ok = finalCos !== initCos;
            } else if (ck.type === 'xAbove') {
              ok = finalX > ck.value;
            } else if (ck.type === 'xBelow') {
              ok = finalX < ck.value;
            } else if (ck.type === 'yAbove') {
              ok = finalY > ck.value;
            } else if (ck.type === 'yBelow') {
              ok = finalY < ck.value;
            } else if (ck.type === 'stopped') {
              // Passes if the program stopped naturally (e.g. called stop()).
              ok = didStop;
            } else if (ck.type === 'stoppedOrBelow') {
              // Passes if program stopped OR sprite y is below the threshold.
              ok = didStop || finalY < ck.value;
            } else if (ck.type === 'variable') {
              try {
                var vVal = null;
                (S.vm.runtime.targets || []).forEach(function (t) {
                  Object.keys(t.variables || {}).forEach(function (k) {
                    if (t.variables[k].name === ck.name && vVal === null) {
                      vVal = t.variables[k].value;
                    }
                  });
                });
                if      (ck.op === '>')  ok = Number(vVal) >  Number(ck.value);
                else if (ck.op === '<')  ok = Number(vVal) <  Number(ck.value);
                else if (ck.op === '>=') ok = Number(vVal) >= Number(ck.value);
                else if (ck.op === '=')  ok = String(vVal) === String(ck.value);
                else if (ck.op === '!=') ok = String(vVal) !== String(ck.value);
                else ok = vVal !== null;
              } catch(e) { ok = false; }
            }
            if (!ok) passed = false;
          });

          if (!passed) {
            stopAll();
            var failHint = (hint || 'Your code didn\'t behave as expected.') +
              (sc.label ? ' (' + sc.label + ')' : '');
            onFail(failHint);
          } else {
            _bcRunScenario(scenarios, idx + 1, setupMs, settleMs, hint, onPass, onFail);
          }
        }, waitAfter);
      }, sc.holdKey ? (sc.durationMs || 400) : 0);
    }, keepRun ? 80 : setupMs);
  }

  function initTutorialBar() {
    var bar = document.getElementById('ps-tut-bar');
    if (!bar) return;

    // Exit button — mid-tutorial exit, keep progress saved for resume
    bar.querySelector('.ps-tb-exit').addEventListener('click', function () {
      exitTutorial(false);
    });

    // Restore button — re-applies the step's starter code
    bar.querySelector('.ps-tb-miss-restore').addEventListener('click', function () {
      applyTutBar(true); // re-loads starter, same as navigating to this step fresh
    });

    // Prev / Next buttons
    bar.querySelector('[data-tb="prev"]').addEventListener('click', function () {
      if (!S.activeTut || S.activeTut.stepIdx === 0) return;
      S.activeTut.stepIdx--;
      saveTutProgress();
      applyTutBar(true);
    });
    bar.querySelector('[data-tb="next"]').addEventListener('click', function () {
      if (!S.activeTut) return;
      var tut    = TUTORIALS[S.activeTut.tutIdx];
      var step   = tut.steps[S.activeTut.stepIdx];
      var isLast = S.activeTut.stepIdx >= tut.steps.length - 1;

      var doAdvance = function () {
        if (isLast) {
          exitTutorial(true);
        } else {
          S.activeTut.stepIdx++;
          saveTutProgress();
          applyTutBar(true);
        }
      };

      if (step.behaviorCheck) {
        var nextBtn2 = bar.querySelector('[data-tb="next"]');
        var prevBtn2 = bar.querySelector('[data-tb="prev"]');
        var validEl2 = bar.querySelector('.ps-tb-valid');
        nextBtn2.disabled = true;
        prevBtn2.disabled = true;
        validEl2.textContent = '⏳ Testing your code…';
        validEl2.className   = 'ps-tb-valid tb-testing';

        runBehaviorCheck(step,
          function () {             // pass
            nextBtn2.disabled = false;
            prevBtn2.disabled = false;
            doAdvance();
          },
          function (hint) {         // fail
            nextBtn2.disabled = false;
            prevBtn2.disabled = false;
            validEl2.textContent = '⚠ ' + hint;
            validEl2.className   = 'ps-tb-valid tb-err';
          }
        );
      } else {
        doAdvance();
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
        { code:'touching_colour("#ff0000")', desc:'True if this sprite is touching a specific colour on the stage or another sprite. While typing inside the brackets a 🎨 Colour badge appears — click it to open the colour picker. Both touching_colour and touching_color are accepted.' },
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
      { cat:'vars', title:'Variables', items:[
        { code:'set_variable("Score", 0)', desc:'Set a Scratch variable by name — creates it automatically if it does not exist. Use display_variable("Score", True) to make the on-screen counter visible.' },
        { code:'get_variable("Score")', desc:'Read the current value of a Scratch stage variable. Returns 0 if the variable does not exist.' },
        { code:'change_variable("Score", 1)', desc:'Add a number to a Scratch stage variable — shortcut for get then set. Creates the variable if needed. Use negative numbers to subtract.' },
        { code:'display_variable("Score", True)', desc:'Creates the variable if it does not exist, then shows (True) or hides (False) its on-screen counter — exactly the same as ticking or unticking the checkbox next to a variable in the Scratch Variables panel. Useful for hiding internal variables like HP that you only want shown at certain times.' },
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
          // Migrate snapshots to new name key so they survive the rename.
          try {
            var _oldSnaps = localStorage.getItem('pyscratch:snaps:' + S.activeSprite);
            if (_oldSnaps) {
              localStorage.setItem('pyscratch:snaps:' + selectedName, _oldSnaps);
              localStorage.removeItem('pyscratch:snaps:' + S.activeSprite);
            }
          } catch(e) {}
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
      // Refresh snapshot list if that tab is currently visible
      var snapEl = document.getElementById('ps-snap-list');
      if (snapEl && snapEl.style.display !== 'none') renderSnapList();
    }
  }

  // ── Per-sprite code snapshots ─────────────────────────────────
  var SNAP_MAX = 20;

  // Snapshots are keyed by sprite NAME (not UUID) so they survive page reloads and
  // sessions where no .sb3 is saved.  UUIDs are regenerated by TurboWarp every time
  // a fresh project loads, which caused the panel to always appear empty.
  function snapStoreKey(spriteName) {
    return 'pyscratch:snaps:' + spriteName;
  }

  function loadSnaps(spriteName) {
    try {
      var raw = localStorage.getItem(snapStoreKey(spriteName));
      if (raw) return JSON.parse(raw);
    } catch(e) {}
    return [];
  }

  function saveSnaps(spriteName, snaps) {
    try { localStorage.setItem(snapStoreKey(spriteName), JSON.stringify(snaps)); } catch(e) {}
  }

  // kind: 'auto' | 'before-tutorial' | 'after-tutorial'
  function takeSnapshot(spriteName, label, kind) {
    if (!spriteName) return;
    saveCurrentCode(); // flush editor → S.spriteCode
    var threads = loadThreads(spriteName);
    var snaps   = loadSnaps(spriteName);
    // Skip auto-snapshots when code is unchanged from the most recent snap
    if (kind === 'auto' && snaps.length > 0) {
      var lastCode = JSON.stringify(snaps[snaps.length - 1].threads);
      var curCode  = JSON.stringify(threads);
      if (lastCode === curCode) return;
    }
    var snap = {
      ts:      Date.now(),
      label:   label || 'Auto',
      kind:    kind  || 'auto',
      threads: JSON.parse(JSON.stringify(threads))
    };
    snaps.push(snap);
    if (snaps.length > SNAP_MAX) snaps = snaps.slice(snaps.length - SNAP_MAX);
    saveSnaps(spriteName, snaps);
    // Refresh snap list panel if it's currently visible
    var snapEl = document.getElementById('ps-snap-list');
    if (snapEl && snapEl.style.display !== 'none') renderSnapList();
  }

  var _snapTimerId = null;
  function startSnapshotTimer() {
    if (_snapTimerId) return;
    _snapTimerId = setInterval(function () {
      if (S.activeSprite && !S.activeTut) {
        takeSnapshot(S.activeSprite, 'Auto', 'auto');
      }
    }, 3 * 60 * 1000); // every 3 minutes
  }

  function snapRelativeTime(ts) {
    var diff = Math.max(0, Date.now() - ts);
    var mins = Math.round(diff / 60000);
    if (mins < 1)  return 'just now';
    if (mins < 60) return mins + ' min ago';
    var hrs = Math.round(mins / 60);
    if (hrs < 24)  return hrs + ' hr ago';
    var d = new Date(ts);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
           d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function renderSnapList() {
    var el = document.getElementById('ps-snap-list');
    if (!el) return;
    var spriteName = S.activeSprite;
    if (!spriteName) {
      el.innerHTML = '<div class="ps-snap-empty">No sprite selected.</div>';
      return;
    }
    var snaps = loadSnaps(spriteName);
    if (!snaps.length) {
      el.innerHTML = '<div class="ps-snap-empty">No snapshots yet.<br>Auto-saves every 3 min when code changes.</div>';
      return;
    }
    el.innerHTML = '';
    // Newest first
    snaps.slice().reverse().forEach(function (snap) {
      var div = document.createElement('div');
      div.className = 'ps-snap-item';

      var icon = snap.kind === 'before-tutorial' ? '📚 '
               : snap.kind === 'after-tutorial'  ? '🎉 '
               : '';
      var lbl = document.createElement('div');
      lbl.className   = 'ps-snap-label';
      lbl.textContent = icon + snap.label;

      var ts = document.createElement('div');
      ts.className   = 'ps-snap-time';
      ts.textContent = snapRelativeTime(snap.ts);

      var btn = document.createElement('button');
      btn.className   = 'ps-snap-restore';
      btn.textContent = 'Restore this snapshot';
      btn.onclick = (function (s) {
        return function () {
          if (!confirm('Restore "' + s.label + '"?\nCurrent code will be replaced.')) return;
          var scrollY = el.scrollTop; // save position before re-render
          S.spriteCode[spriteName] = JSON.parse(JSON.stringify(s.threads));
          saveThreads(spriteName);
          S.activeThreadIdx = 0;
          renderThreadList();
          loadCodeToEditor();
          renderSnapList();          // refresh labels/times in place
          el.scrollTop = scrollY;   // restore scroll position
        };
      })(snap);

      div.appendChild(lbl);
      div.appendChild(ts);
      div.appendChild(btn);
      el.appendChild(div);
    });
  }

  // ── Challenge runner (used by the Challenges tab in the tutorial modal) ──────

  function runChallenge(chalIdx, runBtn, resultsEl) {
    var ch = CHALLENGES[chalIdx];
    if (!ch) return;

    runBtn.disabled = true;
    runBtn.textContent = '⏳ Testing…';
    resultsEl.innerHTML = '';

    // Build placeholder rows for each test
    var rows = ch.tests.map(function (t) {
      var row = document.createElement('div');
      row.className = 'ps-chal-result-row';
      var icon = document.createElement('span');
      icon.className = 'ps-cr-icon';
      icon.textContent = '…';
      var lbl = document.createElement('span');
      lbl.className = 'ps-cr-label';
      lbl.textContent = t.label;
      row.appendChild(icon);
      row.appendChild(lbl);
      resultsEl.appendChild(row);
      return { icon: icon, lbl: lbl };
    });

    var setupMs  = ch.setupMs  || 500;
    var settleMs = ch.settleMs || 250;

    // Run all tests sequentially, collecting individual pass/fail without stopping on failure.
    // keepRunning tests skip the fresh startAll() so state carries over from the previous test.
    _chalRunScenario(ch.tests, 0, setupMs, settleMs, rows, function () {
      // All tests complete
      var allPassed = rows.every(function (r) { return r.icon.textContent === '✓'; });
      var overall = document.createElement('div');
      overall.className = 'ps-chal-overall ' + (allPassed ? 'co-pass' : 'co-fail');
      overall.textContent = allPassed
        ? '🎉 All tests passed!'
        : '✗ Some tests failed — check your code and try again.';
      resultsEl.appendChild(overall);
      runBtn.disabled = false;
      runBtn.textContent = '▶ Run Tests Again';
      if (S.running) stopAll();
    });
  }

  // Like _bcRunScenario but:
  //   • never stops early on failure — runs every test and records pass/fail
  //   • supports keepRunning: true to skip the fresh-start between tests
  function _chalRunScenario(tests, idx, setupMs, settleMs, rows, onDone) {
    if (idx >= tests.length) {
      if (S.running) stopAll();
      onDone();
      return;
    }

    var sc        = tests[idx];
    var r         = rows[idx];
    var waitAfter = (sc.waitMs != null) ? sc.waitMs : settleMs;
    var keepRun   = sc.keepRunning === true;
    var allowStop = sc.allowStop   === true;

    r.icon.textContent = '⏳';

    if (!keepRun) {
      if (S.running) stopAll();
      try {
        var sp = getSprites();
        if (sp.length) sp[0].setXY(0, 0);
      } catch(e) {}
      startAll();
    }

    setTimeout(function () {
      if (!S.running && !allowStop) {
        r.icon.textContent = '✗';
        r.lbl.className    = 'ps-cr-label cr-fail';
        r.lbl.title        = 'Code did not start. Make sure def game_start(): exists.';
        if (S.running) stopAll();
        _chalRunScenario(tests, idx + 1, setupMs, settleMs, rows, onDone);
        return;
      }

      // Snapshot before input
      var sp0     = getSprites()[0] || null;
      var initX   = sp0 ? sp0.x              : 0;
      var initY   = sp0 ? sp0.y              : 0;
      var initCos = sp0 ? sp0.currentCostume : -1;

      // Fire inputs
      if (sc.holdKey) {
        S.pressedKeys[sc.holdKey] = true;
        if (S.running) fireEventHandlers(null, 'key', sc.holdKey);
      }
      if (sc.clickSprite && S.running) {
        var ck2 = sc.clickSprite === '__active__' ? S.activeSprite : sc.clickSprite;
        if (ck2) fireEventHandlers(ck2, 'clicked', null);
      }
      if (sc.broadcast && S.running) {
        fireEventHandlers(null, 'message', sc.broadcast);
      }

      setTimeout(function () {
        if (sc.holdKey) S.pressedKeys[sc.holdKey] = false;

        setTimeout(function () {
          var sp1      = getSprites()[0] || null;
          var finalX   = sp1 ? sp1.x              : 0;
          var finalY   = sp1 ? sp1.y              : 0;
          var finalCos = sp1 ? sp1.currentCostume : -1;
          var didStop  = !S.running;

          var passed = true;
          (sc.checks || []).forEach(function (ck) {
            if (!passed) return;
            var ok = true;
            if      (ck.type === 'xChanged')      { ok = ck.dir === '+' ? finalX > initX : ck.dir === '-' ? finalX < initX : finalX !== initX; }
            else if (ck.type === 'yChanged')      { ok = ck.dir === '+' ? finalY > initY : ck.dir === '-' ? finalY < initY : finalY !== initY; }
            else if (ck.type === 'moved')         { ok = Math.abs(finalX - initX) > 0.5 || Math.abs(finalY - initY) > 0.5; }
            else if (ck.type === 'costumeChanged'){ ok = finalCos !== initCos; }
            else if (ck.type === 'xAbove')        { ok = finalX > ck.value; }
            else if (ck.type === 'xBelow')        { ok = finalX < ck.value; }
            else if (ck.type === 'yAbove')        { ok = finalY > ck.value; }
            else if (ck.type === 'yBelow')        { ok = finalY < ck.value; }
            else if (ck.type === 'stopped')       { ok = didStop; }
            else if (ck.type === 'stoppedOrBelow'){ ok = didStop || finalY < ck.value; }
            else if (ck.type === 'variable') {
              try {
                var vVal = null;
                (S.vm.runtime.targets || []).forEach(function (t) {
                  Object.keys(t.variables || {}).forEach(function (k) {
                    if (t.variables[k].name === ck.name && vVal === null) vVal = t.variables[k].value;
                  });
                });
                if      (ck.op === '>')  ok = Number(vVal) >  Number(ck.value);
                else if (ck.op === '<')  ok = Number(vVal) <  Number(ck.value);
                else if (ck.op === '>=') ok = Number(vVal) >= Number(ck.value);
                else if (ck.op === '=')  ok = String(vVal) === String(ck.value);
                else if (ck.op === '!=') ok = String(vVal) !== String(ck.value);
                else ok = vVal !== null;
              } catch(e) { ok = false; }
            }
            if (!ok) passed = false;
          });

          r.icon.textContent = passed ? '✓' : '✗';
          r.lbl.className    = 'ps-cr-label ' + (passed ? 'cr-pass' : 'cr-fail');

          // For keepRunning chain: only stop between tests when the next test is NOT keepRunning
          var nextSc = tests[idx + 1];
          if (!passed || (nextSc && !nextSc.keepRunning)) {
            if (S.running) stopAll();
          }
          _chalRunScenario(tests, idx + 1, setupMs, settleMs, rows, onDone);
        }, waitAfter);
      }, sc.holdKey ? (sc.durationMs || 400) : 0);
    }, keepRun ? 80 : setupMs);
  }

  function switchPanelTab(name) {
    document.querySelectorAll('.ps-ptab').forEach(function (t) {
      t.classList.toggle('ps-ptab-active', t.dataset.panel === name);
    });
    var inThreads   = name === 'threads';
    var inSnapshots = name === 'snapshots';
    var headEl = document.getElementById('ps-thread-head');
    var listEl = document.getElementById('ps-thread-list');
    var snapEl = document.getElementById('ps-snap-list');
    if (headEl) headEl.style.display = inThreads ? '' : 'none';
    if (listEl) listEl.style.display = inThreads ? '' : 'none';
    if (snapEl) {
      snapEl.style.display = inSnapshots ? 'block' : 'none';
      if (inSnapshots) renderSnapList();
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
    updateIndentGutter();
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
        // Quiz: parent asks for all code from every sprite/thread.
        // pyscratch.js saves the active editor first so nothing is missed, then
        // posts PS_CODE_RESPONSE with the concatenated code back to the parent.
        if (e.data.type === 'PS_GET_CODE') {
          saveCurrentCode();
          var _allCode = '';
          Object.keys(S.spriteCode).forEach(function(spriteName) {
            (S.spriteCode[spriteName] || []).forEach(function(t) {
              _allCode += (t.code || '') + '\n';
            });
          });
          try {
            if (window.parent && window.parent !== window) {
              window.parent.postMessage({ type: 'PS_CODE_RESPONSE', code: _allCode }, '*');
            }
          } catch(_e2) {}
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
                if (!t.isStage) {
                  if (S.spriteCode[t.name] && S.spriteCode[t.name].length) {
                    t.pyscratch = S.spriteCode[t.name];
                  }
                  // Embed snapshots so they travel with the .sb3
                  var snaps = loadSnaps(t.name);
                  if (snaps && snaps.length) t.pyscratchSnaps = snaps;
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
            return _origLoadProject(result.buffer).then(function (r) {
              // Re-key snapshots by UUID now that targets exist in the VM
              if (result.snapshots) {
                Object.keys(result.snapshots).forEach(function (name) {
                  var snaps = result.snapshots[name];
                  if (snaps && snaps.length) saveSnaps(name, snaps);
                });
              }
              return r;
            });
          });
        };
      } catch(e) {
        console.warn('[PyScratch] Could not patch loadProject:', e);
      }

      console.log('[PyScratch] Ready. vm=', vm, 'runtime=', vm.runtime);
    });
  });

})();
