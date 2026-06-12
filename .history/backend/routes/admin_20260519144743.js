const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const pool = require('../db/pool');

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticateToken, requireRole('admin'));

// List all users (clients + providers)
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

// Deactivate user (soft delete)
router.put('/users/:id/deactivate', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [id]);
    res.json({ message: 'User deactivated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Reactivate user
router.put('/users/:id/reactivate', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('UPDATE users SET is_active = true WHERE id = $1', [id]);
    res.json({ message: 'User reactivated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Permanently delete user (careful)
router.delete('/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// List all providers with subscription status
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

module.exports = router;