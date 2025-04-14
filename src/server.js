require('dotenv').config();

const express = require('express');
const path = require('path');
const app = express();

// Serve static files from the public folder (located at the project root)
app.use(express.static(path.join(__dirname, '../public')));

// Parse JSON bodies.
app.use(express.json());

// Mount routes:
// Note: since your routes are in src/routes, use './routes/...' as the path.
const formBuilderRoutes = require('./routes/formBuilder');

app.use('/', formBuilderRoutes);


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Form Builder server is running on port ${PORT}`);
});
