const pool = require('./db/pool');

async function run() {
  try {
    console.log('Connecting to database...');
    
    // Remove NOT NULL constraints from business_hours
    await pool.query(`ALTER TABLE business_hours ALTER COLUMN open_time DROP NOT NULL;`);
    console.log('✓ Removed NOT NULL constraint from open_time');
    
    await pool.query(`ALTER TABLE business_hours ALTER COLUMN close_time DROP NOT NULL;`);
    console.log('✓ Removed NOT NULL constraint from close_time');
    
    // Add image_urls column to services if not exists
    await pool.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS image_urls TEXT[];`);
    console.log('✓ Added image_urls column to services');
    
    console.log('\n✅ All fixes applied successfully!');
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('Make sure your PostgreSQL server is running and .env has correct credentials.');
  } finally {
    pool.end();
  }
}

run();