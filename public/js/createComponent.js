/****************************************************
 * public/js/createComponent.js
 ****************************************************/


var ensureGloballyUniqueKey = (typeof require === 'function')
  ? (require('../../src/parser/unifiedParser').ensureGloballyUniqueKey)
  : window.ensureGloballyUniqueKey;

(function(){
  // --- Environment Detection ---
  var lodash, generateUniqueKey, normalizeLowerCamelCase, normalizeOptionValue, normalizeChoiceItems, normalizeAllCapsTitle, normalizeComponentLabel;
  if (typeof require === 'function') {
    const parserUtils = require('../../src/parser/unifiedParser');
    const namingUtils = require('../../src/utils/naming');
    lodash = require('lodash');
    ({ generateUniqueKey, normalizeOptionValue } = parserUtils);
    normalizeLowerCamelCase =
      parserUtils.normalizeLowerCamelCase ||
      function(value, fallback) {
        return lodash.camelCase(value) || fallback || 'key';
      };
    normalizeOptionValue =
      normalizeOptionValue ||
      function(value, fallback) {
        return normalizeLowerCamelCase(value, fallback || 'option');
      };
    normalizeChoiceItems = null;
    normalizeAllCapsTitle =
      namingUtils.normalizeAllCapsTitle ||
      function(value) {
        return String(value ?? '').trim();
      };
    normalizeComponentLabel =
      namingUtils.normalizeComponentLabel ||
      function(value, componentType) {
        const trimmed = String(value ?? '').trim();
        return normalizeAllCapsTitle(trimmed);
      };
  } else {
    lodash = window._;
    normalizeLowerCamelCase =
      window.normalizeLowerCamelCase ||
      function(value, fallback) {
        return lodash.camelCase(value) || fallback || 'key';
      };
    normalizeOptionValue =
      window.normalizeOptionValue ||
      function(value, fallback) {
        return normalizeLowerCamelCase(value, fallback || 'option');
      };
    normalizeChoiceItems = window.normalizeChoiceItems || null;
    normalizeAllCapsTitle =
      window.normalizeAllCapsTitle ||
      function(value) {
        return String(value ?? '').trim();
      };
    normalizeComponentLabel =
      window.normalizeComponentLabel ||
      function(value, componentType) {
        const trimmed = String(value ?? '').trim();
        return normalizeAllCapsTitle(trimmed);
      };
    generateUniqueKey = window.generateUniqueKey || function(label) {
      var baseKey = normalizeLowerCamelCase(label, 'key');
      var uniqueKey = baseKey;
      var counter = 1;
      if (!window._usedKeys) window._usedKeys = {};
      while(window._usedKeys[uniqueKey]){
        uniqueKey = baseKey + counter++;
      }
      if (typeof window.reserveUsedKey === 'function') {
        return window.reserveUsedKey(uniqueKey);
      }
      window._usedKeys[uniqueKey] = true;
      return uniqueKey;
    };
  }
  const _ = lodash;

  if (typeof _.camelCase !== 'function') {
    _.camelCase = function(str) {
      return String(str)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+(.)/g, (match, chr) => chr.toUpperCase());
    };
  }

  /**
   * Small helper: takes an array of objects with at least { label: "..." },
   * and returns a new array ensuring each .value is unique.
   */
  function ensureUniqueValues(items) {
    if (typeof normalizeChoiceItems === "function") {
      return normalizeChoiceItems(items, 'option').items;
    }

    const used = new Set();
    return items.map(item => {
      const baseVal = normalizeOptionValue(item?.value || item?.label, 'option');
      let newVal = baseVal;
      let i = 1;
      while (used.has(newVal)) {
        newVal = baseVal + i++;
      }
      used.add(newVal);
      return { ...item, value: newVal };
    });
  }

  function normalizeBuilderTitleLabel(labelText = "", componentType = "") {
    const trimmed = String(labelText || "").trim();
    if (!trimmed) return "";
    return normalizeComponentLabel(trimmed, componentType);
  }

  const DEFAULT_LABELS = {
    disclaimer : 'Disclaimer',
    textarea   : 'Short Input',
    checkbox   : 'Checkbox',
    account    : 'Worker',
    choiceList : 'Choices',
    componentGroup: 'Field Group',
    survey     : 'Survey',
    quiz       : 'Knowledge Check',
    file       : 'Photo',
    documents  : 'Documents',
    phoneNumber: 'Phone',
    address    : 'Address',
    asset      : 'Equipment',
    datetime   : 'Date / Time',
    number     : 'Number',
    currency   : 'Currency',
    editgrid   : 'Custom Table',
    datagrid   : 'Basic Table',
    columns    : 'Columns',
    fieldset   : 'Section'
  };

  function buildQuizCalculation(finalValueExpression) {
    return `/* ---------- helpers ---------- */
var A = Array.isArray;

function schemaOf(source) {
  if (!source || typeof source !== 'object') return null;
  return source.component && typeof source.component === 'object'
    ? source.component
    : source;
}

function normalize(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

function tokensOf(raw) {
  return String(raw == null ? '' : raw)
    .split(',')
    .map(function(part) { return part.trim(); })
    .filter(Boolean);
}

function toSorted(value) {
  return A(value)
    ? value.slice().map(function(item) { return String(item); }).sort()
    : value == null || value === ''
      ? []
      : [String(value)];
}

function optionEntries(component) {
  var schema = schemaOf(component) || {};
  return A(schema.data && schema.data.values)
    ? schema.data.values
    : A(schema.values)
      ? schema.values
      : [];
}

function matchText(component) {
  var schema = schemaOf(component) || {};
  return [schema.key, schema.label]
    .map(function(part) { return String(part || ''); })
    .join(' ')
    .toLowerCase();
}

function flat(list, out) {
  out = out || [];

  (list || []).forEach(function(entry) {
    var component = schemaOf(entry);
    if (!component) return;

    out.push(component);

    if (A(component.components)) flat(component.components, out);
    if (component.type === 'columns' && A(component.columns)) {
      component.columns.forEach(function(column) {
        flat((column && column.components) || [], out);
      });
    }
    if (A(component.rows)) {
      component.rows.forEach(function(row) {
        if (A(row)) {
          row.forEach(function(column) {
            flat((column && column.components) || [], out);
          });
        } else if (row && row.components) {
          flat(row.components, out);
        }
      });
    }
  });

  return out;
}

function getQuizQuestionComponents(root) {
  var rootSchema = schemaOf(root) || {};
  var out = [];

  function walk(list) {
    (list || []).forEach(function(entry) {
      var component = schemaOf(entry);
      if (!component || component.builderHidden) return;

      var keyText = String(component.key || '').toLowerCase();
      if (component.customType === 'quiz') {
        walk(component.components || []);
        return;
      }

      if (
        component.type === 'fieldset' &&
        (/^quizsetup/.test(keyText) || /^results$/.test(keyText) || /^quizresults/.test(keyText))
      ) {
        return;
      }

      if (['select', 'radio', 'selectboxes'].indexOf(component.type) !== -1) {
        out.push(component);
        return;
      }

      if (A(component.components)) walk(component.components);
      if (component.type === 'columns' && A(component.columns)) {
        component.columns.forEach(function(column) {
          walk((column && column.components) || []);
        });
      }
    });
  }

  var questionsFieldset = (rootSchema.components || []).find(function(entry) {
    var component = schemaOf(entry);
    return component && component.type === 'fieldset' && /^quizquestions/i.test(component.key || '');
  });

  if (questionsFieldset) {
    walk(questionsFieldset.components || []);
  } else {
    walk(rootSchema.components || []);
  }

  return out;
}

function ancestorSchemas() {
  var out = [];
  var seen = [];

  function push(schema) {
    if (!schema || seen.indexOf(schema) !== -1) return;
    seen.push(schema);
    out.push(schema);
  }

  push(currentSchema);

  var cursor = instance && instance.parent;
  while (cursor) {
    push(schemaOf(cursor.component || cursor));
    cursor = cursor.parent;
  }

  push(rootSchema);
  return out;
}

function matchesFieldsetKey(component, baseName, suffix) {
  var schema = schemaOf(component) || {};
  var key = String(schema.key || '').trim().toLowerCase();
  return key === (String(baseName || '') + String(suffix == null ? '' : suffix)).toLowerCase();
}

function getQuizScopeSuffix() {
  var schemas = ancestorSchemas();

  for (var index = 0; index < schemas.length; index += 1) {
    var key = String((schemas[index] && schemas[index].key) || '').trim();
    var match = key.match(/^(quizquestions|quizsetup|quizresults|results|quizsummary|result|incorrectanswers|passmark|answerkey)(\d*)$/i);
    if (match) return match[2];
  }

  return null;
}

function getDirectChildFieldset(root, names, suffix) {
  var children = (schemaOf(root) || {}).components || [];

  for (var index = 0; index < children.length; index += 1) {
    var child = schemaOf(children[index]);
    if (!child || child.type !== 'fieldset') continue;

    for (var nameIndex = 0; nameIndex < (names || []).length; nameIndex += 1) {
      if (matchesFieldsetKey(child, names[nameIndex], suffix)) {
        return child;
      }
    }
  }

  return null;
}

function isQuizScope(scope) {
  var schema = schemaOf(scope) || {};
  var components = flat(schema.components || []);
  var questionComponents = getQuizQuestionComponents(schema);
  var hasAnswerGrid = components.some(function(entry) {
    return entry && entry.type === 'datagrid' && /answerkey/i.test(matchText(entry));
  });
  var hasPassMark = components.some(function(entry) {
    return entry && entry.type === 'number' && /passmark/i.test(matchText(entry));
  });
  var hasResults = components.some(function(entry) {
    return entry && entry.type === 'textarea' && /(^result$|quizresult|incorrectanswers)/i.test(matchText(entry));
  });

  return questionComponents.length > 0 && hasAnswerGrid && (hasPassMark || hasResults);
}

function createSiblingQuizScope(root, suffix) {
  if (suffix == null) return null;

  var questionSection = getDirectChildFieldset(root, ['quizquestions'], suffix);
  var setupSection = getDirectChildFieldset(root, ['quizsetup'], suffix);
  var resultsSection = getDirectChildFieldset(root, ['quizresults', 'results'], suffix);
  var components = [questionSection, setupSection, resultsSection].filter(Boolean);

  if (!components.length) return null;

  var scope = { components: components };
  return isQuizScope(scope) ? scope : null;
}

function findQuizRoot() {
  var ancestors = ancestorSchemas();

  for (var index = 0; index < ancestors.length; index += 1) {
    if (ancestors[index] && ancestors[index].customType === 'quiz') {
      return ancestors[index];
    }
  }

  for (var ancestorIndex = 0; ancestorIndex < ancestors.length; ancestorIndex += 1) {
    var candidate = ancestors[ancestorIndex];
    if (!candidate || candidate === rootSchema) continue;
    if (isQuizScope(candidate)) return candidate;
  }

  var siblingScope = createSiblingQuizScope(rootSchema, getQuizScopeSuffix());
  if (siblingScope) return siblingScope;

  return isQuizScope(rootSchema) ? rootSchema : rootSchema;
}

function firstFilled(row, keys) {
  var values = keys || [];

  for (var index = 0; index < values.length; index += 1) {
    var key = values[index];
    if (!key) continue;

    var cell = row && row[key];
    if (cell !== undefined && cell !== null && String(cell).trim() !== '') {
      return String(cell).trim();
    }
  }

  return '';
}

function normalizeExpected(component, rawAnswer) {
  var options = optionEntries(component);
  var valueMap = {};

  options.forEach(function(option) {
    var value = String(option && option.value != null ? option.value : '').trim();
    var label = String(option && option.label != null ? option.label : '').trim();
    if (value) valueMap[normalize(value)] = value;
    if (label) valueMap[normalize(label)] = value || label;
  });

  return tokensOf(rawAnswer)
    .map(function(token) { return valueMap[normalize(token)] || token; })
    .sort();
}

var currentSchema = schemaOf(component);
var parentSchema = schemaOf(instance && instance.parent);
var grandparentSchema = schemaOf(instance && instance.parent && instance.parent.parent);
var rootSchema = schemaOf(form) || schemaOf(instance && instance.root) || {};
var quizRoot = findQuizRoot();
var components = flat(quizRoot.components || []);
var answerGrid = components.find(function(entry) {
  return entry && entry.type === 'datagrid' && /answerkey/i.test(matchText(entry));
});
var passMarkField = components.find(function(entry) {
  return entry && entry.type === 'number' && /passmark/i.test(matchText(entry));
});
var answerRows = answerGrid && A(data && data[answerGrid.key]) && data[answerGrid.key].length
  ? data[answerGrid.key]
  : answerGrid && A(answerGrid.defaultValue)
    ? answerGrid.defaultValue
    : [];
var answerGridColumns = answerGrid && A(answerGrid.components) ? answerGrid.components : [];
var questionComponentKeyField = answerGridColumns.find(function(column) {
  return /(questioncomponentkey|componentkey)/i.test(matchText(column));
});
var questionLabelField = answerGridColumns.find(function(column) {
  return column !== questionComponentKeyField && /(questionlabel|question)/i.test(matchText(column));
});
var answerValueField = answerGridColumns.find(function(column) {
  return /(answervalue|correctvalue|answer)/i.test(matchText(column));
});
var questionComponents = getQuizQuestionComponents(quizRoot);
var expectedByKey = {};

answerRows.forEach(function(row, index) {
  var explicitKey = firstFilled(row, [
    questionComponentKeyField && questionComponentKeyField.key,
    'questioncomponentkey',
    'questionComponentKey',
    'questionkey',
    'quizquestionkey',
    'componentkey'
  ]);

  var matchedComponent = explicitKey
    ? questionComponents.find(function(candidate) {
        return String((candidate && candidate.key) || '') === explicitKey;
      })
    : null;

  var label = firstFilled(row, [
    questionLabelField && questionLabelField.key,
    'questionlabel',
    'questionLabel',
    'question',
    'quizquestion'
  ]);

  if (!matchedComponent && label) {
    var labelMatches = questionComponents.filter(function(candidate) {
      return normalize(candidate && candidate.label) === normalize(label);
    });

    if (labelMatches.length === 1) {
      matchedComponent = labelMatches[0];
    } else if (labelMatches.length > 1 && questionComponents[index]) {
      matchedComponent = questionComponents[index];
    }
  }

  if (!matchedComponent && questionComponents[index]) {
    matchedComponent = questionComponents[index];
  }

  if (!matchedComponent || !matchedComponent.key) return;

  var rawAnswer = firstFilled(row, [
    answerValueField && answerValueField.key,
    'answervalue',
    'correctvalue',
    'correctvalues',
    'correctValueS',
    'quizanswer',
    'answer'
  ]);

  expectedByKey[matchedComponent.key] = normalizeExpected(matchedComponent, rawAnswer);
});

var correct = 0;
var bad = [];

questionComponents.forEach(function(componentSchema) {
  if (!componentSchema || !componentSchema.key) return;

  var right = expectedByKey[componentSchema.key];
  if (!right) return;

  var rawValue = data ? data[componentSchema.key] : undefined;
  var user = componentSchema.type === 'selectboxes'
    ? Object.keys(rawValue || {}).filter(function(key) { return rawValue[key]; }).sort()
    : toSorted(rawValue);

  if (!user.length) return;

  var matches =
    user.length === right.length &&
    user.every(function(item, index) {
      return normalize(item) === normalize(right[index]);
    });

  if (matches) {
    correct += 1;
    return;
  }

  bad.push(String(componentSchema.label || componentSchema.key || '').trim());
});

var total = Object.keys(expectedByKey).length || questionComponents.length || 1;
var needed = Math.min(
  total,
  Math.max(1, Number(data && passMarkField && data[passMarkField.key]) || Number(passMarkField && passMarkField.defaultValue) || 1)
);
var quizState = {
  bad: bad,
  score: String(correct) + '/' + String(total),
  result: correct >= needed ? 'Pass' : 'Try again'
};

quizState.resultText = quizState.result + ' - ' + quizState.score;
value = ${finalValueExpression};`;
  }

  function buildQuizSummaryCalculation() {
    return buildQuizCalculation('quizState.score');
  }

  function buildQuizResultCalculation() {
    return buildQuizCalculation("quizState.resultText || ''");
  }

  function buildQuizIncorrectAnswersCalculation() {
    return buildQuizCalculation("quizState.bad.length ? '<ul><li>' + quizState.bad.join('</li><li>') + '</li></ul>' : ''");
  }

  const EDITGRID_AUTO_ROW_COMPONENT_LIMIT = 8;

  function buildAutoEditGridRowLayout(componentCount) {
    const total = Math.max(1, Math.floor(Number(componentCount) || 0));
    const layout = {};
    let remaining = total;
    let rowNumber = 1;

    while (remaining > 0) {
      const cols = Math.min(EDITGRID_AUTO_ROW_COMPONENT_LIMIT, remaining);
      layout[rowNumber] = Array.from({ length: cols }, () => 1);
      remaining -= cols;
      rowNumber += 1;
    }

    return layout;
  }

  const DEFAULT_EDITGRID_ROW_LAYOUT = Object.freeze(
    Object.fromEntries(
      Object.entries(buildAutoEditGridRowLayout(1)).map(([key, row]) => [key, Object.freeze(row)])
    )
  );

  const DEFAULT_EDITGRID_ADD_ANOTHER = "Add Another";

  function cloneEditGridRowLayout(layout) {
    const cloned = {};
    Object.keys(layout || {}).forEach(key => {
      cloned[key] = Array.isArray(layout[key]) ? layout[key].slice() : [];
    });
    return cloned;
  }

  function normalizeEditGridRowLayout(layout) {
    const source = Array.isArray(layout) ? { 1: layout } : layout;
    const normalized = {};

    Object.keys(source || {})
      .map(key => Number(key))
      .filter(key => Number.isInteger(key) && key > 0)
      .sort((a, b) => a - b)
      .forEach(key => {
        const spans = Array.isArray(source[key]) ? source[key] : source[String(key)];
        const cleaned = (spans || [])
          .map(span => Number(span))
          .filter(span => Number.isFinite(span) && span > 0)
          .map(span => Math.round(span));

        if (cleaned.length) {
          normalized[key] = cleaned;
        }
      });

    return Object.keys(normalized).length
      ? normalized
      : cloneEditGridRowLayout(DEFAULT_EDITGRID_ROW_LAYOUT);
  }

  function serializeEditGridRowLayout(layout) {
    const normalized = normalizeEditGridRowLayout(layout);
    return Object.keys(normalized)
      .map(key => `  ${key}:[${normalized[key].join(",")}],`)
      .join("\n");
  }

  function countEditGridRowLayoutSlots(layout) {
    const normalized = normalizeEditGridRowLayout(layout);
    return Object.values(normalized).reduce((total, row) => total + row.length, 0);
  }

  function areEditGridRowLayoutsEqual(a, b) {
    const left = normalizeEditGridRowLayout(a);
    const right = normalizeEditGridRowLayout(b);
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);

    if (leftKeys.length !== rightKeys.length) return false;

    return leftKeys.every(key => {
      const leftRow = left[key] || [];
      const rightRow = right[key] || [];
      if (leftRow.length !== rightRow.length) return false;
      return leftRow.every((span, index) => span === rightRow[index]);
    });
  }

  function formatEditGridRowLayoutInput(layout) {
    return serializeEditGridRowLayout(layout);
  }

  function parseEditGridRowLayoutInput(input) {
    const raw = String(input || "");
    const matches = [...raw.matchAll(/(\d+)\s*:\s*\[([^\]]*)\]/g)];
    if (!matches.length) return null;

    const parsed = {};
    matches.forEach(([, keyRaw, spansRaw]) => {
      const key = Number(keyRaw);
      const spans = spansRaw
        .split(",")
        .map(part => Number(String(part).trim()))
        .filter(span => Number.isFinite(span) && span > 0)
        .map(span => Math.round(span));

      if (Number.isInteger(key) && key > 0 && spans.length) {
        parsed[key] = spans;
      }
    });

    return Object.keys(parsed).length ? normalizeEditGridRowLayout(parsed) : null;
  }

  function buildEditGridRowTemplate(config = {}) {
    const rowLayout = normalizeEditGridRowLayout(config.rowLayout);
    const layoutSource = serializeEditGridRowLayout(rowLayout);

    return `{% var rowLayout = {
${layoutSource}
}; %}

{%
  var gapX = 4;
  var gapY = 4;
  var radius = 4;
  var bottomW = 2;
  var counterW = 34;

  // First-row header alignment control
  var headerLineH = 16;     // px
  var headerPadY  = 4;      // px
  var headerPadX  = 6;      // px
  var headerMinLines = 2;
  var headerMinH = (headerLineH * headerMinLines) + (headerPadY * 2);

  var cellPadY  = 1;
  var cellPadX  = 2;
  var valuePadY = 1;
  var valuePadX = 2;

  var rows = [];
  var logical = 1;
  var i = 0;

  while (i < components.length) {
    var layout = rowLayout[logical] || [1,1,1];
    var cells = [];

    for (var j = 0; j < layout.length && i < components.length; j++) {
      cells.push({ comp: components[i], span: layout[j] });
      i++;
    }

    if (!cells.length) break;
    rows.push(cells);
    logical++;
  }

  function sumSpans(cells){
    var t = 0;
    for (var k = 0; k < cells.length; k++) t += (cells[k].span || 1);
    return t || 1;
  }

  function widthStyle(span, total, cellCount){
    var gutters = Math.max(0, (cellCount || 0) - 1);
    var fixedPx = counterW + gapX + (gutters * gapX);
    var ratio = total ? (span / total) : 1;

    if (ratio < 0) ratio = 0;
    ratio = Math.round(ratio * 1000000) / 1000000;

    return "width:calc((100% - " + fixedPx + "px) * " + ratio + ") !important;";
  }

  var wrapStyle =
    "width:100% !important;margin:0 !important;padding:0 !important;" +
    "text-align:left !important;";

  var tableStyle =
    "display:table !important;width:100% !important;table-layout:fixed !important;" +
    "border:0 !important;margin:0 !important;padding:0 !important;" +
    "background:transparent !important;text-align:left !important;";

  var rowStyle = "display:table-row !important;";

  var cellBase =
    "display:table-cell !important;vertical-align:top !important;" +
    "text-align:left !important;border:0 !important;margin:0 !important;" +
    "background:transparent !important;box-sizing:border-box !important;";

  var gutterCell =
    cellBase + "width:" + gapX + "px !important;padding:0 !important;";

  var dataCell =
    cellBase +
    "padding:" + cellPadY + "px " + cellPadX + "px !important;" +
    "border-bottom:" + bottomW + "px solid #e8e8e8 !important;" +
    "border-radius:" + radius + "px !important;";

  var headerChip =
    "display:block !important;width:100% !important;box-sizing:border-box !important;" +
    "background:#f4f4f4 !important;border-radius:" + radius + "px !important;" +
    "padding:" + headerPadY + "px " + headerPadX + "px !important;" +
    "font-size:13px !important;font-weight:700 !important;letter-spacing:.1px !important;" +
    "text-align:left !important;" +
    "line-height:" + headerLineH + "px !important;" +
    "min-height:" + headerMinH + "px !important;" +
    "white-space:normal !important;" +
    "overflow:hidden !important;";

  var valueStyle =
    "display:block !important;width:100% !important;box-sizing:border-box !important;" +
    "font-size:13px !important;text-align:left !important;" +
    "padding:" + valuePadY + "px " + valuePadX + "px !important;" +
    "min-height:0 !important;" +
    "overflow-wrap:anywhere !important;word-break:break-word !important;";

  var spacerStyle =
    "display:block !important;height:" + gapY + "px !important;";

  var btnBase =
    "display:inline-flex !important;align-items:center !important;justify-content:center !important;" +
    "width:34px !important;height:34px !important;min-width:34px !important;min-height:34px !important;" +
    "padding:0 !important;margin:0 0 0 8px !important;border-radius:6px !important;" +
    "text-decoration:none !important;cursor:pointer !important;user-select:none !important;" +
    "line-height:1 !important;box-sizing:border-box !important;";

  var btnLight  = btnBase + "background:#f8f9fa !important;border:1px solid #ced4da !important;color:#495057 !important;";
  var btnDanger = btnBase + "background:#dc3545 !important;border:1px solid #dc3545 !important;color:#fff !important;";

  var actionsWrap =
    "width:100% !important;text-align:right !important;margin-top:4px !important;padding-top:0 !important;";
%}

{% rows.forEach(function(cells, rIdx){ var total = sumSpans(cells); %}

  <div style="{{ wrapStyle }}">
    <div style="{{ tableStyle }}">
      <div style="{{ rowStyle }}">

        <div style="{{ gutterCell }}"></div>

        {% cells.forEach(function(cell, cIdx){ %}
          <div style="{{ dataCell + widthStyle(cell.span, total, cells.length) }}">

            {% if (typeof rowIndex !== 'undefined' && rowIndex === 0) { %}
              <div style="{{ headerChip }}">{{ cell.comp.label }}</div>
            {% } %}

            <div style="{{ valueStyle }}">{{ getView(cell.comp, row[cell.comp.key]) }}</div>
          </div>

          {% if (cIdx < cells.length - 1) { %}
            <div style="{{ gutterCell }}"></div>
          {% } %}
        {% }); %}

      </div>
    </div>
  </div>

  {% if (rIdx < rows.length - 1) { %}
    <div style="{{ spacerStyle }}"></div>
  {% } %}

{% }); %}

{% if (!instance.options.readOnly && !instance.disabled) { %}
  <div style="{{ actionsWrap }}">
    <button class="editRow" style="{{ btnLight }}" type="button" tabindex="0" aria-label="Edit row">
      <i class="{{ iconClass('edit') }}" style="line-height:1 !important;pointer-events:none;"></i>
    </button>

    {% if (instance.hasRemoveButtons && instance.hasRemoveButtons()) { %}
      <button class="removeRow" style="{{ btnDanger }}" type="button" tabindex="0" aria-label="Delete row">
        <i class="{{ iconClass('trash') }}" style="line-height:1 !important;pointer-events:none;"></i>
      </button>
    {% } %}
  </div>
{% } %}
`;
  }

  function resolveEditGridTemplateConfig(component) {
    const source = component || {};
    const storedLayout = source.editGridRowLayout || source.rowLayout;
    const parsedLayout = storedLayout ? null : parseEditGridRowLayoutInput(source?.templates?.row);
    const rowLayout = normalizeEditGridRowLayout(storedLayout || parsedLayout);
    const hasAddAnother = Object.prototype.hasOwnProperty.call(source, "addAnother");

    return {
      rowLayout,
      addAnother: hasAddAnother ? String(source.addAnother ?? "") : DEFAULT_EDITGRID_ADD_ANOTHER
    };
  }

  function applyEditGridTemplateConfig(component, config = {}) {
    if (!component) return component;

    const current = resolveEditGridTemplateConfig(component);
    const hasAddAnother = Object.prototype.hasOwnProperty.call(config, "addAnother");
    const rowLayout = normalizeEditGridRowLayout(config.rowLayout || current.rowLayout);
    const addAnother = hasAddAnother ? String(config.addAnother ?? "") : current.addAnother;

    // Legacy schemas may still carry editGridRowLayout, but we should not emit it.
    delete component.editGridRowLayout;
    component.addAnother = addAnother;
    component.templates = component.templates || {};
    component.templates.header = "";
    component.templates.row = buildEditGridRowTemplate({ rowLayout });

    return component;
  }

  function syncAutomaticEditGridTemplateConfig(component) {
    if (!component || component.type !== "editgrid") return component;

    const current = resolveEditGridTemplateConfig(component);
    const currentSlotCount = countEditGridRowLayoutSlots(current.rowLayout);
    const autoLayoutForCurrentSlots = buildAutoEditGridRowLayout(currentSlotCount);

    if (!areEditGridRowLayoutsEqual(current.rowLayout, autoLayoutForCurrentSlots)) {
      return component;
    }

    const childCount = Array.isArray(component.components) ? component.components.length : 0;
    const nextAutoLayout = buildAutoEditGridRowLayout(childCount);

    if (areEditGridRowLayoutsEqual(current.rowLayout, nextAutoLayout)) {
      return component;
    }

    return applyEditGridTemplateConfig(component, {
      rowLayout: nextAutoLayout,
      addAnother: current.addAnother
    });
  }
  


  /**
   * Builds a brand-new component object.
   */
function createComponent(type, typedLabel = "", options = [],
                           hideLabelParam = false, passMark) {

    /* -------------------------------------------------------------
       Accept either:
         • "Description"                     ← string
         • { en:"Description", fr:"Description (FR)" }  ← object
       and turn it into one string that Form.io can show,
       eg.  "Description / Description (FR)"
    ------------------------------------------------------------- */
    function normaliseLabel(lbl) {
      if (typeof lbl === 'string') return lbl;
      if (lbl && typeof lbl === 'object') {
        const en = lbl.en      || lbl.english || "";
        const fr = lbl.fr      || lbl.french  || "";
        if (en && fr) return `${en} / ${fr}`;
        return en || fr || "";
      }
      return "";
    }

    const rawLabel   = normaliseLabel(typedLabel);
    const finalLabel = rawLabel.trim() ||
                       DEFAULT_LABELS[type] ||
                       _.startCase(type);
    const normalizedFinalLabel = normalizeBuilderTitleLabel(finalLabel, type);
    const getFieldsetLegend = (labelText = "") => {
      const trimmed = String(labelText || "").trim();
      if (!trimmed) return "";
      const normalized = trimmed.toLowerCase();
      const genericFieldsetLabels = new Set([
        String(DEFAULT_LABELS.fieldset || "Section").toLowerCase(),
        "grouping"
      ]);
      return genericFieldsetLabels.has(normalized)
        ? ""
        : normalizeBuilderTitleLabel(trimmed, "fieldset");
    };

    const generatedKey = generateUniqueKey(normalizedFinalLabel);

    let baseComp = {
      label: normalizedFinalLabel,
      hideLabel: hideLabelParam === undefined ? false : hideLabelParam,
      key: generatedKey,
      type: type,
      input: true,
      tableView: true,
      reportable: true,
      validate: { required: true }   // ← stays ON for new one-click comps
    };

    if (type === 'fieldset' || type === 'speed') {
      baseComp.input = false;
      baseComp.tableView = false;
      // Suppress the visible legend for generic "Grouping" fieldsets.
      baseComp.legend = getFieldsetLegend(baseComp.label || normalizedFinalLabel);
      baseComp.components = [];
      baseComp.validate   = { required:true };
    }
    else if (type === 'grouping') {
      // Create the outer grouping fieldset with a fixed key "grouping".
    const grpLabel = normalizeBuilderTitleLabel(rawLabel.trim() || DEFAULT_LABELS.fieldset, 'fieldset');    // “New”, “Area A”, …
          const grpKey   = generateUniqueKey(grpLabel);                         // → new, new1 …

          const outerComp = {
            label      : grpLabel,  // shows on the card & in JSON
            legend     : getFieldsetLegend(grpLabel),  // what Form.io renders at runtime
            key        : grpKey,
            type       : 'fieldset',
            input      : false,
            tableView  : false,
            components : []
          };
        
          /* ---------- INNER field-set (so users can still add columns, etc.) */
          const innerComp = createComponent(
            'fieldset',
            typedLabel,            // keeps the same text
            options,
            hideLabelParam
          );
        
          // ensure the inner key ends with a digit (actions driver logic relies on it)
          if (!/\d+$/.test(innerComp.key)) innerComp.key += '1';
        
          outerComp.components.push(innerComp);
          return outerComp;
       }  
    else if (type === 'editgrid') {
      baseComp = {
        label: normalizedFinalLabel,
        labelWidth: 30,
        labelMargin: 3,
        customClass: "removeborder table-responsive",
        hideLabel: hideLabelParam,
        tableView: false,
        modal: true,
        rowDrafts: false,
        key: generatedKey,
        type: "editgrid",
        displayAsTable: false,
        input: true,
        components: [] 
      };
      applyEditGridTemplateConfig(baseComp, {
        rowLayout: DEFAULT_EDITGRID_ROW_LAYOUT,
        addAnother: DEFAULT_EDITGRID_ADD_ANOTHER
      });
    }
    else if (type === 'datagrid') {
      baseComp = {
        label: normalizedFinalLabel,
        labelWidth: 30,
        labelMargin: 3,
        reorder: false,
        addAnotherPosition: "bottom",
        layoutFixed: false,
        enableRowGroups: false,
        initEmpty: false,
        hideLabel: true,
        tableView: false,
        defaultValue: [{}],
        key: generatedKey,
        type: "datagrid",
        input: true,
        components: [
          {
            label: "Grouping",
            labelWidth: 30,
            labelMargin: 3,
            hideLabel: true,
            key: ensureGloballyUniqueKey("fieldSet", ""),
            type: "fieldset",
            input: false,
            tableView: false,
            components: []
          }
        ]
      };
    }
    else if (type === 'columns') {
      // always start with TWO columns (12-grid → 6+6)
      baseComp = {
        label: normalizedFinalLabel,
        labelWidth: 30,
        labelMargin: 3,
        key: generatedKey,
        type: 'columns',
        input: false,
        tableView: false,
        columns: [
          {
            components   : [],     // we’ll drop the owner here later
            width        : 6,
            offset       : 0,
            push         : 0,
            pull         : 0,
            size         : 'sm',
            currentWidth : 6
          },
          {
            components   : [],
            width        : 6,
            offset       : 0,
            push         : 0,
            pull         : 0,
            size         : 'sm',
            currentWidth : 6
          }
        ]
      };
    }
    else if (type === 'radio') {
      baseComp.tableView = false;
      baseComp.inline = true;
      baseComp.optionsLabelPosition = "right";
      baseComp.validate = { required: true };
      const uniqueItems = ensureUniqueValues(options);
      baseComp.values = uniqueItems.map(opt => ({
           label    : opt.label,
           value    : opt.value,
           shortcut : opt.shortcut || "",
           flag     : opt.flag     || ""      // ← preserves “success” & “danger”
         }));
    }
    else if (type === 'select') {
      baseComp.widget = "html5";
      baseComp.validate = { required: true };
      baseComp.placeholder = "-- Select --";
      const uniqueItems = ensureUniqueValues(options);
      baseComp.data = {
        values: uniqueItems.map(opt => ({
          label: opt.label,
          value: opt.value,
          flag: ""
        }))
      };
    }
    else if (type === 'speed') {
      /**
       * Build an outer fieldset that will hold multiple
       * “radio + actions” items. We won't initially fill the
       * .components here. We'll fill them after the user
       * picks their “labels” and “values” in the custom modal.
       */
      baseComp = {
        label      : normalizedFinalLabel,
        legend     : normalizedFinalLabel,
        hideLabel  : false,
        key        : generateUniqueKey(normalizedFinalLabel || 'speed'),
        type       : 'speed',
        input      : false,
        tableView  : false,
        components : [],  // we’ll fill these after the modal
        validate   : { required:true }
      };
    }
    /*──────────────────────────────────────────────────────────────
      QUIZ  –  outer wrapper + boilerplate internals
    ──────────────────────────────────────────────────────────────*/
    else if (type === 'quiz') {
      const passMarkValue = Math.max(
        1,
        Number(
          passMark && typeof passMark === 'object'
            ? passMark.passMark
            : passMark
        ) || 1
      );
      const questionFieldKey = 'questionLabel';
      const answerFieldKey = 'correctValueS';
      const questionComponentKeyField = 'questionComponentKey';
      const summaryKey = generateUniqueKey('quizSummary');
      const passKey = generateUniqueKey('passMark');
      const gridKey = generateUniqueKey('answerKey');
      const questionsFieldsetKey = generateUniqueKey('quizQuestions');
      const setupFieldsetKey = generateUniqueKey('quizSetup');
      const resultsFieldsetKey = generateUniqueKey('quizResults');
      const resultKey = generateUniqueKey('quizResult');
      const incorrectKey = generateUniqueKey('incorrectAnswers');

      baseComp = {
        label: normalizedFinalLabel,
        hideLabel: hideLabelParam === undefined ? true : hideLabelParam,
        legend: '',
        key: generateUniqueKey(normalizedFinalLabel || 'quiz'),
        type: 'fieldset',
        customType: 'quiz',
        input: false,
        tableView: false,
        components: [
          {
            label: 'Quiz Questions',
            legend: '',
            labelWidth: 30,
            labelMargin: 3,
            key: questionsFieldsetKey,
            type: 'fieldset',
            input: false,
            tableView: false,
            components: []
          },
          {
            label: 'Quiz Setup',
            legend: '',
            labelWidth: 30,
            labelMargin: 3,
            hidden: true,
            key: setupFieldsetKey,
            type: 'fieldset',
            input: false,
            tableView: false,
            builderHidden: true,
            components: [
              {
                label: 'Quiz Summary',
                labelWidth: 30,
                labelMargin: 3,
                hidden: true,
                tableView: false,
                reportable: false,
                clearOnHide: false,
                redrawOn: 'data',
                refreshOn: 'data',
                calculateValue: buildQuizSummaryCalculation(),
                key: summaryKey,
                type: 'textfield',
                input: true
              },
              {
                label: 'Pass Mark',
                labelWidth: 30,
                labelMargin: 3,
                description: 'Enter the minimum number of correct answers required to pass.',
                mask: false,
                tableView: false,
                reportable: false,
                defaultValue: passMarkValue,
                delimiter: false,
                requireDecimal: false,
                inputFormat: 'plain',
                truncateMultipleSpaces: false,
                clearOnHide: false,
                key: passKey,
                type: 'number',
                input: true,
                persistent: true
              },
              {
                label: 'Answer Key',
                labelWidth: 30,
                labelMargin: 3,
                description: 'Choose the correct answer values for each quiz question.',
                reorder: false,
                addAnotherPosition: 'bottom',
                layoutFixed: false,
                enableRowGroups: false,
                initEmpty: false,
                tableView: false,
                defaultValue: [],
                clearOnHide: false,
                key: gridKey,
                type: 'datagrid',
                input: true,
                components: [
                  {
                    label: 'Question Label',
                    labelWidth: 30,
                    labelMargin: 3,
                    tableView: true,
                    reportable: true,
                    key: questionFieldKey,
                    type: 'textfield',
                    input: true
                  },
                  {
                    label: 'Question Component Key',
                    labelWidth: 30,
                    labelMargin: 3,
                    hidden: true,
                    tableView: false,
                    reportable: false,
                    key: questionComponentKeyField,
                    type: 'textfield',
                    input: true
                  },
                  {
                    label: 'Correct Value(s)',
                    labelWidth: 30,
                    labelMargin: 3,
                    tableView: true,
                    reportable: true,
                    key: answerFieldKey,
                    type: 'textfield',
                    input: true
                  }
                ]
              }
            ]
          },
          {
            label: 'Results',
            legend: '',
            labelWidth: 30,
            labelMargin: 3,
            key: resultsFieldsetKey,
            type: 'fieldset',
            input: false,
            tableView: false,
            components: [
              {
                label: 'Result',
                labelWidth: 30,
                labelMargin: 3,
                rows: 1,
                autoExpand: true,
                disabled: true,
                tableView: true,
                reportable: true,
                redrawOn: 'data',
                refreshOn: 'data',
                calculateValue: buildQuizResultCalculation(),
                key: resultKey,
                type: 'textarea',
                input: true
              },
              {
                label: 'Incorrect Answers',
                labelWidth: 30,
                labelMargin: 3,
                editor: 'ckeditor',
                tableView: true,
                reportable: false,
                redrawOn: 'data',
                refreshOn: 'data',
                calculateValue: buildQuizIncorrectAnswersCalculation(),
                key: incorrectKey,
                type: 'textarea',
                input: true,
                isUploadEnabled: false
              }
            ]
          }
        ]
      };
    }
    else if (type === 'selectboxes') {
      baseComp.tableView = false;
      baseComp.inputType = 'checkbox';
      baseComp.optionsLabelPosition = "right";
      baseComp.validate = { required: true };
      baseComp.modalEdit = true;
      const uniqueItems = ensureUniqueValues(options);
      baseComp.values = uniqueItems.map(opt => ({
        label: opt.label,
        value: opt.value,
        shortcut: "",
        flag: ""
      }));
    }
    else if (type === 'checkbox') {
      baseComp.labelWidth = 30;
      baseComp.labelMargin = 3;
      baseComp.tableView = false;
      baseComp.reportable = true;
      delete baseComp.hideLabel;
      delete baseComp.validate;
    }
    else if (type === 'file') {
      baseComp.type = 'file';
      baseComp.labelWidth = 30;
      baseComp.labelMargin = 3;
      baseComp.tableView = false;
      baseComp.storage = 'base64';
      baseComp.fileTypes = [{ label: "", value: "image/*" }];
      baseComp.defaultValue = [];
      baseComp.multiple = true;
      baseComp.image = true;
      baseComp.imageSize = "400";
      baseComp.webcam = false;
    }
    else if (type === 'documents') {
      baseComp.type = 'documents';
      baseComp.labelWidth = 30;
      baseComp.labelMargin = 3;
      baseComp.tableView = false;
      delete baseComp.storage;
      delete baseComp.fileTypes;
      delete baseComp.defaultValue;
      delete baseComp.multiple;
      delete baseComp.image;
      delete baseComp.imageSize;
      delete baseComp.webcam;
    }
    else if (type === 'textarea') {
    baseComp.rows        = 1;      // start at one visible row
    baseComp.autoExpand  = true;   // grow while typing
    baseComp.labelWidth  = 30;     // keep your defaults consistent
    baseComp.labelMargin = 3;
    baseComp.reportable  = true;   // appears in exports
    baseComp.tableView   = true;   // shows in submissions grid
  }
    else if (type === 'phoneNumber') {
      baseComp.type = 'phoneNumber';
      baseComp.defaultValue = '';
      baseComp.prefix = '';
      baseComp.disableAutoFormatting = false;
      baseComp.enableSeparateDialCode = false;
    }
    else if (type === 'address') {
      baseComp.type = 'address';
      baseComp.tableView = false;
      baseComp.components = [
        {
          label: 'Street', key: 'street', type: 'textfield',
          input: true, tableView: true, reportable: true,
          validate: { required: true }
        },
        {
          label: 'City', key: 'city', type: 'textfield',
          input: true, tableView: true, reportable: true,
          validate: { required: true }
        },
        {
          label: 'State', key: 'state', type: 'textfield',
          input: true, tableView: true, reportable: true,
          validate: { required: true }
        },
        {
          label: 'Zip Code', key: 'zip', type: 'number',
          input: true, tableView: true, reportable: true,
          validate: { required: true }
        }
      ];
    }
    else if (['datetime', 'date', 'time'].includes(type)) {
      baseComp.customType = 'datetime';
      baseComp.type = 'datetime';
      baseComp.__dateTimeModeManual = false;
      const fallbackMode = type === 'date' ? 'date' : type === 'time' ? 'time' : 'datetime';
      if (typeof window !== "undefined" && typeof window.inferDateTimeModeFromLabel === "function") {
        baseComp.__mode = window.inferDateTimeModeFromLabel(rawLabel, fallbackMode);
      } else {
        baseComp.__mode = fallbackMode;
      }
      baseComp.tableView = false;
      baseComp.labelWidth = 30;
      baseComp.labelMargin = 3;
      baseComp.reportable = true;
      baseComp.datePicker = { disableWeekends: false, disableWeekdays: false };
      baseComp.enableMinDateInput = false;
      baseComp.enableMaxDateInput = false;

      const isDate = baseComp.__mode === 'date';
      const isTime = baseComp.__mode === 'time';
      baseComp.widget = {
        type: "calendar",
        displayInTimezone: "viewer",
        locale: "en",
        useLocaleSettings: false,
        allowInput: true,
        mode: "single",
        enableTime: !isDate,
        noCalendar: isTime,
        format: isTime ? "hh:mm a" : isDate ? "yyyy-MM-dd" : "yyyy-MM-dd hh:mm a",
        hourIncrement: 1,
        minuteIncrement: 1,
        time_24hr: false,
        minDate: null,
        disableWeekends: false,
        disableWeekdays: false,
        maxDate: null
      };

      baseComp.validate = { required: true };
    }
    else if (type === 'number') {
      baseComp.__numericStyleManual = false;
      const inferredStyle =
        (typeof window !== "undefined" && typeof window.inferNumberStyleFromLabel === "function")
          ? window.inferNumberStyleFromLabel(rawLabel, "number")
          : "number";

      baseComp.type = inferredStyle;
      if (inferredStyle === "currency") {
        baseComp.currency  = "USD";
        baseComp.delimiter = true;
        baseComp.decimal   = ".";
        baseComp.thousands = ",";
      }
      if (arguments[4] !== undefined) baseComp.defaultValue = arguments[4];
    }
    else if (type === 'currency') {
      baseComp.__numericStyleManual = false;
      baseComp.type      = 'currency';
      baseComp.currency  = 'USD';
      baseComp.delimiter = true;
      baseComp.decimal   = '.';
      baseComp.thousands = ',';
      if (arguments[4] !== undefined) baseComp.defaultValue = arguments[4];
     }
    else if (type === 'account') {
      baseComp.widget = 'choicesjs';
      baseComp.labelWidth = 30;
      baseComp.labelMargin = 3;
      baseComp.multiple = false;
      baseComp.reportable = true;
      baseComp.data = {
        values: []
      };
    }
    else if (type === 'asset') {
      baseComp.widget = 'choicesjs';
      baseComp.labelWidth = 30;
      baseComp.labelMargin = 3;
      baseComp.multiple = false;
      baseComp.reportable = false;
      baseComp.data = {
        values: []
      };
    }
      else if (type === 'disclaimer' || type === 'content') {
      baseComp = {
        html: `<p>Your disclaimer text goes here.</p>`,
        label: normalizedFinalLabel,
        labelWidth: 30,
        labelMargin: 3,
        refreshOnChange: false,
        key: generatedKey,
        type: "content",
        customType: "disclaimer",
        input: false,
        tableView: false
      };
    }
    else if (type === 'survey') {
      baseComp = {
        label: normalizedFinalLabel,
        labelWidth: 30,
        labelMargin: 3,
        hideLabel: hideLabelParam,
        tableView: true,
        reportable: true,
        questions: [],
        values: [],
        validate: { required: true },
        key: generatedKey,
        type: 'survey',
        input: true
      };
    }

    return baseComp;
  }


  function handleDisclaimerComponent(component, compIndex) {
    openLabelOptionsModal(
      (newLabel, updatedOptions, disclaimText, sQ, sO, hideLbl) => {
        component.html = disclaimText || "";
        component.label = normalizeBuilderTitleLabel(newLabel, component.type);
        component.hideLabel = !!hideLbl;
        updatePreview();
        // removed notification
        openComponentOptionsModalForColumn(compIndex);
      },
      "disclaimer",
      component.label || "",
      [],
      component.html || "",
      [],
      [],
      component.hideLabel || false
    );
  }

  function handleSurveyComponent(component, compIndex) {
    openLabelOptionsModal(
      (finalLabel, finalOpts, finalDisclaimer, finalSurveyQs, finalSurveyOpts, finalHideLabel) => {
        component.label = normalizeBuilderTitleLabel(finalLabel, component.type);
        component.labelWidth = 30;
        component.labelMargin = 3;
        component.hideLabel = !!finalHideLabel;
        component.tableView = true;
        component.reportable = true;
        component.validate = { required: true };
        component.type = "survey";
        component.input = true;
        component.questions = finalSurveyQs.map(item => ({
          label: item.label,
          value: item.value,
          tooltip: ""
        }));
        component.values = finalSurveyOpts.map(item => ({
          label: item.label, value: item.value,
          tooltip: item.tooltip || "", flag: item.flag || ""
        }));
        updatePreview();
        // removed notification
        openComponentOptionsModalForColumn(compIndex);
      },
      "survey",
      component.label || "",
      [],
      "",
      component.questions || [],
      component.values || [],
      component.hideLabel || false
    );
  }
  function handleOptionComponent(component, compIndex) {
    const currentOptions = component.type === "select"
      ? (component.data?.values || [])
      : (component.values || []);
    openLabelOptionsModal(
      (newLabel, updatedOptions, disclaim, sQ, sO, finalHideLabel) => {
        component.label = normalizeBuilderTitleLabel(newLabel, component.type);
        component.hideLabel = !!finalHideLabel;
        if (component.type === "select") {
          component.data.values = ensureUniqueValues(updatedOptions);
        } else {
          component.values = ensureUniqueValues(updatedOptions);
        }
        updatePreview();
        // removed notification
        openComponentOptionsModalForColumn(compIndex);
      },
      component.type,
      component.label || "",
      currentOptions,
      "",
      [],
      [],
      component.hideLabel || false
    );
  }

  function handleGenericComponent(component, compIndex) {
    openLabelOptionsModal(
      (label, opts, disclaim, sQ, sO, hideLbl) => {
        component.label = normalizeBuilderTitleLabel(label, component.type);
        component.hideLabel = !!hideLbl;
        updatePreview();
        // removed notification
        openComponentOptionsModalForColumn(compIndex);
      },
      component.type,
      component.label || "",
      [],
      "",
      [],
      [],
      component.hideLabel || false
    );
  }


  window._actionsCounter = window._actionsCounter || 0;
  function buildActionsBundle(parentArray) {
    // Pick suffix = '' for first bundle, '1' for second, '2' for third, …
    const suffix = window._actionsCounter === 0
      ? ''
      : String(window._actionsCounter);
    window._actionsCounter++;

    const actionsGroupKey = ensureGloballyUniqueKey('actionsGroup', suffix);
    const actionsKey = ensureGloballyUniqueKey('actions', suffix);
    const commentsKey = ensureGloballyUniqueKey('comments', suffix);
    const photosKey = ensureGloballyUniqueKey('photos', suffix);
    const taskFieldsetKey = ensureGloballyUniqueKey('taskFieldset', suffix);
    const tasksKey = ensureGloballyUniqueKey('tasks', suffix);

    const actionsGroup = {
      label: "Actions",
      labelWidth: 30,
      labelMargin: 3,
      key: actionsGroupKey,
      type: "fieldset",
      input: false,
      tableView: false,
      builderHidden: true,
      components: [
        {
          label: "Comments",
          labelWidth: 30,
          labelMargin: 3,
          autoExpand: true,
          tableView: true,
          reportable: true,
          validate: {
            required: true
          },
          key: commentsKey,
          customConditional: "const key = instance.parent.component.components.find(c => c.key.startsWith('actions'))?.key; show = row[key]?.comments;",
          type: "textarea",
          input: true
        },
        {
          label: "Grouping",
          labelWidth: 30,
          labelMargin: 3,
          builderHidden: true,
          key: taskFieldsetKey,
          customConditional: "const key = instance.parent.component.components.find(c => c.key.startsWith('actions'))?.key; show = row[key]?.task;",
          type: "fieldset",
          input: false,
          tableView: false,
          components: [
            {
              label: "Tasks",
              labelWidth: 30,
              labelMargin: 3,
              tableView: false,
              taskTriggers: [
                {
                  triggerType: "value",
                  taskPriority: "low",
                  triggerComponent: {},
                  triggerValue: {},
                  taskName: "",
                  taskType: {},
                  assignType: "",
                  assignOptions: [],
                  localId: "ej5qb2"
                }
              ],
              key: tasksKey,
              type: "tasks",
              input: true,
              defaultOpen: true,
              data: {},
              components: [
                {
                  label: "Name",
                  labelWidth: 30,
                  labelMargin: 3,
                  tableView: true,
                  reportable: false,
                  key: "title",
                  type: "textfield",
                  input: true,
                  validate: {
                    required: true
                  }
                },
                {
                  label: "Type",
                  widget: "html5",
                  labelWidth: 30,
                  labelMargin: 3,
                  builderDisableAutoOther: true,
                  tableView: true,
                  reportable: false,
                  data: {
                    values: [
                      {
                        label: "Corrective",
                        value: "6926684acbe67916d876869b"
                      },
                      {
                        label: "Preventive",
                        value: "6926684acbe679de4876869a"
                      },
                      {
                        label: "Task",
                        value: "6926684acbe6793558768699"
                      }
                    ]
                  },
                  key: "type",
                  type: "select",
                  input: true,
                  validate: {
                    required: true
                  }
                },
                {
                  label: "Priority",
                  widget: "html5",
                  labelWidth: 30,
                  labelMargin: 3,
                  builderDisableAutoOther: true,
                  tableView: true,
                  reportable: false,
                  defaultValue: "low",
                  data: {
                    values: [
                      {
                        label: "Low",
                        value: "low"
                      },
                      {
                        label: "Medium",
                        value: "medium"
                      },
                      {
                        label: "High",
                        value: "high"
                      }
                    ]
                  },
                  key: "priority",
                  type: "select",
                  input: true,
                  validate: {
                    required: true
                  }
                },
                {
                  label: "Assigned To",
                  widget: "choicesjs",
                  multiple: true,
                  labelWidth: 30,
                  labelMargin: 3,
                  tableView: true,
                  reportable: false,
                  key: "assignedTo",
                  type: "account",
                  input: true,
                  validate: {
                    required: true
                  },
                  data: {
                    values: [
                      {
                        label: "Cody Sangster",
                        value: "Cody Sangster"
                      },
                      {
                        label: "Dylan Sangster",
                        value: "Dylan Sangster"
                      },
                      {
                        label: "Spencer Pincott",
                        value: "Spencer Pincott"
                      },
                      {
                        label: "Spencer Pincott",
                        value: "Spencer Pincott"
                      }
                    ]
                  }
                }
              ]
            }
          ]
        },
        {
          label: "Photos",
          labelWidth: 30,
          labelMargin: 3,
          tableView: false,
          fileTypes: [
            {
              label: "",
              value: ""
            }
          ],
          validate: {
            required: true
          },
          key: photosKey,
          customConditional: "const key = instance.parent.component.components.find(c => c.key.startsWith('actions'))?.key; show = row[key]?.photos;",
          type: "file",
          imageSize: "400",
          input: true
        },
        {
          label: "Actions",
          labelWidth: 30,
          labelMargin: 3,
          builderDisableAutoOther: true,
          optionsLabelPosition: "right",
          inline: true,
          hideLabel: true,
          tableView: false,
          reportable: true,
          values: [
            {
              label: "Comments",
              value: "comments",
              shortcut: "",
              flag: ""
            },
            {
              label: "Photos",
              value: "photos",
              shortcut: "",
              flag: ""
            },
            {
              label: "Task",
              value: "task",
              shortcut: "",
              flag: ""
            }
          ],
          key: actionsKey,
          type: "selectboxes",
          input: true,
          inputType: "checkbox"
        }
      ]
    };

    return [actionsGroup];
  }
  
  
  window.buildActionsBundle = buildActionsBundle;
  
  function compactActionBundles(parentArray) {

    /* STEP 1 – locate all drivers (“actions, actions1, actions2 …”) */
    const drivers = parentArray
      .filter(c => c.builderHidden && c.type === 'selectboxes' && /^actions\d*$/.test(c.key))
      .sort((a,b) => parentArray.indexOf(a) - parentArray.indexOf(b));
  
    if (drivers.length <= 1) return;        // already compact
  
    /* STEP 2 – walk through drivers in DOM order and give them new ids */
    drivers.forEach((drv, idx) => {
      const oldDigits = drv.key.replace(/^actions/, '');       // "" or "1" or …
      let newDigits = idx === 0 ? '' : String(idx);
  const finalKey = ensureGloballyUniqueKey('actions', newDigits);
  newDigits = finalKey.replace(/^actions/, '');
  
      if (oldDigits === newDigits) return;                     // this one’s fine
  
      const bases = ['comments', 'photos', 'taskFieldset', 'tasks'];
bases.forEach(base => {
  // don’t ever rename our five driver keys
  if (base === 'actions') return;
  const oldKey = base + oldDigits;
  const newKey = base + newDigits;

        function renameNestedKeys(node) {
          if (!node || typeof node !== 'object') return;
          if (node.key === oldKey) node.key = newKey;
          if (node.conditional?.when === oldKey) node.conditional.when = newKey;
          if (Array.isArray(node.components)) {
            node.components.forEach(renameNestedKeys);
          }
          if (Array.isArray(node.columns)) {
            node.columns.forEach(col => {
              if (Array.isArray(col?.components)) col.components.forEach(renameNestedKeys);
            });
          }
        }

  
        parentArray.forEach(c => {
          /* rename component keys … */
          if (c.key === oldKey) {
            if (typeof window.releaseUsedKey === 'function') window.releaseUsedKey(c.key);
            else delete window._usedKeys[c.key];
            if (typeof window.reserveUsedKey === 'function') window.reserveUsedKey(newKey);
            else window._usedKeys[newKey] = true;
            c.key = newKey;
          }
  
          /* … rename conditionals */
          if (c.conditional?.when === oldKey) c.conditional.when = newKey;
  
          /* … and update deep‑nested components */
          renameNestedKeys(c);
        });
  
        /* adjust the helper flag on the owner component (if any) */
        parentArray.forEach(c => {
          if (c._actionsDriverKey === oldKey) c._actionsDriverKey = newKey;
        });
      });
    });
  }

  function findExistingActionsWrapper(parentArray, ownerComp) {
    if (!Array.isArray(parentArray) || !ownerComp) return null;

    if (ownerComp._actionsDriverKey) {
      return parentArray.find(c => c?.key === ownerComp._actionsDriverKey) || null;
    }

    const ownerIdx = parentArray.indexOf(ownerComp);
    if (ownerIdx === -1) return null;

    const candidate = parentArray[ownerIdx + 1];
    if (!candidate || candidate.type !== 'fieldset' || !candidate.builderHidden) return null;

    const nested = Array.isArray(candidate.components) ? candidate.components : [];
    const hasActionsDriver = nested.some(c =>
      c && c.type === 'selectboxes' && /^actions\d*$/i.test(String(c.key || ''))
    );

    return hasActionsDriver ? candidate : null;
  }

  function toggleActionsBundle(parentArray, enable, ownerComp) {
    /* ---------- ENABLE ---------- */
    if (enable) {
      const existingWrapper = findExistingActionsWrapper(parentArray, ownerComp);
      if (existingWrapper?.key) {
        ownerComp._actionsDriverKey = existingWrapper.key;
        return;
      }
  
      const bundle = buildActionsBundle(parentArray);
      const idx = parentArray.indexOf(ownerComp);
      if (idx === -1) {
        parentArray.push(...bundle);                     // ← fallback: shouldn’t happen
      } else {
        parentArray.splice(idx + 1, 0, ...bundle);
      }
  
      // Remember which hidden wrapper belongs to this component.
      // Keys are normalized to lowercase, so regexes against "actionsGroup"
      // are brittle here; the wrapper fieldset itself is the stable source.
      const driver = bundle.find(c => c.type === 'fieldset' && c.builderHidden)
        || bundle.find(c => c.type === 'fieldset')
        || bundle.find(c => c.builderHidden && c.type === 'selectboxes');
      if (driver && driver.key) ownerComp._actionsDriverKey = driver.key;
  
      compactActionBundles(parentArray);
      return;
    }
  
    /* ---------- DISABLE ---------- */
    const dKey = ownerComp._actionsDriverKey;
    if (!dKey) return;  // nothing to remove
  
    // collect driver + dependent keys so we can free them
    const toFree = [ dKey ];
  
    // 1. remove driver
    for (let i = parentArray.length - 1; i >= 0; i--) {
      if (parentArray[i].key === dKey) {
        parentArray.splice(i, 1);
        break;
      }
    }
  
    // 2. remove its dependents
    for (let i = parentArray.length - 1; i >= 0; i--) {
      const c = parentArray[i];
      if (c.conditional?.when === dKey) {
        toFree.push(c.key);
        parentArray.splice(i, 1);
      }
    }
  
    // 3. free them from the global registry so suffixes can be reused
    toFree.forEach(key => {
      if (typeof window.releaseUsedKey === 'function') window.releaseUsedKey(key);
      else delete window._usedKeys[key];
    });
  
    delete ownerComp._actionsDriverKey;
    compactActionBundles(parentArray);
  }
  
  window.toggleActionsBundle = toggleActionsBundle;
  

  // Expose for CommonJS if available
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      createComponent,
      ensureUniqueValues,
      applyEditGridTemplateConfig,
      buildEditGridRowTemplate,
      buildAutoEditGridRowLayout,
      formatEditGridRowLayoutInput,
      parseEditGridRowLayoutInput,
      resolveEditGridTemplateConfig,
      syncAutomaticEditGridTemplateConfig
      ,
      buildQuizSummaryCalculation,
      buildQuizResultCalculation,
      buildQuizIncorrectAnswersCalculation
    };
  }

  // Also expose to the browser global scope
  if (typeof window !== "undefined") {
    window.createComponent = createComponent;
    window.ensureUniqueValues = ensureUniqueValues;
    window.applyEditGridTemplateConfig = applyEditGridTemplateConfig;
    window.buildEditGridRowTemplate = buildEditGridRowTemplate;
    window.buildAutoEditGridRowLayout = buildAutoEditGridRowLayout;
    window.formatEditGridRowLayoutInput = formatEditGridRowLayoutInput;
    window.parseEditGridRowLayoutInput = parseEditGridRowLayoutInput;
    window.resolveEditGridTemplateConfig = resolveEditGridTemplateConfig;
    window.syncAutomaticEditGridTemplateConfig = syncAutomaticEditGridTemplateConfig;
    window.buildQuizSummaryCalculation = buildQuizSummaryCalculation;
    window.buildQuizResultCalculation = buildQuizResultCalculation;
    window.buildQuizIncorrectAnswersCalculation = buildQuizIncorrectAnswersCalculation;
  }
})();
