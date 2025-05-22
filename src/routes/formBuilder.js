const express = require('express');
const router = express.Router();
const _ = require('lodash'); // for _.startCase and _.camelCase

// GET /formbuilder
router.get('/formbuilder', (req, res) => {
  // List of component types available in the form builder.
  const componentTypes = [
    "disclaimer", "textfield", "textarea", "account", "choiceList", "survey",
    "selectboxes", "select", "file", "phoneNumber",
    "address", "asset", "datetime", "number", "currency", 'editgrid','quiz'
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
      <title>Form Builder</title>

      <!-- lodash + Sortable -->
      <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js" defer></script>


      <!-- Font‑Awesome (fixed digest: 6.5.1) -->
      <link rel="stylesheet"
            href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
            integrity="sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA=="
            crossorigin="anonymous" referrerpolicy="no-referrer">

      <!-- Builder styles -->
      <link rel="stylesheet" href="/css/formBuilder.css" />

<svg id="icon-comment" style="display:none" viewBox="0 0 24 24"
     xmlns="http://www.w3.org/2000/svg">
  <path fill="currentColor"
        d="M21 6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12l4 4-.01-16Z"/>
</svg>
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
          <pre id="formPreview"></pre>
          <!-- Buttons row (50 / 50) -->
          <div style="display:flex; gap:10px; margin-top:1rem;">
            <button id="saveTemplateBtn"  style="flex:1;">Save Template</button>
            <button id="copyJsonBtn"      style="flex:1;">Copy JSON</button>
            <button id="importJsonBtn"    style="flex:1;">Import JSON</button>
          </div>  
          </div>
          </div>
      </div>
    </div>

    <!-- Dark overlay for modals -->
    <div id="overlay" class="overlay"></div>

    <div id="colChooser" class="mini-chooser" style="display:none;
         position:fixed; z-index:2001; left:50%; top:50%;
         transform:translate(-50%,-50%); background:#fff;
         border-radius:6px; padding:18px 22px; box-shadow:0 3px 12px rgba(0,0,0,.25)">
      <p style="margin:0 0 10px 0; font-weight:600;">Wrap into how many columns?</p>
      <div style="display:flex; gap:12px; justify-content:center;">
        <button class="colPickBtn row-button" data-cols="2">2</button>
        <button class="colPickBtn row-button" data-cols="3">3</button>
      </div>
    </div>

    <div id="importJsonModal" class="modal">
    <div class="modal-content">
      <div class="modal-header">
        <h3>Paste or Edit JSON</h3>
        <span class="close-btn" onclick="closeImportJsonModal()">×</span>
      </div>
      <div class="modal-body">
        <textarea id="importJsonTextarea"
                  style="width:100%;height:200px;"
                  placeholder='{ "components": [ … ] }'></textarea>
      </div>
      <div class="modal-buttons">
        <button id="importJsonLoadBtn">Load JSON</button>
      </div>
    </div>
  </div>

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

          <div id="fieldsetLabelPresets" class="preset-row" style="display:none;">
            <button type="button"
                    class="preset-btn"
                    data-label="General Information">
              General Information
            </button>
          </div>
          
          <!-- Options Section (for radio/select/selectboxes) -->
          <div id="optionsSection" style="display:none; margin-top:15px;">
            <label>Options:</label>
            <textarea id="bulkOptionsInputUnified"
                      style="width:100%; height:100px;"></textarea>

            <!-- NEW – Choice-List (Radio) presets -->
            <div id="choiceRadioPresets"
                 class="card-container"
                 style="display:none; margin-top:6px;">
              <div class="card preset-card"
                   data-options="Yes,No,NA">Yes / No / NA</div>
              <div class="card preset-card"
                   data-options="Pass,Fail,NA">Pass / Fail / NA</div>
            </div>
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
          <div id="surveySection" style="display:none; margin-top:15px;">
            <label>Survey Questions</label>
            <textarea id="surveyQuestionsInputUnified"
                      style="width:100%; height:100px;"></textarea>

            <label style="margin-top:15px;">Survey Options</label>
            <textarea id="surveyOptionsInputUnified"
                      style="width:100%; height:100px;"></textarea>

            <!-- ✱ NEW compact buttons — sits *after* the textarea -->
            <div id="surveyOptionPresets" class="card-container" style="margin-top:6px;">
              <div class="card preset-card"
                   data-options="Safe,At Risk,NA">Safe / At Risk / NA</div>
              <div class="card preset-card"
                   data-options="Pass,Fail,NA">Pass / Fail / NA</div>
              <div class="card preset-card"
                   data-options="Yes,No,NA">Yes / No / NA</div>
            </div>
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

    <!-- Auto-calculate modal (one-click version) -->
    <div id="calcModal" class="modal">
      <div class="modal-content" style="min-width:430px;">
        <div class="modal-header">
          <h3>Auto-calculate Value</h3>
          <span class="close-btn" onclick="closeCalcModal()">×</span>
        </div>

        <div class="modal-body">

          <label>Operator</label>
          <div id="opRow" style="display:flex;gap:8px;margin-bottom:18px;">
            <button class="row-button op-btn" data-op="+">+</button>
            <button class="row-button op-btn" data-op="-">−</button>
            <button class="row-button op-btn" data-op="*">×</button>
            <button class="row-button op-btn" data-op="/">÷</button>
          </div>

          <label>Field A</label>
          <div id="leftCards"  class="card-container" style="margin-bottom:18px;"></div>

          <label>Field B (optional)</label>
          <div id="rightCards" class="card-container"></div>

        </div>

        <div class="modal-buttons">
          <button id="calcSaveBtn" disabled>Save Formula</button>
        </div>
      </div>
    </div>



    <!-- Save Template Modal -->
    <div id="saveTplModal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Save Template</h3>
          <span class="close-btn" onclick="closeSaveTplModal()">×</span>
        </div>
        <div class="modal-body">
          <label>Name:</label>
          <input id="tplNameInput" type="text" placeholder="Template name">

          <label style="margin-top:15px;">Folder:</label>
          <div id="folderPickRow" class="card-container" style="margin-top:8px;"></div>
        </div>
        <div class="modal-buttons">
          <button id="confirmSaveTplBtn">Save</button>
        </div>
      </div>
    </div>


    <!-- Script includes -->
    <script src="https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js"></script>
    <script src="/js/uniqueKeys.js"></script>
    <script src="/js/dataHelpers.js"></script>
    <script src="/js/modalHelpers.js"></script>
    <script src="/js/createComponent.js"></script>
    <script src="/js/mainFormBuilder.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
  </body>
  </html>
  `;
  res.send(html);
});

module.exports = router;
