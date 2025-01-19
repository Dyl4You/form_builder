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
   * Gathers fieldsets from the form, sets up fieldset selection, etc.
   */
  function gatherFieldsets(components, fieldsets = []) {
    components.forEach(comp => {
      if (comp.type === "fieldset") {
        fieldsets.push(comp);
        if (comp.components && comp.components.length > 0) {
          gatherFieldsets(comp.components, fieldsets);
        }
      } else if (comp.components && comp.components.length > 0) {
        gatherFieldsets(comp.components, fieldsets);
      }
      if (comp.type === 'columns' && comp.columns) {
        comp.columns.forEach(col => {
          if (col.components && col.components.length > 0) {
            gatherFieldsets(col.components, fieldsets);
          }
        });
      }
    });
    return fieldsets;
  }
  
  function updateFieldsetCards() {
    const fieldsetListEl = document.getElementById("fieldsetList");
    if (!fieldsetListEl) return;
    const allFieldsets = gatherFieldsets(formJSON.components);
    let html = `<div class="fieldset-card ${selectedFieldsetKey === "root" ? "selected" : ""}" data-key="root">Root (Grouping)</div>`;
    allFieldsets.forEach(fs => {
      if (fs.type === 'columns') {
        console.log(`Adding Columns Component: ${fs.key}`);
      }
      const isSel = (fs.key === selectedFieldsetKey) ? "selected" : "";
      html += `<div class="fieldset-card ${isSel}" data-key="${fs.key}">${fs.label || "[No Label]"}</div>`;
    });
    fieldsetListEl.innerHTML = html;
  }
  
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
      let additionalInfo = "";
      if (comp.type === "columns") {
        additionalInfo = " (Column Container)";
      }
      if (comp.columnParent) {
        additionalInfo = ` (In Column ${comp.columnParent.columnIndex + 1})`;
      }
      html += `<div class="component-card" data-path="${i}">
                 <div class="component-details">
                   <strong>${comp.label || ""} (${comp.type || ""})</strong>
                   ${additionalInfo}
                   ${
                     comp.conditional 
                       ? `Conditional: When ${comp.conditional.when} = ${comp.conditional.eq}`
                       : ""
                   }
                 </div>
               </div>`;
    });
    return html;
  }
  
  function updateComponentList() {
    const list = document.getElementById("componentList");
    if (!list) return;
    list.innerHTML = renderComponentCards();
  }
  
  function updatePreview() {
    const preEl = document.getElementById("formPreview");
    if (preEl) {
      preEl.textContent = JSON.stringify(formJSON, null, 2);
    }
    updateComponentList();
    updateFieldsetCards();
  }
  
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
  
    // Initialize the fieldset list click handler so fieldset cards become clickable
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
  
    // Initialize the fieldset list (this will also render the clickable fieldset cards)
    updateFieldsetCards();
  
    // Initialize the component type cards
    const typeContainer = document.getElementById("componentTypeContainer");
    if (typeContainer) {
      typeContainer.addEventListener("click", (e) => {
        if (e.target.classList.contains("card")) {
          document.querySelectorAll("#componentTypeContainer .card")
            .forEach(c => c.classList.remove("selected"));
          e.target.classList.add("selected");
          selectedComponentType = e.target.getAttribute("data-type");
  
          openLabelOptionsModal(
            (label, options, disclaimerText, surveyQuestions, surveyOptions) => {
              const cmp = createComponent(selectedComponentType, label, options || [], false);
  
              if (selectedComponentType === "survey") {
                // Map survey questions/options strings into objects with a label property.
                const mappedQuestions = (surveyQuestions || []).map(q => ({ label: q }));
                const mappedOptions = (surveyOptions || []).map(o => ({ label: o }));
  
                cmp.questions = ensureUniqueValues(mappedQuestions);
                cmp.values = ensureUniqueValues(mappedOptions);
              }
              if (selectedComponentType === "disclaimer") {
                cmp.html = disclaimerText.startsWith("<p") ? disclaimerText : `<p>${disclaimerText}</p>`;
              }
  
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
  
    // Add the Component List Event Listener Here
    const compListEl = document.getElementById("componentList");
    if (compListEl) {
      compListEl.addEventListener("click", (e) => {
        let card = e.target;
        // Traverse up to the `.component-card` if the click happened inside it
        while (card && !card.classList.contains("component-card")) {
          card = card.parentElement;
        }
        if (card) {
          const path = card.getAttribute("data-path");
          openComponentOptionsModal(path); // Ensure this function is implemented correctly
        }
      });
    }
  
    // Update the preview initially
    updatePreview();
  });
  
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
        let initialLabel = targetComponent.label || "";
        let initialOptions = [];
        let initialDisclaimer = "";
  
        if (["radio", "select", "selectboxes"].includes(targetComponent.type)) {
          initialOptions = targetComponent.type === "select"
            ? targetComponent.data.values.map((o) => ({ label: o.label }))
            : targetComponent.values.map((o) => ({ label: o.label }));
        }
  
        if (targetComponent.type === "disclaimer") {
          initialDisclaimer = stripHtmlTags(targetComponent.html || "");
        }
  
        // When editing a survey, pass arrays of labels for questions and options.
        openLabelOptionsModal(
          (label, options, disclaimerText, surveyQuestions, surveyOptions) => {
            targetComponent.label = label;
            targetComponent.key = updateUniqueKey(targetComponent.key, label);
  
            if (["radio", "select", "selectboxes"].includes(targetComponent.type)) {
              if (targetComponent.type === "select") {
                targetComponent.data.values = ensureUniqueValues(options);
              } else {
                targetComponent.values = ensureUniqueValues(options);
              }
            }
  
            if (targetComponent.type === "disclaimer") {
              targetComponent.html =
                disclaimerText.startsWith("<p") ? disclaimerText : `<p>${disclaimerText}</p>`;
            }
  
            if (targetComponent.type === "survey") {
              // Map the survey questions and options (which arrive as an array of strings)
              targetComponent.questions = ensureUniqueValues(
                surveyQuestions.map(q => ({ label: q }))
              );
              targetComponent.values = ensureUniqueValues(
                surveyOptions.map(o => ({ label: o }))
              );
            }
  
            updatePreview();
            showNotification("Component updated successfully!");
            openComponentOptionsModal(relativePath);
          },
          targetComponent.type,
          initialLabel,
          initialOptions,
          initialDisclaimer,
          // Pass in initial survey questions as an array of strings (if any)
          targetComponent.questions ? targetComponent.questions.map(q => q.label) : [],
          targetComponent.values ? targetComponent.values.map(o => o.label) : []
        );
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
        openColumnComponentsModal(targetComponent, i); // Open the column components modal
      };
      columnsListEl.appendChild(btn);
    });
  
    // Show the modal and overlay
    modal.style.display = "block";
    overlay.style.display = "block";
  }
  
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
          openLabelOptionsModal((label, options) => {
            const newComp = createComponent(t, label, options || [], false);
  
            // Add the new component to the column
            targetColumn.components.push(newComp);
            updatePreview();
            showNotification(`Added ${newComp.type} to Column #${columnIndex + 1}`);
  
            // Refresh the modal
            openColumnComponentsModal(columnsComp, columnIndex);
          }, t);
        });
  
        typeContainer.appendChild(card);
      });
    }
  
    modal.style.display = "block";
    overlay.style.display = "block";
  }
  
  function handleComponentEdit(component, columnsComp, columnIndex, compIndex) {
    if (["radio", "select", "selectboxes"].includes(component.type)) {
      openLabelOptionsModal(
        (label, options, disclaimerText, surveyQuestions, surveyOptions) => {
          component.label = label;
          component.key = updateUniqueKey(component.key, label);
          component.questions = ensureUniqueValues(
            surveyQuestions.map(q => ({ label: q }))
          );
          component.values = ensureUniqueValues(
            surveyOptions.map(o => ({ label: o }))
          );
          updatePreview();
          showNotification("Component updated successfully!");
          openComponentOptionsModal(relativePath);
        },
        component.type,
        component.label || "",
        // For option-based components if applicable
        component.values ? component.values.map(o => ({ label: o.label })) : [],
        "",
        // For surveys, but this branch may not be used if component.type==="survey"
        component.questions ? component.questions.map(q => q.label) : [],
        component.values ? component.values.map(o => o.label) : []
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
        (label) => {
          component.label = label;
          updatePreview();
          openColumnComponentsModal(columnsComp, columnIndex);
          showNotification("Component updated successfully!");
        },
        component.label || ""
      );
    }
  }
  
  window.openColumnsEditorModal = openColumnsEditorModal;
  