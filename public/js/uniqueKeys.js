// public/js/uniqueKeys.js
// ----------------------------------------------------
// ONE global registry that every file & module shares
// ----------------------------------------------------
window._usedKeys = window._usedKeys || {};

function stripUnicodeSymbols(value = "") {
  const text = String(value ?? "");
  try {
    return text.replace(new RegExp("\\p{S}+", "gu"), " ");
  } catch {
    return text;
  }
}

function asciiTokens(value = "") {
  let text = stripUnicodeSymbols(value);

  if (typeof text.normalize === "function") {
    text = text.normalize("NFKD");
  }

  return text
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x00-\x7F]/g, " ")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function lowerCamelFromTokens(tokens = []) {
  return tokens
    .map((token, index) => {
      const lower = String(token || "").toLowerCase();
      if (!lower) return "";
      if (index === 0) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

const TITLE_CASE_MINOR_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "en", "for", "if",
  "in", "nor", "of", "on", "or", "per", "the", "to", "via"
]);
const SPECIAL_TITLE_TOKENS = new Map([
  ["AED", "AED"],
  ["API", "API"],
  ["CAD", "CAD"],
  ["CPR", "CPR"],
  ["CSA", "CSA"],
  ["DOB", "DOB"],
  ["GPS", "GPS"],
  ["H2S", "H2S"],
  ["HSE", "HSE"],
  ["ID", "ID"],
  ["IDS", "IDs"],
  ["JHA", "JHA"],
  ["JSA", "JSA"],
  ["MSDS", "MSDS"],
  ["N/A", "N/A"],
  ["OHS", "OHS"],
  ["PDF", "PDF"],
  ["PPE", "PPE"],
  ["SDS", "SDS"],
  ["SIN", "SIN"],
  ["SOP", "SOP"],
  ["SWP", "SWP"],
  ["TDG", "TDG"],
  ["TSSA", "TSSA"],
  ["UV", "UV"],
  ["WHMIS", "WHMIS"],
  ["WSIB", "WSIB"]
]);

function formatAllCapsTitleCore(core = "", options = {}) {
  const isEdgeWord = options.isEdgeWord === true;
  const specialCore = SPECIAL_TITLE_TOKENS.get(core.toUpperCase());
  if (specialCore) {
    return specialCore;
  }

  if (/[A-Z]/.test(core) && /\d/.test(core)) {
    return core;
  }

  if (!core.includes("-") && !core.includes("/")) {
    const lowerCore = core.toLowerCase();
    if (!isEdgeWord && TITLE_CASE_MINOR_WORDS.has(lowerCore)) {
      return lowerCore;
    }
    return lowerCore.charAt(0).toUpperCase() + lowerCore.slice(1);
  }

  return core
    .split(/([/-])/)
    .map(part => {
      if (part === "-" || part === "/") return part;
      const specialPart = SPECIAL_TITLE_TOKENS.get(part.toUpperCase());
      if (specialPart) {
        return specialPart;
      }
      if (/[A-Z]/.test(part) && /\d/.test(part)) {
        return part;
      }
      const lowerPart = part.toLowerCase();
      return lowerPart.charAt(0).toUpperCase() + lowerPart.slice(1);
    })
    .join("");
}
const AUTO_OTHER_OPTION_LABEL = "Other";
const AUTO_OTHER_SPECIFY_LABEL = "Other Specify";

function normalizeAllCapsTitle(value = "") {
  const trimmed = String(value ?? "").trim();
  if (!trimmed || !/[A-Z]/.test(trimmed) || /[a-z]/.test(trimmed)) {
    return trimmed;
  }

  const words = trimmed.split(/\s+/);
  return words
    .map((word, index) => {
      const match = word.match(/^([^A-Za-z0-9]*)([A-Za-z0-9][A-Za-z0-9'/-]*)([^A-Za-z0-9]*)$/);
      if (!match) return word;

      const [, prefix, core, suffix] = match;
      const formattedCore = formatAllCapsTitleCore(core, {
        isEdgeWord: index === 0 || index === words.length - 1
      });

      return `${prefix}${formattedCore}${suffix}`;
    })
    .join(" ");
}

function normalizeComponentLabel(value = "", componentType = "") {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return trimmed;
  return normalizeAllCapsTitle(trimmed);
}

function sanitizeIdentifier(value = "", fallback = "key", options = {}) {
  const allowLeadingDigit = options.allowLeadingDigit === true;
  const primary = lowerCamelFromTokens(asciiTokens(value));
  const fallbackBase = lowerCamelFromTokens(asciiTokens(fallback))
    || (allowLeadingDigit ? "option" : "key");

  let out = primary || fallbackBase;
  if (!out) {
    return allowLeadingDigit ? "option" : "key";
  }

  if (!allowLeadingDigit && /^[0-9]/.test(out)) {
    out = `${fallbackBase}${out.charAt(0).toUpperCase()}${out.slice(1)}`;
  }

  return out || fallbackBase || (allowLeadingDigit ? "option" : "key");
}

function makeUniqueSanitizedValue(seed = "", registry = new Set(), fallback = "key", options = {}) {
  const base = sanitizeIdentifier(seed, fallback, options);
  let value = base;
  let i = 1;

  while (registry.has(value)) {
    value = `${base}${i++}`;
  }

  return value;
}

function normalizeLowerCamelCase(value = "", fallback = "key") {
  return sanitizeIdentifier(value, fallback, { allowLeadingDigit: false });
}

function isUsedKey(key = "") {
  return !!window._usedKeys[normalizeLowerCamelCase(key)];
}

function reserveUsedKey(key = "") {
  const normalizedKey = normalizeLowerCamelCase(key);
  window._usedKeys[normalizedKey] = true;
  return normalizedKey;
}

function releaseUsedKey(key = "") {
  const normalizedKey = normalizeLowerCamelCase(key);
  delete window._usedKeys[normalizedKey];
}

/**
 * Slug‑ify and then, if needed, append a counter so that
 * every key you hand out is unique for this session.
 */
function generateUniqueKey(label = "") {
  const base = normalizeLowerCamelCase(label, "key");
  let   key  = base;
  let   i    = 1;
  while (isUsedKey(key)) {
    key = `${base}${i++}`;
  }
  return reserveUsedKey(key);
}

/**
 * Try “base+preferredDigits” first; if that’s already
 * been used, fall back to generateUniqueKey(base).
 */
function ensureGloballyUniqueKey(base, preferredDigits = "") {
  const candidate = normalizeLowerCamelCase(`${base || ""}${preferredDigits || ""}`, "key");
  if (!isUsedKey(candidate)) {
    return reserveUsedKey(candidate);
  }
  return generateUniqueKey(base);
}

/**
 * If you ever rename a component, delete the oldKey
 * from the registry so it can be re‑used.
 */
function updateUniqueKey(oldKey, newLabel) {
  if (oldKey) {
    releaseUsedKey(oldKey);
  }
  return generateUniqueKey(newLabel);
}

function normalizeOptionValue(value = "", fallback = "option") {
  return sanitizeIdentifier(value, fallback, { allowLeadingDigit: true });
}

function normalizeChoiceItems(items = [], fallback = "option") {
  const used = new Set();
  const valueMap = {};

  const normalizedItems = items
    .map((item, index) => {
      if (typeof item === "string") {
        const label = normalizeAllCapsTitle(item.trim());
        if (!label) return null;
        const value = makeUniqueSanitizedValue(label, used, `${fallback}${index + 1}`, {
          allowLeadingDigit: true
        });
        used.add(value);
        if (label !== value && !Object.prototype.hasOwnProperty.call(valueMap, label)) {
          valueMap[label] = value;
        }
        return { label, value };
      }

      if (!item || typeof item !== "object") return null;

      const label = normalizeAllCapsTitle(String(item.label ?? item.value ?? "").trim());
      if (!label) return null;

      const rawValue = item.value ?? label;
      const rawValueText = String(rawValue);
      const value = makeUniqueSanitizedValue(label || rawValueText, used, `${fallback}${index + 1}`, {
        allowLeadingDigit: true
      });
      used.add(value);

      if (rawValueText !== value && !Object.prototype.hasOwnProperty.call(valueMap, rawValueText)) {
        valueMap[rawValueText] = value;
      }

      return { ...item, label, value };
    })
    .filter(Boolean);

  return {
    items: normalizedItems,
    valueMap
  };
}

function eachNestedComponent(component, visitArray) {
  if (Array.isArray(component?.components)) {
    visitArray(component.components);
  }
  if (component?.type === "columns" && Array.isArray(component.columns)) {
    component.columns.forEach(column => {
      if (Array.isArray(column?.components)) {
        visitArray(column.components);
      }
    });
  }
}

function isAutoOtherChoiceComponent(component) {
  return Boolean(
    component
    && typeof component === "object"
    && !component.builderHidden
    && component.builderDisableAutoOther !== true
    && (component.type === "select" || component.type === "selectboxes")
  );
}

function isAutoOtherExcludedChoiceComponent(component, parentComponent = null, ancestorComponents = []) {
  if (
    !component
    || typeof component !== "object"
    || !["select", "selectboxes"].includes(component.type)
  ) {
    return false;
  }

  if (component.builderDisableAutoOther === true) {
    return true;
  }

  const lineage = [
    ...((Array.isArray(ancestorComponents) ? ancestorComponents : []).filter(Boolean)),
    parentComponent
  ].filter(Boolean);

  if (lineage.some(ancestor => ancestor?.customType === "quiz")) {
    return true;
  }

  if (
    component.type === "selectboxes"
    && /^actions\d*$/i.test(String(component.key || "").trim())
  ) {
    return Boolean(
      parentComponent
      && typeof parentComponent === "object"
      && parentComponent.type === "fieldset"
      && parentComponent.builderHidden === true
    );
  }

  return Boolean(
    parentComponent
    && typeof parentComponent === "object"
    && parentComponent.type === "tasks"
  );
}

function normalizeOtherToken(value = "") {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function isOtherOption(option) {
  if (!option || typeof option !== "object") return false;
  return normalizeOtherToken(option.label) === "other"
    || normalizeOtherToken(option.value) === "other";
}

function createUniqueOtherValue(usedValues = new Set()) {
  let nextValue = "other";
  let suffix = 1;

  while (usedValues.has(nextValue)) {
    nextValue = `other${suffix++}`;
  }

  return nextValue;
}

function getChoiceOptions(component) {
  if (component?.type === "select") {
    component.data = component.data && typeof component.data === "object"
      ? component.data
      : {};
    component.data.values = Array.isArray(component.data.values)
      ? component.data.values
      : [];
    return component.data.values;
  }

  if (component?.type === "selectboxes") {
    component.values = Array.isArray(component.values)
      ? component.values
      : [];
    return component.values;
  }

  return [];
}

function hasOtherOptionOnChoiceComponent(component) {
  return getChoiceOptions(component).some(isOtherOption);
}

function ensureOtherOptionOnChoiceComponent(component) {
  if (!isAutoOtherChoiceComponent(component)) {
    return { changed: false, otherValue: "" };
  }

  const currentOptions = getChoiceOptions(component);
  const regularOptions = [];
  const otherOptions = [];

  currentOptions.forEach((option) => {
    if (!option || typeof option !== "object") return;
    if (isOtherOption(option)) {
      otherOptions.push({ ...option });
      return;
    }
    regularOptions.push({ ...option });
  });

  const usedValues = new Set(
    regularOptions
      .map(option => String(option?.value ?? "").trim())
      .filter(Boolean)
  );
  const seedOther = otherOptions[0] || {};
  const preferredValue = String(seedOther.value ?? "").trim();
  const otherValue = preferredValue && !usedValues.has(preferredValue)
    ? preferredValue
    : createUniqueOtherValue(usedValues);
  const normalizedOther = component.type === "selectboxes"
    ? {
        ...seedOther,
        label: AUTO_OTHER_OPTION_LABEL,
        value: otherValue,
        shortcut: String(seedOther.shortcut ?? ""),
        flag: String(seedOther.flag ?? "")
      }
    : {
        ...seedOther,
        label: AUTO_OTHER_OPTION_LABEL,
        value: otherValue,
        flag: String(seedOther.flag ?? "")
      };
  const nextOptions = [...regularOptions, normalizedOther];
  const changed = JSON.stringify(currentOptions) !== JSON.stringify(nextOptions);

  if (changed) {
    if (component.type === "select") {
      component.data.values = nextOptions;
    } else {
      component.values = nextOptions;
    }
  }

  return { changed, otherValue };
}

function removeOtherOptionOnChoiceComponent(component) {
  if (
    !component
    || typeof component !== "object"
    || !["select", "selectboxes"].includes(component.type)
  ) {
    return false;
  }

  const currentOptions = getChoiceOptions(component);
  const nextOptions = currentOptions
    .filter(option => option && typeof option === "object" && !isOtherOption(option))
    .map(option => ({ ...option }));
  const changed = JSON.stringify(currentOptions) !== JSON.stringify(nextOptions);

  if (changed) {
    if (component.type === "select") {
      component.data.values = nextOptions;
    } else {
      component.values = nextOptions;
    }
  }

  return changed;
}

function disableAutoOtherOnChoiceComponent(component) {
  if (
    !component
    || typeof component !== "object"
    || !["select", "selectboxes"].includes(component.type)
  ) {
    return false;
  }

  let changed = false;

  if (component.builderDisableAutoOther !== true) {
    component.builderDisableAutoOther = true;
    changed = true;
  }

  if (removeOtherOptionOnChoiceComponent(component)) {
    changed = true;
  }

  return changed;
}

function syncChoiceComponentAutoOtherState(component, options = {}) {
  if (
    !component
    || typeof component !== "object"
    || !["select", "selectboxes"].includes(component.type)
  ) {
    return false;
  }

  const hadOtherBefore = options.hadOtherBefore === true;
  const wasAutoOtherDisabled = options.wasAutoOtherDisabled === true;
  const hasOtherNow = hasOtherOptionOnChoiceComponent(component);

  if (hasOtherNow) {
    if (component.builderHidden !== true && component.builderDisableAutoOther === true) {
      delete component.builderDisableAutoOther;
      return true;
    }
    return false;
  }

  if (!hadOtherBefore && !wasAutoOtherDisabled) {
    return false;
  }

  if (component.builderDisableAutoOther === true) {
    return false;
  }

  component.builderDisableAutoOther = true;
  return true;
}

function isAutoOtherSpecifyComponent(component, ownerKey = "") {
  if (!component || typeof component !== "object" || component.type !== "textarea") {
    return false;
  }

  const conditionalWhen = String(component.conditional?.when || "").trim();
  if (ownerKey && conditionalWhen !== String(ownerKey || "").trim()) {
    return false;
  }

  if (component.builderAutoOtherSpecify === true) {
    return true;
  }

  return String(component.label || "").trim().toLowerCase() === AUTO_OTHER_SPECIFY_LABEL.toLowerCase()
    && [1, 3].includes(Number(component.rows || 0))
    && Boolean(conditionalWhen);
}

function buildAutoOtherSpecifyComponent(ownerComponent, otherValue) {
  const ownerKey = String(ownerComponent?.key || "").trim();
  const preferredKey = ownerKey
    ? `${ownerKey}OtherSpecify`
    : "otherSpecify";
  const nextKey = typeof window.ensureGloballyUniqueKey === "function"
    ? window.ensureGloballyUniqueKey(preferredKey)
    : generateUniqueKey(preferredKey);

  return {
    label: AUTO_OTHER_SPECIFY_LABEL,
    key: nextKey,
    type: "textarea",
    input: true,
    tableView: true,
    reportable: true,
    validate: { required: true },
    rows: 1,
    autoExpand: true,
    labelWidth: 30,
    labelMargin: 3,
    builderAutoOtherSpecify: true,
    conditional: {
      when: ownerKey,
      eq: String(otherValue || ""),
      show: true
    }
  };
}

function syncAutoOtherSpecifyComponent(component, ownerComponent, otherValue) {
  const previousSnapshot = JSON.stringify({
    label: component?.label,
    type: component?.type,
    rows: component?.rows,
    autoExpand: component?.autoExpand,
    input: component?.input,
    tableView: component?.tableView,
    reportable: component?.reportable,
    labelWidth: component?.labelWidth,
    labelMargin: component?.labelMargin,
    conditional: component?.conditional,
    builderAutoOtherSpecify: component?.builderAutoOtherSpecify
  });
  component.label = AUTO_OTHER_SPECIFY_LABEL;
  component.type = "textarea";
  component.input = true;
  component.tableView = true;
  component.reportable = true;
  component.rows = 1;
  component.autoExpand = true;
  component.labelWidth = 30;
  component.labelMargin = 3;
  component.hideLabel = false;
  component.builderAutoOtherSpecify = true;
  component.validate = {
    ...(component.validate && typeof component.validate === "object" ? component.validate : {}),
    required: true
  };
  component.conditional = {
    when: String(ownerComponent?.key || ""),
    eq: String(otherValue || ""),
    show: true
  };

  const nextSnapshot = JSON.stringify({
    label: component.label,
    type: component.type,
    rows: component.rows,
    autoExpand: component.autoExpand,
    input: component.input,
    tableView: component.tableView,
    reportable: component.reportable,
    labelWidth: component.labelWidth,
    labelMargin: component.labelMargin,
    conditional: component.conditional,
    builderAutoOtherSpecify: component.builderAutoOtherSpecify
  });

  return previousSnapshot !== nextSnapshot;
}

function ensureAutoOtherSpecifyCompanion(parentArray, ownerComponent, otherValue, insertIndex) {
  if (!Array.isArray(parentArray) || !ownerComponent?.key || !otherValue) {
    return false;
  }

  const ownerKey = String(ownerComponent.key || "").trim();
  const matches = [];
  parentArray.forEach((component, index) => {
    if (component === ownerComponent) return;
    if (isAutoOtherSpecifyComponent(component, ownerKey)) {
      matches.push({ component, index });
    }
  });

  let changed = false;
  let companion = matches[0]?.component || null;

  if (!companion) {
    companion = buildAutoOtherSpecifyComponent(ownerComponent, otherValue);
    changed = true;
  }

  if (syncAutoOtherSpecifyComponent(companion, ownerComponent, otherValue)) {
    changed = true;
  }

  for (let index = matches.length - 1; index >= 1; index -= 1) {
    const duplicate = matches[index];
    parentArray.splice(duplicate.index, 1);
    changed = true;
  }

  let targetIndex = Math.max(0, Math.min(Number(insertIndex) || 0, parentArray.length));
  let existingIndex = parentArray.indexOf(companion);

  if (existingIndex === -1) {
    parentArray.splice(targetIndex, 0, companion);
    return true;
  }

  if (existingIndex !== targetIndex) {
    parentArray.splice(existingIndex, 1);
    if (existingIndex < targetIndex) {
      targetIndex -= 1;
    }
    parentArray.splice(targetIndex, 0, companion);
    changed = true;
  }

  return changed;
}

function normalizeAutoOtherSpecifyInArray(components = [], parentComponent = null, ancestorComponents = []) {
  if (!Array.isArray(components)) return false;

  let changed = false;
  const validOwnerKeys = new Set();
  const lineage = parentComponent
    ? [...ancestorComponents, parentComponent]
    : [...ancestorComponents];

  function walkNested(component) {
    if (!component || typeof component !== "object") return false;

    let nestedChanged = false;
    if (
      Array.isArray(component.components)
      && normalizeAutoOtherSpecifyInArray(component.components, component, lineage)
    ) {
      nestedChanged = true;
    }

    return nestedChanged;
  }

  let index = 0;
  while (index < components.length) {
    const component = components[index];
    if (!component || typeof component !== "object") {
      index += 1;
      continue;
    }

    if (component.type === "columns" && Array.isArray(component.columns)) {
      let insertIndex = index + 1;

      component.columns.forEach((column) => {
        const primary = Array.isArray(column?.components)
          ? column.components[0]
          : null;

        if (isAutoOtherExcludedChoiceComponent(primary, component, lineage)) {
          if (removeOtherOptionOnChoiceComponent(primary)) {
            changed = true;
          }
        } else if (isAutoOtherChoiceComponent(primary)) {
          const result = ensureOtherOptionOnChoiceComponent(primary);
          if (result.changed) changed = true;
          if (primary.key && result.otherValue) {
            validOwnerKeys.add(String(primary.key));
            if (ensureAutoOtherSpecifyCompanion(components, primary, result.otherValue, insertIndex)) {
              changed = true;
            }
            insertIndex += 1;
          }
        }

        if (walkNested(primary)) {
          changed = true;
        }
      });

      index += 1;
      continue;
    }

    if (isAutoOtherExcludedChoiceComponent(component, parentComponent, ancestorComponents)) {
      if (removeOtherOptionOnChoiceComponent(component)) {
        changed = true;
      }
    } else if (isAutoOtherChoiceComponent(component)) {
      const result = ensureOtherOptionOnChoiceComponent(component);
      if (result.changed) changed = true;
      if (component.key && result.otherValue) {
        validOwnerKeys.add(String(component.key));
        if (ensureAutoOtherSpecifyCompanion(components, component, result.otherValue, index + 1)) {
          changed = true;
        }
      }
    }

    if (walkNested(component)) {
      changed = true;
    }

    index += 1;
  }

  for (let cleanupIndex = components.length - 1; cleanupIndex >= 0; cleanupIndex -= 1) {
    const component = components[cleanupIndex];
    if (!isAutoOtherSpecifyComponent(component)) continue;

    const ownerKey = String(component.conditional?.when || "").trim();
    if (ownerKey && validOwnerKeys.has(ownerKey)) continue;

    components.splice(cleanupIndex, 1);
    changed = true;
  }

  return changed;
}

function ensureAutoOtherSpecifyFields(components = []) {
  return normalizeAutoOtherSpecifyInArray(components);
}

function syncComponentKeyReferences(components = [], oldKey = "", newKey = "") {
  const from = String(oldKey || "").trim();
  const to = String(newKey || "").trim();
  if (!from || !to || from === to) return;

  const walk = arr => {
    arr.forEach(component => {
      if (!component || typeof component !== "object") return;

      if (component.conditional?.when === from) {
        component.conditional.when = to;
      }

      if (component._actionsDriverKey === from) {
        component._actionsDriverKey = to;
      }

      eachNestedComponent(component, walk);
    });
  };

  walk(components);
}

function syncConditionalValueReferences(components = [], whenKey = "", valueMap = {}) {
  const resolvedWhenKey = String(whenKey || "").trim();
  if (!resolvedWhenKey || !valueMap || typeof valueMap !== "object") return;

  const walk = arr => {
    arr.forEach(component => {
      if (!component || typeof component !== "object") return;

      const conditional = component.conditional;
      if (
        conditional?.when === resolvedWhenKey &&
        conditional.eq !== undefined &&
        conditional.eq !== null
      ) {
        const rawEq = String(conditional.eq);
        if (Object.prototype.hasOwnProperty.call(valueMap, rawEq)) {
          conditional.eq = valueMap[rawEq];
        }
      }

      eachNestedComponent(component, walk);
    });
  };

  walk(components);
}

function makeLocallyUniquePreservedKey(seed = "", registry = new Set(), fallback = "key") {
  const base = String(seed || "").trim()
    || normalizeLowerCamelCase(fallback, fallback);
  let nextKey = base;
  let suffix = 1;

  while (registry.has(nextKey)) {
    nextKey = `${base}${suffix++}`;
  }

  return nextKey;
}

function registerKeyAlias(aliasMap, alias = "", targetKey = "") {
  const normalizedAlias = String(alias || "").trim();
  const normalizedTarget = String(targetKey || "").trim();
  if (!normalizedAlias || !normalizedTarget) return;

  if (aliasMap.has(normalizedAlias) && aliasMap.get(normalizedAlias) !== normalizedTarget) {
    aliasMap.set(normalizedAlias, null);
    return;
  }

  aliasMap.set(normalizedAlias, normalizedTarget);
}

function registerComponentKeyAliases(aliasMap, options = {}) {
  const originalKey = String(options.originalKey || "").trim();
  const nextKey = String(options.nextKey || "").trim();
  const label = String(options.label || "").trim();
  if (!nextKey) return;

  const aliases = new Set([
    nextKey,
    normalizeLowerCamelCase(nextKey, "key")
  ]);

  if (originalKey) {
    aliases.add(originalKey);
    aliases.add(normalizeLowerCamelCase(originalKey, "key"));
  }

  if (label) {
    aliases.add(label);
    aliases.add(normalizeLowerCamelCase(label, "key"));
  }

  aliases.forEach(alias => registerKeyAlias(aliasMap, alias, nextKey));
}

function resolveComponentReferenceKey(rawKey = "", keyMap = {}, aliasMap = new Map(), fallback = "key") {
  const directKey = String(rawKey || "").trim();
  if (!directKey) {
    return normalizeLowerCamelCase(directKey, fallback);
  }

  if (Object.prototype.hasOwnProperty.call(keyMap, directKey)) {
    return keyMap[directKey];
  }

  const directAlias = aliasMap.get(directKey);
  if (typeof directAlias === "string" && directAlias) {
    return directAlias;
  }

  const normalizedKey = normalizeLowerCamelCase(directKey, fallback);
  if (Object.prototype.hasOwnProperty.call(keyMap, normalizedKey)) {
    return keyMap[normalizedKey];
  }

  const normalizedAlias = aliasMap.get(normalizedKey);
  if (typeof normalizedAlias === "string" && normalizedAlias) {
    return normalizedAlias;
  }

  return normalizedKey;
}

function sanitizeComponentSchema(components = []) {
  const usedKeys = new Set();
  const keyMap = {};
  const keyAliasMap = new Map();
  const valueMaps = {};

  const walk = (arr, context = {}) => {
    const registry = context.registry || usedKeys;
    const isTaskScoped = context.isTaskScoped === true;

    arr.forEach((component, index) => {
      if (!component || typeof component !== "object") return;

      if (typeof component.label === "string") {
        component.label = normalizeComponentLabel(component.label, component.type);
      }

      if (typeof component.legend === "string" && component.type === "fieldset") {
        component.legend = normalizeComponentLabel(component.legend, component.type);
      }

      const originalKey = String(component.key ?? "").trim();
      let nextKey = "";

      if (isTaskScoped) {
        const fallbackKey = component.label || component.type || `field${index + 1}`;
        nextKey = makeLocallyUniquePreservedKey(
          originalKey || fallbackKey,
          registry,
          `field${index + 1}`
        );
        registry.add(nextKey);
      } else {
        const keySeed = component.label || originalKey || component.type || `field${index + 1}`;
        nextKey = makeUniqueSanitizedValue(keySeed, registry, `field${index + 1}`, {
          allowLeadingDigit: false
        });
        registry.add(nextKey);

        if (originalKey && originalKey !== nextKey && !Object.prototype.hasOwnProperty.call(keyMap, originalKey)) {
          keyMap[originalKey] = nextKey;
        }
      }

      component.key = nextKey;

      if (!isTaskScoped) {
        registerComponentKeyAliases(keyAliasMap, {
          originalKey,
          nextKey,
          label: component.label
        });
      }

      if (component.type === "editgrid") {
        delete component.editGridRowLayout;
      }

      if (Array.isArray(component.questions)) {
        component.questions = normalizeChoiceItems(component.questions, "question").items;
      }

      if (Array.isArray(component.values)) {
        const normalized = normalizeChoiceItems(
          component.values,
          component.type === "survey" ? "value" : "option"
        );
        component.values = normalized.items;
        if (Object.keys(normalized.valueMap).length) {
          valueMaps[component.key] = normalized.valueMap;
        }
      }

      if (Array.isArray(component.data?.values)) {
        const normalized = normalizeChoiceItems(component.data.values, "option");
        component.data = { ...(component.data || {}), values: normalized.items };
        if (Object.keys(normalized.valueMap).length) {
          valueMaps[component.key] = normalized.valueMap;
        }
      }

      const childContext = component.type === "tasks"
        ? { registry: new Set(), isTaskScoped: true }
        : { registry, isTaskScoped };

      eachNestedComponent(component, nested => walk(nested, childContext));
    });
  };

  walk(components, { registry: usedKeys, isTaskScoped: false });

  const rewrite = (arr, context = {}) => {
    const isTaskScoped = context.isTaskScoped === true;

    arr.forEach(component => {
      if (!component || typeof component !== "object") return;

      if (!isTaskScoped && component.conditional?.when) {
        const originalWhen = String(component.conditional.when);
        const nextWhen = resolveComponentReferenceKey(originalWhen, keyMap, keyAliasMap, "key");
        component.conditional.when = nextWhen;

        const valueMap = valueMaps[nextWhen];
        if (
          valueMap &&
          component.conditional.eq !== undefined &&
          component.conditional.eq !== null
        ) {
          const originalEq = String(component.conditional.eq);
          if (Object.prototype.hasOwnProperty.call(valueMap, originalEq)) {
            component.conditional.eq = valueMap[originalEq];
          }
        }
      }

      if (!isTaskScoped && component._actionsDriverKey) {
        const originalDriverKey = String(component._actionsDriverKey);
        component._actionsDriverKey = resolveComponentReferenceKey(
          originalDriverKey,
          keyMap,
          keyAliasMap,
          "actionsGroup"
        );
      }

      const childContext = component.type === "tasks"
        ? { isTaskScoped: true }
        : { isTaskScoped };

      eachNestedComponent(component, nested => rewrite(nested, childContext));
    });
  };

  rewrite(components, { isTaskScoped: false });

  return { keyMap, valueMaps };
}

// Expose them everywhere else
window.normalizeLowerCamelCase = normalizeLowerCamelCase;
window.normalizeOptionValue = normalizeOptionValue;
window.normalizeAllCapsTitle = normalizeAllCapsTitle;
window.normalizeComponentLabel = normalizeComponentLabel;
window.normalizeChoiceItems = normalizeChoiceItems;
window.sanitizeComponentSchema = sanitizeComponentSchema;
window.ensureAutoOtherSpecifyFields = ensureAutoOtherSpecifyFields;
window.hasOtherOptionOnChoiceComponent = hasOtherOptionOnChoiceComponent;
window.removeOtherOptionOnChoiceComponent = removeOtherOptionOnChoiceComponent;
window.disableAutoOtherOnChoiceComponent = disableAutoOtherOnChoiceComponent;
window.syncChoiceComponentAutoOtherState = syncChoiceComponentAutoOtherState;
window.isAutoOtherSpecifyComponent = isAutoOtherSpecifyComponent;
window.syncComponentKeyReferences = syncComponentKeyReferences;
window.syncConditionalValueReferences = syncConditionalValueReferences;
window.isUsedKey = isUsedKey;
window.reserveUsedKey = reserveUsedKey;
window.releaseUsedKey = releaseUsedKey;
window.generateUniqueKey      = generateUniqueKey;
window.ensureGloballyUniqueKey = ensureGloballyUniqueKey;
window.updateUniqueKey = updateUniqueKey;
