const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const _ = require('lodash');

function extractFunctionSource(source, functionName) {
  const signature = `function ${functionName}(`;
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `Could not find ${functionName} in source`);

  const paramsStart = source.indexOf('(', start);
  assert.notEqual(paramsStart, -1, `Could not find opening paren for ${functionName}`);

  let paramsDepth = 0;
  let bodyStart = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') paramsDepth += 1;
    if (char === ')') {
      paramsDepth -= 1;
      if (paramsDepth === 0) {
        bodyStart = source.indexOf('{', index);
        break;
      }
    }
  }

  assert.notEqual(bodyStart, -1, `Could not find opening brace for ${functionName}`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Could not find closing brace for ${functionName}`);
}

function loadComponentGroupHarness() {
  const source = fs.readFileSync(require.resolve('../public/js/mainFormBuilder.js'), 'utf8');
  const functionNames = [
    'normalizeComponentGroupItemLabel',
    'normalizeComponentGroupItemLabels',
    'cloneComponentGroupResponseOptions',
    'getBuilderToggleActionsBundleFn',
    'isComponentGroupActionsEnabled',
    'clearManagedComponentGroupRadioActions',
    'syncManagedComponentGroupRadioActions',
    'isBuilderActionsEnabled',
    'getComponentGroupConfig',
    'applyComponentGroupConfig'
  ];

  const snippets = functionNames.map(name => extractFunctionSource(source, name)).join('\n\n');
  const context = {
    DEFAULT_COMPONENT_GROUP_RESPONSES: Object.freeze([
      Object.freeze({ label: 'Yes', value: 'yes', flag: 'success' }),
      Object.freeze({ label: 'No', value: 'no', flag: 'danger' }),
      Object.freeze({ label: 'N/A', value: 'nA', flag: '' })
    ]),
    _: _,
    window: {
      normalizeAllCapsTitle: value => value,
      normalizeChoiceItems: items => ({ items }),
      ensureUniqueValues: items => items
    },
    createComponent: (type, label, options = []) => {
      if (type === 'survey') {
        return {
          type: 'survey',
          key: `${_.camelCase(label || 'survey')}Survey`,
          label,
          hideLabel: true,
          questions: [],
          values: [],
          validate: { required: true }
        };
      }

      if (type === 'radio') {
        return {
          type: 'radio',
          key: `${_.camelCase(label || 'radio')}Radio`,
          label,
          values: options.map(option => ({ ...option })),
          validate: { required: true }
        };
      }

      return {
        type,
        key: `${_.camelCase(label || type)}Fieldset`,
        label,
        legend: label,
        components: [],
        validate: { required: true }
      };
    },
    toggleActionsBundle: (parentArray, enable, ownerComp) => {
      if (!Array.isArray(parentArray) || !ownerComp) return;

      if (enable) {
        if (ownerComp._actionsDriverKey) return;
        const wrapper = {
          type: 'fieldset',
          builderHidden: true,
          key: `${ownerComp.key}ActionsGroup`
        };
        const ownerIndex = parentArray.indexOf(ownerComp);
        parentArray.splice(ownerIndex + 1, 0, wrapper);
        ownerComp._actionsDriverKey = wrapper.key;
        return;
      }

      const driverKey = ownerComp._actionsDriverKey;
      if (!driverKey) return;
      const wrapperIndex = parentArray.findIndex(component => component?.key === driverKey);
      if (wrapperIndex !== -1) {
        parentArray.splice(wrapperIndex, 1);
      }
      delete ownerComp._actionsDriverKey;
    }
  };

  vm.runInNewContext(snippets, context);

  return context;
}

test('radio field groups can enable one actions bundle per managed radio', () => {
  const harness = loadComponentGroupHarness();
  const component = {
    type: 'fieldset',
    customType: 'componentGroup',
    key: 'questionGroup',
    label: 'Question Group',
    components: []
  };

  harness.applyComponentGroupConfig(component, {
    sectionLabel: 'Question Group',
    mode: 'radio',
    items: ['Housekeeping', 'PPE'],
    responses: [
      { label: 'Pass', value: 'pass', shortcut: '', flag: 'success' },
      { label: 'Fail', value: 'fail', shortcut: '', flag: 'danger' }
    ],
    actionsEnabled: true
  });

  const radios = component.components.filter(child => child?.type === 'radio');
  const wrappers = component.components.filter(child => child?.builderHidden);
  const config = harness.getComponentGroupConfig(component);

  assert.equal(radios.length, 2);
  assert.equal(wrappers.length, 2);
  assert.ok(radios.every(radio => radio.builderComponentGroupManaged === true));
  assert.ok(radios.every(radio => radio._actionsDriverKey));
  assert.equal(config.mode, 'radio');
  assert.equal(config.actionsEnabled, true);
  assert.equal(harness.isBuilderActionsEnabled(component), true);
});

test('switching a field group back to survey removes managed radio actions', () => {
  const harness = loadComponentGroupHarness();
  const component = {
    type: 'fieldset',
    customType: 'componentGroup',
    key: 'questionGroup',
    label: 'Question Group',
    components: []
  };

  harness.applyComponentGroupConfig(component, {
    sectionLabel: 'Question Group',
    mode: 'radio',
    items: ['Housekeeping', 'PPE'],
    actionsEnabled: true
  });

  harness.applyComponentGroupConfig(component, {
    sectionLabel: 'Question Group',
    mode: 'survey',
    items: ['Housekeeping', 'PPE'],
    responses: [
      { label: 'Yes', value: 'yes', tooltip: '', flag: 'success' },
      { label: 'No', value: 'no', tooltip: '', flag: 'danger' }
    ],
    actionsEnabled: false
  });

  const radios = component.components.filter(child => child?.type === 'radio');
  const surveys = component.components.filter(child => child?.type === 'survey');
  const wrappers = component.components.filter(child => child?.builderHidden);
  const config = harness.getComponentGroupConfig(component);

  assert.equal(radios.length, 0);
  assert.equal(surveys.length, 1);
  assert.equal(wrappers.length, 0);
  assert.equal(config.mode, 'survey');
  assert.equal(config.actionsEnabled, false);
  assert.equal(harness.isBuilderActionsEnabled(component), false);
});
