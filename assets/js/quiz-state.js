//  QUIZ SYSTEM
// ════════════════════════════════════════════════════════════════

var quiz = {
  lessonId:    null,
  className:   null,
  questions:   [],      // shuffled subset
  lobbyCode:   null,    // 4-digit string
  sessionRef:  null,    // Firebase ref
  playerCount: 0,
  hostPlayers: {},
  timerInterval: null,
  revealTimer: null,
  studentTimerInterval: null,
  hostTimerToken: 0,
  hostSessionRenderKey: null,
  timerEnd:    null,
  currentState: null,   // 'lobby'|'question'|'answer'|'finished'
  myScore:     0,       // student side
  myAnswered:  false,
  myScored:    {},
  currentStudentQuestionKey: null,
  currentStudentRevealKey: null,
  currentWidget: null,
  missingSessionTimer: null,
  cleanupTimer: null,
  forced: false,
  displaced: false,
  unsubscribers: [],    // Firebase listeners to clean up
};

// ── Generate 4-digit lobby code unique in Firebase ─────────────
async function genLobbyCode() {
  var now = Date.now();
  var staleMs = 12 * 60 * 60 * 1000;
  for (var attempt = 0; attempt < 80; attempt++) {
    var code = String(Math.floor(1000 + Math.random() * 9000));
    var ref = state.db.ref('quizSessions/' + code);
    var snap = await ref.get();
    if (snap.exists()) {
      var stateVal = snap.child('state').val();
      var endedAt = Number(snap.child('endedAt').val()) || 0;
      var createdAt = Number(snap.child('createdAt').val()) || Number(snap.child('startedAt').val()) || 0;
      var reservedAt = Number(snap.child('reservedAt').val()) || 0;
      var staleFinished = stateVal === 'finished' || (endedAt && now - endedAt > 60000);
      var staleReservation = snap.child('reserved').val() === true && reservedAt && now - reservedAt > 120000;
      var staleAbandoned = createdAt && now - createdAt > staleMs && stateVal !== 'question' && stateVal !== 'answer';
      if (staleFinished || staleReservation || staleAbandoned) {
        try { await ref.remove(); } catch(e) {}
      }
    }
    try {
      var tx = await ref.transaction(function(current) {
        if (current === null) return { reserved: true, reservedAt: Date.now() };
        return;
      });
      if (tx && tx.committed) return code;
    } catch(e) {
      // Try another code; permission/network errors will surface if all attempts fail.
    }
  }
  throw new Error('No free quiz lobby codes are available right now. End old active quizzes or try again in a moment.');
}

var assessment = {
  className: null,
  assessmentId: null,
  lobbyCode: null,
  sessionRef: null,
  responseRef: null,
  forced: false,
  debugMode: false,
  completed: false,
  validating: false,
  lastProjectSaveAt: 0,
  lastProjectDataHash: '',
  projectSaveInFlight: false,
  lastMetadataSaveAt: 0,
  saveTimer: null,
  hostListener: null,
  studentListener: null,
  feedbackRef: null,
  feedbackListener: null,
  questionAnswers: {},
  questionCurrentIdx: 0,
  questionAutosaveTimer: null,
  questionWidget: null,
  clientId: (function(){
    try {
      var existing = sessionStorage.getItem('pylearn_ap_client_id');
      if (existing) return existing;
      var id = Date.now() + '-' + Math.random().toString(36).slice(2);
      sessionStorage.setItem('pylearn_ap_client_id', id);
      return id;
    } catch(e) { return Date.now() + '-' + Math.random().toString(36).slice(2); }
  })()
};

function buildYear9BinaryHexAp2Criteria() {
  return buildYear9BinaryHexAp2Questions().map(function(q, i) {
    return { id: q.id, text: 'Q' + (i + 1) + ': ' + q.title, marks: 1, type: q.family };
  });
}

function buildYear9BinaryHexAp2Questions() {
  function bits(n) { return Number(n).toString(2).padStart(8, '0'); }
  function hex(n) { return Number(n).toString(16).toUpperCase().padStart(2, '0'); }
  function bitArray(n) { return bits(n).split('').map(function(b) { return Number(b); }); }
  function q(id, family, title, prompt, answer, opts) {
    return Object.assign({ id: id, family: family, title: title, prompt: prompt, answer: String(answer).toUpperCase(), marks: 1 }, opts || {});
  }
  var rows = [];
  [
    [1, '00000001'], [5, '00000101'], [18, '00010010'], [73, '01001001'], [170, '10101010']
  ].forEach(function(pair, i) {
    var n = pair[0], b = pair[1];
    rows.push(q('bd' + (i + 1), 'binary_to_denary', 'Binary to denary', 'Convert this 8-bit binary number to denary.', String(n), { type:'text', html: BinaryLesson.bitTable(bitArray(n)) }));
  });
  [3, 9, 24, 96, 201].forEach(function(n, i) {
    rows.push(q('db' + (i + 1), 'denary_to_binary', 'Denary to binary', 'Convert ' + n + ' to 8-bit binary.', bits(n), { type:'bit_input', useNibbles:false }));
  });
  [
    [1, 2], [3, 4], [9, 6], [15, 17], [48, 73]
  ].forEach(function(pair, i) {
    var total = pair[0] + pair[1];
    rows.push(q('ba' + (i + 1), 'binary_addition', 'Binary addition', 'Add these two binary numbers.', bits(total), { type:'addition_input', rowA: bitArray(pair[0]), rowB: bitArray(pair[1]), right: pair[0] + ' + ' + pair[1] + ' = ' + total + '.' }));
  });
  [10, 15, 31, 64, 175].forEach(function(n, i) {
    rows.push(q('hd' + (i + 1), 'hex_to_denary', 'Hex to denary', 'Convert ' + hex(n) + ' to denary.', String(n), { type:'text', html:'<div class="bb-hex-pair"><div>' + hex(n)[0] + '</div><div>' + hex(n)[1] + '</div></div>' }));
  });
  [11, 16, 42, 127, 230].forEach(function(n, i) {
    rows.push(q('dh' + (i + 1), 'denary_to_hex', 'Denary to hex', 'Convert ' + n + ' to hexadecimal.', hex(n), { type:'text', html:'<div class="bb-hex-pair"><div>?</div><div>?</div></div>' }));
  });
  [12, 30, 47, 128, 255].forEach(function(n, i) {
    rows.push(q('bh' + (i + 1), 'binary_hex_conversion', 'Binary and hex conversion', i % 2 === 0 ? 'Convert this binary number to hexadecimal.' : 'Convert ' + hex(n) + ' to 8-bit binary.', i % 2 === 0 ? hex(n) : bits(n), i % 2 === 0
      ? { type:'text', html: BinaryLesson.bitTable(bitArray(n), [8, 4, 2, 1, 8, 4, 2, 1], true) }
      : { type:'bit_input', useNibbles:true, html:'<div class="bb-hex-pair"><div>' + hex(n)[0] + '</div><div>' + hex(n)[1] + '</div></div>' }));
  });
  return rows;
}

function buildYear9BinaryHexPracticeAp2Questions() {
  function bits(n) { return Number(n).toString(2).padStart(8, '0'); }
  function hex(n) { return Number(n).toString(16).toUpperCase().padStart(2, '0'); }
  function bitArray(n) { return bits(n).split('').map(function(b) { return Number(b); }); }
  function q(id, family, title, prompt, answer, opts) {
    return Object.assign({ id: id, family: family, title: title, prompt: prompt, answer: String(answer).toUpperCase(), marks: 1 }, opts || {});
  }
  var rows = [];
  [2, 7, 21, 84, 195].forEach(function(n, i) {
    rows.push(q('pbd' + (i + 1), 'binary_to_denary', 'Binary to denary', 'Convert this 8-bit binary number to denary.', String(n), { type:'text', html: BinaryLesson.bitTable(bitArray(n)) }));
  });
  [4, 13, 36, 112, 218].forEach(function(n, i) {
    rows.push(q('pdb' + (i + 1), 'denary_to_binary', 'Denary to binary', 'Convert ' + n + ' to 8-bit binary.', bits(n), { type:'bit_input', useNibbles:false }));
  });
  [[2, 5], [6, 7], [10, 13], [24, 19], [61, 86]].forEach(function(pair, i) {
    var total = pair[0] + pair[1];
    rows.push(q('pba' + (i + 1), 'binary_addition', 'Binary addition', 'Add these two binary numbers.', bits(total), { type:'addition_input', rowA: bitArray(pair[0]), rowB: bitArray(pair[1]), right: pair[0] + ' + ' + pair[1] + ' = ' + total + '.' }));
  });
  [12, 26, 45, 91, 190].forEach(function(n, i) {
    rows.push(q('phd' + (i + 1), 'hex_to_denary', 'Hex to denary', 'Convert ' + hex(n) + ' to denary.', String(n), { type:'text', html:'<div class="bb-hex-pair"><div>' + hex(n)[0] + '</div><div>' + hex(n)[1] + '</div></div>' }));
  });
  [14, 27, 58, 144, 236].forEach(function(n, i) {
    rows.push(q('pdh' + (i + 1), 'denary_to_hex', 'Denary to hex', 'Convert ' + n + ' to hexadecimal.', hex(n), { type:'text', html:'<div class="bb-hex-pair"><div>?</div><div>?</div></div>' }));
  });
  [13, 29, 62, 176, 254].forEach(function(n, i) {
    rows.push(q('pbh' + (i + 1), 'binary_hex_conversion', 'Binary and hex conversion', i % 2 === 0 ? 'Convert this binary number to hexadecimal.' : 'Convert ' + hex(n) + ' to 8-bit binary.', i % 2 === 0 ? hex(n) : bits(n), i % 2 === 0
      ? { type:'text', html: BinaryLesson.bitTable(bitArray(n), [8, 4, 2, 1, 8, 4, 2, 1], true) }
      : { type:'bit_input', useNibbles:true, html:'<div class="bb-hex-pair"><div>' + hex(n)[0] + '</div><div>' + hex(n)[1] + '</div></div>' }));
  });
  return rows;
}

function buildYear9BinaryHexPracticeAp2Criteria() {
  return buildYear9BinaryHexPracticeAp2Questions().map(function(q, i) {
    return { id: q.id, text: 'Q' + (i + 1) + ': ' + q.title, marks: 1, type: q.family };
  });
}

function buildYear8PythonAp2Questions() {
  function mcq(id, family, title, prompt, options, answer) {
    return { id:id, family:family, title:title, prompt:prompt, type:'mcq', options:options, answer:String(answer), marks:1 };
  }
  function text(id, family, title, prompt, answer) {
    return { id:id, family:family, title:title, prompt:prompt, type:'text', answer:String(answer), marks:1 };
  }
  function output(id, family, title, prompt, answer) {
    return { id:id, family:family, title:title, prompt:prompt, type:'output_text', answer:String(answer), marks:1 };
  }
  function code(id, family, title, prompt, patterns, sampleAnswer, opts) {
    return Object.assign({ id:id, family:family, title:title, prompt:prompt, type:'code_input', patterns:patterns, sampleAnswer:sampleAnswer, marks:1 }, opts || {});
  }
  return [
    mcq('p1', 'print_comments', 'print() output', 'What is displayed by this code?<pre class="mt-2 bg-gray-950 text-gray-100 rounded p-2">print("Hello")</pre>', ['Hello', '"Hello"', 'print', 'Nothing'], 0),
    output('p2', 'print_comments', 'Two-line output', 'Write the output of this code exactly. Put each line of output on its own line.<pre class="mt-2 bg-gray-950 text-gray-100 rounded p-2">print("Cat")\nprint("Dog")</pre>', 'Cat\nDog'),
    mcq('p3', 'print_comments', 'Comments', 'Which line is a comment in Python?', ['print("Hi")', '# print("Hi")', 'comment("Hi")', '// print("Hi")'], 1),
    code('p4', 'print_comments', 'Write a print statement', 'Write one line of Python that displays the word <strong>Welcome</strong>.', ["\\bprint\\s*\\(\\s*['\\\"]Welcome['\\\"]\\s*\\)"], 'print("Welcome")'),
    code('p5', 'print_comments', 'Two lines of output', 'Write Python code that displays <strong>Start</strong> on one line and <strong>End</strong> on the next line.', ["\\bprint\\s*\\(\\s*['\\\"]Start['\\\"]\\s*\\)", "\\bprint\\s*\\(\\s*['\\\"]End['\\\"]\\s*\\)"], 'print("Start")\nprint("End")'),

    text('v1', 'variables', 'Variable tracing', 'What is the value of <code>score</code> after this code runs?<pre class="mt-2 bg-gray-950 text-gray-100 rounded p-2">score = 4\nscore = score + 3</pre>', '7'),
    mcq('v2', 'variables', 'Variable purpose', 'Why is a variable useful?', ['It stores a value so it can be used later', 'It always prints text', 'It makes code run forever', 'It only works with comments'], 0),
    code('v3', 'variables', 'Create and print a variable', 'Create a variable called <code>name</code>, store <code>"Sam"</code> in it, then print the variable.', ["\\bname\\s*=\\s*['\\\"]Sam['\\\"]", '\\bprint\\s*\\(\\s*name\\s*\\)'], 'name = "Sam"\nprint(name)'),
    code('v4', 'variables', 'Update a number variable', 'Create a variable called <code>score</code> with the value <code>10</code>, add <code>5</code> to it, then print <code>score</code>.', ['\\bscore\\s*=\\s*10\\b', '\\bscore\\s*=\\s*score\\s*\\+\\s*5\\b|\\bscore\\s*\\+=\\s*5\\b', '\\bprint\\s*\\(\\s*score\\s*\\)'], 'score = 10\nscore = score + 5\nprint(score)'),

    code('i1', 'input', 'Store user input', 'Ask the user for their name and store the answer in a variable called <code>name</code>.', ['\\bname\\s*=\\s*input\\s*\\('], 'name = input("What is your name? ")'),
    code('i2', 'input', 'Input then output', 'Ask the user for their favourite colour, store it in <code>colour</code>, then print <code>colour</code>.', ['\\bcolour\\s*=\\s*input\\s*\\(', '\\bprint\\s*\\(\\s*colour\\s*\\)'], 'colour = input("Favourite colour? ")\nprint(colour)'),
    mcq('i3', 'input', 'Integer input', 'Which code correctly lets the user type a whole number and stores it as an integer?', ['age = input(int("Age?"))', 'age = int(input("Age?"))', 'int = input("Age?")', 'age = input("Age?") + int'], 1),
    code('i4', 'input', 'Number input calculation', 'Ask the user for a whole number, store it as an integer in <code>num</code>, then print <code>num + 1</code>.', ['\\bnum\\s*=\\s*int\\s*\\(\\s*input\\s*\\(', '\\bprint\\s*\\(\\s*num\\s*\\+\\s*1\\s*\\)'], 'num = int(input("Number: "))\nprint(num + 1)'),

    mcq('s1', 'selection', 'Selection condition', 'Which comparison checks whether <code>score</code> is at least 10?', ['score = 10', 'score > 10', 'score >= 10', 'score <= 10'], 2),
    code('s2', 'selection', 'Simple if statement', 'Write an if statement that prints <code>Win</code> when <code>score</code> is greater than <code>20</code>.', ['\\bif\\s+score\\s*>\\s*20\\s*:', "\\n\\s+print\\s*\\(\\s*['\\\"]Win['\\\"]\\s*\\)"], 'if score > 20:\n    print("Win")'),
    code('s3', 'selection', 'if and else', 'Write selection code that prints <code>Pass</code> if <code>mark</code> is at least <code>50</code>, otherwise prints <code>Try again</code>.', ['\\bif\\s+mark\\s*>=\\s*50\\s*:', "\\n\\s+print\\s*\\(\\s*['\\\"]Pass['\\\"]\\s*\\)", '\\belse\\s*:', "\\n\\s+print\\s*\\(\\s*['\\\"]Try again['\\\"]\\s*\\)"], 'if mark >= 50:\n    print("Pass")\nelse:\n    print("Try again")'),
    code('s4', 'selection', 'elif choice', 'Write code that prints <code>Gold</code> if <code>place</code> is 1, <code>Silver</code> if <code>place</code> is 2, otherwise <code>Keep trying</code>.', ['\\bif\\s+place\\s*==\\s*1\\s*:', '\\belif\\s+place\\s*==\\s*2\\s*:', '\\belse\\s*:', 'Gold', 'Silver', 'Keep trying'], 'if place == 1:\n    print("Gold")\nelif place == 2:\n    print("Silver")\nelse:\n    print("Keep trying")'),

    mcq('l1', 'loops', 'Loop count', 'How many times will this loop print <code>Hello</code>?<pre class="mt-2 bg-gray-950 text-gray-100 rounded p-2">for i in range(3):\n    print("Hello")</pre>', ['1', '2', '3', '4'], 2),
    code('l2', 'loops', 'For loop', 'Write a for loop that prints <code>Hi</code> five times.', ['\\bfor\\s+\\w+\\s+in\\s+range\\s*\\(\\s*5\\s*\\)\\s*:', "\\n\\s+print\\s*\\(\\s*['\\\"]Hi['\\\"]\\s*\\)"], 'for i in range(5):\n    print("Hi")'),
    code('l3', 'loops', 'While loop counter', 'Write a while loop that starts <code>count</code> at 1, prints it while it is less than or equal to 3, and increases it by 1 each time.', ['\\bcount\\s*=\\s*1\\b', '\\bwhile\\s+count\\s*<=\\s*3\\s*:', '\\n\\s+print\\s*\\(\\s*count\\s*\\)', '\\bcount\\s*=\\s*count\\s*\\+\\s*1\\b|\\bcount\\s*\\+=\\s*1\\b'], 'count = 1\nwhile count <= 3:\n    print(count)\n    count = count + 1')
  ];
}

function buildYear8PythonPracticeAp2Questions() {
  function mcq(id, family, title, prompt, options, answer) {
    return { id:id, family:family, title:title, prompt:prompt, type:'mcq', options:options, answer:String(answer), marks:1 };
  }
  function text(id, family, title, prompt, answer) {
    return { id:id, family:family, title:title, prompt:prompt, type:'text', answer:String(answer), marks:1 };
  }
  function output(id, family, title, prompt, answer) {
    return { id:id, family:family, title:title, prompt:prompt, type:'output_text', answer:String(answer), marks:1 };
  }
  function code(id, family, title, prompt, patterns, sampleAnswer, opts) {
    return Object.assign({ id:id, family:family, title:title, prompt:prompt, type:'code_input', patterns:patterns, sampleAnswer:sampleAnswer, marks:1 }, opts || {});
  }
  return [
    mcq('pp1', 'print_comments', 'print() output', 'What is displayed by this code?<pre class="mt-2 bg-gray-950 text-gray-100 rounded p-2">print("Ready")</pre>', ['Ready', '"Ready"', 'print Ready', 'Nothing'], 0),
    output('pp2', 'print_comments', 'Two-line output', 'Write the output of this code exactly. Put each line of output on its own line.<pre class="mt-2 bg-gray-950 text-gray-100 rounded p-2">print("Red")\nprint("Blue")</pre>', 'Red\nBlue'),
    mcq('pp3', 'print_comments', 'Comments', 'Which line would Python ignore because it is a comment?', ['print("Score")', '# score check', 'comment = "Score"', 'input("Score")'], 1),
    code('pp4', 'print_comments', 'Write a print statement', 'Write one line of Python that displays the word <strong>Practice</strong>.', ["\\bprint\\s*\\(\\s*['\\\"]Practice['\\\"]\\s*\\)"], 'print("Practice")'),
    code('pp5', 'print_comments', 'Two lines of output', 'Write Python code that displays <strong>One</strong> on one line and <strong>Two</strong> on the next line.', ["\\bprint\\s*\\(\\s*['\\\"]One['\\\"]\\s*\\)", "\\bprint\\s*\\(\\s*['\\\"]Two['\\\"]\\s*\\)"], 'print("One")\nprint("Two")'),

    text('pv1', 'variables', 'Variable tracing', 'What is the value of <code>total</code> after this code runs?<pre class="mt-2 bg-gray-950 text-gray-100 rounded p-2">total = 6\ntotal = total + 4</pre>', '10'),
    mcq('pv2', 'variables', 'Variable value', 'After <code>lives = 3</code>, what value is stored in <code>lives</code>?', ['3', 'lives', '0', 'A comment'], 0),
    code('pv3', 'variables', 'Create and print a variable', 'Create a variable called <code>player</code>, store <code>"Alex"</code> in it, then print the variable.', ["\\bplayer\\s*=\\s*['\\\"]Alex['\\\"]", '\\bprint\\s*\\(\\s*player\\s*\\)'], 'player = "Alex"\nprint(player)'),
    code('pv4', 'variables', 'Update a number variable', 'Create a variable called <code>points</code> with the value <code>8</code>, add <code>2</code> to it, then print <code>points</code>.', ['\\bpoints\\s*=\\s*8\\b', '\\bpoints\\s*=\\s*points\\s*\\+\\s*2\\b|\\bpoints\\s*\\+=\\s*2\\b', '\\bprint\\s*\\(\\s*points\\s*\\)'], 'points = 8\npoints = points + 2\nprint(points)'),

    code('pi1', 'input', 'Store user input', 'Ask the user for their town and store the answer in a variable called <code>town</code>.', ['\\btown\\s*=\\s*input\\s*\\('], 'town = input("Town: ")'),
    code('pi2', 'input', 'Input then output', 'Ask the user for their favourite subject, store it in <code>subject</code>, then print <code>subject</code>.', ['\\bsubject\\s*=\\s*input\\s*\\(', '\\bprint\\s*\\(\\s*subject\\s*\\)'], 'subject = input("Favourite subject? ")\nprint(subject)'),
    mcq('pi3', 'input', 'Integer input', 'Which code stores typed input as a whole number?', ['num = input("Number: ")', 'num = int(input("Number: "))', 'num = input(int)', 'int(input) = num'], 1),
    code('pi4', 'input', 'Number input calculation', 'Ask the user for a whole number, store it as an integer in <code>age</code>, then print <code>age + 2</code>.', ['\\bage\\s*=\\s*int\\s*\\(\\s*input\\s*\\(', '\\bprint\\s*\\(\\s*age\\s*\\+\\s*2\\s*\\)'], 'age = int(input("Age: "))\nprint(age + 2)'),

    mcq('ps1', 'selection', 'Selection condition', 'Which comparison checks whether <code>temperature</code> is below 5?', ['temperature < 5', 'temperature = 5', 'temperature > 5', 'temperature == below 5'], 0),
    code('ps2', 'selection', 'Simple if statement', 'Write an if statement that prints <code>Cold</code> when <code>temperature</code> is less than <code>5</code>.', ['\\bif\\s+temperature\\s*<\\s*5\\s*:', "\\n\\s+print\\s*\\(\\s*['\\\"]Cold['\\\"]\\s*\\)"], 'if temperature < 5:\n    print("Cold")'),
    code('ps3', 'selection', 'if and else', 'Write selection code that prints <code>Adult</code> if <code>age</code> is at least <code>18</code>, otherwise prints <code>Child</code>.', ['\\bif\\s+age\\s*>=\\s*18\\s*:', "\\n\\s+print\\s*\\(\\s*['\\\"]Adult['\\\"]\\s*\\)", '\\belse\\s*:', "\\n\\s+print\\s*\\(\\s*['\\\"]Child['\\\"]\\s*\\)"], 'if age >= 18:\n    print("Adult")\nelse:\n    print("Child")'),
    code('ps4', 'selection', 'elif choice', 'Write code that prints <code>Excellent</code> if <code>mark</code> is 80 or more, <code>Good</code> if <code>mark</code> is 50 or more, otherwise <code>Revise</code>.', ['\\bif\\s+mark\\s*>=\\s*80\\s*:', '\\belif\\s+mark\\s*>=\\s*50\\s*:', '\\belse\\s*:', 'Excellent', 'Good', 'Revise'], 'if mark >= 80:\n    print("Excellent")\nelif mark >= 50:\n    print("Good")\nelse:\n    print("Revise")'),

    mcq('pl1', 'loops', 'Loop count', 'How many times will this loop print <code>Go</code>?<pre class="mt-2 bg-gray-950 text-gray-100 rounded p-2">for i in range(4):\n    print("Go")</pre>', ['2', '3', '4', '5'], 2),
    code('pl2', 'loops', 'For loop', 'Write a for loop that prints <code>Loop</code> three times.', ['\\bfor\\s+\\w+\\s+in\\s+range\\s*\\(\\s*3\\s*\\)\\s*:', "\\n\\s+print\\s*\\(\\s*['\\\"]Loop['\\\"]\\s*\\)"], 'for i in range(3):\n    print("Loop")'),
    code('pl3', 'loops', 'While loop counter', 'Write a while loop that starts <code>num</code> at 1, prints it while it is less than or equal to 4, and increases it by 1 each time.', ['\\bnum\\s*=\\s*1\\b', '\\bwhile\\s+num\\s*<=\\s*4\\s*:', '\\n\\s+print\\s*\\(\\s*num\\s*\\)', '\\bnum\\s*=\\s*num\\s*\\+\\s*1\\b|\\bnum\\s*\\+=\\s*1\\b'], 'num = 1\nwhile num <= 4:\n    print(num)\n    num = num + 1')
  ];
}

function buildYear8PythonAp2Criteria() {
  return buildYear8PythonAp2Questions().map(function(q, i) {
    return { id: q.id, text: 'Q' + (i + 1) + ': ' + q.title, marks: 1, type: q.family };
  });
}

function buildYear8PythonPracticeAp2Criteria() {
  return buildYear8PythonPracticeAp2Questions().map(function(q, i) {
    return { id: q.id, text: 'Q' + (i + 1) + ': ' + q.title, marks: 1, type: q.family };
  });
}

var ASSESSMENTS = {
  'year8-ap2-practice-python': {
    id: 'year8-ap2-practice-python',
    title: 'Practice Year 8 AP2 Python',
    type: 'python-code',
    maxScore: 20,
    brief: 'Practice the Year 8 Python AP2 format with similar skills but different questions. It is front loaded towards print, variables, input and selection, with only the final three questions on loops.',
    criteria: buildYear8PythonPracticeAp2Criteria(),
    questions: buildYear8PythonPracticeAp2Questions()
  },
  'year8-ap2-python': {
    id: 'year8-ap2-python',
    title: 'Year 8 AP2 Python',
    type: 'python-code',
    maxScore: 20,
    brief: 'Answer 20 self-paced Python questions. The assessment is front loaded towards print, variables, input and selection, with only the final three questions on loops.',
    criteria: buildYear8PythonAp2Criteria(),
    questions: buildYear8PythonAp2Questions()
  },
  'year9-ap2-practice-binary-hex': {
    id: 'year9-ap2-practice-binary-hex',
    title: 'Practice Year 9 AP2 Binary & Hexadecimal',
    type: 'binary-hex',
    maxScore: 30,
    brief: 'Practice the Year 9 Binary & Hexadecimal AP2 format with similar conversion and addition skills but different numbers.',
    criteria: buildYear9BinaryHexPracticeAp2Criteria(),
    questions: buildYear9BinaryHexPracticeAp2Questions()
  },
  'year9-ap2-binary-hex': {
    id: 'year9-ap2-binary-hex',
    title: 'Year 9 AP2 Binary & Hexadecimal',
    type: 'binary-hex',
    maxScore: 30,
    brief: 'Answer 30 self-paced conversion questions. There are five questions from each type, and each set gets gradually harder.',
    criteria: buildYear9BinaryHexAp2Criteria(),
    questions: buildYear9BinaryHexAp2Questions()
  },
  'year8-ap2-binary-hex': {
    id: 'year8-ap2-binary-hex',
    title: 'Year 9 AP2 Binary & Hexadecimal',
    type: 'binary-hex',
    maxScore: 30,
    brief: 'Legacy id for Year 9 AP2 Binary & Hexadecimal results created before the assessment was renamed.',
    criteria: buildYear9BinaryHexAp2Criteria(),
    questions: buildYear9BinaryHexAp2Questions(),
    legacyOf: 'year9-ap2-binary-hex'
  },
  'year7-ap2-practice-scratch': {
    id: 'year7-ap2-practice-scratch',
    title: 'Practice Year 7 AP2 Scratch - Space Collector Game',
    maxScore: 21,
    brief: 'Create a space collector game in Scratch. This practice assessment checks the same kinds of Scratch skills as AP2, but uses a different theme and different objects.',
    validation: 'scratch-ap2-practice',
    criteria: [
      { id:'backdrop', text:'Add a space-themed background.', marks:2 },
      { id:'diver', text:'Create a player sprite such as an astronaut or spaceship.', marks:2 },
      { id:'movement', text:'Make the player move up, down, left and right using keys.', marks:4 },
      { id:'target', text:'Add a collectible sprite that moves to a random place when caught.', marks:2 },
      { id:'scorePlus', text:'Create a score or points variable and add 1 when the collectible is caught.', marks:3 },
      { id:'shark', text:'Create an obstacle sprite such as an alien, meteor or robot.', marks:2 },
      { id:'sharkChase', text:'Make the obstacle chase the player.', marks:2 },
      { id:'yum', text:'Make the obstacle say or think something when it touches the player.', marks:2 },
      { id:'scoreMinus', text:'Make the score or points change by -1 when the obstacle touches the player.', marks:2 }
    ]
  },
  'year7-ap2-scratch': {
    id: 'year7-ap2-scratch',
    title: 'Year 7 AP2 Scratch - Underwater Racing Game',
    maxScore: 21,
    brief: 'Create an underwater racing game in Scratch. The automated check looks for the project requirements from the assessment brief.',
    validation: 'scratch-ap2-real',
    criteria: [
      { id:'backdrop', text:'Add an underwater background.', marks:2 },
      { id:'diver', text:'Create a diver sprite.', marks:2 },
      { id:'movement', text:'Make the diver move up, down, left and right using keys.', marks:4 },
      { id:'target', text:'Add a sprite for the diver to chase that moves to a random place when caught.', marks:2 },
      { id:'scorePlus', text:'Create a score variable and add 1 when the diver catches the target sprite.', marks:3 },
      { id:'shark', text:'Create a shark sprite.', marks:2 },
      { id:'sharkChase', text:'Make the shark chase the diver.', marks:2 },
      { id:'yum', text:'Make the shark say Yum Yum for 5 seconds when it touches the diver.', marks:2 },
      { id:'scoreMinus', text:'Make the score change by -1 when the shark touches the diver.', marks:2 }
    ]
  }
};

function populateAssessmentSelect(selectId) {
  var select = document.getElementById(selectId);
  if (!select) return;
  var current = select.value;
  select.innerHTML = Object.keys(ASSESSMENTS).filter(function(id) {
    return !(ASSESSMENTS[id] && (ASSESSMENTS[id].hidden || ASSESSMENTS[id].legacyOf));
  }).map(function(id) {
    return '<option value="' + escapeHtml(id) + '">' + escapeHtml(ASSESSMENTS[id].title || id) + '</option>';
  }).join('');
  if (current && ASSESSMENTS[current] && !ASSESSMENTS[current].hidden && !ASSESSMENTS[current].legacyOf) select.value = current;
}

function openAssessmentSetup(className) {
  assessment.className = className;
  populateAssessmentSelect('ap-assessment-select');
  document.getElementById('ap-setup-class').textContent = className;
  document.getElementById('ap-force-class').checked = false;
  document.getElementById('modal-ap-setup').classList.remove('hidden');
  document.getElementById('modal-admin').classList.add('hidden');
}
