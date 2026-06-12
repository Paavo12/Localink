const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const pool = require('../db/pool');

const router = express.Router();

// ---------- PUBLIC: GET ALL BUSINESSES (search) ----------
router.get('/', async (req, res) => {
  const { search, category } = req.query;
  let query = `
    SELECT p.user_id as id, p.business_name as name, p.description, p.category, 
           p.address, p.lat, p.lng, p.logo_url, p.cover_image_url, p.whatsapp_number,
           p.is_verified, u.full_name as owner_name, p.subscription_tier
    FROM provider_profiles p
    JOIN users u ON p.user_id = u.id
    WHERE u.is_active = true
  `;
  const params = [];
  if (search) {
    query += ` AND (p.business_name ILIKE $${params.length+1} OR p.description ILIKE $${params.length+1})`;
    params.push(`%${search}%`);
  }
  if (category) {
    query += ` AND p.category ILIKE $${params.length+1}`;
    params.push(`%${category}%`);
  }
  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- PUBLIC: GET SINGLE BUSINESS BY ID (with services, hours, reviews) ----------
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Business details
    const business = await pool.query(`
      SELECT p.*, u.email, u.full_name as owner_name
      FROM provider_profiles p
      JOIN users u ON p.user_id = u.id
      WHERE p.user_id = $1 AND u.is_active = true
    `, [id]);
    if (business.rows.length === 0) return res.status(404).json({ error: 'Business not found' });

    // Services
    const services = await pool.query(
      'SELECT * FROM services WHERE provider_id = $1 AND is_active = true ORDER BY created_at ASC',
      [id]
    );
    // Business hours
    const hours = await pool.query(
      'SELECT * FROM business_hours WHERE provider_id = $1 ORDER BY day_of_week ASC',
      [id]
    );
    // Reviews (non‑anonymous only)
    const reviews = await pool.query(
      `SELECT r.rating, r.comment, r.created_at, u.full_name 
       FROM reviews r
       JOIN users u ON r.client_id = u.id
       WHERE r.provider_id = $1 AND r.is_anonymous = false
       ORDER BY r.created_at DESC
       LIMIT 20`,
      [id]
    );

    res.json({
      ...business.rows[0],
      services: services.rows,
      hours: hours.rows,
      reviews: reviews.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- PROTECTED: CREATE OR UPDATE PROVIDER PROFILE ----------
router.post('/profile', authenticateToken, requireRole('provider'), async (req, res) => {
  const { business_name, description, category, address, lat, lng, whatsapp_number } = req.body;
  try {
    const existing = await pool.query('SELECT user_id FROM provider_profiles WHERE user_id = $1', [req.user.id]);
    if (existing.rows.length > 0) {
      await pool.query(`
        UPDATE provider_profiles 
        SET business_name=$1, description=$2, category=$3, address=$4, lat=$5, lng=$6, whatsapp_number=$7
        WHERE user_id=$8
      `, [business_name, description, category, address, lat, lng, whatsapp_number, req.user.id]);
      res.json({ message: 'Profile updated' });
    } else {
      await pool.query(`
        INSERT INTO provider_profiles (user_id, business_name, description, category, address, lat, lng, whatsapp_number)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [req.user.id, business_name, description, category, address, lat, lng, whatsapp_number]);
      res.status(201).json({ message: 'Profile created' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;