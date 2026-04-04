// src/utils/formio.js
const {
  normalizeLowerCamelCase,
  normalizeAllCapsTitle,
  normalizeComponentLabel,
  makeUniqueLowerCamelCase,
  makeUniqueOptionValue
} = require('./naming');

const ALLOWED_TYPES = new Set([
  'textarea', 'radio', 'select', 'selectboxes', 'file',
  'documents',
  'phoneNumber', 'address', 'asset', 'account', 'number', 'currency',
  'datetime', 'date', 'time',
  'fieldset', 'columns', 'editgrid', 'datagrid', 'survey',
  'disclaimer', 'content', 'textfield'
]);

function eachNestedComponent(component, visitArray) {
  if (Array.isArray(component.components)) {
    visitArray(component.components);
  }
  if (component.type === 'columns' && Array.isArray(component.columns)) {
    component.columns.forEach(column => {
      if (Array.isArray(column?.components)) {
        visitArray(column.components);
      }
    });
  }
}

function scrubComponents(list = []) {
  return list
    .filter(component => component && typeof component === 'object' && ALLOWED_TYPES.has(component.type))
    .map(component => {
      const cleaned = { ...component };
      if (cleaned.type === 'editgrid') {
        delete cleaned.editGridRowLayout;
      }
      if (Array.isArray(component.components)) {
        cleaned.components = scrubComponents(component.components);
      }
      if (component.type === 'columns' && Array.isArray(component.columns)) {
        cleaned.columns = component.columns.map(column => ({
          ...column,
          components: scrubComponents(column?.components || [])
        }));
      }
      return cleaned;
    });
}

function sanitizeChoiceItems(items = [], fallback = 'option') {
  const usedValues = new Set();
  const valueMap = new Map();

  const sanitized = items
    .map((item, index) => {
      if (typeof item === 'string') {
        const label = normalizeAllCapsTitle(item.trim());
        if (!label) return null;
        const value = makeUniqueOptionValue(label, usedValues, `${fallback}${index + 1}`);
        usedValues.add(value);
        if (label !== value && !valueMap.has(label)) {
          valueMap.set(label, value);
        }
        return { label, value };
      }

      if (!item || typeof item !== 'object') return null;

      const label = normalizeAllCapsTitle(String(item.label ?? item.value ?? '').trim());
      if (!label) return null;

      const rawValue = item.value ?? label;
      const value = makeUniqueOptionValue(label || rawValue, usedValues, `${fallback}${index + 1}`);
      usedValues.add(value);

      const rawValueText = String(rawValue);
      if (rawValueText !== value && !valueMap.has(rawValueText)) {
        valueMap.set(rawValueText, value);
      }

      return { ...item, label, value };
    })
    .filter(Boolean);

  return { items: sanitized, valueMap };
}

function makeLocallyUniquePreservedKey(seed = '', registry = new Set(), fallback = 'key') {
  const base = String(seed || '').trim()
    || normalizeLowerCamelCase(fallback, fallback);
  let nextKey = base;
  let suffix = 1;

  while (registry.has(nextKey)) {
    nextKey = `${base}${suffix++}`;
  }

  return nextKey;
}

function sanitizeComponentSchema(components = []) {
  const usedKeys = new Set();
  const keyMap = new Map();
  const optionValueMaps = new Map();

  const walk = (arr, context = {}) => {
    const registry = context.registry || usedKeys;
    const isTaskScoped = context.isTaskScoped === true;

    arr.forEach((component, index) => {
      if (!component || typeof component !== 'object') return;

      if (typeof component.label === 'string') {
        component.label = normalizeComponentLabel(component.label, component.type);
      }

      if (typeof component.legend === 'string' && component.type === 'fieldset') {
        component.legend = normalizeComponentLabel(component.legend, component.type);
      }

      const originalKey = String(component.key ?? '').trim();
      let nextKey = '';

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
        nextKey = makeUniqueLowerCamelCase(keySeed, registry, `field${index + 1}`);
        registry.add(nextKey);

        if (originalKey && originalKey !== nextKey && !keyMap.has(originalKey)) {
          keyMap.set(originalKey, nextKey);
        }
      }

      component.key = nextKey;

      if (component.type === 'editgrid') {
        delete component.editGridRowLayout;
      }

      if (Array.isArray(component.questions)) {
        const { items } = sanitizeChoiceItems(component.questions, 'question');
        component.questions = items;
      }

      if (Array.isArray(component.values)) {
        const { items, valueMap } = sanitizeChoiceItems(
          component.values,
          component.type === 'survey' ? 'value' : 'option'
        );
        component.values = items;
        if (valueMap.size) {
          optionValueMaps.set(component.key, valueMap);
        }
      }

      if (Array.isArray(component.data?.values)) {
        const { items, valueMap } = sanitizeChoiceItems(component.data.values, 'option');
        component.data = { ...(component.data || {}), values: items };
        if (valueMap.size) {
          optionValueMaps.set(component.key, valueMap);
        }
      }

      const childContext = component.type === 'tasks'
        ? { registry: new Set(), isTaskScoped: true }
        : { registry, isTaskScoped };

      eachNestedComponent(component, nested => walk(nested, childContext));
    });
  };

  walk(components, { registry: usedKeys, isTaskScoped: false });

  const rewrite = (arr, context = {}) => {
    const isTaskScoped = context.isTaskScoped === true;

    arr.forEach(component => {
      if (!component || typeof component !== 'object') return;

      if (!isTaskScoped && component.conditional?.when) {
        const oldWhen = String(component.conditional.when);
        const nextWhen = keyMap.get(oldWhen) || normalizeLowerCamelCase(oldWhen, 'key');
        component.conditional.when = nextWhen;

        const valueMap = optionValueMaps.get(nextWhen);
        if (valueMap && component.conditional.eq !== undefined && component.conditional.eq !== null) {
          const oldEq = String(component.conditional.eq);
          if (valueMap.has(oldEq)) {
            component.conditional.eq = valueMap.get(oldEq);
          }
        }
      }

      if (!isTaskScoped && component._actionsDriverKey) {
        const oldDriverKey = String(component._actionsDriverKey);
        component._actionsDriverKey = keyMap.get(oldDriverKey)
          || normalizeLowerCamelCase(oldDriverKey, 'actionsGroup');
      }

      const childContext = component.type === 'tasks'
        ? { isTaskScoped: true }
        : { isTaskScoped };

      eachNestedComponent(component, nested => rewrite(nested, childContext));
    });
  };

  rewrite(components, { isTaskScoped: false });

  return { components, keyMap, optionValueMaps };
}

function validateComponentTypes(list, path = 'components') {
  list.forEach((component, index) => {
    if (!component || typeof component !== 'object') {
      throw new Error(`Invalid component at ${path}[${index}]`);
    }
    if (!ALLOWED_TYPES.has(component.type)) {
      throw new Error(`Unsupported component type "${component.type}" at ${path}[${index}]`);
    }
    if (Array.isArray(component.components)) {
      validateComponentTypes(component.components, `${path}[${index}].components`);
    }
    if (component.type === 'columns' && Array.isArray(component.columns)) {
      component.columns.forEach((column, columnIndex) => {
        if (Array.isArray(column?.components)) {
          validateComponentTypes(column.components, `${path}[${index}].columns[${columnIndex}].components`);
        }
      });
    }
  });
}

function ensureComponentsPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Model returned non-object JSON');
  }
  if (!Array.isArray(payload.components)) {
    throw new Error('No "components" array present');
  }

  sanitizeComponentSchema(payload.components);
  validateComponentTypes(payload.components);
  return payload;
}

module.exports = {
  ALLOWED_TYPES,
  scrubComponents,
  sanitizeChoiceItems,
  sanitizeComponentSchema,
  validateComponentTypes,
  ensureComponentsPayload,
  normalizeLowerCamelCase
};
