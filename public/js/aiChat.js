// ───────────────────────────────────────────────────────────────
// public/js/aiChat.js  ← updated 2025‑06‑21 (file‑upload waits for Send)
// ───────────────────────────────────────────────────────────────
(() => {
  const chat      = document.getElementById('aiChat');
  const launcherBtn = document.getElementById('aiAssistBtn');
  let dragHandle = chat?.querySelector('.ai-chat-topbar');
  const closeX    = document.getElementById('aiClose');
  const msgs      = document.getElementById('aiMsgs');
  const form      = document.getElementById('aiForm');
  const input     = document.getElementById('aiInput');
  const fileInput = document.getElementById('aiFile');
  const micBtn    = document.getElementById('aiMicBtn');
  const fileQueueStrip = document.getElementById('aiFileQueue');
  let sendBtn     = form?.querySelector('button[type="submit"]');
  const dropOverlay = document.getElementById('aiDropOverlay');
  const fieldsetList = document.getElementById('fieldsetList');
  const targetName = document.getElementById('aiTargetName');
  const queueCount = document.getElementById('aiQueueCount');
  const chatSummaryEl = document.getElementById('aiChatSummary');
  const aiFeatureFlags = window.__builderAiFeatures || {};
  const fileUploadEnabled = aiFeatureFlags.fileUpload === true;
  const dictationEnabled = aiFeatureFlags.dictation === true;

  function normalizeChatMarkup () {
    if (!chat) return;

    let topbarEl = chat.querySelector('.ai-chat-topbar');
    let topbarCopyEl = topbarEl?.querySelector('.ai-chat-topbar-copy');
    const closeButton = document.getElementById('aiClose');
    const historyEl = document.getElementById('aiMsgs');
    const formEl = document.getElementById('aiForm');
    const composerEl = formEl?.querySelector('.ai-composer');
    let inputShellEl = composerEl?.querySelector('.ai-input-shell');
    const promptEl = document.getElementById('aiInput');
    const hiddenFileInput = document.getElementById('aiFile');
    const actionsEl = composerEl?.querySelector('.ai-composer-actions');
    const fileActionEl = actionsEl?.querySelector('label[for="aiFile"]');
    const micActionEl = document.getElementById('aiMicBtn');

    if (!inputShellEl && composerEl) {
      inputShellEl = document.createElement('div');
      inputShellEl.className = 'ai-input-shell';
      composerEl.prepend(inputShellEl);
    }

    if (!topbarEl) {
      topbarEl = document.createElement('div');
      topbarEl.className = 'ai-chat-topbar';
      chat.prepend(topbarEl);
    }

    if (!topbarCopyEl && topbarEl) {
      topbarCopyEl = document.createElement('div');
      topbarCopyEl.className = 'ai-chat-topbar-copy';
      topbarCopyEl.setAttribute('aria-hidden', 'true');
      topbarCopyEl.innerHTML = '<span class="ai-chat-topbar-icon"><i class="fa-solid fa-gear"></i></span>';
      topbarEl.prepend(topbarCopyEl);
    }

    if (closeButton && closeButton.parentElement !== topbarEl) {
      topbarEl.appendChild(closeButton);
    }
    if (topbarCopyEl && topbarCopyEl.parentElement !== topbarEl) {
      topbarEl.prepend(topbarCopyEl);
    }
    if (historyEl && historyEl.parentElement !== chat) {
      if (topbarEl?.parentElement === chat) {
        topbarEl.insertAdjacentElement('afterend', historyEl);
      } else {
        chat.prepend(historyEl);
      }
    }
    if (formEl && formEl.parentElement !== chat) {
      chat.appendChild(formEl);
    }

    chat.querySelectorAll('.ai-chat-header, .ai-chat-context, .ai-chat-heading').forEach(node => node.remove());
    composerEl?.querySelectorAll('.ai-composer-head, .ai-composer-footer, .ai-file-queue, .ai-composer-summary').forEach(node => node.remove());

    if (inputShellEl && promptEl && promptEl.parentElement !== inputShellEl) {
      inputShellEl.prepend(promptEl);
    }
    if (!sendBtn && inputShellEl) {
      sendBtn = document.createElement('button');
      sendBtn.type = 'submit';
      sendBtn.className = 'ai-send-inline';
      sendBtn.setAttribute('aria-label', 'Send prompt');
      sendBtn.innerHTML = '<i class="fa-solid fa-arrow-up"></i>';
      inputShellEl.appendChild(sendBtn);
    }
    if (inputShellEl && sendBtn && sendBtn.parentElement !== inputShellEl) {
      inputShellEl.appendChild(sendBtn);
    }
    promptEl?.setAttribute('placeholder', 'Ask AI to change this form...');
    if (inputShellEl && actionsEl) {
      const desiredNextSibling = sendBtn && sendBtn.parentElement === inputShellEl
        ? sendBtn
        : null;

      if (actionsEl.parentElement !== inputShellEl || actionsEl.nextElementSibling !== desiredNextSibling) {
        inputShellEl.insertBefore(actionsEl, desiredNextSibling);
      }
    }
    if (!fileUploadEnabled) {
      fileActionEl?.remove();
      hiddenFileInput?.remove();
    }
    if (!dictationEnabled) {
      micActionEl?.remove();
    }
    if (actionsEl && !actionsEl.childElementCount) {
      actionsEl.remove();
    }
    if (composerEl && hiddenFileInput && hiddenFileInput.parentElement !== composerEl && fileUploadEnabled) {
      composerEl.appendChild(hiddenFileInput);
    }
  }

  normalizeChatMarkup();
  dragHandle = chat?.querySelector('.ai-chat-topbar');

  /* ----------------------------------------------------------
     0. State
  ----------------------------------------------------------*/
  const fileQueue = [];
  const chipByFile = new Map();
  const uploadProfileByFile = new WeakMap();
  const SUPPORTED_EXT = /\.(pdf|doc|docx|docm|png|jpe?g|webp|bmp|gif)$/i;
  const SUPPORTED_DOC_MIME = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]);
  const FAST_IMAGE_SKIP_BYTES = 1.25 * 1024 * 1024;
  const FAST_IMAGE_MAX_DIMENSION = 1600;
  const FAST_IMAGE_OUTPUT_MIME = 'image/jpeg';
  const FAST_IMAGE_QUALITY = 0.74;
  const FAST_IMAGE_PROFILE = 'fast-image-v1';
  const AI_NOTICE_KEY = 'ai-status';
  const MAX_CHAT_MESSAGES = 6;
  const FILE_DROP_BLOCKED_SELECTOR = [
    '#labelOptionsModal',
    '#componentGroupSection',
    '#componentGroupItemsInputUnified',
    '#optionsSection',
    '#surveySection',
    '#optionsModal',
    '#surveyOptionsModal',
    '#bulkOptionsInputUnified',
    '#surveyOptionsInputUnified',
    '#optionsTagContainer',
    '#surveyOptionsTagContainer'
  ].join(', ');
  let mediaRec, chunks = [];
  let dragDepth = 0;
  let isProcessingQueue = false;
  let dragState = null;
  let hasCustomPosition = false;
  let isAnchoredToLauncher = false;
  let clampFrame = 0;
  let queuedPromptSnapshot = '';
  const DEFAULT_CHAT_SUMMARY = 'Patch form or add components.';
  const chatSummaryState = {
    prompt: '',
    status: DEFAULT_CHAT_SUMMARY
  };

  function getBuilderZoom () {
    const zoomValue = Number.parseFloat(window.getComputedStyle(document.body).zoom);
    return Number.isFinite(zoomValue) && zoomValue > 0 ? zoomValue : 1;
  }

  /* ----------------------------------------------------------
     Helpers
  ----------------------------------------------------------*/
  function isRootGroupingComponent(component) {
    return Boolean(
      component
      && component.type === 'fieldset'
      && String(component.label || '').trim().toLowerCase() === 'grouping'
      && Array.isArray(component.components)
    );
  }

  function normalizeAiComponents(objOrArr) {
    if (typeof window.extractTopLevelComponents === 'function') {
      return window.extractTopLevelComponents(objOrArr);
    }

    const list = Array.isArray(objOrArr) ? objOrArr : [objOrArr];
    if (list.length === 1 && isRootGroupingComponent(list[0])) {
      return list[0].components;
    }
    return list;
  }

  function _safeIngest (objOrArr, arr) {
    if (typeof window.ingest !== 'function') return;
    normalizeAiComponents(objOrArr)
      .forEach(comp => window.ingest(comp, arr));
  }

  function getAiFileInsertTargetArray () {
    if (typeof getSelectedContainerComponents === 'function') {
      const selected = getSelectedContainerComponents();
      if (Array.isArray(selected)) return selected;
    }

    if (!window.formJSON || typeof window.formJSON !== 'object') {
      window.formJSON = {};
    }
    if (!Array.isArray(window.formJSON.components)) {
      window.formJSON.components = [];
    }
    return window.formJSON.components;
  }

  function getAiPromptTargetContext () {
    const selectedCard = document.querySelector('#fieldsetList .fieldset-card.selected[data-key]');
    const key = String(selectedCard?.dataset?.key || 'root');
    const label = String(selectedCard?.textContent || '').trim() || 'Root (Section)';

    return {
      key,
      label,
      isRoot: key === 'root',
      components: getAiFileInsertTargetArray()
    };
  }

  function compactSummaryText (text, maxLength = 140) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
  }

  function formatQueueCount (count) {
    return `${count} file${count === 1 ? '' : 's'}`;
  }

  function rememberQueuedPrompt (prompt) {
    const nextPrompt = String(prompt || '').trim();
    if (!nextPrompt) return;
    queuedPromptSnapshot = nextPrompt;
    setChatSummary({ prompt: nextPrompt });
  }

  function setChatSummary (next = {}) {
    chatSummaryState.prompt = compactSummaryText(
      next.prompt !== undefined ? next.prompt : chatSummaryState.prompt,
      120
    );
    chatSummaryState.status = compactSummaryText(
      next.status !== undefined ? next.status : chatSummaryState.status,
      180
    ) || DEFAULT_CHAT_SUMMARY;

    if (chatSummaryEl) {
      chatSummaryEl.textContent = chatSummaryState.status;
      chatSummaryEl.title = chatSummaryState.status;
    }

    scheduleChatClamp();
  }

  function syncContextSummary () {
    const target = getAiPromptTargetContext();
    let queueLabel = 'No files';

    if (isProcessingQueue) {
      queueLabel = fileQueue.length
        ? `Processing ${formatQueueCount(fileQueue.length)}`
        : 'Processing';
    } else if (fileQueue.length) {
      queueLabel = formatQueueCount(fileQueue.length);
    }

    if (targetName) {
      targetName.textContent = target.label || 'Root (Section)';
      targetName.title = target.label || 'Root (Section)';
    }

    if (queueCount) {
      queueCount.textContent = queueLabel;
      queueCount.title = queueLabel;
    }

    chat.classList.toggle('is-processing', isProcessingQueue);
  }

  function resolveAiPromptTargetArray (target = {}) {
    const targetKey = String(target.key || 'root');

    if (targetKey === 'root') {
      if (!window.formJSON || typeof window.formJSON !== 'object') {
        window.formJSON = {};
      }
      if (!Array.isArray(window.formJSON.components)) {
        window.formJSON.components = [];
      }
      return {
        components: window.formJSON.components,
        label: 'Root (Section)'
      };
    }

    if (typeof findFieldsetByKey === 'function') {
      const container = findFieldsetByKey(window.formJSON?.components || [], targetKey);
      if (container) {
        if (typeof resolveContainerComponents === 'function') {
          return {
            components: resolveContainerComponents(container),
            label: target.label || targetKey
          };
        }
        if (!Array.isArray(container.components)) container.components = [];
        return {
          components: container.components,
          label: target.label || targetKey
        };
      }
    }

    notify(`Selected section "${target.label || targetKey}" no longer exists. Using the root section instead.`, 'warn', 2600);
    return {
      components: getAiFileInsertTargetArray(),
      label: 'Root (Section)'
    };
  }

  function notify (text, type = 'info', ttl, opts) {
    if (typeof window.showNotification === 'function') {
      window.showNotification(text, type, ttl, opts);
      return;
    }
    console.warn(`[notify:${type}] ${text}`);
  }

  function notifyAiStatus (text, type = 'info', ttl = 2200) {
    notify(text, type, ttl, { key: AI_NOTICE_KEY });
  }

  function autosizeInput () {
    if (!input) return;
    input.style.height = 'auto';
    const nextHeight = Math.min(Math.max(input.scrollHeight, 110), 180);
    input.style.height = `${nextHeight}px`;
    input.style.overflowY = input.scrollHeight > 180 ? 'auto' : 'hidden';
    scheduleChatClamp();
  }

  function clearChatHistory () {
    msgs?.replaceChildren();
    syncChatState();
  }

  function appendChatMessage (role, content) {
    if (!msgs) return;
    const text = compactSummaryText(
      content,
      role === 'user' ? 220 : 140
    );
    if (!text) return;

    const node = document.createElement('div');
    node.className = 'ai-chat-message';
    if (role) node.classList.add(role);
    node.textContent = text;
    node.title = text;
    msgs.appendChild(node);

    while (msgs.children.length > MAX_CHAT_MESSAGES) {
      msgs.firstElementChild?.remove();
    }

    msgs.scrollTop = msgs.scrollHeight;
    syncChatState();
  }

  function buildQueuedFilesPrompt (prompt, files) {
    const trimmedPrompt = String(prompt || '').trim();
    if (trimmedPrompt) return trimmedPrompt;

    const names = files
      .map(file => String(file?.name || '').trim())
      .filter(Boolean);

    if (!names.length) return 'Generate components from queued files.';
    return `Generate components from ${names.join(', ')}.`;
  }

  function isSupportedFile (file) {
    const mime = String(file?.type || '').toLowerCase();
    if (mime.startsWith('image/')) return true;
    if (SUPPORTED_DOC_MIME.has(mime)) return true;
    return SUPPORTED_EXT.test(String(file?.name || ''));
  }

  function isCompressibleImage (file) {
    const mime = String(file?.type || '').toLowerCase();
    if (!mime.startsWith('image/')) return false;
    return mime !== 'image/gif' && mime !== 'image/svg+xml';
  }

  function buildOptimizedImageName (fileName) {
    const cleanName = String(fileName || 'upload')
      .replace(/\.[^.]+$/, '')
      .replace(/[^\w.-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '')
      || 'upload';

    return `${cleanName}.jpg`;
  }

  function createRenderCanvas (width, height) {
    if (typeof OffscreenCanvas === 'function') {
      return new OffscreenCanvas(width, height);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function canvasToBlob (canvas, mime, quality) {
    if (typeof canvas.convertToBlob === 'function') {
      return canvas.convertToBlob({ type: mime, quality });
    }

    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error('Image export failed.'));
      }, mime, quality);
    });
  }

  async function loadRenderableImage (file) {
    if (typeof createImageBitmap === 'function') {
      try {
        return await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch {
        return createImageBitmap(file);
      }
    }

    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Image decode failed.'));
      };
      img.src = url;
    });
  }

  function releaseRenderableImage (image) {
    if (image && typeof image.close === 'function') {
      image.close();
    }
  }

  async function optimizeImageForUpload (file) {
    if (!isCompressibleImage(file) || file.size <= FAST_IMAGE_SKIP_BYTES) {
      return file;
    }

    let image;
    try {
      image = await loadRenderableImage(file);
      const width = image.width || image.naturalWidth || 0;
      const height = image.height || image.naturalHeight || 0;
      if (!width || !height) {
        return file;
      }
      const longestEdge = Math.max(width, height);
      const scale = longestEdge > FAST_IMAGE_MAX_DIMENSION
        ? FAST_IMAGE_MAX_DIMENSION / longestEdge
        : 1;
      const targetWidth = Math.max(1, Math.round(width * scale));
      const targetHeight = Math.max(1, Math.round(height * scale));

      if (scale === 1 && file.size <= FAST_IMAGE_SKIP_BYTES * 1.15) {
        return file;
      }

      const canvas = createRenderCanvas(targetWidth, targetHeight);
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return file;

      ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

      const blob = await canvasToBlob(canvas, FAST_IMAGE_OUTPUT_MIME, FAST_IMAGE_QUALITY);
      if (!blob || !blob.size || blob.size >= file.size * 0.97) {
        return file;
      }

      const optimized = new File(
        [blob],
        buildOptimizedImageName(file.name),
        { type: blob.type || FAST_IMAGE_OUTPUT_MIME, lastModified: file.lastModified || Date.now() }
      );

      uploadProfileByFile.set(optimized, FAST_IMAGE_PROFILE);
      return optimized;
    } catch {
      return file;
    } finally {
      releaseRenderableImage(image);
    }
  }

  async function prepareQueuedFile (file) {
    if (!file || !isSupportedFile(file)) return null;
    return optimizeImageForUpload(file);
  }

  function syncChatState () {
    chat.classList.toggle('has-history', !!msgs?.children.length);
    syncContextSummary();
    scheduleChatClamp();
  }

  function positionChatNearLauncher () {
    if (!launcherBtn) return;

    const zoom = getBuilderZoom();
    const launcherRect = launcherBtn.getBoundingClientRect();
    const { width, height } = getChatBounds();
    if (!width || !height) {
      requestAnimationFrame(positionChatNearLauncher);
      return;
    }

    const gap = window.innerWidth <= 640 ? 8 : 12;
    const preferredTop = launcherRect.top / zoom - height - gap;
    const fallbackTop = launcherRect.bottom / zoom + gap;

    setChatPosition(
      launcherRect.right / zoom - width,
      preferredTop >= 12 ? preferredTop : fallbackTop,
      { source: 'launcher' }
    );
  }

  function openChatPanel (opts = {}) {
    chat.classList.add('open');
    syncChatState();
    requestAnimationFrame(() => {
      if (opts.anchorToLauncher) {
        positionChatNearLauncher();
      } else {
        scheduleChatClamp();
      }
      if (opts.focus !== false) input?.focus();
    });
  }

  function getChatBounds () {
    return {
      width: chat.offsetWidth || 0,
      height: chat.offsetHeight || 0
    };
  }

  function clampChatCoords (left, top) {
    const { width, height } = getChatBounds();
    const zoom = getBuilderZoom();
    const margin = 12;
    const viewportWidth = window.innerWidth / zoom;
    const viewportHeight = window.innerHeight / zoom;

    return {
      left: Math.min(Math.max(left, margin), Math.max(margin, viewportWidth - width - margin)),
      top: Math.min(Math.max(top, margin), Math.max(margin, viewportHeight - height - margin))
    };
  }

  function setChatPosition (left, top, opts = {}) {
    const next = clampChatCoords(left, top);
    chat.style.left = `${next.left}px`;
    chat.style.top = `${next.top}px`;
    chat.style.right = 'auto';
    chat.style.bottom = 'auto';
    hasCustomPosition = true;
    isAnchoredToLauncher = opts.source === 'launcher';
  }

  function clampChatPosition () {
    if (!hasCustomPosition || !chat.classList.contains('open')) return;

    const zoom = getBuilderZoom();
    const currentLeft = Number.parseFloat(chat.style.left) || (chat.getBoundingClientRect().left / zoom);
    const currentTop = Number.parseFloat(chat.style.top) || (chat.getBoundingClientRect().top / zoom);
    setChatPosition(currentLeft, currentTop, {
      source: isAnchoredToLauncher ? 'launcher' : 'manual'
    });
  }

  function scheduleChatClamp () {
    if (!hasCustomPosition || !chat.classList.contains('open')) return;
    if (clampFrame) cancelAnimationFrame(clampFrame);
    clampFrame = requestAnimationFrame(() => {
      clampFrame = 0;
      if (isAnchoredToLauncher) {
        positionChatNearLauncher();
        return;
      }
      clampChatPosition();
    });
  }

  function startChatDrag (evt) {
    if (!chat.classList.contains('open')) return;
    if (evt.button !== undefined && evt.button !== 0) return;
    if (evt.target.closest('#aiClose')) return;

    evt.preventDefault();

    const zoom = getBuilderZoom();
    const rect = chat.getBoundingClientRect();
    setChatPosition(rect.left / zoom, rect.top / zoom, { source: 'manual' });

    dragState = {
      pointerId: evt.pointerId,
      offsetX: evt.clientX / zoom - rect.left / zoom,
      offsetY: evt.clientY / zoom - rect.top / zoom
    };

    chat.classList.add('is-dragging');
  }

  function moveChatDrag (evt) {
    if (!dragState || evt.pointerId !== dragState.pointerId) return;

    evt.preventDefault();
    const zoom = getBuilderZoom();
    setChatPosition(
      evt.clientX / zoom - dragState.offsetX,
      evt.clientY / zoom - dragState.offsetY,
      { source: 'manual' }
    );
  }

  function stopChatDrag (evt) {
    if (!dragState) return;
    if (evt.pointerId !== undefined && evt.pointerId !== dragState.pointerId) return;

    dragState = null;
    chat.classList.remove('is-dragging');
  }

  function removeQueuedFile (file) {
    const idx = fileQueue.indexOf(file);
    if (idx > -1) fileQueue.splice(idx, 1);

    const chip = chipByFile.get(file);
    if (chip) {
      chip.remove();
      chipByFile.delete(file);
    }
    if (!fileQueue.length && !isProcessingQueue) {
      queuedPromptSnapshot = '';
    }
    refreshSendState();
    syncChatState();
  }

  function queueFile (file, opts = {}) {
    const showChip = opts.showChip !== false;
    if (!file || !isSupportedFile(file)) return false;

    fileQueue.push(file);

    if (showChip && fileQueueStrip) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'file-chip';
      chip.title = 'Click to remove';
      chip.textContent = `${String(file.type || '').startsWith('image/') ? 'Image' : 'File'}: ${file.name}`;
      chip.addEventListener('click', () => removeQueuedFile(file));
      fileQueueStrip.appendChild(chip);
      chipByFile.set(file, chip);
    }

    return true;
  }

  async function queueFiles (files, opts = {}) {
    const source = opts.source || 'picker';
    const autoProcess = opts.autoProcess === true;
    const showChips = opts.showChips !== false;
    const prompt = String(opts.prompt || '').trim();
    let added = 0;
    let skipped = 0;

    for (const rawFile of [...files]) {
      const file = await prepareQueuedFile(rawFile);
      if (queueFile(file, { showChip: showChips })) {
        added += 1;
      } else {
        skipped += 1;
      }
    }

    fileInput.value = '';
    if (added && prompt) {
      rememberQueuedPrompt(prompt);
    }
    refreshSendState();

    if (added && source !== 'drop') {
      openChatPanel();
      input.focus();
    }

    if (added && source === 'drop') {
      setChatSummary({
        prompt: prompt || chatSummaryState.prompt,
        status: `Queued ${added} dropped file${added === 1 ? '' : 's'} for AI processing.`
      });
      if (!chat.classList.contains('open')) {
        notifyAiStatus(`AI processing ${added} dropped file${added === 1 ? '' : 's'}.`, 'info', 1800);
      }
    }
    if (skipped) {
      notifyAiStatus(`Skipped ${skipped} unsupported file${skipped === 1 ? '' : 's'}.`, 'warn', 2400);
    }

    if (added && autoProcess) {
      void processQueuedFiles(prompt, { silent: source === 'drop', source });
    }
  }

  function showDropOverlay () {
    if (!dropOverlay) return;
    dropOverlay.classList.add('active');
  }

  function hideDropOverlay () {
    if (!dropOverlay) return;
    dropOverlay.classList.remove('active');
  }

  function isFileDropBlockedTarget (target) {
    const element = target instanceof Element ? target : target?.parentElement;
    return !!element?.closest?.(FILE_DROP_BLOCKED_SELECTOR);
  }

  function hasDraggedFiles (evt) {
    const types = evt?.dataTransfer?.types;
    return !!types && Array.from(types).includes('Files');
  }

  /* ----------------------------------------------------------
     1. Dictation handlers
  ----------------------------------------------------------*/
  async function startRec () {
    const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
    mediaRec = new MediaRecorder(stream, { mimeType:'audio/webm' });
    chunks = [];
    mediaRec.ondataavailable = e => chunks.push(e.data);
    mediaRec.onstop          = sendBlob;
    mediaRec.start();
    micBtn.classList.add('listening');
    setChatSummary({ status: 'Listening for dictation. Click again to stop.' });
  }

  function stopRec () {
    mediaRec?.stop();
    micBtn.classList.remove('listening');
  }

  async function sendBlob () {
    const blob = new Blob(chunks, { type:'audio/webm' });
    const fd   = new FormData();
    fd.append('audio', blob, 'dictate.webm');
    try {
      const r     = await fetch('/api/ai/dictate', { method:'POST', body:fd });
      const { text } = await r.json();
      if (!r.ok) throw new Error(text || 'dictation error');
      input.value += (input.value ? ' ' : '') + text;
      autosizeInput();
      refreshSendState();
      setChatSummary({ status: 'Dictation added to the prompt.' });
    } catch (e) {
      notify(e.message, 'warn');
    }
  }

  if (!dictationEnabled) {
    micBtn?.remove();
  } else if (micBtn && (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)) {
    micBtn.title    = 'Browser does not support MediaRecorder';
    micBtn.disabled = true;
  } else if (micBtn) {
    let recording = false;
    micBtn.addEventListener('click', () => {
      recording ? stopRec() : startRec();
      recording = !recording;
    });
  }

  /* ----------------------------------------------------------
     2. File picker + drag/drop queue
  ----------------------------------------------------------*/
  if (!fileUploadEnabled) {
    fileInput?.remove();
    dropOverlay?.remove();
  } else {
    fileInput?.addEventListener('change', () => {
      if (!fileInput.files.length) return;
      void queueFiles(fileInput.files, {
        source: 'picker',
        prompt: input.value
      });
    });

    document.addEventListener('dragenter', evt => {
      if (!hasDraggedFiles(evt)) return;
      if (isFileDropBlockedTarget(evt.target)) {
        dragDepth = 0;
        hideDropOverlay();
        return;
      }
      evt.preventDefault();
      dragDepth += 1;
      showDropOverlay();
    }, true);

    document.addEventListener('dragover', evt => {
      if (!hasDraggedFiles(evt)) return;
      if (isFileDropBlockedTarget(evt.target)) {
        dragDepth = 0;
        hideDropOverlay();
        return;
      }
      evt.preventDefault();
      if (evt.dataTransfer) evt.dataTransfer.dropEffect = 'copy';
      showDropOverlay();
    }, true);

    document.addEventListener('dragleave', evt => {
      if (!hasDraggedFiles(evt)) return;
      if (isFileDropBlockedTarget(evt.target)) {
        dragDepth = 0;
        hideDropOverlay();
        return;
      }
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) hideDropOverlay();
    }, true);

    document.addEventListener('drop', evt => {
      if (!hasDraggedFiles(evt)) return;
      if (isFileDropBlockedTarget(evt.target)) {
        dragDepth = 0;
        hideDropOverlay();
        return;
      }
      evt.preventDefault();
      dragDepth = 0;
      hideDropOverlay();

      const dropped = [...(evt.dataTransfer?.files || [])];
      if (!dropped.length) return;
      void queueFiles(dropped, {
        source: 'drop',
        autoProcess: true,
        showChips: false,
        prompt: input.value
      });
    }, true);

    document.addEventListener('dragend', () => {
      dragDepth = 0;
      hideDropOverlay();
    });
  }

  if (fieldsetList && typeof MutationObserver === 'function') {
    const fieldsetObserver = new MutationObserver(() => {
      syncContextSummary();
    });

    fieldsetObserver.observe(fieldsetList, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }

  function refreshSendState () {
    if (sendBtn) {
      sendBtn.disabled = !fileQueue.length && !input.value.trim();
    }
    syncChatState();
  }

  /* ----------------------------------------------------------
     3. UTILS
  ----------------------------------------------------------*/
  input.addEventListener('input', () => {
    autosizeInput();
    refreshSendState();
  });

  input.addEventListener('keydown', evt => {
    if (evt.key !== 'Enter' || evt.shiftKey) return;
    if (!input.value.trim() && !fileQueue.length) return;
    evt.preventDefault();
    form.requestSubmit();
  });

/* ----------------------------------------------------------
   3b. AI-patch helper  🔧  (NEW)
----------------------------------------------------------*/
async function applyPromptToCurrentForm (prompt) {
  const targetContext = getAiPromptTargetContext();
  const scopedForm = {
    components: _.cloneDeep(
      Array.isArray(targetContext.components) ? targetContext.components : []
    )
  };

  setChatSummary({
    prompt,
    status: `Updating ${targetContext.label}.`
  });

  appendChatMessage('user', prompt);
  input.value = '';
  autosizeInput();
  refreshSendState();

  try {
    const r = await fetch('/api/ai/patch', {
      method : 'POST',
      headers: { 'Content-Type':'application/json' },
      body   : JSON.stringify({
        prompt,
        form : scopedForm,
        target: {
          key: targetContext.key,
          label: targetContext.label,
          isRoot: targetContext.isRoot
        }
      })
    });
    const { patch, error } = await r.json();
    if (!r.ok || error) {
      const failureMessage = `Could not update ${targetContext.label}.`;
      setChatSummary({
        status: `Unable to update ${targetContext.label}: ${error || 'request failed'}.`
      });
      appendChatMessage('assistant', failureMessage);
      notifyAiStatus(error || 'request failed', 'warn', 2600);
      return;
    }

    const resolvedTarget = resolveAiPromptTargetArray(targetContext);
    const targetArray = resolvedTarget.components;
    const changeCount = Array.isArray(patch.components) ? patch.components.length : 0;
    patch.components?.forEach(c => window.ingest(c, targetArray));
    updatePreview();
    notifyAiStatus(
      changeCount
        ? `Applied ${changeCount} AI change${changeCount === 1 ? '' : 's'} in ${resolvedTarget.label}.`
        : 'No form changes were returned.',
      changeCount ? 'success' : 'info',
      2200
    );
    const completionMessage = changeCount
      ? `Applied ${changeCount} change${changeCount === 1 ? '' : 's'} in ${resolvedTarget.label}.`
      : `No changes returned for ${resolvedTarget.label}.`;
    setChatSummary({
      status: changeCount
        ? `Applied ${changeCount} AI change${changeCount === 1 ? '' : 's'} in ${resolvedTarget.label}.`
        : `No form changes were returned for ${resolvedTarget.label}.`
    });
    appendChatMessage('assistant', completionMessage);
  } catch (err) {
    const failureMessage = `Could not update ${targetContext.label}.`;
    setChatSummary({
      status: `Unable to update ${targetContext.label}: ${err.message || String(err)}.`
    });
    appendChatMessage('assistant', failureMessage);
    notifyAiStatus(err.message || String(err), 'warn', 2600);
  }
}


  /* ----------------------------------------------------------
     4. Form Submit  (text + file queue)
  ----------------------------------------------------------*/
  form.addEventListener('submit', e => {
    e.preventDefault();
    const text = input.value.trim();
    if (isProcessingQueue) {
      notifyAiStatus('AI is already processing files.', 'info', 1500);
      return;
    }
    if (!text && !fileQueue.length) return;

    if (!fileQueue.length) {          // ✔️ new path
      applyPromptToCurrentForm(text);
      return;
    }

    /* files queued ➜ lock UI & start chain */
    rememberQueuedPrompt(text);
    input.value = '';
    autosizeInput();
    refreshSendState();
    processQueuedFiles(text || queuedPromptSnapshot, { silent: false, source: 'submit' });
  });

  async function processQueuedFiles (userPrompt, opts = {}) {
    if (isProcessingQueue) return;
    isProcessingQueue = true;
    syncContextSummary();

    const silent = opts.silent === true;
    const source = opts.source || 'submit';
    const promptToUse = String(userPrompt || queuedPromptSnapshot || '').trim();
    const targetContext = getAiPromptTargetContext();
    const totalFiles = fileQueue.length;
    const queuedFiles = [...fileQueue];
    let processedCount = 0;
    const issues = [];

    appendChatMessage('user', buildQueuedFilesPrompt(promptToUse, queuedFiles));
    setChatSummary({
      prompt: promptToUse || `Generate components from ${totalFiles} file${totalFiles === 1 ? '' : 's'}.`,
      status: `Preparing ${totalFiles} file${totalFiles === 1 ? '' : 's'} for ${targetContext.label}.`
    });

    try {
      while (fileQueue.length) {
        const nextFile = fileQueue.shift();
        if (!nextFile) continue;

        setChatSummary({
          status: `Processing ${nextFile.name}.`
        });

        const fd = new FormData();
        fd.append('file', nextFile);
        fd.append('prompt', promptToUse);
        const uploadProfile = uploadProfileByFile.get(nextFile);
        if (uploadProfile) {
          fd.append('uploadProfile', uploadProfile);
        }

        try {
          const r = await fetch('/api/ai/upload', { method:'POST', body:fd });
          const data = await r.json();
          if (!r.ok) throw new Error(data.error || 'Server error');

          const generated = Array.isArray(data.components) ? data.components : [];
          const label = generated.length === 1 ? 'component' : 'components';

          if (generated.length) {
            _safeIngest(generated, getAiFileInsertTargetArray());
            updatePreview();
          }

          processedCount += 1;

          saveGeneratedForm(nextFile.name, { components: generated });
          setChatSummary({
            status: `Processed ${nextFile.name}: ${generated.length} ${label} ready in ${targetContext.label}.`
          });

          if (!silent && source === 'submit') {
            window.open(
              `/formbuilder#${encodeURIComponent(nextFile.name)}`,
              '_blank',
              'noopener'
            );
          }
        } catch (err) {
          issues.push(`${nextFile.name}: ${err.message || err}`);
          setChatSummary({
            status: `Issue with ${nextFile.name}: ${err.message || err}.`
          });
        } finally {
          removeQueuedFile(nextFile);
          refreshSendState();
        }
      }
    } finally {
      isProcessingQueue = false;
      queuedPromptSnapshot = '';
      syncContextSummary();
      if (totalFiles) {
        const issueCount = issues.length;
        const finalStatus = issueCount
          ? `Finished ${processedCount} of ${totalFiles} file${totalFiles === 1 ? '' : 's'} for ${targetContext.label} with ${issueCount} issue${issueCount === 1 ? '' : 's'}.`
          : `Finished ${totalFiles} file${totalFiles === 1 ? '' : 's'} for ${targetContext.label}.`;
        setChatSummary({
          status: finalStatus
        });
        appendChatMessage(
          'assistant',
          issueCount
            ? `Finished ${processedCount} of ${totalFiles} files with ${issueCount} issue${issueCount === 1 ? '' : 's'}.`
            : `Finished ${totalFiles} file${totalFiles === 1 ? '' : 's'} for ${targetContext.label}.`
        );
        notifyAiStatus(
          issueCount
            ? `AI finished ${processedCount} of ${totalFiles} file${totalFiles === 1 ? '' : 's'} with ${issueCount} issue${issueCount === 1 ? '' : 's'}.`
            : `AI finished ${totalFiles} file${totalFiles === 1 ? '' : 's'} for ${targetContext.label}.`,
          issueCount ? 'warn' : 'success',
          issueCount ? 3200 : 2200
        );
      }
    }
  }

  /* prompt-only shortcut */
  async function sendPromptOnly (text) {
    appendChatMessage('user', text);
    input.value = '';
    autosizeInput();
    refreshSendState();

    try {
      const r    = await fetch('/api/ai/generate', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ prompt:text })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'request failed');

      /* ingest result (if any) */
      if (Array.isArray(data.components)) _safeIngest(data.components);
      updatePreview();
      appendChatMessage('assistant', 'Components generated.');
      notifyAiStatus('AI components generated.', 'success', 2200);
    } catch (err) {
      appendChatMessage('assistant', 'Could not generate components.');
      notifyAiStatus(err.message || String(err), 'warn', 2600);
    }
  }

  function saveGeneratedForm (fileName, json) {
    try {
      localStorage.setItem(`form_${fileName}`, JSON.stringify(json));
    } catch (e) {
      console.warn('localStorage full?', e);
    }
  }

  /* ----------------------------------------------------------
     5. Slide-out close
  ----------------------------------------------------------*/
  function closeChatPanel () {
    chat.classList.remove('open');
  }

  window.openAiChatPanel = openChatPanel;
  window.closeAiChatPanel = closeChatPanel;

  closeX?.addEventListener('click', closeChatPanel);

  document.addEventListener('keydown', evt => {
    if (evt.key === 'Escape' && chat.classList.contains('open')) {
      closeChatPanel();
    }
  });

  dragHandle?.addEventListener('pointerdown', startChatDrag);
  window.addEventListener('pointermove', moveChatDrag, { passive: false });
  window.addEventListener('pointerup', stopChatDrag);
  window.addEventListener('pointercancel', stopChatDrag);
  window.addEventListener('resize', scheduleChatClamp);

  autosizeInput();
  setChatSummary();
  syncChatState();

  /* ----------------------------------------------------------
     6. Everything below is unchanged (ingest, helpers, …)
  ----------------------------------------------------------*/

  // KEEPING ORIGINAL IMPLEMENTATIONS ↓↓↓


  function deleteComponentByKey(arr, key) {
  for (let i = arr.length - 1; i >= 0; i--) {
    const c = arr[i];
    if (c.key === key) { arr.splice(i, 1); return true; }
    if (c.components && deleteComponentByKey(c.components, key)) return true;
    if (c.type === 'columns') {
      for (const col of c.columns)
        if (deleteComponentByKey(col.components, key)) return true;
    }
  }
  return false;
}

function insertRelative(arr, payload, before = true) {
  const { ref, component } = payload;
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i];
    if (c.key === ref) {
      arr.splice(before ? i : i + 1, 0, component);
      return true;
    }
    if (c.components && insertRelative(c.components, payload, before)) return true;
    if (c.type === 'columns') {
      for (const col of c.columns)
        if (insertRelative(col.components, payload, before)) return true;
    }
  }
  return false;
}


// ---------------------------------------------------------------------------
//  SMART INGEST  –  add, update, delete, or insert components by key
// ---------------------------------------------------------------------------
if (!window.ingest) {

  /* ────────────────────────────────────────────────────────────────────
     deleteComponentByKey  –  deep-delete any component (or column child)
  ────────────────────────────────────────────────────────────────────*/
  function deleteComponentByKey(arr, key) {
    for (let i = arr.length - 1; i >= 0; i--) {
      const c = arr[i];
      if (c.key === key) {                     // found → remove
        arr.splice(i, 1);
        return true;
      }
      if (Array.isArray(c.components) && deleteComponentByKey(c.components, key))
        return true;
      if (c.type === 'columns') {
        for (const col of c.columns)
          if (deleteComponentByKey(col.components, key)) return true;
      }
    }
    return false;
  }

  /* ────────────────────────────────────────────────────────────────────
     insertRelative  –  insert before / after ref key (deep-aware)
  ────────────────────────────────────────────────────────────────────*/
  function insertRelative(arr, payload, before = true) {
    const { ref, component } = payload;
    for (let i = 0; i < arr.length; i++) {
      const c = arr[i];
      if (c.key === ref) {                     // found reference
        arr.splice(before ? i : i + 1, 0, component);
        return true;
      }
      if (Array.isArray(c.components) && insertRelative(c.components, payload, before))
        return true;
      if (c.type === 'columns') {
        for (const col of c.columns)
          if (insertRelative(col.components, payload, before)) return true;
      }
    }
    return false;
  }

  function rebuildKeyRegistry() {
    window._usedKeys = {};
    if (typeof window.registerExistingKeys === 'function' && Array.isArray(window.formJSON?.components)) {
      window.registerExistingKeys(window.formJSON.components);
    }
  }

  function sanitizeIncomingComponentTree(component) {
    const cloned = _.cloneDeep(component);
    if (typeof window.sanitizeComponentSchema === 'function') {
      window.sanitizeComponentSchema([cloned]);
    }
    return cloned;
  }

  /* ────────────────────────────────────────────────────────────────────
     MAIN  ingest(obj [, arr])
       • arr defaults to formJSON.components
       • Supports _action: delete | insert
       • Merges updates by key
  ────────────────────────────────────────────────────────────────────*/
  window.ingest = function ingest(obj, arr, opts = {}) {
    const trackTelemetry = opts.track !== false;
    /* 1 ▸ pick destination array (root by default) */
    if (!Array.isArray(arr)) {
      if (!window.formJSON)            window.formJSON            = {};
      if (!window.formJSON.components) window.formJSON.components = [];
      arr = window.formJSON.components;
    }

    /* 2 ▸ DELETE */
    if (obj._action === 'delete' && obj.key) {
      const deleted = deleteComponentByKey(arr, obj.key);
      if (deleted) {
        rebuildKeyRegistry();
        if (trackTelemetry) window.bumpAiTelemetry?.('delete', 1);
      }
      return;
    }

    /* 3 ▸ INSERT before / after */
    if (obj._action === 'insert' && obj.component && obj.position && obj.ref) {
      const payload = {
        ...obj,
        component: sanitizeIncomingComponentTree(obj.component)
      };
      const inserted = insertRelative(arr, payload, obj.position === 'before');
      if (inserted) {
        if (typeof window.sanitizeComponentSchema === 'function' && Array.isArray(window.formJSON?.components)) {
          window.sanitizeComponentSchema(window.formJSON.components);
        }
        rebuildKeyRegistry();
        if (trackTelemetry) window.bumpAiTelemetry?.('add', 1);
      }
      return;
    }

    /* 4 ▸ UPDATE (same key) */
    if (obj.key) {
      const match = window.findComponentByKey?.(arr, obj.key);
      if (match) {
        const previousKey = match.key;
        const incoming = _.cloneDeep(obj);
        let valueMap = {};

        if (Array.isArray(incoming.questions) && typeof window.normalizeChoiceItems === 'function') {
          incoming.questions = window.normalizeChoiceItems(incoming.questions, 'question').items;
        }

        if (Array.isArray(incoming.values) && typeof window.normalizeChoiceItems === 'function') {
          const normalizedValues = window.normalizeChoiceItems(
            incoming.values,
            incoming.type === 'survey' ? 'value' : 'option'
          );
          incoming.values = normalizedValues.items;
          valueMap = normalizedValues.valueMap;
        }

        if (Array.isArray(incoming.data?.values) && typeof window.normalizeChoiceItems === 'function') {
          const normalizedValues = window.normalizeChoiceItems(incoming.data.values, 'option');
          incoming.data = { ...(incoming.data || {}), values: normalizedValues.items };
          valueMap = normalizedValues.valueMap;
        }

        if (incoming.key) {
          incoming.key = window.normalizeLowerCamelCase
            ? window.normalizeLowerCamelCase(incoming.key, previousKey || 'key')
            : incoming.key;
        }

        Object.assign(match, _.omit(incoming, ['components']));

        if (previousKey && match.key && previousKey !== match.key && typeof window.syncComponentKeyReferences === 'function') {
          window.syncComponentKeyReferences(window.formJSON.components, previousKey, match.key);
        }
        if (Object.keys(valueMap).length && typeof window.syncConditionalValueReferences === 'function') {
          window.syncConditionalValueReferences(window.formJSON.components, match.key, valueMap);
        }
        if (trackTelemetry) window.bumpAiTelemetry?.('edit', 1);
        if (Array.isArray(incoming.components)) {
          if (!Array.isArray(match.components)) match.components = [];
          incoming.components.forEach(child => ingest(child, match.components, { track: trackTelemetry }));
        }
        if (typeof window.sanitizeComponentSchema === 'function' && Array.isArray(window.formJSON?.components)) {
          window.sanitizeComponentSchema(window.formJSON.components);
        }
        rebuildKeyRegistry();
        return;
      }
    }

    /* 5 ▸ NEW COMPONENT (fallback) */
    if (!obj.type) return;                          // nothing useful

    const incoming = sanitizeIncomingComponentTree(obj);
    const normalisedType = incoming.type === 'textfield' ? 'textarea' : incoming.type;
    const c = window.createComponent(
      normalisedType,
      incoming.label || '',
      incoming.values || (incoming.data?.values || []),
      false
    );

    // honour 1-row textfield tweak
    if (normalisedType === 'textarea' && incoming.type === 'textfield') c.rows = 1;

    // allow “content” alias
    if (incoming.content && !incoming.html) {
      incoming.html = incoming.content;
      delete incoming.content;
    }

    Object.assign(c, _.omit(incoming, ['type', 'label', 'values', 'data', 'components', 'key']));
    if (incoming.key) c.key = incoming.key;

    /* copy complex blocks if provided */
    if (
      incoming.data
      && (
        ['select', 'asset', 'account'].includes(incoming.type)
        || (!c.data && !Array.isArray(c.values))
      )
    ) {
      c.data = _.cloneDeep(incoming.data);
    }
    if (incoming.validate) c.validate = _.cloneDeep(incoming.validate);
    if (incoming.type === 'survey' && Array.isArray(incoming.questions)) {
      c.questions = _.cloneDeep(incoming.questions);
    }
    if (incoming.type === 'survey' && Array.isArray(incoming.values)) {
      c.values = _.cloneDeep(incoming.values);
    }

    if (Array.isArray(incoming.components)) {
      if (!Array.isArray(c.components)) c.components = [];
      incoming.components.forEach(child => ingest(child, c.components, { track: trackTelemetry }));
    }

    arr.push(c);
    if (typeof window.sanitizeComponentSchema === 'function' && Array.isArray(window.formJSON?.components)) {
      window.sanitizeComponentSchema(window.formJSON.components);
    }
    rebuildKeyRegistry();
    if (trackTelemetry) window.bumpAiTelemetry?.('add', 1);
  };
}

/* ---------------------------------------------------------------------------
   findComponentByKey (unchanged, just extended for columns)
---------------------------------------------------------------------------*/
window.findComponentByKey = function findComponentByKey(arr, key) {
  for (const c of arr) {
    if (c.key === key) return c;
    if (Array.isArray(c.components)) {
      const deep = findComponentByKey(c.components, key);
      if (deep) return deep;
    }
    if (c.type === 'columns') {
      for (const col of c.columns) {
        const deep = findComponentByKey(col.components, key);
        if (deep) return deep;
      }
    }
  }
  return null;
};


  /* any other helper functions the original file contained continue below … */
})();
