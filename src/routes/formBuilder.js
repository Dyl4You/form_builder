const express = require('express');
const router = express.Router();
const _ = require('lodash'); // for _.startCase and _.camelCase

// GET /formbuilder
router.get('/formbuilder', (req, res) => {
  // List of component types available in the form builder.
  const componentTypes = [
    "disclaimer", "textfield", "textarea", "account", "choiceList", "survey",
    "selectboxes", "select", "file", "phoneNumber",
    "address", "asset", "datetime", "number", "currency"
  ];

  // Build the HTML for the type cards.
  const cardsHtml = componentTypes
    .map(type => `<div class="card" data-type="${type}">${_.startCase(type)}</div>`)
    .join('');

  // Compose the full HTML page.
  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <!-- Load Lodash from CDN -->
      <script src="https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js"></script>
      <!-- External CSS -->
      <link rel="stylesheet" href="/css/formBuilder.css" />
  </head>
  <body>
    <div class="wrapper">
      <div class="container">
        
             
        <!-- Component Type Section -->
        <label>Component Type:</label>
        <div id="componentTypeContainer" class="card-container" style="margin-bottom: 2rem;">
          ${cardsHtml}
        </div>

        <!-- Fieldset Selection Row -->
        <div style="display: flex; margin-bottom: 2rem;">
          <!-- Column 1 -->
          <div style="flex: 0 0 16.66%; display: flex; align-items: center;">
            <label style="margin-right: 10px;">Select a Fieldset:</label>
          </div>
          <!-- Column 2 -->
          <div style="flex: 0 0 16.66%;">
            <div class="card-container">
              <button id="addFieldsetBtn" class="card add-fieldset-button">Add Fieldset</button>
            </div>
          </div>
        </div>

        <!-- Fieldset List -->
        <div id="fieldsetList" class="fieldset-container" style="margin: 2rem 0;"></div>

        <!-- Component List Row -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2rem; margin-bottom: 10px;">
          <h3 style="margin: 0;">Component List</h3>
          <div style="text-align: right; font-weight: 600">
             Components: <span id="totalComponents">0</span>
          </div>
        </div>
        <div id="componentList"></div>

        <!-- JSON Preview -->
        <div id="jsonPreviewContainer" style="margin-top: 2rem;">
          <h3>Form JSON Preview</h3>
          <pre id="formPreview"></pre>
        </div>

        <button id="copyJsonBtn" style="margin-top: 1rem;">Copy JSON</button>
      </div>
    </div>

    <!-- Dark overlay for modals -->
    <div id="overlay" class="overlay"></div>

    <!-- Unified Label & Options Modal -->
    <div id="labelOptionsModal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Configure Component</h3>
          <span class="close-btn" onclick="closeLabelOptionsModal()">×</span>
        </div>
        <div class="modal-body">
          <label>Component Label:</label>
          <input id="labelOptionsLabelInput" type="text" placeholder="Enter label" />
          
          <!-- Options Section (for radio/select/selectboxes) -->
          <div id="optionsSection" style="display: none; margin-top: 15px;">
            <label>Options:</label>
            <textarea
              id="bulkOptionsInputUnified"
              placeholder=""
              style="width: 100%; height: 100px;"
            ></textarea>
          </div>

          <!-- Disclaimer Section -->
          <div id="disclaimerSection" style="display: none; margin-top: 15px;">
            <label>Disclaimer Text:</label>
            <textarea
              id="disclaimerTextAreaUnified"
              rows="4"
              placeholder="Enter disclaimer text"
              style="width: 100%;"
            ></textarea>
          </div>

          <!-- Survey Section -->
          <div id="surveySection" style="display: none; margin-top: 15px;">
            <label>Survey Questions</label>
            <textarea
              id="surveyQuestionsInputUnified"
              placeholder=""
              style="width: 100%; height: 100px;"
            ></textarea>

            <label style="margin-top: 15px;">Survey Options</label>
            <textarea
              id="surveyOptionsInputUnified"
              placeholder=""
              style="width: 100%; height: 100px;"
            ></textarea>
          </div>

          <div id="togglesRow" style="margin-top:15px;display:none;display:flex;align-items:center;gap:40px;">
            <div id="hideLabelSection">
              <label>Hide Label</label>
              <label class="switch" style="margin-left:10px;">
                <input type="checkbox" id="hideLabelToggle">
                <span class="slider round"></span>
              </label>
            </div>
            <div>
              <label>Required</label>
              <label class="switch" style="margin-left:10px;">
                <input type="checkbox" id="requiredToggle" checked>
                <span class="slider round"></span>
              </label>
            </div>
            <div id="actionsToggleSection">
            <label>Actions</label>
              <label class="switch" style="margin-left:10px;">
               <input type="checkbox" id="actionsToggle">
                <span class="slider round"></span>
              </label>
            </div>
          </div>
          <div id="rowButtonsContainer" style="margin-top:15px display:none;">
            <label>Rows</label>
            <div style="display:flex; gap:10px; margin-top:10px;">
              <button id="row1Btn" class="row-button">1</button>
              <button id="row3Btn" class="row-button">3</button>
            </div>
          </div>
          

          <div id="dateTimeModeContainer" style="margin-top:15px; display:none;">
              <label>Date / Time Mode</label>
              <div style="display:flex; gap:10px; margin-top:10px;">
              <button id="dtModeDateTime" class="row-button">Date &amp; Time</button>
              <button id="dtModeDate"      class="row-button">Date</button>
              <button id="dtModeTime"      class="row-button">Time</button>
            </div>
          </div>

          <!-- List Style buttons (for Choice List) -->
          <div id="listStyleContainer" style="margin-top:15px; display:none;">
            <label>List Style</label>
            <div style="display:flex; gap:10px; margin-top:10px;">
              <button id="lsSelect"      class="row-button">Dropdown</button>
              <button id="lsRadio"       class="row-button">Radio</button>
              <button id="lsSelectboxes" class="row-button">Select Boxes</button>
            </div>
          </div>

          <!-- Number style buttons (plain number vs. currency) -->
          <div id="numStyleContainer" style="margin-top:15px; display:none;">
            <label>Number Style</label>
            <div style="display:flex; gap:10px; margin-top:10px;">
              <button id="nsNumber"   class="row-button">Number</button>
              <button id="nsCurrency" class="row-button">Currency</button>
            </div>
          </div>


          <div class="modal-buttons">
            <button id="labelOptionsModalSaveBtn">Save</button>
          </div>
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
        <div class="modal-buttons" id="inputModalButtons"></div>
      </div>
    </div>

    <!-- Survey Questions Modal -->
    <div id="surveyQuestionsModal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Enter Survey Questions</h3>
          <span class="close-btn" onclick="closeSurveyQuestionsModal()">×</span>
        </div>
        <div class="modal-body">
          <div id="surveyQuestionsTagContainer" class="tag-container">
            <input id="surveyQuestionTagInput" type="text" placeholder="" />
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
            <input id="surveyOptionTagInput" type="text" placeholder="" />
          </div>
        </div>
        <div class="modal-buttons">
          <button id="surveyOptionsModalSaveBtn">Save</button>
        </div>
      </div>
    </div>

    <!-- Options Modal (for radio/select/selectboxes) -->
    <div id="optionsModal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Enter Options</h3>
          <span class="close-btn" onclick="closeOptionsModal()">×</span>
        </div>
        <div class="modal-body">
          <div id="optionsTagContainer" class="tag-container">
            <input id="optionTagInput" type="text" placeholder="Type in options" />
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
          <textarea id="disclaimerTextArea" rows="10" placeholder="Enter disclaimer text"></textarea>
        </div>
        <div class="modal-buttons">
          <button id="saveDisclaimerBtn">Save</button>
        </div>
      </div>
    </div>


    <!-- ───── Move‑To Modal ───── -->
    <div id="moveToModal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Select Grouping</h3>
          <span class="close-btn" onclick="closeMoveToModal()">×</span>
        </div>
        <div class="modal-body">
          <div id="moveToFieldsetCards" class="card-container"></div>
        </div>
      </div>
    </div>

    <!-- Script includes -->
    <script src="/js/uniqueKeys.js"></script>
    <script src="/js/dataHelpers.js"></script>
    <script src="/js/modalHelpers.js"></script>
    <script src="/js/createComponent.js"></script>
    <script src="/js/mainFormBuilder.js"></script>
  </body>
  </html>
  `;
  res.send(html);
});

module.exports = router;
