const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const pool = require('../db/pool');
const { sendPaymentConfirmationEmail } = require('../utils/email');

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
    console.error('Error fetching users:', err);
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
    console.error('Error deactivating user:', err);
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
    console.error('Error reactivating user:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- PERMANENTLY DELETE USER (CASCADE) ----------
router.delete('/users/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const adminCheck = await pool.query('SELECT COUNT(*) FROM users WHERE role = $1 AND is_active = true', ['admin']);
    if (parseInt(adminCheck.rows[0].count) === 1) {
      const user = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
      if (user.rows[0]?.role === 'admin') {
        return res.status(400).json({ error: 'Cannot delete the only admin account' });
      }
    }

    const provider = await pool.query('SELECT user_id FROM provider_profiles WHERE user_id = $1', [id]);
    if (provider.rows.length === 0) {
      await pool.query('DELETE FROM users WHERE id = $1', [id]);
      return res.json({ message: 'User deleted successfully' });
    }

    await pool.query('BEGIN');
    await pool.query('DELETE FROM appointments WHERE provider_id = $1', [id]);
    await pool.query('DELETE FROM quote_requests WHERE provider_id = $1', [id]);
    await pool.query('DELETE FROM reviews WHERE provider_id = $1', [id]);
    await pool.query('DELETE FROM anonymous_comments WHERE provider_id = $1', [id]);
    await pool.query('DELETE FROM profile_views WHERE provider_id = $1', [id]);
    await pool.query('DELETE FROM portfolio_items WHERE provider_id = $1', [id]);
    await pool.query('DELETE FROM services WHERE provider_id = $1', [id]);
    await pool.query('DELETE FROM business_hours WHERE provider_id = $1', [id]);
    await pool.query('DELETE FROM provider_profiles WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    await pool.query('COMMIT');
    res.json({ message: 'User and all associated data permanently deleted' });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Error deleting user:', err);
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
    console.error('Error fetching subscriptions:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- GET PENDING VERIFICATIONS ----------
router.get('/pending-verifications', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, u.email, u.full_name 
      FROM provider_profiles p
      JOIN users u ON p.user_id = u.id
      WHERE p.is_verified = false AND p.business_name IS NOT NULL
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching pending verifications:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- APPROVE PROVIDER ----------
router.put('/verify-provider/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    await pool.query('UPDATE provider_profiles SET is_verified = true WHERE user_id = $1', [userId]);
    res.json({ message: 'Provider verified' });
  } catch (err) {
    console.error('Error verifying provider:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- REJECT PROVIDER (DELETE PROFILE) ----------
router.delete('/reject-provider/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    await pool.query('DELETE FROM provider_profiles WHERE user_id = $1', [userId]);
    res.json({ message: 'Provider rejected' });
  } catch (err) {
    console.error('Error rejecting provider:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- ADMIN STATS ----------
router.get('/stats', async (req, res) => {
  try {
    const totalProviders = await pool.query('SELECT COUNT(*) FROM provider_profiles');
    const totalBookings = await pool.query('SELECT COUNT(*) FROM appointments');
    const totalUsers = await pool.query('SELECT COUNT(*) FROM users WHERE role = $1', ['client']);
    const monthlyRevenue = await pool.query(`
      SELECT SUM(CASE 
        WHEN subscription_tier = 'verified' THEN 149 
        WHEN subscription_tier = 'premium' THEN 399 
        ELSE 0 END) as revenue 
      FROM provider_profiles
    `);
    res.json({
      totalProviders: parseInt(totalProviders.rows[0].count),
      totalBookings: parseInt(totalBookings.rows[0].count),
      totalUsers: parseInt(totalUsers.rows[0].count),
      monthlyRevenue: monthlyRevenue.rows[0].revenue || 0
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- CHART DATA ----------
router.get('/chart-data', async (req, res) => {
  try {
    const registrations = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) FROM users 
      WHERE created_at >= NOW() - INTERVAL '30 days' 
      GROUP BY DATE(created_at) ORDER BY date
    `);
    const categories = await pool.query(`
      SELECT category, COUNT(*) FROM provider_profiles 
      WHERE category IS NOT NULL GROUP BY category
    `);
    const tiers = await pool.query(`
      SELECT subscription_tier, COUNT(*) FROM provider_profiles 
      GROUP BY subscription_tier
    `);
    const cities = await pool.query(`
      SELECT split_part(address, ',', -1) as city, COUNT(*) 
      FROM provider_profiles WHERE address IS NOT NULL 
      GROUP BY city
    `);
    res.json({
      registrations: registrations.rows,
      categories: categories.rows,
      tiers: tiers.rows,
      cities: cities.rows
    });
  } catch (err) {
    console.error('Error fetching chart data:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- ACTIVITY FEED ----------
router.get('/activity-feed', async (req, res) => {
  try {
    const providers = await pool.query(`
      SELECT 'provider' as type, business_name as name, created_at 
      FROM provider_profiles ORDER BY created_at DESC LIMIT 5
    `);
    const bookings = await pool.query(`
      SELECT 'booking' as type, id::text as name, created_at 
      FROM appointments ORDER BY created_at DESC LIMIT 5
    `);
    const reviews = await pool.query(`
      SELECT 'review' as type, comment as name, created_at 
      FROM reviews ORDER BY created_at DESC LIMIT 5
    `);
    const feed = [...providers.rows, ...bookings.rows, ...reviews.rows]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 10);
    res.json(feed);
  } catch (err) {
    console.error('Error fetching activity feed:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- BOOKING OVERVIEW ----------
router.get('/bookings', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        a.id, a.start_time, a.end_time, a.status, a.notes, a.created_at,
        u_client.email AS client_email, u_client.full_name AS client_name,
        u_provider.email AS provider_email, p.business_name,
        s.name AS service_name
      FROM appointments a
      JOIN users u_client ON a.client_id = u_client.id
      JOIN provider_profiles p ON a.provider_id = p.user_id
      JOIN users u_provider ON p.user_id = u_provider.id
      LEFT JOIN services s ON a.service_id = s.id
      ORDER BY a.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching bookings:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== ADVANCED ANALYTICS ==========
router.get('/advanced-analytics', async (req, res) => {
  try {
    const revenueOverTime = await pool.query(`
      SELECT 
        DATE_TRUNC('month', created_at) AS month,
        SUM(CASE WHEN subscription_tier = 'verified' THEN 149 ELSE 0 END +
            CASE WHEN subscription_tier = 'premium' THEN 399 ELSE 0 END) AS revenue
      FROM provider_profiles
      WHERE subscription_tier IN ('verified', 'premium')
        AND created_at >= NOW() - INTERVAL '6 months'
      GROUP BY month
      ORDER BY month
    `);

    const bookingsByCategory = await pool.query(`
      SELECT 
        p.category,
        COUNT(a.id) AS booking_count
      FROM appointments a
      JOIN services s ON a.service_id = s.id
      JOIN provider_profiles p ON s.provider_id = p.user_id
      GROUP BY p.category
      ORDER BY booking_count DESC
    `);

    const registrationsByRegion = await pool.query(`
      SELECT 
        split_part(address, ',', -1) AS region,
        COUNT(*) AS count
      FROM provider_profiles
      WHERE address IS NOT NULL AND address != ''
      GROUP BY region
      ORDER BY count DESC
    `);

    const tierDistribution = await pool.query(`
      SELECT subscription_tier, COUNT(*) FROM provider_profiles GROUP BY subscription_tier
    `);

    const activeProviders = await pool.query(`
      SELECT COUNT(DISTINCT provider_id) FROM appointments 
      WHERE start_time >= NOW() - INTERVAL '30 days'
    `);

    res.json({
      revenueOverTime: revenueOverTime.rows,
      bookingsByCategory: bookingsByCategory.rows,
      registrationsByRegion: registrationsByRegion.rows,
      tierDistribution: tierDistribution.rows,
      activeProviders: activeProviders.rows[0].count || 0,
    });
  } catch (err) {
    console.error('Error fetching advanced analytics:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== PROVIDER DETAILS (VIEW & EDIT) ==========
router.get('/provider/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const userCheck = await pool.query('SELECT id, email, full_name, phone, is_active FROM users WHERE id = $1 AND role = $2', [userId, 'provider']);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    const profile = await pool.query('SELECT * FROM provider_profiles WHERE user_id = $1', [userId]);
    if (profile.rows.length === 0) {
      return res.status(404).json({ error: 'Provider profile not found' });
    }

    const services = await pool.query('SELECT * FROM services WHERE provider_id = $1 AND is_active = true', [userId]);
    const hours = await pool.query('SELECT * FROM business_hours WHERE provider_id = $1', [userId]);
    const reviews = await pool.query(`
      SELECT r.*, u.full_name 
      FROM reviews r
      JOIN users u ON r.client_id = u.id
      WHERE r.provider_id = $1
      ORDER BY r.created_at DESC
    `, [userId]);
    const anonymousComments = await pool.query('SELECT * FROM anonymous_comments WHERE provider_id = $1 ORDER BY created_at DESC', [userId]);
    const quotes = await pool.query('SELECT * FROM quote_requests WHERE provider_id = $1 ORDER BY created_at DESC', [userId]);
    const bookingsCount = await pool.query('SELECT COUNT(*) FROM appointments WHERE provider_id = $1', [userId]);

    res.json({
      user: userCheck.rows[0],
      profile: profile.rows[0],
      services: services.rows,
      hours: hours.rows,
      reviews: reviews.rows,
      anonymousComments: anonymousComments.rows,
      quotes: quotes.rows,
      bookingsCount: parseInt(bookingsCount.rows[0].count)
    });
  } catch (err) {
    console.error('Error fetching provider details:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- ADMIN UPDATE PROVIDER ----------
router.put('/provider/:userId', async (req, res) => {
  const { userId } = req.params;
  const { business_name, description, category, address, lat, lng, whatsapp_number, is_verified, subscription_tier } = req.body;

  try {
    const check = await pool.query('SELECT user_id FROM provider_profiles WHERE user_id = $1', [userId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    await pool.query(`
      UPDATE provider_profiles 
      SET business_name = COALESCE($1, business_name),
          description = COALESCE($2, description),
          category = COALESCE($3, category),
          address = COALESCE($4, address),
          lat = COALESCE($5, lat),
          lng = COALESCE($6, lng),
          whatsapp_number = COALESCE($7, whatsapp_number),
          is_verified = COALESCE($8, is_verified),
          subscription_tier = COALESCE($9, subscription_tier)
      WHERE user_id = $10
    `, [business_name, description, category, address, lat, lng, whatsapp_number, is_verified, subscription_tier, userId]);

    res.json({ message: 'Provider updated successfully' });
  } catch (err) {
    console.error('Error updating provider:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== CLIENT DETAILS (VIEW ONLY) ==========
router.get('/client/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await pool.query(
      'SELECT id, email, full_name, phone, is_active, role, created_at FROM users WHERE id = $1 AND role = $2',
      [userId, 'client']
    );
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json(user.rows[0]);
  } catch (err) {
    console.error('Error fetching client details:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== ADMIN INVOICE MANAGEMENT ==========

router.get('/invoices', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT pr.*, u.email, u.full_name
      FROM payment_requests pr
      JOIN users u ON pr.user_id = u.id
      ORDER BY pr.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching invoices:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/invoices/:id/approve', authenticateToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { adminNotes } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const invoiceResult = await client.query(
      `SELECT user_id, tier, status FROM payment_requests WHERE id = $1`,
      [id]
    );
    if (invoiceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const invoice = invoiceResult.rows[0];
    if (invoice.status === 'approved') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invoice already approved' });
    }

    await client.query(
      `UPDATE payment_requests SET status = 'approved', admin_notes = $1, updated_at = NOW() WHERE id = $2`,
      [adminNotes || null, id]
    );

    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);
    await client.query(
      `UPDATE provider_profiles 
       SET subscription_tier = $1, subscription_end = $2 
       WHERE user_id = $3`,
      [invoice.tier, endDate, invoice.user_id]
    );

    const userResult = await client.query(
      `SELECT email, full_name FROM users WHERE id = $1`,
      [invoice.user_id]
    );
    const user = userResult.rows[0];

    await client.query('COMMIT');

    try {
      await sendPaymentConfirmationEmail(user.email, user.full_name, invoice.tier);
    } catch (emailErr) {
      console.error('Email sending failed:', emailErr);
    }

    res.json({ message: 'Invoice approved and subscription activated' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error approving invoice:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

router.put('/invoices/:id/reject', authenticateToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { adminNotes } = req.body;

  try {
    const result = await pool.query(
      `UPDATE payment_requests SET status = 'rejected', admin_notes = $1, updated_at = NOW() WHERE id = $2 RETURNING status`,
      [adminNotes || null, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    res.json({ message: 'Invoice rejected' });
  } catch (err) {
    console.error('Error rejecting invoice:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;