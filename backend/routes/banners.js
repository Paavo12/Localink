const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const pool = require('../db/pool');

// Get active banners (public)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM banners 
       WHERE is_active = true 
       AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY sort_order ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: get every banner regardless of active/expired status, so they can be managed
router.get('/all', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM banners ORDER BY sort_order ASC, created_at DESC`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: Create banner
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
  const { title, image_url, link_url, position, expires_at, sort_order } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO banners (title, image_url, link_url, position, expires_at, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [title, image_url, link_url, position || 'homepage', expires_at || null, sort_order || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: Update banner (partial update -- only overwrites fields that were sent)
router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { title, image_url, link_url, is_active, expires_at, sort_order } = req.body;
  try {
    await pool.query(
      `UPDATE banners 
       SET title = COALESCE($1, title), 
           image_url = COALESCE($2, image_url), 
           link_url = COALESCE($3, link_url), 
           is_active = COALESCE($4, is_active), 
           expires_at = COALESCE($5, expires_at), 
           sort_order = COALESCE($6, sort_order), 
           updated_at = NOW()
       WHERE id = $7`,
      [title, image_url, link_url, is_active, expires_at, sort_order, id]
    );
    res.json({ message: 'Banner updated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: Delete banner
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM banners WHERE id = $1', [id]);
    res.json({ message: 'Banner deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;