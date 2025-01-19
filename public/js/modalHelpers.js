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
  
    // Populate the "Triggering Component" card list
    populateTriggeringComponentCards(targetComponent.key);
  
    const saveBtn = document.getElementById("saveConditionalLogicBtn");
    const clearBtn = document.getElementById("clearConditionalLogicBtn");
    const backBtn = document.getElementById("backFromConditionalBtn");
  
    if (saveBtn) {
      saveBtn.onclick = () => {
        const selectedKey = document.querySelector("#whenKeyCards .card.selected")?.getAttribute("data-key");
        const selectedValue = document.querySelector("#eqValueCards .card.selected")?.getAttribute("data-value");
        if (!selectedKey || !selectedValue) {
          showNotification("Please select both a Triggering Component Key and a Trigger Value.");
          return;
        }
  
        targetComponent.conditional = {
          when: selectedKey,
          eq: selectedValue,
          show: true
        };
  
        // Attempt to find human-friendly label for eqValue
        const allComps = getAllComponents(formJSON.components);
        const whenComp = allComps.find(c => c.key === selectedKey);
        let eqLabel = selectedValue;
        if (whenComp) {
          let possibleValues = [];
          if (whenComp.data && whenComp.data.values) {
            possibleValues = whenComp.data.values;
          } else if (whenComp.values) {
            possibleValues = whenComp.values;
          }
          const eqObj = possibleValues.find(v => v.value === selectedValue);
          if (eqObj) {
            eqLabel = eqObj.label;
          }
        }
        targetComponent.conditionalLabel = {
          whenLabel: whenComp ? whenComp.label : selectedKey,
          eqLabel: eqLabel
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
    
  function populateTriggeringComponentCards(excludeKey = null) {
    const container = document.getElementById("whenKeyCards");
    if (!container) return;
    container.innerHTML = "";
  
    const allComponents = getAllComponents(formJSON.components);
    const allowedTypes = ["select", "selectboxes", "radio"];
  
    const allowed = allComponents.filter(c => allowedTypes.includes(c.type) && c.key !== excludeKey);
  
    allowed.forEach((component) => {
      const card = document.createElement("div");
      card.classList.add("card");
      card.textContent = component.label;
      card.setAttribute("data-key", component.key);
      card.addEventListener("click", () => {
        document.querySelectorAll("#whenKeyCards .card").forEach(x => x.classList.remove("selected"));
        card.classList.add("selected");
        populateTriggerValueCards(component);
      });
      container.appendChild(card);
    });
  }
    
  function populateTriggerValueCards(selectedComponent) {
    const container = document.getElementById("eqValueCards");
    if (!container) return;
    container.innerHTML = "";
  
    let valuesArray = [];
    if (selectedComponent.data && Array.isArray(selectedComponent.data.values)) {
      valuesArray = selectedComponent.data.values;
    } else if (selectedComponent.values && Array.isArray(selectedComponent.values)) {
      valuesArray = selectedComponent.values;
    }
  
    valuesArray.forEach((v) => {
      const card = document.createElement("div");
      card.classList.add("card");
      card.textContent = v.label;
      card.setAttribute("data-value", v.value);
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
  
    // Apply extra nesting class if provided
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
        closeOptionsModal(extraClass);  // Pass extraClass to close function
        callback(currentTags.map(label => ({ label }))); // Return options as an array of objects
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
          tags.push(value);      // Allow duplicates by always adding
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
  
    // Add extra nesting if provided.
    if (extraClass) {
      modal.classList.add(extraClass);
      overlay.classList.add(extraClass);
    }
  
    const container = document.getElementById("surveyQuestionsTagContainer");
    let input = document.getElementById("surveyQuestionTagInput");
  
    // Reset input clone.
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    input = newInput;
  
    container.querySelectorAll('.tag-bubble').forEach(tag => tag.remove());
    input.value = "";
  
    modal.style.display = "block";
    overlay.style.display = "block";
  
    // Expect initialQuestions as an array of strings.
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
    
  /** Survey Options Modal */
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
  
    // Expect initialOptions as an array of strings.
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
    
  /** Shared tag input for surveys */
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
          tags.push(value); // Allow duplicates by always adding
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
   
  /**
   * Closes the Column Subcomponents Modal.
   */
  function closeColumnComponentsModal() {
    const modal = document.getElementById("columnComponentsModal");
    const overlay = document.getElementById("overlay");
  
    if (modal) {
      modal.style.display = "none";
      modal.classList.remove("nested"); // Remove nested class if added
    }
  
    if (overlay) {
      // Check if any other nested modals are still open
      const openNestedModals = document.querySelectorAll('.modal.nested');
      if (openNestedModals.length === 0) {
        overlay.style.display = "none";
      }
      overlay.classList.remove("nested");
    }
  }
    
  // Expose the function to the global scope
  window.closeColumnComponentsModal = closeColumnComponentsModal;
    
  /**
   * Closes the Component Options Modal.
   */
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
    
  /**
   * Closes the Columns Modal.
   */
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
    
  function openDisclaimerModal(callback, initialContent = "") {
    const modal = document.getElementById("disclaimerModal");
    const overlay = document.getElementById("overlay");
    if (!modal || !overlay) {
      console.error("Disclaimer modal or overlay not found in the DOM!");
      return;
    }
  
    // Set the disclaimer textarea's content
    const txtArea = document.getElementById("disclaimerTextArea");
    if (txtArea) {
      txtArea.value = initialContent;
    } else {
      console.error("disclaimerTextArea element not found in the DOM!");
      return;
    }
  
    // Show the modal and overlay
    modal.style.display = "block";
    overlay.style.display = "block";
  
    // Set up the Save button to capture the custom disclaimer text
    const saveBtn = document.getElementById("saveDisclaimerBtn");
    if (saveBtn) {
      saveBtn.onclick = () => {
        const disclaimerContent = txtArea.value.trim();
        const sanitizedContent = `<p>${disclaimerContent}</p>`; // Wrap in <p> tags
        closeDisclaimerModal(); // extraClass parameter is omitted here
        if (callback && typeof callback === "function") {
          callback(sanitizedContent);
        }
      };
    } else {
      console.error("saveDisclaimerBtn element not found in the DOM!");
    }
  }
    
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
    
  // Expose the functions to the global scope if needed
  window.openDisclaimerModal = openDisclaimerModal;
  window.closeDisclaimerModal = closeDisclaimerModal;
    
  function openDisclaimerModal(callback, initialContent = "", extraClass = "") {
    const modal = document.getElementById("disclaimerModal");
    const overlay = document.getElementById("overlay");
    if (!modal || !overlay) {
      console.error("Disclaimer modal or overlay not found in the DOM!");
      return;
    }
  
    // Add extra nesting if provided.
    if (extraClass) {
      modal.classList.add(extraClass);
      overlay.classList.add(extraClass);
    }
  
    // Set the disclaimer textarea's content (strip HTML tags for a clean display)
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
    
  function stripHtmlTags(html) {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;
    return tempDiv.textContent || tempDiv.innerText || "";
  }
    
  /**************************************************************
   *  Unified Label & Options Modal
   **************************************************************/
  function openLabelOptionsModal(callback, type, initialLabel = "", initialOptions = [], initialDisclaimer = "", initialSurveyQuestions = [], initialSurveyOptions = []) {
    const modal = document.getElementById("labelOptionsModal");
    if (!modal) return;
  
    // Create a new overlay for this modal with desired z-index
    const overlay = createOverlay(1999);
    modal.classList.add("super-top");
  
    // Show/hide sections based on component type
    document.getElementById("optionsSection").style.display =
      (["radio", "select", "selectboxes"].includes(type)) ? "block" : "none";
    document.getElementById("disclaimerSection").style.display =
      type === "disclaimer" ? "block" : "none";
    document.getElementById("surveySection").style.display =
      type === "survey" ? "block" : "none";
  
    // Set initial component label and disclaimer (if applicable)
    document.getElementById("labelOptionsLabelInput").value = initialLabel;
    if (type === "disclaimer") {
      document.getElementById("disclaimerTextAreaUnified").value = initialDisclaimer;
    }
  
    // If the component type uses tag inputs (radio, select, selectboxes), reset the tag container and input.
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
  
    // If the component is a survey, reset both the survey questions and survey options inputs.
    let getSurveyQuestions, getSurveyOptions;
    if (type === "survey") {
      // Reset survey question input/container
      const surveyQContainer = document.getElementById("surveyQuestionsTagContainerUnified");
      let surveyQInput = document.getElementById("surveyQuestionTagInputUnified");
      const newSurveyQInput = surveyQInput.cloneNode(true);
      surveyQInput.parentNode.replaceChild(newSurveyQInput, surveyQInput);
      newSurveyQInput.value = "";
      surveyQContainer.querySelectorAll('.tag-bubble').forEach(tag => tag.remove());
      // Use the provided initial survey questions (array of strings):
      getSurveyQuestions = setupSurveyTagInput(surveyQContainer, newSurveyQInput, initialSurveyQuestions);
  
      // Reset survey options input/container
      const surveyOContainer = document.getElementById("surveyOptionsTagContainerUnified");
      let surveyOInput = document.getElementById("surveyOptionTagInputUnified");
      const newSurveyOInput = surveyOInput.cloneNode(true);
      surveyOInput.parentNode.replaceChild(newSurveyOInput, surveyOInput);
      newSurveyOInput.value = "";
      surveyOContainer.querySelectorAll('.tag-bubble').forEach(tag => tag.remove());
      // Use the provided initial survey options (array of strings):
      getSurveyOptions = setupSurveyTagInput(surveyOContainer, newSurveyOInput, initialSurveyOptions);
    }
  
    // Store the overlay reference in case you need it later when closing the modal
    modal._currentOverlay = overlay;
    modal.style.display = "block";
    overlay.style.display = "block";
  
    const saveBtn = document.getElementById("labelOptionsModalSaveBtn");
    saveBtn.onclick = () => {
      console.log("Save button clicked");
      const label = document.getElementById("labelOptionsLabelInput").value.trim();
      let options = [];
      let disclaimerText = "";
      let surveyQuestions = [];
      let surveyOptions = [];
  
      if (["radio", "select", "selectboxes"].includes(type)) {
        options = getTags ? getTags().map(opt => ({ label: opt })) : [];
      }
      if (type === "disclaimer") {
        disclaimerText = document.getElementById("disclaimerTextAreaUnified").value.trim();
      }
      if (type === "survey") {
        surveyQuestions = getSurveyQuestions ? getSurveyQuestions() : [];
        surveyOptions = getSurveyOptions ? getSurveyOptions() : [];
      }
  
      closeLabelOptionsModal();
      console.log("Modal should be closed now");
      callback(label, options, disclaimerText, surveyQuestions, surveyOptions);
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
  
    if (modal._currentOverlay) {
      modal._currentOverlay.remove();
      modal._currentOverlay = null;
    }
  
    console.log("Modal display after closing:", modal.style.display);
  }
  