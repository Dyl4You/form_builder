/****************************************************
 * public/js/dataHelpers.js
 ****************************************************/

// The root JSON describing the form (now global)
window.formJSON = {
  label: "Grouping",
  key: "grouping",
  type: "fieldset",
  input: false,
  tableView: false,
  components: []
};

/* ----------------------------------------------------------
   2. if we just arrived from library.html, overwrite the
      stub with the stored JSON and clean the flag
----------------------------------------------------------*/
const cached = localStorage.getItem('importedForm');
if (cached) {
  try   { window.formJSON = JSON.parse(cached); }
  catch { console.warn('⚠️  could not parse importedForm'); }
  localStorage.removeItem('importedForm');
}

registerExistingKeys(window.formJSON.components)

// The currently selected fieldset key (default root)
let selectedFieldsetKey = "root";

// Track the currently selected component path
let currentSelectedComponentPath = null;

// Which component type is selected from the clickable "cards"
let selectedComponentType = null;

// Temporary holder for the component being edited
window._currentEditingComponent = null;

/**
 * Recursively flatten the component tree, returning only the components
 * that should count toward the “Total Components” counter.
 *
 *  • builderHidden          → always ignored
 *  • columns wrapper        → wrapper ignored, children traversed
 *  • compositeSingles set   → counted once, children NOT traversed
 */
function getAllComponents(arr = []) {
  const out = [];

  // Any composite control listed here is treated as ONE unit
  const compositeSingles = new Set([
    "address"          // street, city, province, postal code, country …
    // add more composite types here if needed
  ]);

  arr.forEach(comp => {
    if (comp.builderHidden) return;          // skip private helpers

    /* ── 1 ▸ Columns wrapper ───────────────────────────────────────── */
    if (comp.type === "columns") {
      comp.columns.forEach(col =>
        out.push(...getAllComponents(col.components || []))
      );
      return;                                // do NOT push the wrapper itself
    }

    /* ── 2 ▸ Every “normal” component counts once ─────────────────── */
    if (comp.key) out.push(comp);

    /* ── 3 ▸ Dive into children unless it’s a composite single ────── */
    if (
      Array.isArray(comp.components) &&
      comp.components.length &&
      !compositeSingles.has(comp.type)
    ) {
      out.push(...getAllComponents(comp.components));
    }
  });

  return out;
}

/**
 * Find a fieldset or editgrid by key, recursively.
 * We treat both "fieldset" and "editgrid" as containers.
 */
function findFieldsetByKey(components, key) {
  for (let comp of components) {
    if (['fieldset', 'editgrid', 'columns', 'quiz'].includes(comp.type) && comp.key === key) {
      return comp;
    }
    if (Array.isArray(comp.components) && comp.components.length) {
      const found = findFieldsetByKey(comp.components, key);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Remove a component from the current fieldset or from root.
 */
function removeComponentAtPath(path) {
  // 1 · locate source array & component
  const parentArray =
    selectedFieldsetKey === "root"
      ? window.formJSON.components
      : (findFieldsetByKey(window.formJSON.components, selectedFieldsetKey)?.components || []);

  const comp = parentArray[Number(path)];
  if (!comp) return;

  // 2 · remove its Actions bundle (if any)
  if (comp._actionsDriverKey) {
    const dKey = comp._actionsDriverKey;
    for (let i = parentArray.length - 1; i >= 0; i--) {
      const c = parentArray[i];
      if (c.key === dKey || c.conditional?.when === dKey) {
        parentArray.splice(i, 1);
      }
    }
  }

  // 3 · remove the component itself
  parentArray.splice(Number(path), 1);

  // 4 · tidy up driver numbering
  if (window.compactActionBundles) {
    window.compactActionBundles(parentArray);
  }

  updatePreview();
}

/**
 * Move a component (and its Actions bundle) into another fieldset (or root).
 */
function moveComponentToFieldset(pathIndex, targetKey) {
  // 1 · figure out the “from” and “to” arrays
  const fromArray =
    selectedFieldsetKey === "root"
      ? window.formJSON.components
      : (findFieldsetByKey(window.formJSON.components, selectedFieldsetKey)?.components || []);

  const toArray =
    targetKey === "root"
      ? window.formJSON.components
      : (findFieldsetByKey(window.formJSON.components, targetKey)?.components || []);

  const owner = fromArray[pathIndex];
  if (!owner) return;

  // 2 · collect owner + its Actions bundle
  const bundle = [owner];
  const indexMap = new Map([[owner, pathIndex]]);

  if (owner._actionsDriverKey) {
    const dKey = owner._actionsDriverKey;
    fromArray.forEach((c, i) => {
      if (c.key === dKey || c.conditional?.when === dKey) {
        bundle.push(c);
        indexMap.set(c, i);
      }
    });
    bundle.sort((a, b) => indexMap.get(a) - indexMap.get(b));
  }

  // 3 · remove the bundle from the source
  bundle.forEach(c => {
    const idx = fromArray.indexOf(c);
    if (idx !== -1) fromArray.splice(idx, 1);
  });

  // 4 · insert it into the destination
  toArray.push(...bundle);

  // 5 · tidy up the numbering of all Actions drivers
  if (window.compactActionBundles) {
    window.compactActionBundles(fromArray);
    if (fromArray !== toArray) window.compactActionBundles(toArray);
  }

  updatePreview();
}

/**
 * Register every existing key in the global '_usedKeys' registry.
 * This must run once on startup so that ensureGloballyUniqueKey() knows which
 * suffixes are already in play across the whole form.
 */
function registerExistingKeys(components) {
  components.forEach(c => {
    if (c.key) window._usedKeys[c.key] = true;
    if (Array.isArray(c.components) && c.components.length) {
      registerExistingKeys(c.components);
    }
    if (c.type === 'columns' && Array.isArray(c.columns)) {
            c.columns.forEach(col => {
              if (Array.isArray(col.components) && col.components.length) {
                registerExistingKeys(col.components);
              }
            });
          }
  });
}

/* ─── Quiz helper ────────────────────────────────────────── */
function syncAnswerKey(quizFS){
  const answerFS = quizFS.components.find(c => c.key.startsWith('answerKey'));
  if (!answerFS) return;

  /* collect every *question* inside the quiz (excluding helper bits) */
  const questions = quizFS.components.filter(c =>
    !c.builderHidden && ['selectboxes','radio','select'].includes(c.type));

  /* rebuild the answer-key panel */
  answerFS.components = questions.map(q => {
    /* clone options */
    const opts = (q.type === 'select')
                   ? (q.data?.values || [])
                   : (q.values       || []);

    return {
      label                : q.label || q.key,
      key                  : q.key + '_a',
      type                 : q.type,          // radio ↔ selectboxes stays
      inputType            : q.inputType || 'checkbox',
      inline               : q.inline || false,
      optionsLabelPosition : 'right',
      values               : opts.map(o => ({...o})),
      data                 : q.type==='select' ? { values: opts.map(o=>({...o})) } : undefined,
      tableView            : false
    };
  });
}
window.syncAnswerKey = syncAnswerKey;   // expose


// Immediately register all of formJSON's existing keys:
registerExistingKeys(window.formJSON.components);
