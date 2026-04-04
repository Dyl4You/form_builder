const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('createComponent builds the quiz scaffold with hidden setup and graded results', () => {
  const parser = require('../src/parser/unifiedParser');
  const createComponentPath = require.resolve('../public/js/createComponent.js');
  const previousWindow = global.window;

  parser.usedKeys.clear();
  delete require.cache[createComponentPath];

  try {
    global.window = { _actionsCounter: 0 };
    const { createComponent } = require(createComponentPath);
    const quiz = createComponent('quiz', 'Safety Quiz', [], true, 3);

    assert.equal(quiz.type, 'fieldset');
    assert.equal(quiz.customType, 'quiz');
    assert.equal(quiz.label, 'Safety Quiz');
    assert.equal(quiz.legend, '');

    const questionSection = quiz.components.find(component => /^quizQuestions/i.test(component.key || ''));
    const setupSection = quiz.components.find(component => /^quizSetup/i.test(component.key || ''));
    const resultsSection = quiz.components.find(component => /^quizResults/i.test(component.key || ''));

    assert.ok(questionSection, 'expected a quiz question section');
    assert.ok(setupSection, 'expected a hidden quiz setup section');
    assert.ok(resultsSection, 'expected a visible results section');
    assert.equal(questionSection.legend, '');
    assert.equal(setupSection.legend, '');
    assert.equal(resultsSection.legend, '');
    assert.equal(setupSection.builderHidden, true);
    assert.equal(setupSection.hidden, true);

    const passMarkField = setupSection.components.find(component => /^passMark/i.test(component.key || ''));
    const answerKeyGrid = setupSection.components.find(component => /^answerKey/i.test(component.key || ''));
    const summaryField = setupSection.components.find(component => /^quizSummary/i.test(component.key || ''));

    assert.ok(passMarkField, 'expected a pass mark field');
    assert.ok(answerKeyGrid, 'expected an answer key grid');
    assert.ok(summaryField, 'expected a quiz summary field');
    assert.equal(passMarkField.defaultValue, 3);
    assert.equal(answerKeyGrid.initEmpty, false);
    assert.equal(summaryField.redrawOn, 'data');
    assert.equal(summaryField.refreshOn, 'data');
    assert.match(summaryField.calculateValue, /quizState\.score/);
    assert.match(summaryField.calculateValue, new RegExp(answerKeyGrid.key));

    const questionColumn = answerKeyGrid.components.find(component => /question/i.test(component.key || ''));
    const questionComponentKeyColumn = answerKeyGrid.components.find(component => /questioncomponentkey|componentkey/i.test(component.key || ''));
    const answerColumn = answerKeyGrid.components.find(component => /correctvalue|answer/i.test(component.key || ''));

    assert.ok(questionColumn, 'expected a question label column');
    assert.ok(questionComponentKeyColumn, 'expected a hidden question component key column');
    assert.ok(answerColumn, 'expected a correct answer column');
    assert.equal(questionColumn.key, 'questionLabel');
    assert.equal(questionComponentKeyColumn.key, 'questionComponentKey');
    assert.equal(answerColumn.key, 'correctValueS');
    assert.match(summaryField.calculateValue, /questionComponentKeyField/);
    assert.match(summaryField.calculateValue, /answerGrid/);
    assert.doesNotMatch(summaryField.calculateValue, /data\["answerkey"\]/i);

    const resultField = resultsSection.components.find(component => /^quizResult/i.test(component.key || ''));
    const incorrectField = resultsSection.components.find(component => /^incorrectAnswers/i.test(component.key || ''));

    assert.ok(resultField, 'expected a result field');
    assert.ok(incorrectField, 'expected an incorrect answers field');
    assert.equal(resultField.redrawOn, 'data');
    assert.equal(resultField.refreshOn, 'data');
    assert.equal(incorrectField.redrawOn, 'data');
    assert.equal(incorrectField.refreshOn, 'data');
    assert.match(resultField.calculateValue, /quizState\.resultText/);
    assert.match(incorrectField.calculateValue, /quizState\.bad/);
    assert.doesNotMatch(resultField.calculateValue, /\butil\./);
    assert.doesNotMatch(incorrectField.calculateValue, /\butil\./);
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

test('quiz calculations grade legacy imported quiz schemas without shared util state', () => {
  const createComponentPath = require.resolve('../public/js/createComponent.js');
  const previousWindow = global.window;

  delete require.cache[createComponentPath];

  try {
    global.window = { _actionsCounter: 0 };
    const {
      buildQuizSummaryCalculation,
      buildQuizResultCalculation,
      buildQuizIncorrectAnswersCalculation
    } = require(createComponentPath);

    const quiz = {
      label: 'Quiz',
      key: 'quiz',
      type: 'fieldset',
      input: false,
      tableView: false,
      components: [
        {
          label: 'Grouping',
          legend: 'Questions',
          key: 'fieldSet1',
          type: 'fieldset',
          input: false,
          tableView: false,
          components: [
            {
              label: 'Question',
              key: 'question',
              type: 'selectboxes',
              input: true,
              tableView: false,
              values: [
                { label: 'True', value: 'true' },
                { label: 'False', value: 'false' }
              ]
            },
            {
              label: 'Question 2',
              key: 'question2',
              type: 'selectboxes',
              input: true,
              tableView: false,
              values: [
                { label: 'True', value: 'true' },
                { label: 'False', value: 'false' }
              ]
            }
          ]
        },
        {
          label: 'Quiz Setup',
          key: 'setup',
          type: 'fieldset',
          input: false,
          tableView: false,
          components: [
            {
              label: '🧠',
              key: 'quizSummary',
              type: 'textfield',
              input: true,
              calculateValue: buildQuizSummaryCalculation()
            },
            {
              label: 'Pass Mark',
              key: 'passMark',
              type: 'number',
              input: true,
              defaultValue: 2
            },
            {
              label: 'Answer Key',
              key: 'answerKey',
              type: 'datagrid',
              input: true,
              defaultValue: [
                {
                  question: 'Question',
                  answer: 'false'
                },
                {
                  question: 'Question 2',
                  answer: 'true'
                }
              ],
              components: [
                { label: 'Question Label', key: 'question', type: 'textfield', input: true },
                { label: 'Correct Value(s)', key: 'answer', type: 'textfield', input: true }
              ]
            }
          ]
        },
        {
          label: 'Grouping',
          legend: 'Results',
          key: 'fieldSet',
          type: 'fieldset',
          input: false,
          tableView: false,
          components: [
            {
              label: 'Result',
              key: 'result',
              type: 'textarea',
              input: true,
              calculateValue: buildQuizResultCalculation()
            },
            {
              label: 'Incorrect Answers',
              key: 'incorrectAnswers',
              type: 'textarea',
              input: true,
              calculateValue: buildQuizIncorrectAnswersCalculation()
            }
          ]
        }
      ]
    };

    const setupFieldset = quiz.components[1];
    const resultsFieldset = quiz.components[2];
    const summaryField = setupFieldset.components[0];
    const resultField = resultsFieldset.components[0];
    const incorrectField = resultsFieldset.components[1];
    const form = { components: [quiz] };

    function evaluate(calculation, currentComponent, parentComponent, submissionData) {
      const context = {
        component: currentComponent,
        form,
        data: submissionData,
        instance: {
          parent: {
            component: parentComponent,
            parent: {
              component: quiz
            }
          },
          root: {
            component: form
          }
        },
        value: null
      };

      vm.createContext(context);
      vm.runInContext(calculation, context);
      return context.value;
    }

    const passingData = {
      answerKey: [],
      question: { true: false, false: true },
      question2: { true: true, false: false }
    };
    const failingData = {
      answerKey: [],
      question: { true: false, false: true },
      question2: { true: false, false: true }
    };

    assert.equal(
      evaluate(summaryField.calculateValue, summaryField, setupFieldset, passingData),
      '2/2'
    );
    assert.equal(
      evaluate(resultField.calculateValue, resultField, resultsFieldset, passingData),
      'Pass - 2/2'
    );
    assert.equal(
      evaluate(incorrectField.calculateValue, incorrectField, resultsFieldset, passingData),
      ''
    );

    assert.equal(
      evaluate(summaryField.calculateValue, summaryField, setupFieldset, failingData),
      '1/2'
    );
    assert.equal(
      evaluate(resultField.calculateValue, resultField, resultsFieldset, failingData),
      'Try again - 1/2'
    );
    assert.match(
      evaluate(incorrectField.calculateValue, incorrectField, resultsFieldset, failingData),
      /Question/
    );
  } finally {
    delete require.cache[createComponentPath];
    if (previousWindow === undefined) {
      delete global.window;
    } else {
      global.window = previousWindow;
    }
  }
});

test('quiz calculations stay scoped to the matching quiz section when multiple quizzes share one form', () => {
  const createComponentPath = require.resolve('../public/js/createComponent.js');
  const previousWindow = global.window;

  delete require.cache[createComponentPath];

  try {
    global.window = { _actionsCounter: 0 };
    const {
      buildQuizSummaryCalculation,
      buildQuizResultCalculation,
      buildQuizIncorrectAnswersCalculation
    } = require(createComponentPath);

    const firstQuiz = {
      label: 'Questionnaire',
      legend: 'Questionnaire',
      key: 'quizQuestions',
      type: 'fieldset',
      input: false,
      tableView: false,
      components: [
        {
          label: 'Top Quiz Question',
          key: 'topQuizQuestion',
          type: 'radio',
          input: true,
          values: [
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' }
          ]
        },
        {
          label: 'Quiz Setup',
          legend: 'Quiz Setup',
          key: 'quizSetup',
          type: 'fieldset',
          input: false,
          tableView: false,
          components: [
            {
              label: 'Quiz Summary',
              key: 'quizSummary',
              type: 'textfield',
              input: true,
              calculateValue: buildQuizSummaryCalculation()
            },
            {
              label: 'Pass Mark',
              key: 'passMark',
              type: 'number',
              input: true,
              defaultValue: 1
            },
            {
              label: 'Answer Key',
              key: 'answerKey',
              type: 'datagrid',
              input: true,
              defaultValue: [
                {
                  questionLabel: 'Top Quiz Question',
                  questionComponentKey: 'topQuizQuestion',
                  correctValueS: 'yes'
                }
              ],
              components: [
                { label: 'Question Label', key: 'questionLabel', type: 'textfield', input: true },
                { label: 'Question Component Key', key: 'questionComponentKey', type: 'textfield', input: true },
                { label: 'Correct Value(s)', key: 'correctValueS', type: 'textfield', input: true }
              ]
            }
          ]
        },
        {
          label: 'Results',
          legend: 'Results',
          key: 'results',
          type: 'fieldset',
          input: false,
          tableView: false,
          components: [
            {
              label: 'Result',
              key: 'result',
              type: 'textarea',
              input: true,
              calculateValue: buildQuizResultCalculation()
            },
            {
              label: 'Incorrect Answers',
              key: 'incorrectAnswers',
              type: 'textarea',
              input: true,
              calculateValue: buildQuizIncorrectAnswersCalculation()
            }
          ]
        }
      ]
    };

    const secondQuiz = {
      label: 'Questionnaire',
      legend: 'Questionnaire',
      key: 'quizQuestions1',
      type: 'fieldset',
      input: false,
      tableView: false,
      components: [
        {
          label: 'When is respiratory protection required?',
          key: 'whenIsRespiratoryProtectionRequired',
          type: 'radio',
          input: true,
          values: [
            { label: 'Always', value: 'always' },
            { label: 'When hazards are present', value: 'hazardsPresent' }
          ]
        },
        {
          label: 'What can break the respirator seal?',
          key: 'whatCanBreakTheRespiratorSeal',
          type: 'radio',
          input: true,
          values: [
            { label: 'Facial hair', value: 'facialHair' },
            { label: 'Clean filters', value: 'cleanFilters' }
          ]
        },
        {
          label: 'Quiz Setup',
          legend: 'Quiz Setup',
          key: 'quizSetup1',
          type: 'fieldset',
          input: false,
          tableView: false,
          components: [
            {
              label: 'Quiz Summary',
              key: 'quizSummary1',
              type: 'textfield',
              input: true,
              calculateValue: buildQuizSummaryCalculation()
            },
            {
              label: 'Pass Mark',
              key: 'passMark1',
              type: 'number',
              input: true,
              defaultValue: 2
            },
            {
              label: 'Answer Key',
              key: 'answerKey1',
              type: 'datagrid',
              input: true,
              defaultValue: [
                {
                  questionLabel1: 'When is respiratory protection required?',
                  questionComponentKey1: 'whenIsRespiratoryProtectionRequired',
                  correctValueS1: 'hazardsPresent'
                },
                {
                  questionLabel1: 'What can break the respirator seal?',
                  questionComponentKey1: 'whatCanBreakTheRespiratorSeal',
                  correctValueS1: 'facialHair'
                }
              ],
              components: [
                { label: 'Question Label', key: 'questionLabel1', type: 'textfield', input: true },
                { label: 'Question Component Key', key: 'questionComponentKey1', type: 'textfield', input: true },
                { label: 'Correct Value(s)', key: 'correctValueS1', type: 'textfield', input: true }
              ]
            }
          ]
        },
        {
          label: 'Results',
          legend: 'Results',
          key: 'results1',
          type: 'fieldset',
          input: false,
          tableView: false,
          components: [
            {
              label: 'Result',
              key: 'result1',
              type: 'textarea',
              input: true,
              calculateValue: buildQuizResultCalculation()
            },
            {
              label: 'Incorrect Answers',
              key: 'incorrectAnswers1',
              type: 'textarea',
              input: true,
              calculateValue: buildQuizIncorrectAnswersCalculation()
            }
          ]
        }
      ]
    };

    const secondSetupFieldset = secondQuiz.components[2];
    const secondResultsFieldset = secondQuiz.components[3];
    const summaryField = secondSetupFieldset.components[0];
    const resultField = secondResultsFieldset.components[0];
    const incorrectField = secondResultsFieldset.components[1];
    const form = { components: [firstQuiz, secondQuiz] };

    function evaluate(calculation, currentComponent, parentComponent, grandparentComponent, submissionData) {
      const context = {
        component: currentComponent,
        form,
        data: submissionData,
        instance: {
          parent: {
            component: parentComponent,
            parent: {
              component: grandparentComponent
            }
          },
          root: {
            component: form
          }
        },
        value: null
      };

      vm.createContext(context);
      vm.runInContext(calculation, context);
      return context.value;
    }

    const passingData = {
      topQuizQuestion: 'no',
      whenIsRespiratoryProtectionRequired: 'hazardsPresent',
      whatCanBreakTheRespiratorSeal: 'facialHair'
    };
    const failingData = {
      topQuizQuestion: 'yes',
      whenIsRespiratoryProtectionRequired: 'always',
      whatCanBreakTheRespiratorSeal: 'cleanFilters'
    };

    assert.equal(
      evaluate(summaryField.calculateValue, summaryField, secondSetupFieldset, secondQuiz, passingData),
      '2/2'
    );
    assert.equal(
      evaluate(resultField.calculateValue, resultField, secondResultsFieldset, secondQuiz, passingData),
      'Pass - 2/2'
    );
    assert.equal(
      evaluate(incorrectField.calculateValue, incorrectField, secondResultsFieldset, secondQuiz, passingData),
      ''
    );

    assert.equal(
      evaluate(summaryField.calculateValue, summaryField, secondSetupFieldset, secondQuiz, failingData),
      '0/2'
    );
    assert.equal(
      evaluate(resultField.calculateValue, resultField, secondResultsFieldset, secondQuiz, failingData),
      'Try again - 0/2'
    );
    assert.match(
      evaluate(incorrectField.calculateValue, incorrectField, secondResultsFieldset, secondQuiz, failingData),
      /respiratory protection required/i
    );
    assert.match(
      evaluate(incorrectField.calculateValue, incorrectField, secondResultsFieldset, secondQuiz, failingData),
      /respirator seal/i
    );
  } finally {
    delete require.cache[createComponentPath];
    if (previousWindow === undefined) {
      delete global.window;
    } else {
      global.window = previousWindow;
    }
  }
});

test('legacy quiz import normalization populates answer key default rows', () => {
  const script = fs.readFileSync(require.resolve('../public/js/dataHelpers.js'), 'utf8');
  const context = {
    console: { warn() {} },
    localStorage: {
      getItem() { return null; },
      setItem() {},
      removeItem() {}
    },
    window: {
      location: { hash: '' }
    }
  };

  context.window.window = context.window;
  context.window.localStorage = context.localStorage;
  vm.createContext(context);
  vm.runInContext(script, context);

  const legacyQuiz = {
    label: 'Quiz',
    key: 'quiz1',
    type: 'fieldset',
    input: false,
    tableView: false,
    components: [
      {
        label: 'Grouping',
        legend: 'Questions',
        key: 'fieldSet1',
        type: 'fieldset',
        input: false,
        tableView: false,
        components: [
          {
            label: 'Question',
            key: 'question',
            type: 'selectboxes',
            input: true,
            values: [
              { label: 'True', value: 'true' },
              { label: 'False', value: 'false' }
            ]
          },
          {
            label: 'Question 2',
            key: 'question2',
            type: 'selectboxes',
            input: true,
            values: [
              { label: 'True', value: 'true' },
              { label: 'False', value: 'false' }
            ]
          }
        ]
      },
      {
        label: 'Quiz Setup',
        key: 'setup',
        type: 'fieldset',
        input: false,
        tableView: false,
        components: [
          {
            label: '🧠',
            key: 'quizSummary',
            type: 'textfield',
            input: true
          },
          {
            label: 'Pass Mark',
            key: 'passMark',
            type: 'number',
            input: true,
            defaultValue: 2
          },
          {
            label: 'Answer Key',
            key: 'answerKey',
            type: 'datagrid',
            input: true,
            initEmpty: true,
            defaultValue: [
              { question: 'Question', answer: 'false' },
              { question: 'Question 2', answer: 'true' }
            ],
            components: [
              { label: 'Question Label', key: 'question', type: 'textfield', input: true },
              { label: 'Correct Value(s)', key: 'answer', type: 'textfield', input: true }
            ]
          }
        ]
      },
      {
        label: 'Grouping',
        legend: 'Results',
        key: 'fieldSet',
        type: 'fieldset',
        input: false,
        tableView: false,
        components: [
          { label: 'Result', key: 'quizResult', type: 'textarea', input: true },
          { label: 'Incorrect Answers', key: 'incorrectAnswers', type: 'textarea', input: true }
        ]
      }
    ]
  };

  const normalized = context.window.normalizeBuilderFormJSON(legacyQuiz);
  const quiz = normalized.components[0];
  const setup = quiz.components.find(component => component.key === 'setup');
  const answerKey = setup.components.find(component => component.key === 'answerKey');

  assert.equal(quiz.customType, 'quiz');
  assert.equal(quiz.legend, '');
  assert.equal(quiz.components[0].legend, '');
  assert.equal(quiz.components[1].legend, '');
  assert.equal(quiz.components[2].legend, '');
  assert.equal(answerKey.initEmpty, false);
  assert.deepEqual(
    JSON.parse(JSON.stringify(answerKey.components.map(component => component.key))),
    ['questionLabel', 'questionComponentKey', 'correctValueS']
  );
  assert.deepEqual(JSON.parse(JSON.stringify(answerKey.defaultValue)), [
    {
      questionLabel: 'Question',
      correctValueS: 'false',
      questionComponentKey: 'question'
    },
    {
      questionLabel: 'Question 2',
      correctValueS: 'true',
      questionComponentKey: 'question2'
    }
  ]);
});
