const express = require('express');
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

// Get quote requests for a provider (authenticated)
router.get('/provider/:providerId', async (req, res) => {
  // In production, check auth token matches provider_id
  const { providerId } = req.params;
  const result = await pool.query('SELECT * FROM quote_requests WHERE provider_id = $1 ORDER BY created_at DESC', [providerId]);
  res.json(result.rows);
});

module.exports = router;