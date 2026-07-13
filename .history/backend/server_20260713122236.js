const express = require('express');
const cors = require('cors');
const path = require('path');
const paymentsRouter = require('./routes/payments');
require('dotenv').config();

console.log('Starting server...');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT from env:', process.env.PORT);

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use(express.static('frontend'));
// Health check endpoint – must respond quickly
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Static folders
const frontendPath = path.join(__dirname, '../frontend');
console.log(`Serving static files from: ${frontendPath}`);
app.use(express.static(frontendPath));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Route loading with detailed error logging
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
  }
});

// Fallback route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error in request:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Uncaught exception handler
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start server – bind to 0.0.0.0
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
  setInterval(() => {
    console.log('⏳ Server is alive');
  }, 30000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});