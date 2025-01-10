// Import express
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000; // Set port to 3000 (or an environment variable)

// Serve static files (HTML, CSS, JS, JSON, etc.)
app.use(express.static(path.join(__dirname, '')));  // Serve files from the root directory
app.use('/data', express.static(path.join(__dirname, 'data'))); // Serve data folder for ontologyCards.html

// // Endpoint for the main branch of the gitpage: the landing page
// app.get('/', (req, res) => {
//     res.sendFile(path.join(__dirname, 'index.html'));  // Serve index.html as landing page
// });

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));  // Serving the main landing page
});

// Endpoint for the 'Get Started' button, serving ontologyCards.html
// app.get('/ontologyCards.html', (req, res) => {
//     res.sendFile(path.join(__dirname, 'ontologyCards.html')); // Serve ontologyCards.html...This is not landing page, but the card display page
// });

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'ontologyCards.html'));  // Serve ontologyCards.html instead of index.html
});


// Start the server
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
