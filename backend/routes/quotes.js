const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const pool = require('../db/pool');
const router = express.Router();

// Create a quote request (public)
router.post('/', async (req, res) => {
  const { providerId, name, email, phone, message } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO quote_requests (provider_id, client_name, client_email, client_phone, message)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [providerId, name, email, phone, message]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== FIX #6: Protect GET endpoint ==========
// Get quote requests for a provider (authenticated + ownership check)
router.get('/provider/:providerId', authenticateToken, async (req, res) => {
  const { providerId } = req.params;
  // Allow only the provider themselves or admin
  if (req.user.role !== 'admin' && req.user.id !== providerId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const result = await pool.query(
      'SELECT * FROM quote_requests WHERE provider_id = $1 ORDER BY created_at DESC',
      [providerId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;