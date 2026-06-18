const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const pool = require('../db/pool');
const { body, validationResult } = require('express-validator');
const router = express.Router();

const quoteValidation = [
  body('providerId').isUUID().withMessage('Invalid provider ID'),
  body('name').notEmpty().trim().escape().withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('phone').optional().trim().escape(),
  body('message').notEmpty().trim().escape().withMessage('Message is required'),
];

// Create a quote request (public)
router.post('/', quoteValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { providerId, name, email, phone, message } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO quote_requests (provider_id, client_name, client_email, client_phone, message)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [providerId, name, email, phone || null, message]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get quote requests for a provider (authenticated + ownership)
router.get('/provider/:providerId', authenticateToken, async (req, res) => {
  const { providerId } = req.params;
  if (req.user.role !== 'admin' && req.user.id !== providerId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const result = await pool.query('SELECT * FROM quote_requests WHERE provider_id = $1 ORDER BY created_at DESC', [providerId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;