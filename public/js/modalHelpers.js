/****************************************************
 * public/js/modalHelpers.js
 ****************************************************/

// Utility to create a new overlay element with a specified z-index
function createOverlay(zIndex) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay'; 
  overlay.style.zIndex = zIndex;
  overlay.style.display = 'block';
  document.body.appendChild(overlay);
  return overlay;
}

// New functions to retrieve survey questions and options tags
function getSurveyQuestions() {
  const container = document.getElementById("surveyQuestionsTagContainerUnified");
  if (!container) return [];
  // Collect text of all tags inside the container
  return Array.from(container.querySelectorAll('.tag-bubble')).map(tag => tag.textContent.trim());
}

function getSurveyOptions() {
  const container = document.getElementById("surveyOptionsTagContainerUnified");
  if (!container) return [];
  return Array.from(container.querySelectorAll('.tag-bubble')).map(tag => tag.textContent.trim());
}

/**************************************************************
 *  Notification Helper
 **************************************************************/
function showNotification(message) {
  const notif = document.getElementById('notification');
  if (!notif) return;
  notif.textContent = message;
  notif.classList.add('show');
  setTimeout(() => {
    notif.classList.remove('show');
  }, 3000);
}

/**************************************************************
 *  Conditional Logic Modals
 **************************************************************/
function openConditionalModal(relativePath) {
  // close the "component options" modal
  closeComponentOptionsModal();

  const modal = document.getElementById("conditionalModal");
  const overlay = document.getElementById("overlay");
  if (!modal || !overlay) return;

  let targetComponent;
  if (selectedFieldsetKey === "root") {
    targetComponent = formJSON.components[Number(relativePath)];
  } else {
    const fieldset = findFieldsetByKey(formJSON.components, selectedFieldsetKey);
    targetComponent = fieldset ? fieldset.components[Number(relativePath)] : null;
  }

  if (!targetComponent) {
    showNotification("Component not found!");
    return;
  }

  // Check for existing conditional so we can pre-fill or start fresh
  const existingConditional = targetComponent.conditional || null;
  let selectedKey = existingConditional ? existingConditional.when : null;
  let selectedValue = existingConditional ? existingConditional.eq : null;

  // Populate the "Triggering Component" cards
  populateTriggeringComponentCards(selectedKey);

  // If we already have a known when, populate trigger value cards
  if (selectedKey) {
    const allComps = getAllComponents(formJSON.components);
    const whenComp = allComps.find(c => c.key === selectedKey);
    if (whenComp) {
      populateTriggerValueCards(whenComp, selectedValue);
    }
  } else {
    // brand new => clear eqValueCards
    const eqValueContainer = document.getElementById("eqValueCards");
    if (eqValueContainer) {
      eqValueContainer.innerHTML = "";
    }
  }

  const saveBtn = document.getElementById("saveConditionalLogicBtn");
  const clearBtn = document.getElementById("clearConditionalLogicBtn");
  const backBtn = document.getElementById("backFromConditionalBtn");

  if (saveBtn) {
    saveBtn.onclick = () => {
      const selectedKeyEl = document.querySelector("#whenKeyCards .card.selected");
      const selectedValueEl = document.querySelector("#eqValueCards .card.selected");
      if (!selectedKeyEl || !selectedValueEl) {
        showNotification("Please select both a Triggering Component Key and a Trigger Value.");
        return;
      }
      const whenKey = selectedKeyEl.getAttribute("data-key");
      const eqValue = selectedValueEl.getAttribute("data-value");
      if (!whenKey || !eqValue) {
        showNotification("Please select both a Triggering Component Key and a Trigger Value.");
        return;
      }

      // Save the new conditional on the target component
      targetComponent.conditional = {
        when: whenKey,
        eq: eqValue,
        show: true
      };

      closeConditionalModal();
      updatePreview();
      showNotification("Conditional logic saved!");
    };
  }

  if (clearBtn) {
    clearBtn.onclick = () => {
      delete targetComponent.conditional;
      closeConditionalModal();
      updatePreview();
      showNotification("Conditional logic cleared!");
    };
  }

  if (backBtn) {
    backBtn.onclick = () => {
      closeConditionalModal();
      openComponentOptionsModal(relativePath);
    };
  }

  modal.style.display = "block";
  overlay.style.display = "block";
}

function closeConditionalModal() {
  const modal = document.getElementById("conditionalModal");
  const overlay = document.getElementById("overlay");
  if (modal) modal.style.display = "none";
  if (overlay) overlay.style.display = "none";
}

/**
 * Populate the possible "Triggering Component" cards
 * and pre-select 'selectedKey' if provided (editing an existing condition).
 */
function populateTriggeringComponentCards(selectedKey = null) {
  const container = document.getElementById("whenKeyCards");
  if (!container) return;
  container.innerHTML = "";

  // Which types can be triggers?
  const allowedTypes = ["select", "selectboxes", "radio"];
  const allComponents = getAllComponents(formJSON.components)
    .filter(c => allowedTypes.includes(c.type));

  allComponents.forEach(component => {
    const card = document.createElement("div");
    card.classList.add("card", "conditional-trigger-card");
    card.textContent = component.label;
    card.setAttribute("data-key", component.key);

    // Pre-select if existing condition
    if (selectedKey && component.key === selectedKey) {
      card.classList.add("selected");
    }

    card.addEventListener("click", () => {
      // Unselect all
      document.querySelectorAll("#whenKeyCards .card")
        .forEach(x => x.classList.remove("selected"));
      card.classList.add("selected");

      // Clear eqValue
      const eqValueContainer = document.getElementById("eqValueCards");
      eqValueContainer.innerHTML = "";

      // Repopulate
      populateTriggerValueCards(component, null);
    });
    container.appendChild(card);
  });
}

/**
 * Given a selected component, populate the possible "Trigger Value" cards.
 * If 'existingEqValue' is provided, we highlight that card.
 */
function populateTriggerValueCards(selectedComponent, existingEqValue = null) {
  const container = document.getElementById("eqValueCards");
  if (!container) return;

  container.innerHTML = "";

  let valuesArray = [];
  if (selectedComponent.data && Array.isArray(selectedComponent.data.values)) {
    valuesArray = selectedComponent.data.values;
  } else if (selectedComponent.values && Array.isArray(selectedComponent.values)) {
    valuesArray = selectedComponent.values;
  }

  valuesArray.forEach(v => {
    const card = document.createElement("div");
    card.classList.add("card", "conditional-value-card");
    card.textContent = v.label;
    card.setAttribute("data-value", v.value);

    if (existingEqValue && v.value === existingEqValue) {
      card.classList.add("selected");
    }

    card.addEventListener("click", () => {
      document.querySelectorAll("#eqValueCards .card")
        .forEach(x => x.classList.remove("selected"));
      card.classList.add("selected");
    });

    container.appendChild(card);
  });
}

/**************************************************************
 *  Input Modal (labeling components)
 **************************************************************/
function openInputModal(callback, initialValue = "", backCallback) {
  const modal = document.getElementById("inputModal");
  const overlay = document.getElementById("overlay");
  if (!modal || !overlay) return;

  // Add super-nested class for higher stacking
  modal.classList.add("super-top");
  overlay.classList.add("super-top");

  const labelInput = document.getElementById("componentLabelInput");
  labelInput.value = initialValue || "";
  modal.style.display = "block";
  overlay.style.display = "block";

  const buttonsContainer = document.getElementById("inputModalButtons");
  buttonsContainer.innerHTML = "";

  // Save
  const saveBtn = document.createElement("button");
  saveBtn.id = "inputModalSaveBtn";
  saveBtn.textContent = "Save";
  saveBtn.onclick = () => {
    const typedVal = labelInput.value.trim();
    if (!typedVal) {
      showNotification("Component label is required.");
      return;
    }
    closeInputModal();
    callback(typedVal, false);
  };
  buttonsContainer.appendChild(saveBtn);

  // Hide Label
  const hideLabelBtn = document.createElement("button");
  hideLabelBtn.id = "inputModalSaveHideLabelBtn";
  hideLabelBtn.textContent = "Hide Label";
  hideLabelBtn.onclick = () => {
    const typedVal = labelInput.value.trim();
    closeInputModal();
    callback(typedVal, true);
  };
  buttonsContainer.appendChild(hideLabelBtn);

  // Optional back button
  if (backCallback) {
    const backBtn = document.createElement("button");
    backBtn.textContent = "Back";
    backBtn.onclick = () => {
      closeInputModal();
      backCallback();
    };
    buttonsContainer.appendChild(backBtn);
  }
}

function closeInputModal() {
  const modal = document.getElementById("inputModal");
  const overlay = document.getElementById("overlay");
  if (modal) {
    modal.style.display = "none";
    modal.classList.remove("super-nested");
  }
  if (overlay) {
    overlay.style.display = "none";
    overlay.classList.remove("super-nested");
  }
}

function dictateLabelAdvanced() {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    showNotification("Sorry, your browser doesn't support the Web Speech API.");
    return;
  }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = false;
  let currentText = "";

  recognition.onstart = () => {
    showNotification("Listening in advanced mode... say your text or say 'Replace X with Y'.");
  };

  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript.trim();
      const match = transcript.match(/^\s*replace\s+(.+?)\s+with\s+(.+)$/i);
      if (match) {
        const oldString = match[1];
        const newString = match[2];
        const labelEl = document.getElementById("componentLabelInput");
        const original = labelEl.value;
        const re = new RegExp(oldString, "gi");
        const updated = original.replace(re, newString);
        labelEl.value = updated;
        currentText = updated;
        showNotification(`Replaced "${oldString}" with "${newString}"`);
      } else {
        currentText += " " + transcript;
        // Title-case as example
        currentText = currentText.replace(/\b\w+/g, (word) =>
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        );
        document.getElementById("componentLabelInput").value = currentText.trim();
        showNotification("Text appended from speech!");
      }
    }
    recognition.stop();
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error", event);
    showNotification("Speech recognition error. Please try again.");
  };
  recognition.start();
}

/**************************************************************
 *  Options & Survey Modals
 **************************************************************/
function openOptionsModal(callback, initialTags = [], extraClass = "") {
  const modal = document.getElementById("optionsModal");
  const overlay = document.getElementById("overlay");
  if (!modal || !overlay) return;

  if (extraClass) {
    modal.classList.add(extraClass);
    overlay.classList.add(extraClass);
  }

  const container = document.getElementById("optionsTagContainer");
  let input = document.getElementById("optionTagInput");

  // Clone the input to reset
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  input = newInput;

  // Clear old tags
  container.querySelectorAll('.tag-bubble').forEach(tag => tag.remove());
  input.value = "";

  modal.style.display = "block";
  overlay.style.display = "block";

  const getTags = setupOptionsTagInput(input, container, initialTags);

  const saveBtn = document.getElementById("optionsModalSaveBtn");
  if (saveBtn) {
    saveBtn.onclick = () => {
      const currentTags = getTags();
      closeOptionsModal(extraClass);
      callback(currentTags.map(label => ({ label })));
    };
  }
}

function closeOptionsModal(extraClass = "") {
  const modal = document.getElementById("optionsModal");
  const overlay = document.getElementById("overlay");
  if (modal) {
    modal.style.display = "none";
    if (extraClass) modal.classList.remove(extraClass);
  }
  if (overlay) {
    overlay.style.display = "none";
    if (extraClass) overlay.classList.remove(extraClass);
  }
}

function setupOptionsTagInput(input, container, initialTags = []) {
  let tags = [...initialTags];

  function createTag(label) {
    const tag = document.createElement("span");
    tag.className = "tag-bubble";
    tag.textContent = label;
    tag.addEventListener("click", () => {
      tags = tags.filter(t => t !== label);
      tag.remove();
    });
    container.insertBefore(tag, input);
  }

  // Prepopulate
  tags.forEach(tagLabel => createTag(tagLabel));

  input.addEventListener("keydown", (e) => {
    if (e.key === "," || e.key === "Enter") {
      e.preventDefault();
      const value = input.value.trim();
      if (value) {
        tags.push(value);
        createTag(value);
        input.value = "";
      }
    }
  });

  return () => tags;
}

function openSurveyQuestionsModal(callback, initialQuestions = [], extraClass = "") {
  const modal = document.getElementById("surveyQuestionsModal");
  const overlay = document.getElementById("overlay");
  if (!modal || !overlay) return;

  if (extraClass) {
    modal.classList.add(extraClass);
    overlay.classList.add(extraClass);
  }

  const container = document.getElementById("surveyQuestionsTagContainer");
  let input = document.getElementById("surveyQuestionTagInput");

  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  input = newInput;

  container.querySelectorAll('.tag-bubble').forEach(tag => tag.remove());
  input.value = "";

  modal.style.display = "block";
  overlay.style.display = "block";

  const getSurveyQuestionsTags = setupSurveyTagInput(container, input, initialQuestions);

  const saveBtn = document.getElementById("surveyQuestionsModalSaveBtn");
  if (saveBtn) {
    saveBtn.onclick = () => {
      const currentTags = getSurveyQuestionsTags();
      if (currentTags.length === 0) {
        showNotification("Survey questions are required.");
        return;
      }
      closeSurveyQuestionsModal(extraClass);
      callback(
        currentTags.map(q => ({
          label: q,
          value: _.camelCase(q)
        }))
      );
    };
  }
}

function closeSurveyQuestionsModal(extraClass = "") {
  const modal = document.getElementById("surveyQuestionsModal");
  const overlay = document.getElementById("overlay");
  if (modal) {
    modal.style.display = "none";
    if (extraClass) {
      modal.classList.remove(extraClass);
    }
  }
  if (overlay) {
    overlay.style.display = "none";
    if (extraClass) {
      overlay.classList.remove(extraClass);
    }
  }
}

function openSurveyOptionsModal(callback, initialOptions = [], extraClass = "") {
  const modal = document.getElementById("surveyOptionsModal");
  const overlay = document.getElementById("overlay");
  if (!modal || !overlay) return;

  if (extraClass) {
    modal.classList.add(extraClass);
    overlay.classList.add(extraClass);
  }

  const container = document.getElementById("surveyOptionsTagContainer");
  let input = document.getElementById("surveyOptionTagInput");

  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  input = newInput;

  container.querySelectorAll('.tag-bubble').forEach(tag => tag.remove());
  input.value = "";

  modal.style.display = "block";
  overlay.style.display = "block";

  const getSurveyOptionsTags = setupSurveyTagInput(container, input, initialOptions);

  const saveBtn = document.getElementById("surveyOptionsModalSaveBtn");
  if (saveBtn) {
    saveBtn.onclick = () => {
      const currentTags = getSurveyOptionsTags();
      if (currentTags.length === 0) {
        showNotification("Survey options are required.");
        return;
      }
      closeSurveyOptionsModal(extraClass);
      callback(
        currentTags.map(opt => ({
          label: opt,
          value: _.camelCase(opt)
        }))
      );
    };
  }
}

function closeSurveyOptionsModal(extraClass = "") {
  const modal = document.getElementById("surveyOptionsModal");
  const overlay = document.getElementById("overlay");
  if (modal) {
    modal.style.display = "none";
    if (extraClass) {
      modal.classList.remove(extraClass);
    }
  }
  if (overlay) {
    overlay.style.display = "none";
    if (extraClass) {
      overlay.classList.remove(extraClass);
    }
  }
}

function setupSurveyTagInput(container, input, initialTags = []) {
  let tags = [...initialTags];

  function createTag(label) {
    const tag = document.createElement("span");
    tag.className = "tag-bubble";
    tag.textContent = label;
    tag.addEventListener("click", () => {
      tags = tags.filter(t => t !== label);
      tag.remove();
    });
    container.insertBefore(tag, input);
  }

  tags.forEach(tagLabel => createTag(tagLabel));

  input.addEventListener("keydown", (e) => {
    if (e.key === "," || e.key === "Enter") {
      e.preventDefault();
      const value = input.value.trim();
      if (value) {
        tags.push(value);
        createTag(value);
        input.value = "";
      }
    }
  });

  return () => tags;
}

/**************************************************************
 *  Functions to close "Component Options" modal
 **************************************************************/
function closeColumnComponentsModal() {
  const modal = document.getElementById("columnComponentsModal");
  const overlay = document.getElementById("overlay");

  if (modal) {
    modal.style.display = "none";
    modal.classList.remove("nested");
  }

  if (overlay) {
    const openNestedModals = document.querySelectorAll('.modal.nested');
    if (openNestedModals.length === 0) {
      overlay.style.display = "none";
    }
    overlay.classList.remove("nested");
  }
}
window.closeColumnComponentsModal = closeColumnComponentsModal;

function closeComponentOptionsModal() {
  const modal = document.getElementById("componentOptionsModal");
  const overlay = document.getElementById("overlay");
  if (modal) {
    modal.style.display = "none";
  }
  if (overlay) {
    overlay.style.display = "none";
  }
}
window.closeComponentOptionsModal = closeComponentOptionsModal;

function closeColumnsModal() {
  const modal = document.getElementById("columnsModal");
  const overlay = document.getElementById("overlay");
  if (modal) {
    modal.style.display = "none";
  }
  if (overlay) {
    overlay.style.display = "none";
  }
}
window.closeColumnsModal = closeColumnsModal;

/**************************************************************
 *  Disclaimer Modal
 **************************************************************/
function openDisclaimerModal(callback, initialContent = "", extraClass = "") {
  const modal = document.getElementById("disclaimerModal");
  const overlay = document.getElementById("overlay");
  if (!modal || !overlay) {
    console.error("Disclaimer modal or overlay not found in the DOM!");
    return;
  }

  if (extraClass) {
    modal.classList.add(extraClass);
    overlay.classList.add(extraClass);
  }

  const txtArea = document.getElementById("disclaimerTextArea");
  if (txtArea) {
    txtArea.value = stripHtmlTags(initialContent);
  }

  modal.style.display = "block";
  overlay.style.display = "block";

  const saveBtn = document.getElementById("saveDisclaimerBtn");
  if (saveBtn) {
    saveBtn.onclick = () => {
      const disclaimerContent = txtArea.value.trim();
      closeDisclaimerModal(extraClass);
      if (callback && typeof callback === "function") {
        callback(disclaimerContent);
      }
    };
  }
}
window.openDisclaimerModal = openDisclaimerModal;

function closeDisclaimerModal(extraClass = "") {
  const modal = document.getElementById("disclaimerModal");
  const overlay = document.getElementById("overlay");
  if (modal) {
    modal.style.display = "none";
    if (extraClass) {
      modal.classList.remove(extraClass);
    }
  }
  if (overlay) {
    overlay.style.display = "none";
    if (extraClass) {
      overlay.classList.remove(extraClass);
    }
  }
}
window.closeDisclaimerModal = closeDisclaimerModal;

function stripHtmlTags(html) {
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;
  return tempDiv.textContent || tempDiv.innerText || "";
}

/**************************************************************
 *  Unified Label & Options Modal (UPDATED with Hide Label toggle)
 **************************************************************/
function openLabelOptionsModal(
  callback,
  type,
  initialLabel = "",
  initialOptions = [],
  initialDisclaimer = "",
  initialSurveyQuestions = [],
  initialSurveyOptions = [],
  initialHideLabel = false
) {
  const modal = document.getElementById("labelOptionsModal");
  if (!modal) return;

  // Create a new overlay for this modal with desired z-index
  const overlay = createOverlay(1999);
  modal.classList.add("super-top");

  // Show/hide sections based on component type
  document.getElementById("optionsSection").style.display =
    (["radio", "select", "selectboxes"].includes(type)) ? "block" : "none";
  document.getElementById("disclaimerSection").style.display =
    (type === "disclaimer") ? "block" : "none";
  document.getElementById("surveySection").style.display =
    (type === "survey") ? "block" : "none";

  // Set initial component label
  const labelInput = document.getElementById("labelOptionsLabelInput");
  labelInput.value = initialLabel;

  // If it's a disclaimer, set the text
  if (type === "disclaimer") {
    const disclaimerTA = document.getElementById("disclaimerTextAreaUnified");
    if (disclaimerTA) {
      disclaimerTA.value = initialDisclaimer;
    }
  }

  // HIDE LABEL Toggle
  const hideLabelSection = document.getElementById("hideLabelSection");
  const hideLabelToggle = document.getElementById("hideLabelToggle");
  if (hideLabelSection) {
    if (type === "fieldset") {
      // Fieldsets can't hide label, so hide the toggle
      hideLabelSection.style.display = "none";
    } else {
      hideLabelSection.style.display = "block";
      if (hideLabelToggle) {
        hideLabelToggle.checked = !!initialHideLabel;
      }
    }
  }

  // For radio/select/selectboxes
  let getTags;
  if (["radio", "select", "selectboxes"].includes(type)) {
    const container = document.getElementById("optionsTagContainerUnified");
    container.querySelectorAll('.tag-bubble').forEach(tag => tag.remove());
    let input = document.getElementById("optionTagInputUnified");
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    newInput.value = "";
    getTags = setupOptionsTagInput(newInput, container, initialOptions.map(o => o.label || ""));
  }

  // For surveys
  let getSurveyQuestionsFn, getSurveyOptionsFn;
  if (type === "survey") {
    // Questions
    const surveyQContainer = document.getElementById("surveyQuestionsTagContainerUnified");
    let surveyQInput = document.getElementById("surveyQuestionTagInputUnified");
    const newSurveyQInput = surveyQInput.cloneNode(true);
    surveyQInput.parentNode.replaceChild(newSurveyQInput, surveyQInput);
    newSurveyQInput.value = "";
    surveyQContainer.querySelectorAll('.tag-bubble').forEach(tag => tag.remove());
    getSurveyQuestionsFn = setupSurveyTagInput(surveyQContainer, newSurveyQInput, initialSurveyQuestions);

    // Options
    const surveyOContainer = document.getElementById("surveyOptionsTagContainerUnified");
    let surveyOInput = document.getElementById("surveyOptionTagInputUnified");
    const newSurveyOInput = surveyOInput.cloneNode(true);
    surveyOInput.parentNode.replaceChild(newSurveyOInput, surveyOInput);
    newSurveyOInput.value = "";
    surveyOContainer.querySelectorAll('.tag-bubble').forEach(tag => tag.remove());
    getSurveyOptionsFn = setupSurveyTagInput(surveyOContainer, newSurveyOInput, initialSurveyOptions);
  }

  modal._currentOverlay = overlay;
  modal.style.display = "block";
  overlay.style.display = "block";

  // SAVE
  const saveBtn = document.getElementById("labelOptionsModalSaveBtn");
  if (saveBtn) {
    saveBtn.onclick = () => {
      const finalLabel = labelInput.value.trim();

      // Collect relevant data from the modal
      let finalOptions = [];
      let finalDisclaimer = "";
      let finalSurveyQuestions = [];
      let finalSurveyOptions = [];

      if (["radio", "select", "selectboxes"].includes(type) && getTags) {
        finalOptions = getTags().map(opt => ({ label: opt }));
      }
      if (type === "disclaimer") {
        const disclaimTA = document.getElementById("disclaimerTextAreaUnified");
        if (disclaimTA) {
          finalDisclaimer = disclaimTA.value.trim();
        }
      }
      if (type === "survey") {
        finalSurveyQuestions = getSurveyQuestionsFn ? getSurveyQuestionsFn() : [];
        finalSurveyOptions = getSurveyOptionsFn ? getSurveyOptionsFn() : [];
      }

      let finalHideLabel = false;
      if (hideLabelSection && hideLabelSection.style.display !== "none") {
        finalHideLabel = hideLabelToggle ? hideLabelToggle.checked : false;
      }

      closeLabelOptionsModal();
      callback(
        finalLabel,
        finalOptions,
        finalDisclaimer,
        finalSurveyQuestions,
        finalSurveyOptions,
        finalHideLabel
      );
    };
  }
}

function closeLabelOptionsModal() {
  const modal = document.getElementById("labelOptionsModal");
  if (!modal) {
    console.log("Modal not found!");
    return;
  }
  console.log("Closing Label Options Modal");
  modal.style.display = "none";
  modal.classList.remove("super-top", "super-nested2", "super-nested3");

  const typeContainer = document.getElementById("componentTypeContainer");
  if (typeContainer) {
    const cards = typeContainer.querySelectorAll(".card");
    cards.forEach((card) => card.classList.remove("selected"));
  }

  if (modal._currentOverlay) {
    modal._currentOverlay.remove();
    modal._currentOverlay = null;
  }
  console.log("Modal display after closing:", modal.style.display);
}

