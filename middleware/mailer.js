const nodemailer = require('nodemailer');

function getTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

async function sendAdminNotification(subject, html) {
  if (!process.env.SMTP_USER || !process.env.ADMIN_EMAIL) return;
  try {
    const t = getTransport();
    await t.sendMail({
      from: `"ReeL BOOM" <${process.env.SMTP_USER}>`,
      to: process.env.ADMIN_EMAIL,
      subject,
      html
    });
  } catch(e) { console.error('Email error:', e.message); }
}

module.exports = { sendAdminNotification };
