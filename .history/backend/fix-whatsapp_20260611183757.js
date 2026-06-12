// fix-whatsapp.js
const pool = require('./db/pool');

async function fixWhatsApp() {
  try {
    // Example: Update your plumbing business with a test number
    // Replace with your actual business name and number (use international format without '+')
    await pool.query(
      `UPDATE provider_profiles 
       SET whatsapp_number = '264812345678' 
       WHERE business_name ILIKE '%plumb%'`
    );
    console.log('✅ WhatsApp number updated');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    pool.end();
  }
}

fixWhatsApp();