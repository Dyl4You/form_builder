// src/routes/aiPatch.js
// ────────────────────────────────────────────────────────────
const router  = require('express').Router();
const OpenAI  = require('openai').OpenAI;
const Ajv     = require('ajv');
const { normalizeGeneratedComponents } = require('../utils/aiExtractionConfig');
const { createUserQuotaMiddleware } = require('../security/requestSecurity');
const {
  BLUEPRINT_GUIDANCE,
  getPromptBlueprintEnrichment,
  getPromptBlueprintContext
} = require('../utils/aiBlueprints');

// ❶ OpenAI client (assumes OPENAI_API_KEY is set)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

// ❷ AJV setup – point at whatever Form.io component schema you prefer
const ajv  = new Ajv({ allErrors: true });
const formioComponentSchema = require('../schema/component.json'); // adjust if needed
const validateComponent     = ajv.compile(formioComponentSchema);

/* ───────────── PATCH generator ───────────── */
router.post('/api/ai/patch', createUserQuotaMiddleware('patch'), async (req, res) => {
  try {
    const { prompt, form, target } = req.body;
    const trimmedPrompt = String(prompt || '').trim();
    if (!trimmedPrompt) {
      return res.status(400).json({ error: 'prompt required' });
    }

    const targetKey = String(target?.key || 'root');
    const targetLabel = String(target?.label || '').trim() || (targetKey === 'root' ? 'Root (Section)' : targetKey);
    const targetScopeInstruction = target?.isRoot
      ? 'You are working at the root section of the form.'
      : `You are working inside the selected container "${targetLabel}" (${targetKey}).`;
    const promptBlueprint = getPromptBlueprintEnrichment(trimmedPrompt);
    const promptDomainContext = getPromptBlueprintContext(trimmedPrompt);

    /* 1 ▸ craft the system instruction for GPT */
    const sysPrompt = `
You are a Form.io form-modifier.
Return **ONLY** a JSON object whose root key is "components".
Each entry may be:
• A complete new component to ADD
• {"key":"k", ...fields}             ← UPDATE component k
• {"key":"k", "_action":"delete"}    ← DELETE component k
• {"_action":"insert","position":"after","ref":"k","component":{…}} ← INSERT
• The builder already has a root fieldset/grouping. Do not create another top-level fieldset labeled "Grouping" or a synthetic root wrapper.
• Return the child components that belong inside the existing root unless the user explicitly asks for a nested section/group.
• ${targetScopeInstruction}
• The provided form JSON contains only the existing child components for the current target container, not the whole form.
• Follow the user's prompt literally. Treat it as the source of truth for what to add, rename, group, or ignore.
• Unless the user explicitly asks to update or delete an existing component, return only the new child components requested in the prompt.
• Do not regenerate, wrap, or repeat unchanged sibling components.
${BLUEPRINT_GUIDANCE}
${promptDomainContext ? `• ${promptDomainContext}` : ''}
`;

    /* 2 ▸ call GPT with stronger domain instructions */
    const { choices } = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.15,
      max_tokens: 4096,
      messages: [
        { role:'system', content: sysPrompt },
        { role:'assistant', content: JSON.stringify(form).slice(0, 30000) },
        ...(promptBlueprint?.context ? [{ role: 'assistant', content: promptBlueprint.context }] : []),
        ...(promptBlueprint?.examplePayload ? [{
          role: 'assistant',
          content: `Reference example for structure only. Adapt it to the user's prompt instead of copying it verbatim: ${JSON.stringify(promptBlueprint.examplePayload)}`
        }] : []),
        { role:'user', content: trimmedPrompt }
      ]
    });

    /* 3 ▸ parse + sanity-check */
    const patch = {
      components: normalizeGeneratedComponents(
        JSON.parse(choices[0].message.content)
      )
    };

    if (!Array.isArray(patch.components))
      throw new Error('AI response missing ".components" array');

    /* 4 ▸ validate *added* components only               */
    for (const obj of patch.components) {
      if (obj._action) continue;           // skip delete / insert wrappers
      if (!validateComponent(obj))
        throw new Error(
          'Invalid component: ' + ajv.errorsText(validateComponent.errors)
        );
    }

    return res.json({ patch });            // ✅ success
  } catch (err) {
    console.error(err);
    return res.status(400).json({ error: err.message });
  }
});


module.exports = router;
