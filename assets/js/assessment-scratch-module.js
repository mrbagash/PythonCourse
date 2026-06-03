function validateAssessmentProject(onProgress) {
  var frame = document.getElementById('aps-scratch-frame');
  var vm = frame && frame.contentWindow && frame.contentWindow.vm;
  if (!vm || !vm.runtime) return Promise.resolve({ score: 0, maxScore: 21, criteria: [] });
  return validateAssessmentScratchVm(vm, assessment.assessmentId, onProgress);
}

var SCRATCH_SNAPSHOT_MAX_BYTES = 20000;
var SCRATCH_SNAPSHOT_WARN_BYTES = 15000;

function scratchSnapshotByteSize(value) {
  var text = typeof value === 'string' ? value : JSON.stringify(value || {});
  if (window.TextEncoder) return new TextEncoder().encode(text).length;
  return unescape(encodeURIComponent(text)).length;
}

function stripScratchAsset(asset) {
  if (!asset) return null;
  var stripped = {};
  ['assetId', 'name', 'bitmapResolution', 'dataFormat', 'md5ext', 'rotationCenterX', 'rotationCenterY', 'rate', 'sampleCount', 'format'].forEach(function(key) {
    if (asset[key] != null) stripped[key] = asset[key];
  });
  return stripped;
}

function stripScratchProjectJson(project) {
  project = project || {};
  return {
    targets: (project.targets || []).map(function(target) {
      var stripped = {
        isStage: !!target.isStage,
        name: target.name || (target.isStage ? 'Stage' : ''),
        variables: target.variables || {},
        lists: target.lists || {},
        broadcasts: target.broadcasts || {},
        blocks: target.blocks || {},
        comments: target.comments || {},
        currentCostume: target.currentCostume || 0,
        costumes: (target.costumes || []).map(stripScratchAsset).filter(Boolean),
        sounds: (target.sounds || []).map(stripScratchAsset).filter(Boolean),
        volume: target.volume
      };
      if (!target.isStage) {
        stripped.visible = target.visible;
        stripped.x = target.x;
        stripped.y = target.y;
        stripped.size = target.size;
        stripped.direction = target.direction;
        stripped.draggable = target.draggable;
        stripped.rotationStyle = target.rotationStyle;
      }
      return stripped;
    }),
    monitors: project.monitors || [],
    extensions: project.extensions || [],
    meta: {
      semver: (project.meta && project.meta.semver) || '3.0.0',
      vm: (project.meta && project.meta.vm) || 'assessment-snapshot',
      agent: 'JHNCC stripped Scratch AP snapshot'
    }
  };
}

function cleanScratchSnapshotForFirebase(value) {
  if (Array.isArray(value)) {
    return value.map(cleanScratchSnapshotForFirebase).filter(function(item) { return item !== undefined; });
  }
  if (value && typeof value === 'object') {
    var cleaned = {};
    Object.keys(value).forEach(function(key) {
      var next = cleanScratchSnapshotForFirebase(value[key]);
      if (next !== undefined) cleaned[key] = next;
    });
    return cleaned;
  }
  return value === undefined ? undefined : value;
}

function buildScratchSnapshotRecord() {
  var frame = document.getElementById('aps-scratch-frame');
  var vm = frame && frame.contentWindow && frame.contentWindow.vm;
  if (!vm || !vm.runtime || typeof vm.toJSON !== 'function') {
    return { status: 'unavailable', sizeBytes: 0, error: 'Scratch editor was not ready, so the project snapshot could not be saved.' };
  }
  try {
    var project = JSON.parse(vm.toJSON());
    var snapshot = {
      version: 1,
      savedAt: Date.now(),
      assessmentId: assessment.assessmentId || null,
      kind: 'stripped-scratch-project',
      project: stripScratchProjectJson(project)
    };
    snapshot = cleanScratchSnapshotForFirebase(snapshot);
    var sizeBytes = scratchSnapshotByteSize(snapshot);
    if (sizeBytes > SCRATCH_SNAPSHOT_MAX_BYTES) {
      return {
        status: 'too_large',
        sizeBytes: sizeBytes,
        warning: 'Project snapshot was too large to save safely. The AP score was still saved.'
      };
    }
    return {
      status: sizeBytes > SCRATCH_SNAPSHOT_WARN_BYTES ? 'saved_warn_size' : 'saved',
      sizeBytes: sizeBytes,
      snapshot: snapshot,
      warning: sizeBytes > SCRATCH_SNAPSHOT_WARN_BYTES ? 'Project snapshot was saved, but it is larger than expected.' : null
    };
  } catch(e) {
    return { status: 'failed', sizeBytes: 0, error: errorMessage(e, 'Project snapshot could not be created.') };
  }
}

function scratchSnapshotUpdateFields(snapshotRecord) {
  var rec = snapshotRecord || { status: 'unavailable', sizeBytes: 0 };
  var fields = {
    scratchSnapshotStatus: rec.status || 'unavailable',
    scratchSnapshotSizeBytes: rec.sizeBytes || 0,
    scratchSnapshotLimitBytes: SCRATCH_SNAPSHOT_MAX_BYTES,
    scratchSnapshotSavedAt: Date.now()
  };
  if (rec.warning) fields.scratchSnapshotWarning = rec.warning;
  if (rec.error) fields.scratchSnapshotWarning = rec.error;
  if (rec.snapshot) fields.scratchSnapshotJson = JSON.stringify(rec.snapshot);
  return fields;
}

function validateAssessmentScratchVm(vm, assessmentId, onProgress) {
  return assessYear7Ap2Scratch(vm, onProgress, assessmentValidationConfig(assessmentId));
}

function assessmentValidationConfig(assessmentId) {
  var practice = assessmentId === 'year7-ap2-practice-scratch';
  return {
    assessmentId: assessmentId || 'year7-ap2-scratch',
    backdropWords: practice
      ? ['space', 'galaxy', 'planet', 'star', 'moon', 'mars', 'asteroid', 'cosmos', 'nebula']
      : ['underwater', 'ocean', 'sea', 'reef', 'water', 'seabed', 'coral'],
    playerWords: practice
      ? ['astronaut', 'rocket', 'spaceship', 'space ship', 'ship', 'player', 'explorer', 'dot', 'kiran', 'ripley']
      : ['diver', 'swimmer', 'scuba', 'snorkel'],
    targetWords: practice
      ? ['crystal', 'star', 'coin', 'fuel', 'battery', 'gem', 'collectible', 'moon', 'planet']
      : ['fish', 'coin', 'star', 'shell', 'target', 'food', 'gem', 'crab', 'octopus', 'treasure', 'pearl'],
    hazardWords: practice
      ? ['alien', 'meteor', 'asteroid', 'robot', 'comet', 'enemy', 'obstacle']
      : ['shark'],
    scoreWords: ['score', 'point'],
    labels: practice
      ? {
          backdrop: 'space background',
          player: 'player sprite',
          movement: 'player movement with arrow keys',
          target: 'collectible random movement and score increase',
          hazard: 'obstacle sprite',
          chase: 'obstacle chasing the player',
          message: 'obstacle message when touching the player',
          scoreMinus: 'score decreasing when obstacle touches the player'
        }
      : {
          backdrop: 'underwater background',
          player: 'diver sprite',
          movement: 'diver movement with arrow keys',
          target: 'target random movement and score increase',
          hazard: 'shark sprite',
          chase: 'shark chasing the diver',
          message: 'shark message when touching the diver',
          scoreMinus: 'score decreasing when shark touches the diver'
        }
  };
}

function patchSayDurations(sprites, newSecs) {
  var patches = [];
  sprites.forEach(function(sprite) {
    var blocks = targetBlocks(sprite);
    Object.keys(blocks).forEach(function(id) {
      var block = blocks[id];
      if (!block || (block.opcode !== 'looks_sayforsecs' && block.opcode !== 'looks_thinkforsecs')) return;
      var secsInput = block.inputs && block.inputs.SECS;
      if (Array.isArray(secsInput) && Array.isArray(secsInput[1])) {
        patches.push({ arr: secsInput[1], idx: 1, original: secsInput[1][1] });
        secsInput[1][1] = newSecs;
      }
    });
    // Attempt to invalidate TurboWarp's compilation cache so the patch takes effect
    try {
      var b = sprite.blocks;
      if (b) {
        if (typeof b.resetCache === 'function') b.resetCache();
        else if (b._cache && typeof b._cache === 'object') Object.keys(b._cache).forEach(function(k) { delete b._cache[k]; });
      }
    } catch(e) {}
  });
  return patches;
}

function unpatchSayDurations(sprites, patches) {
  patches.forEach(function(p) { p.arr[p.idx] = p.original; });
  sprites.forEach(function(sprite) {
    try {
      var b = sprite.blocks;
      if (b) {
        if (typeof b.resetCache === 'function') b.resetCache();
        else if (b._cache && typeof b._cache === 'object') Object.keys(b._cache).forEach(function(k) { delete b._cache[k]; });
      }
    } catch(e) {}
  });
}

async function assessYear7Ap2Scratch(vm, onProgress, config) {
  config = config || assessmentValidationConfig('year7-ap2-scratch');
  var runtime = vm.runtime;
  function progress(label, index) {
    if (onProgress) onProgress('Validating: ' + label, index, 9);
  }
  runtime.stopAll();
  await waitMs(100);

  var targets = runtime.targets || [];
  var sprites = targets.filter(function(t) { return t && !t.isStage; });
  var stage = targets.find(function(t) { return t && t.isStage; });
  var info = collectAssessmentScratchInfo(targets);

  var diverSprite = findAssessmentSprite(sprites, config.playerWords);
  var sharkSprite = findAssessmentSprite(sprites, config.hazardWords);
  var targetSprite = sprites.find(function(sprite) {
    if (sprite === diverSprite || sprite === sharkSprite) return false;
    return spriteHasAnyWord(sprite, config.targetWords);
  }) || sprites.find(function(sprite) {
    return sprite !== diverSprite && sprite !== sharkSprite;
  });

  function criterion(id, text, marks, ok, got) { return { id:id, text:text, marks:marks, awarded: ok ? marks : (got || 0) }; }
  var specCriteria = (ASSESSMENTS[config.assessmentId] && ASSESSMENTS[config.assessmentId].criteria) ||
                     (ASSESSMENTS['year7-ap2-scratch'] && ASSESSMENTS['year7-ap2-scratch'].criteria) || [];
  function criterionFromSpec(id, ok, got) {
    var item = specCriteria.find(function(c) { return c.id === id; }) || { id: id, text: id, marks: 1 };
    return criterion(id, item.text, item.marks, ok, got);
  }

  // -- 1. Backdrop --
  progress(config.labels.backdrop, 1);
  var underwaterBackdrop = false;
  try {
    var backdrops = stage && stage.getCostumes ? stage.getCostumes() :
      (stage && stage.sprite && stage.sprite.costumes ? stage.sprite.costumes : []);
    underwaterBackdrop = backdrops.some(function(b) {
      var name = normaliseScratchFieldValue((b && (b.name || b.assetId)) || '');
      return config.backdropWords.some(function(w) { return name.indexOf(w) !== -1; });
    });
  } catch(e) {}

  // -- 2 & 3. Player sprite + Movement: test EVERY sprite, track which one responds --
  progress(config.labels.movement, 3);
  var movementScore = 0;
  var actualPlayerSprite = diverSprite;
  var dirTests = [
    { key: 'ArrowRight', axis: 'x', dir: 1 },
    { key: 'ArrowLeft',  axis: 'x', dir: -1 },
    { key: 'ArrowUp',    axis: 'y', dir: 1 },
    { key: 'ArrowDown',  axis: 'y', dir: -1 }
  ];
  for (var si = 0; si < sprites.length && movementScore < 4; si++) {
    var movTestSprite = sprites[si];
    var spriteDirections = 0;
    for (var di = 0; di < dirTests.length; di++) {
      var dt = dirTests[di];
      movTestSprite.setXY(0, 0);
      runtime.stopAll();
      runtime.greenFlag();
      await waitMs(50);
      postScratchKey(runtime, dt.key, true);
      await waitMs(220);
      postScratchKey(runtime, dt.key, false);
      await waitMs(80);
      runtime.stopAll();
      var moved = dt.axis === 'x'
        ? (dt.dir > 0 ? movTestSprite.x > 1 : movTestSprite.x < -1)
        : (dt.dir > 0 ? movTestSprite.y > 1 : movTestSprite.y < -1);
      if (moved) spriteDirections++;
    }
    if (spriteDirections > movementScore) {
      movementScore = spriteDirections;
      actualPlayerSprite = movTestSprite;
    }
  }
  // Player: passes by name match OR by proving movement response
  var hasDiver = !!diverSprite || movementScore >= 1;
  progress(config.labels.player, 2);

  // -- 4. Collectible: teleport each sprite onto every other, watch for teleport-away --
  progress(config.labels.target, 4);
  // Static: any sprite that has both a touching block and a random-position-change block
  var targetMovesStatic = sprites.some(function(s) {
    var cs = connectedOnlyTarget(s);
    return targetHasRandomPositionChange(cs) &&
           targetHasAnyOpcode(cs, ['sensing_touchingobject']);
  });
  var targetMovedDynamic = false;
  var actualTargetSprite = targetSprite;
  for (var tai = 0; tai < sprites.length && !targetMovedDynamic; tai++) {
    for (var tbi = 0; tbi < sprites.length && !targetMovedDynamic; tbi++) {
      if (tai === tbi) continue;
      var tA = sprites[tai];
      var tB = sprites[tbi];
      runtime.stopAll();
      runtime.greenFlag();
      await waitMs(200);
      var tBx = tB.x, tBy = tB.y;
      tA.setXY(tBx, tBy);
      await waitMs(1500);
      runtime.stopAll();
      if (Math.hypot(tB.x - tBx, tB.y - tBy) > 8) {
        targetMovedDynamic = true;
        actualTargetSprite = tB;
      }
    }
  }
  var targetRandom = targetMovesStatic || targetMovedDynamic;

  // Identify hazard: name match first, then any sprite that is neither player nor collectible
  var actualHazardSprite = sharkSprite || sprites.find(function(s) {
    return s !== actualPlayerSprite && s !== actualTargetSprite;
  });
  var hasShark = !!actualHazardSprite;

  // -- 5. Score variable + mechanics (3 marks) --
  progress('score mechanics', 5);

  var scoreObj = findAssessmentVariable(runtime.targets || [], config.scoreWords) ||
                 findAssessmentVariable(runtime.targets || [], null);
  var hasAnyActualVariable = !!scoreObj;

  // Static fallback for score+1: sprite must have BOTH a touching block AND a change-by-1 block
  var plusScoreStatic = hasAnyActualVariable && sprites.some(function(s) {
    var cs = connectedOnlyTarget(s);
    return targetHasChangeVariableBy(cs, null, 1) &&
           targetHasAnyOpcode(cs, ['sensing_touchingobject']);
  });

  // Mark 2 runtime: scatter sprites first so no collisions during init, then bring pair together
  var scoreIncreases = false;
  if (scoreObj && sprites.length >= 2) {
    for (var spi = 0; spi < sprites.length && !scoreIncreases; spi++) {
      for (var spj = 0; spj < sprites.length && !scoreIncreases; spj++) {
        if (spi === spj) continue;
        var spA = sprites[spi], spB = sprites[spj];
        sprites.forEach(function(s, idx) { s.setXY(-200 + idx * 200, 170); });
        runtime.stopAll();
        runtime.greenFlag();
        await waitMs(300);
        var score0 = Number(scoreObj.value);
        spA.setXY(spB.x, spB.y);
        await waitMs(1200);
        runtime.stopAll();
        if (Number(scoreObj.value) > score0) scoreIncreases = true;
      }
    }
  }

  // Mark 3 runtime: scatter sprites to prevent collision-triggered changes, then check reset
  var scoreResetsOnFlag = false;
  if (scoreObj) {
    sprites.forEach(function(s, idx) { s.setXY(-200 + idx * 200, 170); });
    runtime.stopAll();
    scoreObj.value = 5;
    runtime.greenFlag();
    await waitMs(700);
    runtime.stopAll();
    if (Number(scoreObj.value) === 0) scoreResetsOnFlag = true;
  }

  var scorePlusMark1 = hasAnyActualVariable ? 1 : 0;
  var scorePlusMark2 = (hasAnyActualVariable && (scoreIncreases || plusScoreStatic)) ? 1 : 0;
  var scorePlusMark3 = scoreResetsOnFlag ? 1 : 0;
  var scorePlusTotal = scorePlusMark1 + scorePlusMark2 + scorePlusMark3;

  // -- 6. Hazard chases player --
  progress(config.labels.chase, 6);
  var sharkChases = false;
  var sharkChaseStatic = actualHazardSprite && actualPlayerSprite &&
    targetHasChaseTowardsSprite(connectedOnlyTarget(actualHazardSprite), actualPlayerSprite);
  if (actualHazardSprite && actualPlayerSprite) {
    var chaseCount = 0;
    var chasePositions = [[-150, 80], [160, -90], [-100, -100]];
    for (var ci = 0; ci < chasePositions.length; ci++) {
      var cp = chasePositions[ci];
      runtime.stopAll();
      actualPlayerSprite.setXY(0, 0);
      actualHazardSprite.setXY(cp[0], cp[1]);
      runtime.greenFlag();
      await waitMs(150);
      var d0 = Math.hypot(actualHazardSprite.x - actualPlayerSprite.x, actualHazardSprite.y - actualPlayerSprite.y);
      await waitMs(1300);
      var d1 = Math.hypot(actualHazardSprite.x - actualPlayerSprite.x, actualHazardSprite.y - actualPlayerSprite.y);
      if (d1 < d0 - 5) chaseCount++;
    }
    sharkChases = chaseCount >= 2 || sharkChaseStatic;
    runtime.stopAll();
    await waitMs(100);
  }

  // -- 7. Hazard says something when touching player --
  progress(config.labels.message, 7);
  var sharkSays = false;
  // Static: hazard sprite has both a touching block and a say/think block (no name constraint)
  var sharkSaysStatic = actualHazardSprite && (function() {
    var cs = connectedOnlyTarget(actualHazardSprite);
    return targetHasAnyOpcode(cs, ['sensing_touchingobject']) &&
           targetHasAnyOpcode(cs, ['looks_say', 'looks_sayforsecs', 'looks_think', 'looks_thinkforsecs']);
  }());
  if (actualHazardSprite && actualPlayerSprite) {
    runtime.stopAll();
    actualPlayerSprite.setXY(0, 0);
    actualHazardSprite.setXY(120, 0);
    runtime.greenFlag();
    await waitMs(300);
    var sayHeard = false;
    var sayHandler = function(sTarget) {
      if (sTarget === actualHazardSprite || (sTarget && actualHazardSprite && sTarget.id === actualHazardSprite.id)) sayHeard = true;
    };
    runtime.on('SAY', sayHandler);
    actualHazardSprite.setXY(actualPlayerSprite.x, actualPlayerSprite.y);
    await waitMs(5600);
    runtime.off('SAY', sayHandler);
    sharkSays = sayHeard || sharkSaysStatic;
    runtime.stopAll();
    await waitMs(100);
  }

  // -- 8. Score decreases by 1 when hazard touches player --
  progress(config.labels.scoreMinus, 8);
  var scoreDecreases = false;
  // Static: any sprite has BOTH a touching block AND a change-by-(-1) block
  var scoreDecreasesStatic = sprites.some(function(s) {
    var cs = connectedOnlyTarget(s);
    return targetHasChangeVariableBy(cs, null, -1) &&
           targetHasAnyOpcode(cs, ['sensing_touchingobject']);
  });
  if (scoreObj && sprites.length >= 2) {
    // Prioritise the actual hazard/player pair, then try all remaining combinations
    var sdPairs = [];
    if (actualHazardSprite && actualPlayerSprite) {
      sdPairs.push([actualHazardSprite, actualPlayerSprite]);
      sdPairs.push([actualPlayerSprite, actualHazardSprite]);
    }
    for (var sdi = 0; sdi < sprites.length; sdi++) {
      for (var sdj = 0; sdj < sprites.length; sdj++) {
        if (sdi === sdj) continue;
        var pa = sprites[sdi], pb = sprites[sdj];
        var alreadyIn = sdPairs.some(function(p) { return p[0] === pa && p[1] === pb; });
        if (!alreadyIn) sdPairs.push([pa, pb]);
      }
    }
    var sayPatches = patchSayDurations(sprites, 0.1);
    for (var pi = 0; pi < Math.min(sdPairs.length, 3) && !scoreDecreases; pi++) {
      var sdA = sdPairs[pi][0], sdB = sdPairs[pi][1];
      sprites.forEach(function(s, idx) { s.setXY(-200 + idx * 200, -150); });
      runtime.stopAll();
      runtime.greenFlag();
      await waitMs(400);
      scoreObj.value = 10;
      sdA.setXY(sdB.x, sdB.y);
      // Poll every 100ms for up to 7s — covers 1s glide + up to 5s say + buffer
      for (var sdTick = 0; sdTick < 70 && !scoreDecreases; sdTick++) {
        await waitMs(100);
        if (Number(scoreObj.value) < 10) scoreDecreases = true;
      }
      runtime.stopAll();
      await waitMs(100);
    }
    unpatchSayDurations(sprites, sayPatches);
  }
  scoreDecreases = scoreDecreases || scoreDecreasesStatic;

  progress('final score', 9);
  var criteria = [
    criterionFromSpec('backdrop', underwaterBackdrop),
    criterionFromSpec('diver', hasDiver),
    criterionFromSpec('movement', movementScore >= 4, movementScore),
    criterionFromSpec('target', !!targetRandom),
    criterionFromSpec('scorePlus', scorePlusTotal >= 3, scorePlusTotal),
    criterionFromSpec('shark', hasShark),
    criterionFromSpec('sharkChase', sharkChases),
    criterionFromSpec('yum', sharkSays),
    criterionFromSpec('scoreMinus', scoreDecreases)
  ];
  var score = criteria.reduce(function(t, c) { return t + c.awarded; }, 0);
  var maxScore = (ASSESSMENTS[config.assessmentId] && ASSESSMENTS[config.assessmentId].maxScore) || 21;
  return { score: score, maxScore: maxScore, criteria: criteria };
}

function collectAssessmentScratchInfo(targets) {
  var counts = {}, fieldValues = [], keyFields = [], variableNames = [], changeVariableValues = [];
  targets.forEach(function(target) {
    target.info = collectAssessmentScratchInfoFromTarget(target);
    mergeAssessmentScratchInfo({ counts: counts, fieldValues: fieldValues, keyFields: keyFields, variableNames: variableNames, changeVariableValues: changeVariableValues }, target.info);
  });
  return { counts: counts, fieldValues: fieldValues, keyFields: keyFields, variableNames: variableNames, changeVariableValues: changeVariableValues };
}

function collectAssessmentScratchInfoFromTarget(target) {
  var counts = {}, fieldValues = [], keyFields = [], variableNames = [], changeVariableValues = [];
  Object.keys(target.variables || {}).forEach(function(id) {
    var v = target.variables[id];
    if (v && v.name) variableNames.push(normaliseScratchFieldValue(v.name));
  });
  var blocks = target.blocks && target.blocks._blocks ? target.blocks._blocks : {};
  Object.keys(blocks).forEach(function(id) {
    var b = blocks[id] || {};
    if (b.opcode) counts[b.opcode] = (counts[b.opcode] || 0) + 1;
    Object.keys(b.fields || {}).forEach(function(name) {
      var val = normaliseScratchFieldValue(scratchFieldValue(b.fields[name]));
      fieldValues.push(val);
      if (name === 'KEY_OPTION') keyFields.push(val);
      if (b.opcode === 'data_changevariableby' && name === 'VARIABLE') variableNames.push(val);
    });
    Object.keys(b.inputs || {}).forEach(function(name) {
      var input = b.inputs[name];
      var raw = Array.isArray(input) ? input.join(' ') : String(input || '');
      var val = normaliseScratchFieldValue(raw);
      fieldValues.push(val);
      if (b.opcode === 'data_changevariableby' && /-?1/.test(raw)) changeVariableValues.push(raw.indexOf('-') !== -1 ? '-1' : '1');
    });
  });
  return { counts: counts, fieldValues: fieldValues, keyFields: keyFields, variableNames: variableNames, changeVariableValues: changeVariableValues };
}

function mergeAssessmentScratchInfo(total, part) {
  Object.keys(part.counts || {}).forEach(function(op) {
    total.counts[op] = (total.counts[op] || 0) + part.counts[op];
  });
  total.fieldValues.push.apply(total.fieldValues, part.fieldValues || []);
  total.keyFields.push.apply(total.keyFields, part.keyFields || []);
  total.variableNames.push.apply(total.variableNames, part.variableNames || []);
  total.changeVariableValues.push.apply(total.changeVariableValues, part.changeVariableValues || []);
}

function findAssessmentVariable(targets, words) {
  var wanted = words ? words.map(normaliseScratchFieldValue) : null;
  var scratchDefault = normaliseScratchFieldValue('my variable');
  for (var ti = 0; ti < (targets || []).length; ti++) {
    var variables = targets[ti].variables || {};
    var ids = Object.keys(variables);
    for (var vi = 0; vi < ids.length; vi++) {
      var variable = variables[ids[vi]];
      var name = normaliseScratchFieldValue(variable && variable.name);
      if (!name || name === scratchDefault) continue;
      if (!wanted || wanted.some(function(word) { return name.indexOf(word) !== -1; })) return variable;
    }
  }
  return null;
}

function targetBlocks(target) {
  return target && target.blocks && target.blocks._blocks ? target.blocks._blocks : {};
}

// Returns only blocks reachable from a hat block (green flag, key press, etc.)
// Orphaned / disconnected scripts are excluded.
function getConnectedBlocks(target) {
  var allBlocks = targetBlocks(target);
  var hatOpcodes = {
    'event_whenflagclicked': true, 'event_whenkeypressed': true,
    'event_whenthisspriteclicked': true, 'event_whenstageclicked': true,
    'event_whenbackdropswitchesto': true, 'event_whengreaterthan': true,
    'event_whenbroadcastreceived': true, 'control_start_as_clone': true
  };
  var connected = Object.create(null);
  function visit(id) {
    if (!id || connected[id]) return;
    var block = allBlocks[id];
    if (!block) return;
    connected[id] = block;
    if (block.next) visit(block.next);
    Object.keys(block.inputs || {}).forEach(function(k) {
      var inp = block.inputs[k];
      if (!Array.isArray(inp)) return;
      inp.forEach(function(v) { if (typeof v === 'string' && allBlocks[v]) visit(v); });
    });
  }
  Object.keys(allBlocks).forEach(function(id) {
    var b = allBlocks[id];
    if (b && b.topLevel && hatOpcodes[b.opcode]) visit(id);
  });
  return connected;
}

// Wraps a target so that block-inspection helpers only see hat-connected blocks.
function connectedOnlyTarget(target) {
  return {
    name: target.name,
    sprite: target.sprite,
    variables: target.variables,
    blocks: { _blocks: getConnectedBlocks(target) }
  };
}

function targetHasAnyOpcode(target, opcodes) {
  var wanted = {};
  opcodes.forEach(function(op) { wanted[op] = true; });
  var blocks = targetBlocks(target);
  return Object.keys(blocks).some(function(id) {
    return !!wanted[(blocks[id] || {}).opcode];
  });
}

function scratchTargetNames(target) {
  var names = [];
  try {
    if (target.name) names.push(target.name);
    if (target.sprite && target.sprite.name) names.push(target.sprite.name);
    var costumes = target.getCostumes ? target.getCostumes() : ((target.sprite && target.sprite.costumes) || []);
    costumes.forEach(function(costume) { if (costume && costume.name) names.push(costume.name); });
  } catch(e) {}
  return names.map(normaliseScratchFieldValue).filter(Boolean);
}

function blockReadableText(target, block) {
  var parts = [block && block.opcode];
  Object.keys((block && block.fields) || {}).forEach(function(name) {
    parts.push(scratchFieldValue(block.fields[name]));
  });
  Object.keys((block && block.inputs) || {}).forEach(function(name) {
    parts.push(scratchInputReadableValue(target, block.inputs[name]));
  });
  return normaliseScratchFieldValue(parts.join(' '));
}

function scratchInputReadableValue(target, input) {
  var parts = [];
  var blocks = targetBlocks(target);
  function addBlock(id) {
    var b = blocks[id];
    if (!b) return;
    if (b.opcode) parts.push(b.opcode);
    Object.keys(b.fields || {}).forEach(function(name) { parts.push(scratchFieldValue(b.fields[name])); });
    Object.keys(b.inputs || {}).forEach(function(name) { parts.push(scratchInputReadableValue(target, b.inputs[name])); });
  }
  if (Array.isArray(input)) {
    input.forEach(function(part) {
      if (typeof part === 'string' && blocks[part]) addBlock(part);
      else if (Array.isArray(part)) parts.push(part.join(' '));
      else if (part != null && typeof part !== 'object') parts.push(part);
    });
  } else if (input != null) {
    parts.push(input);
  }
  return parts.join(' ');
}

function targetMentionsSprite(target, sprite) {
  var names = scratchTargetNames(sprite);
  if (!names.length) return false;
  var blocks = targetBlocks(target);
  return Object.keys(blocks).some(function(id) {
    var text = blockReadableText(target, blocks[id]);
    return names.some(function(name) { return name && text.indexOf(name) !== -1; });
  });
}

function targetHasTouchingSprite(target, sprite) {
  var names = scratchTargetNames(sprite);
  var blocks = targetBlocks(target);
  return Object.keys(blocks).some(function(id) {
    var block = blocks[id] || {};
    if (String(block.opcode || '').indexOf('sensing_touchingobject') !== 0) return false;
    var text = blockReadableText(target, block);
    return names.some(function(name) { return name && text.indexOf(name) !== -1; });
  });
}

function targetHasChaseTowardsSprite(target, sprite) {
  if (!targetMentionsSprite(target, sprite)) return false;
  var hasDirection = targetHasAnyOpcode(target, ['motion_pointtowards', 'motion_goto', 'motion_glideto']);
  var hasMovement = targetHasAnyOpcode(target, ['motion_movesteps', 'motion_goto', 'motion_glideto', 'motion_changexby', 'motion_changeyby', 'motion_setx', 'motion_sety']);
  return hasDirection && hasMovement;
}

function targetHasRandomPositionChange(target) {
  var blocks = targetBlocks(target);
  return Object.keys(blocks).some(function(id) {
    var block = blocks[id] || {};
    var opcode = block.opcode || '';
    var text = blockReadableText(target, block);
    if (opcode === 'motion_goto' || opcode === 'motion_glideto') {
      return text.indexOf('random') !== -1 || text.indexOf('operator random') !== -1;
    }
    if (opcode === 'motion_gotoxy' || opcode === 'motion_glidesecstoxy') {
      return text.indexOf('operator random') !== -1 || text.indexOf('pick random') !== -1;
    }
    return opcode === 'motion_gotorandom';
  });
}

function targetHasChangeVariableBy(target, variableWords, sign) {
  var blocks = targetBlocks(target);
  return Object.keys(blocks).some(function(id) {
    var block = blocks[id] || {};
    if (block.opcode !== 'data_changevariableby') return false;
    var variableName = normaliseScratchFieldValue(scratchFieldValue(block.fields && block.fields.VARIABLE));
    var variableOk = !variableWords || variableWords.some(function(word) { return variableName.indexOf(word) !== -1; });
    var rawValue = scratchInputReadableValue(target, block.inputs && block.inputs.VALUE);
    var numMatch = String(rawValue).match(/-?\d+(\.\d+)?/);
    var num = numMatch ? Number(numMatch[0]) : 0;
    var signOk = sign < 0 ? num < 0 || rawValue.indexOf('-') !== -1 : num > 0 || rawValue.indexOf('+') !== -1 || String(rawValue).trim() === '1';
    return variableOk && signOk;
  });
}

function findAssessmentSprite(sprites, words) {
  return sprites.find(function(sprite) { return spriteHasAnyWord(sprite, words); });
}

function spriteHasAnyWord(sprite, words) {
  var haystack = scratchSpriteSearchText(sprite);
  return words.some(function(word) { return haystack.indexOf(normaliseScratchFieldValue(word)) !== -1; });
}

function scratchSpriteSearchText(sprite) {
  var parts = [];
  try {
    if (sprite.name) parts.push(sprite.name);
    if (sprite.sprite && sprite.sprite.name) parts.push(sprite.sprite.name);
    var costumes = sprite.getCostumes ? sprite.getCostumes() : ((sprite.sprite && sprite.sprite.costumes) || []);
    costumes.forEach(function(costume) {
      if (costume.name) parts.push(costume.name);
      if (costume.assetId) parts.push(costume.assetId);
    });
  } catch(e) {}
  return normaliseScratchFieldValue(parts.join(' '));
}

function renderAssessmentFeedback(result, finalMode) {
  var html = '<div class="font-semibold mb-2">Score: ' + result.score + ' / ' + result.maxScore + '</div>';
  result.criteria.forEach(function(c) {
    html += '<div class="border-b border-gray-200 py-1"><div class="flex justify-between gap-3"><span>' + c.text + '</span><strong>' + c.awarded + '/' + c.marks + '</strong></div>';
    if (c.expected != null) {
      html += '<div class="text-xs text-gray-500 mt-1">Your answer: <span class="font-mono">' + escapeHtml(c.answer || '-') + '</span> · Expected: <span class="font-mono">' + escapeHtml(c.expected || '-') + '</span></div>';
    }
    html += '</div>';
  });
  document.getElementById(finalMode ? 'aps-final-rubric' : 'aps-feedback').innerHTML = html;
}

function scratchSnapshotWarningHtml(record) {
  if (!record || !record.scratchSnapshotStatus) return '';
  var status = record.scratchSnapshotStatus;
  if (status === 'saved') return '';
  var size = record.scratchSnapshotSizeBytes ? Math.ceil(record.scratchSnapshotSizeBytes / 1024) + ' KB' : 'unknown size';
  var message = record.scratchSnapshotWarning || 'The project snapshot could not be saved, but the AP score was saved.';
  if (status === 'saved_warn_size') message = record.scratchSnapshotWarning || 'The project snapshot was saved, but it was larger than expected.';
  return '<div class="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 text-yellow-900 px-3 py-2 text-sm">' +
    '<strong>Project snapshot:</strong> ' + escapeHtml(message) +
    ' <span class="text-yellow-700">(' + escapeHtml(size) + ' / 20 KB limit)</span></div>';
}

function showAssessmentCompleted(record) {
  var spec = ASSESSMENTS[assessment.assessmentId] || {};
  var maxScore = record.maxScore || spec.maxScore || 21;
  assessment.completed = true;
  if (typeof removeApUnloadGuard === 'function') removeApUnloadGuard();
  if (assessment.localScratchSb3Timer) {
    clearInterval(assessment.localScratchSb3Timer);
    assessment.localScratchSb3Timer = null;
  }
  if (assessment.localSb3ChangeTimer) {
    clearTimeout(assessment.localSb3ChangeTimer);
    assessment.localSb3ChangeTimer = null;
  }
  if (assessment.individualForced && state.db && state.uid) {
    var _completedAt = Date.now();
    if (state.className) {
      state.db.ref('classes/' + state.className + '/forcedAPAssignments/' + state.uid).update({
        state: 'completed', completedAt: _completedAt
      }).catch(function() {});
    }
    state.db.ref('progress/' + state.uid + '/forcedAPAssignment').update({
      state: 'completed', completedAt: _completedAt
    }).catch(function() {});
  }
  document.getElementById('ap-student-screen').classList.remove('hidden');
  document.getElementById('aps-active').classList.add('hidden');
  document.getElementById('aps-finished').classList.remove('hidden');
  var _toggleBtn = document.getElementById('btn-ap-toggle-instructions');
  if (_toggleBtn) _toggleBtn.classList.add('hidden');
  document.getElementById('btn-ap-student-exit').classList.toggle('hidden', !!assessment.forced);
  document.getElementById('aps-final-score').textContent = (assessment.debugMode ? 'Debug score: ' : 'Score: ') + (record.score || 0) + ' / ' + maxScore;
  renderAssessmentFeedback({ score: record.score || 0, maxScore: maxScore, criteria: record.rubric || [] }, true);
  var rubricBox = document.getElementById('aps-final-rubric');
  if (rubricBox && record.scratchSnapshotStatus) rubricBox.insertAdjacentHTML('afterbegin', scratchSnapshotWarningHtml(record));
  // Offer a direct (localStorage-only) download of the student's own project if one was saved
  var downloadSb3Btn = document.getElementById('btn-ap-download-my-sb3');
  if (downloadSb3Btn) {
    var _completedLobby = assessment.lobbyCode;
    if (!assessment.debugMode && typeof hasLocalApScratchSb3 === 'function' && hasLocalApScratchSb3(_completedLobby)) {
      downloadSb3Btn.classList.remove('hidden');
      downloadSb3Btn.onclick = function() { downloadOwnApScratchSb3(_completedLobby); };
    } else {
      downloadSb3Btn.classList.add('hidden');
      downloadSb3Btn.onclick = null;
    }
  }
  var feedbackBox = document.getElementById('aps-class-feedback');
  if (assessment.debugMode) {
    if (feedbackBox) { feedbackBox.classList.add('hidden'); feedbackBox.innerHTML = ''; }
  } else {
    watchReleasedAssessmentFeedback(record);
  }
}

document.getElementById('btn-ap-student-exit').onclick = function() {
  exitAssessmentStudent({ removePlayer: false });
};

document.getElementById('btn-ap-student-home').onclick = function() {
  returnToLessonsFromCompletedAssessment();
};

function returnToLessonsFromCompletedAssessment() {
  if (assessment.saveTimer) clearInterval(assessment.saveTimer);
  assessment.saveTimer = null;
  if (assessment.localScratchSb3Timer) clearInterval(assessment.localScratchSb3Timer);
  assessment.localScratchSb3Timer = null;
  if (assessment.questionAutosaveTimer) clearTimeout(assessment.questionAutosaveTimer);
  assessment.questionAutosaveTimer = null;
  if (assessment.studentListener && assessment.studentListenerRef) assessment.studentListenerRef.off('value', assessment.studentListener);
  if (assessment.activeClientRef && assessment.activeClientListener) assessment.activeClientRef.off('value', assessment.activeClientListener);
  if (assessment.feedbackRef && assessment.feedbackListener) assessment.feedbackRef.off('value', assessment.feedbackListener);
  assessment.studentListener = null;
  assessment.activeClientRef = null;
  assessment.activeClientListener = null;
  assessment.feedbackListener = null;
  assessment.feedbackRef = null;
  document.getElementById('ap-student-screen').classList.add('hidden');
  assessment.debugMode = false;
}

function exitAssessmentStudent(opts) {
  opts = opts || {};
  if (assessment.forced && !opts.keepForced) return;
  if (typeof removeApUnloadGuard === 'function') removeApUnloadGuard();
  if (assessment.saveTimer) clearInterval(assessment.saveTimer);
  assessment.saveTimer = null;
  if (assessment.localScratchSb3Timer) clearInterval(assessment.localScratchSb3Timer);
  assessment.localScratchSb3Timer = null;
  if (assessment.localSb3ChangeTimer) clearTimeout(assessment.localSb3ChangeTimer);
  assessment.localSb3ChangeTimer = null;
  if (assessment.projectChangeTimer) clearTimeout(assessment.projectChangeTimer);
  assessment.projectChangeTimer = null;
  if (assessment.questionAutosaveTimer) clearTimeout(assessment.questionAutosaveTimer);
  assessment.questionAutosaveTimer = null;
  assessment.projectChangeListener = null;
  if (assessment.studentListener && assessment.studentListenerRef) assessment.studentListenerRef.off('value', assessment.studentListener);
  if (assessment.activeClientRef && assessment.activeClientListener) assessment.activeClientRef.off('value', assessment.activeClientListener);
  if (assessment.feedbackRef && assessment.feedbackListener) assessment.feedbackRef.off('value', assessment.feedbackListener);
  assessment.activeClientRef = null;
  assessment.activeClientListener = null;
  assessment.feedbackRef = null;
  assessment.feedbackListener = null;
  document.getElementById('ap-student-screen').classList.add('hidden');
  assessment.sessionRef = null;
  assessment.responseRef = null;
  assessment.forced = false;
  assessment.individualForced = false;
  assessment.debugMode = false;
}
