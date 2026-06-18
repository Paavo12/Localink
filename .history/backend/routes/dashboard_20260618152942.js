const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const pool = require('../db/pool');
const { body, validationResult } = require('express-validator');
const router = express.Router();

// Helper: clean price
function cleanPrice(price) {
  if (!price) return null;
  const cleaned = price.toString().replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// Validation chains
const profileValidation = [
  body('business_name').notEmpty().trim().escape().withMessage('Business name is required'),
  body('description').optional().trim().escape(),
  body('category').optional().trim().escape(),
  body('address').optional().trim().escape(),
  body('lat').optional().isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
  body('lng').optional().isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
  body('whatsapp_number').optional().trim().escape(),
];

const serviceValidation = [
  body('name').notEmpty().trim().escape().withMessage('Service name is required'),
  body('description').optional().trim().escape(),
  body('price').isNumeric().withMessage('Price must be a number').customSanitizer(value => cleanPrice(value)),
  body('duration_minutes').isInt({ min: 1 }).withMessage('Duration must be a positive integer'),
];

// ---------- Stats ----------
router.get('/stats', authenticateToken, async (req, res) => {
  const pid = req.user.id;
  const bookings = await pool.query('SELECT COUNT(*) FROM appointments WHERE provider_id = $1', [pid]);
  const reviews = await pool.query('SELECT COUNT(*) FROM reviews WHERE provider_id = $1', [pid]);
  const quotes = await pool.query('SELECT COUNT(*) FROM quote_requests WHERE provider_id = $1', [pid]);
  const profileViews = await pool.query('SELECT COUNT(*) FROM profile_views WHERE provider_id = $1', [pid]);
  res.json({
    totalBookings: parseInt(bookings.rows[0].count),
    totalReviews: parseInt(reviews.rows[0].count),
    totalQuotes: parseInt(quotes.rows[0].count),
    profileViews: parseInt(profileViews.rows[0].count) || 0
  });
});

// ---------- Recent bookings ----------
router.get('/recent-bookings', authenticateToken, async (req, res) => {
  const result = await pool.query(
    `SELECT a.*, s.name as service_name, u.full_name as client_name
     FROM appointments a
     LEFT JOIN services s ON a.service_id = s.id
     JOIN users u ON a.client_id = u.id
     WHERE a.provider_id = $1
     ORDER BY a.start_time DESC LIMIT 10`,
    [req.user.id]
  );
  res.json(result.rows);
});

// ---------- Update booking status ----------
router.put('/bookings/:id/status', authenticateToken, async (req, res) => {
  const { status } = req.body;
  if (!['pending','confirmed','cancelled','completed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  await pool.query('UPDATE appointments SET status = $1 WHERE id = $2 AND provider_id = $3', [status, req.params.id, req.user.id]);
  res.json({ message: 'Updated' });
});

// ---------- Get provider profile ----------
router.get('/profile', authenticateToken, async (req, res) => {
  const result = await pool.query('SELECT * FROM provider_profiles WHERE user_id = $1', [req.user.id]);
  res.json(result.rows[0] || {});
});

// ---------- Update provider profile (with validation) ----------
router.put('/profile', authenticateToken, profileValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { business_name, description, category, address, lat, lng, whatsapp_number } = req.body;
  try {
    await pool.query(
      `UPDATE provider_profiles 
       SET business_name=$1, description=$2, category=$3, address=$4, lat=$5, lng=$6, whatsapp_number=$7
       WHERE user_id=$8`,
      [business_name, description, category, address, lat || null, lng || null, whatsapp_number, req.user.id]
    );
    res.json({ message: 'Profile updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- Services CRUD ----------
router.get('/services', authenticateToken, async (req, res) => {
  const result = await pool.query('SELECT * FROM services WHERE provider_id = $1', [req.user.id]);
  res.json(result.rows);
});

router.post('/services', authenticateToken, serviceValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  let { name, description, price, duration_minutes } = req.body;
  price = cleanPrice(price);
  if (price === null) {
    return res.status(400).json({ error: 'Invalid price' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO services (provider_id, name, description, price, duration_minutes) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, name, description, price, duration_minutes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/services/:id', authenticateToken, serviceValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  let { name, description, price, duration_minutes } = req.body;
  price = cleanPrice(price);
  if (price === null) {
    return res.status(400).json({ error: 'Invalid price' });
  }
  try {
    await pool.query(
      `UPDATE services SET name=$1, description=$2, price=$3, duration_minutes=$4 
       WHERE id=$5 AND provider_id=$6`,
      [name, description, price, duration_minutes, req.params.id, req.user.id]
    );
    res.json({ message: 'Updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/services/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM services WHERE id = $1 AND provider_id = $2 RETURNING id', [id, req.user.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Service not found or not yours' });
    }
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- Business hours ----------
router.get('/hours', authenticateToken, async (req, res) => {
  const result = await pool.query('SELECT * FROM business_hours WHERE provider_id = $1', [req.user.id]);
  res.json(result.rows);
});

router.post('/hours', authenticateToken, async (req, res) => {
  const { day_of_week, open_time, close_time, is_closed } = req.body;
  // Basic validation: ensure day_of_week is 0-6 and times are valid if not closed
  if (day_of_week === undefined || day_of_week < 0 || day_of_week > 6) {
    return res.status(400).json({ error: 'Invalid day of week' });
  }
  const open = open_time && open_time.trim() !== '' ? open_time : null;
  const close = close_time && close_time.trim() !== '' ? close_time : null;
  const closed = is_closed === true || is_closed === 'true';
  if (!closed && (!open || !close)) {
    return res.status(400).json({ error: 'Open and close times required if not closed' });
  }
  try {
    await pool.query(
      `INSERT INTO business_hours (provider_id, day_of_week, open_time, close_time, is_closed)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (provider_id, day_of_week) DO UPDATE 
       SET open_time = $3, close_time = $4, is_closed = $5`,
      [req.user.id, day_of_week, open, close, closed]
    );
    res.json({ message: 'Hours saved' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save hours' });
  }
});

// ---------- Track profile view ----------
router.post('/track-view', authenticateToken, async (req, res) => {
  await pool.query('INSERT INTO profile_views (provider_id) VALUES ($1)', [req.user.id]);
  res.json({ ok: true });
});

// ---------- Profile views chart ----------
router.get('/profile-views-chart', authenticateToken, async (req, res) => {
  const days = 30;
  try {
    const result = await pool.query(
      `SELECT DATE(viewed_at) as date, COUNT(*) as count 
       FROM profile_views 
       WHERE provider_id = $1 AND viewed_at >= NOW() - INTERVAL '${days} days'
       GROUP BY DATE(viewed_at) ORDER BY date`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- Notifications ----------
router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, message, type, created_at 
       FROM notifications 
       WHERE user_id = $1 AND is_read = false 
       ORDER BY created_at DESC 
       LIMIT 20`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/notifications/read', authenticateToken, async (req, res) => {
  try {
    await pool.query(`UPDATE notifications SET is_read = true WHERE user_id = $1`, [req.user.id]);
    res.json({ message: 'Notifications marked as read' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;