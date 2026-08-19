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
  body('serviceType').notEmpty().trim().escape().withMessage('Service type is required'),
  body('message').notEmpty().trim().escape().withMessage('Message is required'),
];

// Create a quote request (public)
router.post('/', quoteValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { providerId, name, email, phone, serviceType, message } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO quote_requests (provider_id, client_name, client_email, client_phone, service_type, message)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [providerId, name, email, phone || null, serviceType, message]
    );
    
    // Send notification to provider
    const { sendPushNotification } = require('../utils/notifications');
    await sendPushNotification(
      providerId,
      '📋 New Quote Request',
      `${name} requested a quote for: ${serviceType}`,
      { type: 'quote', quoteId: result.rows[0].id }
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Quote error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- Broadcast a quote request for a service category ----------
// Instead of picking one specific provider, the client requests a quote for
// a service category and every verified, active provider offering that
// category gets notified -- providers on higher subscription tiers are
// notified first.
const broadcastValidation = [
  body('category').notEmpty().trim().escape().withMessage('Please select a service'),
  body('name').notEmpty().trim().escape().withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('phone').optional().trim().escape(),
  body('message').notEmpty().trim().escape().withMessage('Message is required'),
];

router.post('/broadcast', broadcastValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { category, name, email, phone, message } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // One quote_requests row represents the broadcast itself (provider_id NULL)
    const quoteResult = await client.query(
      `INSERT INTO quote_requests (provider_id, client_name, client_email, client_phone, service_type, message)
       VALUES (NULL, $1, $2, $3, $4, $5) RETURNING *`,
      [name, email, phone || null, category, message]
    );
    const quote = quoteResult.rows[0];

    // Find every verified, active provider in this category, ranked by
    // subscription tier (higher tier = notified first). Boosted listings
    // rank above their tier peers, same as search ranking.
    const providers = await client.query(
      `SELECT p.user_id,
              CASE
                WHEN p.boosted_until > NOW() AND p.subscription_tier = 'premium' THEN 5
                WHEN p.boosted_until > NOW() AND p.subscription_tier = 'verified' THEN 4
                WHEN p.subscription_tier = 'premium' THEN 3
                WHEN p.subscription_tier = 'verified' THEN 2
                ELSE 1
              END as priority_rank
       FROM provider_profiles p
       JOIN users u ON p.user_id = u.id
       WHERE u.is_active = true AND p.is_verified = true AND LOWER(p.category) = LOWER($1)
       ORDER BY priority_rank DESC`,
      [category]
    );

    if (providers.rows.length === 0) {
      await client.query('COMMIT');
      return res.status(201).json({ ...quote, notifiedProviders: 0, message: 'Quote request created, but no providers currently offer this service.' });
    }

    // Record recipients
    for (const p of providers.rows) {
      await client.query(
        `INSERT INTO quote_recipients (quote_id, provider_id, priority_rank) VALUES ($1, $2, $3)`,
        [quote.id, p.user_id, p.priority_rank]
      );
    }

    await client.query('COMMIT');

    // Send push notifications in priority order (highest tier first) --
    // sequential so top-tier providers are reached first even if this
    // takes a moment for a long recipient list.
    const { sendPushNotification } = require('../utils/notifications');
    for (const p of providers.rows) {
      sendPushNotification(
        p.user_id,
        '📋 New Quote Request',
        `${name} requested a quote for ${category}`,
        { type: 'quote', quoteId: quote.id }
      ).catch(err => console.error('Push notification error:', err));
    }

    res.status(201).json({ ...quote, notifiedProviders: providers.rows.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Quote broadcast error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// ---------- Get quotes received by the logged-in provider ----------
// Includes both quotes sent directly to them and broadcast quotes they
// were a recipient of, ordered by priority rank then most recent first.
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT q.id, q.client_name, q.client_email, q.client_phone, q.service_type, 
              q.message, q.status, q.created_at,
              COALESCE(qr.priority_rank, 0) as priority_rank,
              COALESCE(qr.is_read, false) as is_read
       FROM quote_requests q
       LEFT JOIN quote_recipients qr ON qr.quote_id = q.id AND qr.provider_id = $1
       WHERE q.provider_id = $1 OR qr.provider_id = $1
       ORDER BY priority_rank DESC, q.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching quotes:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark a broadcast quote as read (for the current provider)
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      `UPDATE quote_recipients SET is_read = true WHERE quote_id = $1 AND provider_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Marked as read' });
  } catch (err) {
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