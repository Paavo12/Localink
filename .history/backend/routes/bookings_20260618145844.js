const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const pool = require('../db/pool');
const { sendBookingNotification } = require('../utils/email');
const router = express.Router();

// Create a booking
router.post('/', authenticateToken, async (req, res) => {
  const { providerId, serviceId, startTime, notes } = req.body;
  const clientId = req.user.id;
  try {
    // Get service details
    const serviceRes = await pool.query('SELECT duration_minutes, name as service_name FROM services WHERE id = $1', [serviceId]);
    if (serviceRes.rows.length === 0) return res.status(400).json({ error: 'Invalid service' });
    const duration = serviceRes.rows[0].duration_minutes;
    const serviceName = serviceRes.rows[0].service_name;
    const endTime = new Date(new Date(startTime).getTime() + duration * 60000);

    // Check for overlapping bookings (prevent double-booking)
    const overlapCheck = await pool.query(
      `SELECT id FROM appointments 
       WHERE provider_id = $1 AND status NOT IN ('cancelled') 
       AND (start_time, end_time) OVERLAPS ($2, $3)`,
      [providerId, startTime, endTime]
    );
    if (overlapCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Time slot already booked' });
    }

    // Insert the booking
    const result = await pool.query(
      `INSERT INTO appointments (provider_id, client_id, service_id, start_time, end_time, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [providerId, clientId, serviceId, startTime, endTime, notes]
    );
// Insert notification for the provider
const clientNameRes = await pool.query('SELECT full_name FROM users WHERE id = $1', [clientId]);
const clientName = clientNameRes.rows[0]?.full_name || 'A client';
const serviceName = serviceRes.rows[0].service_name;

await pool.query(
  `INSERT INTO notifications (user_id, title, message, type)
   VALUES ($1, $2, $3, $4)`,
  [
    providerId,
    'New Booking Request',
    `${clientName} booked ${serviceName} on ${new Date(startTime).toLocaleString()}`,
    'booking'
  ]
);
    // Send email notification to provider (if SMTP is configured)
    const providerUser = await pool.query('SELECT email FROM users WHERE id = $1', [providerId]);
    if (providerUser.rows.length > 0) {
      const clientRes = await pool.query('SELECT full_name FROM users WHERE id = $1', [clientId]);
      const clientName = clientRes.rows[0]?.full_name || 'A client';
      // Don't await – fire and forget to avoid delaying response
      sendBookingNotification(providerUser.rows[0].email, clientName, serviceName, startTime).catch(err => console.error('Email error:', err));
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get my bookings (as client)
router.get('/my', authenticateToken, async (req, res) => {
  const result = await pool.query(
    `SELECT a.*, p.business_name, s.name as service_name 
     FROM appointments a
     JOIN provider_profiles p ON a.provider_id = p.user_id
     JOIN services s ON a.service_id = s.id
     WHERE a.client_id = $1
     ORDER BY a.start_time DESC`,
    [req.user.id]
  );
  res.json(result.rows);
});

// Update booking status (provider only)
router.put('/:id/status', authenticateToken, async (req, res) => {
  const { status } = req.body;
  const { id } = req.params;
  try {
    const booking = await pool.query('SELECT provider_id FROM appointments WHERE id = $1', [id]);
    if (booking.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    if (booking.rows[0].provider_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await pool.query('UPDATE appointments SET status = $1 WHERE id = $2', [status, id]);
    res.json({ message: 'Updated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;