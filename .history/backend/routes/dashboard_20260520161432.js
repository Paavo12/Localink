const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const pool = require('../db/pool');
const router = express.Router();

// Get dashboard stats
router.get('/stats', authenticateToken, async (req, res) => {
  const providerId = req.user.id;
  const bookings = await pool.query('SELECT COUNT(*) FROM appointments WHERE provider_id = $1', [providerId]);
  const reviews = await pool.query('SELECT COUNT(*) FROM reviews WHERE provider_id = $1', [providerId]);
  const quotes = await pool.query('SELECT COUNT(*) FROM quote_requests WHERE provider_id = $1', [providerId]);
  const profileViews = 42; // mock – implement real tracking later
  res.json({
    totalBookings: parseInt(bookings.rows[0].count),
    totalReviews: parseInt(reviews.rows[0].count),
    totalQuotes: parseInt(quotes.rows[0].count),
    profileViews
  });
});

// Get recent bookings for provider dashboard
router.get('/recent-bookings', authenticateToken, async (req, res) => {
  const result = await pool.query(
    `SELECT a.*, s.name as service_name, u.full_name as client_name
     FROM appointments a
     JOIN services s ON a.service_id = s.id
     JOIN users u ON a.client_id = u.id
     WHERE a.provider_id = $1
     ORDER BY a.start_time DESC
     LIMIT 10`,
    [req.user.id]
  );
  res.json(result.rows);
});

module.exports = router;