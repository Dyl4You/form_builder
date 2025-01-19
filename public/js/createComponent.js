/****************************************************
 * public/js/createComponent.js
 ****************************************************/

/**
 * Small helper: takes an array of objects with at least `{ label: "..." }`,
 * and returns a new array ensuring each `.value` is unique.
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
      baseComp.legend = finalLabel;
      baseComp.components = [];
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
      baseComp.type = 'datetime';
      baseComp.reportable = true;
      baseComp.validate = { required: true };
      baseComp.tableView = false;
      baseComp.widget = {
        type: "calendar",
        displayInTimezone: "viewer",
        locale: "en",
        useLocaleSettings: false,
        allowInput: true,
        mode: "single",
        enableTime: true,
        noCalendar: false,
        format: "yyyy-MM-dd hh:mm a",
        hourIncrement: 1,
        minuteIncrement: 1,
        time_24hr: false,
        minDate: null,
        disableWeekends: false,
        disableWeekdays: false,
        maxDate: null
      };
    }
    else if (type === 'date') {
      baseComp.type = 'datetime';
      baseComp.format = "yyyy-MM-dd";
      baseComp.enableTime = false;
      baseComp.widget = {
        type: "calendar",
        displayInTimezone: "viewer",
        locale: "en",
        useLocaleSettings: false,
        allowInput: true,
        mode: "single",
        enableTime: false,
        noCalendar: false,
        format: "yyyy-MM-dd",
        hourIncrement: 1,
        minuteIncrement: 1,
        time_24hr: false,
        minDate: null,
        disableWeekends: false,
        disableWeekdays: false,
        maxDate: null
      };
    }
    else if (type === 'time') {
      baseComp.type = 'datetime';
      baseComp.format = "hh:mm a";
      baseComp.enableDate = false;
      baseComp.widget = {
        type: "calendar",
        displayInTimezone: "viewer",
        locale: "en",
        useLocaleSettings: false,
        allowInput: true,
        mode: "single",
        enableTime: true,
        noCalendar: true,
        format: "hh:mm a",
        hourIncrement: 1,
        minuteIncrement: 1,
        time_24hr: false,
        minDate: null,
        disableWeekends: false,
        disableWeekdays: false,
        maxDate: null
      };
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
    else if (type === 'fieldset') {
      baseComp.input = false;
      baseComp.tableView = false;
      baseComp.legend = finalLabel;
      baseComp.components = [];
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
            ${targetComponent.conditional
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
        (newLabel, updatedOptions) => {
            component.label = newLabel;
            component.values = ensureUniqueValues(updatedOptions);
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
    openInputModal(newLabel => {
        component.label = newLabel;
        updatePreview();
        showNotification("Component updated successfully!");
        openColumnComponentsModal(columnsComp, columnIndex);
    }, component.label || "");
}

