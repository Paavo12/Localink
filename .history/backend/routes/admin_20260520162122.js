const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const pool = require('../db/pool');

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticateToken, requireRole('admin'));

// ---------- LIST ALL USERS ----------
router.get('/users', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.email, u.full_name, u.role, u.is_active, u.created_at,
             p.business_name, p.subscription_end
      FROM users u
      LEFT JOIN provider_profiles p ON u.id = p.user_id
      ORDER BY u.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- DEACTIVATE USER ----------
router.put('/users/:id/deactivate', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [id]);
    res.json({ message: 'User deactivated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- REACTIVATE USER ----------
router.put('/users/:id/reactivate', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('UPDATE users SET is_active = true WHERE id = $1', [id]);
    res.json({ message: 'User reactivated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- PERMANENTLY DELETE USER ----------
router.delete('/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- GET PROVIDER SUBSCRIPTIONS ----------
router.get('/providers/subscriptions', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.email, p.business_name, p.subscription_end,
             CASE WHEN p.subscription_end < CURRENT_DATE THEN 'expired' ELSE 'active' END as sub_status
      FROM provider_profiles p
      JOIN users u ON p.user_id = u.id
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- GET PENDING VERIFICATIONS (NEW) ----------
router.get('/pending-verifications', async (req, res) => {
  const result = await pool.query(
    `SELECT p.*, u.email, u.full_name 
     FROM provider_profiles p
     JOIN users u ON p.user_id = u.id
     WHERE p.is_verified = false AND p.business_name IS NOT NULL`
  );
  res.json(result.rows);
});

// ---------- APPROVE PROVIDER (NEW) ----------
router.put('/verify-provider/:userId', async (req, res) => {
  const { userId } = req.params;
  await pool.query('UPDATE provider_profiles SET is_verified = true WHERE user_id = $1', [userId]);
  res.json({ message: 'Provider verified' });
});

// ---------- REJECT PROVIDER (DELETE PROFILE) (NEW) ----------
router.delete('/reject-provider/:userId', async (req, res) => {
  await pool.query('DELETE FROM provider_profiles WHERE user_id = $1', [req.params.userId]);
  res.json({ message: 'Provider rejected' });
});

// ---------- ADMIN STATS FOR CHARTS (NEW) ----------
router.get('/stats', async (req, res) => {
  const totalProviders = await pool.query('SELECT COUNT(*) FROM provider_profiles');
  const totalBookings = await pool.query('SELECT COUNT(*) FROM appointments');
  const totalUsers = await pool.query('SELECT COUNT(*) FROM users WHERE role = $1', ['client']);
  const monthlyRevenue = await pool.query(
    `SELECT SUM(CASE 
       WHEN subscription_tier = 'verified' THEN 149 
       WHEN subscription_tier = 'premium' THEN 399 
       ELSE 0 END) as revenue 
     FROM provider_profiles`
  );
  res.json({
    totalProviders: parseInt(totalProviders.rows[0].count),
    totalBookings: parseInt(totalBookings.rows[0].count),
    totalUsers: parseInt(totalUsers.rows[0].count),
    monthlyRevenue: monthlyRevenue.rows[0].revenue || 0
  });
});

module.exports = router;