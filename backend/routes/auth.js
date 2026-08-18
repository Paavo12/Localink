const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { sendProviderWelcomeEmail, sendAdminNotification } = require('../utils/email');

const router = express.Router();

// ---------- REGISTER (client only) ----------
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('full_name').notEmpty().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password, full_name, phone } = req.body;
  const password_hash = await bcrypt.hash(password, 10);

  try {
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, phone, role) 
       VALUES ($1, $2, $3, $4, 'client') RETURNING id, email, role, full_name`,
      [email, password_hash, full_name, phone]
    );
    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- REGISTER PROVIDER (with services & hours in one call) ----------
router.post('/register-provider', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('full_name').notEmpty().trim(),
  body('business_name').notEmpty().trim(),
  body('category').optional().trim(),
  body('description').optional().trim(),
  body('address').optional().trim(),
  body('whatsapp_number').optional().trim(),
  body('services').optional().isArray(),
  body('hours').optional().isArray(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const {
    email, password, full_name, phone,
    business_name, category, description, address, whatsapp_number,
    services = [],
    hours = []
  } = req.body;

  const password_hash = await bcrypt.hash(password, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // After profile creation, handle document upload
if (req.files && req.files.length > 0) {
  // Upload documents
  const upload = require('../utils/cloudinary');
  for (const file of req.files) {
    const result = await uploadBuffer(file.buffer, { 
      folder: `localink/verification/${user.id}` 
    });
    await client.query(
      `INSERT INTO verification_documents (user_id, document_type, document_url, status)
       VALUES ($1, $2, $3, 'pending')`,
      [user.id, file.fieldname || 'id_document', result.secure_url]
    );
  }
}

    // 1. Insert user
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, full_name, phone, role)
       VALUES ($1, $2, $3, $4, 'provider') RETURNING id, email, role, full_name`,
      [email, password_hash, full_name, phone]
    );
    const user = userResult.rows[0];

    // 2. Insert provider profile
    await client.query(
      `INSERT INTO provider_profiles (user_id, business_name, category, description, address, whatsapp_number, is_verified, subscription_tier)
       VALUES ($1, $2, $3, $4, $5, $6, false, 'basic')`,
      [user.id, business_name, category || null, description || null, address || null, whatsapp_number || null]
    );

    // 3. Insert services (if any)
    for (const svc of services) {
      if (svc.name && svc.price && svc.duration_minutes) {
        await client.query(
          `INSERT INTO services (provider_id, name, description, price, duration_minutes)
           VALUES ($1, $2, $3, $4, $5)`,
          [user.id, svc.name, svc.description || null, parseFloat(svc.price), parseInt(svc.duration_minutes)]
        );
      }
    }

    // 4. Insert hours (if any)
    for (const hr of hours) {
      if (hr.day_of_week !== undefined && hr.open_time && hr.close_time) {
        await client.query(
          `INSERT INTO business_hours (provider_id, day_of_week, open_time, close_time, is_closed)
           VALUES ($1, $2, $3, $4, $5)`,
          [user.id, hr.day_of_week, hr.open_time, hr.close_time, false]
        );
      }
    }

    // ========== SEND EMAILS ==========
    // Send welcome email to provider
    try {
      await sendProviderWelcomeEmail(email, full_name, business_name);
    } catch (emailErr) {
      console.error('Welcome email failed:', emailErr);
      // Continue – don't block registration
    }

    // Send admin notification
    try {
      const adminResult = await client.query('SELECT email FROM users WHERE role = $1 LIMIT 1', ['admin']);
      if (adminResult.rows.length > 0) {
        await sendAdminNotification(adminResult.rows[0].email, full_name, business_name, email);
      }
    } catch (adminEmailErr) {
      console.error('Admin notification failed:', adminEmailErr);
      // Continue – don't block registration
    }

    await client.query('COMMIT');

    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// ---------- LOGIN ----------
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = result.rows[0];
    if (!user.is_active) return res.status(401).json({ error: 'Account deactivated' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user.id, email: user.email, role: user.role, full_name: user.full_name } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- GET CURRENT USER (protected) ----------
router.get('/me', require('../middleware/auth').authenticateToken, async (req, res) => {
  const result = await pool.query('SELECT id, email, role, full_name, phone, is_active FROM users WHERE id = $1', [req.user.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
  res.json(result.rows[0]);
});

module.exports = router;