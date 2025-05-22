const sqlite3 = require('sqlite3').verbose();
const path    = require('path');
const fs      = require('fs');

const DB_PATH = path.join(__dirname, 'formbuilder.db');
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS templates (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    folder      TEXT    DEFAULT '',
    file_path   TEXT    NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(folder, name)
  );
  `, (err) => {
    if (err) console.error(err);
    else console.log('✓ templates table ready');
    db.close();
  });
});
