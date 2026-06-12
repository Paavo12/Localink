const { Pool } = require('pg');

// TEMPORARY: hardcoded password – remove after fixing .env
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'your_actual_postgres_password', // <-- CHANGE THIS
  database: 'namibconnect',
});

module.exports = pool;