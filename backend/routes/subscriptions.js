const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const pool = require('../db/pool');
const router = express.Router();

// Upgrade subscription (without real payment – demo)
router.post('/upgrade', authenticateToken, async (req, res) => {
  const { tier } = req.body;
  if (!['verified', 'premium'].includes(tier)) {
    return res.status(400).json({ error: 'Invalid tier' });
  }

  // ========== FIX #7: Check that user has a provider profile ==========
  const providerCheck = await pool.query(
    'SELECT user_id FROM provider_profiles WHERE user_id = $1',
    [req.user.id]
  );
  if (providerCheck.rows.length === 0) {
    return res.status(403).json({ error: 'Only providers can upgrade subscriptions' });
  }

  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + 1);
  const result = await pool.query(
    `UPDATE provider_profiles SET subscription_tier = $1, subscription_end = $2 WHERE user_id = $3 RETURNING subscription_tier`,
    [tier, endDate, req.user.id]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Provider profile not found' });
  }
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
// Boost listing
router.post('/boost', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const boostPrice = 99;
  const boostDays = 30;

  try {
    const boostEnd = new Date();
    boostEnd.setDate(boostEnd.getDate() + boostDays);
    
    const result = await pool.query(
      `UPDATE provider_profiles 
       SET boosted_until = $1 
       WHERE user_id = $2 
       RETURNING boosted_until`,
      [boostEnd, userId]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Provider profile not found' });
    }
    
    // In a real implementation, you'd process payment here
    res.json({ 
      message: `Listing boosted until ${boostEnd.toLocaleDateString()}`,
      boosted_until: boostEnd
    });
  } catch (err) {
    console.error('Boost error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;