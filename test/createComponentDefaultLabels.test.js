const test = require('node:test');
const assert = require('node:assert/strict');

test('createComponent defaults match the builder card labels', () => {
  const parser = require('../src/parser/unifiedParser');
  const createComponentPath = require.resolve('../public/js/createComponent.js');
  const previousWindow = global.window;

  parser.usedKeys.clear();
  delete require.cache[createComponentPath];

  try {
    global.window = { _actionsCounter: 0 };
    const { createComponent } = require(createComponentPath);

    const expectedLabels = new Map([
      ['disclaimer', 'Disclaimer'],
      ['textarea', 'Short Input'],
      ['account', 'Worker'],
      ['quiz', 'Knowledge Check'],
      ['file', 'Photo'],
      ['phoneNumber', 'Phone'],
      ['address', 'Address'],
      ['asset', 'Equipment'],
      ['datetime', 'Date / Time'],
      ['number', 'Number'],
      ['datagrid', 'Basic Table'],
      ['editgrid', 'Custom Table']
    ]);

    for (const [type, expectedLabel] of expectedLabels) {
      const component = createComponent(type);
      assert.equal(component.label, expectedLabel, `expected ${type} to default to ${expectedLabel}`);
    }
  } finally {
    parser.usedKeys.clear();
    delete require.cache[createComponentPath];
    if (previousWindow === undefined) {
      delete global.window;
    } else {
      global.window = previousWindow;
    }
  }
});
