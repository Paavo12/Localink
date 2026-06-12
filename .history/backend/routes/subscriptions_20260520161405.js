const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const pool = require('../db/pool');
const router = express.Router();

// Upgrade subscription (without real payment – demo)
router.post('/upgrade', authenticateToken, async (req, res) => {
  const { tier } = req.body; // 'verified' or 'premium'
  if (!['verified', 'premium'].includes(tier)) {
    return res.status(400).json({ error: 'Invalid tier' });
  }
  // In real app, you would verify payment here
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + 1);
  await pool.query(
    `UPDATE provider_profiles SET subscription_tier = $1, subscription_end = $2 WHERE user_id = $3`,
    [tier, endDate, req.user.id]
  );
  res.json({ message: `Upgraded to ${tier}` });
});

// Get current subscription info
router.get('/me', authenticateToken, async (req, res) => {
  const result = await pool.query(
    `SELECT subscription_tier, subscription_end FROM provider_profiles WHERE user_id = $1`,
    [req.user.id]
  );
  res.json(result.rows[0] || { subscription_tier: 'basic', subscription_end: null });
});

module.exports = router;