// ── Admin ─────────────────────────────────────────────────────
async function showAdmin() {
  document.getElementById('modal-admin').classList.remove('hidden');
  applyAdminPermissions();
  var needsClasses = !state.isTeacher || canDo('viewClasses') || canDo('hostQuiz') || canDo('forceQuiz') || canDo('viewAP') || canDo('forceAP') || canDo('viewProgress') || canDo('exportProgress') || canDo('manageClasses');
  var initialTab = needsClasses ? 'classes' : (canDo('manageTeachers') ? 'teachers' : 'quiz-results');
  setAdminTab(initialTab);
  if (needsClasses) { await loadAdminClassList(); loadActiveSessions(); }
}

function setAdminTab(tab) {
  var classesTab = tab === 'classes';
  var quizResultsTab = tab === 'quiz-results';
  var apResultsTab = tab === 'ap-results';
  var forceApTab = tab === 'force-ap';
  var teachersTab = tab === 'teachers';
  var debugTab = tab === 'debug';
  var accessTab = tab === 'access';
  var activeCls = 'admin-tab px-3 py-2 text-sm font-semibold border-b-2 border-[rgb(176,28,35)] text-[rgb(176,28,35)]';
  var idleCls = 'admin-tab px-3 py-2 text-sm font-semibold border-b-2 border-transparent text-gray-500 hover:text-gray-800';
  document.getElementById('admin-classes-tab').classList.toggle('hidden', !classesTab);
  document.getElementById('admin-quiz-results-tab').classList.toggle('hidden', !quizResultsTab);
  document.getElementById('admin-ap-results-tab').classList.toggle('hidden', !apResultsTab);
  document.getElementById('admin-force-ap-tab').classList.toggle('hidden', !forceApTab);
  document.getElementById('admin-teachers-tab').classList.toggle('hidden', !teachersTab);
  document.getElementById('admin-debug-tab').classList.toggle('hidden', !debugTab);
  document.getElementById('admin-access-tab').classList.toggle('hidden', !accessTab);
  [['admin-tab-classes',classesTab],['admin-tab-quiz-results',quizResultsTab],
   ['admin-tab-ap-results',apResultsTab],['admin-tab-force-ap',forceApTab],
   ['admin-tab-teachers',teachersTab],['admin-tab-debug',debugTab],
   ['admin-tab-access',accessTab]
  ].forEach(function(pair) {
    var el = document.getElementById(pair[0]);
    if (!el) return;
    var wasHidden = el.classList.contains('hidden');
    el.className = pair[1] ? activeCls : idleCls;
    if (wasHidden) el.classList.add('hidden');
  });
  if (quizResultsTab) loadQuizResultsClassOptions();
  if (apResultsTab) loadApResultsClassOptions();
  if (teachersTab) renderTeachersTab();
  if (forceApTab) loadForceApTab();
  if (accessTab) loadAccessTab();
}

document.getElementById('admin-tab-classes').onclick = function() { setAdminTab('classes'); };
document.getElementById('admin-tab-quiz-results').onclick = function() { setAdminTab('quiz-results'); };
document.getElementById('admin-tab-ap-results').onclick = function() { setAdminTab('ap-results'); };
document.getElementById('admin-tab-force-ap').onclick = function() { setAdminTab('force-ap'); };
document.getElementById('admin-tab-teachers').onclick = function() { setAdminTab('teachers'); };
document.getElementById('admin-tab-debug').onclick = function() { setAdminTab('debug'); };
document.getElementById('admin-tab-access').onclick = function() { setAdminTab('access'); };

document.getElementById('btn-build-code-index').onclick = async function() {
  var statusEl = document.getElementById('build-index-status');
  var btn = this;
  btn.disabled = true;
  statusEl.textContent = 'Scanning classes…';
  try {
    var classesSnap = await state.db.ref('classes').get();
    if (!classesSnap.exists()) { statusEl.textContent = 'No classes found.'; btn.disabled = false; return; }
    var updates = {};
    var total = 0;
    classesSnap.forEach(function(classSnap) {
      // Backfill classNames index
      updates['classNames/' + classSnap.key] = true;
      var codesVal = classSnap.child('codes').val() || {};
      Object.keys(codesVal).forEach(function(code) {
        updates['codeIndex/' + code.toLowerCase()] = { className: classSnap.key, storedCode: code };
        updates['studentCodes/' + code] = { className: classSnap.key, indexedAt: Date.now() };
        total++;
      });
    });
    if (total === 0) { statusEl.textContent = 'No codes found.'; btn.disabled = false; return; }
    await state.db.ref().update(updates);
    statusEl.textContent = '✅ Index built — ' + total + ' codes indexed, ' + classesSnap.numChildren() + ' classes registered.';
  } catch(e) {
    statusEl.textContent = '❌ Error: ' + e.message;
  }
  btn.disabled = false;
};

// ── Teacher account management ────────────────────────────────

var TEACHER_PERMISSION_DEFS = [
  { group: 'Classes & Students', perms: [
    { id: 'viewClasses',    label: 'View classes and student list' },
    { id: 'manageClasses',  label: 'Create / delete classes and manage codes' },
    { id: 'viewProgress',   label: 'View student progress' },
    { id: 'exportProgress', label: 'Export progress data (Excel)' },
  ]},
  { group: 'Quizzes', perms: [
    { id: 'hostQuiz',       label: 'Host live quizzes' },
    { id: 'viewQuizResults',label: 'View quiz results' },
    { id: 'forceQuiz',      label: 'Force a quiz for a class' },
  ]},
  { group: 'Assessments', perms: [
    { id: 'viewAP',         label: 'View assessment results' },
    { id: 'forceAP',        label: 'Force / unlock assessments for a class' },
  ]},
  { group: 'Account Management', perms: [
    { id: 'manageTeachers', label: 'Create and delete teacher accounts (account management)' },
    { id: 'viewDebug',      label: 'Access debug panel' },
    { id: 'fullAdmin',      label: 'Full admin — all permissions (equivalent to admin account)' },
  ]},
];

function canDo(perm) {
  if (state.isAdmin) return true;
  if (!state.isTeacher || !state.teacherPermissions) return false;
  return !!(state.teacherPermissions.fullAdmin || state.teacherPermissions[perm]);
}

function applyAdminPermissions() {
  if (state.isAdmin) {
    // Full admin — restore everything
    ['admin-tab-classes','admin-tab-quiz-results','admin-tab-ap-results','admin-tab-force-ap',
     'admin-tab-access','admin-tab-teachers','admin-tab-debug',
     'admin-gen-row','admin-add-row'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.classList.remove('hidden');
    });
    return;
  }
  if (!state.isTeacher) return;
  // Hide all tabs first, then show permitted ones
  var needsClasses = canDo('viewClasses') || canDo('hostQuiz') || canDo('forceQuiz') || canDo('viewAP') || canDo('forceAP') || canDo('viewProgress') || canDo('exportProgress') || canDo('manageClasses');
  var tabMap = {
    'admin-tab-classes':      needsClasses,
    'admin-tab-quiz-results': canDo('viewQuizResults'),
    'admin-tab-ap-results':   canDo('viewAP'),
    'admin-tab-force-ap':     canDo('forceAP'),
    'admin-tab-access':       canDo('viewProgress') || canDo('viewClasses'),
    'admin-tab-teachers':     canDo('manageTeachers'),
    'admin-tab-debug':        canDo('viewDebug'),
  };
  Object.keys(tabMap).forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !tabMap[id]);
  });
  ['admin-gen-row','admin-add-row'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !canDo('manageClasses'));
  });
}

async function renderTeachersTab() {
  var panel = document.getElementById('admin-teachers-tab');
  panel.innerHTML = '<p class="text-gray-400 text-xs p-4">Loading teachers…</p>';
  var snap;
  try { snap = await state.db.ref('teachers').get(); } catch(e) {
    panel.innerHTML = '<p class="text-red-400 text-xs p-4">Error loading teachers.</p>'; return;
  }
  var teachers = {};
  if (snap && snap.exists()) snap.forEach(function(c) { teachers[c.key] = c.val(); });

  var rows = Object.keys(teachers).map(function(code) {
    var t = teachers[code];
    var permList = Object.keys(t.permissions||{}).filter(function(k){ return t.permissions[k]; }).join(', ') || 'none';
    return '<tr class="border-b border-gray-100 hover:bg-gray-50">'
      + '<td class="py-2 px-3 font-mono text-sm font-semibold text-gray-800">'+escapeHtml(code)+'</td>'
      + '<td class="py-2 px-3 text-sm text-gray-600 max-w-xs truncate">'+escapeHtml(permList)+'</td>'
      + '<td class="py-2 px-3 text-right space-x-2">'
      + '<button class="btn-teacher-edit text-xs text-blue-600 hover:underline" data-code="'+escapeHtml(code)+'">Edit</button>'
      + '<button class="btn-teacher-delete text-xs text-red-500 hover:underline" data-code="'+escapeHtml(code)+'">Delete</button>'
      + '</td></tr>';
  }).join('');

  panel.innerHTML = '<div class="p-4">'
    + '<div class="flex items-center justify-between mb-3">'
    + '<h3 class="font-semibold text-gray-800 text-sm">Teacher accounts ('+Object.keys(teachers).length+')</h3>'
    + '<button onclick="showTeacherForm(null,null)" class="px-3 py-1.5 text-xs rounded font-semibold jhncc-primary">+ Add teacher</button>'
    + '</div>'
    + (rows ? '<div class="overflow-x-auto"><table class="w-full text-left"><thead><tr>'
      + '<th class="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Code</th>'
      + '<th class="py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Permissions</th>'
      + '<th></th></tr></thead><tbody>'+rows+'</tbody></table></div>'
      : '<p class="text-gray-400 text-sm">No teacher accounts yet. Add one below.</p>')
    + '<div id="teacher-form-wrap" class="mt-4"></div>'
    + '</div>';

  panel.querySelectorAll('.btn-teacher-edit').forEach(function(btn) {
    btn.onclick = function() { showTeacherForm(btn.dataset.code, teachers[btn.dataset.code]); };
  });
  panel.querySelectorAll('.btn-teacher-delete').forEach(function(btn) {
    btn.onclick = function() { deleteTeacher(btn.dataset.code); };
  });
}

function buildPermissionCheckboxesHtml(perms) {
  perms = perms || {};
  return TEACHER_PERMISSION_DEFS.map(function(group) {
    return '<div class="mb-3"><p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">'+group.group+'</p>'
      + group.perms.map(function(p) {
          var checked = perms[p.id] ? ' checked' : '';
          return '<label class="flex items-center gap-2 text-sm text-gray-700 mb-1 cursor-pointer">'
            + '<input type="checkbox" class="teacher-perm-cb" data-perm="'+p.id+'"'+checked+'> '+p.label+'</label>';
        }).join('')
      + '</div>';
  }).join('');
}

function showTeacherForm(code, teacherData) {
  var wrap = document.getElementById('teacher-form-wrap');
  if (!wrap) return;
  var isEdit = !!code;
  var perms = (teacherData && teacherData.permissions) || {};
  wrap.innerHTML = '<div class="border border-gray-200 rounded-lg p-4 bg-gray-50 mt-2">'
    + '<h4 class="font-semibold text-gray-800 text-sm mb-3">'+(isEdit ? 'Edit teacher: '+code : 'New teacher account')+'</h4>'
    + (isEdit ? '' : '<label class="block mb-3"><span class="text-xs font-semibold text-gray-600 uppercase tracking-wide">Login code</span>'
      + '<input id="tf-code" class="mt-1 block w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono" placeholder="e.g. TEACH01" autocomplete="off"></label>')
    + '<div class="mb-3"><span class="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-2">Permissions</span>'
    + buildPermissionCheckboxesHtml(perms)
    + '</div>'
    + '<div class="flex gap-2">'
    + '<button id="tf-save" class="px-4 py-1.5 text-sm rounded font-semibold jhncc-primary">'+(isEdit?'Save changes':'Create account')+'</button>'
    + '<button onclick="document.getElementById(\'teacher-form-wrap\').innerHTML=\'\'" class="px-4 py-1.5 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-100">Cancel</button>'
    + '</div>'
    + '<div id="tf-fb" class="mt-2 text-sm"></div>'
    + '</div>';

  document.getElementById('tf-save').onclick = async function() {
    var saveCode = isEdit ? code : (document.getElementById('tf-code').value.trim().toUpperCase());
    var fb = document.getElementById('tf-fb');
    if (!saveCode) { fb.className='text-red-500'; fb.textContent='Enter a login code.'; return; }
    if (!/^[A-Z0-9_-]{2,20}$/.test(saveCode)) { fb.className='text-red-500'; fb.textContent='Code must be 2–20 characters: letters, numbers, _ or -'; return; }
    var newPerms = {};
    wrap.querySelectorAll('.teacher-perm-cb').forEach(function(cb) {
      if (cb.checked) newPerms[cb.dataset.perm] = true;
    });
    try {
      fb.className='text-gray-400'; fb.textContent='Saving…';
      await state.db.ref('teachers/'+saveCode.toLowerCase()).set({ permissions: newPerms });
      fb.className='text-green-600'; fb.textContent='Saved!';
      setTimeout(function(){ renderTeachersTab(); }, 800);
    } catch(e) { fb.className='text-red-500'; fb.textContent='Error saving: '+e.message; }
  };
}

async function deleteTeacher(code) {
  if (!confirm('Delete teacher account "'+code+'"? This cannot be undone.')) return;
  try {
    await state.db.ref('teachers/'+code.toLowerCase()).remove();
    renderTeachersTab();
  } catch(e) { alert('Error deleting teacher: '+e.message); }
}

async function loadActiveSessions() {
  var panel = document.getElementById('admin-sessions-panel');
  var list  = document.getElementById('admin-sessions-list');
  list.innerHTML = '<p class="text-gray-400 text-xs px-4 py-2">Checking…</p>';
  panel.classList.remove('hidden');
  try {
    var byCode = {};
    function addCandidate(code, className, lessonId) {
      if (!code) return;
      byCode[code] = Object.assign(byCode[code] || {}, {
        code: code,
        className: className || (byCode[code] && byCode[code].className) || '—',
        lessonId: lessonId || (byCode[code] && byCode[code].lessonId) || ''
      });
    }

    // Read only the active-sessions index (tiny) + per-class forcedQuiz fields
    // This replaces the old full quizSessions tree read which grew unbounded.
    var [classNamesList, activeIdxSnap] = await Promise.all([
      getClassNames(),
      state.db.ref('activeSessions').get()
    ]);
    // Check forcedQuiz for each known class (reads just one small field per class)
    if (classNamesList.length) {
      var classNames = classNamesList;
      var forcedSnaps = await Promise.all(classNames.map(function(cn) {
        return state.db.ref('classes/' + cn + '/forcedQuiz').get();
      }));
      classNames.forEach(function(cn, i) {
        var forced = forcedSnaps[i].val();
        if (forced && forced.active && forced.lobbyCode) {
          addCandidate(forced.lobbyCode, cn, forced.lessonId || '');
        }
      });
    }
    // Also pick up any unforced active sessions from the lightweight index
    if (activeIdxSnap.exists()) {
      activeIdxSnap.forEach(function(child) {
        var s = child.val() || {};
        addCandidate(child.key, s.className || null, s.lessonId || '');
      });
    }

    var checks = Object.keys(byCode).map(function(code) { return byCode[code]; });
    if (!checks.length) { panel.classList.add('hidden'); return; }

    // Look up each active session individually.
    var sessions = await Promise.all(checks.map(async function(check) {
      var isAP = String(check.lessonId || '').indexOf('AP:') === 0;
      var base = { code: check.code, isAP: isAP, className: check.className, state: 'lobby', playerCount: 0 };
      try {
        var sSnap = await state.db.ref('quizSessions/' + check.code).get();
        if (!sSnap.exists() || sSnap.child('state').val() === 'finished') return null;
        var s = sSnap.val() || {};
        isAP = String(s.lessonId || check.lessonId || '').indexOf('AP:') === 0;
        var playerCount = 0;
        if (s.players) Object.keys(s.players).forEach(function(k) { if (!s.players[k].kicked) playerCount++; });
        var answerCount = (s.answers && s.answers[0]) ? Object.keys(s.answers[0]).length : 0;
        return Object.assign(base, { isAP: isAP, className: s.className || check.className || '—', state: s.state || 'lobby', playerCount: isAP ? answerCount : playerCount });
      } catch(e) {
        return base; // show from forcedQuiz data alone if session read is denied
      }
    }));

    sessions = sessions.filter(Boolean);
    if (!sessions.length) { panel.classList.add('hidden'); return; }

    list.innerHTML = '';
    sessions.forEach(function(sess) {
      var typeLabel  = sess.isAP ? 'AP' : 'Quiz';
      var stateLabel = ({ lobby:'Lobby', question:'In progress', reveal:'Revealing', unknown:'Active' })[sess.state] || sess.state;
      var countLabel = sess.isAP ? sess.playerCount + ' submitted' : sess.playerCount + ' players';
      var row = document.createElement('div');
      row.className = 'flex flex-wrap items-center gap-2 px-4 py-2 text-sm border-t border-gray-100';
      row.innerHTML =
        '<span class="font-semibold text-gray-700 w-10">' + typeLabel + '</span>' +
        '<span class="font-mono text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-0.5 text-xs">' + sess.code + '</span>' +
        '<span class="text-gray-600">Class: <strong>' + sess.className + '</strong></span>' +
        '<span class="text-gray-400 text-xs">' + stateLabel + ' &middot; ' + countLabel + '</span>' +
        '<div class="ml-auto flex gap-2">' +
          '<button class="btn-sess-rejoin px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">Rejoin</button>' +
          '<button class="btn-sess-end    px-2 py-1 text-xs bg-red-600  text-white rounded hover:bg-red-700">Force End</button>' +
        '</div>';
      row.querySelector('.btn-sess-rejoin').onclick = function() {
        document.getElementById('modal-admin').classList.add('hidden');
        if (sess.isAP) rejoinAPSession(sess.code);
        else           rejoinQuizSession(sess.code);
      };
      row.querySelector('.btn-sess-end').onclick = async function() {
        if (!confirm('Force-end this ' + typeLabel + ' for class ' + sess.className + '? Students will be released.')) return;
        await forceEndSession(sess.code, sess.className, sess.isAP);
        loadActiveSessions();
        var sel = document.getElementById('admin-class-select');
        if (sel && sel.value) loadClassDashboard(sel.value);
      };
      list.appendChild(row);
    });
  } catch(e) {
    list.innerHTML = '<p class="text-red-400 text-xs px-4 py-2">Could not load sessions: ' + e.message + '</p>';
  }
}

async function forceEndSession(code, className, isAP) {
  if (isAP) {
    var snap = await state.db.ref('quizSessions/' + code).get();
    if (snap.exists()) {
      var session = snap.val() || {};
      assessment.lobbyCode = code;
      assessment.sessionRef = state.db.ref('quizSessions/' + code);
      assessment.assessmentId = String(session.lessonId || '').replace(/^AP:/, '');
      assessment.className = session.className || className || null;
      await finaliseIncompleteAssessmentResponses();
    }
  }
  await state.db.ref('quizSessions/' + code).update({ state: 'finished', endedAt: Date.now() });
  if (className && className !== '—') {
    try {
      var forcedRef = state.db.ref('classes/' + className + '/forcedQuiz');
      var fSnap = await forcedRef.get();
      if (fSnap.child('lobbyCode').val() === code) {
        await forcedRef.update({ active: false, endedAt: Date.now() });
      }
    } catch(e) {}
  }
  if (localStorage.getItem('pylearn_host_quiz') === code) localStorage.removeItem('pylearn_host_quiz');
  if (localStorage.getItem('pylearn_host_ap')   === code) localStorage.removeItem('pylearn_host_ap');
}

async function rejoinQuizSession(code) {
  try {
    var snap = await state.db.ref('quizSessions/' + code).get();
    if (!snap.exists() || snap.child('state').val() === 'finished') {
      alert('That quiz session has already ended.');
      return;
    }
    var session = snap.val();
    quiz.lobbyCode  = code;
    quiz.sessionRef = state.db.ref('quizSessions/' + code);
    quiz.questions  = session.questions || [];
    quiz.className  = session.className || null;
    quiz.lessonId   = session.lessonId  || null;
    quiz.lessonTitle = ((quizLessonById(quiz.lessonId) || { data: { title: quiz.lessonId || '' } }).data.title);
    quiz.unsubscribers.forEach(function(fn) { try { fn(); } catch(e) {} });
    quiz.unsubscribers = [];
    showQuizHostScreen();
  } catch(e) {
    alert('Could not rejoin quiz: ' + e.message);
  }
}

async function rejoinAPSession(code) {
  try {
    var snap = await state.db.ref('quizSessions/' + code).get();
    if (!snap.exists() || snap.child('state').val() === 'finished') {
      alert('That AP session has already ended.');
      return;
    }
    var session = snap.val();
    assessment.lobbyCode    = code;
    assessment.sessionRef   = state.db.ref('quizSessions/' + code);
    assessment.className    = session.className || null;
    assessment.assessmentId = String(session.lessonId || '').replace(/^AP:/, '');
    if (assessment.hostListener && assessment.sessionRef) {
      assessment.sessionRef.off('value', assessment.hostListener);
    }
    localStorage.setItem('pylearn_host_ap', code);
    showAssessmentHostScreen();
  } catch(e) {
    alert('Could not rejoin AP: ' + e.message);
  }
}
async function loadAdminClassList() {
  var sel  = document.getElementById('admin-class-select');
  var prev = sel ? sel.value : '';
  if (sel) sel.innerHTML = '<option value="">— select class —</option>';
  try {
    var names = await getClassNames();
    names.forEach(function(name) {
      var opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      if (sel) sel.appendChild(opt);
    });
    if (sel) {
      if (prev && sel.querySelector('option[value="' + prev + '"]')) sel.value = prev;
      sel.onchange = function() {
        if (sel.value) {
          loadClassDashboard(sel.value);
        } else {
          var d = document.getElementById('admin-dashboard');
          if (d) d.innerHTML = '<p class="text-gray-400 text-sm text-center py-8">Select a class above to view the dashboard.</p>';
          document.getElementById('admin-class-actions').classList.add('hidden');
        }
      };
    }
  } catch(e) {
    var d = document.getElementById('admin-dashboard');
    if (d) d.innerHTML = '<p class="text-red-400 text-sm text-center py-4">Error loading classes: ' + e.message + '</p>';
  }
}

async function loadQuizResultsClassOptions() {
  var classEl = document.getElementById('quiz-results-class-select');
  var quizEl = document.getElementById('quiz-results-quiz-select');
  var content = document.getElementById('quiz-results-content');
  if (!classEl || !quizEl) return;
  var prev = classEl.value;
  classEl.innerHTML = '<option value="">— select class —</option>';
  quizEl.innerHTML = '<option value="">— select quiz —</option>';
  try {
    var names = await getClassNames();
    names.forEach(function(name) {
      var opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      classEl.appendChild(opt);
    });
    if (prev && classEl.querySelector('option[value="' + prev + '"]')) classEl.value = prev;
    classEl.onchange = function() { loadQuizResultsForClass(classEl.value); };
    quizEl.onchange = function() { renderSelectedQuizResult(); };
    if (classEl.value) loadQuizResultsForClass(classEl.value);
    else content.innerHTML = '<p class="text-gray-400 text-center py-8">Choose a class to view previous quiz results.</p>';
  } catch(e) {
    content.innerHTML = '<p class="text-red-500 text-center py-8">Could not load classes: ' + escapeHtml(e.message) + '</p>';
  }
}

var quizResultsState = { className: null, records: [] };

async function loadQuizResultsForClass(className) {
  var quizEl = document.getElementById('quiz-results-quiz-select');
  var content = document.getElementById('quiz-results-content');
  quizResultsState = { className: className, records: [] };
  quizEl.innerHTML = '<option value="">— select quiz —</option>';
  if (!className) {
    content.innerHTML = '<p class="text-gray-400 text-center py-8">Choose a class to view previous quiz results.</p>';
    return;
  }
  content.innerHTML = '<p class="text-gray-400 text-center py-8">Loading quiz results...</p>';
  try {
    var snap = await state.db.ref('classes/' + className + '/quizHistory').get();
    if (!snap.exists()) {
      content.innerHTML = '<p class="text-gray-400 text-center py-8">No quiz history found for ' + escapeHtml(className) + ' yet.</p>';
      return;
    }
    var records = [];
    snap.forEach(function(child) {
      var rec = child.val() || {};
      rec.key = child.key;
      records.push(rec);
    });
    records.sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
    quizResultsState = { className: className, records: records };
    records.forEach(function(rec, i) {
      var d = rec.timestamp ? new Date(rec.timestamp) : null;
      var opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = (d ? d.toLocaleString('en-GB') + ' — ' : '') + (rec.lessonTitle || rec.lessonId || 'Quiz') + ' (' + Object.keys(rec.results || {}).length + ' students)';
      quizEl.appendChild(opt);
    });
    quizEl.value = '0';
    renderSelectedQuizResult();
  } catch(e) {
    content.innerHTML = '<p class="text-red-500 text-center py-8">Could not load quiz results: ' + escapeHtml(e.message) + '</p>';
  }
}

function quizResultScore(rec, code) {
  var qs = rec.questions || [];
  var answers = (rec.results || {})[code] || [];
  var score = 0, max = 0;
  qs.forEach(function(q, i) {
    max += quizQuestionMaxPoints(q);
    var a = answers[i];
    if (!a) return;
    score += q.type === 'pybot_level'
      ? (typeof a.points === 'number' ? a.points : pyBotMedalPoints(a.medal, a.completed === true || a.correct === true))
      : (a.correct === true ? 1 : 0);
  });
  return { score: score, max: max };
}

function renderSelectedQuizResult() {
  var quizEl = document.getElementById('quiz-results-quiz-select');
  var content = document.getElementById('quiz-results-content');
  var rec = quizResultsState.records[Number(quizEl.value)];
  if (!rec) {
    content.innerHTML = '<p class="text-gray-400 text-center py-8">Choose a quiz result.</p>';
    return;
  }
  var qs = rec.questions || [];
  var results = rec.results || {};
  var codes = Object.keys(results);
  var rows = codes.map(function(code) {
    var s = quizResultScore(rec, code);
    return { code: code, name: studentName(code) || '', score: s.score, max: s.max, answers: results[code] || [] };
  }).sort(function(a, b) { return b.score - a.score || String(a.name || a.code).localeCompare(String(b.name || b.code)); });
  var dateText = rec.timestamp ? new Date(rec.timestamp).toLocaleString('en-GB') : '-';
  var avg = rows.length ? Math.round(rows.reduce(function(t, r) { return t + (r.max ? r.score / r.max : 0); }, 0) / rows.length * 100) : 0;
  var html = '<div class="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">' +
    '<div class="bg-blue-50 border border-blue-100 rounded-lg p-3"><div class="text-xs text-blue-500">Quiz</div><div class="font-bold text-blue-800">' + escapeHtml(rec.lessonTitle || rec.lessonId || 'Quiz') + '</div></div>' +
    '<div class="bg-green-50 border border-green-100 rounded-lg p-3"><div class="text-xs text-green-500">Students</div><div class="text-2xl font-bold text-green-700">' + rows.length + '</div></div>' +
    '<div class="bg-yellow-50 border border-yellow-100 rounded-lg p-3"><div class="text-xs text-yellow-600">Average</div><div class="text-2xl font-bold text-yellow-700">' + avg + '%</div></div>' +
    '<div class="bg-gray-50 border border-gray-200 rounded-lg p-3"><div class="text-xs text-gray-500">Date</div><div class="font-semibold text-gray-800">' + escapeHtml(dateText) + '</div></div></div>';

  html += '<div class="border border-gray-200 rounded-lg overflow-hidden mb-4"><div class="bg-gray-50 px-3 py-2 border-b border-gray-200 font-semibold text-gray-700">Question Breakdown</div>';
  html += '<div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="bg-gray-50 text-left text-gray-500"><th class="border border-gray-200 px-2 py-1.5">Question</th><th class="border border-gray-200 px-2 py-1.5 text-center">Correct</th><th class="border border-gray-200 px-2 py-1.5">Prompt</th></tr></thead><tbody>';
  qs.forEach(function(q, i) {
    var correct = rows.filter(function(r) { return r.answers[i] && (q.type === 'pybot_level' ? quizResultScore({ questions: [q], results: { x: [r.answers[i]] } }, 'x').score > 0 : r.answers[i].correct === true); }).length;
    var pct = rows.length ? Math.round(correct / rows.length * 100) : 0;
    html += '<tr><td class="border border-gray-100 px-2 py-1.5 font-mono">Q' + (i + 1) + '</td><td class="border border-gray-100 px-2 py-1.5 text-center font-semibold">' + correct + '/' + rows.length + ' (' + pct + '%)</td><td class="border border-gray-100 px-2 py-1.5">' + escapeHtml(q.q || '') + '</td></tr>';
  });
  html += '</tbody></table></div></div>';

  html += '<div class="border border-gray-200 rounded-lg overflow-hidden"><div class="bg-gray-50 px-3 py-2 border-b border-gray-200 font-semibold text-gray-700">Student Results</div>';
  html += '<div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="bg-gray-50 text-left text-gray-500"><th class="border border-gray-200 px-2 py-1.5">Name</th><th class="border border-gray-200 px-2 py-1.5">Code</th><th class="border border-gray-200 px-2 py-1.5 text-center">Score</th>';
  qs.forEach(function(q, i) { html += '<th class="border border-gray-200 px-2 py-1.5 text-center">Q' + (i + 1) + '</th>'; });
  html += '</tr></thead><tbody>';
  rows.forEach(function(r) {
    html += '<tr><td class="border border-gray-100 px-2 py-1.5 font-medium">' + escapeHtml(r.name || '-') + '</td><td class="border border-gray-100 px-2 py-1.5 font-mono text-gray-500">' + escapeHtml(r.code) + '</td><td class="border border-gray-100 px-2 py-1.5 text-center font-bold">' + r.score + '/' + r.max + '</td>';
    qs.forEach(function(q, i) {
      var a = r.answers[i];
      var points = 0, label = '-';
      if (a) {
        points = q.type === 'pybot_level'
          ? (typeof a.points === 'number' ? a.points : pyBotMedalPoints(a.medal, a.completed === true || a.correct === true))
          : (a.correct === true ? 1 : 0);
        label = q.type === 'pybot_level' ? (pyBotMedalLabel(a.medal) + ' ' + points) : (points ? '✓' : '✗');
      }
      html += '<td class="border border-gray-100 px-2 py-1.5 text-center ' + (points ? 'text-green-600 font-bold' : 'text-red-500') + '">' + escapeHtml(label) + '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table></div></div>';
  content.innerHTML = html;
}

document.getElementById('btn-quiz-results-refresh').onclick = function() {
  var className = document.getElementById('quiz-results-class-select').value;
  if (className) loadQuizResultsForClass(className);
  else loadQuizResultsClassOptions();
};

async function refreshAdminTable() {
  await loadAdminClassList();
  var sel = document.getElementById('admin-class-select');
  if (sel && sel.value) await loadClassDashboard(sel.value);
}

var adminDashboardState = {
  className: null,
  courseLabel: null,
  lessonId: null
};

function captureAdminDashboardSelection(className) {
  var courseEl = document.getElementById('admin-course-select');
  var lessonEl = document.getElementById('admin-lesson-select');
  if (!courseEl || !lessonEl) return;
  var courseOpt = courseEl.options[courseEl.selectedIndex];
  var lessonOpt = lessonEl.options[lessonEl.selectedIndex];
  adminDashboardState = {
    className: className,
    courseLabel: courseOpt ? courseOpt.textContent : null,
    lessonId: lessonOpt ? lessonOpt.dataset.lid : null
  };
}

async function refreshCurrentAdminDashboard() {
  var sel = document.getElementById('admin-class-select');
  if (!sel || !sel.value) return;
  await loadClassDashboard(sel.value, { preserveSelection: true });
}

async function loadClassDashboard(className, opts) {
  opts = opts || {};
  if (opts.preserveSelection) captureAdminDashboardSelection(className);
  var dash = document.getElementById('admin-dashboard');
  dash.innerHTML = '<p class="text-gray-400 text-sm text-center py-8">Loading ' + className + '…</p>';
  document.getElementById('admin-class-actions').classList.add('hidden');
  try {
    var results = await Promise.all([
      state.db.ref('classes/' + className + '/codes').get(),
      state.db.ref('classes/' + className + '/forcedQuiz').get()
    ]);
    var codesSnap  = results[0];
    var forcedSnap = results[1];
    var forced = forcedSnap.exists() ? forcedSnap.val() : null;

    if (!codesSnap.exists()) {
      dash.innerHTML = '<p class="text-gray-400 text-sm text-center py-8">No codes found for ' + className + '.</p>';
      return;
    }
    var codes = Object.keys(codesSnap.val());
    // Fetch each student's progress individually — avoids pulling the entire progress tree
    var progSnaps = await Promise.all(codes.map(function(c) {
      return state.db.ref('progress/' + c).get();
    }));
    var progMap = {};
    codes.forEach(function(c, i) { progMap[c] = progSnaps[i].exists() ? progSnaps[i].val() : {}; });

    // Wire action buttons for this class
    var actions = document.getElementById('admin-class-actions');
    actions.classList.remove('hidden');
    document.getElementById('btn-admin-host-quiz').onclick    = function() { openQuizSetup(className); };
    document.getElementById('btn-admin-host-ap').onclick      = function() { openAssessmentSetup(className); };
    document.getElementById('btn-admin-debug-ap').onclick     = function() { openAssessmentSetup(className); };
    document.getElementById('btn-admin-refresh-class').onclick = function() { refreshCurrentAdminDashboard(); };
    document.getElementById('btn-admin-export-ap').onclick    = function() { setAdminTab('ap-results'); loadApResultsClassOptions(className); };
    document.getElementById('btn-admin-export-detail').onclick = function() { exportDetailedReport(className); };
    document.getElementById('btn-admin-export-codes').onclick  = function() { exportCodesSheet(className); };
    // Per-permission button visibility
    var btnPerms = {
      'btn-admin-host-quiz':      canDo('hostQuiz'),
      'btn-admin-host-ap':        canDo('forceAP'),
      'btn-admin-debug-ap':       canDo('viewDebug'),
      'btn-admin-export-ap':      canDo('viewAP'),
      'btn-admin-export-detail':  canDo('exportProgress'),
      'btn-admin-export-codes':   canDo('manageClasses'),
      'btn-admin-wipe-sb3':       state.isAdmin,
      'btn-admin-delete-class':   canDo('manageClasses'),
    };
    Object.keys(btnPerms).forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', !btnPerms[id]);
    });
    document.getElementById('btn-admin-delete-class').onclick  = async function() {
      if (!confirm('Delete all codes for ' + className + '? This cannot be undone.')) return;
      try {
        // Delete the class, then best-effort clean up codeIndex entries
        var codesSnap = await state.db.ref('classes/' + className + '/codes').get();
        await state.db.ref('classes/' + className).remove();
        state.db.ref('classNames/' + className).remove().catch(function(){});
        if (codesSnap.exists()) {
          var indexCleanup = {};
          Object.keys(codesSnap.val()).forEach(function(c) {
            indexCleanup['codeIndex/' + c.toLowerCase()] = null;
            indexCleanup['studentCodes/' + c] = null;
          });
          state.db.ref().update(indexCleanup).catch(function(){});
        }
        actions.classList.add('hidden');
        dash.innerHTML = '<p class="text-gray-400 text-sm text-center py-8">Class deleted.</p>';
        document.getElementById('admin-class-select').value = '';
        await loadAdminClassList();
      } catch(e) { alert('Error: ' + e.message); }
    };

    renderAdminDashboard(className, codes, progMap, forced);
  } catch(e) {
    document.getElementById('admin-dashboard').innerHTML =
      '<p class="text-red-400 text-sm text-center py-4">Error: ' + e.message + '</p>';
  }
}

function renderAdminDashboard(className, codes, progMap, forced) {
  var dash = document.getElementById('admin-dashboard');
  dash.innerHTML = '';

  // ── Active session banner ─────────────────────────────────────
  if (forced && forced.active && forced.lobbyCode) {
    var lobbyCode  = forced.lobbyCode;
    var isAP       = String(forced.lessonId || '').indexOf('AP:') === 0;
    var sessionLabel = (isAP ? 'AP' : 'Quiz') + ' — code ' + lobbyCode;
    var banner = document.createElement('div');
    banner.className = 'bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 mb-2 flex flex-wrap items-center gap-3';
    banner.innerHTML =
      '<span class="text-amber-800 font-medium text-sm">Active session: ' + sessionLabel + '</span>' +
      '<button id="btn-dash-rejoin" class="px-3 py-1 bg-amber-600 text-white text-xs rounded hover:bg-amber-700 font-medium">Rejoin as Host</button>' +
      (isAP ? '<button id="btn-dash-live-progress" class="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 font-medium">&#x1F4CA; Live Progress</button>' : '') +
      '<button id="btn-dash-force-end" class="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 font-medium">Force End</button>';
    dash.appendChild(banner);

    var liveProgressWrap = document.createElement('div');
    liveProgressWrap.id = 'ap-live-progress-wrap';
    liveProgressWrap.className = 'mb-4';
    dash.appendChild(liveProgressWrap);

    document.getElementById('btn-dash-rejoin').onclick = function() {
      document.getElementById('modal-admin').classList.add('hidden');
      if (isAP) rejoinAPSession(lobbyCode);
      else       rejoinQuizSession(lobbyCode);
    };

    if (isAP) {
      var apAssessmentId = String(forced.lessonId).slice(3); // strip 'AP:'
      document.getElementById('btn-dash-live-progress').onclick = function() {
        loadLiveAPProgress(apAssessmentId, codes);
      };
    }

    document.getElementById('btn-dash-force-end').onclick = async function() {
      if (!confirm('Force-end the active ' + (isAP ? 'AP' : 'quiz') + ' for ' + className + '? Students will be released.')) return;
      try {
        await state.db.ref('classes/' + className + '/forcedQuiz').update({ active: false, endedAt: Date.now() });
        await state.db.ref('quizSessions/' + lobbyCode).update({ state: 'finished', endedAt: Date.now() });
        localStorage.removeItem(isAP ? 'pylearn_host_ap' : 'pylearn_host_quiz');
        loadClassDashboard(className);
      } catch(e) { alert('Error: ' + e.message); }
    };
  }

  // ── Summary stats ─────────────────────────────────────────────
  var n = codes.length;
  var activeCount = codes.filter(function(c) {
    var p = progMap[c];
    return Object.keys(p).some(function(lid) {
      return p[lid] && Object.keys(p[lid]).some(function(sid) {
        return p[lid][sid] && p[lid][sid].completed;
      });
    });
  }).length;

  var totalPossible = state.allLessons.reduce(function(s, l) { return s + l.data.steps.length; }, 0);
  var totalDoneAll = 0, totalTimeAll = 0;
  codes.forEach(function(c) {
    var p = progMap[c];
    state.allLessons.forEach(function(l) {
      l.data.steps.forEach(function(step) {
        var s = (p[l.meta.id] && p[l.meta.id][step.id]) || {};
        if (s.completed) totalDoneAll++;
        if (s.totalMs)   totalTimeAll += s.totalMs;
      });
    });
  });
  var avgPct = (n && totalPossible) ? Math.round(totalDoneAll / (n * totalPossible) * 100) : 0;
  var avgMs  = n ? Math.round(totalTimeAll / n) : 0;

  // ── Course/lesson structure from yearGroups ────────────────────
  var courseList = [];
  state.yearGroups.forEach(function(yg) {
    (yg.courses || []).forEach(function(course) {
      var lessons = [];
      (course.lessons || []).forEach(function(lm) {
        var found = state.allLessons.find(function(l) { return l.meta.id === lm.id; });
        if (found) lessons.push(found);
      });
      if (lessons.length) courseList.push({ label: yg.label + ' — ' + course.label, lessons: lessons });
    });
  });

  // ── Build static HTML ──────────────────────────────────────────
  function sc(val, lbl, bg, border, tv, tl) {
    return '<div class="' + bg + ' border ' + border + ' rounded-lg p-3 text-center">' +
      '<div class="text-2xl font-bold ' + tv + '">' + val + '</div>' +
      '<div class="text-xs ' + tl + ' mt-0.5">' + lbl + '</div></div>';
  }

  var h = '';

  // Stat cards
  h += '<div class="grid grid-cols-4 gap-3 mb-5">';
  h += sc(n,             'Students',      'bg-blue-50',   'border-blue-100',   'text-blue-700',   'text-blue-500');
  h += sc(activeCount,   'Active',        'bg-green-50',  'border-green-100',  'text-green-700',  'text-green-500');
  h += sc(avgPct + '%',  'Avg completion','bg-purple-50', 'border-purple-100', 'text-purple-700', 'text-purple-500');
  h += sc(fmtMs(avgMs),  'Avg time',      'bg-orange-50', 'border-orange-100', 'text-orange-700', 'text-orange-500');
  h += '</div>';

  // Lesson selector bar
  h += '<div class="flex flex-wrap items-center gap-3 mb-5 bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-200">';
  h += '<span class="text-sm font-medium text-gray-600">Lesson view:</span>';
  h += '<select id="admin-course-select" class="jhncc-focus border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none">';
  courseList.forEach(function(c, i) { h += '<option value="' + i + '">' + c.label + '</option>'; });
  h += '</select>';
  h += '<select id="admin-lesson-select" class="jhncc-focus border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none min-w-[180px]"></select>';
  h += '</div>';

  // Lesson drill-down panel (filled dynamically below)
  h += '<div id="admin-lesson-panel" class="mb-5"></div>';

  // All-students overview table
  var rows = codes.map(function(c) {
    var p = progMap[c], done = 0, ms = 0;
    state.allLessons.forEach(function(l) {
      l.data.steps.forEach(function(step) {
        var s = (p[l.meta.id] && p[l.meta.id][step.id]) || {};
        if (s.completed) done++;
        if (s.totalMs)   ms += s.totalMs;
      });
    });
    return { code: c, name: studentName(c), done: done, ms: ms };
  }).sort(function(a, b) { return b.ms - a.ms; });

  h += '<div class="border border-gray-200 rounded-lg overflow-hidden">';
  h += '<div class="bg-gray-50 px-3 py-2 border-b border-gray-200 flex items-center gap-2">';
  h += '<span class="text-sm font-medium text-gray-700">All Students</span>';
  h += '<span class="text-xs text-gray-400">— ' + n + ' total, sorted by time on task</span></div>';
  h += '<div class="overflow-x-auto"><table class="w-full text-xs"><thead>';
  h += '<tr class="bg-gray-50 text-left text-gray-500">';
  h += '<th class="border border-gray-200 px-2 py-1.5 font-medium">Name</th>';
  h += '<th class="border border-gray-200 px-2 py-1.5 font-medium font-mono">Code</th>';
  h += '<th class="border border-gray-200 px-2 py-1.5 font-medium text-center">Steps</th>';
  h += '<th class="border border-gray-200 px-2 py-1.5 font-medium">Time</th>';
  h += '<th class="border border-gray-200 px-2 py-1.5"></th>';
  h += '</tr></thead><tbody>';

  rows.forEach(function(r) {
    var inactive = r.done === 0 && r.ms === 0;
    h += '<tr class="border-b border-gray-100 hover:bg-gray-50' + (inactive ? ' opacity-40' : '') + '">';
    h += '<td class="border border-gray-100 px-2 py-1.5' + (r.name ? ' font-medium text-gray-800' : ' text-gray-400') + '">' + (r.name || '—') + '</td>';
    h += '<td class="border border-gray-100 px-2 py-1.5 font-mono text-gray-500">' + r.code + '</td>';
    h += '<td class="border border-gray-100 px-2 py-1.5 text-center">' + (r.done || '—') + '</td>';
    h += '<td class="border border-gray-100 px-2 py-1.5">' + (r.ms ? fmtMs(r.ms) : '—') + '</td>';
    h += '<td class="border border-gray-100 px-1 py-1 whitespace-nowrap">' +
      '<button class="btn-move-code text-xs text-blue-500 hover:text-blue-700 mr-2" data-class="' + className + '" data-code="' + r.code + '">Move</button>' +
      '<button class="btn-rm-code text-xs text-red-400 hover:text-red-600" data-class="' + className + '" data-code="' + r.code + '">Remove</button>' +
      '</td>';
    h += '</tr>';
  });
  h += '</tbody></table></div></div>';

  dash.innerHTML = h;

  // Wire move-code buttons
  dash.querySelectorAll('.btn-move-code').forEach(function(btn) {
    btn.onclick = async function() {
      var code = btn.dataset.code;
      var sourceClass = btn.dataset.class;
      var currentName = studentName(code) || code;
      var targetClass = prompt('Move ' + currentName + ' to which class?');
      if (targetClass === null) return;
      targetClass = normaliseClassName(targetClass);
      if (!targetClass) { alert('Please enter a class name.'); return; }
      if (targetClass === sourceClass) { alert(currentName + ' is already in ' + sourceClass + '.'); return; }
      if (!isSafeFirebaseKey(targetClass)) {
        alert('Class names cannot contain . # $ / [ or ].');
        return;
      }
      if (!confirm('Move ' + currentName + ' from ' + sourceClass + ' to ' + targetClass + '? Their progress will stay with their code.')) return;
      btn.disabled = true; btn.textContent = 'Moving...';
      try {
        await moveStudentToClass(code, sourceClass, targetClass);
        await loadAdminClassList();
        await loadClassDashboard(sourceClass);
      } catch(e) {
        alert('Move failed: ' + e.message);
        btn.disabled = false; btn.textContent = 'Move';
      }
    };
  });

  // Wire remove-code buttons
  dash.querySelectorAll('.btn-rm-code').forEach(function(btn) {
    btn.onclick = async function() {
      if (!confirm('Remove code ' + btn.dataset.code + ' from ' + btn.dataset.class + '?')) return;
      btn.disabled = true; btn.textContent = '…';
      try {
        await state.db.ref('classes/' + btn.dataset.class + '/codes/' + btn.dataset.code).remove();
        state.db.ref('codeIndex/' + btn.dataset.code.toLowerCase()).remove().catch(function(){});
        state.db.ref('studentCodes/' + btn.dataset.code).remove().catch(function(){});
        await loadClassDashboard(btn.dataset.class);
      } catch(e) { alert('Error: ' + e.message); btn.disabled = false; btn.textContent = 'Remove'; }
    };
  });

  // ── Lesson selector logic ──────────────────────────────────────
  var courseEl = document.getElementById('admin-course-select');
  var lessonEl = document.getElementById('admin-lesson-select');

  function populateLessons() {
    var ci     = parseInt(courseEl.value, 10);
    var course = courseList[ci];
    lessonEl.innerHTML = '';
    (course ? course.lessons : []).forEach(function(l, i) {
      var o = document.createElement('option');
      o.value = i; o.textContent = l.meta.title || l.data.title;
      o.dataset.lid = l.meta.id;
      lessonEl.appendChild(o);
    });
    if (adminDashboardState.className === className && adminDashboardState.lessonId) {
      var preferredLesson = Array.prototype.find.call(lessonEl.options, function(o) {
        return o.dataset.lid === adminDashboardState.lessonId;
      });
      if (preferredLesson) lessonEl.value = preferredLesson.value;
    }
    renderLessonPanel();
  }

  function renderLessonPanel() {
    var ci    = parseInt(courseEl.value, 10);
    var li    = parseInt(lessonEl.value, 10);
    var entry = courseList[ci] && courseList[ci].lessons[li];
    var panel = document.getElementById('admin-lesson-panel');
    if (!entry || !panel) return;

    var lid   = entry.meta.id;
    var steps = entry.data.steps;

    // Per-step completion counts
    var stepData = steps.map(function(step) {
      var done = 0, started = 0;
      codes.forEach(function(c) {
        var s = (progMap[c][lid] && progMap[c][lid][step.id]) || {};
        if (s.completed) done++;
        else if (s.started || s.startedAt) started++;
      });
      return { step: step, done: done, started: started };
    });

    var ph = '<div class="grid gap-4 mb-1" style="grid-template-columns:1fr 1fr">';

    // ── Left: student progress table ──────────────────────────
    ph += '<div class="border border-gray-200 rounded-lg overflow-hidden">';
    ph += '<div class="bg-gray-50 px-3 py-2 border-b border-gray-200">';
    ph += '<span class="text-sm font-medium text-gray-700">Student Progress</span> ';
    ph += '<span class="text-xs text-gray-400">' + (entry.data.title || entry.meta.title) + '</span></div>';
    ph += '<div class="overflow-x-auto"><table class="w-full text-xs"><thead>';
    ph += '<tr class="bg-gray-50 text-gray-500">';
    ph += '<th class="border border-gray-200 px-2 py-1 text-left">Student</th>';
    steps.forEach(function(step) {
      var abbr = step.title.length > 8 ? step.title.slice(0, 7) + '…' : step.title;
      ph += '<th class="border border-gray-200 px-1 py-1 text-center" title="' + step.title + '">' + abbr + '</th>';
    });
    ph += '</tr></thead><tbody>';
    codes.forEach(function(c) {
      var p    = progMap[c];
      var name = studentName(c);
      ph += '<tr class="border-b border-gray-100 hover:bg-gray-50">';
      ph += '<td class="border border-gray-100 px-2 py-1">';
      ph += name ? '<span class="font-medium">' + name + '</span>'
                 : '<span class="font-mono text-gray-400">' + c + '</span>';
      ph += '</td>';
      steps.forEach(function(step) {
        var s  = (p[lid] && p[lid][step.id]) || {};
        var ms = s.totalMs ? ' · ' + fmtMs(s.totalMs) : '';
        if (s.completed)
          ph += '<td class="border border-gray-100 text-center py-1" title="Complete' + ms + '"><span class="text-green-600 font-bold">✓</span></td>';
        else if (s.started || s.startedAt)
          ph += '<td class="border border-gray-100 text-center py-1" title="Started' + ms + '"><span class="text-yellow-500">○</span></td>';
        else
          ph += '<td class="border border-gray-100 text-center py-1"><span class="text-gray-200">–</span></td>';
      });
      ph += '</tr>';
    });
    ph += '</tbody></table></div></div>';

    // ── Right: step completion bar chart ──────────────────────
    ph += '<div class="border border-gray-200 rounded-lg overflow-hidden">';
    ph += '<div class="bg-gray-50 px-3 py-2 border-b border-gray-200">';
    ph += '<span class="text-sm font-medium text-gray-700">Step Completion</span></div>';
    ph += '<div class="p-3 space-y-2.5">';
    stepData.forEach(function(sd) {
      var pDone    = n ? Math.round(sd.done    / n * 100) : 0;
      var pStarted = n ? Math.round(sd.started / n * 100) : 0;
      ph += '<div>';
      ph += '<div class="flex justify-between text-xs mb-1">';
      ph += '<span class="text-gray-700 truncate pr-2">' + sd.step.title + '</span>';
      ph += '<span class="text-gray-400 whitespace-nowrap">' + sd.done + '/' + n + ' &nbsp;' + pDone + '%</span></div>';
      ph += '<div class="flex h-3 w-full rounded-full overflow-hidden bg-gray-100">';
      ph += '<div class="bg-green-500 h-3 transition-all" style="width:' + pDone + '%"></div>';
      ph += '<div class="bg-yellow-400 h-3 transition-all" style="width:' + pStarted + '%"></div>';
      ph += '</div></div>';
    });
    ph += '<div class="flex gap-4 mt-3 text-xs text-gray-400">';
    ph += '<span><span class="inline-block w-3 h-2.5 bg-green-500 rounded mr-1 align-middle"></span>Complete</span>';
    ph += '<span><span class="inline-block w-3 h-2.5 bg-yellow-400 rounded mr-1 align-middle"></span>Started</span>';
    ph += '</div></div></div>';

    ph += '</div>'; // close grid
    panel.innerHTML = ph;
  }

  courseEl.onchange = populateLessons;
  lessonEl.onchange = renderLessonPanel;
  if (adminDashboardState.className === className && adminDashboardState.courseLabel) {
    var preferredCourse = Array.prototype.find.call(courseEl.options, function(o) {
      return o.textContent === adminDashboardState.courseLabel;
    });
    if (preferredCourse) courseEl.value = preferredCourse.value;
  }
  if (courseList.length) populateLessons();
}

async function loadLiveAPProgress(assessmentId, codes) {
  var wrap = document.getElementById('ap-live-progress-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<p class="text-gray-400 text-xs py-2 px-1">Loading live progress…</p>';

  var spec = (typeof ASSESSMENTS !== 'undefined') && ASSESSMENTS[assessmentId];
  if (!spec) { wrap.innerHTML = '<p class="text-red-400 text-xs px-1">AP spec not found for: ' + escapeHtml(assessmentId) + '</p>'; return; }

  var snaps = await Promise.all(codes.map(function(c) {
    return state.db.ref('progress/' + c + '/assessments/' + assessmentId).get();
  }));

  var now = Date.now();
  var rows = codes.map(function(c, i) {
    var rec = snaps[i].exists() ? snaps[i].val() : null;
    if (!rec) return { code: c, name: studentName(c) || c, started: false };
    var result = assessQuestionAssessment(spec, rec.answers || {});
    return {
      code: c,
      name: studentName(c) || c,
      started: true,
      score: result.score,
      maxScore: result.maxScore,
      criteria: result.criteria,
      savedAt: rec.savedAt || rec.lastSeenAt || null
    };
  });

  rows.sort(function(a, b) {
    if (a.started !== b.started) return a.started ? -1 : 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  var started = rows.filter(function(r) { return r.started; });
  var notStarted = rows.filter(function(r) { return !r.started; });
  var qLabels = (spec.questions || []).map(function(q, i) { return q.title ? q.title.slice(0, 12) : ('Q' + (i + 1)); });

  var html = '<div class="border border-blue-200 rounded-lg overflow-hidden">' +
    '<div class="bg-blue-50 px-3 py-2 border-b border-blue-200 flex justify-between items-center">' +
    '<span class="text-xs font-semibold text-blue-800">&#x1F4CA; Live AP Progress — ' + escapeHtml(spec.title || assessmentId) + '</span>' +
    '<span class="text-xs text-blue-600">' + started.length + ' / ' + codes.length + ' started &nbsp;&middot;&nbsp; ' +
    '<button id="btn-ap-live-reload" class="underline hover:text-blue-900">Reload</button>' +
    '</span></div>' +
    '<div class="overflow-x-auto"><table class="w-full text-xs">' +
    '<thead><tr class="bg-gray-50 text-gray-500 text-left">' +
    '<th class="px-2 py-1.5">Student</th>' +
    '<th class="px-2 py-1.5 text-center">Score</th>' +
    '<th class="px-2 py-1.5 text-center">Last saved</th>' +
    qLabels.map(function(l) { return '<th class="px-1 py-1.5 text-center max-w-[3rem] truncate" title="' + escapeHtml(l) + '">' + escapeHtml(l) + '</th>'; }).join('') +
    '</tr></thead><tbody>';

  started.forEach(function(r) {
    var pct = r.maxScore ? r.score / r.maxScore : 0;
    var scoreCol = pct >= 0.7 ? 'text-green-700' : pct >= 0.5 ? 'text-yellow-700' : 'text-red-600';
    var ago = '—';
    if (r.savedAt) {
      var diffMs = now - r.savedAt;
      var diffMins = Math.floor(diffMs / 60000);
      ago = diffMins < 1 ? 'just now' : diffMins + 'm ago';
    }
    html += '<tr class="border-t border-gray-100 hover:bg-gray-50">' +
      '<td class="px-2 py-1.5 font-medium">' + escapeHtml(r.name) + '</td>' +
      '<td class="px-2 py-1.5 text-center font-semibold ' + scoreCol + '">' + r.score + ' / ' + r.maxScore + '</td>' +
      '<td class="px-2 py-1.5 text-center text-gray-400">' + ago + '</td>' +
      (r.criteria || []).map(function(c) {
        return '<td class="px-1 py-1.5 text-center">' + (c.awarded ? '<span class="text-green-600">&#x2713;</span>' : '<span class="text-red-400">&#x2715;</span>') + '</td>';
      }).join('') +
      '</tr>';
  });

  if (notStarted.length) {
    html += '<tr class="border-t border-gray-200"><td colspan="' + (3 + qLabels.length) + '" class="px-2 py-1.5 text-gray-400 italic">Not yet started: ' +
      notStarted.map(function(r) { return escapeHtml(r.name || r.code); }).join(', ') + '</td></tr>';
  }

  html += '</tbody></table></div></div>';
  wrap.innerHTML = html;

  document.getElementById('btn-ap-live-reload').onclick = function() { loadLiveAPProgress(assessmentId, codes); };
}

// ── Helpers ───────────────────────────────────────────────────
function studentName(code) {
  // Exact match first
  if (state.nameMap[code]) return state.nameMap[code];
  // Case-insensitive fallback — sheet may have different capitalisation
  var lower = code.toLowerCase();
  var keys = Object.keys(state.nameMap);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === lower) return state.nameMap[keys[i]];
  }
  return null;
}

// Returns sorted array of class name strings.
// Tries classNames index first (tiny); falls back to full classes read and backfills the index.
async function getClassNames() {
  var snap = await state.db.ref('classNames').get();
  if (snap.exists()) {
    return Object.keys(snap.val() || {}).sort();
  }
  // Index not built yet — fall back to classes and backfill silently
  var classesSnap = await state.db.ref('classes').get();
  if (!classesSnap.exists()) return [];
  var names = [];
  var backfill = {};
  classesSnap.forEach(function(child) { names.push(child.key); backfill['classNames/' + child.key] = true; });
  state.db.ref().update(backfill).catch(function(){});
  return names.sort();
}

function normaliseClassName(value) {
  return String(value || '').trim().toUpperCase();
}

function isSafeFirebaseKey(value) {
  return !!value && !(/[.#$/\[\]]/.test(value));
}

async function findClassForCode(code) {
  if (!code || !state.db) return null;
  try {
    var idxSnap = await state.db.ref('codeIndex/' + code.toLowerCase()).get();
    if (idxSnap.exists()) {
      var v = idxSnap.val();
      return (v && typeof v === 'object') ? (v.className || null) : (typeof v === 'string' ? v : null);
    }
  } catch(e) {}
  if (!state.isAdmin && !state.isTeacher) return null;
  // Admin/teacher-only recovery path for legacy databases missing codeIndex.
  var classesSnap = await state.db.ref('classes').get();
  if (!classesSnap.exists()) return null;
  var foundClass = null;
  classesSnap.forEach(function(classSnap) {
    if (foundClass) return;
    var codesVal = classSnap.child('codes').val() || {};
    Object.keys(codesVal).forEach(function(storedCode) {
      if (!foundClass && storedCode.toLowerCase() === code.toLowerCase()) {
        foundClass = classSnap.key;
      }
    });
  });
  if (foundClass) {
    state.db.ref('codeIndex/' + code.toLowerCase()).set({ className: foundClass, storedCode: code }).catch(function(){});
  }
  return foundClass;
}

async function moveStudentToClass(code, sourceClass, targetClass) {
  if (!code || !sourceClass || !targetClass) throw new Error('Missing code or class name.');
  sourceClass = normaliseClassName(sourceClass);
  targetClass = normaliseClassName(targetClass);
  if (!isSafeFirebaseKey(sourceClass) || !isSafeFirebaseKey(targetClass)) {
    throw new Error('Class names cannot contain . # $ / [ or ].');
  }

  var sourceRef = state.db.ref('classes/' + sourceClass + '/codes/' + code);
  var targetRef = state.db.ref('classes/' + targetClass + '/codes/' + code);
  var snaps = await Promise.all([sourceRef.get(), targetRef.get()]);
  var sourceSnap = snaps[0];
  var targetSnap = snaps[1];
  if (!sourceSnap.exists()) throw new Error('That student code is no longer in ' + sourceClass + '.');
  if (targetSnap.exists()) throw new Error('That student code is already in ' + targetClass + '.');

  var codeData = sourceSnap.val() || {};
  if (typeof codeData !== 'object') codeData = { value: codeData };
  codeData.movedAt = Date.now();
  codeData.movedFrom = sourceClass;

  var updates = {};
  updates['classes/' + sourceClass + '/codes/' + code] = null;
  updates['classes/' + targetClass + '/codes/' + code] = codeData;
  updates['studentCodes/' + code + '/className'] = targetClass;
  await state.db.ref().update(updates);
  state.db.ref('codeIndex/' + code.toLowerCase() + '/className').set(targetClass).catch(function(){});
}

function stepStatus(prog, lid, sid) {
  var s = (prog[lid] && prog[lid][sid]) || {};
  if (s.completed)              return 'complete';
  if (s.started || s.startedAt) return 'started';
  return 'not started';
}


// ── Export: codes-only sheet (for handing out to students) ─────
function exportCodesSheet(className) {
  state.db.ref('classes/' + className + '/codes').get().then(function(snap) {
    var codes = snap.exists() ? Object.keys(snap.val()) : [];
    var wb = XLSX.utils.book_new();
    var wsData = [['Name', 'Code']];
    codes.forEach(function(code) { wsData.push([studentName(code) || '', code]); });
    var ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 30 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Codes');
    XLSX.writeFile(wb, 'JHNCC-Computing-' + className + '-codes.xlsx');
  }).catch(function(e) { alert('Could not export: ' + e.message); });
}

// ── Export: detailed report workbook ─────────────────────────
function makeUniqueSheetName(baseName, usedNames) {
  var base = String(baseName || 'Sheet')
    .replace(/[:\\/?*\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Sheet';
  var name = base.slice(0, 31);
  var n = 2;
  while (usedNames[name.toLowerCase()]) {
    var suffix = ' ' + n;
    name = base.slice(0, 31 - suffix.length) + suffix;
    n++;
  }
  usedNames[name.toLowerCase()] = true;
  return name;
}

async function exportDetailedReport(className) {
  try {
    var results = await Promise.all([
      state.db.ref('classes/' + className + '/codes').get(),
      state.db.ref('classes/' + className + '/quizHistory').get(),
    ]);
    var codesSnap    = results[0];
    var quizHistSnap = results[1];
    if (!codesSnap.exists()) { alert('No codes found for ' + className); return; }
    var codes = Object.keys(codesSnap.val());
    var progSnaps = await Promise.all(codes.map(function(c) { return state.db.ref('progress/' + c).get(); }));
    var allProg = {};
    codes.forEach(function(c, i) { if (progSnaps[i].exists()) allProg[c] = progSnaps[i].val(); });

    var wb = XLSX.utils.book_new();
    var usedSheetNames = {};

    // ── Sheet 1: Codes ──────────────────────────────────────
    var codesData = [['Name', 'Code']];
    codes.forEach(function(code) { codesData.push([studentName(code) || '', code]); });
    var wsCodesSheet = XLSX.utils.aoa_to_sheet(codesData);
    wsCodesSheet['!cols'] = [{ wch: 30 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsCodesSheet, makeUniqueSheetName('Codes', usedSheetNames));

    // ── Sheet 2: Summary ────────────────────────────────────
    var summaryHdr = ['Name', 'Code', 'Total Steps Done', 'Total Time'];
    state.allLessons.forEach(function(lesson) {
      summaryHdr.push(lesson.data.title + ' Steps Done');
      summaryHdr.push(lesson.data.title + ' Time');
    });
    var summaryData = [summaryHdr];

    codes.forEach(function(code) {
      var prog = allProg[code] || {};
      var name = studentName(code) || '';
      var totalDone = 0, totalMs = 0;
      var row = [name, code];
      var lessonCells = [];
      state.allLessons.forEach(function(lesson) {
        var done = 0, ms = 0;
        lesson.data.steps.forEach(function(step) {
          var s = (prog[lesson.meta.id] && prog[lesson.meta.id][step.id]) || {};
          if (s.completed) { done++; totalDone++; }
          if (s.totalMs)   { ms += s.totalMs; totalMs += s.totalMs; }
        });
        lessonCells.push(done + ' / ' + lesson.data.steps.length);
        lessonCells.push(ms ? fmtMs(ms) : '—');
      });
      row.push(totalDone);
      row.push(totalMs ? fmtMs(totalMs) : '—');
      summaryData.push(row.concat(lessonCells));
    });

    var wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 16 }, { wch: 14 }];
    state.allLessons.forEach(function() {
      wsSummary['!cols'].push({ wch: 18 }); wsSummary['!cols'].push({ wch: 12 });
    });

    // Add chart data for step completion (simple bar chart source)
    var chartAnchorRow = summaryData.length + 3;
    var chartHdr = ['Student'].concat(state.allLessons.map(function(l) { return l.data.title; }));
    var chartData = [chartHdr];
    codes.forEach(function(code) {
      var prog = allProg[code] || {};
      var name = studentName(code) || code;
      var row = [name];
      state.allLessons.forEach(function(lesson) {
        var done = 0;
        lesson.data.steps.forEach(function(step) {
          var s = (prog[lesson.meta.id] && prog[lesson.meta.id][step.id]) || {};
          if (s.completed) done++;
        });
        row.push(done);
      });
      chartData.push(row);
    });

    XLSX.utils.sheet_add_aoa(wsSummary, chartData, { origin: { r: chartAnchorRow, c: 0 } });
    XLSX.utils.book_append_sheet(wb, wsSummary, makeUniqueSheetName('Summary', usedSheetNames));

    // ── One sheet per lesson ─────────────────────────────────
    state.allLessons.forEach(function(lesson) {
      var lid  = lesson.meta.id;
      var steps = lesson.data.steps;

      var hdr = ['Name', 'Code'];
      steps.forEach(function(step) { hdr.push(step.title); hdr.push(step.title + ' Time'); });
      hdr.push('Total Done'); hdr.push('Total Time');

      var wsData = [hdr];
      codes.forEach(function(code) {
        var prog = allProg[code] || {};
        var name = studentName(code) || '';
        var row  = [name, code];
        var totalDone = 0, totalMs = 0;
        steps.forEach(function(step) {
          var s    = (prog[lid] && prog[lid][step.id]) || {};
          var done = s.completed ? 1 : 0;
          var ms   = s.totalMs  || 0;
          totalDone += done;
          totalMs   += ms;
          row.push(done ? '\u2713' : (s.started || s.startedAt ? '\u25CB' : '\u2013'));
          row.push(ms ? fmtMs(ms) : '—');
        });
        row.push(totalDone + ' / ' + steps.length);
        row.push(totalMs ? fmtMs(totalMs) : '—');
        wsData.push(row);
      });

      var ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [{ wch: 25 }, { wch: 20 }];
      steps.forEach(function() { ws['!cols'].push({ wch: 8 }); ws['!cols'].push({ wch: 10 }); });
      ws['!cols'].push({ wch: 10 }); ws['!cols'].push({ wch: 10 });

      var courseLabel = lesson.meta && lesson.meta.courseLabel ? lesson.meta.courseLabel : '';
      var yearLabel = lesson.meta && lesson.meta.yearLabel ? lesson.meta.yearLabel : '';
      var sheetBase = lesson.data.title;
      if (courseLabel || yearLabel) sheetBase += ' ' + [yearLabel, courseLabel].filter(Boolean).join(' ');
      var sheetName = makeUniqueSheetName(sheetBase, usedSheetNames);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    // ── Quiz history sheets ──────────────────────────────────────
    if (quizHistSnap && quizHistSnap.exists()) {
      var quizRecords = [];
      quizHistSnap.forEach(function(child) { quizRecords.push(child.val()); });
      // Sort oldest first
      quizRecords.sort(function(a, b) { return (a.timestamp || 0) - (b.timestamp || 0); });

      // Sheet: Quiz Summary (one row per quiz)
      var qSummaryData = [['Date', 'Time', 'Lesson', 'Questions', 'Players', 'Lobby Code']];
      quizRecords.forEach(function(rec) {
        var d = new Date(rec.timestamp || 0);
        qSummaryData.push([
          d.toLocaleDateString('en-GB'),
          d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          rec.lessonTitle || rec.lessonId || '',
          (rec.questions || []).length,
          Object.keys(rec.results || {}).length,
          rec.lobbyCode || ''
        ]);
      });
      var wsQSummary = XLSX.utils.aoa_to_sheet(qSummaryData);
      wsQSummary['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 28 }, { wch: 10 }, { wch: 8 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, wsQSummary, makeUniqueSheetName('Quiz Summary', usedSheetNames));

      // One sheet per quiz
      quizRecords.forEach(function(rec, recIdx) {
        var qs = rec.questions || [];
        var results = rec.results || {};
        var d = new Date(rec.timestamp || 0);
        var dateStr = d.toLocaleDateString('en-GB').replace(/\//g, '-');
        var timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).replace(':', '');

        // Header row: Name, Code, Q1 text, Q2 text, ..., Score
        var hdr = ['Name', 'Code'];
        qs.forEach(function(q, i) {
          hdr.push('Q' + (i + 1) + ': ' + (q.q || '').slice(0, 40));
        });
        hdr.push('Score');
        var wsData = [hdr];

        // One row per participant
        // Collect all codes from results, plus all class codes who were present
        var allCodes = {};
        codes.forEach(function(c) { allCodes[c] = true; });
        Object.keys(results).forEach(function(c) { allCodes[c] = true; });

        Object.keys(allCodes).forEach(function(code) {
          var answered = results[code];
          if (!answered && !Object.keys(results).length) return; // skip if no one played
          // Only include students who actually participated (have at least one answer or are in results)
          if (!results[code] && Object.keys(results).length > 0) return;
          var name = studentName(code) || '';
          var row = [name, code];
          var score = 0;
          var maxScore = 0;
          qs.forEach(function(q, i) {
            maxScore += quizQuestionMaxPoints(q);
            var a = answered && answered[i];
            if (!a) { row.push('–'); return; }
            var points = q.type === 'pybot_level'
              ? (typeof a.points === 'number' ? a.points : pyBotMedalPoints(a.medal, a.completed === true || a.correct === true))
              : (a.correct === true ? 1 : 0);
            score += points;
            row.push(q.type === 'pybot_level' ? (pyBotMedalLabel(a.medal) + ' (' + points + ' pts)') : (points ? '✓' : '✗'));
          });
          row.push(score + ' / ' + maxScore);
          wsData.push(row);
        });

        var wsQ = XLSX.utils.aoa_to_sheet(wsData);
        wsQ['!cols'] = [{ wch: 25 }, { wch: 20 }];
        qs.forEach(function() { wsQ['!cols'].push({ wch: 14 }); });
        wsQ['!cols'].push({ wch: 8 });

        var sheetLabel = makeUniqueSheetName('Quiz ' + String(recIdx + 1).padStart(2, '0') + ' ' + dateStr + ' ' + timeStr, usedSheetNames);
        XLSX.utils.book_append_sheet(wb, wsQ, sheetLabel);
      });
    }

    XLSX.writeFile(wb, 'JHNCC-Computing-' + className + '-report.xlsx');

  } catch(e) { alert('Export failed: ' + e.message); }
}

// ── Import names from spreadsheet / ZIP ──────────────────────

function parseSheetData(uint8array) {
  var wb = XLSX.read(uint8array, { type: 'array' });
  var sheetName = wb.SheetNames.indexOf('Codes') !== -1 ? 'Codes' : wb.SheetNames[0];
  var rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
  var imported = 0, skipped = 0;
  rows.forEach(function(row) {
    var name = (row[0] || '').toString().trim();
    var code = (row[1] || '').toString().trim();
    if (name.toLowerCase() === 'name' && code.toLowerCase() === 'code') return;
    if (!name && !code) return;
    if (name && code && code.length >= 6) {
      state.nameMap[code] = name;
      imported++;
    } else {
      skipped++;
    }
  });
  return { imported: imported, skipped: skipped };
}

function applyImportResult(imported, skipped, statusEl, source) {
  if (imported === 0) {
    statusEl.textContent = '⚠️ No names imported. Make sure column A = Name, column B = Code. Rows skipped: ' + skipped;
    return;
  }
  localStorage.setItem('pylearn_name_map', JSON.stringify(state.nameMap));
  var msg = '✅ Imported ' + imported + ' name' + (imported !== 1 ? 's' : '');
  if (source) msg += ' from ' + source;
  msg += '.';
  if (skipped > 0) msg += ' (' + skipped + ' rows skipped — missing name or code too short.)';
  msg += ' Names saved locally — they will persist between sessions.';
  statusEl.textContent = msg;
  refreshAdminTable();
}

function importNamesFromSheet(file) {
  var statusEl = document.getElementById('import-status');
  statusEl.textContent = 'Reading file…';
  statusEl.classList.remove('hidden');
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var result = parseSheetData(new Uint8Array(e.target.result));
      applyImportResult(result.imported, result.skipped, statusEl);
    } catch(err) {
      statusEl.textContent = '❌ Error reading file: ' + err.message;
    }
  };
  reader.readAsArrayBuffer(file);
}

async function importNamesFromZip(file) {
  var statusEl = document.getElementById('import-status');
  statusEl.textContent = 'Reading ZIP…';
  statusEl.classList.remove('hidden');
  try {
    var zip = await JSZip.loadAsync(await file.arrayBuffer());
    var sheetEntries = [];
    zip.forEach(function(path, entry) {
      if (!entry.dir && /\.(xlsx|xls)$/i.test(path) && path.indexOf('__MACOSX/') !== 0) {
        sheetEntries.push({ path: path, entry: entry });
      }
    });
    if (!sheetEntries.length) {
      statusEl.textContent = '⚠️ No .xlsx or .xls files found in the ZIP.';
      return;
    }
    var totalImported = 0, totalSkipped = 0, filesDone = 0, filesFailed = 0;
    for (var i = 0; i < sheetEntries.length; i++) {
      statusEl.textContent = 'Processing file ' + (i + 1) + ' of ' + sheetEntries.length + '…';
      try {
        var data = await sheetEntries[i].entry.async('uint8array');
        var result = parseSheetData(data);
        totalImported += result.imported;
        totalSkipped += result.skipped;
        filesDone++;
      } catch(e) {
        filesFailed++;
      }
    }
    var source = filesDone + ' spreadsheet' + (filesDone !== 1 ? 's' : '');
    if (filesFailed > 0) source += ' (' + filesFailed + ' could not be read)';
    applyImportResult(totalImported, totalSkipped, statusEl, source);
  } catch(e) {
    statusEl.textContent = '❌ Error reading ZIP: ' + e.message;
  }
}
document.getElementById('btn-gen-codes').onclick = async function() {
  var rawName  = document.getElementById('input-class-name').value.trim().toUpperCase();
  var count    = parseInt(document.getElementById('input-code-count').value, 10);
  var statusEl = document.getElementById('gen-status');

  if (!rawName) { statusEl.textContent = 'Please enter a class name.'; statusEl.classList.remove('hidden'); return; }
  if (!count || count < 1 || count > 60) { statusEl.textContent = 'Number of codes must be between 1 and 60.'; statusEl.classList.remove('hidden'); return; }

  statusEl.textContent = 'Generating ' + count + ' codes for ' + rawName + '\u2026';
  statusEl.classList.remove('hidden');
  document.getElementById('btn-gen-codes').disabled = true;

  try {
    // Use the codeIndex (flat, small) instead of scanning the full classes tree
    var existingSnap = await state.db.ref('codeIndex').get();
    var existingCodes = new Set(existingSnap.exists() ? Object.keys(existingSnap.val() || {}) : []);

    var now = Date.now();
    var generated = genUniqueCodes(count, existingCodes);
    var classUpdates = {};
    var indexUpdates = {};
    generated.forEach(function(code) {
      classUpdates['classes/' + rawName + '/codes/' + code] = { createdAt: now };
      indexUpdates['codeIndex/' + code.toLowerCase()] = { className: rawName, storedCode: code };
      indexUpdates['studentCodes/' + code] = { className: rawName, indexedAt: now };
    });
    await state.db.ref().update(classUpdates);
    state.db.ref().update(indexUpdates).catch(function(){});  // best-effort; self-heals on login
    state.db.ref('classNames/' + rawName).set(true).catch(function(){});
    statusEl.textContent = '\u2705 Generated ' + generated.length + ' codes for ' + rawName + '.';
    await refreshAdminTable();
  } catch(e) {
    statusEl.textContent = '\u274c Error: ' + e.message;
  }

  document.getElementById('btn-gen-codes').disabled = false;
};

document.getElementById('btn-refresh-codes').onclick = refreshAdminTable;
document.getElementById('btn-refresh-sessions').onclick = loadActiveSessions;

document.getElementById('btn-add-single').onclick = async function() {
  var className = document.getElementById('input-single-class').value.trim().toUpperCase();
  var statusEl  = document.getElementById('gen-status');
  if (!className) { statusEl.textContent = 'Please enter a class name.'; statusEl.classList.remove('hidden'); return; }
  statusEl.textContent = 'Adding code to ' + className + '\u2026';
  statusEl.classList.remove('hidden');
  try {
    // Use codeIndex (flat, small) to check for existing codes
    var existingSnap = await state.db.ref('codeIndex').get();
    var existingCodes = new Set(existingSnap.exists() ? Object.keys(existingSnap.val() || {}) : []);
    var codes = genUniqueCodes(1, existingCodes);
    var code = codes[0];
    await state.db.ref('classes/' + className + '/codes/' + code).set({ createdAt: Date.now() });
    state.db.ref('codeIndex/' + code.toLowerCase()).set({ className: className, storedCode: code }).catch(function(){});
    state.db.ref('studentCodes/' + code).set({ className: className, indexedAt: Date.now() }).catch(function(){});
    state.db.ref('classNames/' + className).set(true).catch(function(){});
    statusEl.textContent = '\u2705 Added code ' + code + ' to ' + className + '.';
    await refreshAdminTable();
  } catch(e) {
    statusEl.textContent = '\u274c Error: ' + e.message;
  }
};

// Import names: clicking button triggers hidden file input
document.getElementById('btn-import-names').onclick = function() {
  document.getElementById('input-import-names').click();
};
document.getElementById('input-import-names').onchange = function(e) {
  var file = e.target.files[0];
  if (file) {
    if (/\.zip$/i.test(file.name)) {
      importNamesFromZip(file);
    } else {
      importNamesFromSheet(file);
    }
    e.target.value = '';
  }
};

// ── Import names from Google Drive ───────────────────────────

function parseDriveSheetRows(rows) {
  var imported = 0, skipped = 0;
  (rows || []).forEach(function(row) {
    var name = String(row[0] || '').trim();
    var code = String(row[1] || '').trim();
    if (name.toLowerCase() === 'name' && code.toLowerCase() === 'code') return;
    if (!name && !code) return;
    if (name && code && code.length >= 6) {
      state.nameMap[code] = name;
      imported++;
    } else {
      skipped++;
    }
  });
  return { imported: imported, skipped: skipped };
}

async function importNamesFromGoogleDrive() {
  var modal      = document.getElementById('modal-drive-import');
  var statusEl   = document.getElementById('drive-import-status');
  var listEl     = document.getElementById('drive-file-list');
  var folderRow  = document.getElementById('drive-folder-row');
  var folderSel  = document.getElementById('drive-folder-select');
  var btnBrowse  = document.getElementById('btn-drive-browse-folder');
  var btnImport  = document.getElementById('btn-drive-import-selected');
  var btnAll     = document.getElementById('btn-drive-select-all');
  var btnNone    = document.getElementById('btn-drive-select-none');

  // Reset
  modal.classList.remove('hidden');
  folderRow.classList.add('hidden');
  statusEl.textContent = '';
  listEl.innerHTML = '<p class="text-gray-400 text-sm p-3">Connecting to Google…</p>';
  [btnImport, btnAll, btnNone].forEach(function(b) { b.classList.add('hidden'); });

  var clientId = state.config && state.config.googleClientId;
  if (!clientId) {
    statusEl.textContent = '❌ googleClientId is not set in config/firebase.json.';
    listEl.innerHTML = '';
    return;
  }

  try {
    var token = await new Promise(function(resolve, reject) {
      if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
        reject(new Error('Google Identity Services not loaded — try again in a moment.'));
        return;
      }
      var client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly',
        callback: function(resp) {
          if (resp.error) reject(new Error(resp.error_description || resp.error));
          else resolve(resp.access_token);
        },
        error_callback: function(err) { reject(new Error(err.type || 'OAuth error')); }
      });
      client.requestAccessToken();
    });

    // Fetch folders to populate the selector
    statusEl.textContent = 'Fetching folders…';
    listEl.innerHTML = '';
    var foldersResp = await fetch(
      'https://www.googleapis.com/drive/v3/files' +
      '?q=' + encodeURIComponent("mimeType='application/vnd.google-apps.folder' and trashed=false") +
      '&fields=' + encodeURIComponent('files(id,name)') +
      '&pageSize=200&orderBy=name',
      { headers: { Authorization: 'Bearer ' + token } }
    );
    if (!foldersResp.ok) throw new Error('Drive API error ' + foldersResp.status);
    var foldersData = await foldersResp.json();
    var folders = foldersData.files || [];

    folderSel.innerHTML = '<option value="">— All spreadsheets —</option>' +
      folders.map(function(f) {
        return '<option value="' + escapeHtml(f.id) + '">' + escapeHtml(f.name) + '</option>';
      }).join('');
    folderRow.classList.remove('hidden');
    statusEl.textContent = 'Choose a folder then click Browse, or Browse all.';

    // Browse: fetch sheets for the selected folder (or all)
    async function browseSheets() {
      var folderId = folderSel.value;
      listEl.innerHTML = '<p class="text-gray-400 text-sm p-3">Loading…</p>';
      [btnImport, btnAll, btnNone].forEach(function(b) { b.classList.add('hidden'); });

      var q = folderId
        ? "'" + folderId + "' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
        : "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false";
      var sheetsResp = await fetch(
        'https://www.googleapis.com/drive/v3/files' +
        '?q=' + encodeURIComponent(q) +
        '&fields=' + encodeURIComponent('files(id,name)') +
        '&pageSize=100&orderBy=name',
        { headers: { Authorization: 'Bearer ' + token } }
      );
      if (!sheetsResp.ok) throw new Error('Drive API error ' + sheetsResp.status);
      var sheetsData = await sheetsResp.json();
      var files = sheetsData.files || [];

      if (!files.length) {
        listEl.innerHTML = '<p class="text-gray-400 text-sm p-3">No spreadsheets found here.</p>';
        statusEl.textContent = '';
        return;
      }

      statusEl.textContent = files.length + ' spreadsheet' + (files.length !== 1 ? 's' : '') + ' — select which to import:';
      listEl.innerHTML = files.map(function(f) {
        return '<label class="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 border-b border-gray-100 cursor-pointer last:border-0">' +
          '<input type="checkbox" class="drive-file-cb accent-[rgb(176,28,35)]"' +
          ' data-id="' + escapeHtml(f.id) + '" data-name="' + escapeHtml(f.name) + '" />' +
          '<span class="text-sm text-gray-800">' + escapeHtml(f.name) + '</span>' +
          '</label>';
      }).join('');

      [btnAll, btnNone].forEach(function(b) { b.classList.remove('hidden'); });
      btnImport.classList.remove('hidden');
      btnImport.disabled = true;

      listEl.onchange = function() { btnImport.disabled = !listEl.querySelector('.drive-file-cb:checked'); };
      btnAll.onclick  = function() { listEl.querySelectorAll('.drive-file-cb').forEach(function(cb){ cb.checked = true; }); btnImport.disabled = false; };
      btnNone.onclick = function() { listEl.querySelectorAll('.drive-file-cb').forEach(function(cb){ cb.checked = false; }); btnImport.disabled = true; };
    }

    // Restore folder: personal override (localStorage) → config default → none
    try {
      var saved = JSON.parse(localStorage.getItem('pylearn_drive_folder') || 'null');
      var defaultId = (!saved && state.config && state.config.driveFolderId) || null;
      var restoreId = (saved && saved.id) || defaultId;
      if (restoreId && folderSel.querySelector('option[value="' + restoreId + '"]')) {
        folderSel.value = restoreId;
        await browseSheets();
      }
    } catch(e) {}

    btnBrowse.onclick = function() {
      var opt = folderSel.options[folderSel.selectedIndex];
      if (opt && opt.value) {
        localStorage.setItem('pylearn_drive_folder', JSON.stringify({ id: opt.value, name: opt.textContent }));
      } else {
        localStorage.removeItem('pylearn_drive_folder');
      }
      return browseSheets();
    };

    btnImport.onclick = async function() {
      var selected = Array.from(listEl.querySelectorAll('.drive-file-cb:checked'));
      if (!selected.length) return;
      btnImport.disabled = true;
      [btnAll, btnNone].forEach(function(b) { b.classList.add('hidden'); });

      var totalImported = 0, totalSkipped = 0, done = 0, failed = 0;
      for (var i = 0; i < selected.length; i++) {
        statusEl.textContent = 'Reading ' + (i + 1) + ' / ' + selected.length + ': ' + selected[i].dataset.name + '…';
        try {
          var sheetResp = await fetch(
            'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(selected[i].dataset.id) + '/values/A:B',
            { headers: { Authorization: 'Bearer ' + token } }
          );
          if (!sheetResp.ok) throw new Error('HTTP ' + sheetResp.status);
          var result = parseDriveSheetRows((await sheetResp.json()).values);
          totalImported += result.imported;
          totalSkipped  += result.skipped;
          done++;
        } catch(e) { failed++; }
      }

      modal.classList.add('hidden');
      var source = done + ' spreadsheet' + (done !== 1 ? 's' : '') + ' from Google Drive';
      if (failed) source += ' (' + failed + ' could not be read)';
      var importStatusEl = document.getElementById('import-status');
      importStatusEl.classList.remove('hidden');
      applyImportResult(totalImported, totalSkipped, importStatusEl, source);
    };

  } catch(e) {
    statusEl.textContent = '❌ ' + (e.message || 'Could not connect to Google Drive.');
    listEl.innerHTML = '';
  }
}

document.getElementById('btn-import-names-drive').onclick = importNamesFromGoogleDrive;
document.getElementById('btn-drive-import-close').onclick = function() {
  document.getElementById('modal-drive-import').classList.add('hidden');
};

// ── Report ────────────────────────────────────────────────────
function showReport() {
  document.getElementById('modal-report').classList.remove('hidden');
  var el   = document.getElementById('report-content');
  var name = (function(){ try{ var n=JSON.parse(localStorage.getItem('pylearn_name')); return n.first+' '+n.last; }catch(e){ return 'Student'; } })();
  var html = '<p class="mb-3 font-semibold">'+name+' \u2014 '+new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})+'</p>';
  state.lessons.forEach(function(lesson){
    var lid=lesson.meta.id, complete=isLessonComplete(lesson), started=isLessonStarted(lesson);
    var cls=complete?'text-green-700 bg-green-50 border-green-200':started?'text-yellow-700 bg-yellow-50 border-yellow-200':'text-gray-500 bg-gray-50 border-gray-200';
    var status=complete?'Complete':started?'In Progress':'Not Started';
    var lessonMs=0; lesson.data.steps.forEach(function(s){ lessonMs+=getStepProgress(lid,s.id).totalMs||0; });
    html+='<div class="mb-4 border rounded-lg p-3 '+cls+'"><div class="flex justify-between items-center mb-2"><span class="font-medium">'+lesson.data.title+'</span><span class="text-xs">'+status+' \u00b7 '+fmtMs(lessonMs)+'</span></div>';
    html+='<table class="w-full text-xs"><thead><tr class="text-left opacity-70"><th class="pb-1 pr-3">Step</th><th class="pb-1 pr-3">Status</th><th class="pb-1">Time</th></tr></thead><tbody>';
    lesson.data.steps.forEach(function(step){
      var sp=getStepProgress(lid,step.id);
      var st=sp.completed?'\u2705 Complete':sp.startedAt?'\uD83D\uDFE1 Started':'\u2B1C Not started';
      html+='<tr><td class="pr-3 py-0.5">'+step.title+'</td><td class="pr-3">'+st+'</td><td>'+fmtMs(sp.totalMs)+'</td></tr>';
    });
    html+='</tbody></table></div>';
  });
  el.innerHTML=html;
}

function exportReport() {
  var name=(function(){ try{ var n=JSON.parse(localStorage.getItem('pylearn_name')); return n.first+' '+n.last; }catch(e){ return 'Student'; } })();
  var txt='JHNCC Computing Progress Report\n'+name+'\n'+new Date().toLocaleString('en-GB')+'\n'+'='.repeat(40)+'\n\n';
  state.lessons.forEach(function(lesson){
    var lid=lesson.meta.id, lessonMs=0;
    lesson.data.steps.forEach(function(s){ lessonMs+=getStepProgress(lid,s.id).totalMs||0; });
    var status=isLessonComplete(lesson)?'COMPLETE':isLessonStarted(lesson)?'IN PROGRESS':'NOT STARTED';
    txt+='Lesson: '+lesson.data.title+' ['+status+'] - '+fmtMs(lessonMs)+'\n';
    lesson.data.steps.forEach(function(step){
      var sp=getStepProgress(lid,step.id);
      txt+='  \u2022 '+step.title+': '+(sp.completed?'Complete':sp.startedAt?'Started':'Not started')+' ('+fmtMs(sp.totalMs)+')\n';
    });
    txt+='\n';
  });
  var blob=new Blob([txt],{type:'text/plain'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='jhncc-computing-report-'+name.replace(/\s/g,'-').toLowerCase()+'.txt';
  a.click();
}

document.getElementById('btn-ap-feedback').onclick = openStudentApFeedback;
document.getElementById('btn-student-ap-feedback-close').onclick = function() {
  document.getElementById('modal-student-ap-feedback').classList.add('hidden');
};

async function openStudentApFeedback() {
  var modal = document.getElementById('modal-student-ap-feedback');
  var content = document.getElementById('student-ap-feedback-content');
  document.getElementById('student-ap-feedback-subtitle').textContent = state.className ? 'Class: ' + state.className : '';
  content.innerHTML = '<p class="text-gray-400 text-center py-8">Loading AP feedback...</p>';
  modal.classList.remove('hidden');
  try {
    if (!state.uid || !state.className) throw new Error('You need to be logged into a class.');
    var progressSnap = await state.db.ref('progress/' + state.uid + '/assessments').get();
    var feedbackSnap = await state.db.ref('classes/' + state.className + '/apFeedback').get();
    var assessments = progressSnap.exists() ? progressSnap.val() : {};
    var feedbacks = feedbackSnap.exists() ? feedbackSnap.val() : {};
    var attempts = completedAssessmentAttempts(assessments);
    attempts.sort(function(a, b) {
      return (b.completedAt || 0) - (a.completedAt || 0);
    });
    if (!attempts.length) {
      content.innerHTML = '<p class="text-gray-500 text-center py-8">No completed APs found yet.</p>';
      return;
    }
    assessment.assessmentId = attempts[0].assessmentId;
    assessment.className = state.className;
    var html = '<div class="mb-4 flex flex-wrap items-end gap-3"><div><label class="block text-xs text-gray-500 mb-1">Completed AP</label><select id="student-ap-feedback-select" class="jhncc-focus border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none min-w-[320px]">';
    attempts.forEach(function(rec, idx) {
      var id = rec.assessmentId;
      var when = rec.completedAt ? ' - ' + new Date(rec.completedAt).toLocaleString('en-GB') : '';
      var feedback = releasedFeedbackForAssessmentAttempt(feedbacks, rec);
      var status = feedback ? '' : ' - feedback not released yet';
      html += '<option value="' + idx + '">' + escapeHtml(((ASSESSMENTS[id] && ASSESSMENTS[id].title) || id) + when + status) + '</option>';
    });
    html += '</select></div></div><div id="student-ap-feedback-body"></div>';
    content.innerHTML = html;
    function renderSelected() {
      var rec = attempts[Number(document.getElementById('student-ap-feedback-select').value)] || attempts[0];
      var id = rec.assessmentId;
      assessment.assessmentId = id;
      var body = document.getElementById('student-ap-feedback-body');
      var feedback = releasedFeedbackForAssessmentAttempt(feedbacks, rec);
      if (!feedback) {
        body.innerHTML = '<div class="border border-gray-200 rounded-lg p-4"><h3 class="text-lg font-bold mb-2">' + escapeHtml((ASSESSMENTS[id] && ASSESSMENTS[id].title) || id) + '</h3><p class="text-sm text-gray-600 mb-3">Completed: ' + (rec.completedAt ? new Date(rec.completedAt).toLocaleString('en-GB') : '-') + '</p><p class="text-gray-500">Your teacher has not released whole class feedback for this AP yet.</p></div>';
      } else {
        renderReleasedAssessmentFeedback(body, feedback, rec);
      }
      appendOwnSb3DownloadButton(body, id, rec.lobbyCode);
    }
    document.getElementById('student-ap-feedback-select').onchange = renderSelected;
    renderSelected();
  } catch(e) {
    content.innerHTML = '<p class="text-red-500 text-center py-8">' + escapeHtml(e.message) + '</p>';
  }
}

// Append a "Download my project (.sb3)" button to the feedback body when a local SB3
// backup exists for this attempt. Pulls straight from localStorage — no Firebase.
function appendOwnSb3DownloadButton(body, assessmentId, lobbyCode) {
  if (!body || !lobbyCode) return;
  var isScratch = String((ASSESSMENTS[assessmentId] || {}).validation || '').indexOf('scratch') !== -1;
  if (!isScratch) return;
  if (typeof hasLocalApScratchSb3 !== 'function' || !hasLocalApScratchSb3(lobbyCode)) return;
  var wrap = document.createElement('div');
  wrap.className = 'mt-4';
  var btn = document.createElement('button');
  btn.className = 'px-5 py-2 rounded border border-blue-400 text-blue-700 bg-blue-50 hover:bg-blue-100 font-semibold text-sm';
  btn.textContent = 'Download my project (.sb3)';
  btn.onclick = function() { downloadOwnApScratchSb3(lobbyCode); };
  wrap.appendChild(btn);
  body.appendChild(wrap);
}

function completedAssessmentAttempts(assessments) {
  var attempts = [];
  Object.keys(assessments || {}).forEach(function(assessmentId) {
    var rec = assessments[assessmentId] || {};
    Object.keys(rec.attempts || {}).forEach(function(lobbyCode) {
      var attempt = Object.assign({}, rec.attempts[lobbyCode] || {});
      attempt.assessmentId = attempt.assessmentId || assessmentId;
      attempt.lobbyCode = attempt.lobbyCode || lobbyCode;
      if (attempt.completedAt) attempts.push(attempt);
    });
    if (rec.completedAt && !rec.attempts) {
      attempts.push(Object.assign({}, rec, { assessmentId: assessmentId }));
    }
  });
  return attempts;
}

function releasedFeedbackForAssessmentAttempt(feedbacks, rec) {
  var feedback = feedbacks && feedbacks[rec.assessmentId];
  if (feedback && rec.lobbyCode && feedback[rec.lobbyCode] && feedback[rec.lobbyCode].released) return feedback[rec.lobbyCode];
  if (feedback && feedback.released) return feedback;
  return null;
}

// ── Force Individual AP ───────────────────────────────────────

var forceApActiveListeners = {};

async function loadForceApTab() {
  var classEl = document.getElementById('force-ap-class');
  var assessEl = document.getElementById('force-ap-assessment');

  // Populate class dropdown from Firebase
  classEl.innerHTML = '<option value="">Loading…</option>';
  try {
    var snap = await state.db.ref('classes').get();
    classEl.innerHTML = '';
    if (snap.exists()) {
      snap.forEach(function(child) {
        var o = document.createElement('option');
        o.value = child.key; o.textContent = child.key;
        classEl.appendChild(o);
      });
    }
  } catch(e) {
    classEl.innerHTML = '<option value="">Error loading classes</option>';
  }

  // Populate assessment dropdown from ASSESSMENTS
  assessEl.innerHTML = '';
  if (typeof ASSESSMENTS !== 'undefined') {
    Object.keys(ASSESSMENTS).forEach(function(id) {
      var o = document.createElement('option');
      o.value = id;
      o.textContent = (ASSESSMENTS[id].title || id);
      assessEl.appendChild(o);
    });
  }

  // Load students for the selected class
  classEl.onchange = function() { loadForceApStudents(classEl.value); };
  if (classEl.value) loadForceApStudents(classEl.value);

  document.getElementById('btn-force-ap-assign').onclick = function() {
    assignForcedApToSelectedStudents(classEl.value, assessEl.value);
  };

  loadActiveForcedAps();
}

async function loadForceApStudents(className) {
  var container = document.getElementById('force-ap-students');
  if (!className) { container.innerHTML = ''; return; }
  container.innerHTML = '<p class="text-gray-400 text-sm py-2">Loading students…</p>';
  try {
    var snap = await state.db.ref('classes/' + className + '/codes').get();
    if (!snap.exists()) { container.innerHTML = '<p class="text-gray-400 text-sm py-2">No students in this class.</p>'; return; }
    var codes = Object.keys(snap.val());
    var h = '<p class="text-xs text-gray-500 mb-2">Select students to assign:</p>';
    h += '<div class="flex flex-wrap gap-2 mb-2">';
    codes.forEach(function(code) {
      var name = studentName(code) || code;
      h += '<label class="flex items-center gap-1.5 text-sm cursor-pointer bg-gray-50 border border-gray-200 rounded px-2 py-1 hover:bg-gray-100">' +
        '<input type="checkbox" class="force-ap-student-check" value="' + escapeHtml(code) + '">' +
        '<span>' + escapeHtml(name) + '</span></label>';
    });
    h += '</div>';
    h += '<div class="flex gap-2 text-xs">' +
      '<button id="btn-force-ap-select-all" class="text-blue-500 hover:text-blue-700 underline">Select all</button>' +
      '<button id="btn-force-ap-select-none" class="text-gray-400 hover:text-gray-600 underline">Clear</button></div>';
    container.innerHTML = h;
    document.getElementById('btn-force-ap-select-all').onclick = function() {
      container.querySelectorAll('.force-ap-student-check').forEach(function(cb) { cb.checked = true; });
    };
    document.getElementById('btn-force-ap-select-none').onclick = function() {
      container.querySelectorAll('.force-ap-student-check').forEach(function(cb) { cb.checked = false; });
    };
  } catch(e) {
    container.innerHTML = '<p class="text-red-400 text-sm py-2">Error: ' + escapeHtml(e.message) + '</p>';
  }
}

async function assignForcedApToSelectedStudents(className, assessmentId) {
  if (!className || !assessmentId) { alert('Please select a class and an assessment.'); return; }
  var checks = document.querySelectorAll('#force-ap-students .force-ap-student-check:checked');
  if (!checks.length) { alert('Please select at least one student.'); return; }
  var btn = document.getElementById('btn-force-ap-assign');
  btn.disabled = true; btn.textContent = 'Assigning…';
  try {
    var codes = Array.prototype.map.call(checks, function(cb) { return cb.value; });
    await Promise.all(codes.map(function(code) {
      return assignForcedApToStudent(className, code, assessmentId);
    }));
    btn.textContent = 'Assigned!';
    setTimeout(function() { btn.disabled = false; btn.textContent = 'Assign to selected students'; }, 2000);
    loadActiveForcedAps();
  } catch(e) {
    alert('Error: ' + e.message);
    btn.disabled = false; btn.textContent = 'Assign to selected students';
  }
}

async function assignForcedApToStudent(className, studentCode, assessmentId) {
  var lobbyCode = 'FAP' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
  var now = Date.now();
  var updates = {};
  updates['quizSessions/' + lobbyCode] = {
    lessonId: 'AP:' + assessmentId,
    state: 'active',
    forced: true,
    individualForced: true,
    assignedTo: studentCode,
    className: className,
    createdAt: now,
    answers: { 0: {} }
  };
  updates['classes/' + className + '/forcedAPAssignments/' + studentCode] = {
    assessmentId: assessmentId,
    lobbyCode: lobbyCode,
    assignedAt: now,
    assignedBy: state.uid || 'admin',
    state: 'active'
  };
  updates['progress/' + studentCode + '/forcedAPAssignment'] = {
    assessmentId: assessmentId,
    lobbyCode: lobbyCode,
    assignedAt: now,
    state: 'active'
  };
  await state.db.ref().update(updates);
}

async function loadActiveForcedAps() {
  var container = document.getElementById('force-ap-active');
  if (!container) return;
  container.innerHTML = '<p class="text-gray-400 text-sm py-2">Loading…</p>';

  try {
    var classNameList = await getClassNames();
    if (!classNameList.length) { container.innerHTML = '<p class="text-gray-400 text-sm py-2">No active forced APs.</p>'; return; }
    var assignmentSnaps = await Promise.all(classNameList.map(function(cn) {
      return state.db.ref('classes/' + cn + '/forcedAPAssignments').get();
    }));

    var activeItems = [];
    classNameList.forEach(function(cn, i) {
      var assignments = assignmentSnaps[i].val() || {};
      Object.keys(assignments).forEach(function(code) {
        var rec = assignments[code] || {};
        if (rec.state === 'active') {
          activeItems.push({ className: cn, code: code, rec: rec });
        }
      });
    });

    if (!activeItems.length) {
      container.innerHTML = '<p class="text-gray-400 text-sm py-2">No active forced APs.</p>';
      return;
    }

    var h = '<div class="border border-gray-200 rounded-lg overflow-hidden"><table class="w-full text-sm">';
    h += '<thead><tr class="bg-gray-50 text-xs text-gray-500 text-left">';
    h += '<th class="px-3 py-2">Student</th><th class="px-3 py-2">Class</th><th class="px-3 py-2">Assessment</th><th class="px-3 py-2">Assigned</th><th class="px-3 py-2"></th>';
    h += '</tr></thead><tbody>';
    activeItems.forEach(function(item, idx) {
      var name = studentName(item.code) || item.code;
      var spec = (typeof ASSESSMENTS !== 'undefined') && ASSESSMENTS[item.rec.assessmentId];
      var apTitle = spec ? spec.title : (item.rec.assessmentId || '—');
      var when = item.rec.assignedAt ? new Date(item.rec.assignedAt).toLocaleString('en-GB') : '—';
      h += '<tr class="border-t border-gray-100 hover:bg-gray-50" data-idx="' + idx + '">';
      h += '<td class="px-3 py-2 font-medium">' + escapeHtml(name) + '</td>';
      h += '<td class="px-3 py-2 text-gray-500">' + escapeHtml(item.className) + '</td>';
      h += '<td class="px-3 py-2">' + escapeHtml(apTitle) + '</td>';
      h += '<td class="px-3 py-2 text-gray-400 text-xs">' + escapeHtml(when) + '</td>';
      h += '<td class="px-3 py-2"><button class="btn-end-forced-ap text-xs text-red-500 hover:text-red-700 font-medium" data-idx="' + idx + '">End AP</button></td>';
      h += '</tr>';
    });
    h += '</tbody></table></div>';
    container.innerHTML = h;

    container.querySelectorAll('.btn-end-forced-ap').forEach(function(btn) {
      btn.onclick = async function() {
        var item = activeItems[parseInt(btn.dataset.idx, 10)];
        if (!item) return;
        var name = studentName(item.code) || item.code;
        if (!confirm('End the forced AP for ' + name + '? Their current work will be auto-submitted.')) return;
        btn.disabled = true; btn.textContent = 'Ending…';
        try {
          await endForcedApForStudent(item.className, item.code, item.rec.lobbyCode);
          loadActiveForcedAps();
        } catch(e) {
          alert('Error: ' + e.message);
          btn.disabled = false; btn.textContent = 'End AP';
        }
      };
    });
  } catch(e) {
    container.innerHTML = '<p class="text-red-400 text-sm py-2">Error: ' + escapeHtml(e.message) + '</p>';
  }
}

async function endForcedApForStudent(className, studentCode, lobbyCode) {
  var now = Date.now();
  var updates = {};
  updates['classes/' + className + '/forcedAPAssignments/' + studentCode + '/state'] = 'ended';
  updates['classes/' + className + '/forcedAPAssignments/' + studentCode + '/endedAt'] = now;
  updates['progress/' + studentCode + '/forcedAPAssignment/state'] = 'ended';
  updates['progress/' + studentCode + '/forcedAPAssignment/endedAt'] = now;
  if (lobbyCode) {
    updates['quizSessions/' + lobbyCode + '/state'] = 'ending';
    updates['quizSessions/' + lobbyCode + '/endingAt'] = now;
  }
  await state.db.ref().update(updates);
  // After 30s grace, mark finished
  setTimeout(async function() {
    try {
      if (lobbyCode) {
        await state.db.ref('quizSessions/' + lobbyCode).update({ state: 'finished', endedAt: Date.now() });
      }
    } catch(e) {}
  }, 30000);
}

// ── Access History ────────────────────────────────────────────

function isSchoolHours(ts) {
  var d = new Date(ts);
  var day = d.getDay();
  if (day === 0 || day === 6) return false;
  var mins = d.getHours() * 60 + d.getMinutes();
  return mins >= 8 * 60 + 30 && mins <= 16 * 60 + 30;
}

function formatAccessTime(ts) {
  var d = new Date(ts);
  var now = new Date();
  var timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return 'Today ' + timeStr;
  var yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday ' + timeStr;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + timeStr;
}

async function loadAccessTab() {
  var content = document.getElementById('access-history-content');
  var filterEl = document.getElementById('access-class-filter');
  content.innerHTML = '<p class="text-gray-400 text-sm py-4">Loading…</p>';

  try {
    // Populate class filter once
    if (filterEl.options.length <= 1) {
      var accessClassNames = await getClassNames();
      accessClassNames.forEach(function(name) {
        var o = document.createElement('option');
        o.value = name; o.textContent = name;
        filterEl.appendChild(o);
      });
    }

    // Limit to the last 14 days of activity — orderByChild('lastSeen') with a cutoff
    var cutoff = Date.now() - (14 * 24 * 60 * 60 * 1000);
    var snap = await state.db.ref('accessLog').orderByChild('lastSeen').startAt(cutoff).get();
    if (!snap.exists()) {
      content.innerHTML = '<p class="text-gray-400 text-sm py-4">No access history yet — students need to log in for entries to appear.</p>';
      return;
    }

    var classFilter = filterEl.value;

    // Build last-14-days key array (oldest → newest)
    var days14 = [];
    for (var i = 13; i >= 0; i--) {
      var day = new Date(); day.setDate(day.getDate() - i);
      days14.push(day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0'));
    }

    var students = [];
    snap.forEach(function(child) {
      var data = child.val() || {};
      if (classFilter && data.className !== classFilter) return;
      students.push({ code: child.key, name: data.name || child.key, className: data.className || '—', lastSeen: data.lastSeen || 0, days: data.days || {} });
    });
    students.sort(function(a, b) { return b.lastSeen - a.lastSeen; });

    if (!students.length) {
      content.innerHTML = '<p class="text-gray-400 text-sm py-4">No access history for this class yet.</p>';
      return;
    }

    var h = '<div class="border border-gray-200 rounded-lg overflow-hidden"><table class="w-full text-sm">';
    h += '<thead><tr class="bg-gray-50 text-xs text-gray-500 text-left">';
    h += '<th class="px-3 py-2">Name</th><th class="px-3 py-2">Code</th><th class="px-3 py-2">Class</th><th class="px-3 py-2">Last seen</th><th class="px-3 py-2">Last 14 days</th>';
    h += '</tr></thead><tbody>';

    students.forEach(function(s, idx) {
      var grid = '<div class="flex gap-0.5 items-center">';
      days14.forEach(function(dk) {
        var dayData = s.days[dk];
        if (dayData) {
          var home = !isSchoolHours(dayData.last);
          var dt = new Date(dayData.last);
          var tip = dk + ' · ' + dayData.count + ' visit' + (dayData.count !== 1 ? 's' : '') + ', last ' + dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
          grid += '<div class="w-3 h-3 rounded-sm ' + (home ? 'bg-orange-400' : 'bg-blue-500') + '" title="' + escapeHtml(tip) + '"></div>';
        } else {
          grid += '<div class="w-3 h-3 rounded-sm bg-gray-200" title="' + escapeHtml(dk) + ' — no access"></div>';
        }
      });
      grid += '</div>';

      var home = s.lastSeen && !isSchoolHours(s.lastSeen);
      var rowCls = idx % 2 === 0 ? '' : 'bg-gray-50';
      h += '<tr class="border-t border-gray-100 ' + rowCls + '">';
      h += '<td class="px-3 py-2 font-medium">' + escapeHtml(s.name) + '</td>';
      h += '<td class="px-3 py-2 font-mono text-xs text-gray-500">' + escapeHtml(s.code) + '</td>';
      h += '<td class="px-3 py-2 text-gray-500">' + escapeHtml(s.className) + '</td>';
      h += '<td class="px-3 py-2 text-gray-600 whitespace-nowrap">' + (s.lastSeen ? escapeHtml(formatAccessTime(s.lastSeen)) : '—');
      if (home) h += ' <span class="text-xs bg-orange-100 text-orange-700 rounded px-1 py-0.5 ml-1">home</span>';
      h += '</td>';
      h += '<td class="px-3 py-2">' + grid + '</td>';
      h += '</tr>';
    });

    h += '</tbody></table></div>';
    content.innerHTML = h;
  } catch(e) {
    content.innerHTML = '<p class="text-red-400 text-sm py-2">Error: ' + escapeHtml(e.message) + '</p>';
  }

  document.getElementById('btn-access-refresh').onclick = function() { loadAccessTab(); };
}

// ════════════════════════════════════════════════════════════════
