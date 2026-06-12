const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_PORT == 465, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function sendBookingNotification(providerEmail, clientName, serviceName, date) {
  if (!providerEmail) return;
  // If SMTP credentials are missing, just log and skip
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('⚠️ Email not sent: SMTP credentials missing in .env');
    return;
  }
  try {
    await transporter.sendMail({
from: `"Localink" <${process.env.SMTP_USER}>`,
      to: providerEmail,
      subject: 'New booking request',
      html: `<p><strong>${clientName}</strong> booked <strong>${serviceName}</strong> on <strong>${new Date(date).toLocaleString()}</strong>.</p>
             <p><a href="http://localhost:5000/dashboard.html">View in dashboard</a></p>`
    });
    console.log(`📧 Email sent to ${providerEmail}`);
  } catch (err) {
    console.error('❌ Email sending failed:', err.message);
  }
}

module.exports = { sendBookingNotification };