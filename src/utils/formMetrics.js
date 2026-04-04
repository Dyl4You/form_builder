const KNOWN_COMPONENT_TYPES = [
  'disclaimer',
  'textfield',
  'textarea',
  'account',
  'choiceList',
  'survey',
  'selectboxes',
  'select',
  'file',
  'phoneNumber',
  'address',
  'asset',
  'datetime',
  'date',
  'time',
  'number',
  'currency',
  'editgrid',
  'datagrid',
  'fieldset',
  'radio',
  'content'
];

const COMPOSITE_SINGLE_TYPES = new Set(['address']);

function normalizeRootComponents(formJson) {
  if (Array.isArray(formJson)) return formJson;
  if (formJson && Array.isArray(formJson.components)) return formJson.components;
  return [];
}

function sanitizeComponent(component) {
  if (!component || typeof component !== 'object') return component;

  if (Array.isArray(component)) {
    return component.map(sanitizeComponent);
  }

  const out = {};
  Object.keys(component)
    .sort()
    .forEach((key) => {
      if (key === 'builderHidden') return;
      out[key] = sanitizeComponent(component[key]);
    });
  return out;
}

function stableStringify(value) {
  return JSON.stringify(sanitizeComponent(value));
}

function collectActionBundleWrapperKeys(components = []) {
  return (components || []).reduce((keys, comp) => {
    const wrapperKey = String(comp?._actionsDriverKey || '').trim();
    if (wrapperKey) {
      keys.add(wrapperKey);
    }
    return keys;
  }, new Set());
}

function walkComponents(components, parentType, depth, state) {
  const actionBundleWrapperKeys = collectActionBundleWrapperKeys(components);

  (components || []).forEach((comp) => {
    if (!comp || typeof comp !== 'object') return;
    if (comp.builderHidden) return;
    if (actionBundleWrapperKeys.has(String(comp.key || '').trim())) return;

    const isColumns = comp.type === 'columns';
    const isDatagridGrouping = parentType === 'datagrid' && comp.type === 'fieldset';

    if (!isColumns && !isDatagridGrouping && comp.key) {
      state.countable.push({ component: comp, depth });
      state.maxDepth = Math.max(state.maxDepth, depth);
      state.typeCounts[comp.type] = (state.typeCounts[comp.type] || 0) + 1;

      if (comp.conditional && typeof comp.conditional === 'object') {
        state.conditionalCount += 1;
        state.advancedFeatureCount += 1;
      }

      if (typeof comp.calculateValue === 'string' && comp.calculateValue.trim()) {
        state.calculationCount += 1;
        state.advancedFeatureCount += 1;
      }

      if (comp.type === 'editgrid') {
        state.hasEditgrid = true;
        state.advancedFeatureCount += 2;
      }

      if (comp.type === 'datagrid') {
        state.hasDatagrid = true;
        state.advancedFeatureCount += 2;
      }
    }

    if (isColumns && Array.isArray(comp.columns)) {
      comp.columns.forEach((col) => {
        walkComponents(col.components || [], 'columns', depth + 1, state);
      });
      return;
    }

    if (Array.isArray(comp.components) && comp.components.length) {
      if (COMPOSITE_SINGLE_TYPES.has(comp.type)) return;
      walkComponents(comp.components, comp.type, depth + 1, state);
    }
  });
}

function extractTemplateMetrics(formJson) {
  const rootComponents = normalizeRootComponents(formJson);
  const state = {
    countable: [],
    typeCounts: {},
    maxDepth: 0,
    conditionalCount: 0,
    calculationCount: 0,
    advancedFeatureCount: 0,
    hasEditgrid: false,
    hasDatagrid: false
  };

  walkComponents(rootComponents, null, 1, state);

  const totalComponents = state.countable.length;
  const uniqueTypes = Object.keys(state.typeCounts).length;

  const sortedTypes = Object.entries(state.typeCounts)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .map(([type, count]) => ({ type, count }));

  const dominantTypeShare = totalComponents
    ? (sortedTypes[0]?.count || 0) / totalComponents
    : 0;

  const typeDistribution = {};
  sortedTypes.forEach(({ type, count }) => {
    typeDistribution[type] = totalComponents ? Number((count / totalComponents).toFixed(4)) : 0;
  });

  return {
    totalComponents,
    uniqueTypes,
    typeCounts: state.typeCounts,
    componentBreakdown: sortedTypes,
    topTypes: sortedTypes.slice(0, 5),
    dominantTypeShare,
    maxDepth: state.maxDepth,
    advancedFeatureCount: state.advancedFeatureCount,
    conditionalCount: state.conditionalCount,
    calculationCount: state.calculationCount,
    hasEditgrid: state.hasEditgrid,
    hasDatagrid: state.hasDatagrid,
    componentGenome: {
      typeDistribution,
      complexitySignature: {
        maxDepth: state.maxDepth,
        advancedFeatureCount: state.advancedFeatureCount,
        uniqueTypes
      }
    }
  };
}

module.exports = {
  KNOWN_COMPONENT_TYPES,
  extractTemplateMetrics,
  stableStringify
};
