/* src/routes/templates.js
   -----------------------------------------------------------
   Stores each form as its own ZIP inside /templates
   No database, no folders, no listing, no library page.
   -----------------------------------------------------------
*/
const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const archiver = require('archiver');

const router = express.Router();
router.use(express.json({ limit: '5mb' }));   // parse JSON bodies

/* Where the ZIPs will live */
const TEMPL_DIR = path.join(__dirname, '../../templates');
if (!fs.existsSync(TEMPL_DIR)) fs.mkdirSync(TEMPL_DIR, { recursive: true });

/* ------------------------------------------------------------------
   POST /api/templates
   Body { name?: "My Roof Form", json: { … } }

   • Slugs the name (or falls back to “template”)
   • Adds an ISO timestamp so filenames stay unique
-------------------------------------------------------------------*/
/* ------------------------------------------------------------------
   POST /api/templates
   Body { name?: "Component List", json: { … } }

   • Saves as "<clean name>.zip"
   • If a file with that name already exists, add "-1", "-2", … suffix
-------------------------------------------------------------------*/
router.post('/', async (req, res) => {
  const { json, name = 'template' } = req.body;
  if (!json) return res.status(400).send('json required');

  /* keep spaces, remove only truly unsafe characters */
  const clean = String(name).trim()
                 .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
                 .replace(/\s+/g, ' ')          // normalise whitespace
                 || 'template';

  /* ensure uniqueness */
  let zipName = `${clean}.zip`;
  let counter = 1;
  while (fs.existsSync(path.join(TEMPL_DIR, zipName))) {
    zipName = `${clean}-${counter++}.zip`;
  }

  const zipPath = path.join(TEMPL_DIR, zipName);
  const tmpJson = path.join(TEMPL_DIR, `${Date.now()}.json`);

  try {
    fs.writeFileSync(tmpJson, JSON.stringify(json, null, 2));

    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(zipPath);
      const zip = archiver('zip');
      zip.pipe(out);
      zip.file(tmpJson, { name: 'form.json' });
      zip.finalize();

      out.on('close', resolve);
      zip.on('error', reject);
    });

    fs.unlinkSync(tmpJson);
    res.status(201).json({ file: zipName });
  } catch (err) {
    try { fs.unlinkSync(tmpJson); } catch {}
    try { fs.unlinkSync(zipPath); } catch {}
    console.error(err);
    res.status(500).send(err.message);
  }
});



module.exports = router;