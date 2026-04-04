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

function buildHsTrainingSampleForm() {
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

    const equipmentInspection = createComponent('fieldset', 'Equipment Inspection');
    const operatorNotice = createComponent('disclaimer', 'Operator Notice');
    operatorNotice.html = [
      '<p>Complete this inspection before equipment start-up.</p>',
      '<ul>',
      '<li>Tag unsafe equipment out of service immediately.</li>',
      '<li>Attach photos for any defect that needs follow-up.</li>',
      '<li>Escalate critical issues to the supervisor before the shift starts.</li>',
      '</ul>'
    ].join('');

    const inspectionPurpose = createComponent('textarea', 'Inspection Purpose');
    inspectionPurpose.rows = 3;

    const inspector = createComponent('account', 'Inspector');
    inspector.data.values = [
      { label: 'Alex Rivera', value: 'alexRivera' },
      { label: 'Jordan Lee', value: 'jordanLee' },
      { label: 'Morgan Patel', value: 'morganPatel' }
    ];

    const equipment = createComponent('asset', 'Equipment');
    equipment.data.values = [
      { label: 'Excavator EX-204', value: 'excavatorEx204' },
      { label: 'Forklift FL-118', value: 'forkliftFl118' },
      { label: 'Scissor Lift SL-77', value: 'scissorLiftSl77' }
    ];

    const equipmentStatus = createComponent('select', 'Equipment Status', [
      { label: 'Ready For Use', value: 'readyForUse' },
      { label: 'Monitor During Shift', value: 'monitorDuringShift' },
      { label: 'Unsafe / Lock Out', value: 'unsafeLockOut' }
    ]);
    equipmentStatus.key = 'equipmentStatus';

    const unsafeConditionNotes = createComponent('textarea', 'Unsafe Condition Notes');
    unsafeConditionNotes.conditional = {
      show: true,
      when: 'equipmentStatus',
      eq: 'unsafeLockOut'
    };

    const inspectionStart = createComponent('datetime', 'Inspection Start');
    const nextServiceDate = createComponent('date', 'Next Service Date');
    const shiftStartWindow = createComponent('time', 'Shift Start Window');
    const supervisorCallback = createComponent('phoneNumber', 'Supervisor Callback');
    const inspectionLocation = createComponent('address', 'Inspection Location');

    const inspectionChecklist = createComponent('survey', 'Inspection Checklist', [], true);
    inspectionChecklist.questions = [
      { label: 'Brakes responsive', value: 'brakesResponsive' },
      { label: 'Lights and alarms working', value: 'lightsAlarmsWorking' },
      { label: 'Guarding secure', value: 'guardingSecure' },
      { label: 'Fluid levels acceptable', value: 'fluidLevelsAcceptable' }
    ];
    inspectionChecklist.values = [
      { label: 'Safe', value: 'safe', flag: 'success' },
      { label: 'At Risk', value: 'atRisk', flag: 'danger' },
      { label: 'N/A', value: 'na' }
    ];

    const criticalStopWorkChecks = createComponent('fieldset', 'Critical Stop Work Checks');
    criticalStopWorkChecks.customType = 'componentGroup';
    criticalStopWorkChecks.legend = 'Critical Stop Work Checks';

    const seatbeltVerified = createComponent('radio', 'Seatbelt Verified', [
      { label: 'Yes', value: 'yes', flag: 'success' },
      { label: 'No', value: 'no', flag: 'danger' },
      { label: 'N/A', value: 'na' }
    ]);
    seatbeltVerified.builderComponentGroupManaged = true;

    const emergencyStopVerified = createComponent('radio', 'Emergency Stop Verified', [
      { label: 'Yes', value: 'yes', flag: 'success' },
      { label: 'No', value: 'no', flag: 'danger' },
      { label: 'N/A', value: 'na' }
    ]);
    emergencyStopVerified.builderComponentGroupManaged = true;

    criticalStopWorkChecks.components = [
      seatbeltVerified,
      emergencyStopVerified
    ];

    const equipmentPhotos = createComponent('file', 'Equipment Photos');
    const certificatesPermits = createComponent('documents', 'Certificates And Permits');
    const operatingHours = createComponent('number', 'Operating Hours', [], false, 1284);
    const estimatedRepairCost = createComponent('currency', 'Estimated Repair Cost', [], false, 320);
    estimatedRepairCost.currency = 'USD';

    const repairTotalInclTax = createComponent('currency', 'Repair Total Incl. Tax');
    repairTotalInclTax.calculateValue = 'value = (data.estimatedRepairCost || 0) * 1.13;';
    repairTotalInclTax.currency = 'USD';

    const partsRequired = createComponent('datagrid', 'Parts Required');
    if (Array.isArray(partsRequired.components) && partsRequired.components[0]) {
      partsRequired.components[0].components.push(
        createComponent('textarea', 'Part Description'),
        createComponent('number', 'Qty', [], false, 1)
      );
    }

    const repairActions = createComponent('editgrid', 'Repair Actions');
    repairActions.components = [
      createComponent('textarea', 'Action Item'),
      createComponent('textarea', 'Owner'),
      createComponent('date', 'Due Date'),
      createComponent('currency', 'Action Cost')
    ];
    applyEditGridTemplateConfig(repairActions, {
      addAnother: 'Add repair action',
      rowLayout: {
        1: [4, 3, 2, 3]
      }
    });

    equipmentInspection.components.push(
      operatorNotice,
      inspectionPurpose,
      inspector,
      equipment,
      equipmentStatus,
      unsafeConditionNotes,
      inspectionStart,
      nextServiceDate,
      shiftStartWindow,
      supervisorCallback,
      inspectionLocation,
      inspectionChecklist,
      criticalStopWorkChecks,
      equipmentPhotos,
      certificatesPermits,
      operatingHours,
      estimatedRepairCost,
      repairTotalInclTax,
      partsRequired,
      repairActions
    );

    const jobHazardAnalysis = createComponent('fieldset', 'Job Hazard Analysis');
    const jhaBriefing = createComponent('disclaimer', 'Pre-Task Briefing');
    jhaBriefing.html = [
      '<p>Review this JHA with the crew before work starts.</p>',
      '<ul>',
      '<li>Identify the highest-risk steps first.</li>',
      '<li>Confirm permits, PPE, and rescue planning.</li>',
      '<li>Use the knowledge check at the end to confirm crew understanding.</li>',
      '</ul>'
    ].join('');

    const taskDescription = createComponent('textarea', 'Task Description');
    taskDescription.rows = 3;

    const crewLead = createComponent('account', 'Crew Lead');
    crewLead.data.values = [
      { label: 'Taylor Nguyen', value: 'taylorNguyen' },
      { label: 'Sam Brooks', value: 'samBrooks' }
    ];

    const workArea = createComponent('address', 'Work Area');
    const permitContact = createComponent('phoneNumber', 'Permit Contact');

    const mandatoryPpe = createComponent('selectboxes', 'Mandatory PPE', [
      { label: 'Hard Hat', value: 'hardHat' },
      { label: 'Gloves', value: 'gloves' },
      { label: 'Harness', value: 'harness' },
      { label: 'Face Shield', value: 'faceShield' }
    ]);

    const hotWorkPermitRequired = createComponent('radio', 'Hot Work Permit Required?', [
      { label: 'Yes', value: 'yes' },
      { label: 'No', value: 'no' }
    ]);
    hotWorkPermitRequired.key = 'hotWorkPermitRequired';

    const hotWorkPermitNumber = createComponent('textarea', 'Hot Work Permit Number');
    hotWorkPermitNumber.conditional = {
      show: true,
      when: 'hotWorkPermitRequired',
      eq: 'yes'
    };

    const criticalControls = createComponent('fieldset', 'Critical Controls');
    criticalControls.customType = 'componentGroup';
    criticalControls.legend = 'Critical Controls';

    const lotoConfirmed = createComponent('radio', 'Lockout / Tagout Confirmed', [
      { label: 'Yes', value: 'yes', flag: 'success' },
      { label: 'No', value: 'no', flag: 'danger' },
      { label: 'N/A', value: 'na' }
    ]);
    lotoConfirmed.builderComponentGroupManaged = true;

    const rescuePlanConfirmed = createComponent('radio', 'Rescue Plan Confirmed', [
      { label: 'Yes', value: 'yes', flag: 'success' },
      { label: 'No', value: 'no', flag: 'danger' },
      { label: 'N/A', value: 'na' }
    ]);
    rescuePlanConfirmed.builderComponentGroupManaged = true;

    criticalControls.components = [
      lotoConfirmed,
      rescuePlanConfirmed
    ];

    const jobStepsHazards = createComponent('editgrid', 'Job Steps And Hazards');
    jobStepsHazards.components = [
      createComponent('textarea', 'Job Step'),
      createComponent('textarea', 'Hazard'),
      createComponent('select', 'Risk Level', [
        { label: 'Low', value: 'low' },
        { label: 'Medium', value: 'medium' },
        { label: 'High', value: 'high' }
      ]),
      createComponent('textarea', 'Control Measure')
    ];
    applyEditGridTemplateConfig(jobStepsHazards, {
      addAnother: 'Add job step',
      rowLayout: {
        1: [3, 3, 2, 4]
      }
    });

    const permitChecks = createComponent('editgrid', 'Permit Checks');
    permitChecks.components = [
      createComponent('textarea', 'Permit / Review Item'),
      createComponent('textarea', 'Responsible Person'),
      createComponent('radio', 'Verified', [
        { label: 'Yes', value: 'yes', flag: 'success' },
        { label: 'No', value: 'no', flag: 'danger' }
      ])
    ];
    applyEditGridTemplateConfig(permitChecks, {
      addAnother: 'Add permit check',
      rowLayout: {
        1: [5, 4, 3]
      }
    });

    const crewKnowledgeCheck = createComponent('quiz', 'Crew Knowledge Check', [], true, 2);
    const quizQuestions = crewKnowledgeCheck.components.find((component) => /^quizQuestions/i.test(component.key || ''));
    const quizSetup = crewKnowledgeCheck.components.find((component) => /^quizSetup/i.test(component.key || ''));
    const quizAnswerKey = quizSetup?.components.find((component) => /^answerKey/i.test(component.key || ''));

    const fireWatchRequired = createComponent('radio', 'When is a fire watch required?', [
      { label: 'Only after the shift', value: 'afterShiftOnly' },
      { label: 'When hot work can create ignition sources', value: 'ignitionSources' },
      { label: 'Only outdoors', value: 'outdoorsOnly' }
    ]);

    const fallProtectionTriggers = createComponent('selectboxes', 'Select fall-protection triggers', [
      { label: 'Open edge exposure', value: 'openEdgeExposure' },
      { label: 'Unprotected ladder opening', value: 'ladderOpening' },
      { label: 'Working from ground level only', value: 'groundLevelOnly' }
    ]);

    quizQuestions.components.push(
      fireWatchRequired,
      fallProtectionTriggers
    );

    if (quizAnswerKey) {
      quizAnswerKey.defaultValue = [
        {
          questionLabel: 'When is a fire watch required?',
          questionComponentKey: fireWatchRequired.key,
          correctValueS: 'ignitionSources'
        },
        {
          questionLabel: 'Select fall-protection triggers',
          questionComponentKey: fallProtectionTriggers.key,
          correctValueS: 'openEdgeExposure,ladderOpening'
        }
      ];
    }

    jobHazardAnalysis.components.push(
      jhaBriefing,
      taskDescription,
      crewLead,
      workArea,
      permitContact,
      mandatoryPpe,
      hotWorkPermitRequired,
      hotWorkPermitNumber,
      criticalControls,
      jobStepsHazards,
      permitChecks,
      crewKnowledgeCheck
    );

    const nearMissReport = createComponent('fieldset', 'Near Miss Report');
    const nearMissNotice = createComponent('disclaimer', 'Reporting Note');
    nearMissNotice.html = [
      '<p>Report near misses before the end of the shift.</p>',
      '<ul>',
      '<li>Capture what happened, what could have happened, and who needs to act.</li>',
      '<li>Attach evidence and assign follow-up actions.</li>',
      '</ul>'
    ].join('');

    const eventSummary = createComponent('textarea', 'Event Summary');
    eventSummary.rows = 3;

    const reportedBy = createComponent('account', 'Reported By');
    reportedBy.data.values = [
      { label: 'Casey Morgan', value: 'caseyMorgan' },
      { label: 'Jamie Turner', value: 'jamieTurner' }
    ];

    const reporterContact = createComponent('phoneNumber', 'Reporter Contact');
    const eventDateTime = createComponent('datetime', 'Event Date And Time');
    const exactLocation = createComponent('address', 'Exact Location');

    const medicalTreatmentRequired = createComponent('radio', 'Was Medical Treatment Required?', [
      { label: 'Yes', value: 'yes' },
      { label: 'No', value: 'no' }
    ]);
    medicalTreatmentRequired.key = 'medicalTreatmentRequired';

    const treatmentDetails = createComponent('textarea', 'Treatment Details');
    treatmentDetails.conditional = {
      show: true,
      when: 'medicalTreatmentRequired',
      eq: 'yes'
    };

    const potentialConsequences = createComponent('selectboxes', 'Potential Consequences', [
      { label: 'Dropped object', value: 'droppedObject' },
      { label: 'Line of fire', value: 'lineOfFire' },
      { label: 'Property damage', value: 'propertyDamage' },
      { label: 'Environmental release', value: 'environmentalRelease' }
    ]);

    const evidenceUploads = createComponent('file', 'Evidence Uploads');

    const witnesses = createComponent('datagrid', 'Witnesses');
    if (Array.isArray(witnesses.components) && witnesses.components[0]) {
      witnesses.components[0].components.push(
        createComponent('textarea', 'Witness Name'),
        createComponent('phoneNumber', 'Witness Phone')
      );
    }

    const correctiveActionRegister = createComponent('editgrid', 'Corrective Action Register');
    correctiveActionRegister.components = [
      createComponent('textarea', 'Corrective Action'),
      createComponent('textarea', 'Owner'),
      createComponent('date', 'Due Date'),
      createComponent('select', 'Status', [
        { label: 'Open', value: 'open' },
        { label: 'In Progress', value: 'inProgress' },
        { label: 'Closed', value: 'closed' }
      ])
    ];
    applyEditGridTemplateConfig(correctiveActionRegister, {
      addAnother: 'Add corrective action',
      rowLayout: {
        1: [5, 3, 2, 2]
      }
    });

    const potentialLossEstimate = createComponent('currency', 'Potential Loss Estimate', [], false, 2500);
    potentialLossEstimate.currency = 'USD';

    const contractorCalloutCost = createComponent('currency', 'Contractor Callout Cost', [], false, 450);
    contractorCalloutCost.currency = 'USD';

    const totalEstimatedExposure = createComponent('currency', 'Total Estimated Exposure');
    totalEstimatedExposure.calculateValue = 'value = (data.potentialLossEstimate || 0) + (data.contractorCalloutCost || 0);';
    totalEstimatedExposure.currency = 'USD';

    nearMissReport.components.push(
      nearMissNotice,
      eventSummary,
      reportedBy,
      reporterContact,
      eventDateTime,
      exactLocation,
      medicalTreatmentRequired,
      treatmentDetails,
      potentialConsequences,
      evidenceUploads,
      witnesses,
      correctiveActionRegister,
      potentialLossEstimate,
      contractorCalloutCost,
      totalEstimatedExposure
    );

    root.components.push(
      equipmentInspection,
      jobHazardAnalysis,
      nearMissReport
    );

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

const HS_TRAINING_SAMPLE_FORM = clone(buildHsTrainingSampleForm());

module.exports = {
  HS_TRAINING_SAMPLE_FORM,
  buildHsTrainingSampleForm
};
