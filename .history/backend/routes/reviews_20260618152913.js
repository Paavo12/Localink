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

module.exports = router;