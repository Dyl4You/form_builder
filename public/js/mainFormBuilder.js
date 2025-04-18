/****************************************************
 * public/js/mainFormBuilder.js
 ****************************************************/

/**
 * Gathers "containers" (both fieldsets and editgrids) from the form,
 * sets up fieldset selection, etc.
 */
function gatherFieldsets(components, fieldsets = []) {
  components.forEach(comp => {
    // If this is the special nested fieldset inside an Edit Grid, skip adding it
    const isNestedFieldset = comp.type === "fieldset" && comp.isEditGridChildFieldset;

    if ((comp.type === "fieldset" || comp.type === "editgrid") && !isNestedFieldset) {
      fieldsets.push(comp);
    }

    // Still recurse for sub-components
    if (comp.components && comp.components.length > 0) {
      gatherFieldsets(comp.components, fieldsets);
    }
  });
  return fieldsets;
}

/**
 * Return the component at a given path index within the currently selected fieldset (or root).
 */
function getComponentByPath(pathIndex) {
  let targetArray;
  if (selectedFieldsetKey === "root") {
    targetArray = formJSON.components;
  } else {
    const fs = findFieldsetByKey(formJSON.components, selectedFieldsetKey);
    targetArray = fs ? fs.components : [];
  }
  return targetArray[Number(pathIndex)];
}

/**
 * Render the list of components within the selected fieldset (or root).
 */
function renderComponentCards() {
  let comps = [];
  if (selectedFieldsetKey === "root") {
    comps = formJSON.components;
  } else {
    const fs = findFieldsetByKey(formJSON.components, selectedFieldsetKey);
    if (fs && fs.components) {
      comps = fs.components;
    }
  }

  let html = "";
  comps.forEach((comp, i) => {
    const label = comp.label || "[No Label]";
    const displayedType = comp.customType || comp.type;

    let prettyType;
    switch (displayedType) {
      case 'disclaimer':
        prettyType = 'Disclaimer Text';
        break;
      case 'textarea':
        prettyType = 'Text Area';
        break;
      case 'account':
        prettyType = 'Account';
        break;
      case 'radio':
        prettyType = 'Radio';
        break;
      case 'survey':
        prettyType = 'Survey';
        break;
      case 'selectboxes':
        prettyType = 'Select Boxes';
        break;
      case 'select':
        prettyType = 'Dropdown';
        break;
      case 'file':
        prettyType = 'Photo';
        break;
      case 'phoneNumber':
        prettyType = 'Phone Number';
        break;
      case 'address':
        prettyType = 'Address';
        break;
      case 'asset':
        prettyType = 'Asset';
        break;
      case 'datetime':
        prettyType = 'Date / Time';
        break;
      case 'number':
        prettyType = 'Number';
        break;
      case 'currency':
        prettyType = 'Currency';
        break;
      case 'fieldset':
        prettyType = 'Grouping';
        break;
      case 'editgrid':
        prettyType = 'Edit Grid';
        break;
      default:
        prettyType = displayedType;
        break;
    }

    html += `
      <div class="component-card" data-path="${i}">
        <div class="component-details">
          <strong>${label}</strong>
          <small style="opacity:0.7;">(${prettyType})</small>
        </div>
        <div class="component-actions">
          <button class="component-action-btn"
                  data-action="moveup"
                  title="Move Up">
            Up
          </button>
          <button class="component-action-btn"
                  data-action="movedown"
                  title="Move Down">
            Down
          </button>
          <button class="component-action-btn"
                  data-action="conditional"
                  title="Set Conditional Logic">
            Conditional
          </button>
          <button class="component-action-btn"
                  data-action="edit"
                  title="Edit Component">
            Edit
          </button>
          <button class="component-action-btn"
                  data-action="delete"
                  title="Delete Component">
            Delete
          </button>
        </div>
      </div>
    `;
  });
  return html;
}

/**
 * Update the visible component list in the DOM.
 */
function updateComponentList() {
  const list = document.getElementById("componentList");
  if (!list) return;
  list.innerHTML = renderComponentCards();
}

/**
 * Update the list of Fieldset "cards" so the user can select root or any sub-fieldset/editgrid.
 */
function updateFieldsetCards() {
  const fieldsetListEl = document.getElementById("fieldsetList");
  if (!fieldsetListEl) return;
  const allFieldsets = gatherFieldsets(formJSON.components);

  let html = `<div class="fieldset-card ${selectedFieldsetKey === "root" ? "selected" : ""}" data-key="root">Root (Grouping)</div>`;
  allFieldsets.forEach(fs => {
    const isSel = (fs.key === selectedFieldsetKey) ? "selected" : "";
    html += `<div class="fieldset-card ${isSel}" data-key="${fs.key}">${fs.label || "[No Label]"}</div>`;
  });
  fieldsetListEl.innerHTML = html;
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

/**
 * Update the "Form JSON Preview" <pre> element and also update the component list & fieldset cards.
 */
function updatePreview() {
  const preEl = document.getElementById("formPreview");
  if (preEl) {
    preEl.textContent = JSON.stringify(formJSON, null, 2);
  }
  updateComponentList();
  updateFieldsetCards();

  const allComps = getAllComponents(formJSON.components);
  const totalCount = allComps.length;
  const countEl = document.getElementById("totalComponents");
  if (countEl) {
    countEl.textContent = totalCount;
  }
}

/**
 * Reorder a component at the given `path` by swapping it up or down in the array.
 */
function moveComponentAtPath(path, direction) {
  let targetArray;
  if (selectedFieldsetKey === "root") {
    targetArray = formJSON.components;
  } else {
    const fs = findFieldsetByKey(formJSON.components, selectedFieldsetKey);
    targetArray = fs ? fs.components : [];
  }

  const index = Number(path);

  if (direction === "up" && index > 0) {
    [targetArray[index - 1], targetArray[index]] = [targetArray[index], targetArray[index - 1]];
  } else if (direction === "down" && index < targetArray.length - 1) {
    [targetArray[index + 1], targetArray[index]] = [targetArray[index], targetArray[index + 1]];
  }

  updatePreview();
}

/**
 * Edit a component by path index. Reuses your openLabelOptionsModal.
 */
function editComponent(pathIndex) {
  const comp = getComponentByPath(pathIndex);
  if (!comp) {
    return; // No notifications, just silently stop
  }

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


  // If it's a radio/select/selectboxes => gather current options
  if (["radio", "select", "selectboxes"].includes(comp.type)) {
    if (comp.type === "select") {
      initialOptions = (comp.data?.values || []).map(o => ({ label: o.label }));
    } else {
      initialOptions = (comp.values || []).map(o => ({ label: o.label }));
    }
  }
  // If disclaimer
  if (comp.type === "disclaimer") {
    initialDisclaimer = stripHtmlTags(comp.html || "");
  }
  // If survey
  let initialSurveyQuestions = [];
  let initialSurveyOptions = [];
  if (comp.type === "survey") {
    initialSurveyQuestions = comp.questions || [];
    initialSurveyOptions = comp.values || [];
  }

  // If textarea, read the current row count or default to 1
  let initialRows = comp.rows || 1;

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
      styleOrMode
    ) => {
      comp.label = newLabel;
      comp.hideLabel = !!finalHideLabel;
      comp.key = updateUniqueKey(comp.key, newLabel);
      
      if (!comp.validate) comp.validate = {};
      comp.validate.required = !!finalRequired;

     // ----- change Select / Radio / Select‑Boxes style if user switched -----
if (["select","radio","selectboxes"].includes(comp.type) &&
["select","radio","selectboxes"].includes(styleOrMode) &&
styleOrMode !== comp.type) {

/* ---- switch Number <‑‑> Currency if user toggled ---- */
if ((comp.type === 'number' || comp.type === 'currency') &&
    (styleOrMode === 'number' || styleOrMode === 'currency') &&
    styleOrMode !== comp.type) {
  comp.type = styleOrMode;
}

let typeToUse = chosenType;         // chosenType comes from the outer scope

if (typeToUse === "choiceList") {   // select / radio / select‑boxes
  typeToUse = styleOrDT;
}
if (typeToUse === "number") {       // number  ↔  currency
  typeToUse = styleOrDT;
}

// helper
const cloneVals = arr => arr.map(o => ({...o}));

// move option arrays to / from .data.values as needed
if (comp.type === "select") {
comp.values = cloneVals(comp.data?.values || []);
delete comp.data;
} else if (!comp.values) {
comp.values = [];
}

// common clean‑up
delete comp.inline;
delete comp.optionsLabelPosition;
delete comp.inputType;
comp.tableView = (styleOrDT === "select");

if (styleOrDT === "select") {            // Switch to Dropdown
comp.type   = "select";
comp.widget = "html5";
comp.data   = { values: cloneVals(comp.values) };
delete comp.values;
} else {                                 // Switch to Radio or Select‑Boxes
comp.type                 = styleOrDT;
comp.inline               = (styleOrDT === "radio");
comp.optionsLabelPosition = "right";
if (styleOrDT === "selectboxes") {
  comp.inputType  = "checkbox";
  comp.modalEdit  = true;
  comp.tableView  = false;
}
}
}


      // If disclaimer
      if (comp.type === "disclaimer") {
        comp.html = disclaimText.startsWith("<p")
          ? disclaimText
          : `<p>${disclaimText}</p>`;
      }

      // If survey
      if (comp.type === "survey") {
        comp.questions = ensureUniqueValues(sQ);
        comp.values = ensureUniqueValues(sO);
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

      if ((comp.customType || comp.type) === "datetime") {
  comp.__mode = selectedDTMode;
  tweakDateTimeMode(comp, selectedDTMode);
}

      updatePreview();
      // No showNotification call
    },
    (comp.customType || comp.type),
    initialLabel,
    initialOptions,
    initialDisclaimer,
    initialSurveyQuestions,
    initialSurveyOptions,
    initialHideLabel,
    comp.validate?.required ?? true,
    initialRows,
    initialDTMode
  );
}

/**
 * Remove a component from the current fieldset by path index.
 */
function removeComponentAtPath(path) {
  let targetArray;
  if (selectedFieldsetKey === "root") {
    targetArray = formJSON.components;
  } else {
    const fs = findFieldsetByKey(formJSON.components, selectedFieldsetKey);
    targetArray = fs ? fs.components : [];
  }
  const index = Number(path);
  targetArray.splice(index, 1);
  updatePreview();
}

/**
 * The "component options" modal - optional older approach
 */
function openComponentOptionsModal(relativePath) {
  currentSelectedComponentPath = relativePath;
  const modal = document.getElementById("componentOptionsModal");
  const overlay = document.getElementById("overlay");
  if (!modal || !overlay) return;

  let targetComponent;
  if (selectedFieldsetKey === "root") {
    targetComponent = formJSON.components[Number(relativePath)];
  } else {
    const fs = findFieldsetByKey(formJSON.components, selectedFieldsetKey);
    targetComponent = fs ? fs.components[Number(relativePath)] : null;
  }
  if (!targetComponent) {
    return; // no showNotification
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
      removeComponentAtPath(relativePath);
      closeComponentOptionsModal();
      // no showNotification
    };
  }

  modal.style.display = "block";
  overlay.style.display = "block";
}


/**
 * DOMContentLoaded => set up event listeners
 */
document.addEventListener("DOMContentLoaded", () => {
  // "Copy JSON" button
  const copyBtn = document.getElementById("copyJsonBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const text = document.getElementById("formPreview").textContent;
      navigator.clipboard.writeText(text)
        .then(() => {
          // no showNotification on success
        })
        .catch(err => {
          console.error("Copy error:", err);
          // no showNotification on error
        });
    });
  }

  // "Add Fieldset" button
  const addFieldsetBtn = document.getElementById("addFieldsetBtn");
  if (addFieldsetBtn) {
    addFieldsetBtn.addEventListener("click", () => {
      openLabelOptionsModal(
        (label, options, disclaimerText, surveyQuestions, surveyOptions, finalHideLabel, finalRows, finalRequired, selectedDTMode, styleOrMode, styleChoice  ) => {
          const cmp = createComponent("fieldset", label, options, finalHideLabel);
          if (selectedFieldsetKey && selectedFieldsetKey !== "root") {
            const fs = findFieldsetByKey(formJSON.components, selectedFieldsetKey);
            if (fs) {
              fs.components.push(cmp);
            } else {
              formJSON.components.push(cmp);
            }
          } else {
            formJSON.components.push(cmp);
          }

          if (!cmp.validate) cmp.validate = {};
          cmp.validate.required = !!finalRequired;
          updatePreview();
          // no showNotification
        },
        "fieldset"
      );
    });
  }

  // Fieldset list click => select a fieldset
  const fieldsetListEl = document.getElementById("fieldsetList");
  if (fieldsetListEl) {
    fieldsetListEl.addEventListener("click", (e) => {
      let card = e.target;
      while (card && !card.classList.contains("fieldset-card")) {
        card = card.parentElement;
      }
      if (card) {
        selectedFieldsetKey = card.getAttribute("data-key");
        updatePreview();
        updateFieldsetCards();
        // no showNotification
      }
    });
  }
  updateFieldsetCards();

  // Build the "cards" for user to pick new components
  const componentTypes = [
    "disclaimer",
    "textarea",
    "account",
    "choiceList",
    "survey",
    "file",
    "phoneNumber",
    "address",
    "asset",
    "datetime",
    "number",
    "editgrid"
  ];

  const typeContainer = document.getElementById("componentTypeContainer");
  if (typeContainer) {
    typeContainer.innerHTML = componentTypes
      .map(t => `<div class="card" data-type="${t}">${_.startCase(t)}</div>`)
      .join("");

    // On click of each "card", open the labelOptionsModal
    typeContainer.addEventListener("click", (e) => {
      if (e.target.classList.contains("card")) {
        document.querySelectorAll("#componentTypeContainer .card")
          .forEach(c => c.classList.remove("selected"));
        e.target.classList.add("selected");

        let chosenType = e.target.getAttribute("data-type");

        // If the selected fieldset is an editgrid, block certain types
        const fs = findFieldsetByKey(formJSON.components, selectedFieldsetKey);
        if (fs && fs.type === "editgrid") {
          const notAllowed = ["survey", "file", "fieldset", "editgrid"];
          if (notAllowed.includes(chosenType)) {
            e.target.classList.remove("selected");
            return; // no notification
          }
        }

        openLabelOptionsModal(
          (label,
            options,
            disclaimerText,
            surveyQuestions,
            surveyOptions,
            finalHideLabel,
            finalRequired,
            finalRows,
            selectedDTMode,
            styleOrDT,        // ← what the Date/Style buttons returned
           ) => {
           
             // ---------- decide the real component type ----------
             let typeToUse = chosenType;          // default is whatever card was clicked
           
             if (typeToUse === "choiceList") {    // the user then chose a style button
               typeToUse = styleOrDT;             //  -> select | radio | selectboxes
             }
             if (typeToUse === "number") {        // the “Number” card has its own style buttons
               typeToUse = styleOrDT;             //  -> number | currency
             }
             // -----------------------------------------------------
           
             const cmp = createComponent(typeToUse, label, options || [], finalHideLabel);
             if (!cmp.validate) cmp.validate = {};
              cmp.validate.required = !!finalRequired;
           

            if (chosenType === "survey") {
              cmp.questions = ensureUniqueValues(surveyQuestions);
              cmp.values = ensureUniqueValues(surveyOptions);
            }
            if (chosenType === "disclaimer") {
              cmp.html = disclaimerText.startsWith("<p")
                ? disclaimerText
                : `<p>${disclaimerText}</p>`;
            }
            // If textarea => set rows + special props
            if (chosenType === "textarea") {
              cmp.rows = finalRows || 1;
              cmp.labelWidth = 30;
              cmp.labelMargin = 3;
              cmp.autoExpand = true;
              cmp.reportable = true;
              cmp.tableView = true;
            }
            if (chosenType === "datetime") {
              cmp.__mode = selectedDTMode;
              tweakDateTimeMode(cmp, selectedDTMode);
            }
      
            

            // Insert into the chosen container
            if (selectedFieldsetKey && selectedFieldsetKey !== "root") {
              const fs2 = findFieldsetByKey(formJSON.components, selectedFieldsetKey);
              if (fs2) {
                fs2.components.push(cmp);
              } else {
                formJSON.components.push(cmp);
              }
            } else {
              formJSON.components.push(cmp);
            }
            updatePreview();
            
            document.querySelectorAll("#componentTypeContainer .card").forEach(card => {
              card.classList.remove("selected");
            });
          },
          chosenType
        );
      }
    });
  }

  // Listen for actions on each component card (Move Up, Down, Conditional, Edit, Delete)
  const compListEl = document.getElementById("componentList");
  if (compListEl) {
    compListEl.addEventListener("click", (e) => {
      const btn = e.target.closest('.component-action-btn');
      if (!btn) return;

      const action = btn.getAttribute("data-action");
      const card = btn.closest('.component-card');
      const path = card.getAttribute("data-path");

      switch (action) {
        case "moveup":
          moveComponentAtPath(path, "up");
          break;
        case "movedown":
          moveComponentAtPath(path, "down");
          break;
        case "conditional":
          openConditionalModal(path);
          break;
        case "edit":
          editComponent(path);
          break;
        case "delete":
          removeComponentAtPath(path);
          break;
      }
    });
  }

  // Initial refresh
  updatePreview();
});
