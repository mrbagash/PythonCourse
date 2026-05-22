function lockStudentAnswers() {
  document.querySelectorAll('.quiz-ans-btn').forEach(function(btn) {
    btn.disabled = true; btn.style.opacity = '0.5';
  });
  var textInput = document.getElementById('qs-text-input');
  var textBtn = document.getElementById('btn-quiz-submit-text');
  if (textInput) textInput.disabled = true;
  if (textBtn) textBtn.disabled = true;
  var widgetBtn = document.getElementById('btn-quiz-submit-widget');
  if (widgetBtn) widgetBtn.disabled = true;
  var codeInput = document.getElementById('qs-code-input');
  var codeBtn = document.getElementById('btn-quiz-submit-code');
  if (codeInput) codeInput.disabled = true;
  if (codeBtn) codeBtn.disabled = true;
  var scratchBtn = document.getElementById('btn-quiz-submit-scratch');
  if (scratchBtn) scratchBtn.disabled = true;
  var scratchWrap = document.getElementById('qs-scratch-wrap');
  if (scratchWrap && scratchWrap.classList.contains('qs-scratch-fullscreen')) toggleQsScratchFullscreen();
  var pyBotWrap = document.getElementById('qs-pybot-wrap');
  if (pyBotWrap && pyBotWrap.classList.contains('qs-pybot-fullscreen')) toggleQsPyBotFullscreen();
  if (window._qsPyBotMsg) { window.removeEventListener('message', window._qsPyBotMsg); window._qsPyBotMsg = null; }
}

async function submitStudentAnswer(qIdx, answerIdx, btn) {
  if (quiz.myAnswered) return;
  quiz.myAnswered = true;
  lockStudentAnswers();
  btn.style.opacity = '1';  // highlight chosen
  btn.style.outline = '3px solid white';

  await quiz.sessionRef.child('answers/' + qIdx + '/' + state.uid).set({
    answer: answerIdx,
    answeredAt: Date.now(),
  });

  document.getElementById('qs-answered-msg').classList.remove('hidden');
  document.getElementById('qs-answer-grid').classList.add('hidden');
}

async function submitStudentWidgetAnswer(qIdx) {
  if (quiz.myAnswered || !quiz.currentWidget) return;
  var q = quiz.questions[qIdx];
  var typed = quiz.currentWidget.getAnswer().trim().toUpperCase();
  var expected = String(q.answer || '').trim().toUpperCase();
  var correct = typed === expected;
  quiz.myAnswered = true;
  lockStudentAnswers();
  await quiz.sessionRef.child('answers/' + qIdx + '/' + state.uid).set({
    answerText: typed,
    correct: correct,
    answeredAt: Date.now(),
  });
  document.getElementById('qs-answered-msg').classList.remove('hidden');
  document.getElementById('qs-widget-answer').classList.add('hidden');
}

async function submitStudentTextAnswer(qIdx) {
  if (quiz.myAnswered) return;
  var q = quiz.questions[qIdx];
  var textInput = document.getElementById('qs-text-input');
  var typed = textInput.value.trim().toUpperCase().replace(/\s+/g, '');
  var expected = String(q.answer || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!typed) {
    document.getElementById('qs-text-feedback').textContent = 'Type your answer first.';
    return;
  }
  var correct = typed === expected;
  quiz.myAnswered = true;
  lockStudentAnswers();
  await quiz.sessionRef.child('answers/' + qIdx + '/' + state.uid).set({
    answerText: typed,
    correct: correct,
    answeredAt: Date.now(),
  });
  document.getElementById('qs-answered-msg').classList.remove('hidden');
  document.getElementById('qs-text-answer').classList.add('hidden');
}

async function validateQuizCode(q, code) {
  if (!code.trim()) return { correct: false, message: 'No code submitted.' };
  if (q.type === 'code_regex') {
    try {
      var re = new RegExp(q.pattern, q.flags || 'im');
      return { correct: re.test(code), message: re.test(code) ? 'Submitted.' : 'Submitted.' };
    } catch(e) {
      return { correct: false, message: 'Question validation error.' };
    }
  }
  if (q.type === 'code_output') {
    var result = await PyLearn.runPython(code, { inputs: q.inputs || [] });
    if (result.error) return { correct: false, message: 'Submitted with an error.' };
    var out = result.output.trim();
    var correct = false;
    if (q.expectedOutput != null) correct = out === String(q.expectedOutput).trim();
    else if (q.expectedContains != null) correct = out.toLowerCase().indexOf(String(q.expectedContains).toLowerCase()) !== -1;
    return { correct: correct, message: 'Submitted.' };
  }
  return { correct: false, message: 'Unknown code question type.' };
}

async function submitStudentCodeAnswer(qIdx) {
  if (quiz.myAnswered) return;
  var q = quiz.questions[qIdx];
  var codeInput = document.getElementById('qs-code-input');
  var fb = document.getElementById('qs-code-feedback');
  var code = codeInput.value;
  if (!code.trim()) {
    fb.textContent = 'Write your code first.';
    fb.className = 'quiz-code-feedback err';
    return;
  }
  document.getElementById('btn-quiz-submit-code').disabled = true;
  fb.textContent = 'Checking...';
  fb.className = 'quiz-code-feedback';
  var validation = await validateQuizCode(q, code);
  quiz.myAnswered = true;
  lockStudentAnswers();

  await quiz.sessionRef.child('answers/' + qIdx + '/' + state.uid).set({
    answerText: code,
    correct: validation.correct,
    answeredAt: Date.now(),
  });

  fb.textContent = validation.message;
  fb.className = 'quiz-code-feedback ' + (validation.correct ? 'ok' : 'err');
  document.getElementById('qs-answered-msg').classList.remove('hidden');
  document.getElementById('qs-code-answer').classList.add('hidden');
}

function renderStudentReveal(q, qIdx) {
  clearStudentTimer();
  setStudentView('reveal');
  if (!q) return;
  if (q.type === 'scratch_build') resetScratchQuizFrame();

  quiz.sessionRef.child('answers/' + qIdx + '/' + state.uid).get().then(function(snap) {
    var isTextInput = q.type === 'text_input';
    var isWidget = q.type === 'bit_input' || q.type === 'addition_input';
    var isScratch = q.type === 'scratch_build';
    var isPyBot = q.type === 'pybot_level';
    var isCodeQuestion = q.type && q.type !== 'mcq' && q.type !== 'scratch_mcq' && !isTextInput && !isWidget && !isScratch && !isPyBot;
    var points = snap.exists() ? quizAnswerPoints(q, snap) : 0;
    var correct = points > 0;
    if (points > 0 && !quiz.myScored[qIdx]) {
      quiz.myScore += points;
      quiz.myScored[qIdx] = true;
    }
    document.getElementById('qs-reveal-result').textContent = isPyBot && snap.exists() ? ('Scored ' + points + ' point' + (points === 1 ? '' : 's')) : (correct ? 'Correct!' : 'Wrong');
    var revealEl = document.getElementById('qs-reveal-answer');
    if (isPyBot) {
      var medal = snap.exists() ? snap.child('medal').val() : '';
      var lines = snap.exists() ? snap.child('lines').val() : 0;
      revealEl.textContent = snap.exists() ? (pyBotMedalLabel(medal) + ' - ' + points + ' point' + (points === 1 ? '' : 's') + ' - ' + lines + ' line' + (lines === 1 ? '' : 's')) : 'Not completed';
      revealEl.className = 'text-xl font-bold rounded-xl px-6 py-3 bg-green-600 mb-2 whitespace-pre-wrap';
    } else if (isTextInput || isWidget) {
      revealEl.textContent = 'Answer: ' + q.answer;
      revealEl.className = 'text-xl font-bold rounded-xl px-6 py-3 bg-green-600 mb-2 font-mono whitespace-pre-wrap';
    } else if (isScratch) {
      revealEl.textContent = q.sampleAnswer || "See your teacher's screen";
      revealEl.className = 'text-xl font-bold rounded-xl px-6 py-3 bg-green-600 mb-2 whitespace-pre-wrap';
    } else if (isCodeQuestion) {
      revealEl.textContent = 'Example: ' + (q.sampleAnswer || 'See teacher');
      revealEl.className = 'text-xl font-bold rounded-xl px-6 py-3 bg-green-600 mb-2 font-mono whitespace-pre-wrap text-left';
    } else {
      revealEl.className = 'text-xl font-bold rounded-xl px-6 py-3 bg-green-600 mb-2 whitespace-pre-wrap';
      renderTextWithBlocks(revealEl, 'Answer: ' + q.options[q.answer]);
    }
  });
}

document.getElementById('btn-quiz-student-exit').onclick = function() {
  if (confirm('Leave the quiz?')) exitStudentQuiz({ removePlayer: true });
};

document.getElementById('btn-quiz-student-home').onclick = function() {
  exitStudentQuiz({ removePlayer: true });
};

document.getElementById('btn-quiz-rejoin').onclick = async function() {
  // Remove kicked flag and re-join
  if (!quiz.sessionRef) return;
  var result = await quiz.sessionRef.child('players/' + state.uid).transaction(function(current) {
    if (!current) return;
    return { joinedAt: Date.now(), kicked: false };
  });
  if (result.committed) setStudentView('lobby');
};

function exitStudentQuiz(opts) {
  opts = opts || {};
  if (quiz.forced && !opts.keepForced && !opts.displaced) return;
  clearStudentTimer();
  if (quiz.missingSessionTimer) {
    clearTimeout(quiz.missingSessionTimer);
    quiz.missingSessionTimer = null;
  }
  quiz.unsubscribers.forEach(function(fn) { fn(); });
  quiz.unsubscribers = [];
  if (opts.removePlayer && quiz.sessionRef) {
    quiz.sessionRef.child('players/' + state.uid).remove();
  }
  quiz.sessionRef = null;
  quiz.forced = false;
  if (opts.displaced) {
    showQuizDisplacedMessage();
  } else {
    document.getElementById('quiz-student-screen').classList.add('hidden');
  }
  updateForcedQuizChrome();
}

// ── Wire up join quiz button visibility ────────────────────────
var _origUpdateAuthUI = updateAuthUI;
updateAuthUI = function(first, last, isAdmin) {
  _origUpdateAuthUI(first, last, isAdmin);
  var show = !!first && !isAdmin;
  document.getElementById('btn-join-quiz').classList.toggle('hidden', !show);
};

// ── Init lobby code input: numbers only, auto-submit at 4 digits ─
document.getElementById('input-lobby-code').addEventListener('input', function() {
  this.value = this.value.replace(/[^0-9]/g, '').slice(0, 4);
  if (this.value.length === 4) document.getElementById('btn-join-quiz-submit').click();
});

// ── Init quiz setup radio handler
document.querySelectorAll('input[name="quiz-mode"]').forEach(function(r) {
  r.onchange = function() {
    var isCustom = this.value === 'custom';
    document.getElementById('quiz-quick-opts').classList.toggle('hidden', isCustom);
    document.getElementById('quiz-custom-opts').classList.toggle('hidden', !isCustom);
  };
});

// ── Init ──────────────────────────────────────────────────────
loadApp().catch(function(e) {
  document.getElementById('loading-screen').innerHTML =
    '<div class="text-center text-red-500"><p class="font-semibold">Failed to load</p><p class="text-sm mt-1">'+e.message+'</p><p class="text-xs mt-2 text-gray-400">Ensure config/firebase.json and lessons/index.json exist and you are serving over HTTP.</p></div>';
});
