var apResultsState = { className: null, rows: [], students: [], progressRows: {} };

document.getElementById('ap-results-class').onchange = function() {
  var cls = this.value;
  if (!cls) { document.getElementById('ap-results-content').innerHTML = '<p class="text-gray-400 text-center py-8">Choose a class to view AP results.</p>'; return; }
  openAssessmentResults(cls);
};
document.getElementById('ap-results-mode').onchange = renderAssessmentResultsPanel;
document.getElementById('ap-results-assessment').onchange = renderAssessmentResultsPanel;
document.getElementById('ap-results-student').onchange = renderAssessmentResultsPanel;
document.getElementById('btn-ap-results-download').onclick = function() {
  downloadAssessmentRows(currentAssessmentResultRows(), apResultsState.className);
};

var wipeSb3InFlight = false;

function debugLogProjectData(message, reset) {
  var log = document.getElementById('debug-projectdata-log');
  if (!log) return;
  log.classList.remove('hidden');
  log.textContent = reset ? message : ((log.textContent ? log.textContent + '\n' : '') + message);
  log.scrollTop = log.scrollHeight;
}

function setDebugProjectDataStatus(message, isError) {
  var status = document.getElementById('debug-projectdata-status');
  if (!status) return;
  status.className = 'mt-3 text-sm ' + (isError ? 'text-red-700 font-semibold' : 'text-red-800');
  status.textContent = message || '';
}

async function getDebugFirebaseContext() {
  if (!state.auth || !state.db) throw new Error('Firebase is not initialised yet.');
  var user = state.auth.currentUser;
  if (!user) {
    user = await new Promise(function(resolve) {
      var done = false;
      var off = state.auth.onAuthStateChanged(function(authUser) {
        if (done) return;
        done = true;
        off && off();
        resolve(authUser || null);
      });
      setTimeout(function() {
        if (done) return;
        done = true;
        off && off();
        resolve(state.auth.currentUser || null);
      }, 3000);
    });
  }
  var databaseURL = (state.config && state.config.firebase && state.config.firebase.databaseURL) || '';
  if (!databaseURL && firebase.apps && firebase.apps.length) {
    databaseURL = firebase.app().options && firebase.app().options.databaseURL || '';
  }
  if (!user) throw new Error('Firebase auth is not ready yet. Close and reopen the admin panel, or refresh and log in as admin again.');
  if (!databaseURL) throw new Error('Firebase database URL is missing from config.');
  return { token: await user.getIdToken(), root: databaseURL.replace(/\/$/, '') };
}

function debugManualQuizCodes() {
  var box = document.getElementById('debug-projectdata-codes');
  if (!box) return [];
  var text = box.value || '';
  var seen = {};
  return text.split(/[\s,;]+/).map(function(code) {
    return code.trim();
  }).filter(function(code) {
    if (!code || seen[code]) return false;
    seen[code] = true;
    return true;
  });
}

async function listQuizProjectDataRefs(onProgress, manualCodes) {
  var ctx = await getDebugFirebaseContext();
  var sessionIds = manualCodes && manualCodes.length ? manualCodes : null;
  if (!sessionIds) {
    var sessionsRes = await fetch(ctx.root + '/quizSessions.json?shallow=true&auth=' + encodeURIComponent(ctx.token));
    if (!sessionsRes.ok) throw new Error('Could not read quiz session keys: ' + sessionsRes.status + '. Paste quiz/AP codes into the manual box and scan again.');
    var sessions = await sessionsRes.json() || {};
    sessionIds = Object.keys(sessions);
  }
  var refs = [];
  for (var i = 0; i < sessionIds.length; i++) {
    var sid = sessionIds[i];
    if (onProgress) onProgress('Scanning quiz ' + (i + 1) + ' / ' + sessionIds.length + ': ' + sid);
    var answersRes = await fetch(ctx.root + '/quizSessions/' + encodeURIComponent(sid) + '/answers/0.json?shallow=true&auth=' + encodeURIComponent(ctx.token));
    if (!answersRes.ok) continue;
    var answerKeys = await answersRes.json() || {};
    Object.keys(answerKeys).forEach(function(code) {
      refs.push({ sessionId: sid, code: code, path: 'quizSessions/' + sid + '/answers/0/' + code + '/projectData' });
    });
  }
  return refs;
}

async function scanQuizProjectDataFields() {
  if (wipeSb3InFlight) return;
  wipeSb3InFlight = true;
  setDebugProjectDataStatus('Scanning...');
  var manualCodes = debugManualQuizCodes();
  debugLogProjectData(manualCodes.length ? 'Starting manual-code shallow scan...' : 'Starting shallow scan...', true);
  try {
    var refs = await listQuizProjectDataRefs(function(msg) { debugLogProjectData(msg); }, manualCodes);
    setDebugProjectDataStatus('Found ' + refs.length + ' possible projectData fields.');
    debugLogProjectData(refs.length ? refs.map(function(r) { return r.path; }).join('\n') : 'No projectData paths found.');
  } catch(e) {
    setDebugProjectDataStatus('Scan failed: ' + errorMessage(e, 'Unknown error.'), true);
    debugLogProjectData('ERROR: ' + errorMessage(e, 'Unknown error.'));
  } finally {
    wipeSb3InFlight = false;
  }
}

async function deleteQuizProjectDataFields() {
  if (wipeSb3InFlight) return;
  if (!confirm('Delete every quizSessions/[code]/answers/0/[student]/projectData field? This does not delete scores, rubrics, answers, classes or quiz sessions.')) return;
  wipeSb3InFlight = true;
  var btn = document.getElementById('btn-debug-delete-projectdata') || document.getElementById('btn-admin-wipe-sb3');
  var oldText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Deleting...';
  }
  setDebugProjectDataStatus('Scanning before delete...');
  var manualCodes = debugManualQuizCodes();
  debugLogProjectData(manualCodes.length ? 'Starting manual-code projectData cleanup...' : 'Starting projectData cleanup...', true);
  try {
    var refs = await listQuizProjectDataRefs(function(msg) { debugLogProjectData(msg); }, manualCodes);
    var deleted = 0;
    var failed = 0;
    for (var i = 0; i < refs.length; i++) {
      try {
        await state.db.ref(refs[i].path).remove();
        deleted++;
        debugLogProjectData('Deleted ' + refs[i].path);
      } catch(e) {
        failed++;
        debugLogProjectData('FAILED ' + refs[i].path + ': ' + errorMessage(e, 'Permission denied or unknown error.'));
      }
      setDebugProjectDataStatus('Deleted ' + deleted + ' / ' + refs.length + (failed ? ' (' + failed + ' failed)' : '') + '.');
    }
    setDebugProjectDataStatus('Finished. Deleted ' + deleted + ' projectData fields' + (failed ? '; ' + failed + ' failed.' : '.'));
  } catch(e) {
    setDebugProjectDataStatus('Cleanup failed: ' + errorMessage(e, 'Unknown error.'), true);
    debugLogProjectData('ERROR: ' + errorMessage(e, 'Unknown error.'));
  } finally {
    wipeSb3InFlight = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = oldText || 'Delete all projectData fields';
    }
  }
}

document.getElementById('btn-debug-scan-projectdata').onclick = scanQuizProjectDataFields;
document.getElementById('btn-debug-delete-projectdata').onclick = deleteQuizProjectDataFields;
document.getElementById('btn-admin-wipe-sb3').onclick = function() {
  setAdminTab('debug');
  deleteQuizProjectDataFields();
};

document.getElementById('btn-ap-results-release').onclick = async function() {
  try {
    var assessmentId = document.getElementById('ap-results-assessment').value || 'all';
    if (assessmentId === 'all') {
      alert('Choose a specific assessment before releasing feedback.');
      return;
    }
    await releaseAssessmentFeedbackForClass(apResultsState.className, assessmentId, currentAssessmentResultRows());
    alert('Whole class AP feedback has been released to students.');
  } catch(e) {
    alert('Could not release feedback: ' + e.message);
  }
};

document.getElementById('btn-ap-results-view-feedback').onclick = async function() {
  var assessmentId = document.getElementById('ap-results-assessment').value || 'all';
  var className = apResultsState.className;
  if (!className) { alert('Choose a class first.'); return; }
  if (assessmentId === 'all') { alert('Choose a specific assessment first.'); return; }
  await showAdminClassFeedbackModal(className, assessmentId);
};

async function loadApResultsClassOptions(preselectClass) {
  var classEl = document.getElementById('ap-results-class');
  var prev = preselectClass || classEl.value;
  classEl.innerHTML = '<option value="">— select class —</option>';
  try {
    var apClassNames = await getClassNames();
    apClassNames.forEach(function(name) {
      var opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      classEl.appendChild(opt);
    });
    if (prev && classEl.querySelector('option[value="' + prev + '"]')) {
      classEl.value = prev;
      openAssessmentResults(prev);
    }
  } catch(e) {
    document.getElementById('ap-results-content').innerHTML =
      '<p class="text-red-500 text-center py-8">Could not load classes: ' + escapeHtml(e.message) + '</p>';
  }
}

async function openAssessmentResults(className) {
  apResultsState.className = className;
  document.getElementById('ap-results-content').innerHTML = '<p class="text-gray-400 text-center py-8">Loading AP results…</p>';
  try {
    await refreshAssessmentResultsData(className);
    populateAssessmentResultsFilters();
    renderAssessmentResultsPanel();
  } catch(e) {
    document.getElementById('ap-results-content').innerHTML =
      '<p class="text-red-500 text-center py-8">Could not load AP results: ' + escapeHtml(e.message) + '</p>';
  }
}

async function refreshAssessmentResultsData(className) {
  var classSnap = await state.db.ref('classes/' + className + '/codes').get();
  var classCodes = classSnap.exists() ? Object.keys(classSnap.val() || {}) : [];
  apResultsState.progressRows = {};
  await Promise.all(classCodes.map(async function(code) {
    var snap = await state.db.ref('progress/' + code + '/assessments').get();
    var assessments = {};
    if (snap.exists()) {
      snap.forEach(function(child) {
        var r = child.val() || {};
        if (!r.completedAt) return;
        assessments[child.key] = {
          completedAt: r.completedAt,
          score: r.score,
          maxScore: r.maxScore,
          rubric: r.rubric || [],
          lobbyCode: r.lobbyCode,
          className: r.className,
          manualOverride: r.manualOverride,
          manualOverrideAt: r.manualOverrideAt,
          manualOverrideReason: r.manualOverrideReason
        };
      });
    }
    apResultsState.progressRows[code] = { assessments: assessments };
  }));

  apResultsState.students = classCodes.sort(function(a, b) {
    return (studentName(a) || a).localeCompare(studentName(b) || b);
  });
}

function populateAssessmentResultsFilters() {
  var assessmentEl = document.getElementById('ap-results-assessment');
  assessmentEl.innerHTML = '<option value="all">All assessments</option>';
  Object.keys(ASSESSMENTS).forEach(function(id) {
    var opt = document.createElement('option');
    opt.value = id;
    opt.textContent = ASSESSMENTS[id].title || id;
    assessmentEl.appendChild(opt);
  });
  if (Object.keys(ASSESSMENTS).length === 1) assessmentEl.value = Object.keys(ASSESSMENTS)[0];

  var studentEl = document.getElementById('ap-results-student');
  studentEl.innerHTML = '';
  apResultsState.students.forEach(function(code) {
    var opt = document.createElement('option');
    opt.value = code;
    opt.textContent = (studentName(code) || 'Unnamed student') + ' - ' + code;
    studentEl.appendChild(opt);
  });
}

document.getElementById('btn-ap-toggle-instructions').onclick = function() {
  setAssessmentInstructionsCollapsed(!document.getElementById('aps-active').classList.contains('ap-instructions-collapsed'));
};

function setAssessmentInstructionsCollapsed(collapsed) {
  var active = document.getElementById('aps-active');
  var sidebar = document.getElementById('aps-sidebar');
  var toggle = document.getElementById('btn-ap-toggle-instructions');
  if (!active || !sidebar || !toggle) return;
  active.classList.toggle('ap-instructions-collapsed', !!collapsed);
  sidebar.classList.toggle('hidden', !!collapsed);
  if (collapsed) {
    toggle.textContent = 'Show Instructions';
    toggle.title = 'Show instructions';
    toggle.setAttribute('aria-label', 'Show instructions');
    active.className = 'flex-1 min-h-0 grid grid-cols-1 gap-4 p-4 ap-instructions-collapsed';
  } else {
    toggle.textContent = 'Hide Instructions';
    toggle.title = 'Hide instructions';
    toggle.setAttribute('aria-label', 'Hide instructions');
    active.className = 'flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 p-4';
  }
}

var _apsScratchRO = null;

function scaleApScratchFrame() {
  var wrap = document.getElementById('aps-scratch-wrap');
  var frame = document.getElementById('aps-scratch-frame');
  if (!wrap || !frame || frame.classList.contains('hidden')) return;
  var NW = 900, NH = 540;
  var wW = wrap.clientWidth, wH = wrap.clientHeight;
  if (wW < 1 || wH < 1) return;
  var sc = Math.min(wW / NW, wH / NH);
  if (sc >= 1) {
    frame.style.position = 'absolute';
    frame.style.width = '100%';
    frame.style.height = '100%';
    frame.style.transform = '';
    frame.style.transformOrigin = '';
    frame.style.left = '0';
    frame.style.top = '0';
  } else {
    var scaledW = Math.round(NW * sc);
    var scaledH = Math.round(NH * sc);
    frame.style.position = 'absolute';
    frame.style.width = NW + 'px';
    frame.style.height = NH + 'px';
    frame.style.transform = 'scale(' + sc.toFixed(4) + ')';
    frame.style.transformOrigin = 'top left';
    frame.style.left = Math.max(0, Math.round((wW - scaledW) / 2)) + 'px';
    frame.style.top = Math.max(0, Math.round((wH - scaledH) / 2)) + 'px';
  }
}

function initApScratchLetterbox() {
  var wrap = document.getElementById('aps-scratch-wrap');
  if (!wrap) return;
  if (_apsScratchRO) _apsScratchRO.disconnect();
  _apsScratchRO = new ResizeObserver(function() { scaleApScratchFrame(); scaleApQuestionPanel(); });
  _apsScratchRO.observe(wrap);
  scaleApScratchFrame();
  scaleApQuestionPanel();
}

function scaleApQuestionPanel() {
  var panel = document.getElementById('aps-question-ap');
  if (!panel || panel.classList.contains('hidden')) return;
  var inner = panel.querySelector('.max-w-5xl');
  if (!inner) return;
  inner.style.zoom = '';
  var naturalH = inner.offsetHeight;
  var panelH = panel.clientHeight - 32;
  if (naturalH < 10 || naturalH <= panelH) { inner.style.zoom = ''; return; }
  var sc = Math.max(0.55, panelH / naturalH);
  inner.style.zoom = sc.toFixed(3);
}


function assessmentRowsForClass(className, assessmentId) {
  var rows = [];
  apResultsState.students.forEach(function(code) {
    var assessments = apResultsState.progressRows[code] && apResultsState.progressRows[code].assessments;
    if (!assessments) {
      if (assessmentId !== 'all') rows.push(emptyAssessmentRow(code, assessmentId));
      return;
    }
    if (assessmentId === 'all') {
      Object.keys(assessments).forEach(function(aid) {
        var rec = assessments[aid] || {};
        if (rec.className === className || apResultsState.students.indexOf(code) !== -1) rows.push(assessmentRow(code, aid, rec));
      });
    } else {
      rows.push(assessmentRow(code, assessmentId, assessments[assessmentId]));
    }
  });
  return rows;
}

function emptyAssessmentRow(code, assessmentId) {
  return assessmentRow(code, assessmentId, null);
}

function assessmentRow(code, assessmentId, rec) {
  rec = rec || null;
  var maxScore = rec ? (rec.maxScore || (ASSESSMENTS[assessmentId] && ASSESSMENTS[assessmentId].maxScore) || 21) : ((ASSESSMENTS[assessmentId] && ASSESSMENTS[assessmentId].maxScore) || 21);
  return {
    code: code,
    name: studentName(code) || '',
    assessmentId: assessmentId,
    assessmentTitle: (ASSESSMENTS[assessmentId] && ASSESSMENTS[assessmentId].title) || assessmentId,
    score: rec ? (rec.score || 0) : 0,
    maxScore: maxScore,
    completedAt: rec && rec.completedAt,
    lobbyCode: rec && rec.lobbyCode,
    className: rec && rec.className,
    rubric: rec && rec.rubric ? rec.rubric : [],
    completed: !!(rec && rec.completedAt),
    scratchSnapshotStatus: rec && rec.scratchSnapshotStatus,
    scratchSnapshotSizeBytes: rec && rec.scratchSnapshotSizeBytes,
    scratchSnapshotWarning: rec && rec.scratchSnapshotWarning
  };
}

function currentAssessmentResultRows() {
  var mode = document.getElementById('ap-results-mode').value;
  var assessmentId = document.getElementById('ap-results-assessment').value || 'all';
  var rows = assessmentRowsForClass(apResultsState.className, assessmentId);
  if (mode === 'student') {
    var code = document.getElementById('ap-results-student').value;
    rows = rows.filter(function(r) { return r.code === code; });
  }
  return rows;
}

function renderAssessmentResultsPanel() {
  var content = document.getElementById('ap-results-content');
  var mode = document.getElementById('ap-results-mode').value;
  var studentEl = document.getElementById('ap-results-student');
  studentEl.disabled = mode !== 'student';
  if (!apResultsState.students.length) {
    content.innerHTML = '<p class="text-gray-400 text-center py-8">No students or AP results found for this class.</p>';
    return;
  }
  var rows = currentAssessmentResultRows();
  if (!rows.length) {
    content.innerHTML = '<p class="text-gray-400 text-center py-8">No AP results match this filter.</p>';
    return;
  }
  if (mode === 'student') renderStudentAssessmentResults(content, rows);
  else renderClassAssessmentResults(content, rows);
}

function renderClassAssessmentResults(content, rows) {
  var sorted = rows.slice().sort(function(a, b) {
    if (a.completed !== b.completed) return a.completed ? -1 : 1;
    return b.score - a.score;
  });
  var completedSorted = sorted.filter(function(r) { return r.completed; });
  var completed = completedSorted.length;
  var dpGrades = definitePurposeGrades(completedSorted.map(function(r) { return r.score; }));
  var scoreGradeMap = {};
  completedSorted.forEach(function(r, i) { scoreGradeMap[r.score] = dpGrades[i]; });
  var avg = sorted.length ? Math.round(sorted.reduce(function(t, r) { return t + r.score; }, 0) / sorted.length) : 0;
  var html = '<div class="grid grid-cols-3 gap-3 mb-4">' +
    '<div class="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center"><div class="text-2xl font-bold text-blue-700">' + sorted.length + '</div><div class="text-xs text-blue-500">Students/records</div></div>' +
    '<div class="bg-green-50 border border-green-100 rounded-lg p-3 text-center"><div class="text-2xl font-bold text-green-700">' + completed + '</div><div class="text-xs text-green-500">Completed</div></div>' +
    '<div class="bg-purple-50 border border-purple-100 rounded-lg p-3 text-center"><div class="text-2xl font-bold text-purple-700">' + avg + '</div><div class="text-xs text-purple-500">Average score</div></div>' +
    '</div>';
  html += '<div class="border border-gray-200 rounded-lg overflow-hidden"><table class="w-full text-xs"><thead><tr class="bg-gray-50 text-left text-gray-500">' +
    '<th class="border border-gray-200 px-2 py-1.5">Name</th><th class="border border-gray-200 px-2 py-1.5 text-center">Score</th><th class="border border-gray-200 px-2 py-1.5 text-center">Definite Purpose</th><th class="border border-gray-200 px-2 py-1.5 text-center">Actions</th></tr></thead><tbody>';
  sorted.forEach(function(r, i) {
    html += '<tr class="border-b border-gray-100' + (!r.completed ? ' opacity-50' : '') + '">' +
      '<td class="border border-gray-100 px-2 py-1.5 font-medium">' + escapeHtml(r.name || '-') + '</td>' +
      '<td class="border border-gray-100 px-2 py-1.5 text-center font-semibold">' + r.score + ' / ' + r.maxScore + '</td>' +
      '<td class="border border-gray-100 px-2 py-1.5 text-center font-bold text-blue-700">' + (r.completed ? scoreGradeMap[r.score] : '—') + '</td>' +
      '<td class="border border-gray-100 px-2 py-1.5 text-center">' +
        '<div class="flex justify-center gap-1">' +
        (r.completed ? '<button class="btn-ap-result-edit px-2 py-1 rounded border border-yellow-500 text-yellow-700 bg-yellow-50" data-code="' + escapeHtml(r.code) + '" data-assessment="' + escapeHtml(r.assessmentId) + '">Edit</button>' : '') +
        '<button class="btn-ap-recover px-2 py-1 rounded border border-gray-400 text-gray-500 hover:bg-gray-50" data-code="' + escapeHtml(r.code) + '" data-lobby="' + escapeHtml(r.lobbyCode || '') + '" data-assessment="' + escapeHtml(r.assessmentId) + '" title="Request local backup from student\'s browser">Recover</button>' +
        '<button class="btn-ap-delete-result px-2 py-1 rounded border border-red-400 text-red-600 bg-red-50 hover:bg-red-100" data-code="' + escapeHtml(r.code) + '" data-name="' + escapeHtml(r.name || r.code) + '" data-assessment="' + escapeHtml(r.assessmentId) + '" data-title="' + escapeHtml(r.assessmentTitle || r.assessmentId) + '" title="Delete this AP result">Delete</button>' +
        '</div>' +
      '</td>' +
      '</tr>';
  });
  html += '</tbody></table></div>';
  content.innerHTML = html;
  content.querySelectorAll('.btn-ap-result-edit').forEach(function(btn) {
    btn.onclick = function() {
      var row = sorted.find(function(r) { return r.code === btn.dataset.code && r.assessmentId === btn.dataset.assessment; });
      openAssessmentScoreEditor(btn.dataset.code, btn.dataset.assessment, row, { results: true });
    };
  });
  content.querySelectorAll('.btn-ap-recover').forEach(function(btn) {
    btn.onclick = function() {
      requestStudentApBackup(btn.dataset.code, btn.dataset.lobby, btn.dataset.assessment, btn);
    };
  });
  content.querySelectorAll('.btn-ap-delete-result').forEach(function(btn) {
    btn.onclick = function() {
      deleteAssessmentResult(btn.dataset.code, btn.dataset.assessment, btn.dataset.name, btn.dataset.title);
    };
  });
}

function renderStudentAssessmentResults(content, rows) {
  var code = document.getElementById('ap-results-student').value;
  var name = studentName(code) || code;
  var completedRows = rows.filter(function(r) { return r.completed; });
  var html = '<div class="mb-4"><h3 class="text-lg font-semibold text-gray-800">' + escapeHtml(name) + '</h3><p class="text-xs text-gray-500 font-mono">' + escapeHtml(code) + '</p></div>';
  if (!completedRows.length) {
    html += '<p class="text-gray-400 py-6">No completed AP results for this student with the current filter.</p>';
  }
  completedRows.sort(function(a, b) { return (b.completedAt || 0) - (a.completedAt || 0); }).forEach(function(r) {
    var pct = r.maxScore ? Math.round((r.score / r.maxScore) * 100) : 0;
    html += '<div class="border border-gray-200 rounded-lg mb-4 overflow-hidden">' +
      '<div class="bg-gray-50 px-3 py-2 border-b border-gray-200 flex flex-wrap justify-between gap-2"><div><span class="font-semibold text-gray-800">' + escapeHtml(r.assessmentTitle) + '</span><span class="text-xs text-gray-400 ml-2">' + (r.completedAt ? new Date(r.completedAt).toLocaleString('en-GB') : '') + '</span></div><div class="flex items-center gap-2"><div class="font-bold text-yellow-700">' + r.score + ' / ' + r.maxScore + ' (' + pct + '%)</div><button class="btn-ap-result-edit px-2 py-1 rounded border border-yellow-500 text-yellow-700 bg-yellow-50 text-xs" data-code="' + escapeHtml(r.code) + '" data-assessment="' + escapeHtml(r.assessmentId) + '">Edit marks</button><button class="btn-ap-delete-result px-2 py-1 rounded border border-red-400 text-red-600 bg-red-50 hover:bg-red-100 text-xs" data-code="' + escapeHtml(r.code) + '" data-name="' + escapeHtml(name) + '" data-assessment="' + escapeHtml(r.assessmentId) + '" data-title="' + escapeHtml(r.assessmentTitle || r.assessmentId) + '">Delete result</button></div></div>' +
      '<div class="p-3 space-y-1">' + apSnapshotStatusHtml(r, true);
    (r.rubric || []).forEach(function(c) {
      html += '<div class="flex justify-between gap-3 border-b border-gray-100 py-1"><span>' + escapeHtml(c.text) + '</span><strong>' + (c.awarded || 0) + '/' + (c.marks || 0) + '</strong></div>';
    });
    html += '</div></div>';
  });
  html += '<div id="ap-student-result-editor"></div>';
  content.innerHTML = html;
  content.querySelectorAll('.btn-ap-result-edit').forEach(function(btn) {
    btn.onclick = function() {
      var row = completedRows.find(function(r) { return r.code === btn.dataset.code && r.assessmentId === btn.dataset.assessment; });
      openAssessmentScoreEditor(btn.dataset.code, btn.dataset.assessment, row, { results: true });
    };
  });
  content.querySelectorAll('.btn-ap-delete-result').forEach(function(btn) {
    btn.onclick = function() {
      deleteAssessmentResult(btn.dataset.code, btn.dataset.assessment, btn.dataset.name, btn.dataset.title);
    };
  });
}

async function deleteAssessmentResult(code, assessmentId, name, title) {
  if (!code || !assessmentId) return;
  var displayName = name || code;
  var displayTitle = title || assessmentId;
  if (!confirm('Delete ' + displayName + '\'s result for ' + displayTitle + '?\n\nThis removes their score and rubric completely and allows them to retake the AP. This cannot be undone.')) return;
  try {
    await state.db.ref('progress/' + code + '/assessments/' + assessmentId).remove();
    // Refresh the local state so the panel re-renders without the deleted result
    if (apResultsState.progressRows[code] && apResultsState.progressRows[code].assessments) {
      delete apResultsState.progressRows[code].assessments[assessmentId];
    }
    renderAssessmentResultsPanel();
  } catch(e) {
    alert('Could not delete result: ' + e.message);
  }
}

function isScratchAssessmentResult(row) {
  var spec = ASSESSMENTS[row.assessmentId] || {};
  return String(spec.validation || '').indexOf('scratch') !== -1;
}

function apSnapshotStatusHtml(row, expanded) {
  if (!isScratchAssessmentResult(row) || !row.completed) return '';
  var status = row.scratchSnapshotStatus || 'missing';
  var size = row.scratchSnapshotSizeBytes ? Math.ceil(row.scratchSnapshotSizeBytes / 1024) + ' KB' : '';
  if (status === 'saved' && !expanded) return '<span class="text-green-700 font-semibold">Saved</span>';
  if (status === 'saved' && expanded) return '<div class="rounded border border-green-200 bg-green-50 text-green-800 px-3 py-2 mb-2 text-sm"><strong>Project snapshot:</strong> Saved safely' + (size ? ' (' + escapeHtml(size) + ' / 20 KB limit)' : '') + '.</div>';
  var warning = row.scratchSnapshotWarning || (status === 'saved_warn_size' ? 'Project snapshot was saved, but it was larger than expected.' : 'Project snapshot was not saved, but the AP score was saved.');
  var label = status === 'saved_warn_size' ? 'Saved, large' : 'Not saved';
  if (!expanded) return '<span class="text-yellow-700 font-semibold" title="' + escapeHtml(warning) + '">' + label + '</span>';
  return '<div class="rounded border border-yellow-200 bg-yellow-50 text-yellow-800 px-3 py-2 mb-2 text-sm"><strong>Project snapshot warning:</strong> ' + escapeHtml(warning) + (size ? ' (' + escapeHtml(size) + ' / 20 KB limit)' : '') + '</div>';
}

function downloadAssessmentRows(rows, className) {
  if (!rows.length) { alert('No AP results to download.'); return; }
  var sorted = rows.slice().sort(function(a, b) { return b.score - a.score; });
  var completedSorted = sorted.filter(function(r) { return r.completed; });
  var dpGrades = definitePurposeGrades(completedSorted.map(function(r) { return r.score; }));
  var scoreGradeMap = {};
  completedSorted.forEach(function(r, i) { scoreGradeMap[r.score] = dpGrades[i]; });
  var csv = 'Name,Score,Definite Purpose\n';
  sorted.forEach(function(r) {
    csv += [r.name, r.score, r.completed ? scoreGradeMap[r.score] : ''].map(csvCell).join(',') + '\n';
  });
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (className || 'AP') + '-AP-results.csv';
  a.click();
}

async function releaseAssessmentFeedbackFromCurrentSession() {
  if (!assessment.sessionRef || !assessment.className || !assessment.assessmentId) {
    throw new Error('No active AP session to release feedback for.');
  }
  var snap = await assessment.sessionRef.child('answers/0').get();
  var rows = [];
  if (snap.exists()) {
    snap.forEach(function(child) {
      var rec = child.val() || {};
      if (!rec.completed) return;
      rows.push({
        code: child.key,
        name: studentName(child.key) || '',
        assessmentId: assessment.assessmentId,
        assessmentTitle: (ASSESSMENTS[assessment.assessmentId] && ASSESSMENTS[assessment.assessmentId].title) || assessment.assessmentId,
        score: rec.score || 0,
        maxScore: rec.maxScore || (ASSESSMENTS[assessment.assessmentId] && ASSESSMENTS[assessment.assessmentId].maxScore) || 21,
        completedAt: rec.completedAt,
        lobbyCode: assessment.lobbyCode,
        className: assessment.className,
        rubric: rec.rubric || [],
        completed: true
      });
    });
  }
  await releaseAssessmentFeedbackForClass(assessment.className, assessment.assessmentId, rows);
}

async function releaseAssessmentFeedbackForClass(className, assessmentId, rows) {
  var completedRows = (rows || []).filter(function(r) { return r.completed && r.rubric && r.rubric.length; });
  if (!className) throw new Error('No class selected.');
  if (!assessmentId || assessmentId === 'all') throw new Error('Choose a specific assessment.');
  if (!completedRows.length) throw new Error('No completed AP submissions found yet.');
  var feedback = buildAssessmentFeedbackSummary(className, assessmentId, completedRows);
  await state.db.ref('classes/' + className + '/apFeedback/' + assessmentId).set(feedback);
}

function buildAssessmentFeedbackSummary(className, assessmentId, rows) {
  var spec = ASSESSMENTS[assessmentId] || {};
  var criteriaOrder = (spec.criteria || []).map(function(c) { return c.id; });
  var byId = {};
  rows.forEach(function(row) {
    (row.rubric || []).forEach(function(c) {
      var id = c.id || c.text;
      if (!byId[id]) byId[id] = { id: id, text: c.text || id, marks: c.marks || 0, awarded: 0, possible: 0 };
      byId[id].awarded += c.awarded || 0;
      byId[id].possible += c.marks || 0;
      byId[id].marks = c.marks || byId[id].marks;
      byId[id].text = c.text || byId[id].text;
    });
  });
  var criteriaStats = Object.keys(byId).map(function(id) {
    var c = byId[id];
    c.percent = c.possible ? Math.round(c.awarded / c.possible * 100) : 0;
    return c;
  }).sort(function(a, b) {
    var ai = criteriaOrder.indexOf(a.id), bi = criteriaOrder.indexOf(b.id);
    if (ai === -1) ai = 999;
    if (bi === -1) bi = 999;
    return ai - bi;
  });
  var sortedScores = rows.slice().sort(function(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.code).localeCompare(String(b.code));
  });
  return {
    released: true,
    releasedAt: Date.now(),
    className: className,
    assessmentId: assessmentId,
    assessmentTitle: spec.title || assessmentId,
    studentCount: rows.length,
    topCodes: sortedScores.slice(0, 3).map(function(r) {
      return { code: r.code, score: r.score || 0, maxScore: r.maxScore || spec.maxScore || 21 };
    }),
    best: criteriaStats.slice().sort(function(a, b) { return b.percent - a.percent; }).slice(0, 3),
    struggle: criteriaStats.slice().sort(function(a, b) { return a.percent - b.percent; }).slice(0, 3),
    criteriaStats: criteriaStats
  };
}

function watchReleasedAssessmentFeedback(record) {
  var box = document.getElementById('aps-class-feedback');
  if (!box) return;
  box.classList.add('hidden');
  box.innerHTML = '';
  if (assessment.feedbackRef && assessment.feedbackListener) assessment.feedbackRef.off('value', assessment.feedbackListener);
  var className = record.className || assessment.className || state.className;
  var assessmentId = assessment.assessmentId;
  if (!className || !assessmentId) return;
  assessment.feedbackRef = state.db.ref('classes/' + className + '/apFeedback/' + assessmentId);
  assessment.feedbackListener = assessment.feedbackRef.on('value', function(snap) {
    var feedback = snap.val();
    if (!feedback || !feedback.released) {
      box.classList.remove('hidden');
      box.innerHTML = '<h3 class="text-lg font-bold mb-2">Whole class feedback</h3><p class="text-sm text-gray-500">Your teacher has not released whole class feedback yet. Check back later.</p>';
      return;
    }
    renderReleasedAssessmentFeedback(box, feedback, record);
  });
}

function renderReleasedAssessmentFeedback(box, feedback, record) {
  var stats = feedback.criteriaStats || [];
  var topCodes = feedback.topCodes || [];
  var html = '<h3 class="text-lg font-bold mb-2">Whole class feedback</h3>' +
    '<p class="text-sm text-gray-600 mb-4">' + escapeHtml(feedback.assessmentTitle || 'Assessment Point') + ' · released ' + new Date(feedback.releasedAt || Date.now()).toLocaleString('en-GB') + '</p>';

  html += '<div class="grid md:grid-cols-2 gap-4 mb-5">';
  html += '<div class="border border-gray-200 rounded-lg p-3"><h4 class="font-semibold text-gray-800 mb-3">Class performance by question</h4><div class="space-y-3">';
  stats.forEach(function(c) {
    var colour = c.percent >= 70 ? 'bg-green-500' : c.percent >= 40 ? 'bg-yellow-500' : 'bg-red-500';
    html += '<div><div class="flex justify-between gap-3 text-xs mb-1"><span class="font-medium text-gray-700">' + escapeHtml(c.text) + '</span><span class="text-gray-500">' + c.percent + '%</span></div>' +
      '<div class="h-3 rounded-full bg-gray-100 overflow-hidden"><div class="' + colour + ' h-3" style="width:' + Math.max(2, c.percent) + '%"></div></div></div>';
  });
  html += '</div></div>';
  html += '<div class="space-y-4">';
  html += '<div class="border border-green-200 bg-green-50 rounded-lg p-3"><h4 class="font-semibold text-green-800 mb-2">Best class areas</h4>' + feedbackListHtml(feedback.best || []) + '</div>';
  html += '<div class="border border-red-200 bg-red-50 rounded-lg p-3"><h4 class="font-semibold text-red-800 mb-2">Most difficult areas</h4>' + feedbackListHtml(feedback.struggle || []) + '</div>';
  html += '<div class="border border-yellow-200 bg-yellow-50 rounded-lg p-3"><h4 class="font-semibold text-yellow-800 mb-2">Top scores</h4>';
  if (topCodes.length) {
    html += '<div class="flex flex-wrap gap-2">';
    topCodes.forEach(function(t, i) {
      html += '<span class="rounded-full bg-white border border-yellow-300 px-3 py-1 text-sm font-mono text-yellow-800">' + (i + 1) + '. ' + escapeHtml(t.code) + ' · ' + t.score + '/' + t.maxScore + '</span>';
    });
    html += '</div>';
  } else {
    html += '<p class="text-sm text-yellow-700">No submitted scores yet.</p>';
  }
  html += '</div></div></div>';

  html += renderIndividualPractice(record);
  box.innerHTML = html;
  box.classList.remove('hidden');
  wireAssessmentPracticeChoices(box);
  setupAssessmentPracticeWorkspace(box, record);
}

function feedbackListHtml(items) {
  if (!items.length) return '<p class="text-sm text-gray-500">Not enough data yet.</p>';
  return '<ul class="list-disc pl-5 text-sm space-y-1">' + items.map(function(c) {
    return '<li>' + escapeHtml(c.text) + ' <span class="text-gray-500">(' + c.percent + '%)</span></li>';
  }).join('') + '</ul>';
}

function assessmentPracticePrompt(id, assessmentId) {
  var spec = ASSESSMENTS[assessmentId] || {};
  if (spec.type === 'binary-hex') {
    var question = (spec.questions || []).find(function(q) { return q.id === id; });
    if (question) return question.prompt + ' Work it out again, then check your answer.';
  }
  var practice = assessmentId === 'year7-ap2-practice-scratch';
  var prompts = practice ? {
    backdrop: 'Add or rename a backdrop so it clearly shows a space setting. Check that the backdrop name includes a clue such as space, galaxy, planet, star or moon.',
    diver: 'Create or rename the main player sprite so it is clearly an astronaut, rocket, spaceship or space explorer.',
    movement: 'Make the player move with all four arrow keys. Test each arrow key and check the player moves in the correct direction.',
    target: 'Add a collectible sprite for the player to catch. When it is caught, make it move to a random position.',
    scorePlus: 'Create a score or points variable. When the player catches the collectible, change the score by 1.',
    shark: 'Create or rename an obstacle sprite so the project clearly has an alien, meteor, robot or similar hazard.',
    sharkChase: 'Make the obstacle chase the player. Test that the distance between the obstacle and player gets smaller over time.',
    yum: 'When the obstacle touches the player, make it say or think a short message.',
    scoreMinus: 'When the obstacle touches the player, make the score or points go down by 1.'
  } : {
    backdrop: 'Add or rename a backdrop so it clearly shows an underwater setting. Check that the backdrop name includes a clue such as underwater, ocean, sea, reef or coral.',
    diver: 'Create or rename the main player sprite so it is clearly a diver, swimmer or scuba character.',
    movement: 'Make the diver move with all four arrow keys. Test each arrow key and check the diver moves in the correct direction.',
    target: 'Add a target sprite for the diver to catch. When it is caught, make it move to a random position.',
    scorePlus: 'Create a score variable. When the diver catches the target, change the score by 1.',
    shark: 'Create or rename a shark sprite so the project clearly has a shark obstacle.',
    sharkChase: 'Make the shark chase the diver. Test that the distance between the shark and diver gets smaller over time.',
    yum: 'When the shark touches the diver, make the shark say a short message such as Yum Yum.',
    scoreMinus: 'When the shark touches the diver, make the score go down by 1.'
  };
  return prompts[id] || 'Choose one part of your AP project and improve it using the rubric.';
}

function renderIndividualPractice(record) {
  var rubric = record.rubric || [];
  var practiceAssessmentId = record.assessmentId || assessment.assessmentId;
  var spec = ASSESSMENTS[practiceAssessmentId] || {};
  var weak = rubric.filter(function(c) { return (c.awarded || 0) < (c.marks || 0); });
  var cards = weak.slice(0, 5).map(function(c) {
    return { id: c.id, text: c.text, prompt: assessmentPracticePrompt(c.id, practiceAssessmentId), choice: false };
  });
  var allCriteria = rubric.length ? rubric : (spec.criteria || []);
  while (cards.length < 3) {
    var fallback = allCriteria.find(function(c) { return !cards.some(function(card) { return card.id === c.id; }); }) || allCriteria[cards.length % Math.max(1, allCriteria.length)] || { id: 'choice', text: 'Choose a focus' };
    cards.push({ id: fallback.id, text: fallback.text, prompt: assessmentPracticePrompt(fallback.id, practiceAssessmentId), choice: true });
  }
  if (spec.questions && spec.questions.length) {
    var qById = {};
    (spec.questions || []).forEach(function(q) { qById[q.id] = q; });
    var questionHtml = '<div class="border border-blue-200 bg-blue-50 rounded-lg p-4"><h4 class="font-semibold text-blue-900 mb-2">Your additional practice</h4>' +
      '<p class="text-sm text-blue-800 mb-3">Complete at least three practice questions. They are based on your AP result and check locally for your own revision.</p><div class="space-y-3">';
    cards.slice(0, 5).forEach(function(card, i) {
      var q = qById[card.id];
      questionHtml += '<div class="ap-binary-practice bg-white border border-blue-100 rounded-lg p-3" data-qid="' + escapeHtml(card.id) + '">' +
        '<div class="text-xs uppercase tracking-wide text-blue-500 font-semibold mb-1">Practice ' + (i + 1) + '</div>' +
        '<div class="font-semibold text-gray-800 mb-1">' + escapeHtml(card.text || (q && q.title) || '') + '</div>' +
        '<p class="text-sm text-gray-700 mb-2">' + escapeHtml(card.prompt) + '</p>' +
        '<div class="bb-question-card bg-gray-900 text-gray-100 rounded-lg p-3">' + (q && q.html ? q.html : '') + '<div class="ap-binary-widget mt-3"></div><div class="ap-binary-feedback mt-2 text-sm"></div></div>' +
        '<button class="btn-ap-binary-practice-check jhncc-primary px-4 py-1.5 rounded text-sm mt-3">Check Answer</button></div>';
    });
    questionHtml += '</div></div>';
    return questionHtml;
  }
  var html = '<div class="border border-blue-200 bg-blue-50 rounded-lg p-4"><h4 class="font-semibold text-blue-900 mb-2">Your additional practice</h4>' +
    '<p class="text-sm text-blue-800 mb-3">Complete at least three practice tasks. They are based on your AP result. If you had fewer than three areas to improve, choose the extra focus areas yourself. Use the Scratch workspace below, then check your practice project locally.</p><div class="space-y-3">';
  cards.forEach(function(card, i) {
    html += '<div class="bg-white border border-blue-100 rounded-lg p-3">';
    if (card.choice) {
      html += '<label class="block text-xs text-gray-500 mb-1">Choose practice focus ' + (i + 1) + '</label><select class="ap-practice-choice jhncc-focus border border-gray-300 rounded px-2 py-1 text-sm mb-2" data-target="ap-practice-prompt-' + i + '">';
      allCriteria.forEach(function(c) {
        html += '<option value="' + escapeHtml(c.id) + '"' + (c.id === card.id ? ' selected' : '') + '>' + escapeHtml(c.text) + '</option>';
      });
      html += '</select>';
    } else {
      html += '<div class="text-xs uppercase tracking-wide text-blue-500 font-semibold mb-1">Practice ' + (i + 1) + '</div>';
      html += '<div class="font-semibold text-gray-800 mb-1">' + escapeHtml(card.text || '') + '</div>';
    }
    html += '<p id="ap-practice-prompt-' + i + '" class="text-sm text-gray-700 mb-2">' + escapeHtml(card.prompt) + '</p></div>';
  });
  html += '</div><div class="mt-4 bg-white border border-blue-100 rounded-lg overflow-hidden">' +
    '<div class="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-blue-100 border-b border-blue-200">' +
      '<span class="font-semibold text-blue-900">Practice workspace</span>' +
      '<button class="btn-ap-practice-check jhncc-primary px-4 py-1.5 rounded text-sm">Check Practice Project</button>' +
    '</div>' +
    '<div class="grid lg:grid-cols-[1fr_320px] gap-0 min-h-[520px]">' +
      '<iframe class="ap-practice-frame border-0 w-full h-[520px]" src="about:blank"></iframe>' +
      '<div class="ap-practice-feedback border-l border-blue-100 p-3 text-sm overflow-y-auto"><p class="text-gray-500">Build your practice project, then click Check Practice Project. These checks are local practice only and do not change your AP score.</p></div>' +
    '</div></div></div>';
  return html;
}

function openAssessmentScoreEditor(code, assessmentId, rec, opts) {
  opts = opts || {};
  rec = rec || {};
  var spec = ASSESSMENTS[assessmentId] || {};
  var sourceRubric = rec.rubric && rec.rubric.length ? rec.rubric : zeroAssessmentCriteria(assessmentId);
  var panel = opts.results ? document.getElementById('ap-results-content') : document.getElementById('aph-inspector');
  if (!panel) panel = document.getElementById('aph-inspector') || document.getElementById('ap-results-content');
  if (!panel) return;
  panel.classList && panel.classList.remove('hidden');
  var html = '<div class="bg-gray-800 text-white rounded-lg p-4 mt-4">' +
    '<div class="flex items-center justify-between gap-3 mb-3"><h3 class="font-bold text-white">Edit AP marks: ' + escapeHtml(studentName(code) || code) + '</h3>' +
    '<button class="btn-ap-score-close text-gray-400 hover:text-white">Close</button></div>' +
    '<p class="text-sm text-gray-300 mb-3">' + escapeHtml(spec.title || assessmentId) + '</p>' +
    '<div class="space-y-2">';
  sourceRubric.forEach(function(c, i) {
    var max = Number(c.marks || 0);
    var val = Math.max(0, Math.min(max, Number(c.awarded || 0)));
    html += '<label class="grid grid-cols-[1fr_90px] gap-3 items-center bg-gray-900 rounded px-3 py-2 text-sm">' +
      '<span>' + escapeHtml(c.text || c.id || ('Criterion ' + (i + 1))) + ' <span class="text-gray-500">/ ' + max + '</span></span>' +
      '<input class="ap-score-input text-gray-900 border border-gray-300 rounded px-2 py-1" type="number" min="0" max="' + max + '" step="1" value="' + val + '" data-idx="' + i + '">' +
      '</label>';
  });
  html += '</div><label class="block mt-3 text-xs text-gray-400">Reason for manual change</label>' +
    '<input id="ap-score-reason" class="w-full text-gray-900 border border-gray-300 rounded px-3 py-2 text-sm mt-1" placeholder="e.g. Checked SB3 manually - valid alternative solution">' +
    '<div class="flex flex-wrap items-center justify-between gap-3 mt-4">' +
      '<div id="ap-score-editor-total" class="font-bold text-yellow-300"></div>' +
      '<button class="btn-ap-score-save px-4 py-2 rounded bg-yellow-500 text-gray-900 font-semibold">Save manual marks</button>' +
    '</div><div id="ap-score-editor-status" class="mt-3 text-sm"></div></div>';
  panel.innerHTML = html;
  var inputs = panel.querySelectorAll('.ap-score-input');
  function currentRubric() {
    return sourceRubric.map(function(c, i) {
      var max = Number(c.marks || 0);
      var input = panel.querySelector('.ap-score-input[data-idx="' + i + '"]');
      var awarded = Math.max(0, Math.min(max, Number(input && input.value || 0)));
      return Object.assign({}, c, { awarded: awarded });
    });
  }
  function updateTotal() {
    var rubric = currentRubric();
    var total = rubric.reduce(function(t, c) { return t + (Number(c.awarded) || 0); }, 0);
    var max = rubric.reduce(function(t, c) { return t + (Number(c.marks) || 0); }, 0) || (spec.maxScore || 21);
    panel.querySelector('#ap-score-editor-total').textContent = 'New score: ' + total + ' / ' + max;
  }
  inputs.forEach(function(input) { input.oninput = updateTotal; });
  updateTotal();
  panel.querySelector('.btn-ap-score-close').onclick = function() {
    if (opts.results) renderAssessmentResultsPanel();
    else panel.classList.add('hidden');
  };
  panel.querySelector('.btn-ap-score-save').onclick = async function() {
    var status = panel.querySelector('#ap-score-editor-status');
    try {
      var rubric = currentRubric();
      var score = rubric.reduce(function(t, c) { return t + (Number(c.awarded) || 0); }, 0);
      var maxScore = rubric.reduce(function(t, c) { return t + (Number(c.marks) || 0); }, 0) || (spec.maxScore || 21);
      var reason = document.getElementById('ap-score-reason').value || 'Manual teacher adjustment';
      var completedAt = rec.completedAt || Date.now();
      var update = {
        score: score,
        maxScore: maxScore,
        rubric: rubric,
        completedAt: completedAt,
        manualOverride: true,
        manualOverrideAt: Date.now(),
        manualOverrideReason: reason,
        className: rec.className || assessment.className || apResultsState.className || null
      };
      if (opts.session && assessment.sessionRef) {
        await assessment.sessionRef.child('answers/0/' + code).update(Object.assign({}, update, { completed: true }));
      }
      await saveAssessmentProgressRecord(code, assessmentId, rec.lobbyCode || assessment.lobbyCode || ('manual-' + completedAt), update);
      status.className = 'mt-3 text-sm text-green-300';
      status.textContent = 'Manual marks saved.';
      if (opts.results) {
        await refreshAssessmentResultsData(apResultsState.className);
        renderAssessmentResultsPanel();
      }
    } catch(e) {
      status.className = 'mt-3 text-sm text-red-300';
      status.textContent = 'Could not save marks: ' + errorMessage(e, 'Unknown error.');
    }
  };
}

function wireAssessmentPracticeChoices(box) {
  box.querySelectorAll('.ap-practice-choice').forEach(function(sel) {
    sel.onchange = function() {
      var target = document.getElementById(sel.dataset.target);
      var record = box.__apPracticeRecord || {};
      if (target) target.textContent = assessmentPracticePrompt(sel.value, record.assessmentId || assessment.assessmentId);
    };
  });
}

function selectedAssessmentPracticeIds(box) {
  var ids = [];
  box.querySelectorAll('.ap-practice-choice').forEach(function(sel) { ids.push(sel.value); });
  var rubric = [];
  try {
    var record = box.__apPracticeRecord || {};
    rubric = record.rubric || [];
  } catch(e) {}
  rubric.filter(function(c) { return (c.awarded || 0) < (c.marks || 0); }).slice(0, 5).forEach(function(c) {
    if (ids.indexOf(c.id) === -1) ids.push(c.id);
  });
  while (ids.length > 3 && ids[ids.length - 1] == null) ids.pop();
  return ids.slice(0, Math.max(3, ids.length));
}

function setupAssessmentPracticeWorkspace(box, record) {
  box.__apPracticeRecord = record || {};
  var spec = ASSESSMENTS[(record && record.assessmentId) || assessment.assessmentId] || {};
  if (spec.questions && spec.questions.length) {
    setupBinaryAssessmentPracticeWorkspace(box, spec);
    return;
  }
  var frame = box.querySelector('.ap-practice-frame');
  var feedback = box.querySelector('.ap-practice-feedback');
  var button = box.querySelector('.btn-ap-practice-check');
  if (!frame || !button) return;
  frame.src = './scratch/editor.html?assessmentPractice=1&suppressBeforeUnload=1&_apPractice=' + Date.now();
  button.onclick = async function() {
    button.disabled = true;
    button.textContent = 'Checking...';
    try {
      var vm = await waitForFrameScratchVm(frame);
      var result = await validateAssessmentScratchVm(vm, (record && record.assessmentId) || assessment.assessmentId);
      var ids = selectedAssessmentPracticeIds(box);
      var subset = result.criteria.filter(function(c) { return ids.indexOf(c.id) !== -1; });
      feedback.innerHTML = '<div class="font-semibold text-gray-800 mb-2">Practice check: ' +
        subset.reduce(function(t, c) { return t + (c.awarded || 0); }, 0) + ' / ' +
        subset.reduce(function(t, c) { return t + (c.marks || 0); }, 0) + '</div>' +
        subset.map(function(c) {
          var ok = (c.awarded || 0) >= (c.marks || 0);
          return '<div class="border-b border-gray-100 py-2"><div class="flex justify-between gap-3"><span>' + escapeHtml(c.text) + '</span><strong class="' + (ok ? 'text-green-700' : 'text-red-700') + '">' + c.awarded + '/' + c.marks + '</strong></div><p class="text-xs text-gray-500 mt-1">' + escapeHtml(assessmentPracticePrompt(c.id, (record && record.assessmentId) || assessment.assessmentId)) + '</p></div>';
        }).join('');
    } catch(e) {
      feedback.innerHTML = '<p class="text-red-600">Could not check the practice project: ' + escapeHtml(e.message) + '</p>';
    }
    button.disabled = false;
    button.textContent = 'Check Practice Project';
  };
}

function setupBinaryAssessmentPracticeWorkspace(box, spec) {
  var qById = {};
  (spec.questions || []).forEach(function(q) { qById[q.id] = q; });
  box.querySelectorAll('.ap-binary-practice').forEach(function(card) {
    var q = qById[card.dataset.qid];
    var widgetEl = card.querySelector('.ap-binary-widget');
    var feedback = card.querySelector('.ap-binary-feedback');
    var button = card.querySelector('.btn-ap-binary-practice-check');
    var widget = null;
    if (!q || !widgetEl || !button) return;
    if (q.type === 'bit_input') {
      widgetEl.innerHTML = '<div class="ap-practice-bit-widget"></div>';
      widget = BinaryLesson.mountBitInput(widgetEl.querySelector('.ap-practice-bit-widget'), { useNibbles: !!q.useNibbles, showTotal: !q.useNibbles });
    } else if (q.type === 'addition_input') {
      widgetEl.innerHTML = '<div class="ap-practice-add-widget"></div>';
      widget = BinaryLesson.mountAddInput(widgetEl.querySelector('.ap-practice-add-widget'), q.rowA, q.rowB);
    } else if (q.type === 'code_input') {
      widgetEl.innerHTML = '<textarea class="ap-practice-code quiz-code-area w-full min-h-[180px]" spellcheck="false" placeholder="Write your Python code here"></textarea>';
    } else if (q.type === 'output_text') {
      widgetEl.innerHTML = '<textarea class="ap-practice-output ex-textarea mt-2" rows="4" autocomplete="off" spellcheck="false" placeholder="Type the exact output here"></textarea>';
    } else if (q.type === 'mcq') {
      widgetEl.innerHTML = '<div class="grid gap-2">' + (q.options || []).map(function(opt, i) {
        return '<label class="flex items-start gap-2 bg-gray-800 border border-gray-700 rounded p-2 cursor-pointer"><input type="radio" name="ap-practice-mcq-' + escapeHtml(q.id) + '" value="' + i + '" class="mt-1 accent-[rgb(245,186,41)]"><span>' + escapeHtml(opt) + '</span></label>';
      }).join('') + '</div>';
    } else {
      widgetEl.innerHTML = '<input class="ap-practice-text ex-input mt-2" autocomplete="off" spellcheck="false" placeholder="Type your answer">';
    }
    button.onclick = async function() {
      var input = card.querySelector('.ap-practice-text');
      var codeInput = card.querySelector('.ap-practice-code');
      var outputInput = card.querySelector('.ap-practice-output');
      var radio = card.querySelector('input[type="radio"]:checked');
      var actual = widget && widget.getAnswer ? widget.getAnswer() : (codeInput ? codeInput.value : (outputInput ? outputInput.value : (input ? input.value : (radio ? radio.value : ''))));
      button.disabled = true;
      var oldText = button.textContent;
      button.textContent = 'Checking...';
      try {
        var check = await validateAssessmentQuestionAnswerAsync(q, actual);
        var ok = check.correct;
        feedback.innerHTML = ok
          ? '<div class="text-green-300">Correct.</div>'
          : '<div class="text-red-300">Not quite. Expected <span class="font-mono">' + escapeHtml(check.expected || q.answer || q.sampleAnswer || '') + '</span>.</div>';
      } finally {
        button.disabled = false;
        button.textContent = oldText;
      }
    };
  });
}

function waitForFrameScratchVm(frame) {
  return new Promise(function(resolve, reject) {
    var started = Date.now();
    var timer = setInterval(function() {
      try {
        if (frame.contentWindow && frame.contentWindow.vm && frame.contentWindow.vm.runtime) {
          clearInterval(timer);
          resolve(frame.contentWindow.vm);
        } else if (Date.now() - started > 20000) {
          clearInterval(timer);
          reject(new Error('Scratch editor did not finish loading.'));
        }
      } catch(e) {}
    }, 250);
  });
}

async function exportAssessmentResults(className, assessmentId, lobbyCode) {
  assessmentId = assessmentId || 'year7-ap2-scratch';
  var spec = ASSESSMENTS[assessmentId] || {};
  var defaultMax = spec.maxScore || 21;
  var classSnap = await state.db.ref('classes/' + className + '/codes').get();
  var rows = [];
  var scores = [];
  var codes = classSnap.exists() ? Object.keys(classSnap.val() || {}) : [];
  var progSnaps = await Promise.all(codes.map(function(c) { return state.db.ref('progress/' + c + '/assessments/' + assessmentId).get(); }));
  codes.forEach(function(code, i) {
    var r = progSnaps[i].exists() ? progSnaps[i].val() : null;
    var score = r ? (r.score || 0) : 0;
    scores.push(score);
    rows.push({ code: code, name: studentName(code) || '', score: score, maxScore: r ? (r.maxScore || defaultMax) : defaultMax, completedAt: r && r.completedAt });
  });
  rows.sort(function(a, b) { return b.score - a.score; });
  var completedRows = rows.filter(function(r) { return r.completedAt; });
  var dpGrades = definitePurposeGrades(completedRows.map(function(r) { return r.score; }));
  var scoreGradeMap = {};
  completedRows.forEach(function(r, i) { scoreGradeMap[r.score] = dpGrades[i]; });
  var csv = 'Name,Score,Definite Purpose\n';
  rows.forEach(function(r) {
    csv += [r.name, r.score, r.completedAt ? scoreGradeMap[r.score] : ''].map(csvCell).join(',') + '\n';
  });
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = className + '-AP-results.csv';
  a.click();
}

function definitePurposeGrades(scores) {
  // scores must be sorted descending. Returns a grade for each entry.
  // Grades are assigned by score threshold so tied scores always get the same (better) grade.
  var n = scores.length;
  if (!n) return [];
  var idx1 = Math.min(Math.ceil(n * 0.05) - 1, n - 1); // last index ideally in grade 1
  var idx2 = Math.min(Math.ceil(n * 0.20) - 1, n - 1); // last index ideally in grade 2
  var idx3 = Math.min(Math.ceil(n * 0.80) - 1, n - 1); // last index ideally in grade 3
  var thresh1 = scores[idx1]; // min score to receive grade 1
  var thresh2 = scores[idx2]; // min score to receive grade 2
  var thresh3 = scores[idx3]; // min score to receive grade 3
  return scores.map(function(score) {
    if (score >= thresh1) return 1;
    if (score >= thresh2) return 2;
    if (score >= thresh3) return 3;
    return 4;
  });
}

async function requestStudentApBackup(code, lobbyCode, assessmentId, btn) {
  if (!state.db || !code) { alert('Cannot connect to database.'); return; }
  var origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Requesting…';
  try {
    // Write the request to the student's recovery path
    await state.db.ref('progress/' + code + '/apRecoveryRequest').set({
      lobbyCode: lobbyCode,
      assessmentId: assessmentId,
      requestedAt: Date.now()
    });
    // Poll for a response for up to 10 seconds
    var responseRef = state.db.ref('progress/' + code + '/apRecoveryResponse');
    var backup = null;
    for (var i = 0; i < 20 && !backup; i++) {
      await new Promise(function(r) { setTimeout(r, 500); });
      var snap = await responseRef.get();
      if (snap.exists()) {
        var data = snap.val() || {};
        if (data.lobbyCode === lobbyCode && data.respondedAt && data.respondedAt > Date.now() - 15000) {
          backup = data;
        }
      }
    }
    if (!backup) {
      alert('No backup received. The student may not be connected or has no local backup for this session.');
      return;
    }
    var scoreText = (backup.score != null ? backup.score + ' / ' + (backup.maxScore || '?') : 'unknown score');
    var savedTime = backup.savedAt ? new Date(backup.savedAt).toLocaleTimeString('en-GB') : 'unknown time';
    if (!confirm('Local backup found for ' + (backup.savedAt ? new Date(backup.savedAt).toLocaleString('en-GB') : 'this session') + '.\nScore in backup: ' + scoreText + ' (saved ' + savedTime + ').\n\nApply this backup to results?')) return;
    await applyStudentApBackup(code, assessmentId, lobbyCode, backup);
    alert('Backup applied successfully.');
    renderAssessmentResultsPanel();
  } catch(e) {
    alert('Recovery failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}

async function applyStudentApBackup(code, assessmentId, lobbyCode, backup) {
  var spec = ASSESSMENTS[assessmentId] || {};
  var score = backup.score || 0;
  var maxScore = backup.maxScore || spec.maxScore || 0;
  var rubric = backup.rubric || [];
  // For question paper backups that have answers but no rubric, recompute
  if (spec.questions && spec.questions.length && backup.answers && (!rubric || !rubric.length)) {
    var result = assessQuestionAssessment(spec, backup.answers);
    score = result.score;
    maxScore = result.maxScore;
    rubric = stripRubricForStorage(result.criteria);
  }
  var completedAt = backup.savedAt || Date.now();
  var record = {
    completed: true,
    recoveredFromBackup: true,
    completedAt: completedAt,
    score: score,
    maxScore: maxScore,
    rubric: rubric
  };
  if (backup.answers) record.answers = backup.answers;
  // Update session record if lobby code is available
  if (lobbyCode) {
    try {
      await state.db.ref('quizSessions/' + lobbyCode + '/answers/0/' + code).update(record);
    } catch(e) {}
  }
  // Always update the progress record
  await saveAssessmentProgressRecord(code, assessmentId, lobbyCode, Object.assign({
    recoveredFromBackup: true,
    className: state.className || null
  }, record));
}

function csvCell(value) {
  var s = String(value == null ? '' : value);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// ── Admin class feedback modal ────────────────────────────────
async function showAdminClassFeedbackModal(className, assessmentId) {
  var modal = document.getElementById('modal-ap-class-feedback');
  var body  = document.getElementById('ap-feedback-modal-body');
  var title = document.getElementById('ap-feedback-modal-title');
  if (!modal || !body) return;

  var spec = ASSESSMENTS[assessmentId] || {};
  title.textContent = 'Whole Class Feedback — ' + (spec.title || assessmentId);
  body.innerHTML = '<p class="text-gray-400 text-center py-8">Loading…</p>';
  modal.classList.remove('hidden');

  try {
    var snap = await state.db.ref('classes/' + className + '/apFeedback/' + assessmentId).get();
    if (!snap.exists() || !snap.val().released) {
      body.innerHTML =
        '<div class="text-center py-8">' +
          '<p class="text-gray-500 mb-4">No feedback has been released yet for this AP.</p>' +
          '<p class="text-sm text-gray-400">Use <strong>Release Feedback</strong> first to generate and publish the summary, then come back here to view it.</p>' +
        '</div>';
      return;
    }
    var feedback = snap.val();
    // Re-use the student render function but without the individual practice section
    var stats = feedback.criteriaStats || [];
    var topCodes = feedback.topCodes || [];
    var html = '<p class="text-sm text-gray-500 mb-4">' + escapeHtml(feedback.assessmentTitle || assessmentId) +
      ' · ' + (feedback.studentCount || 0) + ' submissions · released ' +
      new Date(feedback.releasedAt || Date.now()).toLocaleString('en-GB') + '</p>';

    html += '<div class="grid md:grid-cols-2 gap-4 mb-5">';
    html += '<div class="border border-gray-200 rounded-lg p-3"><h4 class="font-semibold text-gray-800 mb-3">Class performance by criterion</h4><div class="space-y-3">';
    stats.forEach(function(c) {
      var colour = c.percent >= 70 ? 'bg-green-500' : c.percent >= 40 ? 'bg-yellow-500' : 'bg-red-500';
      html += '<div><div class="flex justify-between gap-3 text-xs mb-1">' +
        '<span class="font-medium text-gray-700">' + escapeHtml(c.text) + '</span>' +
        '<span class="text-gray-500">' + c.percent + '% (' + c.awarded + '/' + c.possible + ' marks)</span>' +
        '</div><div class="h-3 rounded-full bg-gray-100 overflow-hidden">' +
        '<div class="' + colour + ' h-3" style="width:' + Math.max(2, c.percent) + '%"></div></div></div>';
    });
    html += '</div></div>';

    html += '<div class="space-y-4">';
    html += '<div class="border border-green-200 bg-green-50 rounded-lg p-3"><h4 class="font-semibold text-green-800 mb-2">Best class areas</h4>' + feedbackListHtml(feedback.best || []) + '</div>';
    html += '<div class="border border-red-200 bg-red-50 rounded-lg p-3"><h4 class="font-semibold text-red-800 mb-2">Most difficult areas</h4>' + feedbackListHtml(feedback.struggle || []) + '</div>';
    html += '<div class="border border-yellow-200 bg-yellow-50 rounded-lg p-3"><h4 class="font-semibold text-yellow-800 mb-2">Top scores</h4>';
    if (topCodes.length) {
      html += '<div class="flex flex-wrap gap-2">';
      topCodes.forEach(function(t, i) {
        var name = studentName(t.code) || t.code;
        html += '<span class="rounded-full bg-white border border-yellow-300 px-3 py-1 text-sm font-mono text-yellow-800">' +
          (i + 1) + '. ' + escapeHtml(name) + ' · ' + t.score + '/' + t.maxScore + '</span>';
      });
      html += '</div>';
    } else {
      html += '<p class="text-sm text-yellow-700">No submitted scores yet.</p>';
    }
    html += '</div></div></div>';
    body.innerHTML = html;
  } catch(e) {
    body.innerHTML = '<p class="text-red-600 py-4">Error loading feedback: ' + escapeHtml(e.message) + '</p>';
  }
}

document.getElementById('btn-ap-feedback-modal-close').onclick = function() {
  document.getElementById('modal-ap-class-feedback').classList.add('hidden');
};
document.getElementById('modal-ap-class-feedback').onclick = function(e) {
  if (e.target === this) this.classList.add('hidden');
};
