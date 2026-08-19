const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

require('dotenv').config();

console.log('Starting server...');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT from env:', process.env.PORT);

const app = express();

// ===== FIX: Trust proxy (for Railway) =====
app.set('trust proxy', 1);

// ----- Rate Limiting -----
// General API limiter. Raised from 100 -> 300 per window: a single admin
// dashboard load alone fires ~9 parallel requests, so 100/15min was easy
// to exhaust with completely normal usage (a few page reloads), which then
// blocked every API call -- including login -- for the rest of the window.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  // express-rate-limit's default handler responds with plain text, which
  // crashes any frontend code that assumes every API response is JSON
  // (that's what caused "Unexpected token 'T', "Too many r"... is not
  // valid JSON"). Return JSON instead so the frontend can show a normal
  // error message.
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many requests. Please wait a few minutes and try again.' });
  },
});
app.use('/api/', limiter);

// Separate, more generous limiter specifically for login/register, so a
// locked-out admin isn't blocked by unrelated traffic elsewhere on the site,
// while still guarding against brute-force password guessing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many login attempts. Please wait a few minutes and try again.' });
  },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/register-provider', authLimiter);

// ----- CORS -----
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : null;

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins) {
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    } else {
      callback(null, true);
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
  // NEW ROUTES:
  { path: './routes/banners', mount: '/api/banners' },
  { path: './routes/newsletter', mount: '/api/newsletter' },
  { path: './routes/disputes', mount: '/api/disputes' },
  { path: './routes/messages', mount: '/api/messages' },
  { path: './routes/calendar-auth', mount: '/api/calendar' },
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

// Graceful shutdown
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