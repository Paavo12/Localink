const { Pool } = require('pg');
const path = require('path');

// Load .env from the root folder (one level up from backend)
require('dotenv').config({ path: 'C:/Users/richa/OneDrive/Documents/Project NamibConnect/namibconnect-static/.env' });

// Debug: check if password is loaded
console.log('DB_PASSWORD from .env:', process.env.DB_PASSWORD ? '✅ Loaded' : '❌ Missing');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

module.exports = pool;