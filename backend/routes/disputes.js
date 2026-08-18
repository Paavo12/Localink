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

module.exports = router;