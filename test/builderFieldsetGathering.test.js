const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function extractFunctionSource(source, functionName) {
  const signature = `function ${functionName}(`;
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `Could not find ${functionName} in source`);

  const bodyStart = source.indexOf('{', start);
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

function loadGatherFieldsets() {
  const source = fs.readFileSync(require.resolve('../public/js/mainFormBuilder.js'), 'utf8');
  const gatherFieldsetsSource = extractFunctionSource(source, 'gatherFieldsets');
  const context = {
    isQuizFieldset: () => false,
    getVisibleQuizBuilderSections: () => [],
    gatherFieldsets: null
  };

  vm.runInNewContext(`${gatherFieldsetsSource}\nthis.gatherFieldsets = gatherFieldsets;`, context);
  return context.gatherFieldsets;
}

function loadWrapComponentInColumns(overrides = {}) {
  const source = fs.readFileSync(require.resolve('../public/js/mainFormBuilder.js'), 'utf8');
  const wrapSource = extractFunctionSource(source, 'wrapComponentInColumns');
  const parentArray = overrides.parentArray || [];
  const notifications = [];
  let previewCalls = 0;

  const context = {
    window: {
      compactActionBundles: overrides.compactActionBundles ? () => {} : null
    },
    getActiveBuilderDestination: () => parentArray,
    isVisibleBuilderComponent: component => !!component && !component.builderHidden,
    createComponent: () => ({
      type: 'columns',
      key: 'columns1',
      columns: [
        { components: [] },
        { components: [] }
      ]
    }),
    createColumnSlot: (source = {}, component = undefined) => ({
      ...source,
      components: component === undefined
        ? Array.isArray(source.components) ? source.components.slice(0, 1) : []
        : component ? [component] : []
    }),
    setPendingColumnInsertTarget: () => null,
    clearPendingColumnInsertTarget: () => null,
    setBuilderInsertionAnchor: () => null,
    showNotification: message => notifications.push(message),
    compactActionBundles: () => null,
    updatePreview: () => {
      previewCalls += 1;
    },
    wrapComponentInColumns: null
  };

  vm.runInNewContext(`${wrapSource}\nthis.wrapComponentInColumns = wrapComponentInColumns;`, context);
  return {
    wrapComponentInColumns: context.wrapComponentInColumns,
    notifications,
    getPreviewCalls: () => previewCalls,
    parentArray
  };
}

test('gatherFieldsets keeps sections discoverable after wrapping them in columns', () => {
  const gatherFieldsets = loadGatherFieldsets();
  const section = {
    type: 'fieldset',
    key: 'inspectionSection',
    label: 'Inspection',
    components: []
  };
  const formComponents = [
    {
      type: 'columns',
      key: 'columns1',
      columns: [
        { components: [section] },
        { components: [] }
      ]
    }
  ];

  const discoveredKeys = Array.from(
    gatherFieldsets(formComponents),
    component => component.key
  );

  assert.deepEqual(discoveredKeys, ['inspectionSection']);
});

test('wrapComponentInColumns auto-pairs the next visible component into the second column', () => {
  const first = { type: 'textfield', key: 'first', label: 'First' };
  const second = { type: 'textfield', key: 'second', label: 'Second' };
  const harness = loadWrapComponentInColumns({
    parentArray: [first, second]
  });

  harness.wrapComponentInColumns(0);

  assert.equal(harness.parentArray.length, 1);
  assert.equal(harness.parentArray[0].type, 'columns');
  assert.equal(harness.parentArray[0].columns[0].components[0], first);
  assert.equal(harness.parentArray[0].columns[1].components[0], second);
  assert.equal(harness.getPreviewCalls(), 1);
  assert.deepEqual(
    harness.notifications,
    ['Wrapped current and next components in 2 columns']
  );
});
