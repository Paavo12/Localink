const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const upload = require('../middleware/upload');
const pool = require('../db/pool');
const router = express.Router();

router.post('/logo', authenticateToken, upload.single('image'), async (req, res) => {
  const url = `/uploads/${req.file.filename}`;
  await pool.query('UPDATE provider_profiles SET logo_url = $1 WHERE user_id = $2', [url, req.user.id]);
  res.json({ url });
});

router.post('/cover', authenticateToken, upload.single('image'), async (req, res) => {
  const url = `/uploads/${req.file.filename}`;
  await pool.query('UPDATE provider_profiles SET cover_image_url = $1 WHERE user_id = $2', [url, req.user.id]);
  res.json({ url });
});

module.exports = router;