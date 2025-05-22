// public/js/uniqueKeys.js
// ----------------------------------------------------
// ONE global registry that every file & module shares
// ----------------------------------------------------
window._usedKeys = window._usedKeys || {};

/**
 * Slug‑ify and then, if needed, append a counter so that
 * every key you hand out is unique for this session.
 */
function generateUniqueKey(label = "") {
  const base = label.toLowerCase().replace(/[^a-z0-9]/g, "");
  let   key  = base || "key";    // fallback
  let   i    = 1;
  while (window._usedKeys[key]) {
    key = `${base}${i++}`;
  }
  window._usedKeys[key] = true;
  return key;
}

/**
 * Try “base+preferredDigits” first; if that’s already
 * been used, fall back to generateUniqueKey(base).
 */
function ensureGloballyUniqueKey(base, preferredDigits = "") {
  const candidate = base + preferredDigits;
  if (!window._usedKeys[candidate]) {
    window._usedKeys[candidate] = true;
    return candidate;
  }
  return generateUniqueKey(base);
}

/**
 * If you ever rename a component, delete the oldKey
 * from the registry so it can be re‑used.
 */
function updateUniqueKey(oldKey, newLabel) {
  if (oldKey) {
    delete window._usedKeys[oldKey];
  }
  return generateUniqueKey(newLabel);
}

// Expose them everywhere else
window.generateUniqueKey      = generateUniqueKey;
window.ensureGloballyUniqueKey = ensureGloballyUniqueKey;
window.updateUniqueKey        = updateUniqueKey;
