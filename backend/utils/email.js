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
      from: `"LocalLink" <${process.env.SMTP_USER}>`,
      to: providerEmail,
      subject: 'New Booking Request – LocalLink',
      html: `
        <h2>New Booking Request</h2>
        <p><strong>${clientName}</strong> booked <strong>${serviceName}</strong> on <strong>${new Date(date).toLocaleString()}</strong>.</p>
        <p><a href="${process.env.FRONTEND_URL || 'https://your-domain.com'}/dashboard.html">View in Dashboard</a></p>
        <br>
        <p>– The LocalLink Team</p>
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

  const subject = `LocalLink – Subscription Activation (${tier})`;
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
    <p>Thank you for choosing LocalLink!</p>
    <p>Visit your <a href="${process.env.FRONTEND_URL || 'https://your-domain.com'}/dashboard">dashboard</a> to manage your business.</p>
    <br>
    <p>– The LocalLink Team</p>
    <p><small>LocalLink – Connecting communities, one service at a time.</small></p>
  `;

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"LocalLink" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject,
      html,
    });
    console.log(`📧 Confirmation email sent to ${toEmail}`);
  } catch (err) {
    console.error('❌ Email failed:', err.message);
  }
}

// ---------- Send Provider Welcome Email ----------
async function sendProviderWelcomeEmail(toEmail, fullName, businessName) {
  if (!toEmail) return;
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('⚠️ Email not sent: SMTP credentials missing');
    return;
  }

  const subject = 'Welcome to LocalLink – Your Business is Now Listed!';
  const html = `
    <h2>Hello ${fullName},</h2>
    <p>Welcome to <strong>LocalLink</strong> – Namibia's trusted local services marketplace!</p>
    <p>Your business <strong>"${businessName}"</strong> has been successfully registered on our platform.</p>
    <h3>What's Next?</h3>
    <ul>
      <li>✅ <strong>Complete your profile</strong> – Add your logo, cover image, and detailed services.</li>
      <li>✅ <strong>Get verified</strong> – Upgrade to Verified or Premium to get a badge and boost your visibility.</li>
      <li>✅ <strong>Manage bookings</strong> – Monitor and confirm bookings from your dashboard.</li>
    </ul>
    <p><strong>Important:</strong> Your business is currently awaiting admin verification. This process typically takes 24-48 hours. You'll receive an email once your business is approved and visible to customers.</p>
    <p>Log in to your dashboard to get started:</p>
    <p><a href="${process.env.FRONTEND_URL || 'https://your-domain.com'}/dashboard" style="background:#ff921c;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">Go to Dashboard</a></p>
    <br>
    <p>Thank you for choosing LocalLink!</p>
    <p>– The LocalLink Team</p>
  `;

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"LocalLink" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject,
      html,
    });
    console.log(`📧 Welcome email sent to ${toEmail}`);
  } catch (err) {
    console.error('❌ Welcome email failed:', err.message);
  }
}

// ---------- Send Admin Notification ----------
async function sendAdminNotification(adminEmail, providerName, businessName, providerEmail) {
  if (!adminEmail) return;
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('⚠️ Email not sent: SMTP credentials missing');
    return;
  }

  const subject = '🔔 New Provider Registration – LocalLink';
  const html = `
    <h2>New Provider Registered</h2>
    <p>A new provider has just registered on LocalLink:</p>
    <ul>
      <li><strong>Business Name:</strong> ${businessName}</li>
      <li><strong>Provider Name:</strong> ${providerName}</li>
      <li><strong>Email:</strong> ${providerEmail}</li>
    </ul>
    <p>Log in to the admin panel to review and verify this provider:</p>
    <p><a href="${process.env.FRONTEND_URL || 'https://your-domain.com'}/admin" style="background:#ff921c;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">Go to Admin Panel</a></p>
    <br>
    <p>– The LocalLink System</p>
  `;

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"LocalLink" <${process.env.SMTP_USER}>`,
      to: adminEmail,
      subject,
      html,
    });
    console.log(`📧 Admin notification sent to ${adminEmail}`);
  } catch (err) {
    console.error('❌ Admin notification failed:', err.message);
  }
}

// ---------- Export ----------
module.exports = {
  sendBookingNotification,
  sendPaymentConfirmationEmail,
  sendProviderWelcomeEmail,
  sendAdminNotification,
};