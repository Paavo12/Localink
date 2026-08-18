const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const nodemailer = require('nodemailer');

// Subscribe
router.post('/subscribe', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  try {
    await pool.query(
      `INSERT INTO newsletter_subscribers (email) VALUES ($1) ON CONFLICT (email) DO NOTHING`,
      [email]
    );
    res.json({ message: 'Subscribed successfully!' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: Send newsletter
router.post('/send', authenticateToken, requireRole('admin'), async (req, res) => {
  const { subject, content } = req.body;
  try {
    const subscribers = await pool.query('SELECT email FROM newsletter_subscribers WHERE is_active = true');
    if (subscribers.rows.length === 0) {
      return res.status(400).json({ error: 'No subscribers' });
    }
    
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    
    const batchSize = 50;
    for (let i = 0; i < subscribers.rows.length; i += batchSize) {
      const batch = subscribers.rows.slice(i, i + batchSize);
      await transporter.sendMail({
        from: `"Localink" <${process.env.SMTP_USER}>`,
        bcc: batch.map(s => s.email).join(','),
        subject: subject || 'Weekly Localink Update',
        html: content || '<h2>Check out this week\'s featured providers!</h2>',
      });
    }
    
    res.json({ message: `Newsletter sent to ${subscribers.rows.length} subscribers` });
  } catch (err) {
    console.error('Newsletter error:', err);
    res.status(500).json({ error: 'Failed to send newsletter' });
  }
});

module.exports = router;