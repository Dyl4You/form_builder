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
   * Return all sub-components recursively, including those in columns.
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
      if (comp.type === "columns" && comp.columns && comp.columns.length > 0) {
        comp.columns.forEach(col => {
          if (col.components && col.components.length > 0) {
            result = result.concat(getAllComponents(col.components));
          }
        });
      }
    });
    return result;
  }
  
  /**
   * Find a fieldset by key, recursively.
   */
  function findFieldsetByKey(components, key) {
    for (let comp of components) {
      if (comp.type === "fieldset" && comp.key === key) {
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
  
  /**
   * Find a columns component by key, recursively.
   */
  function findColumnsByKey(components, columnsKey) {
    for (let comp of components) {
        console.log("Checking Component:", comp.key, comp.type); // Add this
        if (comp.type === 'columns' && comp.key === columnsKey) {
            return comp;
        }
        if (comp.components && comp.components.length > 0) {
            const found = findColumnsByKey(comp.components, columnsKey);
            if (found) return found;
        }
        if (comp.type === 'columns' && comp.columns) {
            for (let col of comp.columns) {
                if (col.components && col.components.length > 0) {
                    const foundCol = findColumnsByKey(col.components, columnsKey);
                    if (foundCol) return foundCol;
                }
            }
        }
    }
    return null;
}

  