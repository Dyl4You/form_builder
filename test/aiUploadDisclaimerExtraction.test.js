const test = require('node:test');
const assert = require('node:assert/strict');

const aiUploadRouter = require('../src/routes/aiUpload');

const {
  extractDisclaimerBlocksFromRawText,
  buildDisclaimerHtml,
  normalizeDisclaimerTextFragment,
  sanitizeDisclaimerVisionHtml,
  normalizeVisionDisclaimerPayload,
  scoreDisclaimerExtraction
} = aiUploadRouter._private;

test('extractDisclaimerBlocksFromRawText removes generic headers and joins wrapped disclaimer lines', () => {
  const rawText = [
    'Disclaimer',
    'All workers must wear fall protection',
    'while operating on elevated surfaces.',
    '',
    'Report unsafe conditions',
    'to the site supervisor immediately.'
  ].join('\n');

  assert.deepEqual(
    extractDisclaimerBlocksFromRawText(rawText),
    [
      'All workers must wear fall protection while operating on elevated surfaces.',
      'Report unsafe conditions to the site supervisor immediately.'
    ]
  );
});

test('extractDisclaimerBlocksFromRawText preserves headings and bullet items for structured notices', () => {
  const rawText = [
    'Purpose',
    'To prevent eye injuries caused by flying particles, dust,',
    'debris, chemicals, or splashes.',
    'To ensure eye protection is worn correctly whenever eye',
    'hazards are present.',
    '',
    'Hazards',
    '• Flying debris from cutting, grinding, drilling, or',
    'fastening',
    '• Dust and insulation fibres entering the eyes',
    '• Chemical splashes from adhesives, sealants, or cleaning products'
  ].join('\n');

  assert.deepEqual(
    extractDisclaimerBlocksFromRawText(rawText),
    [
      'Purpose',
      'To prevent eye injuries caused by flying particles, dust, debris, chemicals, or splashes.',
      'To ensure eye protection is worn correctly whenever eye hazards are present.',
      'Hazards',
      '• Flying debris from cutting, grinding, drilling, or fastening',
      '• Dust and insulation fibres entering the eyes',
      '• Chemical splashes from adhesives, sealants, or cleaning products'
    ]
  );
});

test('extractDisclaimerBlocksFromRawText splits OCR bullet glyphs that were collapsed onto one line', () => {
  const rawText = [
    'Purpose',
    'To prevent eye injuries caused by flying particles, dust, debris, chemicals, or splashes.',
    '',
    'Hazards',
    '«Flying debris from cutting, grinding, drilling, or fastening «Dust and insulation fibres entering the eyes «Chemical splashes from adhesives, sealants, or cleaning products'
  ].join('\n');

  assert.deepEqual(
    extractDisclaimerBlocksFromRawText(rawText),
    [
      'Purpose',
      'To prevent eye injuries caused by flying particles, dust, debris, chemicals, or splashes.',
      'Hazards',
      '• Flying debris from cutting, grinding, drilling, or fastening',
      '• Dust and insulation fibres entering the eyes',
      '• Chemical splashes from adhesives, sealants, or cleaning products'
    ]
  );
});

test('extractDisclaimerBlocksFromRawText treats plus signs as bullet items', () => {
  const rawText = [
    'Hazards',
    '+ Flying debris from cutting, grinding, drilling, or fastening',
    '+ Dust and insulation fibres entering the eyes',
    '+ Chemical splashes from adhesives, sealants, or cleaning products'
  ].join('\n');

  assert.deepEqual(
    extractDisclaimerBlocksFromRawText(rawText),
    [
      'Hazards',
      '• Flying debris from cutting, grinding, drilling, or fastening',
      '• Dust and insulation fibres entering the eyes',
      '• Chemical splashes from adhesives, sealants, or cleaning products'
    ]
  );
});

test('extractDisclaimerBlocksFromRawText normalizes OCR pipes that should be a leading I', () => {
  const rawText = [
    '| confirm that I have reviewed and completed today’s required safety checklist honestly and accurately.',
    '',
    '| acknowledge that I am responsible for following all safety procedures while performing my work duties.'
  ].join('\n');

  assert.deepEqual(
    extractDisclaimerBlocksFromRawText(rawText),
    [
      'I confirm that I have reviewed and completed today\'s required safety checklist honestly and accurately.',
      'I acknowledge that I am responsible for following all safety procedures while performing my work duties.'
    ]
  );
});

test('normalizeDisclaimerTextFragment fixes leading OCR pipes in html-friendly text too', () => {
  assert.equal(
    normalizeDisclaimerTextFragment('<p>| confirm that I have reviewed the checklist.</p><p>| acknowledge my responsibilities.</p>'),
    '<p>I confirm that I have reviewed the checklist.</p><p>I acknowledge my responsibilities.</p>'
  );
});

test('buildDisclaimerHtml escapes extracted disclaimer blocks into paragraph markup', () => {
  assert.equal(
    buildDisclaimerHtml([
      'Wear gloves & eye protection.',
      'Do not enter <restricted> areas without approval.'
    ]),
    '<p>Wear gloves &amp; eye protection.</p><p>Do not enter &lt;restricted&gt; areas without approval.</p>'
  );
});

test('buildDisclaimerHtml renders headings and bullet items with structure', () => {
  assert.equal(
    buildDisclaimerHtml([
      'Purpose',
      'To prevent eye injuries caused by flying particles, dust, debris, chemicals, or splashes.',
      'To ensure eye protection is worn correctly whenever eye hazards are present.',
      'Hazards',
      '• Flying debris from cutting, grinding, drilling, or fastening',
      '• Dust and insulation fibres entering the eyes'
    ]),
    '<p><strong>Purpose</strong></p><p>To prevent eye injuries caused by flying particles, dust, debris, chemicals, or splashes.</p><p>To ensure eye protection is worn correctly whenever eye hazards are present.</p><p><strong>Hazards</strong></p><ul><li>Flying debris from cutting, grinding, drilling, or fastening</li><li>Dust and insulation fibres entering the eyes</li></ul>'
  );
});

test('sanitizeDisclaimerVisionHtml preserves safe table markup and drops unsafe attributes', () => {
  assert.equal(
    sanitizeDisclaimerVisionHtml(
      '<table class="x"><thead><tr><th style="color:red" onclick="alert(1)" scope="col">Types</th><th scope="col">Protect Against</th></tr></thead><tbody><tr><td colspan="2">Heat</td></tr></tbody></table><script>alert(1)</script>'
    ),
    '<table><thead><tr><th scope="col">Types</th><th scope="col">Protect Against</th></tr></thead><tbody><tr><td colspan="2">Heat</td></tr></tbody></table>'
  );
});

test('normalizeVisionDisclaimerPayload keeps table html for disclaimer screenshots', () => {
  const result = normalizeVisionDisclaimerPayload({
    html: '<p><strong>Hand and Arm Protection Examples</strong></p><table><thead><tr><th scope="col">Types of gloves</th><th scope="col">Protect Against</th></tr></thead><tbody><tr><td>Neoprene, rubber or vinyl</td><td>Most chemicals</td></tr></tbody></table>',
    hasTable: true
  });

  assert.equal(result.hasTable, true);
  assert.match(result.html, /<table>/);
  assert.match(result.html, /<th scope="col">Types of gloves<\/th>/);
  assert.match(result.html, /<td>Most chemicals<\/td>/);
});

test('scoreDisclaimerExtraction prefers table-rich html over flattened text', () => {
  const flat = {
    blocks: [
      'Here are some examples: surfaces /Aluminized fabrics of nylon, Heat rayon, asbestos, wool or glass objects/materials sharp instruments Insulated material often made |Electric shocks and burns leather gloves Note: To protect yourself properly from chemical products, it is a good idea to contact the supplier or manufacturer.'
    ],
    html: buildDisclaimerHtml([
      'Here are some examples: surfaces /Aluminized fabrics of nylon, Heat rayon, asbestos, wool or glass objects/materials sharp instruments Insulated material often made |Electric shocks and burns leather gloves Note: To protect yourself properly from chemical products, it is a good idea to contact the supplier or manufacturer.'
    ])
  };
  const rich = normalizeVisionDisclaimerPayload({
    html: '<p>Here are some examples:</p><table><thead><tr><th scope="col">Types of gloves</th><th scope="col">Protect Against</th></tr></thead><tbody><tr><td>Neoprene, rubber or vinyl</td><td>Most chemicals</td></tr><tr><td>Thick leather</td><td>Welding, rough surfaces</td></tr></tbody></table>'
  });

  assert.ok(scoreDisclaimerExtraction(rich) > scoreDisclaimerExtraction(flat));
});
