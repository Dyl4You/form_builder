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

// If you rely on getSurveyQuestions / getSurveyOptions, keep them:
function getSurveyQuestions() {
  const container = document.getElementById("surveyQuestionsTagContainerUnified");
  if (!container) return [];
  return Array.from(container.querySelectorAll('.tag-bubble')).map(tag => tag.textContent.trim());
}

function getSurveyOptions() {
  const container = document.getElementById("surveyOptionsTagContainerUnified");
  if (!container) return [];
  return Array.from(container.querySelectorAll('.tag-bubble')).map(tag => tag.textContent.trim());
}

/**************************************************************
 *  Conditional Logic Modals
 **************************************************************/
function openConditionalModal(relativePath) {
  // If the user was in the old "component options" modal, close it
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

  const existingConditional = targetComponent.conditional || null;
  let selectedKey = existingConditional ? existingConditional.when : null;
  let selectedValue = existingConditional ? existingConditional.eq : null;

  populateTriggeringComponentCards(selectedKey);

  if (selectedKey) {
    const allComps = getAllComponents(formJSON.components);
    const whenComp = allComps.find(c => c.key === selectedKey);
    if (whenComp) {
      populateTriggerValueCards(whenComp, selectedValue);
    }
  } else {
    const eqValueContainer = document.getElementById("eqValueCards");
    if (eqValueContainer) eqValueContainer.innerHTML = "";
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

      // Save event for conditional logic:
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
 * Populate possible "Triggering Component" cards
 */
function populateTriggeringComponentCards(selectedKey = null) {
  const container = document.getElementById("whenKeyCards");
  if (!container) return;
  container.innerHTML = "";

  const allowedTypes = ["select", "selectboxes", "radio"];
  const allComponentsList = getAllComponents(formJSON.components).filter(c => allowedTypes.includes(c.type));

  allComponentsList.forEach(component => {
    const card = document.createElement("div");
    card.classList.add("card", "conditional-trigger-card");
    card.textContent = component.label;
    card.setAttribute("data-key", component.key);

    if (selectedKey && component.key === selectedKey) {
      card.classList.add("selected");
    }

    card.addEventListener("click", () => {
      document.querySelectorAll("#whenKeyCards .card").forEach(x => x.classList.remove("selected"));
      card.classList.add("selected");
      const eqValueContainer = document.getElementById("eqValueCards");
      eqValueContainer.innerHTML = "";
      populateTriggerValueCards(component, null);
    });
    container.appendChild(card);
  });
}

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
      document.querySelectorAll("#eqValueCards .card").forEach(x => x.classList.remove("selected"));
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
    modal.classList.remove("super-top");
  }
  if (overlay) {
    overlay.style.display = "none";
    overlay.classList.remove("super-top");
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
    showNotification("Listening in advanced mode... say 'Replace X with Y', or just speak text.");
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
        // Title-case example
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

  // Clone to reset
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  input = newInput;

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
    if (extraClass) {
      overlay.classList.remove(extraClass);
    }
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
      callback(currentTags.map(q => ({
        label: q,
        value: _.camelCase(q)
      })));
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
      callback(currentTags.map(opt => ({
        label: opt,
        value: _.camelCase(opt)
      })));
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
 *  "Component Options" Modal Closing
 **************************************************************/
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

/**************************************************************
 *  Disclaimer Modal
 **************************************************************/
function openDisclaimerModal(callback, initialContent = "", extraClass = "") {
  const modal = document.getElementById("disclaimerModal");
  const overlay = document.getElementById("overlay");
  if (!modal || !overlay) {
    console.error("Disclaimer modal or overlay not found!");
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
 *  Unified Label & Options Modal
 **************************************************************/
function openLabelOptionsModal(
  callback,
  type,
  initialLabel = "",
  initialOptions = [],
  initialDisclaimer = "",
  initialSurveyQuestions = [],
  initialSurveyOptions = [],
  initialHideLabel = false,
  initialRequired = true,
  initialRows,
  initialDTMode = "datetime"
) {
  const modal = document.getElementById("labelOptionsModal");
  let selectedDTMode = initialDTMode || "datetime";
  if (!modal) {
    showNotification("Missing #labelOptionsModal in DOM!");
    return;
  }


  // Create a new overlay
  const overlay = createOverlay(1999);
  modal.classList.add("super-top");

  // Show/hide sections depending on type
  document.getElementById("optionsSection").style.display =
    ["radio", "select", "selectboxes", "choiceList"].includes(type) ? "block" : "none";

  document.getElementById("disclaimerSection").style.display =
    (type === "disclaimer") ? "block" : "none";

  document.getElementById("surveySection").style.display =
    (type === "survey") ? "block" : "none";

  document.getElementById("dateTimeModeContainer").style.display =
    type === "datetime" ? "block" : "none";

  
  document.getElementById("rowButtonsContainer").style.display =
    type === "textarea" ? "block" : "none";

  const labelInput = document.getElementById("labelOptionsLabelInput");
  labelInput.value = initialLabel || "";

 // --- Hide‑label switch ---
const hideLabelSection = document.getElementById('hideLabelSection');
const hideLabelToggle  = document.getElementById('hideLabelToggle');

// Show / hide the whole section
if (type === 'fieldset') {
  if (hideLabelSection) hideLabelSection.style.display = 'none';
} else {
  if (hideLabelSection) hideLabelSection.style.display = 'block';
}

/*  <<< key line – always reset the switch >>> */
if (hideLabelToggle) hideLabelToggle.checked = !!initialHideLabel;


  const requiredToggle = document.getElementById("requiredToggle");
  const togglesRow     = document.getElementById("togglesRow"); 

  if (togglesRow) {
    if (type === "fieldset") {
      togglesRow.style.display = "none";
    } else {
      togglesRow.style.display = "flex";
      if (requiredToggle) requiredToggle.checked = !!initialRequired;
    }
  }

  // ----- Choice‑List style buttons -----
const listStyleContainer = document.getElementById('listStyleContainer');
let selectedListStyle = null;        // ← nothing selected yet

if (type === 'choiceList' || ['select','radio','selectboxes'].includes(type)) {
  listStyleContainer.style.display = 'block';

  const lsSelect      = document.getElementById('lsSelect');
  const lsRadio       = document.getElementById('lsRadio');
  const lsSelectboxes = document.getElementById('lsSelectboxes');
  const allLS         = [lsSelect, lsRadio, lsSelectboxes];

  /* 1‑A  reset previous highlights */
  allLS.forEach(btn => btn.classList.remove('selected'));

  /* 1‑B  if editing an EXISTING component, highlight its current style */
  if (['select','radio','selectboxes'].includes(type)) {
    const current = { select: lsSelect, radio: lsRadio, selectboxes: lsSelectboxes }[type];
    current.classList.add('selected');
    selectedListStyle = type;
  }

  /* 1‑C  click = pick */
  function pick(btn, val) {
    allLS.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedListStyle = val;
  }

  lsSelect.onclick      = () => pick(lsSelect,      'select');
  lsRadio.onclick       = () => pick(lsRadio,       'radio');
  lsSelectboxes.onclick = () => pick(lsSelectboxes, 'selectboxes');

} else {
  listStyleContainer.style.display = 'none';
}

/* ---------- Number / Currency style buttons ---------- */
const numStyleContainer = document.getElementById('numStyleContainer');
let selectedNumStyle = null;          // nothing picked yet

if (type === 'number' || type === 'currency') {
  numStyleContainer.style.display = 'block';

  const nsNumber   = document.getElementById('nsNumber');
  const nsCurrency = document.getElementById('nsCurrency');
  const allNS      = [nsNumber, nsCurrency];

  // reset any previous highlight
  allNS.forEach(b => b.classList.remove('selected'));

  // if editing an existing component, pre‑select its style
  if (type === 'currency') {
    nsCurrency.classList.add('selected');
    selectedNumStyle = 'currency';
  } else {
    nsNumber.classList.add('selected');
    selectedNumStyle = 'number';
  }

  function pick(btn, val) {
    allNS.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedNumStyle = val;
  }

  nsNumber.onclick   = () => pick(nsNumber,   'number');
  nsCurrency.onclick = () => pick(nsCurrency, 'currency');
} else {
  numStyleContainer.style.display = 'none';
}



  // The Row 1 / Row 3 buttons (for textarea)
  const row1Btn = document.getElementById("row1Btn");
  const row3Btn = document.getElementById("row3Btn");
  // Use the provided initialRows value
  let selectedTextareaRows = initialRows;

  if (type === "textarea") {
    if (row1Btn) {
      row1Btn.style.display = "inline-flex";
      // Pre-select based on initialRows
      if (initialRows === 1) {
        row1Btn.classList.add("selected");
      } else {
        row1Btn.classList.remove("selected");
      }
      row1Btn.onclick = () => {
        // Toggle off if already selected
        if (row1Btn.classList.contains("selected")) {
          row1Btn.classList.remove("selected");
          selectedTextareaRows = undefined;
        } else {
          selectedTextareaRows = 1;
          row1Btn.classList.add("selected");
          if (row3Btn) row3Btn.classList.remove("selected");
        }
      };
    }
    if (row3Btn) {
      row3Btn.style.display = "inline-flex";
      if (initialRows === 3) {
        row3Btn.classList.add("selected");
      } else {
        row3Btn.classList.remove("selected");
      }
      row3Btn.onclick = () => {
        if (row3Btn.classList.contains("selected")) {
          row3Btn.classList.remove("selected");
          selectedTextareaRows = undefined;
        } else {
          selectedTextareaRows = 3;
          row3Btn.classList.add("selected");
          if (row1Btn) row1Btn.classList.remove("selected");
        }
      };
    }
  } else {
    if (row1Btn) {
      row1Btn.style.display = "none";
      row1Btn.classList.remove("selected");
    }
    if (row3Btn) {
      row3Btn.style.display = "none";
      row3Btn.classList.remove("selected");
    }
  }

  if (type === "datetime") {
    const btnDT = document.getElementById("dtModeDateTime");
    const btnD  = document.getElementById("dtModeDate");
    const btnT  = document.getElementById("dtModeTime");
    const all   = [btnDT, btnD, btnT];
  
    function pick(btn, mode) {
      all.forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedDTMode = mode;
    }
  
    // preset
    if (selectedDTMode === "date")      pick(btnD,  "date");
    else if (selectedDTMode === "time") pick(btnT,  "time");
    else                                pick(btnDT, "datetime");
  
    btnDT.onclick = () => pick(btnDT, "datetime");
    btnD.onclick  = () => pick(btnD,  "date");
    btnT.onclick  = () => pick(btnT,  "time");
  }
  

  // For radio/select/selectboxes => fill bulkOptionsInputUnified
  const bulkOptionsInput = document.getElementById("bulkOptionsInputUnified");
  if (bulkOptionsInput) {
    if (["radio", "select", "selectboxes"].includes(type)) {
      const existingLabels = initialOptions.map(o => o.label || "").filter(Boolean);
      bulkOptionsInput.value = existingLabels.join("\n");
    } else {
      bulkOptionsInput.value = "";
    }
  }

  // Disclaimer text
  const disclaimTA = document.getElementById("disclaimerTextAreaUnified");
  if (disclaimTA) {
    disclaimTA.value = (type === "disclaimer") ? initialDisclaimer : "";
  }

  // Survey => two textareas
  const surveyQuestionsTA = document.getElementById("surveyQuestionsInputUnified");
  const surveyOptionsTA = document.getElementById("surveyOptionsInputUnified");
  if (type === "survey") {
    if (surveyQuestionsTA) {
      const questions = (initialSurveyQuestions || []).map(q => q.label || q).filter(Boolean);
      surveyQuestionsTA.value = questions.join("\n");
    }
    if (surveyOptionsTA) {
      const opts = (initialSurveyOptions || []).map(o => o.label || o).filter(Boolean);
      surveyOptionsTA.value = opts.join("\n");
    }
  } else {
    if (surveyQuestionsTA) surveyQuestionsTA.value = "";
    if (surveyOptionsTA) surveyOptionsTA.value = "";
  }

  modal._currentOverlay = overlay;
  modal.style.display = "block";
  overlay.style.display = "block";

  // “Save” button
  const saveBtn = document.getElementById("labelOptionsModalSaveBtn");
  if (saveBtn) {
    saveBtn.onclick = () => {
      const finalLabel = labelInput.value.trim();
      let finalOptions = [];
      let finalDisclaimer = "";
      let finalSurveyQuestions = [];
      let finalSurveyOptions = [];

      // If radio/select/selectboxes => parse
      if (["radio", "select", "selectboxes", "choiceList"].includes(type) && bulkOptionsInput) {
        const raw = bulkOptionsInput.value.trim();
        const splitted = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        finalOptions = splitted.map(val => ({
          label: val,
          value: _.camelCase(val)
        }));
      }

      // If disclaimer
      if (type === "disclaimer" && disclaimTA) {
        finalDisclaimer = disclaimTA.value.trim();
      }

      // If survey
      if (type === "survey") {
        if (surveyQuestionsTA) {
          const rawQuestions = surveyQuestionsTA.value.trim();
          const splittedQ = rawQuestions.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
          finalSurveyQuestions = splittedQ.map(q => ({
            label: q,
            value: _.camelCase(q)
          }));
        }
        if (surveyOptionsTA) {
          const rawOpts = surveyOptionsTA.value.trim();
          const splittedO = rawOpts.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean);
          finalSurveyOptions = splittedO.map(o => ({
            label: o,
            value: _.camelCase(o)
          }));
        }
      }

      let finalHideLabel = false;
      if (hideLabelSection && hideLabelSection.style.display !== "none") {
        finalHideLabel = hideLabelToggle ? hideLabelToggle.checked : false;
      }

      const finalRows = (type === "textarea") ? (selectedTextareaRows || 1) : undefined;
      const styleOrDT = (['choiceList','select','radio','selectboxes'].includes(type))
      ? (selectedListStyle || 'select')   
      : (type === 'number' || type === 'currency')
      ? (selectedNumStyle || 'number')
      : selectedDTMode;


      const finalRequired = requiredToggle ? requiredToggle.checked : true;
           
      closeLabelOptionsModal();
      callback(
        finalLabel,
        finalOptions,
        finalDisclaimer,
        finalSurveyQuestions,
        finalSurveyOptions,
        finalHideLabel,
        finalRequired,
        finalRows,
        selectedDTMode,
        styleOrDT
      );
    };
  }
}

function closeLabelOptionsModal() {
  const modal = document.getElementById("labelOptionsModal");
  if (!modal) return;
  modal.style.display = "none";
  modal.classList.remove("super-top", "super-nested2", "super-nested3");

  if (modal._currentOverlay) {
    modal._currentOverlay.remove();
    modal._currentOverlay = null;
  }

  document.querySelectorAll("#componentTypeContainer .card")
          .forEach(card => card.classList.remove("selected"));
  document.querySelectorAll("#listStyleContainer .row-button")
          .forEach(btn  => btn.classList.remove("selected"));
  /* new line – clears Number/Currency buttons */
  document.querySelectorAll("#numStyleContainer .row-button")
          .forEach(btn => btn.classList.remove("selected"));
}



