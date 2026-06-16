const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

console.log('Starting server...');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint (required by Railway)
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Static folders
const frontendPath = path.join(__dirname, '../frontend');
console.log(`Serving static files from: ${frontendPath}`);
app.use(express.static(frontendPath));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes – load with error catching
const routes = [
  { path: './routes/auth', mount: '/api/auth' },
  { path: './routes/admin', mount: '/api/admin' },
  { path: './routes/bookings', mount: '/api/bookings' },
  { path: './routes/businesses', mount: '/api/businesses' },
  { path: './routes/dashboard', mount: '/api/dashboard' },
  { path: './routes/quotes', mount: '/api/quotes' },
  { path: './routes/reviews', mount: '/api/reviews' },
  { path: './routes/services', mount: '/api/services' },
  { path: './routes/subscriptions', mount: '/api/subscriptions' },
  { path: './routes/upload', mount: '/api/upload' },
];

routes.forEach(({ path: routePath, mount }) => {
  try {
    console.log(`Loading ${mount} from ${routePath}...`);
    const router = require(routePath);
    app.use(mount, router);
    console.log(`✓ ${mount} loaded`);
  } catch (err) {
    console.error(`❌ Failed to load ${mount}:`, err.message);
    // Continue – don't crash the whole server
  }
});

// Fallback route – serves index.html for any unknown path
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
});

// Graceful shutdown (for Railway)
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});