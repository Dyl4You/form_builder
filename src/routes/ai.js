// ───────────────────────────────────────────────────────────────
// src/routes/ai.js  (text prompt → components)
// ───────────────────────────────────────────────────────────────
require('dotenv').config();

const router  = require('express').Router();
const OpenAI  = require('openai').OpenAI;
const openai  = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const fs            = require('fs');
const axios         = require('axios');
const FormData      = require('form-data');
const { teiToJson } = require('../utils/teiToJson.js');
const { pdfToComponents } = require('../parser/unifiedParser.js');  // already exists

/* only types your builder understands */
const ALLOWED_TYPES = new Set([
  'textarea','radio','select','selectboxes','file',
  'phoneNumber','address','asset','account','number','currency',
  'datetime','date','time',
  'fieldset','columns','editgrid','speed','quiz','survey',
  'disclaimer', "content", 'textfield'
]);

const SYSTEM_PROMPT = `You are a Form.io form generator.
   • Reply with ONLY a JSON object whose root has array "components".
   • Every component’s type MUST be one of:
   ${[...ALLOWED_TYPES].join(', ')}
   • Optional keys per component:
    label • components • values / data.values • mode
    validate • placeholder • conditional • customConditional
    calculateValue • defaultValue • disabled • persistent
   • For *radio*, *select*, *selectboxes*: use
       "conditional": { "when": "<triggerKey>", "eq": "<value>", "show": true }
       • Only include a conditional when the user explicitly requests it.
   • For *survey* components only: use *customConditional* instead of *conditional*.
   • use *customConditional* instead of *conditional*
      • **do NOT add sub-components** – instead provide  
        "questions": [ { "label": "Question 1", "value": "q1" }, … ] and  
        "values":    [ { "label": "Score 1",   "value": "1"  }, … ].
        • ** 'values' MUST contain at least one answer option; never leave it empty.**
   • **If the user shows you a component that already has a "key", return the
     UPDATED component with the SAME "key" property. Never invent a new key
     for that component.**
   • No prose, no comments, no extra keys.
   keys need to be camelcase
   for calculateValues declare it using value = `.trim();



/* ── ✱ NEW: helper that silently drops unknown component types ── */
function scrubTypes(arr) {
  return arr.filter(c => {
    if (!ALLOWED_TYPES.has(c.type)) return false;        // skip strangers
    if (Array.isArray(c.components)) c.components = scrubTypes(c.components);
    return true;
  });
}

/* unchanged: strict validator (runs AFTER we scrub) */
function validateComponentTypes(arr, path='components') {
  arr.forEach((c,i) => {
    if (!ALLOWED_TYPES.has(c.type)) {
      throw `Unsupported component type “${c.type}” at ${path}[${i}]`;
    }
    if (Array.isArray(c.components)) {
      validateComponentTypes(c.components, `${path}[${i}].components`);
    }
  });
}

function validatePayload(obj) {
  if (!obj || typeof obj !== 'object')  throw 'Model returned non-object JSON';
  if (!Array.isArray(obj.components))   throw 'No “components” array present';
  validateComponentTypes(obj.components);
  return obj;
}

/* ✱ NEW (or restore): make sure MODEL is defined before use */
const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

router.post('/api/ai/generate', async (req,res) => {
  const { prompt, current } = req.body;
  if (!prompt) return res.status(400).json({ error:'prompt required' });
  const existingJson = current && current.components ? current : { components: [] };

  try {
    const completion = await openai.chat.completions.create({
  model: MODEL,
  temperature: 0.15,
  max_tokens: 4096,
  messages: [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "assistant", content: JSON.stringify(existingJson) },
    { role: "user", content: prompt }
  ]
});


const rawObj = JSON.parse(completion.choices[0].message.content);
    rawObj.components = scrubTypes(rawObj.components);      // ← line to add
    const payload = validatePayload(rawObj);

    res.json(payload);

  } catch (err) {
    console.error('AI route error:', err);
    res.status(422).json({ error: err.message || 'Unknown error', code: err.code || 422 });
  }
});

// ───────────────────────────────────────────────────────────────
// PDF upload  →  GROBID  →  TEI → components
// ───────────────────────────────────────────────────────────────
router.post('/api/ai/upload', async (req, res) => {
  try {
    // 0 ▸ pdf file must already be attached by Multer (req.files.file)
    const file = req.files?.file;
    if (!file) return res.status(400).json({ error: 'no file' });

    /* 1 ▸ push PDF to the local GROBID service */
    const fd = new FormData();
    fd.append('input', fs.createReadStream(file.path));

    const { data: tei } = await axios.post(
      'http://localhost:8070/api/processFulltextDocument' +
      '?consolidateHeader=1&consolidateCitations=1',
      fd,
      { headers: fd.getHeaders(), timeout: 30000 }
    );

    /* 2 ▸ TEI XML → tidy JSON we can reason about */
    const doc = teiToJson(tei);

    /* 3 ▸ Your existing helper turns JSON (+ optional prompt) → Form.io components */
    const prompt      = req.body.prompt || '';
    const components  = await pdfToComponents({ doc, prompt });

    res.json({ meta: doc, components });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    // always delete the uploaded tmp file
    if (req?.files?.file?.path) fs.unlink(req.files.file.path, () => {});
  }
});



module.exports = router;
