const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const upload = require('../middleware/upload');
const pool = require('../db/pool');
const { uploadBuffer } = require('../utils/cloudinary');

const router = express.Router();

// Upload logo
router.post('/logo', authenticateToken, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const result = await uploadBuffer(req.file.buffer, { folder: 'localink/logos' });
    const url = result.secure_url;
    await pool.query('UPDATE provider_profiles SET logo_url = $1 WHERE user_id = $2', [url, req.user.id]);
    res.json({ url });
  } catch (err) {
    console.error('Cloudinary upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Upload cover image
router.post('/cover', authenticateToken, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const result = await uploadBuffer(req.file.buffer, { folder: 'localink/covers' });
    const url = result.secure_url;
    await pool.query('UPDATE provider_profiles SET cover_image_url = $1 WHERE user_id = $2', [url, req.user.id]);
    res.json({ url });
  } catch (err) {
    console.error('Cloudinary upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Upload service image(s) -- accepts multiple files in one request
router.post('/service/:serviceId', authenticateToken, upload.array('images', 10), async (req, res) => {
  const { serviceId } = req.params;
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No file uploaded' });
  try {
    // Verify ownership
    const check = await pool.query('SELECT provider_id FROM services WHERE id = $1', [serviceId]);
    if (check.rows.length === 0 || check.rows[0].provider_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    // Upload every file to Cloudinary in parallel, then append all resulting
    // URLs to image_urls in a single DB update (avoids one round-trip per photo).
    const results = await Promise.all(
      req.files.map(file => uploadBuffer(file.buffer, { folder: `localink/services/${serviceId}` }))
    );
    const urls = results.map(r => r.secure_url);
    await pool.query(
      `UPDATE services SET image_urls = COALESCE(image_urls, '{}') || $1::text[] WHERE id = $2`,
      [urls, serviceId]
    );
    res.json({ urls });
  } catch (err) {
    console.error('Cloudinary upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Upload portfolio image
router.post('/portfolio', authenticateToken, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const result = await uploadBuffer(req.file.buffer, { folder: `localink/portfolio/${req.user.id}` });
    const url = result.secure_url;
    res.json({ url });
  } catch (err) {
    console.error('Cloudinary upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Remove a single photo from a service by its index in image_urls
router.delete('/service/:serviceId/image/:index', authenticateToken, async (req, res) => {
  const { serviceId, index } = req.params;
  const idx = parseInt(index, 10);
  try {
    const check = await pool.query('SELECT provider_id, image_urls FROM services WHERE id = $1', [serviceId]);
    if (check.rows.length === 0 || check.rows[0].provider_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const urls = check.rows[0].image_urls || [];
    if (isNaN(idx) || idx < 0 || idx >= urls.length) {
      return res.status(400).json({ error: 'Invalid photo index' });
    }
    urls.splice(idx, 1);
    await pool.query('UPDATE services SET image_urls = $1 WHERE id = $2', [urls, serviceId]);
    res.json({ image_urls: urls });
  } catch (err) {
    console.error('Delete service image error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;