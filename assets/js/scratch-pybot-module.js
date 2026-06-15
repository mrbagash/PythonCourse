function scaleScratchQuizFrame() {
  var frame  = document.getElementById('qs-scratch-frame');
  var wrap   = document.getElementById('qs-scratch-wrap');
  var scroll = document.getElementById('qs-scratch-scroll');
  if (!frame || !wrap || !scroll) return;
  var NW = 1100, NH = 650;
  var checkBarEl = wrap.querySelector('.qs-scratch-checkbar');
  var checkBarH  = checkBarEl ? checkBarEl.offsetHeight : 44;
  var isFs = wrap.classList.contains('qs-scratch-fullscreen');
  var scale, availW;

  if (isFs) {
    availW = window.innerWidth;
    scale  = Math.min(1, availW / NW, (window.innerHeight - checkBarH) / NH);
  } else {
    var headerEl = document.querySelector('#quiz-student-screen > div:first-child');
    var qTextEl  = document.getElementById('qs-q-text');
    var headerH  = headerEl ? headerEl.offsetHeight       : 44;
    var qTextH   = qTextEl  ? qTextEl.offsetHeight + 40   : 80;
    var maxH     = Math.max(260, window.innerHeight - headerH - 42 - qTextH - checkBarH - 16);
    availW       = Math.max(320, window.innerWidth - 48);
    scale        = Math.min(1, availW / NW);
    scroll.style.maxHeight = Math.min(Math.ceil(NH * scale), maxH) + 'px';
    scroll.scrollLeft      = 0;
  }

  frame.style.width        = NW + 'px';
  frame.style.height       = NH + 'px';
  frame.style.transform    = 'scale(' + scale + ')';
  frame.style.marginBottom = Math.round(NH * (scale - 1)) + 'px';
  frame.style.marginLeft   = Math.max(0, Math.round((availW - NW * scale) / 2)) + 'px';
}

function toggleQsScratchFullscreen() {
  var wrap = document.getElementById('qs-scratch-wrap');
  var btn  = document.getElementById('btn-qs-scratch-fs');
  var isFs = wrap.classList.toggle('qs-scratch-fullscreen');
  btn.textContent = isFs ? '✕' : '⛶';
  btn.title = isFs ? 'Exit full screen (Esc)' : 'Full screen';
  scaleScratchQuizFrame();
}

function clearScratchQuizLoadTimers() {
  if (window._qsScratchLoadTimer) {
    clearTimeout(window._qsScratchLoadTimer);
    window._qsScratchLoadTimer = null;
  }
  if (window._qsScratchReadyTimer) {
    clearTimeout(window._qsScratchReadyTimer);
    window._qsScratchReadyTimer = null;
  }
}

function scratchQuizEditorUrl(loadKey, attempt) {
  return './scratch/editor.html?quiz=' + encodeURIComponent(loadKey) +
    '&suppressBeforeUnload=1&attempt=' + encodeURIComponent(attempt || 0);
}

function loadScratchQuizEditor(qIdx, loadKey, attempt) {
  var frame = document.getElementById('qs-scratch-frame');
  var fb = document.getElementById('qs-scratch-feedback');
  var submitBtn = document.getElementById('btn-quiz-submit-scratch');
  if (!frame || !submitBtn) return;
  clearScratchQuizLoadTimers();
  frame.style.pointerEvents = '';
  frame.dataset.quizLoadKey = loadKey;
  frame.dataset.quizLoadAttempt = String(attempt || 0);
  submitBtn.disabled = true;
  submitBtn.textContent = 'Loading editor...';
  submitBtn.onclick = null;
  if (fb) fb.textContent = attempt ? 'Reloading TurboWarp editor...' : 'Loading TurboWarp editor...';
  frame.onload = function() {
    requestAnimationFrame(scaleScratchQuizFrame);
    waitForScratchQuizReady(qIdx, loadKey, attempt || 0);
  };
  frame.src = scratchQuizEditorUrl(loadKey, attempt || 0);
  waitForScratchQuizReady(qIdx, loadKey, attempt || 0);
}

function waitForScratchQuizReady(qIdx, loadKey, attempt) {
  var frame = document.getElementById('qs-scratch-frame');
  var fb = document.getElementById('qs-scratch-feedback');
  var submitBtn = document.getElementById('btn-quiz-submit-scratch');
  if (!frame || !submitBtn || frame.dataset.quizLoadKey !== loadKey) return;
  clearScratchQuizLoadTimers();
  var started = Date.now();
  function isReady() {
    try {
      return !!(frame.contentWindow && frame.contentWindow.vm &&
        frame.contentWindow.vm.runtime && frame.contentWindow.vm.runtime.targets);
    } catch(e) {
      return false;
    }
  }
  function finishReady() {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Check & Submit';
    submitBtn.onclick = function() { submitStudentScratchAnswer(qIdx); };
    if (fb) fb.textContent = '';
  }
  function showManualReload() {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Reload editor';
    submitBtn.onclick = function() { loadScratchQuizEditor(qIdx, loadKey, (attempt || 0) + 1); };
    if (fb) fb.textContent = 'TurboWarp is taking too long to load. Reload the editor, then try the question again.';
  }
  function poll() {
    var answerBox = document.getElementById('qs-scratch-answer');
    if (!answerBox || answerBox.classList.contains('hidden') || frame.dataset.quizLoadKey !== loadKey) return;
    if (isReady()) {
      finishReady();
      return;
    }
    if (Date.now() - started > 12000) {
      if ((attempt || 0) < 1) loadScratchQuizEditor(qIdx, loadKey, (attempt || 0) + 1);
      else showManualReload();
      return;
    }
    window._qsScratchReadyTimer = setTimeout(poll, 250);
  }
  window._qsScratchLoadTimer = setTimeout(function() {
    if (!isReady() && frame.dataset.quizLoadKey === loadKey) {
      if ((attempt || 0) < 1) loadScratchQuizEditor(qIdx, loadKey, (attempt || 0) + 1);
      else showManualReload();
    }
  }, 12000);
  poll();
}

function resetScratchQuizFrame() {
  var frame = document.getElementById('qs-scratch-frame');
  if (!frame) return;
  var wrap = document.getElementById('qs-scratch-wrap');
  if (wrap && wrap.classList.contains('qs-scratch-fullscreen')) toggleQsScratchFullscreen();
  clearScratchQuizLoadTimers();
  frame.style.pointerEvents = '';
  frame.onload = null;
  frame.dataset.quizLoadKey = '';
  try {
    if (frame.contentWindow) frame.contentWindow.onbeforeunload = null;
  } catch(e) {}
  if (frame.src !== 'about:blank') frame.src = 'about:blank';
}

function scaleBlockbenchQuizFrame() {
  var frame  = document.getElementById('qs-blockbench-frame');
  var wrap   = document.getElementById('qs-blockbench-wrap');
  var scroll = document.getElementById('qs-blockbench-scroll');
  if (!frame || !wrap || !scroll) return;
  var NW = 1280, NH = 720;
  var checkBarEl = wrap.querySelector('.qs-blockbench-checkbar');
  var checkBarH  = checkBarEl ? checkBarEl.offsetHeight : 44;
  var isFs = wrap.classList.contains('qs-blockbench-fullscreen');
  var scale, availW;

  if (isFs) {
    availW = window.innerWidth;
    scale  = Math.min(1, availW / NW, (window.innerHeight - checkBarH) / NH);
  } else {
    var headerEl = document.querySelector('#quiz-student-screen > div:first-child');
    var qTextEl  = document.getElementById('qs-q-text');
    var headerH  = headerEl ? headerEl.offsetHeight     : 44;
    var qTextH   = qTextEl  ? qTextEl.offsetHeight + 40 : 80;
    var maxH     = Math.max(300, window.innerHeight - headerH - 42 - qTextH - checkBarH - 16);
    availW       = Math.max(320, window.innerWidth - 48);
    scale        = Math.min(1, availW / NW);
    scroll.style.maxHeight = Math.min(Math.ceil(NH * scale), maxH) + 'px';
    scroll.scrollLeft      = 0;
  }

  frame.style.width        = NW + 'px';
  frame.style.height       = NH + 'px';
  frame.style.transform    = 'scale(' + scale + ')';
  frame.style.transformOrigin = 'top left';
  frame.style.marginBottom = Math.round(NH * (scale - 1)) + 'px';
  frame.style.marginLeft   = Math.max(0, Math.round((availW - NW * scale) / 2)) + 'px';
}

function toggleQsBlockbenchFullscreen() {
  var wrap = document.getElementById('qs-blockbench-wrap');
  var btn  = document.getElementById('btn-qs-blockbench-fs');
  var isFs = wrap.classList.toggle('qs-blockbench-fullscreen');
  btn.textContent = isFs ? '\u00d7' : '\u26f6';
  btn.title = isFs ? 'Exit full screen (Esc)' : 'Full screen';
  scaleBlockbenchQuizFrame();
}

function blockbenchQuizEditorUrl(loadKey, attempt) {
  return './blockbench/index.html?quiz=' + encodeURIComponent(loadKey) +
    '&attempt=' + encodeURIComponent(attempt || 0);
}

function loadBlockbenchQuizEditor(qIdx, loadKey, attempt) {
  var frame = document.getElementById('qs-blockbench-frame');
  var fb = document.getElementById('qs-blockbench-feedback');
  var submitBtn = document.getElementById('btn-quiz-submit-blockbench');
  if (!frame || !submitBtn) return;
  frame.style.pointerEvents = '';
  frame.dataset.quizLoadKey = loadKey;
  frame.dataset.quizLoadAttempt = String(attempt || 0);
  submitBtn.disabled = true;
  submitBtn.textContent = 'Loading editor...';
  submitBtn.onclick = null;
  if (fb) fb.textContent = attempt ? 'Reloading Blockbench editor...' : 'Loading Blockbench editor...';
  frame.onload = function() {
    requestAnimationFrame(scaleBlockbenchQuizFrame);
    waitForBlockbenchQuizReady(qIdx, loadKey, attempt || 0);
  };
  frame.src = blockbenchQuizEditorUrl(loadKey, attempt || 0);
  waitForBlockbenchQuizReady(qIdx, loadKey, attempt || 0);
}

function waitForBlockbenchQuizReady(qIdx, loadKey, attempt) {
  var frame = document.getElementById('qs-blockbench-frame');
  var fb = document.getElementById('qs-blockbench-feedback');
  var submitBtn = document.getElementById('btn-quiz-submit-blockbench');
  if (!frame || !submitBtn || frame.dataset.quizLoadKey !== loadKey) return;
  var started = Date.now();
  function isReady() {
    try {
      return !!(frame.contentWindow && frame.contentWindow.Blockbench && frame.contentWindow.Outliner);
    } catch(e) {
      return false;
    }
  }
  function finishReady() {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Check & Submit';
    submitBtn.onclick = function() { submitStudentBlockbenchAnswer(qIdx); };
    if (fb) fb.textContent = 'Create a Generic Model if Blockbench asks, then build the required model.';
  }
  function poll() {
    var answerBox = document.getElementById('qs-blockbench-answer');
    if (!answerBox || answerBox.classList.contains('hidden') || frame.dataset.quizLoadKey !== loadKey) return;
    if (isReady()) { finishReady(); return; }
    if (Date.now() - started > 12000) {
      if ((attempt || 0) < 1) loadBlockbenchQuizEditor(qIdx, loadKey, (attempt || 0) + 1);
      else {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Reload editor';
        submitBtn.onclick = function() { loadBlockbenchQuizEditor(qIdx, loadKey, (attempt || 0) + 1); };
        if (fb) fb.textContent = 'Blockbench is taking too long to load. Reload the editor, then try again.';
      }
      return;
    }
    setTimeout(poll, 250);
  }
  poll();
}

function resetBlockbenchQuizFrame() {
  var frame = document.getElementById('qs-blockbench-frame');
  if (!frame) return;
  var wrap = document.getElementById('qs-blockbench-wrap');
  if (wrap && wrap.classList.contains('qs-blockbench-fullscreen')) toggleQsBlockbenchFullscreen();
  frame.style.pointerEvents = '';
  frame.onload = null;
  frame.dataset.quizLoadKey = '';
  if (frame.src !== 'about:blank') frame.src = 'about:blank';
}

function scalePyBotQuizFrame() {
  var frame  = document.getElementById('qs-pybot-frame');
  var wrap   = document.getElementById('qs-pybot-wrap');
  var scroll = document.getElementById('qs-pybot-scroll');
  if (!frame || !wrap || !scroll) return;
  var NW = 960, NH = 600;
  var checkBarEl = wrap.querySelector('.qs-pybot-checkbar');
  var checkBarH  = checkBarEl ? checkBarEl.offsetHeight : 44;
  var isFs = wrap.classList.contains('qs-pybot-fullscreen');
  var scale, availW;

  if (isFs) {
    availW = window.innerWidth;
    scale  = Math.min(1, availW / NW, (window.innerHeight - checkBarH) / NH);
  } else {
    var headerEl = document.querySelector('#quiz-student-screen > div:first-child');
    var qTextEl  = document.getElementById('qs-q-text');
    var headerH  = headerEl ? headerEl.offsetHeight     : 44;
    var qTextH   = qTextEl  ? qTextEl.offsetHeight + 40 : 80;
    var maxH     = Math.max(260, window.innerHeight - headerH - 42 - qTextH - checkBarH - 16);
    availW       = Math.max(320, window.innerWidth - 48);
    scale        = Math.min(1, availW / NW);
    scroll.style.maxHeight = Math.min(Math.ceil(NH * scale), maxH) + 'px';
    scroll.scrollLeft      = 0;
  }

  frame.style.width        = NW + 'px';
  frame.style.height       = NH + 'px';
  frame.style.transform    = 'scale(' + scale + ')';
  frame.style.marginBottom = Math.round(NH * (scale - 1)) + 'px';
  frame.style.marginLeft   = Math.max(0, Math.round((availW - NW * scale) / 2)) + 'px';
}

function toggleQsPyBotFullscreen() {
  var wrap = document.getElementById('qs-pybot-wrap');
  var btn  = document.getElementById('btn-qs-pybot-fs');
  var isFs = wrap.classList.toggle('qs-pybot-fullscreen');
  btn.textContent = isFs ? '✕' : '⛶';
  btn.title = isFs ? 'Exit full screen (Esc)' : 'Full screen';
  scalePyBotQuizFrame();
}

async function submitStudentPyBotAnswer(qIdx, medal, lines) {
  if (quiz.myAnswered) return;
  // PyBot sends emoji strings directly: gold, silver, bronze, or no medal.
  var points = pyBotMedalPoints(medal, true);
  var correct = points > 0;
  quiz.myAnswered = true;
  lockStudentAnswers();
  var fb = document.getElementById('qs-pybot-feedback');
  if (fb) fb.textContent = pyBotMedalLabel(medal) + ' - level complete! ' + points + ' point' + (points === 1 ? '' : 's') + ' - ' + lines + ' line' + (lines === 1 ? '' : 's') + ' used.';
  await quiz.sessionRef.child('answers/' + qIdx + '/' + state.uid).set({
    correct: correct,
    completed: true,
    points: points,
    medal: medal || '',
    lines: lines || 0,
    answeredAt: Date.now()
  });
  document.getElementById('qs-answered-msg').classList.remove('hidden');
  document.getElementById('qs-pybot-answer').classList.add('hidden');
}

async function submitStudentScratchAnswer(qIdx) {
  if (quiz.myAnswered) return;
  var q = quiz.questions[qIdx];
  var frame = document.getElementById('qs-scratch-frame');
  var fb = document.getElementById('qs-scratch-feedback');
  var submitBtn = document.getElementById('btn-quiz-submit-scratch');
  var originalText = submitBtn ? submitBtn.textContent : '';
  try {
    var vm = frame.contentWindow.vm;
    if (!vm) { fb.textContent = 'Editor still loading - wait a moment and try again.'; return; }
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Testing...';
    }
    if (frame) frame.style.pointerEvents = 'none';
    if (fb) fb.textContent = 'Running a test with simulated input...';
    var runtimeResult = await runScratchRuntimeTest(q, vm);
    var correct = runtimeResult === true;
    if (!correct) {
      var targets = vm.runtime.targets;
      correct = scratchBuildMatches(q, collectScratchOpcodes(targets));
    }
    if (!correct) {
      if (fb) fb.textContent = 'Not quite yet. Check the required event, blocks and condition, then try again.';
      unlockScratchTesting(frame, submitBtn, originalText);
      return;
    }
    quiz.myAnswered = true;
    lockStudentAnswers();
    await quiz.sessionRef.child('answers/' + qIdx + '/' + state.uid).set({
      correct: correct,
      answeredAt: Date.now()
    });
    document.getElementById('qs-answered-msg').classList.remove('hidden');
    document.getElementById('qs-scratch-answer').classList.add('hidden');
  } catch(e) {
    unlockScratchTesting(frame, submitBtn, originalText);
    if (fb) fb.textContent = 'Could not check: ' + e.message;
  }
}

async function submitStudentBlockbenchAnswer(qIdx) {
  if (quiz.myAnswered) return;
  var q = quiz.questions[qIdx];
  var frame = document.getElementById('qs-blockbench-frame');
  var fb = document.getElementById('qs-blockbench-feedback');
  var submitBtn = document.getElementById('btn-quiz-submit-blockbench');
  var originalText = submitBtn ? submitBtn.textContent : '';
  try {
    var cw = frame && frame.contentWindow;
    if (!cw || !cw.Outliner) {
      if (fb) fb.textContent = 'Editor still loading - wait a moment and try again.';
      return;
    }
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Checking...';
    }
    if (frame) frame.style.pointerEvents = 'none';
    if (fb) fb.textContent = 'Inspecting your Blockbench model...';
    var result = validateBlockbenchQuizModel(q, cw);
    if (!result.correct) {
      if (fb) fb.textContent = result.message || 'Not quite yet. Check the required shapes and try again.';
      unlockBlockbenchTesting(frame, submitBtn, originalText);
      return;
    }
    quiz.myAnswered = true;
    lockStudentAnswers();
    await quiz.sessionRef.child('answers/' + qIdx + '/' + state.uid).set({
      correct: true,
      cubeCount: result.cubeCount || 0,
      answeredAt: Date.now()
    });
    document.getElementById('qs-answered-msg').classList.remove('hidden');
    document.getElementById('qs-blockbench-answer').classList.add('hidden');
  } catch(e) {
    unlockBlockbenchTesting(frame, submitBtn, originalText);
    if (fb) fb.textContent = 'Could not check: ' + e.message;
  }
}

function unlockBlockbenchTesting(frame, submitBtn, originalText) {
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText || 'Check & Submit';
  }
  if (frame) frame.style.pointerEvents = '';
}

function validateBlockbenchQuizModel(q, cw) {
  var check = q.blockbenchCheck || {};
  var cubes = collectBlockbenchCubes(cw);
  var minCubes = check.minCubes || 1;
  if (cubes.length < minCubes) {
    return { correct: false, cubeCount: cubes.length, message: 'Not yet - found ' + cubes.length + ' cube' + (cubes.length === 1 ? '' : 's') + ', but this question needs at least ' + minCubes + '.' };
  }
  if (check.requireResized && !cubes.some(blockbenchCubeIsResized)) {
    return { correct: false, cubeCount: cubes.length, message: 'A cube was found, but it still looks like the default size. Resize at least one cube.' };
  }
  if (check.requireFlatWide && !cubes.some(blockbenchCubeIsFlatWide)) {
    return { correct: false, cubeCount: cubes.length, message: 'A cube was found, but none look wide and flat yet.' };
  }
  if (check.requireTallNarrow && !cubes.some(blockbenchCubeIsTallNarrow)) {
    return { correct: false, cubeCount: cubes.length, message: 'Add or resize a cube so one part is tall and narrow.' };
  }
  return { correct: true, cubeCount: cubes.length, message: 'Model checked.' };
}

function collectBlockbenchCubes(cw) {
  var raw = [];
  try {
    if (cw.Cube && Array.isArray(cw.Cube.all)) raw = raw.concat(cw.Cube.all);
  } catch(e) {}
  try {
    var els = cw.Outliner && cw.Outliner.elements ? cw.Outliner.elements : [];
    raw = raw.concat(els);
  } catch(e2) {}
  var seen = [];
  return raw.filter(function(el) {
    if (!el || seen.indexOf(el) !== -1) return false;
    seen.push(el);
    return !!(el.faces && Object.keys(el.faces).length >= 6);
  }).map(function(el) {
    var dims = blockbenchCubeDimensions(el);
    return { element: el, dims: dims };
  });
}

function blockbenchCubeDimensions(el) {
  var from = Array.isArray(el.from) ? el.from : null;
  var to = Array.isArray(el.to) ? el.to : null;
  if (from && to) {
    return [
      Math.abs(Number(to[0]) - Number(from[0])),
      Math.abs(Number(to[1]) - Number(from[1])),
      Math.abs(Number(to[2]) - Number(from[2]))
    ].filter(function(n) { return isFinite(n); });
  }
  if (Array.isArray(el.size)) {
    return el.size.map(Number).filter(function(n) { return isFinite(n); });
  }
  return [];
}

function blockbenchCubeIsResized(cube) {
  var d = cube.dims || [];
  if (d.length < 3) return true;
  return Math.max.apply(null, d) - Math.min.apply(null, d) > 0.25;
}

function blockbenchCubeIsFlatWide(cube) {
  var d = (cube.dims || []).slice().sort(function(a, b) { return a - b; });
  if (d.length < 3) return blockbenchCubeIsResized(cube);
  return d[2] >= d[0] * 2 && d[0] <= 5;
}

function blockbenchCubeIsTallNarrow(cube) {
  var d = cube.dims || [];
  if (d.length < 3) return blockbenchCubeIsResized(cube);
  var y = d[1];
  var xzMax = Math.max(d[0], d[2]);
  return y >= xzMax * 1.5;
}

function unlockScratchTesting(frame, submitBtn, originalText) {
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText || 'Check & Submit';
  }
  if (frame) frame.style.pointerEvents = '';
}

async function runScratchRuntimeTest(q, vm) {
  var test = q.runtimeTest;
  if (!test || !vm || !vm.runtime) return null;
  var runtime = vm.runtime;
  var target = getScratchMainSprite(runtime);
  if (!target) return null;
  runtime.stopAll();
  await waitMs(80);

  if (test.kind === 'keyMoves') {
    target.setXY(0, 0);
    var startX = target.x;
    var startY = target.y;
    runtime.greenFlag();
    await waitMs(50);
    postScratchKey(runtime, test.key || 'ArrowRight', true);
    await waitMs(test.holdMs || 220);
    postScratchKey(runtime, test.key || 'ArrowRight', false);
    await waitMs(80);
    runtime.stopAll();
    if (test.axis === 'y') {
      return test.direction === 'negative' ? target.y < startY : target.y > startY;
    }
    return test.direction === 'negative' ? target.x < startX : target.x > startX;
  }

  if (test.kind === 'keyMoves4Directions') {
    var dirTests = [
      {key:'ArrowRight',axis:'x',dir:1},{key:'ArrowLeft',axis:'x',dir:-1},
      {key:'ArrowUp',axis:'y',dir:1},{key:'ArrowDown',axis:'y',dir:-1}
    ];
    for (var di = 0; di < dirTests.length; di++) {
      var dt = dirTests[di];
      target.setXY(0, 0);
      runtime.stopAll();
      runtime.greenFlag();
      await waitMs(50);
      postScratchKey(runtime, dt.key, true);
      await waitMs(220);
      postScratchKey(runtime, dt.key, false);
      await waitMs(80);
      runtime.stopAll();
      var dtOk = dt.axis === 'x' ? (dt.dir > 0 ? target.x > 0 : target.x < 0) : (dt.dir > 0 ? target.y > 0 : target.y < 0);
      if (!dtOk) return false;
    }
    return true;
  }

  if (test.kind === 'greenFlagChangesCostume') {
    var startCostume = target.currentCostume;
    runtime.greenFlag();
    await waitMs(test.waitMs || 600);
    runtime.stopAll();
    return target.currentCostume !== startCostume;
  }

  if (test.kind === 'keyChangesVariable') {
    runtime.greenFlag();
    await waitMs(test.initMs || 300);
    runtime.stopAll();
    var kvBefore = {};
    (runtime.targets || []).forEach(function(t) {
      Object.keys(t.variables || {}).forEach(function(id) {
        var v = t.variables[id]; if (v) kvBefore[id] = v.value;
      });
    });
    postScratchKey(runtime, test.key || ' ', true);
    await waitMs(test.holdMs || 250);
    postScratchKey(runtime, test.key || ' ', false);
    await waitMs(100);
    runtime.stopAll();
    var kvChanged = false;
    (runtime.targets || []).forEach(function(t) {
      Object.keys(t.variables || {}).forEach(function(id) {
        var v = t.variables[id];
        if (id in kvBefore && v && String(v.value) !== String(kvBefore[id])) kvChanged = true;
      });
    });
    return kvChanged;
  }

  if (test.kind === 'greenFlagChangesVariable') {
    var gvBefore = {};
    (runtime.targets || []).forEach(function(t) {
      Object.keys(t.variables || {}).forEach(function(id) {
        var v = t.variables[id]; if (v) gvBefore[id] = v.value;
      });
    });
    target.setXY(0, 0);
    runtime.greenFlag();
    await waitMs(test.waitMs || 1500);
    runtime.stopAll();
    var gvChanged = false;
    (runtime.targets || []).forEach(function(t) {
      Object.keys(t.variables || {}).forEach(function(id) {
        var v = t.variables[id];
        if (id in gvBefore && v && String(v.value) !== String(gvBefore[id])) gvChanged = true;
      });
    });
    return gvChanged;
  }

  if (test.kind === 'greenFlagMoves') {
    target.setXY(0, 0);
    var moveX = target.x;
    var moveY = target.y;
    runtime.greenFlag();
    await waitMs(test.waitMs || 300);
    runtime.stopAll();
    return Math.abs(target.x - moveX) + Math.abs(target.y - moveY) >= 1;
  }

  if (test.kind === 'greenFlagResetsPosition') {
    target.setXY(90, 70);
    runtime.greenFlag();
    await waitMs(test.waitMs || 300);
    runtime.stopAll();
    return Math.abs(target.x) <= 5 && Math.abs(target.y) <= 5;
  }

  if (test.kind === 'keyTurns') {
    var startDir = target.direction;
    postScratchKey(runtime, test.key || ' ', true);
    await waitMs(test.holdMs || 220);
    postScratchKey(runtime, test.key || ' ', false);
    await waitMs(80);
    runtime.stopAll();
    return Math.abs(target.direction - startDir) >= 1;
  }

  if (test.kind === 'askStores' || test.kind === 'askStoresAndSays') {
    var said = [];
    var answer = test.answer || 'Sam';
    var sayHandler = function(target, type, text) {
      if (text != null) said.push(String(text));
    };
    if (test.kind === 'askStoresAndSays' && runtime.on) runtime.on('SAY', sayHandler);
    autoAnswerScratch(runtime, answer);
    runtime.greenFlag();
    await waitMs(test.waitMs || 1100);
    if (runtime.off) runtime.off('SAY', sayHandler);
    runtime.stopAll();
    var answerNorm = normaliseScratchFieldValue(answer);
    var stored = getScratchVariableValues(runtime).some(function(value) {
      return normaliseScratchFieldValue(value) === answerNorm;
    });
    if (test.kind === 'askStores') return stored;
    var spoken = said.some(function(text) {
      return normaliseScratchFieldValue(text).indexOf(answerNorm) !== -1;
    });
    return stored && (spoken || !test.requireSpeech);
  }

  return null;
}

function runStepRuntimeTest(testConfig, successMsg, failMsg) {
  var f = document.getElementById('y7-scratch-frame');
  var r = document.getElementById('y7-check-result');
  var btn = document.getElementById('y7-check-btn');
  if (!f || !r) return;
  var vm = f.contentWindow && f.contentWindow.vm;
  if (!vm || !vm.runtime) { r.style.color='#fca5a5'; r.textContent='Editor still loading — wait a moment.'; return; }
  f.style.pointerEvents = 'none';
  if (btn) { btn.disabled = true; btn.textContent = 'Testing…'; }
  r.style.color = '#94a3b8'; r.textContent = 'Running test…';
  runScratchRuntimeTest({runtimeTest: testConfig}, vm).then(function(result) {
    f.style.pointerEvents = '';
    if (btn) { btn.disabled = false; btn.textContent = 'Check My Work'; }
    if (result) {
      r.style.color = '#86efac'; r.textContent = successMsg || '✓ Test passed!';
      if (window.__markStepComplete) __markStepComplete();
    } else {
      r.style.color = '#fca5a5'; r.textContent = failMsg || 'Not working yet — check your blocks and try again.';
    }
  }).catch(function(e) {
    f.style.pointerEvents = '';
    if (btn) { btn.disabled = false; btn.textContent = 'Check My Work'; }
    r.style.color = '#fca5a5'; r.textContent = 'Error: ' + e.message;
  });
}

function getScratchMainSprite(runtime) {
  var targets = runtime.targets || [];
  for (var i = 0; i < targets.length; i++) {
    if (targets[i] && !targets[i].isStage) return targets[i];
  }
  return null;
}

function waitMs(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

function postScratchKey(runtime, key, isDown) {
  if (!runtime.ioDevices || !runtime.ioDevices.keyboard) return;
  runtime.ioDevices.keyboard.postData({ key: key, isDown: isDown });
}

function autoAnswerScratch(runtime, answer) {
  if (!runtime.on) return;
  var answered = false;
  var handler = function() {
    if (answered) return;
    answered = true;
    setTimeout(function() { runtime.emit('ANSWER', answer); }, 20);
    if (runtime.off) runtime.off('QUESTION', handler);
  };
  runtime.on('QUESTION', handler);
}

function getScratchVariableValues(runtime) {
  var values = [];
  (runtime.targets || []).forEach(function(target) {
    var variables = target.variables || {};
    Object.keys(variables).forEach(function(id) {
      if (variables[id] && variables[id].value != null) values.push(variables[id].value);
    });
  });
  return values;
}

function collectScratchOpcodes(targets) {
  var counts = {};
  var fields = {};
  var blocksSeen = [];
  for (var t = 0; t < targets.length; t++) {
    var blks = targets[t].blocks._blocks;
    for (var id in blks) {
      var block = blks[id] || {};
      var opcode = block.opcode;
      if (opcode) {
        counts[opcode] = (counts[opcode] || 0) + 1;
        blocksSeen.push(opcode);
      }
      if (opcode && block.fields) {
        Object.keys(block.fields).forEach(function(name) {
          var field = block.fields[name];
          var value = scratchFieldValue(field);
          var key = opcode + '.' + name;
          if (!fields[key]) fields[key] = [];
          fields[key].push(normaliseScratchFieldValue(value));
        });
      }
    }
  }
  return {
    countAny: function(group) {
      return group.reduce(function(total, opcode) { return total + (counts[opcode] || 0); }, 0);
    },
    fieldMatches: function(key, accepted) {
      var values = fields[key] || [];
      accepted = (Array.isArray(accepted) ? accepted : [accepted]).map(normaliseScratchFieldValue);
      return values.some(function(value) { return accepted.indexOf(value) !== -1; });
    },
    fieldRuleMatches: function(rule) {
      if (!rule) return true;
      var key = rule.opcode + '.' + rule.field;
      if (!fields[key] || !fields[key].length) {
        // Older/embedded Scratch builds can expose the opcode but not the field
        // metadata consistently. Do not reject an otherwise valid build only
        // because the editor did not expose the key option/name field.
        return this.countAny([rule.opcode]) > 0;
      }
      return this.fieldMatches(key, rule.values);
    },
    debugSummary: function() {
      return blocksSeen.join(', ');
    }
  };
}

function scratchFieldValue(field) {
  if (Array.isArray(field)) return field[0];
  if (field && field.value != null) return field.value;
  if (field && field.name != null) return field.name;
  return field;
}

function normaliseScratchFieldValue(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scratchBuildMatches(q, info) {
  if (Array.isArray(q.checkAlternatives) && q.checkAlternatives.length) {
    return q.checkAlternatives.some(function(rule) { return scratchBuildRuleMatches(rule, info); });
  }
  return scratchBuildRuleMatches(q, info);
}

function scratchBuildRuleMatches(q, info) {
  var required = q.check || [];
  var groupsOk = required.every(function(item) {
    var group = Array.isArray(item) ? item : [item];
    return info.countAny(group) > 0;
  });
  if (!groupsOk) return false;
  var counts = q.checkCounts || {};
  var countsOk = Object.keys(counts).every(function(key) {
    var group = key.indexOf('|') >= 0 ? key.split('|') : [key];
    return info.countAny(group) >= counts[key];
  });
  if (!countsOk) return false;
  var fields = normaliseScratchCheckFields(q.checkFields) || [];
  return fields.every(function(rule) {
    return info.fieldRuleMatches(rule);
  });
}

// ── PyScratch quiz frame ────────────────────────────────────────────────────
// Mirrors the Scratch/Blockbench quiz frame pattern but loads the PyScratch
// editor (scratch/editor.html?pyscratch=1) and validates by sending PS_GET_CODE
// to the iframe and checking the response against q.requires strings.

function scalePyScratchQuizFrame() {
  var frame  = document.getElementById('qs-pyscratch-frame');
  var wrap   = document.getElementById('qs-pyscratch-wrap');
  var scroll = document.getElementById('qs-pyscratch-scroll');
  if (!frame || !wrap || !scroll) return;
  var NW = 1100, NH = 650;
  var checkBarEl = wrap.querySelector('.qs-pyscratch-checkbar');
  var checkBarH  = checkBarEl ? checkBarEl.offsetHeight : 44;
  var isFs = wrap.classList.contains('qs-pyscratch-fullscreen');
  var scale, availW;
  if (isFs) {
    availW = window.innerWidth;
    scale  = Math.min(1, availW / NW, (window.innerHeight - checkBarH) / NH);
  } else {
    var headerEl = document.querySelector('#quiz-student-screen > div:first-child');
    var qTextEl  = document.getElementById('qs-q-text');
    var headerH  = headerEl ? headerEl.offsetHeight     : 44;
    var qTextH   = qTextEl  ? qTextEl.offsetHeight + 40 : 80;
    var maxH     = Math.max(260, window.innerHeight - headerH - 42 - qTextH - checkBarH - 16);
    availW       = Math.max(320, window.innerWidth - 48);
    scale        = Math.min(1, availW / NW);
    scroll.style.maxHeight = Math.min(Math.ceil(NH * scale), maxH) + 'px';
    scroll.scrollLeft = 0;
  }
  frame.style.width        = NW + 'px';
  frame.style.height       = NH + 'px';
  frame.style.transform    = 'scale(' + scale + ')';
  frame.style.marginBottom = Math.round(NH * (scale - 1)) + 'px';
  frame.style.marginLeft   = Math.max(0, Math.round((availW - NW * scale) / 2)) + 'px';
}

function toggleQsPyScratchFullscreen() {
  var wrap = document.getElementById('qs-pyscratch-wrap');
  var btn  = document.getElementById('btn-qs-pyscratch-fs');
  var isFs = wrap.classList.toggle('qs-pyscratch-fullscreen');
  btn.textContent = isFs ? '×' : '⛶';
  btn.title = isFs ? 'Exit full screen (Esc)' : 'Full screen';
  scalePyScratchQuizFrame();
}

function pyScratchQuizEditorUrl(loadKey, attempt) {
  return './scratch/editor.html?pyscratch=1&suppressBeforeUnload=1&quiz=' +
    encodeURIComponent(loadKey) + '&attempt=' + encodeURIComponent(attempt || 0);
}

function loadPyScratchQuizEditor(qIdx, loadKey, attempt) {
  var frame     = document.getElementById('qs-pyscratch-frame');
  var fb        = document.getElementById('qs-pyscratch-feedback');
  var submitBtn = document.getElementById('btn-quiz-submit-pyscratch');
  if (!frame || !submitBtn) return;
  frame.style.pointerEvents    = '';
  frame.dataset.quizLoadKey    = loadKey;
  submitBtn.disabled           = true;
  submitBtn.textContent        = 'Loading editor...';
  submitBtn.onclick            = null;
  if (fb) fb.textContent = attempt ? 'Reloading PyScratch editor...' : 'Loading PyScratch editor...';
  frame.onload = function() {
    requestAnimationFrame(scalePyScratchQuizFrame);
    waitForPyScratchQuizReady(qIdx, loadKey, attempt || 0);
  };
  frame.src = pyScratchQuizEditorUrl(loadKey, attempt || 0);
  // Also start polling immediately in case onload already fired
  waitForPyScratchQuizReady(qIdx, loadKey, attempt || 0);
}

function waitForPyScratchQuizReady(qIdx, loadKey, attempt) {
  var frame     = document.getElementById('qs-pyscratch-frame');
  var fb        = document.getElementById('qs-pyscratch-feedback');
  var submitBtn = document.getElementById('btn-quiz-submit-pyscratch');
  if (!frame || !submitBtn || frame.dataset.quizLoadKey !== loadKey) return;
  var started = Date.now();
  function isReady() {
    try {
      return !!(frame.contentWindow && frame.contentWindow.document.getElementById('ps-editor'));
    } catch(e) { return false; }
  }
  function finishReady() {
    submitBtn.disabled  = false;
    submitBtn.textContent = 'Check & Submit';
    submitBtn.onclick   = function() { submitStudentPyScratchAnswer(qIdx); };
    if (fb) fb.textContent = 'Write your code in the editor above, then click Check & Submit.';
  }
  function showManualReload() {
    submitBtn.disabled  = false;
    submitBtn.textContent = 'Reload editor';
    submitBtn.onclick   = function() { loadPyScratchQuizEditor(qIdx, loadKey, (attempt || 0) + 1); };
    if (fb) fb.textContent = 'The editor is taking too long to load — click to reload.';
  }
  function poll() {
    var answerBox = document.getElementById('qs-pyscratch-answer');
    if (!answerBox || answerBox.classList.contains('hidden') || frame.dataset.quizLoadKey !== loadKey) return;
    if (isReady()) { finishReady(); return; }
    if (Date.now() - started > 12000) {
      if ((attempt || 0) < 1) loadPyScratchQuizEditor(qIdx, loadKey, (attempt || 0) + 1);
      else showManualReload();
      return;
    }
    setTimeout(poll, 250);
  }
  poll();
}

function resetPyScratchQuizFrame() {
  var frame = document.getElementById('qs-pyscratch-frame');
  if (!frame) return;
  var wrap = document.getElementById('qs-pyscratch-wrap');
  if (wrap && wrap.classList.contains('qs-pyscratch-fullscreen')) toggleQsPyScratchFullscreen();
  frame.style.pointerEvents = '';
  frame.onload              = null;
  frame.dataset.quizLoadKey = '';
  if (frame.src !== 'about:blank') frame.src = 'about:blank';
}

// Sends PS_GET_CODE to the PyScratch iframe and resolves with the code string.
function getPyScratchCode(frame) {
  return new Promise(function(resolve, reject) {
    var timer = setTimeout(function() {
      window.removeEventListener('message', handler);
      reject(new Error('PyScratch did not respond in time.'));
    }, 4000);
    function handler(e) {
      if (!e.data || e.data.type !== 'PS_CODE_RESPONSE') return;
      clearTimeout(timer);
      window.removeEventListener('message', handler);
      resolve(e.data.code || '');
    }
    window.addEventListener('message', handler);
    try {
      frame.contentWindow.postMessage({ type: 'PS_GET_CODE' }, '*');
    } catch(e2) {
      clearTimeout(timer);
      window.removeEventListener('message', handler);
      reject(e2);
    }
  });
}

async function submitStudentPyScratchAnswer(qIdx) {
  if (quiz.myAnswered) return;
  var q         = quiz.questions[qIdx];
  var frame     = document.getElementById('qs-pyscratch-frame');
  var fb        = document.getElementById('qs-pyscratch-feedback');
  var submitBtn = document.getElementById('btn-quiz-submit-pyscratch');
  var origText  = submitBtn ? submitBtn.textContent : 'Check & Submit';
  function unlock() {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = origText; }
    if (frame) frame.style.pointerEvents = '';
  }
  try {
    var cw = frame && frame.contentWindow;
    if (!cw || !cw.document.getElementById('ps-editor')) {
      if (fb) fb.textContent = 'Editor still loading — wait a moment and try again.';
      return;
    }
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Checking...'; }
    if (frame) frame.style.pointerEvents = 'none';
    if (fb) fb.textContent = 'Reading your code...';

    var code     = await getPyScratchCode(frame);
    var requires = Array.isArray(q.requires) ? q.requires : [];
    var missing  = requires.filter(function(r) { return code.indexOf(r) === -1; });

    if (missing.length > 0) {
      if (fb) fb.textContent = 'Not quite yet — check your code and try again.';
      unlock();
      return;
    }

    quiz.myAnswered = true;
    lockStudentAnswers();
    await quiz.sessionRef.child('answers/' + qIdx + '/' + state.uid).set({
      correct: true,
      answeredAt: Date.now()
    });
    document.getElementById('qs-answered-msg').classList.remove('hidden');
    document.getElementById('qs-pyscratch-answer').classList.add('hidden');
  } catch(e) {
    unlock();
    if (fb) fb.textContent = 'Could not check: ' + e.message;
  }
}
