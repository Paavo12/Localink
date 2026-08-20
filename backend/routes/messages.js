const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const pool = require('../db/pool');

// Get all conversations for the logged-in user (client or provider), with
// unread count and the other party's name.
router.get('/conversations', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(`
      SELECT mc.*,
             u.full_name as client_name,
             p.business_name as provider_name,
             p.logo_url as provider_logo,
             (SELECT message FROM messages WHERE conversation_id = mc.id ORDER BY created_at DESC LIMIT 1) as last_message,
             (SELECT COUNT(*) FROM messages WHERE conversation_id = mc.id AND receiver_id = $1 AND is_read = false) as unread_count
      FROM message_conversations mc
      LEFT JOIN users u ON mc.client_id = u.id
      LEFT JOIN provider_profiles p ON mc.provider_id = p.user_id
      WHERE mc.client_id = $1 OR mc.provider_id = $1
      ORDER BY mc.last_message_at DESC
    `, [userId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Get conversations error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Start a conversation with a provider, or return the existing one if the
// client has already messaged this provider before. This is what makes the
// 'Message' button on a business page actually work.
router.post('/conversations/start', authenticateToken, async (req, res) => {
  const { providerId, bookingId } = req.body;
  const clientId = req.user.id;
  if (!providerId) return res.status(400).json({ error: 'providerId is required' });
  if (providerId === clientId) return res.status(400).json({ error: 'Cannot message yourself' });

  try {
    const existing = await pool.query(
      `SELECT * FROM message_conversations WHERE client_id = $1 AND provider_id = $2`,
      [clientId, providerId]
    );
    if (existing.rows.length > 0) {
      return res.json(existing.rows[0]);
    }
    const result = await pool.query(
      `INSERT INTO message_conversations (client_id, provider_id, booking_id) VALUES ($1, $2, $3) RETURNING *`,
      [clientId, providerId, bookingId || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Start conversation error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get messages for a conversation (only participants can view)
router.get('/:conversationId', authenticateToken, async (req, res) => {
  const { conversationId } = req.params;
  try {
    const convo = await pool.query('SELECT client_id, provider_id FROM message_conversations WHERE id = $1', [conversationId]);
    if (convo.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    if (convo.rows[0].client_id !== req.user.id && convo.rows[0].provider_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const result = await pool.query(`
      SELECT m.*, u.full_name as sender_name
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = $1
      ORDER BY m.created_at ASC
    `, [conversationId]);

    // Mark messages sent to me in this conversation as read
    await pool.query(
      `UPDATE messages SET is_read = true WHERE conversation_id = $1 AND receiver_id = $2 AND is_read = false`,
      [conversationId, req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Send a message within an existing conversation
router.post('/', authenticateToken, async (req, res) => {
  const { conversation_id, message, booking_id } = req.body;
  const sender_id = req.user.id;
  if (!conversation_id || !message || !message.trim()) {
    return res.status(400).json({ error: 'conversation_id and message are required' });
  }

  try {
    const convo = await pool.query('SELECT client_id, provider_id FROM message_conversations WHERE id = $1', [conversation_id]);
    if (convo.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    const { client_id, provider_id } = convo.rows[0];
    if (sender_id !== client_id && sender_id !== provider_id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const receiver_id = sender_id === client_id ? provider_id : client_id;

    const result = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, receiver_id, booking_id, message)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [conversation_id, sender_id, receiver_id, booking_id || null, message.trim()]
    );

    await pool.query(`UPDATE message_conversations SET last_message_at = NOW() WHERE id = $1`, [conversation_id]);

    try {
      const { sendPushNotification } = require('../utils/notifications');
      await sendPushNotification(receiver_id, '💬 New Message', message.trim().slice(0, 100), { type: 'message', conversationId: conversation_id });
    } catch (notifyErr) {
      console.error('Push notification error:', notifyErr);
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Total unread message count for the logged-in user (for a nav badge)
router.get('/unread/count', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM messages WHERE receiver_id = $1 AND is_read = false`,
      [req.user.id]
    );
    res.json({ count: parseInt(result.rows[0].count, 10) });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
