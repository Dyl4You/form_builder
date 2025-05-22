/****************************************************
 * public/js/mainFormBuilder.js
 ****************************************************/


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

/**
 * Gathers "containers" (both fieldsets and editgrids) from the form,
 * sets up fieldset selection, etc.
 */
function gatherFieldsets(components, fieldsets = []) {
  components.forEach(comp => {
    // If this is the special nested fieldset inside an Edit Grid, skip adding it
    const isNestedFieldset = comp.type === "fieldset" && comp.isEditGridChildFieldset;

    const isContainer = ['fieldset','editgrid','quiz'].includes(comp.type);  
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
        if (actions) actions.innerHTML = actionButtonsHTML(true);
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


function actionButtonsHTML(showColumn = true) {
  return `
    <button class="component-action-btn" data-action="delete" title="Delete">
      <i class="fa-solid fa-trash"></i>
    </button>
    <button class="component-action-btn" data-action="moveto" title="Move To">
      <i class="fa-solid fa-arrow-right-arrow-left"></i>
    </button>
    <button class="component-action-btn" data-action="edit"   title="Edit">
      <i class="fa-solid fa-pen"></i>
    </button>
    <button class="component-action-btn" data-action="conditional" title="Conditional">
      <i class="fa-solid fa-code-branch"></i>
    </button>
    ${
      showColumn
        ? `
          <button class="component-action-btn"
                  data-action="wrap2"
                  title="Wrap in 2 columns">
            <i class="fa-solid fa-columns"></i>
          </button>
          `
        : ""
    }
    <button class="component-action-btn" data-action="calc" title="Calculate Value">
      <i class="fa-solid fa-calculator"></i>
    </button>
  `;
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

  /* are we *inside* a Quiz field-set right now? */
  const parentQuizFS =
  selectedFieldsetKey !== 'root'
    ? findFieldsetByKey(formJSON.components, selectedFieldsetKey)
    : null;
const isQuiz = parentQuizFS && parentQuizFS.key.startsWith('quiz');

let html = "";

/* NEW – always inject the answer-board once when inside a quiz */
if (isQuiz) {
html += renderAnswerKeyBoard(parentQuizFS);
}

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
            ${actionButtonsHTML(true)
                .replace('data-action="calc"',
                         showCalc ? 'data-action="calc"'
                                  : 'style="display:none"')}
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
                <div class="component-actions">${actionButtonsHTML(false)}</div>
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
      if (c.type === 'fieldset' && c.key.startsWith('quiz')){
        syncAnswerKey(c);
      }
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

/**
 * Builds the clickable “answer key board” that sits inside a Quiz field-set.
 * Returns plain HTML so renderComponentCards() can inject it.
 */
function renderAnswerKeyBoard(quizFS) {
  const curPass   = (typeof quizFS.passMark === 'number' && !isNaN(quizFS.passMark))
                      ? quizFS.passMark : '';

  const savedKey  = quizFS.answerKey || {};            // previously chosen answers
  const children  = quizFS.components || [];           // all direct children

  // build the board
  let html = `
    <div class="answer-board">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
        <label>Pass&nbsp;Mark:&nbsp;</label>
        <input type="number"
               class="passmark-input"
               min="1"
               value="${curPass}"
               data-quiz="${quizFS.key}"
               style="width:5rem">
      </div>
      <hr>`;                                           // ——— spacer

  // one <div.answer-row> for every question component
  children.forEach(comp => {
    if (comp.builderHidden) return;
    if (!['select', 'radio', 'selectboxes'].includes(comp.type)) return;

    const qKey   = comp.key;
    const qLabel = comp.label || qKey;
    const opts   = (comp.type === 'select')
                     ? (comp.data?.values || [])
                     : (comp.values       || []);

    html += `<div class="answer-row" data-q="${qKey}">
               <strong>${qLabel}</strong>`;

    opts.forEach(o => {
      const on = savedKey[qKey]?.[o.value] ? ' on' : '';
      html += `<span class="pill${on}" data-val="${o.value}">${o.label}</span>`;
    });
    html += `</div>`;
  });

  html += `</div>`;
  return html;
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
  const comp = getComponentByPath(pathIndex);
  if (!comp) {
    return; // No notifications, just silently stop
  }
  window._currentEditingComponent = comp;

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
  if (comp.customType === "disclaimer" || comp.type === "content") {
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

  /* ---------- determine which type name the modal expects ---------- */
  const modalType =
        comp.customType ||
        (comp.type === "content" ? "disclaimer" : comp.type);

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
      actionsEnabled
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

      if ((comp.customType || comp.type) === "datetime") {
        comp.__mode = selectedDTMode;
        tweakDateTimeMode(comp, selectedDTMode);
      }

      const parentArray =
            (selectedFieldsetKey === 'root')
              ? formJSON.components
              : findFieldsetByKey(formJSON.components, selectedFieldsetKey)?.components || [];

      toggleActionsBundle(parentArray, actionsEnabled, comp);
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
    initialDTMode
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

  // «—— stray `modalType` definition was here – removed »

  // "Add Fieldset" button
  const addFieldsetBtn = document.getElementById("addFieldsetBtn");
  if (addFieldsetBtn) {
    addFieldsetBtn.addEventListener("click", () => {
      openLabelOptionsModal(
        (label, options, disclaimerText, surveyQuestions, surveyOptions, finalHideLabel, finalRows, finalRequired, selectedDTMode) => {
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

const typeContainer = document.getElementById("componentTypeContainer");
if (typeContainer) {
  /* ➊  render one card per type */
  typeContainer.innerHTML = componentTypes
    .map(t => `<div class="card" data-type="${t}">${_.startCase(t)}</div>`)
    .join("");

  /* ➋  single click-handler (no duplicates) */
  typeContainer.addEventListener("click", e => {
    const card = e.target.closest(".card");
    if (!card) return;

    const chosenType = card.dataset.type;

    /* visual feedback */
    typeContainer.querySelectorAll(".card").forEach(c => c.classList.toggle(
      "selected",
      c === card
    ));

    /* ---- instant blank Quiz shortcut --------------------------- */
    if (chosenType === "quiz") {
      const quizCmp = createComponent("quiz", "Quiz");
      const destArr = selectedFieldsetKey === "root"
        ? formJSON.components
        : findFieldsetByKey(formJSON.components, selectedFieldsetKey).components;
      destArr.push(quizCmp);
      updatePreview();
      return;
    }

    /* ---- block unsupported types inside Edit-Grid -------------- */
    const fs = findFieldsetByKey(formJSON.components, selectedFieldsetKey);
    if (fs && fs.type === "editgrid") {
      const banned = ["survey", "file", "fieldset", "editgrid", "quiz"];
      if (banned.includes(chosenType)) {
        card.classList.remove("selected");
        return;                         // quietly ignore
      }
    }

    /* ---- open the label/options modal -------------------------- */
    openLabelOptionsModal(
      (
        label, options, disclaimerText, sQ, sO,
        finalHideLabel, finalRequired, finalRows,
        selectedDTMode, styleOrDT, actionsEnabled
      ) => {

        /* decide the real component type (handles “choiceList” & “number” style buttons) */
        let typeToUse = chosenType;
        if (typeToUse === "choiceList") typeToUse = styleOrDT;   // select | radio | selectboxes
        if (typeToUse === "number")    typeToUse = styleOrDT;   // number | currency

        const cmp = createComponent(typeToUse, label, options || [], finalHideLabel);
        if (!cmp.validate) cmp.validate = {};
        cmp.validate.required = !!finalRequired;

        /* per-type tweaks (textarea rows, disclaimers, surveys, datetime, etc.) */
        if (typeToUse === "survey") {
          cmp.questions = ensureUniqueValues(sQ);
          cmp.values    = ensureUniqueValues(sO);
        }
        if (typeToUse === "disclaimer") {
          cmp.html        = disclaimerText.startsWith("<p")
            ? disclaimerText
            : `<p>${disclaimerText}</p>`;
          cmp.customType  = "disclaimer";
        }
        if (typeToUse === "textarea")  {
          cmp.rows          = finalRows || 1;
          cmp.labelWidth    = 30;
          cmp.labelMargin   = 3;
          cmp.autoExpand    = true;
          cmp.reportable    = true;
          cmp.tableView     = true;
        }
        if (typeToUse === "datetime") {
          cmp.__mode = selectedDTMode;
          tweakDateTimeMode(cmp, selectedDTMode);
        }

        /* place component in the current field-set (or root) */
        const destArr = selectedFieldsetKey === "root"
          ? formJSON.components
          : findFieldsetByKey(formJSON.components, selectedFieldsetKey).components;

        destArr.push(cmp);

        toggleActionsBundle(destArr, actionsEnabled, cmp);
        updatePreview();

        /* clear highlight */
        typeContainer.querySelectorAll(".card").forEach(c => c.classList.remove("selected"));
      },
      chosenType           // passes into modal to choose correct UI
    );
  });
}   //  <-- end if (typeContainer)


  document.getElementById('componentList').addEventListener('click', e => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
  
    const row  = pill.parentElement;                     // .answer-row
    const quiz = findFieldsetByKey(formJSON.components, selectedFieldsetKey);
    if (!quiz) return;
  
    /* 1 ▸ toggle UI */
    pill.classList.toggle('on');
  
    /* 2 ▸ rebuild the answer-key object & store on quiz.answerKey */
    const keyObj = {};
    row.parentElement.querySelectorAll('.answer-row').forEach(r => {
      const qKey = r.dataset.q;
      r.querySelectorAll('.pill.on').forEach(p => {
        keyObj[qKey] = keyObj[qKey] || {};
        keyObj[qKey][p.dataset.val] = true;
      });
    });
  
    quiz.answerKey = keyObj;          // ← single source of truth
  
    updatePreview();                  // keep JSON panel fresh
  });

/* delegated listener – commits pass-mark on change */
document.getElementById('componentList').addEventListener('change', e => {
  const inp = e.target.closest('.passmark-input');
  if (!inp) return;

  const quiz = findCompByKey(formJSON.components, inp.dataset.quiz);
  if (quiz) {
    const n = Number(inp.value);
    quiz.passMark = isNaN(n) ? undefined : n;
    updatePreview();                // reflect in JSON preview
  }
});
  

  // Listen for actions on each component card (Move Up, Down, Conditional, Edit, Delete)
  const compListEl = document.getElementById("componentList");

  if (compListEl) {
    compListEl.addEventListener("click", (e) => {
      const btn  = e.target.closest(".component-action-btn");
      if (!btn) return;
  
      const card = btn.closest(".component-card");
      const path = card.getAttribute("data-path");
      const act  = btn.dataset.action;
  
      switch (act) {
  
        case "conditional":  openConditionalModal(path); break;
        case "calc":        openCalcModal(path);      break;
        case "edit":         editComponent(path);        break;
        case "delete":
          if (card.dataset.col){                     // deleting inside a Columns row
            /* 1 - take B out of the column … */
            const removed = removeComponentInColumn(
              card.dataset.ownerKey,
              Number(card.dataset.col),
              /* pruneAfter */ false                 // keep the column shell in place
            );
        
            /* 2 - …and park it directly UNDER the Columns wrapper */
            if (removed){
              const destArr = (selectedFieldsetKey === 'root')
                ? formJSON.components
                : findFieldsetByKey(formJSON.components, selectedFieldsetKey).components;
        
              const shellIdx = destArr.findIndex(c => c.key === card.dataset.ownerKey);
              destArr.splice(shellIdx + 1, 0, removed);    // insert just after shell
            }
          } else {                                       // regular, non-column delete
            removeComponentAtPath(path);
          }
        
          updatePreview();                               // redraw lists + JSON
          break;
        case "moveto":       openMoveToModal(path);      break;
  
        /* instant two/three-column wrap */
        case "wrap2":
        case "wrap3": {
          const cols = act === "wrap2" ? 2 : 3;
          wrapComponentInColumns(path, cols);
          updatePreview();              // refresh list & counter
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
  if (!modal) return;
  modal.style.display = "none";
  modal.classList.remove("super-top");
  if (modal._currentOverlay){
    modal._currentOverlay.remove();
    modal._currentOverlay = null;
  }
}


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
  

    /* ========= Save‑Template modal ========== */
const saveModal     = document.getElementById('saveTplModal');
const folderRow     = document.getElementById('folderPickRow');
const nameInput     = document.getElementById('tplNameInput');
const confirmBtn    = document.getElementById('confirmSaveTplBtn');

window.closeSaveTplModal = () => {
  saveModal.style.display = 'none';
  document.getElementById('overlay').style.display = 'none';
};

async function openSaveTplModal(isEdit){
  nameInput.value = isEdit ? (window._currentTplName || '') : '';
  folderRow.innerHTML = '<div class="card">Loading…</div>';

  /* fetch existing folders */
  const folders = await fetch('/api/templates').then(r=>r.json());
  if (!folders.includes('')) {
    folders.unshift('');
  }
  folderRow.innerHTML = '';
  folders.forEach(f=>{
    const card = document.createElement('div');
    card.className = 'card';
    card.textContent = f || '(root)';
    card.onclick = ()=> {
      [...folderRow.children].forEach(c=>c.classList.remove('selected'));
      card.classList.add('selected');
    };
    folderRow.appendChild(card);

    /* pre‑select current folder when editing */
    if (isEdit && f === window._currentTplFolder) card.classList.add('selected');
  });

  saveModal.style.display = 'block';
  document.getElementById('overlay').style.display = 'block';
}

/* hijack the OLD save button */
document.getElementById('saveTemplateBtn')
        .addEventListener('click', () => {
  const editing = Boolean(localStorage.getItem('importedId'));  // true if we loaded a file from library.html
  openSaveTplModal(editing);      // just shows your modal
});

/* final save */
confirmBtn.addEventListener('click', async () => {
  const name = nameInput.value.trim();
  const selCard = folderRow.querySelector('.card.selected');
  if (!name || !selCard){
    alert('Pick a name and a folder');
    return;
  }
  const folder = selCard.textContent === '(root)' ? '' : selCard.textContent;

  const clean = JSON.parse(JSON.stringify(formJSON, (k,v)=>
                   k==='builderHidden'?undefined:v));
  const editingId = localStorage.getItem('importedId')

  /* POST for new OR edit (the templates.js route inserts duplicate names anyway) */
  if (editingId) {
       /* ------------  EDIT  →  PUT  ------------ */
       const r = await fetch(`/api/templates/${editingId}`, {
            method :'PUT',
            headers:{'Content-Type':'application/json'},
            body   : JSON.stringify({ json: clean })
          });
          if (!r.ok) {
            alert(await r.text() || 'Save failed');
            return;                         // ⬅️ don’t close modal / clear markers
          }
     } else {
       /* ------------  NEW   →  POST ------------ */
       const r = await fetch('/api/templates', {
         method :'POST',
         headers:{'Content-Type':'application/json'},
         body   : JSON.stringify({ name, folder, json: clean })
       });
       if (!r.ok) {
            alert(await r.text() || 'Save failed');
            return;
          }
     }

     closeSaveTplModal();

     /* wipe all edit markers */
     localStorage.removeItem('importedForm');
     localStorage.removeItem('importedId');
     localStorage.removeItem('importedName');
     localStorage.removeItem('importedFolder');
   
     /* jump back to the library */
     location.href = '/';
   });

    


/* helper that actually downloads + loads */
async function loadTemplate(id) {
  try {
    const buf   = await fetch(`/api/templates/${id}/download`).then(r => r.arrayBuffer());
    const zip   = await JSZip.loadAsync(buf);
    const form  = await zip.file('form.json').async('string');

    window.formJSON = JSON.parse(form);
    selectedFieldsetKey = 'root';
    window._usedKeys    = {};
    registerExistingKeys(formJSON.components);
    updatePreview();
    alert('✅ template loaded!');
  } catch (err) {
    alert('Load failed: ' + err.message);
  }
}



  
  
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

