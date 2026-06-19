// ── STUDENT: Join quiz ─────────────────────────────────────────
document.getElementById('btn-join-quiz').onclick = function() {
  document.getElementById('input-lobby-code').value = '';
  document.getElementById('join-quiz-error').classList.add('hidden');
  document.getElementById('modal-join-quiz').classList.remove('hidden');
};

document.getElementById('btn-join-quiz-cancel').onclick = function() {
  document.getElementById('modal-join-quiz').classList.add('hidden');
};

// Prevent join-spam: track in-flight join request
var joinInProgress = false;

function stopForcedQuizWatcher() {
  if (state.forcedQuizRef && state.forcedQuizListener) {
    state.forcedQuizRef.off('value', state.forcedQuizListener);
  }
  state.forcedQuizRef = null;
  state.forcedQuizListener = null;
  state.forcedQuizCode = null;
}

function startForcedQuizWatcher(className) {
  stopForcedQuizWatcher();
  if (!className || state.isAdmin || !state.uid) return;
  state.forcedQuizRef = state.db.ref('classes/' + className + '/forcedQuiz');
  state.forcedQuizListener = state.forcedQuizRef.on('value', function(snap) {
    var forced = snap.val() || {};
    if (!forced.active || !forced.lobbyCode || String(forced.lessonId || '').indexOf('AP:') === 0) {
      state.forcedQuizCode = null;
      return;
    }
    if (state.forcedQuizCode === forced.lobbyCode && quiz.sessionRef) return;
    state.forcedQuizCode = forced.lobbyCode;
    joinQuizByCode(String(forced.lobbyCode), { forced: true, allowLate: true }).catch(function(e) {
      console.warn('Forced quiz join failed:', e.message);
    });
  });
}

document.getElementById('btn-join-quiz-submit').onclick = async function() {
  if (joinInProgress) return;
  var lobbyCode = document.getElementById('input-lobby-code').value.trim().toUpperCase();
  var errEl = document.getElementById('join-quiz-error');
  errEl.classList.add('hidden');
  if (!lobbyCode || lobbyCode.length !== 4) {
    errEl.textContent = 'Please enter a 4-digit code.'; errEl.classList.remove('hidden'); return;
  }

  joinInProgress = true;
  document.getElementById('btn-join-quiz-submit').disabled = true;
  try {
    await joinQuizByCode(lobbyCode, { forced: false, allowLate: true });
    document.getElementById('modal-join-quiz').classList.add('hidden');
  } catch(e) {
    try {
      await joinAssessmentByCode(lobbyCode, { forced: false });
      document.getElementById('modal-join-quiz').classList.add('hidden');
    } catch(apErr) {
      errEl.textContent = apErr.message || e.message || 'Error joining quiz.';
      errEl.classList.remove('hidden');
    }
  }
  joinInProgress = false;
  document.getElementById('btn-join-quiz-submit').disabled = false;
};

async function joinQuizByCode(lobbyCode, opts) {
  opts = opts || {};
  if (!state.uid || state.isAdmin) throw new Error('Students need to be logged in to join a quiz.');
  if (!lobbyCode || String(lobbyCode).length !== 4) throw new Error('Please enter a 4-digit code.');
  if (quiz.sessionRef && quiz.lobbyCode === lobbyCode && !quiz.displaced) {
    return;
  }

  var sessionRef = state.db.ref('quizSessions/' + lobbyCode);
  var snap = await sessionRef.get();
  if (!snap.exists()) throw new Error('No quiz found with that code.');
  if (String(snap.child('lessonId').val() || '').indexOf('AP:') === 0) throw new Error('That code is for an assessment.');
  var sessionState = snap.child('state').val();
  if (sessionState === 'finished') throw new Error('That quiz has already finished.');
  if (!opts.allowLate && sessionState !== 'lobby') throw new Error('No open lobby found with that code.');

  if (quiz.sessionRef && quiz.lobbyCode !== lobbyCode) {
    exitStudentQuiz({ removePlayer: false, keepForced: true });
  }

  var playerRef = sessionRef.child('players/' + state.uid);
  var playerData = {
    joinedAt: Date.now(),
    kicked: false,
    activeClientId: state.quizClientId,
    lastSeenAt: Date.now(),
    forced: !!opts.forced
  };
  var result = await playerRef.transaction(function(current) {
    if (current && current.kicked && !opts.forced) return;
    return Object.assign({}, current || {}, playerData);
  });

  if (!result.committed) throw new Error('You cannot rejoin this quiz right now.');

  quiz.lobbyCode  = lobbyCode;
  quiz.sessionRef = sessionRef;
  quiz.myScore    = 0;
  quiz.myAnswered = false;
  quiz.myScored   = {};
  quiz.forced     = !!opts.forced || snap.child('forced').val() === true;
  quiz.displaced  = false;
  quiz.currentStudentQuestionKey = null;
  quiz.currentStudentRevealKey = null;
  var joinedQuestions = snap.val().questions || [];
  showStudentScreen(lobbyCode, Array.isArray(joinedQuestions) ? joinedQuestions : Object.values(joinedQuestions), { forced: quiz.forced });
}

document.getElementById('btn-join-quiz-cancel').onclick = function() {
  document.getElementById('modal-join-quiz').classList.add('hidden');
};

// ── STUDENT: Screen ────────────────────────────────────────────
function setStudentView(view) {
  ['lobby','kicked','question','reveal','finished'].forEach(function(v) {
    document.getElementById('qs-' + v).classList.toggle('hidden', v !== view);
  });
}

function updateForcedQuizChrome() {
  var exitBtn = document.getElementById('btn-quiz-student-exit');
  var homeBtn = document.getElementById('btn-quiz-student-home');
  if (exitBtn) exitBtn.classList.toggle('hidden', !!quiz.forced);
  if (homeBtn) homeBtn.classList.toggle('hidden', !!quiz.forced);
}

function showQuizDisplacedMessage() {
  document.getElementById('quiz-student-screen').classList.remove('hidden');
  ['lobby','kicked','question','reveal','finished'].forEach(function(v) {
    document.getElementById('qs-' + v).classList.add('hidden');
  });
  var lobby = document.getElementById('qs-lobby');
  lobby.classList.remove('hidden');
  lobby.innerHTML =
    '<div class="text-5xl mb-4">&#x1F5A5;</div>' +
    '<h2 class="text-xl font-bold mb-2">Quiz moved to another tab</h2>' +
    '<p class="text-gray-400 text-sm">This tab has been disconnected because the quiz was opened somewhere else.</p>';
}


function showStudentScreen(lobbyCode, questions, opts) {
  opts = opts || {};
  quiz.questions = questions;
  quiz.forced = !!opts.forced;
  quiz.displaced = false;
  document.getElementById('qs-lobby').innerHTML =
    '<div class="text-5xl mb-4">&#x23F3;</div>' +
    '<h2 class="text-xl font-bold mb-2">You are in the lobby!</h2>' +
    '<p class="text-gray-400 text-sm">Wait for your teacher to start the quiz&#x2026;</p>' +
    '<p id="qs-my-code" class="text-gray-500 text-xs mt-4"></p>';
  document.getElementById('quiz-student-screen').classList.remove('hidden');
  document.getElementById('qs-my-code').textContent = 'Your code: ' + state.uid;
  updateForcedQuizChrome();
  setStudentView('lobby');

  var sessionRef = state.db.ref('quizSessions/' + lobbyCode);

  // If the same student opens the quiz in a newer tab, that newer tab owns the
  // session. The old tab stops listening and shows a disconnected message.
  var activeClientRef = sessionRef.child('players/' + state.uid + '/activeClientId');
  var activeClientListener = activeClientRef.on('value', function(snap) {
    var activeClientId = snap.val();
    if (activeClientId && activeClientId !== state.quizClientId) {
      quiz.displaced = true;
      exitStudentQuiz({ removePlayer: false, displaced: true, keepForced: true });
    }
  });
  quiz.unsubscribers.push(function() { activeClientRef.off('value', activeClientListener); });

  // Listen to kicked state
  var kickedRef = sessionRef.child('players/' + state.uid + '/kicked');
  var kickedListener = kickedRef.on('value', function(snap) {
    if (snap.val() === true) setStudentView('kicked');
  });
  quiz.unsubscribers.push(function() { kickedRef.off('value', kickedListener); });

  // Listen only to the narrow fields that drive state transitions — avoids
  // downloading the full session (including all player answers) on every submission.
  var latestQzState = null;
  var latestQIdx = 0;
  var stateReady = false;
  var qIdxReady = false;

  function handleQuizStateChange() {
    if (!stateReady || !qIdxReady) return; // Wait for both listeners to fire once
    var qzState = latestQzState;
    var qIdx = latestQIdx;

    if (qzState === null) {
      // Session may have been deleted
      if (quiz.missingSessionTimer) return;
      quiz.missingSessionTimer = setTimeout(function() {
        var stillThisQuiz = quiz.sessionRef && quiz.sessionRef.toString() === sessionRef.toString();
        quiz.missingSessionTimer = null;
        if (!stillThisQuiz) return;
        sessionRef.get().then(function(latest) {
          if (!latest.exists()) exitStudentQuiz({ removePlayer: false });
        }).catch(function() {});
      }, 3000);
      return;
    }
    if (quiz.missingSessionTimer) { clearTimeout(quiz.missingSessionTimer); quiz.missingSessionTimer = null; }

    if (qzState === 'lobby') {
      quiz.currentStudentQuestionKey = null;
      quiz.currentStudentRevealKey = null;
      setStudentView('lobby');
    } else if (qzState === 'question') {
      // Fetch only the small fields we need — not the full session
      Promise.all([
        sessionRef.child('questionStart').get(),
        sessionRef.child('questionDuration').get(),
        sessionRef.child('answers/' + qIdx + '/' + state.uid).get(),
      ]).then(function(snaps) {
        var questionStart    = snaps[0].val();
        var questionDuration = snaps[1].val();
        var myAnswered       = snaps[2].exists();
        var questionKey = qIdx + ':' + questionStart;
        if (quiz.currentStudentQuestionKey !== questionKey) {
          quiz.currentStudentQuestionKey = questionKey;
          quiz.currentStudentRevealKey = null;
          quiz.myAnswered = myAnswered;
          // questions were passed on join; fall back to a one-time fetch if missing
          if (quiz.questions && quiz.questions[qIdx]) {
            renderStudentQuestion(qIdx, questionStart, questionDuration);
            if (myAnswered) lockStudentAnswers();
          } else {
            sessionRef.child('questions').get().then(function(qSnap) {
              if (qSnap.exists()) quiz.questions = Object.values(qSnap.val());
              renderStudentQuestion(qIdx, questionStart, questionDuration);
              if (myAnswered) lockStudentAnswers();
            });
          }
        }
      });
    } else if (qzState === 'answer') {
      quiz.currentStudentQuestionKey = null;
      if (quiz.currentStudentRevealKey !== String(qIdx)) {
        quiz.currentStudentRevealKey = String(qIdx);
        var q = quiz.questions && quiz.questions[qIdx];
        if (q) {
          renderStudentReveal(q, qIdx);
        } else {
          sessionRef.child('questions').get().then(function(qSnap) {
            if (qSnap.exists()) quiz.questions = Object.values(qSnap.val());
            renderStudentReveal(quiz.questions[qIdx], qIdx);
          });
        }
      }
    } else if (qzState === 'finished') {
      quiz.currentStudentQuestionKey = null;
      quiz.currentStudentRevealKey = null;
      quiz.forced = false;
      updateForcedQuizChrome();
      setStudentView('finished');
      document.getElementById('qs-final-score').textContent =
        'You scored ' + quiz.myScore + ' / ' + quizMaxScore(quiz.questions);
      sessionRef.child('leaderboard').get().then(function(lb) {
        if (lb.exists()) renderStudentLeaderboard(lb.val());
      });
      quiz.unsubscribers.forEach(function(fn) { fn(); });
      quiz.unsubscribers = [];
    }
  }

  var stateChildRef = sessionRef.child('state');
  var qIdxChildRef  = sessionRef.child('questionIdx');
  var stateChildListener = stateChildRef.on('value', function(snap) {
    latestQzState = snap.val();
    stateReady = true;
    handleQuizStateChange();
  });
  var qIdxChildListener = qIdxChildRef.on('value', function(snap) {
    latestQIdx = snap.val() || 0;
    qIdxReady = true;
    handleQuizStateChange();
  });
  quiz.unsubscribers.push(function() {
    stateChildRef.off('value', stateChildListener);
    qIdxChildRef.off('value', qIdxChildListener);
  });
}

function sbLogDevice() {
  if (sbLogDevice._done) return;
  sbLogDevice._done = true;
  console.log('[ScratchBlocks device] dpr=' + window.devicePixelRatio +
    ' screen=' + screen.width + 'x' + screen.height +
    ' inner=' + window.innerWidth + 'x' + window.innerHeight +
    ' ua=' + navigator.userAgent.slice(0, 120));
  if (window.document && document.fonts) {
    console.log('[ScratchBlocks device] fonts.status=' + document.fonts.status);
  }
  // Check whether scratchblocks' injected CSS is actually being applied
  try {
    var probe = document.createElement('span');
    probe.className = 'sb3-label';
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
    var pcs = getComputedStyle(probe);
    console.log('[ScratchBlocks device] .sb3-label computed: font-family=' + pcs.fontFamily +
      ' font-weight=' + pcs.fontWeight + ' font-size=' + pcs.fontSize +
      ' (if font-family is serif/sans-serif only, scratchblocks CSS did NOT load)');
    document.body.removeChild(probe);
  } catch(e) {}
  // Canvas font resolution — shows which fallback the browser actually uses for measurement
  try {
    var c = document.createElement('canvas').getContext('2d');
    c.font = '500 12pt Helvetica Neue, Helvetica, sans-serif';
    var resolved = c.font;
    var w1 = c.measureText('if <> then').width;
    console.log('[ScratchBlocks device] canvas resolved font: "' + resolved + '"');
    console.log('[ScratchBlocks device] canvas measureText("if <> then")=' + w1.toFixed(1) + 'px');
  } catch(e) {}
  // aspect-ratio CSS support check
  console.log('[ScratchBlocks device] aspect-ratio CSS supported: ' + ('aspectRatio' in document.documentElement.style));
}

function sbLogSvg(svg, label) {
  var vb = svg.getAttribute('viewBox');
  var w  = svg.getAttribute('width');
  var h  = svg.getAttribute('height');
  console.log('[ScratchBlocks ' + label + '] viewBox="' + vb + '" attr w=' + w + ' h=' + h);
  requestAnimationFrame(function() {
    var texts = svg.querySelectorAll('text');
    var tInfo = 'no <text>';
    if (texts.length) {
      var tcs = getComputedStyle(texts[0]);
      tInfo = 'font-family=' + tcs.fontFamily +
              ' font-weight=' + tcs.fontWeight +
              ' font-size=' + tcs.fontSize;
    }
    console.log('[ScratchBlocks ' + label + '] rendered offsetW=' + svg.offsetWidth +
      ' offsetH=' + svg.offsetHeight + ' aspectRatio=' + svg.style.aspectRatio +
      ' | text[0]: ' + tInfo);
  });
}

function renderTextWithBlocks(el, text) {
  var str = String(text || '');
  if (!window.scratchblocks || str.indexOf('<sb>') === -1) {
    safeText(el, text);
    return;
  }
  el.innerHTML = '';
  var parts = str.split(/(<sb>[\s\S]*?<\/sb>)/);
  parts.forEach(function(part) {
    var match = part.match(/^<sb>([\s\S]*?)<\/sb>$/);
    if (match) {
      try {
        var script = scratchblocks.parse(match[1], { style: 'scratch3' });
        var svg = scratchblocks.render(script, { style: 'scratch3' });
        sbLogDevice();
        sbLogSvg(svg, 'sb-inline');
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.style.display        = 'inline-block';
        svg.style.height         = '2em';
        svg.style.width          = 'auto';
        svg.style.verticalAlign  = 'middle';
        svg.style.overflow       = 'hidden';
        svg.style.pointerEvents  = 'none';
        svg.style.fontWeight     = 'normal';
        svg.style.fontStyle      = 'normal';
        el.appendChild(svg);
      } catch(e) {
        console.error('[ScratchBlocks sb-inline] render error:', e);
        el.appendChild(document.createTextNode(match[1]));
      }
    } else if (part) {
      var lines = part.split('\n');
      lines.forEach(function(line, i) {
        if (i > 0) el.appendChild(document.createElement('br'));
        if (line) el.appendChild(document.createTextNode(line));
      });
    }
  });
}

function safeText(el, text) {
  // Questions use \n\n to separate the question from the code snippet.
  // Render the code part in monospace for readability.
  var str = String(text || '');
  var parts = str.split('\n\n');
  if (parts.length >= 2) {
    // First part: question text; rest: code snippet
    var questionText = parts[0];
    var codeText = parts.slice(1).join('\n\n');
    el.innerHTML =
      '<span>' + questionText.replace(/\n/g, '<br>') + '</span>' +
      '<pre class="mt-3 bg-gray-700/60 rounded-lg px-4 py-3 text-left text-sm font-mono text-green-300 whitespace-pre-wrap">' +
      codeText.replace(/</g, '&lt;').replace(/>/g, '&gt;') +
      '</pre>';
  } else {
    el.innerHTML = str.replace(/\n/g, '<br>');
  }
}

function ensureQuizSpreadsheetAssets(cb) {
  function addCss(u) {
    if (!document.querySelector('link[href="' + u + '"]')) {
      var l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = u;
      document.head.appendChild(l);
    }
  }
  function addScript(u, done) {
    var existing = document.querySelector('script[data-jhncc-src="' + u + '"]');
    if (existing) {
      if (existing.getAttribute('data-loaded') === '1') done();
      else existing.addEventListener('load', done, { once: true });
      return;
    }
    var s = document.createElement('script');
    s.setAttribute('data-jhncc-src', u);
    s.src = u;
    s.onload = function() { s.setAttribute('data-loaded', '1'); done(); };
    s.onerror = function() {
      var fb = document.getElementById('qs-spreadsheet-feedback');
      if (fb) fb.textContent = 'The spreadsheet tool could not load. Please refresh and try again.';
    };
    document.head.appendChild(s);
  }
  addCss('assets/css/jsuites.css');
  addCss('assets/css/jspreadsheet.css');
  addScript('assets/js/jsuites.js', function() {
    addScript('assets/js/jspreadsheet.js', function() {
      addScript('assets/js/jspreadsheet-formula-bar.js?v=22', function() {
        addScript('assets/js/jspreadsheet-chart.js?v=2', cb);
      });
    });
  });
}

function quizSpreadsheetCellToCoords(cell) {
  var m = String(cell || '').toUpperCase().match(/^([A-Z]+)([0-9]+)$/);
  if (!m) return null;
  var x = 0;
  for (var i = 0; i < m[1].length; i++) x = x * 26 + (m[1].charCodeAt(i) - 64);
  return { x: x - 1, y: parseInt(m[2], 10) - 1 };
}

function renderQuizSpreadsheetTask(qIdx, q) {
  quiz.currentSpreadsheet = null;
  var holder = document.getElementById('qs-spreadsheet-sheet');
  var fb = document.getElementById('qs-spreadsheet-feedback');
  var btn = document.getElementById('btn-quiz-submit-spreadsheet');
  holder.innerHTML = '';
  fb.textContent = 'Loading spreadsheet...';
  btn.disabled = true;
  btn.onclick = null;
  ensureQuizSpreadsheetAssets(function() {
    holder.innerHTML = '';
    var columns = Array.isArray(q.columns) && q.columns.length ? q.columns : null;
    if (!columns && Array.isArray(q.sheetData) && q.sheetData[0]) {
      columns = q.sheetData[0].map(function() { return { width: 120 }; });
    }
    var sheet = jspreadsheet(holder, {
      data: q.sheetData || [['']],
      columns: columns,
      minDimensions: [
        Math.max((q.sheetData && q.sheetData[0] && q.sheetData[0].length) || 1, q.minColumns || 1),
        Math.max((q.sheetData && q.sheetData.length) || 1, q.minRows || 1)
      ],
      tableOverflow: true,
      tableWidth: '100%',
      toolbar: false,
      about: false
    });
    if (typeof JHNCCAddFormulaBar === 'function') JHNCCAddFormulaBar(holder, sheet);
    if (typeof JHNCCAddFormatToolbar === 'function') JHNCCAddFormatToolbar(holder, sheet);
    if (typeof JHNCCAddSheetTabs === 'function') JHNCCAddSheetTabs(holder, sheet);
    // If the question defines a chart config, render a live chart below the sheet
    if (q.chart && typeof JHNCCAddChart === 'function') {
      JHNCCAddChart(holder, sheet, q.chart);
    }
    var firstCheck = Array.isArray(q.checks) && q.checks.length ? quizSpreadsheetCellToCoords(q.checks[0].cell) : null;
    if (firstCheck && typeof sheet.updateSelectionFromCoords === 'function') {
      setTimeout(function() {
        try {
          sheet.updateSelectionFromCoords(firstCheck.x, firstCheck.y, firstCheck.x, firstCheck.y);
        } catch(e) {}
      }, 0);
    }
    quiz.currentSpreadsheet = { sheet: sheet, question: q };
    fb.textContent = 'Complete the spreadsheet task, then submit.';
    btn.disabled = false;
    btn.onclick = function() { submitStudentSpreadsheetAnswer(qIdx); };
  });
}

function renderStudentQuestion(qIdx, questionStart, duration) {
  setStudentView('question');
  var q = quiz.questions[qIdx];
  if (!q) return;

  renderTextWithBlocks(document.getElementById('qs-q-text'), q.q);
  var quizVisual = document.getElementById('qs-q-visual');
  if (q.html) {
    quizVisual.innerHTML = q.html;
    quizVisual.classList.remove('hidden');
  } else {
    quizVisual.innerHTML = '';
    quizVisual.classList.add('hidden');
  }
  document.getElementById('qs-q-progress').textContent =
    'Question ' + (qIdx + 1) + ' of ' + quiz.questions.length;
  document.getElementById('qs-answered-msg').classList.add('hidden');
  var codeFeedback = document.getElementById('qs-code-feedback');
  codeFeedback.textContent = '';
  codeFeedback.className = 'quiz-code-feedback';

  var isTextInput = q.type === 'text_input';
  var isWidget = q.type === 'bit_input' || q.type === 'addition_input';
  var isScratch = q.type === 'scratch_build';
  var isPyBot = q.type === 'pybot_level';
  var isBlockbench = q.type === 'blockbench_build';
  var isSpreadsheet = q.type === 'spreadsheet_task';
  var isPyScratch = q.type === 'pyscratch_build';
  var isCodeQuestion = q.type && q.type !== 'mcq' && q.type !== 'scratch_mcq' && !isTextInput && !isWidget && !isScratch && !isPyBot && !isBlockbench && !isSpreadsheet && !isPyScratch;
  document.getElementById('qs-answer-grid').classList.toggle('hidden', isCodeQuestion || isTextInput || isWidget || isScratch || isPyBot || isBlockbench || isSpreadsheet || isPyScratch);
  document.getElementById('qs-code-answer').classList.toggle('hidden', !isCodeQuestion);
  document.getElementById('qs-text-answer').classList.toggle('hidden', !isTextInput);
  document.getElementById('qs-widget-answer').classList.toggle('hidden', !isWidget);
  document.getElementById('qs-scratch-answer').classList.toggle('hidden', !isScratch);
  document.getElementById('qs-pybot-answer').classList.toggle('hidden', !isPyBot);
  document.getElementById('qs-blockbench-answer').classList.toggle('hidden', !isBlockbench);
  document.getElementById('qs-spreadsheet-answer').classList.toggle('hidden', !isSpreadsheet);
  document.getElementById('qs-pyscratch-answer').classList.toggle('hidden', !isPyScratch);
  if (!isScratch) resetScratchQuizFrame();
  if (!isBlockbench) resetBlockbenchQuizFrame();
  if (!isPyScratch) resetPyScratchQuizFrame();
  if (isWidget) {
    quiz.currentWidget = null;
    var widgetContainer = document.getElementById('qs-widget-container');
    widgetContainer.innerHTML = '';
    if (q.type === 'bit_input') {
      quiz.currentWidget = BinaryLesson.mountBitInput(widgetContainer, { showTotal: !q.useNibbles, useNibbles: !!q.useNibbles });
    } else if (q.type === 'addition_input') {
      quiz.currentWidget = BinaryLesson.mountAddInput(widgetContainer, q.rowA, q.rowB);
    }
    document.getElementById('btn-quiz-submit-widget').disabled = false;
    document.getElementById('btn-quiz-submit-widget').onclick = function() { submitStudentWidgetAnswer(qIdx); };
  } else if (isTextInput) {
    var textInput = document.getElementById('qs-text-input');
    textInput.value = '';
    textInput.disabled = false;
    document.getElementById('qs-text-feedback').textContent = '';
    document.getElementById('btn-quiz-submit-text').disabled = false;
    document.getElementById('btn-quiz-submit-text').onclick = function() { submitStudentTextAnswer(qIdx); };
    textInput.onkeydown = function(e) { if (e.key === 'Enter') submitStudentTextAnswer(qIdx); };
    setTimeout(function() { textInput.focus(); }, 0);
  } else if (isCodeQuestion) {
    var codeInput = document.getElementById('qs-code-input');
    codeInput.value = '';
    codeInput.disabled = false;
    codeInput.onkeydown = function(e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        var start = codeInput.selectionStart;
        var end = codeInput.selectionEnd;
        codeInput.value = codeInput.value.substring(0, start) + '    ' + codeInput.value.substring(end);
        codeInput.selectionStart = codeInput.selectionEnd = start + 4;
      }
    };
    document.getElementById('btn-quiz-submit-code').disabled = false;
    document.getElementById('btn-quiz-submit-code').onclick = function() { submitStudentCodeAnswer(qIdx); };
    setTimeout(function() { codeInput.focus(); }, 0);
  } else if (isScratch) {
    var scratchFrame = document.getElementById('qs-scratch-frame');
    if (scratchFrame) scratchFrame.style.pointerEvents = '';
    var scratchLoadKey = qIdx + ':' + questionStart;
    var scratchSubmitBtn = document.getElementById('btn-quiz-submit-scratch');
    scratchSubmitBtn.disabled = true;
    scratchSubmitBtn.textContent = 'Loading editor...';
    scratchSubmitBtn.onclick = null;
    document.getElementById('qs-scratch-feedback').textContent = 'Loading TurboWarp editor...';
    if (scratchFrame && scratchFrame.dataset.quizLoadKey !== scratchLoadKey) {
      loadScratchQuizEditor(qIdx, scratchLoadKey, 0);
    } else {
      requestAnimationFrame(scaleScratchQuizFrame);
      waitForScratchQuizReady(qIdx, scratchLoadKey, 0);
    }
    document.getElementById('btn-qs-scratch-fs').onclick = toggleQsScratchFullscreen;
    if (window._qsScratchResize) window.removeEventListener('resize', window._qsScratchResize);
    window._qsScratchResize = scaleScratchQuizFrame;
    window.addEventListener('resize', window._qsScratchResize);
    if (window._qsScratchEsc) document.removeEventListener('keydown', window._qsScratchEsc);
    window._qsScratchEsc = function(e) {
      if (e.key === 'Escape') {
        var w = document.getElementById('qs-scratch-wrap');
        if (w && w.classList.contains('qs-scratch-fullscreen')) toggleQsScratchFullscreen();
      }
    };
    document.addEventListener('keydown', window._qsScratchEsc);
  } else if (isPyBot) {
    var pyBotFrame = document.getElementById('qs-pybot-frame');
    var pyBotFb    = document.getElementById('qs-pybot-feedback');
    if (pyBotFb) pyBotFb.textContent = 'Loading level…';

    if (window._qsPyBotRetryInterval) { clearInterval(window._qsPyBotRetryInterval); window._qsPyBotRetryInterval = null; }
    if (window._qsPyBotMsg) { window.removeEventListener('message', window._qsPyBotMsg); window._qsPyBotMsg = null; }

    var levelAcked = false;
    window._qsPyBotMsg = function(e) {
      if (e.origin !== 'https://jquinney-hue.github.io') return;
      var data = e.data || {};
      if (data.type === 'LEVEL_LOADED') {
        levelAcked = true;
        if (window._qsPyBotRetryInterval) { clearInterval(window._qsPyBotRetryInterval); window._qsPyBotRetryInterval = null; }
        if (pyBotFb) pyBotFb.textContent = 'Complete the level to submit.';
      }
      if (data.type === 'LEVEL_COMPLETE') {
        submitStudentPyBotAnswer(qIdx, data.medal, data.lines);
      }
    };
    window.addEventListener('message', window._qsPyBotMsg);

    // Append _q param so each question gets a distinct URL — browsers won't reload
    // on same-URL assignment, which would silently swallow the onload event.
    pyBotFrame.onload = function() {
      requestAnimationFrame(scalePyBotQuizFrame);
      var attempts = 0;
      function sendLevel() {
        try { pyBotFrame.contentWindow.postMessage({ type: 'LOAD_CUSTOM_LEVEL', data: { levelString: q.levelString || '' } }, '*'); } catch(e2) {}
        if (q.starterCode) {
          setTimeout(function() {
            try { pyBotFrame.contentWindow.postMessage({ type: 'SET_CODE', data: { code: q.starterCode } }, '*'); } catch(e3) {}
          }, 500);
        }
      }
      sendLevel();
      window._qsPyBotRetryInterval = setInterval(function() {
        if (levelAcked || ++attempts > 20) { clearInterval(window._qsPyBotRetryInterval); window._qsPyBotRetryInterval = null; return; }
        sendLevel();
      }, 500);
    };
    pyBotFrame.src = 'https://jquinney-hue.github.io/PyBot?hideMenu=true&_q=' + qIdx + '_' + questionStart;
    document.getElementById('btn-qs-pybot-fs').onclick = toggleQsPyBotFullscreen;
    if (window._qsPyBotResize) window.removeEventListener('resize', window._qsPyBotResize);
    window._qsPyBotResize = scalePyBotQuizFrame;
    window.addEventListener('resize', window._qsPyBotResize);
    if (window._qsPyBotEsc) document.removeEventListener('keydown', window._qsPyBotEsc);
    window._qsPyBotEsc = function(e) {
      if (e.key === 'Escape') {
        var w = document.getElementById('qs-pybot-wrap');
        if (w && w.classList.contains('qs-pybot-fullscreen')) toggleQsPyBotFullscreen();
      }
    };
    document.addEventListener('keydown', window._qsPyBotEsc);
  } else if (isBlockbench) {
    var blockbenchFrame = document.getElementById('qs-blockbench-frame');
    if (blockbenchFrame) blockbenchFrame.style.pointerEvents = '';
    var blockbenchSubmitBtn = document.getElementById('btn-quiz-submit-blockbench');
    if (blockbenchSubmitBtn) {
      blockbenchSubmitBtn.disabled = true;
      blockbenchSubmitBtn.textContent = 'Loading editor...';
      blockbenchSubmitBtn.onclick = null;
    }
    document.getElementById('qs-blockbench-feedback').textContent = 'Loading Blockbench editor...';
    var blockbenchLoadKey = qIdx + ':' + questionStart;
    if (blockbenchFrame && blockbenchFrame.dataset.quizLoadKey !== blockbenchLoadKey) {
      loadBlockbenchQuizEditor(qIdx, blockbenchLoadKey, 0);
    } else {
      requestAnimationFrame(scaleBlockbenchQuizFrame);
      waitForBlockbenchQuizReady(qIdx, blockbenchLoadKey, 0);
    }
    document.getElementById('btn-qs-blockbench-fs').onclick = toggleQsBlockbenchFullscreen;
    if (window._qsBlockbenchResize) window.removeEventListener('resize', window._qsBlockbenchResize);
    window._qsBlockbenchResize = scaleBlockbenchQuizFrame;
    window.addEventListener('resize', window._qsBlockbenchResize);
    if (window._qsBlockbenchEsc) document.removeEventListener('keydown', window._qsBlockbenchEsc);
    window._qsBlockbenchEsc = function(e) {
      if (e.key === 'Escape') {
        var w = document.getElementById('qs-blockbench-wrap');
        if (w && w.classList.contains('qs-blockbench-fullscreen')) toggleQsBlockbenchFullscreen();
      }
    };
    document.addEventListener('keydown', window._qsBlockbenchEsc);
  } else if (isPyScratch) {
    var pyScratchFrame = document.getElementById('qs-pyscratch-frame');
    if (pyScratchFrame) pyScratchFrame.style.pointerEvents = '';
    var psLoadKey = qIdx + ':' + questionStart;
    var psSubmitBtn = document.getElementById('btn-quiz-submit-pyscratch');
    psSubmitBtn.disabled = true;
    psSubmitBtn.textContent = 'Loading editor...';
    psSubmitBtn.onclick = null;
    document.getElementById('qs-pyscratch-feedback').textContent = 'Loading PyScratch editor...';
    if (pyScratchFrame && pyScratchFrame.dataset.quizLoadKey !== psLoadKey) {
      loadPyScratchQuizEditor(qIdx, psLoadKey, 0);
    } else {
      requestAnimationFrame(scalePyScratchQuizFrame);
      waitForPyScratchQuizReady(qIdx, psLoadKey, 0);
    }
    document.getElementById('btn-qs-pyscratch-fs').onclick = toggleQsPyScratchFullscreen;
    if (window._qsPyScratchResize) window.removeEventListener('resize', window._qsPyScratchResize);
    window._qsPyScratchResize = scalePyScratchQuizFrame;
    window.addEventListener('resize', window._qsPyScratchResize);
    if (window._qsPyScratchEsc) document.removeEventListener('keydown', window._qsPyScratchEsc);
    window._qsPyScratchEsc = function(e) {
      if (e.key === 'Escape') {
        var w = document.getElementById('qs-pyscratch-wrap');
        if (w && w.classList.contains('qs-pyscratch-fullscreen')) toggleQsPyScratchFullscreen();
      }
    };
    document.addEventListener('keydown', window._qsPyScratchEsc);
  } else if (isSpreadsheet) {
    renderQuizSpreadsheetTask(qIdx, q);
  } else {
    document.querySelectorAll('.quiz-ans-btn').forEach(function(btn, i) {
      // Restore structure if a previous scratch_mcq removed the bullet + span
      if (!btn.querySelector('span')) {
        btn.innerHTML = '&#x25CF; ';
        btn.appendChild(document.createElement('span'));
      }
      btn.style.paddingTop = '';
      btn.style.paddingBottom = '';
      if (q.type === 'scratch_mcq' && window.scratchblocks) {
        try {
          var script = scratchblocks.parse(q.options[i], { style: 'scratch3' });
          var svg = scratchblocks.render(script, { style: 'scratch3' });
          sbLogDevice();
          var natW = parseFloat(svg.getAttribute('width'))  || 200;
          var natH = parseFloat(svg.getAttribute('height')) || 60;
          sbLogSvg(svg, 'scratch_mcq-opt' + i);
          svg.removeAttribute('width');
          svg.removeAttribute('height');
          svg.style.display       = 'block';
          svg.style.width         = '100%';
          svg.style.height        = 'auto';
          svg.style.aspectRatio   = (natW / natH).toFixed(4);
          svg.style.maxWidth      = natW + 'px';
          svg.style.overflow      = 'hidden';
          svg.style.pointerEvents = 'none';
          svg.style.margin        = '0 auto';
          svg.style.fontWeight    = 'normal';
          svg.style.fontStyle     = 'normal';
          btn.innerHTML = '';
          btn.style.paddingTop = '0.75rem';
          btn.style.paddingBottom = '0.75rem';
          btn.appendChild(svg);
        } catch(e) {
          console.error('[ScratchBlocks scratch_mcq-opt' + i + '] render error:', e);
          safeText(btn.querySelector('span'), q.options[i]);
        }
      } else {
        renderTextWithBlocks(btn.querySelector('span'), q.options[i]);
      }
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.outline = '';
      btn.onclick = function() { submitStudentAnswer(qIdx, i, btn); };
    });
  }

  // Timer based on server start time
  var elapsed    = (Date.now() - questionStart) / 1000;
  var remaining  = Math.max(0, duration - elapsed);
  clearStudentTimer();
  var timerEnd   = Date.now() + remaining * 1000;
  var studentQuestionKey = qIdx + ':' + questionStart;

  function tick() {
    if (quiz.currentStudentQuestionKey !== studentQuestionKey) return;
    var rem = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
    document.getElementById('qs-timer').textContent = rem;
    var pct = ((timerEnd - Date.now()) / (duration * 1000)) * 100;
    var bar = document.getElementById('qs-timer-bar');
    bar.style.width = Math.max(0, pct) + '%';
    bar.className = 'h-1.5 transition-all ' + (pct > 50 ? 'bg-green-500' : pct > 20 ? 'bg-yellow-500' : 'bg-red-500');
    if (rem <= 0) { clearStudentTimer(); lockStudentAnswers(); }
  }
  tick();
  quiz.studentTimerInterval = setInterval(tick, 500);
}

function renderStudentLeaderboard(lb) {
  var el = document.getElementById('qs-final-score');
  var total = quizMaxScore(quiz.questions);
  var medals = ['🥇','🥈','🥉'];
  var html = '<div class="space-y-2 mt-4 w-full max-w-xl mx-auto">';
  var lbArr = Array.isArray(lb) ? lb : Object.values(lb);
  lbArr.forEach(function(entry, i) {
    var isMe = entry.code === state.uid;
    html += '<div class="flex items-center justify-between gap-6 rounded-lg px-6 py-3 ' +
      (isMe ? 'bg-yellow-600/40 border border-yellow-400' : 'bg-white/10') + '">' +
      '<span class="text-lg shrink-0">' + (medals[i] || (i+1)+'.') + '</span>' +
      '<span class="font-mono flex-1 text-sm text-left ' + (isMe ? 'text-yellow-300 font-bold' : 'text-gray-300') + '">' +
      (studentName(entry.code) || entry.code) + (isMe ? ' (you)' : '') + '</span>' +
      '<span class="font-bold text-yellow-400 text-right shrink-0">' + entry.score + '/' + total + '</span>' +
      '</div>';
  });
  html += '</div>';
  el.innerHTML = html;
}
