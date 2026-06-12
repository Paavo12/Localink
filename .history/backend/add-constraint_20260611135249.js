// add-constraint.js – run once to add unique constraint on business_hours
require('dotenv').config();
const pool = require('./db/pool');

async function addConstraint() {
  const client = await pool.connect();
  try {
    console.log('Connected. Adding unique constraint...');
    await client.query('ALTER TABLE business_hours ADD UNIQUE (provider_id, day_of_week);');
    console.log('✅ Constraint added successfully!');
  } catch (err) {
    if (err.code === '42P07') {
      console.log('⚠️ Constraint already exists – nothing to do.');
    } else {
      console.error('❌ Error:', err.message);
    }
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
}

addConstraint();