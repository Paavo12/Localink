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

// ---------- GET PENDING VERIFICATIONS ----------
router.get('/pending-verifications', async (req, res) => {
  const result = await pool.query(
    `SELECT p.*, u.email, u.full_name 
     FROM provider_profiles p
     JOIN users u ON p.user_id = u.id
     WHERE p.is_verified = false AND p.business_name IS NOT NULL`
  );
  res.json(result.rows);
});

// ---------- APPROVE PROVIDER ----------
router.put('/verify-provider/:userId', async (req, res) => {
  const { userId } = req.params;
  await pool.query('UPDATE provider_profiles SET is_verified = true WHERE user_id = $1', [userId]);
  res.json({ message: 'Provider verified' });
});

// ---------- REJECT PROVIDER (DELETE PROFILE) ----------
router.delete('/reject-provider/:userId', async (req, res) => {
  await pool.query('DELETE FROM provider_profiles WHERE user_id = $1', [req.params.userId]);
  res.json({ message: 'Provider rejected' });
});

// ---------- ADMIN STATS (simple counts) ----------
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

// ========== NEW ENDPOINTS (append before module.exports) ==========

// Chart data for admin dashboard
router.get('/chart-data', async (req, res) => {
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
});

// Activity feed (recent providers, bookings, reviews)
router.get('/activity-feed', async (req, res) => {
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
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0,10);
  res.json(feed);
});
// ========== NEW: Admin Booking Overview ==========
router.get('/bookings', authenticateToken, requireRole('admin'), async (req, res) => {
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
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== NEW: Advanced Analytics ==========
router.get('/advanced-analytics', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    // 1. Revenue over time (last 6 months)
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

    // 2. Bookings by category (via services)
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

    // 3. Registrations by region (from address)
    const registrationsByRegion = await pool.query(`
      SELECT 
        split_part(address, ',', -1) AS region,
        COUNT(*) AS count
      FROM provider_profiles
      WHERE address IS NOT NULL AND address != ''
      GROUP BY region
      ORDER BY count DESC
    `);

    // 4. Provider tier distribution (already have tier chart, but add count)
    const tierDistribution = await pool.query(`
      SELECT subscription_tier, COUNT(*) FROM provider_profiles GROUP BY subscription_tier
    `);

    // 5. Monthly active providers (who have at least one booking in last 30 days)
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
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});
// ========== ADMIN: GET Provider Full Profile ==========
router.get('/provider/:userId', authenticateToken, requireRole('admin'), async (req, res) => {
  const { userId } = req.params;
  try {
    // Check if user exists and is a provider
    const userCheck = await pool.query('SELECT id, email, full_name, phone, is_active FROM users WHERE id = $1 AND role = $provider', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    // Get provider profile
    const profile = await pool.query('SELECT * FROM provider_profiles WHERE user_id = $1', [userId]);
    if (profile.rows.length === 0) {
      return res.status(404).json({ error: 'Provider profile not found' });
    }

    // Get services
    const services = await pool.query('SELECT * FROM services WHERE provider_id = $1 AND is_active = true', [userId]);

    // Get hours
    const hours = await pool.query('SELECT * FROM business_hours WHERE provider_id = $1', [userId]);

    // Get reviews (with client names)
    const reviews = await pool.query(`
      SELECT r.*, u.full_name 
      FROM reviews r
      JOIN users u ON r.client_id = u.id
      WHERE r.provider_id = $1
      ORDER BY r.created_at DESC
    `, [userId]);

    // Get anonymous comments
    const anonymousComments = await pool.query('SELECT * FROM anonymous_comments WHERE provider_id = $1 ORDER BY created_at DESC', [userId]);

    // Get quote requests
    const quotes = await pool.query('SELECT * FROM quote_requests WHERE provider_id = $1 ORDER BY created_at DESC', [userId]);

    // Get bookings count
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
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== ADMIN: Update Provider Profile ==========
router.put('/provider/:userId', authenticateToken, requireRole('admin'), async (req, res) => {
  const { userId } = req.params;
  const { business_name, description, category, address, lat, lng, whatsapp_number, is_verified, subscription_tier } = req.body;

  try {
    // Check if provider exists
    const check = await pool.query('SELECT user_id FROM provider_profiles WHERE user_id = $1', [userId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    // Update profile (admin can also change verification and subscription)
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
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;