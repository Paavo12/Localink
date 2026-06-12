const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const upload = require('../middleware/upload');
const pool = require('../db/pool');
const router = express.Router();

// Upload logo
router.post('/logo', authenticateToken, upload.single('image'), async (req, res) => {
  const url = `/uploads/${req.file.filename}`;
  await pool.query('UPDATE provider_profiles SET logo_url = $1 WHERE user_id = $2', [url, req.user.id]);
  res.json({ url });
});

// Upload cover image
router.post('/cover', authenticateToken, upload.single('image'), async (req, res) => {
  const url = `/uploads/${req.file.filename}`;
  await pool.query('UPDATE provider_profiles SET cover_image_url = $1 WHERE user_id = $2', [url, req.user.id]);
  res.json({ url });
});

// Upload service image (for a specific service)
router.post('/service/:serviceId', authenticateToken, upload.single('image'), async (req, res) => {
  const { serviceId } = req.params;
  const url = `/uploads/${req.file.filename}`;
  // Check if service belongs to this provider
  const check = await pool.query('SELECT provider_id FROM services WHERE id = $1', [serviceId]);
  if (check.rows.length === 0 || check.rows[0].provider_id !== req.user.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  // Append image URL to the service's image_urls array
  await pool.query(
    `UPDATE services SET image_urls = array_append(image_urls, $1) WHERE id = $2`,
    [url, serviceId]
  );
  res.json({ url });
});

module.exports = router;