/*************************************************************
 * src/routes/formBuilder.js
 *************************************************************/

const express = require('express');
const router = express.Router();
const _ = require('lodash'); // For _.startCase or _.camelCase

// GET /formbuilder
router.get('/formbuilder', (req, res) => {
  // List of component types (columns removed)
  const componentTypes = [
    "disclaimer", 'textfield', 'textarea', 'account', 'radio', 'survey',
    'selectboxes', 'select', 'file', 'phoneNumber',
    'address', 'asset', 'datetime', 'date', 'time',
    'number', 'currency', 'fieldset'
  ];

  // Create "cards" for each type
  const cardsHtml = componentTypes
    .map(type => `<div class="card" data-type="${type}">${_.startCase(type)}</div>`)
    .join('');

  // Build the HTML
  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Simpler Form Builder</title>
    <!-- Lodash from CDN -->
    <script src="https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js"></script>
    <!-- Link to your external CSS -->
    <link rel="stylesheet" href="/css/formBuilder.css" />
  </head>
  <body>
    <div class="wrapper">
      <div class="container">
        <h1>Simpler Form Builder</h1>
        <button id="saveFormBtn">Save Form</button>

        <label>Enter a form name:</label>
        <input id="formName" type="text" placeholder="Enter form name" />
        
        <label>Component Type:</label>
        <div id="componentTypeContainer" class="card-container">
          ${cardsHtml}
        </div>

        <label>Select a Fieldset:</label>
        <div id="fieldsetList" class="fieldset-container"></div>

        <h3>Component List</h3>
        <div id="componentList"></div>

        <div id="jsonPreviewContainer">
          <h3>Form JSON Preview</h3>
          <pre id="formPreview"></pre>
        </div>

        <button id="copyJsonBtn">Copy JSON</button>
      </div>
    </div>

    <!-- Dark overlay for modals -->
    <div id="overlay" class="overlay"></div>

    <!-- ===============================
         ALL MODALS
         =============================== -->

    <!-- Unified Label & Options Modal (includes Disclaimer Section) -->
<div id="labelOptionsModal" class="modal">
  <div class="modal-content">
    <div class="modal-header">
      <h3>Configure Component</h3>
      <span class="close-btn" onclick="closeLabelOptionsModal()">×</span>
    </div>
    <div class="modal-body">
      <label>Component Label:</label>
      <input id="labelOptionsLabelInput" type="text" placeholder="Enter label" />

      <!-- Options Section for radio/select/selectboxes -->
      <div id="optionsSection" style="display: none;">
        <label>Options:</label>
        <div id="optionsTagContainerUnified" class="tag-container">
          <input id="optionTagInputUnified" type="text" placeholder="Type option and press comma or enter" />
        </div>
      </div>

      <!-- Disclaimer Section (retained) -->
      <div id="disclaimerSection" style="display: none;">
        <label>Disclaimer Text:</label>
        <textarea id="disclaimerTextAreaUnified" rows="4" placeholder="Enter disclaimer text"></textarea>
      </div>

      <!-- Survey Section -->
      <div id="surveySection" style="display: none;">
        <label>Survey Questions:</label>
        <div id="surveyQuestionsTagContainerUnified" class="tag-container">
          <input id="surveyQuestionTagInputUnified" type="text" placeholder="Type question and press comma or enter" />
        </div>
        <label>Survey Options:</label>
        <div id="surveyOptionsTagContainerUnified" class="tag-container">
          <input id="surveyOptionTagInputUnified" type="text" placeholder="Type option and press comma or enter" />
        </div>
      </div>

      <!-- NEW: Hide Label Toggle Section -->
      <div id="hideLabelSection" style="margin-top: 15px; display: none;">
        <label>Hide Label?</label>

        <!-- Option A: Fancy toggle switch -->
        <label class="switch" style="margin-left: 10px;">
          <input type="checkbox" id="hideLabelToggle" />
          <span class="slider round"></span>
        </label>

        <!-- 
          Option B (simpler):
          <label style="margin-left: 10px;">
            <input type="checkbox" id="hideLabelToggle" />
            Yes
          </label> 
        -->
      </div>
      <div id="disableSection" style="display: none; margin-left: 20px;">
        <label>Disable Field?</label>
          <label class="switch" style="margin-left: 10px;">
          <input type="checkbox" id="disableToggle" />
          <span class="slider round"></span>
       </label>
     </div>
    </div>
    <div class="modal-buttons">
      <button id="labelOptionsModalSaveBtn">Save</button>
    </div>
  </div>
</div>

<!-- Conditional Logic Modal -->
<div id="conditionalModal" class="modal">
  <div class="modal-content">
    <div class="modal-header">
      <h3>Configure Conditional Logic</h3>
      <span class="close-btn" onclick="closeConditionalModal()">×</span>
    </div>
    <div class="modal-body">
      <label>Triggering Component Key:</label>
      <div id="whenKeyCards" class="card-container"></div>
      <label>Trigger Value:</label>
      <div id="eqValueCards" class="card-container"></div>
    </div>
    <div class="modal-buttons">
      <button id="saveConditionalLogicBtn">Save</button>
      <button id="clearConditionalLogicBtn">Clear Trigger</button>
      <button id="backFromConditionalBtn">Back</button>
    </div>
  </div>
</div>

<!-- Input Modal (for labeling components) -->
<div id="inputModal" class="modal">
  <div class="modal-content">
    <div class="modal-header">
      <h3>Enter Component Label</h3>
      <span class="close-btn" onclick="closeInputModal()">×</span>
    </div>
    <div class="modal-body">
      <input id="componentLabelInput" type="text" placeholder="Component label" />
      <button id="dictateLabelAdvancedBtn" type="button" onclick="dictateLabelAdvanced()">Speak (Advanced)</button>
    </div>
    <div class="modal-buttons" id="inputModalButtons">
      <!-- Dynamically added: Save, Hide Label, etc. -->
    </div>
  </div>
</div>

<!-- Remove or comment out this block:
<div id="componentOptionsModal" class="modal">
  <div class="modal-content">
    <div class="modal-header">
      <h3>Component Options</h3>
      <span class="close-btn" onclick="closeComponentOptionsModal()">×</span>
    </div>
    <div class="modal-body">
      <div id="componentOptionDetails"></div>
    </div>
    <div class="modal-buttons">
      <button id="componentAddConditionalBtn">Conditional</button>
      <button id="componentEditBtn">Edit</button>
      <button id="componentDeleteBtn">Delete</button>
    </div>
  </div>
</div>
-->

<!-- Survey Questions Modal -->
<div id="surveyQuestionsModal" class="modal">
  <div class="modal-content">
    <div class="modal-header">
      <h3>Enter Survey Questions</h3>
      <span class="close-btn" onclick="closeSurveyQuestionsModal()">×</span>
    </div>
    <div class="modal-body">
      <div id="surveyQuestionsTagContainer" class="tag-container">
        <input id="surveyQuestionTagInput" type="text"
               placeholder="Type question and press comma or enter" />
      </div>
    </div>
    <div class="modal-buttons">
      <button id="surveyQuestionsModalSaveBtn">Save</button>
    </div>
  </div>
</div>

<!-- Survey Options Modal -->
<div id="surveyOptionsModal" class="modal">
  <div class="modal-content">
    <div class="modal-header">
      <h3>Enter Survey Options</h3>
      <span class="close-btn" onclick="closeSurveyOptionsModal()">×</span>
    </div>
    <div class="modal-body">
      <div id="surveyOptionsTagContainer" class="tag-container">
        <input id="surveyOptionTagInput" type="text"
               placeholder="Type option and press comma or enter" />
      </div>
    </div>
    <div class="modal-buttons">
      <button id="surveyOptionsModalSaveBtn">Save</button>
    </div>
  </div>
</div>

<!-- Options Modal (for radio/select, etc.) -->
<div id="optionsModal" class="modal">
  <div class="modal-content">
    <div class="modal-header">
      <h3>Enter Options</h3>
      <span class="close-btn" onclick="closeOptionsModal()">×</span>
    </div>
    <div class="modal-body">
      <div id="optionsTagContainer" class="tag-container">
        <input id="optionTagInput" type="text"
               placeholder="Type option and press comma or enter" />
      </div>
    </div>
    <div class="modal-buttons">
      <button id="optionsModalSaveBtn">Save</button>
    </div>
  </div>
</div>

<!-- Disclaimer Editor Modal -->
<div id="disclaimerModal" class="modal">
  <div class="modal-content">
    <div class="modal-header">
      <h3>Edit Disclaimer</h3>
      <span class="close-btn" onclick="closeDisclaimerModal()">×</span>
    </div>
    <div class="modal-body">
      <!-- Use a textarea to edit the disclaimer text (you can use markdown or simple HTML) -->
      <textarea id="disclaimerTextArea" rows="10" placeholder="Enter disclaimer text, use markdown if desired"></textarea>
    </div>
    <div class="modal-buttons">
      <button id="saveDisclaimerBtn">Save</button>
    </div>
  </div>
</div>


    <!-- Notification area -->
    <div id="notification" class="notification"></div>

    <!-- 
      Load your splitted JS in the correct order:
      uniqueKeys.js, dataHelpers.js, modalHelpers.js, createComponent.js, mainFormBuilder.js
    -->
    <script src="/js/uniqueKeys.js"></script>
    <script src="/js/dataHelpers.js"></script>
    <script src="/js/modalHelpers.js"></script>
    <script src="/js/createComponent.js"></script>
    <script src="/js/mainFormBuilder.js"></script>
  </body>
  </html>
  `;

  // Send the composed HTML
  res.send(html);
});

module.exports = router;
