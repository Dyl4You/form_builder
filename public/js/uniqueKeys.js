/****************************************************
 * public/js/uniqueKeys.js
 ****************************************************/

// Keep track of used keys to ensure uniqueness:
const usedKeys = {};

/**
 * Given a base label (like "Name Field"), create a unique key
 * by removing special characters, lowercasing, then adding
 * a counter if it already exists.
 */
function generateUniqueKey(baseLabel) {
  const baseKey = baseLabel.toLowerCase().replace(/[^a-z0-9]/g, '');
  let uniqueKey = baseKey;
  let counter = 1;
  while (usedKeys[uniqueKey]) {
    uniqueKey = `${baseKey}${counter++}`;
  }
  usedKeys[uniqueKey] = true;
  return uniqueKey;
}

/**
 * Updates an old key by removing it from usedKeys
 * and calling generateUniqueKey(...) with a new label.
 */
function updateUniqueKey(oldKey, newLabel) {
  delete usedKeys[oldKey];
  return generateUniqueKey(newLabel);
}
window.generateUniqueKey = generateUniqueKey;
window.updateUniqueKey = updateUniqueKey;
