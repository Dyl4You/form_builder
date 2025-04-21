/****************************************************
 * public/js/createComponent.js
 ****************************************************/

(function(){
  // --- Environment Detection ---
  var lodash, generateUniqueKey;
  if (typeof require === 'function') {
    lodash = require('lodash');
    ({ generateUniqueKey } = require('../../src/parser/unifiedParser'));
  } else {
    lodash = window._;
    generateUniqueKey = window.generateUniqueKey || function(label) {
      var baseKey = label.toLowerCase().replace(/[^a-z0-9]/g, '');
      var uniqueKey = baseKey;
      var counter = 1;
      if (!window._usedKeys) window._usedKeys = {};
      while(window._usedKeys[uniqueKey]){
        uniqueKey = baseKey + counter++;
      }
      window._usedKeys[uniqueKey] = true;
      return uniqueKey;
    };
  }
  const _ = lodash;

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

  const DEFAULT_LABELS = {
    disclaimer : 'Disclaimer',
    textarea   : 'Text Area',
    account    : 'Worker',
    choiceList : 'Choice List',
    survey     : 'Survey',
    file       : 'Upload',
    phoneNumber: 'Phone Number',
    address    : 'Address',
    asset      : 'Asset',
    datetime   : 'Date / Time',
    number     : 'Number',
    currency   : 'Currency',
    editgrid   : 'Edit Grid',
    fieldset   : 'Grouping'
  };
  

  /**
   * Builds a brand-new component object.
   */
  function createComponent(type, typedLabel = "", options = [], hideLabelParam = false) {
    const finalLabel = typedLabel.trim() || DEFAULT_LABELS[type] || _.startCase(type);
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
      // If user typed no label => legend is blank
      baseComp.legend = typedLabel.trim() ? finalLabel : "";
      baseComp.components = [];
    }
    else if (type === 'grouping') {
      // Create the outer grouping fieldset with a fixed key "grouping".
      let outerComp = {
        label: "Grouping",
        labelWidth: 30,
        labelMargin: 3,
        key: "grouping",
        type: "fieldset",
        input: false,
        tableView: false,
        components: []
      };
    
      // Create an inner fieldset using the normal 'fieldset' branch.
      let innerComp = createComponent("fieldset", typedLabel, options, hideLabelParam);
      // Set the inner fieldset's legend to the spoken label.
      innerComp.legend = typedLabel;
      // Append "1" to the key if it doesn't end with a digit.
      if (!/\d+$/.test(innerComp.key)) {
        innerComp.key = innerComp.key + "1";
      }
    
      outerComp.components.push(innerComp);
      return outerComp;
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
  .thc-table {
    width: 100%;
    border-collapse: separate !important;
    border-spacing: 5px !important;
    table-layout: fixed !important;
    overflow: hidden !important;
    min-width: 600px;
  }
  .thc-table th,
  .thc-table td {
    font-size: 14px;
    padding: 5px;
    word-break: break-word;
    vertical-align: top;
    border-radius: 5px;
    text-align: left;
  }
  .thc-table thead th {
    background: #f4f4f4; /* Colored background for headers */
  }
  .thc-table tbody td {
    border-bottom: 5px solid #e8e8e8;
  }
  .thc-table tr {
    transition: background-color 0.6s ease !important;
  }
  .thc-table tr:hover {
    background-color: #f4f4f4;
  }
  .thc-table .row-counter {
    border-left: 5px solid #e8e8e8;
    border-bottom: none;
  }
  .thc-table tr {
    background-color: transparent;
    transition: background-color 0.3s ease;
  }
  /* Button container styling */
  .button-container {
    display: flex !important;
    justify-content: flex-end !important;
    gap: 0.5rem !important;
    margin: 0.5rem 0 !important;
  }

  /* Icon buttons styling */
  .button-container .btn {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 2.5rem !important;
    height: 2.5rem !important;
    padding: 0.5rem !important;
    font-size: 1.25rem !important;
    border-radius: 0.25rem !important;
  }

  /* Specific button styling */
  .btn-light {
    background-color: #f8f9fa !important;
    border: 1px solid #ced4da !important;
    color: #495057 !important;
  }

  .btn-light:hover {
    background-color: #e2e6ea !important;
  }

  .btn-danger {
    background-color: #dc3545 !important;
    border: 1px solid #dc3545 !important;
    color: #fff !important;
  }

  .btn-danger:hover {
    background-color: #c82333 !important;
  }

  .thc-table .list-group {
    display: table !important;
  }

  @media (max-width: 600px) {
    /* Keep button container horizontal on mobile */
    .button-container {
      justify-content: flex-end !important;
      gap: 0.25rem !important;
    }
  }
  .bg-low-risks {
    color: #2fa844 !important;
  }
  .bg-moderate-risks {
    color: #fac007 !important;
  }
  .bg-high-risks {
    color: #f77e15 !important;
  }
  .bg-danger-risks {
    color: #dc3545 !important;
  }
  .fw-bold {
    font-weight: bold;
  }
  .signature-cell {
    max-width: 100%;
    height: auto;
  }
  @media only screen and (max-width: 600px) {
    .bg-low-risks {
      color: #2fa844 !important;
    }
    .bg-moderate-risks {
      color: #fac007 !important;
    }
    .bg-high-risks {
      color: #f77e15 !important;
    }
    .bg-danger-risks {
      color: #dc3545 !important;
    }
  }
  .thc-table .row-counter {
    width: 30px;
    text-align: center;
    font-weight: bold;
    background: #f4f4f4;
    padding: 5px;
    vertical-align: middle;
  }
</style>

<table class="thc-table">
  {% if (rowIndex === 0) { %}
  <thead>
    <tr>
      {% components.forEach(function(component) { %}
        <th>{{ component.label }}</th>
      {% }) %}
    </tr>
  </thead>
  {% } %}
  <tbody>
<tr>
  {% components.forEach(function(component) { %}
    <td>
      {{ getView(component, row[component.key]) }}
    </td>
  {% }) %}
</tr>
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
`,
        },
        rowDrafts: false,
        key: generatedKey,
        type: "editgrid",
        displayAsTable: false,
        input: true,
        components: [] 
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
    else if (type === 'datetime') {
      baseComp.customType = 'datetime';
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
      baseComp.customType = 'date';
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
      baseComp.customType = 'time';
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
      baseComp = {
        html: `<p>Your disclaimer text goes here.</p>`,
        label: finalLabel,
        labelWidth: 30,
        labelMargin: 3,
        refreshOnChange: false,
        key: generatedKey,
        type: "content",
        input: false,
        tableView: false
      };
    }
    else if (type === 'survey') {
      baseComp = {
        label: finalLabel,
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
        component.label = newLabel;
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
        component.label = finalLabel;
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
          label: item.label,
          value: item.value,
          tooltip: "",
          flag: ""
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
        component.label = newLabel;
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
        component.label = label;
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

  function buildActionsBundle () {                                      // "" for first bundle, "1" for 2nd …
    
    const commentKey    = generateUniqueKey("comments");
    const photoKey      = generateUniqueKey("photos");
    const taskKey       = generateUniqueKey("tasks");
    const tasksGroupKey = generateUniqueKey("tasksgroup");
    const actionsKey    = generateUniqueKey("actions");
  
    /* ---------- Comments ----------------------------------------------- */
    const commentsComp = {
      label       : "Comments",
      labelWidth  : 30,
      labelMargin : 3,
      autoExpand  : true,
      tableView   : true,
      reportable  : true,
      validate    : { required: true },
      key         : commentKey,
      type        : "textarea",
      input       : true,
      builderHidden: true,
      conditional : { show:true, when: actionsKey, eq:"comments" }
    };
  
    /* ---------- Photos -------------------------------------------------- */
    const photosComp = {
      label       : "Photos",
      labelWidth  : 30,
      labelMargin : 3,
      hideLabel   : true,
      tableView   : false,
      fileTypes   : [{ label:"", value:"" }],
      imageSize   : "400",
      key         : photoKey,
      type        : "file",
      input       : true,
      builderHidden: true,
      validate    : { required: true },
      conditional : { show:true, when: actionsKey, eq:"photos" }
    };
  
    /* ---------- inner Tasks component (no conditional) ------------------ */
    const tasksComp = {
      label        : "Tasks",
      labelWidth   : 30,
      labelMargin  : 3,
      hideLabel    : true,
      tableView    : false,
      key          : taskKey,
      type         : "tasks",
      input        : true,
      defaultOpen  : true,
      data         : {},
      taskTriggers : [],
  
      components : [
        {
          label      : "Name",
          labelWidth : 30,
          labelMargin: 3,
          key        : "title",
          type       : "textfield",
          input      : true,
          validate   : { required:true },
          tableView  : true
        },
        {
          label      : "Type",
          widget     : "html5",
          labelWidth : 30,
          labelMargin: 3,
          key        : "type",
          type       : "select",
          input      : true,
          validate   : { required:true },
          data       : {
            values : [
              { label:"Corrective", value:"corrective" },
              { label:"Preventive", value:"preventive" },
              { label:"Task",       value:"task"       }
            ]
          },
          tableView : true
        },
        {
          label        : "Priority",
          widget       : "html5",
          labelWidth   : 30,
          labelMargin  : 3,
          key          : "priority",
          type         : "select",
          input        : true,
          defaultValue : "low",
          validate     : { required:true },
          data         : {
            values : [
              { label:"Low",    value:"low"    },
              { label:"Medium", value:"medium" },
              { label:"High",   value:"high"   }
            ]
          },
          tableView : true
        },
        {
          label       : "Assigned To",
          widget      : "choicesjs",
          multiple    : true,
          labelWidth  : 30,
          labelMargin : 3,
          key         : "assignedTo",
          type        : "account",
          input       : true,
          validate    : { required:true },
          data        : { values: [] },
          tableView   : true
        }
      ]
    };
  
    /* ---------- wrapper field‑set that *does* carry the conditional ----- */
    const tasksFieldset = {
      label       : "Tasks",
      key         : tasksGroupKey,
      type        : "fieldset",
      input       : false,
      tableView   : false,
      builderHidden: true,
      hideLabel   : true,
      conditional : { show:true, when: actionsKey, eq:"task" },
      components  : [ tasksComp ]
    };
  
    /* ---------- Actions driver ----------------------------------------- */
    const actionsDriver = {
      label                : "Actions",
      labelWidth           : 30,
      labelMargin          : 3,
      inline               : true,
      hideLabel            : true,
      optionsLabelPosition : "right",
      tableView            : false,
      reportable           : true,
      key                  : actionsKey,
      type                 : "selectboxes",
      inputType            : "checkbox",
      input                : true,
      values : [
        { label:"Comments", value:"comments" },
        { label:"Photos",   value:"photos"   },
        { label:"Task",     value:"task"     }
      ],
      builderHidden: true,
      defaultValue : { comments:false, photos:false, task:false }
    };
  
    /* ---------- assemble & return -------------------------------------- */
    return [
      commentsComp,
      photosComp,
      tasksFieldset,   // ← now a grouped container
      actionsDriver
    ];
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
  
      const bases = ['actions','comments','photos','tasks','tasksgroup'];
bases.forEach(base => {
  // don’t ever rename our five driver keys
  if (['actions','comments','photos','tasks','tasksgroup'].includes(base)) {
    return;
  }
  const oldKey = base + oldDigits;
  const newKey = base + newDigits;

  
        parentArray.forEach(c => {
          /* rename component keys … */
          if (c.key === oldKey) {
            delete window._usedKeys[c.key];
            window._usedKeys[newKey] = true;
            c.key = newKey;
          }
  
          /* … rename conditionals */
          if (c.conditional?.when === oldKey) c.conditional.when = newKey;
  
          /* … and update deep‑nested components */
          if (Array.isArray(c.components)) {
            c.components.forEach(sub => {
              if (sub.key === oldKey) sub.key = newKey;
              if (sub.conditional?.when === oldKey) sub.conditional.when = newKey;
            });
          }
        });
  
        /* adjust the helper flag on the owner component (if any) */
        parentArray.forEach(c => {
          if (c._actionsDriverKey === oldKey) c._actionsDriverKey = newKey;
        });
      });
    });
  }

   function toggleActionsBundle(parentArray, enable, ownerComp) {
       /* ---------- ENABLE ---------- */
       if (enable) {
         if (ownerComp._actionsDriverKey) return;           // already has one
    
         const bundle = buildActionsBundle();
         const idx = parentArray.indexOf(ownerComp);
          if (idx === -1) {
            parentArray.push(...bundle);           // ← fallback: shouldn’t happen
          } else {
            parentArray.splice(idx + 1, 0, ...bundle);
          }
    
         // remember which driver belongs to this component
         const driver = bundle.find(c => c.builderHidden && c.type === 'selectboxes');
         ownerComp._actionsDriverKey = driver.key;
    
         compactActionBundles(parentArray);
         return;
       }
    
       /* ---------- DISABLE ---------- */
       const dKey = ownerComp._actionsDriverKey;
       if (!dKey) return;                                   // nothing to remove
    
       // 1 remove driver
       for (let i = parentArray.length - 1; i >= 0; i--) {
         if (parentArray[i].key === dKey) {
           parentArray.splice(i, 1);
           break;
         }
       }
    
       // 2 remove its dependents
       for (let i = parentArray.length - 1; i >= 0; i--) {
         const c = parentArray[i];
         if (c.conditional?.when === dKey) parentArray.splice(i, 1);
       }
    
       delete ownerComp._actionsDriverKey;
       compactActionBundles(parentArray);
     }
    
     window.toggleActionsBundle = toggleActionsBundle;

  // Expose for CommonJS if available
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      createComponent,
      ensureUniqueValues
    };
  }

  // Also expose to the browser global scope
  if (typeof window !== "undefined") {
    window.createComponent = createComponent;
    window.ensureUniqueValues = ensureUniqueValues;
  }
})();
