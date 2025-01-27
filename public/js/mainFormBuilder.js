/****************************************************
 * public/js/mainFormBuilder.js
 ****************************************************/

/**
 * Local array of allowed component types for columns.
 * (Container types "columns" and "fieldset" are excluded.)
 */
const columnComponentTypes = [
  'disclaimer',
  'textfield',
  'textarea',
  'account',
  'radio',
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
  'currency'
];

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

    // Still recurse down for any sub-components, so we don't lose them
    if (comp.components && comp.components.length > 0) {
      gatherFieldsets(comp.components, fieldsets);
    }

    // If it's a columns component, also handle columns
    if (comp.type === 'columns' && comp.columns && comp.columns.length > 0) {
      comp.columns.forEach(col => {
        if (col.components && col.components.length > 0) {
          gatherFieldsets(col.components, fieldsets);
        }
      });
    }
  });
  return fieldsets;
}

/**
 * Update the list of Fieldset "cards" so the user can select
 * either Root or any sub-fieldset/editgrid container.
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

/**
 * Render the list of components within the currently selected fieldset (or root).
 * We include three small buttons for Conditional (C), Edit (E), Delete (D).
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
    const type = comp.type || "unknown";

    html += `
      <div class="component-card" data-path="${i}">
        <div class="component-details">
          <strong>${label}</strong> 
          <small style="opacity:0.7;">(${type})</small>
        </div>
        <div class="component-actions">
          <!-- Conditional button -->
          <button class="component-action-btn" 
                  data-action="conditional"
                  title="Set Conditional Logic">
            Conditional
          </button>

          <!-- Edit button -->
          <button class="component-action-btn"
                  data-action="edit"
                  title="Edit Component">
            Edit
          </button>

          <!-- Delete button -->
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
 * Update the "Form JSON Preview" <pre> element and refresh the component list + fieldset cards.
 */
function updatePreview() {
  const preEl = document.getElementById("formPreview");
  if (preEl) {
    preEl.textContent = JSON.stringify(formJSON, null, 2);
  }
  updateComponentList();
  updateFieldsetCards();
}

/**
 * On DOMContentLoaded, set up initial event listeners for:
 *  - Copy JSON button
 *  - Fieldset selection
 *  - Component type selection
 *  - Clicking on a component's action buttons
 */
document.addEventListener("DOMContentLoaded", () => {
  // Initialize the "Copy JSON" button
  const copyBtn = document.getElementById("copyJsonBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const text = document.getElementById("formPreview").textContent;
      navigator.clipboard.writeText(text)
        .then(() => showNotification("Form JSON copied!"))
        .catch(err => {
          console.error("Copy error:", err);
          showNotification("Copy failed.");
        });
    });
  }

  // Initialize the fieldset list click handler
  const fieldsetListEl = document.getElementById("fieldsetList");
  if (fieldsetListEl) {
    fieldsetListEl.addEventListener("click", (e) => {
      let card = e.target;
      // Traverse up the DOM tree to find the element with the 'fieldset-card' class
      while (card && !card.classList.contains("fieldset-card")) {
        card = card.parentElement;
      }
      if (card) {
        selectedFieldsetKey = card.getAttribute("data-key");
        updatePreview();
        updateFieldsetCards();
        showNotification(`Selected fieldset: ${selectedFieldsetKey}`);
      }
    });
  }

  // Initialize the fieldset list
  updateFieldsetCards();

  // LIST of components
  const componentTypes = [
    "disclaimer", 
    "textfield", 
    "textarea", 
    "account", 
    "radio", 
    "survey",
    "selectboxes", 
    "select", 
    "file", 
    "phoneNumber",
    "address", 
    "asset", 
    "datetime", 
    "date", 
    "time",
    "number", 
    "currency",
    "fieldset",
    "editgrid"
  ];

  // Initialize the component type cards
  const typeContainer = document.getElementById("componentTypeContainer");
  if (typeContainer) {
    // Build the HTML for the "cards"
    typeContainer.innerHTML = componentTypes
      .map(t => `<div class="card" data-type="${t}">${_.startCase(t)}</div>`)
      .join("");

    // 1) Check if container is editgrid, block certain types
    typeContainer.addEventListener("click", (e) => {
      if (e.target.classList.contains("card")) {
        // Unselect all, then select the clicked card
        document.querySelectorAll("#componentTypeContainer .card")
          .forEach(c => c.classList.remove("selected"));
        e.target.classList.add("selected");

        selectedComponentType = e.target.getAttribute("data-type");

        // If the selected fieldset is actually an editgrid, block certain types
        const fs = findFieldsetByKey(formJSON.components, selectedFieldsetKey);
        if (fs && fs.type === "editgrid") {
          const notAllowed = ["survey", "file", "fieldset", "editgrid"];
          if (notAllowed.includes(selectedComponentType)) {
            showNotification(`"${_.startCase(selectedComponentType)}" cannot be placed inside an Edit Grid.`);
            e.target.classList.remove("selected");
            selectedComponentType = null;
            return;
          }
        }

        // Otherwise, open the unified label/options/disclaimer/survey modal
        openLabelOptionsModal(
          (
            label,
            options,
            disclaimerText,
            surveyQuestions,
            surveyOptions,
            finalHideLabel
          ) => {
            const cmp = createComponent(selectedComponentType, label, options || [], finalHideLabel);

            // Survey
            if (selectedComponentType === "survey") {
              const mappedQuestions = (surveyQuestions || []).map(q => ({ label: q }));
              const mappedOptions = (surveyOptions || []).map(o => ({ label: o }));
              cmp.questions = ensureUniqueValues(mappedQuestions);
              cmp.values = ensureUniqueValues(mappedOptions);
            }

            // Disclaimer
            if (selectedComponentType === "disclaimer") {
              cmp.html = disclaimerText.startsWith("<p")
                ? disclaimerText
                : `<p>${disclaimerText}</p>`;
            }

            // Add to correct fieldset or root
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
            updatePreview();
            showNotification(`${cmp.label} added!`);
          },
          selectedComponentType
        );
      }
    });
  }

  // Add the Component List Event Listener
  const compListEl = document.getElementById("componentList");
  if (compListEl) {
    compListEl.addEventListener("click", (e) => {
      // The user clicked somewhere in the #componentList area
      const btn = e.target.closest('.component-action-btn');
      if (!btn) return; // Not on one of our C/E/D buttons => ignore

      const action = btn.getAttribute("data-action");
      const card = btn.closest('.component-card');
      const path = card.getAttribute("data-path");

      switch (action) {
        case "conditional":
          openConditionalModal(path);
          break;

        case "edit":
          editComponent(path);
          break;

        case "delete":
          removeComponentAtPath(path);
          showNotification("Component deleted!");
          break;
      }
    });
  }

  // Update the preview initially
  updatePreview();
});

/**
 * A new "edit" function that updates the given component at `relativePath`.
 * This replaces the old "Edit" button within the 'componentOptionsModal'.
 */
function editComponent(relativePath) {
  let targetComponent;
  if (selectedFieldsetKey === "root") {
    targetComponent = formJSON.components[Number(relativePath)];
  } else {
    const fs = findFieldsetByKey(formJSON.components, selectedFieldsetKey);
    targetComponent = fs ? fs.components[Number(relativePath)] : null;
  }
  if (!targetComponent) {
    showNotification("Component not found!");
    return;
  }

  // Prepare the existing data for the unified label/options modal
  let initialLabel = targetComponent.label || "";
  let initialOptions = [];
  let initialDisclaimer = "";
  let initialHideLabel = !!targetComponent.hideLabel;

  // If it's a select/radio/etc., gather "current options"
  if (["radio", "select", "selectboxes"].includes(targetComponent.type)) {
    // For select, they are in data.values
    if (targetComponent.type === "select") {
      initialOptions = targetComponent.data?.values?.map(o => ({ label: o.label })) || [];
    } else {
      // radio or selectboxes
      initialOptions = targetComponent.values?.map(o => ({ label: o.label })) || [];
    }
  }
  // If disclaimer
  if (targetComponent.type === "disclaimer") {
    initialDisclaimer = stripHtmlTags(targetComponent.html || "");
  }
  // If survey
  let initialSurveyQuestions = [];
  let initialSurveyOptions = [];
  if (targetComponent.type === "survey") {
    initialSurveyQuestions = (targetComponent.questions || []).map(q => q.label);
    initialSurveyOptions = (targetComponent.values || []).map(v => v.label);
  }

  // Open the same label/options/disclaimer/survey modal, pre-filled
  openLabelOptionsModal(
    (
      newLabel,
      newOptions,
      disclaimText,
      surveyQ,
      surveyO,
      finalHideLabel
    ) => {
      // Update label, hideLabel
      targetComponent.label = newLabel;
      targetComponent.hideLabel = finalHideLabel || false;

      // Update the key to remain unique
      targetComponent.key = updateUniqueKey(targetComponent.key, newLabel);

      // If it's an option-based component:
      if (["radio", "select", "selectboxes"].includes(targetComponent.type)) {
        if (targetComponent.type === "select") {
          targetComponent.data.values = ensureUniqueValues(newOptions);
        } else {
          targetComponent.values = ensureUniqueValues(newOptions);
        }
      }
      // If it's a disclaimer:
      if (targetComponent.type === "disclaimer") {
        targetComponent.html = disclaimText.startsWith("<p")
          ? disclaimText
          : `<p>${disclaimText}</p>`;
      }
      // If it's a survey:
      if (targetComponent.type === "survey") {
        targetComponent.questions = ensureUniqueValues(
          surveyQ.map(q => ({ label: q }))
        );
        targetComponent.values = ensureUniqueValues(
          surveyO.map(o => ({ label: o }))
        );
      }

      updatePreview();
      showNotification("Component updated successfully!");
    },
    targetComponent.type,
    initialLabel,
    initialOptions,
    initialDisclaimer,
    initialSurveyQuestions,
    initialSurveyOptions,
    initialHideLabel
  );
}

/**
 * The old "component options" modal (still included if needed).
 * You can remove it if you're no longer using it at all.
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

  const conditionalBtn = document.getElementById("componentAddConditionalBtn");
  const editBtn = document.getElementById("componentEditBtn");
  const deleteBtn = document.getElementById("componentDeleteBtn");

  // Add Conditional Logic
  if (conditionalBtn) {
    conditionalBtn.onclick = () => {
      openConditionalModal(relativePath);
    };
  }

  // Edit the Component
  if (editBtn) {
    editBtn.onclick = () => {
      closeComponentOptionsModal();
      editComponent(relativePath);
    };
  }

  // Delete the Component
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      removeComponentAtPath(relativePath);
      closeComponentOptionsModal();
      showNotification("Component deleted!");
    };
  }

  modal.style.display = "block";
  overlay.style.display = "block";
}

/**
 * Columns Editor modal for "columns" components (not changed).
 */
function openColumnsEditorModal(targetComponent) {
  const modal = document.getElementById("columnsModal");
  const overlay = document.getElementById("overlay");
  if (!modal || !overlay) {
    showNotification("Columns modal not found!");
    return;
  }

  // Ensure the targetComponent is valid and has columns
  if (!targetComponent || !targetComponent.columns) {
    showNotification("Invalid columns container!");
    return;
  }

  const columnsListEl = document.getElementById("columnsList");
  columnsListEl.innerHTML = "";

  // Populate the modal with column buttons
  targetComponent.columns.forEach((col, i) => {
    const btn = document.createElement("button");
    btn.textContent = `Column #${i + 1} (width: ${col.width})`;
    btn.onclick = () => {
      modal.style.display = "none";
      overlay.style.display = "none";
      openColumnComponentsModal(targetComponent, i);
    };
    columnsListEl.appendChild(btn);
  });

  modal.style.display = "block";
  overlay.style.display = "block";
}

/**
 * Displays the components inside a specific column, letting you
 * add or edit components there. (Mostly unchanged.)
 */
function openColumnComponentsModal(columnsComp, columnIndex) {
  const modal = document.getElementById("columnComponentsModal");
  const overlay = document.getElementById("overlay");

  if (!modal || !overlay) {
    showNotification("Column Components modal not found!");
    return;
  }

  const targetColumn = columnsComp.columns[columnIndex];
  if (!targetColumn) {
    showNotification("Column not found!");
    return;
  }

  const colCompList = document.getElementById("columnCompList");
  colCompList.innerHTML = "";

  // List components in the selected column
  targetColumn.components.forEach((c, compIndex) => {
    const div = document.createElement("div");
    div.className = "component-card";
    div.textContent = `${c.label} (${c.type})`;
    div.addEventListener("click", () => {
      openComponentOptionsModalForColumn(columnsComp, columnIndex, compIndex);
    });
    colCompList.appendChild(div);
  });

  // Add the option to create new components for the column
  const typeContainer = document.getElementById("columnTypeContainer");
  if (typeContainer) {
    typeContainer.innerHTML = ""; // Clear previous options
    columnComponentTypes.forEach((t) => {
      const card = document.createElement("div");
      card.classList.add("card");
      card.textContent = _.startCase(t);
      card.setAttribute("data-type", t);

      card.addEventListener("click", function () {
        openLabelOptionsModal(
          (label, options, disclaimer, sQuestions, sOptions, finalHideLabel) => {
            const newComp = createComponent(t, label, options || [], finalHideLabel);

            // For surveys:
            if (t === "survey") {
              newComp.questions = ensureUniqueValues((sQuestions || []).map(q => ({ label: q })));
              newComp.values = ensureUniqueValues((sOptions || []).map(o => ({ label: o })));
            }
            // For disclaimers:
            if (t === "disclaimer") {
              newComp.html = disclaimer.startsWith("<p")
                ? disclaimer
                : `<p>${disclaimer}</p>`;
            }

            // Add the new component to the column
            targetColumn.components.push(newComp);
            updatePreview();
            showNotification(`Added ${newComp.type} to Column #${columnIndex + 1}`);

            // Refresh the modal
            openColumnComponentsModal(columnsComp, columnIndex);
          },
          t
        );
      });

      typeContainer.appendChild(card);
    });
  }

  modal.style.display = "block";
  overlay.style.display = "block";
}

/**
 * If you need inline "edit" for a component inside columns, you could adapt
 * or reuse the main editComponent approach inside openComponentOptionsModalForColumn.
 * [This function might also remain unchanged based on your existing logic.]
 */
function handleComponentEdit(component, columnsComp, columnIndex, compIndex) {
  if (["radio", "select", "selectboxes"].includes(component.type)) {
    openLabelOptionsModal(
      (label, options, disclaim, sQ, sO, finalHideLabel) => {
        component.label = label;
        component.key = updateUniqueKey(component.key, label);
        component.hideLabel = finalHideLabel || false;
        component.questions = ensureUniqueValues(sQ.map(q => ({ label: q })));
        component.values = ensureUniqueValues(sO.map(o => ({ label: o })));
        updatePreview();
        showNotification("Component updated successfully!");
        openComponentOptionsModal(relativePath);
      },
      component.type,
      component.label || "",
      (component.values || []).map(o => ({ label: o.label })) // initial
    );
  } else if (component.type === "survey") {
    openSurveyQuestionsModal((questions) => {
      openSurveyOptionsModal((options) => {
        component.questions = ensureUniqueValues(questions.map(q => ({ label: q })));
        component.values = ensureUniqueValues(options.map(o => ({ label: o })));
        updatePreview();
        openColumnComponentsModal(columnsComp, columnIndex);
        showNotification("Survey updated successfully!");
      }, component.values ? component.values.map(o => o.label) : []);
    }, component.questions ? component.questions.map(q => q.label) : []);
  } else {
    openInputModal(
      (label, hideLbl) => {
        component.label = label;
        component.hideLabel = hideLbl || false;
        updatePreview();
        openColumnComponentsModal(columnsComp, columnIndex);
        showNotification("Component updated successfully!");
      },
      component.label || ""
    );
  }
}

// Expose any needed functions on window (if you're using them externally)
window.openColumnsEditorModal = openColumnsEditorModal;
