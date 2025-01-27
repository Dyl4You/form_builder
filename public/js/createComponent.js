/****************************************************
 * public/js/createComponent.js
 ****************************************************/

/**
 * Small helper: takes an array of objects with at least { label: "..." },
 * and returns a new array ensuring each .value is unique.
 */
function ensureUniqueValues(items) {
  const used = {};
  return items.map(item => {
    const baseVal = _.camelCase(item.label);
    let newVal = baseVal;
    let i = 1;
    while (used[newVal]) {
      newVal = baseVal + i++;
    }
    used[newVal] = true;
    return { ...item, value: newVal };
  });
}

/**
 * Builds a brand-new component object.
 */
function createComponent(type, typedLabel = "", options = [], hideLabelParam = false) {
  const finalLabel = typedLabel.trim() || ("Untitled " + _.startCase(type));
  const generatedKey = generateUniqueKey(finalLabel);

  let baseComp = {
    label: finalLabel,
    hideLabel: hideLabelParam,
    key: generatedKey,
    type: type,
    input: true,
    tableView: true,
    reportable: true,
    validate: { required: true }
  };

  if (type === 'fieldset') {
    baseComp.input = false;
    baseComp.tableView = false;
    // If user typed no label => legend is blank, else we use finalLabel
    baseComp.legend = typedLabel.trim() ? finalLabel : "";
    baseComp.components = [];
  }
  else if (type === 'editgrid') {
    // Your exact Edit Grid JSON snippet:
    baseComp = {
      label: finalLabel,
      labelWidth: 30,
      labelMargin: 3,
      customClass: "removeborder table-responsive",
      hideLabel: hideLabelParam,
      tableView: false,
      modal: true,
      templates: {
        header: "",
        row: `<style>
  .custom-table {
    width: 100%;
    border-collapse: separate !important;
    border-spacing: 5px !important;
    table-layout: fixed !important;
    overflow: hidden !important;
    min-width: 500px;
  }
  .custom-table th,
  .custom-table td {
    font-size: 14px;
    padding: 5px;
    word-break: break-word;
    vertical-align: top;
    border-radius: 5px;
    text-align: left;
  }
  .custom-table tbody td {
    border-bottom: 5px solid #e8e8e8;
  }
  .custom-table tr {
    transition: background-color 0.3s ease;
  }
  .custom-table tr:hover {
    background-color: #f4f4f4;
  }
  .custom-table th {
    background: #f4f4f4;
  }
  .button-container {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin: 0.5rem 0;
  }
  .button-container .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0.5rem;
    font-size: 1.25rem;
    border-radius: 0.25rem;
  }
  .btn-light {
    background-color: #f8f9fa;
    border: 1px solid #ced4da;
    color: #495057;
  }
  .btn-light:hover {
    background-color: #e2e6ea;
  }
  .btn-danger {
    background-color: #dc3545;
    border: 1px solid #dc3545;
    color: #fff;
  }
  .btn-danger:hover {
    background-color: #c82333;
  }
</style>

{% var fields = components; %}


{% if (rowIndex === 0) { %}
<table class="custom-table">
  <thead>
    <tr>
      {% fields.forEach(field => { %}
        <th>{{ field.label }}</th>
      {% }) %}
    </tr>
  </thead>
  <tbody>
{% } %}

<tr>
  {% fields.forEach(field => { %}
    <td>{{ row[field.key] }}</td>
  {% }) %}
</tr>

{% if (rowIndex === instance.editRows.length - 1) { %}
  </tbody>
</table>

{% if (!instance.options.readOnly && !instance.disabled) { %}
  <div class="button-container">
    <button class="btn btn-default btn-light editRow">
      <i class="{{ iconClass('edit') }}"></i>
    </button>
    {% if (instance.hasRemoveButtons && instance.hasRemoveButtons()) { %}
      <button class="btn btn-danger removeRow">
        <i class="{{ iconClass('trash') }}"></i>
      </button>
    {% } %}
  </div>
{% } %}
{% } %}`
      },
      rowDrafts: false,
      key: generatedKey,
      type: "editgrid",
      displayAsTable: false,
      input: true,
      components: [] 
      // Provide a sub "fieldSet" so user can add subcomponents there
    };
  }
  else if (type === 'radio') {
    baseComp.tableView = false;
    baseComp.inline = true;
    baseComp.optionsLabelPosition = "right";
    baseComp.validate = { required: true };
    const uniqueItems = ensureUniqueValues(options);
    baseComp.values = uniqueItems.map(opt => ({
      label: opt.label,
      value: opt.value,
      shortcut: "",
      flag: ""
    }));
  }
  else if (type === 'select') {
    baseComp.widget = "html5";
    baseComp.validate = { required: true };
    baseComp.placeholder = "Tap & Select";
    const uniqueItems = ensureUniqueValues(options);
    baseComp.data = {
      values: uniqueItems.map(opt => ({
        label: opt.label,
        value: opt.value,
        flag: ""
      }))
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
  else if (type === 'file') {
    baseComp.type = 'file';
    baseComp.storage = 'base64';
    baseComp.fileTypes = [];
    baseComp.defaultValue = [];
    baseComp.multiple = false;
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
      { label: 'Street', key: 'street', type: 'textfield', input: true, tableView: true, reportable: true, validate: { required: true } },
      { label: 'City', key: 'city', type: 'textfield', input: true, tableView: true, reportable: true, validate: { required: true } },
      { label: 'State', key: 'state', type: 'textfield', input: true, tableView: true, reportable: true, validate: { required: true } },
      { label: 'Zip Code', key: 'zip', type: 'number', input: true, tableView: true, reportable: true, validate: { required: true } }
    ];
  }
  else if (type === 'datetime') {
    baseComp.type = 'textfield';
    baseComp.widget = {
      type: "calendar",
      altInput: true,
      allowInput: true,
      clickOpens: true,
      enableDate: true,
      enableTime: true,
      mode: "single",
      noCalendar: false,
      format: "MMMM d, yyyy h:mm a",
      dateFormat: "MMMM d, yyyy h:mm a",
      useLocaleSettings: false,
      hourIncrement: 1,
      minuteIncrement: 5,
      time_24hr: false,
      saveAs: "text",
      displayInTimezone: "viewer",
      locale: "en"
    };
    baseComp.tableView = true;
    baseComp.reportable = true;
    baseComp.validate = { required: true };
  }
  else if (type === 'date') {
    baseComp.type = 'textfield';
    baseComp.widget = {
      type: "calendar",
      altInput: true,
      allowInput: true,
      clickOpens: true,
      enableDate: true,
      enableTime: false,
      mode: "single",
      noCalendar: false,
      format: "MMMM d, yyyy",
      dateFormat: "MMMM d, yyyy",
      useLocaleSettings: false,
      hourIncrement: 1,
      minuteIncrement: 5,
      time_24hr: false,
      saveAs: "text",
      displayInTimezone: "viewer",
      locale: "en"
    };
    baseComp.tableView = true;
    baseComp.reportable = true;
    baseComp.validate = { required: true };
  }
  else if (type === 'time') {
    baseComp.type = 'textfield';
    baseComp.widget = {
      type: "calendar",
      altInput: true,
      allowInput: true,
      clickOpens: true,
      enableTime: true,
      noCalendar: true,
      format: "hh:mm a",
      dateFormat: "hh:mm a",
      useLocaleSettings: true,
      hourIncrement: 1,
      minuteIncrement: 5,
      time_24hr: false,
      saveAs: "text",
      displayInTimezone: "viewer",
      locale: "en"
    };
    baseComp.tableView = true;
    baseComp.reportable = true;
    baseComp.validate = { required: true };
  }
  else if (type === 'currency') {
    baseComp.type = 'currency';
    baseComp.currency = 'USD';
    baseComp.decimal = '.';
    baseComp.thousands = ',';
    baseComp.prefix = '$';
    baseComp.suffix = '';
  }
  else if (type === 'account') {
    baseComp.widget = 'choicesjs';
    baseComp.labelWidth = 30;
    baseComp.labelMargin = 3;
    baseComp.reportable = false;
    baseComp.data = {
      values: []
    };
  }
  else if (type === 'asset') {
    baseComp.widget = 'choicesjs';
    baseComp.labelWidth = 30;
    baseComp.labelMargin = 3;
    baseComp.reportable = false;
    baseComp.data = {
      values: []
    };
  }
  else if (type === 'disclaimer') {
    // Create a content-style component with an extra isDisclaimer flag.
    baseComp = {
      html: `<p>Your disclaimer text goes here.</p>`, // default content (will be updated)
      label: finalLabel,
      labelWidth: 30,
      labelMargin: 3,
      refreshOnChange: false,
      key: generatedKey,
      type: "content",
      input: false,
      tableView: false,
      isDisclaimer: true   // Flag to identify this is a disclaimer component
    };
  }
  else if (type === 'columns') {
    baseComp.input = false;
    baseComp.tableView = false;
    baseComp.columns = [];
  }
  else if (type === 'survey') {
    baseComp.type = 'survey';
    baseComp.questions = [];
    baseComp.values = [];
  }

  return baseComp;
}

function openComponentOptionsModalForColumn(columnsComp, columnIndex, compIndex) {
  const modal = document.getElementById("componentOptionsModal");
  const overlay = document.getElementById("overlay");
  if (!modal || !overlay) return;

  const targetColumn = columnsComp.columns[columnIndex];
  if (!targetColumn) {
    showNotification("Column not found!");
    return;
  }

  const targetComponent = targetColumn.components[compIndex];
  if (!targetComponent) {
    showNotification("Component not found!");
    return;
  }

  const detailsDiv = document.getElementById("componentOptionDetails");
  if (detailsDiv) {
    detailsDiv.innerHTML = `
        <strong>${targetComponent.label || "No Label"}</strong>
        <strong>(${targetComponent.type || "No Type"})</strong>
        ${
          targetComponent.conditional
            ? `<em>Conditional: When ${targetComponent.conditional.when} = ${targetComponent.conditional.eq}</em>`
            : ""
        }
    `;
  }

  // Handling logic for different component types
  switch (targetComponent.type) {
    case "disclaimer":
      handleDisclaimerComponent(targetComponent, columnsComp, columnIndex, compIndex);
      break;
    case "survey":
      handleSurveyComponent(targetComponent, columnsComp, columnIndex, compIndex);
      break;
    case "radio":
    case "select":
    case "selectboxes":
      handleOptionComponent(targetComponent, columnsComp, columnIndex, compIndex);
      break;
    default:
      handleGenericComponent(targetComponent, columnsComp, columnIndex, compIndex);
  }

  modal.style.display = "block";
  overlay.style.display = "block";
}

function handleDisclaimerComponent(component, columnsComp, columnIndex, compIndex) {
  openDisclaimerModal(newContent => {
    component.html = newContent;
    updatePreview();
    showNotification("Disclaimer updated successfully!");
    openComponentOptionsModalForColumn(columnsComp, columnIndex, compIndex);
  }, component.html || "");
}

function handleSurveyComponent(component, columnsComp, columnIndex, compIndex) {
  openSurveyQuestionsModal(questions => {
    openSurveyOptionsModal(options => {
      component.questions = ensureUniqueValues(questions);
      component.values = ensureUniqueValues(options);
      updatePreview();
      showNotification("Survey updated successfully!");
      openComponentOptionsModalForColumn(columnsComp, columnIndex, compIndex);
    }, component.values || []);
  }, component.questions || []);
}

function handleOptionComponent(component, columnsComp, columnIndex, compIndex) {
  const currentOptions = component.values || component.data?.values || [];
  openLabelOptionsModal(
    (newLabel, updatedOptions, disclaimer, sQuestions, sOptions, finalHideLabel) => {
      component.label = newLabel;
      component.hideLabel = finalHideLabel || false;

      // For select, the options are in component.data.values
      if (component.type === "select") {
        component.data.values = ensureUniqueValues(updatedOptions);
      } else {
        // For radio or selectboxes:
        component.values = ensureUniqueValues(updatedOptions);
      }

      updatePreview();
      showNotification("Options updated successfully!");
      openComponentOptionsModalForColumn(columnsComp, columnIndex, compIndex);
    },
    component.type,
    component.label,
    currentOptions
  );
}

function handleGenericComponent(component, columnsComp, columnIndex, compIndex) {
  // We can re-use the labelOptionsModal for a generic text field, but no options needed.
  openLabelOptionsModal(
    (label, opt, disclaim, sQ, sO, hideLbl) => {
      component.label = label;
      component.hideLabel = hideLbl || false;
      updatePreview();
      showNotification("Component updated successfully!");
      openColumnComponentsModal(columnsComp, columnIndex);
    },
    component.type,
    component.label || "",
    []
  );
}
