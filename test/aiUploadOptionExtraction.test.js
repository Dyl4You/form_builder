const test = require('node:test');
const assert = require('node:assert/strict');

const aiUploadRouter = require('../src/routes/aiUpload');

const {
  extractOptionCandidates
} = aiUploadRouter._private;

test('extractOptionCandidates splits checkbox rows into separate options and rejoins wrapped fragments', () => {
  const rawText = [
    '[] Safety glasses with side [] Eye wash station [] Shield adjacent workers',
    'shields',
    '[] Goggles [] Face Shield [] Other (indicate under Notes)'
  ].join('\n');

  assert.deepEqual(
    extractOptionCandidates(rawText),
    [
      'Safety glasses with side shields',
      'Eye wash station',
      'Shield adjacent workers',
      'Goggles',
      'Face Shield',
      'Other (indicate under Notes)'
    ]
  );
});

test('extractOptionCandidates still falls back to simple one-per-line options when no checkbox markers exist', () => {
  const rawText = [
    'Options',
    'Hard hat',
    'Safety vest',
    'Safety vest',
    'Gloves'
  ].join('\n');

  assert.deepEqual(
    extractOptionCandidates(rawText),
    [
      'Hard hat',
      'Safety vest',
      'Gloves'
    ]
  );
});
