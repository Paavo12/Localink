const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const pool = require('../db/pool');
const router = express.Router();

// ---------- Public search with ranking boost by tier ----------
router.get('/', async (req, res) => {
  const { search, category } = req.query;
  let query = `
    SELECT p.user_id as id, p.business_name as name, p.description, p.category, 
           p.address, p.lat, p.lng, p.logo_url, p.cover_image_url, p.whatsapp_number,
           p.is_verified, p.subscription_tier,
           CASE p.subscription_tier
             WHEN 'premium' THEN 3
             WHEN 'verified' THEN 2
             ELSE 1
           END as rank
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
  query += ` ORDER BY rank DESC, p.business_name ASC`;
  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- Get single business with services, hours, reviews, anonymous comments ----------
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const business = await pool.query(`
      SELECT p.*, u.email, u.full_name as owner_name
      FROM provider_profiles p
      JOIN users u ON p.user_id = u.id
      WHERE p.user_id = $1 AND u.is_active = true
    `, [id]);
    if (business.rows.length === 0) return res.status(404).json({ error: 'Business not found' });

    const services = await pool.query('SELECT * FROM services WHERE provider_id = $1 AND is_active = true', [id]);
    const hours = await pool.query('SELECT * FROM business_hours WHERE provider_id = $1', [id]);
    const reviews = await pool.query(`
      SELECT r.*, u.full_name FROM reviews r
      JOIN users u ON r.client_id = u.id
      WHERE r.provider_id = $1 AND r.is_anonymous = false
      ORDER BY r.created_at DESC LIMIT 20
    `, [id]);
    const anonymousComments = await pool.query(`
      SELECT * FROM anonymous_comments WHERE provider_id = $1 ORDER BY created_at DESC LIMIT 10
    `, [id]);
    
    res.json({
      ...business.rows[0],
      services: services.rows,
      hours: hours.rows,
      reviews: reviews.rows,
      anonymousComments: anonymousComments.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- Post anonymous comment ----------
router.post('/:id/comment', async (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const aliases = ['WanderingSpringbok', 'DesertFox', 'NamibWalker', 'CoastExplorer', 'EtoshaLover'];
  const alias = aliases[Math.floor(Math.random() * aliases.length)];
  let sentiment = 'neutral';
  if (comment.match(/good|great|excellent|amazing|love|perfect/i)) sentiment = 'positive';
  if (comment.match(/bad|poor|terrible|awful|hate|worst/i)) sentiment = 'negative';
  await pool.query(
    `INSERT INTO anonymous_comments (provider_id, alias, comment, sentiment) VALUES ($1, $2, $3, $4)`,
    [id, alias, comment, sentiment]
  );
  res.json({ message: 'Comment added' });
});

// ---------- Report a business ----------
router.post('/:id/report', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  await pool.query(
    `INSERT INTO reports (reporter_user_id, provider_id, reason) VALUES ($1, $2, $3)`,
    [req.user.id, id, reason]
  );
  res.json({ message: 'Business reported' });
});

// ---------- Provider replies to a review ----------
router.post('/reviews/:reviewId/respond', authenticateToken, async (req, res) => {
  const { reviewId } = req.params;
  const { response } = req.body;
  await pool.query(
    `UPDATE reviews SET response = $1, responded_at = NOW() WHERE id = $2`,
    [response, reviewId]
  );
  res.json({ message: 'Response added' });
});

module.exports = router;