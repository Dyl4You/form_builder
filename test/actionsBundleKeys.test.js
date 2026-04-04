const test = require('node:test');
const assert = require('node:assert/strict');

function getNestedTaskComponents(components = []) {
  const found = [];
  const stack = Array.isArray(components) ? [...components] : [];

  while (stack.length) {
    const node = stack.shift();
    if (!node || typeof node !== 'object') continue;

    if (node.type === 'tasks') {
      found.push(node);
    }

    if (Array.isArray(node.components)) {
      stack.push(...node.components);
    }

    if (node.type === 'columns' && Array.isArray(node.columns)) {
      node.columns.forEach((column) => {
        if (Array.isArray(column?.components)) {
          stack.push(...column.components);
        }
      });
    }
  }

  return found;
}

test('duplicated action bundles keep nested task field keys fixed', () => {
  const parser = require('../src/parser/unifiedParser');
  const uniqueKeysPath = require.resolve('../public/js/uniqueKeys.js');
  const createComponentPath = require.resolve('../public/js/createComponent.js');
  const previousWindow = global.window;

  parser.usedKeys.clear();
  delete require.cache[uniqueKeysPath];
  delete require.cache[createComponentPath];
  global.window = { _actionsCounter: 0 };

  try {
    require(uniqueKeysPath);
    require(createComponentPath);

    const components = [
      global.window.buildActionsBundle([])[0],
      global.window.buildActionsBundle([])[0]
    ];

    global.window.sanitizeComponentSchema(components);

    const tasks = getNestedTaskComponents(components);
    assert.deepEqual(tasks.map((component) => component.key), ['tasks', 'tasks1']);

    tasks.forEach((task) => {
      assert.deepEqual(
        task.components.map((component) => component.key),
        ['title', 'type', 'priority', 'assignedTo']
      );
    });
  } finally {
    parser.usedKeys.clear();
    delete require.cache[uniqueKeysPath];
    delete require.cache[createComponentPath];

    if (previousWindow === undefined) {
      delete global.window;
    } else {
      global.window = previousWindow;
    }
  }
});
