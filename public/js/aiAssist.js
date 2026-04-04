const btn = document.getElementById('aiAssistBtn');
const panel = document.getElementById('aiChat');
const input = document.getElementById('aiInput');
const LAUNCHER_POS_KEY = 'builder.aiAssistLauncherPos.v3';

function resetLauncherPosition() {
  if (!btn) return;

  btn.style.removeProperty('left');
  btn.style.removeProperty('top');
  btn.style.removeProperty('right');
  btn.style.removeProperty('bottom');
  btn.classList.remove('is-dragging');

  try {
    localStorage.removeItem(LAUNCHER_POS_KEY);
  } catch (err) {
    console.warn('Unable to clear AI launcher position.', err);
  }
}

btn?.addEventListener('click', () => {
  resetLauncherPosition();

  if (typeof window.openAiChatPanel === 'function') {
    window.openAiChatPanel({ anchorToLauncher: true });
    return;
  }

  panel?.classList.add('open');
  input?.focus();
});

window.addEventListener('resize', resetLauncherPosition);

resetLauncherPosition();
