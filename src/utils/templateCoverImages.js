const OpenAI = require('openai').OpenAI;
let sharp = null;
let Tesseract = null;
try {
  sharp = require('sharp');
} catch {
  sharp = null;
}
try {
  Tesseract = require('tesseract.js');
} catch {
  Tesseract = null;
}

const TYPE_LABELS = {
  choiceList: 'choice list',
  datagrid: 'data grid',
  datetime: 'date and time field',
  editgrid: 'editable grid',
  phoneNumber: 'phone field',
  selectboxes: 'multi-select group',
  textfield: 'text field'
};

const STRUCTURAL_TYPES = new Set(['columns', 'fieldset']);
const NON_REPRESENTATIVE_TYPES = new Set(['content']);
const DOCUMENT_METADATA_PATTERNS = [
  /\bversion\b/i,
  /\brevision\b/i,
  /\brev(?:ision)?\s*#/i,
  /\bapproval\b/i,
  /\bapproved by\b/i,
  /\bform\s*(?:#|number)\b/i,
  /\bdocument\s*(?:#|number)\b/i,
  /\beffective date\b/i,
  /\bissue date\b/i,
  /\bplease sign\b/i,
  /\bsign the acknowledgement form\b/i
];
const SYMBOLIC_TITLE_HINT_PATTERN = /\b(report|checklist|form|log|record|assessment|plan|permit|procedure|worksheet|acknowledg(?:e|ement)|inspection)\b/i;
const COVER_TEXT_REJECTION_PROMPT =
  'Never render the template title, any field label, or any word as visible text inside the artwork.';
const MIN_ALPHA_TEXT_TOKEN_LENGTH = 3;
const MIN_NUMERIC_TEXT_TOKEN_LENGTH = 2;
const SAFETY_FRIENDLY_REPLACEMENTS = [
  [/\bviolence\b/gi, 'safety'],
  [/\bviolent\b/gi, 'safety'],
  [/\bharassment\b/gi, 'respect'],
  [/\babuse\b/gi, 'protection'],
  [/\bassault\b/gi, 'protection'],
  [/\bincident\b/gi, 'event'],
  [/\baccident\b/gi, 'event'],
  [/\bcollision\b/gi, 'vehicle event'],
  [/\bcrash\b/gi, 'vehicle event'],
  [/\bdamage\b/gi, 'asset care'],
  [/\binjury\b/gi, 'safety'],
  [/\bmedical\b/gi, 'health'],
  [/\btreatment\b/gi, 'care'],
  [/\bhospital\b/gi, 'care'],
  [/\bpatient\b/gi, 'person'],
  [/\billness\b/gi, 'health'],
  [/\bfatality\b/gi, 'loss prevention'],
  [/\bdeath\b/gi, 'loss prevention'],
  [/\bblood\b/gi, 'safety'],
  [/\bwound\b/gi, 'safety'],
  [/\brefusal\b/gi, 'acknowledgement'],
  [/\bdiscipline\b/gi, 'standards'],
  [/\bcomplaint\b/gi, 'concern'],
  [/\bgrievance\b/gi, 'concern']
];
const TEXT_REVIEW_SYSTEM_PROMPT = [
  'You review generated cover illustrations for a template-card house style.',
  'Reject the image if it contains any words, letters, numbers, captions, labels, logos, pseudo-text, forms, checklists, tables, document panels, UI cards, screens, or multi-panel layouts.',
  'Reject the image if it visibly renders the template title or any readable title words inside the artwork.',
  'Simple nonverbal icon marks such as check marks, arrows, shields, gears, hazard triangles, or a single exclamation mark are allowed if they appear as part of the illustration and there are no words or label blocks.',
  'Reject the image if it has multiple competing hero subjects, feels like a collage, or looks like an interface or document instead of cover art.',
  'Accept the image if it is a clean single-scene line illustration with one dominant subject, a transparent or visually clean background, and no text or UI/document fragments.',
  'Return compact JSON only in this shape: {"accept":true|false,"reasons":["short reason"]}.'
].join(' ');

function isExplicitlyEnabled(value) {
  return ['1', 'true', 'on', 'yes', 'enabled'].includes(String(value || '').trim().toLowerCase());
}

function isExplicitlyDisabled(value) {
  return ['0', 'false', 'off', 'no', 'disabled'].includes(String(value || '').trim().toLowerCase());
}

function normalizeComponentType(type) {
  const raw = String(type || '').trim();
  if (!raw) return '';
  if (TYPE_LABELS[raw]) return TYPE_LABELS[raw];
  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();
}

function normalizeLabel(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function normalizeSnippet(value, maxLength = 120) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function sanitizeSafetyCue(value, maxLength = 80) {
  let text = normalizeSnippet(stripHtml(value), maxLength);
  if (!text) return '';
  SAFETY_FRIENDLY_REPLACEMENTS.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });
  return normalizeLabel(text);
}

function buildLowercaseTokenSet(value) {
  return new Set(
    normalizeLabel(value)
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.replace(/[^a-z0-9]+/g, ''))
      .filter((token) => token.length >= 2)
  );
}

function uniqueTokens(tokens = []) {
  const seen = new Set();
  const out = [];

  tokens.forEach((token) => {
    const normalized = String(token || '')
      .trim()
      .toLowerCase();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  });

  return out;
}

function extractMeaningfulTextTokens(value, options = {}) {
  const titleTokens = options.titleTokens instanceof Set
    ? options.titleTokens
    : new Set();

  return uniqueTokens(
    String(value || '')
      .split(/[^A-Za-z0-9]+/g)
      .map((token) => token.trim())
      .filter((token) => {
        if (!token) return false;
        const lower = token.toLowerCase();
        if (titleTokens.has(lower) && lower.length >= 2) return true;
        if (/[a-z]/i.test(token)) return token.length >= MIN_ALPHA_TEXT_TOKEN_LENGTH;
        if (/\d/.test(token)) return token.length >= MIN_NUMERIC_TEXT_TOKEN_LENGTH;
        return false;
      })
  );
}

function getOcrWordConfidence(word) {
  const numeric = Number(word?.confidence ?? word?.conf ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

async function prepareTemplateCoverForTextDetection(buffer) {
  if (!sharp || !Buffer.isBuffer(buffer)) return buffer;

  const pipeline = sharp(buffer).rotate().flatten({
    background: { r: 0, g: 0, b: 0, alpha: 1 }
  });
  const meta = await pipeline.metadata();
  const targetWidth = Math.max(Number(meta?.width) || 0, 2048);

  return pipeline
    .resize({
      width: targetWidth,
      withoutEnlargement: false
    })
    .grayscale()
    .normalise()
    .sharpen()
    .threshold(140)
    .negate()
    .png()
    .toBuffer();
}

function normalizeCoverTextDetection(result, options = {}) {
  const titleTokens = options.titleTokens instanceof Set
    ? options.titleTokens
    : new Set();

  if (result && typeof result === 'object' && 'data' in result) {
    const rawText = String(result.data?.text || '');
    const wordTokens = (result.data?.words || [])
      .filter((word) => getOcrWordConfidence(word) >= 25)
      .flatMap((word) => extractMeaningfulTextTokens(word?.text, { titleTokens }));
    const fallbackTokens = extractMeaningfulTextTokens(rawText, { titleTokens });
    const tokens = uniqueTokens([...wordTokens, ...fallbackTokens]);

    return {
      verified: true,
      hasText: tokens.length > 0,
      tokens,
      rawText,
      reasons: tokens.length ? [`ocr-visible-text:${tokens.join(' ')}`] : []
    };
  }

  if (typeof result === 'string') {
    const tokens = extractMeaningfulTextTokens(result, { titleTokens });
    return {
      verified: true,
      hasText: tokens.length > 0,
      tokens,
      rawText: result,
      reasons: tokens.length ? [`ocr-visible-text:${tokens.join(' ')}`] : []
    };
  }

  if (!result || typeof result !== 'object') {
    return {
      verified: false,
      hasText: true,
      tokens: [],
      rawText: '',
      reasons: ['ocr-unavailable']
    };
  }

  const rawText = String(result.rawText || result.text || '');
  const explicitTokens = Array.isArray(result.tokens) ? result.tokens : [];
  const tokens = uniqueTokens([
    ...explicitTokens,
    ...extractMeaningfulTextTokens(rawText, { titleTokens })
  ]);
  const hasExplicitText = typeof result.hasText === 'boolean'
    ? result.hasText
    : tokens.length > 0;

  return {
    verified: result.verified !== false,
    hasText: hasExplicitText || tokens.length > 0,
    tokens,
    rawText,
    reasons: Array.isArray(result.reasons) && result.reasons.length
      ? result.reasons.map((reason) => normalizeSnippet(reason, 80)).filter(Boolean)
      : ((hasExplicitText || tokens.length > 0) ? [`ocr-visible-text:${tokens.join(' ') || 'detected'}`] : [])
  };
}

async function detectTemplateCoverText(options = {}) {
  const titleTokens = buildLowercaseTokenSet(options.displayName || options.name || '');

  if (typeof options.textDetector === 'function') {
    return normalizeCoverTextDetection(
      await options.textDetector(options),
      { titleTokens }
    );
  }

  if (!Tesseract?.recognize || !Buffer.isBuffer(options.buffer)) {
    return {
      verified: false,
      hasText: true,
      tokens: [],
      rawText: '',
      reasons: ['ocr-unavailable']
    };
  }

  try {
    const preparedBuffer = await prepareTemplateCoverForTextDetection(options.buffer);
    const result = await Tesseract.recognize(preparedBuffer, 'eng', {
      tessedit_pageseg_mode: Tesseract.PSM?.SPARSE_TEXT ?? 11,
      preserve_interword_spaces: '1',
      logger: () => {}
    });

    return normalizeCoverTextDetection(result, { titleTokens });
  } catch (err) {
    return {
      verified: false,
      hasText: true,
      tokens: [],
      rawText: '',
      reasons: [`ocr-error:${normalizeSnippet(err?.message || err, 80) || 'unknown'}`]
    };
  }
}

function stripCodeFences(value) {
  const text = String(value || '').trim();
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

function parseJsonObject(value) {
  const text = stripCodeFences(value);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function collectComponentLabels(nodes, acc = [], seen = new Set()) {
  if (!Array.isArray(nodes) || acc.length >= 8) return acc;

  nodes.forEach((node) => {
    if (!node || typeof node !== 'object' || acc.length >= 8) return;

    const type = String(node.type || '').trim();
    const label = normalizeLabel(node.label || node.title || node.legend || '');
    if (type && !STRUCTURAL_TYPES.has(type) && !NON_REPRESENTATIVE_TYPES.has(type) && label) {
      const key = `${type}:${label.toLowerCase()}`;
      if (!seen.has(key)) {
        acc.push(`${normalizeComponentType(type)} "${label}"`);
        seen.add(key);
      }
    }

    if (Array.isArray(node.components)) {
      collectComponentLabels(node.components, acc, seen);
    }

    if (type === 'columns' && Array.isArray(node.columns)) {
      node.columns.forEach((column) => {
        collectComponentLabels(column?.components, acc, seen);
      });
    }
  });

  return acc;
}

function isDocumentMetadataSnippet(value) {
  const text = normalizeSnippet(stripHtml(value), 160);
  if (!text) return true;
  if (DOCUMENT_METADATA_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }

  const colonCount = (text.match(/:/g) || []).length;
  const numericGroupCount = (text.match(/\b\d[\d,./-]*\b/g) || []).length;

  return colonCount >= 2 && numericGroupCount >= 2;
}

function collectContentSnippets(nodes, acc = [], seen = new Set()) {
  if (!Array.isArray(nodes) || acc.length >= 6) return acc;

  nodes.forEach((node) => {
    if (!node || typeof node !== 'object' || acc.length >= 6) return;

    const snippetCandidates = [
      node.content,
      node.html,
      node.description,
      node.tooltip,
      node.placeholder
    ];

    snippetCandidates.forEach((candidate) => {
      if (acc.length >= 6) return;
      const snippet = normalizeSnippet(stripHtml(candidate));
      if (!snippet || snippet.length < 8) return;
      if (isDocumentMetadataSnippet(snippet)) return;
      const key = snippet.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      acc.push(`"${snippet}"`);
    });

    if (Array.isArray(node.components)) {
      collectContentSnippets(node.components, acc, seen);
    }

    if (Array.isArray(node.columns)) {
      node.columns.forEach((column) => {
        collectContentSnippets(column?.components, acc, seen);
      });
    }
  });

  return acc;
}

function summarizeComponentBreakdown(entries = []) {
  return (entries || [])
    .map((entry) => ({
      type: normalizeComponentType(entry?.type),
      count: Math.max(0, Number(entry?.count) || 0)
    }))
    .filter((entry) => entry.type && entry.count > 0)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.type.localeCompare(b.type);
    })
    .slice(0, 6)
    .map((entry) => `${entry.count} ${entry.type}${entry.count === 1 ? '' : 's'}`);
}

function buildSharedTemplateCoverArtDirectionLines() {
  return [
    'Create a transparent cover illustration for a template library card inside a dark, premium form-builder UI.',
    'The card already has a deep slate-to-navy gradient background, soft blue bloom, subtle glass border, and a light scrim.',
    'The artwork must sit on top of that existing card treatment and must not generate its own background.',
    'Use the same house style for every cover in the library so the whole set feels deliberately designed.',
    'Style: precise vector-like monoline illustration, cool white linework only, subtle double-contour accents, restrained technical drawing, editorial product-icon feel, minimal and premium, readable at small size.',
    'Composition: one centered hero object, one thin baseline, and two or three soft contour echo lines behind it.',
    'Keep generous negative space and safe margins.',
    'The main object should occupy roughly the center 60 to 70 percent of the frame.',
    'If a secondary detail is needed, keep it very small and directly related.',
    'Output: a transparent source image with true alpha transparency. Every non-drawn pixel must be fully transparent.',
    'Do not create a photo, realistic scene, paper texture, beige wash, sepia tone, pencil background, sky, landscape, lighting backdrop, gradients, filled background, glow cloud, collage, or multiple competing objects.'
  ];
}

function buildTemplateCoverPrompt(input = {}) {
  const displayName = normalizeLabel(input.displayName || input.name || 'Untitled Template');
  const componentMix = summarizeComponentBreakdown(input.componentBreakdown);
  const componentLabels = collectComponentLabels(input.json?.components || []);
  const contentSnippets = collectContentSnippets(input.json?.components || []);

  const promptLines = [
    ...buildSharedTemplateCoverArtDirectionLines(),
    `Template title: "${displayName}".`,
    componentMix.length
      ? `The form uses: ${componentMix.join(', ')}.`
      : 'The form should feel structured, useful, and easy to understand.',
    componentLabels.length
      ? `Representative fields: ${componentLabels.join(', ')}.`
      : '',
    contentSnippets.length
      ? `Template content cues: ${contentSnippets.join(', ')}.`
      : '',
    'Base only the subject choice on the template title, the representative fields, and the template content cues.',
    COVER_TEXT_REJECTION_PROMPT,
    'Depict one single dominant symbol that represents the real-world subject of the template.',
    'Ignore the paperwork aspect of the template and represent the underlying topic instead.',
    'The main object must carry most of the visual weight and stay clearly more prominent than any secondary detail.',
    'Simplify the subject into an iconic silhouette rather than a busy literal scene.',
    'Do not use any color other than white linework.',
    'Do not include words, letters, numbers, timestamps, captions, labels, logos, or typography of any kind.',
    'Do not depict forms, papers, clipboards, dashboards, spec sheets, control panels, screens, cards, or table-like layouts.',
    'Do not add extra props unless they are essential to the single main subject.',
    'Avoid heavy fills. If any shading is used, keep it extremely light, sparse, and line-based.',
    'Unused pixels must remain transparent.',
    'Keep the image clean and readable at small card sizes.',
    'Do not show UI screenshots, browser chrome, wireframes, logos, watermarks, or legible text.',
    'Avoid clutter. Use strong composition, depth, and negative space.'
  ].filter(Boolean);

  return promptLines.join(' ');
}

function buildSafetyFriendlyTemplateCoverPrompt(input = {}) {
  const displayName = sanitizeSafetyCue(input.displayName || input.name || 'Workplace Compliance');
  const componentMix = summarizeComponentBreakdown(input.componentBreakdown);

  const promptLines = [
    ...buildSharedTemplateCoverArtDirectionLines(),
    `Safe theme: "${displayName || 'Workplace Compliance'}".`,
    componentMix.length
      ? `The form uses: ${componentMix.join(', ')}.`
      : 'The form should feel structured, useful, and easy to understand.',
    'This template may involve a sensitive or regulated topic. Interpret it as a neutral workplace-compliance, safety, or reporting concept.',
    'Represent it with one calm symbolic object or emblem rather than a literal scene.',
    'Prefer neutral iconography such as a shield, seal, beacon, route marker, abstract equipment silhouette, or structured safety symbol when relevant to the theme.',
    'Do not depict conflict, harassment, injury, medical procedures, damaged property, crashes, weapons, bodily harm, or emotional distress.',
    COVER_TEXT_REJECTION_PROMPT,
    'Depict one single dominant symbol that represents the safe theme.',
    'Simplify the subject into an iconic silhouette rather than a busy literal scene.',
    'Do not use any color other than white linework.',
    'Do not include words, letters, numbers, timestamps, captions, labels, logos, or typography of any kind.',
    'Do not depict forms, papers, clipboards, dashboards, spec sheets, control panels, screens, cards, or table-like layouts.',
    'Avoid heavy fills. If any shading is used, keep it extremely light, sparse, and line-based.',
    'Unused pixels must remain transparent.',
    'Keep the image clean and readable at small card sizes.',
    'Do not show UI screenshots, browser chrome, wireframes, logos, watermarks, or legible text.',
    'Avoid clutter. Use strong composition, depth, and negative space.'
  ].filter(Boolean);

  return promptLines.join(' ');
}

function buildSymbolicTemplateCoverPrompt(input = {}) {
  const displayName = normalizeLabel(input.displayName || input.name || 'Workplace Compliance');
  const componentMix = summarizeComponentBreakdown(input.componentBreakdown);

  const promptLines = [
    ...buildSharedTemplateCoverArtDirectionLines(),
    `Theme: "${displayName}".`,
    componentMix.length
      ? `The form uses: ${componentMix.join(', ')}.`
      : 'The form should feel structured, useful, and easy to understand.',
    'Represent only the underlying real-world subject of the template, not the paperwork, report, checklist, or data-entry aspect.',
    'If the title contains words like report, checklist, form, log, record, assessment, plan, permit, procedure, worksheet, acknowledgement, or inspection, treat those words as metadata and ignore them visually.',
    'Choose one single iconic object, marker, structure, or emblem connected to the theme.',
    'If the subject feels abstract, use a neutral symbolic object such as a field marker, shield, beacon, caution emblem, equipment silhouette, or site marker.',
    'Never show a clipboard, paper, form, checklist, dashboard, panel, table, stamp, or any layout with boxes, rows, or labels.',
    COVER_TEXT_REJECTION_PROMPT,
    'Simplify the subject into an iconic silhouette rather than a busy literal scene.',
    'Do not use any color other than white linework.',
    'Do not include words, letters, numbers, timestamps, captions, labels, logos, or typography of any kind.',
    'Avoid heavy fills. If any shading is used, keep it extremely light, sparse, and line-based.',
    'Unused pixels must remain transparent.',
    'Keep generous negative space and safe margins so the artwork stays readable even when the card crop feels tight.',
    'Keep the image clean and readable at small card sizes.',
    'Do not show UI screenshots, browser chrome, wireframes, logos, watermarks, or legible text.',
    'Avoid clutter. Use strong composition, depth, and negative space.'
  ].filter(Boolean);

  return promptLines.join(' ');
}

function shouldPreferSymbolicPrompt(input = {}) {
  const displayName = normalizeLabel(input.displayName || input.name || '');
  if (!displayName) return false;
  return SYMBOLIC_TITLE_HINT_PATTERN.test(displayName);
}

function buildRetryPrompt(basePrompt, reasons = []) {
  const summarizedReasons = (reasons || [])
    .map((reason) => normalizeSnippet(reason, 80))
    .filter(Boolean)
    .slice(0, 3);

  if (!summarizedReasons.length) {
    return `${basePrompt} Retry note: The previous attempt included forbidden text or document-like layout. Regenerate from scratch with one dominant main object, clean negative space, and absolutely no text, panels, or forms.`;
  }

  return `${basePrompt} Retry note: The previous attempt was rejected because it contained: ${summarizedReasons.join(', ')}. Regenerate from scratch with one dominant main object, clean negative space, and absolutely no text, panels, or forms.`;
}

function toDataUrl(buffer, contentType = 'image/png') {
  return `data:${contentType};base64,${Buffer.from(buffer).toString('base64')}`;
}

function isSafetyRejection(err) {
  const message = [
    err?.message,
    err?.error?.message,
    err?.response?.data?.error?.message
  ].filter(Boolean).join(' ').toLowerCase();
  const status = Number(err?.statusCode || err?.status || err?.response?.status || 0);
  return message.includes('safety system') || (status === 400 && message.includes('safety'));
}

function isDocumentStyleRejection(reasons = []) {
  const text = (reasons || []).join(' ').toLowerCase();
  return /(text|label|document|clipboard|panel|form|checklist|table|grid|screen|ui|layout|competing subjects|multiple|collage)/.test(text);
}

async function reviewTemplateCoverCandidate(client, options = {}) {
  const reviewModel = String(options.reviewModel || '').trim();
  if (!reviewModel || typeof client?.chat?.completions?.create !== 'function') {
    return { accept: true, reasons: [] };
  }

  try {
    const review = await client.chat.completions.create({
      model: reviewModel,
      temperature: 0,
      max_tokens: 120,
      messages: [
        { role: 'system', content: TEXT_REVIEW_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Review this generated cover image. Reject visible words, letters, numbers, pseudo-text, template-title text, panel, form, checklist, UI-like layout, document-like layout, collage, or composition without one clear dominant subject. Accept simple nonverbal icon marks that are part of the illustration.'
            },
            {
              type: 'image_url',
              image_url: {
                url: toDataUrl(options.buffer, options.contentType || 'image/png'),
                detail: 'low'
              }
            }
          ]
        }
      ]
    });

    const parsed = parseJsonObject(review?.choices?.[0]?.message?.content);
    if (!parsed || typeof parsed.accept !== 'boolean') {
      return { accept: true, reasons: [] };
    }

    return {
      accept: parsed.accept,
      reasons: Array.isArray(parsed.reasons)
        ? parsed.reasons.map((reason) => normalizeSnippet(reason, 80)).filter(Boolean)
        : []
    };
  } catch {
    return { accept: true, reasons: [] };
  }
}

function createTemplateCoverGenerator(options = {}) {
  const logger = options.logger === undefined ? console : options.logger;
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY || '';
  const hasTextVerificationSupport = typeof options.textDetector === 'function' || Boolean(Tesseract?.recognize);
  const enabled = options.enabled == null
    ? Boolean(apiKey)
      && hasTextVerificationSupport
      && !isExplicitlyDisabled(process.env.OPENAI_TEMPLATE_COVERS)
    : Boolean(options.enabled);

  if (!enabled || !apiKey) {
    const disabledGenerator = async () => null;
    disabledGenerator.isEnabled = false;
    return disabledGenerator;
  }

  const openai = options.client || new OpenAI({ apiKey });
  const model = options.model || process.env.OPENAI_TEMPLATE_COVER_MODEL || process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
  const reviewModel = options.reviewModel || process.env.OPENAI_TEMPLATE_COVER_REVIEW_MODEL || process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const size = options.size || process.env.OPENAI_TEMPLATE_COVER_SIZE || '1536x1024';
  const quality = options.quality || process.env.OPENAI_TEMPLATE_COVER_QUALITY || 'low';
  const outputFormat = options.outputFormat || process.env.OPENAI_TEMPLATE_COVER_OUTPUT_FORMAT || 'png';
  const outputCompression = Math.max(0, Math.min(100, Number(options.outputCompression || process.env.OPENAI_TEMPLATE_COVER_COMPRESSION) || 82));
  const maxAttempts = Math.max(1, Number.parseInt(options.maxAttempts || process.env.OPENAI_TEMPLATE_COVER_MAX_ATTEMPTS || '', 10) || 3);

  const generateTemplateCover = async function generateTemplateCover(input = {}) {
    const basePrompt = buildTemplateCoverPrompt(input);
    const safetyFriendlyPrompt = buildSafetyFriendlyTemplateCoverPrompt(input);
    const symbolicPrompt = buildSymbolicTemplateCoverPrompt(input);
    if (!basePrompt) return null;

    try {
      let retryReasons = [];
      let activePromptBase = shouldPreferSymbolicPrompt(input) && symbolicPrompt
        ? symbolicPrompt
        : basePrompt;
      let useRetryPrompt = false;
      let usedSafetyFallback = false;
      let usedSymbolicFallback = activePromptBase === symbolicPrompt;

      for (let attempt = 0; attempt < maxAttempts;) {
        const prompt = useRetryPrompt ? buildRetryPrompt(activePromptBase, retryReasons) : activePromptBase;
        const request = {
          model,
          prompt,
          size,
          quality,
          background: 'transparent',
          moderation: 'auto',
          output_format: outputFormat
        };
        if (outputFormat !== 'png') {
          request.output_compression = outputCompression;
        }

        let response;
        try {
          response = await openai.images.generate(request);
        } catch (err) {
          if (isSafetyRejection(err) && !usedSafetyFallback && safetyFriendlyPrompt) {
            usedSafetyFallback = true;
            activePromptBase = safetyFriendlyPrompt;
            useRetryPrompt = false;
            if (logger?.warn) {
              logger.warn(`[template-cover] switching to safety-friendly prompt template=${String(input?.templateId || '').trim() || 'unknown'}`);
            }
            continue;
          }
          throw err;
        }

        attempt += 1;
        const image = response?.data?.[0];
        if (!image?.b64_json) {
          return null;
        }

        const sourceBuffer = Buffer.from(image.b64_json, 'base64');
        const review = await reviewTemplateCoverCandidate(openai, {
          reviewModel,
          buffer: sourceBuffer,
          contentType: outputFormat === 'jpeg' ? 'image/jpeg' : `image/${outputFormat}`
        });

        if (!review.accept) {
          retryReasons = review.reasons;
          if (isDocumentStyleRejection(retryReasons) && !usedSymbolicFallback && symbolicPrompt) {
            usedSymbolicFallback = true;
            activePromptBase = symbolicPrompt;
            useRetryPrompt = false;
            if (logger?.warn) {
              logger.warn(`[template-cover] switching to symbolic prompt template=${String(input?.templateId || '').trim() || 'unknown'}`);
            }
            continue;
          }
          useRetryPrompt = true;
          if (logger?.warn) {
            logger.warn(`[template-cover] rejected candidate template=${String(input?.templateId || '').trim() || 'unknown'} attempt=${attempt} reasons=${retryReasons.join('; ') || 'text-or-layout'}`);
          }
          continue;
        }

        const textDetection = await detectTemplateCoverText({
          buffer: sourceBuffer,
          contentType: outputFormat === 'jpeg' ? 'image/jpeg' : `image/${outputFormat}`,
          displayName: input.displayName || input.name || '',
          textDetector: options.textDetector
        });

        if (!textDetection.verified || textDetection.hasText) {
          retryReasons = textDetection.reasons.length
            ? textDetection.reasons
            : ['ocr-visible-text'];

          if (!usedSymbolicFallback && symbolicPrompt) {
            usedSymbolicFallback = true;
            activePromptBase = symbolicPrompt;
            useRetryPrompt = false;
            if (logger?.warn) {
              logger.warn(`[template-cover] switching to symbolic prompt template=${String(input?.templateId || '').trim() || 'unknown'}`);
            }
            continue;
          }

          useRetryPrompt = true;
          if (logger?.warn) {
            logger.warn(`[template-cover] rejected candidate template=${String(input?.templateId || '').trim() || 'unknown'} attempt=${attempt} reasons=${retryReasons.join('; ')}`);
          }
          continue;
        }

        const buffer = sharp
          ? await sharp(sourceBuffer)
            .resize({
              width: 1280,
              height: 768,
              fit: 'contain',
              position: 'center',
              background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .webp({ quality: outputCompression, alphaQuality: 100 })
            .toBuffer()
          : sourceBuffer;
        const contentType = sharp
          ? 'image/webp'
          : (outputFormat === 'jpeg' ? 'image/jpeg' : `image/${outputFormat}`);

        return {
          buffer,
          contentType,
          prompt,
          model,
          updatedAt: new Date().toISOString()
        };
      }

      if (logger?.warn) {
        logger.warn(`[template-cover] no acceptable candidate for template=${String(input?.templateId || '').trim() || 'unknown'} after ${maxAttempts} attempts`);
      }
      return null;
    } catch (err) {
      if (logger?.warn) {
        logger.warn(`[template-cover] generation failed: ${err?.message || err}`);
      }
      return null;
    }
  };
  generateTemplateCover.isEnabled = true;
  return generateTemplateCover;
}

module.exports = {
  buildTemplateCoverPrompt,
  createTemplateCoverGenerator
};
