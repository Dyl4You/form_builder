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

function loadActionButtonsHTML() {
  const source = fs.readFileSync(require.resolve('../public/js/mainFormBuilder.js'), 'utf8');
  const actionButtonsSource = extractFunctionSource(source, 'actionButtonsHTML');
  const context = {
    isManagedQuizSectionFieldset: component => !!component?.__managedQuizSection,
    isFileUploadBuilderComponent: () => false,
    isManagedListBuilderComponent: () => false,
    isQuizFieldset: () => false,
    hasEnabledOptionFlags: () => false,
    isDateTimeBuilderComponent: () => false,
    getFileUploadComponentMode: () => '',
    actionButtonsHTML: null
  };

  vm.runInNewContext(`${actionButtonsSource}\nthis.actionButtonsHTML = actionButtonsHTML;`, context);
  return context.actionButtonsHTML;
}

test('managed quiz sections render component-list actions without destructive layout controls', () => {
  const actionButtonsHTML = loadActionButtonsHTML();
  const html = actionButtonsHTML(true, {
    type: 'fieldset',
    key: 'quizQuestions',
    validate: {},
    __managedQuizSection: true
  });

  assert.notEqual(html.trim(), '');
  assert.match(html, /data-action="conditional"/);
  assert.match(html, /anchor-btn/);
  assert.doesNotMatch(html, /data-action="wrap2"/);
  assert.doesNotMatch(html, /data-action="delete"/);
});

test('regular sections keep wrap and delete actions available', () => {
  const actionButtonsHTML = loadActionButtonsHTML();
  const html = actionButtonsHTML(true, {
    type: 'fieldset',
    key: 'regularSection',
    validate: {}
  });

  assert.match(html, /data-action="conditional"/);
  assert.match(html, /data-action="wrap2"/);
  assert.match(html, /data-action="delete"/);
});
