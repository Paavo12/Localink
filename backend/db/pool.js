const { Pool } = require('pg');

// On Railway, DATABASE_URL is automatically provided.
// On local, set it in .env or use individual variables.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL environment variable is missing.');
  console.error('   On Railway, make sure your PostgreSQL service is linked to your backend.');
  console.error('   On local, set DATABASE_URL in your .env file.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ===== CREATE SUBSCRIPTION PAYMENTS TABLE ON STARTUP =====
async function initializeTables() {
  const client = await pool.connect();
  try {
    // Create subscription_payments table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscription_payments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        invoice_id UUID REFERENCES payment_requests(id),
        amount DECIMAL(10,2) NOT NULL,
        tier VARCHAR(20) NOT NULL,
        payment_date TIMESTAMP DEFAULT NOW(),
        expiry_date DATE,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ subscription_payments table ensured');

    // Create index for faster queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_subscription_payments_user ON subscription_payments(user_id)
    `);
    console.log('✅ subscription_payments index ensured');

  } catch (err) {
    console.error('❌ Failed to initialize tables:', err.message);
  } finally {
    client.release();
  }
}

// Run the initialization (non-blocking)
initializeTables();

// Test the connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ Database connected successfully');
    release();
  }
});

module.exports = pool;