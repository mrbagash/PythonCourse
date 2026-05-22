document.getElementById('btn-ap-setup-close').onclick = function() {
  document.getElementById('modal-ap-setup').classList.add('hidden');
  document.getElementById('modal-admin').classList.remove('hidden');
};

async function genAssessmentCode() {
  for (var attempt = 0; attempt < 30; attempt++) {
    var code = String(Math.floor(1000 + Math.random() * 9000));
    var snap = await state.db.ref('quizSessions/' + code).get();
    if (!snap.exists()) return code;
  }
  return String(Math.floor(1000 + Math.random() * 9000));
}

document.getElementById('btn-ap-start-host').onclick = async function() {
  var id = document.getElementById('ap-assessment-select').value;
  var spec = ASSESSMENTS[id];
  if (!spec || !assessment.className) return;
  var forceClass = document.getElementById('ap-force-class').checked;
  var code = await genAssessmentCode();
  var firebaseUid = state.auth.currentUser && state.auth.currentUser.uid;
  assessment.assessmentId = id;
  assessment.lobbyCode = code;
  assessment.sessionRef = state.db.ref('quizSessions/' + code);
  assessment.forced = !!forceClass;
  await assessment.sessionRef.set({
    hostUid: firebaseUid || null,
    state: 'lobby',
    questionIdx: -1,
    lessonId: 'AP:' + id,
    assessmentId: id,
    className: assessment.className,
    forced: !!forceClass,
    questions: spec.questions || []
  });
  if (forceClass) {
    await state.db.ref('classes/' + assessment.className + '/forcedQuiz').set({
      active: true,
      lobbyCode: code,
      hostUid: firebaseUid || null,
      lessonId: 'AP:' + id,
      startedAt: Date.now()
    });
  }
  localStorage.setItem('pylearn_host_ap', code);
  document.getElementById('modal-ap-setup').classList.add('hidden');
  showAssessmentHostScreen();
};

document.getElementById('btn-ap-debug-preview').onclick = function() {
  var id = document.getElementById('ap-assessment-select').value;
  startAssessmentDebugPreview(id);
};

function startAssessmentDebugPreview(id) {
  var spec = ASSESSMENTS[id];
  if (!spec) return;
  if (assessment.saveTimer) clearInterval(assessment.saveTimer);
  if (assessment.questionAutosaveTimer) clearTimeout(assessment.questionAutosaveTimer);
  if (assessment.studentListener && assessment.studentListenerRef) assessment.studentListenerRef.off('value', assessment.studentListener);
  assessment.assessmentId = id;
  assessment.lobbyCode = 'DEBUG';
  assessment.sessionRef = null;
  assessment.responseRef = null;
  assessment.forced = false;
  assessment.debugMode = true;
  assessment.completed = false;
  assessment.validating = false;
  assessment.questionAnswers = {};
  assessment.questionCurrentIdx = 0;
  assessment.lastMetadataSaveAt = 0;
  document.getElementById('modal-ap-setup').classList.add('hidden');
  document.getElementById('modal-admin').classList.add('hidden');
  showAssessmentStudentScreen({ assessmentId: id, className: assessment.className, state: 'debug' });
}

function showAssessmentHostScreen() {
  var spec = ASSESSMENTS[assessment.assessmentId];
  document.getElementById('ap-host-screen').classList.remove('hidden');
  document.getElementById('aph-title').textContent = spec ? spec.title : '';
  document.getElementById('aph-code').textContent = assessment.lobbyCode;
  if (assessment.hostListener && assessment.sessionRef) assessment.sessionRef.off('value', assessment.hostListener);
  assessment.hostListener = assessment.sessionRef.on('value', function(snap) {
    renderAssessmentHostStudents(snap.val() || {});
  });
}

function renderAssessmentHostStudents(session) {
  var box = document.getElementById('aph-students');
  var responses = session.answers && session.answers[0] ? session.answers[0] : {};
  var codes = Object.keys(responses);
  if (!codes.length) {
    box.innerHTML = '<div class="text-gray-400 text-sm">Waiting for students to join...</div>';
    return;
  }
  box.innerHTML = '';
  codes.forEach(function(code) {
    var r = responses[code] || {};
    var row = document.createElement('div');
    row.className = 'grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-3 items-center bg-gray-800 rounded-lg px-4 py-2';
    row.innerHTML =
      '<span class="font-mono text-gray-200">' + (studentName(code) || code) + '</span>' +
      '<span class="text-sm text-gray-400">' + (r.completed ? 'Submitted' : 'Working') + '</span>' +
      '<span class="font-bold text-yellow-400">' + (r.score != null ? r.score + ' / ' + (r.maxScore || 21) : (r.draftScore != null ? r.draftScore + ' / ' + (r.draftMaxScore || ((ASSESSMENTS[assessment.assessmentId] && ASSESSMENTS[assessment.assessmentId].maxScore) || 21)) + ' draft' : '-')) + '</span>' +
      '<span class="text-xs text-gray-500">' + (r.savedAt ? 'Saved ' + new Date(r.savedAt).toLocaleTimeString('en-GB') : '') + '</span>' +
      '<button class="btn-ap-inspect px-2 py-1 rounded border border-gray-600 text-xs text-gray-200 hover:bg-gray-700" data-code="' + code + '">Inspect</button>' +
      '<button class="btn-ap-edit-score px-2 py-1 rounded border border-yellow-500 text-xs text-yellow-200 hover:bg-yellow-900/30" data-code="' + code + '">Edit marks</button>';
    row.querySelector('.btn-ap-inspect').onclick = function() {
      inspectAssessmentProject(code);
    };
    row.querySelector('.btn-ap-edit-score').onclick = function() {
      openAssessmentScoreEditor(code, assessment.assessmentId, r, { session: true });
    };
    box.appendChild(row);
  });
}

async function inspectAssessmentProject(code) {
  var panel = document.getElementById('aph-inspector');
  var spec = ASSESSMENTS[assessment.assessmentId];
  panel.classList.remove('hidden');
  if (spec && spec.questions && spec.questions.length) {
    try {
      var answerSnap = await assessment.sessionRef.child('answers/0/' + code).get();
      var rec = answerSnap.val() || {};
      var result = assessQuestionAssessment(spec, rec.answers || {});
      var html = '<div class="flex items-center justify-between mb-3"><h3 class="font-bold text-white">Answer inspection: ' + escapeHtml(studentName(code) || code) + '</h3><button class="text-gray-400 hover:text-white" onclick="document.getElementById(&quot;aph-inspector&quot;).classList.add(&quot;hidden&quot;)">Close</button></div>';
      html += '<p class="text-sm text-gray-300 mb-3">Current score: <strong class="text-yellow-300">' + result.score + ' / ' + result.maxScore + '</strong></p><div class="grid gap-1 text-xs">';
      result.criteria.forEach(function(c, i) {
        html += '<div class="grid grid-cols-[42px_1fr_1fr_50px] gap-2 items-center bg-gray-900 border border-gray-700 rounded px-2 py-1">' +
          '<span class="font-mono text-gray-400">Q' + (i + 1) + '</span><span class="text-gray-200">' + escapeHtml(c.text.replace(/^Q\\d+:\\s*/, '')) + '</span>' +
          '<span class="font-mono text-gray-300">Answer: ' + escapeHtml(c.answer || '-') + '</span><strong class="' + (c.awarded ? 'text-green-300' : 'text-red-300') + '">' + c.awarded + '/1</strong></div>';
      });
      panel.innerHTML = html + '</div>';
    } catch(e) {
      panel.innerHTML = '<p class="text-red-300 text-sm">Could not inspect answers: ' + escapeHtml(e.message || String(e)) + '</p>';
    }
    return;
  }
  panel.innerHTML = '<div class="flex items-center justify-between mb-3"><h3 class="font-bold text-white">Project inspection: ' + escapeHtml(studentName(code) || code) + '</h3><button class="text-gray-400 hover:text-white" onclick="document.getElementById(&quot;aph-inspector&quot;).classList.add(&quot;hidden&quot;)">Close</button></div><p class="text-yellow-300 text-sm">Remote SB3 inspection is disabled to keep Firebase usage under the daily limit. Use the student screen or their submitted rubric/score instead.</p>';
}

function errorMessage(error, fallback) {
  if (!error) return fallback || 'Unknown error.';
  if (typeof error === 'string') return error || fallback || 'Unknown error.';
  if (error.message) return error.message;
  if (error.name) return error.name;
  try {
    var text = JSON.stringify(error);
    return text && text !== '{}' ? text : (fallback || 'Unknown error.');
  } catch(e) {
    return fallback || 'Unknown error.';
  }
}

document.getElementById('btn-ap-host-exit').onclick = async function() {
  if (!confirm('End this AP session for the class? Any students still working will be automatically checked and submitted.')) return;
  await endAssessmentHostSession();
};

document.getElementById('btn-ap-download').onclick = function() {
  exportAssessmentResults(assessment.className, assessment.assessmentId, assessment.lobbyCode);
};

document.getElementById('btn-ap-release-feedback').onclick = async function() {
  try {
    await releaseAssessmentFeedbackFromCurrentSession();
    alert('Whole class AP feedback has been released to students.');
  } catch(e) {
    alert('Could not release feedback: ' + e.message);
  }
};

async function endAssessmentHostSession() {
  localStorage.removeItem('pylearn_host_ap');
  await finaliseIncompleteAssessmentResponses();
  if (assessment.sessionRef) await assessment.sessionRef.update({ state: 'finished', endedAt: Date.now() });
  if (assessment.className) {
    var ref = state.db.ref('classes/' + assessment.className + '/forcedQuiz');
    var snap = await ref.get();
    if (snap.child('lobbyCode').val() === assessment.lobbyCode) await ref.update({ active: false, endedAt: Date.now() });
  }
  if (assessment.hostListener && assessment.sessionRef) assessment.sessionRef.off('value', assessment.hostListener);
  document.getElementById('ap-host-screen').classList.add('hidden');
}

async function finaliseIncompleteAssessmentResponses() {
  if (!assessment.sessionRef || !assessment.assessmentId) return;
  var snap = await assessment.sessionRef.child('answers/0').get();
  if (!snap.exists()) return;
  var items = [];
  snap.forEach(function(child) {
    var rec = child.val() || {};
    if (!rec.completed) items.push({ code: child.key, rec: rec });
  });
  for (var i = 0; i < items.length; i++) {
    var code = items[i].code;
    var rec = items[i].rec;
    var spec = ASSESSMENTS[assessment.assessmentId] || {};
    var result;
    if (spec.questions && spec.questions.length) {
      result = assessQuestionAssessment(spec, rec.answers || {});
    } else if (rec.rubric && rec.rubric.length) {
      result = {
        score: rec.score || rec.draftScore || rec.rubric.reduce(function(t, c) { return t + (Number(c.awarded) || 0); }, 0),
        maxScore: rec.maxScore || rec.draftMaxScore || (spec.maxScore || 21),
        criteria: rec.rubric
      };
    } else if (rec.draftRubric && rec.draftRubric.length) {
      result = {
        score: rec.draftScore || rec.draftRubric.reduce(function(t, c) { return t + (Number(c.awarded) || 0); }, 0),
        maxScore: rec.draftMaxScore || (spec.maxScore || 21),
        criteria: rec.draftRubric
      };
    } else {
      result = { score: 0, maxScore: spec.maxScore || 21, criteria: zeroAssessmentCriteria(assessment.assessmentId) };
    }
    var completedAt = Date.now();
    await assessment.sessionRef.child('answers/0/' + code).update({
      completed: true,
      autoSubmitted: true,
      completedAt: completedAt,
      score: result.score,
      maxScore: result.maxScore,
      rubric: stripRubricForStorage(result.criteria)
    });
    await saveAssessmentProgressRecord(code, assessment.assessmentId, assessment.lobbyCode, {
      completedAt: completedAt,
      autoSubmitted: true,
      score: result.score,
      maxScore: result.maxScore,
      rubric: stripRubricForStorage(result.criteria),
      className: assessment.className || rec.className || null
    });
  }
}

async function saveAssessmentProgressRecord(uid, assessmentId, lobbyCode, rec) {
  if (!uid || !assessmentId || !lobbyCode) return;
  var record = Object.assign({}, rec, {
    assessmentId: assessmentId,
    lobbyCode: lobbyCode
  });
  var base = 'progress/' + uid + '/assessments/' + assessmentId;
  var updates = {};
  Object.keys(record).forEach(function(key) {
    updates[base + '/' + key] = record[key];
  });
  updates[base + '/attempts/' + lobbyCode] = record;
  await state.db.ref().update(updates);
}

function zeroAssessmentCriteria(assessmentId) {
  var spec = ASSESSMENTS[assessmentId] || {};
  return (spec.criteria || []).map(function(c) {
    return { id: c.id, text: c.text, marks: c.marks, awarded: 0 };
  });
}

function stopForcedAssessmentWatcher() {
  if (state.forcedAssessmentRef && state.forcedAssessmentListener) {
    state.forcedAssessmentRef.off('value', state.forcedAssessmentListener);
  }
  state.forcedAssessmentRef = null;
  state.forcedAssessmentListener = null;
  state.forcedAssessmentCode = null;
}

function startForcedAssessmentWatcher(className) {
  stopForcedAssessmentWatcher();
  if (!className || state.isAdmin || !state.uid) return;
  state.forcedAssessmentRef = state.db.ref('classes/' + className + '/forcedQuiz');
  state.forcedAssessmentListener = state.forcedAssessmentRef.on('value', function(snap) {
    var forced = snap.val() || {};
    if (!forced.active || !forced.lobbyCode || String(forced.lessonId || '').indexOf('AP:') !== 0) {
      state.forcedAssessmentCode = null;
      return;
    }
    if (state.forcedAssessmentCode === forced.lobbyCode && assessment.sessionRef) return;
    state.forcedAssessmentCode = forced.lobbyCode;
    joinAssessmentByCode(String(forced.lobbyCode), { forced: true }).catch(function(e) {
      console.warn('Forced AP join failed:', e.message);
    });
  });
}

async function joinAssessmentByCode(code, opts) {
  opts = opts || {};
  if (!state.uid || state.isAdmin) throw new Error('Students need to be logged in to join an assessment.');
  var sessionRef = state.db.ref('quizSessions/' + code);
  var snap = await sessionRef.get();
  if (!snap.exists()) throw new Error('No quiz or assessment found with that code.');
  if (String(snap.child('lessonId').val() || '').indexOf('AP:') !== 0) throw new Error('No assessment found with that code.');
  if (snap.child('state').val() === 'finished') throw new Error('That assessment is not active.');
  var assessmentId = String(snap.child('lessonId').val() || '').replace(/^AP:/, '');
  var progressRef = state.db.ref('progress/' + state.uid + '/assessments/' + assessmentId);
  var completedSnap = await progressRef.child('attempts/' + code).get();
  if (!completedSnap.exists()) {
    var legacySnap = await progressRef.get();
    if (legacySnap.exists() && legacySnap.child('lobbyCode').val() === code && legacySnap.child('completedAt').exists()) {
      completedSnap = legacySnap;
    }
  }
  assessment.assessmentId = assessmentId;
  assessment.lobbyCode = code;
  assessment.sessionRef = sessionRef;
  assessment.responseRef = sessionRef.child('answers/0/' + state.uid);
  assessment.className = snap.child('className').val() || state.className || null;
  assessment.forced = !!opts.forced || snap.child('forced').val() === true;
  if (completedSnap.exists()) {
    showAssessmentCompleted(completedSnap.val());
    return;
  }
  assessment.completed = false;
  await assessment.responseRef.update({
    joinedAt: Date.now(),
    activeClientId: assessment.clientId,
    lastSeenAt: Date.now(),
    completed: false,
    className: assessment.className
  });
  showAssessmentStudentScreen(snap.val() || {});
}

function showAssessmentStudentScreen(session) {
  var spec = ASSESSMENTS[session.assessmentId] || ASSESSMENTS[assessment.assessmentId];
  document.getElementById('ap-student-screen').classList.remove('hidden');
  document.getElementById('aps-active').classList.remove('hidden');
  document.getElementById('aps-finished').classList.add('hidden');
  document.getElementById('btn-ap-student-exit').classList.toggle('hidden', !!assessment.forced);
  document.getElementById('aps-title').textContent = (assessment.debugMode ? 'Debug preview: ' : '') + spec.title;
  document.getElementById('aps-brief').textContent = assessment.debugMode ? ((spec.brief || '') + ' This preview does not save results or lock completion.') : spec.brief;
  document.getElementById('aps-criteria').innerHTML = spec.criteria.map(function(c) {
    return '<li>' + c.text + ' <span class="text-gray-500">(' + c.marks + ' marks)</span></li>';
  }).join('');
  assessment.contentExpanded = false;
  document.getElementById('aps-sidebar').classList.remove('hidden');
  var _ebtn = document.getElementById('btn-aps-expand');
  if (_ebtn) { _ebtn.innerHTML = '&#x26F6;'; _ebtn.title = 'Expand content area'; }
  setAssessmentInstructionsCollapsed(false);
  if (spec.questions && spec.questions.length) {
    loadAssessmentQuestionPaper(spec);
  } else {
    loadAssessmentScratchEditor();
  }
  if (assessment.studentListener && assessment.studentListenerRef) assessment.studentListenerRef.off('value', assessment.studentListener);
  assessment.studentListener = null;
  assessment.studentListenerRef = null;
  if (!assessment.debugMode && assessment.sessionRef) {
    assessment.studentListenerRef = assessment.sessionRef.child('state');
    assessment.studentListener = assessment.studentListenerRef.on('value', function(snap) {
      if (snap.val() === 'finished') {
        if (!assessment.completed) exitAssessmentStudent({ keepForced: true });
      }
    });
  }
}

function loadAssessmentScratchEditor() {
  document.getElementById('aps-question-ap').classList.add('hidden');
  document.getElementById('aps-scratch-frame').classList.remove('hidden');
  document.getElementById('btn-ap-check').textContent = 'Check My Project';
  initApScratchLetterbox();
  var frame = document.getElementById('aps-scratch-frame');
  document.getElementById('aps-feedback').innerHTML = '';
  document.getElementById('aps-save-status').textContent = 'Loading editor...';
  if (assessment.saveTimer) clearInterval(assessment.saveTimer);
  frame.onload = async function() {
    await waitForAssessmentVm();
    if (assessment.debugMode) {
      document.getElementById('aps-save-status').textContent = 'Debug mode - not saved';
    } else {
      startAssessmentAutosave();
      document.getElementById('aps-save-status').textContent = 'Autosave on';
    }
  };
  frame.src = './scratch/editor.html?assessment=' + encodeURIComponent(assessment.lobbyCode || 'ap') + '&suppressBeforeUnload=1&_ap=' + Date.now();
}

async function loadAssessmentQuestionPaper(spec) {
  var frame = document.getElementById('aps-scratch-frame');
  var panel = document.getElementById('aps-question-ap');
  frame.src = 'about:blank';
  frame.classList.add('hidden');
  panel.classList.remove('hidden');
  document.getElementById('btn-ap-check').textContent = 'Save Current Answer';
  document.getElementById('aps-save-status').textContent = assessment.debugMode ? 'Debug mode - not saved' : 'Loading answers...';
  document.getElementById('aps-feedback').innerHTML = '<div class="text-xs text-gray-500">' + (assessment.debugMode ? 'Debug preview only. Answers are checked locally and are not saved.' : 'Answers save automatically. You can move between questions at your own pace.') + '</div>';
  if (assessment.saveTimer) clearInterval(assessment.saveTimer);
  assessment.questionAnswers = {};
  assessment.questionCurrentIdx = 0;
  if (!assessment.debugMode && assessment.responseRef) {
    try {
      var snap = await assessment.responseRef.get();
      var rec = snap.val() || {};
      assessment.questionAnswers = rec.answers || {};
      assessment.questionCurrentIdx = Math.max(0, Math.min((spec.questions || []).length - 1, rec.currentQuestionIdx || 0));
    } catch(e) {}
  }
  renderAssessmentQuestionPaper(spec);
  document.getElementById('aps-save-status').textContent = assessment.debugMode ? 'Debug mode - not saved' : 'Autosave on';
  initApScratchLetterbox();
}

function normaliseAssessmentAnswer(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, '').toUpperCase();
}

function renderAssessmentQuestionPaper(spec) {
  var panel = document.getElementById('aps-question-ap');
  var questions = spec.questions || [];
  var idx = Math.max(0, Math.min(questions.length - 1, assessment.questionCurrentIdx || 0));
  assessment.questionCurrentIdx = idx;
  var q = questions[idx];
  var answered = Object.keys(assessment.questionAnswers || {}).filter(function(id) {
    return normaliseAssessmentAnswer(assessment.questionAnswers[id]).length > 0;
  }).length;
  var nav = questions.map(function(item, i) {
    var has = normaliseAssessmentAnswer(assessment.questionAnswers[item.id]).length > 0;
    var active = i === idx;
    return '<button type="button" class="ap-qnav ' + (active ? 'active ' : '') + (has ? 'answered' : '') + '" data-i="' + i + '">' + (i + 1) + '</button>';
  }).join('');
  panel.innerHTML =
    '<div class="max-w-5xl mx-auto">' +
      '<div class="bg-white rounded-lg border border-gray-200 p-4 mb-4">' +
        '<div class="flex flex-wrap items-center justify-between gap-3 mb-3">' +
          '<div><div class="text-xs uppercase tracking-wide text-gray-500 font-semibold">' + escapeHtml(q.title) + '</div>' +
          '<h3 class="text-xl font-bold text-gray-900">Question ' + (idx + 1) + ' of ' + questions.length + '</h3></div>' +
          '<div class="text-sm font-semibold text-gray-600">Answered: ' + answered + ' / ' + questions.length + '</div>' +
        '</div>' +
        '<div class="ap-qnav-grid mb-4">' + nav + '</div>' +
        '<div class="bb-question-card bg-gray-900 text-gray-100 rounded-lg p-4">' +
          '<div class="bb-question-title mb-3">' + (q.prompt || '') + '</div>' + (q.html || '') +
          '<div id="ap-question-widget" class="mt-3"></div>' +
          '<div id="ap-question-feedback" class="mt-3 text-sm text-gray-300"></div>' +
        '</div>' +
        '<div class="flex flex-wrap justify-between gap-2 mt-4">' +
          '<button id="ap-prev-q" class="px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 bg-white hover:bg-gray-50" ' + (idx === 0 ? 'disabled' : '') + '>Previous</button>' +
          '<button id="ap-next-q" class="jhncc-primary px-5 py-2 rounded text-sm font-semibold">' + (idx === questions.length - 1 ? 'Review' : 'Next') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  panel.querySelectorAll('.ap-qnav').forEach(function(btn) {
    btn.onclick = function() {
      saveCurrentQuestionAnswer(spec, { silent: true });
      assessment.questionCurrentIdx = parseInt(btn.dataset.i, 10);
      renderAssessmentQuestionPaper(spec);
    };
  });
  document.getElementById('ap-prev-q').onclick = function() {
    saveCurrentQuestionAnswer(spec, { silent: true });
    assessment.questionCurrentIdx = Math.max(0, idx - 1);
    renderAssessmentQuestionPaper(spec);
  };
  document.getElementById('ap-next-q').onclick = function() {
    saveCurrentQuestionAnswer(spec, { silent: true });
    assessment.questionCurrentIdx = Math.min(questions.length - 1, idx + 1);
    renderAssessmentQuestionPaper(spec);
  };

  var widgetEl = document.getElementById('ap-question-widget');
  var saved = assessment.questionAnswers[q.id] || '';
  assessment.questionWidget = null;
  if (q.type === 'bit_input') {
    widgetEl.innerHTML = '<div id="ap-bit-widget"></div>';
    assessment.questionWidget = BinaryLesson.mountBitInput(document.getElementById('ap-bit-widget'), {
      useNibbles: !!q.useNibbles,
      showTotal: !q.useNibbles,
      initialAnswer: saved,
      onChange: function(value) { setQuestionAnswer(spec, q.id, value, { defer: true }); }
    });
  } else if (q.type === 'addition_input') {
    widgetEl.innerHTML = '<div id="ap-add-widget"></div>';
    assessment.questionWidget = BinaryLesson.mountAddInput(document.getElementById('ap-add-widget'), q.rowA, q.rowB, {
      initialAnswer: saved,
      onChange: function(value) { setQuestionAnswer(spec, q.id, value, { defer: true }); }
    });
  } else if (q.type === 'code_input') {
    widgetEl.innerHTML = '<textarea id="ap-code-answer" class="quiz-code-area w-full min-h-[220px]" spellcheck="false" placeholder="Write your Python code here">' + escapeHtml(saved || '') + '</textarea>';
    var codeInput = document.getElementById('ap-code-answer');
    codeInput.oninput = function() { setQuestionAnswer(spec, q.id, codeInput.value, { defer: true }); };
    codeInput.onkeydown = function(e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        var start = codeInput.selectionStart;
        var end = codeInput.selectionEnd;
        codeInput.value = codeInput.value.substring(0, start) + '    ' + codeInput.value.substring(end);
        codeInput.selectionStart = codeInput.selectionEnd = start + 4;
        setQuestionAnswer(spec, q.id, codeInput.value, { defer: true });
      }
    };
    setTimeout(function() { codeInput.focus(); }, 0);
  } else if (q.type === 'mcq') {
    widgetEl.innerHTML = '<div class="grid gap-2">' + (q.options || []).map(function(opt, i) {
      var checked = String(saved) === String(i) ? ' checked' : '';
      return '<label class="flex items-start gap-2 bg-gray-800 border border-gray-700 rounded p-2 cursor-pointer"><input type="radio" name="ap-mcq-answer" value="' + i + '" class="mt-1 accent-[rgb(245,186,41)]"' + checked + '><span>' + escapeHtml(opt) + '</span></label>';
    }).join('') + '</div>';
    widgetEl.querySelectorAll('input[name="ap-mcq-answer"]').forEach(function(radio) {
      radio.onchange = function() { setQuestionAnswer(spec, q.id, radio.value, { defer: true }); };
    });
  } else if (q.type === 'output_text') {
    widgetEl.innerHTML = '<textarea id="ap-output-answer" class="ex-textarea mt-2" rows="4" autocomplete="off" spellcheck="false" placeholder="Type the exact output here">' + escapeHtml(saved || '') + '</textarea>';
    var outputInput = document.getElementById('ap-output-answer');
    outputInput.oninput = function() { setQuestionAnswer(spec, q.id, outputInput.value, { defer: true }); };
    outputInput.onkeydown = function(e) { if (e.key === 'Enter' && e.ctrlKey) saveCurrentQuestionAnswer(spec); };
    setTimeout(function() { outputInput.focus(); }, 0);
  } else {
    widgetEl.innerHTML = '<input id="ap-text-answer" class="ex-input mt-2" autocomplete="off" spellcheck="false" placeholder="Type your answer" value="' + escapeHtml(saved || '') + '">';
    var input = document.getElementById('ap-text-answer');
    input.oninput = function() { setQuestionAnswer(spec, q.id, input.value, { defer: true }); };
    input.onkeydown = function(e) { if (e.key === 'Enter') saveCurrentQuestionAnswer(spec); };
    setTimeout(function() { input.focus(); }, 0);
  }
  setTimeout(scaleApQuestionPanel, 0);
}

function setQuestionAnswer(spec, id, value, opts) {
  opts = opts || {};
  assessment.questionAnswers[id] = String(value == null ? '' : value);
  if (opts.defer) {
    clearTimeout(assessment.questionAutosaveTimer);
    assessment.questionAutosaveTimer = setTimeout(function() { saveQuestionAssessmentDraft(spec, { silent: true }); }, 2000);
  }
}

function saveCurrentQuestionAnswer(spec, opts) {
  opts = opts || {};
  var q = (spec.questions || [])[assessment.questionCurrentIdx || 0];
  if (!q) return;
  var value = '';
  if (assessment.questionWidget && assessment.questionWidget.getAnswer) value = assessment.questionWidget.getAnswer();
  else {
    var codeInput = document.getElementById('ap-code-answer');
    var outputInput = document.getElementById('ap-output-answer');
    var input = document.getElementById('ap-text-answer');
    var radio = document.querySelector('input[name="ap-mcq-answer"]:checked');
    value = codeInput ? codeInput.value : (outputInput ? outputInput.value : (input ? input.value : (radio ? radio.value : (assessment.questionAnswers[q.id] || ''))));
  }
  setQuestionAnswer(spec, q.id, value);
  saveQuestionAssessmentDraft(spec, opts);
}

async function saveQuestionAssessmentDraft(spec, opts) {
  opts = opts || {};
  if (assessment.debugMode) {
    if (!opts.silent) document.getElementById('aps-save-status').textContent = 'Debug answer checked locally';
    return;
  }
  if (!assessment.responseRef || assessment.completed) return;
  var result = assessQuestionAssessment(spec, assessment.questionAnswers || {});
  try {
    await assessment.responseRef.update({
      answers: assessment.questionAnswers || {},
      currentQuestionIdx: assessment.questionCurrentIdx || 0,
      savedAt: Date.now(),
      lastSeenAt: Date.now(),
      draftScore: result.score,
      draftMaxScore: result.maxScore
    });
    document.getElementById('aps-save-status').textContent = 'Saved ' + new Date().toLocaleTimeString('en-GB');
    if (!opts.silent) document.getElementById('aps-feedback').innerHTML = '<div class="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">Current answer saved.</div>';
  } catch(e) {
    document.getElementById('aps-save-status').textContent = 'Save failed';
  }
}

function stripRubricForStorage(criteria) {
  return (criteria || []).map(function(c) {
    return { id: c.id, text: c.text, marks: c.marks, awarded: c.awarded, family: c.family };
  });
}

function assessQuestionAssessment(spec, answers) {
  answers = answers || {};
  var score = 0;
  var criteria = (spec.questions || []).map(function(q, i) {
    var check = validateAssessmentQuestionAnswer(q, answers[q.id]);
    var ok = check.correct;
    if (ok) score += 1;
    return {
      id: q.id,
      text: 'Q' + (i + 1) + ': ' + q.title,
      marks: 1,
      awarded: ok ? 1 : 0,
      family: q.family,
      answer: answers[q.id] || '',
      expected: check.expected
    };
  });
  return { score: score, maxScore: spec.maxScore || (spec.questions || []).length, criteria: criteria };
}

function validateAssessmentQuestionAnswer(q, value) {
  var raw = String(value == null ? '' : value);
  if (q.type === 'code_input') {
    var patterns = q.patterns || (q.pattern ? [q.pattern] : []);
    // 'm' only — Python is case-sensitive so the 'i' flag must not be used
    var ok = raw.trim().length > 0 && patterns.every(function(pattern) {
      try { return new RegExp(pattern, q.flags || 'm').test(raw); }
      catch(e) { return false; }
    });
    return { correct: ok, expected: q.sampleAnswer || 'Valid Python code' };
  }
  if (q.type === 'mcq') {
    return { correct: normaliseAssessmentAnswer(raw) === normaliseAssessmentAnswer(q.answer), expected: (q.options && q.options[Number(q.answer)]) || q.answer };
  }
  if (q.type === 'output_text') {
    function normOutput(v) {
      return String(v == null ? '' : v)
        .trim()
        .replace(/\r\n/g, '\n')
        .replace(/[^\S\n]+/g, ' ')
        .replace(/[ \t]*\n[ \t]*/g, '\n')
        .toUpperCase();
    }
    return { correct: !!normOutput(raw) && normOutput(raw) === normOutput(q.answer), expected: q.answer };
  }
  // text type: preserve newlines so multi-line output questions require the correct
  // number of lines — collapse only horizontal whitespace, then case-fold
  function normText(v) { return String(v == null ? '' : v).trim().replace(/[^\S\n]+/g, '').toUpperCase(); }
  return { correct: !!normText(raw) && normText(raw) === normText(q.answer), expected: q.answer };
}

async function submitQuestionAssessmentFinal() {
  var spec = ASSESSMENTS[assessment.assessmentId];
  saveCurrentQuestionAnswer(spec, { silent: true });
  var result = assessQuestionAssessment(spec, assessment.questionAnswers || {});
  assessment.completed = true;
  if (assessment.debugMode) {
    showAssessmentCompleted({ score: result.score, maxScore: result.maxScore, rubric: result.criteria, debugMode: true });
    return;
  }
  var completedAt = Date.now();
  var strippedRubric = stripRubricForStorage(result.criteria);
  await assessment.responseRef.update({
    answers: assessment.questionAnswers || {},
    completed: true,
    completedAt: completedAt,
    score: result.score,
    maxScore: result.maxScore,
    rubric: strippedRubric,
    savedAt: completedAt,
    lastSeenAt: completedAt
  });
  await saveAssessmentProgressRecord(state.uid, assessment.assessmentId, assessment.lobbyCode, {
    completedAt: completedAt,
    score: result.score,
    maxScore: result.maxScore,
    rubric: strippedRubric,
    className: assessment.className || state.className || null
  });
  showAssessmentCompleted({ score: result.score, maxScore: result.maxScore, rubric: result.criteria, className: assessment.className || state.className || null });
}

function waitForAssessmentVm() {
  var frame = document.getElementById('aps-scratch-frame');
  return new Promise(function(resolve) {
    var started = Date.now();
    var timer = setInterval(function() {
      try {
        if (frame.contentWindow && frame.contentWindow.vm && frame.contentWindow.vm.runtime) {
          clearInterval(timer); resolve();
        } else if (Date.now() - started > 20000) {
          clearInterval(timer); resolve();
        }
      } catch(e) {}
    }, 250);
  });
}

async function saveAssessmentProject(opts) {
  opts = opts || {};
  if (assessment.debugMode) {
    document.getElementById('aps-save-status').textContent = 'Debug mode - not saved';
    return null;
  }
  if (!assessment.responseRef || assessment.completed) return;
  if (assessment.projectSaveInFlight) return null;
  try {
    var now = Date.now();
    if (!opts.force && assessment.lastMetadataSaveAt && now - assessment.lastMetadataSaveAt < 60000) return null;
    assessment.projectSaveInFlight = true;
    await assessment.responseRef.update({
      savedAt: now,
      lastSeenAt: now
    });
    assessment.lastMetadataSaveAt = now;
    document.getElementById('aps-save-status').textContent = 'Saved ' + new Date().toLocaleTimeString('en-GB');
    return null;
  } catch(e) {
    document.getElementById('aps-save-status').textContent = 'Save failed';
  } finally {
    assessment.projectSaveInFlight = false;
  }
}

function startAssessmentAutosave() {
  if (assessment.saveTimer) clearInterval(assessment.saveTimer);
  assessment.saveTimer = setInterval(function() { saveAssessmentProject({ force: false }); }, 30000);
  try {
    var frame = document.getElementById('aps-scratch-frame');
    var runtime = frame.contentWindow.vm && frame.contentWindow.vm.runtime;
  if (runtime && runtime.on && !assessment.projectChangeListener) {
      assessment.projectChangeListener = function() {
        clearTimeout(assessment.projectChangeTimer);
        assessment.projectChangeTimer = setTimeout(function() { saveAssessmentProject({ force: false }); }, 15000);
      };
      runtime.on('PROJECT_CHANGED', assessment.projectChangeListener);
    }
  } catch(e) {}
  setTimeout(function() { saveAssessmentProject({ force: true }); }, 3000);
}

document.getElementById('btn-ap-check').onclick = async function() {
  var spec = ASSESSMENTS[assessment.assessmentId];
  if (spec && spec.questions && spec.questions.length) {
    saveCurrentQuestionAnswer(spec);
    return;
  }
  if (assessment.validating) return;
  await runAssessmentValidation('Checking your project...', async function() {
    await saveAssessmentProject({ force: false });
    var result = await validateAssessmentProject(function(label, index, total) {
      updateAssessmentValidationStatus(label, index, total);
    });
    renderAssessmentFeedback(result, false);
  });
};

document.getElementById('btn-ap-finish').onclick = async function() {
  var spec = ASSESSMENTS[assessment.assessmentId];
  if (spec && spec.questions && spec.questions.length) {
    if (!assessment.debugMode && !confirm('Submit your final assessment? You cannot do this AP again after submitting.')) return;
    await submitQuestionAssessmentFinal();
    return;
  }
  if (assessment.validating) return;
  if (!assessment.debugMode && !confirm('Submit your final assessment? You cannot do this AP again after submitting.')) return;
  await runAssessmentValidation('Final validation before submitting...', async function() {
    await saveAssessmentProject({ force: true });
    var result = await validateAssessmentProject(function(label, index, total) {
      updateAssessmentValidationStatus(label, index, total);
    });
    assessment.completed = true;
    if (assessment.debugMode) {
      showAssessmentCompleted({ score: result.score, maxScore: result.maxScore, rubric: result.criteria, debugMode: true });
      return;
    }
    var strippedRubric = stripRubricForStorage(result.criteria);
    await assessment.responseRef.update({
      completed: true,
      completedAt: Date.now(),
      score: result.score,
      maxScore: result.maxScore,
      rubric: strippedRubric,
      projectSavedAt: assessment.lastProjectSaveAt || Date.now()
    });
    await saveAssessmentProgressRecord(state.uid, assessment.assessmentId, assessment.lobbyCode, {
      completedAt: Date.now(),
      score: result.score,
      maxScore: result.maxScore,
      rubric: strippedRubric,
      className: assessment.className || state.className || null
    });
    showAssessmentCompleted({ score: result.score, maxScore: result.maxScore, rubric: result.criteria });
  });
};

async function runAssessmentValidation(initialStatus, task) {
  setAssessmentValidationLocked(true, initialStatus, 0, 1);
  try {
    return await task();
  } finally {
    setAssessmentValidationLocked(false);
  }
}

function setAssessmentValidationLocked(locked, status, index, total) {
  assessment.validating = !!locked;
  var lock = document.getElementById('aps-validation-lock');
  var frame = document.getElementById('aps-scratch-frame');
  var sidebar = document.getElementById('aps-sidebar');
  var checkBtn = document.getElementById('btn-ap-check');
  var finishBtn = document.getElementById('btn-ap-finish');
  var exitBtn = document.getElementById('btn-ap-student-exit');
  var toggleBtn = document.getElementById('btn-ap-toggle-instructions');
  if (lock) lock.classList.toggle('hidden', !locked);
  if (frame) frame.style.pointerEvents = locked ? 'none' : '';
  if (sidebar) sidebar.style.pointerEvents = locked ? 'none' : '';
  var expandBtn = document.getElementById('btn-aps-expand');
  [checkBtn, finishBtn, exitBtn, toggleBtn, expandBtn].forEach(function(btn) {
    if (btn) btn.disabled = !!locked;
    if (btn) btn.classList.toggle('opacity-60', !!locked);
  });
  if (locked) {
    try { if (document.activeElement) document.activeElement.blur(); } catch(e) {}
    try { if (frame && frame.contentWindow) frame.contentWindow.blur(); } catch(e) {}
    if (lock) lock.focus();
    updateAssessmentValidationStatus(status || 'Preparing checks...', index || 0, total || 1);
  }
}

function updateAssessmentValidationStatus(label, index, total) {
  var status = document.getElementById('aps-validation-status');
  var bar = document.getElementById('aps-validation-bar');
  if (status) status.textContent = label || 'Validating...';
  if (bar) {
    var pct = total ? Math.max(0, Math.min(100, Math.round((index / total) * 100))) : 0;
    bar.style.width = pct + '%';
  }
}
