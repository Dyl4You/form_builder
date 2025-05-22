const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const archiver = require('archiver');
const sqlite3  = require('sqlite3').verbose();

const router = express.Router();
router.use(express.json({ limit: '5mb' }));              // body‑parser

/* ---------- helpers ---------- */
const DB_PATH       = path.join(__dirname, '../db/formbuilder.db');
const TEMPL_DIR     = path.join(__dirname, '../../templates'); // keep zips here
if (!fs.existsSync(TEMPL_DIR)) fs.mkdirSync(TEMPL_DIR);

/* ---------- POST /api/templates ----------
   body: { name: "My Template", json: { … } }
-------------------------------------------*/
router.post('/', (req, res) => {
      const { name, folder = '', json } = req.body;
  if (!name || !json) return res.status(400).send('name & json required');

  const safeFolder = folder.replace(/[^a-z0-9_\-]/gi, '_');
  const safeName   = name.replace(/[^a-z0-9_\-]/gi, '_');
  const folderDir  = path.join(TEMPL_DIR, safeFolder);
  if (!fs.existsSync(folderDir)) fs.mkdirSync(folderDir, { recursive:true });
  const zipFile    = path.join(folderDir, `${safeName}.zip`);

  // 1) write JSON to a temp file
  const tmpJson = path.join(TEMPL_DIR, `${safeName}.json`);
  fs.writeFileSync(tmpJson, JSON.stringify(json, null, 2));

  // 2) zip it
  const output = fs.createWriteStream(zipFile);
  const archive = archiver('zip');
  archive.pipe(output);
  archive.file(tmpJson, { name: 'form.json' });
  archive.finalize().then(() => {
    fs.unlinkSync(tmpJson);               // ditch temp .json

    // 3) insert DB row
    const db = new sqlite3.Database(DB_PATH);
    const stmt = `INSERT INTO templates (name, folder, file_path)
                  VALUES (?, ?, ?)`;
    db.run(stmt, [name, folder, zipFile], function (err) {
      db.close();
      if (err) {
        console.error(err);
        return res.status(500).send('DB insert failed');
      }
      res.json({ id: this.lastID, name });
    });
  });
});

//  GET /api/templates            → list of folders
router.get('/', (req, res) => {
    const { folder } = req.query;
    const db = new sqlite3.Database(DB_PATH);
  
    if (!folder) {
      // 1. fetch all folders referenced in the DB
      db.all(`SELECT DISTINCT folder FROM templates ORDER BY folder`, [], (err, rows) => {
        db.close();
        if (err) return res.status(500).send('DB read failed');
  
        const dbFolders = rows.map(r => r.folder);
  
        // 2. also scan the templates directory for any subfolders
        let fsFolders = [];
        try {
          fs.readdirSync(TEMPL_DIR).forEach(name => {
            const p = path.join(TEMPL_DIR, name);
            if (fs.statSync(p).isDirectory()) fsFolders.push(name);
          });
        }
        catch(_) { /* ignore */ }
  
        // 3. merge + dedupe + sort
        const allFolders = Array.from(new Set([...dbFolders, ...fsFolders])).sort();
        return res.json(allFolders);
      });
      return;
    }
    
      db.all(`SELECT id, name, created_at
              FROM templates
              WHERE folder = ?
              ORDER BY created_at DESC`, [folder],
    (err, rows) => {
      db.close();
      if (err) return res.status(500).send('DB read failed');
      res.json(rows);
    });
});

router.get('/all', (req,res)=>{
    const db = new sqlite3.Database(DB_PATH);
    db.all(`SELECT id, name, folder
            FROM templates
            ORDER BY folder, name`, [], (err, rows)=>{
      db.close();
      if (err) return res.status(500).send('DB read failed');
      const out = {};
      rows.forEach(r=>{
        const f = r.folder || '(root)';
        if (!out[f]) out[f] = [];
        out[f].push({ id:r.id, name:r.name });
      });
      res.json(out);                 // →  { folderA:[{id,name}…], folderB:[…] }
    });
  });




/*  PUT /api/templates/:id  → overwrite an existing zip  */
router.put('/:id', (req,res)=>{
    const { id } = req.params;
    const { json } = req.body;
    if(!json) return res.status(400).send('json required');
  
    const db = new sqlite3.Database(DB_PATH);
    db.get(`SELECT file_path FROM templates WHERE id=?`,[id], (err,row)=>{
      if(err || !row) { db.close(); return res.status(404).send('not found'); }
  
      const tmp     = row.file_path + '.tmp';
fs.writeFileSync(tmp, JSON.stringify(json, null, 2));

const output  = fs.createWriteStream(row.file_path);
const archive = archiver('zip');

/* ✅ success – archive is completely written */
output.on('close', () => {
  fs.unlinkSync(tmp);
  db.close();
  res.sendStatus(204);          // 204 = No Content
});

/* ❌ any error while zipping / streaming */
archive.on('error', err => {
  console.error(err);
  fs.unlinkSync(tmp);
  db.close();
  res.status(500).send('ZIP write failed');
});

archive.pipe(output);
archive.file(tmp, { name: 'form.json' });
archive.finalize();   
    });
  });


/* ---------- GET /api/templates/:id/download ---------- */
router.get('/:id/download', (req, res) => {
    const db = new sqlite3.Database(DB_PATH);
    db.get(`SELECT file_path, name FROM templates WHERE id = ?`, [req.params.id],
      (err, row) => {
        db.close();
        if (err || !row) return res.status(404).send('not found');
  
        /* 👇 add these three lines */
        res.set({
          'Cache-Control': 'no-store, must-revalidate',
          'Pragma':        'no-cache',
          'Expires':       '0'
        });
  
        res.download(row.file_path, `${row.name}.zip`);
      });
  });

  router.delete('/:id', (req, res) => {
    const { id } = req.params;
    const db = new sqlite3.Database(DB_PATH);
  
    db.get(`SELECT file_path FROM templates WHERE id=?`, [id], (err, row) => {
      if (err || !row) { db.close(); return res.status(404).send('not found'); }
  
      // 1. remove ZIP from disk
      try   { fs.unlinkSync(row.file_path); }
      catch { /* ignore missing file */ }
  
      // 2. remove DB row
      db.run(`DELETE FROM templates WHERE id=?`, [id], (e) => {
        db.close();
        if (e) return res.status(500).send('DB delete failed');
        res.sendStatus(204);          // 204 = No Content
      });
    });
  });

  router.delete('/', (req, res) => {
    const { folder } = req.query;
    if (!folder) return res.status(400).send('folder required');
  
    const db = new sqlite3.Database(DB_PATH);
    db.all(`SELECT file_path FROM templates WHERE folder=?`, [folder], (err, rows) => {
      if (err) { db.close(); return res.status(500).send('DB read failed'); }
  
      /* 1. remove every ZIP */
      rows.forEach(r => { try { fs.unlinkSync(r.file_path); } catch {} });
  
      /* 2. purge DB rows */
      db.run(`DELETE FROM templates WHERE folder=?`, [folder], (e) => {
        db.close();
        if (e)  return res.status(500).send('DB delete failed');
  
        /* 3. nuke empty directory (optional) */
        const dir = path.join(TEMPL_DIR, folder);
        try { fs.rmdirSync(dir, { recursive:false }); } catch {}
  
        res.sendStatus(204);
      });
    });
  });

  router.post('/folder', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).send('name required');
  
    // sanitize to match your other logic
    const safeFolder = name.replace(/[^a-z0-9_\-]/gi, '_');
    const folderDir  = path.join(TEMPL_DIR, safeFolder);
  
    if (!fs.existsSync(folderDir)) {
      fs.mkdirSync(folderDir, { recursive: true });
    }
  
    // respond with the canonical folder name
    res.status(201).json({ folder: safeFolder });
  });

module.exports = router;
