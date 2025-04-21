/****************************************************
 * public/js/uniqueKeys.js
 ****************************************************/

// ----------------------------------------------------
// ONE global registry that every file & module shares
// ----------------------------------------------------
window._usedKeys = window._usedKeys || {};   // single source of truth

/**
 * Generate a key that is guaranteed to be unique for the
 * lifetime of the editor session.
 *
 * The algorithm:
 *   1. slug‑ify the label (lower‑case, alphanumerics only)
 *   2. if already taken, append an incrementing number
 */
function generateUniqueKey(label = "") {
  const base = label.toLowerCase().replace(/[^a-z0-9]/g, "");
  let   key  = base || "key";     // fallback in the rare case label → ""
  let   i    = 1;
  while (window._usedKeys[key]) key = `${base}${i++}`;
  window._usedKeys[key] = true;
  return key;
}

function ensureGloballyUniqueKey(base, preferredDigits = '') {
  // first try the pretty version (base + preferredDigits)
  let candidate = base + preferredDigits;
  if (!window._usedKeys[candidate]) return candidate;

  // otherwise fall back to generateUniqueKey, which keeps counting
  return generateUniqueKey(base);      // ← already registers in _usedKeys
}
window.ensureGloballyUniqueKey = ensureGloballyUniqueKey;

/**
 * Re‑generate the key when the component’s label changes.
 * Removes the old key from the registry first so it can be
 * re‑used elsewhere later.
 */
function updateUniqueKey(oldKey, newLabel) {
  if (oldKey) delete window._usedKeys[oldKey];
  return generateUniqueKey(newLabel);
}

// Expose helpers globally so every script picks up the *same* ones
window.generateUniqueKey = generateUniqueKey;
window.updateUniqueKey   = updateUniqueKey;