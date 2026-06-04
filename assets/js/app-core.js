//  APP STATE
// ════════════════════════════════════════════════════════════════
var state = {
  config: null,          // firebase.json contents
  lessonIndex: null,     // lessons/index.json contents
  yearGroups: [],        // [{ id, label, lessons: [meta] }]
  allLessons: [],        // all loaded { meta, data } across all year groups
  currentYearGroup: null,// id of the active year group
  currentCourse:    null,// id of the active course within the year group
  lessons: [],           // filtered to currentYearGroup + currentCourse
  currentLessonIdx: 0,
  currentStepIdx: 0,
  isAdmin: false,
  isTeacher: false,
  teacherPermissions: null,
  teacherCode: null,
  db: null,
  uid: null,
  className: null,
  progress: {},
  stepStartTime: null,
  stepInjectedStyle: null,
  forcedQuizRef: null,
  forcedQuizListener: null,
  forcedQuizCode: null,
  forcedAssessmentRef: null,
  forcedAssessmentListener: null,
  forcedAssessmentCode: null,
  individualForcedApRef: null,
  individualForcedApListener: null,
  individualForcedApCode: null,
  quizClientId: (function(){
    try {
      var existing = sessionStorage.getItem('pylearn_quiz_client_id');
      if (existing) return existing;
      var id = Date.now() + '-' + Math.random().toString(36).slice(2);
      sessionStorage.setItem('pylearn_quiz_client_id', id);
      return id;
    } catch(e) {
      return Date.now() + '-' + Math.random().toString(36).slice(2);
    }
  })(),
  nameMap: (function(){ try { return JSON.parse(localStorage.getItem('pylearn_name_map')) || {}; } catch(e) { return {}; } })(),
};

// ── Utilities ────────────────────────────────────────────────
// ── Word bank for memorable codes ─────────────────────────────
var WORDS = {
  adjectives: [
    'Amber','Ancient','Arctic','Autumn','Azure','Bold','Brave','Bright','Breezy','Bronze',
    'Calm','Cheerful','Chill','Clever','Cloud','Cobalt','Comet','Cool','Copper','Coral',
    'Cosmic','Cozy','Crisp','Crimson','Crystal','Curious','Daring','Dark','Dawn','Deep',
    'Dusty','Emerald','Epic','Faded','Fearless','Fiery','Fizzy','Fluffy','Forest','Frosty',
    'Frozen','Gentle','Giant','Glowing','Gold','Golden','Grand','Green','Happy','Hidden',
    'Icy','Indigo','Jade','Jolly','Jumpy','Keen','Kind','Large','Lavender','Lemon',
    'Light','Lunar','Lush','Majestic','Marble','Midnight','Mighty','Mint','Misty','Moody',
    'Mystic','Neon','Noble','Olive','Orange','Peachy','Pink','Plum','Polar','Purple',
    'Quiet','Quick','Radiant','Rapid','Regal','River','Rocky','Rose','Royal','Ruby',
    'Rusty','Sandy','Sapphire','Secret','Shadow','Shiny','Silent','Silver','Sleepy','Slim',
    'Snowy','Solar','Speedy','Spring','Starry','Steel','Stone','Storm','Strange','Summer',
    'Sunny','Swift','Tall','Teal','Tiny','Topaz','Turquoise','Velvet','Vivid','Warm',
    'Wild','Windy','Winter','Wise','Yellow','Young','Zesty','Zippy','Brave','Calm',
    'Dashing','Eager','Famous','Grand','Heroic','Jolly','Lively','Lucky','Merry','Neat',
    'Proud','Quirky','Rare','Smart','Snappy','Trusty','Ultra','Vast','Witty','Zany'
  ],
  colours: [
    'Aqua','Azure','Beige','Black','Blue','Bronze','Brown','Coral','Cream','Crimson',
    'Cyan','Fuchsia','Gold','Green','Grey','Indigo','Ivory','Jade','Khaki','Lavender',
    'Lemon','Lilac','Lime','Magenta','Maroon','Mint','Navy','Olive','Orange','Peach',
    'Pink','Plum','Purple','Red','Rose','Ruby','Russet','Salmon','Sapphire','Scarlet',
    'Silver','Slate','Teal','Turquoise','Violet','White','Yellow','Amber','Apricot','Blush',
    'Bronze','Cerise','Chartreuse','Chocolate','Cinnamon','Cobalt','Denim','Emerald','Flax',
    'Flamingo','Glacier','Grape','Hazel','Honey','Lapis','Mango','Mauve','Mustard','Onyx',
    'Papaya','Periwinkle','Pine','Powder','Raspberry','Saffron','Sage','Sand','Sky','Snow',
    'Steel','Tangerine','Taupe','Terra','Thistle','Umber','Vanilla','Wisteria','Burgundy','Caramel'
  ],
  animals: [
    'Albatross','Alligator','Alpaca','Antelope','Armadillo','Axolotl','Badger','Bat','Bear',
    'Beaver','Bison','Bumblebee','Butterfly','Camel','Capybara','Chameleon','Cheetah','Chipmunk',
    'Cobra','Coyote','Crab','Crane','Crocodile','Dalmation','Deer','Dolphin','Donkey','Dragon',
    'Dragonfly','Duck','Eagle','Elephant','Falcon','Flamingo','Fox','Frog','Gazelle','Giraffe',
    'Gorilla','Hamster','Hedgehog','Hippo','Hummingbird','Iguana','Jaguar','Jellyfish','Kangaroo',
    'Koala','Lemur','Leopard','Lion','Lizard','Llama','Lobster','Lynx','Manatee','Meerkat',
    'Mongoose','Monkey','Moose','Narwhal','Octopus','Otter','Owl','Panda','Panther','Parrot',
    'Peacock','Pelican','Penguin','Platypus','Porcupine','Puffin','Rabbit','Raccoon','Raven',
    'Reindeer','Rhino','Salamander','Seahorse','Seal','Shark','Sloth','Snail','Sparrow',
    'Squirrel','Stingray','Swan','Tiger','Toucan','Turtle','Vulture','Walrus','Weasel',
    'Whale','Wolf','Wolverine','Wombat','Woodpecker','Yak','Zebra','Bison','Buffalo','Chimpanzee'
  ]
};

// Generate one candidate code: AdjectiveColourAnimal
function genCodeCandidate() {
  var adj    = WORDS.adjectives[Math.random() * WORDS.adjectives.length | 0];
  var colour = WORDS.colours[Math.random()    * WORDS.colours.length    | 0];
  var animal = WORDS.animals[Math.random()    * WORDS.animals.length    | 0];
  return adj + colour + animal;
}

// Generate `count` unique codes that don't clash with `existingSet` (a Set of strings).
// Falls back gracefully if the word bank is somehow exhausted.
function genUniqueCodes(count, existingSet) {
  var codes   = [];
  var used    = new Set(existingSet);
  var maxTries = count * 20;
  var tries    = 0;
  while (codes.length < count && tries < maxTries) {
    tries++;
    var c = genCodeCandidate();
    if (!used.has(c)) {
      used.add(c);
      codes.push(c);
    }
  }
  return codes;
}

function fmtMs(ms) {
  if (!ms || ms < 1000) return '< 1s';
  var s = Math.floor(ms/1000);
  if (s < 60) return s+'s';
  var m = Math.floor(s/60), rs = s%60;
  if (m < 60) return m+'m '+rs+'s';
  return Math.floor(m/60)+'h '+(m%60)+'m';
}

function getStepProgress(lid, sid) { return (state.progress[lid] && state.progress[lid][sid]) || {}; }
function isStepComplete(lid, sid)  { return !!getStepProgress(lid,sid).completed; }
function isStepStarted(lid, sid)   { var p = getStepProgress(lid,sid); return !!(p.started || p.startedAt); }
function isLessonComplete(lesson)  { return lesson.data.steps.every(function(s){ return isStepComplete(lesson.meta.id,s.id); }); }
function isLessonStarted(lesson)   { return lesson.data.steps.some(function(s){  return isStepStarted(lesson.meta.id,s.id);  }); }

// ── localStorage progress helpers ─────────────────────────────
// Local progress is stored independently of login, keyed by a device key.
// Key: 'pylearn_progress' → { lessonId: { stepId: { started, completed } } }
// Note: time tracking (totalMs, startedAt) is only stored in Firebase (needs login).
// Local storage only tracks started (boolean) and completed (boolean) for colour coding.

function localProgressKey() {
  return 'pylearn_progress';
}

function readLocalProgress() {
  try {
    var raw = localStorage.getItem(localProgressKey());
    return raw ? JSON.parse(raw) : {};
  } catch(e) { return {}; }
}

function writeLocalProgress(progress) {
  try {
    // Only persist started/completed booleans — strip timestamps/time data to save space
    var slim = {};
    Object.keys(progress).forEach(function(lid) {
      slim[lid] = {};
      Object.keys(progress[lid]).forEach(function(sid) {
        var s = progress[lid][sid];
        slim[lid][sid] = {};
        if (s.startedAt || s.started) slim[lid][sid].started = true;
        if (s.completed) slim[lid][sid].completed = true;
      });
    });
    localStorage.setItem(localProgressKey(), JSON.stringify(slim));
  } catch(e) {}
}

// Merge Firebase progress into state.progress, then persist locally.
// Firebase is the source of truth for completed — once complete, always complete.
function mergeFirebaseProgress(firebaseProgress) {
  Object.keys(firebaseProgress).forEach(function(lid) {
    if (!state.progress[lid]) state.progress[lid] = {};
    Object.keys(firebaseProgress[lid]).forEach(function(sid) {
      var fb = firebaseProgress[lid][sid];
      var local = state.progress[lid][sid] || {};
      state.progress[lid][sid] = Object.assign({}, local, fb);
    });
  });
  writeLocalProgress(state.progress);
}

// ── Firebase helpers ─────────────────────────────────────────
function progressRef(lid, sid) { return state.db.ref('progress/'+state.uid+'/'+lid+'/'+sid); }

async function loadProgress() {
  // Always load local progress first — instant, no network needed
  state.progress = readLocalProgress();
  renderLessonTabs();
  renderStepBar();

  // If logged in, also fetch Firebase and merge (Firebase wins on conflicts)
  if (!state.uid) return;
  try {
    var snap = await state.db.ref('progress/'+state.uid).get();
    if (snap.exists()) {
      mergeFirebaseProgress(snap.val());
      renderLessonTabs();
      renderStepBar();
    }
  } catch(e) { console.warn('Could not load Firebase progress:', e); }
}

async function markStepStarted(lid, sid) {
  if (getStepProgress(lid,sid).startedAt || getStepProgress(lid,sid).started) return;
  var now = Date.now();
  if (!state.progress[lid]) state.progress[lid] = {};
  if (!state.progress[lid][sid]) state.progress[lid][sid] = {};
  state.progress[lid][sid].started = true;
  state.progress[lid][sid].startedAt = now;
  writeLocalProgress(state.progress);

  // Also write to Firebase if logged in
  if (state.uid) {
    state.stepStartTime = now;
    progressRef(lid,sid).update({ startedAt: now }).catch(function(){});
  }
}

async function saveStepTime() {
  var lesson = state.lessons[state.currentLessonIdx];
  var step   = lesson.data.steps[state.currentStepIdx];
  if (!state.uid || !state.stepStartTime) return;
  var elapsed  = Date.now() - state.stepStartTime;
  state.stepStartTime = null;
  var existing = getStepProgress(lesson.meta.id, step.id).totalMs || 0;
  var newTotal = existing + elapsed;
  if (!state.progress[lesson.meta.id]) state.progress[lesson.meta.id] = {};
  if (!state.progress[lesson.meta.id][step.id]) state.progress[lesson.meta.id][step.id] = {};
  state.progress[lesson.meta.id][step.id].totalMs = newTotal;
  progressRef(lesson.meta.id, step.id).update({ totalMs: newTotal }).catch(function(){});
}

async function markStepComplete(lid, sid) {
  if (!state.progress[lid]) state.progress[lid] = {};
  if (!state.progress[lid][sid]) state.progress[lid][sid] = {};
  state.progress[lid][sid].completed = true;
  state.progress[lid][sid].started   = true;
  writeLocalProgress(state.progress);

  // Also write to Firebase if logged in
  if (state.uid) {
    progressRef(lid,sid).update({ completed: true }).catch(function(){});
  }
  renderStepBar();
  renderLessonTabs();
}

// ── Load app data ─────────────────────────────────────────────
// Lesson/config JSON is fetched with revalidation so edits are always picked up
// (browsers otherwise serve a stale cached copy, breaking updated lesson code).
var NOCACHE = { cache: 'no-cache' };

async function loadApp() {
  // Fetch firebase config and lesson index in parallel
  var results = await Promise.all([
    fetch('config/firebase.json', NOCACHE).then(function(r) { return r.json(); }),
    fetch('lessons/index.json', NOCACHE).then(function(r) { return r.json(); }),
  ]);
  state.config      = results[0];  // { firebase, adminCode }
  state.lessonIndex = results[1];  // { yearGroups: [...] }
  state.yearGroups  = state.lessonIndex.yearGroups;

  // Init Firebase
  firebase.initializeApp(state.config.firebase);
  state.db   = firebase.database();
  state.auth = firebase.auth();

  // Sign in anonymously — required for Firebase rules (auth != null).
  // We wait for the auth state to confirm before continuing so no writes
  // happen before the session is established.
  await new Promise(function(resolve) {
    var unsubscribe = state.auth.onAuthStateChanged(function(user) {
      if (user) {
        unsubscribe();
        resolve();
      }
    });
    state.auth.signInAnonymously().catch(function(e) {
      console.error('Firebase anonymous sign-in failed:', e.code, e.message);
      unsubscribe();
      resolve(); // continue anyway — local progress will still work
    });
  });

  // Load ALL lesson files across all year groups and courses up front
  var lessonFilesNeeded = [];
  state.yearGroups.forEach(function(yg) {
    (yg.courses || []).forEach(function(course) {
      course.lessons.forEach(function(meta) {
        meta.yearGroupId = yg.id;
        meta.courseId    = course.id;
        meta.yearLabel   = yg.label || yg.id;
        meta.courseLabel = course.label || course.id;
        lessonFilesNeeded.push(meta);
      });
    });
  });

  // Deduplicate by file path in case two year groups share a lesson file
  var seenFiles = {};
  var uniqueFiles = lessonFilesNeeded.filter(function(meta) {
    if (seenFiles[meta.file]) return false;
    seenFiles[meta.file] = true;
    return true;
  });

  var fetchedData = await Promise.all(
    uniqueFiles.map(function(meta) { return fetch(meta.file, NOCACHE).then(function(r) { return r.json(); }); })
  );

  var fileDataMap = {};
  uniqueFiles.forEach(function(meta, i) { fileDataMap[meta.file] = fetchedData[i]; });

  // Build allLessons
  lessonFilesNeeded.forEach(function(meta) {
    state.allLessons.push({ meta: meta, data: fileDataMap[meta.file] });
  });

  // Build year group selector
  var ygSelect = document.getElementById('year-group-select');
  ygSelect.innerHTML = '';
  state.yearGroups.forEach(function(yg) {
    var opt = document.createElement('option');
    opt.value = yg.id;
    opt.textContent = yg.label;
    ygSelect.appendChild(opt);
  });

  // Restore from URL hash first, then localStorage, then default to first
  var _urlHash = parseUrlHash();
  var savedYG = localStorage.getItem('pylearn_year_group');
  var initialYG = (_urlHash && state.yearGroups.find(function(y){ return y.id === _urlHash.yearGroupId; }))
    ? _urlHash.yearGroupId
    : (savedYG && state.yearGroups.find(function(y){ return y.id === savedYG; }))
      ? savedYG
      : state.yearGroups[0].id;

  ygSelect.value = initialYG;
  ygSelect.onchange = function() {
    saveStepTime();
    applyYearGroup(ygSelect.value);
  };

  document.getElementById('loading-screen').classList.add('hidden');
  document.getElementById('app-content').classList.remove('hidden');

  // Load local progress immediately so step colours are correct from first render
  state.progress = readLocalProgress();

  applyYearGroup(initialYG);
  setupAuthUI();
}

// Switch year group: repopulate course dropdown then apply the saved/default course
function applyYearGroup(ygId) {
  localStorage.setItem('pylearn_year_group', ygId);
  state.currentYearGroup = ygId;

  var yg = state.yearGroups.find(function(y){ return y.id === ygId; });
  var courses = (yg && yg.courses) || [];

  var courseSelect = document.getElementById('course-select');
  courseSelect.innerHTML = '';
  courses.forEach(function(c) {
    var opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.label;
    courseSelect.appendChild(opt);
  });

  courseSelect.classList.toggle('hidden', courses.length === 0);

  var _hashForCourse = parseUrlHash();
  var savedCourse = localStorage.getItem('pylearn_course_' + ygId);
  var initialCourse = (_hashForCourse && _hashForCourse.yearGroupId === ygId && courses.find(function(c){ return c.id === _hashForCourse.courseId; }))
    ? _hashForCourse.courseId
    : (savedCourse && courses.find(function(c){ return c.id === savedCourse; }))
      ? savedCourse
      : (courses[0] ? courses[0].id : null);

  courseSelect.value = initialCourse;
  courseSelect.onchange = function() {
    saveStepTime();
    applyCourse(courseSelect.value);
  };

  applyCourse(initialCourse);
}

// Switch course: filter lessons to year group + course, reset navigation
function applyCourse(courseId) {
  if (!courseId) return;
  localStorage.setItem('pylearn_course_' + state.currentYearGroup, courseId);
  state.currentCourse = courseId;

  state.lessons = state.allLessons.filter(function(l) {
    return l.meta.yearGroupId === state.currentYearGroup && l.meta.courseId === courseId;
  });

  state.currentLessonIdx = 0;
  state.currentStepIdx   = 0;

  renderLessonTabs();
  if (state.lessons.length > 0) {
    // If the URL hash points into this exact course, restore that position.
    // Otherwise load from the beginning.
    var _hash = parseUrlHash();
    if (_hash && _hash.yearGroupId === state.currentYearGroup && _hash.courseId === courseId) {
      applyHashToCurrentCourse(_hash);
    } else {
      loadStep(0, 0);
    }
  }
}

// ── Render ────────────────────────────────────────────────────
function renderLessonTabs() {
  var container = document.getElementById('lesson-tabs');
  container.innerHTML = '';
  state.lessons.forEach(function(lesson, idx) {
    var complete = isLessonComplete(lesson);
    var started  = isLessonStarted(lesson);
    var active   = idx === state.currentLessonIdx;
    var btn = document.createElement('button');
    var _tabBase = complete  ? 'border-green-400 bg-green-50 text-green-700 hover:bg-green-100' :
                   started   ? 'border-yellow-400 bg-yellow-50 text-yellow-700 hover:bg-yellow-100' :
                               'border-gray-200 bg-white text-gray-600 hover:bg-gray-50';
    btn.className = 'lesson-tab px-3 py-1 rounded text-sm whitespace-nowrap border ' + _tabBase +
                    (active ? ' ring-2 ring-red-700 ring-offset-1 font-semibold' : '');
    btn.textContent = lesson.data.title;
    btn.onclick = function() { saveStepTime(); loadLesson(idx); };
    container.appendChild(btn);
  });
}

function renderStepBar() {
  var container = document.getElementById('step-bar');
  container.innerHTML = '';
  var lesson = state.lessons[state.currentLessonIdx];
  lesson.data.steps.forEach(function(step, idx) {
    var complete = isStepComplete(lesson.meta.id, step.id);
    var started  = isStepStarted(lesson.meta.id, step.id);
    var active   = idx === state.currentStepIdx;
    var btn = document.createElement('button');
    var _pillBase = complete  ? 'border-green-400 bg-green-100 text-green-700 hover:bg-green-200' :
                    started   ? 'border-yellow-400 bg-yellow-100 text-yellow-700 hover:bg-yellow-200' :
                                'border-gray-200 bg-white text-gray-500 hover:bg-gray-50';
    btn.className = 'step-pill px-3 py-1 rounded text-xs border whitespace-nowrap ' + _pillBase +
                    (active ? ' ring-2 ring-red-700 ring-offset-1 font-semibold' : '');
    btn.textContent = step.title;
    btn.onclick = function() { saveStepTime(); loadStep(state.currentLessonIdx, idx); };
    container.appendChild(btn);
  });
}

// ── Load lesson / step ────────────────────────────────────────
function loadLesson(idx) {
  state.currentLessonIdx = idx;
  state.currentStepIdx   = 0;
  renderLessonTabs();
  loadStep(idx, 0);
}

// ── URL hash routing ─────────────────────────────────────────────────────────
// Format: #yearGroupId/courseId/lessonId/stepId
// e.g.   #year7/scratch/year7-scratch-basics/build-1
function updateUrlHash() {
  if (!state.currentYearGroup || !state.currentCourse || !state.lessons.length) return;
  var lesson = state.lessons[state.currentLessonIdx];
  var step   = lesson && lesson.data.steps[state.currentStepIdx];
  if (!lesson || !step) return;
  var hash = '#' + [
    state.currentYearGroup,
    state.currentCourse,
    lesson.meta.id,
    step.id
  ].join('/');
  if (window.location.hash !== hash) {
    history.pushState(null, '', hash);
  }
}

// Handle browser back/forward — re-navigate to whatever hash the browser restored.
window.addEventListener('popstate', function() {
  var parsed = parseUrlHash();
  if (!parsed) return;
  // Year group changed — rebuild everything from the top
  if (parsed.yearGroupId !== state.currentYearGroup) {
    var ygSelect = document.getElementById('year-group-select');
    if (ygSelect) ygSelect.value = parsed.yearGroupId;
    applyYearGroup(parsed.yearGroupId);
    return;
  }
  // Course changed — rebuild lessons list
  if (parsed.courseId !== state.currentCourse) {
    var cSelect = document.getElementById('course-select');
    if (cSelect) cSelect.value = parsed.courseId;
    applyCourse(parsed.courseId);
    return;
  }
  // Same year group + course — just jump to the right lesson/step
  applyHashToCurrentCourse(parsed);
});

function parseUrlHash() {
  var hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  var parts = hash.split('/');
  if (parts.length < 4) return null;
  return { yearGroupId: parts[0], courseId: parts[1], lessonId: parts[2], stepId: parts[3] };
}

// Apply a parsed hash to navigate to the right lesson/step.
// Call after applyCourse has filtered state.lessons.
function applyHashToCurrentCourse(parsed) {
  if (!parsed) return;
  var lessonIdx = -1;
  for (var i = 0; i < state.lessons.length; i++) {
    if (state.lessons[i].meta.id === parsed.lessonId) { lessonIdx = i; break; }
  }
  if (lessonIdx === -1) return;
  var steps = state.lessons[lessonIdx].data.steps || [];
  var stepIdx = 0;
  for (var j = 0; j < steps.length; j++) {
    if (steps[j].id === parsed.stepId) { stepIdx = j; break; }
  }
  loadStep(lessonIdx, stepIdx);
}

async function loadStep(lessonIdx, stepIdx) {
  state.currentLessonIdx = lessonIdx;
  state.currentStepIdx   = stepIdx;
  renderStepBar();

  var lesson = state.lessons[lessonIdx];
  var step   = lesson.data.steps[stepIdx];

  // Step CSS
  if (state.stepInjectedStyle) state.stepInjectedStyle.remove();
  if (step.css) {
    var styleEl = document.createElement('style');
    styleEl.textContent = step.css;
    document.head.appendChild(styleEl);
    state.stepInjectedStyle = styleEl;
  } else {
    state.stepInjectedStyle = null;
  }

  // Content
  document.getElementById('step-content').innerHTML = step.content;
  if (window.scratchblocks) {
    try { scratchblocks.renderMatching('pre.scratch-blocks', { style: 'scratch3' }); } catch(e) { console.warn('[scratchblocks renderMatching]', e); }
  } else {
    console.warn('[scratchblocks] library not loaded — blocks will show as plain text');
  }

  // Expose current location so createEditor can build a stable storage key
  window.__pylearnCurrentLessonId = lesson.meta.id;
  window.__pylearnCurrentStepId   = step.id;

  // Reset per-step flags used by the Next button
  // __pylearnStepHasEditor — set to true by createEditor on mount
  // __pylearnStepRan       — set to true when the Run button is clicked
  window.__pylearnStepHasEditor = false;
  window.__pylearnStepRan       = false;

  // Nav
  var total = lesson.data.steps.length;
  document.getElementById('step-counter').textContent = 'Step '+(stepIdx+1)+' of '+total;
  document.getElementById('btn-prev').disabled = stepIdx === 0;
  document.getElementById('btn-next').disabled = false;
  document.getElementById('btn-next').textContent = stepIdx === total-1 ? 'Finish \u2713' : 'Next Step \u2192';
  document.getElementById('btn-next').className = 'jhncc-primary px-4 py-1.5 rounded text-sm disabled:opacity-40';

  // Mark step as started (always, for local progress colours)
  // Time tracking (stepStartTime) is set inside markStepStarted only when uid is set
  markStepStarted(lesson.meta.id, step.id);

  // API available to step JS
  window.__markStepComplete = async function() {
    await saveStepTime();
    await markStepComplete(lesson.meta.id, step.id);
  };

  // TurboWarp lesson-step loading state
  // Clear any previous poll so navigating quickly doesn't leave stale timers
  if (window._y7LoadPoll) { clearInterval(window._y7LoadPoll); window._y7LoadPoll = null; }
  if (window._y7LoadTimeout) { clearTimeout(window._y7LoadTimeout); window._y7LoadTimeout = null; }
  var _y7iframe = document.getElementById('y7-scratch-frame');
  var __twLoadKey = lesson.meta.id + '::' + step.id;
  if (_y7iframe) {
    var _y7checkBtn = document.getElementById('y7-check-btn');
    var _y7resultEl = document.getElementById('y7-check-result');
    var _y7originalText = _y7checkBtn ? _y7checkBtn.textContent : 'Check My Work';
    if (_y7checkBtn) { _y7checkBtn.disabled = true; _y7checkBtn.textContent = 'Loading editor…'; }
    var __twHasSaved = !!sessionStorage.getItem('y7proj_' + __twLoadKey);
    if (_y7resultEl) { _y7resultEl.style.color = '#94a3b8'; _y7resultEl.textContent = __twHasSaved ? 'Restoring your project…' : 'TurboWarp is loading — this can take up to 30 seconds on first use.'; }
    function _y7isVmReady() {
      try { var f = document.getElementById('y7-scratch-frame'); return !!(f && f.contentWindow && f.contentWindow.vm && f.contentWindow.vm.runtime && f.contentWindow.vm.runtime.targets); } catch(e) { return false; }
    }
    function _y7onReady() {
      if (window._y7LoadPoll) { clearInterval(window._y7LoadPoll); window._y7LoadPoll = null; }
      if (window._y7LoadTimeout) { clearTimeout(window._y7LoadTimeout); window._y7LoadTimeout = null; }
      var btn = document.getElementById('y7-check-btn');
      var res = document.getElementById('y7-check-result');
      if (btn && btn.disabled) { btn.disabled = false; btn.textContent = _y7originalText; }
      if (res && res.textContent.indexOf('TurboWarp') === 0 || res && res.textContent.indexOf('Restoring') === 0) { res.style.color = ''; res.textContent = ''; }
      // ── Restore saved project ───────────────────────────────
      var __saved = sessionStorage.getItem('y7proj_' + __twLoadKey);
      if (__saved) {
        try {
          var __bin = atob(__saved);
          var __arr = new Uint8Array(__bin.length);
          for (var __j = 0; __j < __bin.length; __j++) __arr[__j] = __bin.charCodeAt(__j);
          var __lf = document.getElementById('y7-scratch-frame');
          if (__lf && __lf.contentWindow && __lf.contentWindow.vm) {
            __lf.contentWindow.vm.loadProject(__arr.buffer).catch(function(){});
          }
        } catch(__ex) {}
      }
    }
    window._y7LoadPoll = setInterval(function() {
      if (!document.getElementById('y7-scratch-frame')) { if (window._y7LoadPoll) clearInterval(window._y7LoadPoll); return; }
      if (_y7isVmReady()) _y7onReady();
    }, 400);
    window._y7LoadTimeout = setTimeout(function() {
      if (window._y7LoadPoll) { clearInterval(window._y7LoadPoll); window._y7LoadPoll = null; }
      var btn = document.getElementById('y7-check-btn');
      var res = document.getElementById('y7-check-result');
      if (btn && btn.disabled) { btn.disabled = false; btn.textContent = _y7originalText; }
      if (res && res.textContent.indexOf('TurboWarp') === 0) { res.style.color = '#fca5a5'; res.textContent = 'Editor is taking a long time — try refreshing the page.'; }
    }, 45000);
  }

  // Step JS
  if (step.js) {
    setTimeout(function() {
      try { eval(step.js); } catch(e) { console.error('Step JS error:', e); }
    }, 50);
  }

  // Update URL hash so the page is bookmarkable / auto-restores on reload
  updateUrlHash();
}

// ── Navigation ────────────────────────────────────────────────
document.getElementById('btn-prev').onclick = async function() {
  await saveStepTime();
  if (state.currentStepIdx > 0) loadStep(state.currentLessonIdx, state.currentStepIdx-1);
};

function flashButton(btn, text, addCls, removeCls) {
  var orig = btn.textContent;
  btn.textContent = text;
  (removeCls || []).forEach(function(c) { btn.classList.remove(c); });
  (addCls || []).forEach(function(c) { btn.classList.add(c); });
  setTimeout(function() {
    btn.textContent = orig;
    (addCls || []).forEach(function(c) { btn.classList.remove(c); });
    (removeCls || []).forEach(function(c) { btn.classList.add(c); });
  }, 1800);
}

document.getElementById('btn-next').onclick = async function() {
  var lesson    = state.lessons[state.currentLessonIdx];
  var step      = lesson.data.steps[state.currentStepIdx];
  var total     = lesson.data.steps.length;
  var isLast    = state.currentStepIdx === total - 1;
  var nextBtn   = this;
  await saveStepTime();

  if (step.autoComplete === false) {
    // Step requires manual completion \u2014 block if not done
    if (!isStepComplete(lesson.meta.id, step.id)) {
      flashButton(nextBtn, 'Complete the task first! \u26A0', ['bg-orange-500'], ['jhncc-primary']);
      return;
    }
  } else {
    // Auto-complete step \u2014 nudge if editor not run
    if (window.__pylearnStepHasEditor && !window.__pylearnStepRan) {
      flashButton(nextBtn, 'Try the code first! \u25B6', ['bg-yellow-500'], ['jhncc-primary']);
      return;
    }
    await markStepComplete(lesson.meta.id, step.id);
  }

  if (isLast) {
    var nextLessonIdx = state.currentLessonIdx + 1;
    if (nextLessonIdx < state.lessons.length) {
      flashButton(nextBtn, 'Moving to next lesson\u2026', ['bg-green-600'], ['jhncc-primary']);
      setTimeout(function() { loadLesson(nextLessonIdx); }, 900);
    } else {
      flashButton(nextBtn, 'All lessons complete! \uD83C\uDF89', ['bg-green-600'], ['jhncc-primary']);
    }
  } else {
    loadStep(state.currentLessonIdx, state.currentStepIdx + 1);
  }
};

// ── MCQ helpers ───────────────────────────────────────────────
function renderMCQOption(btn, option) {
  var isScratch = option && typeof option === 'object' && typeof option.scratch === 'string';
  var text = isScratch ? option.scratch : String(option == null ? '' : option);
  btn.innerHTML = '';
  if (isScratch && window.scratchblocks) {
    try {
      var script = scratchblocks.parse(text, { style: 'scratch3' });
      var svg = scratchblocks.render(script, { style: 'scratch3' });
      var natW = parseFloat(svg.getAttribute('width')) || 220;
      var natH = parseFloat(svg.getAttribute('height')) || 60;
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.style.display = 'block';
      svg.style.width = '100%';
      svg.style.height = 'auto';
      svg.style.maxWidth = natW + 'px';
      svg.style.aspectRatio = (natW / natH).toFixed(4);
      svg.style.pointerEvents = 'none';
      svg.style.margin = '0 auto';
      btn.style.paddingTop = '0.75rem';
      btn.style.paddingBottom = '0.75rem';
      btn.style.whiteSpace = '';
      btn.appendChild(svg);
      return;
    } catch(e) {
      console.warn('[createMCQ scratch option]', e);
    }
  }
  btn.style.paddingTop = '';
  btn.style.paddingBottom = '';
  btn.style.whiteSpace = isScratch ? 'pre-wrap' : '';
  btn.textContent = text;
}

function createMCQ(containerId, opts, correctIdx, rightMsg, wrongMsg) {
  var c = document.getElementById(containerId);
  if (!c) return;
  c.innerHTML = '';
  opts.forEach(function(o, i) {
    var btn = document.createElement('button');
    btn.className = 'ex-mcq-btn';
    btn.dataset.i = i;
    renderMCQOption(btn, o);
    c.appendChild(btn);
  });
  var feedback = document.createElement('div');
  feedback.className = 'ex-feedback';
  feedback.id = containerId + '-fb';
  c.appendChild(feedback);
  c.querySelectorAll('.ex-mcq-btn').forEach(function(btn) {
    btn.onclick = function() {
      var i = parseInt(this.dataset.i);
      var fb = document.getElementById(containerId + '-fb');
      if (i === correctIdx) {
        c.querySelectorAll('.ex-mcq-btn').forEach(function(b) { b.disabled = true; });
        this.classList.add('ex-mcq-correct');
        fb.className = 'ex-feedback ok';
        fb.textContent = rightMsg || 'Correct!';
        if (window.__markStepComplete) __markStepComplete();
      } else {
        this.classList.add('ex-mcq-wrong');
        fb.className = 'ex-feedback err';
        fb.textContent = wrongMsg || 'Not quite — try again.';
        var self = this;
        setTimeout(function() { self.classList.remove('ex-mcq-wrong'); self.disabled = false; fb.textContent = ''; fb.className = 'ex-feedback'; }, 1500);
      }
    };
  });
}

function createMCQSet(containerId, questions) {
  var c = document.getElementById(containerId);
  if (!c) return;
  var idx = 0, score = 0;
  function show() {
    if (idx >= questions.length) {
      c.innerHTML = '<p class="ex-score">All done — ' + score + ' / ' + questions.length + ' correct.</p>';
      if (window.__markStepComplete) __markStepComplete();
      return;
    }
    var q = questions[idx];
    c.innerHTML = '';
    var progress = document.createElement('p');
    progress.className = 'ex-progress';
    progress.textContent = 'Question ' + (idx + 1) + ' of ' + questions.length;
    c.appendChild(progress);

    var prompt = document.createElement('p');
    prompt.className = 'ex-prompt';
    prompt.style.fontWeight = '600';
    prompt.style.marginBottom = '0.5rem';
    prompt.textContent = q.q || '';
    c.appendChild(prompt);

    if (q.html) {
      var htmlWrap = document.createElement('div');
      htmlWrap.innerHTML = q.html;
      c.appendChild(htmlWrap);
      if (window.scratchblocks) {
        try { scratchblocks.renderMatching('pre.scratch-blocks', { style: 'scratch3' }); } catch(e) { console.warn('[scratchblocks renderMatching]', e); }
      }
    }

    (q.opts || q.options || []).forEach(function(o, i) {
      var btn = document.createElement('button');
      btn.className = 'ex-mcq-btn';
      btn.dataset.i = i;
      renderMCQOption(btn, o);
      c.appendChild(btn);
    });

    var feedback = document.createElement('div');
    feedback.className = 'ex-feedback';
    feedback.id = containerId + '-fb';
    c.appendChild(feedback);
    c.querySelectorAll('.ex-mcq-btn').forEach(function(btn) {
      btn.onclick = function() {
        var i = parseInt(this.dataset.i);
        var fb = document.getElementById(containerId + '-fb');
        c.querySelectorAll('.ex-mcq-btn').forEach(function(b) { b.disabled = true; });
        var options = q.opts || q.options || [];
        var correct = q.correct;
        if (correct == null && typeof q.answer === 'number') correct = q.answer;
        if (correct == null && q.answer != null) {
          correct = options.findIndex(function(option) {
            var value = option && typeof option === 'object' && typeof option.scratch === 'string' ? option.scratch : option;
            return value === q.answer;
          });
        }
        if (i === correct) {
          score++;
          this.classList.add('ex-mcq-correct');
          fb.className = 'ex-feedback ok';
          fb.textContent = q.feedback || q.right || 'Correct!';
        } else {
          this.classList.add('ex-mcq-wrong');
          if (correct >= 0 && c.querySelectorAll('.ex-mcq-btn')[correct]) c.querySelectorAll('.ex-mcq-btn')[correct].classList.add('ex-mcq-correct');
          fb.className = 'ex-feedback err';
          fb.textContent = q.wrongFeedback || q.wrong || 'Not quite.';
        }
        setTimeout(function() { idx++; show(); }, 1800);
      };
    });
  }
  show();
}
