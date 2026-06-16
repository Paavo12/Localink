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