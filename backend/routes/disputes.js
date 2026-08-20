const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const pool = require('../db/pool');

// Create dispute (client)
router.post('/', authenticateToken, async (req, res) => {
  const { booking_id, reason, description } = req.body;
  const client_id = req.user.id;
  try {
    // Verify booking belongs to client
    const booking = await pool.query(
      'SELECT provider_id FROM appointments WHERE id = $1 AND client_id = $2',
      [booking_id, client_id]
    );
    if (booking.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    const result = await pool.query(
      `INSERT INTO disputes (booking_id, client_id, provider_id, reason, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [booking_id, client_id, booking.rows[0].provider_id, reason, description]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get my disputes (client or provider -- either side of a dispute can see it)
router.get('/mine', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.*, 
             u.full_name as client_name, 
             p.business_name as provider_name,
             s.name as service_name,
             a.start_time
      FROM disputes d
      JOIN users u ON d.client_id = u.id
      JOIN provider_profiles p ON d.provider_id = p.user_id
      LEFT JOIN appointments a ON d.booking_id = a.id
      LEFT JOIN services s ON a.service_id = s.id
      WHERE d.client_id = $1 OR d.provider_id = $1
      ORDER BY d.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Get my disputes error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get disputes (admin only)
router.get('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.*, u.full_name as client_name, p.business_name as provider_name
      FROM disputes d
      JOIN users u ON d.client_id = u.id
      JOIN provider_profiles p ON d.provider_id = p.user_id
      ORDER BY d.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update dispute status (admin)
router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { status, resolution } = req.body;
  try {
    await pool.query(
      `UPDATE disputes 
       SET status = $1, resolution = $2, updated_at = NOW() 
       WHERE id = $3`,
      [status, resolution, id]
    );
    res.json({ message: 'Dispute updated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Helper: check the requesting user is the dispute's client, provider, or an admin
async function canAccessDispute(disputeId, user) {
  if (user.role === 'admin') return true;
  const result = await pool.query('SELECT client_id, provider_id FROM disputes WHERE id = $1', [disputeId]);
  if (result.rows.length === 0) return false;
  const { client_id, provider_id } = result.rows[0];
  return user.id === client_id || user.id === provider_id;
}

// Get messages within a dispute (client, provider involved, or admin)
router.get('/:id/messages', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    if (!(await canAccessDispute(id, req.user))) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const result = await pool.query(
      `SELECT m.*, u.full_name, u.role
       FROM dispute_messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.dispute_id = $1
       ORDER BY m.created_at ASC`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Post a message within a dispute (client, provider involved, or admin)
router.post('/:id/messages', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }
  try {
    if (!(await canAccessDispute(id, req.user))) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const result = await pool.query(
      `INSERT INTO dispute_messages (dispute_id, user_id, message, is_admin)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, req.user.id, message.trim(), req.user.role === 'admin']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;