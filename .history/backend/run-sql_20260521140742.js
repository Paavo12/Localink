const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'namibconnect',
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to database.');

    // Run the ALTER statements
    await client.query(`ALTER TABLE business_hours ALTER COLUMN open_time DROP NOT NULL;`);
    console.log('✓ Removed NOT NULL constraint from open_time');

    await client.query(`ALTER TABLE business_hours ALTER COLUMN close_time DROP NOT NULL;`);
    console.log('✓ Removed NOT NULL constraint from close_time');

    await client.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS image_urls TEXT[];`);
    console.log('✓ Added image_urls column to services');

    console.log('All SQL commands executed successfully.');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

run();