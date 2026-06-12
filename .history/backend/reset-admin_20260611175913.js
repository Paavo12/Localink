// reset-admin.js
const bcrypt = require('bcrypt');
const pool = require('./db/pool');

async function resetAdmin() {
  // Change these values to whatever you want
  const adminEmail = 'admin@namibconnect.com';
  const adminPassword = 'Admin123!';  // Change this to a secure password
  const adminFullName = 'Super Admin';

  try {
    // Hash the password
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // Insert or update admin user
    await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, is_active)
       VALUES ($1, $2, $3, 'admin', true)
       ON CONFLICT (email) DO UPDATE SET password_hash = $2, full_name = $3, is_active = true`,
      [adminEmail, hashedPassword, adminFullName]
    );

    console.log(`✅ Admin user created/updated:`);
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log(`\nYou can now log in at http://localhost:5000/admin.html`);
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    pool.end();
  }
}

resetAdmin();