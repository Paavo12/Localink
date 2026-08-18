const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const pool = require('../db/pool');

// Get conversations
router.get('/conversations', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(`
      SELECT mc.*, 
             u.full_name as client_name, 
             p.business_name as provider_name
      FROM message_conversations mc
      LEFT JOIN users u ON mc.client_id = u.id
      LEFT JOIN provider_profiles p ON mc.provider_id = p.user_id
      WHERE mc.client_id = $1 OR mc.provider_id = $1
      ORDER BY mc.last_message_at DESC
    `, [userId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get messages for a conversation
router.get('/:conversationId', authenticateToken, async (req, res) => {
  const { conversationId } = req.params;
  try {
    const result = await pool.query(`
      SELECT m.*, u.full_name as sender_name
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = $1
      ORDER BY m.created_at ASC
    `, [conversationId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Send message
router.post('/', authenticateToken, async (req, res) => {
  const { conversation_id, receiver_id, booking_id, message } = req.body;
  const sender_id = req.user.id;
  try {
    const result = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, receiver_id, booking_id, message)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [conversation_id, sender_id, receiver_id, booking_id, message]
    );
    
    // Update conversation last message time
    await pool.query(
      `UPDATE message_conversations 
       SET last_message_at = NOW() 
       WHERE id = $1`,
      [conversation_id]
    );
    
    // Send push notification
    const { sendPushNotification } = require('../utils/notifications');
    await sendPushNotification(
      receiver_id,
      '💬 New Message',
      `You have a new message`,
      { type: 'message', conversationId: conversation_id }
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;