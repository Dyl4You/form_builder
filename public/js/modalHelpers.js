/****************************************************
 * public/js/modalHelpers.js
 ****************************************************/



window._ckEditors = {};   // keep instances by element id
const BUILDER_AI_FEATURES = window.__builderAiFeatures || {};
const IMAGE_EXTRACTION_ENABLED = BUILDER_AI_FEATURES.imageExtraction === true;

let classicEditorLoadPromise = null;

function loadClassicEditor() {
  if (window.ClassicEditor) {
    return Promise.resolve(window.ClassicEditor);
  }

  if (classicEditorLoadPromise) {
    return classicEditorLoadPromise;
  }

  classicEditorLoadPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-ckeditor-loader="true"]');
    if (existingScript) {
      existingScript.addEventListener("load", () => {
        if (window.ClassicEditor) {
          resolve(window.ClassicEditor);
          return;
        }
        classicEditorLoadPromise = null;
        reject(new Error("Rich text editor loaded without exposing ClassicEditor."));
      }, { once: true });
      existingScript.addEventListener("error", () => {
        classicEditorLoadPromise = null;
        reject(new Error("Unable to load the rich text editor."));
      }, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = window.__builderCkeditorScriptUrl || "https://cdn.ckeditor.com/ckeditor5/41.1.0/classic/ckeditor.js";
    script.defer = true;
    script.dataset.ckeditorLoader = "true";
    script.addEventListener("load", () => {
      if (window.ClassicEditor) {
        resolve(window.ClassicEditor);
        return;
      }
      classicEditorLoadPromise = null;
      reject(new Error("Rich text editor loaded without exposing ClassicEditor."));
    }, { once: true });
    script.addEventListener("error", () => {
      classicEditorLoadPromise = null;
      reject(new Error("Unable to load the rich text editor."));
    }, { once: true });
    document.head.appendChild(script);
  });

  return classicEditorLoadPromise;
}

function makeCKEditor(el) {
  return loadClassicEditor()
    .then((ClassicEditor) => ClassicEditor.create(el, {
      toolbar: {
        shouldNotGroupWhenFull: true,
        items: [
          'heading', '|',
          'bold', 'italic', 'link', 'bulletedList', 'numberedList', '|',
          'blockQuote', 'insertTable', 'undo', 'redo'
        ]
      }
    }))
    .then(ed => (window._ckEditors[el.id] = ed));
}

function destroyCKEditor(elId) {
  const ed = window._ckEditors[elId];
  if (ed) { ed.destroy(); delete window._ckEditors[elId]; }
}

const DISCLAIMER_PHOTO_HINT = "Insert a photo from your device into the disclaimer.";
const IMAGE_EXTRACTION_DISABLED_HINT = "";

function setDisclaimerPhotoStatus(message = DISCLAIMER_PHOTO_HINT) {
  const statusEl = document.getElementById("disclaimerPhotoStatus");
  if (statusEl) statusEl.textContent = message;
}

function resetDisclaimerPhotoPicker() {
  const input = document.getElementById("disclaimerPhotoInput");
  if (input) input.value = "";
  setDisclaimerPhotoStatus();
}

function getDisclaimerEditor(getEditor) {
  return ((typeof getEditor === "function" ? getEditor() : null) || window._ckEditors["disclaimerRTE"] || null);
}

function getDisclaimerEditorDropTarget(editor) {
  const activeEditor = editor || window._ckEditors["disclaimerRTE"];
  return activeEditor?.ui?.view?.editable?.element
    || activeEditor?.ui?.getEditableElement?.()
    || null;
}

function resetDisclaimerImageDropTargetState(getEditor) {
  const editor = getDisclaimerEditor(getEditor);
  const target = getDisclaimerEditorDropTarget(editor);
  if (target) {
    target.classList.remove("is-drop-active", "is-loading");
    target.removeAttribute("aria-busy");
    delete target.dataset.disclaimerImageBusy;
  }
}

function escapeHtmlText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildDisclaimerImageMarkup(dataUrl, fileName = "") {
  const safeSrc = String(dataUrl || "");
  if (!safeSrc) return "";

  const cleanName = String(fileName || "Disclaimer photo")
    .replace(/\.[^.]+$/, "")
    .trim();
  const altText = escapeHtmlAttribute(cleanName || "Disclaimer photo");

  return `<figure class="image"><img src="${safeSrc}" alt="${altText}"></figure>`;
}

function insertDisclaimerHtml(editor, html) {
  if (!editor || !html) return false;

  try {
    editor.editing.view.focus();
    const viewFragment = editor.data.processor.toView(html);
    const modelFragment = editor.data.toModel(viewFragment);

    editor.model.change(() => {
      editor.model.insertContent(modelFragment, editor.model.document.selection);
    });

    return true;
  } catch (err) {
    console.error("Failed to insert disclaimer HTML into CKEditor:", err);

    try {
      const current = editor.getData() || "";
      editor.setData(current ? `${current}\n${html}` : html);
      return true;
    } catch (fallbackErr) {
      console.error("Failed to append disclaimer HTML into CKEditor:", fallbackErr);
      return false;
    }
  }
}

function buildDisclaimerTextMarkup(blocks = []) {
  const normalizedBlocks = Array.isArray(blocks)
    ? blocks.map(block => String(block || "").replace(/\s+/g, " ").trim()).filter(Boolean)
    : [];

  if (!normalizedBlocks.length) return "";

  return normalizedBlocks
    .map(block => `<p>${escapeHtmlText(block)}</p>`)
    .join("");
}

function bindDisclaimerPhotoPicker(getEditor) {
  const addPhotoBtn = document.getElementById("disclaimerAddPhotoBtn");
  const photoInput = document.getElementById("disclaimerPhotoInput");
  if (!addPhotoBtn || !photoInput) return;

  resetDisclaimerPhotoPicker();

  addPhotoBtn.onclick = () => {
    const editor = (typeof getEditor === "function" ? getEditor() : null) || window._ckEditors["disclaimerRTE"];
    if (!editor) {
      window.showNotification?.("Disclaimer editor is still loading.", "info", 1800);
      return;
    }
    photoInput.click();
  };

  photoInput.onchange = () => {
    const file = photoInput.files && photoInput.files[0];
    const editor = (typeof getEditor === "function" ? getEditor() : null) || window._ckEditors["disclaimerRTE"];

    if (!file) {
      resetDisclaimerPhotoPicker();
      return;
    }

    if (!editor) {
      window.showNotification?.("Disclaimer editor is still loading.", "info", 1800);
      photoInput.value = "";
      return;
    }

    if (!String(file.type || "").toLowerCase().startsWith("image/")) {
      setDisclaimerPhotoStatus("Choose an image file.");
      window.showNotification?.("Please choose an image file.", "warn", 1800);
      photoInput.value = "";
      return;
    }

    setDisclaimerPhotoStatus(`Adding ${file.name}...`);

    const reader = new FileReader();
    reader.onload = () => {
      const imageMarkup = buildDisclaimerImageMarkup(reader.result, file.name);
      if (insertDisclaimerHtml(editor, imageMarkup)) {
        setDisclaimerPhotoStatus(`Added ${file.name}`);
        window.showNotification?.("Photo added to disclaimer.", "success", 1800);
      } else {
        setDisclaimerPhotoStatus("Unable to add photo.");
        window.showNotification?.("Unable to add photo to disclaimer.", "error", 2200);
      }

      photoInput.value = "";
    };

    reader.onerror = () => {
      console.error("Failed to read disclaimer photo:", reader.error);
      setDisclaimerPhotoStatus("Unable to read photo.");
      window.showNotification?.("Unable to read that photo.", "error", 2200);
      photoInput.value = "";
    };

    reader.readAsDataURL(file);
  };
}

async function populateDisclaimerFromDroppedImage(file, getEditor) {
  const editor = getDisclaimerEditor(getEditor);
  const target = getDisclaimerEditorDropTarget(editor);
  if (!editor || !target || !file) return;

  if (target.dataset.disclaimerImageBusy === "true") {
    window.showNotification?.("Image extraction is already running for this disclaimer.", "info", 1800);
    return;
  }

  target.dataset.disclaimerImageBusy = "true";
  target.classList.add("is-loading");
  target.setAttribute("aria-busy", "true");

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("kind", "disclaimer");

    const response = await fetch("/api/ai/options-from-image", {
      method: "POST",
      body: formData
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload?.error || "Unable to read disclaimer text from image.");
    }

    const blocks = Array.isArray(payload?.blocks)
      ? payload.blocks.map(block => String(block || "").trim()).filter(Boolean)
      : [];
    const html = String(payload?.html || "").trim() || buildDisclaimerTextMarkup(
      blocks.length
        ? blocks
        : String(payload?.content || "").split(/\n{2,}/)
    );
    const source = payload?.source || "ocr";

    if (!html) {
      throw new Error("No disclaimer text was found in that image.");
    }

    if (!insertDisclaimerHtml(editor, html)) {
      throw new Error("Unable to add disclaimer text to the editor.");
    }

    const sourceLabel = source === "vision" ? "image analysis" : "OCR";
    window.showNotification?.("Extracted disclaimer text from the dropped image.", "success", 2200);
  } catch (err) {
    const message = err?.message || "Unable to read disclaimer text from that image.";
    window.showNotification?.(message, "error", 2400);
  } finally {
    target.classList.remove("is-drop-active", "is-loading");
    target.removeAttribute("aria-busy");
    delete target.dataset.disclaimerImageBusy;
  }
}

function bindDisclaimerImageDropTarget(getEditor) {
  const editor = getDisclaimerEditor(getEditor);
  const target = getDisclaimerEditorDropTarget(editor);
  if (!target || target.dataset.disclaimerImageDropBound === "true") return;

  if (!IMAGE_EXTRACTION_ENABLED) {
    target.classList.remove("disclaimer-image-drop-target");
    return;
  }

  target.dataset.disclaimerImageDropBound = "true";
  target.classList.add("disclaimer-image-drop-target");

  let dragDepth = 0;

  const activate = event => {
    if (!dataTransferHasImage(event.dataTransfer)) return false;

    event.preventDefault();
    event.stopPropagation();
    dragDepth += 1;
    target.classList.add("is-drop-active");
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    return true;
  };

  const deactivate = event => {
    if (!target.classList.contains("is-drop-active")) return;

    event.preventDefault();
    event.stopPropagation();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth > 0) return;

    target.classList.remove("is-drop-active");
  };

  target.addEventListener("dragenter", activate);
  target.addEventListener("dragover", event => {
    if (!dataTransferHasImage(event.dataTransfer)) return;

    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    target.classList.add("is-drop-active");
  });
  target.addEventListener("dragleave", deactivate);
  target.addEventListener("drop", event => {
    const file = getDroppedImageFile(event.dataTransfer);
    if (!file) return;

    event.preventDefault();
    event.stopPropagation();
    dragDepth = 0;
    void populateDisclaimerFromDroppedImage(file, getEditor);
  });
}

const OPTION_IMAGE_DROP_TARGETS = [
  {
    textareaId: "bulkOptionsInputUnified",
    statusId: "bulkOptionsImageStatus",
    kind: "options",
    itemLabel: "option",
    idleMessage: "Drag a screenshot here to extract options.",
    readyMessage: "Drop the image to extract option lines.",
    emptyMessage: "No option lines were found in that image.",
    resetPresets: () => {
      _presetRadioOptions = null;
      document.getElementById("choiceRadioPresets")
        ?.querySelectorAll(".preset-card")
        .forEach(card => card.classList.remove("selected"));
    }
  },
  {
    textareaId: "surveyQuestionsInputUnified",
    statusId: "surveyQuestionsImageStatus",
    kind: "survey",
    itemLabel: "question",
    idleMessage: "Drag a screenshot here to extract questions.",
    readyMessage: "Drop the image to extract survey questions.",
    emptyMessage: "No survey questions were found in that image."
  },
  {
    textareaId: "componentGroupItemsInputUnified",
    statusId: "componentGroupItemsImageStatus",
    kind: textarea => textarea?.dataset.imageExtractionKind || "survey",
    itemLabel: textarea => textarea?.dataset.imageExtractionItemLabel || "survey label",
    idleMessage: textarea => textarea?.dataset.imageExtractionIdleMessage || "Drag a screenshot here to extract survey labels.",
    readyMessage: textarea => textarea?.dataset.imageExtractionReadyMessage || "Drop the image to extract survey labels.",
    emptyMessage: textarea => textarea?.dataset.imageExtractionEmptyMessage || "No survey labels were found in that image."
  }
];

const LINE_LIST_EDITOR_TARGETS = [
  { editorId: "bulkOptionsInputUnified" },
  { editorId: "surveyQuestionsInputUnified" },
  { editorId: "surveyOptionsInputUnified" },
  { editorId: "componentGroupItemsInputUnified" }
];

const OCR_CHECKLIST_RESPONSE_PRESETS = Object.freeze({
  yesNoNa: Object.freeze(["Yes", "No", "N/A"]),
  passFailNa: Object.freeze(["Pass", "Fail", "N/A"]),
  safeRiskNa: Object.freeze(["Safe", "At Risk", "N/A"])
});

const COMPONENT_GROUP_RESPONSE_NOISE_PATTERNS = Object.freeze([
  /\bexplain\s+in\s+notes?\b/ig,
  /\bcomments?\b/ig,
  /\bnotes?\b/ig,
  /\bnot\s*app(?:licable)?\b/ig,
  /\bn\s*[\/\\-]?\s*a\b/ig,
  /\bna\b/ig,
  /\bpass\b/ig,
  /\bfail\b/ig,
  /\bsafe\b/ig,
  /\bat\s*risk\b/ig,
  /\byes\b/ig,
  /\bno\b/ig,
  /\b[a-z]{0,2}yes[a-z0-9]{0,3}\b/ig,
  /\b[a-z]{0,2}no[a-z0-9]{0,3}\b/ig,
  /\b[a-z]{0,2}pass[a-z0-9]{0,3}\b/ig,
  /\b[a-z]{0,2}fail[a-z0-9]{0,3}\b/ig,
  /\b[a-z]{0,2}not[a-z0-9]{0,6}\s*app[a-z0-9]{0,10}\b/ig
]);

function getLineListEditorItems(editor) {
  if (!editor) return [];
  return Array.from(editor.querySelectorAll(":scope > li"));
}

function getLineListEditorValue(editor) {
  return getLineListEditorItems(editor)
    .map(item => String(item.textContent || "").replace(/\r/g, ""))
    .join("\n");
}

function createLineListEditorItem(value = "") {
  const item = document.createElement("li");
  item.textContent = String(value ?? "");
  if (!item.textContent) item.innerHTML = "<br>";
  return item;
}

function setLineListEditorValue(editor, value = "") {
  if (!editor) return;

  const lines = String(value ?? "").replace(/\r/g, "").split("\n");
  const normalizedLines = lines.length ? lines : [""];

  editor.replaceChildren(...normalizedLines.map(line => createLineListEditorItem(line)));
  editor.scrollTop = 0;
}

function ensureLineListEditorHasItem(editor) {
  if (getLineListEditorItems(editor).length) return;
  editor.appendChild(createLineListEditorItem(""));
}

function getLineListItemSelectionOffset(item, container, offset) {
  if (!item) return 0;
  const text = String(item.textContent || "");
  if (!container) return text.length;

  const range = document.createRange();
  range.selectNodeContents(item);

  try {
    range.setEnd(container, offset);
  } catch (err) {
    return text.length;
  }

  return Math.max(0, Math.min(text.length, range.toString().length));
}

function getLineListEditorSelection(editor) {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) {
    const items = getLineListEditorItems(editor);
    const lastIndex = Math.max(0, items.length - 1);
    const lastText = String(items[lastIndex]?.textContent || "");
    return {
      startIndex: lastIndex,
      startOffset: lastText.length,
      endIndex: lastIndex,
      endOffset: lastText.length
    };
  }

  const range = selection.getRangeAt(0);
  const items = getLineListEditorItems(editor);
  const findItemIndex = node => items.findIndex(item => item.contains(node));
  let startIndex = findItemIndex(range.startContainer);
  let endIndex = findItemIndex(range.endContainer);

  if (startIndex === -1 && items.length) startIndex = 0;
  if (endIndex === -1 && items.length) endIndex = items.length - 1;

  const startItem = items[startIndex] || items[0] || null;
  const endItem = items[endIndex] || items[items.length - 1] || startItem;
  const startOffset = getLineListItemSelectionOffset(startItem, range.startContainer, range.startOffset);
  const endOffset = getLineListItemSelectionOffset(endItem, range.endContainer, range.endOffset);

  if (startIndex < endIndex || (startIndex === endIndex && startOffset <= endOffset)) {
    return { startIndex, startOffset, endIndex, endOffset };
  }

  return {
    startIndex: endIndex,
    startOffset: endOffset,
    endIndex: startIndex,
    endOffset: startOffset
  };
}

function setLineListEditorCaret(item, offset = 0) {
  if (!item) return;

  item.focus();
  const selection = window.getSelection();
  if (!selection) return;

  const safeOffset = Math.max(0, offset);
  const range = document.createRange();
  const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  let remaining = safeOffset;

  if (!node) {
    item.innerHTML = "";
    node = document.createTextNode("");
    item.appendChild(node);
  }

  while (node) {
    const length = node.textContent.length;
    if (remaining <= length) {
      range.setStart(node, remaining);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }

    remaining -= length;
    const nextNode = walker.nextNode();
    if (!nextNode) {
      range.setStart(node, length);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }

    node = nextNode;
  }
}

function dispatchLineListEditorInput(editor) {
  editor?.dispatchEvent(new Event("input", { bubbles: true }));
}

function replaceLineListEditorSelection(editor, value = "", focusMode = "end") {
  const items = getLineListEditorItems(editor);
  if (!items.length) {
    setLineListEditorValue(editor, value);
    dispatchLineListEditorInput(editor);
    const onlyItem = getLineListEditorItems(editor)[0];
    if (onlyItem) {
      const textLength = String(onlyItem.textContent || "").length;
      setLineListEditorCaret(onlyItem, focusMode === "start" ? 0 : textLength);
    }
    return;
  }

  const selection = getLineListEditorSelection(editor);
  const currentLines = items.map(item => String(item.textContent || ""));
  const before = currentLines[selection.startIndex].slice(0, selection.startOffset);
  const after = currentLines[selection.endIndex].slice(selection.endOffset);
  const replacementLines = String(value ?? "").replace(/\r/g, "").split("\n");
  const safeReplacementLines = replacementLines.length ? replacementLines : [""];

  const insertedLines = safeReplacementLines.length === 1
    ? [`${before}${safeReplacementLines[0]}${after}`]
    : [
        `${before}${safeReplacementLines[0]}`,
        ...safeReplacementLines.slice(1, -1),
        `${safeReplacementLines[safeReplacementLines.length - 1]}${after}`
      ];

  const nextLines = [
    ...currentLines.slice(0, selection.startIndex),
    ...insertedLines,
    ...currentLines.slice(selection.endIndex + 1)
  ];

  setLineListEditorValue(editor, nextLines.join("\n"));
  dispatchLineListEditorInput(editor);
  const nextItems = getLineListEditorItems(editor);
  const targetIndex = selection.startIndex + insertedLines.length - 1;
  const targetItem = nextItems[Math.max(0, Math.min(targetIndex, nextItems.length - 1))];
  if (!targetItem) return;

  const caretOffset = insertedLines.length === 1
    ? `${before}${safeReplacementLines[0]}`.length
    : safeReplacementLines[safeReplacementLines.length - 1].length;
  setLineListEditorCaret(targetItem, focusMode === "start" ? 0 : caretOffset);
}

function selectAllLineListEditor(editor) {
  if (!editor) return;
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(editor);
  selection.removeAllRanges();
  selection.addRange(range);
  editor.focus();
}

function bindLineListEditor(targetConfig) {
  const editor = document.getElementById(targetConfig?.editorId || "");
  if (!editor || editor.dataset.lineListEditorBound === "true") return;

  editor.dataset.lineListEditorBound = "true";
  editor.contentEditable = "true";
  editor.spellcheck = false;
  editor.setAttribute("role", "textbox");
  editor.setAttribute("aria-multiline", "true");

  Object.defineProperty(editor, "value", {
    configurable: true,
    get() {
      return getLineListEditorValue(editor);
    },
    set(nextValue) {
      setLineListEditorValue(editor, nextValue);
    }
  });

  setLineListEditorValue(editor, "");

  editor.addEventListener("keydown", event => {
    const hasModifier = event.metaKey || event.ctrlKey;
    const selection = window.getSelection();
    const hasRangeSelection = Boolean(
      selection
      && selection.rangeCount
      && !selection.isCollapsed
      && editor.contains(selection.anchorNode)
      && editor.contains(selection.focusNode)
    );

    if (hasModifier && event.key.toLowerCase() === "a") {
      event.preventDefault();
      selectAllLineListEditor(editor);
      return;
    }

    if (!hasModifier && !event.altKey && event.key.length === 1 && hasRangeSelection) {
      event.preventDefault();
      replaceLineListEditorSelection(editor, event.key);
      return;
    }

    if ((event.key === "Backspace" || event.key === "Delete") && hasRangeSelection) {
      event.preventDefault();
      replaceLineListEditorSelection(editor, "", "start");
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      replaceLineListEditorSelection(editor, "\n", "start");
    }
  });

  editor.addEventListener("paste", event => {
    const pastedText = event.clipboardData?.getData("text/plain") || "";
    if (!pastedText) return;

    event.preventDefault();
    replaceLineListEditorSelection(editor, pastedText);
  });

  editor.addEventListener("input", () => {
    const items = Array.from(editor.children);
    const hasOnlyItems = items.every(node => node.tagName === "LI");
    if (!hasOnlyItems) {
      const plainText = String(editor.innerText || "").replace(/\r/g, "");
      setLineListEditorValue(editor, plainText);
    }
    const refreshedItems = getLineListEditorItems(editor);
    refreshedItems.forEach(item => {
      if (!String(item.textContent || "").length) {
        item.innerHTML = "<br>";
      }
    });
    if (!refreshedItems.length) {
      ensureLineListEditorHasItem(editor);
    }
  });

  editor.addEventListener("blur", () => {
    ensureLineListEditorHasItem(editor);
  }, true);
}

function installLineListEditors() {
  LINE_LIST_EDITOR_TARGETS.forEach(bindLineListEditor);
}

function refreshLineListEditors() {
  LINE_LIST_EDITOR_TARGETS.forEach(targetConfig => {
    const editor = document.getElementById(targetConfig?.editorId || "");
    if (!editor) return;
    if (editor.dataset.lineListEditorBound !== "true") {
      bindLineListEditor(targetConfig);
      return;
    }
    ensureLineListEditorHasItem(editor);
  });
}

function setOptionImageDropStatus(targetConfig, statusEl, message = "", state = "idle") {
  if (!statusEl) return;

  const suppressFallback = message === null;
  const fallbackMessage = typeof targetConfig?.idleMessage === "function"
    ? targetConfig.idleMessage(document.getElementById(targetConfig?.textareaId || ""), targetConfig)
    : targetConfig?.idleMessage;

  const nextMessage = suppressFallback ? "" : (message || fallbackMessage || "");
  statusEl.textContent = nextMessage;
  statusEl.dataset.state = state;
  statusEl.hidden = !nextMessage;
}

function resetOptionImageDropTargetState(targetConfig) {
  if (!targetConfig) return;

  const textarea = document.getElementById(targetConfig.textareaId);
  const statusEl = document.getElementById(targetConfig.statusId);

  textarea?.classList.remove("is-drop-active", "is-loading");
  textarea?.removeAttribute("aria-busy");
  if (textarea) delete textarea.dataset.optionImageBusy;

  setOptionImageDropStatus(
    targetConfig,
    statusEl,
    IMAGE_EXTRACTION_ENABLED ? "" : null
  );
}

function isImageLikeFile(file) {
  const mime = String(file?.type || "").toLowerCase();
  if (mime.startsWith("image/")) return true;

  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(String(file?.name || ""));
}

function getDroppedImageFile(dataTransfer) {
  const files = Array.from(dataTransfer?.files || []);
  return files.find(isImageLikeFile) || null;
}

function dataTransferHasImage(dataTransfer) {
  if (getDroppedImageFile(dataTransfer)) return true;

  return Array.from(dataTransfer?.items || [])
    .some(item =>
      item?.kind === "file" &&
      (
        String(item.type || "").toLowerCase().startsWith("image/") ||
        (String(item.type || "").trim() === "" && Array.from(dataTransfer?.types || []).includes("Files"))
      )
    );
}

function splitOptionLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function cleanupComponentGroupOcrLabelCandidate(line) {
  return String(line || "")
    .replace(/^\s*\d+\s*[.)-]?\s*/g, "")
    .replace(/[\[\]{}()<>]/g, " ")
    .replace(/[|¦]/g, " ")
    .replace(/[\\]+/g, " ")
    .replace(/\s*\/\s*/g, "/")
    .replace(/[_\-–—]{2,}/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "")
    .trim();
}

function stripComponentGroupResponseNoise(text) {
  let stripped = String(text || "");

  COMPONENT_GROUP_RESPONSE_NOISE_PATTERNS.forEach(pattern => {
    stripped = stripped.replace(pattern, " ");
  });

  return cleanupComponentGroupOcrLabelCandidate(stripped);
}

function countComponentGroupResponseNoiseMatches(text) {
  const source = String(text || "");
  let count = 0;

  COMPONENT_GROUP_RESPONSE_NOISE_PATTERNS.forEach(pattern => {
    const globalPattern = pattern.global
      ? pattern
      : new RegExp(pattern.source, `${pattern.flags || ""}g`);
    const matches = source.match(globalPattern);
    if (matches?.length) {
      count += matches.length;
    }
  });

  return count;
}

function normalizeComponentGroupOcrLabelLine(line) {
  const cleaned = cleanupComponentGroupOcrLabelCandidate(line);
  if (!cleaned) return "";

  const rawQuestionIndex = String(line || "").indexOf("?");
  if (rawQuestionIndex !== -1) {
    const questionPart = String(line || "")
      .slice(0, rawQuestionIndex + 1)
      .replace(/^\s*\d+\s*[.)-]?\s*/g, "")
      .replace(/[\[\]{}()<>]/g, " ")
      .replace(/[|¦]/g, " ")
      .replace(/[\\]+/g, " ")
      .replace(/\s*\/\s*/g, "/")
      .replace(/[_\-–—]{2,}/g, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+\?/g, "?")
      .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9/?]+$/g, "")
      .trim();
    if (questionPart) {
      return questionPart;
    }
  }

  const stripped = stripComponentGroupResponseNoise(cleaned);
  const responseNoiseCount = countComponentGroupResponseNoiseMatches(cleaned);

  if (!stripped) {
    return "";
  }

  if (responseNoiseCount >= 2) {
    return stripped;
  }

  return cleaned;
}

function isLikelyComponentGroupOcrNoise(line) {
  const cleaned = cleanupComponentGroupOcrLabelCandidate(line);
  if (!cleaned) return true;

  const words = cleaned.match(/[A-Za-z0-9]+/g) || [];
  if (!words.length) return true;

  const allShort = words.every(word => word.length <= 2);
  const allSingle = words.every(word => word.length === 1);
  const totalChars = words.reduce((sum, word) => sum + word.length, 0);
  const isUpperish = cleaned === cleaned.toUpperCase();

  if (words.length === 1 && words[0].length === 1) return true;
  if (words.length === 2 && allSingle) return true;
  if (words.length >= 3 && allShort) return true;
  if (words.length === 2 && allShort && isUpperish && totalChars <= 4 && !/\d/.test(cleaned)) return true;

  return false;
}

function filterComponentGroupOcrLines(lines = []) {
  return (lines || [])
    .map(line => normalizeComponentGroupOcrLabelLine(line))
    .filter(Boolean)
    .filter(line => stripComponentGroupResponseNoise(line) !== "")
    .filter(line => !isLikelyComponentGroupOcrNoise(line));
}

function normalizeChecklistPresetToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

function extractChecklistPresetFromLines(lines = [], presetMap = OCR_CHECKLIST_RESPONSE_PRESETS) {
  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function buildChecklistLabelMatcher(label) {
    const normalizedLabel = String(label || "").trim().toLowerCase();
    const compactToken = normalizeChecklistPresetToken(normalizedLabel);

    if (!compactToken) return null;

    if (compactToken === "na") {
      return {
        token: compactToken,
        regex: /(^|[^a-z0-9])(?:n\s*[\/\\-]?\s*a|na)(?=$|[^a-z0-9])/i,
        replaceRegex: /(^|[^a-z0-9])(?:n\s*[\/\\-]?\s*a|na)(?=$|[^a-z0-9])/ig
      };
    }

    const parts = normalizedLabel.match(/[a-z0-9]+/g) || [compactToken];
    const tokenPattern = parts.map(part => escapeRegExp(part)).join("\\s*");
    return {
      token: compactToken,
      regex: new RegExp(`(^|[^a-z0-9])${tokenPattern}(?=$|[^a-z0-9])`, "i"),
      replaceRegex: new RegExp(`(^|[^a-z0-9])${tokenPattern}(?=$|[^a-z0-9])`, "ig")
    };
  }

  function cleanupChecklistLabelRemainder(line) {
    return String(line || "")
      .replace(/^\s*\d+\s*[.)-]?\s*/g, "")
      .replace(/[\[\]{}()<>]/g, " ")
      .replace(/[|¦]/g, " ")
      .replace(/\b[o0]\b/gi, " ")
      .replace(/[\/\\]+/g, " ")
      .replace(/[_\-–—]{2,}/g, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "")
      .trim();
  }

  function looksMeaningfulChecklistLabel(line) {
    const cleaned = cleanupChecklistLabelRemainder(line);
    if (!cleaned) return false;

    const words = cleaned.match(/[A-Za-z0-9]+/g) || [];
    const longestWord = words.reduce((max, word) => Math.max(max, word.length), 0);
    return longestWord >= 3 || words.length >= 2;
  }

  function looksLikeChecklistOcrJunk(line) {
    const cleaned = cleanupChecklistLabelRemainder(line);
    if (!cleaned) return true;

    const words = cleaned.match(/[A-Za-z0-9]+/g) || [];
    if (words.length < 3) return false;

    return words.every(word => word.length <= 2);
  }

  const entries = (lines || [])
    .map(line => String(line || "").trim())
    .filter(Boolean)
    .map(line => ({
      line,
      token: normalizeChecklistPresetToken(line),
      originalLine: line
    }));

  let bestMatch = null;

  Object.entries(presetMap || {}).forEach(([presetKey, labels]) => {
    const normalizedLabels = (labels || []).map(label => String(label || "").trim()).filter(Boolean);
    if (!normalizedLabels.length) return;

    const labelMatchers = normalizedLabels
      .map(buildChecklistLabelMatcher)
      .filter(Boolean);
    const matchedTokens = new Set();
    const filteredLines = [];
    let responseLikeLines = 0;
    let transformedLines = 0;

    entries.forEach(entry => {
      const exactTokenMatch = labelMatchers.find(matcher => matcher.token === entry.token) || null;
      const activeMatchers = exactTokenMatch
        ? [exactTokenMatch]
        : labelMatchers.filter(matcher => matcher.regex.test(entry.line));

      if (!activeMatchers.length) {
        if (looksLikeChecklistOcrJunk(entry.line)) {
          responseLikeLines += 1;
          return;
        }
        filteredLines.push(entry.line);
        return;
      }

      activeMatchers.forEach(matcher => matchedTokens.add(matcher.token));

      let cleanedLine = entry.originalLine;
      activeMatchers.forEach(matcher => {
        cleanedLine = cleanedLine.replace(matcher.replaceRegex, " ");
      });
      cleanedLine = cleanupChecklistLabelRemainder(cleanedLine);

      const isExactResponseLine = Boolean(exactTokenMatch);
      const isResponseOnlyNoise = activeMatchers.length >= 2 && !looksMeaningfulChecklistLabel(cleanedLine);

      if (isExactResponseLine || isResponseOnlyNoise || looksLikeChecklistOcrJunk(cleanedLine) || !cleanedLine) {
        responseLikeLines += 1;
        return;
      }

      if (cleanedLine !== entry.line) {
        transformedLines += 1;
      }

      filteredLines.push(cleanedLine);
    });

    if (matchedTokens.size < 2 || !filteredLines.length || (responseLikeLines === 0 && transformedLines === 0)) {
      return;
    }

    const candidate = {
      presetKey,
      labels: normalizedLabels,
      filteredLines,
      matchedCount: matchedTokens.size,
      responseLikeLines,
      transformedLines
    };

    if (
      !bestMatch
      || candidate.matchedCount > bestMatch.matchedCount
      || (
        candidate.matchedCount === bestMatch.matchedCount
        && candidate.responseLikeLines + candidate.transformedLines > bestMatch.responseLikeLines + bestMatch.transformedLines
      )
    ) {
      bestMatch = candidate;
    }
  });

  return bestMatch || {
    presetKey: null,
    labels: [],
    filteredLines: entries.map(entry => entry.line),
    matchedCount: 0
  };
}

function resolveOptionImageDropConfigValue(targetConfig, fieldName, textarea = null) {
  const rawValue = targetConfig?.[fieldName];
  if (typeof rawValue === "function") {
    return rawValue(textarea || document.getElementById(targetConfig?.textareaId || ""), targetConfig);
  }
  return rawValue;
}

function mergeOptionLines(existingLines, incomingLines) {
  const seen = new Set();
  const merged = [];

  [...existingLines, ...incomingLines].forEach(line => {
    const cleanLine = String(line || "").trim();
    if (!cleanLine) return;

    const key = cleanLine.toLowerCase();
    if (seen.has(key)) return;

    seen.add(key);
    merged.push(cleanLine);
  });

  return merged;
}

function getDropTargetItemLabel(targetConfig, count = 1) {
  const singular = String(resolveOptionImageDropConfigValue(targetConfig, "itemLabel") || "line").trim() || "line";
  if (count === 1) return singular;
  return singular.endsWith("s") ? singular : `${singular}s`;
}

async function populateOptionsFromDroppedImage(targetConfig, file) {
  const textarea = document.getElementById(targetConfig?.textareaId || "");
  const statusEl = document.getElementById(targetConfig?.statusId || "");
  if (!textarea || !file) return;

  if (textarea.dataset.optionImageBusy === "true") {
    window.showNotification?.("Image extraction is already running for this field.", "info", 1800);
    return;
  }

  textarea.dataset.optionImageBusy = "true";
  textarea.classList.add("is-loading");
  textarea.setAttribute("aria-busy", "true");
  setOptionImageDropStatus(targetConfig, statusEl, `Reading ${file.name}...`, "loading");

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("kind", resolveOptionImageDropConfigValue(targetConfig, "kind", textarea) || "options");

    const response = await fetch("/api/ai/options-from-image", {
      method: "POST",
      body: formData
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload?.error || "Unable to read text from image.");
    }

    const extractedOptions = Array.isArray(payload?.options)
      ? payload.options.map(option => String(option || "").trim()).filter(Boolean)
      : [];
    const source = payload?.source || "ocr";
    const sanitizedOptions = textarea.id === "componentGroupItemsInputUnified"
      ? filterComponentGroupOcrLines(extractedOptions)
      : extractedOptions;
    const checklistPreset = textarea.id === "componentGroupItemsInputUnified"
      ? extractChecklistPresetFromLines(sanitizedOptions)
      : null;
    const options = checklistPreset?.filteredLines?.length
      ? filterComponentGroupOcrLines(checklistPreset.filteredLines)
      : sanitizedOptions;

    if (!options.length) {
      throw new Error(resolveOptionImageDropConfigValue(targetConfig, "emptyMessage", textarea) || "No lines were found in that image.");
    }

    const existingLines = splitOptionLines(textarea.value);
    const mergedLines = mergeOptionLines(existingLines, options);
    const addedCount = Math.max(0, mergedLines.length - existingLines.length);

    textarea.value = mergedLines.join("\n");
    targetConfig.resetPresets?.();
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    if (checklistPreset?.labels?.length) {
      textarea.dispatchEvent(new CustomEvent("builder:component-group-preset", {
        detail: {
          labels: checklistPreset.labels,
          presetKey: checklistPreset.presetKey
        }
      }));
    }

    if (addedCount === 0 && existingLines.length) {
      const presetSuffix = checklistPreset?.labels?.length
        ? ` Auto-selected ${checklistPreset.labels.join(" / ")}.`
        : "";
      setOptionImageDropStatus(
        targetConfig,
        statusEl,
        `Those ${getDropTargetItemLabel(targetConfig, 2)} are already in the text area.${presetSuffix}`,
        "success"
      );
      window.showNotification?.(`Those ${getDropTargetItemLabel(targetConfig, 2)} are already in the list.`, "info", 1800);
      return;
    }

    const noun = getDropTargetItemLabel(targetConfig, addedCount === 0 ? options.length : addedCount);
    const action = existingLines.length ? `Added ${addedCount} new ${noun}.` : `Loaded ${options.length} ${noun}.`;
    const sourceLabel = source === "vision" ? "image analysis" : "OCR";
    const presetSuffix = checklistPreset?.labels?.length
      ? ` Auto-selected ${checklistPreset.labels.join(" / ")}.`
      : "";

    setOptionImageDropStatus(targetConfig, statusEl, `${action}${presetSuffix} Source: ${sourceLabel}.`, "success");
    window.showNotification?.(`Extracted ${options.length} ${noun} from the dropped image.`, "success", 2200);
  } catch (err) {
    const message = err?.message || "Unable to read text from that image.";
    setOptionImageDropStatus(targetConfig, statusEl, message, "error");
    window.showNotification?.(message, "error", 2400);
  } finally {
    textarea.classList.remove("is-drop-active", "is-loading");
    textarea.removeAttribute("aria-busy");
    delete textarea.dataset.optionImageBusy;
  }
}

function bindOptionImageDropTarget(targetConfig) {
  const textarea = document.getElementById(targetConfig?.textareaId || "");
  const statusEl = document.getElementById(targetConfig?.statusId || "");
  if (!textarea || textarea.dataset.optionImageDropBound === "true") return;

  if (!IMAGE_EXTRACTION_ENABLED) {
    textarea.classList.remove("option-image-drop-target");
    setOptionImageDropStatus(targetConfig, statusEl, null, "idle");
    return;
  }

  textarea.dataset.optionImageDropBound = "true";
  textarea.classList.add("option-image-drop-target");
  setOptionImageDropStatus(targetConfig, statusEl);

  let dragDepth = 0;

  const activate = event => {
    if (!dataTransferHasImage(event.dataTransfer)) return false;

    event.preventDefault();
    event.stopPropagation();
    dragDepth += 1;
    textarea.classList.add("is-drop-active");
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    setOptionImageDropStatus(
      targetConfig,
      statusEl,
      resolveOptionImageDropConfigValue(targetConfig, "readyMessage", textarea),
      "ready"
    );
    return true;
  };

  const deactivate = event => {
    if (!textarea.classList.contains("is-drop-active")) return;

    event.preventDefault();
    event.stopPropagation();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth > 0) return;

    textarea.classList.remove("is-drop-active");
    if (textarea.dataset.optionImageBusy !== "true") {
      setOptionImageDropStatus(targetConfig, statusEl);
    }
  };

  textarea.addEventListener("dragenter", activate);
  textarea.addEventListener("dragover", event => {
    if (!dataTransferHasImage(event.dataTransfer)) return;

    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    textarea.classList.add("is-drop-active");
    setOptionImageDropStatus(
      targetConfig,
      statusEl,
      resolveOptionImageDropConfigValue(targetConfig, "readyMessage", textarea),
      "ready"
    );
  });
  textarea.addEventListener("dragleave", deactivate);
  textarea.addEventListener("drop", event => {
    const file = getDroppedImageFile(event.dataTransfer);
    if (!file) return;

    event.preventDefault();
    event.stopPropagation();
    dragDepth = 0;
    void populateOptionsFromDroppedImage(targetConfig, file);
  });
}

function installOptionImageDropTargets() {
  OPTION_IMAGE_DROP_TARGETS.forEach(bindOptionImageDropTarget);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installOptionImageDropTargets, { once: true });
} else {
  installOptionImageDropTargets();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installLineListEditors, { once: true });
} else {
  installLineListEditors();
}

function mountStaticModalLayer() {
  const body = document.body;
  if (!body) return;

  let host = document.getElementById("modalLayer");
  if (!host) {
    host = document.createElement("div");
    host.id = "modalLayer";
    body.appendChild(host);
  }

  const overlay = document.getElementById("overlay");
  if (overlay && overlay.parentElement !== host) {
    host.appendChild(overlay);
  }

  document.querySelectorAll(".modal").forEach((modal) => {
    if (modal.parentElement !== host) {
      host.appendChild(modal);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountStaticModalLayer, { once: true });
} else {
  mountStaticModalLayer();
}


// Utility to create a new overlay element with a specified z-index
function createOverlay(zIndex) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay'; 
  overlay.style.zIndex = zIndex;
  overlay.style.display = 'block';
  document.body.appendChild(overlay);
  return overlay;
}

const SHARED_OVERLAY_STACK_CLASSES = [
  "super-top",
  "nested",
  "super-nested2",
  "super-nested3"
];

function resetSharedOverlayState(overlay = document.getElementById("overlay")) {
  if (!overlay) return null;

  overlay.classList.remove(...SHARED_OVERLAY_STACK_CLASSES);
  overlay.style.zIndex = "";
  return overlay;
}

function showSharedOverlay(overlay = document.getElementById("overlay"), classes = []) {
  const activeOverlay = resetSharedOverlayState(overlay);
  if (!activeOverlay) return null;

  const classList = Array.isArray(classes) ? classes : [classes];
  classList
    .map(className => String(className || "").trim())
    .filter(Boolean)
    .forEach(className => activeOverlay.classList.add(className));

  activeOverlay.style.display = "block";
  return activeOverlay;
}

function hideSharedOverlay(overlay = document.getElementById("overlay")) {
  if (!overlay) return;

  overlay.style.display = "none";
  resetSharedOverlayState(overlay);
}

/* --------------------------------------------------
   Modal keyboard helpers  (focus trap + ⏎ to “Save”)
   --------------------------------------------------*/
   function getFocusable(modal) {
    return Array.from(
      modal.querySelectorAll(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      )
    ).filter(el => el.offsetParent !== null);
  }
  
  function trapFocus(modal) {
    const focusables = getFocusable(modal);
    if (!focusables.length) return;
    const first = focusables[0];
    const last  = focusables[focusables.length - 1];
  
    modal.__focusTrap = e => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();    // Shift-Tab on first → loop to last
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();   // Tab on last → loop to first
      }
    };
    modal.addEventListener('keydown', modal.__focusTrap);
  }
  
  function untrapFocus(modal) {
    if (!modal) return;
    if (modal.__focusTrap) {
      modal.removeEventListener('keydown', modal.__focusTrap);
      delete modal.__focusTrap;
    }
  }
  
  /**
 *  Enable keyboard helpers for a modal.
 *
 *  ⏎  – clicks `saveBtn` (if present **and enabled**);  
 *        otherwise runs `closeFn` or falls back to the modal’s .close-btn
 *  ⎋  – always closes (via .close-btn if present)
 *
 *  Call this **after** the modal has been inserted/shown.
 */
  function enableModalKeys(modal,
                              saveBtn           = null,
                              closeFn           = null,
                              allowInputReturn  = false) {
  trapFocus(modal);

    /* make sure *something* inside the modal has focus so
     the keydown listener you’re about to add will fire      */
  if (!getFocusable(modal).length) {
    /* allow the element itself to receive focus once */
    if (!modal.hasAttribute('tabindex')) modal.setAttribute('tabindex', '-1');
    modal.focus();
  }


  modal.__enterHandler = e => {
    if (e.key === 'Enter') {
      if (e.target.closest('.ck-content') || e.target.closest('.ck')) return;
      /* ignore when user is actively typing */
      const tag = (e.target.tagName || '').toUpperCase();
      const isTextarea   = tag === 'TEXTAREA';
      const isTextInput  = tag === 'INPUT' &&
        /text|number|email|search|password|url|tel/i.test(e.target.type);
      const isLineListInput = Boolean(
        e.target.closest?.('.line-list-editor')
        || e.target.isContentEditable
      );

      const isTyping = isTextarea || isLineListInput || (isTextInput && !allowInputReturn);

      if (!isTyping) {
        e.preventDefault();

        /* 1️⃣  try to save */
        if (saveBtn && !saveBtn.disabled) {
          saveBtn.click();

        /* 2️⃣  otherwise close/cancel */
        } else if (typeof closeFn === 'function') {
          closeFn();
        } else {
          modal.querySelector('.close-btn')?.click();
        }
      }

    } else if (e.key === 'Escape') {
      modal.querySelector('.close-btn')?.click();
    }
  };

  modal.addEventListener('keydown', modal.__enterHandler);

    /* auto-focus the first focusable element (if we have any) */
  requestAnimationFrame(() => {
    const first = getFocusable(modal)[0];
    if (first) first.focus();
  });
}
  
function disableModalKeys(modal) {
  if (!modal) return;
  untrapFocus(modal);
  if (modal.__enterHandler) {
    modal.removeEventListener('keydown', modal.__enterHandler);
    delete modal.__enterHandler;
  }
}

function focusAndSelectTextInput(input) {
  if (!input) return;

  requestAnimationFrame(() => {
    if (!input.isConnected || input.disabled) return;

    input.focus();
    if (typeof input.select === "function") {
      input.select();
    }
  });
}

const OPTION_EDITOR_DRAG_GUARD_SELECTORS = [
  "#componentGroupSection",
  "#optionsSection",
  "#surveySection",
  "#optionsModal",
  "#surveyOptionsModal",
  "#optionsTagContainer",
  "#surveyOptionsTagContainer"
];

function blockDragDropForElement(element) {
  if (!element || element.dataset.dragDropGuardInstalled === "true") return;

  element.dataset.dragDropGuardInstalled = "true";
  element.setAttribute("draggable", "false");

  ["dragstart", "dragenter", "dragover", "drop"].forEach((eventName) => {
    element.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "none";
      }
    });
  });
}

function installOptionEditorDragDropGuards(root = document) {
  if (!root || typeof root.querySelectorAll !== "function") return;

  OPTION_EDITOR_DRAG_GUARD_SELECTORS.forEach((selector) => {
    root.querySelectorAll(selector).forEach(blockDragDropForElement);
  });
}

installOptionEditorDragDropGuards();
  

// If you rely on getSurveyQuestions / getSurveyOptions, keep them:
function getSurveyQuestions() {
  const container = document.getElementById("surveyQuestionsTagContainerUnified");
  if (!container) return [];
  return Array.from(container.querySelectorAll('.tag-bubble')).map(tag => tag.textContent.trim());
}

function getSurveyOptions() {
  const container = document.getElementById("surveyOptionsTagContainerUnified");
  if (!container) return [];
  return Array.from(container.querySelectorAll('.tag-bubble')).map(tag => tag.textContent.trim());
}

let _presetDetailedOptions = null;
let _presetRadioOptions = null; 
let _listStyleOriginalParent = null;
let _listStyleOriginalNextSibling = null;

function rememberListStyleContainerPosition(container) {
  if (!container || _listStyleOriginalParent) return;
  _listStyleOriginalParent = container.parentNode || null;
  _listStyleOriginalNextSibling = container.nextSibling || null;
}

function restoreListStyleContainerPosition(container) {
  if (!container || !_listStyleOriginalParent) return;

  if (_listStyleOriginalNextSibling && _listStyleOriginalNextSibling.parentNode === _listStyleOriginalParent) {
    _listStyleOriginalParent.insertBefore(container, _listStyleOriginalNextSibling);
    return;
  }

  _listStyleOriginalParent.appendChild(container);
}
/**************************************************************
 *  Conditional Logic Modals
 **************************************************************/
function openConditionalModal(relativePath) {
  // If the user was in the old "component options" modal, close it
  closeComponentOptionsModal();

  const modal = document.getElementById("conditionalModal");
  const overlay = document.getElementById("overlay");
  disableModalKeys(modal);
  if (!modal || !overlay) return;

  const targetContext = getConditionalTargetContextInSelectedContainer(relativePath);
  const targetComponent = targetContext?.targetComponent || null;
  const sourceComponent = targetContext?.sourceComponent || targetComponent;
  const usesColumnWrapper = !!targetContext?.usesColumnWrapper;

  if (!targetComponent) {
    showNotification("Component not found!");
    return;
  }

  const existingConditional =
    targetComponent.conditional ||
    (usesColumnWrapper && sourceComponent !== targetComponent
      ? sourceComponent?.conditional || null
      : null);
  let selectedKey = existingConditional ? existingConditional.when : null;
  let selectedValue = existingConditional ? existingConditional.eq : null;

  const saveBtn = document.getElementById("saveConditionalLogicBtn");
  if (saveBtn) saveBtn.disabled = true;
  const clearBtn = document.getElementById("clearConditionalLogicBtn");
  const backBtn = document.getElementById("backFromConditionalBtn");
  const whenKeyCards = document.getElementById("whenKeyCards");
  const eqValueCards = document.getElementById("eqValueCards");
  const whenKeySearch = document.getElementById("whenKeySearch");
  const eqValueSearch = document.getElementById("eqValueSearch");
  const allComponents = getAllComponents(formJSON.components);
  const conditionalSourceComponent = sourceComponent || targetComponent;
  const availableTriggerComponents = allComponents.filter(component => component !== conditionalSourceComponent);

  if (
    selectedKey &&
    !availableTriggerComponents.some(
      component => String(component?.key || "") === String(selectedKey || "")
    )
  ) {
    selectedKey = null;
    selectedValue = null;
  }

  function getSelectedTriggerComponent() {
    return availableTriggerComponents.find(
      component => String(component.key || "") === String(selectedKey || "")
    ) || null;
  }

  function renderTriggerCards() {
    populateTriggeringComponentCards(
      selectedKey,
      whenKeySearch ? whenKeySearch.value : "",
      component => {
        selectedKey = String(component?.key || "");
        selectedValue = null;
        if (eqValueSearch) eqValueSearch.value = "";
        renderValueCards(component);
        validateSelections();
      },
      availableTriggerComponents
    );
  }

  function renderValueCards(component = getSelectedTriggerComponent()) {
    populateTriggerValueCards(
      component,
      selectedValue,
      eqValueSearch ? eqValueSearch.value : "",
      value => {
        selectedValue = value;
        validateSelections();
      }
    );
  }

  if (whenKeySearch) {
    whenKeySearch.value = "";
    whenKeySearch.oninput = () => renderTriggerCards();
  }

  if (eqValueSearch) {
    eqValueSearch.value = "";
    eqValueSearch.oninput = () => renderValueCards();
  }

  renderTriggerCards();
  renderValueCards();


  function validateSelections() {
    if (!saveBtn) return;
    const hasKey = Boolean(selectedKey);
    const hasValue = selectedValue !== null && selectedValue !== undefined;
    saveBtn.disabled = !(hasKey && hasValue);
  }

  if (whenKeyCards) {
    whenKeyCards.onclick = validateSelections;
    whenKeyCards.onkeydown = e => {
      if (e.key !== "Enter" && e.key !== " ") return;
      requestAnimationFrame(validateSelections);
    };
  }
  if (eqValueCards) {
    eqValueCards.onclick = validateSelections;
    eqValueCards.onkeydown = e => {
      if (e.key !== "Enter" && e.key !== " ") return;
      requestAnimationFrame(validateSelections);
    };
  }
  validateSelections();


  if (saveBtn) {
    saveBtn.onclick = () => {
      const whenKey = selectedKey;
      const eqValue = selectedValue;

      if (!whenKey || eqValue === null || eqValue === undefined) {
        showNotification("Please select both a triggering component and a trigger value.");
        return;
      }

      // Save event for conditional logic:
      targetComponent.conditional = {
        when: whenKey,
        eq: eqValue,
        show: true
      };
      if (usesColumnWrapper && sourceComponent && sourceComponent !== targetComponent) {
        delete sourceComponent.conditional;
      }

      closeConditionalModal();
      if (typeof window.updatePreview === "function") {
        window.updatePreview();
      }
      showNotification("Conditional logic saved!");
    };
  }

  if (clearBtn) {
    clearBtn.onclick = () => {
      delete targetComponent.conditional;
      if (usesColumnWrapper && sourceComponent && sourceComponent !== targetComponent) {
        delete sourceComponent.conditional;
      }
      closeConditionalModal();
      if (typeof window.updatePreview === "function") {
        window.updatePreview();
      }
    };
  }

  if (backBtn) {
    backBtn.onclick = () => {
      closeConditionalModal();
      openComponentOptionsModal(relativePath);
    };
  }

  modal.style.display = "flex";
  showSharedOverlay(overlay);
  enableModalKeys(
      modal,               
      null,                
      closeConditionalModal 
    );
  requestAnimationFrame(() => whenKeySearch?.focus());
}

function closeConditionalModal() {
  const modal = document.getElementById("conditionalModal");
  const overlay = document.getElementById("overlay");
  disableModalKeys(modal);
  if (modal) modal.style.display = "none";
  hideSharedOverlay(overlay);
}


function getComponentByPathInSelectedContainer(pathStr) {
  if (pathStr === null || pathStr === undefined) return null;

  const parts = String(pathStr)
    .split(".")
    .map(Number)
    .filter(Number.isFinite);
  if (!parts.length) return null;

  const rootArray =
    typeof getSelectedContainerComponents === "function"
      ? getSelectedContainerComponents()
      : [];
  let comp = rootArray[parts[0]] || null;

  for (let i = 1; i < parts.length && comp; i++) {
    const idx = parts[i];

    if (comp.type === "columns") {
      comp = comp.columns?.[idx]?.components?.[0] || null;
    } else if (Array.isArray(comp.components)) {
      comp = comp.components[idx] || null;
    } else {
      comp = null;
    }
  }

  return comp;
}

function getConditionalTargetContextInSelectedContainer(pathStr) {
  if (pathStr === null || pathStr === undefined) return null;

  const parts = String(pathStr)
    .split(".")
    .map(Number)
    .filter(Number.isFinite);
  if (!parts.length) return null;

  const rootArray =
    typeof getSelectedContainerComponents === "function"
      ? getSelectedContainerComponents()
      : [];
  const rootComponent = rootArray[parts[0]] || null;
  if (!rootComponent) return null;

  if (parts.length === 1) {
    return {
      sourceComponent: rootComponent,
      targetComponent: rootComponent,
      usesColumnWrapper: false
    };
  }

  if (parts.length === 2 && rootComponent.type === "columns") {
    const sourceComponent = rootComponent.columns?.[parts[1]]?.components?.[0] || null;
    if (!sourceComponent) return null;

    return {
      sourceComponent,
      targetComponent: rootComponent,
      usesColumnWrapper: true
    };
  }

  const sourceComponent = getComponentByPathInSelectedContainer(pathStr);
  if (!sourceComponent) return null;

  return {
    sourceComponent,
    targetComponent: sourceComponent,
    usesColumnWrapper: false
  };
}

function appendConditionalCardContent(card, titleText, metaText = "") {
  const content = document.createElement("div");
  content.className = "conditional-choice-card__body";

  const title = document.createElement("span");
  title.className = "conditional-choice-card__title calc-field-label";
  title.textContent = titleText;
  content.appendChild(title);

  if (metaText) {
    const meta = document.createElement("span");
    meta.className = "conditional-choice-card__meta";
    meta.textContent = metaText;
    content.appendChild(meta);
  }

  card.appendChild(content);
}

/**
 * Populate possible "Triggering Component" cards
 */
function populateTriggeringComponentCards(selectedKey = null, filterValue = "", onSelect = null, availableComponents = null) {
  const container = document.getElementById("whenKeyCards");
  if (!container) return;
  container.innerHTML = "";

  const allowedTypes = ["select", "selectboxes", "radio"];
  const componentPool = Array.isArray(availableComponents)
    ? availableComponents
    : getAllComponents(formJSON.components);
  const allComponentsList = componentPool.filter(c => allowedTypes.includes(c.type));
  const query = String(filterValue || "").trim().toLowerCase();

  if (!allComponentsList.length) {
    const empty = document.createElement("div");
    empty.className = "calc-empty";
    empty.textContent = "No select/radio components available for triggers.";
    container.appendChild(empty);
    return;
  }

  const filteredComponents = allComponentsList.filter(component => {
    const key = String(component.key || "");
    const label = String(component.label || component.key || "[No Label]");
    return !query || label.toLowerCase().includes(query) || key.toLowerCase().includes(query);
  });

  if (!filteredComponents.length) {
    const empty = document.createElement("div");
    empty.className = "calc-empty";
    empty.textContent = "No matching trigger components.";
    container.appendChild(empty);
    return;
  }

  filteredComponents.forEach(component => {
    const key = String(component.key || "");
    const label = String(component.label || component.key || "[No Label]");

    const card = document.createElement("div");
    card.classList.add("card", "conditional-trigger-card", "conditional-choice-card", "calc-field-card");
    card.setAttribute("data-key", key);
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-pressed", "false");
    card.setAttribute("aria-label", label ? `Select trigger field ${label}` : "Select trigger field");
    appendConditionalCardContent(card, label);

    if (selectedKey && component.key === selectedKey) {
      card.classList.add("selected");
      card.setAttribute("aria-pressed", "true");
    }

    const chooseCard = () => {
      document.querySelectorAll("#whenKeyCards .card").forEach(x => {
        x.classList.remove("selected");
        x.setAttribute("aria-pressed", "false");
      });
      card.classList.add("selected");
      card.setAttribute("aria-pressed", "true");
      if (typeof onSelect === "function") {
        onSelect(component);
        return;
      }
      const eqValueContainer = document.getElementById("eqValueCards");
      if (eqValueContainer) eqValueContainer.innerHTML = "";
      populateTriggerValueCards(component, null);
    };

    card.addEventListener("click", chooseCard);
    card.addEventListener("keydown", e => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      chooseCard();
    });
    container.appendChild(card);
  });
}

function populateTriggerValueCards(selectedComponent, existingEqValue = null, filterValue = "", onSelect = null) {
  const container = document.getElementById("eqValueCards");
  if (!container) return;
  container.innerHTML = "";

  if (!selectedComponent) {
    const empty = document.createElement("div");
    empty.className = "calc-empty";
    empty.textContent = "Select a triggering component to see values.";
    container.appendChild(empty);
    return;
  }

  let valuesArray = [];
  if (selectedComponent.data && Array.isArray(selectedComponent.data.values)) {
    valuesArray = selectedComponent.data.values;
  } else if (selectedComponent.values && Array.isArray(selectedComponent.values)) {
    valuesArray = selectedComponent.values;
  }
  const query = String(filterValue || "").trim().toLowerCase();

  if (!valuesArray.length) {
    const empty = document.createElement("div");
    empty.className = "calc-empty";
    empty.textContent = "This trigger component has no selectable values.";
    container.appendChild(empty);
    return;
  }

  const filteredValues = valuesArray.filter(v => {
    const rawValue = v && v.value !== undefined && v.value !== null ? String(v.value) : "";
    const label = v && v.label ? String(v.label) : (rawValue || "[Empty]");
    return !query || label.toLowerCase().includes(query) || rawValue.toLowerCase().includes(query);
  });

  if (!filteredValues.length) {
    const empty = document.createElement("div");
    empty.className = "calc-empty";
    empty.textContent = "No matching trigger values.";
    container.appendChild(empty);
    return;
  }

  filteredValues.forEach(v => {
    const rawValue = v && v.value !== undefined && v.value !== null ? String(v.value) : "";
    const label = v && v.label ? String(v.label) : (rawValue || "[Empty]");

    const card = document.createElement("div");
    card.classList.add("card", "conditional-value-card", "conditional-choice-card", "calc-field-card");
    card.setAttribute("data-value", rawValue);
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-pressed", "false");
    card.setAttribute("aria-label", `Select trigger value ${label}`);
    appendConditionalCardContent(card, label);

    if (existingEqValue !== null && existingEqValue !== undefined && String(existingEqValue) === rawValue) {
      card.classList.add("selected");
      card.setAttribute("aria-pressed", "true");
    }

    const chooseCard = () => {
      document.querySelectorAll("#eqValueCards .card").forEach(x => {
        x.classList.remove("selected");
        x.setAttribute("aria-pressed", "false");
      });
      card.classList.add("selected");
      card.setAttribute("aria-pressed", "true");
      if (typeof onSelect === "function") onSelect(rawValue);
    };

    card.addEventListener("click", chooseCard);
    card.addEventListener("keydown", e => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      chooseCard();
    });

    container.appendChild(card);
  });
}

/**************************************************************
 *  Input Modal (labeling components)
 **************************************************************/
function openInputModal(callback, initialValue = "", backCallback) {
  const modal = document.getElementById("inputModal");
  const overlay = document.getElementById("overlay");
  disableModalKeys(modal);
  if (!modal || !overlay) return;

  modal.classList.add("super-top");

  const labelInput = document.getElementById("componentLabelInput");
  labelInput.value = initialValue || "";
    
  modal.style.display = "block";
  showSharedOverlay(overlay, "super-top");
  const buttonsContainer = document.getElementById("inputModalButtons");
  buttonsContainer.innerHTML = "";

  // Save
  const saveBtn = document.createElement("button");
  saveBtn.id = "inputModalSaveBtn";
  saveBtn.textContent = "Save";
  saveBtn.onclick = () => {
    const typedVal = labelInput.value.trim();
    if (!typedVal) {
      showNotification("Component label is required.");
      return;
    }
    closeInputModal();
    callback(typedVal, false);
  };
  buttonsContainer.appendChild(saveBtn);

  // Hide Label
  const hideLabelBtn = document.createElement("button");
  hideLabelBtn.id = "inputModalSaveHideLabelBtn";
  hideLabelBtn.textContent = "Hide Label";
  hideLabelBtn.onclick = () => {
    const typedVal = labelInput.value.trim();
    closeInputModal();
    callback(typedVal, true);
  };
  buttonsContainer.appendChild(hideLabelBtn);

  // Optional back button
  if (backCallback) {
    const backBtn = document.createElement("button");
    backBtn.textContent = "Back";
    backBtn.onclick = () => {
      closeInputModal();
      backCallback();
    };
    buttonsContainer.appendChild(backBtn);
  }
  enableModalKeys(modal,
          document.getElementById("surveyQuestionsModalSaveBtn"),
          null,
          true);
  focusAndSelectTextInput(labelInput);
}

function closeInputModal() {
  const modal = document.getElementById("inputModal");
  const overlay = document.getElementById("overlay");
  disableModalKeys(modal);
  if (modal) {
    modal.style.display = "none";
    modal.classList.remove("super-top");
  }
  if (overlay) {
    hideSharedOverlay(overlay);
  }
}

function dictateLabelAdvanced() {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    showNotification("Sorry, your browser doesn't support the Web Speech API.");
    return;
  }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = false;
  let currentText = "";

  recognition.onstart = () => {
    showNotification("Listening in advanced mode... say 'Replace X with Y', or just speak text.");
  };

  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript.trim();
      const match = transcript.match(/^\s*replace\s+(.+?)\s+with\s+(.+)$/i);
      if (match) {
        const oldString = match[1];
        const newString = match[2];
        const labelEl = document.getElementById("componentLabelInput");
        const original = labelEl.value;
        const re = new RegExp(oldString, "gi");
        const updated = original.replace(re, newString);
        labelEl.value = updated;
        currentText = updated;
        showNotification(`Replaced "${oldString}" with "${newString}"`);
      } else {
        currentText += " " + transcript;
        // Title-case example
        currentText = currentText.replace(/\b\w+/g, (word) =>
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        );
        document.getElementById("componentLabelInput").value = currentText.trim();
        showNotification("Text appended from speech!");
      }
    }
    recognition.stop();
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error", event);
    showNotification("Speech recognition error. Please try again.");
  };
  recognition.start();
}

/**************************************************************
 *  Options & Survey Modals
 **************************************************************/
function openOptionsModal(callback, initialTags = [], extraClass = "") {
  const modal = document.getElementById("optionsModal");
  const overlay = document.getElementById("overlay");
  disableModalKeys(modal);
  if (!modal || !overlay) return;

  if (extraClass) {
    modal.classList.add(extraClass);
  }

  const container = document.getElementById("optionsTagContainer");
  let input = document.getElementById("optionTagInput");

  // Clone to reset
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  input = newInput;
  blockDragDropForElement(container);
  blockDragDropForElement(input);

  container.querySelectorAll('.tag-bubble').forEach(tag => tag.remove());
  input.value = "";

  modal.style.display = "block";
  showSharedOverlay(overlay, extraClass);

  const getTags = setupOptionsTagInput(input, container, initialTags);

  const saveBtn = document.getElementById("optionsModalSaveBtn");
  if (saveBtn) {
    saveBtn.onclick = () => {
      const currentTags = getTags();
      closeOptionsModal(extraClass);
      callback(currentTags.map(label => ({ label })));
    };
  }
  enableModalKeys(modal, saveBtn);
}

function closeOptionsModal(extraClass = "") {
  const modal = document.getElementById("optionsModal");
  const overlay = document.getElementById("overlay");
  disableModalKeys(modal);
  if (modal) {
    modal.style.display = "none";
    if (extraClass) modal.classList.remove(extraClass);
  }
  if (overlay) {
    hideSharedOverlay(overlay);
  }
}

function setupOptionsTagInput(input, container, initialTags = []) {
  let tags = [...initialTags];

  function createTag(label) {
    const tag = document.createElement("span");
    tag.className = "tag-bubble";
    tag.textContent = label;
    tag.addEventListener("click", () => {
      tags = tags.filter(t => t !== label);
      tag.remove();
    });
    container.insertBefore(tag, input);
  }

  tags.forEach(tagLabel => createTag(tagLabel));

  input.addEventListener("keydown", (e) => {
    if (e.key === "," || e.key === "Enter") {
      e.preventDefault();
      const value = input.value.trim();
      if (value) {
        tags.push(value);
        createTag(value);
        input.value = "";
      }
    }
  });

  return () => tags;
}

function openSurveyQuestionsModal(callback, initialQuestions = [], extraClass = "") {
  const modal = document.getElementById("surveyQuestionsModal");
  const overlay = document.getElementById("overlay");
  disableModalKeys(modal);
  if (!modal || !overlay) return;

  if (extraClass) {
    modal.classList.add(extraClass);
  }

  const container = document.getElementById("surveyQuestionsTagContainer");
  let input = document.getElementById("surveyQuestionTagInput");

  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  input = newInput;

  container.querySelectorAll('.tag-bubble').forEach(tag => tag.remove());
  input.value = "";

  modal.style.display = "block";
  showSharedOverlay(overlay, extraClass);
  enableModalKeys(modal,
       document.getElementById("surveyQuestionsModalSaveBtn"));

  const getSurveyQuestionsTags = setupSurveyTagInput(container, input, initialQuestions);

  const saveBtn = document.getElementById("surveyQuestionsModalSaveBtn");
  if (saveBtn) {
    saveBtn.onclick = () => {
      const currentTags = getSurveyQuestionsTags();
      if (currentTags.length === 0) {
        showNotification("Survey questions are required.");
        return;
      }
      closeSurveyQuestionsModal(extraClass);
      callback(currentTags.map(q => ({
        label: q,
        value: _.camelCase(q)
      })));
    };
  }
}

function closeSurveyQuestionsModal(extraClass = "") {
  const modal = document.getElementById("surveyQuestionsModal");
  const overlay = document.getElementById("overlay");
  disableModalKeys(modal);
  if (modal) {
    modal.style.display = "none";
    if (extraClass) {
      modal.classList.remove(extraClass);
    }
  }
  if (overlay) {
    hideSharedOverlay(overlay);
  }
}

function openSurveyOptionsModal(callback, initialOptions = [], extraClass = "") {
  const modal = document.getElementById("surveyOptionsModal");
  const overlay = document.getElementById("overlay");
  disableModalKeys(modal);
  if (!modal || !overlay) return;

  if (extraClass) {
    modal.classList.add(extraClass);
  }

  const container = document.getElementById("surveyOptionsTagContainer");
  let input = document.getElementById("surveyOptionTagInput");

  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  input = newInput;
  blockDragDropForElement(container);
  blockDragDropForElement(input);

  container.querySelectorAll('.tag-bubble').forEach(tag => tag.remove());
  input.value = "";

  modal.style.display = "block";
  showSharedOverlay(overlay, extraClass);
  enableModalKeys(
          modal,
          document.getElementById("surveyOptionsModalSaveBtn"),
          null,
          true);

  const getSurveyOptionsTags = setupSurveyTagInput(container, input, initialOptions);

  const saveBtn = document.getElementById("surveyOptionsModalSaveBtn");
  if (saveBtn) {
    saveBtn.onclick = () => {
      const currentTags = getSurveyOptionsTags();
      if (currentTags.length === 0) {
        showNotification("Survey options are required.");
        return;
      }
      closeSurveyOptionsModal(extraClass);
      callback(currentTags.map(opt => ({
        label: opt,
        value: _.camelCase(opt)
      })));
    };
  }
}

function closeSurveyOptionsModal(extraClass = "") {
  const modal = document.getElementById("surveyOptionsModal");
  const overlay = document.getElementById("overlay");
  disableModalKeys(modal);
  if (modal) {
    modal.style.display = "none";
    if (extraClass) {
      modal.classList.remove(extraClass);
    }
  }
  if (overlay) {
    hideSharedOverlay(overlay);
  }
}

function setupSurveyTagInput(container, input, initialTags = []) {
  let tags = [...initialTags];

  function createTag(label) {
    const tag = document.createElement("span");
    tag.className = "tag-bubble";
    tag.textContent = label;
    tag.addEventListener("click", () => {
      tags = tags.filter(t => t !== label);
      tag.remove();
    });
    container.insertBefore(tag, input);
  }

  tags.forEach(tagLabel => createTag(tagLabel));

  input.addEventListener("keydown", (e) => {
    if (e.key === "," || e.key === "Enter") {
      e.preventDefault();
      const value = input.value.trim();
      if (value) {
        tags.push(value);
        createTag(value);
        input.value = "";
      }
    }
  });

  return () => tags;
}

/**************************************************************
 *  "Component Options" Modal Closing
 **************************************************************/
function closeComponentOptionsModal() {
  const modal = document.getElementById("componentOptionsModal");
  const overlay = document.getElementById("overlay");
  disableModalKeys(modal);
  if (modal) {
    modal.style.display = "none";
  }
  if (overlay) {
    hideSharedOverlay(overlay);
  }
}
window.closeComponentOptionsModal = closeComponentOptionsModal;

/**************************************************************
 *  Disclaimer Modal
 **************************************************************/
function openDisclaimerModal(callback, initialContent = "", extraClass = "") {
  const modal = document.getElementById("disclaimerModal");
  const overlay = document.getElementById("overlay");
  disableModalKeys(modal);
  if (!modal || !overlay) {
    console.error("Disclaimer modal or overlay not found!");
    return;
  }

  if (extraClass) {
    modal.classList.add(extraClass);
  }

  const txtArea = document.getElementById("disclaimerTextArea");
  if (txtArea) {
    txtArea.value = stripHtmlTags(initialContent);
  }

  modal.style.display = "block";
  showSharedOverlay(overlay, extraClass);
  enableModalKeys(modal,
          document.getElementById("saveDisclaimerBtn"),
          null,
          true);
    

  const saveBtn = document.getElementById("saveDisclaimerBtn");
  if (saveBtn) {
    saveBtn.onclick = () => {
      const disclaimerContent = txtArea.value.trim();
      closeDisclaimerModal(extraClass);
      if (callback && typeof callback === "function") {
        callback(disclaimerContent);
      }
    };
  }
}
window.openDisclaimerModal = openDisclaimerModal;

function closeDisclaimerModal(extraClass = "") {
  const modal = document.getElementById("disclaimerModal");
  const overlay = document.getElementById("overlay");
  disableModalKeys(modal);
  if (modal) {
    modal.style.display = "none";
    if (extraClass) {
      modal.classList.remove(extraClass);
    }
  }
  if (overlay) {
    hideSharedOverlay(overlay);
  }
}
window.closeDisclaimerModal = closeDisclaimerModal;

function stripHtmlTags(html) {
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;
  return tempDiv.textContent || tempDiv.innerText || "";
}



/**************************************************************
 *  Unified Label & Options Modal
 **************************************************************/
function openLabelOptionsModal(
  callback,
  type,
  initialLabel = "",
  initialOptions = [],
  initialDisclaimer = "",
  initialSurveyQuestions = [],
  initialSurveyOptions = [],
  initialHideLabel = false,
  initialRequired = true,
  initialRows,
  initialDTMode = "datetime", 
  initialStyleOrDT = "select",
  initialActionsEnabled = false,
  initialSpeedLabels = [],
  initialSpeedValues = [],
  initialDefault,
  initialPassMark,
  initialEditGridConfig,
  initialDateTimeModeManual = false,
  initialNumericStyleManual = false,
  initialComponentGroupMode = "survey",
  initialComponentGroupItems = [],
  initialComponentGroupResponses = []
) {
  const modal = document.getElementById("labelOptionsModal");
  const modalTitle = document.getElementById("labelOptionsModalTitle");
  disableModalKeys(modal);
  const isDateTimeFamilyType = ["datetime", "date", "time"].includes(type);
  let selectedDTMode =
    initialDTMode ||
    (type === "date" || type === "time" ? type : "datetime");
  let dtModeManuallySelected = !!initialDateTimeModeManual;
  if (!modal) {
    showNotification("Missing #labelOptionsModal in DOM!");
    return;
  }
  _presetDetailedOptions = null;
  _presetRadioOptions = null;

  const QUICK_PRESETS = {
    yesNoNa: {
      survey: [
        { label:'Yes', value:'yes', tooltip:'', flag:'success' },
        { label:'No',  value:'no',  tooltip:'', flag:'danger'  },
        { label:'N/A', value:'nA',  tooltip:'', flag:''        }
      ],
      radio: [
        { label:'Yes', value:'yes', shortcut:'', flag:'success' },
        { label:'No',  value:'no',  shortcut:'', flag:'danger'  },
        { label:'N/A', value:'nA',  shortcut:'', flag:''        }
      ]
    },
    passFailNa: {
      survey: [
        { label:'Pass', value:'pass', tooltip:'', flag:'success' },
        { label:'Fail', value:'fail', tooltip:'', flag:'danger'  },
        { label:'N/A',  value:'nA',   tooltip:'', flag:''        }
      ],
      radio: [
        { label:'Pass', value:'pass', shortcut:'', flag:'success' },
        { label:'Fail', value:'fail', shortcut:'', flag:'danger'  },
        { label:'N/A',  value:'nA',   shortcut:'', flag:''        }
      ]
    },
    safeRiskNa: {
      survey: [
        { label:'Safe',    value:'safe',   tooltip:'', flag:'success' },
        { label:'At Risk', value:'atRisk', tooltip:'', flag:'danger'  },
        { label:'N/A',     value:'nA',     tooltip:'', flag:''        }
      ],
      radio: [
        { label:'Safe',    value:'safe',   shortcut:'', flag:'success' },
        { label:'At Risk', value:'atRisk', shortcut:'', flag:'danger'  },
        { label:'N/A',     value:'nA',     shortcut:'', flag:''        }
      ]
    }
  };

  function quickToken(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  const QUICK_PRESET_SIGNATURES = Object.fromEntries(
    Object.entries(QUICK_PRESETS).map(([key, preset]) => [
      preset.radio.map(item => quickToken(item.label)).filter(Boolean).join("|"),
      key
    ])
  );

  function detectQuickPreset(labels = []) {
    const signature = labels.map(quickToken).filter(Boolean).join("|");
    return QUICK_PRESET_SIGNATURES[signature] || null;
  }

  function getSurveyPreset(labels = []) {
    const kind = detectQuickPreset(labels);
    const preset = kind ? QUICK_PRESETS[kind]?.survey : null;
    return preset ? preset.map(item => ({ ...item })) : null;
  }

  function getRadioPreset(labels = []) {
    const kind = detectQuickPreset(labels);
    const preset = kind ? QUICK_PRESETS[kind]?.radio : null;
    return preset ? preset.map(item => ({ ...item })) : null;
  }

  function getPresetCardLabels(card) {
    return String(card?.dataset?.options || "")
      .split(",")
      .map(option => String(option || "").trim())
      .filter(Boolean);
  }

  function hasMatchingPresetLabels(labels = [], presetLabels = []) {
    return labels.length === presetLabels.length
      && labels.every((label, index) => quickToken(label) === quickToken(presetLabels[index]));
  }

  function findMatchingPresetCard(presetRow, labels = []) {
    const expectedLabels = labels
      .map(label => String(label || "").trim())
      .filter(Boolean);

    if (!presetRow || !expectedLabels.length) return null;

    return Array.from(presetRow.querySelectorAll(".preset-card")).find(card =>
      hasMatchingPresetLabels(expectedLabels, getPresetCardLabels(card))
    ) || null;
  }

  function stripRequiredMarker(label) {
    const cleaned = String(label || "")
      .replace(/\u00a0/g, " ")
      .trim();

    if (!cleaned) return "";

    if (/^\*?\s*required\.?$/i.test(cleaned)) {
      return "";
    }

    return cleaned
      .replace(/\s*\*?\s*required\.?$/i, "")
      .replace(/\s*[-|]\s*$/, "")
      .trim();
  }

  function normalizeSurveyQuestionLabel(label) {
    const cleaned = stripRequiredMarker(label)
      .replace(/([A-Za-z0-9])\s*\/\s*([A-Za-z0-9])/g, "$1 / $2")
      .replace(/\s{2,}/g, " ")
      .trim();
    return typeof window.normalizeAllCapsTitle === "function"
      ? window.normalizeAllCapsTitle(cleaned)
      : cleaned;
  }

  function normalizeOptionLabel(label) {
    const cleaned = stripRequiredMarker(label)
      .replace(/\s{2,}/g, " ")
      .trim();
    return typeof window.normalizeAllCapsTitle === "function"
      ? window.normalizeAllCapsTitle(cleaned)
      : cleaned;
  }

  function resolveInitialComponentLabel() {
    const typedInitialLabel = String(initialLabel || "").trim();
    if (typedInitialLabel || type !== "survey") {
      return typedInitialLabel;
    }

    if (selectedFieldsetKey === "root" || typeof findFieldsetByKey !== "function") {
      return "";
    }

    const rootComponents = Array.isArray(window.formJSON?.components)
      ? window.formJSON.components
      : [];
    const container = findFieldsetByKey(rootComponents, selectedFieldsetKey);
    if (!container || container.builderHidden || container.type !== "fieldset") {
      return "";
    }

    const sectionLabel = String(container.label || container.legend || "").trim();
    if (!sectionLabel) {
      return "";
    }

    return typeof window.normalizeComponentLabel === "function"
      ? window.normalizeComponentLabel(sectionLabel, container.type)
      : sectionLabel;
  }



  const numDefaultSection = document.getElementById('numberDefaultSection');
  const numDefaultInput   = document.getElementById('numberDefaultInput');
  const editGridSection = document.getElementById("editGridSection");
  const editGridActionsRow = document.getElementById("editGridFooterActions");
  const editGridAddAnotherInput = document.getElementById("editGridAddAnotherInput");
  const editGridRowBuilder = document.getElementById("editGridRowBuilder");
  const editGridAddRowBtn = document.getElementById("editGridAddRowBtn");
  const editGridClearLayoutBtn = document.getElementById("editGridClearLayoutBtn");
  let editGridRowsState = [];
  let refreshEditGridSaveState = () => {};
  const EDITGRID_ROW_COMPONENT_LIMIT = 8;
  const EDITGRID_ROW_WIDTH_LIMIT = 12;

  function sanitizeEditGridRows(rows = []) {
    return (rows || [])
      .map(row => (row || [])
        .map(span => Math.max(1, Math.min(12, Math.round(Number(span) || 1))))
        .filter(Boolean))
      .filter(row => row.length);
  }

  function editGridRowsFromLayout(layout) {
    if (!layout) return [];
    return Object.keys(layout)
      .map(key => Number(key))
      .filter(key => Number.isInteger(key) && key > 0)
      .sort((a, b) => a - b)
      .map(key => {
        const row = Array.isArray(layout[key]) ? layout[key] : layout[String(key)];
        return Array.isArray(row) ? row.slice() : [];
      });
  }

  function editGridLayoutFromRows(rows) {
    const layout = {};
    sanitizeEditGridRows(rows).forEach((row, index) => {
      layout[index + 1] = row.slice();
    });
    return layout;
  }

  function summarizeEditGridRows(rows) {
    const cleaned = sanitizeEditGridRows(rows);
    if (!cleaned.length) {
      return {
        rowCount: 0,
        colCount: 0,
        isUniform: false,
        hasOnlyUnitWidths: false
      };
    }

    const firstColCount = cleaned[0].length;
    const isUniform = cleaned.every(row => row.length === firstColCount);
    const hasOnlyUnitWidths = cleaned.every(row => row.every(span => span === 1));

    return {
      rowCount: cleaned.length,
      colCount: isUniform ? firstColCount : 0,
      isUniform,
      hasOnlyUnitWidths
    };
  }

  function applyEditGridRowSelection(rowIndex, cols) {
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= editGridRowsState.length) return;
    if (!cols) return;
    editGridRowsState[rowIndex] = Array.from({ length: cols }, () => 1);
    renderEditGridBuilder();
  }

  function setEditGridComponentWidth(rowIndex, componentIndex, width) {
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= editGridRowsState.length) return;
    if (!Number.isInteger(componentIndex) || componentIndex < 0) return;

    const row = editGridRowsState[rowIndex];
    if (!Array.isArray(row) || componentIndex >= row.length) return;

    row[componentIndex] = Math.max(1, Math.min(EDITGRID_ROW_WIDTH_LIMIT, Math.round(Number(width) || 1)));
    renderEditGridBuilder();
  }

  function bindEditGridAction(button, handler) {
    if (!button || typeof handler !== "function") return;

    button.onpointerdown = event => {
      event.preventDefault();
      event.stopPropagation();
      handler();
    };

    button.onclick = event => {
      if (event.detail !== 0) {
        event.preventDefault();
        return;
      }
      handler();
    };
  }

  function syncEditGridRowsState() {
    editGridRowsState = sanitizeEditGridRows(editGridRowsState);
    refreshEditGridSaveState();
  }

  function renderEditGridBuilder() {
    if (!editGridRowBuilder) return;
    editGridRowsState = sanitizeEditGridRows(editGridRowsState);
    editGridRowBuilder.replaceChildren();

    if (!editGridRowsState.length) {
      const empty = document.createElement("div");
      empty.className = "editgrid-builder-empty";
      empty.textContent = "No rows yet. Click Add Row to create the first row.";
      editGridRowBuilder.appendChild(empty);
      syncEditGridRowsState();
      return;
    }

    editGridRowsState.forEach((row, rowIndex) => {
      const hasCustomWidths = row.some(span => span !== 1);
      const rowCard = document.createElement("div");
      rowCard.className = "editgrid-row-card";

      const rowHead = document.createElement("div");
      rowHead.className = "editgrid-row-head";

      const rowMeta = document.createElement("div");
      rowMeta.className = "editgrid-row-meta";

      const rowTitle = document.createElement("div");
      rowTitle.className = "editgrid-row-title";
      rowTitle.textContent = `Row ${rowIndex + 1}`;

      const rowSummary = document.createElement("div");
      rowSummary.className = "editgrid-row-summary";
      rowSummary.textContent =
        `${row.length} component${row.length === 1 ? "" : "s"}${hasCustomWidths ? " • custom widths" : " • equal widths"}`;

      rowMeta.append(rowTitle, rowSummary);

      const rowTools = document.createElement("div");
      rowTools.className = "editgrid-row-tools";

      const removeRowBtn = document.createElement("button");
      removeRowBtn.type = "button";
      removeRowBtn.className = "editgrid-remove-btn";
      removeRowBtn.innerHTML = `<i class="fa-solid fa-trash-can"></i><span>Remove Row</span>`;
      removeRowBtn.onclick = () => {
        editGridRowsState.splice(rowIndex, 1);
        renderEditGridBuilder();
      };

      rowTools.append(removeRowBtn);
      rowHead.append(rowMeta, rowTools);

      const rowBody = document.createElement("div");
      rowBody.className = "editgrid-row-body";

      const pickerBlock = document.createElement("div");
      pickerBlock.className = "editgrid-row-layout-block";

      const picker = document.createElement("div");
      picker.className = "editgrid-row-selector";

      const activeCols = row.length;
      for (let col = 1; col <= EDITGRID_ROW_COMPONENT_LIMIT; col++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "editgrid-row-selector-cell";
        cell.draggable = false;
        if (col <= activeCols) {
          cell.classList.add("is-active");
        }

        cell.setAttribute("aria-label", `Set row ${rowIndex + 1} to ${col} component${col === 1 ? "" : "s"}`);
        cell.setAttribute("aria-pressed", col <= activeCols ? "true" : "false");
        bindEditGridAction(cell, () => applyEditGridRowSelection(rowIndex, col));

        picker.appendChild(cell);
      }

      const widthSection = document.createElement("div");
      widthSection.className = "editgrid-width-section";

      const widthSectionTitle = document.createElement("div");
      widthSectionTitle.className = "editgrid-width-section-title";
      widthSectionTitle.textContent = "Widths";

      const widthChips = document.createElement("div");
      widthChips.className = "editgrid-width-chip-list";

      row.forEach((span, componentIndex) => {
        const widthChip = document.createElement("div");
        widthChip.className = "editgrid-width-chip";

        const widthLabel = document.createElement("span");
        widthLabel.className = "editgrid-width-chip-label";
        widthLabel.textContent = `C${componentIndex + 1}`;

        const widthStepper = document.createElement("div");
        widthStepper.className = "editgrid-width-stepper";

        const decreaseBtn = document.createElement("button");
        decreaseBtn.type = "button";
        decreaseBtn.className = "editgrid-width-step-btn";
        decreaseBtn.textContent = "-";
        decreaseBtn.disabled = span <= 1;
        decreaseBtn.setAttribute("aria-label", `Decrease width for component ${componentIndex + 1} in row ${rowIndex + 1}`);
        bindEditGridAction(decreaseBtn, () => setEditGridComponentWidth(rowIndex, componentIndex, span - 1));

        const widthValue = document.createElement("span");
        widthValue.className = "editgrid-width-value";
        widthValue.textContent = `${span}x`;

        const increaseBtn = document.createElement("button");
        increaseBtn.type = "button";
        increaseBtn.className = "editgrid-width-step-btn";
        increaseBtn.textContent = "+";
        increaseBtn.disabled = span >= EDITGRID_ROW_WIDTH_LIMIT;
        increaseBtn.setAttribute("aria-label", `Increase width for component ${componentIndex + 1} in row ${rowIndex + 1}`);
        bindEditGridAction(increaseBtn, () => setEditGridComponentWidth(rowIndex, componentIndex, span + 1));

        widthStepper.append(decreaseBtn, widthValue, increaseBtn);
        widthChip.append(widthLabel, widthStepper);
        widthChips.appendChild(widthChip);
      });

      const pickerFooter = document.createElement("div");
      pickerFooter.className = "editgrid-row-picker-footer";
      pickerFooter.textContent = `Widths: ${row.join(" / ")}`;

      pickerBlock.append(picker, pickerFooter);
      widthSection.append(widthSectionTitle, widthChips);
      rowBody.append(pickerBlock, widthSection);

      rowCard.append(rowHead, rowBody);
      editGridRowBuilder.appendChild(rowCard);
    });

    syncEditGridRowsState();
  }

  if (modalTitle) {
    modalTitle.textContent =
      type === "editgrid"
        ? "Configure Custom Table"
        : type === "componentGroup"
          ? "Configure Question Group"
          : "Configure Component";
  }
  

  // Create a new overlay
  const overlay = createOverlay(1999);
  modal.classList.add("super-top");
  modal.dataset.modalType = type;

  // Show/hide sections depending on type
document.getElementById("optionsSection").style.display =
  ["radio","select","selectboxes","choiceList"].includes(type)
    ? "block" : "none";

  document.getElementById("disclaimerSection").style.display =
    (type === "disclaimer") ? "flex" : "none";

  document.getElementById("surveySection").style.display =
    (type === "survey") ? "block" : "none";

  document.getElementById("componentGroupSection").style.display =
    (type === "componentGroup") ? "block" : "none";

  document.getElementById("dateTimeModeContainer").style.display =
    isDateTimeFamilyType ? "block" : "none";

  document.getElementById("speedSection").style.display =
  (type === "speed") ? "block" : "none";

  document.getElementById("quizPassSection").style.display =
  type === "quiz" ? "block" : "none";

  if (editGridSection) {
    editGridSection.style.display = type === "editgrid" ? "" : "none";
  }
  if (editGridActionsRow) {
    editGridActionsRow.style.display = type === "editgrid" ? "flex" : "none";
  }

  if (numDefaultSection) numDefaultSection.style.display = 'none';
  if (numDefaultInput) numDefaultInput.value = '';


  if (type === "speed") {
    const lblTA = document.getElementById("speedLabelsInputUnified");
    const valTA = document.getElementById("speedValuesInputUnified");

    /* always start clean, then pre-fill when editing */
    lblTA.value = (initialSpeedLabels || []).join("\n");
    valTA.value = (initialSpeedValues || []).join("\n");

    _presetDetailedOptions = null;
    _presetRadioOptions    = null;       // ← important: clear also the radio preset

    /* clear any previously highlighted preset card */
    document
      .getElementById("speedPresetRow")
      ?.querySelectorAll(".preset-card")
      .forEach(c => c.classList.remove("selected"));
  }
  
  document.getElementById("rowButtonsContainer").style.display =
    type === "textarea" ? "block" : "none";

  const labelInput = document.getElementById("labelOptionsLabelInput");
  const labelCaption = document.getElementById("labelOptionsLabelCaption");
  if (labelCaption) {
    labelCaption.textContent =
      (type === "fieldset" || type === "componentGroup")
        ? "Section Name:"
        : "Component Label:";
  }
  if (labelInput) {
    labelInput.placeholder =
      (type === "fieldset" || type === "componentGroup")
        ? "Enter section name"
        : "Enter label";
  }
  if (type === "quiz") {
    document.getElementById("quizPassInput").value = Math.max(
      1,
      Number(initialPassMark ?? initialDefault ?? 1) || 1
    );
  }
  labelInput.value = resolveInitialComponentLabel();
  if (labelInput?._numAutoInferHandler) {
    labelInput.removeEventListener("input", labelInput._numAutoInferHandler);
    delete labelInput._numAutoInferHandler;
  }

  const hasInitialEditGridConfig = Boolean(initialEditGridConfig);
  const editGridConfig =
    type === "editgrid" && typeof window.resolveEditGridTemplateConfig === "function" && hasInitialEditGridConfig
      ? window.resolveEditGridTemplateConfig(initialEditGridConfig)
      : {
          rowLayout: {
            1: [1]
          },
          addAnother: "Add Another"
        };

  if (type === "editgrid") {
    if (editGridAddAnotherInput) {
      editGridAddAnotherInput.value = editGridConfig.addAnother ?? "";
    }
    editGridRowsState = editGridConfig.rowLayout
      ? editGridRowsFromLayout(editGridConfig.rowLayout)
      : [];
    if (editGridAddRowBtn) {
      editGridAddRowBtn.onclick = () => {
        editGridRowsState.push([1]);
        renderEditGridBuilder();
      };
    }
    if (editGridClearLayoutBtn) {
      editGridClearLayoutBtn.onclick = () => {
        editGridRowsState = [];
        renderEditGridBuilder();
      };
    }
    renderEditGridBuilder();
  } else {
    if (editGridAddAnotherInput) editGridAddAnotherInput.value = "";
    if (editGridRowBuilder) editGridRowBuilder.replaceChildren();
    if (editGridAddRowBtn) editGridAddRowBtn.onclick = null;
    if (editGridClearLayoutBtn) editGridClearLayoutBtn.onclick = null;
  }

  const bulkOptionsInput = document.getElementById("bulkOptionsInputUnified");
  

 // --- Hide‑label switch ---
const hideLabelSection = document.getElementById('hideLabelSection');
const hideLabelToggle  = document.getElementById('hideLabelToggle');

const presetsRow = document.getElementById("surveyOptionPresets");
if (type === "survey" && presetsRow) {
  presetsRow.style.display = "flex";
} else if (presetsRow) {
  presetsRow.style.display = "none";
}

presetsRow?.querySelectorAll(".preset-card")
           .forEach(card => card.classList.remove("selected"));
           
           if (type === "survey" && initialSurveyOptions && initialSurveyOptions.length) {
            const saved = initialSurveyOptions.map(o => (o.label || o).trim());
        
            function sameList(a, b) {
              return a.length === b.length &&
              a.every((v, i) => v.toLowerCase() === b[i].toLowerCase());
            }
        
            presetsRow.querySelectorAll(".preset-card").forEach(card => {
              const preset = card.dataset.options.split(",").map(s => s.trim());
              if (sameList(saved, preset)) {
                card.click();                    // re-use your existing click handler
              }
            });
          }

const presetRow = document.getElementById('surveyOptionPresets');
presetRow.addEventListener('click', e => {
  const card = e.target.closest('.preset-card');
  if (!card) return;

  /* visual highlight */
  presetRow.querySelectorAll('.preset-card')
           .forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');

  /* dump plain labels into the textarea */
  const surveyOptionsInput = document.getElementById('surveyOptionsInputUnified');
  surveyOptionsInput.value = card.dataset.options.split(',').join('\n');
  surveyOptionsInput.dispatchEvent(new Event("input", { bubbles: true }));

  /* remember full objects for Save button */
  const pickedSurveyPreset = getSurveyPreset(card.dataset.options.split(','));
  _presetDetailedOptions = pickedSurveyPreset;
  if (!pickedSurveyPreset) {
    _presetRadioOptions = null;
  }
});

const componentGroupItemsInput = document.getElementById("componentGroupItemsInputUnified");
const componentGroupItemsLabel = document.getElementById("componentGroupItemsLabel");
const componentGroupItemsImageStatus = document.getElementById("componentGroupItemsImageStatus");
const componentGroupPresetRow = document.getElementById("componentGroupPresetRow");
const componentGroupModeSurveyBtn = document.getElementById("componentGroupModeSurvey");
const componentGroupModeRadioBtn = document.getElementById("componentGroupModeRadio");
const componentGroupImageDropTargetConfig = OPTION_IMAGE_DROP_TARGETS.find(target => target.textareaId === "componentGroupItemsInputUnified");
let selectedComponentGroupMode = initialComponentGroupMode === "radio" ? "radio" : "survey";
let selectedComponentGroupResponseLabels =
  Array.isArray(initialComponentGroupResponses) && initialComponentGroupResponses.length
    ? initialComponentGroupResponses
        .map(option => normalizeOptionLabel(option?.label || option))
        .filter(Boolean)
    : ["Yes", "No", "N/A"];

function applyComponentGroupPresetSelection(labels = []) {
  const normalizedLabels = (labels || [])
    .map(option => normalizeOptionLabel(option))
    .filter(Boolean);

  if (!normalizedLabels.length) return;

  selectedComponentGroupResponseLabels = normalizedLabels;

  componentGroupPresetRow?.querySelectorAll(".preset-card").forEach(card => {
    const cardLabels = card.dataset.options
      .split(",")
      .map(option => normalizeOptionLabel(option))
      .filter(Boolean);

    const matchesCard = cardLabels.length === normalizedLabels.length
      && cardLabels.every((label, index) => quickToken(label) === quickToken(normalizedLabels[index]));

    card.classList.toggle("selected", matchesCard);
  });
}

function setComponentGroupMode(nextMode) {
  selectedComponentGroupMode = nextMode === "radio" ? "radio" : "survey";
  componentGroupModeSurveyBtn?.classList.toggle("selected", selectedComponentGroupMode === "survey");
  componentGroupModeRadioBtn?.classList.toggle("selected", selectedComponentGroupMode === "radio");

  if (componentGroupItemsLabel) {
    componentGroupItemsLabel.textContent =
      selectedComponentGroupMode === "survey"
        ? "Survey Labels"
        : "Radio Labels";
  }

  if (componentGroupItemsInput) {
    const isSurveyMode = selectedComponentGroupMode === "survey";
    componentGroupItemsInput.dataset.imageExtractionKind = "componentGroup";
    componentGroupItemsInput.dataset.imageExtractionItemLabel = isSurveyMode ? "survey label" : "radio label";
    componentGroupItemsInput.dataset.imageExtractionIdleMessage = isSurveyMode
      ? "Drag a screenshot here to extract survey labels."
      : "Drag a screenshot here to extract radio labels.";
    componentGroupItemsInput.dataset.imageExtractionReadyMessage = isSurveyMode
      ? "Drop the image to extract survey labels."
      : "Drop the image to extract radio labels.";
    componentGroupItemsInput.dataset.imageExtractionEmptyMessage = isSurveyMode
      ? "No survey labels were found in that image."
      : "No radio labels were found in that image.";
  }

  if (componentGroupItemsImageStatus && componentGroupItemsInput?.dataset.optionImageBusy !== "true") {
    setOptionImageDropStatus(
      componentGroupImageDropTargetConfig,
      componentGroupItemsImageStatus,
      IMAGE_EXTRACTION_ENABLED ? "" : null,
      "idle"
    );
  }

  refreshComponentGroupActionsToggleState();
}

if (type === "componentGroup") {
  if (componentGroupItemsInput) {
    componentGroupItemsInput.value = (initialComponentGroupItems || []).join("\n");
    if (componentGroupItemsInput._componentGroupPresetHandler) {
      componentGroupItemsInput.removeEventListener(
        "builder:component-group-preset",
        componentGroupItemsInput._componentGroupPresetHandler
      );
    }
  }

  setComponentGroupMode(selectedComponentGroupMode);
  resetOptionImageDropTargetState(componentGroupImageDropTargetConfig);

  if (componentGroupItemsInput) {
    const handleComponentGroupPreset = event => {
      applyComponentGroupPresetSelection(event?.detail?.labels || []);
    };
    componentGroupItemsInput._componentGroupPresetHandler = handleComponentGroupPreset;
    componentGroupItemsInput.addEventListener("builder:component-group-preset", handleComponentGroupPreset);
  }

  componentGroupModeSurveyBtn.onclick = () => setComponentGroupMode("survey");
  componentGroupModeRadioBtn.onclick = () => setComponentGroupMode("radio");

  componentGroupPresetRow?.querySelectorAll(".preset-card")
    .forEach(card => card.classList.remove("selected"));

  componentGroupPresetRow.onclick = event => {
    const card = event.target.closest(".preset-card");
    if (!card) return;

    applyComponentGroupPresetSelection(
      card.dataset.options
        .split(",")
        .map(option => normalizeOptionLabel(option))
        .filter(Boolean)
    );
  };

  const initialPresetKey = detectQuickPreset(selectedComponentGroupResponseLabels);
  if (initialPresetKey) {
    applyComponentGroupPresetSelection(
      QUICK_PRESETS[initialPresetKey].radio.map(option => option.label)
    );
  }
} else {
  if (componentGroupItemsInput?._componentGroupPresetHandler) {
    componentGroupItemsInput.removeEventListener(
      "builder:component-group-preset",
      componentGroupItemsInput._componentGroupPresetHandler
    );
    delete componentGroupItemsInput._componentGroupPresetHandler;
  }
  componentGroupModeSurveyBtn?.classList.remove("selected");
  componentGroupModeRadioBtn?.classList.remove("selected");
  componentGroupPresetRow?.querySelectorAll(".preset-card")
    .forEach(card => card.classList.remove("selected"));
}



/* ----- Field-set preset row ----- */
const fsPresetRow = document.getElementById("fieldsetLabelPresets");
fsPresetRow?.querySelectorAll(".preset-btn")
            .forEach(b => b.classList.remove("selected"));
if (type === "fieldset") {
  fsPresetRow.style.display = "flex";
} else {
  fsPresetRow.style.display = "none";
}

fsPresetRow?.addEventListener("click", e => {
  const btn = e.target.closest(".preset-btn");
  if (!btn) return;

  // Highlight the selected button
  fsPresetRow.querySelectorAll(".preset-btn")
             .forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");

  // Inject the label text
  labelInput.value = btn.dataset.label || btn.textContent.trim();
});

const hoverMenuToggleTypes = new Set([
  "disclaimer",
  "survey",
  "componentGroup",
  "choiceList",
  "radio",
  "select",
  "selectboxes",
  "editgrid"
]);
const supportsHideLabelToggle = !["fieldset", "speed"].includes(type);
const supportsRequiredToggle = !["disclaimer", "fieldset", "quiz"].includes(type);
const supportsActionsToggle = !["fieldset", "quiz"].includes(type);
const showHideLabelToggle =
  supportsHideLabelToggle && !hoverMenuToggleTypes.has(type);
const showRequiredToggle =
  supportsRequiredToggle && !hoverMenuToggleTypes.has(type);
const showActionsToggle =
  supportsActionsToggle && (!hoverMenuToggleTypes.has(type) || type === "componentGroup");

if (hideLabelSection) {
  hideLabelSection.style.display = showHideLabelToggle ? "block" : "none";
}

/*  <<< key line – always reset the switch >>> */
if (hideLabelToggle) {
  // Auto-enable “Hide Label” when the component type is “survey”
  hideLabelToggle.checked = (type === 'survey')
    ? true                 // default ON for new Survey components
    : !!initialHideLabel;  // keep existing state for everything else
}


  const requiredToggle = document.getElementById("requiredToggle");
  const requiredToggleSection = document.getElementById("requiredToggleSection");
  const togglesRow     = document.getElementById("togglesRow"); 

  if (togglesRow) {
    togglesRow.style.display =
      showHideLabelToggle || showRequiredToggle || showActionsToggle
        ? "flex"
        : "none";
    if (requiredToggleSection) {
      requiredToggleSection.style.display = showRequiredToggle ? "block" : "none";
    }
    if (requiredToggle) {
      requiredToggle.checked = supportsRequiredToggle ? !!initialRequired : false;
    }
  }

  const actionsToggleSection = document.getElementById('actionsToggleSection');
  const actionsToggle        = document.getElementById('actionsToggle');

  if (actionsToggleSection) {
    actionsToggleSection.style.display = showActionsToggle ? "block" : "none";
  }

if (actionsToggle) {
  actionsToggle.checked =
    initialActionsEnabled ||    // ← value passed from the caller
    Boolean(
      window._currentEditingComponent &&
      window._currentEditingComponent._actionsDriverKey
    );
}

function refreshComponentGroupActionsToggleState() {
  if (type !== "componentGroup") return;

  const showComponentGroupActions = selectedComponentGroupMode === "radio";
  const componentGroupTogglesRow = document.getElementById("togglesRow");
  const componentGroupActionsSection = document.getElementById("actionsToggleSection");
  const componentGroupActionsToggle = document.getElementById("actionsToggle");

  if (componentGroupActionsSection) {
    componentGroupActionsSection.style.display = showComponentGroupActions ? "block" : "none";
  }

  if (componentGroupActionsToggle) {
    componentGroupActionsToggle.disabled = !showComponentGroupActions;
  }

  if (componentGroupTogglesRow) {
    componentGroupTogglesRow.style.display = showComponentGroupActions ? "flex" : "none";
  }
}

refreshComponentGroupActionsToggleState();





/* ---------- Choice-List style buttons (+ Radio presets) ---------- */
const listStyleContainer = document.getElementById('listStyleContainer');
let   selectedListStyle  = initialStyleOrDT       // current visual style (select / radio / selectboxes)

/* quick-answer preset cards for Radio */
const radioPresetRow = document.getElementById('choiceRadioPresets');

/* helper → show / hide that row depending on style */
function refreshRadioPresetRow() {
  if (!radioPresetRow) return;
  const show =
        (type === 'choiceList' && selectedListStyle === 'radio')  // Radio chosen inside Choice-List
     || (type === 'radio');                                       // editing an existing Radio component
  radioPresetRow.style.display = show ? 'flex' : 'none';

  if (!show) {
    // clear highlight + any stored preset when row gets hidden
    radioPresetRow.querySelectorAll('.preset-card')
                  .forEach(c => c.classList.remove('selected'));
    _presetRadioOptions = null;
  }
}

if (type === 'choiceList' || ['select', 'radio', 'selectboxes'].includes(type)) {
  /* 1 ▸ show the three style buttons ................................*/
  listStyleContainer.style.display = 'block';

  const lsSelect      = document.getElementById('lsSelect');
  const lsRadio       = document.getElementById('lsRadio');
  const lsSelectboxes = document.getElementById('lsSelectboxes');
  const allLS         = [lsSelect, lsRadio, lsSelectboxes];

  /* 1-A  reset previous highlight */
  allLS.forEach(btn => btn.classList.remove('selected'));

  /* 1-B  if we’re EDITING an existing dropdown/radio/checkbox, pre-select its style */
  if (['select', 'radio', 'selectboxes'].includes(type)) {
    ({ select: lsSelect,
       radio:  lsRadio,
       selectboxes: lsSelectboxes }[type]).classList.add('selected');
    selectedListStyle = type;
  }

  /* 1-C  click = pick ..............................................*/
  function pick(btn, val) {
    allLS.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedListStyle = val;
    refreshRadioPresetRow();               // <- keep the preset row in sync
    bulkOptionsInput?.oninput?.();
  }

  lsSelect.onclick      = () => pick(lsSelect,      'select');
  lsRadio.onclick       = () => pick(lsRadio,       'radio');
  lsSelectboxes.onclick = () => pick(lsSelectboxes, 'selectboxes');

} else {
  /* component isn’t a Choice-List → hide everything */
  listStyleContainer.style.display = 'none';
}

/* 2 ▸ preset-card click handler (row is added in the HTML) ..........*/
if (radioPresetRow) {
  radioPresetRow.onclick = e => {
    const card = e.target.closest('.preset-card');
    if (!card) return;

    /* dump plain labels into the textarea */
    const bulkOptionsTextarea = document.getElementById('bulkOptionsInputUnified');
    bulkOptionsTextarea.value = card.dataset.options.split(',').join('\n');
    bulkOptionsTextarea.dispatchEvent(new Event("input", { bubbles: true }));
  };
}

/* run once on modal open */
refreshRadioPresetRow();

/* ---------- Speed presets (just like Radio, but scoped to Speed) --- */
const speedPresetRow = document.getElementById('speedPresetRow');
if (speedPresetRow) {
  speedPresetRow.addEventListener('click', e => {
    const card = e.target.closest('.preset-card');
    if (!card) return;

    /* visual highlight */
    speedPresetRow.querySelectorAll('.preset-card')
                  .forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');

    /* push plain labels into the textarea so the user can still tweak */
    document.getElementById('speedValuesInputUnified').value =
       card.dataset.options.split(',').join('\n');

    /* remember the full objects so Save can preserve values and flags */
    _presetRadioOptions = getRadioPreset(card.dataset.options.split(","));

    if (type === "speed" && initialSpeedValues.length) {
  const saved = initialSpeedValues.map(v => v.trim());
  function sameList(a, b) {
    return a.length === b.length &&
         a.every((v, i) => v.toLowerCase() === b[i].toLowerCase());
  }
speedPresetRow.querySelectorAll(".preset-card").forEach(card => {
    const preset = card.dataset.options.split(",").map(s => s.trim());
    if (sameList(saved, preset)) {
      card.click();               // reuse existing click handler → highlights & sets _presetRadioOptions
    }
  });
}
      });
    }

if (type === "speed" && initialSpeedValues.length && speedPresetRow) {
  const saved = initialSpeedValues.map(v => v.trim());
  const same  = (a, b) => a.length === b.length &&
                          a.every((v, i) => v === b[i]);

  speedPresetRow.querySelectorAll(".preset-card").forEach(card => {
    const preset = card.dataset.options.split(",").map(s => s.trim());
    if (same(saved, preset)) card.click();     // listener now runs ✅
  });
}

/* ---------- Number / Currency style buttons ---------- */
const numStyleContainer = document.getElementById('numStyleContainer');
let selectedNumStyle = null;          // nothing picked yet
let numStyleManuallySelected = !!initialNumericStyleManual;

if (type === 'number' || type === 'currency') {
  numStyleContainer.style.display = 'block';

  const nsNumber   = document.getElementById('nsNumber');
  const nsCurrency = document.getElementById('nsCurrency');
  const allNS      = [nsNumber, nsCurrency];

  const inferNumStyleFromLabel = (fallback = "number") =>
    (typeof window.inferNumberStyleFromLabel === "function")
      ? window.inferNumberStyleFromLabel(labelInput.value, fallback)
      : fallback;

  // reset any previous highlight
  allNS.forEach(b => b.classList.remove('selected'));

  function pick(btn, val, isManual = false) {
    allNS.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedNumStyle = val;
    if (isManual) numStyleManuallySelected = true;
  }

  function pickMode(mode, isManual = false) {
    if (mode === 'currency') pick(nsCurrency, 'currency', isManual);
    else pick(nsNumber, 'number', isManual);
  }

  selectedNumStyle = numStyleManuallySelected
    ? (type === 'currency' ? 'currency' : 'number')
    : inferNumStyleFromLabel(type === 'currency' ? 'currency' : 'number');
  pickMode(selectedNumStyle);

  const autoPickNumberMode = () => {
    if (numStyleManuallySelected) return;
    pickMode(inferNumStyleFromLabel(selectedNumStyle || 'number'));
  };
  labelInput._numAutoInferHandler = autoPickNumberMode;
  labelInput.addEventListener("input", autoPickNumberMode);

  nsNumber.onclick   = () => pickMode('number', true);
  nsCurrency.onclick = () => pickMode('currency', true);
} else {
  numStyleContainer.style.display = 'none';
}



  // ---------- Text-area ROW selector (now only “3 rows”) ----------
const row1Btn = document.getElementById("row1Btn");   // keep reference (we still hide it)
const row3Btn = document.getElementById("row3Btn");
let selectedTextareaRows = initialRows;               // ← carries existing value

if (type === "textarea") {
  // PERMANENTLY hide the “1 row” button
  if (row1Btn) { row1Btn.style.display = "none"; row1Btn.classList.remove("selected"); }

  // Show / wire the “3 rows” button only
  if (row3Btn) {
    row3Btn.style.display = "inline-flex";
    if (initialRows === 3) row3Btn.classList.add("selected");
    row3Btn.onclick = () => {
      // toggle between 3 rows and the default (1 row)
      const on = row3Btn.classList.toggle("selected");
      selectedTextareaRows = on ? 3 : undefined;
    };
  }
} else {
  // If we’re editing any other type, make sure both buttons stay hidden
  if (row1Btn) row1Btn.style.display = "none";
  if (row3Btn) row3Btn.style.display = "none";
}

  if (labelInput?._dtAutoInferHandler) {
    labelInput.removeEventListener("input", labelInput._dtAutoInferHandler);
    delete labelInput._dtAutoInferHandler;
  }

  if (isDateTimeFamilyType) {
    const btnDT = document.getElementById("dtModeDateTime");
    const btnD  = document.getElementById("dtModeDate");
    const btnT  = document.getElementById("dtModeTime");
    const all   = [btnDT, btnD, btnT];

    const inferModeFromLabel = (fallbackMode = "datetime") =>
      (typeof window.inferDateTimeModeFromLabel === "function")
        ? window.inferDateTimeModeFromLabel(labelInput.value, fallbackMode)
        : fallbackMode;

    function pick(btn, mode, isManual = false) {
      all.forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedDTMode = mode;
      if (isManual) dtModeManuallySelected = true;
    }

    function pickMode(mode, isManual = false) {
      if (mode === "date") pick(btnD, "date", isManual);
      else if (mode === "time") pick(btnT, "time", isManual);
      else pick(btnDT, "datetime", isManual);
    }

    selectedDTMode = dtModeManuallySelected
      ? (selectedDTMode || "datetime")
      : inferModeFromLabel(selectedDTMode || "datetime");
    pickMode(selectedDTMode);

    const autoPickDateTimeMode = () => {
      if (dtModeManuallySelected) return;
      pickMode(inferModeFromLabel(selectedDTMode || "datetime"));
    };
    labelInput._dtAutoInferHandler = autoPickDateTimeMode;
    labelInput.addEventListener("input", autoPickDateTimeMode);

    btnDT.onclick = () => pickMode("datetime", true);
    btnD.onclick  = () => pickMode("date", true);
    btnT.onclick  = () => pickMode("time", true);
  }
  

  // For radio/select/selectboxes => fill bulkOptionsInputUnified
  if (bulkOptionsInput) {
    if (["radio", "select", "selectboxes"].includes(type)) {
      const existingLabels = initialOptions.map(o => o.label || "").filter(Boolean);
      bulkOptionsInput.value = existingLabels.join("\n");
    } else {
      bulkOptionsInput.value = "";
    }
    bulkOptionsInput.scrollTop = 0;

    bulkOptionsInput.oninput = () => {
      const currentLabels = bulkOptionsInput.value
        .split(/\r?\n/)
        .map(label => normalizeOptionLabel(label))
        .filter(Boolean);
      const matchingCard = findMatchingPresetCard(radioPresetRow, currentLabels);

      radioPresetRow?.querySelectorAll(".preset-card")
        .forEach(card => card.classList.remove("selected"));

      if (matchingCard && radioPresetRow?.style.display !== "none") {
        matchingCard.classList.add("selected");
        _presetRadioOptions = getRadioPreset(getPresetCardLabels(matchingCard));
        return;
      }

      _presetRadioOptions = null;
    };

    bulkOptionsInput.oninput();
  }

  resetOptionImageDropTargetState(OPTION_IMAGE_DROP_TARGETS[0]);

  // Disclaimer text
/* ——— create / populate the CKEditor instance ——— */
let disclaimerEditor = null;
let initializeDisclaimerEditor = () => {};
  if (type === 'disclaimer') {
  bindDisclaimerPhotoPicker(() => disclaimerEditor || window._ckEditors['disclaimerRTE']);
  const ta = document.getElementById('disclaimerRTE');
  ta.value = initialDisclaimer || '';
  initializeDisclaimerEditor = () => {
    if (!ta || modal.style.display === 'none' || modal.dataset.modalType !== 'disclaimer') {
      return;
    }

    makeCKEditor(ta).then(ed => {
      if (modal.style.display === 'none' || modal.dataset.modalType !== 'disclaimer') {
        ed.destroy().catch(() => {});
        if (window._ckEditors[ta.id] === ed) {
          delete window._ckEditors[ta.id];
        }
        return;
      }

      disclaimerEditor = ed;
      if (initialDisclaimer) ed.setData(initialDisclaimer);
      bindDisclaimerImageDropTarget(() => disclaimerEditor || window._ckEditors['disclaimerRTE']);
      resetDisclaimerImageDropTargetState(() => disclaimerEditor || window._ckEditors['disclaimerRTE']);
    }).catch((err) => {
      console.error("Unable to initialize the disclaimer editor:", err);
      window.showNotification?.("Unable to load the rich text editor right now.", "error", 2200);
    });
  };
}


  // Survey => two textareas
  const surveyQuestionsTA = document.getElementById("surveyQuestionsInputUnified");
  const surveyOptionsTA = document.getElementById("surveyOptionsInputUnified");

  if (type === "survey") {
    /* questions */
    if (initialSurveyQuestions && initialSurveyQuestions.length) {
      surveyQuestionsTA.value = initialSurveyQuestions
        .map(q => normalizeSurveyQuestionLabel((q.label || q).trim()))
        .filter(Boolean)
        .join("\n");
    } else {
      surveyQuestionsTA.value = "";          // brand-new component
    }

    /* options */
    if (initialSurveyOptions && initialSurveyOptions.length) {
      surveyOptionsTA.value = initialSurveyOptions
        .map(o => normalizeOptionLabel((o.label || o).trim()))
        .filter(Boolean)
        .join("\n");
    } else {
      surveyOptionsTA.value = "";            // brand-new component
    }
    surveyQuestionsTA.scrollTop = 0;
    surveyOptionsTA.scrollTop = 0;
  }

  resetOptionImageDropTargetState(OPTION_IMAGE_DROP_TARGETS[1]);


  modal._currentOverlay = overlay;
  modal.style.display = "flex";
  overlay.style.display = "block";
  if (type === "disclaimer") {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        initializeDisclaimerEditor();
      });
    });
  }
  refreshLineListEditors();
  window.requestAnimationFrame(refreshLineListEditors);
  enableModalKeys(
          modal,
          document.getElementById("labelOptionsModalSaveBtn"),
          null,
          true            // allow ⏎ inside the “Label” <input> to Save
      );
  focusAndSelectTextInput(labelInput);

  // “Save” button
  const saveBtn = document.getElementById("labelOptionsModalSaveBtn");
  const parseCurrentEditGridLayout = () => {
    if (type !== "editgrid") {
      return { parsedLayout: null, valid: true, message: "" };
    }

    const parsedLayout = editGridLayoutFromRows(editGridRowsState);
    const rowNumbers = Object.keys(parsedLayout)
      .map(key => Number(key))
      .sort((a, b) => a - b);

    if (!rowNumbers.length) {
      return {
        parsedLayout: null,
        valid: false,
        message: "Add at least one row and one component before saving."
      };
    }
    const sequential = rowNumbers.every((rowNumber, index) => rowNumber === index + 1);

    if (!sequential) {
      return {
        parsedLayout,
        valid: false,
        message: "Rows must start at 1 and stay sequential."
      };
    }

    const componentCount = rowNumbers.reduce((total, rowNumber) => {
      const row = parsedLayout[rowNumber] || parsedLayout[String(rowNumber)] || [];
      return total + row.length;
    }, 0);

    return {
      parsedLayout,
      valid: true,
      message: `${rowNumbers.length} row${rowNumbers.length === 1 ? "" : "s"}, ${componentCount} component${componentCount === 1 ? "" : "s"} ready.`
    };
  };

  refreshEditGridSaveState = () => {
    if (!saveBtn) return;
    if (type !== "editgrid") {
      saveBtn.disabled = false;
      return;
    }

    const state = parseCurrentEditGridLayout();
    saveBtn.disabled = !state.valid;
  };

  refreshEditGridSaveState();

  if (saveBtn) {
    saveBtn.onclick = () => {
      let finalLabel = labelInput.value.trim();
      if (type === "fieldset" && !finalLabel) {
        finalLabel = "Section";
      } else if (type === "componentGroup" && !finalLabel) {
        finalLabel = "Field Group";
      }
      if (typeof window.normalizeComponentLabel === "function") {
        finalLabel = window.normalizeComponentLabel(finalLabel, type);
      }
      let finalOptions = [];
      let finalDisclaimer = "";
      let finalSurveyQuestions = [];
      let finalSurveyOptions = [];
      let finalEditGridConfig;
      let finalComponentGroupMode = selectedComponentGroupMode;
      let finalComponentGroupItems = [];
      let finalComponentGroupResponses = [];

      // If radio/select/selectboxes => parse
      if (["radio","select","selectboxes","choiceList"].includes(type) && bulkOptionsInput) {
        if (_presetRadioOptions) {
          /* --- 1. any detailed preset (Pass/Fail/NA) ? ------------ */
          finalOptions = _presetRadioOptions.map(o => ({ ...o }));
        } else {
          /* --- 2. otherwise parse the textarea ------------------- */
          const raw = bulkOptionsInput.value.trim();
          const splitted = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

          finalOptions = splitted.map(val => ({
            label : val,
            value : _.camelCase(val),
            flag  : '',
            shortcut:''
          }));
        }
      }

      // If disclaimer
      if (type === 'disclaimer') {
        const ed = disclaimerEditor || window._ckEditors['disclaimerRTE'];
        finalDisclaimer = ed ? ed.getData() : '';
      }

      // If survey
      if (type === "survey") {
        /* questions (always from the textarea) */
        if (surveyQuestionsTA) {
          finalSurveyQuestions = surveyQuestionsTA.value
            .trim()
            .split(/\r?\n/)
            .map(s => normalizeSurveyQuestionLabel(s))
            .filter(Boolean)
            .map(q => ({ label:q, value:_.camelCase(q) }));
        }
      
        /* options – preset first, textarea as fallback */
        if (_presetDetailedOptions) {
          finalSurveyOptions =
            getSurveyPreset(_presetDetailedOptions.map(o => o.label)) ||
            _presetDetailedOptions.map(o => ({ ...o }));
        } else if (surveyOptionsTA) {
          const surveyOptionLabels = surveyOptionsTA.value
            .trim()
            .split(/\r?\n|,/)
            .map(s => normalizeOptionLabel(s))
            .filter(Boolean);

          finalSurveyOptions =
            getSurveyPreset(surveyOptionLabels) ||
            surveyOptionLabels.map(o => ({
              label:o,
              value:_.camelCase(o),
              tooltip:'',
              flag:''
            }));
        }
      }

      if (type === "editgrid") {
        const { parsedLayout, valid, message } = parseCurrentEditGridLayout();
        if (!valid || !parsedLayout) {
          showNotification(message || 'Add at least one edit grid row before saving.', 'warn');
          return;
        }

        finalEditGridConfig = {
          rowLayout: parsedLayout,
          addAnother: (editGridAddAnotherInput?.value || "").trim()
        };
      }

      if (type === "componentGroup") {
        finalComponentGroupItems = (componentGroupItemsInput?.value || "")
          .split(/\r?\n/)
          .map(value => (
            selectedComponentGroupMode === "survey"
              ? normalizeSurveyQuestionLabel(value)
              : normalizeOptionLabel(value)
          ))
          .filter(Boolean);

        if (!finalComponentGroupItems.length) {
          showNotification("Add at least one survey or radio label before saving.", "warn");
          return;
        }

        const responseLabels = (selectedComponentGroupResponseLabels || [])
          .map(label => normalizeOptionLabel(label))
          .filter(Boolean);
        const safeResponseLabels = responseLabels.length ? responseLabels : ["Yes", "No", "N/A"];

        finalComponentGroupResponses =
          selectedComponentGroupMode === "survey"
            ? (
              getSurveyPreset(safeResponseLabels)
              || safeResponseLabels.map(label => ({
                label,
                value: _.camelCase(label),
                tooltip: "",
                flag: ""
              }))
            )
            : (
              getRadioPreset(safeResponseLabels)
              || safeResponseLabels.map(label => ({
                label,
                value: _.camelCase(label),
                shortcut: "",
                flag: ""
              }))
            );
      }

      const finalHideLabel =
        supportsHideLabelToggle && hideLabelToggle
          ? hideLabelToggle.checked
          : false;

      const finalRows = (type === "textarea") ? (selectedTextareaRows || 1) : undefined;
      const styleOrDT = (['choiceList','select','radio','selectboxes'].includes(type))
      ? (selectedListStyle || 'select')   
      : (type === 'number' || type === 'currency')
      ? (selectedNumStyle || 'number')
      : selectedDTMode;


      const finalRequired =
        supportsRequiredToggle && requiredToggle
          ? requiredToggle.checked
          : false;
           
      const finalActionsEnabled =
        supportsActionsToggle && actionsToggle
          ? (
            type === "componentGroup"
              ? selectedComponentGroupMode === "radio" && actionsToggle.checked
              : actionsToggle.checked
          )
          : false;

      let finalSpeedLabels = [];
      let finalSpeedValues = [];
       if (type === "speed" && !_presetRadioOptions) {
       const raw = (document.getElementById("speedValuesInputUnified")?.value || "")
                     .trim();
       if (raw) {
         const parts = raw
             .split(/\r?\n|,/)
             .map(s => s.trim())
             .filter(Boolean);

         if (parts.length) {
           _presetRadioOptions = parts.map(p => ({
             label    : p,                 // what the user sees
             value    : _.camelCase(p),    // safe value used in data
             flag     : "",                // no colour flags by default
             shortcut : ""
           }));
         }
       }
     }

      if (type === "speed") {
        const speedLabelsEl = document.getElementById("speedLabelsInputUnified");
        const speedValuesEl = document.getElementById("speedValuesInputUnified");
      
        finalSpeedLabels = (speedLabelsEl.value || "")
                             .split(/\r?\n/)
                             .map(s => s.trim())
                             .filter(Boolean);
      
        finalSpeedValues = (speedValuesEl.value || "")
                             .split(/\r?\n/)
                             .map(s => s.trim())
                             .filter(Boolean);
      }


const rawDefault = (numDefaultInput?.value || "").trim();

const defaultVal =
  rawDefault === ''          // empty field → no default
    ? undefined
    : Number(rawDefault);    // may be 0, 3.14, –5, etc.         // number (may be 0)
    const passMark =
  (type === "quiz")
    ? Math.max(1, Number(document.getElementById("quizPassInput").value) || 1)
    : undefined;
closeLabelOptionsModal();
      callback(
        finalLabel,
        finalOptions,
        finalDisclaimer,
        finalSurveyQuestions,
        finalSurveyOptions,
        finalHideLabel,
        finalRequired,
        finalRows,
        selectedDTMode,
        styleOrDT,
        finalActionsEnabled, 
        finalSpeedLabels, 
        finalSpeedValues,
        defaultVal ,
        passMark,
        finalEditGridConfig,
        dtModeManuallySelected,
        numStyleManuallySelected,
        finalComponentGroupMode,
        finalComponentGroupItems,
        finalComponentGroupResponses
      );
    };
  }
}


function closeLabelOptionsModal() {
  destroyCKEditor('disclaimerRTE'); 
  resetDisclaimerPhotoPicker();
  resetDisclaimerImageDropTargetState();
  const modal = document.getElementById("labelOptionsModal");
  disableModalKeys(modal);
  if (!modal) return;
  modal.style.display = "none";
  modal.classList.remove("super-top", "super-nested2", "super-nested3");
  delete modal.dataset.modalType;
  restoreListStyleContainerPosition(document.getElementById("listStyleContainer"));
  const editGridActionsRow = document.getElementById("editGridFooterActions");
  if (editGridActionsRow) {
    editGridActionsRow.style.display = "none";
  }

  if (modal._currentOverlay) {
    modal._currentOverlay.remove();
    modal._currentOverlay = null;
  }

  document.querySelectorAll("#componentTypeContainer .card")
          .forEach(card => card.classList.remove("selected"));
  document.querySelectorAll("#listStyleContainer .row-button")
          .forEach(btn  => btn.classList.remove("selected"));
  /* new line – clears Number/Currency buttons */
  document.querySelectorAll("#numStyleContainer .row-button")
          .forEach(btn => btn.classList.remove("selected"));
}
