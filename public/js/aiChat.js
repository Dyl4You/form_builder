// ───────────────────────────────────────────────────────────────
// public/js/aiChat.js  ← updated 2025‑06‑21 (file‑upload waits for Send)
// ───────────────────────────────────────────────────────────────
(() => {
  const chat      = document.getElementById('aiChat');
  const closeX    = document.getElementById('aiClose');
  const msgs      = document.getElementById('aiMsgs');
  const form      = document.getElementById('aiForm');
  const input     = document.getElementById('aiInput');
  const fileInput = document.getElementById('aiFile');
  const micBtn    = document.getElementById('aiMicBtn');
  const sendBtn   = form.querySelector('button[type="submit"]');

  /* ----------------------------------------------------------
     0. State
  ----------------------------------------------------------*/
  let pendingFile = null;
  let mediaRec, chunks = [];

  /* fallback if createComponent.js hasn’t registered ingest yet */
  function _safeIngest (obj, arr) {
    if (typeof window.ingest === 'function') {
      window.ingest(obj, arr);
    } else {
      console.warn('⚠️ window.ingest is not defined – component discarded:', obj);
    }
  }

  /* ----------------------------------------------------------
     1. Dictation helpers (unchanged)
  ----------------------------------------------------------*/
  async function startRec () {
    const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
    mediaRec = new MediaRecorder(stream, { mimeType:'audio/webm' });
    chunks = [];
    mediaRec.ondataavailable = e => chunks.push(e.data);
    mediaRec.onstop          = sendBlob;
    mediaRec.start();
    micBtn.classList.add('listening');
    showNotification('Listening… click again to stop');
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
      const r   = await fetch('/api/ai/dictate', { method:'POST', body:fd });
      const { text } = await r.json();
      if (!r.ok) throw new Error(text || 'dictation error');
      input.value += (input.value ? ' ' : '') + text;
      refreshSendState();
    } catch (e) {
      showNotification(e.message, 'warn');
    }
  }

  /* graceful degradation */
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    micBtn.title = 'Browser does not support MediaRecorder';
    micBtn.disabled = true;
  } else {
    let recording = false;
    micBtn.addEventListener('click', () => {
      recording ? stopRec() : startRec();
      recording = !recording;
    });
  }

  /* ----------------------------------------------------------
     2. PDF picker → remember file & show chip
  ----------------------------------------------------------*/
  fileInput?.addEventListener('change', () => {
    if (!fileInput.files.length) return;

    pendingFile = fileInput.files[0];
    fileInput.value = '';                       // allow re‑picking same file

    /* chip UI */
    document.getElementById('pendingFileChip')?.remove();
    const chip = document.createElement('span');
    chip.id        = 'pendingFileChip';
    chip.className = 'file-chip';
    chip.textContent = `📄 ${pendingFile.name}`;
    chip.title       = 'Click to remove';
    chip.onclick     = () => {
      chip.remove();
      pendingFile = null;
      refreshSendState();
    };
    input.parentElement.insertBefore(chip, input);
    input.focus();
    refreshSendState();
  });

  /* ----------------------------------------------------------
     3. UTILS
  ----------------------------------------------------------*/
  function refreshSendState () {
    if (!sendBtn) return;
    sendBtn.disabled = !pendingFile && !input.value.trim();
  }
  input.addEventListener('input', refreshSendState);

  /* helper – append a <pre> bubble */
  function append (role, content) {
    const pre = document.createElement('pre');
    pre.className   = role;
    pre.textContent = content;
    msgs.appendChild(pre);
    msgs.scrollTop = msgs.scrollHeight;
  }

  /* ----------------------------------------------------------
     4. Form Submit – handles both TEXT and FILE+TEXT
  ----------------------------------------------------------*/
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text && !pendingFile) return;   // nothing to send

    /* show user message */
    if (text) append('user', text);
    else      append('user', `📄 ${pendingFile.name}`);
    input.value = '';
    refreshSendState();

    /* assistant typing indicator */
    append('assistant', pendingFile ? `📤 Uploading ${pendingFile.name}…` : '…');
    const holder = msgs.lastChild;

    /* decide endpoint & payload */
    let fetchUrl, fetchOpts;
    if (pendingFile) {
      fetchUrl       = '/api/ai/upload';
      const fd       = new FormData();
      fd.append('file', pendingFile);
      fd.append('prompt', text);           // may be ''
      fetchOpts      = { method:'POST', body:fd };
    } else {
      fetchUrl       = '/api/ai/generate';
      fetchOpts      = {
        method :'POST',
        headers:{ 'Content-Type':'application/json' },
        body   : JSON.stringify({ prompt:text })
      };
    }

    try {
      const res  = await fetch(fetchUrl, fetchOpts);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Server error');

      holder.textContent = JSON.stringify(data, null, 2);

      if (Array.isArray(data.components) && data.components.length) {
        data.components.forEach(o => _safeIngest(o, targetArray()));
        window.updatePreview?.();
        window.showNotification?.('AI components added!', 'info');
      } else {
        window.showNotification?.('AI response had no components.', 'warn');
      }
    } catch (err) {
      holder.textContent = `⚠️ ${err.message}`;
    } finally {
      /* clear attachment */
      pendingFile = null;
      document.getElementById('pendingFileChip')?.remove();
      refreshSendState();
    }
  });

  /* ----------------------------------------------------------
     5. slide‑out close & helper functions (unchanged)
  ----------------------------------------------------------*/
  closeX.addEventListener('click', () => chat.classList.remove('open'));

  function targetArray () {
    if (!window.formJSON) window.formJSON = { components: [] };
    if (window.selectedFieldsetKey && window.selectedFieldsetKey !== 'root') {
      const fs = window.findFieldsetByKey(window.formJSON.components, window.selectedFieldsetKey);
      return fs ? fs.components : window.formJSON.components;
    }
    return window.formJSON.components;
  }

  /* ----------------------------------------------------------
     6. Everything below is unchanged (ingest, helpers, …)
  ----------------------------------------------------------*/

  // KEEPING ORIGINAL IMPLEMENTATIONS ↓↓↓

  if (!window.ingest) {
    window.ingest = function ingest (obj, arr) {
      /* 1 ▸ find the array we’re inserting into */
      if (!Array.isArray(arr)) {
        if (!window.formJSON)            window.formJSON            = {};
        if (!window.formJSON.components) window.formJSON.components = [];
        arr = window.formJSON.components;
      }

      /* 2 ▸ PATCH instead of PUSH when keys collide */
      if (obj.key) {                                   // key present?
        const match = window.findComponentByKey?.(arr, obj.key);
        if (match) {
          Object.assign(match, obj);                   // ← PATCH here
          return;                                      // done
        }
      }

      /* ─── SPECIAL: if the AI sends a brand-new fieldset intended to
         group existing components, create it and move those children in  */
      if (obj.type === 'fieldset' && !window.findComponentByKey(arr, obj.key)) {
        const fs = window.createComponent('fieldset', obj.label || '', [], false);
        fs.key = obj.key;
        Object.assign(fs, _.omit(obj, ['type', 'label', 'components']));
        fs.components = [];

        // move already-present children whose keys are listed in obj.components
        const moveHere = new Set((obj.components || []).map(c => c.key));
        for (let i = arr.length - 1; i >= 0; i--) {
          if (moveHere.has(arr[i].key)) {
            fs.components.unshift(arr.splice(i, 1)[0]);  // keep order
          }
        }

        // ingest any *new* children the AI provided
        (obj.components || []).forEach(c => ingest(c, fs.components));

        arr.push(fs);
        return;                       // fieldset done, skip normal path
      }

      /* 3 ▸ otherwise it’s a new component → create + push */
      const normalisedType = obj.type === 'textfield' ? 'textarea' : obj.type;
      const c = window.createComponent(
        normalisedType,
        obj.label || '',
        obj.values || (obj.data?.values || []),
        false
      );


      

      // honour 1-row textfield tweak
      if (normalisedType === 'textarea' && obj.type === 'textfield') c.rows = 1;

      if (obj.content && !obj.html) {
  obj.html = obj.content;        // treat "content" as "html"
  delete obj.content;            // keep the final JSON clean
}

      // ✱ NEW — copy every other property (validate, placeholder, conditional, etc.)
      Object.assign(c, _.omit(obj, ['type', 'label', 'values', 'data', 'components']));

      // keep full data / validate blocks if provided
      if (obj.data && !c.data)       c.data     = _.cloneDeep(obj.data);
      if (obj.validate)              c.validate = _.cloneDeep(obj.validate);
      if (obj.type === 'survey' && Array.isArray(obj.values)) {
        c.values = _.cloneDeep(obj.values);
      }
      (obj.components || []).forEach(child => ingest(child, c.components));
      arr.push(c);
    };
  }

  window.findComponentByKey = function findComponentByKey(arr, key) {
    for (const c of arr) {
      if (c.key === key) return c;
      if (Array.isArray(c.components)) {
        const deep = findComponentByKey(c.components, key);
        if (deep) return deep;
      }
    }
    return null;
  };

  /* any other helper functions the original file contained continue below … */
})();
