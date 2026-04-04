const DISCLAIMER_IMAGE_HEADER_LINE = /^(?:disclaimer|notice|important|terms(?: and conditions)?|warning|acknowledg(?:e)?ment)$/i;
const DISCLAIMER_OCR_BULLET_CHARS = '•●▪■□◦○·∙⋅‣⁃◘◙◉⚫⚪▫⦁◆◇◻◽«»‹›¬¢＋';
const DISCLAIMER_BULLET_SYMBOL_CLASS = `[+\\-*${DISCLAIMER_OCR_BULLET_CHARS}]`;
const DISCLAIMER_BULLET_PREFIX_RE = new RegExp(
  `^(?:(?:${DISCLAIMER_BULLET_SYMBOL_CLASS})\\s*|(?:\\(?\\d{1,3}\\)?|[A-Za-z])(?:[.)]|[-:])\\s+)`,
  'u'
);
const DISCLAIMER_INLINE_BULLET_SPLIT_RE = new RegExp(
  `\\s+(?=${DISCLAIMER_BULLET_SYMBOL_CLASS})`,
  'gu'
);
const DISCLAIMER_ALLOWED_HTML_TAGS = new Set([
  'p', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'br'
]);

function normalizeDisclaimerTextFragment(rawText) {
  return String(rawText || '')
    .replace(/\u00A0/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/^[|¦]\s*(?=[A-Za-z])/u, 'I ')
    .replace(/(^|\n)\s*[|¦]\s*(?=[A-Za-z])/gu, '$1I ')
    .replace(/>\s*[|¦]\s*(?=[A-Za-z])/gu, '>I ')
    .replace(/([.?!])\s+[|¦]\s*(?=[A-Za-z])/gu, '$1 I ')
    .replace(/([.?!])<\/(p|li|td|th)>\s*<(p|li|td|th)>\s*[|¦]\s*(?=[A-Za-z])/giu, '$1</$2><$3>I ')
    .replace(/([.?!])\s*\|\s*(?=[A-Za-z])/gu, '$1 I ');
}

function normalizeDisclaimerCandidate(rawLine) {
  const line = normalizeDisclaimerTextFragment(rawLine)
    .replace(/\s+/g, ' ')
    .trim();

  if (!line) return '';
  if (!/[A-Za-z0-9]/.test(line)) return '';
  if (DISCLAIMER_IMAGE_HEADER_LINE.test(line)) return '';

  return line;
}

function splitDisclaimerCandidateLine(rawLine) {
  const line = String(rawLine || '').replace(/\s+/g, ' ').trim();
  if (!line) return [];

  const parts = line.split(DISCLAIMER_INLINE_BULLET_SPLIT_RE);
  return parts.length ? parts : [line];
}

function isBulletLikeDisclaimerLine(line) {
  return DISCLAIMER_BULLET_PREFIX_RE.test(String(line || '').trim());
}

function stripDisclaimerTrailingColon(line) {
  return String(line || '').replace(/:\s*$/, '').trim();
}

function stripDisclaimerBulletPrefix(line) {
  return String(line || '').replace(DISCLAIMER_BULLET_PREFIX_RE, '').trim();
}

function isPotentialDisclaimerHeading(line) {
  const text = stripDisclaimerTrailingColon(line);
  if (!text) return false;
  if (isBulletLikeDisclaimerLine(text)) return false;
  if (/[.?!]$/.test(text)) return false;
  if (text.length > 60) return false;

  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 6) return false;

  const alphaWords = words.filter(word => /[A-Za-z]/.test(word));
  if (!alphaWords.length) return false;

  const headingLikeWords = alphaWords.filter(word =>
    /^[A-Z][A-Za-z0-9/-]*$/.test(word)
    || /^[A-Z]{2,}$/.test(word)
    || /^(?:and|or|of|to|for|in|on|the|with|without|by)$/i.test(word)
  );

  return headingLikeWords.length >= Math.max(1, Math.ceil(alphaWords.length * 0.7));
}

function shouldContinueDisclaimerListItem(previousLine, nextLine) {
  const prev = String(previousLine || '').trim();
  const next = String(nextLine || '').trim();
  if (!prev || !next) return false;
  if (/^[a-z(]/.test(next)) return true;
  if (/[,:;/-]$/.test(prev)) return true;
  if (/\b(?:and|or|to|of|for|with|without|from|by|in|on)$/.test(prev.toLowerCase())) return true;
  if (!/[.?!]$/.test(prev) && next.length <= 48) return true;
  return false;
}

function shouldStartNewDisclaimerParagraph(previousLine, nextLine) {
  const prev = String(previousLine || '').trim();
  const next = String(nextLine || '').trim();
  if (!prev || !next) return false;
  if (!/[.?!]$/.test(prev)) return false;
  if (!/^[A-Z]/.test(next)) return false;
  return true;
}

function cleanDisclaimerBlock(block) {
  return normalizeDisclaimerTextFragment(block)
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

function extractDisclaimerBlocksFromRawText(rawText) {
  const lines = String(rawText || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .flatMap(splitDisclaimerCandidateLine)
    .map(normalizeDisclaimerCandidate);

  const blocks = [];
  let paragraphLines = [];
  let currentListItem = [];
  let listItems = [];

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    const block = cleanDisclaimerBlock(paragraphLines.join(' '));
    if (block) blocks.push(block);
    paragraphLines = [];
  };

  const flushListItem = () => {
    if (!currentListItem.length) return;
    const item = cleanDisclaimerBlock(currentListItem.join(' '));
    if (item) listItems.push(item);
    currentListItem = [];
  };

  const flushList = () => {
    flushListItem();
    if (!listItems.length) return;
    listItems.forEach(item => {
      blocks.push(`• ${item}`);
    });
    listItems = [];
  };

  lines.forEach(line => {
    if (!line) {
      flushParagraph();
      flushList();
      return;
    }

    if (isPotentialDisclaimerHeading(line)) {
      flushParagraph();
      flushList();
      blocks.push(stripDisclaimerTrailingColon(line));
      return;
    }

    if (isBulletLikeDisclaimerLine(line)) {
      flushParagraph();
      flushListItem();
      currentListItem.push(stripDisclaimerBulletPrefix(line));
      return;
    }

    if (currentListItem.length) {
      if (shouldContinueDisclaimerListItem(currentListItem[currentListItem.length - 1], line)) {
        currentListItem.push(line);
        return;
      }

      flushList();
    }

    if (paragraphLines.length && shouldStartNewDisclaimerParagraph(paragraphLines[paragraphLines.length - 1], line)) {
      flushParagraph();
    }

    paragraphLines.push(line);
  });

  flushParagraph();
  flushList();

  return blocks.slice(0, 20);
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildDisclaimerHtml(blocks = []) {
  const safeBlocks = Array.isArray(blocks)
    ? blocks.map(cleanDisclaimerBlock).filter(Boolean)
    : [];

  if (!safeBlocks.length) return '';

  const html = [];
  let listItems = [];

  const flushList = () => {
    if (!listItems.length) return;
    html.push(`<ul>${listItems.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`);
    listItems = [];
  };

  safeBlocks.forEach(block => {
    if (isBulletLikeDisclaimerLine(block)) {
      listItems.push(stripDisclaimerBulletPrefix(block));
      return;
    }

    flushList();

    if (isPotentialDisclaimerHeading(block)) {
      html.push(`<p><strong>${escapeHtml(stripDisclaimerTrailingColon(block))}</strong></p>`);
      return;
    }

    html.push(`<p>${escapeHtml(block)}</p>`);
  });

  flushList();

  return html.join('');
}

function sanitizeDisclaimerVisionHtml(rawHtml) {
  let html = String(rawHtml || '')
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  if (!html) return '';

  html = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?(?:html|body)[^>]*>/gi, '')
    .replace(/\s(?:on[a-z]+|style|class|id|width|height|border|cellpadding|cellspacing)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  html = html.replace(/<(\/?)([a-z0-9]+)([^>]*)>/gi, (match, slash, rawTag, rawAttrs = '') => {
    const tag = String(rawTag || '').toLowerCase();
    if (!DISCLAIMER_ALLOWED_HTML_TAGS.has(tag)) return '';

    if (slash) {
      return `</${tag === 'b' ? 'strong' : tag === 'i' ? 'em' : tag}>`;
    }

    const normalizedTag = tag === 'b' ? 'strong' : tag === 'i' ? 'em' : tag;
    if (normalizedTag === 'br') return '<br>';

    const safeAttrs = [];
    if (normalizedTag === 'th' || normalizedTag === 'td') {
      const colspan = rawAttrs.match(/\bcolspan\s*=\s*(?:"(\d{1,2})"|'(\d{1,2})'|(\d{1,2}))/i);
      const rowspan = rawAttrs.match(/\browspan\s*=\s*(?:"(\d{1,2})"|'(\d{1,2})'|(\d{1,2}))/i);
      if (colspan) {
        const value = Number(colspan[1] || colspan[2] || colspan[3]);
        if (Number.isInteger(value) && value > 1 && value <= 24) {
          safeAttrs.push(` colspan="${value}"`);
        }
      }
      if (rowspan) {
        const value = Number(rowspan[1] || rowspan[2] || rowspan[3]);
        if (Number.isInteger(value) && value > 1 && value <= 24) {
          safeAttrs.push(` rowspan="${value}"`);
        }
      }
    }
    if (normalizedTag === 'th') {
      const scope = rawAttrs.match(/\bscope\s*=\s*(?:"(col|row)"|'(col|row)'|(col|row))/i);
      const value = String(scope?.[1] || scope?.[2] || scope?.[3] || '').toLowerCase();
      if (value === 'col' || value === 'row') {
        safeAttrs.push(` scope="${value}"`);
      }
    }

    return `<${normalizedTag}${safeAttrs.join('')}>`;
  });

  return normalizeDisclaimerTextFragment(html).trim();
}

function normalizeVisionDisclaimerPayload(payload = {}) {
  const rawBlocks = Array.isArray(payload?.blocks)
    ? payload.blocks
    : Array.isArray(payload?.lines)
      ? payload.lines
      : typeof payload?.content === 'string' && !/<\s*[a-z][^>]*>/i.test(payload.content)
        ? payload.content.split(/\n{2,}/)
        : [];

  const blocks = rawBlocks
    .map(cleanDisclaimerBlock)
    .filter(Boolean)
    .slice(0, 40);

  const rawHtml = [
    payload?.html,
    payload?.contentHtml,
    payload?.markup,
    typeof payload?.content === 'string' && /<\s*[a-z][^>]*>/i.test(payload.content) ? payload.content : ''
  ].find(value => String(value || '').trim()) || '';

  const html = sanitizeDisclaimerVisionHtml(rawHtml) || (blocks.length ? buildDisclaimerHtml(blocks) : '');
  const hasTable = Boolean(payload?.hasTable) || /<table\b/i.test(html);

  return {
    blocks,
    html,
    hasTable
  };
}

function scoreDisclaimerExtraction(result = {}) {
  const html = String(result?.html || '').trim();
  const blocks = Array.isArray(result?.blocks) ? result.blocks : [];
  const textLength = cleanDisclaimerBlock(html.replace(/<[^>]+>/g, ' ') || blocks.join(' ')).length;
  const listItems = (html.match(/<li\b/gi) || []).length;
  const headings = (html.match(/<strong\b/gi) || []).length;
  const cells = (html.match(/<(?:th|td)\b/gi) || []).length;
  const tables = (html.match(/<table\b/gi) || []).length;

  return textLength + (listItems * 24) + (headings * 12) + (cells * 18) + (tables * 220);
}

module.exports = {
  buildDisclaimerHtml,
  extractDisclaimerBlocksFromRawText,
  normalizeDisclaimerTextFragment,
  normalizeVisionDisclaimerPayload,
  sanitizeDisclaimerVisionHtml,
  scoreDisclaimerExtraction
};
