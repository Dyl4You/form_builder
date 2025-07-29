/****************************************************
 * public/js/mainFormBuilder.js
 ****************************************************/

const openMenuKeys = new Set();

// ─── Calculation catalogue  +  expression builder (★ NEW) ────────────
const CALC_OPS = {
  "+":  { label:"Add",      symbol:"+", arity:2,
          expr:(a,b)=>`${a}+${b}` },

  "-":  { label:"Subtract", symbol:"−", arity:2,
          expr:(a,b)=>`${a}-${b}` },

  "*":  { label:"Multiply", symbol:"×", arity:2,
          expr:(a,b)=>`${a}*${b}` },

  "/":  { label:"Divide",   symbol:"÷", arity:2,
          expr:(a,b)=>`${a}/${b}` },

  // Common shortcuts
  "sum":{ label:"Total",    symbol:"Σ", arity:"many",
          expr:arr => arr.join(" + ") },

  "avg":{ label:"Average",  symbol:"µ", arity:"many",
          expr:arr => `(${arr.join(" + ")}) / ${arr.length}` },

  "pct":{ label:"% of",     symbol:"%", arity:2,
          expr:(a,b)=>`(${a} / ${b}) * 100` },

  "neg":{ label:"Negative", symbol:"±", arity:1,
          expr:a=>`-${a}` }
};

/* helper that turns {_calc} ➜ vanilla Form.io JS -------------------- */
function buildExpression({ op, fields }) {
  const q = k => `+String(typeof data.${k}==='undefined'?0:data.${k})
                     .replace(/[^0-9.]/g,'')`;

  const safe = fields.map(q);
  const cfg  = CALC_OPS[op];
  if (!cfg) throw new Error("Unknown op " + op);

  const js = (cfg.arity === 1)
               ? cfg.expr(safe[0])
             : (cfg.arity === 2)
               ? cfg.expr(safe[0], safe[1])
               : cfg.expr(safe);

  return `value = ${js}`;
}

function handleDelete(cardEl, path) {

  /* ---------- A ▸ card nested inside a Columns shell ---------- */
  if (cardEl.dataset.ownerKey) {
    const wrapperKey = cardEl.dataset.ownerKey;
    const colIdx     = Number(cardEl.dataset.col);

    /* 1 ▸ pull the component out of the column */
   const removed = removeComponentInColumn(
      cardEl.dataset.ownerKey,
      Number(cardEl.dataset.col),
      false                               // ← keep the column, show placeholder
    );
    if (!removed) return;                               // should never happen

    /* 2 ▸ find the parent array that contains the wrapper */
    const destArr = (selectedFieldsetKey === 'root')
      ? formJSON.components
      : findFieldsetByKey(formJSON.components,
                          selectedFieldsetKey).components;

    /* 3 ▸ locate the wrapper itself in that array */
    const wIdx = destArr.findIndex(c => c.key === wrapperKey);
    /* 4 ▸ insert the removed component *after* the wrapper */
    destArr.splice(wIdx + 1, 0, removed);

    updatePreview();
    return;
  }

  /* ---------- B ▸ normal top-level card ------------------------ */
  removeComponentAtPath(path);          // already calls updatePreview()
}


/*─────────────────────────────────────────────────────────────*/
/*  QUIZ HELPERS                                               */
/*─────────────────────────────────────────────────────────────*/
function isQuizFieldset(fs){ return fs && fs.customType === 'quiz'; }

function addRowToAnswerKey(quizFS, cmp){
  const grid = quizFS.components.find(c=>c.key.startsWith('answerKey'));
  if(!grid || grid.type!=='datagrid') return;

  const label = (cmp.label||'').trim();
  const key   = cmp.key;

  // radio / dropdown → store label *and* current selected value
  grid.defaultValue.push({
    question : label,
    answer   : cmp.type==='select' || cmp.type==='radio'
                 ? (cmp.data?.values?.[0]?.label || '')   // empty until user picks
                 : ''
  });
}


/* Return the *label* that matches cmp.defaultValue, or "" */
function getAnswerLabelFromDefault(cmp){
  if (!cmp.defaultValue) return '';
  if (cmp.type === 'select' || cmp.type === 'radio'){
    const opt = (cmp.data?.values || cmp.values || [])
                  .find(v => v.value === cmp.defaultValue);
    return (opt ? opt.label : '');
  }
  return '';
}

/* create-or-update the datagrid row */
function syncAnswerKeyRow(quizFS, cmp){
  const grid = quizFS.components.find(c => c.key.startsWith('answerKey'));
  if (!grid) return;
  const qLabel = (cmp.label || '').trim();

  let row = grid.defaultValue.find(r => r.question === qLabel);
  if (!row){
    row = { question:qLabel, answer:'' };
    grid.defaultValue.push(row);
  }
  row.answer = getAnswerLabelFromDefault(cmp);
}


function findAncestorQuiz(fsKey){
  const fs = findFieldsetByKey(formJSON.components, fsKey);
  return isQuizFieldset(fs) ? fs : null;
}




/* ————————————————————————————————
   Single handler for the component-type cards
   — called whenever a .card in #componentTypeContainer is clicked
————————————————————————————————————— */
function onTypeCardClick(e) {
  const card = e.target.closest(".card");
  if (!card) return;

  const typeContainer = document.getElementById("componentTypeContainer");
  if (!typeContainer) return;

  const chosenType = card.dataset.type;

  const clearTypeSelection = () => {
    typeContainer.querySelectorAll(".card.selected")
                 .forEach(c => c.classList.remove("selected"));
  };

  /* highlight the tapped card */
  typeContainer.querySelectorAll(".card").forEach(c =>
    c.classList.toggle("selected", c === card)
  );

  /* ─ 2 · one-click components ─ */
 const oneClick = new Set([
   "textarea","account","file","phoneNumber",
   "address","asset","datetime",
   /* number / currency removed so they go through the modal */
   "fieldset"
 ]);

  if (oneClick.has(chosenType)) {
    const cmp     = createComponent(chosenType);
    const destArr = (selectedFieldsetKey === "root")
        ? formJSON.components
        : findFieldsetByKey(formJSON.components, selectedFieldsetKey).components;
    destArr.push(cmp);
   const quizFS = findAncestorQuiz(selectedFieldsetKey);
if (quizFS && ['select','radio'].includes(chosenType)){
addRowToAnswerKey(quizFS, cmp);
 }
showNotification('Component added', 'info'); // 👈 new line
updatePreview();

    updatePreview();

    /* auto-enter inline-edit on its label */
    requestAnimationFrame(() => {
      const span = document.querySelector(
        `.component-card[data-key="${cmp.key}"] .comp-label`
      );
      span?.dispatchEvent(new MouseEvent("dblclick", { bubbles:true }));
    });
    clearTypeSelection();
    return;
  }

  /* ─ 3 · block unsupported inside Edit-Grid ─ */
  const fs = findFieldsetByKey(formJSON.components, selectedFieldsetKey);
  if (fs && fs.type === "editgrid") {
    const banned = ["survey","file","fieldset","editgrid"];
    if (banned.includes(chosenType)) {
      card.classList.remove("selected");
      return;
    }
  }



  else if (chosenType === "quiz") {
  openLabelOptionsModal(
    (
      label,       /* we only use the first 5 params */
      _opts, _disc, _sQ, _sO,
      hideLbl, _req, _rows,
      _dt, _style,           // 10
      _actions,
      _def,                  // dummy
      passMark               // ★ the 13-th arg (see modal’s callback)
    ) => {
      /* build the quiz including Pass-Mark */
      const cmp = createComponent('quiz', label, [], hideLbl, passMark);

      const destArr = selectedFieldsetKey === 'root'
        ? formJSON.components
        : findFieldsetByKey(formJSON.components, selectedFieldsetKey).components;

      destArr.push(cmp);
      updatePreview();
    },
    'quiz',        // type
    '', [], '', [], [],          // unused params stay empty
    false, true, undefined,      // hideLabel / required / rows
    'datetime', undefined,       // dtMode / style
    false, [], [],               // actions / speed placeholders
    undefined,                           // defaultVal (unused here)
    undefined                            // initialPassMark (new last arg)
  );
  clearTypeSelection();
  return;
}

/* ──────────────────────────────────────────────────────────────
   SPEED  ➜  generates a plain Grouping with one radio per line
   ────────────────────────────────────────────────────────────── */
else if (chosenType === "speed") {
  // Always start with a clean slate for presets
  _presetRadioOptions = null;

  openLabelOptionsModal((
      groupLabel,                  // “Component Label” field
      _opts, _disc, _sQ, _sO,
      hideGrpLabel,                // Hide-Label toggle
      isRequired,                  // Required toggle
      _rows, _dtMode, _style,
      actionsEnabled,              // Actions toggle
      speedLabels,                 // textarea ①
      speedValues                  // textarea ②
    ) => {

    /* ── 0 · normalise the two text-areas ───────────────────── */
    speedLabels = (speedLabels || []).map(s => s.trim()).filter(Boolean);
    speedValues = (speedValues || []).map(s => s.trim());

    if (speedLabels.length === 0) {
      alert("Please enter at least one Speed Label.");
      return;
    }

    // Ensure the two lists are the same length
    if (speedValues.length > speedLabels.length) {
      speedValues.length = speedLabels.length;     // truncate extras
    }
    while (speedValues.length < speedLabels.length) speedValues.push("");

    /* ── 1 · create the outer Grouping ──────────────────────── */
    const groupingFS = createComponent("fieldset", groupLabel);

    // Only apply optional switches when the user checked them
    if (hideGrpLabel)                groupingFS.hideLabel = true;
    if (!isRequired)                 groupingFS.validate.required = false;

    groupingFS.legend = groupLabel;  // legend always mirrors the label

    /* ── 2 · radio builder helper ───────────────────────────── */
    const defaultRadioOpts = [
      { label:"Yes", value:"yes", flag:"success", shortcut:"" },
      { label:"No",  value:"no",  flag:"danger",  shortcut:"" },
      { label:"N/A",  value:"nA",  flag:"",        shortcut:"" }
    ];

    /* ── 3 · one radio (+ optional Actions) per label ───────── */
    speedLabels.forEach((lbl, idx) => {
      const keyBase = speedValues[idx] || lbl;

      const radio = createComponent(
        "radio",
        lbl,
        (_presetRadioOptions || defaultRadioOpts).map(o => ({ ...o }))
      );

      radio.key         = ensureGloballyUniqueKey(_.camelCase(keyBase));
      radio.__origValue = keyBase.trim();

      // Propagate the Required toggle only if it was set
      if (!isRequired) radio.validate.required = false;

      groupingFS.components.push(radio);

      if (actionsEnabled) {
        toggleActionsBundle(groupingFS.components, true, radio);
      }
    });

    /* ── 4 · park the Grouping in the current destination ───── */
    const destArr =
      selectedFieldsetKey === "root"
        ? formJSON.components
        : findFieldsetByKey(formJSON.components, selectedFieldsetKey).components;

    destArr.push(groupingFS);
    updatePreview();
  }, "speed");          // ← tell the modal we’re in “speed” mode

  clearTypeSelection();
  return;
}




const initialActionsEnabled = false;

  /* ─ 4 · everything else needs the modal ─ */
  openLabelOptionsModal(
    (label, options, disclaimerText, sQ, sO,
 finalHideLabel, finalRequired, finalRows,
 selectedDTMode, styleOrDT,
 actionsEnabled,
 incomingDefault,
 passMark) => {
      let typeToUse = chosenType;
      if (typeToUse === "choiceList") typeToUse = styleOrDT;
      if (typeToUse === "number")     typeToUse = styleOrDT;

 const cmp = createComponent(
     typeToUse,               // type
     label,                   // label
     options || [],           // options
     finalHideLabel,          // hide label?
     typeToUse === 'quiz' ? passMark : incomingDefault 
 );
if (incomingDefault !== undefined) {
    cmp.defaultValue = incomingDefault;        // keep NaN / 0 / any number
  } else {
    delete cmp.defaultValue;                   // user cleared the box
  }
      cmp.validate = cmp.validate || {};
      cmp.validate.required = !!finalRequired;

      if (typeToUse === "survey") {
        cmp.questions = ensureUniqueValues(sQ);
        cmp.values    = ensureUniqueValues(sO);
      }
      if (typeToUse === "disclaimer") {
        cmp.customType = "disclaimer";
        cmp.html = disclaimerText.startsWith("<p")
          ? disclaimerText
          : `<p>${disclaimerText}</p>`;
      }
      if (typeToUse === "textarea") {
        cmp.rows = finalRows || 1;
        cmp.labelWidth  = 30;
        cmp.labelMargin = 3;
        cmp.autoExpand  = true;
        cmp.reportable  = true;
        cmp.tableView   = true;
      }
      if (typeToUse === "datetime") {
        cmp.__mode = selectedDTMode;
        tweakDateTimeMode(cmp, selectedDTMode);
      }

      const destArr = (selectedFieldsetKey === "root")
          ? formJSON.components
          : findFieldsetByKey(formJSON.components, selectedFieldsetKey).components;

      destArr.push(cmp);
      const quizFS = findAncestorQuiz(selectedFieldsetKey);
if (quizFS && ['select','radio'].includes(typeToUse)) {
  syncAnswerKeyRow(quizFS, cmp);          // util below
}
      toggleActionsBundle(destArr, actionsEnabled, cmp);
      updatePreview();

      /* clear highlight */
      typeContainer.querySelectorAll(".card").forEach(c =>
        c.classList.remove("selected")
      );
    },
chosenType,          // type
  "",                  // initialLabel
  [],                  // initialOptions
  "",                  // initialDisclaimer
  [], [],              // initialSurvey Q / A
  false,               // initialHideLabel
  true,                // initialRequired
  undefined,           // initialRows
  "datetime",          // initialDTMode
  undefined,           // initialStyleOrDT  (was styleOrDT ❌)
  initialActionsEnabled,
  [], [],              // speed placeholders
  undefined,
  undefined               
);
}


/**
 * Gathers "containers" (both fieldsets and editgrids) from the form,
 * sets up fieldset selection, etc.
 */
function gatherFieldsets(components, fieldsets = []) {
  components.forEach(comp => {
    // If this is the special nested fieldset inside an Edit Grid, skip adding it
    const isNestedFieldset = comp.type === "fieldset" && comp.isEditGridChildFieldset;

    const isContainer = ['fieldset','editgrid'].includes(comp.type);  
    if (isContainer && !isNestedFieldset && !comp.builderHidden) {
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
function getComponentByPath(pathStr) {
  const parts = String(pathStr).split('.').map(Number);

  let nodeArr = (selectedFieldsetKey === 'root')
    ? formJSON.components
    : (findFieldsetByKey(formJSON.components, selectedFieldsetKey)?.components || []);

  let comp = nodeArr[parts[0]];          // first hop

  for (let i = 1; i < parts.length && comp; i++) {
    const idx = parts[i];

    if (comp.type === 'columns') {       // inside a Columns wrapper
      comp = comp.columns[idx]?.components[0] || null;
    } else if (Array.isArray(comp.components)) {
      comp = comp.components[idx] || null;
    } else {
      comp = null;
    }
  }
  return comp || null;
}

function pruneEmptyColumns(shell){
  // drop any column that now has 0 components
  shell.columns = shell.columns.filter(col => col.components.length);

  // normalise widths so the total is always 12
  const newW = 12 / shell.columns.length;
  shell.columns.forEach(col => {
    col.width        = newW;
    col.currentWidth = newW;
  });
}


function attachInnerSortables() {
  document.querySelectorAll(".columns-row").forEach((row) => {
    if (row.dataset.sortableMade) return;              // once only
    row.dataset.sortableMade = "1";

    Sortable.create(row, {
      group         : {                   // ← new object
               name : "builder",                 //   same group name …
               pull : false,                     // ✱ forbid dragging *out*
               put  : true                       //   but still allow dropping *in*
             },
      direction     : "horizontal",
      animation  : 300,
      easing    : "cubic-bezier(.165,.84,.44,1)",
      draggable     : ".component-card:not(.placeholder)",
      fallbackOnBody: false,
      ghostClass    : "drag-ghost",
      chosenClass   : "drag-chosen",

      /* ---------------------------------------------------------
         LEAVING the row → pull JSON out + drop a placeholder
      --------------------------------------------------------- */
      onRemove(evt) {
        const { item } = evt;
        const ownerKey = item.dataset.ownerKey;
        const colIdx   = Number(item.dataset.col);

        /* 1 ▸ remove from JSON ---------------------------------- */
        const shell = findCompByKey(formJSON.components, ownerKey);
 item.__json = shell?.columns[colIdx]?.components.shift() || null;

        /* 2 ▸ placeholder so the row keeps its shape ------------- */
        const ph = document.createElement("div");
        ph.className           = "component-card placeholder";
        ph.style.opacity = 0;    
        ph.dataset.placeholder = "true";
        ph.dataset.colOwner    = ownerKey;
        ph.dataset.colIndex    = colIdx;
        ph.textContent         = "Drop\u00A0here";
        evt.from.insertBefore(ph, evt.from.children[colIdx] || null);
        requestAnimationFrame(() => ph.style.opacity = 1);

        /* 3 ▸ make the *travelling* card look like a top-level card */
        item.classList.remove("nested");   // show full-size styling
        item.style.flex = "";              // clear flex:1 1 0;

        /* rebuild the action buttons so ‘wrap-in-2/3’ re-appear */
        const actions = item.querySelector(".component-actions");
  if (actions) {
    const meta = findCompByKey(formJSON.components, item.dataset.key);
    actions.innerHTML = actionButtonsHTML(true, meta);
  }
      },

      /* ---------------------------------------------------------
         ENTERING the row from an external list
      --------------------------------------------------------- */
      onAdd(evt) {
        const { item } = evt;                  // card just dropped in
        let   ph       = row.querySelector('.placeholder');
        const shell    = findCompByKey(formJSON.components, row.dataset.ownerKey);
      
      /* ─── Row is already full (2–3 cards) ─── */
      if (!ph) {
        /* Allow growth up to a **maximum of 4** columns */
        if (shell && shell.columns.length < 4) {
        
            /* 1 ▸ append a NEW (empty) column object */
            shell.columns.push({
              components   : [],
              width        : 3,   // temporary – will be normalised below
              offset:0,push:0,pull:0,size:'sm',
              currentWidth : 3
            });
          
            /* 2 ▸ re-balance widths for the new layout (3 or 4 cols) */
            const newW = 12 / shell.columns.length;   // 12 / 3 = 4  or  12 / 4 = 3
            shell.columns.forEach(c => {
              c.width        = newW;
              c.currentWidth = newW;
            });
          
            /* 3 ▸ insert a placeholder DIV for the freshly added slot */
            ph = document.createElement('div');
            ph.className           = 'component-card placeholder';
            ph.dataset.placeholder = 'true';
            ph.dataset.colOwner    = shell.key;
            ph.dataset.colIndex    = shell.columns.length - 1;
            ph.textContent         = 'Drop\u00A0here';
            row.appendChild(ph);
          
        } else {
            /* already at 4 → reject the drop and snap back */
            evt.from.insertBefore(item, evt.from.children[evt.oldIndex] || null);
            return;
        }
      }
      
        /* ─── normal insert (now we surely have a placeholder) ─── */
        const colIdx = Number(ph.dataset.colIndex);
      
        const displaced = moveComponentIntoColumn(
                            item.dataset.key,
                            row.dataset.ownerKey,
                            colIdx,
                            item.__json || null);
        delete item.__json;
      
        if (displaced) {
          const destArr = (selectedFieldsetKey === 'root')
            ? formJSON.components
            : findFieldsetByKey(formJSON.components, selectedFieldsetKey).components;
          const wIdx = destArr.findIndex(c => c.key === row.dataset.ownerKey);
          destArr.splice(wIdx + 1, 0, displaced);
        }
      
        ph.remove();            // tidy up
        updatePreview();        // redraw builder + counter
      }
      ,

      /* ---------------------------------------------------------
         Moving a card *inside the same* row (swap / replace)
      --------------------------------------------------------- */
      onEnd(evt) {
        if (evt.from !== evt.to) return;          // handled by onAdd

        const ph = evt.item.nextElementSibling;
        if (ph && ph.dataset.placeholder) {
             /* finalise the removal now that the move is confirmed */
             removeComponentInColumn(ph.dataset.colOwner,
                                     Number(ph.dataset.colIndex));

                                     moveComponentIntoColumn(
                                         evt.item.dataset.key,
                                         ph.dataset.colOwner,
                                         Number(ph.dataset.colIndex),
                                         evt.item.__json          // clone from onRemove
                                       );
                delete evt.item.__json;
          ph.remove();           // clean up the placeholder
          updatePreview();
        }
      },

      onStart() { row.classList.add("dragging"); },
      onEnd  () { row.classList.remove("dragging"); }
    });
  });
}


function actionButtonsHTML(showColumn = true, comp = null) {

  /* ── context helpers ─────────────────────────────────────────────── */
  const isNumeric = comp && ['number', 'currency'].includes(comp.type);

  // Answer-Key button (only on the quiz datagrid)
  const akBtn = (comp &&
                 comp.type === 'datagrid' &&
                 comp.key.startsWith('answerKey')) ?
      `<button class="component-action-btn" data-action="akey"
               title="Edit Answer-Key">
         <i class="fa-solid fa-table-list"></i>
       </button>` : '';

  // Calculator (only on Number / Currency)
  const calcBtn = isNumeric
      ? `<button class="component-action-btn" data-action="calc" title="Calculator">
           <i class="fa-solid fa-calculator"></i>
         </button>`
      : '';

  /* toggle states for Required / Hide Label / Actions  */
  const reqOn  = comp?.validate?.required ? ' on' : '';
  const hideOn = comp?.hideLabel          ? ' on' : '';
  const actOn  = comp?._actionsDriverKey  ? ' on' : '';

  /* ── LEFT cluster ────────────────────────────────────────────────── */
  const left = `
    <button class="component-action-btn" data-action="delete" title="Delete">
      <i class="fa-solid fa-trash"></i>
    </button>
    <button class="component-action-btn" data-action="moveto" title="Move To">
      <i class="fa-solid fa-arrow-right-arrow-left"></i>
    </button>
    <button class="component-action-btn" data-action="edit" title="Edit">
      <i class="fa-solid fa-pen"></i>
    </button>
    <button class="component-action-btn" data-action="conditional" title="Conditional">
      <i class="fa-solid fa-code-branch"></i>
    </button>
    ${ showColumn ? `
      <button class="component-action-btn" data-action="wrap2" title="Wrap in 2 columns">
        <i class="fa-solid fa-table-columns"></i>
      </button>` : '' }
    ${ akBtn }
  `;

  /* ── RIGHT cluster (slide-out) ───────────────────────────────────── */
  const dtBtns = comp && (comp.type === 'datetime' || comp.customType === 'datetime') ? `
      <button class="component-action-btn dt-btn${(comp.__mode||'datetime')==='datetime'?' on':''}"
              data-action="dtmode" data-mode="datetime" title="Date & Time">
        <i class="fa-regular fa-calendar-check"></i>
      </button>
      <button class="component-action-btn dt-btn${(comp.__mode||'datetime')==='date'?' on':''}"
              data-action="dtmode" data-mode="date" title="Date">
        <i class="fa-regular fa-calendar"></i>
      </button>
      <button class="component-action-btn dt-btn${(comp.__mode||'datetime')==='time'?' on':''}"
              data-action="dtmode" data-mode="time" title="Time">
        <i class="fa-regular fa-clock"></i>
      </button>` : '';

  const numBtns = isNumeric ? `
      <button class="component-action-btn num-btn${comp.type==='number'?' on':''}"
              data-action="nummode" data-mode="number" title="Plain Number">
        <i class="fa-solid fa-hashtag"></i>
      </button>
      <button class="component-action-btn num-btn${comp.type==='currency'?' on':''}"
              data-action="nummode" data-mode="currency" title="Currency">
        <i class="fa-solid fa-dollar-sign"></i>
      </button>` : '';

  const right = `
    <div class="right-actions">
      <!-- anchor that’s always visible -->
      <button class="component-action-btn anchor-btn" title="More">
        <i class="fa-solid fa-ellipsis-h"></i>
      </button>

      <!-- slide-out -->
      <div class="extra-actions">
        ${dtBtns}
        ${numBtns}
        ${calcBtn}
        ${ comp?.type === 'textarea' ? `
          <button class="component-action-btn rows-btn${comp.rows===3?' on':''}"
                  data-action="rows3" title="3 Rows"><span>3</span></button>` : '' }

        <button class="component-action-btn toggle-btn${reqOn}"
                data-tog="required" title="Required">
          <i class="fa-solid fa-asterisk"></i>
        </button>
        <button class="component-action-btn toggle-btn${hideOn}"
                data-tog="hideLabel" title="Hide Label">
          <i class="fa-solid fa-eye-slash"></i>
        </button>
        <button class="component-action-btn toggle-btn${actOn}"
                data-tog="actions" title="Actions">
          <i class="fa-solid fa-comment-dots"></i>
        </button>
      </div><!-- /.extra-actions -->
    </div><!-- /.right-actions -->
  `;

  /* ── final markup ───────────────────────────────────────────────── */
  return `${left}<span class="flex-spacer"></span>${right}`;
}







/* --------------------------------------------------------------
   Build the clickable answer-key panel that lives *inside* each
   Quiz fieldset (keys that start with “quiz”)
----------------------------------------------------------------*/
function renderComponentCards() {
  const listEl = document.getElementById("componentList");
  if (!listEl) return;

  /* human-friendly type names */
  const nice = t => ({
    disclaimer : "Disclaimer Text",
    textarea   : "Text Area",
    account    : "Account",
    radio      : "Radio",
    survey     : "Survey",
    selectboxes: "Select Boxes",
    select     : "Dropdown",
    file       : "Photo",
    phoneNumber: "Phone Number",
    address    : "Address",
    asset      : "Asset",
    datetime   : "Date / Time",
    number     : "Number",
    currency   : "Currency",
    fieldset   : "Grouping",
    editgrid   : "Edit Grid",
    columns    : "Columns"
  }[t] || _.startCase(t));

  /* which component array are we showing? */
  let comps = [];
  if (selectedFieldsetKey === "root") {
    comps = formJSON.components;
  } else {
    const fs = findFieldsetByKey(formJSON.components, selectedFieldsetKey);
    comps = fs ? fs.components : [];
  }


let html = "";

  comps.forEach((comp, rootIdx) => {
    if (comp.builderHidden) return;


    const showCalc = ['number', 'currency'].includes(comp.type);

    /* 1 ▸ normal cards (skip Columns wrapper itself) */
    if (comp.type !== 'columns') {
      html += `
        <div class="component-card"
             data-path="${rootIdx}"
             data-key="${comp.key}">
          <div class="component-details">
            <span class="comp-label" data-path="${rootIdx}">
              ${comp.label || '[No Label]'}
            </span>
            <small style="opacity:.7">(${nice(comp.customType || comp.type)})</small>
          </div>

          <div class="component-actions">
            ${actionButtonsHTML(true, comp)}
          </div>
        </div>`;
    }

    /* 2 ▸ children inside a Columns wrapper */
    if (comp.type === "columns") {
      html += `<div class="columns-row"
                     data-owner-key="${comp.key}"
                     data-owner-idx="${rootIdx}">`;

      comp.columns.forEach((col, colIdx) => {
        if (col.components.length) {
          const child = col.components[0];
          if (!child.builderHidden) {
            html += `
              <div class="component-card nested"
                   style="flex:1 1 0;"
                   data-owner="${rootIdx}"
                   data-owner-key="${comp.key}"
                   data-col="${colIdx}"
                   data-key="${child.key}"
                   data-path="${rootIdx}.${colIdx}">
                <div class="component-details">
                  <span class="comp-label" data-path="${rootIdx}.${colIdx}">
                    ${child.label || "[No Label]"}
                  </span>
                  <small style="opacity:.7">
                    (${nice(child.customType || child.type)})
                  </small>
                </div>
                <div class="component-actions">${actionButtonsHTML(false, child)}</div>
              </div>`;
          }
        } else {
          html += `
            <div class="component-card placeholder"
                 data-placeholder="true"
                 data-col-owner="${comp.key}"
                 data-col-index="${colIdx}">
              Drop&nbsp;here
            </div>`;
        }
      });

      html += `</div>`;      /* close .columns-row */
    }
  });

  listEl.innerHTML = html;
}



/**
 * Update the visible component list in the DOM.
 */
function updateComponentList() {
  // renderComponentCards() now handles putting HTML in the DOM
  renderComponentCards();
  attachInnerSortables();
[...openMenuKeys].forEach(key => {
    const box = document.querySelector(
      `.component-card[data-key="${key}"] .right-actions`
    );
    if (box) box.classList.add('open');
    else     openMenuKeys.delete(key);   // card was removed
  });
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
    // deep-clone and strip every builderHidden flag before previewing
    const clean = JSON.parse(JSON.stringify(formJSON));
    (function strip(o){
      if (Array.isArray(o)) { o.forEach(strip); return; }
      if (o && typeof o === 'object') {
        delete o.builderHidden;
        if (o.components) strip(o.components);
      }
    })(clean);
    preEl.textContent = JSON.stringify(clean, null, 2);
  }
  updateComponentList();
  (function walk(arr){
    arr.forEach(c=>{
      if (Array.isArray(c.components)) walk(c.components);
    });
  })(formJSON.components);
  updateFieldsetCards();

  const allComps = getAllComponents(formJSON.components)
     .filter(c => !c.builderHidden && c.type !== 'columns');
  const totalCount = allComps.length;
  const countEl = document.getElementById("totalComponents");
  if (countEl) {
    countEl.textContent = totalCount;
  }
}




/* helper ─ find a component by key anywhere in the tree */
function findCompByKey(arr, key) {
  for (const c of arr) {
    if (c.key === key) return c;
    if (Array.isArray(c.components)) {
      const deep = findCompByKey(c.components, key);
      if (deep) return deep;
    }
  }
  return null;
}



/*─────────────────────────────────────────────────────────────
  Move a component – or a whole *column* – into another
  grouping (“Root”, any <fieldset>, or an <editgrid>).

  pathIndex · string | number  e.g. "2"  "5"  "3.1"
  targetKey · "root" | fieldset.key | editgrid.key
─────────────────────────────────────────────────────────────*/
function moveComponentToFieldset(pathIndex, targetKey) {

  /* ─── Case A · component lives INSIDE a Columns wrapper ─── */
  if (String(pathIndex).includes('.')) {
    const [rowIdx, colIdx] = String(pathIndex).split('.').map(n => parseInt(n, 10));

    /* 1 ▸ arrays we move FROM / TO */
    const fromArr = (selectedFieldsetKey === 'root')
      ? formJSON.components
      : findFieldsetByKey(formJSON.components, selectedFieldsetKey)?.components || [];

    const toArr = (targetKey === 'root')
      ? formJSON.components
      : findFieldsetByKey(formJSON.components, targetKey)?.components || [];

    const shell = fromArr[rowIdx];
    if (!shell || shell.type !== 'columns') return;   // safety-net

    /* 2 ▸ carve the WHOLE column out of the row */
    const [removedCol] = shell.columns.splice(colIdx, 1);
    if (!removedCol) return;

    /* 3 ▸ if that row is now empty → delete it, otherwise rebalance */
    if (shell.columns.length === 0) {
      fromArr.splice(rowIdx, 1);            // drop empty wrapper
    } else {
      pruneEmptyColumns(shell);             // fix widths
    }

    /* 4 ▸ wrap the column in its own “Columns” shell so it keeps
           behaving like a row when re-inserted elsewhere          */
    const newShell = createComponent('columns', 'Columns');
    newShell.columns.length = 0;            // remove the default two columns
    newShell.columns.push(removedCol);

    /* keep whatever width the column had; if none, fall back to 12 */
    if (!removedCol.width || removedCol.width <= 0) {
      removedCol.width        = 12;
      removedCol.currentWidth = 12;
    }

    /* 5 ▸ park this new shell in the destination grouping */
    toArr.push(newShell);

    updatePreview();
    return;                                 // dotted paths handled – done
  }

  /* ─── Case B · normal top-level card ─── */

  /* 1 ▸ arrays we move FROM / TO */
  const fromArr =
    (selectedFieldsetKey === 'root')
      ? formJSON.components
      : findFieldsetByKey(formJSON.components, selectedFieldsetKey)?.components || [];

  const toArr =
    (targetKey === 'root')
      ? formJSON.components
      : findFieldsetByKey(formJSON.components, targetKey)?.components || [];

  const owner = fromArr[pathIndex];
  if (!owner) return;

  /* 2 ▸ collect owner + any linked Actions bundle */
  const bundle = [owner];
  const idxMap = new Map([[owner, pathIndex]]);

  if (owner._actionsDriverKey) {
    const dKey = owner._actionsDriverKey;
    fromArr.forEach((c, i) => {
      if (c.key === dKey || c.conditional?.when === dKey) {
        bundle.push(c);
        idxMap.set(c, i);
      }
    });
    bundle.sort((a, b) => idxMap.get(a) - idxMap.get(b));
  }

  /* 3 ▸ remove bundle from source */
  bundle.forEach(c => {
    const i = fromArr.indexOf(c);
    if (i !== -1) fromArr.splice(i, 1);
  });

  /* 4 ▸ append bundle to destination */
  toArr.push(...bundle);

  /* 5 ▸ tidy Actions driver numbering */
  if (window.compactActionBundles) {
    compactActionBundles(fromArr);
    if (fromArr !== toArr) compactActionBundles(toArr);
  }

  updatePreview();
}



/* single, authoritative mover */
function moveComponentIntoColumn(srcKey, columnsKey, colIdx, fallbackComp = null) {

  

  /* 1 ▸ pull the component out, wherever it lives */
  function pull(arr) {
    for (let i = arr.length - 1; i >= 0; i--) {
      const node = arr[i];

      /* a) right here */
      if (node.key === srcKey) return arr.splice(i, 1)[0];

      /* b) inside a normal .components array */
      if (Array.isArray(node.components)) {
        const found = pull(node.components);
        if (found) return found;
      }

      /* c) inside any column of a Columns shell */
      if (node.type === "columns") {
        for (const col of node.columns) {
          const found = pull(col.components);
          if (found) return found;
        }
      }
    }
    return null;
  }

  /* 2 ▸ grab the component (or the one cached by onRemove) */
  let cmp = pull(formJSON.components);
  if (!cmp && fallbackComp) cmp = fallbackComp;
  if (!cmp) return null;                   // nothing to move → bail out

  /* 3 ▸ find the target Columns wrapper */
  const shell = findCompByKey(formJSON.components, columnsKey);
  if (!shell || shell.type !== "columns") return null;

  /* 4 ▸ do the swap */
  const colArr    = shell.columns[colIdx].components;
  const displaced =
        (colArr.length && colArr[0] !== cmp)
          ? colArr.shift()
          : null;
  colArr.unshift(cmp);

  return displaced;   // onAdd will park this (if not null)
}

/* ───── DRAG-AND-DROP helper ────────────────────────────── */
function reorderComponents(oldIdx, newIdx) {
  if (oldIdx === newIdx) return;          // nothing to do

  // Which array are we editing?  Root or the selected field-set
  const arr = (selectedFieldsetKey === 'root')
        ? formJSON.components
        : (findFieldsetByKey(formJSON.components, selectedFieldsetKey)?.components || []);

  arr.splice(newIdx, 0, ...arr.splice(oldIdx, 1));   // move the item

  // keep your Actions bundles numbered nicely
  if (window.compactActionBundles) compactActionBundles(arr);

  updatePreview();                        // redraw the list + JSON preview
}
/**
 * Edit a component by path index. Reuses your openLabelOptionsModal.
 */
function editComponent(pathIndex) {


const comp = getComponentByPath(pathIndex);   // ① get the component first
  if (!comp) return;                            //    (fail-safe)

  const quizFS = findAncestorQuiz(selectedFieldsetKey);
  if (quizFS && ['select','radio'].includes(comp.type)) {
       syncAnswerKeyRow(quizFS, comp);          // ② now `comp` is defined
  }

  window._currentEditingComponent = comp;

  let initialLabel = comp.label || "";
if (isQuizFieldset(findAncestorQuiz(selectedFieldsetKey)) &&
    ['select','radio'].includes(comp.type)){
  const quiz = findAncestorQuiz(selectedFieldsetKey);
  const grid = quiz.components.find(c=>c.key.startsWith('answerKey'));
  const row  = grid.defaultValue.find(r=>r.question===initialLabel);
  if (row){
    row.question = comp.label;
  }
}
  let initialOptions = [];
  let initialDisclaimer = "";
  let initialHideLabel = !!comp.hideLabel;
  let initialDTMode =
        comp.__mode                         // value saved earlier, if any
    ?   comp.__mode
    :   comp.noCalendar        ? "time"
    : ! comp.enableTime        ? "date"
    :                            "datetime";

    let initialSpeedLabels = [];
    let initialSpeedValues = [];

    
    if (comp.type === "speed") {
    comp.components
            .filter(c => c.type === "radio")
            .forEach(r => {
              initialSpeedLabels.push(r.label || "");
              /* keep *exact* value typed at creation (falls back to key) */
              initialSpeedValues.push(r.__origValue ?? r.key ?? "");
            });
    }

  // If it's a radio/select/selectboxes => gather current options
  if (["radio", "select", "selectboxes"].includes(comp.type)) {
    if (comp.type === "select") {
      initialOptions = (comp.data?.values || []).map(o => ({ label: o.label }));
    } else {
      initialOptions = (comp.values || []).map(o => ({ label: o.label }));
    }
  }
  // If disclaimer
if (comp.customType === "disclaimer" || comp.type === "content") {
   /* keep the raw HTML so CKEditor shows the original formatting */
   initialDisclaimer = comp.html || "";
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

  let initialPassMark = 0;
if (comp.customType === 'quiz') {
  const pm = comp.components.find(c => c.key.startsWith('passMark'));
  initialPassMark = pm?.defaultValue ?? 0;
}


  /* ---------- determine which type name the modal expects ---------- */
const modalType = comp.customType
  ? comp.customType                       // e.g. "disclaimer"
  : comp.type === "speed"
    ? "speed"
    : comp.type === "content"             // legacy Disclaimer = content component
      ? "disclaimer"
      : comp.type;  

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
      styleOrMode,
      actionsEnabled,   // ← 11-th
      incomingDefault,        // ← 12-th (only if you need it)
      passMark

    ) => {
      comp.label = newLabel;
      comp.hideLabel = !!finalHideLabel;
      comp.key = updateUniqueKey(comp.key, newLabel);

      // keep the legend text in sync when editing a field-set
      if (comp.type === "fieldset") {
        comp.legend = newLabel;
      }
      
      if (!comp.validate) comp.validate = {};
      comp.validate.required = !!finalRequired;

      if (["select", "radio", "selectboxes"].includes(comp.type)) {
        const uniqueItems = ensureUniqueValues(newOpts);   // avoids duplicate values
        if (comp.type === "select") {
          comp.data = comp.data || {};
          comp.data.values = uniqueItems;
        } else {
          comp.values = uniqueItems;
        }
      }
  
 /* ───── style change: Dropdown ↔ Radio ↔ Select Boxes ───── */
 if (["select", "radio", "selectboxes"].includes(comp.type) &&
     ["select", "radio", "selectboxes"].includes(styleOrMode) &&
     styleOrMode !== comp.type) {

   const clone = a => a.map(o => ({ ...o }));

   // Moving away from a <select>: pull options out of .data.values
   if (comp.type === "select") {
     comp.values = clone(comp.data?.values || []);
     delete comp.data;
   }

   // Reset style-specific flags
   delete comp.inline;
   delete comp.optionsLabelPosition;
   delete comp.inputType;
   delete comp.modalEdit;           // ← always clear old modalEdit

   if (styleOrMode === "select") {
     // → Dropdown
     comp.type   = "select";
     comp.widget = "html5";
     comp.placeholder = "Tap & Select";
     comp.data   = { values: clone(comp.values) };
     delete comp.values;
     comp.tableView = true;
   } else {
     // → Radio or Select Boxes
     comp.type                 = styleOrMode;
     comp.inline               = (styleOrMode === "radio");
     comp.optionsLabelPosition = "right";
     comp.tableView            = false;
     if (styleOrMode === "selectboxes") {
       comp.inputType = "checkbox";
       comp.modalEdit = true;     // ← only here
     }
   }
 }

 /* ───── style change: Number ↔ Currency ───── */
 if ((comp.type === "number" || comp.type === "currency") &&
     (styleOrMode === "number" || styleOrMode === "currency") &&
     styleOrMode !== comp.type) {


      

   comp.type = styleOrMode;

   if (styleOrMode === "currency") {
     comp.currency  = "USD";
     comp.delimiter = true;
   } else {
     delete comp.currency;
     delete comp.delimiter;
   }
 }

if (comp.type === 'number' || comp.type === 'currency') {
  if (typeof incomingDefault === 'number') comp.defaultValue = incomingDefault;
  else if (incomingDefault === undefined)  delete comp.defaultValue;
}
 
      // If disclaimer
      if (comp.customType === "disclaimer" || comp.type === "content") {
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

if (comp.type === 'number' || comp.type === 'currency') {
  if (typeof incomingDefault === 'number') comp.defaultValue = incomingDefault;
  else if (incomingDefault === undefined)  delete comp.defaultValue;
}

      if ((comp.customType || comp.type) === "datetime") {
        comp.__mode = selectedDTMode;
        tweakDateTimeMode(comp, selectedDTMode);
      }


      if (comp.type === 'speed') {
        /* (a) grab just the radios – ignore bundles we might insert */
        const radios = comp.components.filter(c => c.type === 'radio');

        radios.forEach(radio => {
          // 1️⃣  make sure the *current* state is cleared first
          if (radio._actionsDriverKey) {
            toggleActionsBundle(comp.components, false, radio);
          }
          // 2️⃣  apply according to the toggle switch
          if (actionsEnabled) {
            toggleActionsBundle(comp.components, true, radio);
          }
        });
      } else {
        /* every other component behaves as before */
        const parentArray =
          (selectedFieldsetKey === 'root')
            ? formJSON.components
            : findFieldsetByKey(
                formJSON.components,
                selectedFieldsetKey
              )?.components || [];

        toggleActionsBundle(parentArray, actionsEnabled, comp);
      }
      window._currentEditingComponent = null;
      updatePreview();
    },
    modalType,               // ← SECOND ARGUMENT (the type string the modal expects)
    initialLabel,
    initialOptions,
    initialDisclaimer,
    initialSurveyQuestions,
    initialSurveyOptions,
    initialHideLabel,
    !!comp.validate?.required,
    initialRows,
    initialDTMode,  
    comp.type, 
    (comp._actionsDriverKey ? true : false),                     // 11
    initialSpeedLabels,                  // 12
    initialSpeedValues,                  // 13
    comp.defaultValue,
    initialPassMark  
  );
}


/*───────────────────────────────────────────────
  Wrap one component into a 2- or 3-column block
────────────────────────────────────────────────*/
function wrapComponentInColumns(pathIndex, colCount = 2){
  if (![2,3].includes(colCount)) colCount = 2;

  const parentArray = (selectedFieldsetKey === "root")
        ? formJSON.components
        : (findFieldsetByKey(formJSON.components, selectedFieldsetKey)?.components || []);

  const owner = parentArray[Number(pathIndex)];
  if (!owner) return;

  /* build shell */
  const shell = createComponent('columns', 'Columns');
  shell.columns.length = 0;                // remove 6+6 default

  /* first column keeps the original component */
  shell.columns.push({
    components   : [owner],
    width        : 12/colCount,
    offset:0,push:0,pull:0,size:'sm',
    currentWidth : 12/colCount
  });

  /* remaining empty columns */
  for (let i = 1; i < colCount; i++){
    shell.columns.push({
      components   : [],
      width        : 12/colCount,
      offset:0,push:0,pull:0,size:'sm',
      currentWidth : 12/colCount
    });
  }

  /* replace in parent array */
  parentArray.splice(Number(pathIndex), 1, shell);
  showNotification('Component deleted', 'warn');

  /* keep Actions drivers tidy */
  if (window.compactActionBundles) compactActionBundles(parentArray);

  updatePreview();
}


/* helper: find a component anywhere in the form by key */
function findCompByKey(arr, key){
  for (const c of arr){
    if (c.key === key) return c;
    if (Array.isArray(c.components)){
      const deep = findCompByKey(c.components, key);
      if (deep) return deep;
    }
  }
  return null;
}



function removeComponentInColumn(wrapperKey, colIdx, pruneAfter = false){
    /* look it up by key so index doesn’t matter */
    function findWrapper(arr){
      for (const c of arr){
        if (c.key === wrapperKey)          return c;
        if (c.components?.length){
          const deep = findWrapper(c.components);
          if (deep) return deep;
        }
      }
      return null;
    }
    const shell = findWrapper(formJSON.components);
  if (!shell || shell.type !== "columns") return;

  /* drop the first (only) component in that slot */
  const removed = shell.columns[colIdx].components.shift() || null;

  /* 1 ▸ drop empty columns if asked -------------------------------- */
  if (pruneAfter) pruneEmptyColumns(shell);

  /* 2 ▸ if ALL columns are now empty → delete the wrapper itself ---- */
  const parentArr = (selectedFieldsetKey === 'root')
        ? formJSON.components
        : findFieldsetByKey(formJSON.components, selectedFieldsetKey).components;

  if (shell.columns.every(c => c.components.length === 0)) {
    const idx = parentArr.indexOf(shell);
    if (idx !== -1) parentArr.splice(idx, 1);
  }

  return removed;
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
    };
  }

  modal.style.display = "block";
  overlay.style.display = "block";
}


/* ── keep track of edit‑mode vs new‑mode ───────────────*/
const editingId = localStorage.getItem('importedId') || null;
window._currentTplName   = localStorage.getItem('importedName')   || '';
window._currentTplFolder = localStorage.getItem('importedFolder') || '';



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
        .catch(err => console.error("Copy error:", err));
    });
  }

    const typeContainer = document.getElementById("componentTypeContainer");

  if (typeContainer) {
    // render the picker cards once
    const componentTypes = [
      "disclaimer", "textarea", "account", "choiceList", "survey",
      "file", "phoneNumber", "address", "asset", "datetime",
      "number", "editgrid", "speed", "quiz"
    ];

    typeContainer.innerHTML = componentTypes
      .map(t => `<div class="card" data-type="${t}">${_.startCase(t)}</div>`)
      .join("");

    // one click-handler for the whole strip
    typeContainer.addEventListener("click", onTypeCardClick);
  } else {
    console.warn("#componentTypeContainer not found in the HTML");
  }

  // «—— stray `modalType` definition was here – removed »

  // "Add Fieldset" button
  const addFieldsetBtn = document.getElementById("addFieldsetBtn");
  if (addFieldsetBtn) {
    addFieldsetBtn.addEventListener("click", () => {
      openLabelOptionsModal(
        (label, options, disclaimerText, surveyQuestions, surveyOptions, finalHideLabel, finalRows, finalRequired, selectedDTMode, actionsEnabled, defaultVal) => {
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
      }
    });
  }
  updateFieldsetCards();

 /* ------------------------------------------------------------------
   Component-picker panel (single, de-duplicated version)
-------------------------------------------------------------------*/
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
  "editgrid",
  "quiz"
];





  document.getElementById('componentList').addEventListener('click', e => {

const anchor = e.target.closest('.anchor-btn');
if (anchor) {
  const card = anchor.closest('.component-card');   // ⇠ we need this
  const box  = card.querySelector('.right-actions');

const isOpen = box.classList.toggle('open');
const key    = card.dataset.key;
if (isOpen) openMenuKeys.add(key);
else        openMenuKeys.delete(key);

  // stop the click from falling through to other handlers
  e.stopPropagation();
  return;
}
      // ← single source of truth
  
    updatePreview();                  // keep JSON panel fresh
  });


  

  // Listen for actions on each component card (Move Up, Down, Conditional, Edit, Delete)
  const compListEl = document.getElementById("componentList");

  if (compListEl) {
    compListEl.addEventListener("click", (e) => {  
  /* ───── toggle buttons (required / hideLabel / actions) ───── */
  const tog = e.target.closest(".toggle-btn");
  if (tog) {
    const card  = tog.closest(".component-card");
    const comp  = findCompByKey(formJSON.components, card.dataset.key);
    if (!comp) return;

    switch (tog.dataset.tog) {
      case "actions": {
        const parentArr = selectedFieldsetKey === "root"
          ? formJSON.components
          : findFieldsetByKey(formJSON.components, selectedFieldsetKey).components;
        const enable = !tog.classList.contains("on");
        toggleActionsBundle(parentArr, enable, comp);
        break;
      }
      case "required":
        comp.validate = comp.validate || {};
        comp.validate.required = !comp.validate.required;
        break;
      case "hideLabel":
        comp.hideLabel = !comp.hideLabel;
        break;
    }
    tog.classList.toggle("on");
    updatePreview();
    return;                           // ← we’re done, don’t fall through
  }

  /* ───── everything else: action buttons (edit, delete, …) ───── */
  const btn  = e.target.closest(".component-action-btn");
  if (!btn) return;
  const card = btn.closest(".component-card");
  const path = card.dataset.path;
  switch (btn.dataset.action) {
    case "conditional":  openConditionalModal(path); break;
    case "calc":         openCalcModal(path);        break;
    case "edit":         editComponent(path);        break;
    case "akey":openAnswerKeyModal(getComponentByPath(path));break;
    case "delete":       handleDelete(card, path);   break;
    case "moveto":       openMoveToModal(path);      break;
    case "wrap2":
    case "wrap3":
      wrapComponentInColumns(path, btn.dataset.action === "wrap2" ? 2 : 3);
      updatePreview();
      break;

    case "dtmode": {
      const comp = getComponentByPath(path);
      if (comp && (comp.type === "datetime" || comp.customType === "datetime")) {
        const newMode = btn.dataset.mode;          // "datetime" | "date" | "time"
        comp.__mode = newMode;
        tweakDateTimeMode(comp, newMode);          // ← helper already in file
        updatePreview();
      }
      break;
    }
    case "nummode": {                          // ⏣ NEW
      const comp = getComponentByPath(path);
      if (comp && (comp.type === "number" || comp.type === "currency")) {
        const newMode = btn.dataset.mode;      // "number" | "currency"
        if (newMode !== comp.type) {
          if (newMode === "currency") {
            comp.type      = "currency";
            comp.currency  = "USD";
            comp.delimiter = true;             // 1,234 style
          } else {
            comp.type = "number";
            delete comp.currency;
            delete comp.delimiter;
          }
        }
        updatePreview();                       // redraw + refresh “on” states
      }
      break;
    }
    case "rows3": {                       // ★ NEW
     const comp = getComponentByPath(path);
     if (comp && comp.type === "textarea") {
       comp.rows = (comp.rows === 3) ? 1 : 3;   // toggle 1 ↔ 3
       updatePreview();
     }
     break;
   }
  }
});
}


/*─────────────────────────────────────────────────────────
  Calculator (calculateValue) modal  –  v7
  • 4 basic operators
  • Edit-Grid aware   →  data.<gridKey>.reduce(...)
─────────────────────────────────────────────────────────*/
function openCalcModal(pathIndex) {

  /* —— modal plumbing —— */
  const ov  = createOverlay(1999);
  const dlg = document.getElementById("calcModal");
  dlg._currentOverlay = ov;
  dlg.classList.add("super-top");
  dlg.style.display = "block";

  const opRow    = dlg.querySelector("#opRow");
  const leftBox  = dlg.querySelector("#leftCards");
  const rightBox = dlg.querySelector("#rightCards");
  const saveBtn  = dlg.querySelector("#calcSaveBtn");

  enableModalKeys(dlg, saveBtn, closeCalcModal);

  /* —— target field must be Number / Currency —— */
  const target = getComponentByPath(pathIndex);
  if (!target || !["number","currency"].includes(target.type)) {
    showNotification("Only Number & Currency fields support calculations.");
    closeCalcModal();
    return;
  }

  /*──────────────────────────────────────────────────────
      Gather every *numeric* field, including those that
      live inside an Edit Grid.  Each entry becomes:
        { key:'gridKey.qty1' | 'qty1',  label:'Qty (Edit Grid)' }
  ──────────────────────────────────────────────────────*/
  const choices = [];
  (function crawl(arr, gridKey = null, gridLabel = "") {
    arr.forEach(c => {
      if (c.builderHidden) return;

      if (c.type === "editgrid") {
        crawl(c.components, c.key, c.label || c.key);  // dive in
        return;
      }

      if (["number","currency"].includes(c.type)) {
        choices.push({
          key   : gridKey ? `${gridKey}.${c.key}` : c.key,
          label : gridKey
                    ? `${c.label || c.key}  –  rows of “${gridLabel}”`
                    : (c.label || c.key)
        });
      }

      if (Array.isArray(c.components) && c.components.length) {
        crawl(c.components, gridKey, gridLabel);       // keep same grid context
      }
    });
  })(formJSON.components);

  /*—— helpers to build the pick-cards ——*/
  const makeCard = o => {
    const div = document.createElement("div");
    div.className   = "card";
    div.dataset.key = o.key;          // may contain a dot
    div.textContent = o.label;
    return div;
  };

  leftBox.innerHTML  = "";
  rightBox.innerHTML = "";
  choices.forEach(o => {
    leftBox .appendChild(makeCard(o));
    rightBox.appendChild(makeCard(o).cloneNode(true));
  });

  /* —— state —— */
  let chosenOp = null;     // '+', '-', '*', '/'
  let leftKey  = null;     // may contain a dot  gridKey.qty1
  let rightKey = null;

  /* —— operator buttons —— */
  opRow.onclick = e => {
    const btn = e.target.closest(".op-btn");
    if (!btn) return;
    opRow.querySelectorAll(".op-btn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    chosenOp = btn.dataset.op;
    validate();
  };

  /* —— card pick handlers —— */
  function hook(box, isLeft){
    box.addEventListener("click", e=>{
      const card = e.target.closest(".card");
      if (!card) return;
      box.querySelectorAll(".card").forEach(c=>c.classList.remove("selected"));
      card.classList.add("selected");
      if (isLeft) leftKey = card.dataset.key;
      else        rightKey = card.dataset.key;
      validate();
    });
  }
  hook(leftBox,  true);
  hook(rightBox, false);

  /* enable / disable Save */
  function validate(){ saveBtn.disabled = !(chosenOp && leftKey); }

  /*─────────────────────────────────────────────────────────────
     Safe number-coercion helper
     • plain  "qty1"                     → +String(data.qty1 …)
     • grid   "editgrid.qty1"            → data.editgrid.reduce(...)
  ─────────────────────────────────────────────────────────────*/
  const n = fullKey => {
    if (fullKey.includes(".")){                      // Edit Grid cell
      const [gKey,fKey] = fullKey.split(".");
      return `(${gKey}Arr => (${gKey}Arr||[]).reduce((t,r)=>` +
             `t + (+String(r.${fKey}||0).replace(/[^0-9.]/g,'')),0))` +
             `(data.${gKey})`;
    }
    return `+String(typeof data.${fullKey}==='undefined'?0:data.${fullKey})` +
           `.replace(/[^0-9.]/g,'')`;
  };

  /* —— recall an existing formula —— */
  (function recall(){
    const exp = String(target.calculateValue||"");
    if (!exp) return;

    /* operator */
    const op = (exp.match(/\s([+\-*/])\s/)||[])[1] || (exp.includes("= -")?'-':null);
    if (op){
      const btn = opRow.querySelector(`.op-btn[data-op="${op}"]`);
      if (btn){ btn.classList.add("selected"); chosenOp = op; }
    }

    /* operands */
    const keys = [...exp.matchAll(/data\.([A-Za-z0-9_.]+)/g)].map(m=>m[1]);
    if (keys[0]){
      const c = leftBox.querySelector(`[data-key="${keys[0]}"]`);
      if (c){ c.classList.add("selected"); leftKey = keys[0]; }
    }
    if (keys[1]){
      const c = rightBox.querySelector(`[data-key="${keys[1]}"]`);
      if (c){ c.classList.add("selected"); rightKey = keys[1]; }
    }
    validate();
  })();

  /* —— build & save expression —— */
  saveBtn.onclick = () => {
    const expr = rightKey
      ? `value = ${n(leftKey)} ${chosenOp} ${n(rightKey)}`
      : (chosenOp === '-'
           ? `value = -${n(leftKey)}`
           : `value = ${n(leftKey)}`);

    target.calculateValue = expr;
    closeCalcModal();
    updatePreview();
    showNotification("Formula saved!");
  };
}


function closeCalcModal(){
  const modal = document.getElementById("calcModal");
  disableModalKeys(modal);
  const numDefaultSection = document.getElementById('numberDefaultSection');
  const numDefaultInput   = document.getElementById('numberDefaultInput');
  if (!modal) return;
  modal.style.display = "none";
  modal.classList.remove("super-top");
  if (modal._currentOverlay){
    modal._currentOverlay.remove();
    modal._currentOverlay = null;
  }
}


function openAnswerKeyModal(grid){
  if (!grid) return;

  const quizFS   = findAncestorQuiz(selectedFieldsetKey);
  const dlg      = document.getElementById('answerKeyModal');
  const rowsBox  = dlg.querySelector('#akeyRows');
  rowsBox.innerHTML = '';

  grid.defaultValue.forEach((row,i)=>{
    const wrap = document.createElement('div');
    wrap.className = 'akey-row';

    /* label */
    const q    = document.createElement('span');
    q.textContent = row.question;
    q.className   = 'akey-q';
    wrap.appendChild(q);

    /* choices */
    const cmp = quizFS.components.find(c=>c.label===row.question);
    const opts = (cmp?.data?.values || cmp?.values || []).map(o=>o.label);

    const optsBox = document.createElement('div');
    optsBox.className = 'akey-opts';
    opts.forEach(lbl=>{
      const btn = document.createElement('button');
      btn.textContent = lbl;
      btn.className   = 'akey-opt';
      if (lbl === row.answer) btn.classList.add('sel');
      btn.onclick = () =>{
        wrap.querySelectorAll('.akey-opt').forEach(b=>b.classList.remove('sel'));
        btn.classList.add('sel');
        row.answer = lbl;                // update live
        
      };
      optsBox.appendChild(btn);
    });
    wrap.appendChild(optsBox);

    rowsBox.appendChild(wrap);
  });

  dlg.style.display = 'block';
const saveBtn = dlg.querySelector('#akeySave');
  if (saveBtn){
    saveBtn.onclick = () => {
      closeAnswerKeyModal();        // hides modal & runs updatePreview()
      showNotification('Answer-key saved!', 'info', 1500);
    };
  }

  // give Enter/Esc keyboard helpers the real Save button
  enableModalKeys(dlg, saveBtn, closeAnswerKeyModal);
  dlg.addEventListener('keydown', e=>{
  if(e.key==='Enter'||e.key==='Escape'){
    e.preventDefault(); closeAnswerKeyModal();
  }
});
showNotification('Answer-key updated','info',1200);
}




function closeAnswerKeyModal(){
  const dlg = document.getElementById('answerKeyModal');
  disableModalKeys(dlg);
  dlg.style.display = 'none';
  updatePreview(); 
}

window.closeAnswerKeyModal = closeAnswerKeyModal;


/* ---------------- Main component-list Sortable ---------------- */
Sortable.create(document.getElementById('componentList'), {
  group          : 'builder',
  direction      : 'vertical',
  animation      : 200,
  easing         : 'cubic-bezier(.165,.84,.44,1)',
  draggable      : '.component-card',
  fallbackOnBody : false,
  ghostClass     : 'drag-ghost',
  chosenClass    : 'drag-chosen',

  onEnd : evt => {
    const { item } = evt;
    const srcKey   = item.dataset.key;

    /* ── A · dropped on a dashed placeholder (inside a Columns row) ── */
    const ph = item.nextElementSibling;
    if (ph && ph.dataset.placeholder) {
      moveComponentIntoColumn(
        srcKey,
        ph.dataset.colOwner,
        Number(ph.dataset.colIndex),
        item.__json                // cached JSON from onRemove
      );
      delete item.__json;
      updatePreview();
      return;
    }

    /* ── B · dropped **inside** an existing columns-row (handled by the
            inner Sortable attached in attachInnerSortables) ─────────── */
    if (item.parentNode.classList.contains('columns-row')) {
      return;                       // inner Sortable already updated JSON
    }

    /* ── C · card dragged **out** of a column back into the main list ── */
    if (item.dataset.ownerKey) {
      const moved =
        item.__json ||
        removeComponentInColumn(item.dataset.ownerKey,
                                Number(item.dataset.col));

      if (moved) {
        const destArr = (selectedFieldsetKey === 'root')
          ? formJSON.components
          : findFieldsetByKey(formJSON.components,
                              selectedFieldsetKey).components;

        const newIdx = [...item.parentNode.children]
          .filter(el => !el.dataset.placeholder &&
                        !el.classList.contains('list-tail-dropzone'))
          .indexOf(item);

        destArr.splice(newIdx, 0, moved);
        delete item.__json;
      }

      item.removeAttribute('data-owner-key');
      item.removeAttribute('data-owner');
      item.removeAttribute('data-col');

      updatePreview();
      return;
    }

    /* ── D · plain up/down re-order inside the current list ─────────── */
    const siblings = [...evt.to.children]
      .filter(el =>
        !el.dataset.placeholder &&
        !el.classList.contains('list-tail-dropzone'));

    const oldIdx = evt.oldIndex;
    const newIdx = siblings.indexOf(item);

    if (oldIdx !== newIdx) {
      reorderComponents(oldIdx, newIdx);   // moves JSON + updatePreview()
    }
  }
});


  



  const listEl = document.getElementById('componentList');
  const tail   = document.createElement('div');
tail.className = 'list-tail-dropzone';   // purely CSS – see below
listEl.appendChild(tail)

  listEl.addEventListener('dblclick', e => {
    const labelEl = e.target.closest('.comp-label');
    if (!labelEl) return;                       // not a label
  
    const path = Number(labelEl.dataset.path);
    const comp = getComponentByPath(path);
    if (!comp) return;
  
    /* 1 ▸ turn the span into an editor  ---------------------------- */
    labelEl.contentEditable = true;
    labelEl.dataset.orig = comp.label;          // keep original text
    labelEl.focus();
  
    /* select everything so the user can start typing right away */
    document.getSelection().selectAllChildren(labelEl);
  
    /* 2 ▸ helper to finish editing -------------------------------- */
    function finish(save) {
      labelEl.contentEditable = false;
  
      if (save) {
        const newLabel = labelEl.textContent.trim();
        if (newLabel && newLabel !== comp.label) {
          comp.label = newLabel;
          if (comp.type === 'fieldset') comp.legend = newLabel;  // keep legend in sync
          comp.key = updateUniqueKey(comp.key, newLabel);
        } else {
          labelEl.textContent = comp.label;      // restore unchanged text
        }
      } else {
        labelEl.textContent = labelEl.dataset.orig; // Esc = cancel
      }
  
      delete labelEl.dataset.orig;
      updatePreview();                           // rerender list + JSON
    }
  
    /* 3 ▸ Enter = save — Esc / blur = cancel/save ----------------- */
    labelEl.addEventListener('keydown', ev => {
      if (ev.key === 'Enter'){          // ⏎ ➜ commit
        ev.preventDefault();            // stop <br> from being inserted
        finish(true);                   // save label
        labelEl.blur();                 // trigger blur-listener once
      } else if (ev.key === 'Escape'){  // Esc ➜ cancel
        ev.preventDefault();
        finish(false);                  // revert to original text
        labelEl.blur();
      }
    });
  
    labelEl.addEventListener('blur', () => finish(true),  { once:true });
  });
  


  // Initial refresh
  updatePreview();
  

  
  
  /* ---------- Import-JSON modal ---------- */
  const importBtn      = document.getElementById('importJsonBtn');
  const importModal    = document.getElementById('importJsonModal');
  const importTextarea = document.getElementById('importJsonTextarea');
  const importLoadBtn  = document.getElementById('importJsonLoadBtn');
  const overlay        = document.getElementById('overlay');

  function openImportJsonModal() {
    importTextarea.value = '';               // clear previous text
    importModal.style.display = 'block';
    overlay.style.display     = 'block';
  }
  function closeImportJsonModal() {
    importModal.style.display = 'none';
    overlay.style.display     = 'none';
  }

  if (importBtn) {
    importBtn.addEventListener('click', openImportJsonModal);
  }
  importLoadBtn.addEventListener('click', () => {
    try {
      const imported = JSON.parse(importTextarea.value.trim() || '{}');
  
      /* ----- CASE 1: full form JSON (has .components array) ----- */
      if (Array.isArray(imported.components)) {
        hideActionsBundles(imported.components);
        window.formJSON        = imported;
        selectedFieldsetKey    = 'root';
        window._usedKeys       = {};
        window._actionsCounter = 0;
        registerExistingKeys(formJSON.components);
  
        updatePreview();
        showNotification('JSON imported successfully!');
        return;                               // ← done
      }
  
      /* ----- CASE 2: single-component JSON ----------------------- */
      if (imported && typeof imported === 'object' && imported.type) {
        /* 1️⃣ – make sure its key is unique, but keep it if possible */
        if (imported.key && !window._usedKeys[imported.key]) {
          // key is unique – reserve it
          window._usedKeys[imported.key] = true;
        } else {
          // either no key or a duplicate → generate a fresh one
          imported.key = generateUniqueKey(imported.label || imported.type);
        }

        delete imported.builderHidden;
    
        formJSON.components.push(imported);
 
        registerExistingKeys([imported]);
 updatePreview();
 const qFs = findAncestorQuiz(selectedFieldsetKey);
 if (qFs && ['select','radio'].includes(imported.type)) {
   syncAnswerKeyRow(qFs, imported);
 }
        showNotification('Component added to the root grouping!');
        return;                               // ← done
      }
  
      /* ----- otherwise: invalid structure ------------------------ */
      throw new Error('JSON must be either a full form (with "components") or a single component object.');
  
    } catch (err) {
      console.error(err);
      showNotification('Invalid JSON: ' + err.message);
    } finally {
      closeImportJsonModal();
    }
  });

  function hideActionsBundles(components = []) {
    components.forEach(c => {
      // driver → anything that owns _actionsDriverKey
      if (c._actionsDriverKey) {
        // the wrapper field-set we auto-generated at build time
        const wrapper = components.find(x => x.key === c._actionsDriverKey);
        if (wrapper) wrapper.builderHidden = true;
      }
      // every follower that points back to a driver
      if (c.conditional &&
               /^actions\d*$/.test(c.conditional.when)) {   // example: actions, actions1 …
             c.builderHidden = true;
           }

      if (c.components && c.components.length) {
        hideActionsBundles(c.components);
      }
    });
  }

  window.closeImportJsonModal = closeImportJsonModal;
});


/* ========= Save-Template modal ========== */
const saveModal  = document.getElementById('saveTplModal');
const overlay    = document.getElementById('overlay');
const confirmBtn = document.getElementById('confirmSaveTplBtn');

/* close helper */
window.closeSaveTplModal = () => {
  saveModal.style.display = 'none';
  overlay.style.display   = 'none';
};

/* open helper – now shows the 2 note fields only */
function openSaveTplModal() {
  document.getElementById('implTxt').value   = '';
  document.getElementById('issuesTxt').value = '';

  saveModal.style.display = 'block';
  overlay.style.display   = 'block';
}

/* toolbar button → open modal */
document.getElementById('saveTemplateBtn')
        .addEventListener('click', openSaveTplModal);

/* final “Save” – POST form.json as a ZIP */
confirmBtn.addEventListener('click', async () => {
  const name  = tplNameInput.value.trim();          // send the typed name
  const clean = JSON.parse(JSON.stringify(
                 formJSON, (k,v)=>k==='builderHidden'?undefined:v));

  try {
    const r = await fetch('/api/templates', {
      method :'POST',
      headers:{ 'Content-Type':'application/json' },
      body   : JSON.stringify({ json: clean, name })
    });
    if (!r.ok) throw new Error(await r.text());
    closeSaveTplModal();
    showNotification('Template ZIP saved', 'info');      // toast, no emoji
  } catch (err) {
    showNotification('Save failed: ' + err.message, 'error');
  }
});



/* ---------------------------------------------------------------
   Small toast helper – use   showNotification('Saved', 'error')
   kind = info | warn | error   (default = 'info')
/* ------------------------------------------------------------------ */
(function () {
  const tray      = document.createElement('div');
  tray.id         = 'notifyTray';
  document.body.appendChild(tray);

  const DEFAULT_TTL = 2000;   // 2 s
  const FADE_MS     = 250;    // CSS transition time

  window.showNotification = function (msg, kind = 'info', ttl = DEFAULT_TTL) {
    const card = document.createElement('div');
    card.className = `notify-card ${kind}`;
    card.textContent = msg;
    card.style.setProperty('--ttl', `${ttl}ms`);  // drives shimmer length

    tray.appendChild(card);

    /* fade-in */
    requestAnimationFrame(() => card.classList.add('show'));

    /* fade-out after TTL */
    setTimeout(() => card.classList.remove('show'), ttl);

    /* remove after fade-out completes */
    card.addEventListener('transitionend', () => {
      if (!card.classList.contains('show')) card.remove();
    });
  };
})();
