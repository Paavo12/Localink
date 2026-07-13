const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const pool = require('../db/pool');
const upload = require('../middleware/upload');
const { uploadBuffer } = require('../utils/cloudinary');
const { sendPaymentConfirmationEmail } = require('../utils/email');

// ---------- Helper: Generate invoice number ----------
function generateInvoiceNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `INV-${year}${month}-${random}`;
}

// ---------- 1. Request invoice (user) ----------
router.post('/request-invoice', authenticateToken, async (req, res) => {
  const { tier } = req.body;
  const userId = req.user.id;

  const prices = {
    verified: 149.00,
    premium: 399.00,
  };

  if (!prices[tier]) {
    return res.status(400).json({ error: 'Invalid tier selected' });
  }

  try {
    // Check if user already has a pending request for same tier
    const existing = await pool.query(
      `SELECT id FROM payment_requests 
       WHERE user_id = $1 AND tier = $2 AND status IN ('pending', 'submitted')`,
      [userId, tier]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'You already have a pending request for this tier. Please wait for admin approval.' });
    }

    const invoiceNumber = generateInvoiceNumber();
    const amount = prices[tier];

    const result = await pool.query(
      `INSERT INTO payment_requests (user_id, invoice_number, tier, amount, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id, invoice_number, tier, amount, status, created_at`,
      [userId, invoiceNumber, tier, amount]
    );

    res.status(201).json({
      message: 'Invoice generated successfully',
      invoice: result.rows[0],
      bankingDetails: {
        bank: 'Bank Windhoek',
        accountName: 'Localink (Pty) Ltd',
        accountNumber: '1234567890',
        branchCode: '123456',
        reference: invoiceNumber,
      },
      instructions: 'Please transfer the exact amount and upload proof of payment below.',
    });
  } catch (error) {
    console.error('Invoice generation error:', error);
    res.status(500).json({ error: 'Failed to generate invoice' });
  }
});

// ---------- 2. Upload proof of payment ----------
router.post(
  '/upload-proof',
  authenticateToken,
  upload.single('proofImage'),
  async (req, res) => {
    const { invoiceId } = req.body;
    if (!invoiceId) {
      return res.status(400).json({ error: 'Invoice ID is required' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload a proof image (PNG, JPG, PDF)' });
    }

    try {
      // Verify invoice belongs to user and is pending/submitted
      const invoiceCheck = await pool.query(
        `SELECT id, status FROM payment_requests 
         WHERE id = $1 AND user_id = $2`,
        [invoiceId, req.user.id]
      );
      if (invoiceCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      const invoice = invoiceCheck.rows[0];
      if (invoice.status !== 'pending' && invoice.status !== 'submitted') {
        return res.status(400).json({ error: 'This invoice cannot be updated' });
      }

      // Upload to Cloudinary (folder: 'proofs')
      const uploadResult = await uploadBuffer(req.file.buffer, {
        folder: 'localink/proofs',
      });
      const imageUrl = uploadResult.secure_url;

      // Update invoice with proof and status
      await pool.query(
        `UPDATE payment_requests 
         SET proof_image_url = $1, status = 'submitted', updated_at = NOW() 
         WHERE id = $2`,
        [imageUrl, invoiceId]
      );

      res.json({ message: 'Proof uploaded successfully', imageUrl });
    } catch (error) {
      console.error('Proof upload error:', error);
      res.status(500).json({ error: 'Failed to upload proof' });
    }
  }
);

// ---------- 3. Get user's invoice status ----------
router.get('/my-invoices', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, invoice_number, tier, amount, status, proof_image_url, created_at, updated_at
       FROM payment_requests
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

module.exports = router;