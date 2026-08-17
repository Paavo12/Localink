const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

require('dotenv').config();

console.log('Starting server...');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT from env:', process.env.PORT);

const app = express();

// ----- Rate Limiting (protect all /api routes) -----
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// ----- CORS – allow only your frontend domains -----
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5000', 'http://localhost:3000', 'https://your-domain.com'];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Prevent caching of HTML files
app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path === '/') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});
// Static folders
const frontendPath = path.join(__dirname, '../frontend');
console.log(`Serving static files from: ${frontendPath}`);
app.use(express.static(frontendPath));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check
app.get('/health', (req, res) => res.status(200).send('OK'));

// ----- Routes -----
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
  { path: './routes/payments', mount: '/api/payments' },
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

// Fallback – SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error in request:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ----- Start Server -----
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
});

// Graceful shutdown – close DB pool
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    const pool = require('./db/pool');
    pool.end(() => {
      console.log('Database pool closed');
      process.exit(0);
    });
  });
});