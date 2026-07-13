require('dotenv').config();
const { sendPaymentConfirmationEmail } = require('./backend/utils/email');

sendPaymentConfirmationEmail('shikuloph1@gmail.com', 'Test User', 'verified')
  .then(() => console.log('✅ Test complete'))
  .catch(err => console.error('❌ Error:', err));