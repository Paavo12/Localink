const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const pool = require('../db/pool');
const { sendBookingNotification } = require('../utils/email');
const { body, validationResult } = require('express-validator');
const { notifyNewBooking } = require('../utils/notifications');
const { createCalendarEvent, deleteCalendarEvent } = require('../utils/google-calendar');
const router = express.Router();

// Validation rules
const bookingValidation = [
  body('providerId').isUUID().withMessage('Invalid provider ID'),
  body('serviceId').isUUID().withMessage('Invalid service ID'),
  body('startTime').isISO8601().withMessage('Start time must be a valid date').toDate(),
  body('notes').optional().trim().escape(),
];

// ----- Google Calendar helpers -----

// Get a provider's stored calendar tokens (if they've connected their calendar)
async function getUserCalendarTokens(userId) {
  const result = await pool.query(
    'SELECT access_token, refresh_token, token_expiry FROM calendar_tokens WHERE user_id = $1',
    [userId]
  );
  return result.rows[0] || null;
}

// Create a Google Calendar event for a new booking, if the provider has connected their calendar.
// Returns the event id (to store on the booking) or null if calendar isn't connected / creation failed.
async function createCalendarEventForBooking(booking, clientName, clientEmail, serviceName, businessName, address) {
  try {
    const tokens = await getUserCalendarTokens(booking.provider_id);
    if (!tokens) return null;

    const eventDetails = {
      title: `${serviceName} - ${clientName}`,
      description: `Booking from ${clientName}\nService: ${serviceName}\nBusiness: ${businessName}\nNotes: ${booking.notes || ''}`,
      startTime: booking.start_time,
      endTime: booking.end_time,
      location: address || '',
      attendees: clientEmail ? [{ email: clientEmail }] : [],
    };

    const event = await createCalendarEvent(tokens, eventDetails);
    return event.id;
  } catch (error) {
    console.error('Failed to create calendar event:', error);
    return null;
  }
}

// If a booking is cancelled, remove the corresponding calendar event (if one was created)
async function cancelCalendarEvent(booking) {
  try {
    if (!booking.calendar_event_id) return;
    const tokens = await getUserCalendarTokens(booking.provider_id);
    if (!tokens) return;

    await deleteCalendarEvent(tokens, booking.calendar_event_id);
  } catch (error) {
    console.error('Failed to delete calendar event:', error);
  }
}

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
    const serviceRes = await pool.query('SELECT duration_minutes, name as service_name, is_available FROM services WHERE id = $1', [serviceId]);
    if (serviceRes.rows.length === 0) return res.status(400).json({ error: 'Invalid service' });
    if (serviceRes.rows[0].is_available === false) {
      return res.status(409).json({ error: 'This is currently unavailable (fully booked). Please choose another option.' });
    }
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
    const booking = result.rows[0];

    // Look up client name/email (needed before anything below references it)
    const clientRes = await pool.query('SELECT full_name, email FROM users WHERE id = $1', [clientId]);
    const clientName = clientRes.rows[0]?.full_name || 'A client';
    const clientEmail = clientRes.rows[0]?.email || null;

    // Send push notification
    await notifyNewBooking(providerId, clientName, serviceName, booking.id);

    // Insert in-app notification
    await pool.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES ($1, $2, $3, $4)`,
      [providerId, 'New Booking Request', `${clientName} booked ${serviceName} on ${new Date(startTime).toLocaleString()}`, 'booking']
    );

    // Send email
    const providerUser = await pool.query(
      'SELECT u.email, p.business_name, p.address FROM users u JOIN provider_profiles p ON u.id = p.user_id WHERE u.id = $1',
      [providerId]
    );
    if (providerUser.rows.length > 0) {
      const { email: providerEmail, business_name: businessName, address } = providerUser.rows[0];
      sendBookingNotification(providerEmail, clientName, serviceName, startTime).catch(err => console.error('Email error:', err));

      // Sync to provider's Google Calendar, if connected
      const calendarEventId = await createCalendarEventForBooking(
        booking, clientName, clientEmail, serviceName, businessName, address
      );
      if (calendarEventId) {
        await pool.query('UPDATE appointments SET calendar_event_id = $1 WHERE id = $2', [calendarEventId, booking.id]);
        booking.calendar_event_id = calendarEventId;
      }
    }

    res.status(201).json(booking);
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

    // If cancelled, remove the synced calendar event too
    if (status === 'cancelled') {
      const full = await pool.query('SELECT provider_id, calendar_event_id FROM appointments WHERE id = $1', [id]);
      if (full.rows[0]) {
        cancelCalendarEvent(full.rows[0]).catch(err => console.error('Calendar cancel error:', err));
      }
    }

    res.json({ message: 'Updated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});
// Cancel a booking (client only)
router.put('/:id/cancel', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const booking = await pool.query('SELECT client_id, provider_id, status, calendar_event_id FROM appointments WHERE id = $1', [id]);
    if (booking.rows.length === 0) return res.status(404).json({ error: 'Booking not found' });
    if (booking.rows[0].client_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (booking.rows[0].status === 'completed') {
      return res.status(400).json({ error: 'Cannot cancel a completed booking' });
    }
    await pool.query('UPDATE appointments SET status = $1 WHERE id = $2', ['cancelled', id]);

    cancelCalendarEvent(booking.rows[0]).catch(err => console.error('Calendar cancel error:', err));

    res.json({ message: 'Booking cancelled' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
