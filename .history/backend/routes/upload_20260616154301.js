const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const upload = require('../middleware/upload');
const pool = require('../db/pool');
const { v2: cloudinary } = require('cloudinary');

const router = express.Router();

// Helper to delete old image from Cloudinary if needed
async function deleteCloudinaryImage(url) {
  if (!url) return;
  try {
    // Extract public ID from URL (format: /upload/v123456/folder/filename.jpg)
    const parts = url.split('/');
    const filename = parts[parts.length - 1];
    const publicId = `localink/${filename.split('.')[0]}`;
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error('Error deleting old image:', err);
  }
}

// Upload logo
router.post('/logo', authenticateToken, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  
  // Get the Cloudinary URL
  const url = req.file.path; // Cloudinary returns the URL in the path field

  // Optionally delete old logo
  const old = await pool.query('SELECT logo_url FROM provider_profiles WHERE user_id = $1', [req.user.id]);
  if (old.rows[0]?.logo_url) {
    await deleteCloudinaryImage(old.rows[0].logo_url);
  }

  await pool.query('UPDATE provider_profiles SET logo_url = $1 WHERE user_id = $2', [url, req.user.id]);
  res.json({ url });
});

// Upload cover
router.post('/cover', authenticateToken, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  
  const url = req.file.path;

  const old = await pool.query('SELECT cover_image_url FROM provider_profiles WHERE user_id = $1', [req.user.id]);
  if (old.rows[0]?.cover_image_url) {
    await deleteCloudinaryImage(old.rows[0].cover_image_url);
  }

  await pool.query('UPDATE provider_profiles SET cover_image_url = $1 WHERE user_id = $2', [url, req.user.id]);
  res.json({ url });
});

// Upload service image
router.post('/service/:serviceId', authenticateToken, upload.single('image'), async (req, res) => {
  const { serviceId } = req.params;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  // Verify ownership
  const check = await pool.query('SELECT provider_id FROM services WHERE id = $1', [serviceId]);
  if (check.rows.length === 0 || check.rows[0].provider_id !== req.user.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const url = req.file.path;

  // Append to image_urls array
  await pool.query(
    `UPDATE services SET image_urls = array_append(COALESCE(image_urls, '{}'), $1) WHERE id = $2`,
    [url, serviceId]
  );
  res.json({ url });
});

module.exports = router;