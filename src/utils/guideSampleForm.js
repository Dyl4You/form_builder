const parser = require('../parser/unifiedParser');

const CREATE_COMPONENT_PATH = require.resolve('../../public/js/createComponent.js');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createRootForm() {
  return {
    label: 'Grouping',
    key: 'grouping',
    type: 'fieldset',
    input: false,
    tableView: false,
    components: []
  };
}

function buildGuideSampleForm() {
  const previousWindow = global.window;

  parser.usedKeys.clear();
  delete require.cache[CREATE_COMPONENT_PATH];

  try {
    global.window = { _actionsCounter: 0 };

    const {
      createComponent,
      applyEditGridTemplateConfig
    } = require(CREATE_COMPONENT_PATH);

    const root = createRootForm();

    const siteDetails = createComponent('fieldset', 'Site Details');
    const crewNotice = createComponent('disclaimer', 'Crew Notice');
    crewNotice.html = [
      '<p>Use fall protection before roof access.</p>',
      '<ul>',
      '<li>Confirm permit status before entry.</li>',
      '<li>Document weather conditions before starting work.</li>',
      '</ul>'
    ].join('');

    const inspectionSummary = createComponent('textarea', 'Inspection Summary');
    inspectionSummary.rows = 3;

    const roofCondition = createComponent('select', 'Roof Condition', [
      { label: 'Good', value: 'good' },
      { label: 'Monitor', value: 'monitor' },
      { label: 'Repair', value: 'repair' }
    ]);
    roofCondition.key = 'roofCondition';

    const repairFollowUp = createComponent('textarea', 'Repair Follow-Up');
    repairFollowUp.conditional = {
      show: true,
      when: 'roofCondition',
      eq: 'repair'
    };

    const siteVisit = createComponent('datetime', 'Site Visit');
    const reinspectionDate = createComponent('date', 'Reinspection Date');
    const crewArrivalWindow = createComponent('time', 'Crew Arrival Window');
    const callbackNumber = createComponent('phoneNumber', 'Callback Number');
    const siteAddress = createComponent('address', 'Site Address');

    const assignedWorker = createComponent('account', 'Assigned Worker');
    assignedWorker.data.values = [
      { label: 'North Crew', value: 'northCrew' },
      { label: 'South Crew', value: 'southCrew' }
    ];

    const unitAsset = createComponent('asset', 'Unit');
    unitAsset.data.values = [
      { label: 'Unit 101', value: 'unit101' },
      { label: 'Unit 204', value: 'unit204' }
    ];

    siteDetails.components.push(
      crewNotice,
      inspectionSummary,
      roofCondition,
      repairFollowUp,
      siteVisit,
      reinspectionDate,
      crewArrivalWindow,
      callbackNumber,
      siteAddress,
      assignedWorker,
      unitAsset
    );

    const findings = createComponent('fieldset', 'Findings');
    const accessCondition = createComponent('radio', 'Access Condition', [
      { label: 'Safe', value: 'safe', flag: 'success' },
      { label: 'At Risk', value: 'atRisk', flag: 'danger' },
      { label: 'N/A', value: 'na' }
    ]);

    const observedHazards = createComponent('selectboxes', 'Observed Hazards', [
      { label: 'Wind Damage', value: 'windDamage' },
      { label: 'Debris', value: 'debris' },
      { label: 'Moisture', value: 'moisture' }
    ]);

    const photoCapture = createComponent('file', 'Site Photos');
    const supportingDocuments = createComponent('documents', 'Supporting Documents');

    const inspectionChecklist = createComponent('survey', 'Inspection Checklist', [], true);
    inspectionChecklist.questions = [
      { label: 'Flashing secure', value: 'flashingSecure' },
      { label: 'Drainage clear', value: 'drainageClear' },
      { label: 'Sealant intact', value: 'sealantIntact' }
    ];
    inspectionChecklist.values = [
      { label: 'Safe', value: 'safe', flag: 'success' },
      { label: 'At Risk', value: 'atRisk', flag: 'danger' },
      { label: 'N/A', value: 'na' }
    ];

    const crewTasks = createComponent('fieldset', 'Crew Tasks');
    crewTasks.customType = 'componentGroup';
    crewTasks.legend = 'Crew Tasks';
    const ladderSecured = createComponent('radio', 'Ladder Secured', [
      { label: 'Yes', value: 'yes', flag: 'success' },
      { label: 'No', value: 'no', flag: 'danger' },
      { label: 'N/A', value: 'na' }
    ]);
    ladderSecured.builderComponentGroupManaged = true;
    const anchorPointVerified = createComponent('radio', 'Anchor Point Verified', [
      { label: 'Yes', value: 'yes', flag: 'success' },
      { label: 'No', value: 'no', flag: 'danger' },
      { label: 'N/A', value: 'na' }
    ]);
    anchorPointVerified.builderComponentGroupManaged = true;
    crewTasks.components = [ladderSecured, anchorPointVerified];

    const inspectionScore = createComponent('number', 'Inspection Score', [], false, 87);
    const estimatedRepairCost = createComponent('currency', 'Estimated Repair Cost', [], false, 1250);
    estimatedRepairCost.currency = 'USD';

    const findingsTotal = createComponent('currency', 'Total With Tax');
    findingsTotal.calculateValue = 'value = (data.estimatedRepairCost || 0) * 1.13;';

    findings.components.push(
      accessCondition,
      observedHazards,
      inspectionChecklist,
      crewTasks,
      photoCapture,
      supportingDocuments,
      inspectionScore,
      estimatedRepairCost,
      findingsTotal
    );

    const knowledgeCheckSection = createComponent('fieldset', 'Knowledge Check');
    const safetyQuiz = createComponent('quiz', 'Safety Quiz', [], true, 2);
    const quizQuestions = safetyQuiz.components.find((component) => /^quizQuestions/i.test(component.key || ''));
    const quizSetup = safetyQuiz.components.find((component) => /^quizSetup/i.test(component.key || ''));
    const quizAnswerKey = quizSetup?.components.find((component) => /^answerKey/i.test(component.key || ''));

    const harnessRequired = createComponent('radio', 'Harness required?', [
      { label: 'Yes', value: 'yes' },
      { label: 'No', value: 'no' }
    ]);
    const mandatoryPpe = createComponent('selectboxes', 'Select mandatory PPE', [
      { label: 'Helmet', value: 'helmet' },
      { label: 'Harness', value: 'harness' },
      { label: 'Gloves', value: 'gloves' }
    ]);

    quizQuestions.components.push(harnessRequired, mandatoryPpe);
    if (quizAnswerKey) {
      quizAnswerKey.defaultValue = [
        {
          questionLabel: 'Harness required?',
          questionComponentKey: harnessRequired.key,
          correctValueS: 'yes'
        },
        {
          questionLabel: 'Select mandatory PPE',
          questionComponentKey: mandatoryPpe.key,
          correctValueS: 'helmet,harness'
        }
      ];
    }
    knowledgeCheckSection.components.push(safetyQuiz);

    const tables = createComponent('fieldset', 'Tables');
    const materialList = createComponent('datagrid', 'Material List');
    if (Array.isArray(materialList.components) && materialList.components[0]) {
      materialList.components[0].components.push(
        createComponent('textarea', 'Material'),
        createComponent('number', 'Quantity', [], false, 1)
      );
    }

    const repairLineItems = createComponent('editgrid', 'Repair Line Items');
    repairLineItems.components = [
      createComponent('textarea', 'Work Item'),
      createComponent('currency', 'Amount')
    ];
    applyEditGridTemplateConfig(repairLineItems, {
      addAnother: 'Add repair item',
      rowLayout: {
        1: [8, 4]
      }
    });

    tables.components.push(materialList, repairLineItems);

    root.components.push(siteDetails, findings, knowledgeCheckSection, tables);
    return root;
  } finally {
    parser.usedKeys.clear();
    delete require.cache[CREATE_COMPONENT_PATH];

    if (previousWindow === undefined) {
      delete global.window;
    } else {
      global.window = previousWindow;
    }
  }
}

const GUIDE_SAMPLE_FORM = clone(buildGuideSampleForm());

module.exports = {
  GUIDE_SAMPLE_FORM,
  buildGuideSampleForm
};
