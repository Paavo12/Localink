require('dotenv').config();
const { Client } = require('pg');

console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_PASSWORD is set?', !!process.env.DB_PASSWORD);

const client = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

client.connect()
  .then(() => {
    console.log('✅ Connected to PostgreSQL!');
    client.end();
  })
  .catch(err => {
    console.error('❌ Connection error:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
    client.end();
  });