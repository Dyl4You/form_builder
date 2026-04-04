// src/parser/unifiedParser.js
require('dotenv').config();
const { OpenAI } = require('openai');
const {
  ALLOWED_TYPES,
  scrubComponents,
  ensureComponentsPayload
} = require('../utils/formio');
const {
  normalizeLowerCamelCase,
  normalizeOptionValue,
  normalizeAllCapsTitle,
  normalizeComponentLabel,
  makeUniqueLowerCamelCase,
  makeUniqueOptionValue
} = require('../utils/naming');
const {
  EXTRACTED_TEXT_TO_FORMIO_SYSTEM_PROMPT,
  makeRootGrouping,
  isRootGroupingFieldset,
  normalizeGeneratedComponents
} = require('../utils/aiExtractionConfig');
// The token that triggers building a multi-question survey from lines with "[inspection]"
const INSPECTION_TOKEN = '[inspection]';

const openaiApiKey = process.env.OPENAI_API_KEY;
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;
const PDF_MODEL = process.env.OPENAI_PDF_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const FALLBACK_SURVEY_QUESTIONS = [
  { label: 'Question 1', value: 'question1' }
];
const FALLBACK_SURVEY_VALUES = [
  { label: 'Yes', value: 'yes' },
  { label: 'No',  value: 'no'  },
  { label: 'N/A', value: 'nA'  }
];

// Keep track of used keys so each generated component is unique
const usedKeys = new Set();

function resetUsedKeys() {
  usedKeys.clear();
}

/** Generate a unique, camelCased key for a component label */
function generateUniqueKey(label) {
  const uniqueKey = makeUniqueLowerCamelCase(label, usedKeys, 'key');
  usedKeys.add(uniqueKey);
  return uniqueKey;
}

function ensureGloballyUniqueKey(base, preferredDigits = '') {
  const candidate = normalizeLowerCamelCase(`${base || ''}${preferredDigits || ''}`, 'key');
  if (!usedKeys.has(candidate)) {
    usedKeys.add(candidate);
    return candidate;
  }
  return generateUniqueKey(base);
}

/**
 * Helper to remove "data" properties from all nested components (if you need it).
 * Adjust as desired if you have further cleanup steps.
 */
function removeDataPropertiesDeep(component) {
  if (component.components && Array.isArray(component.components)) {
    for (const child of component.components) {
      removeDataPropertiesDeep(child);
    }
  }
  // Remove 'data' if it exists at this level
  if ('data' in component) {
    delete component.data;
  }
  return component;
}

function mapOptions(optionsArray = []) {
  const usedValues = new Set();

  return optionsArray
    .map(option => {
      if (typeof option === 'string') {
        const label = normalizeAllCapsTitle(option.trim());
        if (!label) return null;
        const value = makeUniqueOptionValue(label, usedValues, 'option');
        usedValues.add(value);
        return {
          label,
          value
        };
      }
      if (option && typeof option === 'object') {
        const label = normalizeAllCapsTitle(String(option.label || option.value || '').trim());
        if (!label) return null;
        const valueSource = option.value || option.label || label;
        const value = makeUniqueOptionValue(valueSource, usedValues, 'option');
        usedValues.add(value);
        return {
          label,
          value
        };
      }
      return null;
    })
    .filter(Boolean);
}

function inferNumericComponentTypeFromLabel(label = "") {
  const text = String(label || "").toLowerCase();
  if (!text.trim()) return null;

  const hasStrongCurrencySignal =
    /[$€£¥]|\b(usd|cad|eur|gbp|dollars?|euros?|pounds?|currency|amount|subtotal|price|cost|fee|salary|wage|payment|invoice|bill|charge|tax|discount|shipping|deposit)\b/.test(text) ||
    /\b(grand total|balance due)\b/.test(text) ||
    /\b((hourly|daily|weekly|monthly|yearly|bill|pay)\s+rate|(unit|hourly|daily)\s+(price|cost))\b/.test(text);
  if (hasStrongCurrencySignal) return 'currency';

  const hasNumberSignal =
    /\b(number|qty|quantity|count|unit|units|item|items|score|age|year|years|month|months|week|weeks|day|days|hour|hours|hr|hrs|minute|minutes|min|mins|second|seconds|sec|secs|percent|percentage|rating|size|length|width|height|weight|volume|distance|duration|mileage|temperature)\b/.test(text);
  if (hasNumberSignal) return 'number';

  const hasWeakCurrencySignal =
    /\b(budget|balance|revenue|expense|premium|amount due|total|value)\b/.test(text);
  if (hasWeakCurrencySignal) return 'currency';

  return null;
}

function createTextfieldComponent(line) {
  const hideLabel = !line || line.trim() === "";
  const fallback = "Untitled Textfield";
  let key = generateUniqueKey(hideLabel ? fallback : line);

  if (!key) {
    key = fallback.toLowerCase().replace(/\s+/g, '_');
  }

  return {
    label: line || "",
    hideLabel: hideLabel,
    labelWidth: 30,
    labelMargin: 3,
    key: key,
    type: 'textfield',
    input: true,
    tableView: true,
    reportable: true,
    validate: { required: true }
  };
}

function createTextareaComponent(line) {
  const hideLabel = !line || line.trim() === "";
  const fallback = "Untitled Textarea";
  let key = generateUniqueKey(hideLabel ? fallback : line);

  if (!key) {
    key = fallback.toLowerCase().replace(/\s+/g, '_');
  }

  return {
    label: line || "",
    hideLabel: hideLabel,
    labelWidth: 30,
    labelMargin: 3,
    key: key,
    type: 'textarea',
    input: true,
    tableView: true,
    reportable: true,
    validate: { required: true }
  };
}

function createNumberComponent(line) {
  const hideLabel = !line || line.trim() === "";
  const fallback = "Untitled Number";
  let key = generateUniqueKey(hideLabel ? fallback : line);

  if (!key) {
    key = fallback.toLowerCase().replace(/\s+/g, '_');
  }

  return {
    label: line || "",
    hideLabel: hideLabel,
    labelWidth: 30,
    labelMargin: 3,
    key: key,
    type: 'number',
    input: true,
    tableView: true,
    reportable: true,
    validate: { required: true }
  };
}

function createRadioComponent(label, optionsArray) {
  const hideLabel = !label || label.trim() === "";
  const fallback = "Untitled Radio";
  let key = generateUniqueKey(hideLabel ? fallback : label);

  if (!key) {
    key = fallback.toLowerCase().replace(/\s+/g, '_');
  }

  const values = mapOptions(optionsArray);
  if (!values.length) {
    values.push({ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' });
  }

  return {
    label: label || "",
    hideLabel: hideLabel,
    labelWidth: 30,
    labelMargin: 3,
    key: key,
    type: 'radio',
    input: true,
    tableView: false,
    reportable: true,
    validate: { required: true },
    optionsLabelPosition: "right",
    inline: true,
    values: values.map(opt => ({
      label: opt.label,
      value: opt.value,
      shortcut: "",
      flag: ""
    }))
  };
}

function createSelectComponent(label, optionsArray) {
  const hideLabel = !label || label.trim() === "";
  const fallback = "Untitled Select";
  let key = generateUniqueKey(hideLabel ? fallback : label);

  if (!key) {
    key = fallback.toLowerCase().replace(/\s+/g, '_');
  }

  const values = mapOptions(optionsArray);
  if (!values.length) {
    values.push({ label: 'Option 1', value: 'option1' });
  }

  return {
    label: label || "",
    hideLabel: hideLabel,
    widget: "html5",
    labelWidth: 30,
    labelMargin: 3,
    tableView: true,
    reportable: true,
    key: key,
    type: 'select',
    input: true,
    validate: { required: true },
    data: {
      values: values.map(opt => ({
        label: opt.label,
        value: opt.value,
        flag: ""
      }))
    }
  };
}

function createSelectBoxesComponent(label, optionsArray) {
  const hideLabel = !label || label.trim() === "";
  const fallback = "Untitled Select Boxes";
  let key = generateUniqueKey(hideLabel ? fallback : label);

  if (!key) {
    key = fallback.toLowerCase().replace(/\s+/g, '_');
  }

  const values = mapOptions(optionsArray);
  if (!values.length) {
    values.push({ label: 'Option 1', value: 'option1' });
  }

  return {
    label: label || "",
    hideLabel: hideLabel,
    labelWidth: 30,
    labelMargin: 3,
    optionsLabelPosition: "right",
    tableView: false,
    reportable: true,
    key: key,
    type: 'selectboxes',
    input: true,
    inputType: 'checkbox',
    validate: { required: true },
    modalEdit: true,
    values: values.map(opt => ({
      label: opt.label,
      value: opt.value,
      shortcut: "",
      flag: ""
    }))
  };
}

function createFieldset(line) {
  const hideLabel = !line || line.trim() === "";
  const fallback = "Untitled Section";
  let key = generateUniqueKey("fieldSet");
  const normalizedLabel = normalizeComponentLabel(line || "", "fieldset");

  if (!key) {
    key = fallback.toLowerCase().replace(/\s+/g, '_');
  }

  return {
    label: normalizedLabel,
    hideLabel: hideLabel,
    legend: normalizedLabel,
    labelWidth: 30,
    labelMargin: 3,
    key: key,
    type: 'fieldset',
    input: false,
    tableView: false,
    reportable: true,
    validate: { required: true },
    components: [],
    conditional: { show: null, when: "", eq: "" }
  };
}

function createFileComponent(line) {
  const hideLabel = !line || line.trim() === "";
  const fallback = "Untitled File";
  let key = generateUniqueKey(hideLabel ? fallback : line);

  if (!key) {
    key = fallback.toLowerCase().replace(/\s+/g, '_');
  }

  return {
    label: line || "",
    hideLabel: hideLabel,
    labelWidth: 30,
    labelMargin: 3,
    key: key,
    type: 'file',
    input: true,
    tableView: true,
    reportable: true,
    validate: { required: true },
    storage: 'base64',
    fileTypes: [],
    defaultValue: [],
    multiple: false
  };
}

function createPhoneNumberComponent(line) {
  const hideLabel = !line || line.trim() === "";
  const fallback = "Untitled Phone Number";
  let key = generateUniqueKey(hideLabel ? fallback : line);

  if (!key) {
    key = fallback.toLowerCase().replace(/\s+/g, '_');
  }

  return {
    label: line || "",
    hideLabel: hideLabel,
    labelWidth: 30,
    labelMargin: 3,
    key: key,
    type: 'phoneNumber',
    input: true,
    tableView: true,
    reportable: true,
    validate: { required: true },
    defaultValue: '',
    prefix: '',
    disableAutoFormatting: false,
    enableSeparateDialCode: false
  };
}

function createAddressComponent(line) {
  const hideLabel = !line || line.trim() === "";
  const fallback = "Untitled Address";
  let key = generateUniqueKey(hideLabel ? fallback : line);

  if (!key) {
    key = fallback.toLowerCase().replace(/\s+/g, '_');
  }

  return {
    label: line || "",
    hideLabel: hideLabel,
    labelWidth: 30,
    labelMargin: 3,
    key: key,
    type: 'address',
    input: true,
    tableView: false,
    reportable: true,
    validate: { required: true },
    components: [
      {
        label: 'Street',
        labelWidth: 30,
        labelMargin: 3,
        key: 'street',
        type: 'textfield',
        input: true,
        tableView: true,
        reportable: true,
        validate: { required: true }
      },
      {
        label: 'City',
        labelWidth: 30,
        labelMargin: 3,
        key: 'city',
        type: 'textfield',
        input: true,
        tableView: true,
        reportable: true,
        validate: { required: true }
      },
      {
        label: 'State',
        labelWidth: 30,
        labelMargin: 3,
        key: 'state',
        type: 'textfield',
        input: true,
        tableView: true,
        reportable: true,
        validate: { required: true }
      },
      {
        label: 'Zip Code',
        labelWidth: 30,
        labelMargin: 3,
        key: 'zip',
        type: 'number',
        input: true,
        tableView: true,
        reportable: true,
        validate: { required: true }
      }
    ]
  };
}

function createDateTimeComponent(line) {
  const hideLabel = !line || line.trim() === "";
  const fallback = "Untitled DateTime";
  let key = generateUniqueKey(hideLabel ? fallback : line);

  if (!key) {
    key = fallback.toLowerCase().replace(/\s+/g, '_');
  }

  return {
    label: line || "",
    hideLabel: hideLabel,
    labelWidth: 30,
    labelMargin: 3,
    tableView: false,
    reportable: true,
    datePicker: { disableWeekends: false, disableWeekdays: false },
    enableMinDateInput: false,
    enableMaxDateInput: false,
    key: key,
    type: 'datetime',
    input: true,
    validate: { required: true },
    widget: {
      type: "calendar",
      displayInTimezone: "viewer",
      locale: "en",
      useLocaleSettings: false,
      allowInput: true,
      mode: "single",
      enableTime: true,
      noCalendar: false,
      format: "yyyy-MM-dd hh:mm a",
      hourIncrement: 1,
      minuteIncrement: 1,
      time_24hr: false,
      minDate: null,
      disableWeekends: false,
      disableWeekdays: false,
      maxDate: null
    }
  };
}

function createDateComponent(line) {
  const hideLabel = !line || line.trim() === "";
  const fallback = "Untitled Date";
  let key = generateUniqueKey(hideLabel ? fallback : line);

  if (!key) {
    key = fallback.toLowerCase().replace(/\s+/g, '_');
  }

  return {
    label: line || "",
    hideLabel: hideLabel,
    labelWidth: 30,
    labelMargin: 3,
    format: "yyyy-MM-dd",
    tableView: false,
    reportable: true,
    datePicker: { disableWeekends: false, disableWeekdays: false },
    enableTime: false,
    enableMinDateInput: false,
    enableMaxDateInput: false,
    key: key,
    type: 'datetime',
    input: true,
    validate: { required: true },
    widget: {
      type: "calendar",
      displayInTimezone: "viewer",
      locale: "en",
      useLocaleSettings: false,
      allowInput: true,
      mode: "single",
      enableTime: false,
      noCalendar: false,
      format: "yyyy-MM-dd",
      hourIncrement: 1,
      minuteIncrement: 1,
      time_24hr: false,
      minDate: null,
      disableWeekends: false,
      disableWeekdays: false,
      maxDate: null
    }
  };
}

function createTimeComponent(line) {
  const hideLabel = !line || line.trim() === "";
  const fallback = "Untitled Time";
  let key = generateUniqueKey(hideLabel ? fallback : line);

  if (!key) {
    key = fallback.toLowerCase().replace(/\s+/g, '_');
  }

  return {
    label: line || "",
    hideLabel: hideLabel,
    labelWidth: 30,
    labelMargin: 3,
    format: "hh:mm a",
    tableView: false,
    reportable: true,
    enableDate: false,
    datePicker: { disableWeekends: false, disableWeekdays: false },
    enableMinDateInput: false,
    enableMaxDateInput: false,
    key: key,
    type: 'datetime',
    input: true,
    validate: { required: true },
    widget: {
      type: "calendar",
      displayInTimezone: "viewer",
      locale: "en",
      useLocaleSettings: false,
      allowInput: true,
      mode: "single",
      enableTime: true,
      noCalendar: true,
      format: "hh:mm a",
      hourIncrement: 1,
      minuteIncrement: 1,
      time_24hr: false,
      minDate: null,
      disableWeekends: false,
      disableWeekdays: false,
      maxDate: null
    }
  };
}

function createCurrencyComponent(line) {
  const hideLabel = !line || line.trim() === "";
  const fallback = "Untitled Currency";
  let key = generateUniqueKey(hideLabel ? fallback : line);

  if (!key) {
    key = fallback.toLowerCase().replace(/\s+/g, '_');
  }

  return {
    label: line || "",
    hideLabel: hideLabel,
    labelWidth: 30,
    labelMargin: 3,
    key: key,
    type: 'currency',
    input: true,
    tableView: true,
    reportable: true,
    validate: { required: true },
    currency: 'USD',
    decimal: '.',
    thousands: ',',
    prefix: '$',
    suffix: ''
  };
}

function createSurveyComponent(label, questions = FALLBACK_SURVEY_QUESTIONS, values = FALLBACK_SURVEY_VALUES) {
  const hideLabel = !label || label.trim() === "";
  const fallback = "Untitled Survey";
  let key = generateUniqueKey(hideLabel ? fallback : label);
  const normalizedLabel = normalizeAllCapsTitle(label || "");

  if (!key) {
    key = fallback.toLowerCase().replace(/\s+/g, '_');
  }

  const normalizedQuestions = mapOptions(questions).map(opt => ({
    label: opt.label,
    value: opt.value
  }));
  const normalizedValues = mapOptions(values).map(opt => ({
    label: opt.label,
    value: opt.value
  }));

  return {
    label: hideLabel ? "" : normalizedLabel,
    hideLabel: hideLabel,
    key,
    type: "survey",
    input: true,
    reportable: true,
    validate: { required: true },
    questions: normalizedQuestions.length ? normalizedQuestions : FALLBACK_SURVEY_QUESTIONS,
    values: normalizedValues.length ? normalizedValues : FALLBACK_SURVEY_VALUES
  };
}

function createDisclaimerComponent(line) {
  const hideLabel = !line || line.trim() === "";
  const fallback = "Untitled Disclaimer";
  let key = generateUniqueKey(hideLabel ? fallback : line);

  if (!key) {
    key = fallback.toLowerCase().replace(/\s+/g, '_');
  }

  return {
    label: line || "",
    hideLabel,
    key,
    type: "content",
    input: false,
    tableView: false,
    refreshOnChange: false,
    validate: {},
    html: line || "Disclaimer text..."
  };
}

const INLINE_OPTION_SEPARATORS = ['/', ',', ';', '|', ' or ', ' • ', ' •', '•', ' · '];

function splitLineForLabel(line = '') {
  const colonIdx = line.indexOf(':');
  if (colonIdx > -1) {
    return [line.slice(0, colonIdx).trim(), line.slice(colonIdx + 1).trim()];
  }
  const dashMatch = line.match(/^(.{3,80}?)[-–]\s+(.*)$/);
  if (dashMatch) {
    return [dashMatch[1].trim(), dashMatch[2].trim()];
  }
  const doubleSpaceIdx = line.indexOf('  ');
  if (doubleSpaceIdx > -1) {
    return [line.slice(0, doubleSpaceIdx).trim(), line.slice(doubleSpaceIdx).trim()];
  }
  return [line.trim(), ''];
}

function detectInlineOptions(text = '') {
  const raw = text.trim();
  if (!raw) return [];
  for (const sep of INLINE_OPTION_SEPARATORS) {
    if (raw.includes(sep)) {
      const parts = raw.split(sep)
        .map(t => t.replace(/^[•\-\u2022]+/, '').trim())
        .filter(Boolean);
      const unique = [...new Set(parts)];
      if (unique.length >= 2 && unique.length <= 10 && unique.every(p => p.length <= 30)) {
        return unique;
      }
    }
  }
  return [];
}

function detectRiskCodesFromText(text = '') {
  const matches = text.toUpperCase().match(/[A-E][1-5]/g) || [];
  return [...new Set(matches)];
}

function createComponentFromLine(line, context = {}) {
  if (!line || line.length < 3) return null;
  const { riskCodes = [] } = context;
  const [labelRaw, trailingRaw] = splitLineForLabel(line);
  const label = labelRaw || 'Field';
  const trailing = trailingRaw.trim();
  const lower = label.toLowerCase();

  if (/risk rating/.test(lower)) {
    return createSelectComponent(label, riskCodes.length ? riskCodes : ['Low', 'Medium', 'High']);
  }
  if (/phone|telephone|mobile/.test(lower)) {
    return createPhoneNumberComponent(label);
  }
  if (/address/.test(lower)) {
    return createAddressComponent(label);
  }
  if (/email/.test(lower)) {
    return createTextfieldComponent(label);
  }
  if (/upload|attach|file|photo|evidence/.test(lower)) {
    return createFileComponent(label);
  }
  const inferredNumericType = inferNumericComponentTypeFromLabel(label);
  if (inferredNumericType === 'currency') {
    return createCurrencyComponent(label);
  }
  if (inferredNumericType === 'number') {
    return createNumberComponent(label);
  }
  if (/datetime|date\/time/.test(lower) || (/\bdate\b/.test(lower) && /\btime\b/.test(lower))) {
    return createDateTimeComponent(label);
  }
  if (/\btime\b/.test(lower)) {
    return createTimeComponent(label);
  }
  if (/\bdate\b|\bdeadline\b/.test(lower)) {
    return createDateComponent(label);
  }
  if (/disclaimer|notice/.test(lower)) {
    return createDisclaimerComponent(label);
  }

  if (trailing) {
    const inlineOptions = detectInlineOptions(trailing);
    if (inlineOptions.length) {
      if (inlineOptions.length <= 3) {
        return createRadioComponent(label, inlineOptions);
      }
      if (inlineOptions.length >= 6) {
        return createSelectBoxesComponent(label, inlineOptions);
      }
      return createSelectComponent(label, inlineOptions);
    }
  }

  if (label.length <= 35 && !/description|details|notes|explain|summary/.test(lower)) {
    return createTextfieldComponent(label);
  }

  return createTextareaComponent(label);
}

function gatherSectionLines(section = {}) {
  const content = section.content || '';
  return content
    .split(/\n+/)
    .map(line => line.trim())
    .filter(line => line.length >= 3 && line.length <= 180);
}

function fallbackComponentsFromDoc(doc = {}) {
  resetUsedKeys();
  const sections = Array.isArray(doc.sections) && doc.sections.length
    ? doc.sections
    : [{ heading: doc.title || 'Document', content: doc.abstract || '' }];
  const riskCodes = detectRiskCodesFromText(
    sections.map(sec => `${sec.heading}\n${sec.content || ''}`).join('\n')
  );

  const components = [];
  sections.forEach(section => {
    const fieldset = createFieldset(section.heading || 'Section');
    const lines = gatherSectionLines(section).slice(0, 40);
    fieldset.components = lines
      .map(line => createComponentFromLine(line, { riskCodes }))
      .filter(Boolean);
    if (fieldset.components.length) {
      components.push(fieldset);
    }
  });

  if (!components.length) {
    components.push(createTextareaComponent(doc.title || 'Document Notes'));
  }

  return components;
}

function summariseDocumentForModel(doc = {}, maxChars = 6000) {
  const lines = [];
  if (doc.title) lines.push(`Title: ${doc.title}`);
  if (doc.authors && doc.authors.length) lines.push(`Authors: ${doc.authors.join(', ')}`);
  if (doc.abstract) lines.push(`Abstract:\n${doc.abstract}`);

  (doc.sections || []).forEach((section, idx) => {
    const heading = section.heading || `Section ${idx + 1}`;
    const content = (section.content || '').replace(/\s+/g, ' ').trim();
    if (content) {
      lines.push(`${heading}:\n${content}`);
    }
  });

  return lines.join('\n\n').slice(0, maxChars);
}

const PDF_SYSTEM_PROMPT = EXTRACTED_TEXT_TO_FORMIO_SYSTEM_PROMPT;

async function pdfToComponents({ doc = {}, prompt = '' } = {}) {
  const fallback = () => fallbackComponentsFromDoc(doc);
  if (!openai) {
    return fallback();
  }

  const userSections = [];
  if (prompt && prompt.trim()) {
    userSections.push(`### USER PROMPT\n${prompt.trim()}`);
  }
  userSections.push(`### DOCUMENT\n${summariseDocumentForModel(doc)}`);
  const userContent = userSections.join('\n\n').slice(0, 8000);

  try {
    const completion = await openai.chat.completions.create({
      model: PDF_MODEL,
      temperature: 0.15,
      max_tokens: 3500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PDF_SYSTEM_PROMPT },
        { role: 'user', content: userContent }
      ]
    });

    const raw = JSON.parse(completion.choices[0].message.content);
    const payload = isRootGroupingFieldset(raw)
      ? { components: scrubComponents([raw]) }
      : { components: scrubComponents(normalizeGeneratedComponents(raw)) };

    ensureComponentsPayload(payload);
    if (payload.components.length) {
      return isRootGroupingFieldset(payload.components[0])
        ? payload.components
        : [makeRootGrouping(payload.components)];
    }
  } catch (err) {
    console.warn('pdfToComponents fallback triggered:', err.message || err);
  }

  return fallback();
}

function createGroupingContainer(children = []) {
  usedKeys.add('fieldSet');
  return removeDataPropertiesDeep(makeRootGrouping(children));
}

async function parseTextUnified(text) {
  const doc = {
    title: 'Extracted Text',
    sections: [{ heading: 'Content', content: text }]
  };
  const components = fallbackComponentsFromDoc(doc);
  return createGroupingContainer(components);
}


module.exports = {
  INSPECTION_TOKEN,
  usedKeys,
  normalizeLowerCamelCase,
  normalizeOptionValue,
  generateUniqueKey,
  ensureGloballyUniqueKey,
  createFieldset,
  createTextfieldComponent,
  createTextareaComponent,
  createNumberComponent,
  createFileComponent,
  createPhoneNumberComponent,
  createAddressComponent,
  createDateTimeComponent,
  createDateComponent,
  createTimeComponent,
  createCurrencyComponent,
  createSurveyComponent,
  createDisclaimerComponent,
  parseTextUnified,
  pdfToComponents
};
