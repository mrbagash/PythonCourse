// ── Auth ──────────────────────────────────────────────────────
function setLoginError(message) {
  var errEl = document.getElementById('login-error');
  if (!errEl) return;
  errEl.textContent = message || '';
  errEl.classList.toggle('hidden', !message);
}

function adminDisplayNameParts(user, fallbackFirst, fallbackLast) {
  var display = (user && user.displayName ? user.displayName : '').trim();
  var parts = display ? display.split(/\s+/) : [];
  return {
    first: fallbackFirst || parts[0] || 'Admin',
    last: fallbackLast || parts.slice(1).join(' ') || ''
  };
}

function isGoogleAuthUser(user) {
  return !!(user && user.providerData && user.providerData.some(function(p) {
    return p && p.providerId === 'google.com';
  }));
}

var GOOGLE_ADMIN_BOOTSTRAP_UIDS = {
  OSyDoCzzush3n94fDG6tyvzDsf93: true
};

async function completeGoogleAdminLogin(user, fallbackFirst, fallbackLast) {
  if (!user || !user.uid) throw new Error('Google sign-in did not return a user.');
  if (!isGoogleAuthUser(user)) throw new Error('Admin login must use Google sign-in.');
  var adminSnap = await state.db.ref('admins/' + user.uid).get();
  if (adminSnap.val() !== true && GOOGLE_ADMIN_BOOTSTRAP_UIDS[user.uid]) {
    try {
      await state.db.ref('admins/' + user.uid).set(true);
    } catch(e) {
      throw new Error('Admin bootstrap was allowed by the app, but Firebase rules blocked the write. Make sure the updated rules with your UID are published.');
    }
    adminSnap = await state.db.ref('admins/' + user.uid).get();
  }
  if (adminSnap.val() !== true) {
    throw new Error('This Google account is not listed as an admin. Add admins/' + user.uid + ' = true in Firebase, then try again.');
  }
  var name = adminDisplayNameParts(user, fallbackFirst, fallbackLast);
  localStorage.setItem('pylearn_name', JSON.stringify(name));
  localStorage.setItem('pylearn_code', 'admin:' + user.uid);
  localStorage.setItem('pylearn_auth_mode', 'google-admin');
  localStorage.removeItem('pylearn_is_teacher');
  localStorage.removeItem('pylearn_teacher_perms');
  state.uid=user.uid; state.className=null; state.isAdmin=true; state.isTeacher=false;
  state.teacherPermissions=null; state.teacherCode=null;
  updateAuthUI(name.first,name.last,true,false);
  return name;
}

async function signInGoogleAdmin() {
  setLoginError('');
  var first = document.getElementById('input-first').value.trim();
  var last  = document.getElementById('input-last').value.trim();
  var provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    var result = await state.auth.signInWithPopup(provider);
    await completeGoogleAdminLogin(result.user, first, last);
    document.getElementById('modal-login').classList.add('hidden');
  } catch(e) {
    try { await state.auth.signOut(); } catch(_e) {}
    await ensureAnonymousAuth();
    setLoginError(e && e.message ? e.message : 'Google admin sign-in failed.');
  }
}

function setupAuthUI() {
  var modalLogin = document.getElementById('modal-login');

  document.getElementById('btn-login').onclick = function() {
    modalLogin.classList.remove('hidden');
    var saved = localStorage.getItem('pylearn_name');
    if (saved) {
      var n = JSON.parse(saved);
      document.getElementById('input-first').value = n.first || '';
      document.getElementById('input-last').value  = n.last  || '';
    }
  };

  document.getElementById('btn-login-cancel').onclick = function() { modalLogin.classList.add('hidden'); };
  document.getElementById('btn-google-admin-login').onclick = signInGoogleAdmin;

  document.getElementById('btn-login-submit').onclick = async function() {
    var first = document.getElementById('input-first').value.trim();
    var last  = document.getElementById('input-last').value.trim();
    var code  = document.getElementById('input-code').value.trim();
    var errEl = document.getElementById('login-error');
    errEl.classList.add('hidden');

    if (!first||!last) { errEl.textContent='Please enter your name.';       errEl.classList.remove('hidden'); return; }
    if (!code)         { errEl.textContent='Please enter your login code.'; errEl.classList.remove('hidden'); return; }

    var firebaseUid = state.auth && state.auth.currentUser && state.auth.currentUser.uid;
    try {
      var teacherSnap = await state.db.ref('teachers/' + code.toLowerCase()).get();
      if (teacherSnap.exists()) {
        var td = teacherSnap.val();
        localStorage.setItem('pylearn_name', JSON.stringify({first:first,last:last}));
        localStorage.setItem('pylearn_code', code.toLowerCase());
        localStorage.setItem('pylearn_is_teacher', '1');
        localStorage.setItem('pylearn_teacher_perms', JSON.stringify(td.permissions || {}));
        localStorage.removeItem('pylearn_auth_mode');
        state.isAdmin=false; state.isTeacher=true;
        state.uid=code.toLowerCase(); state.teacherPermissions=td.permissions||{}; state.teacherCode=code.toLowerCase();
        if (firebaseUid) {
          // Await the session write so Firebase rules (which gate classes/progress reads on
          // teacherSessions existing) are satisfied before the Teacher Panel can be opened.
          try { await state.db.ref('teacherSessions/' + firebaseUid).set({ code: code.toLowerCase(), loggedInAt: Date.now() }); } catch(e) {}
        }
        modalLogin.classList.add('hidden');
        updateAuthUI(first,last,false,true);
        return;
      }
    } catch(e) {}
    try {
      // Try the fast code index first (single point-read — avoids downloading the full classes tree)
      var foundCode = null;
      var foundClass = null;
      var idxSnap = await state.db.ref('codeIndex/' + code.toLowerCase()).get();
      if (idxSnap.exists()) {
        var idxData = idxSnap.val() || {};
        foundCode = idxData.storedCode || code;
        foundClass = idxData.className || null;
      }
      if (!foundCode) { errEl.textContent='Invalid code. Please ask your teacher.'; errEl.classList.remove('hidden'); return; }
      localStorage.setItem('pylearn_name', JSON.stringify({first:first,last:last}));
      localStorage.setItem('pylearn_code', foundCode);
      localStorage.removeItem('pylearn_auth_mode');
      state.uid=foundCode; state.className=foundClass; state.isAdmin=false;
      if (firebaseUid) {
        state.db.ref('studentSessions/' + firebaseUid).set({ code: foundCode, className: foundClass || '', loggedInAt: Date.now() }).catch(function(){});
      }
      await loadProgress();
      renderLessonTabs(); renderStepBar();
      modalLogin.classList.add('hidden');
      updateAuthUI(first,last,false);
      logStudentAccess(foundCode, first + ' ' + last, foundClass);
      startForcedQuizWatcher(foundClass);
      startForcedAssessmentWatcher(foundClass);
      startIndividualForcedApWatcher(foundClass, foundCode);
    } catch(e) { errEl.textContent='Error connecting. Please try again.'; errEl.classList.remove('hidden'); }
  };

  document.getElementById('btn-logout').onclick = async function() {
    await saveStepTime();
    var wasGoogleAdmin = localStorage.getItem('pylearn_auth_mode') === 'google-admin';
    localStorage.removeItem('pylearn_code');
    // Clear all saved per-step code so the next student doesn't see this one's work
    try {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (k && (k.indexOf('pylearn_code:') === 0)) localStorage.removeItem(k);
      }
    } catch(e) {}
    // Clear local progress so the next student starts fresh on this device
    try { localStorage.removeItem(localProgressKey()); } catch(e) {}
    stopForcedQuizWatcher();
    stopForcedAssessmentWatcher();
    localStorage.removeItem('pylearn_is_teacher');
    localStorage.removeItem('pylearn_teacher_perms');
    localStorage.removeItem('pylearn_auth_mode');
    var firebaseUid = state.auth && state.auth.currentUser && state.auth.currentUser.uid;
    if (firebaseUid) {
      state.db.ref('teacherSessions/' + firebaseUid).remove().catch(function(){});
      state.db.ref('studentSessions/' + firebaseUid).remove().catch(function(){});
    }
    if (wasGoogleAdmin && state.auth) {
      try { await state.auth.signOut(); } catch(e) {}
      await ensureAnonymousAuth();
    }
    state.uid=null; state.className=null; state.isAdmin=false; state.isTeacher=false; state.teacherPermissions=null; state.teacherCode=null; state.progress={};
    updateAuthUI(null,null,false,false);
    renderLessonTabs(); renderStepBar();
  };

  document.getElementById('btn-report').onclick = showReport;
  document.getElementById('btn-admin').onclick   = showAdmin;
  document.getElementById('btn-admin-close').onclick  = function(){ document.getElementById('modal-admin').classList.add('hidden'); };
  document.getElementById('btn-report-close').onclick  = function(){ document.getElementById('modal-report').classList.add('hidden'); };
  document.getElementById('btn-report-close2').onclick = function(){ document.getElementById('modal-report').classList.add('hidden'); };
  document.getElementById('btn-export-txt').onclick   = exportReport;

  // Auto-login
  var savedCode = localStorage.getItem('pylearn_code');
  var savedName = localStorage.getItem('pylearn_name');
  if (savedCode && savedName) {
    var n = JSON.parse(savedName);
    if (savedCode.indexOf('admin:') === 0) {
      var currentUser = state.auth && state.auth.currentUser;
      if (!currentUser || savedCode !== 'admin:' + currentUser.uid) {
        localStorage.removeItem('pylearn_code');
        localStorage.removeItem('pylearn_name');
        localStorage.removeItem('pylearn_auth_mode');
        updateAuthUI(null,null,false,false);
        if (state.auth && state.auth.currentUser && !state.auth.currentUser.isAnonymous) {
          state.auth.signOut().then(ensureAnonymousAuth).catch(function(){ ensureAnonymousAuth(); });
        }
      } else completeGoogleAdminLogin(currentUser, n.first, n.last).catch(function() {
        localStorage.removeItem('pylearn_code');
        localStorage.removeItem('pylearn_name');
        localStorage.removeItem('pylearn_auth_mode');
        updateAuthUI(null,null,false,false);
        if (state.auth && state.auth.currentUser && !state.auth.currentUser.isAnonymous) {
          state.auth.signOut().then(ensureAnonymousAuth).catch(function(){ ensureAnonymousAuth(); });
        }
      });
    } else if (localStorage.getItem('pylearn_is_teacher') === '1') {
      state.uid=savedCode.toLowerCase(); state.isTeacher=true; state.teacherCode=savedCode.toLowerCase();
      try { state.teacherPermissions=JSON.parse(localStorage.getItem('pylearn_teacher_perms')||'{}'); } catch(e){ state.teacherPermissions={}; }
      // Write teacherSessions immediately using the anonymous UID that is already established
      // by loadApp() — this must happen BEFORE updateAuthUI so the Teacher Panel button is
      // only visible once the session exists in Firebase (rules gate all panel reads on it).
      var _autoTeacherUid = state.auth && state.auth.currentUser && state.auth.currentUser.uid;
      if (_autoTeacherUid) {
        state.db.ref('teacherSessions/' + _autoTeacherUid).set({
          code: savedCode.toLowerCase(), loggedInAt: Date.now()
        }).catch(function(){});
      }
      updateAuthUI(n.first,n.last,false,true);
      state.db.ref('teachers/'+savedCode.toLowerCase()).get().then(function(snap){
        if(!snap.exists()){
          localStorage.removeItem('pylearn_is_teacher'); localStorage.removeItem('pylearn_teacher_perms');
          document.getElementById('btn-logout').click();
        } else {
          var savedTeacherData = snap.val() || {};
          state.teacherPermissions=savedTeacherData.permissions||{};
          localStorage.setItem('pylearn_teacher_perms',JSON.stringify(state.teacherPermissions));
          // If UID wasn't available above (very rare), write the session now
          var firebaseUid = state.auth && state.auth.currentUser && state.auth.currentUser.uid;
          if (firebaseUid && !_autoTeacherUid) {
            state.db.ref('teacherSessions/' + firebaseUid).set({
              code: savedCode.toLowerCase(), loggedInAt: Date.now()
            }).catch(function(){});
          }
        }
      }).catch(function(){});
    } else {
      state.uid=savedCode;
      findClassForCode(savedCode).then(function(className) {
        state.className = className;
        var firebaseUid = state.auth && state.auth.currentUser && state.auth.currentUser.uid;
        if (firebaseUid) state.db.ref('studentSessions/' + firebaseUid).set({ code: savedCode, className: className || '', loggedInAt: Date.now() }).catch(function(){});
        logStudentAccess(savedCode, n.first + ' ' + n.last, className);
        startForcedQuizWatcher(className);
        startForcedAssessmentWatcher(className);
        startIndividualForcedApWatcher(className, savedCode);
      });
      loadProgress().then(function(){ renderLessonTabs(); renderStepBar(); });
      updateAuthUI(n.first,n.last,false);
    }
  }
}

function logStudentAccess(code, name, className) {
  if (!state.db || !code) return;
  var now = Date.now();
  var d = new Date(now);
  var dateKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  var ref = state.db.ref('accessLog/' + code);
  ref.update({ name: name, className: className || '', lastSeen: now }).catch(function() {});
  ref.child('days/' + dateKey).transaction(function(current) {
    if (!current) return { count: 1, last: now };
    return { count: (current.count || 0) + 1, last: now };
  }, null, false);
}

function updateAuthUI(first, last, isAdmin, isTeacher) {
  var show = !!first;
  document.getElementById('btn-login').classList.toggle('hidden',  show);
  document.getElementById('btn-logout').classList.toggle('hidden', !show);
  document.getElementById('btn-report').classList.toggle('hidden', !show||isAdmin||isTeacher);
  document.getElementById('btn-ap-feedback').classList.toggle('hidden', !show||isAdmin||isTeacher);
  document.getElementById('btn-admin').classList.toggle('hidden',  !isAdmin&&!isTeacher);
  document.getElementById('btn-admin').textContent = isTeacher ? 'Teacher Panel' : 'Admin';
  document.getElementById('user-label').textContent = show ? first+' '+last : '';
}
