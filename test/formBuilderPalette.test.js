const test = require('node:test');
const assert = require('node:assert/strict');

const { buildOrderedComponentTypes } = require('../src/routes/formBuilder');

test('buildOrderedComponentTypes keeps table and field-group cards in the requested order', () => {
  const orderedTypes = buildOrderedComponentTypes({
    quiz: 250,
    survey: 200,
    componentGroup: 1,
    textarea: 150,
    datagrid: 0,
    editgrid: 0
  });

  const datagridIndex = orderedTypes.indexOf('datagrid');
  const editgridIndex = orderedTypes.indexOf('editgrid');
  const componentGroupIndex = orderedTypes.indexOf('componentGroup');
  const quizIndex = orderedTypes.indexOf('quiz');

  assert.notEqual(datagridIndex, -1);
  assert.notEqual(editgridIndex, -1);
  assert.notEqual(componentGroupIndex, -1);
  assert.notEqual(quizIndex, -1);
  assert.equal(datagridIndex + 1, editgridIndex);
  assert.equal(editgridIndex + 1, componentGroupIndex);
  assert.equal(componentGroupIndex + 1, quizIndex);
});
