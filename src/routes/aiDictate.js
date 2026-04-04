require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { OpenAI } = require('openai');

const { getPublicAiFeatures } = require('../config/runtimeConfig');

const router = express.Router();
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;
const upload = multer({ dest: path.join(__dirname, '../../tmp') });

function disabledResponse(res) {
  return res.status(410).json({
    error: 'Audio dictation is disabled for this deployment.'
  });
}

router.post('/api/ai/dictate', upload.single('audio'), async (req, res) => {
  if (!getPublicAiFeatures().dictation) {
    if (req.file?.path) {
      fs.unlink(req.file.path, () => {});
    }
    return disabledResponse(res);
  }

  if (!req.file) return res.status(400).json({ error: 'audio file missing' });
  if (!openai) return res.status(503).json({ error: 'OPENAI_API_KEY is required for dictation.' });

  try {
    const rsp = await openai.audio.transcriptions.create({
      file: fs.createReadStream(req.file.path),
      model: 'whisper-1',
      language: 'en',
      response_format: 'text',
      temperature: 0.2
    });

    return res.json({ text: rsp.text.trim() });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'transcription failed' });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

module.exports = router;
