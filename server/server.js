const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

// Serve static React files
app.use(express.static(path.join(__dirname, '../client/dist')));

// Example API endpoint
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from the backend!' });
});

// Handle client-side routing (e.g., React Router)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});