require('dotenv').config();

const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const sharp = require('sharp');
const { createWorker } = require('tesseract.js');
const { OpenAI } = require('openai');

const { getPublicAiFeatures } = require('../config/runtimeConfig');
const { ALLOWED_TYPES, ensureComponentsPayload, scrubComponents } = require('../utils/formio');
const { normalizeGeneratedComponents } = require('../utils/aiExtractionConfig');
const {
  buildDisclaimerHtml,
  extractDisclaimerBlocksFromRawText,
  normalizeDisclaimerTextFragment,
  normalizeVisionDisclaimerPayload,
  sanitizeDisclaimerVisionHtml,
  scoreDisclaimerExtraction
} = require('../utils/disclaimerExtraction');

const MIN_LEN = 200;
const INLINE_BULLET_SPLIT_RE = /\s+(?=[•●▪■□◦○·∙⋅‣⁃◘◙◉⚫⚪▫⦁◆◇◻◽«»‹›¬¢＋+\-*])/u;
const MAX_UPLOAD_TEXT_LENGTH = 20000;
const MAX_EXTRACTION_TEXT_LENGTH = 8000;
const OPTION_CHECKBOX_MARKER_RE = /(?:\[\s*[xX]?\s*\]|[□☐◻◽☑✓])/gu;
const OPTION_COLUMN_SPLIT_RE = /\s{2,}(?=[A-Z0-9(])/g;
const OPTION_CONTINUATION_ENDINGS = new Set([
  'a',
  'an',
  'and',
  'for',
  'from',
  'in',
  'indicate',
  'of',
  'on',
  'or',
  'side',
  'the',
  'to',
  'under',
  'with',
  'without'
]);

const SYSTEM_PROMPT_UPLOAD = `
You are a Form.io form generator.

- Reply with JSON only.
- Return a single JSON object whose root contains a "components" array.
- Prefer textarea rows=1 over textfield for short plain-text fields.
- Group related fields into fieldsets when the source clearly has sections.
- Use editgrid or datagrid for clear tabular structures.
- If the extracted text is mostly narrative and does not look like fillable fields, return one disclaimer/content component containing the text as HTML paragraphs or bullet lists.
- Keep keys camelCase.
- Use only these component types: ${[...ALLOWED_TYPES].join(', ')}.
`.trim();

const IMAGE_EXTRACTION_PROMPTS = {
  options: `
You clean OCR text copied from an image of option labels.

- Return JSON only in the shape {"options":["..."]}.
- Keep the original wording as closely as possible.
- Remove numbering, bullets, duplicates, section headings, and obvious noise.
- Do not invent missing options.
`.trim(),
  survey: `
You clean OCR text copied from an image of survey question labels.

- Return JSON only in the shape {"options":["..."]}.
- Keep each survey question as one item.
- Remove numbering, bullets, duplicates, section headings, and obvious noise.
- Do not invent missing questions.
`.trim()
  ,
  componentGroup: `
You clean OCR text copied from an image of repeated checklist or field-group question labels.

- Return JSON only in the shape {"options":["..."]}.
- Extract only the actual question or row labels.
- Ignore shared answer choices or legends such as Yes, No, N/A, Not Applicable, Pass, Fail, Safe, At Risk, and notes/comments instructions.
- If a line contains a question label followed by answer choices or "explain in notes", keep only the label portion.
- Remove numbering, bullets, duplicates, section headings, and OCR noise.
- Do not invent or paraphrase missing questions.
`.trim()
};

const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const router = express.Router();
const tmpDir = path.join(__dirname, '../../tmp');

fs.mkdirSync(tmpDir, { recursive: true });

const upload = multer({ dest: tmpDir });

let workerPromise = null;

function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker();
      await worker.load();
      await worker.loadLanguage('eng');
      await worker.initialize('eng');
      return worker;
    })();
  }

  return workerPromise;
}

function cleanupTempFile(filePath) {
  if (!filePath) return;
  fs.unlink(filePath, () => {});
}

function buildDisabledResponse(res, message) {
  return res.status(410).json({ error: message });
}

function normalizeText(text) {
  return String(text || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

function normalizeCandidateLine(line) {
  return normalizeText(line)
    .replace(/^[•●▪■□◦○·∙⋅‣⁃◘◙◉⚫⚪▫⦁◆◇◻◽«»‹›¬¢＋+\-*]+\s*/u, '')
    .replace(/^(?:\(?\d{1,3}\)?|[A-Za-z])[.)-:]\s+/u, '')
    .replace(/^\[[^\]]*\]\s*/u, '')
    .replace(/[;,]+\s*$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLineCandidates(rawText) {
  const seen = new Set();
  const items = [];

  normalizeText(rawText)
    .split('\n')
    .flatMap((line) => String(line || '').split(INLINE_BULLET_SPLIT_RE))
    .map(normalizeCandidateLine)
    .filter(Boolean)
    .forEach((line) => {
      const key = line.toLowerCase();
      if (seen.has(key)) return;
      if (!/[A-Za-z0-9]/.test(line)) return;
      if (line.length < 2) return;
      if (/^(?:options?|questions?|survey|choices?|select all that apply|check all that apply)$/i.test(line)) return;
      seen.add(key);
      items.push(line);
    });

  return items.slice(0, 40);
}

function splitOptionSegmentsFromLine(rawLine) {
  const line = normalizeText(rawLine);
  if (!line) return [];

  const replacedCheckboxes = line.replace(OPTION_CHECKBOX_MARKER_RE, '\n');
  const sourceParts = replacedCheckboxes.includes('\n')
    ? replacedCheckboxes.split(/\n+/)
    : line.split(OPTION_COLUMN_SPLIT_RE);

  return sourceParts
    .map(normalizeCandidateLine)
    .filter(Boolean);
}

function shouldAppendOptionContinuation(candidate) {
  const normalized = normalizeCandidateLine(candidate);
  if (!normalized) return false;
  if (/^(?:options?|questions?|survey|choices?)$/i.test(normalized)) return false;
  if (/[?!.:]$/u.test(normalized)) return false;

  const words = normalized.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 3) return false;
  if (normalized.length > 24) return false;
  if (!/[a-z]/.test(normalized)) return false;
  if (/\b(?:yes|no|n\/a|na|pass|fail|other|notes?)\b/i.test(normalized)) return false;

  return words.every((word) => /^[A-Za-z]+$/u.test(word));
}

function findOptionContinuationTarget(items, recentIndexes = []) {
  if (!recentIndexes.length) return -1;

  for (const index of recentIndexes) {
    const value = String(items[index] || '').trim();
    const lastWord = value.toLowerCase().split(/\s+/).pop();
    if (OPTION_CONTINUATION_ENDINGS.has(lastWord)) {
      return index;
    }
  }

  return recentIndexes[0];
}

function extractOptionCandidates(rawText) {
  const seen = new Set();
  const items = [];
  let recentSegmentIndexes = [];

  normalizeText(rawText)
    .split('\n')
    .forEach((rawLine) => {
      const segments = splitOptionSegmentsFromLine(rawLine);

      if (!segments.length) {
        recentSegmentIndexes = [];
        return;
      }

      if (segments.length === 1 && shouldAppendOptionContinuation(segments[0])) {
        const targetIndex = findOptionContinuationTarget(items, recentSegmentIndexes);
        if (targetIndex >= 0) {
          const mergedValue = normalizeCandidateLine(`${items[targetIndex]} ${segments[0]}`);
          const mergedKey = mergedValue.toLowerCase();
          seen.delete(String(items[targetIndex] || '').toLowerCase());
          items[targetIndex] = mergedValue;
          seen.add(mergedKey);
          return;
        }
      }

      const addedIndexes = [];
      segments.forEach((segment) => {
        const key = segment.toLowerCase();
        if (seen.has(key)) return;
        if (!/[A-Za-z0-9]/.test(segment)) return;
        if (segment.length < 2) return;
        if (/^(?:options?|questions?|survey|choices?|select all that apply|check all that apply)$/i.test(segment)) return;
        seen.add(key);
        items.push(segment);
        addedIndexes.push(items.length - 1);
      });

      recentSegmentIndexes = addedIndexes.length > 1 ? addedIndexes : [];
    });

  return items.slice(0, 40);
}

async function recognizeTextFromImageBuffer(buffer) {
  const worker = await getWorker();
  const preparedBuffer = await sharp(buffer)
    .rotate()
    .resize({ width: 2200, withoutEnlargement: true })
    .grayscale()
    .normalize()
    .toBuffer();

  const result = await worker.recognize(preparedBuffer);
  return normalizeText(result?.data?.text || '');
}

async function extractTextFromPdf(filePath) {
  const raw = fs.readFileSync(filePath);
  const text = normalizeText((await pdfParse(raw)).text);
  return text.length >= MIN_LEN ? text : text;
}

async function extractTextFromUpload(file) {
  const ext = path.extname(String(file?.originalname || '')).toLowerCase();
  const filePath = file?.path;

  if (!filePath) {
    throw new Error('uploaded file is missing');
  }

  if (ext === '.pdf') {
    return extractTextFromPdf(filePath);
  }

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({
      buffer: fs.readFileSync(filePath)
    });
    return normalizeText(result.value);
  }

  if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff'].includes(ext)) {
    return recognizeTextFromImageBuffer(fs.readFileSync(filePath));
  }

  throw new Error('unsupported file type');
}

async function refineExtractedItems(rawText, kind) {
  const fallback = kind === 'options'
    ? extractOptionCandidates(rawText)
    : extractLineCandidates(rawText);
  const prompt = IMAGE_EXTRACTION_PROMPTS[kind] || IMAGE_EXTRACTION_PROMPTS.options;
  const aiFeatures = getPublicAiFeatures();
  const useAiRefinement = Boolean(
    aiFeatures.imageExtractionAiRefinement
    && openai
    && normalizeText(rawText)
  );

  if (!useAiRefinement) {
    return fallback;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: normalizeText(rawText).slice(0, MAX_EXTRACTION_TEXT_LENGTH) }
      ]
    });

    const payload = JSON.parse(completion.choices[0]?.message?.content || '{}');
    const options = Array.isArray(payload.options)
      ? payload.options.map((item) => normalizeCandidateLine(item)).filter(Boolean)
      : [];

    return options.length ? options.slice(0, 40) : fallback;
  } catch (error) {
    console.warn('image extraction fallback:', error?.message || error);
    return fallback;
  }
}

async function extractDisclaimerPayload(rawText) {
  const blocks = extractDisclaimerBlocksFromRawText(rawText);
  const html = buildDisclaimerHtml(blocks);
  return normalizeVisionDisclaimerPayload({
    source: 'ocr',
    content: normalizeText(rawText),
    blocks,
    html,
    hasTable: /<table[\s>]/i.test(html)
  });
}

router.post('/api/ai/options-from-image', upload.single('file'), async (req, res) => {
  if (!getPublicAiFeatures().imageExtraction) {
    cleanupTempFile(req.file?.path);
    return buildDisabledResponse(res, 'Image text extraction is disabled for this deployment.');
  }

  if (!req.file) return res.status(400).json({ error: 'file required' });

  try {
    const kind = String(req.body?.kind || 'options').trim().toLowerCase();
    const text = await extractTextFromUpload(req.file);

    if (!text) {
      return res.status(422).json({ error: 'No text was found in that image.' });
    }

    if (kind === 'disclaimer') {
      return res.json(await extractDisclaimerPayload(text));
    }

    const normalizedKind = ['survey', 'componentGroup', 'options'].includes(kind)
      ? kind
      : 'options';
    const options = await refineExtractedItems(text, normalizedKind);
    return res.json({
      source: 'ocr',
      kind: normalizedKind,
      options
    });
  } catch (error) {
    console.error('image extraction error:', error);
    return res.status(500).json({ error: error.message || 'image extraction failed' });
  } finally {
    cleanupTempFile(req.file?.path);
  }
});

router.post('/api/ai/upload', upload.single('file'), async (req, res) => {
  if (!getPublicAiFeatures().fileUpload) {
    cleanupTempFile(req.file?.path);
    return buildDisabledResponse(res, 'File upload is disabled for this deployment.');
  }

  if (!req.file) return res.status(400).json({ error: 'file required' });
  if (!openai) return res.status(503).json({ error: 'OPENAI_API_KEY is required for AI uploads.' });

  try {
    const text = (await extractTextFromUpload(req.file)).slice(0, MAX_UPLOAD_TEXT_LENGTH);
    const userPrompt = normalizeText(req.body?.prompt || '');

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT_UPLOAD },
      { role: 'user', content: `### FILE TEXT\n${text}` }
    ];

    if (userPrompt) {
      messages.push({ role: 'user', content: `### INSTRUCTIONS\n${userPrompt}` });
    }

    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      max_tokens: 8000,
      response_format: { type: 'json_object' },
      messages
    });

    const rawObj = JSON.parse(completion.choices[0]?.message?.content || '{}');
    const payload = ensureComponentsPayload({
      components: scrubComponents(normalizeGeneratedComponents(rawObj))
    });

    return res.json(payload);
  } catch (error) {
    console.error('AI upload error:', error);
    return res.status(500).json({ error: error.message || 'upload failed' });
  } finally {
    cleanupTempFile(req.file?.path);
  }
});

module.exports = router;
module.exports._private = {
  buildDisclaimerHtml,
  extractLineCandidates,
  extractOptionCandidates,
  extractDisclaimerBlocksFromRawText,
  normalizeDisclaimerTextFragment,
  normalizeVisionDisclaimerPayload,
  sanitizeDisclaimerVisionHtml,
  scoreDisclaimerExtraction
};
