// src/routes/library.js
const path = require('path');
const express = require('express');
const router  = express.Router();
router.get('/', (_req,res)=>{
  res.sendFile(path.join(__dirname,'../../public/library.html'));
});
module.exports = router;