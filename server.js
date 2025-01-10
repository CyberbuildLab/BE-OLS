// Import express
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000; // Set port to 3000 (or an environment variable)

// Serve static files (HTML, CSS, JS, JSON, etc.)
app.use(express.static(path.join(__dirname, '')));  // Serve files from the root directory

// Endpoint for the root of the website
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));  // Serve the index.html file
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
