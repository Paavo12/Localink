require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../db/pool');

async function clearData() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('Deleting appointments...');
    await client.query('DELETE FROM appointments');
    
    console.log('Deleting quote requests...');
    await client.query('DELETE FROM quote_requests');
    
    console.log('Deleting reviews...');
    await client.query('DELETE FROM reviews');
    
    console.log('Deleting anonymous comments...');
    await client.query('DELETE FROM anonymous_comments');
    
    console.log('Deleting reports...');
    await client.query('DELETE FROM reports');
    
    console.log('Deleting profile views...');
    await client.query('DELETE FROM profile_views');
    
    console.log('Deleting business hours...');
    await client.query('DELETE FROM business_hours');
    
    console.log('Deleting services...');
    await client.query('DELETE FROM services');
    
    console.log('Deleting provider profiles...');
    await client.query('DELETE FROM provider_profiles');
    
    console.log('Deleting clients (role = client)...');
    await client.query(`DELETE FROM users WHERE role = 'client'`);
    
    console.log('Deleting providers (role = provider)...');
    await client.query(`DELETE FROM users WHERE role = 'provider'`);
    
    // Keep admin users (role = 'admin')
    
    await client.query('COMMIT');
    console.log('✅ All services and clients deleted. Admin users remain.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error clearing data:', err.message);
  } finally {
    client.release();
    pool.end();
  }
}

clearData();