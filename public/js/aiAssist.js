// ───────────────────────────────────────────────────────────────
// public/js/aiAssist.js (unchanged except open behaviour)
// ───────────────────────────────────────────────────────────────
const btn   = document.getElementById('aiAssistBtn');
const panel = document.getElementById('aiChat');

btn?.addEventListener('click', () => {
  panel.classList.add('open');
  document.getElementById('aiInput').focus();
});