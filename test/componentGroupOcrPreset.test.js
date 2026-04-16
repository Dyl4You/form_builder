const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function extractFunctionSource(source, functionName) {
  const signature = `function ${functionName}(`;
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `Could not find ${functionName} in source`);

  const paramsStart = source.indexOf('(', start);
  assert.notEqual(paramsStart, -1, `Could not find opening paren for ${functionName}`);

  let paramsDepth = 0;
  let bodyStart = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') paramsDepth += 1;
    if (char === ')') {
      paramsDepth -= 1;
      if (paramsDepth === 0) {
        bodyStart = source.indexOf('{', index);
        break;
      }
    }
  }

  assert.notEqual(bodyStart, -1, `Could not find opening brace for ${functionName}`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Could not find closing brace for ${functionName}`);
}

function loadComponentGroupOcrPresetHarness() {
  const source = fs.readFileSync(require.resolve('../public/js/modalHelpers.js'), 'utf8');
  const presetConstStart = source.indexOf('const OCR_CHECKLIST_RESPONSE_PRESETS =');
  assert.notEqual(presetConstStart, -1, 'Could not find OCR_CHECKLIST_RESPONSE_PRESETS');
  const presetConstEnd = source.indexOf(');', presetConstStart);
  assert.notEqual(presetConstEnd, -1, 'Could not find end of OCR_CHECKLIST_RESPONSE_PRESETS');
  const presetConstSource = source.slice(presetConstStart, presetConstEnd + 2);

  const responseNoiseConstStart = source.indexOf('const COMPONENT_GROUP_RESPONSE_NOISE_PATTERNS =');
  assert.notEqual(responseNoiseConstStart, -1, 'Could not find COMPONENT_GROUP_RESPONSE_NOISE_PATTERNS');
  const responseNoiseConstEnd = source.indexOf(']);', responseNoiseConstStart);
  assert.notEqual(responseNoiseConstEnd, -1, 'Could not find end of COMPONENT_GROUP_RESPONSE_NOISE_PATTERNS');
  const responseNoiseConstSource = source.slice(responseNoiseConstStart, responseNoiseConstEnd + 3);

  const cleanupCandidateSource = extractFunctionSource(source, 'cleanupComponentGroupOcrLabelCandidate');
  const stripNoiseSource = extractFunctionSource(source, 'stripComponentGroupResponseNoise');
  const countNoiseSource = extractFunctionSource(source, 'countComponentGroupResponseNoiseMatches');
  const normalizeLabelLineSource = extractFunctionSource(source, 'normalizeComponentGroupOcrLabelLine');
  const componentGroupNoiseSource = extractFunctionSource(source, 'isLikelyComponentGroupOcrNoise');
  const filterComponentGroupLinesSource = extractFunctionSource(source, 'filterComponentGroupOcrLines');
  const normalizeSource = extractFunctionSource(source, 'normalizeChecklistPresetToken');
  const extractSource = extractFunctionSource(source, 'extractChecklistPresetFromLines');

  const context = {};
  vm.runInNewContext(`
${presetConstSource}
${responseNoiseConstSource}
${cleanupCandidateSource}
${stripNoiseSource}
${countNoiseSource}
${normalizeLabelLineSource}
${componentGroupNoiseSource}
${filterComponentGroupLinesSource}
${normalizeSource}
${extractSource}
this.normalizeComponentGroupOcrLabelLine = normalizeComponentGroupOcrLabelLine;
this.filterComponentGroupOcrLines = filterComponentGroupOcrLines;
this.extractChecklistPresetFromLines = extractChecklistPresetFromLines;
  `, context);

  return context;
}

test('component group OCR detects pass/fail checklist columns and strips them from labels', () => {
  const { extractChecklistPresetFromLines } = loadComponentGroupOcrPresetHarness();

  const result = extractChecklistPresetFromLines([
    'Clean, level ground',
    'Pass',
    'Fail',
    'N/A',
    'Adequate ramps',
    'Pass',
    'Fail',
    'N/A'
  ]);

  assert.equal(result.presetKey, 'passFailNa');
  assert.deepEqual(Array.from(result.labels), ['Pass', 'Fail', 'N/A']);
  assert.deepEqual(Array.from(result.filteredLines), [
    'Clean, level ground',
    'Adequate ramps'
  ]);
});

test('component group OCR leaves labels unchanged when no checklist preset is present', () => {
  const { extractChecklistPresetFromLines } = loadComponentGroupOcrPresetHarness();

  const result = extractChecklistPresetFromLines([
    'Clean, level ground',
    'Adequate ramps',
    'Adequate stairs'
  ]);

  assert.equal(result.presetKey, null);
  assert.deepEqual(Array.from(result.labels), []);
  assert.deepEqual(Array.from(result.filteredLines), [
    'Clean, level ground',
    'Adequate ramps',
    'Adequate stairs'
  ]);
});

test('component group OCR strips noisy pass-fail legend rows and keeps only question labels', () => {
  const { extractChecklistPresetFromLines } = loadComponentGroupOcrPresetHarness();

  const result = extractChecklistPresetFromLines([
    'Clean, level ground',
    '[] Pass O Fail (mE',
    'Adequate ramps',
    'Adequate stairs',
    'Adequate ladders'
  ]);

  assert.equal(result.presetKey, 'passFailNa');
  assert.deepEqual(Array.from(result.labels), ['Pass', 'Fail', 'N/A']);
  assert.deepEqual(Array.from(result.filteredLines), [
    'Clean, level ground',
    'Adequate ramps',
    'Adequate stairs',
    'Adequate ladders'
  ]);
});

test('component group OCR removes checklist response tokens from mixed label lines', () => {
  const { extractChecklistPresetFromLines } = loadComponentGroupOcrPresetHarness();

  const result = extractChecklistPresetFromLines([
    'Clean, level ground Pass Fail N/A',
    'Adequate ramps Pass Fail N/A'
  ]);

  assert.equal(result.presetKey, 'passFailNa');
  assert.deepEqual(Array.from(result.filteredLines), [
    'Clean, level ground',
    'Adequate ramps'
  ]);
});

test('component group OCR drops fragmented short-token junk after checklist cleanup', () => {
  const { extractChecklistPresetFromLines } = loadComponentGroupOcrPresetHarness();

  const result = extractChecklistPresetFromLines([
    'Clean, level ground',
    'Adequate ramps',
    'Adequate stairs',
    'Adequate ladders',
    'S I J O O',
    'Pass',
    'Fail',
    'N/A'
  ]);

  assert.equal(result.presetKey, 'passFailNa');
  assert.deepEqual(Array.from(result.filteredLines), [
    'Clean, level ground',
    'Adequate ramps',
    'Adequate stairs',
    'Adequate ladders'
  ]);
});

test('component group OCR drops stray short-token junk even without a checklist preset', () => {
  const { filterComponentGroupOcrLines } = loadComponentGroupOcrPresetHarness();

  const filtered = filterComponentGroupOcrLines([
    'Clean, level ground',
    'J J',
    'Adequate ramps',
    'Adequate stairs',
    'Adequate ladders'
  ]);

  assert.deepEqual(Array.from(filtered), [
    'Clean, level ground',
    'Adequate ramps',
    'Adequate stairs',
    'Adequate ladders'
  ]);
});

test('component group OCR trims shared option suffixes after the question text', () => {
  const { normalizeComponentGroupOcrLabelLine } = loadComponentGroupOcrPresetHarness();

  assert.equal(
    normalizeComponentGroupOcrLabelLine('Hard hats worn when/where required? explain in notes'),
    'Hard hats worn when/where required?'
  );

  assert.equal(
    normalizeComponentGroupOcrLabelLine('Fall protection worn when/where required? Not Applicable explain in notes'),
    'Fall protection worn when/where required?'
  );
});
