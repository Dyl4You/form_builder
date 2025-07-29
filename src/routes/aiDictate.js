// ─── src/routes/aiDictate.js ───────────────────────────────────────
require('dotenv').config();
const fs       = require('fs');
const path     = require('path');
const express  = require('express');
const multer   = require('multer');
const OpenAI   = require('openai').OpenAI;

const router   = express.Router();
const openai   = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const upload   = multer({ dest: path.join(__dirname, '../../tmp') });

router.post('/api/ai/dictate', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'audio file missing' });

  try {
    const rsp = await openai.audio.transcriptions.create({
      file   : fs.createReadStream(req.file.path),
      model  : 'whisper-1',
      // ↓ optional goodies
      language: 'en',                     // auto-detect if you omit
      response_format: 'text',            // plain text back
      temperature: 0.2                    // a bit of creativity for punctuation
    });

    res.json({ text: rsp.text.trim() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'transcription failed' });
  } finally {
    fs.unlink(req.file.path, () => {});   // tidy temp file
  }
});

module.exports = router;
