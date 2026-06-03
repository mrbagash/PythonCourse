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
  localScratchSb3SaveInFlight: false,
  lastMetadataSaveAt: 0,
  saveTimer: null,
  localScratchSb3Timer: null,
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
  return [
    {
      "id": "p1",
      "family": "print_comments",
      "title": "print() output",
      "prompt": "What exact text is displayed by this code? Do not include quote marks unless they would appear on the screen.<pre class=\"mt-2 bg-gray-950 text-gray-100 rounded p-2\">print(\"Hello\")</pre>",
      "type": "mcq",
      "options": [
        "Hello",
        "\"Hello\"",
        "print",
        "Nothing"
      ],
      "answer": "0",
      "marks": 1
    },
    {
      "id": "p2",
      "family": "print_comments",
      "title": "Two-line output",
      "prompt": "Write the output of this code exactly. Put each line of output on its own line. Do not include the word <code>print</code> or the quote marks.<pre class=\"mt-2 bg-gray-950 text-gray-100 rounded p-2\">print(\"Cat\")\nprint(\"Dog\")</pre>",
      "type": "output_text",
      "answer": "Cat\nDog",
      "marks": 1
    },
    {
      "id": "p3",
      "family": "print_comments",
      "title": "Comments",
      "prompt": "Which line would Python treat as a comment, meaning the line would be ignored when the program runs?",
      "type": "mcq",
      "options": [
        "print(\"Hi\")",
        "# print(\"Hi\")",
        "comment(\"Hi\")",
        "// print(\"Hi\")"
      ],
      "answer": "1",
      "marks": 1
    },
    {
      "id": "p4",
      "family": "print_comments",
      "title": "Write a print statement",
      "prompt": "Write one line of Python that displays the word <strong>Welcome</strong>. A comment is not required.",
      "type": "code_input",
      "sampleAnswer": "print(\"Welcome\")",
      "marks": 1,
      "keywordPatterns": [
        "\\bprint\\s*\\("
      ],
      "runTests": [
        {
          "expectedOutput": "Welcome"
        }
      ]
    },
    {
      "id": "p5",
      "family": "print_comments",
      "title": "Two lines of output",
      "prompt": "Write Python code that displays <strong>Start</strong> first and <strong>End</strong> second, on two separate output lines. A comment is not required.",
      "type": "code_input",
      "sampleAnswer": "print(\"Start\")\nprint(\"End\")",
      "marks": 1,
      "keywordPatterns": [
        "\\bprint\\s*\\("
      ],
      "runTests": [
        {
          "expectedOutput": "Start\nEnd"
        }
      ]
    },
    {
      "id": "v1",
      "family": "variables",
      "title": "Variable tracing",
      "prompt": "What number is stored in <code>score</code> after both lines have run? Type the number only.<pre class=\"mt-2 bg-gray-950 text-gray-100 rounded p-2\">score = 4\nscore = score + 3</pre>",
      "type": "text",
      "answer": "7",
      "marks": 1
    },
    {
      "id": "v2",
      "family": "variables",
      "title": "Variable purpose",
      "prompt": "Why is a variable useful?",
      "type": "mcq",
      "options": [
        "It stores a value so it can be used later",
        "It always prints text",
        "It makes code run forever",
        "It only works with comments"
      ],
      "answer": "0",
      "marks": 1
    },
    {
      "id": "v3",
      "family": "variables",
      "title": "Create and print a variable",
      "prompt": "Write Python code that uses a variable called <code>name</code> to store the text value <code>\"Sam\"</code> and displays the stored value. Do not print the word <code>name</code> in quote marks.",
      "type": "code_input",
      "sampleAnswer": "name = \"Sam\"\nprint(name)",
      "marks": 1,
      "keywordPatterns": [
        "\\b\\w+\\s*=",
        "\\bprint\\s*\\("
      ],
      "runTests": [
        {
          "expectedOutput": "Sam"
        }
      ]
    },
    {
      "id": "v4",
      "family": "variables",
      "title": "Update a number variable",
      "prompt": "Write Python code where <code>score</code> starts at <code>10</code>. The program should increase <code>score</code> by <code>5</code> and display the final value.",
      "type": "code_input",
      "sampleAnswer": "score = 10\nscore = score + 5\nprint(score)",
      "marks": 1,
      "keywordPatterns": [
        "\\b\\w+\\s*=",
        "[+\\-]",
        "\\bprint\\s*\\("
      ],
      "runTests": [
        {
          "expectedOutput": "15"
        }
      ]
    },
    {
      "id": "i1",
      "family": "input",
      "title": "Store user input",
      "prompt": "Write one line of Python that asks the user to type their name and stores what they type in a variable called <code>name</code>. Nothing needs to be printed.",
      "type": "code_input",
      "sampleAnswer": "name = input(\"What is your name? \")",
      "marks": 1,
      "keywordPatterns": [
        "\\binput\\s*\\("
      ],
      "runTests": [
        {
          "inputs": [
            "Sam"
          ],
          "expectedOutput": ""
        }
      ]
    },
    {
      "id": "i2",
      "family": "input",
      "title": "Input then output",
      "prompt": "Write Python code that asks for a favourite colour using <code>input()</code>. Store the response in <code>colour</code> and display the stored value.",
      "type": "code_input",
      "sampleAnswer": "colour = input(\"Favourite colour? \")\nprint(colour)",
      "marks": 1,
      "keywordPatterns": [
        "\\binput\\s*\\(",
        "\\bprint\\s*\\("
      ],
      "runTests": [
        {
          "inputs": [
            "Blue"
          ],
          "expectedOutput": "Blue"
        }
      ]
    },
    {
      "id": "i3",
      "family": "input",
      "title": "Integer input",
      "prompt": "Which code correctly lets the user type a whole number and stores it as an integer?",
      "type": "mcq",
      "options": [
        "age = input(int(\"Age?\"))",
        "age = int(input(\"Age?\"))",
        "int = input(\"Age?\")",
        "age = input(\"Age?\") + int"
      ],
      "answer": "1",
      "marks": 1
    },
    {
      "id": "i4",
      "family": "input",
      "title": "Number input calculation",
      "prompt": "Write Python code that asks for a whole number and displays one more than the number entered. The typed input must be treated as an integer and stored in <code>num</code>.",
      "type": "code_input",
      "sampleAnswer": "num = int(input(\"Number: \"))\nprint(num + 1)",
      "marks": 1,
      "keywordPatterns": [
        "\\binput\\s*\\(",
        "\\bint\\s*\\(",
        "\\bprint\\s*\\("
      ],
      "runTests": [
        {
          "inputs": [
            "6"
          ],
          "expectedOutput": "7"
        }
      ]
    },
    {
      "id": "s1",
      "family": "selection",
      "title": "Selection condition",
      "prompt": "Which comparison checks whether <code>score</code> is at least 10?",
      "type": "mcq",
      "options": [
        "score = 10",
        "score > 10",
        "score >= 10",
        "score <= 10"
      ],
      "answer": "2",
      "marks": 1
    },
    {
      "id": "s2",
      "family": "selection",
      "title": "Simple if statement",
      "prompt": "Write a complete <code>if</code> statement for this rule: when <code>score</code> is greater than <code>20</code>, the program displays <code>Win</code>.",
      "type": "code_input",
      "sampleAnswer": "if score > 20:\n    print(\"Win\")",
      "marks": 1,
      "keywordPatterns": [
        "\\bif\\b",
        "\\bprint\\s*\\("
      ],
      "runTests": [
        { "testValue": 25, "expectedOutput": "Win" },
        { "testValue": 20, "expectedOutput": "" },
        { "testValue": 10, "expectedOutput": "" }
      ]
    },
    {
      "id": "s3",
      "family": "selection",
      "title": "if and else",
      "prompt": "Write a complete <code>if</code>/<code>else</code> block for this rule: marks of <code>50</code> or more display <code>Pass</code>; all other marks display <code>Try again</code>.",
      "type": "code_input",
      "sampleAnswer": "if mark >= 50:\n    print(\"Pass\")\nelse:\n    print(\"Try again\")",
      "marks": 1,
      "keywordPatterns": [
        "\\bif\\b",
        "\\bprint\\s*\\("
      ],
      "runTests": [
        { "testValue": 55, "expectedOutput": "Pass" },
        { "testValue": 50, "expectedOutput": "Pass" },
        { "testValue": 40, "expectedOutput": "Try again" },
        { "testValue": 30, "expectedOutput": "Try again" }
      ]
    },
    {
      "id": "s4",
      "family": "selection",
      "title": "Trace if and else",
      "prompt": "What is printed when <code>score = 8</code>? Write the output exactly, without quote marks.<pre class=\"mt-2 bg-gray-950 text-gray-100 rounded p-2\">score = 8\nif score >= 10:\n    print(\"High\")\nelse:\n    print(\"Low\")</pre>",
      "type": "output_text",
      "answer": "Low",
      "marks": 1
    },
    {
      "id": "l1",
      "family": "loops",
      "title": "Loop count",
      "prompt": "How many times will this loop print <code>Hello</code>?<pre class=\"mt-2 bg-gray-950 text-gray-100 rounded p-2\">for i in range(3):\n    print(\"Hello\")</pre>",
      "type": "mcq",
      "options": [
        "1",
        "2",
        "3",
        "4"
      ],
      "answer": "2",
      "marks": 1
    },
    {
      "id": "l2",
      "family": "loops",
      "title": "For loop",
      "prompt": "Write a complete <code>for</code> loop that outputs <code>Hi</code> exactly five times. The print statement must be inside the loop.",
      "type": "code_input",
      "sampleAnswer": "for i in range(5):\n    print(\"Hi\")",
      "marks": 1,
      "keywordPatterns": [
        "\\bfor\\b",
        "\\brange\\s*\\(",
        "\\bprint\\s*\\("
      ],
      "runTests": [
        {
          "expectedOutput": "Hi\nHi\nHi\nHi\nHi"
        }
      ]
    },
    {
      "id": "l3",
      "family": "loops",
      "title": "While loop counter",
      "prompt": "Write a complete <code>while</code> loop using a counter variable called <code>count</code>. It should display <code>1</code>, <code>2</code> and <code>3</code>, each on its own line, then stop. The value of <code>count</code> must change inside the loop.",
      "type": "code_input",
      "sampleAnswer": "count = 1\nwhile count <= 3:\n    print(count)\n    count = count + 1",
      "marks": 1,
      "keywordPatterns": [
        "\\bwhile\\b",
        "\\bprint\\s*\\("
      ],
      "runTests": [
        {
          "expectedOutput": "1\n2\n3",
          "execLimit": 3000
        }
      ],
      "execLimit": 3000
    }
  ];
}
function buildYear8PythonPracticeAp2Questions() {
  return [
    {
      "id": "pp1",
      "family": "print_comments",
      "title": "print() output",
      "prompt": "What exact text is displayed by this code? Do not include quote marks unless they would appear on the screen.<pre class=\"mt-2 bg-gray-950 text-gray-100 rounded p-2\">print(\"Ready\")</pre>",
      "type": "mcq",
      "options": [
        "Ready",
        "\"Ready\"",
        "print Ready",
        "Nothing"
      ],
      "answer": "0",
      "marks": 1
    },
    {
      "id": "pp2",
      "family": "print_comments",
      "title": "Two-line output",
      "prompt": "Write the output of this code exactly. Put each line of output on its own line. Do not include the word <code>print</code> or the quote marks.<pre class=\"mt-2 bg-gray-950 text-gray-100 rounded p-2\">print(\"Red\")\nprint(\"Blue\")</pre>",
      "type": "output_text",
      "answer": "Red\nBlue",
      "marks": 1
    },
    {
      "id": "pp3",
      "family": "print_comments",
      "title": "Comments",
      "prompt": "Which line would Python ignore because it is a comment rather than code that runs?",
      "type": "mcq",
      "options": [
        "print(\"Score\")",
        "# score check",
        "comment = \"Score\"",
        "input(\"Score\")"
      ],
      "answer": "1",
      "marks": 1
    },
    {
      "id": "pp4",
      "family": "print_comments",
      "title": "Write a print statement",
      "prompt": "Write one line of Python that displays the word <strong>Practice</strong>. A comment is not required.",
      "type": "code_input",
      "sampleAnswer": "print(\"Practice\")",
      "marks": 1,
      "keywordPatterns": [
        "\\bprint\\s*\\("
      ],
      "runTests": [
        {
          "expectedOutput": "Practice"
        }
      ]
    },
    {
      "id": "pp5",
      "family": "print_comments",
      "title": "Two lines of output",
      "prompt": "Write Python code that displays <strong>One</strong> first and <strong>Two</strong> second, on two separate output lines. A comment is not required.",
      "type": "code_input",
      "sampleAnswer": "print(\"One\")\nprint(\"Two\")",
      "marks": 1,
      "keywordPatterns": [
        "\\bprint\\s*\\("
      ],
      "runTests": [
        {
          "expectedOutput": "One\nTwo"
        }
      ]
    },
    {
      "id": "pv1",
      "family": "variables",
      "title": "Variable tracing",
      "prompt": "What number is stored in <code>total</code> after both lines have run? Type the number only.<pre class=\"mt-2 bg-gray-950 text-gray-100 rounded p-2\">total = 6\ntotal = total + 4</pre>",
      "type": "text",
      "answer": "10",
      "marks": 1
    },
    {
      "id": "pv2",
      "family": "variables",
      "title": "Variable value",
      "prompt": "After <code>lives = 3</code>, what value is stored in <code>lives</code>?",
      "type": "mcq",
      "options": [
        "3",
        "lives",
        "0",
        "A comment"
      ],
      "answer": "0",
      "marks": 1
    },
    {
      "id": "pv3",
      "family": "variables",
      "title": "Create and print a variable",
      "prompt": "Write Python code that uses a variable called <code>player</code> to store the text value <code>\"Alex\"</code> and displays the stored value. Do not print the word <code>player</code> in quote marks.",
      "type": "code_input",
      "sampleAnswer": "player = \"Alex\"\nprint(player)",
      "marks": 1,
      "keywordPatterns": [
        "\\b\\w+\\s*=",
        "\\bprint\\s*\\("
      ],
      "runTests": [
        {
          "expectedOutput": "Alex"
        }
      ]
    },
    {
      "id": "pv4",
      "family": "variables",
      "title": "Update a number variable",
      "prompt": "Write Python code where <code>points</code> starts at <code>8</code>. The program should increase <code>points</code> by <code>2</code> and display the final value.",
      "type": "code_input",
      "sampleAnswer": "points = 8\npoints = points + 2\nprint(points)",
      "marks": 1,
      "keywordPatterns": [
        "\\b\\w+\\s*=",
        "[+\\-]",
        "\\bprint\\s*\\("
      ],
      "runTests": [
        {
          "expectedOutput": "10"
        }
      ]
    },
    {
      "id": "pi1",
      "family": "input",
      "title": "Store user input",
      "prompt": "Write one line of Python that asks the user to type their town and stores what they type in a variable called <code>town</code>. Nothing needs to be printed.",
      "type": "code_input",
      "sampleAnswer": "town = input(\"Town: \")",
      "marks": 1,
      "keywordPatterns": [
        "\\binput\\s*\\("
      ],
      "runTests": [
        {
          "inputs": [
            "Leeds"
          ],
          "expectedOutput": ""
        }
      ]
    },
    {
      "id": "pi2",
      "family": "input",
      "title": "Input then output",
      "prompt": "Write Python code that asks for a favourite subject using <code>input()</code>. Store the response in <code>subject</code> and display the stored value.",
      "type": "code_input",
      "sampleAnswer": "subject = input(\"Favourite subject? \")\nprint(subject)",
      "marks": 1,
      "keywordPatterns": [
        "\\binput\\s*\\(",
        "\\bprint\\s*\\("
      ],
      "runTests": [
        {
          "inputs": [
            "Math"
          ],
          "expectedOutput": "Math"
        }
      ]
    },
    {
      "id": "pi3",
      "family": "input",
      "title": "Integer input",
      "prompt": "Which code stores typed input as a whole number?",
      "type": "mcq",
      "options": [
        "num = input(\"Number: \")",
        "num = int(input(\"Number: \"))",
        "num = input(int)",
        "int(input) = num"
      ],
      "answer": "1",
      "marks": 1
    },
    {
      "id": "pi4",
      "family": "input",
      "title": "Number input calculation",
      "prompt": "Write Python code that asks for a whole number and displays two more than the number entered. The typed input must be treated as an integer and stored in <code>age</code>.",
      "type": "code_input",
      "sampleAnswer": "age = int(input(\"Age: \"))\nprint(age + 2)",
      "marks": 1,
      "keywordPatterns": [
        "\\binput\\s*\\(",
        "\\bint\\s*\\(",
        "\\bprint\\s*\\("
      ],
      "runTests": [
        {
          "inputs": [
            "10"
          ],
          "expectedOutput": "12"
        }
      ]
    },
    {
      "id": "ps1",
      "family": "selection",
      "title": "Selection condition",
      "prompt": "Which comparison checks whether <code>temperature</code> is below 5?",
      "type": "mcq",
      "options": [
        "temperature < 5",
        "temperature = 5",
        "temperature > 5",
        "temperature == below 5"
      ],
      "answer": "0",
      "marks": 1
    },
    {
      "id": "ps2",
      "family": "selection",
      "title": "Simple if statement",
      "prompt": "Write a complete <code>if</code> statement for this rule: when <code>temperature</code> is less than <code>5</code>, the program displays <code>Cold</code>.",
      "type": "code_input",
      "sampleAnswer": "if temperature < 5:\n    print(\"Cold\")",
      "marks": 1,
      "keywordPatterns": [
        "\\bif\\b",
        "\\bprint\\s*\\("
      ],
      "runTests": [
        { "testValue": 4, "expectedOutput": "Cold" },
        { "testValue": 5, "expectedOutput": "" },
        { "testValue": 10, "expectedOutput": "" }
      ]
    },
    {
      "id": "ps3",
      "family": "selection",
      "title": "if and else",
      "prompt": "Write a complete <code>if</code>/<code>else</code> block for this rule: ages of <code>18</code> or more display <code>Adult</code>; all other ages display <code>Child</code>.",
      "type": "code_input",
      "sampleAnswer": "if age >= 18:\n    print(\"Adult\")\nelse:\n    print(\"Child\")",
      "marks": 1,
      "keywordPatterns": [
        "\\bif\\b",
        "\\bprint\\s*\\("
      ],
      "runTests": [
        { "testValue": 20, "expectedOutput": "Adult" },
        { "testValue": 18, "expectedOutput": "Adult" },
        { "testValue": 12, "expectedOutput": "Child" },
        { "testValue": 17, "expectedOutput": "Child" }
      ]
    },
    {
      "id": "ps4",
      "family": "selection",
      "title": "Trace if and else",
      "prompt": "What is printed when <code>lives = 0</code>? Write the output exactly, without quote marks.<pre class=\"mt-2 bg-gray-950 text-gray-100 rounded p-2\">lives = 0\nif lives > 0:\n    print(\"Alive\")\nelse:\n    print(\"Game over\")</pre>",
      "type": "output_text",
      "answer": "Game over",
      "marks": 1
    },
    {
      "id": "pl1",
      "family": "loops",
      "title": "Loop count",
      "prompt": "How many times will this loop print <code>Go</code>?<pre class=\"mt-2 bg-gray-950 text-gray-100 rounded p-2\">for i in range(4):\n    print(\"Go\")</pre>",
      "type": "mcq",
      "options": [
        "2",
        "3",
        "4",
        "5"
      ],
      "answer": "2",
      "marks": 1
    },
    {
      "id": "pl2",
      "family": "loops",
      "title": "For loop",
      "prompt": "Write a complete <code>for</code> loop that outputs <code>Loop</code> exactly three times. The print statement must be inside the loop.",
      "type": "code_input",
      "sampleAnswer": "for i in range(3):\n    print(\"Loop\")",
      "marks": 1,
      "keywordPatterns": [
        "\\bfor\\b",
        "\\brange\\s*\\(",
        "\\bprint\\s*\\("
      ],
      "runTests": [
        {
          "expectedOutput": "Loop\nLoop\nLoop"
        }
      ]
    },
    {
      "id": "pl3",
      "family": "loops",
      "title": "While loop counter",
      "prompt": "Write a complete <code>while</code> loop using a counter variable called <code>num</code>. It should display <code>1</code>, <code>2</code>, <code>3</code> and <code>4</code>, each on its own line, then stop. The value of <code>num</code> must change inside the loop.",
      "type": "code_input",
      "sampleAnswer": "num = 1\nwhile num <= 4:\n    print(num)\n    num = num + 1",
      "marks": 1,
      "keywordPatterns": [
        "\\bwhile\\b",
        "\\bprint\\s*\\("
      ],
      "runTests": [
        {
          "expectedOutput": "1\n2\n3\n4",
          "execLimit": 3000
        }
      ],
      "execLimit": 3000
    }
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
