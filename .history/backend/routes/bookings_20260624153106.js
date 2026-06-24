const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const pool = require('../db/pool');
const { sendBookingNotification } = require('../utils/email');
const { body, validationResult } = require('express-validator');
const router = express.Router();

// Validation rules
const bookingValidation = [
  body('providerId').isUUID().withMessage('Invalid provider ID'),
  body('serviceId').isUUID().withMessage('Invalid service ID'),
  body('startTime').isISO8601().withMessage('Start time must be a valid date').toDate(),
  body('notes').optional().trim().escape(),
];

// Create a booking
router.post('/', authenticateToken, bookingValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { providerId, serviceId, startTime, notes } = req.body;
  const clientId = req.user.id;
  try {
    // Get service details
    const serviceRes = await pool.query('SELECT duration_minutes, name as service_name FROM services WHERE id = $1', [serviceId]);
    if (serviceRes.rows.length === 0) return res.status(400).json({ error: 'Invalid service' });
    const duration = serviceRes.rows[0].duration_minutes;
    const serviceName = serviceRes.rows[0].service_name;
    const endTime = new Date(new Date(startTime).getTime() + duration * 60000);

    // Check for overlapping bookings
    const overlapCheck = await pool.query(
      `SELECT id FROM appointments 
       WHERE provider_id = $1 AND status NOT IN ('cancelled') 
       AND (start_time, end_time) OVERLAPS ($2, $3)`,
      [providerId, startTime, endTime]
    );
    if (overlapCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Time slot already booked' });
    }

    // Insert booking
    const result = await pool.query(
      `INSERT INTO appointments (provider_id, client_id, service_id, start_time, end_time, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [providerId, clientId, serviceId, startTime, endTime, notes || null]
    );

    // Insert notification
    const clientNameRes = await pool.query('SELECT full_name FROM users WHERE id = $1', [clientId]);
    const clientName = clientNameRes.rows[0]?.full_name || 'A client';
    await pool.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES ($1, $2, $3, $4)`,
      [providerId, 'New Booking Request', `${clientName} booked ${serviceName} on ${new Date(startTime).toLocaleString()}`, 'booking']
    );

    // Send email
    const providerUser = await pool.query('SELECT email FROM users WHERE id = $1', [providerId]);
    if (providerUser.rows.length > 0) {
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
  if (!['pending','confirmed','cancelled','completed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
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