const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const pool = require('../db/pool');
const { body, validationResult } = require('express-validator');
const router = express.Router();

const reviewValidation = [
  body('providerId').isUUID().withMessage('Invalid provider ID'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('comment').optional().trim().escape(),
  body('isAnonymous').optional().isBoolean().toBoolean(),
];

// Create a review
router.post('/', authenticateToken, reviewValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { providerId, rating, comment, isAnonymous } = req.body;
  const clientId = req.user.id;
  try {
    await pool.query(
      `INSERT INTO reviews (provider_id, client_id, rating, comment, is_anonymous)
       VALUES ($1, $2, $3, $4, $5)`,
      [providerId, clientId, rating, comment || null, isAnonymous || false]
    );
    res.status(201).json({ message: 'Review added' });
  } catch (err) {
    console.error(err);
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
// Get top 3 reviews across all providers
router.get('/top', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, u.full_name, p.business_name 
      FROM reviews r
      JOIN users u ON r.client_id = u.id
      JOIN provider_profiles p ON r.provider_id = p.user_id
      WHERE r.is_anonymous = false
      ORDER BY r.rating DESC, r.created_at DESC
      LIMIT 3
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get reviews for the logged-in provider (includes reviews without a
// response yet, so the dashboard can show what still needs a reply)
router.get('/mine', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, u.full_name
       FROM reviews r
       JOIN users u ON r.client_id = u.id
       WHERE r.provider_id = $1
       ORDER BY (r.response IS NULL) DESC, r.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get my reviews error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Provider replies to (or edits their reply to) a review left on their business
router.put('/:id/respond', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { response } = req.body;
  if (!response || !response.trim()) {
    return res.status(400).json({ error: 'Reply text is required' });
  }
  try {
    const check = await pool.query('SELECT provider_id FROM reviews WHERE id = $1', [id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Review not found' });
    if (check.rows[0].provider_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    await pool.query(
      `UPDATE reviews SET response = $1, responded_at = NOW() WHERE id = $2`,
      [response.trim(), id]
    );
    res.json({ message: 'Reply posted' });
  } catch (err) {
    console.error('Respond to review error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;