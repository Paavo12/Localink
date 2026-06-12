const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const pool = require('../db/pool');
const router = express.Router();

// Create a review
router.post('/', authenticateToken, async (req, res) => {
  const { providerId, rating, comment, isAnonymous } = req.body;
  const clientId = req.user.id;
  try {
    await pool.query(
      `INSERT INTO reviews (provider_id, client_id, rating, comment, is_anonymous)
       VALUES ($1, $2, $3, $4, $5)`,
      [providerId, clientId, rating, comment, isAnonymous || false]
    );
    res.status(201).json({ message: 'Review added' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get reviews for a business (public)
router.get('/business/:providerId', async (req, res) => {
  const { providerId } = req.params;
  const result = await pool.query(
    `SELECT r.*, u.full_name 
     FROM reviews r
     JOIN users u ON r.client_id = u.id
     WHERE r.provider_id = $1 AND r.is_anonymous = false
     ORDER BY r.created_at DESC`,
    [providerId]
  );
  res.json(result.rows);
});

module.exports = router;