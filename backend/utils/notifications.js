// Push notification service (Web Push)
// For production, use a service like OneSignal or Firebase

const pool = require('../db/pool');

async function sendPushNotification(userId, title, body, data = {}) {
  try {
    // Get user's push tokens
    const tokens = await pool.query(
      'SELECT token FROM push_tokens WHERE user_id = $1',
      [userId]
    );
    
    if (tokens.rows.length === 0) return;

    // For Web Push, you'd use web-push library
    // For now, we'll store notifications in DB and they'll be shown on next page load
    await pool.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read)
       VALUES ($1, $2, $3, $4, false)`,
      [userId, title, body, data.type || 'general']
    );
    
    console.log(`📢 Push notification queued for user ${userId}: ${title}`);
  } catch (err) {
    console.error('Push notification error:', err);
  }
}

// Add to existing booking creation
async function notifyNewBooking(providerId, clientName, serviceName, bookingId) {
  await sendPushNotification(
    providerId,
    '📅 New Booking Request',
    `${clientName} booked ${serviceName}`,
    { type: 'booking', bookingId }
  );
}

module.exports = { sendPushNotification, notifyNewBooking };