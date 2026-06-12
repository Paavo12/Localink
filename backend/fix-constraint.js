// backend/fix-constraint.js
const pool = require('./db/pool');

async function addConstraint() {
  try {
    console.log('Adding unique constraint on business_hours (provider_id, day_of_week)...');
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'unique_provider_day'
        ) THEN
          ALTER TABLE business_hours ADD CONSTRAINT unique_provider_day UNIQUE (provider_id, day_of_week);
        END IF;
      END $$;
    `);
    console.log('✅ Constraint added (or already exists)!');
  } catch (err) {
    console.error('❌ Error adding constraint:', err.message);
  } finally {
    pool.end();
  }
}

addConstraint();