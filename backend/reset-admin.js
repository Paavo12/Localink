// reset-admin.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcrypt');
const pool = require('./db/pool');

async function resetAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@localink.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
  const adminFullName = 'Super Admin';

  try {
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, is_active)
       VALUES ($1, $2, $3, 'admin', true)
       ON CONFLICT (email) DO UPDATE SET password_hash = $2, full_name = $3, is_active = true`,
      [adminEmail, hashedPassword, adminFullName]
    );
    console.log(`✅ Admin user created/updated:`);
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log(`\nYou can now log in at /admin.html`);
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    pool.end();
  }
}

resetAdmin();