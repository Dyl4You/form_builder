(function () {
  const DEFAULT_TTL = 2000;
  const FADE_MS = 250;
  const MAX_VISIBLE = 3;
  const VALID_KINDS = new Set(['info', 'warn', 'error', 'success']);
  const activeByKey = new Map();

  function ensureTray() {
    let tray = document.getElementById('notifyTray');
    if (tray) return tray;

    tray = document.createElement('div');
    tray.id = 'notifyTray';
    document.body.appendChild(tray);
    return tray;
  }

  function cleanupCard(card) {
    if (!card) return;

    clearTimeout(card._hideTimer);
    clearTimeout(card._fallbackTimer);

    if (card._notifyKey && activeByKey.get(card._notifyKey) === card) {
      activeByKey.delete(card._notifyKey);
    }

    if (card._onTransitionEnd) {
      card.removeEventListener('transitionend', card._onTransitionEnd);
    }

    card.remove();
  }

  function scheduleHide(card, ttl) {
    clearTimeout(card._hideTimer);
    clearTimeout(card._fallbackTimer);
    card.classList.add('show');
    card._hideTimer = setTimeout(() => card.classList.remove('show'), ttl);
    card._fallbackTimer = setTimeout(() => cleanupCard(card), ttl + FADE_MS + 120);
  }

  function updateCard(card, msg, kind, ttl, key) {
    const previousKey = card._notifyKey;
    if (previousKey && previousKey !== key && activeByKey.get(previousKey) === card) {
      activeByKey.delete(previousKey);
    }

    card.className = `notify-card ${kind}`;
    card.textContent = msg;
    card.dataset.kind = kind;
    card.dataset.message = msg;
    card.style.setProperty('--ttl', `${ttl}ms`);
    card._notifyKey = key || '';
    if (card._notifyKey) {
      activeByKey.set(card._notifyKey, card);
    }
    scheduleHide(card, ttl);
  }

  window.showNotification = function (msg, kind = 'info', ttl = DEFAULT_TTL, opts = {}) {
    if (!document.body) return;

    const safeMsg = msg == null ? '' : String(msg);
    const safeKind = VALID_KINDS.has(kind) ? kind : 'info';
    const safeTtl = Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_TTL;
    const safeOpts = opts && typeof opts === 'object' ? opts : {};
    const safeKey = typeof safeOpts.key === 'string' && safeOpts.key.trim()
      ? safeOpts.key.trim()
      : '';
    const tray = ensureTray();
    const existingByKey = safeKey ? activeByKey.get(safeKey) : null;

    if (existingByKey && !existingByKey.isConnected) {
      activeByKey.delete(safeKey);
    }

    if (existingByKey && existingByKey.isConnected) {
      updateCard(existingByKey, safeMsg, safeKind, safeTtl, safeKey);
      tray.appendChild(existingByKey);
      return;
    }

    const existingDuplicate = Array.from(tray.children).find((child) => (
      child.dataset.kind === safeKind && child.dataset.message === safeMsg
    ));
    if (existingDuplicate) {
      updateCard(existingDuplicate, safeMsg, safeKind, safeTtl, existingDuplicate._notifyKey || safeKey);
      tray.appendChild(existingDuplicate);
      return;
    }

    const card = document.createElement('div');
    const onTransitionEnd = (event) => {
      if (event.propertyName === 'opacity' && !card.classList.contains('show')) {
        cleanupCard(card);
      }
    };

    card._onTransitionEnd = onTransitionEnd;
    card.addEventListener('transitionend', onTransitionEnd);
    card.addEventListener('click', () => card.classList.remove('show'));

    updateCard(card, safeMsg, safeKind, safeTtl, safeKey);
    tray.appendChild(card);

    while (tray.children.length > MAX_VISIBLE) {
      cleanupCard(tray.firstElementChild);
    }
  };
})();
