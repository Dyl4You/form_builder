const { trimString } = require('../config/runtimeConfig');
const { sanitizeComponentSchema } = require('./formio');

const DEFAULT_CORFIX_API_BASE_URL = 'https://api.dev.corfix.com';
const CORFIX_ROOT_KEY = 'fieldSet1';
const CORFIX_STYLE_COMPONENT_KEY = 'html11';
const CORFIX_ACTIONS_GROUP_KEY = 'actionsGroup';

function cloneJson(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

const CORFIX_STYLE_COMPONENT = {
  label: 'HTML1',
  labelWidth: 30,
  labelMargin: 3,
  tag: 'style',
  attrs: [
    {
      attr: '',
      value: ''
    }
  ],
  content: `/* ==========================================================================
   CUSTOM GROUPING COMPONENT STYLING
   ========================================================================== */
.corfix legend {
    font-size: 26px;
    font-weight: bold;
}

/* ==========================================================================
   COMPONENT HIDE HIDING
   ========================================================================== */
@media print {
    .dont-show-pdf {
        display: none !important;
    }
}

@media only screen and (max-width: 1024px) {
  .hide-on-mobile {
    display: none !important;
  }
}

/* ==============================================
   PAGE BREAK CONTROL
============================================== */
.dontbreakinside { 
    /* Avoids page breaks inside elements with this class */
    page-break-inside: avoid !important;
}

/* ==============================================
   PANEL HEADER STYLING
============================================== */
.corfix .card-header { 
    /* Makes font bold for .bg-default in .transparent class */
    font-weight: bold;
    background: #f8f8f8;
}

/* ==========================================================================
   DATAGRID TABLE RESPONSIVENESS
   ========================================================================== */
.corfix .formio-component-datagrid {
    overflow-x: auto;
    overflow-y: hidden;
    width: 100%;
    -webkit-overflow-scrolling: touch;
}

/* ==========================================================================
   CUSTOM SURVEY COMPONENT STYLING
   ========================================================================== */
.corfix .formio-component-survey {
    overflow-x: auto;
}

.corfix .formio-component-survey .table {
    /* Set width for table cells beyond the first column */
}
.corfix .formio-component-survey .table th:nth-child(n+2),
.corfix .formio-component-survey .table td:nth-child(n+2) {
    width: 10%;
}

.corfix .formio-component-survey input {
    transform: scale(2);
}

.corfix .formio-component-survey .table td {
    vertical-align: middle;
}

/* ==========================================================================
   CUSTOM CHECKBOX, RADIO, SELECTBOX STYLING
   ========================================================================== */
.corfix .form-check { 
    font-size: 16px;
    margin-bottom: 1rem;
}

/* ==========================================================================
   CUSTOM EDIT GRID COMPONENT STYLING
   ========================================================================== */
.removeborder .list-group-item { 
    padding: 0;
    border: 0;
}

.formio-dialog .form-group {
    margin-bottom: 1.5rem !important;
}

/* ==========================================================================
   MEDIA QUERIES
   ========================================================================== */
@media only screen and (max-width: 1250px) {
    .corfix legend {
        font-size: 24px;
        font-weight: bold;
        background: linear-gradient(to right, transparent, #f1f1f1);
        border-radius: 4px;
        padding: 5px;
    }
}

/* ==========================================================================
   PLACEHOLDER
   ========================================================================== */
`,
  refreshOnChange: false,
  key: CORFIX_STYLE_COMPONENT_KEY,
  type: 'htmlelement',
  input: false,
  tableView: false
};

const CORFIX_ACTIONS_GROUP = {
  label: 'Actions',
  legend: 'Actions',
  labelWidth: 30,
  labelMargin: 3,
  key: CORFIX_ACTIONS_GROUP_KEY,
  type: 'fieldset',
  input: false,
  tableView: false,
  components: [
    {
      label: 'Comments',
      labelWidth: 30,
      labelMargin: 3,
      autoExpand: true,
      tableView: true,
      reportable: true,
      validate: {
        required: true
      },
      key: 'commentsActions',
      customConditional: "const key = instance.parent.component.components.find(c => c.key.startsWith('actions'))?.key; show = row[key]?.comments;",
      type: 'textarea',
      input: true
    },
    {
      label: 'Grouping',
      labelWidth: 30,
      labelMargin: 3,
      key: 'taskFieldset',
      customConditional: "const key = instance.parent.component.components.find(c => c.key.startsWith('actions'))?.key; show = row[key]?.task;",
      type: 'fieldset',
      input: false,
      tableView: false,
      components: [
        {
          label: 'Tasks',
          labelWidth: 30,
          labelMargin: 3,
          tableView: false,
          taskTriggers: [
            {
              triggerType: 'value',
              taskPriority: 'low',
              triggerComponent: {},
              triggerValue: {},
              taskName: '',
              taskType: {},
              assignType: '',
              assignOptions: [],
              localId: 'ej5qb2'
            }
          ],
          key: 'tasks',
          type: 'tasks',
          input: true,
          defaultOpen: true,
          data: {},
          components: [
            {
              label: 'Name',
              labelWidth: 30,
              labelMargin: 3,
              tableView: true,
              reportable: false,
              key: 'title',
              type: 'textfield',
              input: true,
              validate: {
                required: true
              }
            },
            {
              label: 'Type',
              widget: 'html5',
              labelWidth: 30,
              labelMargin: 3,
              tableView: true,
              reportable: false,
              data: {
                values: [
                  {
                    label: 'Corrective',
                    value: '6926684acbe67916d876869b'
                  },
                  {
                    label: 'Preventive',
                    value: '6926684acbe679de4876869a'
                  },
                  {
                    label: 'Task',
                    value: '6926684acbe6793558768699'
                  }
                ]
              },
              key: 'type',
              type: 'select',
              input: true,
              validate: {
                required: true
              }
            },
            {
              label: 'Priority',
              widget: 'html5',
              labelWidth: 30,
              labelMargin: 3,
              tableView: true,
              reportable: false,
              defaultValue: 'low',
              data: {
                values: [
                  {
                    label: 'Low',
                    value: 'low'
                  },
                  {
                    label: 'Medium',
                    value: 'medium'
                  },
                  {
                    label: 'High',
                    value: 'high'
                  }
                ]
              },
              key: 'priority',
              type: 'select',
              input: true,
              validate: {
                required: true
              }
            },
            {
              label: 'Assigned To',
              widget: 'choicesjs',
              multiple: true,
              labelWidth: 30,
              labelMargin: 3,
              tableView: true,
              reportable: false,
              key: 'assignedTo',
              type: 'account',
              input: true,
              validate: {
                required: true
              },
              data: {
                values: [
                  {
                    label: 'Cody Sangster',
                    value: 'Cody Sangster'
                  },
                  {
                    label: 'Dylan Sangster',
                    value: 'Dylan Sangster'
                  },
                  {
                    label: 'Spencer Pincott',
                    value: 'Spencer Pincott'
                  },
                  {
                    label: 'Spencer Pincott',
                    value: 'Spencer Pincott'
                  }
                ]
              }
            }
          ]
        }
      ]
    },
    {
      label: 'Photos',
      labelWidth: 30,
      labelMargin: 3,
      tableView: false,
      fileTypes: [
        {
          label: '',
          value: ''
        }
      ],
      validate: {
        required: true
      },
      key: 'photos',
      customConditional: "const key = instance.parent.component.components.find(c => c.key.startsWith('actions'))?.key; show = row[key]?.photos;",
      type: 'file',
      imageSize: '400',
      input: true
    },
    {
      label: 'Actions',
      labelWidth: 30,
      labelMargin: 3,
      optionsLabelPosition: 'right',
      inline: true,
      hideLabel: true,
      tableView: false,
      reportable: true,
      values: [
        {
          label: 'Comments',
          value: 'comments',
          shortcut: '',
          flag: ''
        },
        {
          label: 'Photos',
          value: 'photos',
          shortcut: '',
          flag: ''
        },
        {
          label: 'Task',
          value: 'task',
          shortcut: '',
          flag: ''
        }
      ],
      key: 'actions',
      type: 'selectboxes',
      input: true,
      inputType: 'checkbox'
    }
  ]
};

function normalizeCorfixSchema(schema) {
  const parsedSchema = typeof schema === 'string'
    ? JSON.parse(schema)
    : cloneJson(schema);

  if (Array.isArray(parsedSchema)) {
    sanitizeComponentSchema(parsedSchema);
    return parsedSchema;
  }

  if (parsedSchema && typeof parsedSchema === 'object' && Array.isArray(parsedSchema.components)) {
    sanitizeComponentSchema(parsedSchema.components);
  }

  return parsedSchema;
}

function isCorfixStyleComponent(component) {
  return Boolean(
    component
    && typeof component === 'object'
    && component.type === 'htmlelement'
    && component.tag === 'style'
    && (
      String(component.key || '').trim() === CORFIX_STYLE_COMPONENT_KEY
      || String(component.content || '').includes('.corfix legend')
    )
  );
}

function isCorfixActionsGroup(component) {
  const key = String(component?.key || '').trim();
  return Boolean(
    component
    && typeof component === 'object'
    && component.type === 'fieldset'
    && (
      key === CORFIX_ACTIONS_GROUP_KEY
      || /^actionsGroup\d*$/.test(key)
    )
  );
}

function extractCorfixContentComponents(schema) {
  if (Array.isArray(schema)) {
    return cloneJson(schema);
  }

  if (!schema || typeof schema !== 'object') {
    return schema == null ? [] : [cloneJson(schema)];
  }

  if (Array.isArray(schema.components)) {
    return cloneJson(schema.components);
  }

  return [cloneJson(schema)];
}

function buildCorfixWrappedComponents(schema) {
  const parsedSchema = normalizeCorfixSchema(schema);
  const contentComponents = extractCorfixContentComponents(parsedSchema)
    .filter((component) => !isCorfixStyleComponent(component))
    .filter((component) => !isCorfixActionsGroup(component));

  sanitizeComponentSchema(contentComponents);

  return [
    cloneJson(CORFIX_STYLE_COMPONENT),
    ...contentComponents,
    cloneJson(CORFIX_ACTIONS_GROUP)
  ];
}

function buildCorfixRootGrouping(components = []) {
  return {
    label: 'Grouping',
    labelWidth: 30,
    labelMargin: 3,
    customClass: 'text-dark corfix',
    key: CORFIX_ROOT_KEY,
    type: 'fieldset',
    input: false,
    tableView: false,
    components
  };
}

function isCorfixRootGrouping(schema) {
  return Boolean(
    schema
    && typeof schema === 'object'
    && !Array.isArray(schema)
    && schema.type === 'fieldset'
    && (
      schema.key === CORFIX_ROOT_KEY
      || schema.key === 'fieldSet'
    )
    && Array.isArray(schema.components)
  );
}

function buildCorfixQuestionsComponents(schema) {
  const parsedSchema = normalizeCorfixSchema(schema);
  const wrappedComponents = buildCorfixWrappedComponents(parsedSchema);
  return [buildCorfixRootGrouping(wrappedComponents)];
}

function normalizeCorfixGroupIds(groupIds = []) {
  const values = Array.isArray(groupIds) ? groupIds : [groupIds];
  return [...new Set(values
    .map((value) => trimString(value))
    .filter(Boolean))];
}

function buildCorfixTemplateBody({ title, schema, groupIds = [] }) {
  const normalizedGroupIds = normalizeCorfixGroupIds(groupIds);
  const template = {
    draftAvailable: true,
    enableCopy: true,
    type: 'form',
    title: trimString(title) || 'Untitled Template',
    questions: {
      components: buildCorfixQuestionsComponents(schema)
    }
  };

  if (normalizedGroupIds.length) {
    template.groupIds = normalizedGroupIds;
  }

  return [template];
}

function getCorfixPublishConfig(env = process.env, overrides = {}) {
  const token = trimString(overrides.token || env.CORFIX_API_TOKEN);
  const companyId = trimString(overrides.companyId || env.CORFIX_COMPANY_ID);
  const apiBaseUrl = trimString(overrides.apiBaseUrl || env.CORFIX_API_BASE_URL)
    || DEFAULT_CORFIX_API_BASE_URL;

  const missing = [];
  if (!token) missing.push('CORFIX_API_TOKEN');
  if (!companyId) missing.push('CORFIX_COMPANY_ID');

  return {
    apiBaseUrl: apiBaseUrl.replace(/\/+$/, ''),
    token,
    companyId,
    enabled: missing.length === 0,
    missing
  };
}

async function parseCorfixResponse(response) {
  const text = await response.text().catch(() => '');
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (_error) {
    return { raw: text };
  }
}

function resolveCorfixErrorMessage(data, status) {
  return data?.error?.message
    || data?.error
    || data?.message
    || `Corfix API error ${status}`;
}

function resolveCorfixTemplateId(data) {
  if (Array.isArray(data)) {
    return trimString(data[0]?._id || data[0]?.id) || null;
  }

  return trimString(data?._id || data?.id) || null;
}

function normalizeCorfixGroupRecord(group) {
  if (!group || typeof group !== 'object') return null;

  const id = trimString(group.id || group._id);
  const name = trimString(group.name);
  if (!id || !name) return null;

  return {
    id,
    name,
    companyId: trimString(group.companyId) || null,
    templateIds: Array.isArray(group.templateIds)
      ? group.templateIds.map((value) => trimString(value)).filter(Boolean)
      : [],
    hidden: Boolean(group.hidden),
    subtrade: Boolean(group.subtrade),
    updatedAt: group.updatedAt || null
  };
}

function buildCorfixAuthHeaders(token, extraHeaders = {}) {
  return {
    Authorization: `Bearer ${token}`,
    ...extraHeaders
  };
}

function buildCorfixGroupListUrl(config) {
  const filter = encodeURIComponent(JSON.stringify({
    where: {
      hidden: {
        neq: true
      }
    },
    order: ['name ASC']
  }));
  return `${config.apiBaseUrl}/${encodeURIComponent(config.companyId)}/groups?filter=${filter}&bypassGroups=true`;
}

function buildCorfixGroupUrl(config, groupId) {
  return `${config.apiBaseUrl}/${encodeURIComponent(config.companyId)}/groups/${encodeURIComponent(groupId)}?bypassGroups=true`;
}

async function listCorfixGroups(options = {}) {
  const {
    companyId,
    env = process.env,
    fetchImpl = globalThis.fetch,
    logger = console
  } = options;

  const config = getCorfixPublishConfig(env, { companyId });
  if (!config.enabled) {
    return {
      ok: false,
      skipped: true,
      reason: `Missing ${config.missing.join(' and ')}.`,
      companyId: config.companyId || null,
      groups: []
    };
  }

  if (typeof fetchImpl !== 'function') {
    return {
      ok: false,
      error: 'Fetch is not available for Corfix groups.',
      companyId: config.companyId,
      groups: []
    };
  }

  const url = buildCorfixGroupListUrl(config);

  try {
    logger?.info?.(`[corfix] loading groups for company ${config.companyId}`);

    const response = await fetchImpl(url, {
      method: 'GET',
      headers: buildCorfixAuthHeaders(config.token, {
        Accept: 'application/json'
      })
    });

    const data = await parseCorfixResponse(response);
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: resolveCorfixErrorMessage(data, response.status),
        details: data,
        companyId: config.companyId,
        groups: []
      };
    }

    const groups = (Array.isArray(data) ? data : [])
      .map(normalizeCorfixGroupRecord)
      .filter(Boolean)
      .sort((left, right) => left.name.localeCompare(right.name));

    return {
      ok: true,
      companyId: config.companyId,
      groups
    };
  } catch (error) {
    logger?.error?.('[corfix] group load failed:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown Corfix group load error.',
      companyId: config.companyId,
      groups: []
    };
  }
}

async function createCorfixGroup(options = {}) {
  const {
    name,
    companyId,
    env = process.env,
    fetchImpl = globalThis.fetch,
    logger = console
  } = options;

  const trimmedName = trimString(name);
  if (!trimmedName) {
    return {
      ok: false,
      status: 400,
      error: 'Group name is required.',
      group: null
    };
  }

  const config = getCorfixPublishConfig(env, { companyId });
  if (!config.enabled) {
    return {
      ok: false,
      skipped: true,
      reason: `Missing ${config.missing.join(' and ')}.`,
      companyId: config.companyId || null,
      group: null
    };
  }

  if (typeof fetchImpl !== 'function') {
    return {
      ok: false,
      error: 'Fetch is not available for Corfix groups.',
      companyId: config.companyId,
      group: null
    };
  }

  const url = `${config.apiBaseUrl}/${encodeURIComponent(config.companyId)}/groups`;

  try {
    logger?.info?.(`[corfix] creating group "${trimmedName}" for company ${config.companyId}`);

    const response = await fetchImpl(url, {
      method: 'POST',
      headers: buildCorfixAuthHeaders(config.token, {
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({
        name: trimmedName,
        hidden: false,
        subtrade: false
      })
    });

    const data = await parseCorfixResponse(response);
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: resolveCorfixErrorMessage(data, response.status),
        details: data,
        companyId: config.companyId,
        group: null
      };
    }

    const group = normalizeCorfixGroupRecord(data);
    return {
      ok: true,
      companyId: config.companyId,
      groupId: group?.id || null,
      group
    };
  } catch (error) {
    logger?.error?.('[corfix] group create failed:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown Corfix group create error.',
      companyId: config.companyId,
      group: null
    };
  }
}

async function fetchCorfixGroup(options = {}) {
  const {
    config,
    groupId,
    fetchImpl = globalThis.fetch
  } = options;

  const response = await fetchImpl(buildCorfixGroupUrl(config, groupId), {
    method: 'GET',
    headers: buildCorfixAuthHeaders(config.token, {
      Accept: 'application/json'
    })
  });
  const data = await parseCorfixResponse(response);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: resolveCorfixErrorMessage(data, response.status),
      details: data,
      group: null
    };
  }

  return {
    ok: true,
    group: normalizeCorfixGroupRecord(data)
  };
}

async function assignTemplateToCorfixGroup(options = {}) {
  const {
    config,
    groupId,
    templateId,
    fetchImpl = globalThis.fetch,
    logger = console
  } = options;

  const existing = await fetchCorfixGroup({
    config,
    groupId,
    fetchImpl
  });
  if (!existing.ok || !existing.group) {
    return {
      ok: false,
      groupId,
      error: existing.error || 'Could not load Corfix group before updating template IDs.'
    };
  }

  const mergedTemplateIds = [...new Set(
    [...existing.group.templateIds, trimString(templateId)].filter(Boolean)
  )];
  const response = await fetchImpl(buildCorfixGroupUrl(config, groupId), {
    method: 'PATCH',
    headers: buildCorfixAuthHeaders(config.token, {
      'Content-Type': 'application/json'
    }),
    body: JSON.stringify({
      templateIds: mergedTemplateIds
    })
  });
  const data = await parseCorfixResponse(response);

  if (!response.ok) {
    logger?.warn?.(`[corfix] failed assigning template ${templateId} to group ${groupId}`);
    return {
      ok: false,
      groupId,
      status: response.status,
      error: resolveCorfixErrorMessage(data, response.status),
      details: data
    };
  }

  return {
    ok: true,
    groupId,
    templateIds: mergedTemplateIds
  };
}

async function assignTemplateToCorfixGroups(options = {}) {
  const {
    config,
    templateId,
    groupIds = [],
    fetchImpl = globalThis.fetch,
    logger = console
  } = options;

  const normalizedGroupIds = normalizeCorfixGroupIds(groupIds);
  if (!normalizedGroupIds.length) {
    return {
      ok: true,
      assignedGroupIds: [],
      failedGroupIds: [],
      errors: []
    };
  }

  const results = await Promise.all(normalizedGroupIds.map((groupId) => assignTemplateToCorfixGroup({
    config,
    groupId,
    templateId,
    fetchImpl,
    logger
  })));

  const assignedGroupIds = results.filter((result) => result.ok).map((result) => result.groupId);
  const failures = results.filter((result) => !result.ok);

  return {
    ok: failures.length === 0,
    assignedGroupIds,
    failedGroupIds: failures.map((result) => result.groupId),
    errors: failures.map((result) => ({
      groupId: result.groupId,
      status: result.status || null,
      error: result.error || 'Unknown Corfix group assignment error.'
    }))
  };
}

async function publishTemplateToCorfix(options = {}) {
  const {
    title,
    schema,
    groupIds,
    companyId,
    env = process.env,
    fetchImpl = globalThis.fetch,
    logger = console
  } = options;

  const config = getCorfixPublishConfig(env, { companyId });
  if (!config.enabled) {
    return {
      ok: false,
      skipped: true,
      reason: `Missing ${config.missing.join(' and ')}.`,
      companyId: config.companyId || null
    };
  }

  if (typeof fetchImpl !== 'function') {
    return {
      ok: false,
      error: 'Fetch is not available for Corfix publishing.',
      companyId: config.companyId
    };
  }

  const normalizedGroupIds = normalizeCorfixGroupIds(groupIds);
  const requestBody = buildCorfixTemplateBody({ title, schema, groupIds: normalizedGroupIds });
  const url = `${config.apiBaseUrl}/${encodeURIComponent(config.companyId)}/templates`;

  try {
    logger?.info?.(`[corfix] publishing "${trimString(title) || 'Untitled Template'}" to company ${config.companyId}`);

    const response = await fetchImpl(url, {
      method: 'POST',
      headers: buildCorfixAuthHeaders(config.token, {
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify(requestBody)
    });

    const data = await parseCorfixResponse(response);
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: resolveCorfixErrorMessage(data, response.status),
        details: data,
        companyId: config.companyId
      };
    }

    const templateId = resolveCorfixTemplateId(data);
    const groupAssignment = templateId
      ? await assignTemplateToCorfixGroups({
        config,
        templateId,
        groupIds: normalizedGroupIds,
        fetchImpl,
        logger
      })
      : {
        ok: normalizedGroupIds.length === 0,
        assignedGroupIds: [],
        failedGroupIds: normalizedGroupIds,
        errors: normalizedGroupIds.length
          ? [{ groupId: null, status: null, error: 'Corfix template ID missing from publish response.' }]
          : []
      };

    return {
      ok: true,
      templateId,
      template: data,
      companyId: config.companyId,
      groupIds: normalizedGroupIds,
      assignedGroupIds: groupAssignment.assignedGroupIds,
      groupAssignment
    };
  } catch (error) {
    logger?.error?.('[corfix] publish failed:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown Corfix publish error.',
      companyId: config.companyId
    };
  }
}

module.exports = {
  DEFAULT_CORFIX_API_BASE_URL,
  buildCorfixQuestionsComponents,
  buildCorfixTemplateBody,
  createCorfixGroup,
  getCorfixPublishConfig,
  listCorfixGroups,
  publishTemplateToCorfix
};
