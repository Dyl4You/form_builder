/****************************************************
 * public/js/dataHelpers.js
 ****************************************************/

// The root JSON describing the form
let formJSON = {
  label: "Grouping",
  key: "grouping",
  type: "fieldset",
  input: false,
  tableView: false,
  components: []
};

// The currently selected fieldset key (default root)
let selectedFieldsetKey = "root";

// Track the currently selected component path
let currentSelectedComponentPath = null;

// Which component type is selected from the clickable "cards"
let selectedComponentType = null;

window._currentEditingComponent = null;

/**
* Return all sub-components recursively.
* (Removed all "columns" references entirely.)
*/
function getAllComponents(components) {
  let result = [];
  components.forEach(comp => {
    if (comp.builderHidden) return;
    if (comp.key) {
      result.push(comp);           // count the component itself
    }

    /* ★ Skip diving into the built‑in fields of an Address component */
    const skipDrillDown = comp.type === 'address';

    if (!skipDrillDown && comp.components && comp.components.length > 0) {
      result = result.concat(getAllComponents(comp.components));
    }
  });
  return result;
}


/**
* Find a fieldset or editgrid by key, recursively.
* We treat both "fieldset" and "editgrid" as containers.
*/
function findFieldsetByKey(components, key) {
  for (let comp of components) {
    if ((comp.type === "fieldset" || comp.type === "editgrid") && comp.key === key) {
      return comp;
    }
    if (comp.components && comp.components.length > 0) {
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
  /* ---------- 1 · locate source array & component ---------------- */
  const parentArray =
        (selectedFieldsetKey === "root")
          ? formJSON.components
          : findFieldsetByKey(formJSON.components, selectedFieldsetKey)?.components || [];

  const comp = parentArray[Number(path)];
  if (!comp) return;                                   // nothing to delete

  /* ---------- 2 · remove its Actions bundle (if any) ------------- */
  if (comp._actionsDriverKey) {
    const dKey = comp._actionsDriverKey;

    // driver + dependents
    for (let i = parentArray.length - 1; i >= 0; i--) {
      const c = parentArray[i];
      if (
        c.key === dKey ||                  // the driver itself
        c.conditional?.when === dKey       // comments / photos / tasks FS
      ) {
        parentArray.splice(i, 1);
      }
    }
  }

  /* ---------- 3 · finally remove the component itself ------------ */
  parentArray.splice(Number(path), 1);

  /* ---------- 4 · tidy up driver numbering ----------------------- */
  if (window.compactActionBundles) compactActionBundles(parentArray);

  updatePreview();                                      // refresh UI
}



function moveComponentToFieldset(pathIndex, targetKey) {
  /* ---------- 1 · figure out the “from” and “to” arrays ---------- */
  const fromArray =
        (selectedFieldsetKey === "root")
          ? formJSON.components
          : findFieldsetByKey(formJSON.components, selectedFieldsetKey)?.components || [];

  const toArray =
        (targetKey === "root")
          ? formJSON.components
          : findFieldsetByKey(formJSON.components, targetKey)?.components || [];

  const owner = fromArray[pathIndex];
  if (!owner) return;                               // nothing to move

  /* ---------- 2 · collect owner + its Actions bundle -------------- */
  const bundle   = [owner];
  const indexMap = new Map([[owner, pathIndex]]);   // remember original order

  if (owner._actionsDriverKey) {
    const dKey = owner._actionsDriverKey;

    fromArray.forEach((c, i) => {
      if (c.key === dKey || c.conditional?.when === dKey) {
        bundle.push(c);
        indexMap.set(c, i);
      }
    });

    // keep original order inside the bundle
    bundle.sort((a, b) => indexMap.get(a) - indexMap.get(b));
  }

  /* ---------- 3 · remove the bundle from the source --------------- */
  bundle.forEach(c => {
    const idx = fromArray.indexOf(c);
    if (idx !== -1) fromArray.splice(idx, 1);
  });

  /* ---------- 4 · insert it into the destination ------------------ */
  toArray.push(...bundle);

  /* ---------- 5 · tidy up the numbering of all Actions drivers ---- */
  if (window.compactActionBundles) {
    compactActionBundles(fromArray);
    if (fromArray !== toArray) compactActionBundles(toArray);
  }

  updatePreview();                                     // refresh UI
}



function registerExistingKeys(components) {
  components.forEach(c => {
    if (c.key)   usedKeys[c.key] = true;   // <-- uses the global map
    if (Array.isArray(c.components) && c.components.length) {
      registerExistingKeys(c.components);
    }
  });
}

/* call it as soon as formJSON is created                       */
registerExistingKeys(formJSON.components);