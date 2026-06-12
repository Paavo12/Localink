const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const pool = require('../db/pool');
const router = express.Router();

// Helper: clean price string to numeric value
function cleanPrice(price) {
  if (!price) return null;
  const cleaned = price.toString().replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

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
  const result = await pool.query(`
    SELECT a.*, s.name as service_name, u.full_name as client_name
    FROM appointments a
    LEFT JOIN services s ON a.service_id = s.id
    JOIN users u ON a.client_id = u.id
    WHERE a.provider_id = $1
    ORDER BY a.start_time DESC LIMIT 10
  `, [req.user.id]);
  res.json(result.rows);
});

// ---------- Update booking status ----------
router.put('/bookings/:id/status', authenticateToken, async (req, res) => {
  const { status } = req.body;
  await pool.query('UPDATE appointments SET status = $1 WHERE id = $2 AND provider_id = $3', [status, req.params.id, req.user.id]);
  res.json({ message: 'Updated' });
});

// ---------- Get provider profile ----------
router.get('/profile', authenticateToken, async (req, res) => {
  const result = await pool.query('SELECT * FROM provider_profiles WHERE user_id = $1', [req.user.id]);
  res.json(result.rows[0] || {});
});

// ---------- Update provider profile ----------
router.put('/profile', authenticateToken, async (req, res) => {
  const { business_name, description, category, address, lat, lng, whatsapp_number } = req.body;
  await pool.query(`
    UPDATE provider_profiles 
    SET business_name=$1, description=$2, category=$3, address=$4, lat=$5, lng=$6, whatsapp_number=$7
    WHERE user_id=$8
  `, [business_name, description, category, address, lat, lng, whatsapp_number, req.user.id]);
  res.json({ message: 'Profile updated' });
});

// ---------- Services CRUD (with price cleaning) ----------
router.get('/services', authenticateToken, async (req, res) => {
  const result = await pool.query('SELECT * FROM services WHERE provider_id = $1', [req.user.id]);
  res.json(result.rows);
});

router.post('/services', authenticateToken, async (req, res) => {
  let { name, description, price, duration_minutes } = req.body;
  price = cleanPrice(price);
  if (price === null && req.body.price) {
    return res.status(400).json({ error: 'Invalid price format. Use numbers only (e.g., 50 or 50.00)' });
  }
  const result = await pool.query(
    `INSERT INTO services (provider_id, name, description, price, duration_minutes) 
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.user.id, name, description, price, duration_minutes]
  );
  res.status(201).json(result.rows[0]);
});

router.put('/services/:id', authenticateToken, async (req, res) => {
  let { name, description, price, duration_minutes } = req.body;
  price = cleanPrice(price);
  if (price === null && req.body.price) {
    return res.status(400).json({ error: 'Invalid price format' });
  }
  await pool.query(
    `UPDATE services SET name=$1, description=$2, price=$3, duration_minutes=$4 
     WHERE id=$5 AND provider_id=$6`,
    [name, description, price, duration_minutes, req.params.id, req.user.id]
  );
  res.json({ message: 'Updated' });
});

router.delete('/services/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  console.log(`User ${userId} attempting to delete service ${id}`);
  const result = await pool.query('DELETE FROM services WHERE id=$1 AND provider_id=$2 RETURNING id', [id, userId]);
  if (result.rowCount === 0) {
    return res.status(403).json({ error: 'Not authorized or service not found' });
  }
  res.json({ message: 'Deleted' });
});
// ---------- Business hours (with empty string → null) ----------
router.get('/hours', authenticateToken, async (req, res) => {
  const result = await pool.query('SELECT * FROM business_hours WHERE provider_id = $1', [req.user.id]);
  res.json(result.rows);
});

router.post('/hours', authenticateToken, async (req, res) => {
  const { day_of_week, open_time, close_time, is_closed } = req.body;
  const open = open_time && open_time.trim() !== '' ? open_time : null;
  const close = close_time && close_time.trim() !== '' ? close_time : null;
  const closed = is_closed === true || is_closed === 'true';
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

module.exports = router;