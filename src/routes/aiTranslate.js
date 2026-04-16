const router = require('express').Router();
const { OpenAI } = require('openai');
const { getPublicAiFeatures } = require('../config/runtimeConfig');
const { createUserQuotaMiddleware } = require('../security/requestSecurity');

const {
  LANG_LABELS,
  OUTPUT_MODES,
  translateDefinition
} = require('../utils/templateTranslation');

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;
const MODEL = process.env.OPENAI_TRANSLATION_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini';

async function translateBatchWithOpenAI(strings = [], targetLanguage = 'fr') {
  if (!openai) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }

  const safeStrings = Array.isArray(strings)
    ? strings.map((value) => String(value ?? ''))
    : [];

  if (!safeStrings.length) {
    return [];
  }

  const targetLanguageLabel = LANG_LABELS[targetLanguage] || targetLanguage;
  const response = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0,
    max_tokens: 4096,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: [
          `You translate form-builder labels, placeholders, help text, and HTML text into ${targetLanguageLabel}.`,
          'Return JSON only with this exact shape: {"translations":["..."]}.',
          'The translations array must match the input array length and item order exactly.',
          'Preserve tokens like NA, N/A, IDs, numeric values, template variables such as {{name}}, and machine-readable code fragments.',
          'If a string should not change, return it unchanged.',
          'Do not add explanations or extra keys.'
        ].join(' ')
      },
      {
        role: 'user',
        content: JSON.stringify({
          targetLanguage: targetLanguageLabel,
          strings: safeStrings
        })
      }
    ]
  });

  const content = response?.choices?.[0]?.message?.content || '{}';
  let parsed;

  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error('Translation service returned invalid JSON.');
  }

  if (!Array.isArray(parsed.translations) || parsed.translations.length !== safeStrings.length) {
    throw new Error('Translation service returned an unexpected translation count.');
  }

  return parsed.translations.map((item, index) => (
    typeof item === 'string' && item.trim()
      ? item
      : safeStrings[index]
  ));
}

router.post('/api/ai/translate-template', createUserQuotaMiddleware('translate-template'), async (req, res) => {
  if (!getPublicAiFeatures().translation) {
    return res.status(410).json({ error: 'Template translation is disabled for this deployment.' });
  }

  const payload = req.body || {};
  const definition = payload.definition;
  const targetLanguage = String(payload.targetLanguage || '').trim().toLowerCase() || 'fr';
  const outputMode = String(payload.outputMode || '').trim() || (
    payload.wrapToggle === false ? OUTPUT_MODES.TRANSLATED_ONLY : OUTPUT_MODES.WRAPPER
  );

  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
    return res.status(400).json({ error: 'definition must be a JSON object.' });
  }

  if (!Object.values(OUTPUT_MODES).includes(outputMode)) {
    return res.status(400).json({ error: 'outputMode must be one of wrapper, i18n, or translatedOnly.' });
  }

  try {
    const translated = await translateDefinition(definition, targetLanguage, {
      outputMode,
      translateBatch: translateBatchWithOpenAI
    });

    return res.json(translated);
  } catch (error) {
    const message = error?.message || 'Translation failed.';
    const status = /OPENAI_API_KEY/.test(message) ? 503 : 500;
    console.error('Template translation failed:', error);
    return res.status(status).json({ error: message });
  }
});

module.exports = router;
