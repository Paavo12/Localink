// backend/migrations/add-missing-columns.js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('../db/pool');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Add created_at to business_hours if missing
    const colCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'business_hours' AND column_name = 'created_at'
    `);
    if (colCheck.rows.length === 0) {
      await client.query('ALTER TABLE business_hours ADD COLUMN created_at TIMESTAMP DEFAULT NOW()');
      console.log('✅ Added created_at to business_hours');
    } else {
      console.log('ℹ️ created_at already exists in business_hours');
    }

    // 2. Add payment_requests table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_requests (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        invoice_number VARCHAR(50) UNIQUE NOT NULL,
        tier VARCHAR(20) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','submitted','approved','rejected')),
        proof_image_url TEXT,
        admin_notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ payment_requests table ensured');

    // 3. Add unique constraint on business_hours if not exists
    const constraintCheck = await client.query(`
      SELECT 1 FROM pg_constraint WHERE conname = 'unique_provider_day'
    `);
    if (constraintCheck.rows.length === 0) {
      await client.query(`
        ALTER TABLE business_hours ADD CONSTRAINT unique_provider_day UNIQUE (provider_id, day_of_week)
      `);
      console.log('✅ Added unique_provider_day constraint');
    } else {
      console.log('ℹ️ unique_provider_day constraint already exists');
    }

    // 4. Add performance indexes
    const indexQueries = [
      'CREATE INDEX IF NOT EXISTS idx_appointments_provider ON appointments(provider_id)',
      'CREATE INDEX IF NOT EXISTS idx_appointments_client ON appointments(client_id)',
      'CREATE INDEX IF NOT EXISTS idx_reviews_provider ON reviews(provider_id)',
      'CREATE INDEX IF NOT EXISTS idx_payment_requests_user ON payment_requests(user_id)',
      'CREATE EXTENSION IF NOT EXISTS pg_trgm',
      'CREATE INDEX IF NOT EXISTS idx_profiles_name ON provider_profiles USING GIN (business_name gin_trgm_ops)',
    ];
    for (const q of indexQueries) {
      await client.query(q);
      console.log(`✅ Ran: ${q.substring(0, 50)}...`);
    }

    await client.query('COMMIT');
    console.log('✅ All migrations completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();