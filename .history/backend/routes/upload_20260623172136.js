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

// Upload service image
router.post('/service/:serviceId', authenticateToken, upload.single('image'), async (req, res) => {
  const { serviceId } = req.params;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    // Verify ownership
    const check = await pool.query('SELECT provider_id FROM services WHERE id = $1', [serviceId]);
    if (check.rows.length === 0 || check.rows[0].provider_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const result = await uploadBuffer(req.file.buffer, { folder: `localink/services/${serviceId}` });
    const url = result.secure_url;
    await pool.query(
      `UPDATE services SET image_urls = array_append(COALESCE(image_urls, '{}'), $1) WHERE id = $2`,
      [url, serviceId]
    );
    res.json({ url });
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

module.exports = router;