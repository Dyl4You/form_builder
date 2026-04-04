/****************************************************
 * public/js/dataHelpers.js
 ****************************************************/

function isRootGroupingPayload(payload) {
  return Boolean(
    payload
    && typeof payload === "object"
    && payload.type === "fieldset"
    && String(payload.label || "").trim().toLowerCase() === "grouping"
    && payload.hideLabel !== true
    && Array.isArray(payload.components)
  );
}

function extractTopLevelComponents(payload) {
  if (Array.isArray(payload)) {
    if (payload.length === 1 && isRootGroupingPayload(payload[0])) {
      return payload[0].components;
    }
    return payload;
  }

  if (isRootGroupingPayload(payload)) {
    return payload.components;
  }

  if (payload && typeof payload === "object" && payload.type) {
    return [payload];
  }

  if (payload && Array.isArray(payload.components)) {
    return payload.components;
  }

  return [];
}

function markActionBundleHidden(component) {
  if (!component || typeof component !== "object") return;

  component.builderHidden = true;

  if (Array.isArray(component.components)) {
    component.components.forEach(markActionBundleHidden);
  }

  if (component.type === "columns" && Array.isArray(component.columns)) {
    component.columns.forEach((column) => {
      if (Array.isArray(column?.components)) {
        column.components.forEach(markActionBundleHidden);
      }
    });
  }
}

function applySavedActionBundleVisibility(components = []) {
  if (!Array.isArray(components) || !components.length) return components;

  const wrapperKeys = components.reduce((keys, component) => {
    const wrapperKey = String(component?._actionsDriverKey || "").trim();
    if (wrapperKey) {
      keys.add(wrapperKey);
    }
    return keys;
  }, new Set());

  components.forEach((component) => {
    if (!component || typeof component !== "object") return;

    if (wrapperKeys.has(String(component.key || "").trim())) {
      markActionBundleHidden(component);
      return;
    }

    if (Array.isArray(component.components)) {
      applySavedActionBundleVisibility(component.components);
    }

    if (component.type === "columns" && Array.isArray(component.columns)) {
      component.columns.forEach((column) => {
        if (Array.isArray(column?.components)) {
          applySavedActionBundleVisibility(column.components);
        }
      });
    }
  });

  return components;
}

function findNestedComponent(component, predicate) {
  const stack = Array.isArray(component?.components) ? [...component.components] : [];

  while (stack.length) {
    const current = stack.shift();
    if (!current || typeof current !== "object") continue;
    if (predicate(current)) return current;

    if (Array.isArray(current.components)) {
      stack.push(...current.components);
    }

    if (current.type === "columns" && Array.isArray(current.columns)) {
      current.columns.forEach((column) => {
        if (Array.isArray(column?.components)) {
          stack.push(...column.components);
        }
      });
    }
  }

  return null;
}

function isQuizLikeFieldset(component) {
  if (!component || typeof component !== "object" || component.type !== "fieldset") return false;
  if (component.customType === "quiz") return true;

  const hasAnswerGrid = !!findNestedComponent(
    component,
    (child) => child?.type === "datagrid" && /^answerKey/i.test(child.key || "")
  );
  const hasPassMark = !!findNestedComponent(
    component,
    (child) => child?.type === "number" && /^passMark/i.test(child.key || "")
  );
  const hasSummary = !!findNestedComponent(
    component,
    (child) => child?.type === "textfield" && /quizsummary/i.test(`${child?.key || ""} ${child?.label || ""}`)
  );
  const hasResult = !!findNestedComponent(
    component,
    (child) => child?.type === "textarea" && /(^result$|quizresult|incorrectanswers)/i.test(`${child?.key || ""} ${child?.label || ""}`)
  );

  return hasAnswerGrid && hasResult && (hasPassMark || hasSummary);
}

function isQuizSetupLikeFieldset(component) {
  if (!component || typeof component !== "object" || component.type !== "fieldset") return false;

  const keyText = String(component.key || "").trim();
  const labelText = `${component?.label || ""} ${component?.legend || ""}`.trim();
  if (/^quizSetup/i.test(keyText) || /\bquiz setup\b/i.test(labelText)) {
    return true;
  }

  return !!findNestedComponent(component, (child) =>
    child && (
      (child.type === "number" && /^passMark/i.test(child.key || ""))
      || (child.type === "datagrid" && /^answerKey/i.test(child.key || ""))
      || (child.type === "textfield" && /quizsummary/i.test(`${child?.key || ""} ${child?.label || ""}`))
    )
  );
}

function isQuizResultsLikeFieldset(component) {
  if (!component || typeof component !== "object" || component.type !== "fieldset") return false;

  const keyText = String(component.key || "").trim();
  const labelText = `${component?.label || ""} ${component?.legend || ""}`.trim();
  if (/^quizResults/i.test(keyText) || /\bresults\b/i.test(labelText)) {
    return true;
  }

  return !!findNestedComponent(component, (child) =>
    child?.type === "textarea" && /(^result$|quizresult|incorrectanswers)/i.test(`${child?.key || ""} ${child?.label || ""}`)
  );
}

function isQuizQuestionsLikeFieldset(component) {
  if (!component || typeof component !== "object" || component.type !== "fieldset") return false;

  const keyText = String(component.key || "").trim();
  const labelText = `${component?.label || ""} ${component?.legend || ""}`.trim();
  if (/^quizQuestions/i.test(keyText) || /\bquestions\b/i.test(labelText)) {
    return true;
  }

  return !isQuizSetupLikeFieldset(component)
    && !isQuizResultsLikeFieldset(component)
    && walkQuizAnswerComponents(component.components || [], []).length > 0;
}

function stripQuizFieldsetLegends(component) {
  if (!component || typeof component !== "object" || component.type !== "fieldset") return;

  if (isQuizLikeFieldset(component)) {
    component.legend = "";
  }

  if (isQuizQuestionsLikeFieldset(component) || isQuizSetupLikeFieldset(component) || isQuizResultsLikeFieldset(component)) {
    component.legend = "";
  }
}

function walkQuizAnswerComponents(components = [], out = []) {
  components.forEach((component) => {
    if (!component || component.builderHidden) return;

    if (["select", "radio", "selectboxes"].includes(component.type)) {
      out.push(component);
      return;
    }

    if (Array.isArray(component.components)) {
      walkQuizAnswerComponents(component.components, out);
    }

    if (component.type === "columns" && Array.isArray(component.columns)) {
      component.columns.forEach((column) => {
        if (Array.isArray(column?.components)) {
          walkQuizAnswerComponents(column.components, out);
        }
      });
    }
  });

  return out;
}

function getQuizQuestionSection(component) {
  const sections = Array.isArray(component?.components) ? component.components : [];

  return sections.find((child) =>
    child?.type === "fieldset" && /^quizQuestions/i.test(child.key || "")
  ) || sections.find((child) =>
    child?.type === "fieldset" && /\bquestions\b/i.test(`${child?.label || ""} ${child?.legend || ""}`)
  ) || null;
}

function getQuizAnswerGrid(component) {
  return findNestedComponent(component, (child) =>
    child?.type === "datagrid" && /^answerKey/i.test(child.key || "")
  );
}

function syncImportedQuizAnswerKeyRows(component) {
  if (!isQuizLikeFieldset(component)) return;

  const answerGrid = getQuizAnswerGrid(component);
  if (!answerGrid) return;

  const desiredQuestionKey = "questionLabel";
  const desiredComponentKey = "questionComponentKey";
  const desiredAnswerKey = "correctValueS";
  const fieldText = (column) => `${column?.key || ""} ${column?.label || ""}`;

  answerGrid.initEmpty = false;
  answerGrid.components = Array.isArray(answerGrid.components) ? answerGrid.components : [];

  const columns = answerGrid.components;
  let componentKeyField = columns.find((column) =>
    /(questioncomponentkey|componentkey)/i.test(fieldText(column))
  ) || null;
  let questionField = columns.find((column) =>
    column !== componentKeyField && /(questionlabel|question)/i.test(fieldText(column))
  ) || null;
  let answerField = columns.find((column) =>
    /(answervalue|correctvalue|answer)/i.test(fieldText(column))
  ) || null;

  const legacyQuestionKey = questionField?.key || "";
  const legacyComponentKey = componentKeyField?.key || "";
  const legacyAnswerKey = answerField?.key || "";

  if (!questionField) {
    questionField = {
      label: "Question Label",
      labelWidth: 30,
      labelMargin: 3,
      tableView: true,
      reportable: true,
      key: desiredQuestionKey,
      type: "textfield",
      input: true
    };
  }

  if (!componentKeyField) {
    componentKeyField = {
      label: "Question Component Key",
      labelWidth: 30,
      labelMargin: 3,
      hidden: true,
      tableView: false,
      reportable: false,
      key: desiredComponentKey,
      type: "textfield",
      input: true
    };
  }

  if (!answerField) {
    answerField = {
      label: "Correct Value(s)",
      labelWidth: 30,
      labelMargin: 3,
      tableView: true,
      reportable: true,
      key: desiredAnswerKey,
      type: "textfield",
      input: true
    };
  }

  questionField.key = desiredQuestionKey;
  questionField.label = "Question Label";
  questionField.labelWidth = 30;
  questionField.labelMargin = 3;
  questionField.tableView = true;
  questionField.reportable = true;
  questionField.type = "textfield";
  questionField.input = true;

  componentKeyField.key = desiredComponentKey;
  componentKeyField.label = "Question Component Key";
  componentKeyField.labelWidth = 30;
  componentKeyField.labelMargin = 3;
  componentKeyField.hidden = true;
  componentKeyField.tableView = false;
  componentKeyField.reportable = false;
  componentKeyField.type = "textfield";
  componentKeyField.input = true;

  answerField.key = desiredAnswerKey;
  answerField.label = "Correct Value(s)";
  answerField.labelWidth = 30;
  answerField.labelMargin = 3;
  answerField.tableView = true;
  answerField.reportable = true;
  answerField.type = "textfield";
  answerField.input = true;

  answerGrid.components = [
    questionField,
    componentKeyField,
    answerField,
    ...columns.filter((column) => ![questionField, componentKeyField, answerField].includes(column))
  ];

  const existingRows = Array.isArray(answerGrid.defaultValue) ? answerGrid.defaultValue : [];
  const readValue = (row, keys = []) => {
    for (const key of keys) {
      if (!key) continue;
      const value = row?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return String(value).trim();
      }
    }
    return "";
  };

  const existingAnswers = new Map();
  existingRows.forEach((row, index) => {
    const componentKeyValue = readValue(row, [desiredComponentKey, legacyComponentKey, "questioncomponentkey", "questionComponentKey", "questionkey", "componentkey"]);
    const labelValue = readValue(row, [desiredQuestionKey, legacyQuestionKey, "questionlabel", "questionLabel", "question", "quizquestion"]);
    const answerValue = readValue(row, [desiredAnswerKey, legacyAnswerKey, "answervalue", "correctvalue", "correctvalues", "correctValueS", "quizanswer", "answer"]);
    if (componentKeyValue) existingAnswers.set(`key:${componentKeyValue}`, answerValue);
    if (labelValue) {
      existingAnswers.set(`label:${labelValue}`, answerValue);
      existingAnswers.set(`label-index:${labelValue}:${index}`, answerValue);
    }
  });

  const questionSection = getQuizQuestionSection(component);
  const setupSection = (component.components || []).find((child) => isQuizSetupLikeFieldset(child)) || null;
  const resultsSection = (component.components || []).find((child) => isQuizResultsLikeFieldset(child)) || null;
  const siblingSource = (component.components || []).filter((child) =>
    child
    && child !== questionSection
    && child !== setupSection
    && child !== resultsSection
    && child.builderHidden !== true
    && !/^passMark/i.test(child.key || "")
    && !/^answerKey/i.test(child.key || "")
  );
  const source = questionSection
    ? [...(questionSection.components || []), ...siblingSource]
    : siblingSource;
  const questionComponents = walkQuizAnswerComponents(source, []);

  answerGrid.defaultValue = questionComponents.map((questionComponent, index) => {
    const label = String(questionComponent?.label || "").trim();
    const answer = existingAnswers.get(`key:${questionComponent.key}`)
      || existingAnswers.get(`label-index:${label}:${index}`)
      || existingAnswers.get(`label:${label}`)
      || "";

    return {
      [desiredQuestionKey]: label,
      [desiredAnswerKey]: answer,
      [desiredComponentKey]: questionComponent.key
    };
  });
}

function applySavedQuizVisibility(components = []) {
  if (!Array.isArray(components) || !components.length) return components;

  const walk = (list = []) => {
    list.forEach((component) => {
      if (!component || typeof component !== "object") return;

      if (isQuizLikeFieldset(component) && Array.isArray(component.components)) {
        component.customType = "quiz";
        stripQuizFieldsetLegends(component);
        syncImportedQuizAnswerKeyRows(component);

        const questionSection = getQuizQuestionSection(component);
        stripQuizFieldsetLegends(questionSection);

        component.components.forEach((child) => {
          const key = String(child?.key || "").trim();
          const isSetupFieldset = isQuizSetupLikeFieldset(child);
          const isLegacyHelper = /^(passMark|answerKey|quizSummary|correct|incorrect|result)\d*$/i.test(key);

          stripQuizFieldsetLegends(child);

          if (isSetupFieldset || isLegacyHelper) {
            markActionBundleHidden(child);
          }
        });
      }

      if (Array.isArray(component.components)) {
        walk(component.components);
      }

      if (component.type === "columns" && Array.isArray(component.columns)) {
        component.columns.forEach((column) => {
          if (Array.isArray(column?.components)) {
            walk(column.components);
          }
        });
      }
    });
  };

  walk(components);
  return components;
}

function normalizeBuilderFormJSON(payload) {
  const components = extractTopLevelComponents(payload);
  applySavedActionBundleVisibility(components);
  applySavedQuizVisibility(components);

  return {
    ...(payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}),
    label: "Grouping",
    key: "grouping",
    type: "fieldset",
    input: false,
    tableView: false,
    components
  };
}

window.extractTopLevelComponents = extractTopLevelComponents;
window.normalizeBuilderFormJSON = normalizeBuilderFormJSON;
window.applySavedActionBundleVisibility = applySavedActionBundleVisibility;
window.applySavedQuizVisibility = applySavedQuizVisibility;

function restoreImportedTemplateTimer(context) {
  if (!context || typeof context !== "object") return;

  const rawElapsedMs = Number(context.sessionElapsedMs);
  const elapsedMs = Number.isFinite(rawElapsedMs)
    ? Math.max(0, Math.floor(rawElapsedMs))
    : 0;

  localStorage.setItem("builderSessionElapsedMs", String(elapsedMs));
  localStorage.setItem("builderSessionRunning", "0");
  localStorage.removeItem("builderSessionStartedAt");
}

function loadGeneratedFormFromHash() {
  const rawHash = String(window.location.hash || "").slice(1).trim();
  if (!rawHash) return null;

  try {
    const fileName = decodeURIComponent(rawHash);
    const stored = localStorage.getItem(`form_${fileName}`);
    if (!stored) return null;

    const parsed = JSON.parse(stored);
    window.__builderInitialHashLoadName = fileName;
    return normalizeBuilderFormJSON(parsed);
  } catch (err) {
    console.warn("Could not restore generated form from hash.", err);
    return null;
  }
}

// The form JSON describing the builder state (now global)
window.formJSON = {
  label: "Grouping",
  key: "grouping",
  type: "fieldset",
  input: false,
  tableView: false,
  components: []
};

const generatedFromHash = loadGeneratedFormFromHash();
if (generatedFromHash) {
  window.formJSON = generatedFromHash;
}

/* ----------------------------------------------------------
   2. if we just arrived from library.html, overwrite the
      stub with the stored JSON and clean the flag
----------------------------------------------------------*/
const cached = localStorage.getItem('importedForm');
const importedTemplateLoadName = localStorage.getItem('builderTemplateLoadName');
const importedTemplateContextRaw = localStorage.getItem('builderTemplateContext');
if (!generatedFromHash && cached) {
  try {
    window.formJSON = normalizeBuilderFormJSON(JSON.parse(cached));
    if (importedTemplateContextRaw) {
      window.__builderImportedTemplateContext = JSON.parse(importedTemplateContextRaw);
      restoreImportedTemplateTimer(window.__builderImportedTemplateContext);
    }
    if (importedTemplateLoadName) {
      window.__builderImportedTemplateLoadName = importedTemplateLoadName;
    }
  }
  catch { console.warn('⚠️  could not parse importedForm'); }
  localStorage.removeItem('importedForm');
  localStorage.removeItem('builderTemplateLoadName');
  localStorage.removeItem('builderTemplateContext');
} else if (importedTemplateLoadName) {
  localStorage.removeItem('builderTemplateLoadName');
  localStorage.removeItem('builderTemplateContext');
}

if (typeof window.sanitizeComponentSchema === "function") {
  window.sanitizeComponentSchema(window.formJSON.components);
}
applySavedActionBundleVisibility(window.formJSON.components);
applySavedQuizVisibility(window.formJSON.components);
window._usedKeys = {};
registerExistingKeys(window.formJSON.components);

// The currently selected fieldset key (default root)
let selectedFieldsetKey = "root";

// Track the currently selected component path
let currentSelectedComponentPath = null;

// Which component type is selected from the clickable "cards"
let selectedComponentType = null;

// Temporary holder for the component being edited
window._currentEditingComponent = null;

/**
 * Infer Date/Time mode from a label.
 * - contains both date + time terms => "datetime"
 * - contains only time term         => "time"
 * - contains only date term         => "date"
 * - otherwise                       => provided fallback
 */
function inferDateTimeModeFromLabel(label = "", fallback = "datetime") {
  const text = String(label || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const normalizedFallback =
    fallback === "date" || fallback === "time" || fallback === "datetime"
      ? fallback
      : "datetime";
  if (!text) return normalizedFallback;

  if (text === "date") return "date";
  if (text === "time") return "time";

  const hasExplicitDateTime =
    /\b(datetime|timestamp)\b/.test(text) ||
    /\b(date(?:\s*(?:\/|&|-)\s*|\s+)time|time(?:\s*(?:\/|&|-)\s*|\s+)date|date\s+and\s+time|time\s+and\s+date)\b/.test(text);

  if (
    hasExplicitDateTime ||
    /\b(created|updated|submitted|recorded|logged|checked|arrived|departed)\s+at\b/.test(text)
  ) {
    return "datetime";
  }

  const hasDate =
    /\b(date|deadline|dob|birthday|birth\s+date|anniversary|expiry|expiration)\b/.test(text) ||
    /\b(due|effective|issue|issued)\s+date\b/.test(text);
  const hasTime = /\b(time|clock)\b/.test(text);

  if (hasDate && hasTime) return "datetime";
  if (hasTime) return "time";
  if (hasDate) return "date";

  return normalizedFallback;
}

window.inferDateTimeModeFromLabel = inferDateTimeModeFromLabel;

/**
 * Infer Number style from a label.
 * - currency-like terms -> "currency"
 * - explicit numeric/count terms -> "number"
 * - otherwise -> fallback
 */
function inferNumberStyleFromLabel(label = "", fallback = "number") {
  const text = String(label || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const normalizedFallback = fallback === "currency" ? "currency" : "number";
  if (!text) return normalizedFallback;

  const hasStrongCurrencySignal =
    /[$€£¥]/.test(text) ||
    /\b(usd|cad|eur|gbp|dollars?|euros?|pounds?|currency|amount|subtotal|price|cost|fee|salary|wage|payment|tax|discount|shipping|deposit|refund|reimbursement)\b/.test(text) ||
    /\b(grand total|balance due)\b/.test(text) ||
    /\b((hourly|daily|weekly|monthly|yearly|bill|pay)\s+rate|(unit|hourly|daily)\s+(price|cost))\b/.test(text);
  if (hasStrongCurrencySignal) return "currency";

  const hasIdentifierNumberSignal =
    /\b(account|invoice|bill|quote|estimate|order|purchase\s+order|po|claim|case|ticket|tracking|reference|ref|serial|model|part|job|batch|lot|charge|payment)\s*(number|no\.?|#|id|identifier|code)\b/.test(text) ||
    /\b(number|no\.?|#|id|identifier|code)\s+(for|of)\s+(account|invoice|bill|quote|estimate|order|purchase\s+order|po|claim|case|ticket|tracking|reference|ref|serial|model|part|job|batch|lot|charge|payment)\b/.test(text);
  if (hasIdentifierNumberSignal) return "number";

  const hasNumberSignal =
    /\b(number|qty|quantity|count|unit|units|item|items|score|age|year|years|month|months|week|weeks|day|days|hour|hours|hr|hrs|minute|minutes|min|mins|second|seconds|sec|secs|percent|percentage|rating|size|length|width|height|weight|volume|distance|duration|mileage|temperature|id|identifier|code|serial|reference|tracking)\b/.test(text);
  if (hasNumberSignal) return "number";

  const hasWeakCurrencySignal =
    /\b(budget|balance|revenue|expense|premium|amount due|invoice|bill|quote|estimate|charge)\b/.test(text);
  if (hasWeakCurrencySignal) return "currency";

  return normalizedFallback;
}

window.inferNumberStyleFromLabel = inferNumberStyleFromLabel;

/**
 * Recursively flatten the component tree, returning only the components
 * that should count toward the “Total Components” counter.
 *
 *  • builderHidden          → always ignored
 *  • columns wrapper        → wrapper ignored, children traversed
 *  • compositeSingles set   → counted once, children NOT traversed
 */
function getAllComponents(arr = [], parentType = null) {
  const out = [];

  // Any composite control listed here is treated as ONE unit
  const compositeSingles = new Set([
    "address"          // street, city, province, postal code, country …
    // add more composite types here if needed
  ]);

  arr.forEach(comp => {
    if (comp.builderHidden) return;          // skip private helpers

    const isDatagridGrouping =
      parentType === "datagrid" && comp.type === "fieldset";

    /* ── 1 ▸ Columns wrapper ───────────────────────────────────────── */
    if (comp.type === "columns") {
      comp.columns.forEach(col =>
        out.push(...getAllComponents(col.components || [], "columns"))
      );
      return;                                // do NOT push the wrapper itself
    }

    /* ── 2 ▸ Every “normal” component counts once ─────────────────── */
    if (!isDatagridGrouping && comp.key) out.push(comp);

    /* ── 3 ▸ Dive into children unless it’s a composite single ────── */
    if (
      Array.isArray(comp.components) &&
      comp.components.length &&
      !compositeSingles.has(comp.type)
    ) {
      out.push(...getAllComponents(comp.components, comp.type));
    }
  });

  return out;
}

/**
 * Find a fieldset or editgrid by key, recursively.
 * We treat both "fieldset" and "editgrid" as containers.
 */
function findFieldsetByKey(components, key) {
  for (let comp of components) {
    if (['fieldset', 'editgrid', 'datagrid', 'columns'].includes(comp.type) && comp.key === key) {
      return comp;
    }
    if (Array.isArray(comp.components) && comp.components.length) {
      const found = findFieldsetByKey(comp.components, key);
      if (found) return found;
    }
    if (comp.type === "columns" && Array.isArray(comp.columns)) {
      for (const col of comp.columns) {
        if (!Array.isArray(col.components) || !col.components.length) continue;
        const found = findFieldsetByKey(col.components, key);
        if (found) return found;
      }
    }
  }
  return null;
}

function resolveContainerComponents(container) {
  if (!container) return [];

  if (container.type === "datagrid") {
    const grouping = (container.components || []).find(c => c.type === "fieldset");
    if (grouping) {
      if (!Array.isArray(grouping.components)) grouping.components = [];
      return grouping.components;
    }
  }

  if (!Array.isArray(container.components)) container.components = [];
  return container.components;
}

function getSelectedContainerComponents() {
  if (selectedFieldsetKey === "root") return window.formJSON.components;
  const container = findFieldsetByKey(window.formJSON.components, selectedFieldsetKey);
  if (!container) {
    selectedFieldsetKey = "root";
    return window.formJSON.components;
  }
  return resolveContainerComponents(container);
}

function getTargetContainerComponents(targetKey) {
  if (targetKey === "root") return window.formJSON.components;
  const container = findFieldsetByKey(window.formJSON.components, targetKey);
  return resolveContainerComponents(container);
}

function resolveMoveSource(pathIndex) {
  const parts = String(pathIndex)
    .split(".")
    .map(Number)
    .filter(Number.isFinite);

  if (!parts.length) return null;

  const rootArray = getSelectedContainerComponents();
  if (!Array.isArray(rootArray)) return null;

  if (parts.length === 1) {
    const ownerIndex = parts[0];
    return {
      fromArray: rootArray,
      ownerIndex,
      owner: rootArray[ownerIndex] || null
    };
  }

  const rootComp = rootArray[parts[0]];
  if (!rootComp) return null;

  const childIdx = parts[1];

  if (rootComp.type === "columns") {
    const fromArray = rootComp.columns?.[childIdx]?.components;
    if (!Array.isArray(fromArray)) return null;
    return {
      fromArray,
      ownerIndex: 0,
      owner: fromArray[0] || null
    };
  }

  if (Array.isArray(rootComp.components)) {
    return {
      fromArray: rootComp.components,
      ownerIndex: childIdx,
      owner: rootComp.components[childIdx] || null
    };
  }

  return null;
}

function componentContainsKey(component, key) {
  if (!component || !key) return false;

  const stack = [];
  if (Array.isArray(component.components)) stack.push(...component.components);
  if (component.type === "columns" && Array.isArray(component.columns)) {
    component.columns.forEach(col => {
      if (Array.isArray(col.components)) stack.push(...col.components);
    });
  }

  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    if (node.key === key) return true;
    if (Array.isArray(node.components)) stack.push(...node.components);
    if (node.type === "columns" && Array.isArray(node.columns)) {
      node.columns.forEach(col => {
        if (Array.isArray(col.components)) stack.push(...col.components);
      });
    }
  }

  return false;
}

/**
 * Remove a component from the current fieldset or from root.
 */
function removeComponentByKeyFromParentArray(parentArray, compKey, options = {}) {
  if (!Array.isArray(parentArray) || !compKey) return false;
  const fieldsetKey = typeof options.fieldsetKey === "string"
    ? options.fieldsetKey
    : selectedFieldsetKey;
  const comp = parentArray.find(component => component?.key === compKey);
  if (!comp) return false;

  // 2 · remove its Actions bundle (if any)
  if (comp._actionsDriverKey) {
    const dKey = comp._actionsDriverKey;
    for (let i = parentArray.length - 1; i >= 0; i--) {
      const c = parentArray[i];
      if (c.key === dKey || c.conditional?.when === dKey) {
        parentArray.splice(i, 1);
      }
    }
  }

  // 3 · remove the component itself by key (index may shift after bundle cleanup)
  const compIdx = parentArray.findIndex(c => c.key === compKey);
  if (compIdx !== -1) {
    parentArray.splice(compIdx, 1);
  }

  window.bumpManualDeleteTelemetry?.(1);
  const ownerFS = findAncestorQuiz(fieldsetKey);
  if (ownerFS && typeof window.syncQuizAnswerKeyRows === "function") {
    window.syncQuizAnswerKeyRows(ownerFS);
  }

  // 4 · tidy up driver numbering
  if (window.compactActionBundles) {
    window.compactActionBundles(parentArray);
  }

  if (typeof window.updatePreview === "function") {
    window.updatePreview();
  }

  return true;
}

/**
 * Remove a component from the current fieldset or from root.
 */
function removeComponentAtPath(path) {
  // 1 · locate source array & component
  const parentArray = getSelectedContainerComponents();
  const comp = parentArray[Number(path)];
  if (!comp) return false;

  return removeComponentByKeyFromParentArray(parentArray, comp.key, {
    fieldsetKey: selectedFieldsetKey
  });
}

/**
 * Move a component (and its Actions bundle) into another fieldset (or root).
 */
function moveComponentToFieldset(pathIndex, targetKey) {
  // 1 · figure out the “from” source
  const source = resolveMoveSource(pathIndex);
  if (!source || !source.owner) return false;

  const { fromArray, owner, ownerIndex } = source;

  // 2 · resolve destination container
  let toArray;
  if (targetKey === "root") {
    toArray = window.formJSON.components;
  } else {
    const targetContainer = findFieldsetByKey(window.formJSON.components, targetKey);
    if (!targetContainer) return false;

    // block moving a container into itself or its own descendants
    if (owner.key === targetKey || componentContainsKey(owner, targetKey)) {
      return false;
    }

    if (targetContainer.type === "datagrid" && ["editgrid", "datagrid"].includes(owner.type)) {
      return false;
    }
    if (targetContainer.type === "editgrid" && ["survey", "file", "documents", "fieldset", "editgrid", "datagrid"].includes(owner.type)) {
      return false;
    }

    toArray = resolveContainerComponents(targetContainer);
  }
  if (!Array.isArray(toArray)) return false;

  // 3 · collect owner + its Actions bundle
  const bundle = [owner];
  const indexMap = new Map([[owner, ownerIndex]]);

  if (owner._actionsDriverKey) {
    const dKey = owner._actionsDriverKey;
    fromArray.forEach((c, i) => {
      if (c === owner) return;
      if (c.key === dKey || c.conditional?.when === dKey) {
        bundle.push(c);
        indexMap.set(c, i);
      }
    });
    bundle.sort((a, b) => indexMap.get(a) - indexMap.get(b));
  }

  // 4 · remove the bundle from the source
  bundle.forEach(c => {
    const idx = fromArray.indexOf(c);
    if (idx !== -1) fromArray.splice(idx, 1);
  });

  // 5 · insert it into the destination
  toArray.push(...bundle);

  // 6 · tidy up the numbering of all Actions drivers
  if (window.compactActionBundles) {
    window.compactActionBundles(fromArray);
    if (fromArray !== toArray) window.compactActionBundles(toArray);
  }

  if (typeof window.updatePreview === "function") {
    window.updatePreview();
  }
  return true;
}

/**
 * Register every existing key in the global '_usedKeys' registry.
 * This must run once on startup so that ensureGloballyUniqueKey() knows which
 * suffixes are already in play across the whole form.
 */
function registerExistingKeys(components = [], options = {}) {
  const isTaskScoped = options.isTaskScoped === true;

  components.forEach(c => {
    if (c.key && !isTaskScoped) {
      if (typeof window.reserveUsedKey === "function") window.reserveUsedKey(c.key);
      else window._usedKeys[c.key] = true;
    }

    const childOptions = c.type === 'tasks'
      ? { isTaskScoped: true }
      : { isTaskScoped };

    if (Array.isArray(c.components) && c.components.length) {
      registerExistingKeys(c.components, childOptions);
    }
    if (c.type === 'columns' && Array.isArray(c.columns)) {
            c.columns.forEach(col => {
              if (Array.isArray(col.components) && col.components.length) {
                registerExistingKeys(col.components, childOptions);
              }
            });
          }
  });
}

window.registerExistingKeys = registerExistingKeys;
window.removeComponentByKeyFromParentArray = removeComponentByKeyFromParentArray;


// Immediately register all of formJSON's existing keys:
registerExistingKeys(window.formJSON.components);
