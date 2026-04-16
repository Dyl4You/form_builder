require('dotenv').config();

const router = require('express').Router();
const { OpenAI } = require('openai');
const { getPublicAiFeatures } = require('../config/runtimeConfig');

const {
  ALLOWED_TYPES,
  scrubComponents,
  ensureComponentsPayload
} = require('../utils/formio');
const { normalizeGeneratedComponents } = require('../utils/aiExtractionConfig');
const {
  BLUEPRINT_GUIDANCE,
  getPromptBlueprintEnrichment,
  getPromptBlueprintContext
} = require('../utils/aiBlueprints');
const { createUserQuotaMiddleware } = require('../security/requestSecurity');

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;
const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

const SYSTEM_PROMPT = `
You are a Form.io form generator.

• Reply with **ONLY** a JSON object whose root has an array called **"components"**.
• The builder already has a root fieldset/grouping. Do not create another top-level "Grouping" fieldset unless the user explicitly asks for a nested grouping section.

• Every component’s **type** MUST be one of:
  ${[...ALLOWED_TYPES].join(', ')}

• Optional keys per component
  label • components • values / data.values • mode
  validate • placeholder • conditional • customConditional
  calculateValue • defaultValue • disabled • persistent • multiple

• For **radio**, **select**, **selectboxes** use
  "conditional": { "when": "<triggerKey>", "eq": "<value>", "show": true }
  (include a conditional only when the user explicitly asks for one).

• For **survey** components use **customConditional** instead of **conditional**
  and never add sub-components; instead supply
  "questions": [ { "label": "Question 1", "value": "q1" }, … ] and
  "values":    [ { "label": "Score 1",   "value": "1"  }, … ].
  **"values" MUST contain at least one option.**

• For **account** and **asset** components, include "multiple": true when the user wants multi-select behavior.

• **Editing & Deleting syntax**
  – **Update** an existing component → return the component object with the **same \`key\`** and modified fields.
  – **Delete** a component → { "key":"existingKey", "_action":"delete" }.
  – **Insert** a new component relative to an existing one →
    { "_action":"insert", "position":"before", "ref":"otherKey", "component":{ … } }
    (use "after" for after).

  Put every update / delete / insert object inside the top-level **"components"** array; order is irrelevant.

• If you are shown a component that already has a \`key\`, **keep the key** – never invent a new one.

• Keys must stay **camelCase**.

• For calculateValue always declare it as \`value = …\`.

• Treat the user's prompt as authoritative for what to add, rename, group, include, or ignore.

${BLUEPRINT_GUIDANCE}

• No prose, no comments, no extra keys.
`.trim();

router.post('/api/ai/generate', createUserQuotaMiddleware('generate'), async (req, res) => {
  if (!getPublicAiFeatures().assistant) {
    return res.status(410).json({ error: 'AI Assist is disabled for this deployment.' });
  }

  if (!openai) {
    return res.status(503).json({ error: 'OPENAI_API_KEY is required for AI Assist.' });
  }

  const { prompt, current } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });
  const existingJson = current && current.components ? current : { components: [] };
  const trimmedPrompt = String(prompt || '').trim();
  const promptBlueprint = getPromptBlueprintEnrichment(trimmedPrompt);
  const promptDomainContext = getPromptBlueprintContext(trimmedPrompt);

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.15,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'assistant', content: JSON.stringify(existingJson) },
        ...(promptBlueprint?.context ? [{ role: 'assistant', content: promptBlueprint.context }] : []),
        ...(promptBlueprint?.examplePayload ? [{
          role: 'assistant',
          content: `Reference example for structure only. Adapt it to the user's prompt instead of copying it verbatim: ${JSON.stringify(promptBlueprint.examplePayload)}`
        }] : []),
        ...(promptDomainContext ? [{ role: 'assistant', content: promptDomainContext }] : []),
        { role: 'user', content: trimmedPrompt }
      ]
    });

    const rawObj = JSON.parse(completion.choices[0].message.content);
    const payload = ensureComponentsPayload({
      components: scrubComponents(normalizeGeneratedComponents(rawObj))
    });

    return res.json(payload);
  } catch (err) {
    console.error('AI route error:', err);
    return res.status(422).json({ error: err.message || 'Unknown error', code: err.code || 422 });
  }
});

module.exports = router;
