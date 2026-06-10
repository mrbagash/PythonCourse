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
  OSyDoCzzush3n94fDG6tyvzDsf93: true,
  V3q0I1cfjjOrVSJJNZHHbdt4tsB3: true,
  khyouF8tPkNJlbI9OpfvEFFXY543: true
};

var GOOGLE_STUDENT_SHEET_NAME = 'Classroom Student Codes';
var googleStudentTokenClient = null;
var googleStudentAccessToken = null;

function getGoogleStudentScopes() {
  return [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/drive.metadata.readonly',
    'https://www.googleapis.com/auth/spreadsheets.readonly'
  ].join(' ');
}

function requestGoogleStudentToken() {
  return new Promise(function(resolve, reject) {
    var clientId = state.config && state.config.googleClientId;
    if (!clientId) {
      reject(new Error('Google login is not configured yet.'));
      return;
    }
    if (!window.google || !google.accounts || !google.accounts.oauth2) {
      reject(new Error('Google sign-in has not finished loading. Please try again in a moment.'));
      return;
    }
    googleStudentTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: getGoogleStudentScopes(),
      prompt: 'select_account',
      callback: function(response) {
        if (!response || response.error) {
          reject(new Error((response && response.error_description) || 'Google sign-in was cancelled or failed.'));
          return;
        }
        googleStudentAccessToken = response.access_token;
        resolve(response.access_token);
      }
    });
    googleStudentTokenClient.requestAccessToken();
  });
}

async function googleStudentApiRequest(url, options) {
  if (!googleStudentAccessToken) throw new Error('Google access token is missing.');
  var response = await fetch(url, Object.assign({}, options || {}, {
    headers: Object.assign({}, (options && options.headers) || {}, {
      Authorization: 'Bearer ' + googleStudentAccessToken
    })
  }));
  var body = await response.json().catch(function() { return {}; });
  if (!response.ok) {
    var msg = body && body.error && (body.error.message || body.error.status);
    throw new Error(msg || response.statusText || 'Google request failed.');
  }
  return body;
}

function quoteGoogleSheetName(title) {
  return "'" + String(title || '').replace(/'/g, "''") + "'";
}

function authEscapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function getGoogleStudentEmail() {
  var profile = await googleStudentApiRequest('https://www.googleapis.com/oauth2/v3/userinfo');
  if (!profile || !profile.email) throw new Error('Google did not return an email address.');
  return String(profile.email).trim().toLowerCase();
}

async function findGoogleCodeSpreadsheet() {
  var folderId = state.config && state.config.driveFolderId;
  if (!folderId) throw new Error('No Drive folder ID is configured for student code lookup.');
  var sheetName = (state.config && state.config.googleStudentSpreadsheetName) || GOOGLE_STUDENT_SHEET_NAME;
  var escapedName = sheetName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  var query = [
    "'" + folderId + "' in parents",
    "mimeType='application/vnd.google-apps.spreadsheet'",
    "name='" + escapedName + "'",
    "trashed=false"
  ].join(' and ');
  var params = new URLSearchParams({
    q: query,
    fields: 'files(id,name)',
    pageSize: '10',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true'
  });
  var result = await googleStudentApiRequest('https://www.googleapis.com/drive/v3/files?' + params.toString());
  return (result.files || [])[0] || null;
}

function parseGoogleLookupName(rawName) {
  var name = String(rawName || '').trim().replace(/\s+/g, ' ');
  if (!name) return { firstName: '', lastName: '', displayName: '' };
  if (name.indexOf(',') !== -1) {
    var parts = name.split(',');
    var last = parts.shift().trim();
    var first = parts.join(',').trim();
    return {
      firstName: first,
      lastName: last,
      displayName: (first + ' ' + last).trim() || name
    };
  }
  var words = name.split(' ');
  return {
    firstName: words[0] || '',
    lastName: words.slice(1).join(' '),
    displayName: name
  };
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function googleLookupHeaderIndexes(row) {
  var cols = {};
  (row || []).forEach(function(cell, idx) {
    var h = String(cell || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (h === 'email' || h === 'email address') cols.email = idx;
    if (h === 'first name' || h === 'firstname') cols.firstName = idx;
    if (h === 'last name' || h === 'surname' || h === 'lastname') cols.lastName = idx;
    if (h === 'name' || h === 'student name' || h === 'full name') cols.name = idx;
    if (h === 'code' || h === 'login code' || h === 'student code') cols.code = idx;
  });
  return cols;
}

function googleLookupRowToCandidate(row, className, cols) {
  var code = '';
  var firstName = '';
  var lastName = '';
  var displayName = '';
  if (cols && (cols.code != null || cols.email != null || cols.name != null || cols.firstName != null)) {
    code = cols.code != null ? String(row[cols.code] || '').trim() : '';
    firstName = cols.firstName != null ? String(row[cols.firstName] || '').trim() : '';
    lastName = cols.lastName != null ? String(row[cols.lastName] || '').trim() : '';
    if (cols.name != null) {
      var parsed = parseGoogleLookupName(row[cols.name]);
      firstName = firstName || parsed.firstName;
      lastName = lastName || parsed.lastName;
      displayName = parsed.displayName;
    }
  } else if (looksLikeEmail(row[0])) {
    code = String(row[3] || '').trim();
    firstName = String(row[1] || '').trim();
    lastName = String(row[2] || '').trim();
  } else {
    code = String(row[1] || '').trim();
    var oldName = parseGoogleLookupName(row[0]);
    firstName = oldName.firstName;
    lastName = oldName.lastName;
    displayName = oldName.displayName;
  }
  displayName = displayName || (firstName + ' ' + lastName).trim() || String(row[0] || '').trim() || code;
  if (!code || !displayName) return null;
  return {
    className: className,
    firstName: firstName,
    lastName: lastName,
    displayName: displayName,
    code: code
  };
}

async function findGoogleStudentCode(spreadsheetId, email) {
  var metadata = await googleStudentApiRequest(
    'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(spreadsheetId) + '?fields=sheets.properties'
  );
  var sheets = metadata.sheets || [];
  var candidates = [];
  var seenCandidateCodes = {};
  for (var i = 0; i < sheets.length; i++) {
    var title = sheets[i].properties && sheets[i].properties.title;
    if (!title) continue;
    var range = quoteGoogleSheetName(title) + '!A1:D500';
    var values = await googleStudentApiRequest(
      'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(spreadsheetId) + '/values/' + encodeURIComponent(range)
    );
    var rows = values.values || [];
    var cols = googleLookupHeaderIndexes(rows[0] || []);
    var hasHeader = cols.email != null || cols.name != null || cols.firstName != null || cols.code != null;
    for (var r = hasHeader ? 1 : 0; r < rows.length; r++) {
      var row = rows[r] || [];
      var rowEmail = cols.email != null ? row[cols.email] : row[0];
      if (String(rowEmail || '').trim().toLowerCase() === email) {
        var direct = googleLookupRowToCandidate(row, title, hasHeader ? cols : null);
        return {
          match: direct,
          candidates: candidates
        };
      }
      if (!looksLikeEmail(rowEmail)) {
        var candidate = googleLookupRowToCandidate(row, title, hasHeader ? cols : null);
        if (candidate && !seenCandidateCodes[candidate.code.toLowerCase()]) {
          seenCandidateCodes[candidate.code.toLowerCase()] = true;
          candidates.push(candidate);
        }
      }
    }
  }
  return { match: null, candidates: candidates };
}

async function completeStudentCodeLogin(first, last, code, preferredClass) {
  var foundCode = null;
  var foundClass = preferredClass || null;
  var idxSnap = await state.db.ref('codeIndex/' + code.toLowerCase()).get();
  if (idxSnap.exists()) {
    var idxData = idxSnap.val() || {};
    foundCode = idxData.storedCode || code;
    foundClass = idxData.className || foundClass;
  }
  if (!foundCode) throw new Error('Invalid code. Please ask your teacher.');

  var firebaseUid = state.auth && state.auth.currentUser && state.auth.currentUser.uid;
  localStorage.setItem('pylearn_name', JSON.stringify({ first: first, last: last }));
  localStorage.setItem('pylearn_code', foundCode);
  localStorage.removeItem('pylearn_auth_mode');
  localStorage.removeItem('pylearn_is_teacher');
  localStorage.removeItem('pylearn_teacher_perms');
  state.uid = foundCode;
  state.className = foundClass;
  state.isAdmin = false;
  state.isTeacher = false;
  if (firebaseUid) {
    await state.db.ref('studentSessions/' + firebaseUid).set({
      code: foundCode,
      codeLower: foundCode.toLowerCase(),
      className: foundClass || '',
      loggedInAt: Date.now()
    });
  }
  await loadProgress();
  renderLessonTabs();
  renderStepBar();
  updateAuthUI(first, last, false);
  logStudentAccess(foundCode, first + ' ' + last, foundClass);
  startForcedQuizWatcher(foundClass);
  startForcedAssessmentWatcher(foundClass);
  startIndividualForcedApWatcher(foundClass, foundCode);
  return { code: foundCode, className: foundClass };
}

function clearGoogleStudentCodePicker() {
  var picker = document.getElementById('google-student-code-picker');
  if (!picker) return;
  picker.classList.add('hidden');
  picker.innerHTML = '';
}

function chooseGoogleStudentCode(candidates, email) {
  return new Promise(function(resolve, reject) {
    var picker = document.getElementById('google-student-code-picker');
    if (!picker) {
      reject(new Error('No student code was found for ' + email + '. Please use your normal code or ask your teacher.'));
      return;
    }
    var sorted = (candidates || []).slice().sort(function(a, b) {
      return String(a.displayName || '').localeCompare(String(b.displayName || '')) ||
        String(a.className || '').localeCompare(String(b.className || '')) ||
        String(a.code || '').localeCompare(String(b.code || ''));
    });
    if (!sorted.length) {
      reject(new Error('No student code was found for ' + email + '. Please use your normal code or ask your teacher.'));
      return;
    }
    picker.classList.remove('hidden');
    picker.innerHTML =
      '<p class="text-xs font-semibold text-amber-900 mb-1">We could not match your Google email automatically.</p>' +
      '<p class="text-xs text-amber-800 mb-2">Select your name/code from the imported sheet, or cancel if it is not listed.</p>' +
      '<div class="max-h-56 overflow-y-auto border border-amber-200 rounded bg-white divide-y divide-amber-100">' +
      sorted.map(function(c, idx) {
        return '<button type="button" class="google-code-choice w-full text-left px-2 py-2 bg-white hover:bg-amber-50 text-xs text-gray-800" data-idx="' + idx + '">' +
          '<span class="font-semibold">' + authEscapeHtml(c.displayName || '-') + '</span>' +
          '<span class="block text-gray-500">' + authEscapeHtml(c.className || '-') + ' - ' + authEscapeHtml(c.code || '') + '</span>' +
          '</button>';
      }).join('') +
      '</div>' +
      '<button type="button" id="btn-google-code-not-here" class="mt-2 w-full py-1.5 rounded border border-amber-300 text-xs font-semibold text-amber-900 bg-white hover:bg-amber-100">My code is not here</button>';

    picker.querySelectorAll('.google-code-choice').forEach(function(btn) {
      btn.onclick = function() {
        clearGoogleStudentCodePicker();
        resolve(sorted[Number(btn.dataset.idx)]);
      };
    });
    var cancel = document.getElementById('btn-google-code-not-here');
    if (cancel) {
      cancel.onclick = function() {
        clearGoogleStudentCodePicker();
        reject(new Error('Google login cancelled. Please use your normal code or ask your teacher.'));
      };
    }
  });
}

async function signInGoogleStudent() {
  setLoginError('');
  clearGoogleStudentCodePicker();
  var button = document.getElementById('btn-google-student-login');
  var loginModal = document.getElementById('modal-login');
  try {
    if (button) { button.disabled = true; button.textContent = 'Opening Google…'; }
    // requestGoogleStudentToken opens a browser popup — keep login modal visible during this
    await requestGoogleStudentToken();
    // Token acquired — hide login modal and block the page with a spinner
    if (loginModal) loginModal.classList.add('hidden');
    showLoggingInModal('Finding your code…');
    var email = await getGoogleStudentEmail();
    var spreadsheet = await findGoogleCodeSpreadsheet();
    if (!spreadsheet) throw new Error('Could not find the classroom code spreadsheet in the configured Drive folder.');
    var lookup = await findGoogleStudentCode(spreadsheet.id, email);
    var match = lookup && lookup.match;
    if (!match) {
      // No automatic email match — show picker inside the login modal
      hideLoggingInModal();
      if (loginModal) loginModal.classList.remove('hidden');
      match = await chooseGoogleStudentCode((lookup && lookup.candidates) || [], email);
      // Candidate chosen — re-hide login modal and show spinner while we complete the login
      if (loginModal) loginModal.classList.add('hidden');
      showLoggingInModal('Logging in…');
    }
    if (!match.code) throw new Error('Your row was found, but the code cell is empty.');
    var first = match.firstName || 'Student';
    var last  = match.lastName  || '';
    await completeStudentCodeLogin(first, last, match.code, match.className);
    hideLoggingInModal();
    // login modal stays hidden on success
  } catch(e) {
    hideLoggingInModal();
    if (loginModal) loginModal.classList.remove('hidden');
    setLoginError(e && e.message ? e.message : 'Google student sign-in failed.');
  } finally {
    if (button) { button.disabled = false; button.textContent = 'Log In With Google'; }
  }
}

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
  var provider = new firebase.auth.GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/drive.metadata.readonly');
  provider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    var result = await state.auth.signInWithPopup(provider);
    if (result && result.credential && result.credential.accessToken && typeof classroomState !== 'undefined') {
      classroomState.token = result.credential.accessToken;
      classroomState.tokenScope = 'names';
    }
    await completeGoogleAdminLogin(result.user);
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
    document.getElementById('input-code').focus();
  };

  document.getElementById('btn-login-cancel').onclick = function() { modalLogin.classList.add('hidden'); };
  document.getElementById('btn-google-admin-login').onclick = signInGoogleAdmin;
  var studentGoogleBtn = document.getElementById('btn-google-student-login');
  if (studentGoogleBtn) studentGoogleBtn.onclick = signInGoogleStudent;

  // Allow pressing Enter in the code field to submit
  document.getElementById('input-code').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') document.getElementById('btn-login-submit').click();
  });

  document.getElementById('btn-login-submit').onclick = async function() {
    var code  = document.getElementById('input-code').value.trim();
    var errEl = document.getElementById('login-error');
    errEl.classList.add('hidden');

    if (!code) { errEl.textContent='Please enter your login code.'; errEl.classList.remove('hidden'); return; }

    var firebaseUid = state.auth && state.auth.currentUser && state.auth.currentUser.uid;
    // Teacher check must be completely isolated from the student path.
    // If the lookup throws (network error), we show an error rather than
    // silently falling through and logging a teacher in as a student.
    var teacherCheckResult = null; // 'found' | 'not-found' | 'error'
    try {
      var teacherSnap = await state.db.ref('teachers/' + code.toLowerCase()).get();
      if (teacherSnap.exists()) {
        teacherCheckResult = 'found';
        var td = teacherSnap.val();
        localStorage.setItem('pylearn_name', JSON.stringify({first:'',last:''}));
        localStorage.setItem('pylearn_code', code.toLowerCase());
        localStorage.setItem('pylearn_is_teacher', '1');
        localStorage.setItem('pylearn_teacher_perms', JSON.stringify(td.permissions || {}));
        localStorage.removeItem('pylearn_auth_mode');
        state.isAdmin=false; state.isTeacher=true;
        state.uid=code.toLowerCase(); state.teacherPermissions=td.permissions||{}; state.teacherCode=code.toLowerCase();
        if (firebaseUid) {
          try { await state.db.ref('teacherSessions/' + firebaseUid).set({ code: code.toLowerCase(), loggedInAt: Date.now() }); } catch(e) {}
        }
        modalLogin.classList.add('hidden');
        updateAuthUI('','',false,true);
        return;
      } else {
        teacherCheckResult = 'not-found';
      }
    } catch(e) {
      teacherCheckResult = 'error';
    }
    if (teacherCheckResult === 'error') {
      errEl.textContent = 'Error connecting. Please try again.';
      errEl.classList.remove('hidden');
      return;
    }
    try {
      // Try the fast code index first (single point-read — avoids downloading the full classes tree)
      await completeStudentCodeLogin('', '', code);
      modalLogin.classList.add('hidden');
      return;
    } catch(e) {
      errEl.textContent = e && e.message ? e.message : 'Error connecting. Please try again.';
      errEl.classList.remove('hidden');
    }
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
        if (firebaseUid) {
          state.db.ref('studentSessions/' + firebaseUid).set({
            code: savedCode,
            codeLower: savedCode.toLowerCase(),
            className: className || '',
            loggedInAt: Date.now()
          }).catch(function(){});
        }
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
  ref.update({ name: null, className: className || '', lastSeen: now }).catch(function() {});
  ref.child('days/' + dateKey).transaction(function(current) {
    if (!current) return { count: 1, last: now };
    return { count: (current.count || 0) + 1, last: now };
  }, null, false);
}

function showLoggingInModal(msg) {
  var el = document.getElementById('logging-in-text');
  if (el) el.textContent = msg || 'Logging in…';
  var modal = document.getElementById('modal-logging-in');
  if (modal) modal.classList.remove('hidden');
}

function hideLoggingInModal() {
  var modal = document.getElementById('modal-logging-in');
  if (modal) modal.classList.add('hidden');
}

function updateAuthUI(first, last, isAdmin, isTeacher) {
  var show = !!(state.uid);
  document.getElementById('btn-login').classList.toggle('hidden',  show);
  document.getElementById('btn-logout').classList.toggle('hidden', !show);
  document.getElementById('btn-report').classList.toggle('hidden', !show||isAdmin||isTeacher);
  document.getElementById('btn-ap-feedback').classList.toggle('hidden', !show||isAdmin||isTeacher);
  document.getElementById('btn-admin').classList.toggle('hidden',  !isAdmin&&!isTeacher);
  document.getElementById('btn-admin').textContent = isTeacher ? 'Teacher Panel' : 'Admin';
  var label = show ? ((first + ' ' + last).trim() || String(state.uid || '')) : '';
  document.getElementById('user-label').textContent = label;
}
