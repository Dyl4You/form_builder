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

/**
* Return all sub-components recursively.
* (Removed all "columns" references entirely.)
*/
function getAllComponents(components) {
  let result = [];
  components.forEach(comp => {
    if (comp.key) {
      result.push(comp);
    }
    if (comp.components && comp.components.length > 0) {
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
  let targetArray;
  if (selectedFieldsetKey === "root") {
    targetArray = formJSON.components;
  } else {
    const fieldset = findFieldsetByKey(formJSON.components, selectedFieldsetKey);
    targetArray = fieldset ? fieldset.components : [];
  }
  const index = Number(path);
  targetArray.splice(index, 1);
  updatePreview();
}
