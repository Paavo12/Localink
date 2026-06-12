const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const upload = require('../middleware/upload');
const pool = require('../db/pool');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Ensure uploads directory exists (absolute path)
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

router.post('/logo', authenticateToken, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/uploads/${req.file.filename}`;
  await pool.query('UPDATE provider_profiles SET logo_url = $1 WHERE user_id = $2', [url, req.user.id]);
  res.json({ url });
});

router.post('/cover', authenticateToken, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/uploads/${req.file.filename}`;
  await pool.query('UPDATE provider_profiles SET cover_image_url = $1 WHERE user_id = $2', [url, req.user.id]);
  res.json({ url });
});

router.post('/service/:serviceId', authenticateToken, upload.single('image'), async (req, res) => {
  const { serviceId } = req.params;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/uploads/${req.file.filename}`;
  const check = await pool.query('SELECT provider_id FROM services WHERE id = $1', [serviceId]);
  if (check.rows.length === 0 || check.rows[0].provider_id !== req.user.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  await pool.query(
    `UPDATE services SET image_urls = array_append(COALESCE(image_urls, '{}'), $1) WHERE id = $2`,
    [url, serviceId]
  );
  res.json({ url });
});

module.exports = router;