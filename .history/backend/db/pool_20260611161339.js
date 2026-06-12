const { Pool } = require('pg');
const path = require('path');

// Load .env from the backend folder (where this file lives)
require('dotenv').config({ path: path.join(__dirname, '../.env') });

console.log('🔐 DB_PASSWORD loaded?', process.env.DB_PASSWORD ? '✅ Yes' : '❌ No');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

module.exports = pool;