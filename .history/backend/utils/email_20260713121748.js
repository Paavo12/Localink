const nodemailer = require('nodemailer');

// ---------- Configure Transporter ----------
function getTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // true for port 465, false for port 587
    auth: {
      user: process.env.SMTP_USER || 'localink.na@gmail.com',
      pass: process.env.SMTP_PASS, // Your App Password here
    },
  });
}

// ---------- Send Booking Notification ----------
async function sendBookingNotification(providerEmail, clientName, serviceName, date) {
  if (!providerEmail) return;
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('⚠️ Email not sent: SMTP credentials missing in .env');
    return;
  }
  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"Localink" <${process.env.SMTP_USER}>`,
      to: providerEmail,
      subject: 'New Booking Request – Localink',
      html: `
        <h2>New Booking Request</h2>
        <p><strong>${clientName}</strong> booked <strong>${serviceName}</strong> on <strong>${new Date(date).toLocaleString()}</strong>.</p>
        <p><a href="${process.env.FRONTEND_URL || 'https://your-domain.com'}/dashboard.html">View in Dashboard</a></p>
        <br>
        <p>– The Localink Team</p>
      `,
    });
    console.log(`📧 Booking notification sent to ${providerEmail}`);
  } catch (err) {
    console.error('❌ Email sending failed:', err.message);
  }
}

// ---------- Send Payment Confirmation ----------
async function sendPaymentConfirmationEmail(toEmail, fullName, tier) {
  if (!toEmail) return;
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('⚠️ Email not sent: SMTP credentials missing');
    return;
  }

  const subject = `Localink – Subscription Activation (${tier})`;
  const html = `
    <h2>Hello ${fullName || 'Valued Provider'},</h2>
    <p>Your payment has been approved and your <strong>${tier}</strong> subscription is now active!</p>
    <p>You can now enjoy all the benefits of your plan:</p>
    <ul>
      ${tier === 'verified' ? `
        <li>✅ Verified badge on your profile</li>
        <li>🚀 2x search ranking boost</li>
        <li>📊 7-day profile analytics</li>
        <li>📝 Up to 15 services</li>
      ` : `
        <li>⭐ Featured badge</li>
        <li>🚀 5x search ranking boost</li>
        <li>📊 30-day profile analytics</li>
        <li>📝 Unlimited services</li>
        <li>🏠 Homepage feature slot</li>
      `}
    </ul>
    <p>Thank you for choosing Localink!</p>
    <p>Visit your <a href="${process.env.FRONTEND_URL || 'https://your-domain.com'}/dashboard">dashboard</a> to manage your business.</p>
    <br>
    <p>– The Localink Team</p>
    <p><small>Localink – Connecting communities, one service at a time.</small></p>
  `;

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"Localink" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject,
      html,
    });
    console.log(`📧 Confirmation email sent to ${toEmail}`);
  } catch (err) {
    console.error('❌ Email failed:', err.message);
  }
}

// ---------- Export ----------
module.exports = {
  sendBookingNotification,
  sendPaymentConfirmationEmail,
};