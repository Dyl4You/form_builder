src/db/db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'dictionary.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to the dictionary.db database.');
  }
});

// Enable foreign keys and create tables as before...
// (Include your existing table creation logic here)

module.exports = db;
