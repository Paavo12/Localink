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

    // Create calendar_tokens table if it doesn't exist (Google Calendar sync)
    await client.query(`
      CREATE TABLE IF NOT EXISTS calendar_tokens (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        token_expiry TIMESTAMP,
        calendar_id VARCHAR(255) DEFAULT 'primary',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ calendar_tokens table ensured');

    // Add calendar_event_id column to appointments if missing (links a booking to its synced calendar event)
    await client.query(`
      ALTER TABLE appointments ADD COLUMN IF NOT EXISTS calendar_event_id VARCHAR(255)
    `);
    console.log('✅ appointments.calendar_event_id column ensured');

    // Add is_available column to services (lets providers mark a room/car/etc.
    // as fully booked or unavailable, separate from is_active which controls
    // whether the service is listed at all)
    await client.query(`
      ALTER TABLE services ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true
    `);
    console.log('✅ services.is_available column ensured');

    // Add other services columns that have only ever existed in schema.sql
    // (used for brand-new databases) but were never added via an actual
    // ALTER TABLE migration -- so any database created before these columns
    // were introduced never got them, causing 'column does not exist'
    // errors (e.g. image_urls, hit when uploading a photo for a car/room).
    await client.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS image_urls TEXT[]`);
    await client.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`);
    await client.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS description TEXT`);
    console.log('✅ services.image_urls / is_active / description columns ensured');

    // Same class of bug, swept across every other table with nullable/
    // defaulted columns that may have been added to schema.sql after the
    // live database was first created. All of these are safe no-ops if the
    // column already exists.
    await client.query(`ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS cover_image_url TEXT`);
    await client.query(`ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(50)`);
    await client.query(`ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION`);
    await client.query(`ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION`);
    await client.query(`ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false`);
    await client.query(`ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20) DEFAULT 'basic'`);
    await client.query(`ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS subscription_end DATE`);
    await client.query(`ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS boosted_until TIMESTAMP`);

    await client.query(`ALTER TABLE business_hours ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`);

    // reviews.response / responded_at back the review-reply feature (a
    // provider replying publicly to a review) -- these were never added
    // via a live migration either, so replying would hit this exact same
    // error until now.
    await client.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS response TEXT`);
    await client.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS responded_at TIMESTAMP`);
    await client.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT false`);

    await client.query(`ALTER TABLE anonymous_comments ADD COLUMN IF NOT EXISTS sentiment VARCHAR(20)`);

    await client.query(`ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS proof_image_url TEXT`);
    await client.query(`ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS admin_notes TEXT`);
    await client.query(`ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);

    await client.query(`ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0`);

    console.log('✅ Defensive column sweep complete across provider_profiles, business_hours, reviews, anonymous_comments, payment_requests, portfolio_items');

    // Add service_type column to quote_requests (this was already being
    // inserted into by quotes.js but the column never actually existed,
    // so every quote request was failing with a 500 error)
    await client.query(`
      ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS service_type VARCHAR(255)
    `);
    console.log('✅ quote_requests.service_type column ensured');

    // Create quote_recipients table if it doesn't exist (broadcast quote
    // requests: one quote_requests row can fan out to many providers)
    await client.query(`
      CREATE TABLE IF NOT EXISTS quote_recipients (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        quote_id UUID REFERENCES quote_requests(id) ON DELETE CASCADE,
        provider_id UUID REFERENCES provider_profiles(user_id) ON DELETE CASCADE,
        priority_rank INT DEFAULT 0,
        is_read BOOLEAN DEFAULT false,
        notified_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ quote_recipients table ensured');

    // Add conversation_id column to messages (messages.js has always
    // inserted into this column, but it never actually existed on the
    // table -- every message send was failing with a DB error).
    await client.query(`
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS conversation_id UUID
    `);
    console.log('✅ messages.conversation_id column ensured');

  } catch (err) {
    console.error('❌ Failed to initialize tables:', err.message);
  } finally {
    client.release();
  }
}

// Run the initialization (non-blocking)
initializeTables();

// Also run the shareholder-features migration (banners, disputes, messages,
// newsletter_subscribers, push_tokens, verification_documents, etc.) on every
// startup. This used to be a manual-only script that nothing ever called
// automatically, so a fresh database would be missing these tables. It's
// idempotent (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS), so it's
// safe to run on every boot.
const migrateShareholderFeatures = require('../migrations/add-shareholder-features');
migrateShareholderFeatures(pool).catch(() => {}); // errors already logged inside

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