// src/parser/unifiedParser.js
const _ = require('lodash');
// The token that triggers building a multi-question survey from lines with "[inspection]"
const INSPECTION_TOKEN = '[inspection]';

// Keep track of used keys so each generated component is unique
const usedKeys = new Set();

/** Generate a unique, camelCased key for a component label */
function generateUniqueKey(label) {
  const baseKey = _.camelCase(label);
  let uniqueKey = baseKey;
  let counter = 1;
  while (usedKeys.has(uniqueKey)) {
    uniqueKey = `${baseKey}${counter++}`;
  }
  usedKeys.add(uniqueKey);
  return uniqueKey;
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

function mapOptions(optionsArray) {
  return optionsArray.map(option => ({
    label: option.label || option, // Use label if available, otherwise the raw value
    value: _.camelCase(option.label || option), // Ensure camelCase for values
  }));
}

// -- Removed createTextfieldComponent entirely! -- //

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
    values: optionsArray.map(opt => ({
      label: opt.label,
      value: _.camelCase(opt.label),
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
      values: optionsArray.map(opt => ({
        label: opt.label,
        value: _.camelCase(opt.label),
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
    values: optionsArray.map(opt => ({
      label: opt.label,
      value: _.camelCase(opt.label),
      shortcut: "",
      flag: ""
    }))
  };
}

function createFieldset(line) {
  const hideLabel = !line || line.trim() === "";
  const fallback = "Untitled Fieldset";
  let key = generateUniqueKey("fieldSet");

  if (!key) {
    key = fallback.toLowerCase().replace(/\s+/g, '_');
  }

  return {
    label: line || "",
    hideLabel: hideLabel,
    legend: line || "",
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

function createSurveyComponent(label) {
  const hideLabel = !label || label.trim() === "";
  const fallback = "Untitled Survey";
  let modifiedLabel = label || "";

  if (hideLabel) {
    modifiedLabel = "";
  }

  let key = generateUniqueKey(hideLabel ? fallback : label);

  if (!key) {
    key = fallback.toLowerCase().replace(/\s+/g, '_');
  }

  let questions = [];
  let values = [];

  while (questions.length === 0) {
    const surveyQuestionsInput = prompt(
      "Enter survey questions separated by commas (e.g., 'Question 1, Question 2'):"
    );
    if (!surveyQuestionsInput || surveyQuestionsInput.trim() === "") {
      alert("Survey questions are required. Please try again.");
    } else {
      questions = surveyQuestionsInput
        .split(",")
        .map(q => ({
          label: q.trim(),
          value: _.camelCase(q.trim())
        }));
    }
  }

  while (values.length === 0) {
    const surveyOptionsInput = prompt(
      "Enter survey options separated by commas (e.g., 'Yes, No'):"
    );
    if (!surveyOptionsInput || surveyOptionsInput.trim() === "") {
      alert("Survey options are required. Please try again.");
    } else {
      values = surveyOptionsInput
        .split(",")
        .map(v => ({
          label: v.trim(),
          value: _.camelCase(v.trim())
        }));
    }
  }

  return {
    label: modifiedLabel,
    hideLabel: hideLabel,
    key: key,
    type: "survey",
    input: true,
    reportable: true,
    validate: { required: true },
    questions,
    values
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

function setupConditionalLogic(component, allComponents) {
  const enableConditional = confirm("Would you like to add conditional logic to this component?");
  if (!enableConditional) return;

  const showValue = confirm("Should the component be shown when the condition is met? (OK for true, Cancel for false)");
  const componentKeys = allComponents.map(comp => comp.key).filter(key => key !== component.key);

  if (componentKeys.length === 0) {
    alert("No other components available for conditional logic.");
    return;
  }

  const whenKey = prompt(`Select a component key for the 'when' condition:\n${componentKeys.join("\n")}`);
  if (!componentKeys.includes(whenKey)) {
    alert("Invalid selection for 'when' condition.");
    return;
  }

  const selectedComponent = allComponents.find(comp => comp.key === whenKey);
  if (!selectedComponent || !selectedComponent.values) {
    alert("The selected component doesn't have values for 'eq' condition.");
    return;
  }

  const eqValue = prompt(`Select a value for the 'eq' condition:\n${selectedComponent.values.map(v => v.label).join("\n")}`);
  if (!eqValue) {
    alert("You must provide a value for the 'eq' condition.");
    return;
  }

  component.conditional = {
    show: showValue,
    when: whenKey,
    eq: eqValue
  };
}

function loadDictionaryRows(documentId) {
  return new Promise((resolve, reject) => {
    const sql = `SELECT keyword, component_type FROM dictionary WHERE document_id = ?`;
    db.all(sql, [documentId], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

/**
 * Replaces references to "textfield" with a fallback of "textarea"
 * if the dictionary doesn't specify a known type.
 */
function buildComponentFromDictionary(line, componentType, allComponents) {
  let optionsArray = [];
  if (['selectboxes', 'select', 'radio'].includes(componentType)) {
    const optionsInput = prompt("Enter options separated by commas:");
    if (optionsInput && optionsInput.trim() !== "") {
      optionsArray = optionsInput.split(',').map(opt => ({
        label: opt.trim(),
        value: _.camelCase(opt.trim())
      }));
    }
    if (optionsArray.length === 0) {
      console.error(`No valid options provided for ${componentType}.`);
      return null;
    }
  }

  let component;
  switch (componentType) {
    case 'fieldset':
      component = createFieldset(line);
      break;
    case 'file':
      component = createFileComponent(line);
      break;
    case 'textarea':
      component = createTextareaComponent(line);
      break;
    case 'number':
      component = createNumberComponent(line);
      break;
    case 'phoneNumber':
      component = createPhoneNumberComponent(line);
      break;
    case 'address':
      component = createAddressComponent(line);
      break;
    case 'datetime':
      component = createDateTimeComponent(line);
      break;
    case 'date':
      component = createDateComponent(line);
      break;
    case 'time':
      component = createTimeComponent(line);
      break;
    case 'currency':
      component = createCurrencyComponent(line);
      break;
    case 'survey':
      component = createSurveyComponent(line);
      break;
    case 'disclaimer':
      component = createDisclaimerComponent(line);
      break;

    // Fallback: use textarea if dictionary doesn't specify a recognized type
    default:
      component = createTextareaComponent(line);
      break;
  }

  if (component) {
    setupConditionalLogic(component, allComponents);
  }
  return component;
}

async function parseTextUnified(text, documentId) {
  usedKeys.clear();

  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  // Instead of defaulting to textfield, let's just default to textarea if no "group"
  const root = createFieldset('Grouping');
  const allComponents = [];

  for (const line of lines) {
    const compType = line.toLowerCase().includes('group')
      ? 'fieldset'
      : 'textarea';

    const comp = buildComponentFromDictionary(line, compType, allComponents);
    if (comp) {
      root.components.push(comp);
      allComponents.push(comp);
    }
  }

  const cleanedRoot = removeDataPropertiesDeep(root);
  return cleanedRoot;
}





module.exports = {
  INSPECTION_TOKEN,
  usedKeys,
  generateUniqueKey,
  createFieldset,
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
  buildComponentFromDictionary,
  parseTextUnified
};
