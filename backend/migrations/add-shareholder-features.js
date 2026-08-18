require('dotenv').config();
const pool = require('../db/pool');

async function migrateShareholderFeatures() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('📦 Running shareholder features migration...');
    
    // 1. Add boosted_until to provider_profiles
    await client.query(`
      ALTER TABLE provider_profiles 
      ADD COLUMN IF NOT EXISTS boosted_until TIMESTAMP
    `);
    console.log('✅ Added boosted_until');
    
    // 2. Create banners table
    await client.query(`
      CREATE TABLE IF NOT EXISTS banners (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        title VARCHAR(255) NOT NULL,
        image_url TEXT NOT NULL,
        link_url TEXT,
        position VARCHAR(50) DEFAULT 'homepage',
        is_active BOOLEAN DEFAULT true,
        starts_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Created banners table');
    
    // 3. Create newsletter_subscribers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS newsletter_subscribers (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Created newsletter_subscribers table');
    
    // 4. Create push_tokens table
    await client.query(`
      CREATE TABLE IF NOT EXISTS push_tokens (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL,
        device_type VARCHAR(20) DEFAULT 'web',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Created push_tokens table');
    
    // 5. Create verification_documents table
    await client.query(`
      CREATE TABLE IF NOT EXISTS verification_documents (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        document_type VARCHAR(50) NOT NULL,
        document_url TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        admin_notes TEXT,
        uploaded_at TIMESTAMP DEFAULT NOW(),
        reviewed_at TIMESTAMP
      )
    `);
    console.log('✅ Created verification_documents table');
    
    // 6. Add background check columns to provider_profiles
    await client.query(`
      ALTER TABLE provider_profiles 
      ADD COLUMN IF NOT EXISTS background_check_status VARCHAR(20) DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS background_check_completed TIMESTAMP,
      ADD COLUMN IF NOT EXISTS background_check_report TEXT
    `);
    console.log('✅ Added background check columns');
    
    // 7. Create disputes and dispute_messages tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS disputes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        booking_id UUID REFERENCES appointments(id),
        client_id UUID REFERENCES users(id),
        provider_id UUID REFERENCES provider_profiles(user_id),
        reason TEXT NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'open',
        resolution TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Created disputes table');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS dispute_messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        dispute_id UUID REFERENCES disputes(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id),
        message TEXT NOT NULL,
        is_admin BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Created dispute_messages table');
    
    // 8. Create messages and conversations tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        sender_id UUID REFERENCES users(id),
        receiver_id UUID REFERENCES users(id),
        booking_id UUID REFERENCES appointments(id),
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Created messages table');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS message_conversations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        client_id UUID REFERENCES users(id),
        provider_id UUID REFERENCES provider_profiles(user_id),
        booking_id UUID REFERENCES appointments(id),
        last_message_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Created message_conversations table');
    
    await client.query('COMMIT');
    console.log('✅ All shareholder features migrated successfully!');
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

migrateShareholderFeatures();