const express = require('express');
const path = require('path');
const app = express();

// 1) Serve static files from "public" folder.
//    If your folder structure has "public" at the same level as "src", do:
app.use(express.static(path.join(__dirname, '..', 'public')));

// 2) Then add your routes, e.g.:
const formBuilderRoutes = require('./routes/formBuilder');
app.use('/', formBuilderRoutes);

// 3) Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
