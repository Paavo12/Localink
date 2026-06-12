const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const pool = require('../db/pool');
const router = express.Router();

// Get all services for my business
router.get('/my', authenticateToken, async (req, res) => {
  const result = await pool.query('SELECT * FROM services WHERE provider_id = $1', [req.user.id]);
  res.json(result.rows);
});

// Create service
router.post('/', authenticateToken, async (req, res) => {
  const { name, description, price, duration_minutes } = req.body;
  const result = await pool.query(
    `INSERT INTO services (provider_id, name, description, price, duration_minutes)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.user.id, name, description, price, duration_minutes]
  );
  res.status(201).json(result.rows[0]);
});

// Update service
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, description, price, duration_minutes } = req.body;
  await pool.query(
    `UPDATE services SET name=$1, description=$2, price=$3, duration_minutes=$4 WHERE id=$5 AND provider_id=$6`,
    [name, description, price, duration_minutes, id, req.user.id]
  );
  res.json({ message: 'Updated' });
});

// Delete service
router.delete('/:id', authenticateToken, async (req, res) => {
  await pool.query('DELETE FROM services WHERE id=$1 AND provider_id=$2', [req.params.id, req.user.id]);
  res.json({ message: 'Deleted' });
});

module.exports = router;