/****************************************************
 * public/js/mainFormBuilder.js
 ****************************************************/

const openMenuKeys = new Set();
const hoverMenuKeys = new Set();
const builderTelemetry = createEmptyBuilderTelemetry();
let sessionTimerController = null;
let currentDraggedBuilderItem = null;
let currentDraggedBuilderSourceKey = null;
let suppressNextComponentListDragEnd = false;
let pendingColumnInsertTarget = null;
let builderInsertionAnchorKey = null;
let transparentDragPreviewCanvas = null;
let componentTooltipSuppressPointerId = null;
const pendingColumnDropAnimationKeys = new Set();
let clearColumnDropAnimationFrame = 0;
const MAX_BUILDER_UNDO_HISTORY = 50;
const builderUndoStack = [];
let lastBuilderUndoState = null;
let lastBuilderUndoSignature = "";
let isApplyingBuilderUndo = false;
const BUILDER_PRIVATE_KEYS = new Set([
  "builderHidden",
  "builderAutoOtherSpecify",
  "builderDisableAutoOther",
  "builderComponentGroupManaged",
  "__dateTimeModeManual",
  "__numericStyleManual"
]);
const COMPONENT_DRAG_HANDLE_SELECTOR = ".component-details";
const MAX_COLUMNS_PER_ROW = 2;
const COLUMN_SLOT_WIDTH = 12 / MAX_COLUMNS_PER_ROW;
const DEFAULT_BUILDER_COMPONENT_TYPES = [
  "disclaimer",
  "textarea",
  "account",
  "choiceList",
  "survey",
  "datagrid",
  "editgrid",
  "componentGroup",
  "quiz",
  "file",
  "phoneNumber",
  "address",
  "asset",
  "datetime",
  "number"
];
const QUIZ_BUILDER_COMPONENT_TYPES = [
  "choiceList",
  "disclaimer",
  "textarea"
];
const BUILDER_COMPONENT_TYPES = (() => {
  const allowedTypes = new Set(DEFAULT_BUILDER_COMPONENT_TYPES);
  const configuredTypes = Array.isArray(window.__builderComponentTypes)
    ? window.__builderComponentTypes
    : [];
  const orderedTypes = [];
  const seenTypes = new Set();

  configuredTypes
    .concat(DEFAULT_BUILDER_COMPONENT_TYPES)
    .forEach((type) => {
      const safeType = String(type || "").trim();
      if (!allowedTypes.has(safeType) || seenTypes.has(safeType)) return;
      seenTypes.add(safeType);
      orderedTypes.push(safeType);
    });

  return orderedTypes;
})();
const DEFAULT_BUILDER_INSERT_TYPES = [...BUILDER_COMPONENT_TYPES, "fieldset"];
const BUILDER_COMPONENT_META = {
  disclaimer: { label: "Disclaimer", tooltip: "Add a formatted notice or instruction block." },
  textarea: { label: "Short Input", tooltip: "Collect brief written responses, or switch to a detailed 3-row input." },
  account: { label: "Worker", tooltip: "Choose a worker or account entry from a managed list." },
  choiceList: { label: "Choices", tooltip: "Create a dropdown, radio group, or select-box list from one card." },
  componentGroup: { label: "Field Group", tooltip: "Create a section that contains either one survey or one radio question per line." },
  datagrid: { label: "Basic Table", tooltip: "Build repeatable grouped rows without opening the full editor first." },
  survey: { label: "Survey", tooltip: "Build question-and-answer survey blocks with quick presets." },
  quiz: { label: "Knowledge Check", tooltip: "Create a quiz section with answer-key setup and graded results." },
  file: { label: "Photo", tooltip: "Capture one or more photos or files in the form." },
  phoneNumber: { label: "Phone", tooltip: "Collect formatted phone numbers." },
  address: { label: "Address", tooltip: "Insert a bundled street, city, state, and zip block." },
  asset: { label: "Equipment", tooltip: "Choose an asset from a managed list." },
  datetime: { label: "Date / Time", tooltip: "Capture date and time, or switch it to date-only or time-only." },
  number: { label: "Number", tooltip: "Create a number field and switch it to currency when needed." },
  editgrid: { label: "Custom Table", tooltip: "Build repeatable rows with a configurable layout." }
};
const BUILDER_COMPONENT_ICON_MAP = {
  disclaimer: "fa-circle-info",
  textarea: "fa-pen",
  account: "fa-user",
  choiceList: "fa-list-check",
  componentGroup: "fa-layer-group",
  datagrid: "fa-table",
  survey: "fa-clipboard-list",
  quiz: "fa-graduation-cap",
  file: "fa-camera",
  photo: "fa-camera",
  phoneNumber: "fa-phone",
  address: "fa-location-dot",
  asset: "fa-screwdriver-wrench",
  datetime: "fa-calendar-days",
  number: "fa-hashtag",
  editgrid: "fa-table-list",
  select: "fa-list-ul",
  radio: "fa-circle-dot",
  selectboxes: "fa-square-check",
  documents: "fa-file-lines",
  date: "fa-calendar",
  time: "fa-clock",
  currency: "fa-dollar-sign",
  fieldset: "fa-table-cells-large",
  columns: "fa-table-columns"
};

function getBuilderComponentIconClass(type) {
  return BUILDER_COMPONENT_ICON_MAP[type] || "fa-square";
}

function getBuilderComponentPaletteCardLabel(type) {
  const safeType = String(type || "").trim();
  if (!safeType) return "";

  const meta = BUILDER_COMPONENT_META[safeType];
  if (meta?.label) return meta.label;
  if (safeType === "fieldset") return "Section";

  return getBuilderComponentNiceLabel(safeType);
}

function getBuilderComponentPaletteType(comp) {
  const aliasMap = {
    select: "choiceList",
    radio: "choiceList",
    selectboxes: "choiceList",
    documents: "file",
    date: "datetime",
    time: "datetime",
    currency: "number"
  };
  const rawType = String(comp?.customType || comp?.type || "").trim();
  if (BUILDER_COMPONENT_META[rawType]) return rawType;

  const displayType = String(getBuilderComponentDisplayType(comp) || "").trim();
  if (BUILDER_COMPONENT_META[displayType]) return displayType;

  return aliasMap[displayType] || aliasMap[rawType] || rawType || displayType;
}

function getBuilderComponentPaletteLabel(comp) {
  if (comp?.type === "textarea" && Number(comp.rows) === 3) {
    return "Detailed Input";
  }

  if (isDateTimeBuilderComponent(comp)) {
    return ({
      datetime: "Date / Time",
      date: "Date",
      time: "Time"
    }[comp.__mode || "datetime"] || "Date / Time");
  }

  if (isFileUploadBuilderComponent(comp)) {
    return getFileUploadComponentMode(comp) === "documents" ? "Document" : "Photo";
  }

  if (comp?.type === "currency") {
    return "Currency";
  }

  const paletteType = getBuilderComponentPaletteType(comp);
  const meta = BUILDER_COMPONENT_META[paletteType];
  if (meta?.label) return meta.label;
  return getBuilderComponentNiceLabel(paletteType || getBuilderComponentDisplayType(comp));
}

function getBuilderComponentPaletteIconClass(comp) {
  if (isDateTimeBuilderComponent(comp)) {
    return getBuilderComponentIconClass(comp.__mode || "datetime");
  }

  if (isFileUploadBuilderComponent(comp)) {
    return getBuilderComponentIconClass(getFileUploadComponentMode(comp));
  }

  if (comp?.type === "currency") {
    return getBuilderComponentIconClass("currency");
  }

  return getBuilderComponentIconClass(
    getBuilderComponentPaletteType(comp) || getBuilderComponentDisplayType(comp)
  );
}

function getBuilderComponentNiceLabel(type) {
  return ({
    disclaimer : "Disclaimer Text",
    textfield  : "Text Field",
    textarea   : "Text Area",
    account    : "Account",
    choiceList : "Choice List",
    componentGroup: "Question Group",
    radio      : "Radio",
    survey     : "Survey",
    quiz       : "Quiz",
    selectboxes: "Select Boxes",
    select     : "Dropdown",
    file       : "Photo",
    documents  : "Document",
    phoneNumber: "Phone Number",
    address    : "Address",
    asset      : "Asset",
    datetime   : "Date / Time",
    number     : "Number",
    currency   : "Currency",
    fieldset   : "Section",
    datagrid   : "Basic Table",
    editgrid   : "Custom Table",
    columns    : "Columns"
  }[type] || _.startCase(type));
}

function getBuilderComponentDisplayType(comp) {
  if (!comp) return "";

  if (isDateTimeBuilderComponent(comp)) {
    return comp.__mode || "datetime";
  }

  return comp.customType || comp.type;
}

function getBuilderComponentCardTypeLabel(comp) {
  return getBuilderComponentNiceLabel(getBuilderComponentDisplayType(comp));
}

function getBuilderChoiceListCardTypeLabel(comp) {
  return ({
    radio: "Radio",
    selectboxes: "Select Box",
    select: "Dropdown"
  }[getBuilderComponentDisplayType(comp)] || "");
}

function getBuilderComponentListCardTypeLabel(comp) {
  return getBuilderChoiceListCardTypeLabel(comp) || getBuilderComponentPaletteLabel(comp);
}

function getBuilderComponentListCardIconClass(comp) {
  const displayType = getBuilderComponentDisplayType(comp);
  if (["radio", "selectboxes", "select"].includes(displayType)) {
    return getBuilderComponentIconClass(displayType);
  }

  return getBuilderComponentPaletteIconClass(comp);
}

function getSelectedBuilderContainer() {
  syncSelectedFieldsetKey();
  if (selectedFieldsetKey === "root" || typeof findFieldsetByKey !== "function") {
    return null;
  }

  const rootComponents = Array.isArray(formJSON?.components) ? formJSON.components : [];
  const container = findFieldsetByKey(rootComponents, selectedFieldsetKey);
  if (!container || container.builderHidden) {
    return null;
  }

  return container;
}

function getSelectedSectionLegendLabel() {
  const container = getSelectedBuilderContainer();
  if (!container || container.type !== "fieldset") {
    return "";
  }

  const rawLabel = String(container.label || container.legend || "").trim();
  if (!rawLabel) {
    return "";
  }

  return typeof window.normalizeComponentLabel === "function"
    ? window.normalizeComponentLabel(rawLabel, container.type)
    : rawLabel;
}

function getBuilderAllowedTypes(excludedTypes = []) {
  const blocked = new Set(excludedTypes);
  return DEFAULT_BUILDER_INSERT_TYPES.filter(type => !blocked.has(type));
}

function getBuilderTypeRestrictions(container = getSelectedBuilderContainer()) {
  const quizFS = container?.key ? findAncestorQuiz(container.key) : findAncestorQuiz(selectedFieldsetKey);
  if (quizFS) {
    return {
      allowedTypes: new Set(QUIZ_BUILDER_COMPONENT_TYPES),
      contextLabel: "current Quiz"
    };
  }

  if (container?.type === "datagrid") {
    return {
      allowedTypes: new Set(getBuilderAllowedTypes(["datagrid", "editgrid", "quiz"])),
      contextLabel: "current Basic Table"
    };
  }

  if (container?.type === "editgrid") {
    return {
      allowedTypes: new Set(getBuilderAllowedTypes(["componentGroup", "survey", "quiz", "file", "documents", "fieldset", "editgrid", "datagrid"])),
      contextLabel: "current Custom Table"
    };
  }

  return {
    allowedTypes: new Set(DEFAULT_BUILDER_INSERT_TYPES),
    contextLabel: ""
  };
}

function getBuilderVisibleComponentTypes(container = getSelectedBuilderContainer()) {
  const restrictions = getBuilderTypeRestrictions(container);
  return BUILDER_COMPONENT_TYPES.filter(type => restrictions.allowedTypes.has(type));
}

function getBuilderTypeAvailability(type, container = getSelectedBuilderContainer()) {
  const restrictions = getBuilderTypeRestrictions(container);
  const allowed = restrictions.allowedTypes.has(type);

  return {
    allowed,
    restrictionNote: allowed
      ? ""
      : ` Not allowed in the ${restrictions.contextLabel}.`
  };
}

function renderBuilderComponentCards(types = getBuilderVisibleComponentTypes(), options = {}) {
  const selectedType = String(options.selectedType || "").trim();

  return types.map(type => {
    const meta = BUILDER_COMPONENT_META[type] || {};
    const label = meta.label || _.startCase(type);
    const iconClass = getBuilderComponentIconClass(type);
    const availability = getBuilderTypeAvailability(type);
    const tooltipText = `${meta.tooltip || ""}${availability.restrictionNote}`.trim();
    const selectedClass = availability.allowed && selectedType === type ? " selected" : "";
    const unavailableClass = availability.allowed ? "" : " is-unavailable";
    const ariaDisabled = availability.allowed ? "" : ` aria-disabled="true"`;
    const tooltipCard = tooltipText
      ? `<div class="component-type-card__tooltip-card" role="presentation">
          <p class="component-type-card__tooltip-copy">${_.escape(tooltipText)}</p>
        </div>`
      : "";

    return `<div class="card component-type-card${selectedClass}${unavailableClass}" data-type="${type}" aria-label="${_.escape(label)}"${ariaDisabled}>
      <span class="component-type-card__main">
        <i class="component-type-card__icon fa-solid ${iconClass}" aria-hidden="true"></i>
        <span class="component-type-card__label">${_.escape(label)}</span>
      </span>
      ${tooltipCard}
    </div>`;
  }).join("");
}

function updateBuilderEntryAvailability() {
  const typeContainer = document.getElementById("componentTypeContainer");
  if (typeContainer) {
    const selectedType = typeContainer.querySelector(".card.selected:not(.is-unavailable)")?.dataset?.type || "";
    typeContainer.innerHTML = renderBuilderComponentCards(getBuilderVisibleComponentTypes(), { selectedType });
  }

  const addFieldsetBtn = document.getElementById("addFieldsetBtn");
  if (!addFieldsetBtn) return;

  const availability = getBuilderTypeAvailability("fieldset");
  const tooltipText = `Add a new section.${availability.restrictionNote}`.trim();

  addFieldsetBtn.classList.toggle("is-unavailable", !availability.allowed);
  addFieldsetBtn.disabled = !availability.allowed;
  addFieldsetBtn.setAttribute("aria-disabled", availability.allowed ? "false" : "true");
  addFieldsetBtn.setAttribute("data-tooltip", tooltipText);
}

function createEmptyBuilderTelemetry() {
  return {
    manualAddsByType: {},
    manualEdits: 0,
    manualDeletes: 0,
    aiAdds: 0,
    aiEdits: 0,
    aiDeletes: 0
  };
}

function markBuilderActivity(options = {}) {
  sessionTimerController?.markActivity({
    resumeIfPaused: options.resumeIfPaused !== false,
    force: options.force !== false
  });
}

function bumpManualAddTelemetry(type, count = 1) {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  if (!safeCount) return;

  const safeType = String(type || "unknown").trim() || "unknown";
  builderTelemetry.manualAddsByType[safeType] =
    (builderTelemetry.manualAddsByType[safeType] || 0) + safeCount;

  markBuilderActivity();
}

function bumpManualEditTelemetry(count = 1) {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  if (!safeCount) return;
  builderTelemetry.manualEdits += safeCount;
  markBuilderActivity();
}

function bumpManualDeleteTelemetry(count = 1) {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  if (!safeCount) return;
  builderTelemetry.manualDeletes += safeCount;
  markBuilderActivity();
}

function getBuilderTelemetrySnapshot() {
  return {
    manualAddsByType: { ...builderTelemetry.manualAddsByType },
    manualEdits: builderTelemetry.manualEdits,
    manualDeletes: builderTelemetry.manualDeletes,
    aiAdds: builderTelemetry.aiAdds,
    aiEdits: builderTelemetry.aiEdits,
    aiDeletes: builderTelemetry.aiDeletes,
    sessionElapsedMs: sessionTimerController?.getElapsedMs?.() || 0
  };
}

function resetBuilderTelemetry() {
  const next = createEmptyBuilderTelemetry();
  Object.keys(builderTelemetry).forEach((key) => {
    if (key === "manualAddsByType") {
      builderTelemetry.manualAddsByType = {};
      return;
    }
    builderTelemetry[key] = next[key];
  });
}

function builderOnlyJsonReplacer(key, value) {
  return BUILDER_PRIVATE_KEYS.has(key) ? undefined : value;
}

function cloneBuilderPublicJSON(payload) {
  return JSON.parse(JSON.stringify(payload, builderOnlyJsonReplacer));
}

function getCurrentBuilderExportJSON() {
  repairQuizComponents(formJSON.components);
  const clean = cloneBuilderPublicJSON(formJSON);
  if (typeof window.sanitizeComponentSchema === "function" && Array.isArray(clean.components)) {
    window.sanitizeComponentSchema(clean.components);
  }
  return clean;
}

function serializeBuilderExportJSON(payload = getCurrentBuilderExportJSON()) {
  return JSON.stringify(payload, null, 2);
}

async function writeTextToClipboard(text) {
  const normalizedText = typeof text === "string" ? text : String(text ?? "");

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(normalizedText);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = normalizedText;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    const copied = document.execCommand("copy");
    if (!copied) {
      throw new Error("Clipboard copy command failed.");
    }
  } finally {
    textarea.remove();
  }
}

async function copyCurrentBuilderJsonToClipboard(payload = getCurrentBuilderExportJSON()) {
  await writeTextToClipboard(serializeBuilderExportJSON(payload));
}

function getNextBuilderActionsCounter(components = []) {
  let maxSuffix = -1;

  (function walk(arr) {
    if (!Array.isArray(arr)) return;

    arr.forEach((component) => {
      if (!component || typeof component !== "object") return;

      if (
        component.builderHidden
        && component.type === "selectboxes"
        && /^actions\d*$/.test(component.key || "")
      ) {
        const suffix = component.key === "actions"
          ? 0
          : Number.parseInt(String(component.key).slice("actions".length), 10);
        if (Number.isFinite(suffix)) {
          maxSuffix = Math.max(maxSuffix, suffix);
        }
      }

      if (Array.isArray(component.components)) {
        walk(component.components);
      }

      if (component.type === "columns" && Array.isArray(component.columns)) {
        component.columns.forEach((column) => walk(column?.components));
      }
    });
  })(components);

  return maxSuffix + 1;
}

function createBuilderUndoState() {
  return {
    formJSON: JSON.parse(JSON.stringify(formJSON)),
    selectedFieldsetKey: selectedFieldsetKey || "root",
    builderInsertionAnchorKey: builderInsertionAnchorKey || null,
    actionsCounter: getNextBuilderActionsCounter(formJSON.components)
  };
}

function getBuilderUndoSignature(state) {
  return JSON.stringify(state?.formJSON || {});
}

function syncBuilderUndoButtonState() {
  const undoBtn = document.getElementById("undoBuilderBtn");
  if (!undoBtn) return;

  const hasUndo = builderUndoStack.length > 0;
  undoBtn.disabled = !hasUndo;
  undoBtn.setAttribute("aria-disabled", hasUndo ? "false" : "true");
  undoBtn.title = hasUndo ? "Undo last builder change" : "Nothing to undo";
}

function pushBuilderUndoState(state) {
  if (!state) return;

  const serialized = JSON.stringify(state);
  if (builderUndoStack[builderUndoStack.length - 1] === serialized) {
    syncBuilderUndoButtonState();
    return;
  }

  builderUndoStack.push(serialized);
  if (builderUndoStack.length > MAX_BUILDER_UNDO_HISTORY) {
    builderUndoStack.shift();
  }

  syncBuilderUndoButtonState();
}

function rememberBuilderUndoState() {
  const currentState = createBuilderUndoState();
  const currentSignature = getBuilderUndoSignature(currentState);

  if (!lastBuilderUndoState) {
    lastBuilderUndoState = currentState;
    lastBuilderUndoSignature = currentSignature;
    syncBuilderUndoButtonState();
    return;
  }

  if (currentSignature === lastBuilderUndoSignature) {
    lastBuilderUndoState.selectedFieldsetKey = currentState.selectedFieldsetKey;
    lastBuilderUndoState.builderInsertionAnchorKey = currentState.builderInsertionAnchorKey;
    lastBuilderUndoState.actionsCounter = currentState.actionsCounter;
    syncBuilderUndoButtonState();
    return;
  }

  if (!isApplyingBuilderUndo) {
    pushBuilderUndoState(lastBuilderUndoState);
  }

  lastBuilderUndoState = currentState;
  lastBuilderUndoSignature = currentSignature;
  syncBuilderUndoButtonState();
}

function resetBuilderUndoHistory(options = {}) {
  builderUndoStack.length = 0;
  lastBuilderUndoState = null;
  lastBuilderUndoSignature = "";

  if (options.captureCurrentState !== false) {
    const currentState = createBuilderUndoState();
    lastBuilderUndoState = currentState;
    lastBuilderUndoSignature = getBuilderUndoSignature(currentState);
  }

  syncBuilderUndoButtonState();
}

function hasBuilderDestinationKey(targetKey) {
  if (targetKey === "root") return true;

  const container = findFieldsetByKey(formJSON.components, targetKey);
  return !!container && !container.builderHidden;
}

function restoreBuilderUndoState(state) {
  const restoredForm = normalizeBuilderFormJSON(state?.formJSON || {});

  if (typeof window.sanitizeComponentSchema === "function") {
    window.sanitizeComponentSchema(restoredForm.components);
  }

  window.formJSON = restoredForm;
  selectedFieldsetKey = hasBuilderDestinationKey(state?.selectedFieldsetKey)
    ? state.selectedFieldsetKey
    : "root";
  builderInsertionAnchorKey = null;
  if (state?.builderInsertionAnchorKey) {
    builderInsertionAnchorKey = String(state.builderInsertionAnchorKey).trim() || null;
  }
  currentSelectedComponentPath = null;
  window._currentEditingComponent = null;
  openMenuKeys.clear();
  hoverMenuKeys.clear();
  clearPendingColumnInsertTarget();

  window._usedKeys = {};
  window._actionsCounter = Number.isInteger(state?.actionsCounter) && state.actionsCounter >= 0
    ? state.actionsCounter
    : getNextBuilderActionsCounter(restoredForm.components);
  registerExistingKeys(formJSON.components);

  updatePreview();
}

function undoBuilderChange() {
  if (!builderUndoStack.length) return false;

  const serializedState = builderUndoStack.pop();
  let state = null;

  try {
    state = JSON.parse(serializedState);
  } catch (err) {
    console.error("Could not restore undo state.", err);
    showNotification("Undo failed. The saved history is invalid.", "error");
    syncBuilderUndoButtonState();
    return false;
  }

  isApplyingBuilderUndo = true;
  try {
    restoreBuilderUndoState(state);
  } finally {
    isApplyingBuilderUndo = false;
  }

  syncBuilderUndoButtonState();
  return true;
}

window.bumpManualAddTelemetry = bumpManualAddTelemetry;
window.bumpManualEditTelemetry = bumpManualEditTelemetry;
window.bumpManualDeleteTelemetry = bumpManualDeleteTelemetry;
window.getBuilderTelemetrySnapshot = getBuilderTelemetrySnapshot;
window.resetBuilderTelemetry = resetBuilderTelemetry;
window.bumpAiTelemetry = function bumpAiTelemetry(kind, count = 1) {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  if (!safeCount) return;

  if (kind === "add") builderTelemetry.aiAdds += safeCount;
  if (kind === "edit") builderTelemetry.aiEdits += safeCount;
  if (kind === "delete") builderTelemetry.aiDeletes += safeCount;

  markBuilderActivity();
};

// ─── Calculation catalogue  +  expression builder (★ NEW) ────────────
const CALC_OPS = {
  "+":  { label:"Add",      symbol:"+", arity:2,
          expr:(a,b)=>`${a}+${b}` },

  "-":  { label:"Subtract", symbol:"−", arity:2,
          expr:(a,b)=>`${a}-${b}` },

  "*":  { label:"Multiply", symbol:"×", arity:2,
          expr:(a,b)=>`${a}*${b}` },

  "/":  { label:"Divide",   symbol:"÷", arity:2,
          expr:(a,b)=>`${a}/${b}` },

  // Common shortcuts
  "sum":{ label:"Total",    symbol:"Σ", arity:"many",
          expr:arr => arr.join(" + ") },

  "avg":{ label:"Average",  symbol:"µ", arity:"many",
          expr:arr => `(${arr.join(" + ")}) / ${arr.length}` },

  "pct":{ label:"% of",     symbol:"%", arity:2,
          expr:(a,b)=>`(${a} / ${b}) * 100` },

  "neg":{ label:"Negative", symbol:"±", arity:1,
          expr:a=>`-${a}` }
};

/* helper that turns {_calc} ➜ vanilla Form.io JS -------------------- */
function buildExpression({ op, fields }) {
  const q = k => `+String(typeof data.${k}==='undefined'?0:data.${k})
                     .replace(/[^0-9.]/g,'')`;

  const safe = fields.map(q);
  const cfg  = CALC_OPS[op];
  if (!cfg) throw new Error("Unknown op " + op);

  const js = (cfg.arity === 1)
               ? cfg.expr(safe[0])
             : (cfg.arity === 2)
               ? cfg.expr(safe[0], safe[1])
               : cfg.expr(safe);

  return `value = ${js}`;
}

const COMPONENT_REMOVE_ANIMATION_MS = 220;

function getVisibleBuilderCardByPath(path) {
  return [...document.querySelectorAll("#componentList .component-card[data-path]")]
    .find(card => card.dataset.path === String(path)) || null;
}

function animateComponentRemoval(cardEl, onCommit) {
  if (typeof onCommit !== "function") return;
  if (!cardEl?.isConnected || !document.body) {
    onCommit();
    return;
  }
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
    onCommit();
    return;
  }

  const rect = cardEl.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) {
    onCommit();
    return;
  }
  const computed = window.getComputedStyle(cardEl);
  const cardHeight = Math.max(rect.height, cardEl.offsetHeight);
  let committed = false;
  const snapshot = document.createElement("div");

  snapshot.className = "component-card__removal-snapshot";
  snapshot.setAttribute("aria-hidden", "true");
  snapshot.innerHTML = cardEl.innerHTML;
  snapshot.querySelectorAll("[data-path], [data-key], [data-owner-key], [data-col], [draggable]").forEach((node) => {
    node.removeAttribute("data-path");
    node.removeAttribute("data-key");
    node.removeAttribute("data-owner-key");
    node.removeAttribute("data-col");
    node.removeAttribute("draggable");
  });
  snapshot.querySelectorAll("button, a, input, textarea, select, [contenteditable]").forEach((node) => {
    node.setAttribute("tabindex", "-1");
    node.setAttribute("aria-hidden", "true");
    node.removeAttribute("contenteditable");
    if ("disabled" in node) node.disabled = true;
  });

  const commitOnce = () => {
    if (committed) return;
    committed = true;
    onCommit();
  };

  cardEl.appendChild(snapshot);
  cardEl.classList.add("component-card--removing");
  cardEl.style.height = `${cardHeight}px`;
  cardEl.style.minHeight = "0px";
  cardEl.style.marginBottom = computed.marginBottom;
  cardEl.style.paddingTop = computed.paddingTop;
  cardEl.style.paddingBottom = computed.paddingBottom;
  cardEl.style.overflow = "hidden";
  cardEl.style.pointerEvents = "none";

  const handleTransitionEnd = (event) => {
    if (event.target !== cardEl || event.propertyName !== "height") return;
    cardEl.removeEventListener("transitionend", handleTransitionEnd);
    commitOnce();
  };

  cardEl.addEventListener("transitionend", handleTransitionEnd);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      cardEl.classList.add("component-card--removing-active");
      cardEl.style.height = "0px";
      cardEl.style.marginBottom = "0px";
      cardEl.style.paddingTop = "0px";
      cardEl.style.paddingBottom = "0px";
    });
  });

  window.setTimeout(() => {
    cardEl.removeEventListener("transitionend", handleTransitionEnd);
    commitOnce();
  }, COMPONENT_REMOVE_ANIMATION_MS + 120);
}

function handleDelete(cardEl, path) {
  const resolvedCard = cardEl || getVisibleBuilderCardByPath(path);
  const targetComponent = getComponentByPath(path);
  const pathParts = String(path)
    .split(".")
    .map(part => Number(part))
    .filter(Number.isFinite);
  const columnWrapper = !resolvedCard && pathParts.length === 2
    ? getActiveBuilderDestination()[pathParts[0]]
    : null;
  const wrapperKey = resolvedCard?.dataset.ownerKey || (columnWrapper?.type === "columns" ? columnWrapper.key : "");
  const colIdx = resolvedCard?.dataset.ownerKey
    ? Number(resolvedCard.dataset.col)
    : columnWrapper?.type === "columns"
      ? pathParts[1]
      : NaN;

  if (
    targetComponent
    && typeof window.isAutoOtherSpecifyComponent === "function"
    && window.isAutoOtherSpecifyComponent(targetComponent)
  ) {
    const ownerKey = String(targetComponent.conditional?.when || "").trim();
    const ownerComponent = ownerKey ? findCompByKey(formJSON.components, ownerKey) : null;
    if (
      ownerComponent
      && typeof window.disableAutoOtherOnChoiceComponent === "function"
    ) {
      window.disableAutoOtherOnChoiceComponent(ownerComponent);
    }
  }

  /* ---------- A ▸ card nested inside a Columns shell ---------- */
  if (wrapperKey && Number.isInteger(colIdx)) {
    animateComponentRemoval(resolvedCard, () => {
      /* 1 ▸ pull the component out of the column */
      const removed = removeComponentInColumn(
        wrapperKey,
        colIdx,
        false                               // ← keep the column, show placeholder
      );
      if (!removed) return;                               // should never happen

      /* 2 ▸ find the parent array that contains the wrapper */
      const destArr = getActiveBuilderDestination();

      /* 3 ▸ locate the wrapper itself in that array */
      const wIdx = destArr.findIndex(c => c.key === wrapperKey);
      /* 4 ▸ insert the removed component *after* the wrapper */
      destArr.splice(wIdx + 1, 0, removed);

      updatePreview();
    });
    return;
  }

  /* ---------- B ▸ normal top-level card ------------------------ */
  const parentArray = getSelectedContainerComponents();
  const targetKey = targetComponent?.key;
  const fieldsetKey = selectedFieldsetKey;

  animateComponentRemoval(resolvedCard, () => {
    if (
      Array.isArray(parentArray)
      && targetKey
      && typeof window.removeComponentByKeyFromParentArray === "function"
    ) {
      window.removeComponentByKeyFromParentArray(parentArray, targetKey, { fieldsetKey });
      return;
    }

    removeComponentAtPath(path);          // already calls updatePreview()
  });
}


/*─────────────────────────────────────────────────────────────*/
/*  QUIZ HELPERS                                               */
/*─────────────────────────────────────────────────────────────*/
function isQuizFieldset(fs) {
  if (!fs || fs.type !== "fieldset") return false;
  if (fs.customType === "quiz") return true;

  const hasAnswerGrid = !!findQuizNestedComponent(
    fs,
    component => component?.type === "datagrid" && /^answerKey/i.test(component.key || "")
  );
  const hasPassMark = !!findQuizNestedComponent(
    fs,
    component => component?.type === "number" && /^passMark/i.test(component.key || "")
  );
  const hasSummaryField = !!findQuizNestedComponent(
    fs,
    component => component?.type === "textfield" && /quizsummary/i.test(`${component?.key || ""} ${component?.label || ""}`)
  );
  const hasResultsField = !!findQuizNestedComponent(
    fs,
    component => component?.type === "textarea" && /(^result$|quizresult|incorrectanswers)/i.test(`${component?.key || ""} ${component?.label || ""}`)
  );

  return hasAnswerGrid && hasResultsField && (hasPassMark || hasSummaryField);
}

function isQuizSetupFieldset(component) {
  if (!component || component.type !== "fieldset") return false;

  const keyText = String(component.key || "").trim();
  const labelText = `${component?.label || ""} ${component?.legend || ""}`.trim();
  if (/^quizSetup/i.test(keyText) || /\bquiz setup\b/i.test(labelText)) {
    return true;
  }

  return !!findQuizNestedComponent(component, child =>
    child && (
      (child.type === "number" && /^passMark/i.test(child.key || ""))
      || (child.type === "datagrid" && /^answerKey/i.test(child.key || ""))
      || (child.type === "textfield" && /quizsummary/i.test(`${child?.key || ""} ${child?.label || ""}`))
    )
  );
}

function isQuizResultsFieldset(component) {
  if (!component || component.type !== "fieldset") return false;

  const keyText = String(component.key || "").trim();
  const labelText = `${component?.label || ""} ${component?.legend || ""}`.trim();
  if (/^quizResults/i.test(keyText) || /\bresults\b/i.test(labelText)) {
    return true;
  }

  return !!findQuizNestedComponent(component, child =>
    child?.type === "textarea" && /(^result$|quizresult|incorrectanswers)/i.test(`${child?.key || ""} ${child?.label || ""}`)
  );
}

function isManagedQuizSectionFieldset(component) {
  return !!component
    && component.type === "fieldset"
    && (
      /^quizQuestions/i.test(component.key || "")
      || isQuizSetupFieldset(component)
      || isQuizResultsFieldset(component)
    );
}

function isQuizLegendlessFieldset(component) {
  return !!component
    && component.type === "fieldset"
    && (
      component.customType === "quiz"
      || isManagedQuizSectionFieldset(component)
    );
}

function getBuilderFieldsetLegend(component) {
  if (!component || (component.type !== "fieldset" && component.type !== "speed")) {
    return component?.legend || "";
  }

  if (isQuizLegendlessFieldset(component)) {
    return "";
  }

  return component.label;
}

function getQuizQuestionsFieldset(quizFS) {
  if (!Array.isArray(quizFS?.components)) return null;

  const explicitByKey = quizFS.components.find(component =>
    component?.type === "fieldset" && /^quizQuestions/i.test(component.key || "")
  ) || null;
  if (explicitByKey) return explicitByKey;

  const explicitByLabel = quizFS.components.find(component =>
    component?.type === "fieldset" && /\bquestions\b/i.test(`${component?.label || ""} ${component?.legend || ""}`)
  ) || null;
  if (explicitByLabel) return explicitByLabel;

  const candidates = quizFS.components
    .filter(component =>
      component?.type === "fieldset"
      && !isQuizSetupFieldset(component)
      && !isQuizResultsFieldset(component)
      && component.builderHidden !== true
    )
    .map(component => ({
      component,
      answerCount: walkQuizAnswerComponents(component.components || [], []).length
    }))
    .filter(entry => entry.answerCount > 0)
    .sort((a, b) => b.answerCount - a.answerCount);

  return candidates[0]?.component || null;
}

function getQuizResultsFieldset(quizFS) {
  if (!Array.isArray(quizFS?.components)) return null;

  return quizFS.components.find(component =>
    isQuizResultsFieldset(component)
  ) || null;
}

function getVisibleQuizBuilderSections(quizFS) {
  return [getQuizQuestionsFieldset(quizFS), getQuizResultsFieldset(quizFS)]
    .filter(section => !!section && section.builderHidden !== true);
}

function getPreferredQuizBuilderSection(quizFS) {
  return getQuizQuestionsFieldset(quizFS)
    || getVisibleQuizBuilderSections(quizFS)[0]
    || quizFS
    || null;
}

function normalizeBuilderDestinationKey(targetKey = selectedFieldsetKey) {
  if (!targetKey || targetKey === "root" || typeof findFieldsetByKey !== "function") {
    return targetKey || "root";
  }

  const container = findFieldsetByKey(formJSON.components, targetKey);
  if (!container) {
    return "root";
  }

  if (isQuizFieldset(container)) {
    return getPreferredQuizBuilderSection(container)?.key || container.key || "root";
  }

  if (container.builderHidden) {
    const quizFS = findAncestorQuiz(targetKey);
    if (quizFS) {
      return getPreferredQuizBuilderSection(quizFS)?.key || quizFS.key || "root";
    }

    return "root";
  }

  return targetKey;
}

function syncSelectedFieldsetKey() {
  const nextKey = normalizeBuilderDestinationKey(selectedFieldsetKey);
  if (nextKey !== selectedFieldsetKey) {
    selectedFieldsetKey = nextKey;
  }

  return selectedFieldsetKey;
}

const QUIZ_ANSWER_COMPONENT_TYPES = new Set(["select", "radio", "selectboxes"]);

function isQuizAnswerComponent(component) {
  return !!component && QUIZ_ANSWER_COMPONENT_TYPES.has(component.type);
}

function findQuizNestedComponent(quizFS, predicate) {
  const stack = Array.isArray(quizFS?.components) ? [...quizFS.components] : [];

  while (stack.length) {
    const component = stack.shift();
    if (!component) continue;
    if (predicate(component)) return component;

    if (Array.isArray(component.components)) {
      stack.push(...component.components);
    }

    if (component.type === "columns" && Array.isArray(component.columns)) {
      component.columns.forEach(column => {
        if (Array.isArray(column?.components)) {
          stack.push(...column.components);
        }
      });
    }
  }

  return null;
}

function getQuizAnswerKeyGrid(quizFS) {
  return findQuizNestedComponent(
    quizFS,
    component => component?.type === "datagrid" && /^answerKey/i.test(component.key || "")
  );
}

function getQuizPassMarkField(quizFS) {
  return findQuizNestedComponent(
    quizFS,
    component => component?.type === "number" && /^passMark/i.test(component.key || "")
  );
}

function getQuizAnswerGridKeys(quizFS) {
  const grid = getQuizAnswerKeyGrid(quizFS);
  const columns = Array.isArray(grid?.components) ? grid.components : [];
  const fieldText = component => `${component?.key || ""} ${component?.label || ""}`;
  const componentKeyField = columns.find(component =>
    /(questioncomponentkey|componentkey)/i.test(fieldText(component))
  );
  const questionField = columns.find(component =>
    component !== componentKeyField && /(questionlabel|question)/i.test(fieldText(component))
  );
  const answerField = columns.find(component =>
    /(answervalue|correctvalue|answer)/i.test(fieldText(component))
  );

  return {
    grid,
    questionKey: questionField?.key || "questionLabel",
    answerKey: answerField?.key || "correctValueS",
    componentKey: componentKeyField?.key || "questionComponentKey"
  };
}

function walkQuizAnswerComponents(components = [], out = []) {
  components.forEach(component => {
    if (!component || component.builderHidden) return;

    if (isQuizAnswerComponent(component)) {
      out.push(component);
      return;
    }

    if (Array.isArray(component.components)) {
      walkQuizAnswerComponents(component.components, out);
    }

    if (component.type === "columns" && Array.isArray(component.columns)) {
      component.columns.forEach(column => {
        if (Array.isArray(column?.components)) {
          walkQuizAnswerComponents(column.components, out);
        }
      });
    }
  });

  return out;
}

function getQuizQuestionComponents(quizFS) {
  if (!Array.isArray(quizFS?.components)) return [];

  const questionSection = getQuizQuestionsFieldset(quizFS);
  const setupSection = quizFS.components.find(component => isQuizSetupFieldset(component)) || null;
  const resultsSection = getQuizResultsFieldset(quizFS);

  const siblingSource = quizFS.components.filter(component =>
    component
    && component !== questionSection
    && component !== setupSection
    && component !== resultsSection
    && component.builderHidden !== true
    && !/^passMark/i.test(component.key || "")
    && !/^answerKey/i.test(component.key || "")
  );

  const source = questionSection
    ? [...(questionSection.components || []), ...siblingSource]
    : siblingSource;

  return walkQuizAnswerComponents(source, []);
}

function syncQuizAnswerKeyRows(quizFS) {
  const { grid, questionKey, answerKey, componentKey } = getQuizAnswerGridKeys(quizFS);
  if (!grid) return [];

  const existingRows = Array.isArray(grid.defaultValue) ? grid.defaultValue : [];
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
    const keyValue = readValue(row, [componentKey, "questioncomponentkey", "questionComponentKey", "questionkey", "componentkey"]);
    const labelValue = readValue(row, [questionKey, "questionlabel", "questionLabel", "question", "quizquestion"]);
    const answerValue = readValue(row, [answerKey, "answervalue", "correctvalue", "correctvalues", "correctValueS", "quizanswer", "answer"]);
    if (keyValue) existingAnswers.set(`key:${keyValue}`, answerValue);
    if (labelValue) existingAnswers.set(`label:${labelValue}:${index}`, answerValue);
  });

  const nextRows = getQuizQuestionComponents(quizFS).map((component, index) => {
    const label = String(component?.label || "").trim();
    const answer = existingAnswers.get(`key:${component.key}`)
      || existingAnswers.get(`label:${label}:${index}`)
      || "";

    return {
      [questionKey]: label,
      [answerKey]: answer,
      ...(componentKey ? { [componentKey]: component.key } : {})
    };
  });

  grid.defaultValue = nextRows;
  return nextRows;
}

function syncAnswerKeyRow(quizFS, cmp, previousLabel = "") {
  const { grid, questionKey, answerKey, componentKey } = getQuizAnswerGridKeys(quizFS);
  if (!grid || !cmp) return;

  const currentLabel = String(cmp.label || "").trim();
  const priorLabel = String(previousLabel || "").trim();
  const rows = Array.isArray(grid.defaultValue) ? grid.defaultValue : [];
  let row = rows.find(candidate => String(candidate?.[componentKey] || "").trim() === String(cmp.key || "").trim())
    || rows.find(candidate => String(candidate?.[questionKey] || "").trim() === priorLabel)
    || rows.find(candidate => String(candidate?.[questionKey] || "").trim() === currentLabel);

  if (!isQuizAnswerComponent(cmp)) {
    grid.defaultValue = rows.filter(candidate => {
      const label = String(candidate?.[questionKey] || "").trim();
      return label && label !== currentLabel && label !== priorLabel;
    });
    return;
  }

  if (!row) {
    row = {
      [questionKey]: currentLabel,
      [answerKey]: "",
      ...(componentKey ? { [componentKey]: cmp.key } : {})
    };
    rows.push(row);
  } else {
    row[questionKey] = currentLabel;
    row[answerKey] = String(row?.[answerKey] || "").trim();
    if (componentKey) {
      row[componentKey] = cmp.key;
    }
  }

  grid.defaultValue = rows;
}

function ensureQuizAnswerKeySchema(quizFS) {
  const grid = getQuizAnswerKeyGrid(quizFS);
  if (!grid) return false;

  let changed = false;
  const desiredQuestionKey = "questionLabel";
  const desiredComponentKey = "questionComponentKey";
  const desiredAnswerKey = "correctValueS";
  const fieldText = component => `${component?.key || ""} ${component?.label || ""}`;
  grid.components = Array.isArray(grid.components) ? grid.components : [];
  if (grid.initEmpty !== false) {
    grid.initEmpty = false;
    changed = true;
  }

  let questionField = grid.components.find(component =>
    /(questionlabel|question)/i.test(fieldText(component))
      && !/(questioncomponentkey|componentkey)/i.test(fieldText(component))
  ) || null;
  let componentKeyField = grid.components.find(component =>
    /(questioncomponentkey|componentkey)/i.test(fieldText(component))
  ) || null;
  let answerField = grid.components.find(component =>
    /(answervalue|correctvalue|answer)/i.test(fieldText(component))
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
    changed = true;
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
    changed = true;
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
    changed = true;
  }

  const normalizeColumn = (column, desiredKey, desiredLabel, extra = {}) => {
    if (column.key !== desiredKey) {
      column.key = desiredKey;
      changed = true;
    }
    if (column.label !== desiredLabel) {
      column.label = desiredLabel;
      changed = true;
    }

    const baseProps = {
      labelWidth: 30,
      labelMargin: 3,
      type: "textfield",
      input: true,
      ...extra
    };

    Object.entries(baseProps).forEach(([prop, value]) => {
      if (column[prop] !== value) {
        column[prop] = value;
        changed = true;
      }
    });
  };

  normalizeColumn(questionField, desiredQuestionKey, "Question Label", {
    tableView: true,
    reportable: true
  });
  normalizeColumn(componentKeyField, desiredComponentKey, "Question Component Key", {
    hidden: true,
    tableView: false,
    reportable: false
  });
  normalizeColumn(answerField, desiredAnswerKey, "Correct Value(s)", {
    tableView: true,
    reportable: true
  });

  const orderedColumns = [questionField, componentKeyField, answerField];
  const orderedKeys = orderedColumns.map(component => component.key).join("|");
  const remainingColumns = grid.components.filter(component =>
    !orderedColumns.includes(component)
  );
  const currentOrderedKeys = grid.components.slice(0, 3).map(component => component?.key || "").join("|");
  if (currentOrderedKeys !== orderedKeys || remainingColumns.length !== Math.max(0, grid.components.length - 3)) {
    grid.components = [...orderedColumns, ...remainingColumns];
    changed = true;
  }

  const questionComponents = getQuizQuestionComponents(quizFS);
  const readRowValue = (row, keys = []) => {
    for (const key of keys) {
      if (!key) continue;
      const value = row?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return String(value).trim();
      }
    }
    return "";
  };
  const normalizeText = (value) => String(value || "").trim().toLowerCase();
  const nextRows = (Array.isArray(grid.defaultValue) ? grid.defaultValue : []).map((row, index) => {
    const questionLabel = readRowValue(row, [
      desiredQuestionKey,
      legacyQuestionKey,
      "questionlabel",
      "questionLabel",
      "question",
      "quizquestion"
    ]);
    const correctValue = readRowValue(row, [
      desiredAnswerKey,
      legacyAnswerKey,
      "answervalue",
      "correctvalue",
      "correctvalues",
      "correctValueS",
      "answer"
    ]);
    let questionComponentKey = readRowValue(row, [
      desiredComponentKey,
      legacyComponentKey,
      "questioncomponentkey",
      "questionComponentKey",
      "questionkey",
      "quizquestionkey",
      "componentkey"
    ]);

    if (!questionComponentKey && questionLabel) {
      const labelMatches = questionComponents.filter(component =>
        normalizeText(component?.label) === normalizeText(questionLabel)
      );
      if (labelMatches.length === 1) {
        questionComponentKey = labelMatches[0].key;
      } else if (labelMatches.length > 1 && questionComponents[index]) {
        questionComponentKey = questionComponents[index].key;
      }
    }

    if (!questionComponentKey && questionComponents[index]) {
      questionComponentKey = questionComponents[index].key;
    }

    return {
      [desiredQuestionKey]: questionLabel,
      [desiredAnswerKey]: correctValue,
      [desiredComponentKey]: questionComponentKey
    };
  });

  if (JSON.stringify(grid.defaultValue || []) !== JSON.stringify(nextRows)) {
    grid.defaultValue = nextRows;
    changed = true;
  }

  return changed;
}

function repairQuizComponent(quizFS) {
  if (!isQuizFieldset(quizFS)) return false;

  let changed = false;
  if (quizFS.customType !== "quiz") {
    quizFS.customType = "quiz";
    changed = true;
  }

  if (ensureQuizAnswerKeySchema(quizFS)) {
    changed = true;
  }

  const summaryField = findQuizNestedComponent(quizFS, component =>
    component?.type === "textfield" && /quizsummary/i.test(`${component?.key || ""} ${component?.label || ""}`)
  );
  const resultField = findQuizNestedComponent(quizFS, component =>
    component?.type === "textarea" && /(^result$|quizresult)/i.test(`${component?.key || ""}`)
  );
  const incorrectField = findQuizNestedComponent(quizFS, component =>
    component?.type === "textarea" && /incorrectanswers/i.test(`${component?.key || ""} ${component?.label || ""}`)
  );

  if (summaryField && typeof window.buildQuizSummaryCalculation === "function") {
    const nextCalculation = window.buildQuizSummaryCalculation();
    if (summaryField.calculateValue !== nextCalculation) {
      summaryField.calculateValue = nextCalculation;
      changed = true;
    }
    if (summaryField.redrawOn !== "data") {
      summaryField.redrawOn = "data";
      changed = true;
    }
    if (summaryField.refreshOn !== "data") {
      summaryField.refreshOn = "data";
      changed = true;
    }
  }

  if (resultField && typeof window.buildQuizResultCalculation === "function") {
    const nextCalculation = window.buildQuizResultCalculation();
    if (resultField.calculateValue !== nextCalculation) {
      resultField.calculateValue = nextCalculation;
      changed = true;
    }
    if (resultField.redrawOn !== "data") {
      resultField.redrawOn = "data";
      changed = true;
    }
    if (resultField.refreshOn !== "data") {
      resultField.refreshOn = "data";
      changed = true;
    }
  }

  if (incorrectField && typeof window.buildQuizIncorrectAnswersCalculation === "function") {
    const nextCalculation = window.buildQuizIncorrectAnswersCalculation();
    if (incorrectField.calculateValue !== nextCalculation) {
      incorrectField.calculateValue = nextCalculation;
      changed = true;
    }
    if (incorrectField.redrawOn !== "data") {
      incorrectField.redrawOn = "data";
      changed = true;
    }
    if (incorrectField.refreshOn !== "data") {
      incorrectField.refreshOn = "data";
      changed = true;
    }
  }

  const grid = getQuizAnswerKeyGrid(quizFS);
  const beforeRows = JSON.stringify(grid?.defaultValue || []);
  syncQuizAnswerKeyRows(quizFS);
  if (beforeRows !== JSON.stringify(grid?.defaultValue || [])) {
    changed = true;
  }

  return changed;
}

function repairQuizComponents(components = []) {
  let changed = false;

  (components || []).forEach(component => {
    if (!component || typeof component !== "object") return;

    if (isQuizFieldset(component) && repairQuizComponent(component)) {
      changed = true;
    }

    if (Array.isArray(component.components) && repairQuizComponents(component.components)) {
      changed = true;
    }

    if (component.type === "columns" && Array.isArray(component.columns)) {
      component.columns.forEach(column => {
        if (Array.isArray(column?.components) && repairQuizComponents(column.components)) {
          changed = true;
        }
      });
    }
  });

  return changed;
}

function findAncestorQuiz(fsKey) {
  if (!fsKey || fsKey === "root") return null;

  let foundQuiz = null;

  (function walk(components = [], currentQuiz = null) {
    if (foundQuiz) return;

    components.forEach(component => {
      if (!component || foundQuiz) return;

      const nextQuiz = isQuizFieldset(component) ? component : currentQuiz;
      if (component.key === fsKey) {
        foundQuiz = nextQuiz || null;
        return;
      }

      if (Array.isArray(component.components)) {
        walk(component.components, nextQuiz);
      }

      if (component.type === "columns" && Array.isArray(component.columns)) {
        component.columns.forEach(column => {
          if (Array.isArray(column?.components)) {
            walk(column.components, nextQuiz);
          }
        });
      }
    });
  })(formJSON.components, null);

  return foundQuiz;
}

function applyInitialBuilderVerticalOffset() {
  const wrapper = document.querySelector(".wrapper");
  const workspace = wrapper?.querySelector?.(".builder-workspace");
  if (!wrapper || !workspace) return;

  const minInset = window.innerWidth > 900 ? 40 : 20;
  const workspaceHeight = workspace.getBoundingClientRect().height;
  const centeredInset = Math.floor((window.innerHeight - workspaceHeight) / 2);
  const resolvedInset = Number.isFinite(centeredInset) && centeredInset > minInset
    ? centeredInset
    : minInset;

  wrapper.style.setProperty("--builder-offset-top", `${resolvedInset}px`);
  wrapper.style.setProperty("--builder-offset-bottom", `${resolvedInset}px`);
}

function syncBuilderListScrollHeight() {
  const listEl = document.getElementById("componentList");
  const listPanel = document.querySelector(".builder-list-panel");
  if (!listEl || !listPanel) return;

  const minimumVisibleCards = 6;
  const componentRowHeight = 61;
  const minimumListHeight = minimumVisibleCards * componentRowHeight;
  const viewportBound = Math.max(
    minimumListHeight,
    window.innerHeight - listEl.getBoundingClientRect().top - 88
  );
  let maxHeight = viewportBound;
  listPanel.style.removeProperty("--builder-list-panel-height");

  if (window.innerWidth > 900) {
    const palettePanel = document.querySelector(".builder-palette-panel");
    const listHeader = listPanel.querySelector(".builder-list-header");

    if (palettePanel && listPanel) {
      const paletteRect = palettePanel.getBoundingClientRect();
      const listPanelRect = listPanel.getBoundingClientRect();
      const panelStyle = getComputedStyle(listPanel);
      const headerStyle = listHeader ? getComputedStyle(listHeader) : null;
      const panelPadding =
        (Number.parseFloat(panelStyle.paddingTop) || 0)
        + (Number.parseFloat(panelStyle.paddingBottom) || 0);
      const headerHeight = listHeader ? listHeader.getBoundingClientRect().height : 0;
      const headerGap = headerStyle ? (Number.parseFloat(headerStyle.marginBottom) || 0) : 0;
      const minimumPanelHeight = Math.ceil(
        panelPadding + headerHeight + headerGap + minimumListHeight
      );
      const paletteAlignedPanel = paletteRect.bottom - listPanelRect.top;
      const panelViewportBound = Math.max(
        minimumPanelHeight,
        window.innerHeight - listPanelRect.top - 88
      );
      const resolvedPanelHeight = Math.max(
        minimumPanelHeight,
        Math.min(panelViewportBound, Math.floor(paletteAlignedPanel))
      );

      if (Number.isFinite(resolvedPanelHeight) && resolvedPanelHeight > 0) {
        listPanel.style.setProperty(
          "--builder-list-panel-height",
          `${resolvedPanelHeight}px`
        );
        maxHeight = Math.min(
          viewportBound,
          Math.max(
            minimumListHeight,
            Math.floor(resolvedPanelHeight - panelPadding - headerHeight - headerGap)
          )
        );
      }
    }
  }

  listEl.style.setProperty("--builder-component-list-max-height", `${Math.round(maxHeight)}px`);
}

function getActiveBuilderDestination() {
  syncSelectedFieldsetKey();
  if (selectedFieldsetKey === "root") {
    return formJSON.components;
  }

  const container = findFieldsetByKey(formJSON.components, selectedFieldsetKey);
  if (!container || container.builderHidden) {
    selectedFieldsetKey = "root";
    return formJSON.components;
  }

  if (typeof resolveContainerComponents === "function") {
    return resolveContainerComponents(container);
  }

  if (container.type === "datagrid") {
    const grouping = (container.components || []).find(component => component.type === "fieldset");
    return Array.isArray(grouping?.components) ? grouping.components : [];
  }

  return Array.isArray(container.components) ? container.components : [];
}

function getBuilderDestinationByKey(targetKey) {
  if (targetKey === "root") {
    return formJSON.components;
  }

  const container = findFieldsetByKey(formJSON.components, targetKey);
  if (!container || container.builderHidden) {
    return [];
  }

  if (typeof resolveContainerComponents === "function") {
    return resolveContainerComponents(container);
  }

  if (container.type === "datagrid") {
    const grouping = (container.components || []).find(component => component.type === "fieldset");
    return Array.isArray(grouping?.components) ? grouping.components : [];
  }

  return Array.isArray(container.components) ? container.components : [];
}

function isVisibleBuilderComponent(component) {
  return !!component && !component.builderHidden;
}

function getBuilderListVisibleChildren(containerEl) {
  if (!containerEl) return [];

  return [...containerEl.children].filter((child) => {
    if (child.classList.contains("list-tail-dropzone")) return false;
    if (child.classList.contains("columns-row")) return true;

    return child.classList.contains("component-card")
      && !child.dataset.placeholder;
  });
}

function normalizeBuilderInsertionAnchorKey(anchorKey = "") {
  const safeKey = String(anchorKey || "").trim();
  return safeKey || null;
}

function escapeBuilderSelectorValue(value = "") {
  const safeValue = String(value || "");
  if (window.CSS?.escape) {
    return window.CSS.escape(safeValue);
  }

  return safeValue.replace(/["\\]/g, "\\$&");
}

function hasBuilderInsertionAnchorInActiveDestination(anchorKey = builderInsertionAnchorKey) {
  const safeKey = normalizeBuilderInsertionAnchorKey(anchorKey);
  if (!safeKey) return false;

  return getActiveBuilderDestination().some(component => component?.key === safeKey);
}

function getBuilderInsertionAnchorComponent(anchorKey = builderInsertionAnchorKey) {
  const safeKey = normalizeBuilderInsertionAnchorKey(anchorKey);
  if (!safeKey) return null;

  return getActiveBuilderDestination().find(component => component?.key === safeKey) || null;
}

function getBuilderInsertionAnchorDisplayLabel(anchorKey = builderInsertionAnchorKey) {
  const safeKey = normalizeBuilderInsertionAnchorKey(anchorKey);
  if (!safeKey) return "";

  const listEl = document.getElementById("componentList");
  const domLabel = listEl?.querySelector(
    `[data-anchor-key="${escapeBuilderSelectorValue(safeKey)}"]`
  )?.dataset?.anchorLabel;

  if (domLabel) {
    return String(domLabel).trim();
  }

  const component = getBuilderInsertionAnchorComponent(safeKey);
  if (!component) return "";

  return String(
    component.label
    || component.legend
    || getBuilderComponentCardTypeLabel(component)
    || component.key
    || ""
  ).trim();
}

function updateBuilderInsertTargetCopy() {
  const copyEl = document.getElementById("builderInsertTargetCopy");
  if (!copyEl) return;

  const pendingTarget = getResolvedPendingColumnInsertTarget();
  if (pendingTarget?.shell) {
    const shellLabel = String(
      pendingTarget.shell.label
      || pendingTarget.shell.legend
      || getBuilderComponentCardTypeLabel(pendingTarget.shell)
      || "the current columns row"
    ).trim();
    copyEl.textContent = `Adding to the next open column in ${shellLabel}.`;
    return;
  }

  const anchorLabel = getBuilderInsertionAnchorDisplayLabel();
  if (anchorLabel) {
    copyEl.textContent = `Adding below ${anchorLabel}.`;
    return;
  }

  copyEl.textContent = "New components go at the end of this section.";
}

function applyBuilderInsertionAnchorHighlight() {
  const listEl = document.getElementById("componentList");
  if (!listEl) return;

  listEl.querySelectorAll(".is-insert-anchor")
    .forEach(node => node.classList.remove("is-insert-anchor"));

  const safeKey = normalizeBuilderInsertionAnchorKey(builderInsertionAnchorKey);
  if (safeKey) {
    const anchorNode = listEl.querySelector(
      `[data-anchor-key="${escapeBuilderSelectorValue(safeKey)}"]`
    );
    anchorNode?.classList?.add("is-insert-anchor");
  }

  updateBuilderInsertTargetCopy();
}

function setBuilderInsertionAnchor(anchorKey, options = {}) {
  const nextKey = normalizeBuilderInsertionAnchorKey(anchorKey);
  builderInsertionAnchorKey = hasBuilderInsertionAnchorInActiveDestination(nextKey)
    ? nextKey
    : null;

  if (options.refresh !== false) {
    applyBuilderInsertionAnchorHighlight();
  }

  return builderInsertionAnchorKey;
}

function selectBuilderInsertionAnchor(anchorKey, options = {}) {
  clearPendingColumnInsertTarget();
  return setBuilderInsertionAnchor(anchorKey, options);
}

function syncBuilderInsertionAnchorState() {
  if (!hasBuilderInsertionAnchorInActiveDestination()) {
    builderInsertionAnchorKey = null;
  }
  applyBuilderInsertionAnchorHighlight();
}

function getBuilderInsertionIndex(arr, anchorKey = builderInsertionAnchorKey) {
  if (!Array.isArray(arr)) return 0;

  const safeKey = normalizeBuilderInsertionAnchorKey(anchorKey);
  if (!safeKey) return arr.length;

  const anchorIdx = arr.findIndex(component => component?.key === safeKey);
  if (anchorIdx === -1) return arr.length;

  const anchorComponent = arr[anchorIdx];
  if (anchorComponent?._actionsDriverKey) {
    const driverIdx = arr.findIndex((component, index) =>
      index > anchorIdx && component?.key === anchorComponent._actionsDriverKey
    );
    if (driverIdx !== -1) {
      return driverIdx + 1;
    }
  }

  return anchorIdx + 1;
}

function getActualArrayIndexForVisiblePosition(arr, visibleIdx) {
  if (!Array.isArray(arr)) return 0;

  const visibleIndices = [];
  arr.forEach((component, index) => {
    if (isVisibleBuilderComponent(component)) {
      visibleIndices.push(index);
    }
  });

  if (!visibleIndices.length) {
    return arr.length;
  }

  const normalizedVisibleIdx = Number.isFinite(visibleIdx)
    ? visibleIdx
    : 0;
  const safeVisibleIdx = Math.max(
    0,
    Math.min(normalizedVisibleIdx, visibleIndices.length)
  );

  if (safeVisibleIdx === visibleIndices.length) {
    return visibleIndices[visibleIndices.length - 1] + 1;
  }

  return visibleIndices[safeVisibleIdx];
}

function clearPendingColumnInsertTarget() {
  pendingColumnInsertTarget = null;
}

function getColumnPlaceholderTarget(placeholderEl) {
  if (!placeholderEl?.dataset) return null;

  const columnsKey = String(
    placeholderEl.dataset.colOwner
    || placeholderEl.dataset.ownerKey
    || ""
  ).trim();
  const rawColIdx = Number(
    placeholderEl.dataset.colIndex
    ?? placeholderEl.dataset.col
  );

  if (
    !columnsKey
    || !Number.isInteger(rawColIdx)
    || rawColIdx < 0
    || rawColIdx >= MAX_COLUMNS_PER_ROW
  ) {
    return null;
  }

  return { columnsKey, colIdx: rawColIdx };
}

function findAdjacentColumnPlaceholder(item) {
  if (!item) return null;

  const neighbors = [item.nextElementSibling, item.previousElementSibling];
  for (const neighbor of neighbors) {
    const target = getColumnPlaceholderTarget(neighbor);
    if (target) {
      return {
        target,
        placeholderEl: neighbor
      };
    }
  }

  return null;
}

function getColumnDropTargetFromRow(row, item = null) {
  if (!row) return null;

  const adjacent = findAdjacentColumnPlaceholder(item);
  if (adjacent) return adjacent;

  const placeholder = row.querySelector(
    ".component-card.placeholder[data-col-owner], .component-card.placeholder[data-owner-key]"
  );
  const target = getColumnPlaceholderTarget(placeholder);

  return target
    ? {
        target,
        placeholderEl: placeholder
      }
    : null;
}

function getColumnIndexFromRowGeometry(row, item) {
  if (
    !row
    || !item
    || typeof row.getBoundingClientRect !== "function"
    || typeof item.getBoundingClientRect !== "function"
  ) {
    return -1;
  }

  const rowRect = row.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  if (!(rowRect.width > 0) || !(itemRect.width > 0)) {
    return -1;
  }

  const itemCenter = itemRect.left + (itemRect.width / 2);
  const relativeCenter = itemCenter - rowRect.left;
  const rawIndex = Math.floor((relativeCenter / rowRect.width) * MAX_COLUMNS_PER_ROW);

  if (!Number.isFinite(rawIndex)) return -1;
  return Math.min(MAX_COLUMNS_PER_ROW - 1, Math.max(0, rawIndex));
}

function finalizeColumnRowDrop(row, item, evt = {}) {
  if (!row || !item) return false;

  const ownerKey = String(row.dataset.ownerKey || "").trim();
  const shell = findCompByKey(formJSON.components, ownerKey);
  if (!shell || shell.type !== "columns") return false;

  normalizeColumnsShell(shell);

  const sourceColIdx = Number(item.dataset.col);
  const hasSourceCol =
    Number.isInteger(sourceColIdx)
    && sourceColIdx >= 0
    && sourceColIdx < MAX_COLUMNS_PER_ROW;
  const adjacentDropTarget = findAdjacentColumnPlaceholder(item);
  const adjacentTargetColIdx =
    adjacentDropTarget?.target?.columnsKey === ownerKey
      ? adjacentDropTarget.target.colIdx
      : -1;
  const geometricColIdx = getColumnIndexFromRowGeometry(row, item);
  const sortableNewIndex =
    Number.isInteger(evt?.newIndex)
    && evt.newIndex >= 0
    && evt.newIndex < MAX_COLUMNS_PER_ROW
      ? evt.newIndex
      : -1;

  let targetColIdx = adjacentTargetColIdx;
  if (
    item.__json
    && hasSourceCol
    && adjacentTargetColIdx === sourceColIdx
    && geometricColIdx !== -1
  ) {
    targetColIdx = geometricColIdx;
  } else if (targetColIdx === -1) {
    targetColIdx = geometricColIdx;
  }

  if (
    sortableNewIndex !== -1
    && (
      targetColIdx === -1
      || (hasSourceCol && targetColIdx === sourceColIdx && sortableNewIndex !== sourceColIdx)
    )
  ) {
    targetColIdx = sortableNewIndex;
  }

  if (
    targetColIdx === -1
    && hasSourceCol
    && item.__json
  ) {
    targetColIdx = sourceColIdx;
  }

  if (targetColIdx === -1) return false;

  const isChangedSlot = hasSourceCol && targetColIdx !== sourceColIdx;
  if (!item.__json && !adjacentDropTarget && !isChangedSlot) {
    return false;
  }

  const displaced = moveComponentIntoColumn(
    item.dataset.key,
    ownerKey,
    targetColIdx,
    item.__json || null,
    { animateDrop: true }
  );
  delete item.__json;

  if (displaced && isChangedSlot) {
    moveComponentIntoColumn(
      displaced.key,
      ownerKey,
      sourceColIdx,
      displaced,
      { animateDrop: true }
    );
  }

  adjacentDropTarget?.placeholderEl?.remove?.();
  return true;
}

function findPendingColumnShellInActiveDestination(columnsKey) {
  if (!columnsKey) return null;

  return getActiveBuilderDestination().find(component =>
    component?.key === columnsKey
    && component.type === "columns"
  ) || null;
}

function getFirstOpenColumnIndex(shell, preferredColIdx = null) {
  if (!shell || shell.type !== "columns") return -1;

  normalizeColumnsShell(shell);

  if (
    Number.isInteger(preferredColIdx)
    && preferredColIdx >= 0
    && preferredColIdx < MAX_COLUMNS_PER_ROW
    && (shell.columns?.[preferredColIdx]?.components?.length || 0) === 0
  ) {
    return preferredColIdx;
  }

  for (let index = 0; index < MAX_COLUMNS_PER_ROW; index += 1) {
    if ((shell.columns?.[index]?.components?.length || 0) === 0) {
      return index;
    }
  }

  return -1;
}

function getResolvedPendingColumnInsertTarget(preferredColIdx = null) {
  if (!pendingColumnInsertTarget?.columnsKey) return null;

  const shell = findPendingColumnShellInActiveDestination(
    pendingColumnInsertTarget.columnsKey
  );
  if (!shell) {
    clearPendingColumnInsertTarget();
    return null;
  }

  const nextPreferredColIdx = Number.isInteger(preferredColIdx)
    ? preferredColIdx
    : pendingColumnInsertTarget.colIdx;
  const colIdx = getFirstOpenColumnIndex(shell, nextPreferredColIdx);
  if (colIdx === -1) {
    clearPendingColumnInsertTarget();
    return null;
  }

  pendingColumnInsertTarget = { columnsKey: shell.key, colIdx };
  return {
    shell,
    colIdx
  };
}

function syncPendingColumnInsertTarget() {
  return getResolvedPendingColumnInsertTarget();
}

function setPendingColumnInsertTarget(columnsKey, preferredColIdx = null) {
  const shell = findPendingColumnShellInActiveDestination(columnsKey);

  if (!shell) {
    clearPendingColumnInsertTarget();
    return null;
  }

  const colIdx = getFirstOpenColumnIndex(shell, preferredColIdx);
  if (colIdx === -1) {
    clearPendingColumnInsertTarget();
    return null;
  }

  pendingColumnInsertTarget = { columnsKey, colIdx };
  updateBuilderInsertTargetCopy();
  return pendingColumnInsertTarget;
}

function queueColumnDropAnimation(componentKey) {
  const safeKey = String(componentKey || "").trim();
  if (!safeKey) return;

  pendingColumnDropAnimationKeys.add(safeKey);
}

function flushPendingColumnDropAnimations() {
  if (!pendingColumnDropAnimationKeys.size) return;

  if (clearColumnDropAnimationFrame) {
    cancelAnimationFrame(clearColumnDropAnimationFrame);
  }

  clearColumnDropAnimationFrame = requestAnimationFrame(() => {
    pendingColumnDropAnimationKeys.clear();
    clearColumnDropAnimationFrame = 0;
  });
}

function insertComponentIntoBuilder(component) {
  const pendingTarget = getResolvedPendingColumnInsertTarget();

  if (pendingTarget) {
    const { shell, colIdx } = pendingTarget;
    shell.columns[colIdx] = createColumnSlot(shell.columns?.[colIdx], component);
    setPendingColumnInsertTarget(shell.key, colIdx + 1);
    setBuilderInsertionAnchor(shell.key, { refresh: false });

    return {
      destination: "column",
      shell,
      colIdx
    };
  }

  clearPendingColumnInsertTarget();
  const destination = getActiveBuilderDestination();
  const insertIdx = getBuilderInsertionIndex(destination);
  destination.splice(insertIdx, 0, component);
  setBuilderInsertionAnchor(component?.key || null, { refresh: false });

  return {
    destination: "container",
    shell: null,
    colIdx: null,
    insertIdx
  };
}

function focusNewComponentLabel(componentKey) {
  if (!componentKey) return;

  requestAnimationFrame(() => {
    const span = document.querySelector(
      `.component-card[data-key="${componentKey}"] .comp-label`
    );
    if (!span) return;

    const path = span.dataset.path;
    const comp = getComponentByPath(path);
    if (!comp) return;

    startInlineComponentLabelEdit(span, comp, {
      preventInitialScroll: true,
      scrollOnFirstInput: true
    });
  });
}

function startInlineComponentLabelEdit(labelEl, comp, options = {}) {
  if (!labelEl || !comp || labelEl.contentEditable === "true") return;

  const preventInitialScroll = !!options.preventInitialScroll;
  const scrollOnFirstInput = !!options.scrollOnFirstInput;

  labelEl.contentEditable = true;
  labelEl.dataset.orig = comp.label || "";

  if (preventInitialScroll) {
    try {
      labelEl.focus({ preventScroll: true });
    } catch (_err) {
      labelEl.focus();
    }
  } else {
    labelEl.focus();
  }

  document.getSelection().selectAllChildren(labelEl);

  if (scrollOnFirstInput) {
    labelEl.addEventListener("input", () => {
      scrollBuilderViewToBottom(labelEl);
    }, { once: true });
  }

  function finish(save) {
    labelEl.contentEditable = false;
    let shouldRerender = false;

    if (save) {
      const rawLabel = labelEl.textContent.trim();
      const newLabel = typeof window.normalizeComponentLabel === "function"
        ? window.normalizeComponentLabel(rawLabel, comp.type)
        : rawLabel;
      if (newLabel && newLabel !== comp.label) {
        const preserveKey = isManagedQuizSectionFieldset(comp);
        const previousKey = comp.key;
        comp.label = newLabel;
        if (comp.type === "fieldset" || comp.type === "speed") comp.legend = getBuilderFieldsetLegend(comp);
        if (!preserveKey) {
          comp.key = updateUniqueKey(comp.key, comp.label);
          if (selectedFieldsetKey === previousKey && comp.key) {
            selectedFieldsetKey = comp.key;
          }
          if (
            previousKey &&
            comp.key &&
            previousKey !== comp.key &&
            typeof window.syncComponentKeyReferences === "function" &&
            Array.isArray(window.formJSON?.components)
          ) {
            window.syncComponentKeyReferences(window.formJSON.components, previousKey, comp.key);
          }
        }
        syncLabelDrivenComponentBehavior(comp, newLabel);
        bumpManualEditTelemetry(1);
        shouldRerender = true;
      } else {
        labelEl.textContent = comp.label;
      }
    } else {
      labelEl.textContent = labelEl.dataset.orig;
    }

    delete labelEl.dataset.orig;
    if (shouldRerender) {
      requestAnimationFrame(() => updatePreview());
    }
  }

  labelEl.addEventListener("keydown", ev => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      finish(true);
      labelEl.blur();
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      finish(false);
      labelEl.blur();
    }
  });

  labelEl.addEventListener("blur", () => finish(true), { once: true });
}

function scrollBuilderViewToBottom(sourceEl) {
  const targets = [];
  const rootScroller = document.scrollingElement || document.documentElement;
  if (rootScroller) targets.push(rootScroller);
  if (document.body && document.body !== rootScroller) targets.push(document.body);

  let node = sourceEl?.parentElement || null;
  while (node) {
    const style = window.getComputedStyle(node);
    const overflowY = style?.overflowY || "";
    const isScrollable = /(auto|scroll|overlay)/.test(overflowY) && node.scrollHeight > node.clientHeight;
    if (isScrollable) {
      targets.push(node);
    }
    node = node.parentElement;
  }

  const uniqueTargets = [...new Set(targets)];
  const forceBottom = () => {
    uniqueTargets.forEach((target) => {
      target.scrollTop = target.scrollHeight;
    });
    window.scrollTo(0, document.documentElement.scrollHeight);
  };

  forceBottom();
  requestAnimationFrame(forceBottom);
  requestAnimationFrame(() => requestAnimationFrame(forceBottom));
}

function clearFieldsetDropHighlight() {
  document.querySelectorAll("#fieldsetList .fieldset-card.drop-before")
    .forEach(card => card.classList.remove("drop-before"));
}

function clearColumnDropIndicators() {
  document.querySelectorAll(".columns-row.drop-slot, .columns-row.column-drop-blocked")
    .forEach(row => {
      row.classList.remove("drop-slot");
      row.classList.remove("column-drop-blocked");
    });

  document.querySelectorAll(".columns-row .component-card.placeholder.drop-slot")
    .forEach(slot => slot.classList.remove("drop-slot"));
}

function clearColumnHoverPreviewCards() {
  document.querySelectorAll(".columns-row .component-card.column-hover-preview")
    .forEach((card) => card.classList.remove("column-hover-preview"));
}

function getTransparentDragPreviewCanvas() {
  if (!transparentDragPreviewCanvas) {
    transparentDragPreviewCanvas = document.createElement("canvas");
    transparentDragPreviewCanvas.width = 1;
    transparentDragPreviewCanvas.height = 1;
  }
  return transparentDragPreviewCanvas;
}

function suppressNativeDragPreview(dataTransfer) {
  // Keep the browser/Sortable drag preview visible so users can see
  // the full card while dragging.
  void dataTransfer;
}

function setColumnDropIndicator(row, options = {}) {
  clearColumnDropIndicators();
  if (!row || options.blocked) return;

  row.classList.add("drop-slot");
  if (options.placeholderEl) {
    options.placeholderEl.classList.add("drop-slot");
  }
}

function beginBuilderDrag(item) {
  endComponentTooltipSuppression();
  document.querySelectorAll("#componentList .component-card.is-dragging")
    .forEach((card) => card.classList.remove("is-dragging"));
  clearColumnHoverPreviewCards();
  currentDraggedBuilderItem = item || null;
  currentDraggedBuilderItem?.classList?.add("is-dragging");
  currentDraggedBuilderSourceKey = selectedFieldsetKey;
  document.body.classList.add("is-dragging-component");
}

function endBuilderDrag() {
  currentDraggedBuilderItem?.classList?.remove("is-dragging");
  document.querySelectorAll("#componentList .component-card.is-dragging")
    .forEach((card) => card.classList.remove("is-dragging"));
  clearColumnHoverPreviewCards();
  currentDraggedBuilderItem = null;
  currentDraggedBuilderSourceKey = null;
  clearFieldsetDropHighlight();
  clearColumnDropIndicators();
  document.body.classList.remove("is-dragging-component");
}

function beginComponentTooltipSuppression(pointerId) {
  componentTooltipSuppressPointerId = pointerId ?? null;
  document.body.classList.add("is-preparing-component-drag");
}

function endComponentTooltipSuppression(pointerId) {
  if (
    pointerId != null &&
    componentTooltipSuppressPointerId != null &&
    pointerId !== componentTooltipSuppressPointerId
  ) {
    return;
  }

  componentTooltipSuppressPointerId = null;
  document.body.classList.remove("is-preparing-component-drag");
}

function moveDraggedComponentToSection(targetKey) {
  const item = currentDraggedBuilderItem;
  if (!item || !targetKey) return false;

  if (targetKey === currentDraggedBuilderSourceKey) {
    return false;
  }

  if (item.dataset.ownerKey) {
    const moved =
      item.__json ||
      removeComponentInColumn(item.dataset.ownerKey, Number(item.dataset.col));

    if (!moved) return false;

    const toArr = getBuilderDestinationByKey(targetKey);
    if (!Array.isArray(toArr)) return false;

    toArr.push(moved);
    delete item.__json;
  } else {
    const path = item.dataset.path;
    if (path == null) return false;
    moveComponentToFieldset(path, targetKey);
  }

  selectedFieldsetKey = targetKey;
  suppressNextComponentListDragEnd = true;
  updatePreview();
  return true;
}

function getOptionEntriesForFlags(comp) {
  if (!comp || !["radio", "select", "selectboxes"].includes(comp.type)) {
    return [];
  }

  if (comp.type === "select") {
    return Array.isArray(comp.data?.values) ? comp.data.values : [];
  }

  return Array.isArray(comp.values) ? comp.values : [];
}

function clearOptionFlags(options) {
  if (!Array.isArray(options)) return;
  options.forEach(option => {
    if (option) option.flag = "";
  });
}

function normalizeComponentOptionFlags(comp) {
  if (!comp) return;

  if (comp.type === "select") {
    clearOptionFlags(comp.data?.values);
    return;
  }

  if (comp.type === "selectboxes") {
    clearOptionFlags(comp.values);
  }
}

function inferOptionFlagByLabel(label) {
  const normalized = String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  if (["yes", "pass", "safe"].includes(normalized)) return "success";
  if (["no", "fail", "atrisk"].includes(normalized)) return "danger";
  return "";
}

function hasEnabledOptionFlags(comp) {
  return getOptionEntriesForFlags(comp).some(option => Boolean(option.flag));
}

function toggleComponentOptionFlags(comp) {
  const options = getOptionEntriesForFlags(comp);
  if (!options.length) return false;

  if (options.some(option => option.flag)) {
    comp.__flagSnapshot = options.map(option => option.flag || "");
    options.forEach(option => {
      option.flag = "";
    });
    return false;
  }

  const snapshot = Array.isArray(comp.__flagSnapshot) ? comp.__flagSnapshot : [];
  options.forEach((option, index) => {
    option.flag = snapshot[index] || inferOptionFlagByLabel(option.label);
  });

  return options.some(option => option.flag);
}

function buildIndexedValueRemap(previousItems = [], nextItems = [], fallbackMap = {}) {
  const remap = {};

  previousItems.forEach((item, index) => {
    const previousValue = String(item?.value ?? "").trim();
    const nextValue = String(nextItems[index]?.value ?? "").trim();

    if (
      previousValue &&
      nextValue &&
      previousValue !== nextValue &&
      !Object.prototype.hasOwnProperty.call(remap, previousValue)
    ) {
      remap[previousValue] = nextValue;
    }
  });

  Object.entries(fallbackMap || {}).forEach(([from, to]) => {
    if (
      from &&
      to &&
      from !== to &&
      !Object.prototype.hasOwnProperty.call(remap, from)
    ) {
      remap[from] = to;
    }
  });

  return remap;
}

const DEFAULT_COMPONENT_GROUP_RESPONSES = Object.freeze([
  Object.freeze({ label: "Yes", value: "yes", flag: "success" }),
  Object.freeze({ label: "No", value: "no", flag: "danger" }),
  Object.freeze({ label: "N/A", value: "nA", flag: "" })
]);

function normalizeComponentGroupItemLabel(label = "") {
  const cleaned = String(label || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!cleaned) return "";

  return typeof window.normalizeAllCapsTitle === "function"
    ? window.normalizeAllCapsTitle(cleaned)
    : cleaned;
}

function normalizeComponentGroupItemLabels(items = []) {
  return (items || [])
    .map(item => normalizeComponentGroupItemLabel(item))
    .filter(Boolean);
}

function cloneComponentGroupResponseOptions(mode = "survey", options = []) {
  const safeMode = mode === "radio" ? "radio" : "survey";
  const source = Array.isArray(options) && options.length
    ? options
    : DEFAULT_COMPONENT_GROUP_RESPONSES;

  const normalized = typeof window.normalizeChoiceItems === "function"
    ? window.normalizeChoiceItems(
        source.map(option => ({
          label: option?.label ?? option?.value ?? "",
          value: option?.value ?? option?.label ?? "",
          flag: option?.flag || "",
          tooltip: option?.tooltip || "",
          shortcut: option?.shortcut || ""
        })),
        safeMode === "survey" ? "value" : "option"
      ).items
    : source.map(option => ({ ...option }));

  return normalized.map(option => (
    safeMode === "survey"
      ? {
          label: option.label,
          value: option.value,
          tooltip: option.tooltip || "",
          flag: option.flag || ""
        }
      : {
          label: option.label,
          value: option.value,
          shortcut: option.shortcut || "",
          flag: option.flag || ""
        }
  ));
}

function getComponentGroupConfig(component) {
  const children = Array.isArray(component?.components)
    ? component.components.filter(child => !child?.builderHidden)
    : [];
  const managedChildren = children.filter(child => child?.builderComponentGroupManaged === true);
  const sourceChildren = managedChildren.length ? managedChildren : children;
  const surveyChild = sourceChildren.find(child => child?.type === "survey");

  if (surveyChild) {
    return {
      mode: "survey",
      items: Array.isArray(surveyChild.questions)
        ? surveyChild.questions.map(question => question?.label || question).filter(Boolean)
        : [],
      responses: cloneComponentGroupResponseOptions("survey", surveyChild.values || [])
    };
  }

  const radioChildren = sourceChildren.filter(child => child?.type === "radio");
  if (radioChildren.length) {
    return {
      mode: "radio",
      items: radioChildren.map(radio => radio?.label || "").filter(Boolean),
      responses: cloneComponentGroupResponseOptions("radio", radioChildren[0]?.values || [])
    };
  }

  return {
    mode: "survey",
    items: [],
    responses: cloneComponentGroupResponseOptions("survey")
  };
}

function applyComponentGroupConfig(component, config = {}) {
  if (!component || typeof component !== "object") return component;

  const sectionSeed = String(config.sectionLabel || component.label || "").trim() || "Section";
  const sectionLabel = typeof window.normalizeComponentLabel === "function"
    ? window.normalizeComponentLabel(sectionSeed, "fieldset")
    : sectionSeed;
  const mode = config.mode === "radio" ? "radio" : "survey";
  const itemLabels = normalizeComponentGroupItemLabels(config.items);
  const existingChildren = Array.isArray(component.components) ? component.components : [];
  const managedChildren = existingChildren.filter(child => child?.builderComponentGroupManaged === true);
  const preservedChildren = existingChildren.filter(child =>
    child
    && child.builderComponentGroupManaged !== true
    && child.builderHidden !== true
  );

  component.type = "fieldset";
  component.customType = "componentGroup";
  component.input = false;
  component.tableView = false;
  component.label = sectionLabel;
  component.legend = sectionLabel;

  let nextManagedChildren = [];

  if (mode === "survey") {
    const survey = managedChildren.find(child => child?.type === "survey")
      || createComponent("survey", sectionLabel, [], true);
    const questionItems = itemLabels.map(label => ({
      label,
      value: _.camelCase(label)
    }));
    const normalizedQuestions = typeof window.normalizeChoiceItems === "function"
      ? window.normalizeChoiceItems(questionItems, "question").items
      : window.ensureUniqueValues(questionItems);

    survey.builderComponentGroupManaged = true;
    survey.label = sectionLabel;
    survey.hideLabel = true;
    survey.questions = normalizedQuestions;
    survey.values = cloneComponentGroupResponseOptions("survey", config.responses);
    survey.validate = survey.validate || {};
    survey.validate.required = true;

    nextManagedChildren = [survey];
  } else {
    const radioResponses = cloneComponentGroupResponseOptions("radio", config.responses);
    const existingRadios = managedChildren.filter(child => child?.type === "radio");

    nextManagedChildren = itemLabels.map((itemLabel, index) => {
      const radio = existingRadios[index]
        || createComponent("radio", itemLabel, radioResponses.map(option => ({ ...option })));

      radio.builderComponentGroupManaged = true;
      radio.label = itemLabel;
      radio.inline = true;
      radio.tableView = false;
      radio.optionsLabelPosition = "right";
      radio.values = cloneComponentGroupResponseOptions("radio", radioResponses);
      radio.validate = radio.validate || {};
      radio.validate.required = true;

      return radio;
    });
  }

  component.components = [...nextManagedChildren, ...preservedChildren];
  return component;
}

function buildComponentGroupFieldset(sectionLabel, config = {}) {
  const fieldset = createComponent("fieldset", sectionLabel || "Section");
  fieldset.customType = "componentGroup";
  return applyComponentGroupConfig(fieldset, {
    ...config,
    sectionLabel: sectionLabel || config.sectionLabel || "Section"
  });
}




/* ————————————————————————————————
   Single handler for the component-type cards
   — called whenever a .card in #componentTypeContainer is clicked
————————————————————————————————————— */
function onTypeCardClick(e) {
  const card = e.target.closest(".card");
  if (!card) return;

  const typeContainer = document.getElementById("componentTypeContainer");
  if (!typeContainer) return;

  const chosenType = card.dataset.type;
  const paletteDefaultLabel = getBuilderComponentPaletteCardLabel(chosenType);
  const availability = getBuilderTypeAvailability(chosenType);

  if (!availability.allowed || card.classList.contains("is-unavailable")) {
    return;
  }

  const clearTypeSelection = () => {
    typeContainer.querySelectorAll(".card.selected")
                 .forEach(c => c.classList.remove("selected"));
  };

  /* highlight the tapped card */
  typeContainer.querySelectorAll(".card").forEach(c =>
    c.classList.toggle("selected", c === card)
  );

 /* ─ 2 · one-click components ─ */
 const oneClick = new Set([
   "textarea","account","file","phoneNumber",
   "address","asset","datetime","number",
   "datagrid","editgrid",
   /* Disclaimer, Choice List, Survey, Quiz, and Speed use the modal. */
   "fieldset"
 ]);

  if (oneClick.has(chosenType)) {
    const cmp     = createComponent(chosenType, paletteDefaultLabel);
    insertComponentIntoBuilder(cmp);
    bumpManualAddTelemetry(chosenType);
    updatePreview();

    /* auto-enter inline-edit on its label */
    focusNewComponentLabel(cmp.key);
    clearTypeSelection();
    return;
  }



  else if (chosenType === "quiz") {
    const cmp = createComponent("quiz", paletteDefaultLabel);
    insertComponentIntoBuilder(cmp);
    bumpManualAddTelemetry("quiz");
    const questionSection = getPreferredQuizBuilderSection(cmp);
    if (questionSection?.key) {
      selectedFieldsetKey = questionSection.key;
    }
    updatePreview();
    openAnswerKeyModal(cmp);
    clearTypeSelection();
    return;
  }

/* ──────────────────────────────────────────────────────────────
   SPEED  ➜  generates a plain Grouping with one radio per line
   ────────────────────────────────────────────────────────────── */
else if (chosenType === "speed") {
  // Always start with a clean slate for presets
  _presetRadioOptions = null;

  openLabelOptionsModal((
      groupLabel,                  // “Component Label” field
      _opts, _disc, _sQ, _sO,
      hideGrpLabel,                // Hide-Label toggle
      isRequired,                  // Required toggle
      _rows, _dtMode, _style,
      actionsEnabled,              // Actions toggle
      speedLabels,                 // textarea ①
      speedValues                  // textarea ②
    ) => {

    /* ── 0 · normalise the two text-areas ───────────────────── */
    speedLabels = (speedLabels || []).map(s => s.trim()).filter(Boolean);
    speedValues = (speedValues || []).map(s => s.trim());

    if (speedLabels.length === 0) {
      alert("Please enter at least one Speed Label.");
      return;
    }

    // Ensure the two lists are the same length
    if (speedValues.length > speedLabels.length) {
      speedValues.length = speedLabels.length;     // truncate extras
    }
    while (speedValues.length < speedLabels.length) speedValues.push("");

    /* ── 1 · create the outer Grouping ──────────────────────── */
    const groupingFS = createComponent("fieldset", groupLabel);

    // Only apply optional switches when the user checked them
    if (hideGrpLabel)                groupingFS.hideLabel = true;
    if (!isRequired)                 groupingFS.validate.required = false;

    groupingFS.legend = groupingFS.label;  // legend always mirrors the label

    /* ── 2 · radio builder helper ───────────────────────────── */
    const defaultRadioOpts = [
      { label:"Yes", value:"yes", flag:"success", shortcut:"" },
      { label:"No",  value:"no",  flag:"danger",  shortcut:"" },
      { label:"N/A",  value:"nA",  flag:"",        shortcut:"" }
    ];

    /* ── 3 · one radio (+ optional Actions) per label ───────── */
    speedLabels.forEach((lbl, idx) => {
      const keyBase = speedValues[idx] || lbl;

      const radio = createComponent(
        "radio",
        lbl,
        (_presetRadioOptions || defaultRadioOpts).map(o => ({ ...o }))
      );

      radio.key         = ensureGloballyUniqueKey(_.camelCase(keyBase));
      radio.__origValue = keyBase.trim();

      // Propagate the Required toggle only if it was set
      if (!isRequired) radio.validate.required = false;

      groupingFS.components.push(radio);

      if (actionsEnabled) {
        toggleActionsBundle(groupingFS.components, true, radio);
      }
    });

    /* ── 4 · park the Grouping in the current destination ───── */
    insertComponentIntoBuilder(groupingFS);
    bumpManualAddTelemetry('fieldset');
    updatePreview();
  }, "speed");          // ← tell the modal we’re in “speed” mode

  clearTypeSelection();
  return;
}

else if (chosenType === "componentGroup") {
  openLabelOptionsModal(
    (
      sectionLabel,
      _options,
      _disclaimer,
      _surveyQuestions,
      _surveyOptions,
      _finalHideLabel,
      _finalRequired,
      _finalRows,
      _selectedDTMode,
      _styleOrDT,
      _actionsEnabled,
      _speedLabels,
      _speedValues,
      _incomingDefault,
      _passMark,
      _finalEditGridConfig,
      _dateTimeModeManual,
      _numericStyleManual,
      componentGroupMode,
      componentGroupItems,
      componentGroupResponses
    ) => {
      const resolvedSectionLabel = String(sectionLabel || "").trim() || paletteDefaultLabel;
      const cmp = buildComponentGroupFieldset(resolvedSectionLabel, {
        mode: componentGroupMode,
        items: componentGroupItems,
        responses: componentGroupResponses
      });

      insertComponentIntoBuilder(cmp);
      bumpManualAddTelemetry("componentGroup");
      updatePreview();
    },
    "componentGroup",
    paletteDefaultLabel
  );

  clearTypeSelection();
  return;
}




const initialActionsEnabled = false;
const suggestedSurveyLabel = chosenType === "survey"
  ? getSelectedSectionLegendLabel()
  : "";
const defaultModalLabel = suggestedSurveyLabel || paletteDefaultLabel;

  /* ─ 4 · everything else needs the modal ─ */
  openLabelOptionsModal(
    (label, options, disclaimerText, sQ, sO,
 finalHideLabel, finalRequired, finalRows,
 selectedDTMode, styleOrDT,
 actionsEnabled,
 _speedLabels,
 _speedValues,
 incomingDefault,
 passMark,
 finalEditGridConfig,
 dateTimeModeManual,
 numericStyleManual) => {
      let typeToUse = chosenType;
      if (typeToUse === "choiceList") typeToUse = styleOrDT;
      if (typeToUse === "number")     typeToUse = styleOrDT;
      const componentLabel = String(label || "").trim() || defaultModalLabel;

 const cmp = createComponent(
     typeToUse,               // type
     componentLabel,          // label
     options || [],           // options
     finalHideLabel,          // hide label?
     typeToUse === 'quiz' ? passMark : incomingDefault 
 );
if (typeToUse === 'number' || typeToUse === 'currency') {
  if (incomingDefault !== undefined) {
    cmp.defaultValue = incomingDefault;
  } else {
    delete cmp.defaultValue;
  }
}
      cmp.validate = cmp.validate || {};
      cmp.validate.required = !!finalRequired;

      if (typeToUse === "survey") {
        cmp.questions = ensureUniqueValues(sQ);
        cmp.values    = ensureUniqueValues(sO);
      }
      if (typeToUse === "disclaimer") {
        cmp.customType = "disclaimer";
        cmp.html = disclaimerText.startsWith("<p")
          ? disclaimerText
          : `<p>${disclaimerText}</p>`;
      }
      if (typeToUse === "textarea") {
        cmp.rows = finalRows || 1;
        cmp.labelWidth  = 30;
        cmp.labelMargin = 3;
        cmp.autoExpand  = true;
        cmp.reportable  = true;
        cmp.tableView   = true;
      }
      if (typeToUse === "datetime") {
        setDateTimeComponentMode(cmp, selectedDTMode, { manual: dateTimeModeManual });
      }
      if (typeToUse === "number" || typeToUse === "currency") {
        setNumericComponentStyle(cmp, cmp.type, { manual: numericStyleManual });
      }
      if (typeToUse === "editgrid" && typeof window.applyEditGridTemplateConfig === "function") {
        window.applyEditGridTemplateConfig(cmp, finalEditGridConfig || {});
      }

      insertComponentIntoBuilder(cmp);
      bumpManualAddTelemetry(typeToUse);
      const quizFS = findAncestorQuiz(selectedFieldsetKey);
if (quizFS && isQuizAnswerComponent(cmp)) {
  syncAnswerKeyRow(quizFS, cmp);          // util below
  syncQuizAnswerKeyRows(quizFS);
}
      toggleActionsBundle(getActiveBuilderDestination(), actionsEnabled, cmp);
      updatePreview();

      /* clear highlight */
      typeContainer.querySelectorAll(".card").forEach(c =>
        c.classList.remove("selected")
      );
    },
chosenType,          // type
  defaultModalLabel, // initialLabel
  [],                  // initialOptions
  "",                  // initialDisclaimer
  [], [],              // initialSurvey Q / A
  false,               // initialHideLabel
  true,                // initialRequired
  undefined,           // initialRows
  "datetime",          // initialDTMode
  undefined,           // initialStyleOrDT  (was styleOrDT ❌)
  initialActionsEnabled,
  [], [],              // speed placeholders
  undefined,
  undefined               
);
}


/**
 * Gathers selectable build containers from the form.
 * Skips private helper fieldsets like the implicit row grouping inside a datagrid.
 */
function gatherFieldsets(components, fieldsets = [], parentType = null) {
  components.forEach(comp => {
    if (comp?.builderHidden) {
      return;
    }

    if (comp.type === "columns" && Array.isArray(comp.columns)) {
      comp.columns.forEach((column) => {
        if (Array.isArray(column?.components) && column.components.length) {
          gatherFieldsets(column.components, fieldsets, comp.type);
        }
      });
      return;
    }

    // If this is the special nested fieldset inside an Edit Grid, skip adding it
    const isNestedFieldset = comp.type === "fieldset" && comp.isEditGridChildFieldset;
    const isDatagridGroupingFieldset =
      parentType === "datagrid" && comp.type === "fieldset";
    const isQuizWrapper = isQuizFieldset(comp);
    const visibleQuizSections = isQuizWrapper ? getVisibleQuizBuilderSections(comp) : [];

    if (isQuizWrapper && visibleQuizSections.length) {
      visibleQuizSections.forEach(section => {
        if (section && !section.builderHidden) {
          fieldsets.push(section);
        }
      });

      visibleQuizSections.forEach(section => {
        if (Array.isArray(section?.components) && section.components.length) {
          gatherFieldsets(section.components, fieldsets, section.type);
        }
      });
      return;
    }

    const isContainer = ['fieldset','editgrid','datagrid'].includes(comp.type);  
    if (
      isContainer
      && !isNestedFieldset
      && !isDatagridGroupingFieldset
      && !comp.builderHidden
    ) {
      fieldsets.push(comp);
    }

    // Still recurse for sub-components
    if (comp.components && comp.components.length > 0) {
      gatherFieldsets(comp.components, fieldsets, comp.type);
    }
  });
  return fieldsets;
}

function renderBuilderSectionCard({ key, label, selected = false, index = 0 }) {
  const safeKey = _.escape(String(key || ""));
  const rawLabel = String(label || "[No Label]");
  const safeLabel = _.escape(rawLabel);
  const safeAriaLabel = _.escape(rawLabel);

  return `
    <button
      type="button"
      class="fieldset-card ${selected ? "selected" : ""}"
      data-key="${safeKey}"
      data-tooltip="${safeLabel}"
      aria-label="${safeAriaLabel}"
      aria-pressed="${selected ? "true" : "false"}"
    >
      <span class="fieldset-card__label">${safeLabel}</span>
    </button>`;
}

function getBuilderSectionRailElements() {
  const listEl = document.getElementById("fieldsetList");
  const railEl = listEl?.closest(".builder-destination-rail");
  const prevBtn = railEl?.querySelector('[data-builder-section-scroll="prev"]');
  const nextBtn = railEl?.querySelector('[data-builder-section-scroll="next"]');
  return { listEl, railEl, prevBtn, nextBtn };
}

function getBuilderSectionCards() {
  const { listEl } = getBuilderSectionRailElements();
  if (!listEl) return [];
  return [...listEl.querySelectorAll(".fieldset-card")];
}

function selectBuilderSection(nextKey) {
  const safeKey = String(nextKey || "").trim();
  if (!safeKey || safeKey === selectedFieldsetKey) {
    return false;
  }

  clearPendingColumnInsertTarget();
  builderInsertionAnchorKey = null;
  selectedFieldsetKey = safeKey;
  updatePreview();
  updateFieldsetCards();
  return true;
}

function syncBuilderSectionRailState({ ensureSelectedVisible = false, behavior = "auto" } = {}) {
  const { listEl, railEl, prevBtn, nextBtn } = getBuilderSectionRailElements();
  if (!listEl || !railEl) return;
  const cards = getBuilderSectionCards();
  const selectedIndex = cards.findIndex(card => card.classList.contains("selected"));

  const hasOverflow = listEl.scrollWidth - listEl.clientWidth > 4;
  const atStart = listEl.scrollLeft <= 2;
  const atEnd = listEl.scrollLeft + listEl.clientWidth >= listEl.scrollWidth - 2;

  railEl.classList.toggle("is-overflowing", hasOverflow);
  railEl.classList.toggle("is-at-start", !hasOverflow || atStart);
  railEl.classList.toggle("is-at-end", !hasOverflow || atEnd);

  if (prevBtn) {
    prevBtn.disabled = !hasOverflow || atStart;
    prevBtn.setAttribute("aria-hidden", (!hasOverflow || atStart) ? "true" : "false");
  }
  if (nextBtn) {
    nextBtn.disabled = !hasOverflow || atEnd;
    nextBtn.setAttribute("aria-hidden", (!hasOverflow || atEnd) ? "true" : "false");
  }

  if (!ensureSelectedVisible) {
    return;
  }

  const selectedCard = selectedIndex === -1 ? null : cards[selectedIndex];
  if (!selectedCard) return;

  const viewportLeft = listEl.scrollLeft + 8;
  const viewportRight = listEl.scrollLeft + listEl.clientWidth - 8;
  const cardLeft = selectedCard.offsetLeft;
  const cardRight = cardLeft + selectedCard.offsetWidth;

  if (cardLeft >= viewportLeft && cardRight <= viewportRight) {
    return;
  }

  const centeredLeft = Math.max(
    0,
    Math.min(
      cardLeft - Math.round((listEl.clientWidth - selectedCard.offsetWidth) / 2),
      Math.max(0, listEl.scrollWidth - listEl.clientWidth)
    )
  );

  listEl.scrollTo({ left: centeredLeft, behavior });
}

function stepBuilderSectionSelection(direction = 1) {
  const cards = getBuilderSectionCards();
  if (!cards.length) return;

  const currentIndex = Math.max(0, cards.findIndex(card => card.classList.contains("selected")));
  const nextIndex = Math.max(0, Math.min(cards.length - 1, currentIndex + direction));
  if (nextIndex === currentIndex) return;

  const nextKey = cards[nextIndex]?.getAttribute("data-key");
  if (!nextKey) return;

  selectBuilderSection(nextKey);
}

function updateBuilderSectionActions() {
  const contextTray = document.getElementById("builderSectionContextTray");
  const contextText = document.getElementById("builderSectionContextText");
  const editGridSetupBtn = document.getElementById("openEditGridSetupBtn");
  const quizSetupBtn = document.getElementById("openQuizSetupBtn");
  const selectedContainer = getSelectedBuilderContainer();
  const showEditGridSetup = selectedContainer?.type === "editgrid";
  const quizFS = findAncestorQuiz(selectedFieldsetKey);
  const showQuizSetup = !showEditGridSetup && !!quizFS;

  if (editGridSetupBtn) {
    editGridSetupBtn.hidden = !showEditGridSetup;
    editGridSetupBtn.disabled = !showEditGridSetup;
  }

  if (quizSetupBtn) {
    quizSetupBtn.hidden = !showQuizSetup;
    quizSetupBtn.disabled = !showQuizSetup;
  }

  if (contextTray) {
    contextTray.hidden = !showEditGridSetup && !showQuizSetup;
  }

  if (contextText) {
    let nextCopy = "";

    if (showEditGridSetup) {
      nextCopy = "Edit grid settings follow the currently selected edit grid.";
    } else if (showQuizSetup) {
      nextCopy = "Quiz settings follow the currently selected section.";
    }

    contextText.textContent = nextCopy;
  }
}

/**
 * Return the component at a given path index within the currently selected fieldset (or root).
 */
function getComponentByPath(pathStr) {
  const parts = String(pathStr).split('.').map(Number);

  let nodeArr = getActiveBuilderDestination();

  let comp = nodeArr[parts[0]];          // first hop

  for (let i = 1; i < parts.length && comp; i++) {
    const idx = parts[i];

    if (comp.type === 'columns') {       // inside a Columns wrapper
      comp = comp.columns[idx]?.components[0] || null;
    } else if (Array.isArray(comp.components)) {
      comp = comp.components[idx] || null;
    } else {
      comp = null;
    }
  }
  return comp || null;
}

function createColumnSlot(source = {}, component = undefined) {
  const sourceComponents = Array.isArray(source?.components)
    ? source.components.filter(Boolean)
    : [];
  const nextComponents = component === undefined
    ? sourceComponents.slice(0, 1)
    : component
      ? [component]
      : [];

  return {
    ...source,
    components: nextComponents,
    width: COLUMN_SLOT_WIDTH,
    offset: Number.isFinite(source.offset) ? source.offset : 0,
    push: Number.isFinite(source.push) ? source.push : 0,
    pull: Number.isFinite(source.pull) ? source.pull : 0,
    size: source.size || 'sm',
    currentWidth: COLUMN_SLOT_WIDTH
  };
}

function normalizeColumnsShell(shell) {
  if (!shell || shell.type !== "columns") return [];

  const existingColumns = Array.isArray(shell.columns) ? shell.columns : [];
  const overflow = [];
  const nextColumns = [];

  for (let index = 0; index < MAX_COLUMNS_PER_ROW; index += 1) {
    const source = existingColumns[index] && typeof existingColumns[index] === "object"
      ? existingColumns[index]
      : {};
    const components = Array.isArray(source.components)
      ? source.components.filter(Boolean)
      : [];
    const [primary = null, ...extras] = components;

    overflow.push(...extras);
    nextColumns.push(createColumnSlot(source, primary));
  }

  existingColumns.slice(MAX_COLUMNS_PER_ROW).forEach((column) => {
    if (Array.isArray(column?.components)) {
      overflow.push(...column.components.filter(Boolean));
    }
  });

  shell.columns = nextColumns;
  return overflow;
}

function normalizeColumnsInArray(arr) {
  if (!Array.isArray(arr)) return false;

  let changed = false;

  for (let index = 0; index < arr.length; index += 1) {
    const component = arr[index];
    if (!component || typeof component !== "object") continue;

    if (component.type === "columns") {
      const originalColumns = Array.isArray(component.columns) ? component.columns : [];
      const hadInvalidShape =
        originalColumns.length !== MAX_COLUMNS_PER_ROW
        || originalColumns.some((column) => (column?.components?.length || 0) > 1);
      const overflow = normalizeColumnsShell(component);

      if (hadInvalidShape || overflow.length) {
        changed = true;
      }

      if (overflow.length) {
        arr.splice(index + 1, 0, ...overflow);
      }

      component.columns.forEach((column) => {
        if (normalizeColumnsInArray(column.components)) changed = true;
      });
      continue;
    }

    if (Array.isArray(component.components) && normalizeColumnsInArray(component.components)) {
      changed = true;
    }
  }

  return changed;
}


function attachInnerSortables() {
  document.querySelectorAll(".columns-row").forEach((row) => {
    if (row.dataset.sortableMade) return;              // once only
    row.dataset.sortableMade = "1";

    Sortable.create(row, {
      group         : {                   // ← new object
               name : "builder",                 //   same group name …
               pull : false,                     // ✱ forbid dragging *out*
               put  : (to, from, dragEl) => {
                 if (to?.el === from?.el) return true;
                 return !!getColumnDropTargetFromRow(to?.el, dragEl || null);
               }
             },
      setData(dataTransfer, dragEl) {
        suppressNativeDragPreview(dataTransfer);
        dataTransfer?.setData?.("text/plain", dragEl?.dataset?.key || "builder-component");
      },
      direction     : "horizontal",
      animation  : 0,
      easing    : "cubic-bezier(.165,.84,.44,1)",
      draggable     : ".component-card:not(.placeholder):not(.component-card--root-static):not(.component-card--virtual-root)",
      handle        : COMPONENT_DRAG_HANDLE_SELECTOR,
      fallbackOnBody: false,
      fallbackTolerance: 8,
      ghostClass    : "drag-ghost",
      chosenClass   : "drag-chosen",

      onMove(evt) {
        if (evt.from === row && evt.to === row) {
          evt.dragged?.classList?.remove("column-hover-preview");
          clearColumnDropIndicators();
          return true;
        }

        const dropTarget = getColumnDropTargetFromRow(row, evt.dragged);
        if (dropTarget?.placeholderEl) {
          evt.dragged?.classList?.add("column-hover-preview");
          setColumnDropIndicator(row, { placeholderEl: dropTarget.placeholderEl });
          return true;
        }

        evt.dragged?.classList?.remove("column-hover-preview");
        clearColumnDropIndicators();
        return false;
      },

      /* ---------------------------------------------------------
         LEAVING the row → pull JSON out + drop a placeholder
      --------------------------------------------------------- */
      onRemove(evt) {
        const { item } = evt;
        const ownerKey = item.dataset.ownerKey;
        const colIdx   = Number(item.dataset.col);

        /* 1 ▸ remove from JSON ---------------------------------- */
        const shell = findCompByKey(formJSON.components, ownerKey);
 item.__json = shell?.columns[colIdx]?.components.shift() || null;

        /* 2 ▸ placeholder so the row keeps its shape ------------- */
        const ph = document.createElement("div");
        ph.className           = "component-card placeholder";
        ph.style.opacity = 0;    
        ph.dataset.placeholder = "true";
        ph.dataset.colOwner    = ownerKey;
        ph.dataset.colIndex    = colIdx;
        ph.dataset.ownerKey    = ownerKey;
        ph.dataset.col         = colIdx;
        ph.textContent         = "Drop\u00A0here";
        evt.from.insertBefore(ph, evt.from.children[colIdx] || null);
        requestAnimationFrame(() => ph.style.opacity = 1);

        /* 3 ▸ make the *travelling* card look like a top-level card */
        item.classList.remove("nested");   // show full-size styling
        item.style.flex = "";              // clear flex:1 1 0;

        /* rebuild the action buttons so the wrap action re-appears */
        const actions = item.querySelector(".component-actions");
  if (actions) {
    const meta = findCompByKey(formJSON.components, item.dataset.key);
    actions.innerHTML = actionButtonsHTML(true, meta);
  }
      },

      /* ---------------------------------------------------------
         ENTERING the row from an external list
      --------------------------------------------------------- */
      onAdd(evt) {
        const { item } = evt;                  // card just dropped in
        item.classList.remove("column-hover-preview");
        const dropTarget = getColumnDropTargetFromRow(row, item);
        let ph = dropTarget?.placeholderEl || null;
        clearColumnDropIndicators();
      
      /* ─── Row is already full (2 cards) ─── */
      if (!ph) {
        if (item.dataset.ownerKey && item.__json) {
          moveComponentIntoColumn(
            item.dataset.key,
            item.dataset.ownerKey,
            Number(item.dataset.col),
            item.__json
          );
          delete item.__json;
        }
        evt.from.insertBefore(item, evt.from.children[evt.oldIndex] || null);
        showNotification("Columns can only hold 2 components, one per cell.", "warn");
        suppressNextComponentListDragEnd = true;
        updatePreview();
        return;
      }
      
        /* ─── normal insert (now we surely have a placeholder) ─── */
        const target = dropTarget?.target || getColumnPlaceholderTarget(ph);
        if (!target) {
          evt.from.insertBefore(item, evt.from.children[evt.oldIndex] || null);
          showNotification("Could not determine which column to fill.", "warn");
          suppressNextComponentListDragEnd = true;
          updatePreview();
          return;
        }
      
        const displaced = moveComponentIntoColumn(
                            item.dataset.key,
                            target.columnsKey,
                            target.colIdx,
                            item.__json || null,
                            { animateDrop: true });
        delete item.__json;
      
        if (displaced) {
          const destArr = getActiveBuilderDestination();
          const wIdx = destArr.findIndex(c => c.key === target.columnsKey);
          destArr.splice(wIdx + 1, 0, displaced);
        }
      
        ph.remove();            // tidy up
        updatePreview();        // redraw builder + counter
      }
      ,

      /* ---------------------------------------------------------
         Moving a card *inside the same* row (swap / replace)
      --------------------------------------------------------- */
      onEnd(evt) {
        evt.item?.classList?.remove("column-hover-preview");
        clearColumnDropIndicators();

        if (suppressNextComponentListDragEnd) {
          suppressNextComponentListDragEnd = false;
          row.classList.remove("dragging");
          endBuilderDrag();
          return;
        }

        if (evt.from !== evt.to) {
          row.classList.remove("dragging");
          endBuilderDrag();
          return;          // handled by onAdd
        }

        if (finalizeColumnRowDrop(row, evt.item, evt)) {
          updatePreview();
        }
        row.classList.remove("dragging");
        endBuilderDrag();
      },

      onStart(evt) {
        suppressNativeDragPreview(evt?.originalEvent?.dataTransfer);
        row.classList.add("dragging");
        beginBuilderDrag(evt.item);
      }
    });
  });
}


function actionButtonsHTML(showColumn = true, comp = null) {
  /* ── context helpers ─────────────────────────────────────────────── */
  const isManagedQuizSection = isManagedQuizSectionFieldset(comp);
  const isNumeric = comp && ['number', 'currency'].includes(comp.type);
  const isFileUpload = isFileUploadBuilderComponent(comp);
  const supportsMultipleValues = isManagedListBuilderComponent(comp);
  const supportsInlineLayoutToggle = ["radio", "selectboxes"].includes(comp?.type);
  const supportsOptionFlags = comp?.type === "radio";
  const modalEditType = !comp
    ? null
    : (comp.customType === "disclaimer" || comp.type === "content")
      ? "disclaimer"
      : (comp.customType || comp.type);
  const supportsHideLabelToggle = modalEditType !== "disclaimer";
  const supportsRequiredToggle = !["disclaimer", "quiz"].includes(modalEditType);
  const supportsActionsToggle = modalEditType !== "quiz";
  const supportsModalEdit = comp && new Set([
    "componentGroup",
    "choiceList",
    "disclaimer",
    "editgrid",
    "radio",
    "select",
    "selectboxes",
    "survey"
  ]).has(modalEditType);

  const supportsQuizSetup = comp && (
    isQuizFieldset(comp)
    || (comp.type === "datagrid" && comp.key.startsWith("answerKey"))
  );

  const akBtn = supportsQuizSetup ?
      `<button class="component-action-btn" data-action="akey"
               data-tooltip="${isQuizFieldset(comp) ? "Quiz Setup" : "Edit Answer Key"}">
         <i class="fa-solid fa-table-list"></i>
       </button>` : '';

  // Calculator (only on Number / Currency)
  const calcBtn = isNumeric
      ? `<button class="component-action-btn" data-action="calc" data-tooltip="Calculator">
           <i class="fa-solid fa-calculator"></i>
         </button>`
      : '';

  /* toggle states for Required / Hide Label / Actions  */
  const inlineOn = supportsInlineLayoutToggle && !!comp?.inline ? ' on' : '';
  const reqOn  = comp?.validate?.required ? ' on' : '';
  const hideOn = comp?.hideLabel          ? ' on' : '';
  const actOn  = comp?._actionsDriverKey  ? ' on' : '';
  const flagOn = supportsOptionFlags && hasEnabledOptionFlags(comp) ? ' on' : '';

  /* ── LEFT cluster ────────────────────────────────────────────────── */
  const left = `
    <button class="component-action-btn" data-action="conditional" data-tooltip="Conditional">
      <i class="fa-solid fa-code-branch"></i>
    </button>
    ${ showColumn && !isManagedQuizSection ? `
      <button class="component-action-btn" data-action="wrap2" data-tooltip="Columns">
        <i class="fa-solid fa-table-columns"></i>
      </button>` : '' }
    ${ supportsModalEdit ? `
    <button class="component-action-btn" data-action="edit" data-tooltip="Edit">
      <i class="fa-solid fa-pen"></i>
    </button>` : "" }
    ${ akBtn }
  `;

  /* ── RIGHT cluster (slide-out) ───────────────────────────────────── */
  const dtBtns = isDateTimeBuilderComponent(comp) ? `
      <button class="component-action-btn dt-btn${(comp.__mode||'datetime')==='datetime'?' on':''}"
              data-action="dtmode" data-mode="datetime" data-tooltip="Date & Time">
        <i class="fa-regular fa-calendar-check"></i>
      </button>
      <button class="component-action-btn dt-btn${(comp.__mode||'datetime')==='date'?' on':''}"
              data-action="dtmode" data-mode="date" data-tooltip="Date">
        <i class="fa-regular fa-calendar"></i>
      </button>
      <button class="component-action-btn dt-btn${(comp.__mode||'datetime')==='time'?' on':''}"
              data-action="dtmode" data-mode="time" data-tooltip="Time">
        <i class="fa-regular fa-clock"></i>
      </button>` : '';

  const numBtns = isNumeric ? `
      <button class="component-action-btn num-btn${comp.type==='number'?' on':''}"
              data-action="nummode" data-mode="number" data-tooltip="Plain Number">
        <i class="fa-solid fa-hashtag"></i>
      </button>
      <button class="component-action-btn num-btn${comp.type==='currency'?' on':''}"
              data-action="nummode" data-mode="currency" data-tooltip="Currency">
        <i class="fa-solid fa-dollar-sign"></i>
      </button>` : '';

  const fileBtns = isFileUpload ? `
      <button class="component-action-btn file-btn${getFileUploadComponentMode(comp)==='photo'?' on':''}"
              data-action="filemode" data-mode="photo" data-tooltip="Photo">
        <i class="fa-solid fa-camera"></i>
      </button>
      <button class="component-action-btn file-btn${getFileUploadComponentMode(comp)==='documents'?' on':''}"
              data-action="filemode" data-mode="documents" data-tooltip="Document">
        <i class="fa-regular fa-file-lines"></i>
      </button>` : '';

  const multipleValuesBtn = supportsMultipleValues ? `
      <button class="component-action-btn toggle-btn${comp.multiple ? ' on' : ''}"
              data-tog="multiple" data-tooltip="Multiple Values">
        <i class="fa-solid fa-list-ul"></i>
      </button>` : '';

  const right = `
    <div class="right-actions">
      <!-- anchor that’s always visible -->
      <button class="component-action-btn anchor-btn" data-tooltip="More">
        <i class="fa-solid fa-ellipsis-h"></i>
      </button>

      <!-- slide-out -->
      <div class="extra-actions">
        ${ !isManagedQuizSection ? `
        <button class="component-action-btn" data-action="delete" data-tooltip="Delete">
          <i class="fa-solid fa-trash"></i>
        </button>
        ` : '' }
        ${dtBtns}
        ${numBtns}
        ${fileBtns}
        ${multipleValuesBtn}
        ${calcBtn}
        ${ comp?.type === 'textarea' ? `
          <button class="component-action-btn rows-btn${comp.rows===3?' on':''}"
                  data-action="rows3" data-tooltip="Detailed Input" aria-label="Toggle Detailed Input">
            <i class="fa-solid fa-bars" aria-hidden="true"></i>
            <span class="visually-hidden">Detailed Input</span>
          </button>` : '' }
        ${ supportsInlineLayoutToggle ? `
          <button class="component-action-btn toggle-btn${inlineOn}"
                  data-tog="inline" data-tooltip="Inline Layout">
            <i class="fa-solid fa-arrows-left-right"></i>
          </button>` : '' }
        ${ supportsOptionFlags ? `
          <button class="component-action-btn toggle-btn${flagOn}"
                  data-tog="flags" data-tooltip="Radio Flags">
            <i class="fa-solid fa-flag"></i>
          </button>` : '' }

        ${ supportsRequiredToggle ? `
        <button class="component-action-btn toggle-btn${reqOn}"
                data-tog="required" data-tooltip="Required">
          <i class="fa-solid fa-asterisk"></i>
        </button>` : '' }
        ${ supportsHideLabelToggle ? `
        <button class="component-action-btn toggle-btn${hideOn}"
                data-tog="hideLabel" data-tooltip="Hide Label">
          <i class="fa-solid fa-eye-slash"></i>
        </button>` : '' }
        ${ supportsActionsToggle ? `
        <button class="component-action-btn toggle-btn${actOn}"
                data-tog="actions" data-tooltip="Actions">
          <i class="fa-solid fa-comment-dots"></i>
        </button>` : '' }
      </div><!-- /.extra-actions -->
    </div><!-- /.right-actions -->
  `;

  /* ── final markup ───────────────────────────────────────────────── */
  return `${left}<span class="flex-spacer"></span>${right}`;
}







function isCalculationRepeatContainer(component) {
  return component?.type === "editgrid" || component?.type === "datagrid";
}

function findNearestCalculationRepeatContainer(ancestors = []) {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    if (isCalculationRepeatContainer(ancestors[index])) {
      return ancestors[index];
    }
  }

  return null;
}

function visitCalculationComponents(components, visitor, ancestors = []) {
  (components || []).forEach(component => {
    if (!component) return;

    visitor(component, ancestors);

    const nextAncestors = ancestors.concat(component);

    if (component.type === "columns" && Array.isArray(component.columns)) {
      component.columns.forEach(column => {
        visitCalculationComponents(column?.components || [], visitor, nextAncestors);
      });
      return;
    }

    if (Array.isArray(component.components) && component.components.length) {
      visitCalculationComponents(component.components, visitor, nextAncestors);
    }
  });
}

function findCalculationComponentContext(targetComponent, components = formJSON.components, ancestors = []) {
  for (const component of components || []) {
    if (!component) continue;

    if (component === targetComponent) {
      return {
        component,
        ancestors: ancestors.slice(),
        repeatContainer: findNearestCalculationRepeatContainer(ancestors)
      };
    }

    const nextAncestors = ancestors.concat(component);

    if (component.type === "columns" && Array.isArray(component.columns)) {
      for (const column of component.columns) {
        const found = findCalculationComponentContext(targetComponent, column?.components || [], nextAncestors);
        if (found) return found;
      }
    }

    if (Array.isArray(component.components) && component.components.length) {
      const found = findCalculationComponentContext(targetComponent, component.components, nextAncestors);
      if (found) return found;
    }
  }

  return null;
}

function buildCalculationFormFieldExpression(fieldKey) {
  return `+String(typeof data.${fieldKey}==='undefined'?0:data.${fieldKey}).replace(/[^0-9.]/g,'')`;
}

function buildCalculationRowFieldExpression(fieldKey) {
  return `+String(row.${fieldKey}||0).replace(/[^0-9.]/g,'')`;
}

function buildCalculationRepeatFieldExpression(containerKey, fieldKey) {
  return `(${containerKey}Arr => (${containerKey}Arr||[]).reduce((t,r)=>t + (+String(r.${fieldKey}||0).replace(/[^0-9.]/g,'')),0))(data.${containerKey})`;
}

function normalizeCalculationChoice(choice = {}) {
  const displayExpressions = Array.from(
    new Set(
      (Array.isArray(choice.displayExpressions) ? choice.displayExpressions : [choice.expression])
        .filter(Boolean)
        .map(expression => String(expression))
    )
  );

  return {
    ...choice,
    displayExpressions
  };
}

function buildCalculationChoiceContext(targetComponent = null) {
  const targetContext = targetComponent
    ? findCalculationComponentContext(targetComponent)
    : null;
  const targetRepeatContainer = targetContext?.repeatContainer || null;
  const choices = [];
  const allChoices = [];

  function addChoice(choice, { visible = true } = {}) {
    const normalized = normalizeCalculationChoice(choice);
    if (!normalized.key || !normalized.expression) return;
    allChoices.push(normalized);
    if (visible) choices.push(normalized);
  }

  visitCalculationComponents(formJSON.components, (component, ancestors) => {
    if (!component || component.builderHidden || component === targetComponent) return;
    if (!["number", "currency"].includes(component.type) || !component.key) return;

    const label = String(component.label || component.key || "[No Label]");
    const kind = component.type === "currency" ? "Currency" : "Number";
    const repeatContainer = findNearestCalculationRepeatContainer(ancestors);

    if (repeatContainer) {
      const repeatName = String(
        repeatContainer.label
        || repeatContainer.key
        || getBuilderComponentNiceLabel(repeatContainer.type)
        || "Grid"
      );
      const aggregateChoice = {
        key: `${repeatContainer.key}.${component.key}`,
        label: `${label} (${repeatName})`,
        friendlyLabel: `${label} from ${repeatName}`,
        kind,
        scopeLabel: repeatName,
        searchLabel: `${label} ${repeatName} ${repeatContainer.key} ${repeatContainer.type} total rows`,
        expression: buildCalculationRepeatFieldExpression(repeatContainer.key, component.key)
      };

      if (targetRepeatContainer && targetRepeatContainer === repeatContainer) {
        addChoice({
          key: component.key,
          label,
          friendlyLabel: label,
          kind,
          scopeLabel: "Current row",
          searchLabel: `${label} ${repeatName} ${repeatContainer.key} ${repeatContainer.type} current row`,
          expression: buildCalculationRowFieldExpression(component.key)
        });
        addChoice(aggregateChoice, { visible: false });
        return;
      }

      addChoice(aggregateChoice);
      return;
    }

    addChoice({
      key: component.key,
      label,
      friendlyLabel: label,
      kind,
      scopeLabel: "Form field",
      searchLabel: `${label} ${component.key} form field`,
      expression: buildCalculationFormFieldExpression(component.key)
    });
  });

  return {
    choices,
    allChoices,
    fieldMap: new Map(allChoices.map(choice => [String(choice.key || ""), choice])),
    expressionEntries: allChoices
      .flatMap(choice => choice.displayExpressions.map(expression => ({
        expression,
        key: choice.key
      })))
      .sort((left, right) => right.expression.length - left.expression.length)
  };
}

function stripCalculationAssignment(rawValue) {
  return String(rawValue || "").replace(/^\s*value\s*=\s*/i, "");
}

function toDisplayCalculationExpression(rawValue, calcContext) {
  let display = stripCalculationAssignment(rawValue).trim();
  if (!display) return "";

  (calcContext?.expressionEntries || []).forEach(entry => {
    display = display.replaceAll(entry.expression, `{{${entry.key}}}`);
  });

  return display
    .replace(/\brow\.([A-Za-z0-9_.]+)/g, "{{$1}}")
    .replace(/\bdata\.([A-Za-z0-9_.]+)/g, "{{$1}}")
    .trim();
}

function getBuilderRootDisplayEntries(components = []) {
  return (components || []).reduce((entries, comp, index) => {
    if (!comp || comp.builderHidden) return entries;

    const rootPath = String(index);
    if (selectedFieldsetKey === "root" && isQuizFieldset(comp)) {
      const visibleSections = getVisibleQuizBuilderSections(comp);
      if (visibleSections.length) {
        visibleSections.forEach((section) => {
          const childIndex = (comp.components || []).indexOf(section);
          if (childIndex !== -1 && !section.builderHidden) {
            entries.push({
              component: section,
              path: `${rootPath}.${childIndex}`,
              isVirtualRootQuizSection: true,
              anchorKey: null
            });
          }
        });
        return entries;
      }
    }

    entries.push({
      component: comp,
      path: rootPath,
      isVirtualRootQuizSection: false,
      anchorKey: comp.key || null
    });
    return entries;
  }, []);
}

/* --------------------------------------------------------------
   Build the clickable answer-key panel that lives *inside* each
   Quiz fieldset (keys that start with “quiz”)
----------------------------------------------------------------*/
function renderComponentCards() {
  const listEl = document.getElementById("componentList");
  if (!listEl) return;

  /* which component array are we showing? */
  let comps = getActiveBuilderDestination();
  const allComponents = getAllComponents(formJSON.components);
  const componentByKey = new Map(
    allComponents
      .filter(comp => comp && comp.key)
      .map(comp => [String(comp.key), comp])
  );
  const calcContextCache = new WeakMap();

  function getCalcContext(targetComponent = null) {
    if (!targetComponent) return buildCalculationChoiceContext(null);
    if (!calcContextCache.has(targetComponent)) {
      calcContextCache.set(targetComponent, buildCalculationChoiceContext(targetComponent));
    }
    return calcContextCache.get(targetComponent);
  }

  function escapeHtml(value = "") {
    return _.escape(String(value ?? ""));
  }

  function formatTooltipValue(value, muted = false) {
    const classes = [
      "conditional-hover-tooltip__value",
      muted ? "conditional-hover-tooltip__value--muted" : ""
    ]
      .filter(Boolean)
      .join(" ");

    return `<span class="${classes}">${escapeHtml(value)}</span>`;
  }

  function joinHumanList(items) {
    const list = items
      .map(item => String(item || "").trim())
      .filter(Boolean);

    if (!list.length) return "";
    if (list.length === 1) return list[0];
    if (list.length === 2) return `${list[0]} and ${list[1]}`;
    return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
  }

  function getFriendlyFieldLabel(key, calcContext) {
    const fieldKey = String(key || "").trim();
    if (!fieldKey) return "this field";

    const calcChoice = calcContext?.fieldMap?.get(fieldKey);
    if (calcChoice?.friendlyLabel) return calcChoice.friendlyLabel;
    if (calcChoice?.label) return calcChoice.label;

    const component = componentByKey.get(fieldKey);
    if (component?.label) return String(component.label);

    const fallbackKey = fieldKey.split(".").pop() || fieldKey;
    return _.startCase(fallbackKey.replace(/[_-]+/g, " "));
  }

  function toDisplayCalcExpression(expression, targetComponent = null) {
    return toDisplayCalculationExpression(expression, getCalcContext(targetComponent));
  }

  function calcOperandToText(operand, calcContext) {
    const tokenMatch = String(operand || "").trim().match(/^\{\{\s*([A-Za-z0-9_.]+)\s*\}\}$/);
    if (tokenMatch) return getFriendlyFieldLabel(tokenMatch[1], calcContext);
    return String(operand || "").trim();
  }

  function collectCalcOperandTexts(expression, calcContext) {
    const matches = String(expression || "").match(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g) || [];
    return Array.from(new Set(matches.map(token => calcOperandToText(token, calcContext))));
  }

  function getConditionalValueLabel(component, value) {
    if (value === null || value === undefined || value === "") return "";

    const options = [];
    if (Array.isArray(component?.data?.values)) options.push(...component.data.values);
    if (Array.isArray(component?.values)) options.push(...component.values);

    const matched = options.find(option => String(option?.value ?? "") === String(value));
    if (matched?.label) return String(matched.label);

    return String(value);
  }

  function summarizeCalculation(expression, targetComponent = null) {
    const calcContext = getCalcContext(targetComponent);
    const display = toDisplayCalcExpression(expression, targetComponent);
    if (!display) return { text: "No calculation set.", muted: true };

    const singleTokenMatch = display.match(/^\{\{\s*([A-Za-z0-9_.]+)\s*\}\}$/);
    if (singleTokenMatch) {
      return { text: `Copies ${getFriendlyFieldLabel(singleTokenMatch[1], calcContext)}.`, muted: false };
    }

    const singleNumberMatch = display.match(/^-?\d+(?:\.\d+)?$/);
    if (singleNumberMatch) {
      return { text: `Always sets this value to ${singleNumberMatch[0]}.`, muted: false };
    }

    const averageMatch = display.match(/^\(?\s*((?:\{\{\s*[A-Za-z0-9_.]+\s*\}\}|-?\d+(?:\.\d+)?)(?:\s*\+\s*(?:\{\{\s*[A-Za-z0-9_.]+\s*\}\}|-?\d+(?:\.\d+)?))+)\s*\)?\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (averageMatch) {
      const operands = averageMatch[1].split(/\s*\+\s*/).map(operand => calcOperandToText(operand, calcContext));
      const divisor = Number(averageMatch[2]);
      if (operands.length > 1 && Number.isFinite(divisor) && divisor === operands.length) {
        return { text: `Averages ${joinHumanList(operands)}.`, muted: false };
      }
    }

    const sumMatch = display.match(/^((?:\{\{\s*[A-Za-z0-9_.]+\s*\}\}|-?\d+(?:\.\d+)?)(?:\s*\+\s*(?:\{\{\s*[A-Za-z0-9_.]+\s*\}\}|-?\d+(?:\.\d+)?))+)$/
    );
    if (sumMatch) {
      const operands = sumMatch[1].split(/\s*\+\s*/).map(operand => calcOperandToText(operand, calcContext));
      const verb = operands.length > 2 ? "Totals" : "Adds";
      return { text: `${verb} ${joinHumanList(operands)}.`, muted: false };
    }

    const binaryMatch = display.match(/^(\{\{\s*[A-Za-z0-9_.]+\s*\}\}|-?\d+(?:\.\d+)?)\s*([\-*/%])\s*(\{\{\s*[A-Za-z0-9_.]+\s*\}\}|-?\d+(?:\.\d+)?)$/);
    if (binaryMatch) {
      const left = calcOperandToText(binaryMatch[1], calcContext);
      const operator = binaryMatch[2];
      const right = calcOperandToText(binaryMatch[3], calcContext);

      if (operator === "-") {
        return { text: `Subtracts ${right} from ${left}.`, muted: false };
      }
      if (operator === "*") {
        return { text: `Multiplies ${left} by ${right}.`, muted: false };
      }
      if (operator === "/") {
        return { text: `Divides ${left} by ${right}.`, muted: false };
      }
      if (operator === "%") {
        return { text: `Uses the remainder from ${left} divided by ${right}.`, muted: false };
      }
    }

    const operands = collectCalcOperandTexts(display, calcContext);
    if (operands.length) {
      return { text: `Uses a custom formula with ${joinHumanList(operands)}.`, muted: false };
    }

    return { text: "Uses a custom formula.", muted: false };
  }

  function summarizeConditional(comp) {
    if (!comp?.conditional) return { text: "", muted: true };

    const whenKey = String(comp.conditional.when || "");
    const triggerComp = componentByKey.get(whenKey);
    const triggerLabel = getFriendlyFieldLabel(whenKey) || "another field";
    const action = comp.conditional.show === false ? "Hide" : "Show";
    const eqValue = comp.conditional.eq;

    if (eqValue === null || eqValue === undefined || eqValue === "") {
      return { text: `${action} this field when ${triggerLabel} has a value.`, muted: false };
    }

    return {
      text: `${action} this field when ${triggerLabel} is ${getConditionalValueLabel(triggerComp, eqValue)}.`,
      muted: false
    };
  }

  function buildConditionalSection(comp) {
    if (!comp?.conditional) return "";

    const summary = summarizeConditional(comp);

    return `
      <div class="conditional-hover-tooltip__section">
        <div class="conditional-hover-tooltip__header">
          <span class="conditional-hover-tooltip__icon">
            <i class="fa-solid fa-code-branch"></i>
          </span>
          <span class="conditional-hover-tooltip__heading">
            <span class="conditional-hover-tooltip__eyebrow">Visibility</span>
            <span class="conditional-hover-tooltip__title">Conditional Logic</span>
          </span>
        </div>
        <div class="conditional-hover-tooltip__rows">
          <div class="conditional-hover-tooltip__row">
            <span class="conditional-hover-tooltip__label">Rule</span>
            ${formatTooltipValue(summary.text, summary.muted)}
          </div>
        </div>
      </div>`;
  }

  function buildCalculationSection(comp) {
    if (!comp?.calculateValue) return "";
    const summary = summarizeCalculation(comp.calculateValue, comp);

    return `
      <div class="conditional-hover-tooltip__section">
        <div class="conditional-hover-tooltip__header">
          <span class="conditional-hover-tooltip__icon">
            <i class="fa-solid fa-calculator"></i>
          </span>
          <span class="conditional-hover-tooltip__heading">
            <span class="conditional-hover-tooltip__eyebrow">Calculation</span>
            <span class="conditional-hover-tooltip__title">Calculated Value</span>
          </span>
        </div>
        <div class="conditional-hover-tooltip__rows">
          <div class="conditional-hover-tooltip__row">
            <span class="conditional-hover-tooltip__label">Summary</span>
            ${formatTooltipValue(summary.text, summary.muted)}
          </div>
        </div>
      </div>`;
  }

  function buildStateTooltip(comp) {
    const sections = [buildConditionalSection(comp), buildCalculationSection(comp)].filter(Boolean);
    if (!sections.length) return "";
    const tooltipClasses = comp.calculateValue
      ? "conditional-hover-tooltip conditional-hover-tooltip--calc"
      : "conditional-hover-tooltip";
    return `<div class="${tooltipClasses}">${sections.join("")}</div>`;
  }

  function getStateCardClasses(comp) {
    const classes = [];
    if (comp?.conditional) classes.push("conditional-card");
    if (comp?.calculateValue) classes.push("calculated-card");
    return classes.join(" ");
  }


  let html = "";
  const displayEntries = getBuilderRootDisplayEntries(comps);
  const visibleComps = displayEntries.filter(entry => isVisibleBuilderComponent(entry.component));
  const disableRootListDrag = selectedFieldsetKey === "root"
    && displayEntries.some(entry => entry.isVirtualRootQuizSection);

  if (!visibleComps.length) {
    listEl.innerHTML = `
      <div class="component-empty-dropzone" aria-hidden="true"></div>
    `;
    return;
  }

  displayEntries.forEach((entry, rootIdx) => {
    const comp = entry.component;
    const path = entry.path;
    const anchorKey = entry.anchorKey || comp.key || null;
    const virtualRootQuizSectionClass = entry.isVirtualRootQuizSection
      ? " component-card--virtual-root"
      : "";
    const rootStaticClass = disableRootListDrag ? " component-card--root-static" : "";
    if (comp.builderHidden) return;


    const showCalc = ['number', 'currency'].includes(comp.type);
    const stateCardClasses = getStateCardClasses(comp);
    const stateTooltip = buildStateTooltip(comp);

    /* 1 ▸ normal cards (skip Columns wrapper itself) */
    if (comp.type !== 'columns') {
      const safePath = escapeHtml(path);
      const safeKey = escapeHtml(comp.key || '');
      const safeLabel = escapeHtml(comp.label || '[No Label]');
      const safeTypeIcon = escapeHtml(getBuilderComponentListCardIconClass(comp));
      const safeTypeLabel = escapeHtml(getBuilderComponentListCardTypeLabel(comp));
      const safeAnchorKey = escapeHtml(anchorKey || "");
      const safeAnchorLabel = escapeHtml(comp.label || getBuilderComponentCardTypeLabel(comp) || "[No Label]");
      const anchorAttrs = anchorKey
        ? ` data-anchor-key="${safeAnchorKey}" data-anchor-label="${safeAnchorLabel}"`
        : "";
      html += `
        <div class="component-card ${stateCardClasses}${virtualRootQuizSectionClass}${rootStaticClass}"
             data-path="${safePath}"
             data-key="${safeKey}"${anchorAttrs}>
          ${stateTooltip}
          <div class="component-details">
            <span class="comp-label" data-path="${safePath}">
              ${safeLabel}
            </span>
                  <small class="component-card__meta">
                    <i class="component-card__type-icon fa-solid ${safeTypeIcon}" aria-hidden="true"></i>
                    <span class="component-card__type-text">${safeTypeLabel}</span>
                  </small>
                </div>

          <div class="component-actions">
            ${actionButtonsHTML(true, comp)}
          </div>
        </div>`;
    }

    /* 2 ▸ children inside a Columns wrapper */
    if (comp.type === "columns") {
      const renderColumns = Array.from({ length: MAX_COLUMNS_PER_ROW }, (_, colIdx) =>
        createColumnSlot(comp.columns?.[colIdx])
      );
      const safeAnchorKey = escapeHtml(anchorKey || "");
      const safeAnchorLabel = escapeHtml(comp.label || getBuilderComponentCardTypeLabel(comp) || "Columns Row");
      const rowAnchorAttrs = anchorKey
        ? ` data-anchor-key="${safeAnchorKey}" data-anchor-label="${safeAnchorLabel}"`
        : "";

      html += `<div class="columns-row"
                     data-owner-key="${comp.key}"
                     data-owner-idx="${rootIdx}"${rowAnchorAttrs}>`;

      renderColumns.forEach((col, colIdx) => {
        if (col.components.length) {
          const child = col.components[0];
          if (!child.builderHidden) {
            const safeChildOwner = escapeHtml(comp.key || '');
            const safeChildKey = escapeHtml(child.key || '');
            const safeChildPath = escapeHtml(`${path}.${colIdx}`);
            const safeChildLabel = escapeHtml(child.label || '[No Label]');
            const safeChildTypeIcon = escapeHtml(getBuilderComponentListCardIconClass(child));
            const safeChildTypeLabel = escapeHtml(getBuilderComponentListCardTypeLabel(child));
            const childStateClasses = getStateCardClasses(child);
            const childStateTooltip = buildStateTooltip(child);
            const columnDropAnimationClass = pendingColumnDropAnimationKeys.has(child.key)
              ? " column-drop-enter"
              : "";
            html += `
              <div class="component-card nested ${childStateClasses}${columnDropAnimationClass}${rootStaticClass}"
                   data-owner="${rootIdx}"
                   data-owner-key="${safeChildOwner}"
                   data-col="${colIdx}"
                   data-key="${safeChildKey}"
                   data-path="${safeChildPath}">
                ${childStateTooltip}
                <div class="component-details">
                  <span class="comp-label" data-path="${safeChildPath}">
                    ${safeChildLabel}
                  </span>
                  <small class="component-card__meta">
                    <i class="component-card__type-icon fa-solid ${safeChildTypeIcon}" aria-hidden="true"></i>
                    <span class="component-card__type-text">${safeChildTypeLabel}</span>
                  </small>
                </div>
                <div class="component-actions">${actionButtonsHTML(false, child)}</div>
              </div>`;
          }
        } else {
          html += `
            <div class="component-card placeholder"
                 data-placeholder="true"
                 data-col-owner="${comp.key}"
                 data-col-index="${colIdx}"
                 data-owner-key="${comp.key}"
                 data-col="${colIdx}">
              Drop&nbsp;here
            </div>`;
        }
      });

      html += `</div>`;      /* close .columns-row */
    }
  });

  listEl.innerHTML = html;
}



/**
 * Update the visible component list in the DOM.
 */
function updateComponentList() {
  // renderComponentCards() now handles putting HTML in the DOM
  renderComponentCards();
  attachInnerSortables();
  flushPendingColumnDropAnimations();
  syncBuilderInsertionAnchorState();
  [...openMenuKeys].forEach(key => {
    const box = document.querySelector(
      `.component-card[data-key="${key}"] .right-actions`
    );
    if (box) box.classList.add('open');
    else     openMenuKeys.delete(key);   // card was removed
  });
  [...hoverMenuKeys].forEach(key => {
    const box = document.querySelector(
      `.component-card[data-key="${key}"] .right-actions`
    );
    if (box) box.classList.add("hover-open");
  });
  hoverMenuKeys.clear();
}

/**
 * Update the list of Fieldset "cards" so the user can select root or any sub-fieldset/editgrid.
 */
function updateFieldsetCards() {
  const fieldsetListEl = document.getElementById("fieldsetList");
  if (!fieldsetListEl) return;
  syncSelectedFieldsetKey();
  const allFieldsets = gatherFieldsets(formJSON.components);

  let html = renderBuilderSectionCard({
    key: "root",
    label: "Root (Grouping)",
    selected: selectedFieldsetKey === "root",
    index: 0
  });
  allFieldsets.forEach((fs, index) => {
    html += renderBuilderSectionCard({
      key: fs.key,
      label: fs.label || "[No Label]",
      selected: fs.key === selectedFieldsetKey,
      index: index + 1
    });
  });
  fieldsetListEl.innerHTML = html;
  updateBuilderSectionActions();
  requestAnimationFrame(() => {
    syncBuilderSectionRailState({ ensureSelectedVisible: true, behavior: "auto" });
  });
}

function tweakDateTimeMode(comp, mode) {
  const isDate = mode === "date";
  const isTime = mode === "time";

  comp.enableTime = !isDate;
  comp.noCalendar =  isTime;
  comp.format     =  isTime ? "hh:mm a"
                  :  isDate ? "yyyy-MM-dd"
                  :  "yyyy-MM-dd hh:mm a";

  if (comp.widget) {
    comp.widget.enableTime = !isDate;
    comp.widget.noCalendar =  isTime;
    comp.widget.format     =  comp.format;
  }
}

function setDateTimeComponentMode(comp, mode, options = {}) {
  if (!isDateTimeBuilderComponent(comp)) return;

  const nextMode = ["date", "time", "datetime"].includes(mode) ? mode : "datetime";
  comp.__mode = nextMode;
  tweakDateTimeMode(comp, nextMode);

  if (Object.prototype.hasOwnProperty.call(options, "manual")) {
    comp.__dateTimeModeManual = !!options.manual;
  }
}

function isDateTimeBuilderComponent(comp) {
  return !!comp && (
    comp.customType === "datetime" ||
    comp.type === "datetime" ||
    comp.type === "date" ||
    comp.type === "time"
  );
}

function isFileUploadBuilderComponent(comp) {
  return !!comp && ["file", "documents"].includes(comp.type);
}

function isManagedListBuilderComponent(comp) {
  return !!comp && ["account", "asset"].includes(comp.type);
}

function getFileUploadComponentMode(comp) {
  if (!isFileUploadBuilderComponent(comp)) return "";
  return comp.type === "documents" ? "documents" : "photo";
}

function setFileUploadComponentMode(comp, mode) {
  if (!comp || !["photo", "documents"].includes(mode)) return;

  comp.input = true;
  comp.tableView = false;
  comp.labelWidth = 30;
  comp.labelMargin = 3;

  if (mode === "documents") {
    comp.type = "documents";
    delete comp.storage;
    delete comp.fileTypes;
    delete comp.defaultValue;
    delete comp.multiple;
    delete comp.image;
    delete comp.imageSize;
    delete comp.webcam;
    return;
  }

  comp.type = "file";
  comp.storage = "base64";
  comp.fileTypes = [{ label: "", value: "image/*" }];
  comp.defaultValue = Array.isArray(comp.defaultValue) ? comp.defaultValue : [];
  comp.multiple = true;
  comp.image = true;
  comp.imageSize = "400";
  comp.webcam = false;
}

function setManagedListComponentMultiple(comp, enabled) {
  if (!isManagedListBuilderComponent(comp)) return;

  comp.multiple = !!enabled;

  if (comp.multiple) {
    if (Array.isArray(comp.defaultValue)) return;
    comp.defaultValue = comp.defaultValue == null || comp.defaultValue === ""
      ? []
      : [comp.defaultValue];
    return;
  }

  if (Array.isArray(comp.defaultValue)) {
    comp.defaultValue = comp.defaultValue[0] ?? "";
  }
}

function applyCurrencySettings(comp) {
  comp.currency = "USD";
  comp.delimiter = true;
  comp.decimal = ".";
  comp.thousands = ",";
}

function setNumericComponentStyle(comp, style, options = {}) {
  if (!comp || !["number", "currency"].includes(comp.type) || !["number", "currency"].includes(style)) {
    return;
  }

  comp.type = style;

  if (style === "currency") {
    applyCurrencySettings(comp);
  } else {
    delete comp.currency;
    delete comp.delimiter;
    delete comp.decimal;
    delete comp.thousands;
  }

  if (Object.prototype.hasOwnProperty.call(options, "manual")) {
    comp.__numericStyleManual = !!options.manual;
  }
}

function syncLabelDrivenComponentBehavior(comp, label) {
  if (!comp) return;

  if (isDateTimeBuilderComponent(comp) &&
      !comp.__dateTimeModeManual &&
      typeof window.inferDateTimeModeFromLabel === "function") {
    setDateTimeComponentMode(
      comp,
      window.inferDateTimeModeFromLabel(label, comp.__mode || "datetime"),
      { manual: false }
    );
  }

  if (["number", "currency"].includes(comp.type) &&
      !comp.__numericStyleManual &&
      typeof window.inferNumberStyleFromLabel === "function") {
    setNumericComponentStyle(
      comp,
      window.inferNumberStyleFromLabel(label, comp.type),
      { manual: false }
    );
  }
}

/**
 * Update the "Form JSON Preview" <pre> element and also update the component list & fieldset cards.
 */
function updatePreview(options = {}) {
  const {
    refreshComponentList = true,
    refreshFieldsetCards = true,
    recalculateVerticalOffset = false
  } = options;

  repairQuizComponents(formJSON.components);
  syncSelectedFieldsetKey();
  if (typeof window.ensureAutoOtherSpecifyFields === "function") {
    window.ensureAutoOtherSpecifyFields(formJSON.components);
  }
  normalizeColumnsInArray(formJSON.components);
  syncPendingColumnInsertTarget();

  const preEl = document.getElementById("formPreview");
  if (preEl) {
    const clean = cloneBuilderPublicJSON(formJSON);
    preEl.textContent = JSON.stringify(clean, null, 2);
  }
  rememberBuilderUndoState();
  if (refreshComponentList) {
    updateComponentList();
  } else {
    applyBuilderInsertionAnchorHighlight();
  }
  (function walk(arr){
    arr.forEach(c=>{
      if (Array.isArray(c.components)) walk(c.components);
    });
  })(formJSON.components);
  if (refreshFieldsetCards) {
    updateFieldsetCards();
  }
  updateBuilderEntryAvailability();
  syncBuilderListScrollHeight();
  if (recalculateVerticalOffset) {
    applyInitialBuilderVerticalOffset();
  }
}

function syncComponentCardFlyoutState(card, comp) {
  if (!card || !comp) return;

  const dtMode = comp.__mode || "datetime";
  card.querySelectorAll(".dt-btn").forEach((button) => {
    button.classList.toggle("on", button.dataset.mode === dtMode);
  });

  card.querySelectorAll(".num-btn").forEach((button) => {
    button.classList.toggle("on", button.dataset.mode === comp.type);
  });

  card.querySelectorAll(".file-btn").forEach((button) => {
    button.classList.toggle("on", button.dataset.mode === getFileUploadComponentMode(comp));
  });

  const rowsBtn = card.querySelector(".rows-btn");
  if (rowsBtn) {
    rowsBtn.classList.toggle("on", comp.rows === 3);
  }

  const multipleBtn = card.querySelector('.toggle-btn[data-tog="multiple"]');
  if (multipleBtn) {
    multipleBtn.classList.toggle("on", !!comp.multiple);
  }

  const inlineBtn = card.querySelector('.toggle-btn[data-tog="inline"]');
  if (inlineBtn) {
    inlineBtn.classList.toggle("on", !!comp.inline);
  }

  const requiredBtn = card.querySelector('.toggle-btn[data-tog="required"]');
  if (requiredBtn) {
    requiredBtn.classList.toggle("on", !!comp.validate?.required);
  }

  const hideLabelBtn = card.querySelector('.toggle-btn[data-tog="hideLabel"]');
  if (hideLabelBtn) {
    hideLabelBtn.classList.toggle("on", !!comp.hideLabel);
  }

  const actionsBtn = card.querySelector('.toggle-btn[data-tog="actions"]');
  if (actionsBtn) {
    actionsBtn.classList.toggle("on", !!comp._actionsDriverKey);
  }

  const flagsBtn = card.querySelector('.toggle-btn[data-tog="flags"]');
  if (flagsBtn) {
    flagsBtn.classList.toggle("on", hasEnabledOptionFlags(comp));
  }

  const typeIcon = card.querySelector(".component-card__type-icon");
  if (typeIcon) {
    typeIcon.className = `component-card__type-icon fa-solid ${getBuilderComponentListCardIconClass(comp)}`;
  }

  const typeText = card.querySelector(".component-card__type-text");
  if (typeText) {
    typeText.textContent = getBuilderComponentListCardTypeLabel(comp);
  }
}




/* helper ─ find a component by key anywhere in the tree */
function findCompByKey(arr, key) {
  for (const c of arr) {
    if (c.key === key) return c;
    if (c.type === "columns" && Array.isArray(c.columns)) {
      for (const col of c.columns) {
        const deepInColumn = findCompByKey(col.components || [], key);
        if (deepInColumn) return deepInColumn;
      }
    }
    if (Array.isArray(c.components)) {
      const deep = findCompByKey(c.components, key);
      if (deep) return deep;
    }
  }
  return null;
}

function findComponentParentArrayByKey(arr, key) {
  if (!Array.isArray(arr) || !key) return null;

  for (const component of arr) {
    if (component?.key === key) {
      return arr;
    }

    if (component?.type === "columns" && Array.isArray(component.columns)) {
      for (const column of component.columns) {
        const found = findComponentParentArrayByKey(column?.components || [], key);
        if (found) return found;
      }
    }

    if (Array.isArray(component?.components)) {
      const found = findComponentParentArrayByKey(component.components, key);
      if (found) return found;
    }
  }

  return null;
}



/*─────────────────────────────────────────────────────────────
  Move a component – or a whole *column* – into another
  grouping (“Root”, any <fieldset>, or an <editgrid>).

  pathIndex · string | number  e.g. "2"  "5"  "3.1"
  targetKey · "root" | fieldset.key | editgrid.key
─────────────────────────────────────────────────────────────*/
function moveComponentToFieldset(pathIndex, targetKey) {

  /* ─── Case A · component lives INSIDE a Columns wrapper ─── */
  if (String(pathIndex).includes('.')) {
    const [rowIdx, colIdx] = String(pathIndex).split('.').map(n => parseInt(n, 10));

    /* 1 ▸ arrays we move FROM / TO */
    const fromArr = getActiveBuilderDestination();
    const toArr = getBuilderDestinationByKey(targetKey);

    const shell = fromArr[rowIdx];
    if (!shell || shell.type !== 'columns') return;   // safety-net

    /* 2 ▸ carve the WHOLE column out of the row */
    const [removedCol] = shell.columns.splice(colIdx, 1);
    if (!removedCol) return;

    /* 3 ▸ if that row is now empty → delete it, otherwise rebalance */
    if (shell.columns.length === 0) {
      fromArr.splice(rowIdx, 1);            // drop empty wrapper
    } else {
      normalizeColumnsShell(shell);         // keep the row at two slots
    }

    /* 4 ▸ wrap the column in its own “Columns” shell so it keeps
           behaving like a row when re-inserted elsewhere          */
    const newShell = createComponent('columns', 'Columns');
    newShell.columns[0] = {
      ...removedCol,
      components: Array.isArray(removedCol?.components) ? removedCol.components : []
    };
    normalizeColumnsShell(newShell);

    /* 5 ▸ park this new shell in the destination grouping */
    toArr.push(newShell);

    updatePreview();
    return;                                 // dotted paths handled – done
  }

  /* ─── Case B · normal top-level card ─── */

  /* 1 ▸ arrays we move FROM / TO */
  const fromArr = getActiveBuilderDestination();
  const toArr = getBuilderDestinationByKey(targetKey);

  const owner = fromArr[pathIndex];
  if (!owner) return;

  /* 2 ▸ collect owner + any linked Actions bundle */
  const bundle = [owner];
  const idxMap = new Map([[owner, pathIndex]]);

  if (owner._actionsDriverKey) {
    const dKey = owner._actionsDriverKey;
    fromArr.forEach((c, i) => {
      if (c.key === dKey || c.conditional?.when === dKey) {
        bundle.push(c);
        idxMap.set(c, i);
      }
    });
    bundle.sort((a, b) => idxMap.get(a) - idxMap.get(b));
  }

  /* 3 ▸ remove bundle from source */
  bundle.forEach(c => {
    const i = fromArr.indexOf(c);
    if (i !== -1) fromArr.splice(i, 1);
  });

  /* 4 ▸ append bundle to destination */
  toArr.push(...bundle);

  /* 5 ▸ tidy Actions driver numbering */
  if (window.compactActionBundles) {
    compactActionBundles(fromArr);
    if (fromArr !== toArr) compactActionBundles(toArr);
  }

  updatePreview();
}



/* single, authoritative mover */
function moveComponentIntoColumn(srcKey, columnsKey, colIdx, fallbackComp = null, options = {}) {

  

  /* 1 ▸ pull the component out, wherever it lives */
  function pull(arr) {
    for (let i = arr.length - 1; i >= 0; i--) {
      const node = arr[i];

      /* a) right here */
      if (node.key === srcKey) return arr.splice(i, 1)[0];

      /* b) inside a normal .components array */
      if (Array.isArray(node.components)) {
        const found = pull(node.components);
        if (found) return found;
      }

      /* c) inside any column of a Columns shell */
      if (node.type === "columns") {
        for (const col of node.columns) {
          const found = pull(col.components);
          if (found) return found;
        }
      }
    }
    return null;
  }

  /* 2 ▸ grab the component (or the one cached by onRemove) */
  let cmp = pull(formJSON.components);
  if (!cmp && fallbackComp) cmp = fallbackComp;
  if (!cmp) return null;                   // nothing to move → bail out

  /* 3 ▸ find the target Columns wrapper */
  const shell = findCompByKey(formJSON.components, columnsKey);
  if (!shell || shell.type !== "columns") return null;

  /* 4 ▸ do the swap */
  const currentColumn = createColumnSlot(shell.columns?.[colIdx]);
  const existingComp = currentColumn.components[0] || null;
  const displaced = existingComp && existingComp !== cmp
    ? existingComp
    : null;
  shell.columns[colIdx] = createColumnSlot(shell.columns?.[colIdx], cmp);
  if (options.animateDrop) {
    queueColumnDropAnimation(cmp.key);
  }
  setPendingColumnInsertTarget(shell.key, 0);
  setBuilderInsertionAnchor(shell.key, { refresh: false });

  return displaced;   // onAdd will park this (if not null)
}

/* ───── DRAG-AND-DROP helper ────────────────────────────── */
function reorderComponents(srcKey, newVisibleIdx) {
  const arr = getActiveBuilderDestination();
  const visibleComponents = arr.filter(isVisibleBuilderComponent);
  const oldVisibleIdx = visibleComponents.findIndex(component => component?.key === srcKey);

  if (oldVisibleIdx === -1) return;

  const safeNewVisibleIdx = Math.max(
    0,
    Math.min(
      Number.isFinite(newVisibleIdx) ? newVisibleIdx : 0,
      visibleComponents.length - 1
    )
  );
  if (oldVisibleIdx === safeNewVisibleIdx) return;

  const [moved] = visibleComponents.splice(oldVisibleIdx, 1);
  visibleComponents.splice(safeNewVisibleIdx, 0, moved);

  let visibleCursor = 0;
  for (let index = 0; index < arr.length; index += 1) {
    if (!isVisibleBuilderComponent(arr[index])) continue;
    arr[index] = visibleComponents[visibleCursor++];
  }

  // keep your Actions bundles numbered nicely
  if (window.compactActionBundles) compactActionBundles(arr);

  updatePreview();                        // redraw the list + JSON preview
}
/**
 * Edit a component object. Reuses your openLabelOptionsModal.
 */
function editBuilderComponent(comp) {
  if (!comp) return;
  const previousLabel = String(comp.label || "").trim();
  const componentOwnerArray = comp.key
    ? findComponentParentArrayByKey(formJSON.components, comp.key)
    : null;

  const quizFS = findAncestorQuiz(selectedFieldsetKey);
  if (quizFS && isQuizAnswerComponent(comp)) {
       syncAnswerKeyRow(quizFS, comp, previousLabel);          // ② now `comp` is defined
  }

  window._currentEditingComponent = comp;

  let initialLabel = comp.label || "";
  let initialOptions = [];
  let initialDisclaimer = "";
  let initialHideLabel = !!comp.hideLabel;
  let initialDTMode =
        comp.__mode                         // value saved earlier, if any
    ?   comp.__mode
    :   comp.noCalendar        ? "time"
    : ! comp.enableTime        ? "date"
    :                            "datetime";
  const initialDateTimeModeManual = !!comp.__dateTimeModeManual;
  const initialNumericStyleManual = !!comp.__numericStyleManual;
  let initialComponentGroupMode = "survey";
  let initialComponentGroupItems = [];
  let initialComponentGroupResponses = [];

    let initialSpeedLabels = [];
    let initialSpeedValues = [];

    
    if (comp.type === "speed") {
    comp.components
            .filter(c => c.type === "radio")
            .forEach(r => {
              initialSpeedLabels.push(r.label || "");
              /* keep *exact* value typed at creation (falls back to key) */
              initialSpeedValues.push(r.__origValue ?? r.key ?? "");
            });
    }

  // If it's a radio/select/selectboxes => gather current options
  if (["radio", "select", "selectboxes"].includes(comp.type)) {
    if (comp.type === "select") {
      initialOptions = (comp.data?.values || []).map(o => ({ label: o.label }));
    } else {
      initialOptions = (comp.values || []).map(o => ({ label: o.label }));
    }
  }
  // If disclaimer
if (comp.customType === "disclaimer" || comp.type === "content") {
   /* keep the raw HTML so CKEditor shows the original formatting */
   initialDisclaimer = comp.html || "";
 }
  // If survey
  let initialSurveyQuestions = [];
  let initialSurveyOptions = [];
  if (comp.type === "survey") {
    initialSurveyQuestions = comp.questions || [];
    initialSurveyOptions = comp.values || [];
  }
  if (comp.customType === "componentGroup") {
    const componentGroupConfig = getComponentGroupConfig(comp);
    initialComponentGroupMode = componentGroupConfig.mode;
    initialComponentGroupItems = componentGroupConfig.items;
    initialComponentGroupResponses = componentGroupConfig.responses;
  }

  // If textarea, read the current row count or default to 1
  let initialRows = comp.rows || 1;

  let initialPassMark = 1;
if (comp.customType === 'quiz') {
  const pm = getQuizPassMarkField(comp);
  initialPassMark = pm?.defaultValue ?? 1;
}


  /* ---------- determine which type name the modal expects ---------- */
const modalType = comp.customType
  ? comp.customType                       // e.g. "disclaimer"
  : comp.type === "speed"
    ? "speed"
    : comp.type === "content"             // legacy Disclaimer = content component
      ? "disclaimer"
      : comp.type;  

  openLabelOptionsModal(
    (
      newLabel,
      newOpts,
      disclaimText,
      sQ,
      sO,
      finalHideLabel,
      finalRequired,
      finalRows,
      selectedDTMode,
      styleOrMode,
      actionsEnabled,   // ← 11-th
      finalSpeedLabels,
      finalSpeedValues,
      incomingDefault,
      passMark,
      finalEditGridConfig,
      dateTimeModeManual,
      numericStyleManual,
      finalComponentGroupMode,
      finalComponentGroupItems,
      finalComponentGroupResponses

    ) => {
      const previousKey = comp.key;
      const previousChoiceEntries = getOptionEntriesForFlags(comp);
      const previousChoiceItems = previousChoiceEntries
        .map(option => ({ value: option?.value }));
      const previousHadOtherOption =
        typeof window.hasOtherOptionOnChoiceComponent === "function"
          ? window.hasOtherOptionOnChoiceComponent(comp)
          : false;
      const previousWasAutoOtherDisabled = comp.builderDisableAutoOther === true;
      const previousSurveyValues = Array.isArray(comp.values)
        ? comp.values.map(option => ({ value: option?.value }))
        : [];
      let conditionalValueMap = {};
      const normalizedLabel = typeof window.normalizeComponentLabel === "function"
        ? window.normalizeComponentLabel(newLabel, comp.type)
        : newLabel;

      comp.label = normalizedLabel;
      comp.hideLabel = !!finalHideLabel;
      comp.key = updateUniqueKey(comp.key, comp.label);

      // keep the legend text in sync when editing a field-set
      if (comp.type === "fieldset" || comp.type === "speed") {
        comp.legend = getBuilderFieldsetLegend(comp);
      }

      if (modalType === "componentGroup") {
        applyComponentGroupConfig(comp, {
          sectionLabel: comp.label,
          mode: finalComponentGroupMode,
          items: finalComponentGroupItems,
          responses: finalComponentGroupResponses
        });
      }
      
      if (!comp.validate) comp.validate = {};
      comp.validate.required = !!finalRequired;

      if (["select", "radio", "selectboxes"].includes(comp.type)) {
        const normalizedChoiceItems = typeof window.normalizeChoiceItems === "function"
          ? window.normalizeChoiceItems(newOpts, "option")
          : { items: ensureUniqueValues(newOpts), valueMap: {} };
        const uniqueItems = normalizedChoiceItems.items;

        conditionalValueMap = buildIndexedValueRemap(
          previousChoiceItems,
          uniqueItems,
          normalizedChoiceItems.valueMap
        );

        if (comp.type === "select") {
          comp.data = comp.data || {};
          comp.data.values = uniqueItems;
        } else {
          comp.values = uniqueItems;
        }
        normalizeComponentOptionFlags(comp);
      }
  
 /* ───── style change: Dropdown ↔ Radio ↔ Select Boxes ───── */
 if (["select", "radio", "selectboxes"].includes(comp.type) &&
     ["select", "radio", "selectboxes"].includes(styleOrMode) &&
     styleOrMode !== comp.type) {

   const clone = a => a.map(o => ({ ...o }));

   // Moving away from a <select>: pull options out of .data.values
   if (comp.type === "select") {
     comp.values = clone(comp.data?.values || []);
     delete comp.data;
   }

   // Reset style-specific flags
   delete comp.inline;
   delete comp.optionsLabelPosition;
   delete comp.inputType;
   delete comp.modalEdit;           // ← always clear old modalEdit

   if (styleOrMode === "select") {
     // → Dropdown
     comp.type   = "select";
     comp.widget = "html5";
     comp.placeholder = "Tap & Select";
     comp.data   = { values: clone(comp.values) };
     delete comp.values;
     comp.tableView = true;
   } else {
     // → Radio or Select Boxes
     comp.type                 = styleOrMode;
     comp.inline               = (styleOrMode === "radio");
     comp.optionsLabelPosition = "right";
     comp.tableView            = false;
     if (styleOrMode === "selectboxes") {
       comp.inputType = "checkbox";
       comp.modalEdit = true;     // ← only here
     }
   }

   normalizeComponentOptionFlags(comp);
 }

      if (
        ["select", "selectboxes"].includes(comp.type)
        && typeof window.syncChoiceComponentAutoOtherState === "function"
      ) {
        window.syncChoiceComponentAutoOtherState(comp, {
          hadOtherBefore: previousHadOtherOption,
          wasAutoOtherDisabled: previousWasAutoOtherDisabled
        });
      }

 /* ───── style change: Number ↔ Currency ───── */
 if ((comp.type === "number" || comp.type === "currency") &&
     (styleOrMode === "number" || styleOrMode === "currency")) {
   setNumericComponentStyle(comp, styleOrMode, { manual: numericStyleManual });
 }

if (comp.type === 'number' || comp.type === 'currency') {
  if (typeof incomingDefault === 'number') comp.defaultValue = incomingDefault;
  else if (incomingDefault === undefined)  delete comp.defaultValue;
}
 
      // If disclaimer
      if (comp.customType === "disclaimer" || comp.type === "content") {
        comp.html = disclaimText.startsWith("<p")
          ? disclaimText
          : `<p>${disclaimText}</p>`;
      }

      // If survey
      if (comp.type === "survey") {
        const normalizedQuestions = typeof window.normalizeChoiceItems === "function"
          ? window.normalizeChoiceItems(sQ, "question")
          : { items: ensureUniqueValues(sQ) };
        const normalizedSurveyValues = typeof window.normalizeChoiceItems === "function"
          ? window.normalizeChoiceItems(sO, "value")
          : { items: ensureUniqueValues(sO), valueMap: {} };

        comp.questions = normalizedQuestions.items;
        comp.values = normalizedSurveyValues.items;
        conditionalValueMap = buildIndexedValueRemap(
          previousSurveyValues,
          comp.values,
          normalizedSurveyValues.valueMap
        );
      }

      // If textarea => set row + special properties
      if (comp.type === "textarea") {
        comp.rows = finalRows || 1;
        comp.labelWidth = 30;
        comp.labelMargin = 3;
        comp.autoExpand = true; 
        comp.reportable = true;  
        comp.tableView = true;
      }

      if (isDateTimeBuilderComponent(comp)) {
        setDateTimeComponentMode(comp, selectedDTMode, { manual: dateTimeModeManual });
      }

      if (comp.customType === 'quiz') {
        const passMarkField = getQuizPassMarkField(comp);
        if (passMarkField) {
          passMarkField.defaultValue = passMark ?? 1;
        }
      }

      if (comp.type === "editgrid" && typeof window.applyEditGridTemplateConfig === "function") {
        window.applyEditGridTemplateConfig(comp, finalEditGridConfig || {});
      }

      if (quizFS && isQuizAnswerComponent(comp)) {
        syncAnswerKeyRow(quizFS, comp, previousLabel);
        syncQuizAnswerKeyRows(quizFS);
      }


      if (comp.type === 'speed') {
        const speedLabels = (finalSpeedLabels || []).map(value => String(value || "").trim()).filter(Boolean);
        const speedValues = (finalSpeedValues || []).map(value => String(value || "").trim());
        const existingRadios = comp.components.filter(c => c.type === 'radio');
        const defaultRadioOpts = [
          { label:"Yes", value:"yes", flag:"success", shortcut:"" },
          { label:"No", value:"no", flag:"danger", shortcut:"" },
          { label:"N/A", value:"nA", flag:"", shortcut:"" }
        ];

        if (speedLabels.length) {
          const currentOptions = (_presetRadioOptions && _presetRadioOptions.length)
            ? _presetRadioOptions.map(option => ({ ...option }))
            : (existingRadios[0]?.values || []).map(option => ({
                label: option.label,
                value: option.value,
                flag: option.flag || "",
                shortcut: option.shortcut || ""
              }));
          const optionSet = currentOptions.length ? currentOptions : defaultRadioOpts;

          comp.components = [];
          speedLabels.forEach((labelText, index) => {
            const keyBase = speedValues[index] || labelText;
            const radio = createComponent(
              "radio",
              labelText,
              optionSet.map(option => ({ ...option }))
            );
            radio.key = ensureGloballyUniqueKey(_.camelCase(keyBase));
            radio.__origValue = keyBase.trim();
            if (!finalRequired) radio.validate.required = false;
            comp.components.push(radio);
            if (actionsEnabled) {
              toggleActionsBundle(comp.components, true, radio);
            }
          });
        } else {
          existingRadios.forEach(radio => {
            if (radio._actionsDriverKey) {
              toggleActionsBundle(comp.components, false, radio);
            }
            if (actionsEnabled) {
              toggleActionsBundle(comp.components, true, radio);
            }
          });
        }
      } else {
        /* every other component behaves as before */
        const parentArray = Array.isArray(componentOwnerArray)
          ? componentOwnerArray
          : getActiveBuilderDestination();

        toggleActionsBundle(parentArray, actionsEnabled, comp);
      }
      if (selectedFieldsetKey === previousKey && comp.key) {
        selectedFieldsetKey = comp.key;
      }
      if (
        previousKey &&
        comp.key &&
        previousKey !== comp.key &&
        typeof window.syncComponentKeyReferences === "function" &&
        Array.isArray(window.formJSON?.components)
      ) {
        window.syncComponentKeyReferences(window.formJSON.components, previousKey, comp.key);
      }
      if (
        Object.keys(conditionalValueMap).length &&
        typeof window.syncConditionalValueReferences === "function" &&
        Array.isArray(window.formJSON?.components)
      ) {
        window.syncConditionalValueReferences(window.formJSON.components, comp.key, conditionalValueMap);
      }
      window._currentEditingComponent = null;
      bumpManualEditTelemetry(1);
      updatePreview();
    },
    modalType,               // ← SECOND ARGUMENT (the type string the modal expects)
    initialLabel,
    initialOptions,
    initialDisclaimer,
    initialSurveyQuestions,
    initialSurveyOptions,
    initialHideLabel,
    !!comp.validate?.required,
    initialRows,
    initialDTMode,  
    comp.type, 
    (comp._actionsDriverKey ? true : false),                     // 11
    initialSpeedLabels,                  // 12
    initialSpeedValues,                  // 13
    comp.defaultValue,
    initialPassMark,
    comp,
    initialDateTimeModeManual,
    initialNumericStyleManual,
    initialComponentGroupMode,
    initialComponentGroupItems,
    initialComponentGroupResponses
  );
}

/**
 * Edit a component by path index. Reuses your openLabelOptionsModal.
 */
function editComponent(pathIndex) {
  const comp = getComponentByPath(pathIndex);
  editBuilderComponent(comp);
}


/*───────────────────────────────────────────────
  Wrap one component into a 2-column block
────────────────────────────────────────────────*/
function wrapComponentInColumns(pathIndex){
  const parentArray = getActiveBuilderDestination();
  const ownerIdx = Number(pathIndex);
  if (!Array.isArray(parentArray) || !Number.isInteger(ownerIdx)) return;

  const owner = parentArray[ownerIdx];
  if (!owner || owner.type === "columns") return;

  let companion = null;
  let companionIdx = -1;

  for (let index = ownerIdx + 1; index < parentArray.length; index += 1) {
    const candidate = parentArray[index];
    if (!isVisibleBuilderComponent(candidate)) continue;

    if (candidate.type !== "columns" && !candidate._actionsDriverKey) {
      companion = candidate;
      companionIdx = index;
    }
    break;
  }

  /* build shell */
  const shell = createComponent('columns', 'Columns');
  shell.columns[0] = createColumnSlot(shell.columns[0], owner);
  shell.columns[1] = createColumnSlot(shell.columns[1], companion);

  if (companionIdx !== -1) {
    parentArray.splice(companionIdx, 1);
  }

  /* replace in parent array */
  parentArray.splice(ownerIdx, 1, shell);
  if (companion) {
    clearPendingColumnInsertTarget();
  } else {
    setPendingColumnInsertTarget(shell.key, 1);
  }
  setBuilderInsertionAnchor(shell.key, { refresh: false });
  showNotification(
    companion
      ? 'Wrapped current and next components in 2 columns'
      : 'Wrapped in 2 columns',
    'success'
  );

  /* keep Actions drivers tidy */
  if (window.compactActionBundles) compactActionBundles(parentArray);

  updatePreview();
}


/* helper: find a component anywhere in the form by key */
function findCompByKey(arr, key){
  for (const c of arr){
    if (c.key === key) return c;
    if (c.type === "columns" && Array.isArray(c.columns)) {
      for (const col of c.columns) {
        const deepInColumn = findCompByKey(col.components || [], key);
        if (deepInColumn) return deepInColumn;
      }
    }
    if (Array.isArray(c.components)){
      const deep = findCompByKey(c.components, key);
      if (deep) return deep;
    }
  }
  return null;
}



function removeComponentInColumn(wrapperKey, colIdx, pruneAfter = false){
    const shell = findCompByKey(formJSON.components, wrapperKey);
  if (!shell || shell.type !== "columns") return;

  /* drop the first (only) component in that slot */
  const removed = shell.columns[colIdx].components.shift() || null;

  /* 1 ▸ drop empty columns if asked -------------------------------- */
  if (pruneAfter) normalizeColumnsShell(shell);

  /* 2 ▸ if ALL columns are now empty → delete the wrapper itself ---- */
  const parentArr = getActiveBuilderDestination();

  if (shell.columns.every(c => c.components.length === 0)) {
    const idx = parentArr.indexOf(shell);
    if (idx !== -1) parentArr.splice(idx, 1);
    clearPendingColumnInsertTarget();
  } else {
    setPendingColumnInsertTarget(shell.key, 0);
  }

  return removed;
}

/**
 * The "component options" modal - optional older approach
 */
function openComponentOptionsModal(relativePath) {
  currentSelectedComponentPath = relativePath;
  const modal = document.getElementById("componentOptionsModal");
  const overlay = document.getElementById("overlay");
  if (!modal || !overlay) return;

  const targetComponent = getActiveBuilderDestination()[Number(relativePath)] || null;
  if (!targetComponent) {
    return; // no showNotification
  }

  const detailsDiv = document.getElementById("componentOptionDetails");
  if (detailsDiv) {
    const safeLabel = _.escape(targetComponent.label || "No Label");
    const safeType = _.escape(targetComponent.type || "No Type");
    const safeWhen = _.escape(targetComponent.conditional?.when || "");
    const safeEq = _.escape(targetComponent.conditional?.eq || "");
    detailsDiv.innerHTML = `
      <strong>${safeLabel}</strong>
      <strong>(${safeType})</strong>
      ${
        targetComponent.conditional
          ? `<em>Conditional: When ${safeWhen} = ${safeEq}</em>`
          : ""
      }
    `;
  }

  const conditionalBtn = document.getElementById("componentAddConditionalBtn");
  const editBtn = document.getElementById("componentEditBtn");
  const deleteBtn = document.getElementById("componentDeleteBtn");

  if (conditionalBtn) {
    conditionalBtn.onclick = () => {
      openConditionalModal(relativePath);
    };
  }
  if (editBtn) {
    editBtn.onclick = () => {
      closeComponentOptionsModal();
      editComponent(relativePath);
    };
  }
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      handleDelete(getVisibleBuilderCardByPath(relativePath), relativePath);
      closeComponentOptionsModal();
    };
  }

  modal.style.display = "block";
  showSharedOverlay(overlay);
}


/* keep track of the currently loaded template context */
const importedTemplateContext = window.__builderImportedTemplateContext || null;
window._currentTemplateId = importedTemplateContext?.templateId || null;
window._currentTemplateVersionId = importedTemplateContext?.versionId || null;
window._currentTplName = importedTemplateContext?.name || '';
window._currentTplFolder = '';



/**
 * DOMContentLoaded => set up event listeners
 */
document.addEventListener("DOMContentLoaded", () => {
  sessionTimerController = window.initSessionTimer?.();
  requestAnimationFrame(applyInitialBuilderVerticalOffset);

  if (window.__builderInitialHashLoadName) {
    showNotification(`Loaded ${window.__builderInitialHashLoadName}`, "success", 1800);
  } else if (window.__builderImportedTemplateLoadName) {
    showNotification(`Loaded ${window.__builderImportedTemplateLoadName}`, "success", 1800);
  }

  // "Copy JSON" button
  const copyBtn = document.getElementById("copyJsonBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      try {
        await copyCurrentBuilderJsonToClipboard();
        showNotification("JSON copied to clipboard!", "success", 1800);
      } catch (err) {
        console.error("Copy error:", err);
        showNotification("Copy failed. Please try again.", "error");
      }
    });
  }

  const undoBtn = document.getElementById("undoBuilderBtn");
  if (undoBtn) {
    undoBtn.addEventListener("click", () => {
      undoBuilderChange();
    });
    syncBuilderUndoButtonState();
  }

  const typeContainer = document.getElementById("componentTypeContainer");

  if (typeContainer) {
    updateBuilderEntryAvailability();

    // one click-handler for the whole strip
    typeContainer.addEventListener("click", onTypeCardClick);
  } else {
    console.warn("#componentTypeContainer not found in the HTML");
  }

  // «—— stray `modalType` definition was here – removed »

  // "Add Section" button
  const addFieldsetBtn = document.getElementById("addFieldsetBtn");
  if (addFieldsetBtn) {
    addFieldsetBtn.addEventListener("click", () => {
      if (!getBuilderTypeAvailability("fieldset").allowed) {
        return;
      }

      const cmp = createComponent("fieldset");
      insertComponentIntoBuilder(cmp);
      bumpManualAddTelemetry("fieldset");
      updatePreview();
      focusNewComponentLabel(cmp.key);
    });
  }

  const openQuizSetupBtn = document.getElementById("openQuizSetupBtn");
  if (openQuizSetupBtn) {
    openQuizSetupBtn.addEventListener("click", () => {
      const quizFS = findAncestorQuiz(selectedFieldsetKey);
      if (quizFS) {
        openAnswerKeyModal(quizFS);
      }
    });
  }

  const openEditGridSetupBtn = document.getElementById("openEditGridSetupBtn");
  if (openEditGridSetupBtn) {
    openEditGridSetupBtn.addEventListener("click", () => {
      const selectedContainer = getSelectedBuilderContainer();
      if (selectedContainer?.type === "editgrid") {
        editBuilderComponent(selectedContainer);
      }
    });
  }

  // Fieldset list click => select a fieldset
  const fieldsetListEl = document.getElementById("fieldsetList");
  if (fieldsetListEl) {
    const fieldsetRailEl = fieldsetListEl.closest(".builder-destination-rail");

    if (fieldsetRailEl) {
      fieldsetRailEl.addEventListener("click", (e) => {
        const scrollBtn = e.target.closest(".builder-destination-scroll");
        if (!scrollBtn) return;

        stepBuilderSectionSelection(
          scrollBtn.dataset.builderSectionScroll === "prev" ? -1 : 1
        );
      });
    }

    fieldsetListEl.addEventListener("click", (e) => {
      let card = e.target;
      while (card && !card.classList.contains("fieldset-card")) {
        card = card.parentElement;
      }
      if (!card) {
        return;
      }
      if (card.isContentEditable || e.target.closest('[contenteditable="true"]')) {
        return;
      }

      const nextKey = card.getAttribute("data-key");
      if (!nextKey) {
        return;
      }
      selectBuilderSection(nextKey);
    });

    fieldsetListEl.addEventListener("wheel", (e) => {
      const hasOverflow = fieldsetListEl.scrollWidth - fieldsetListEl.clientWidth > 12;
      if (!hasOverflow) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;

      e.preventDefault();
      fieldsetListEl.scrollLeft += e.deltaY;
      syncBuilderSectionRailState();
    }, { passive: false });

    fieldsetListEl.addEventListener("scroll", () => {
      syncBuilderSectionRailState();
    }, { passive: true });

    fieldsetListEl.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;

      const card = e.target.closest(".fieldset-card");
      if (!card) return;

      const cards = [...fieldsetListEl.querySelectorAll(".fieldset-card")];
      const currentIndex = cards.indexOf(card);
      if (currentIndex === -1) return;

      const nextIndex = Math.max(
        0,
        Math.min(cards.length - 1, currentIndex + (e.key === "ArrowRight" ? 1 : -1))
      );
      if (nextIndex === currentIndex) return;

      e.preventDefault();
      cards[nextIndex].focus();
      cards[nextIndex].click();
    });

    fieldsetListEl.addEventListener("dragover", (e) => {
      if (!currentDraggedBuilderItem) return;

      const card = e.target.closest(".fieldset-card");
      if (!card) return;

      e.preventDefault();
      clearFieldsetDropHighlight();
      card.classList.add("drop-before");
    });

    fieldsetListEl.addEventListener("dragleave", (e) => {
      const card = e.target.closest(".fieldset-card");
      if (!card) return;

      const nextCard = e.relatedTarget?.closest?.(".fieldset-card");
      if (nextCard === card) return;
      card.classList.remove("drop-before");
    });

    fieldsetListEl.addEventListener("drop", (e) => {
      if (!currentDraggedBuilderItem) return;

      const card = e.target.closest(".fieldset-card");
      if (!card) return;

      e.preventDefault();
      moveDraggedComponentToSection(card.getAttribute("data-key"));
      clearFieldsetDropHighlight();
    });

    requestAnimationFrame(() => {
      syncBuilderSectionRailState({ ensureSelectedVisible: true, behavior: "auto" });
    });
  }
  updateFieldsetCards();

 /* ------------------------------------------------------------------
   Component-picker panel (single, de-duplicated version)
-------------------------------------------------------------------*/
const componentTypes = [
  ...BUILDER_COMPONENT_TYPES
];

function clearRightActionsHoverOpenTimer(box) {
  if (!box || !box._hoverOpenTimer) return;
  clearTimeout(box._hoverOpenTimer);
  box._hoverOpenTimer = null;
}

function clearRightActionsHoverCloseTimer(box) {
  if (!box || !box._hoverCloseTimer) return;
  clearTimeout(box._hoverCloseTimer);
  box._hoverCloseTimer = null;
}

function clearRightActionsClosingTimer(box) {
  if (!box || !box._closingTimer) return;
  clearTimeout(box._closingTimer);
  box._closingTimer = null;
}

function keepRightActionsHoverOpen(box, options = {}) {
  if (!box) return;
  const immediate = options.immediate === true || box.classList.contains("open");

  clearRightActionsHoverCloseTimer(box);
  clearRightActionsClosingTimer(box);
  box.classList.remove("closing");

  if (immediate || box.classList.contains("hover-open")) {
    clearRightActionsHoverOpenTimer(box);
    box.classList.add("hover-open");
    return;
  }

  if (box._hoverOpenTimer) return;

  box._hoverOpenTimer = setTimeout(() => {
    box.classList.add("hover-open");
    box._hoverOpenTimer = null;
  }, 120);
}

function scheduleRightActionsHoverClose(box) {
  if (!box) return;
  clearRightActionsHoverOpenTimer(box);
  clearRightActionsHoverCloseTimer(box);
  clearRightActionsClosingTimer(box);
  box._hoverCloseTimer = setTimeout(() => {
    box.classList.remove("hover-open");
    if (!box.classList.contains("open")) {
      box.classList.add("closing");
      box._closingTimer = setTimeout(() => {
        if (!box.classList.contains("hover-open") && !box.classList.contains("open")) {
          box.classList.remove("closing");
        }
        box._closingTimer = null;
      }, 180);
    }
    box._hoverCloseTimer = null;
  }, 260);
}

function updatePreviewKeepingRightActionsHover(cardKey, options = {}) {
  const preserveCardDom = options.preserveCardDom === true;

  if (cardKey && !preserveCardDom) hoverMenuKeys.add(cardKey);
  updatePreview({
    refreshComponentList: !preserveCardDom,
    refreshFieldsetCards: !preserveCardDom
  });
}





  document.getElementById('componentList').addEventListener('click', e => {

const anchor = e.target.closest('.anchor-btn');
if (anchor) {
  const card = anchor.closest('.component-card');   // ⇠ we need this
  const box  = card.querySelector('.right-actions');

const isOpen = box.classList.toggle('open');
const key    = card.dataset.key;
if (isOpen) openMenuKeys.add(key);
else        openMenuKeys.delete(key);
if (isOpen) keepRightActionsHoverOpen(box, { immediate: true });

  // stop the click from falling through to other handlers
  e.stopPropagation();
  return;
}
  });

  document.getElementById('componentList').addEventListener('mouseover', e => {
    const box = e.target.closest('.right-actions');
    if (!box) return;
    keepRightActionsHoverOpen(box);
  });

  document.getElementById('componentList').addEventListener('mouseout', e => {
    const box = e.target.closest('.right-actions');
    if (!box) return;
    if (e.relatedTarget && box.contains(e.relatedTarget)) return;
    scheduleRightActionsHoverClose(box);
  });


  

  // Listen for actions on each component card (Move Up, Down, Conditional, Edit, Delete)
  const compListEl = document.getElementById("componentList");

  if (compListEl) {
    compListEl.addEventListener("pointerdown", (e) => {
      if (typeof e.button === "number" && e.button !== 0) return;
      if (e.isPrimary === false) return;

      const handle = e.target.closest(COMPONENT_DRAG_HANDLE_SELECTOR);
      const card = handle?.closest(".component-card.conditional-card, .component-card.calculated-card");
      if (!card || card.classList.contains("is-editing-label")) return;

      beginComponentTooltipSuppression(e.pointerId);
    }, true);

    window.addEventListener("pointerup", (e) => {
      endComponentTooltipSuppression(e.pointerId);
    }, true);

    window.addEventListener("pointercancel", (e) => {
      endComponentTooltipSuppression(e.pointerId);
    }, true);

    window.addEventListener("blur", () => {
      endComponentTooltipSuppression();
    }, true);

    compListEl.addEventListener("click", (e) => {
      const anchorTarget = e.target.closest("[data-anchor-key]");
      if (anchorTarget?.dataset?.anchorKey) {
        selectBuilderInsertionAnchor(anchorTarget.dataset.anchorKey);
      }

      const placeholder = e.target.closest(".component-card.placeholder");
      const placeholderTarget = getColumnPlaceholderTarget(placeholder);
      if (placeholderTarget) {
        setPendingColumnInsertTarget(
          placeholderTarget.columnsKey,
          placeholderTarget.colIdx
        );
        return;
      }

      /* ───── toggle buttons (required / hideLabel / actions) ───── */
      const tog = e.target.closest(".toggle-btn");
      if (tog) {
        const card  = tog.closest(".component-card");
        const comp  = findCompByKey(formJSON.components, card.dataset.key);
        if (!comp) return;
        let nextToggleState = tog.classList.contains("on");

        switch (tog.dataset.tog) {
          case "actions": {
            const parentArr = findComponentParentArrayByKey(formJSON.components, comp.key)
              || getActiveBuilderDestination();
            const enable = !tog.classList.contains("on");
            toggleActionsBundle(parentArr, enable, comp);
            nextToggleState = enable;
            break;
          }
          case "required":
            comp.validate = comp.validate || {};
            comp.validate.required = !comp.validate.required;
            nextToggleState = !!comp.validate.required;
            break;
          case "hideLabel":
            comp.hideLabel = !comp.hideLabel;
            nextToggleState = !!comp.hideLabel;
            break;
          case "multiple":
            setManagedListComponentMultiple(comp, !comp.multiple);
            nextToggleState = !!comp.multiple;
            break;
          case "inline":
            comp.inline = !comp.inline;
            nextToggleState = !!comp.inline;
            break;
          case "flags":
            nextToggleState = toggleComponentOptionFlags(comp);
            break;
        }
        const preserveCardDom = tog.dataset.tog !== "actions";
        syncComponentCardFlyoutState(card, comp);
        updatePreviewKeepingRightActionsHover(card.dataset.key, { preserveCardDom });
        return;                           // ← we’re done, don’t fall through
      }

      /* ───── everything else: action buttons (edit, delete, …) ───── */
      const btn  = e.target.closest(".component-action-btn");
      if (!btn) return;
      const card = btn.closest(".component-card");
      const path = card.dataset.path;
      switch (btn.dataset.action) {
        case "conditional":  openConditionalModal(path); break;
        case "calc":         openCalcModal(path);        break;
        case "edit":         editComponent(path);        break;
        case "akey":openAnswerKeyModal(getComponentByPath(path));break;
        case "delete":       handleDelete(card, path);   break;
        case "moveto":       openMoveToModal(path);      break;
        case "wrap2":
          wrapComponentInColumns(path);
          updatePreview();
          break;

        case "dtmode": {
          const comp = getComponentByPath(path);
          if (isDateTimeBuilderComponent(comp)) {
            const newMode = btn.dataset.mode;          // "datetime" | "date" | "time"
            setDateTimeComponentMode(comp, newMode, { manual: true });
            syncComponentCardFlyoutState(card, comp);
            updatePreviewKeepingRightActionsHover(card.dataset.key, { preserveCardDom: true });
          }
          break;
        }
        case "nummode": {                          // ⏣ NEW
          const comp = getComponentByPath(path);
          if (comp && (comp.type === "number" || comp.type === "currency")) {
            const newMode = btn.dataset.mode;      // "number" | "currency"
            setNumericComponentStyle(comp, newMode, { manual: true });
            syncComponentCardFlyoutState(card, comp);
            updatePreviewKeepingRightActionsHover(card.dataset.key, { preserveCardDom: true });
          }
          break;
        }
        case "filemode": {
          const comp = getComponentByPath(path);
          if (isFileUploadBuilderComponent(comp)) {
            setFileUploadComponentMode(comp, btn.dataset.mode);
            syncComponentCardFlyoutState(card, comp);
            updatePreviewKeepingRightActionsHover(card.dataset.key, { preserveCardDom: true });
          }
          break;
        }
        case "rows3": {                       // ★ NEW
          const comp = getComponentByPath(path);
          if (comp && comp.type === "textarea") {
            comp.rows = (comp.rows === 3) ? 1 : 3;   // toggle 1 ↔ 3
            syncComponentCardFlyoutState(card, comp);
            updatePreviewKeepingRightActionsHover(card.dataset.key, { preserveCardDom: true });
          }
          break;
        }
      }
    });
}


/*─────────────────────────────────────────────────────────
  Calculator (calculateValue) modal
  • 4 basic operators
  • Row-aware inside Custom Table / Basic Table
  • Totals rows when referencing repeatable fields from outside
─────────────────────────────────────────────────────────*/
function openCalcModal(pathIndex) {
  if (typeof window.closeComponentOptionsModal === "function") {
    window.closeComponentOptionsModal();
  }

  const ov  = createOverlay(1999);
  const dlg = document.getElementById("calcModal");
  dlg._currentOverlay = ov;
  dlg.classList.add("super-top");
  dlg.style.display = "block";

  const insertOps = dlg.querySelector("#calcInsertOps");
  const editor = dlg.querySelector("#calcEditor");
  const statusEl = dlg.querySelector("#calcStatus");
  const searchInput = dlg.querySelector("#calcFieldSearch");
  const fieldCountEl = dlg.querySelector("#calcFieldCount");
  const recommendationsBox = dlg.querySelector("#calcRecommendations");
  const fieldBox = dlg.querySelector("#calcFieldCards");
  const saveBtn = dlg.querySelector("#calcSaveBtn");
  const clearBtn = dlg.querySelector("#calcClearBtn");
  const closeBtn = dlg.querySelector(".close-btn");

  enableModalKeys(dlg, saveBtn, closeCalcModal);
  if (closeBtn) closeBtn.onclick = closeCalcModal;

  const target = getComponentByPath(pathIndex);
  if (!target || !["number","currency"].includes(target.type)) {
    showNotification("Only Number & Currency fields support calculations.");
    closeCalcModal();
    return;
  }

  const calcContext = buildCalculationChoiceContext(target);
  const choices = calcContext.choices;
  const fieldMap = calcContext.fieldMap;

  function setStatus(message = "", kind = "") {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.remove("error", "ok");
    if (kind) statusEl.classList.add(kind);
  }

  function setFieldCount(visibleCount) {
    if (!fieldCountEl) return;
    if (visibleCount === choices.length) {
      fieldCountEl.textContent = `${choices.length} field${choices.length === 1 ? "" : "s"}`;
      return;
    }
    fieldCountEl.textContent = `${visibleCount} of ${choices.length}`;
  }

  function normalizeCalcExpression(rawValue) {
    const expression = stripCalculationAssignment(rawValue).trim();
    if (!expression) return "";
    return `value = ${expression}`;
  }

  function toDisplayExpression(rawValue) {
    return toDisplayCalculationExpression(rawValue, calcContext);
  }

  function stripEditorAssignment() {
    if (!editor) return false;

    const currentValue = String(editor.value || "");
    const match = currentValue.match(/^\s*value\s*=\s*/i);
    if (!match) return false;

    const prefixLength = match[0].length;
    const selectionStart = Number.isFinite(editor.selectionStart) ? editor.selectionStart : currentValue.length;
    const selectionEnd = Number.isFinite(editor.selectionEnd) ? editor.selectionEnd : selectionStart;
    editor.value = currentValue.slice(prefixLength);
    editor.setSelectionRange(
      Math.max(0, selectionStart - prefixLength),
      Math.max(0, selectionEnd - prefixLength)
    );
    return true;
  }

  function toStoredExpression(rawValue) {
    return normalizeCalcExpression(rawValue).replace(
      /{{\s*([A-Za-z0-9_.]+)\s*}}/g,
      (_, key) => fieldMap.get(key)?.expression || `data.${key}`
    );
  }

  function validateExpression(rawValue) {
    const stored = toStoredExpression(rawValue);
    if (!stored) {
      return { valid: false, stored: "", message: "" };
    }

    try {
      // Syntax-only check so the builder can reject broken formulas before save.
      new Function("data", `let value; ${stored}; return value;`);
      return { valid: true, stored, message: "Formula looks good." };
    } catch (err) {
      return {
        valid: false,
        stored,
        message: err && err.message ? err.message : "Invalid formula."
      };
    }
  }

  function refreshSaveState() {
    const validation = validateExpression(editor?.value || "");
    if (!editor || !saveBtn) return validation;

    if (!stripCalculationAssignment(editor.value).trim()) {
      saveBtn.disabled = true;
      setStatus("Pick a recommended calculation or build your own formula.");
      return validation;
    }

    saveBtn.disabled = !validation.valid;
    setStatus(validation.message, validation.valid ? "ok" : "error");
    return validation;
  }

  function clearRecommendationSelection() {
    recommendationsBox
      ?.querySelectorAll(".calc-recommendation-card")
      .forEach(node => node.classList.remove("selected"));
  }

  function insertAtCursor(text, cursorOffset = 0) {
    if (!editor) return;

    const start = Number.isFinite(editor.selectionStart) ? editor.selectionStart : editor.value.length;
    const end = Number.isFinite(editor.selectionEnd) ? editor.selectionEnd : start;
    const nextValue = `${editor.value.slice(0, start)}${text}${editor.value.slice(end)}`;
    editor.value = nextValue;

    const nextPos = Math.max(0, Math.min(start + text.length + cursorOffset, nextValue.length));
    requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(nextPos, nextPos);
    });

    refreshSaveState();
  }

  function insertFieldToken(choice) {
    if (!choice) return;
    const token = `{{${choice.key}}}`;
    if (!editor.value.trim()) {
      editor.value = token;
      requestAnimationFrame(() => {
        const pos = editor.value.length;
        editor.focus();
        editor.setSelectionRange(pos, pos);
      });
      refreshSaveState();
      return;
    }
    insertAtCursor(token);
  }

  function buildRecommendations() {
    const list = [];
    const [a, b, c] = choices;

    if (a) {
      list.push({
        id: `single-${a.key}`,
        title: `Use ${a.label}`,
        expr: `{{${a.key}}}`
      });
    }

    if (a && b) {
      list.push({
        id: `sum-${a.key}-${b.key}`,
        title: `${a.label} + ${b.label}`,
        expr: `{{${a.key}}} + {{${b.key}}}`
      });
      list.push({
        id: `diff-${a.key}-${b.key}`,
        title: `${a.label} - ${b.label}`,
        expr: `{{${a.key}}} - {{${b.key}}}`
      });
      list.push({
        id: `mul-${a.key}-${b.key}`,
        title: `${a.label} × ${b.label}`,
        expr: `{{${a.key}}} * {{${b.key}}}`
      });
      list.push({
        id: `div-${a.key}-${b.key}`,
        title: `${a.label} ÷ ${b.label}`,
        expr: `{{${a.key}}} / {{${b.key}}}`
      });
      list.push({
        id: `avg-${a.key}-${b.key}`,
        title: `Average ${a.label} & ${b.label}`,
        expr: `({{${a.key}}} + {{${b.key}}}) / 2`
      });
    }

    if (a && b && c) {
      list.push({
        id: `sum3-${a.key}-${b.key}-${c.key}`,
        title: "Total first 3",
        expr: `{{${a.key}}} + {{${b.key}}} + {{${c.key}}}`
      });
    }

    if (choices.length > 3) {
      list.push({
        id: "sum-all",
        title: "Total all fields",
        expr: choices.map(choice => `{{${choice.key}}}`).join(" + ")
      });
    }

    return list.slice(0, 8);
  }

  function renderRecommendations() {
    if (!recommendationsBox) return;
    recommendationsBox.innerHTML = "";

    const recommendations = buildRecommendations();
    if (!recommendations.length) {
      const empty = document.createElement("div");
      empty.className = "calc-empty";
      empty.textContent = "Add more number fields to unlock recommended calculations.";
      recommendationsBox.appendChild(empty);
      return;
    }

    recommendations.forEach(recommendation => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "calc-recommendation-card";
      if (toDisplayExpression(editor?.value || "") === recommendation.expr.trim()) {
        card.classList.add("selected");
      }

      const title = document.createElement("span");
      title.className = "calc-recommendation-title";
      title.textContent = recommendation.title;

      card.append(title);
      card.addEventListener("click", () => {
        if (!editor) return;
        editor.value = recommendation.expr;
        recommendationsBox
          .querySelectorAll(".calc-recommendation-card")
          .forEach(node => node.classList.remove("selected"));
        card.classList.add("selected");
        refreshSaveState();
        requestAnimationFrame(() => {
          const pos = editor.value.length;
          editor.focus();
          editor.setSelectionRange(pos, pos);
        });
      });

      recommendationsBox.appendChild(card);
    });
  }

  function renderFieldCards() {
    if (!fieldBox) return;
    fieldBox.innerHTML = "";

    const query = String(searchInput?.value || "").trim().toLowerCase();
    const filteredChoices = choices.filter(choice => {
      if (!query) return true;
      const key = String(choice.key || "").toLowerCase();
      const label = String(choice.searchLabel || choice.label || "").toLowerCase();
      return key.includes(query) || label.includes(query);
    });

    setFieldCount(filteredChoices.length);

    if (!filteredChoices.length) {
      const empty = document.createElement("div");
      empty.className = "calc-empty";
      empty.textContent = "No matching numeric components.";
      fieldBox.appendChild(empty);
      return;
    }

    filteredChoices.forEach(choice => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "calc-field-card";
      card.setAttribute("aria-label", `Insert ${choice.label}`);

      const content = document.createElement("span");
      content.className = "calc-field-content";

      const head = document.createElement("span");
      head.className = "calc-field-head";

      const name = document.createElement("span");
      name.className = "calc-field-label";
      name.textContent = choice.label;
      name.title = choice.label;

      head.append(name);
      content.append(head);
      card.append(content);
      card.addEventListener("click", () => insertFieldToken(choice));
      fieldBox.appendChild(card);
    });
  }

  if (insertOps) {
    insertOps.onclick = e => {
      const btn = e.target.closest(".calc-op-btn");
      if (!btn) return;
      const text = btn.dataset.insert || "";
      const cursorOffset = Number(btn.dataset.cursorOffset || 0);
      insertAtCursor(text, Number.isFinite(cursorOffset) ? cursorOffset : 0);
    };
  }

  if (searchInput) {
    searchInput.value = "";
    searchInput.oninput = () => renderFieldCards();
  }

  if (editor) {
    editor.value = toDisplayExpression(String(target.calculateValue || ""));
    editor.oninput = () => {
      stripEditorAssignment();
      clearRecommendationSelection();
      refreshSaveState();
    };
  }

  if (clearBtn) {
    clearBtn.onclick = () => {
      if (!editor) return;
      editor.value = "";
      clearRecommendationSelection();
      refreshSaveState();
      requestAnimationFrame(() => {
        editor.focus();
        editor.setSelectionRange(0, 0);
      });
    };
  }

  renderRecommendations();
  renderFieldCards();
  refreshSaveState();
  if (editor && !editor.value.trim()) {
    setStatus("Pick a recommended calculation or build your own formula.");
  }

  saveBtn.onclick = () => {
    const validation = refreshSaveState();
    if (!validation.valid || !validation.stored) return;
    target.calculateValue = validation.stored;
    closeCalcModal();
    updatePreview();
  };

  requestAnimationFrame(() => editor?.focus());
}


function closeCalcModal(){
  const modal = document.getElementById("calcModal");
  disableModalKeys(modal);
  const numDefaultSection = document.getElementById('numberDefaultSection');
  const numDefaultInput   = document.getElementById('numberDefaultInput');
  if (!modal) return;
  modal.style.display = "none";
  modal.classList.remove("super-top");
  if (modal._currentOverlay){
    modal._currentOverlay.remove();
    modal._currentOverlay = null;
  }
}


function openAnswerKeyModal(target){
  const quizFS = isQuizFieldset(target)
    ? target
    : findAncestorQuiz(selectedFieldsetKey);
  if (!quizFS) return;

  const { grid, questionKey, answerKey, componentKey } = getQuizAnswerGridKeys(quizFS);
  const passMarkField = getQuizPassMarkField(quizFS);
  const dlg = document.getElementById('answerKeyModal');
  if (!dlg || !grid) return;

  const rowsBox = dlg.querySelector('#akeyRows');
  const passInput = dlg.querySelector('#answerKeyPassMarkInput');
  const countCopy = dlg.querySelector('#answerKeyQuestionCount');
  const saveBtn = dlg.querySelector('#akeySave');
  const questionSectionLabel = String(getQuizQuestionsFieldset(quizFS)?.label || "Quiz Questions").trim() || "Quiz Questions";
  const questionSectionHelp = `Add radio, dropdown, or select boxes inside ${questionSectionLabel} to configure correct answers.`;

  const labelModal = document.getElementById("labelOptionsModal");
  if (labelModal?.style?.display && labelModal.style.display !== "none" && typeof closeLabelOptionsModal === "function") {
    closeLabelOptionsModal();
  }

  rowsBox.replaceChildren();
  syncQuizAnswerKeyRows(quizFS);

  const savedRows = Array.isArray(grid.defaultValue) ? grid.defaultValue : [];
  const questionComponents = getQuizQuestionComponents(quizFS);
  const readLegacyRowValue = (row, keys = []) => {
    for (const key of keys) {
      if (!key) continue;
      const value = row?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return String(value).trim();
      }
    }
    return "";
  };
  const questionRows = questionComponents.map((component, index) => {
    const label = String(component?.label || "").trim();
    const existingRow = savedRows.find(row =>
      String(row?.[componentKey] || "").trim() === String(component?.key || "").trim()
    ) || savedRows.find(row => String(row?.[questionKey] || "").trim() === label) || {};
    const rawAnswer = readLegacyRowValue(existingRow, [
      answerKey,
      "answervalue",
      "correctvalue",
      "correctvalues",
      "correctValueS",
      "quizanswer",
      "answer"
    ]);
    const selectedValues = rawAnswer
      ? rawAnswer.split(",").map(value => value.trim()).filter(Boolean)
      : [];

    return {
      index,
      component,
      label,
      componentKey: String(component?.key || ""),
      selectedValues
    };
  });

  dlg._quizSetupState = {
    quizFS,
    grid,
    passMarkField,
    questionKey,
    answerKey,
    componentKey,
    questionRows
  };

  passInput.value = Math.max(1, Number(passMarkField?.defaultValue) || 1);
  if (countCopy) {
    countCopy.textContent = questionRows.length
      ? `${questionRows.length} question${questionRows.length === 1 ? "" : "s"} found in this quiz.`
      : questionSectionHelp;
  }

  if (!questionRows.length) {
    const emptyState = document.createElement("div");
    emptyState.className = "akey-empty-state";
    emptyState.textContent = questionSectionHelp;
    rowsBox.appendChild(emptyState);
  }

  questionRows.forEach(row => {
    const wrap = document.createElement('section');
    wrap.className = 'akey-row';

    const head = document.createElement('div');
    head.className = 'akey-row-head';

    const title = document.createElement('div');
    title.className = 'akey-q';
    title.textContent = `${row.index + 1}. ${row.label || 'Untitled Question'}`;

    const optionEntries = (row.component?.data?.values || row.component?.values || [])
      .map(option => ({
        label: String(option?.label || option?.value || "").trim(),
        value: String(option?.value || "").trim()
      }))
      .filter(option => option.label && option.value);

    const meta = document.createElement('div');
    meta.className = 'akey-meta';
    meta.textContent = row.component?.type === "selectboxes"
      ? "Select one or more correct answers."
      : "Select the correct answer.";

    head.append(title, meta);
    wrap.appendChild(head);

    const optsBox = document.createElement('div');
    optsBox.className = 'akey-opts';

    if (!optionEntries.length) {
      const empty = document.createElement('div');
      empty.className = 'akey-empty';
      empty.textContent = 'Add options to this question before setting the answer key.';
      optsBox.appendChild(empty);
    } else {
      const splitOptionLabel = (label) => {
        const text = String(label || "").trim();
        const match = text.match(/^([A-Za-z0-9]+[.)])\s+(.+)$/);
        return match
          ? { prefix: match[1], text: match[2] }
          : { prefix: "", text };
      };

      const isSelected = option => row.selectedValues.some(selected =>
        String(selected || "").trim().toLowerCase() === option.value.toLowerCase()
        || String(selected || "").trim().toLowerCase() === option.label.toLowerCase()
      );

      optionEntries.forEach(option => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'akey-opt';
        btn.dataset.optionValue = option.value;
        btn.dataset.optionLabel = option.label;
        btn.title = option.label;
        const initiallySelected = isSelected(option);
        if (initiallySelected) btn.classList.add('sel');
        btn.setAttribute('aria-pressed', initiallySelected ? 'true' : 'false');
        btn.setAttribute('aria-label', option.label);

        const { prefix, text } = splitOptionLabel(option.label);
        if (prefix) {
          const prefixEl = document.createElement('span');
          prefixEl.className = 'akey-opt-prefix';
          prefixEl.textContent = prefix;
          btn.appendChild(prefixEl);
        }

        const textEl = document.createElement('span');
        textEl.className = 'akey-opt-text';
        textEl.textContent = text;
        btn.appendChild(textEl);

        btn.onclick = () => {
          if (row.component?.type === 'selectboxes') {
            if (isSelected(option)) {
              row.selectedValues = row.selectedValues.filter(selected =>
                String(selected || "").trim().toLowerCase() !== option.value.toLowerCase()
                && String(selected || "").trim().toLowerCase() !== option.label.toLowerCase()
              );
            } else {
              row.selectedValues = [...row.selectedValues, option.value];
            }
          } else {
            row.selectedValues = [option.value];
          }

          optsBox.querySelectorAll('.akey-opt').forEach(button => {
            const buttonLabel = String(button.dataset.optionLabel || button.textContent || "").trim().toLowerCase();
            const buttonValue = String(button.dataset.optionValue || "").trim().toLowerCase();
            const selected = row.selectedValues.some(selectedValue => {
              const normalized = String(selectedValue || "").trim().toLowerCase();
              return normalized === buttonLabel || normalized === buttonValue;
            });
            button.classList.toggle('sel', selected);
            button.setAttribute('aria-pressed', selected ? 'true' : 'false');
          });
        };

        optsBox.appendChild(btn);
      });
    }

    wrap.appendChild(optsBox);
    rowsBox.appendChild(wrap);
  });

  if (dlg._currentOverlay) {
    dlg._currentOverlay.remove();
    dlg._currentOverlay = null;
  }

  const overlay = createOverlay(1999);
  dlg._currentOverlay = overlay;
  dlg.classList.add('super-top');
  dlg.style.display = 'flex';

  if (saveBtn) {
    saveBtn.onclick = () => {
      const state = dlg._quizSetupState;
      if (!state) return;

      state.grid.defaultValue = state.questionRows.map(row => ({
        [state.questionKey]: row.label,
        [state.answerKey]: row.selectedValues.join(', '),
        ...(state.componentKey ? { [state.componentKey]: row.componentKey } : {})
      }));

      if (state.passMarkField) {
        state.passMarkField.defaultValue = Math.max(1, Number(passInput?.value) || 1);
      }

      closeAnswerKeyModal({ refresh: true });
      showNotification('Quiz setup saved.', 'info', 1500);
    };
  }

  enableModalKeys(dlg, saveBtn, closeAnswerKeyModal);
}


function closeAnswerKeyModal(options = {}){
  const dlg = document.getElementById('answerKeyModal');
  disableModalKeys(dlg);
  if (!dlg) return;
  dlg.style.display = 'none';
  dlg.classList.remove('super-top');
  delete dlg._quizSetupState;
  if (dlg._currentOverlay) {
    dlg._currentOverlay.remove();
    dlg._currentOverlay = null;
  }
  if (options.refresh) {
    updatePreview();
  }
}

window.closeAnswerKeyModal = closeAnswerKeyModal;
window.syncQuizAnswerKeyRows = syncQuizAnswerKeyRows;


/* ---------------- Main component-list Sortable ---------------- */
Sortable.create(document.getElementById('componentList'), {
  group          : 'builder',
  setData(dataTransfer, dragEl) {
    suppressNativeDragPreview(dataTransfer);
    dataTransfer?.setData?.("text/plain", dragEl?.dataset?.key || "builder-component");
  },
  direction      : 'vertical',
  animation      : 120,
  easing         : 'cubic-bezier(.22,1,.36,1)',
  draggable      : '.component-card:not(.placeholder):not(.component-card--virtual-root):not(.component-card--root-static)',
  handle         : COMPONENT_DRAG_HANDLE_SELECTOR,
  fallbackOnBody : false,
  fallbackTolerance: 8,
  ghostClass     : 'drag-ghost',
  chosenClass    : 'drag-chosen',

  onStart : evt => {
    suppressNativeDragPreview(evt?.originalEvent?.dataTransfer);
    beginBuilderDrag(evt.item);
  },

  onEnd : evt => {
    if (suppressNextComponentListDragEnd) {
      suppressNextComponentListDragEnd = false;
      endBuilderDrag();
      return;
    }

    const { item } = evt;
    const srcKey   = item.dataset.key;

    /* ── A · dropped **inside** an existing columns-row (handled by the
            inner Sortable attached in attachInnerSortables) ─────────── */
    if (item.parentNode?.classList?.contains('columns-row')) {
      endBuilderDrag();
      return;                       // inner Sortable already updated JSON
    }

    /* ── B · dropped on a dashed placeholder (inside a Columns row) ── */
    const dropTarget = findAdjacentColumnPlaceholder(item);
    if (dropTarget) {
      moveComponentIntoColumn(
        srcKey,
        dropTarget.target.columnsKey,
        dropTarget.target.colIdx,
        item.__json,               // cached JSON from onRemove
        { animateDrop: true }
      );
      delete item.__json;
      updatePreview();
      endBuilderDrag();
      return;
    }

    /* ── C · card dragged **out** of a column back into the main list ── */
    if (item.dataset.ownerKey) {
      const moved =
        item.__json ||
        removeComponentInColumn(item.dataset.ownerKey,
                                Number(item.dataset.col));

      if (moved) {
        const destArr = getActiveBuilderDestination();
        const visibleChildren = getBuilderListVisibleChildren(item.parentNode);
        const newVisibleIdx = visibleChildren.indexOf(item);
        const insertVisibleIdx = newVisibleIdx === -1
          ? visibleChildren.length
          : newVisibleIdx;
        const insertIdx = getActualArrayIndexForVisiblePosition(destArr, insertVisibleIdx);

        destArr.splice(insertIdx, 0, moved);
        delete item.__json;
      }

      item.removeAttribute('data-owner-key');
      item.removeAttribute('data-owner');
      item.removeAttribute('data-col');

      updatePreview();
      endBuilderDrag();
      return;
    }

    /* ── D · plain up/down re-order inside the current list ─────────── */
    const visibleChildren = getBuilderListVisibleChildren(evt.to);
    const newVisibleIdx = visibleChildren.indexOf(item);
    if (newVisibleIdx !== -1) {
      reorderComponents(srcKey, newVisibleIdx);   // moves JSON + updatePreview()
    }

    endBuilderDrag();
  }
});


  



  const listEl = document.getElementById('componentList');
  const tail   = document.createElement('div');
  tail.className = 'list-tail-dropzone';   // purely CSS – see below
  listEl.appendChild(tail);

  listEl.addEventListener('click', e => {
    const labelEl = e.target.closest('.comp-label');
    if (!labelEl) return;                       // not a label
  
    const path = labelEl.dataset.path;
    const comp = getComponentByPath(path);
    if (!comp) return;

    startInlineComponentLabelEdit(labelEl, comp);
  });

  window.addEventListener("resize", () => {
    requestAnimationFrame(applyInitialBuilderVerticalOffset);
    requestAnimationFrame(syncBuilderListScrollHeight);
    requestAnimationFrame(() => {
      syncBuilderSectionRailState({ ensureSelectedVisible: true, behavior: "auto" });
    });
    requestAnimationFrame(syncBuilderInsertionAnchorState);
  });
  


  // Initial refresh
  updatePreview({ recalculateVerticalOffset: true });
  syncBuilderInsertionAnchorState();
  

  
  
  /* ---------- Import-JSON modal ---------- */
  const importBtn      = document.getElementById('importJsonBtn');
  const importModal    = document.getElementById('importJsonModal');
  const importTextarea = document.getElementById('importJsonTextarea');
  const importLoadBtn  = document.getElementById('importJsonLoadBtn');
  const overlay        = document.getElementById('overlay');

  if (typeof blockDragDropForElement === 'function') {
    blockDragDropForElement(importModal);
    blockDragDropForElement(importTextarea);
  }

  function focusImportJsonTextarea() {
    requestAnimationFrame(() => {
      if (!importTextarea) return;
      importTextarea.focus();
      const end = importTextarea.value.length;
      importTextarea.setSelectionRange(end, end);
    });
  }

  function openImportJsonModal() {
    if (!importModal || !overlay || !importTextarea) return;

    if (typeof disableModalKeys === 'function') {
      disableModalKeys(importModal);
    }

    importTextarea.value = '';
    importModal.style.display = 'block';
    showSharedOverlay(overlay);

    if (typeof enableModalKeys === 'function') {
      enableModalKeys(importModal, importLoadBtn, closeImportJsonModal);
    }

    focusImportJsonTextarea();
  }
  window.openImportJsonModal = openImportJsonModal;

  function closeImportJsonModal() {
    if (typeof disableModalKeys === 'function') {
      disableModalKeys(importModal);
    }

    if (importModal) {
      importModal.style.display = 'none';
    }
    if (overlay) {
      hideSharedOverlay(overlay);
    }
  }
  window.closeImportJsonModal = closeImportJsonModal;

  if (importBtn) {
    importBtn.addEventListener('click', openImportJsonModal);
  }
  if (importLoadBtn) {
    importLoadBtn.addEventListener('click', () => {
      try {
        const imported = JSON.parse(importTextarea.value.trim() || '{}');
  
        /* ----- CASE 1: full form JSON (has .components array) ----- */
        if (Array.isArray(imported.components)) {
          window.formJSON = typeof window.normalizeBuilderFormJSON === "function"
            ? window.normalizeBuilderFormJSON(imported)
            : imported;
          if (typeof window.sanitizeComponentSchema === "function") {
            window.sanitizeComponentSchema(window.formJSON.components);
          }
          window.applySavedActionBundleVisibility?.(window.formJSON.components);
          window.applySavedQuizVisibility?.(window.formJSON.components);
          selectedFieldsetKey = 'root';
          window._usedKeys = {};
          window._actionsCounter = getNextBuilderActionsCounter(window.formJSON.components);
          registerExistingKeys(formJSON.components);
  
          updatePreview();
          closeImportJsonModal();
          showNotification('JSON imported successfully!');
          return;                               // ← done
        }
  
        /* ----- CASE 2: single-component JSON ----------------------- */
        if (imported && typeof imported === 'object' && imported.type) {
          delete imported.builderHidden;
    
          formJSON.components.push(imported);
          if (typeof window.sanitizeComponentSchema === "function") {
            window.sanitizeComponentSchema(window.formJSON.components);
          }
          window.applySavedActionBundleVisibility?.(window.formJSON.components);
          window.applySavedQuizVisibility?.(window.formJSON.components);
          window._usedKeys = {};
          window._actionsCounter = getNextBuilderActionsCounter(window.formJSON.components);
          registerExistingKeys(formJSON.components);
          updatePreview();
          const qFs = findAncestorQuiz(selectedFieldsetKey);
          if (qFs && isQuizAnswerComponent(imported)) {
            syncAnswerKeyRow(qFs, imported);
            syncQuizAnswerKeyRows(qFs);
          }
          closeImportJsonModal();
          showNotification('Component added to the root grouping!');
          return;                               // ← done
        }
  
        /* ----- otherwise: invalid structure ------------------------ */
        throw new Error('JSON must be either a full form (with "components") or a single component object.');
  
      } catch (err) {
        console.error(err);
        showNotification('Invalid JSON: ' + err.message);
        focusImportJsonTextarea();
      }
    });
  }

  function hideActionsBundles(components = []) {
    window.applySavedActionBundleVisibility?.(components);
    window.applySavedQuizVisibility?.(components);
  }

  window.closeImportJsonModal = closeImportJsonModal;
});


async function resetBuilderWorkspace(options = {}) {
  const {
    silent = false,
    clearUndoHistory = false
  } = options;
  try {
    sessionTimerController?.pause?.();
    sessionTimerController?.reset?.();

    formJSON.components = [];
    selectedFieldsetKey = "root";
    builderInsertionAnchorKey = null;
    currentSelectedComponentPath = null;
    window._currentEditingComponent = null;
    window._currentTemplateId = null;
    window._currentTemplateVersionId = null;
    window._currentTplName = '';
    window._usedKeys = {};
    window._actionsCounter = 0;

    openMenuKeys.clear();
    hoverMenuKeys.clear();
    clearPendingColumnInsertTarget();

    registerExistingKeys(formJSON.components);
    updatePreview();
    if (clearUndoHistory) {
      resetBuilderUndoHistory();
    }
    resetBuilderTelemetry();
    sessionTimerController?.refreshStats?.();
    if (!silent) {
      showNotification("Builder reset", "info");
    }
    return true;
  } catch (err) {
    showNotification(`Reset failed: ${String(err?.message || err)}`, "error");
    return false;
  }
}

window.resetBuilderWorkspace = resetBuilderWorkspace;

const saveTemplateBtn = document.getElementById('saveTemplateBtn');
const saveTemplateModal = document.getElementById('saveTemplateModal');
const saveTemplateNameInput = document.getElementById('saveTemplateNameInput');
const saveTemplateCancelBtn = document.getElementById('saveTemplateCancelBtn');
const saveTemplateConfirmBtn = document.getElementById('saveTemplateConfirmBtn');
const saveTemplateTranslateBtn = document.getElementById('saveTemplateTranslateBtn');
const saveTemplateTranslationLanguageSelect = document.getElementById('saveTemplateTranslationLanguageSelect');
const saveTemplateModalTitle = document.getElementById('saveTemplateModalTitle');
const saveTemplateModalCopy = document.getElementById('saveTemplateModalCopy');
const overlay = document.getElementById('overlay');
let isSavingTemplate = false;
let activeSaveTemplateAction = 'save';

function isEditingSavedTemplate() {
  return Boolean(window._currentTemplateId);
}

function estimateBuilderPayloadBytes(value) {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return 0;
  }
}

function setSaveTemplateBusy(isBusy) {
  isSavingTemplate = Boolean(isBusy);
  if (saveTemplateBtn) {
    saveTemplateBtn.disabled = isSavingTemplate;
    if (!isSavingTemplate) {
      saveTemplateBtn.blur();
    }
  }
}

function getSaveTemplateButtonLabels(action = 'save', isBusy = false) {
  const createNewTemplate = !isEditingSavedTemplate();
  const saveIdleLabel = createNewTemplate ? 'Save Template' : 'Save Version';
  const translateIdleLabel = createNewTemplate ? 'Save & Translate' : 'Save Version & Translate';

  if (!isBusy) {
    return {
      saveLabel: saveIdleLabel,
      translateLabel: translateIdleLabel
    };
  }

  return {
    saveLabel: action === 'save'
      ? (createNewTemplate ? 'Saving Template...' : 'Saving Version...')
      : saveIdleLabel,
    translateLabel: action === 'translate'
      ? (createNewTemplate ? 'Saving & Translating...' : 'Saving Version & Translating...')
      : translateIdleLabel
  };
}

function setSaveTemplateModalBusy(isBusy, action = activeSaveTemplateAction) {
  setSaveTemplateBusy(isBusy);
  if (saveTemplateNameInput) {
    saveTemplateNameInput.disabled = Boolean(isBusy);
  }
  if (saveTemplateCancelBtn) {
    saveTemplateCancelBtn.disabled = Boolean(isBusy);
  }
  if (saveTemplateTranslationLanguageSelect) {
    saveTemplateTranslationLanguageSelect.disabled = Boolean(isBusy);
  }

  const labels = getSaveTemplateButtonLabels(action, Boolean(isBusy));
  if (saveTemplateConfirmBtn) {
    saveTemplateConfirmBtn.disabled = Boolean(isBusy);
    saveTemplateConfirmBtn.textContent = labels.saveLabel;
  }
  if (saveTemplateTranslateBtn) {
    saveTemplateTranslateBtn.disabled = Boolean(isBusy);
    saveTemplateTranslateBtn.textContent = labels.translateLabel;
  }
}

function focusSaveTemplateNameInput() {
  requestAnimationFrame(() => {
    if (!saveTemplateNameInput || saveTemplateNameInput.disabled) return;
    saveTemplateNameInput.focus();
    saveTemplateNameInput.select();
  });
}

function openSaveTemplateModal() {
  if (!saveTemplateModal || !saveTemplateNameInput || !overlay) return;

  if (typeof disableModalKeys === 'function') {
    disableModalKeys(saveTemplateModal);
  }

  const createNewTemplate = !isEditingSavedTemplate();
  if (saveTemplateModalTitle) {
    saveTemplateModalTitle.textContent = createNewTemplate ? 'Save Template' : 'Save Template Version';
  }
  if (saveTemplateModalCopy) {
    saveTemplateModalCopy.textContent = createNewTemplate
      ? 'Name this template before saving it to your library.'
      : 'Update the template name before saving a new version to your library.';
  }
  if (saveTemplateNameInput) {
    saveTemplateNameInput.value = String(window._currentTplName || '').trim();
  }

  activeSaveTemplateAction = 'save';
  setSaveTemplateModalBusy(false, 'save');
  saveTemplateModal.style.display = 'block';
  saveTemplateModal.setAttribute('aria-hidden', 'false');
  showSharedOverlay(overlay);

  if (typeof enableModalKeys === 'function') {
    enableModalKeys(saveTemplateModal, saveTemplateConfirmBtn, closeSaveTemplateModal, true);
  }

  focusSaveTemplateNameInput();
}

function closeSaveTemplateModal(force = false) {
  if (!force && isSavingTemplate) return;

  if (typeof disableModalKeys === 'function') {
    disableModalKeys(saveTemplateModal);
  }
  if (saveTemplateModal) {
    saveTemplateModal.style.display = 'none';
    saveTemplateModal.setAttribute('aria-hidden', 'true');
  }
  if (overlay) {
    hideSharedOverlay(overlay);
  }
}

window.closeSaveTemplateModal = closeSaveTemplateModal;

async function requestTranslatedBuilderJson({ definition, targetLanguage, outputMode }) {
  const response = await fetch('/api/ai/translate-template', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      definition,
      targetLanguage,
      outputMode
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || 'Translation failed.');
  }

  return payload;
}

function getSaveTemplateTranslationOptions() {
  return {
    targetLanguage: String(saveTemplateTranslationLanguageSelect?.value || 'fr').trim().toLowerCase() || 'fr',
    outputMode: 'wrapper',
    languageLabel: saveTemplateTranslationLanguageSelect?.selectedOptions?.[0]?.textContent?.trim()
      || String(saveTemplateTranslationLanguageSelect?.value || 'fr').trim().toLowerCase()
      || 'fr'
  };
}

function getTranslationOutputLabel() {
  return 'bilingual JSON';
}

async function saveCurrentTemplate(templateName = window._currentTplName || '', options = {}) {
  const trimmedName = String(templateName || '').trim();
  const action = options.action === 'translate' ? 'translate' : 'save';
  if (!trimmedName) {
    showNotification('Template name is required.', 'warn');
    focusSaveTemplateNameInput();
    return;
  }

  const clean = getCurrentBuilderExportJSON();
  const telemetry = getBuilderTelemetrySnapshot();
  const payloadBytes = estimateBuilderPayloadBytes(clean);
  if (payloadBytes > (5 * 1024 * 1024)) {
    showNotification('Large template detected. Save may take longer than usual.', 'warn', 3200);
  }

  const createNewTemplate = !isEditingSavedTemplate();
  const endpoint = createNewTemplate
    ? '/api/templates'
    : `/api/templates/${encodeURIComponent(window._currentTemplateId)}/versions`;
  const successLabel = createNewTemplate ? 'Template saved' : 'Template version saved';
  const clipboardCopyPromise = action === 'save'
    ? copyCurrentBuilderJsonToClipboard(clean)
      .then(() => ({ ok: true, kind: 'current' }))
      .catch((error) => {
        console.error('Auto copy error:', error);
        return { ok: false, error, kind: 'current' };
      })
    : Promise.resolve({ ok: false, skipped: true, kind: 'translated' });

  try {
    activeSaveTemplateAction = action;
    setSaveTemplateModalBusy(true, action);
    const r = await fetch(endpoint, {
      method :'POST',
      headers:{ 'Content-Type':'application/json' },
      body   : JSON.stringify({
        name: trimmedName,
        json: clean,
        telemetry
      })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Failed to save template.');

    window._currentTemplateId = data.templateId || window._currentTemplateId;
    window._currentTemplateVersionId = data.versionId || window._currentTemplateVersionId;
    window._currentTplName = data.name || trimmedName;
    try {
      localStorage.setItem('templateLibraryRefreshHint', JSON.stringify({
        templateId: String(data.templateId || window._currentTemplateId || '').trim(),
        updatedAt: Date.now()
      }));
    } catch (err) {
      console.warn('Could not persist template library refresh hint.', err);
    }
    try {
      sessionStorage.removeItem('templateLibraryState');
    } catch (err) {
      console.warn('Could not clear template library cache.', err);
    }

    closeSaveTemplateModal(true);
    let clipboardCopyResult = await clipboardCopyPromise;

    if (action === 'translate') {
      const translationOptions = getSaveTemplateTranslationOptions();
      try {
        const translated = await requestTranslatedBuilderJson({
          definition: clean,
          targetLanguage: translationOptions.targetLanguage,
          outputMode: translationOptions.outputMode
        });
        await writeTextToClipboard(JSON.stringify(translated, null, 2));
        clipboardCopyResult = {
          ok: true,
          kind: 'translated',
          languageLabel: translationOptions.languageLabel,
          outputLabel: getTranslationOutputLabel(translationOptions.outputMode)
        };
      } catch (error) {
        console.error('Template translation failed:', error);
        clipboardCopyResult = {
          ok: false,
          kind: 'translated',
          error,
          languageLabel: translationOptions.languageLabel,
          outputLabel: getTranslationOutputLabel(translationOptions.outputMode)
        };
      }
    }

    const resetOk = await resetBuilderWorkspace({
      silent: true,
      clearUndoHistory: true
    });
    if (!resetOk) {
      showNotification(
        data.name
          ? clipboardCopyResult.ok
            ? clipboardCopyResult.kind === 'translated'
              ? `${successLabel}: ${data.name}. ${clipboardCopyResult.languageLabel} ${clipboardCopyResult.outputLabel} copied to clipboard. Builder reset failed.`
              : `${successLabel}: ${data.name}. JSON copied to clipboard. Builder reset failed.`
            : clipboardCopyResult.kind === 'translated'
              ? `${successLabel}: ${data.name}. Builder reset failed, and the translated payload was not copied.`
              : `${successLabel}: ${data.name}. Builder reset failed, and JSON was not copied.`
          : clipboardCopyResult.ok
            ? clipboardCopyResult.kind === 'translated'
              ? `${successLabel}. ${clipboardCopyResult.languageLabel} ${clipboardCopyResult.outputLabel} copied to clipboard. Builder reset failed.`
              : `${successLabel}. JSON copied to clipboard. Builder reset failed.`
            : clipboardCopyResult.kind === 'translated'
              ? `${successLabel}, but builder reset failed and the translated payload was not copied.`
              : `${successLabel}, but builder reset failed and JSON was not copied.`,
        'warn'
      );
      return;
    }
    showNotification(
      data.name
        ? clipboardCopyResult.ok
          ? clipboardCopyResult.kind === 'translated'
            ? `${successLabel}: ${data.name}. ${clipboardCopyResult.languageLabel} ${clipboardCopyResult.outputLabel} copied to clipboard.`
            : `${successLabel}: ${data.name}. JSON copied to clipboard.`
          : clipboardCopyResult.kind === 'translated'
            ? `${successLabel}: ${data.name}, but the translated payload could not be copied to the clipboard.`
            : `${successLabel}: ${data.name}, but JSON could not be copied to the clipboard.`
        : clipboardCopyResult.ok
          ? clipboardCopyResult.kind === 'translated'
            ? `${successLabel}. ${clipboardCopyResult.languageLabel} ${clipboardCopyResult.outputLabel} copied to clipboard.`
            : `${successLabel}. JSON copied to clipboard.`
          : clipboardCopyResult.kind === 'translated'
            ? `${successLabel}, but the translated payload could not be copied to the clipboard.`
            : `${successLabel}, but JSON could not be copied to the clipboard.`,
      clipboardCopyResult.ok ? 'success' : 'warn'
    );
  } catch (err) {
    const clipboardCopyResult = await clipboardCopyPromise;
    showNotification(
      action === 'save' && clipboardCopyResult.ok
        ? `Save failed: ${err.message}. Current JSON was still copied to clipboard.`
        : 'Save failed: ' + err.message,
      'error'
    );
    focusSaveTemplateNameInput();
  } finally {
    activeSaveTemplateAction = 'save';
    setSaveTemplateModalBusy(false, 'save');
  }
}

if (saveTemplateBtn) {
  saveTemplateBtn.addEventListener('click', () => {
    openSaveTemplateModal();
  });
}

if (saveTemplateConfirmBtn) {
  saveTemplateConfirmBtn.addEventListener('click', () => {
    saveCurrentTemplate(saveTemplateNameInput?.value || '', { action: 'save' });
  });
}

if (saveTemplateTranslateBtn) {
  saveTemplateTranslateBtn.addEventListener('click', () => {
    saveCurrentTemplate(saveTemplateNameInput?.value || '', { action: 'translate' });
  });
}



/* ---------------------------------------------------------------
   Small toast helper – use   showNotification('Saved', 'error')
   kind = info | warn | error   (default = 'info')
/* ------------------------------------------------------------------ */
(function () {
  const tray      = document.createElement('div');
  tray.id         = 'notifyTray';
  document.body.appendChild(tray);

  const DEFAULT_TTL = 2000;   // 2 s
  const FADE_MS     = 250;    // CSS transition time

  window.showNotification = function (msg, kind = 'info', ttl = DEFAULT_TTL) {
    const card = document.createElement('div');
    card.className = `notify-card ${kind}`;
    card.textContent = msg;
    card.style.setProperty('--ttl', `${ttl}ms`);  // drives shimmer length

    tray.appendChild(card);

    /* fade-in */
    requestAnimationFrame(() => card.classList.add('show'));

    /* fade-out after TTL */
    setTimeout(() => card.classList.remove('show'), ttl);

    /* remove after fade-out completes */
    card.addEventListener('transitionend', () => {
      if (!card.classList.contains('show')) card.remove();
    });
  };
})();
