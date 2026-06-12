// backend/fix-constraint.js
const pool = require('./db/pool');

async function addConstraint() {
  try {
    console.log('Adding unique constraint on business_hours (provider_id, day_of_week)...');
    await pool.query(`
      ALTER TABLE business_hours 
      ADD CONSTRAINT IF NOT EXISTS unique_provider_day 
      UNIQUE (provider_id, day_of_week)
    `);
    console.log('✅ Constraint added successfully!');
  } catch (err) {
    console.error('❌ Error adding constraint:', err.message);
  } finally {
    pool.end();
  }
}

addConstraint();