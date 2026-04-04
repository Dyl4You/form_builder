const { normalizeLowerCamelCase } = require('./naming');

const LANG_KEY = 'preferredLanguage';
const ORIGINAL_VALUE = 'original';
const DEFAULT_LANGUAGE = 'en';
const OUTPUT_MODES = {
  WRAPPER: 'wrapper',
  I18N: 'i18n',
  TRANSLATED_ONLY: 'translatedOnly'
};

const LANG_LABELS = {
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  ar: 'Arabic',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  'zh-cn': 'Chinese (Simplified)',
  'zh-tw': 'Chinese (Traditional)',
  ja: 'Japanese',
  ko: 'Korean',
  ru: 'Russian',
  hi: 'Hindi',
  bn: 'Bengali',
  ur: 'Urdu',
  tr: 'Turkish',
  nl: 'Dutch',
  sv: 'Swedish',
  no: 'Norwegian',
  da: 'Danish',
  fi: 'Finnish',
  pl: 'Polish',
  cs: 'Czech',
  sk: 'Slovak',
  sl: 'Slovenian',
  ro: 'Romanian',
  hu: 'Hungarian',
  bg: 'Bulgarian',
  uk: 'Ukrainian',
  el: 'Greek',
  he: 'Hebrew',
  id: 'Indonesian',
  ms: 'Malay',
  th: 'Thai',
  vi: 'Vietnamese',
  ta: 'Tamil',
  te: 'Telugu',
  kn: 'Kannada',
  ml: 'Malayalam',
  gu: 'Gujarati',
  fa: 'Persian',
  sw: 'Swahili',
  lt: 'Lithuanian',
  lv: 'Latvian',
  et: 'Estonian',
  hr: 'Croatian',
  sr: 'Serbian',
  ca: 'Catalan',
  [ORIGINAL_VALUE]: 'English'
};

const HTML_TEXT_RE = /(>)([^<>]+?)(<)/g;
const DO_NOT_TRANSLATE = new Set(['NA']);
const TRANSLATABLE_TEXT_FIELDS = [
  'label',
  'legend',
  'placeholder',
  'description',
  'tooltip',
  'title'
];
const KEY_REF_FIELDS = [
  'calculateValue',
  'customConditional',
  'customDefaultValue',
  'mask',
  'defaultValue'
];
const LANGUAGE_SELECTOR_LABEL = 'Preferred Language';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTranslationKeySeed(value = '', fallback = 'key') {
  const raw = String(value || '').trim();
  if (/^[a-z][A-Za-z0-9]*$/.test(raw)) {
    return raw;
  }

  return normalizeLowerCamelCase(
    raw.replace(/([a-z0-9])([A-Z])/g, '$1 $2'),
    fallback
  );
}

function normalizeComparableText(value = '') {
  const text = String(value ?? '');
  if (!text) return '';

  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '')
    .toLowerCase();
}

function isFixedToken(text = '') {
  if (typeof text !== 'string') return false;
  const normalized = text.replace(/[^A-Za-z]/g, '').toUpperCase();
  return DO_NOT_TRANSLATE.has(normalized);
}

function shouldTranslateText(text = '') {
  return typeof text === 'string' && text.trim() && !isFixedToken(text);
}

function visitNodes(node, visitor) {
  if (Array.isArray(node)) {
    node.forEach((item) => visitNodes(item, visitor));
    return;
  }

  if (!isObject(node)) {
    return;
  }

  visitor(node);

  if (Array.isArray(node.components)) {
    visitNodes(node.components, visitor);
  }

  if (Array.isArray(node.columns)) {
    node.columns.forEach((column) => visitNodes(column, visitor));
  }

  if (Array.isArray(node.rows)) {
    node.rows.forEach((row) => visitNodes(row, visitor));
  }
}

function collectHtmlStrings(html = '', bucket = new Set()) {
  if (typeof html !== 'string' || !html) return bucket;

  html.replace(HTML_TEXT_RE, (_match, _open, text) => {
    const trimmed = String(text || '').trim();
    if (shouldTranslateText(trimmed)) {
      bucket.add(trimmed);
    }
    return _match;
  });

  return bucket;
}

function collectTranslatableStrings(definition, options = {}) {
  const strings = new Set();
  const extraStrings = Array.isArray(options.extraStrings) ? options.extraStrings : [];

  visitNodes(definition, (node) => {
    TRANSLATABLE_TEXT_FIELDS.forEach((field) => {
      if (shouldTranslateText(node[field])) {
        strings.add(node[field].trim());
      }
    });

    if (node.type === 'content' && typeof node.html === 'string') {
      collectHtmlStrings(node.html, strings);
    }

    if (node.type === 'survey' && Array.isArray(node.questions)) {
      node.questions.forEach((question) => {
        if (shouldTranslateText(question?.label)) {
          strings.add(question.label.trim());
        }
      });
    }

    const nodeValues = Array.isArray(node.values) ? node.values : [];
    nodeValues.forEach((value) => {
      if (shouldTranslateText(value?.label)) {
        strings.add(value.label.trim());
      }
    });

    const dataValues = Array.isArray(node.data?.values) ? node.data.values : [];
    dataValues.forEach((value) => {
      if (shouldTranslateText(value?.label)) {
        strings.add(value.label.trim());
      }
    });
  });

  extraStrings.forEach((text) => {
    if (shouldTranslateText(text)) {
      strings.add(String(text).trim());
    }
  });

  return Array.from(strings);
}

function buildResolvedTranslation(sourceText, translatedText) {
  const source = String(sourceText ?? '');
  const translated = typeof translatedText === 'string'
    ? translatedText.trim()
    : source;

  if (!translated) return source;
  if (isFixedToken(source) || isFixedToken(translated)) return source;
  if (normalizeComparableText(source) === normalizeComparableText(translated)) {
    return source;
  }

  return translated.replace(/\s*\/\s*/g, ' / ');
}

async function buildTranslationLookup(strings, targetLanguage, translateBatch) {
  const lookup = new Map();
  const pending = strings.filter(shouldTranslateText);

  if (!pending.length) {
    return lookup;
  }

  const maxItemsPerBatch = 40;
  let index = 0;

  while (index < pending.length) {
    const batch = pending.slice(index, index + maxItemsPerBatch);
    const translatedItems = await translateBatch(batch, targetLanguage);

    if (!Array.isArray(translatedItems) || translatedItems.length !== batch.length) {
      throw new Error('Translation service returned an unexpected payload.');
    }

    batch.forEach((sourceText, itemIndex) => {
      lookup.set(
        sourceText,
        buildResolvedTranslation(sourceText, translatedItems[itemIndex])
      );
    });

    index += batch.length;
  }

  return lookup;
}

function translateText(text, lookup) {
  if (!shouldTranslateText(text)) {
    return text;
  }

  const trimmed = text.trim();
  return lookup.get(trimmed) || text;
}

function translateHtml(html, lookup) {
  if (typeof html !== 'string' || !html) {
    return html;
  }

  return html.replace(HTML_TEXT_RE, (match, open, text, close) => {
    const rawText = String(text || '');
    const prefixMatch = rawText.match(/^\s*/);
    const suffixMatch = rawText.match(/\s*$/);
    const prefix = prefixMatch ? prefixMatch[0] : '';
    const suffix = suffixMatch ? suffixMatch[0] : '';
    const trimmed = rawText.trim();

    if (!shouldTranslateText(trimmed)) {
      return match;
    }

    return `${open}${prefix}${translateText(trimmed, lookup)}${suffix}${close}`;
  });
}

function applyTranslations(definition, lookup) {
  visitNodes(definition, (node) => {
    TRANSLATABLE_TEXT_FIELDS.forEach((field) => {
      if (typeof node[field] === 'string') {
        node[field] = translateText(node[field], lookup);
      }
    });

    if (node.type === 'content' && typeof node.html === 'string') {
      node.html = translateHtml(node.html, lookup);
    }

    if (node.type === 'survey' && Array.isArray(node.questions)) {
      node.questions.forEach((question) => {
        if (typeof question?.label === 'string') {
          question.label = translateText(question.label, lookup);
        }
      });
    }

    if (Array.isArray(node.values)) {
      node.values.forEach((value) => {
        if (typeof value?.label === 'string') {
          value.label = translateText(value.label, lookup);
        }
      });
    }

    if (Array.isArray(node.data?.values)) {
      node.data.values.forEach((value) => {
        if (typeof value?.label === 'string') {
          value.label = translateText(value.label, lookup);
        }
      });
    }
  });

  return definition;
}

function collectExistingKeys(node, usedKeys = new Set()) {
  if (Array.isArray(node)) {
    node.forEach((item) => collectExistingKeys(item, usedKeys));
    return usedKeys;
  }

  if (!isObject(node)) {
    return usedKeys;
  }

  if (typeof node.key === 'string' && node.key.trim()) {
    usedKeys.add(normalizeTranslationKeySeed(node.key, 'key'));
  }

  Object.values(node).forEach((value) => {
    if (value && typeof value === 'object') {
      collectExistingKeys(value, usedKeys);
    }
  });

  return usedKeys;
}

function ensureUniqueKey(seed = '', usedKeys = new Set(), fallback = 'key') {
  const base = normalizeTranslationKeySeed(seed, fallback);
  let value = base;
  let suffix = 1;

  while (usedKeys.has(value)) {
    value = `${base}${suffix++}`;
  }

  usedKeys.add(value);
  return value;
}

function buildKeyMapping(node, usedKeys = new Set(), mapping = new Map()) {
  if (Array.isArray(node)) {
    node.forEach((item) => buildKeyMapping(item, usedKeys, mapping));
    return mapping;
  }

  if (!isObject(node)) {
    return mapping;
  }

  if (typeof node.key === 'string' && node.key.trim() && !mapping.has(node.key)) {
    mapping.set(node.key, ensureUniqueKey(node.key, usedKeys, 'key'));
  }

  Object.values(node).forEach((value) => {
    if (value && typeof value === 'object') {
      buildKeyMapping(value, usedKeys, mapping);
    }
  });

  return mapping;
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceKeyRefsInString(text, mapping) {
  let updated = String(text ?? '');

  mapping.forEach((nextKey, previousKey) => {
    const escapedKey = escapeRegExp(previousKey);
    updated = updated.replace(new RegExp(`\\bdata\\.${escapedKey}\\b`, 'g'), `data.${nextKey}`);
    updated = updated.replace(new RegExp(`\\brow\\.${escapedKey}\\b`, 'g'), `row.${nextKey}`);
    updated = updated.replace(
      new RegExp(`\\bsubmission\\.data\\.${escapedKey}\\b`, 'g'),
      `submission.data.${nextKey}`
    );
  });

  return updated;
}

function applyKeyMapping(node, mapping) {
  if (Array.isArray(node)) {
    node.forEach((item) => applyKeyMapping(item, mapping));
    return node;
  }

  if (!isObject(node)) {
    return node;
  }

  if (typeof node.key === 'string' && mapping.has(node.key)) {
    node.key = mapping.get(node.key);
  }

  if (isObject(node.conditional) && typeof node.conditional.when === 'string' && mapping.has(node.conditional.when)) {
    node.conditional.when = mapping.get(node.conditional.when);
  }

  if (typeof node._actionsDriverKey === 'string' && mapping.has(node._actionsDriverKey)) {
    node._actionsDriverKey = mapping.get(node._actionsDriverKey);
  }

  KEY_REF_FIELDS.forEach((field) => {
    if (typeof node[field] === 'string') {
      node[field] = replaceKeyRefsInString(node[field], mapping);
    }
  });

  Object.values(node).forEach((value) => {
    if (value && typeof value === 'object') {
      applyKeyMapping(value, mapping);
    }
  });

  return node;
}

function withConditional(component, languageKey, languageValue) {
  return {
    ...component,
    conditional: {
      show: true,
      when: languageKey,
      eq: languageValue
    }
  };
}

function buildLanguageToggleComponent(definition, languageKey, targetLanguage) {
  return {
    label: LANGUAGE_SELECTOR_LABEL,
    labelWidth: definition?.labelWidth ?? 30,
    labelMargin: definition?.labelMargin ?? 3,
    optionsLabelPosition: 'right',
    inline: true,
    tableView: false,
    reportable: true,
    values: [
      {
        label: LANG_LABELS[ORIGINAL_VALUE] || 'Original',
        value: ORIGINAL_VALUE,
        shortcut: '',
        flag: ''
      },
      {
        label: LANG_LABELS[targetLanguage] || targetLanguage,
        value: targetLanguage,
        shortcut: '',
        flag: ''
      }
    ],
    key: languageKey,
    type: 'radio',
    input: true,
    defaultValue: ORIGINAL_VALUE
  };
}

function buildRuntimeLanguageToggleComponent(definition, languageKey, targetLanguage) {
  return {
    label: LANGUAGE_SELECTOR_LABEL,
    labelWidth: definition?.labelWidth ?? 30,
    labelMargin: definition?.labelMargin ?? 3,
    optionsLabelPosition: 'right',
    inline: true,
    tableView: false,
    reportable: true,
    values: [
      {
        label: LANG_LABELS[DEFAULT_LANGUAGE] || 'English',
        value: DEFAULT_LANGUAGE,
        shortcut: '',
        flag: ''
      },
      {
        label: LANG_LABELS[targetLanguage] || targetLanguage,
        value: targetLanguage,
        shortcut: '',
        flag: ''
      }
    ],
    key: languageKey,
    type: 'radio',
    input: true,
    defaultValue: DEFAULT_LANGUAGE
  };
}

function isRootGroupingDefinition(definition) {
  return Boolean(
    isObject(definition)
    && definition.type === 'fieldset'
    && Array.isArray(definition.components)
    && String(definition.key || '').trim() === 'grouping'
  );
}

function wrapRootGroupingWithLanguageToggle(definition, translatedDefinition, targetLanguage) {
  const usedKeys = collectExistingKeys(definition, collectExistingKeys(translatedDefinition, new Set()));
  const languageKey = ensureUniqueKey(LANG_KEY, usedKeys, 'preferredLanguage');
  const originalSectionKey = ensureUniqueKey('originalTemplate', usedKeys, 'originalTemplate');
  const translatedSectionKey = ensureUniqueKey(`${targetLanguage}Template`, usedKeys, 'translatedTemplate');

  return {
    ...cloneJson(definition),
    components: [
      buildLanguageToggleComponent(definition, languageKey, targetLanguage),
      withConditional({
        label: LANG_LABELS[ORIGINAL_VALUE] || 'Original',
        key: originalSectionKey,
        type: 'fieldset',
        input: false,
        tableView: false,
        components: cloneJson(definition.components || [])
      }, languageKey, ORIGINAL_VALUE),
      withConditional({
        label: LANG_LABELS[targetLanguage] || targetLanguage,
        key: translatedSectionKey,
        type: 'fieldset',
        input: false,
        tableView: false,
        components: cloneJson(translatedDefinition.components || [])
      }, languageKey, targetLanguage)
    ]
  };
}

function wrapGenericDefinitionWithLanguageToggle(definition, translatedDefinition, targetLanguage) {
  const original = cloneJson(definition);
  const translated = cloneJson(translatedDefinition);
  const usedKeys = collectExistingKeys(original, collectExistingKeys(translated, new Set()));
  const languageKey = ensureUniqueKey(LANG_KEY, usedKeys, 'preferredLanguage');
  const wrapperKey = ensureUniqueKey('languageToggle', usedKeys, 'languageToggle');

  return {
    label: original.label || 'Grouping',
    labelWidth: original.labelWidth ?? 30,
    labelMargin: original.labelMargin ?? 3,
    key: wrapperKey,
    type: 'fieldset',
    input: false,
    tableView: false,
    components: [
      buildLanguageToggleComponent(original, languageKey, targetLanguage),
      withConditional(original, languageKey, ORIGINAL_VALUE),
      withConditional(translated, languageKey, targetLanguage)
    ]
  };
}

function prepareWrappedTranslation(definition, translatedDefinition, targetLanguage) {
  const translatedCopy = cloneJson(translatedDefinition);
  const usedKeys = collectExistingKeys(definition, new Set());
  const mapping = buildKeyMapping(translatedCopy, usedKeys, new Map());

  applyKeyMapping(translatedCopy, mapping);

  if (isRootGroupingDefinition(definition)) {
    return wrapRootGroupingWithLanguageToggle(definition, translatedCopy, targetLanguage);
  }

  return wrapGenericDefinitionWithLanguageToggle(definition, translatedCopy, targetLanguage);
}

function buildTranslationDictionary(lookup = new Map()) {
  const dictionary = {};

  lookup.forEach((translatedText, sourceText) => {
    const source = String(sourceText || '');
    const translated = String(translatedText || '');
    if (!source || !translated || source === translated) {
      return;
    }

    dictionary[source] = translated;
  });

  return dictionary;
}

function injectLanguageControl(definition, targetLanguage) {
  const nextForm = cloneJson(definition);
  const usedKeys = collectExistingKeys(nextForm, new Set());
  const languageKey = ensureUniqueKey(LANG_KEY, usedKeys, 'preferredLanguage');
  const languageControl = buildRuntimeLanguageToggleComponent(nextForm, languageKey, targetLanguage);

  if (Array.isArray(nextForm.components)) {
    nextForm.components = [languageControl, ...nextForm.components];
    return { form: nextForm, languageKey };
  }

  const wrapperKey = ensureUniqueKey('languageI18nWrapper', usedKeys, 'languageI18nWrapper');
  return {
    languageKey,
    form: {
      label: nextForm.label || 'Grouping',
      labelWidth: nextForm.labelWidth ?? 30,
      labelMargin: nextForm.labelMargin ?? 3,
      key: wrapperKey,
      type: 'fieldset',
      input: false,
      tableView: false,
      components: [languageControl, nextForm]
    }
  };
}

function buildI18nBundle(definition, lookup, targetLanguage) {
  const { form, languageKey } = injectLanguageControl(definition, targetLanguage);
  const translationDictionary = buildTranslationDictionary(lookup);
  const translationBundle = {
    rendererOptions: {
      language: DEFAULT_LANGUAGE,
      i18n: {
        [targetLanguage]: translationDictionary
      }
    },
    languageController: {
      fieldKey: languageKey,
      defaultLanguage: DEFAULT_LANGUAGE,
      supportedLanguages: [DEFAULT_LANGUAGE, targetLanguage],
      listener: `form.on('change', (event) => { const nextLanguage = event.data?.${languageKey} || '${DEFAULT_LANGUAGE}'; if (form.language !== nextLanguage) form.language = nextLanguage; });`
    }
  };

  return {
    ...form,
    _translationBundle: translationBundle
  };
}

function resolveOutputMode(options = {}) {
  const rawMode = String(options.outputMode || '').trim();
  if (rawMode === OUTPUT_MODES.I18N || rawMode === OUTPUT_MODES.TRANSLATED_ONLY || rawMode === OUTPUT_MODES.WRAPPER) {
    return rawMode;
  }

  if (options.wrapToggle === false) {
    return OUTPUT_MODES.TRANSLATED_ONLY;
  }

  return OUTPUT_MODES.WRAPPER;
}

async function translateDefinition(definition, targetLanguage, options = {}) {
  const safeDefinition = cloneJson(definition);
  const translatedDefinition = cloneJson(definition);
  const safeTargetLanguage = String(targetLanguage || '').trim().toLowerCase() || 'fr';
  const translateBatch = options.translateBatch;
  const outputMode = resolveOutputMode(options);

  if (typeof translateBatch !== 'function') {
    throw new Error('translateBatch is required.');
  }

  const extraStrings = outputMode === OUTPUT_MODES.I18N
    ? [
      LANGUAGE_SELECTOR_LABEL,
      LANG_LABELS[DEFAULT_LANGUAGE] || 'English',
      LANG_LABELS[safeTargetLanguage] || safeTargetLanguage
    ]
    : [];

  const strings = collectTranslatableStrings(safeDefinition, { extraStrings });
  const lookup = await buildTranslationLookup(strings, safeTargetLanguage, translateBatch);
  applyTranslations(translatedDefinition, lookup);

  if (outputMode === OUTPUT_MODES.TRANSLATED_ONLY) {
    return translatedDefinition;
  }

  if (outputMode === OUTPUT_MODES.I18N) {
    return buildI18nBundle(safeDefinition, lookup, safeTargetLanguage);
  }

  return prepareWrappedTranslation(safeDefinition, translatedDefinition, safeTargetLanguage);
}

module.exports = {
  DEFAULT_LANGUAGE,
  LANG_KEY,
  LANG_LABELS,
  OUTPUT_MODES,
  ORIGINAL_VALUE,
  applyTranslations,
  buildTranslationLookup,
  buildI18nBundle,
  collectTranslatableStrings,
  prepareWrappedTranslation,
  translateDefinition
};
