const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const pool = require('../db/pool');
const { getAuthUrl, getTokensFromCode } = require('../utils/google-calendar');

// Step 1: User clicks "Connect Calendar" – redirect to Google
router.get('/connect', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const authUrl = getAuthUrl(userId);
  res.json({ authUrl });
});

// Step 2: Google redirects back here after user authorizes
router.get('/callback', async (req, res) => {
  const { code, state: userId } = req.query;
  
  if (!code) {
    return res.status(400).send('Authorization code missing');
  }
  
  try {
    // Exchange code for tokens
    const tokens = await getTokensFromCode(code);
    
    // Store tokens in database
    await pool.query(
      `INSERT INTO calendar_tokens (user_id, access_token, refresh_token, token_expiry)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE 
       SET access_token = $2, refresh_token = $3, token_expiry = $4, updated_at = NOW()`,
      [userId, tokens.access_token, tokens.refresh_token || null, tokens.expiry_date ? new Date(tokens.expiry_date) : null]
    );
    
    // Redirect back to dashboard with success message
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5000'}/dashboard.html?calendar=connected`);
  } catch (error) {
    console.error('Calendar auth error:', error);
    res.status(500).send('Failed to connect calendar. Please try again.');
  }
});

// Check if user has calendar connected
router.get('/status', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      'SELECT user_id, calendar_id FROM calendar_tokens WHERE user_id = $1',
      [userId]
    );
    res.json({ connected: result.rows.length > 0 });
  } catch (error) {
    console.error('Calendar status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Disconnect calendar
router.delete('/disconnect', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    await pool.query('DELETE FROM calendar_tokens WHERE user_id = $1', [userId]);
    res.json({ message: 'Calendar disconnected' });
  } catch (error) {
    console.error('Calendar disconnect error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;