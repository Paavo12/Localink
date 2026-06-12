// fix-category.js
const pool = require('./db/pool');

async function fixCategory() {
  try {
    // Update the plumbing business (replace 'Your Business Name' with actual name)
    await pool.query(
      `UPDATE provider_profiles 
       SET category = 'Plumbing' 
       WHERE business_name ILIKE '%plumb%' OR category IS NULL`
    );
    console.log('✅ Updated plumbing business category to "Plumbing"');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    pool.end();
  }
}

fixCategory();