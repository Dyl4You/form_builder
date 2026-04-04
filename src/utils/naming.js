function stripUnicodeSymbols(value = '') {
  const text = String(value ?? '');
  try {
    return text.replace(new RegExp('\\p{S}+', 'gu'), ' ');
  } catch {
    return text;
  }
}

function asciiTokens(value = '') {
  let text = stripUnicodeSymbols(value);

  if (typeof text.normalize === 'function') {
    text = text.normalize('NFKD');
  }

  return text
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\x7F]/g, ' ')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function lowerCamelFromTokens(tokens = []) {
  return tokens
    .map((token, index) => {
      const lower = String(token || '').toLowerCase();
      if (!lower) return '';
      if (index === 0) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
}

const TITLE_CASE_MINOR_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'en', 'for', 'if',
  'in', 'nor', 'of', 'on', 'or', 'per', 'the', 'to', 'via'
]);
const SPECIAL_TITLE_TOKENS = new Map([
  ['AED', 'AED'],
  ['API', 'API'],
  ['CAD', 'CAD'],
  ['CPR', 'CPR'],
  ['CSA', 'CSA'],
  ['DOB', 'DOB'],
  ['GPS', 'GPS'],
  ['H2S', 'H2S'],
  ['HSE', 'HSE'],
  ['ID', 'ID'],
  ['IDS', 'IDs'],
  ['JHA', 'JHA'],
  ['JSA', 'JSA'],
  ['MSDS', 'MSDS'],
  ['N/A', 'N/A'],
  ['OHS', 'OHS'],
  ['PDF', 'PDF'],
  ['PPE', 'PPE'],
  ['SDS', 'SDS'],
  ['SIN', 'SIN'],
  ['SOP', 'SOP'],
  ['SWP', 'SWP'],
  ['TDG', 'TDG'],
  ['TSSA', 'TSSA'],
  ['UV', 'UV'],
  ['WHMIS', 'WHMIS'],
  ['WSIB', 'WSIB']
]);

function formatAllCapsTitleCore(core = '', { isEdgeWord = false } = {}) {
  const specialCore = SPECIAL_TITLE_TOKENS.get(core.toUpperCase());
  if (specialCore) {
    return specialCore;
  }

  if (/[A-Z]/.test(core) && /\d/.test(core)) {
    return core;
  }

  if (!core.includes('-') && !core.includes('/')) {
    const lowerCore = core.toLowerCase();
    if (!isEdgeWord && TITLE_CASE_MINOR_WORDS.has(lowerCore)) {
      return lowerCore;
    }
    return lowerCore.charAt(0).toUpperCase() + lowerCore.slice(1);
  }

  return core
    .split(/([/-])/)
    .map(part => {
      if (part === '-' || part === '/') return part;
      const specialPart = SPECIAL_TITLE_TOKENS.get(part.toUpperCase());
      if (specialPart) {
        return specialPart;
      }
      if (/[A-Z]/.test(part) && /\d/.test(part)) {
        return part;
      }
      const lowerPart = part.toLowerCase();
      return lowerPart.charAt(0).toUpperCase() + lowerPart.slice(1);
    })
    .join('');
}

function normalizeAllCapsTitle(value = '') {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || !/[A-Z]/.test(trimmed) || /[a-z]/.test(trimmed)) {
    return trimmed;
  }

  const words = trimmed.split(/\s+/);
  return words
    .map((word, index) => {
      const match = word.match(/^([^A-Za-z0-9]*)([A-Za-z0-9][A-Za-z0-9'/-]*)([^A-Za-z0-9]*)$/);
      if (!match) return word;

      const [, prefix, core, suffix] = match;
      const formattedCore = formatAllCapsTitleCore(core, {
        isEdgeWord: index === 0 || index === words.length - 1
      });

      return `${prefix}${formattedCore}${suffix}`;
    })
    .join(' ');
}

function normalizeComponentLabel(value = '', componentType = '') {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return trimmed;
  return normalizeAllCapsTitle(trimmed);
}

function sanitizeIdentifier(value = '', fallback = 'key', { allowLeadingDigit = false } = {}) {
  const primary = lowerCamelFromTokens(asciiTokens(value));
  const fallbackBase = lowerCamelFromTokens(asciiTokens(fallback))
    || (allowLeadingDigit ? 'option' : 'key');

  let out = primary || fallbackBase;
  if (!out) {
    return allowLeadingDigit ? 'option' : 'key';
  }

  if (!allowLeadingDigit && /^[0-9]/.test(out)) {
    out = `${fallbackBase}${out.charAt(0).toUpperCase()}${out.slice(1)}`;
  }

  return out || fallbackBase || (allowLeadingDigit ? 'option' : 'key');
}

function normalizeLowerCamelCase(value = '', fallback = 'key') {
  return sanitizeIdentifier(value, fallback, { allowLeadingDigit: false });
}

function normalizeOptionValue(value = '', fallback = 'option') {
  return sanitizeIdentifier(value, fallback, { allowLeadingDigit: true });
}

function makeUniqueWithRegistry(seed, registry, fallback, normalizeFn) {
  const base = normalizeFn(seed, fallback);
  let value = base;
  let suffix = 1;

  while (registry.has(value)) {
    value = `${base}${suffix++}`;
  }

  return value;
}

function makeUniqueLowerCamelCase(value, registry, fallback = 'key') {
  return makeUniqueWithRegistry(value, registry, fallback, normalizeLowerCamelCase);
}

function makeUniqueOptionValue(value, registry, fallback = 'option') {
  return makeUniqueWithRegistry(value, registry, fallback, normalizeOptionValue);
}

module.exports = {
  asciiTokens,
  lowerCamelFromTokens,
  normalizeAllCapsTitle,
  normalizeComponentLabel,
  sanitizeIdentifier,
  normalizeLowerCamelCase,
  normalizeOptionValue,
  makeUniqueLowerCamelCase,
  makeUniqueOptionValue
};
