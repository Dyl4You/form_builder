/****************************************************
 *  src/routes/aiUpload.js   (PDF / DOCX / IMG → Form.io components)
 ****************************************************/
require("dotenv").config();

const express    = require("express");
const router     = express.Router();
const multer     = require("multer");
const pdfParse   = require("pdf-parse");
const fs         = require("fs");
const path       = require("path");
const OpenAI     = require("openai").OpenAI;
const mammoth    = require("mammoth");
const sharp      = require("sharp");
const { PDFImage }   = require("pdf-image");
const { createWorker } = require("tesseract.js");

/* ─── OCR tuning ─────────────────────────────────────────────── */
const OCR_MAX_PAGES = 8;      // OCR only first N pages
const OCR_DPI       = 180;    // rasterise @180 dpi
const MIN_LEN       = 200;    // pdf-parse text shorter than this → scan

/* ─── one shared Tesseract worker (warm once, reuse forever) ─── */
const workerPromise = (async () => {
  const w = await createWorker();       // v5 API → no args
  await w.load();                       // load core + WASM
  await w.loadLanguage("eng");
  await w.initialize("eng");
  return w;                             // keep hot
})();
function getWorker() { return workerPromise; }

/* ─── allowed component types (same list as ai.js) ───────────── */
const ALLOWED_TYPES = new Set([
  "textarea","textfield","radio","select","selectboxes","file",
  "phoneNumber","address","asset","account","number","currency",
  "datetime","date","time","fieldset","columns","editgrid",
  "speed","quiz","survey","disclaimer","content"
]);
function validateComponentTypes(arr, p = "components") {
  arr.forEach((c,i) => {
    if (!ALLOWED_TYPES.has(c.type))
      throw `Unsupported component type “${c.type}” at ${p}[${i}]`;
    if (Array.isArray(c.components))
      validateComponentTypes(c.components, `${p}[${i}].components`);
  });
}

/* ─── OpenAI client ──────────────────────────────────────────── */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL  = process.env.OPENAI_MODEL || "gpt-4.1-mini";

/* ─── Multer tmp dir ─────────────────────────────────────────── */
const tmpDir = path.join(__dirname, "../../tmp");
fs.mkdirSync(tmpDir, { recursive: true });
const upload = multer({ dest: tmpDir });

/* ─── system prompt for the LLM ──────────────────────────────── */
const SYSTEM_PROMPT_UPLOAD = `
You are a Form.io form generator.
Return ONLY a JSON object whose root has a "components" array.
Prefer "textarea" (1-row) over "textfield".
Group related fields into fieldsets; use editgrid for detected tables.
Keys must be camelCase.
If the extracted text is mostly narrative (no obvious form fields), put
the ENTIRE text into **one** component of type "disclaimer" (alias of
Form.io "content") using HTML paragraphs/bullets. Do NOT output any
textarea/inputs in that case.
declare calculateValues with value = .
Allowed types: ${[...ALLOWED_TYPES].join(", ")}.
`.trim();

/* ─── POST /api/ai/upload ────────────────────────────────────── */
router.post("/api/ai/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "file required" });

  try {
    /* 1 ▸ extract text -------------------------------------------------- */
    const ext  = path.extname(req.file.originalname).toLowerCase();
    let   text = "";

    /* —— PDF —— */
    if (ext === ".pdf") {
      const raw = fs.readFileSync(req.file.path);
      text = (await pdfParse(raw)).text;

      if (text.length < MIN_LEN) {                 // scanned ➜ OCR
        const pdfImg = new PDFImage(req.file.path, {
          outputDirectory: tmpDir,
          convertOptions : { "-density": String(OCR_DPI), "-quality": "90" }
        });
        const pages = (await pdfImg.convertFile()).slice(0, OCR_MAX_PAGES);
        const worker = await getWorker();
        const ocrTexts = await Promise.all(
  pages.slice(0, OCR_MAX_PAGES).map(async (p,i) => {
    const buf = await sharp(p).resize({ width: 2000, withoutEnlargement: true })
                              .grayscale().toBuffer();
    const { data:{ text } } = await worker.recognize(buf);
    fs.unlinkSync(p);
    return text;
  })
);
text = ocrTexts.join('\n\n');

        text = "";
        for (const p of pages) {
          const buf = await sharp(p)
            .resize({ width: 2500, withoutEnlargement: true })
            .grayscale()
            .toBuffer();

          const { data:{ text: ocr } } = await worker.recognize(buf);
          text += ocr + "\n\n";
          fs.unlinkSync(p);                       // remove tmp PNG
        }
      }

    /* —— DOCX —— */
    } else if (ext === ".docx") {
      const { value } = await mammoth.extractRawText({
        buffer: fs.readFileSync(req.file.path)
      });
      text = value;

    /* —— IMAGE —— */
    } else if ([".png",".jpg",".jpeg",".webp"].includes(ext)) {
      const imgBuf = await sharp(req.file.path)
        .resize({ width: 2000, withoutEnlargement: true })
        .toBuffer();

      const worker = await getWorker();
      const { data:{ text: ocr } } = await worker.recognize(imgBuf);
      text = ocr;

    } else {
      return res.status(400).json({ error: "unsupported file type" });
    }

    text = text.slice(0, 20_000);                 // stay under token cap
    const userPrompt = (req.body.prompt || "").trim();

    /* 2 ▸ ask OpenAI ---------------------------------------------------- */
    const messages = [
      { role: "system", content: SYSTEM_PROMPT_UPLOAD },
      { role: "user",   content: `### FILE TEXT\n${text}` }
    ];
    if (userPrompt)
      messages.push({ role: "user", content: `### INSTRUCTIONS\n${userPrompt}` });

    const completion = await openai.chat.completions.create({
      model           : MODEL,
      temperature     : 0.2,
      max_tokens      : 8_000,
      response_format : { type: "json_object" },
      messages
    });

    /* 3 ▸ validate & respond ------------------------------------------ */
    const payload = JSON.parse(completion.choices[0].message.content);
    validateComponentTypes(payload.components);
    res.json(payload);

  } catch (e) {
    console.error("AI-upload error:", e);
    res.status(500).json({ error: e.message || "upload failed" });

  } finally {
    fs.unlink(req.file.path, () => {});           // clean tmp file
  }
});

module.exports = router;
