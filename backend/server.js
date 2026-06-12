const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

console.log('Starting server...');

const app = express();

// Middleware
try {
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  console.log('✓ Middleware loaded');
} catch (err) {
  console.error('❌ Middleware error:', err.message);
  process.exit(1);
}

// Static folders
try {
  const frontendPath = path.join(__dirname, '../frontend');
  console.log(`Serving static files from: ${frontendPath}`);
  app.use(express.static(frontendPath));
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
  console.log('✓ Static folders configured');
} catch (err) {
  console.error('❌ Static folder error:', err.message);
  process.exit(1);
}

// Route loading helper
function loadRoute(routePath, mountPath) {
  try {
    console.log(`Loading ${mountPath} from ${routePath}...`);
    const router = require(routePath);
    app.use(mountPath, router);
    console.log(`✓ ${mountPath} loaded`);
  } catch (err) {
    console.error(`❌ Failed to load ${mountPath}:`, err.message);
    throw err;
  }
}

try {
  loadRoute('./routes/auth', '/api/auth');
  loadRoute('./routes/admin', '/api/admin');
  loadRoute('./routes/bookings', '/api/bookings');
  loadRoute('./routes/businesses', '/api/businesses');
  loadRoute('./routes/dashboard', '/api/dashboard');
  loadRoute('./routes/quotes', '/api/quotes');
  loadRoute('./routes/reviews', '/api/reviews');
  loadRoute('./routes/services', '/api/services');
  loadRoute('./routes/subscriptions', '/api/subscriptions');
  loadRoute('./routes/upload', '/api/upload');
  console.log('✓ All routes loaded');
} catch (err) {
  console.error('❌ Route loading failed, exiting.');
  process.exit(1);
}

// Fallback route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});