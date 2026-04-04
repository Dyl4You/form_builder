const { makeUniqueOptionValue } = require('./naming');

const JHA_PATTERN = /\b(jha|jsa|job\s+hazard\s+analysis|job\s+safety\s+analysis)\b/i;
const WHOLE_FORM_PATTERN = /\b(build(?:\s+out)?|create|generate|make|draft|scaffold|start|template|form|checklist)\b/i;
const EDIT_PATTERN = /\b(rename|delete|remove|update|change|edit|move|insert|replace|hide|show|toggle|reorder|optional|required)\b/i;
const NARROW_COMPONENT_PATTERN = /\b(field|component|question|label|textarea|textfield|radio|select|dropdown|checkbox|file)\b/i;

const BLUEPRINT_GUIDANCE = `
• If the user asks for a whole form, template, checklist, or named workflow, expand it into a practical multi-component structure.
• Never satisfy a form-building request with one placeholder component labeled after the form itself.
• Resolve common workplace acronyms. "JHA" / "JSA" means a Job Hazard Analysis / Job Safety Analysis form with job details, hazards, controls, risk ratings, pre-job checks, and sign-off unless the user narrows the scope.
• Prefer specific, operational field labels such as "Job / Task", "Hazard", "Controls", "Required PPE", or "Approved By" over generic labels like "JHA" or "Section 1".
`.trim();

function normalizePrompt(prompt = '') {
  return String(prompt || '').trim();
}

function promptWords(prompt = '') {
  return normalizePrompt(prompt)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function isWholeFormRequest(prompt = '') {
  const words = promptWords(prompt);
  if (!words.length) return false;
  if (words.length <= 4) return true;
  return WHOLE_FORM_PATTERN.test(prompt);
}

function isEditRequest(prompt = '') {
  return EDIT_PATTERN.test(prompt);
}

function isSingleComponentRequest(prompt = '') {
  return NARROW_COMPONENT_PATTERN.test(prompt) && !/\b(form|template|checklist|section)\b/i.test(prompt);
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function optionValues(labels = []) {
  const usedValues = new Set();

  return labels.map((label, index) => {
    const value = makeUniqueOptionValue(label, usedValues, `option${index + 1}`);
    usedValues.add(value);
    return { label, value };
  });
}

function createTextfield(label, key, extra = {}) {
  return {
    label,
    key,
    type: 'textfield',
    input: true,
    tableView: true,
    reportable: true,
    validate: { required: true },
    ...extra
  };
}

function createTextarea(label, key, rows = 3, extra = {}) {
  return {
    label,
    key,
    type: 'textarea',
    input: true,
    rows,
    autoExpand: true,
    tableView: true,
    reportable: true,
    validate: { required: true },
    ...extra
  };
}

function createSelect(label, key, labels, extra = {}) {
  return {
    label,
    key,
    type: 'select',
    input: true,
    widget: 'html5',
    placeholder: '-- Select --',
    data: {
      values: optionValues(labels)
    },
    tableView: true,
    reportable: true,
    validate: { required: true },
    ...extra
  };
}

function createSelectboxes(label, key, labels, extra = {}) {
  return {
    label,
    key,
    type: 'selectboxes',
    input: true,
    inputType: 'checkbox',
    optionsLabelPosition: 'right',
    values: optionValues(labels),
    tableView: false,
    reportable: true,
    validate: { required: true },
    modalEdit: true,
    ...extra
  };
}

function createRadio(label, key, labels, extra = {}) {
  return {
    label,
    key,
    type: 'radio',
    input: true,
    inline: true,
    optionsLabelPosition: 'right',
    values: optionValues(labels).map(option => ({
      ...option,
      shortcut: '',
      flag: ''
    })),
    tableView: false,
    reportable: true,
    validate: { required: true },
    ...extra
  };
}

function createDate(label, key, extra = {}) {
  return {
    label,
    key,
    type: 'datetime',
    input: true,
    enableDate: true,
    enableTime: false,
    format: 'yyyy-MM-dd',
    widget: { type: 'calendar' },
    tableView: true,
    reportable: true,
    validate: { required: true },
    ...extra
  };
}

function createTime(label, key, extra = {}) {
  return {
    label,
    key,
    type: 'datetime',
    input: true,
    enableDate: false,
    enableTime: true,
    format: 'HH:mm',
    tableView: true,
    reportable: true,
    validate: { required: true },
    ...extra
  };
}

function createFieldset(label, key, components, extra = {}) {
  return {
    label,
    legend: label,
    key,
    type: 'fieldset',
    input: false,
    tableView: false,
    components,
    ...extra
  };
}

function createContent(label, key, html, extra = {}) {
  return {
    label,
    key,
    type: 'content',
    input: false,
    tableView: false,
    reportable: true,
    html,
    ...extra
  };
}

function createDatagrid(label, key, components, extra = {}) {
  return {
    label,
    key,
    type: 'datagrid',
    input: true,
    tableView: false,
    reorder: false,
    addAnotherPosition: 'bottom',
    defaultValue: [{}],
    components,
    ...extra
  };
}

function createFile(label, key, extra = {}) {
  return {
    label,
    key,
    type: 'file',
    input: true,
    storage: 'base64',
    fileTypes: [],
    defaultValue: [],
    multiple: true,
    tableView: false,
    reportable: true,
    ...extra
  };
}

function extractFocusTopic(prompt = '') {
  const match = normalizePrompt(prompt).match(
    /\b(?:jha|jsa|job\s+hazard\s+analysis|job\s+safety\s+analysis)\b(?:\s+(?:template|form|checklist))?\s+(?:for|on|about)\s+(.+)$/i
  );
  if (!match) return '';
  return match[1].replace(/[.?!]+$/g, '').trim();
}

function buildJhaBlueprint(prompt = '') {
  const focusTopic = extractFocusTopic(prompt);
  const overviewParagraphs = [
    'Use this Job Hazard Analysis to break the work into steps, identify hazards, define controls, and confirm the crew understands the plan before starting.'
  ];

  if (focusTopic) {
    overviewParagraphs.push(`Template focus: ${focusTopic}.`);
  }

  return [
    createContent(
      'JHA Overview',
      'jhaOverview',
      overviewParagraphs.map(text => `<p>${escapeHtml(text)}</p>`).join('')
    ),
    createFieldset('Job Details', 'jobDetails', [
      createTextfield('Job / Task', 'jobTask'),
      createTextfield('Work Order / Permit Number', 'workOrderPermitNumber'),
      createDate('Analysis Date', 'analysisDate'),
      createTime('Start Time', 'startTime'),
      createTextfield('Work Location', 'workLocation'),
      createTextfield('Supervisor / Lead', 'supervisorLead'),
      createTextfield('Crew Members', 'crewMembers'),
      createTextarea('Scope of Work', 'scopeOfWork')
    ]),
    createFieldset('Hazard Controls', 'hazardControls', [
      createSelectboxes('Hazard Categories', 'hazardCategories', [
        'Working at Heights',
        'Electrical',
        'Confined Space',
        'Hot Work',
        'Mobile Equipment',
        'Lifting / Rigging',
        'Chemical Exposure'
      ]),
      createSelectboxes('Required Permits / Isolations', 'requiredPermitsIsolations', [
        'Lockout / Tagout',
        'Hot Work Permit',
        'Confined Space Permit',
        'Ground Disturbance Permit',
        'Line Break / Isolation',
        'Fire Watch'
      ]),
      createSelectboxes('Required PPE', 'requiredPpe', [
        'Hard Hat',
        'Safety Glasses',
        'Gloves',
        'High-Visibility Clothing',
        'Hearing Protection',
        'Respiratory Protection',
        'Fall Protection'
      ]),
      createTextarea('Site / Environmental Conditions', 'siteEnvironmentalConditions', 2),
      createTextarea('Emergency / Rescue Plan', 'emergencyRescuePlan', 2)
    ]),
    createDatagrid('Job Steps and Hazard Controls', 'jobStepsAndHazardControls', [
      createTextfield('Step / Task', 'stepTask'),
      createTextarea('Hazard', 'hazard', 2),
      createTextarea('Potential Consequence', 'potentialConsequence', 2),
      createSelect('Initial Risk Rating', 'initialRiskRating', [
        'Low',
        'Medium',
        'High',
        'Critical'
      ]),
      createTextarea('Controls / Safe Work Practices', 'controlsSafeWorkPractices', 2),
      createTextfield('Person Responsible', 'personResponsible'),
      createSelect('Residual Risk Rating', 'residualRiskRating', [
        'Low',
        'Medium',
        'High'
      ])
    ]),
    createFieldset('Pre-Job Verification', 'preJobVerification', [
      createRadio('Crew Brief Completed', 'crewBriefCompleted', ['Yes', 'No']),
      createRadio('Permits in Place', 'permitsInPlace', ['Yes', 'No', 'N/A']),
      createRadio('Isolation / Lockout Verified', 'isolationLockoutVerified', ['Yes', 'No', 'N/A']),
      createRadio('Emergency Plan Reviewed', 'emergencyPlanReviewed', ['Yes', 'No']),
      createRadio('Work Authorized to Proceed', 'workAuthorizedToProceed', ['Yes', 'No']),
      createTextarea('Stop Work Conditions / Special Precautions', 'stopWorkConditions', 2)
    ]),
    createFieldset('Review and Sign-Off', 'reviewAndSignOff', [
      createTextfield('Prepared By', 'preparedBy'),
      createTextfield('Reviewed With Crew By', 'reviewedWithCrewBy'),
      createTextfield('Approved By', 'approvedBy'),
      createTextarea('Crew Acknowledgement Notes', 'crewAcknowledgementNotes', 2, {
        validate: { required: false }
      }),
      createFile('Supporting Photos / Attachments', 'supportingPhotos')
    ])
  ];
}

function shouldUseJhaExample(prompt = '') {
  const normalized = normalizePrompt(prompt);
  if (!normalized || !JHA_PATTERN.test(normalized)) {
    return false;
  }

  if (!isWholeFormRequest(normalized)) {
    return false;
  }

  if (isSingleComponentRequest(normalized)) {
    return false;
  }

  if (isEditRequest(normalized) && !/\bbuild(?:\s+out)?\b/i.test(normalized)) {
    return false;
  }

  return true;
}

function getPromptBlueprintEnrichment(prompt = '') {
  const normalized = normalizePrompt(prompt);
  if (!shouldUseJhaExample(normalized)) {
    return null;
  }

  return {
    id: 'jha',
    context: 'JHA / JSA means Job Hazard Analysis / Job Safety Analysis. Expand it into a practical form with job details, hazards, controls, risk ratings, required PPE, pre-job checks, and sign-off. Use the user prompt to tailor the sections and labels.',
    examplePayload: {
      components: buildJhaBlueprint(normalized)
    }
  };
}

function getPromptBlueprintContext(prompt = '') {
  if (JHA_PATTERN.test(prompt)) {
    return 'JHA / JSA means Job Hazard Analysis / Job Safety Analysis. Relevant structure usually includes job details, hazard categories, step-by-step hazard analysis, controls, required PPE, risk ratings, pre-job checks, and sign-off.';
  }

  return '';
}

module.exports = {
  BLUEPRINT_GUIDANCE,
  buildJhaBlueprint,
  getPromptBlueprintEnrichment,
  getPromptBlueprintContext
};
