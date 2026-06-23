const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const pool = require('../db/pool');
const router = express.Router();

// GET /api/businesses – Full-text search + advanced filters + pagination
router.get('/', async (req, res) => {
  let { 
    search, category, city, rating, 
    sort_by, min_price, max_price, open_now,
    limit = 12, offset = 0 
  } = req.query;

  search = search ? search.trim() : '';
  category = category ? category.trim() : '';
  city = city ? city.trim() : '';
  rating = rating ? parseFloat(rating) : null;
  min_price = min_price ? parseFloat(min_price) : null;
  max_price = max_price ? parseFloat(max_price) : null;
  limit = Math.min(parseInt(limit) || 12, 50);
  offset = parseInt(offset) || 0;
  const isOpenNow = open_now === 'true';

  // Build the base query with ranking
  let query = `
    SELECT 
      p.user_id as id, 
      p.business_name as name, 
      p.description, 
      p.category, 
      p.address, 
      p.lat, 
      p.lng, 
      p.logo_url, 
      p.cover_image_url, 
      p.whatsapp_number,
      p.is_verified, 
      p.subscription_tier,
      COALESCE((SELECT AVG(rating) FROM reviews WHERE provider_id = p.user_id), 0) as avg_rating,
      COALESCE((SELECT MIN(price) FROM services WHERE provider_id = p.user_id), 999999) as min_price,
      CASE p.subscription_tier
        WHEN 'premium' THEN 3
        WHEN 'verified' THEN 2
        ELSE 1
      END as rank,
      -- Full-text search relevance score
      ts_rank(to_tsvector('english', p.business_name || ' ' || COALESCE(p.description, '') || ' ' || COALESCE(p.category, '')), plainto_tsquery('english', $1)) as relevance
    FROM provider_profiles p
    JOIN users u ON p.user_id = u.id
    WHERE u.is_active = true
  `;

  const params = [search || ''];
  const conditions = [];

  // ---------- Full‑Text Search ----------
  if (search) {
    conditions.push(`to_tsvector('english', p.business_name || ' ' || COALESCE(p.description, '') || ' ' || COALESCE(p.category, '')) @@ plainto_tsquery('english', $${params.length})`);
  }

  // ---------- Exact Category (case-insensitive) ----------
  if (category) {
    conditions.push(`LOWER(p.category) = LOWER($${params.length + 1})`);
    params.push(category);
  }

  // ---------- City (safer matching) ----------
  if (city) {
    conditions.push(`p.address ILIKE '%' || $${params.length + 1} || '%'`);
    params.push(city);
  }

  // ---------- Rating ----------
  if (rating !== null && !isNaN(rating)) {
    conditions.push(`COALESCE((SELECT AVG(rating) FROM reviews WHERE provider_id = p.user_id), 0) >= $${params.length + 1}`);
    params.push(rating);
  }

  // ---------- Price Range ----------
  if (min_price !== null && !isNaN(min_price)) {
    conditions.push(`COALESCE((SELECT MIN(price) FROM services WHERE provider_id = p.user_id), 999999) >= $${params.length + 1}`);
    params.push(min_price);
  }
  if (max_price !== null && !isNaN(max_price)) {
    conditions.push(`COALESCE((SELECT MIN(price) FROM services WHERE provider_id = p.user_id), 999999) <= $${params.length + 1}`);
    params.push(max_price);
  }

  // ---------- "Open Now" ----------
  if (isOpenNow) {
    const now = new Date();
    const day = now.getDay();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    conditions.push(`
      EXISTS (
        SELECT 1 FROM business_hours h
        WHERE h.provider_id = p.user_id
          AND h.day_of_week = $${params.length + 1}
          AND h.is_closed = false
          AND (EXTRACT(HOUR FROM h.open_time) * 60 + EXTRACT(MINUTE FROM h.open_time)) <= $${params.length + 2}
          AND (EXTRACT(HOUR FROM h.close_time) * 60 + EXTRACT(MINUTE FROM h.close_time)) >= $${params.length + 2}
      )
    `);
    params.push(day, currentMinutes);
  }

  // ---------- Build WHERE ----------
  if (conditions.length > 0) {
    query += ' AND ' + conditions.join(' AND ');
  }

  // ---------- Sorting ----------
  let orderBy = `rank DESC, p.business_name ASC`; // default
  switch (sort_by) {
    case 'rating':
      orderBy = `avg_rating DESC NULLS LAST, rank DESC`;
      break;
    case 'price_low':
      orderBy = `min_price ASC NULLS LAST, rank DESC`;
      break;
    case 'price_high':
      orderBy = `min_price DESC NULLS LAST, rank DESC`;
      break;
    case 'newest':
      orderBy = `p.created_at DESC, rank DESC`;
      break;
    case 'relevance':
      if (search) orderBy = `relevance DESC, rank DESC`;
      break;
    default:
      orderBy = `rank DESC, p.business_name ASC`;
  }

  // ---------- Pagination ----------
  // Count query (remove ORDER BY and LIMIT/OFFSET)
  let countQuery = query.replace(/ORDER BY .*?(LIMIT|$)/i, '');
  // Remove the SELECT part and replace with COUNT(*)
  countQuery = countQuery.replace(/SELECT .*? FROM/i, 'SELECT COUNT(*) as total FROM');

  query += ` ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  try {
    const countResult = await pool.query(countQuery, params.slice(0, -2));
    const total = parseInt(countResult.rows[0]?.total || 0);

    const result = await pool.query(query, params);
    res.json({
      data: result.rows,
      pagination: {
        total,
        limit,
        offset,
        pages: Math.ceil(total / limit),
        currentPage: Math.floor(offset / limit) + 1
      }
    });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/businesses/:id – full profile (unchanged)
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const business = await pool.query(`
      SELECT p.*, u.email, u.full_name as owner_name
      FROM provider_profiles p
      JOIN users u ON p.user_id = u.id
      WHERE p.user_id = $1 AND u.is_active = true
    `, [id]);
    if (business.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    pool.query('INSERT INTO profile_views (provider_id) VALUES ($1)', [id]).catch(err => console.error('View tracking error:', err));

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
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/businesses/:id/comment – anonymous comment (unchanged)
router.post('/:id/comment', async (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const aliases = ['WanderingSpringbok', 'DesertFox', 'NamibWalker', 'CoastExplorer', 'EtoshaLover'];
  const alias = aliases[Math.floor(Math.random() * aliases.length)];
  let sentiment = 'neutral';
  if (/good|great|excellent|amazing|love|perfect/i.test(comment)) sentiment = 'positive';
  if (/bad|poor|terrible|awful|hate|worst/i.test(comment)) sentiment = 'negative';
  await pool.query(
    `INSERT INTO anonymous_comments (provider_id, alias, comment, sentiment) VALUES ($1, $2, $3, $4)`,
    [id, alias, comment, sentiment]
  );
  res.json({ message: 'Comment added' });
});

// POST /api/businesses/:id/report – report business (auth required, unchanged)
router.post('/:id/report', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  await pool.query(
    `INSERT INTO reports (reporter_user_id, provider_id, reason) VALUES ($1, $2, $3)`,
    [req.user.id, id, reason]
  );
  res.json({ message: 'Reported' });
});

// POST /api/businesses/reviews/:reviewId/respond – provider reply (unchanged)
router.post('/reviews/:reviewId/respond', authenticateToken, async (req, res) => {
  const { reviewId } = req.params;
  const { response } = req.body;
  const reviewCheck = await pool.query(
    `SELECT r.provider_id FROM reviews r 
     JOIN provider_profiles p ON r.provider_id = p.user_id 
     WHERE r.id = $1 AND p.user_id = $2`,
    [reviewId, req.user.id]
  );
  if (reviewCheck.rows.length === 0) {
    return res.status(403).json({ error: 'You are not allowed to respond to this review' });
  }
  await pool.query(
    `UPDATE reviews SET response = $1, responded_at = NOW() WHERE id = $2`,
    [response, reviewId]
  );
  res.json({ message: 'Response added' });
});

module.exports = router;