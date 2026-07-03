const nodemailer = require('nodemailer');
const { supabase } = require('../../db');
const crypto = require('crypto');

async function getMailTransport() {
  const { data: settings } = await supabase
    .from('settings')
    .select('store_name, store_email, smtp_host, smtp_port, smtp_user, smtp_pass')
    .eq('id', 1)
    .maybeSingle();

  if (!settings || !settings.smtp_host || !settings.smtp_user || !settings.smtp_pass) {
    return null;
  }

  return nodemailer.createTransport({
    host: settings.smtp_host,
    port: settings.smtp_port || 587,
    secure: (settings.smtp_port || 587) === 465,
    auth: {
      user: settings.smtp_user,
      pass: settings.smtp_pass
    }
  });
}

async function sendEmail({ to, subject, html }) {
  try {
    const transporter = await getMailTransport();
    if (!transporter) {
      console.log('Email not sent: SMTP not configured');
      return false;
    }

    const { data: settings } = await supabase
      .from('settings')
      .select('store_name, store_email')
      .eq('id', 1)
      .maybeSingle();

    await transporter.sendMail({
      from: `"${settings?.store_name || 'Aryal Store'}" <${settings?.store_email || 'noreply@aryalstore.com'}>`,
      to,
      subject,
      html
    });
    return true;
  } catch (err) {
    console.error('Email send failed:', err.message);
    return false;
  }
}

function getBaseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function sendVerificationEmail(user, req) {
  const token = generateToken();
  const baseUrl = getBaseUrl(req);

  await supabase.from('email_verification_tokens').insert({
    user_id: user.id,
    email: user.email,
    token,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  });

  const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;

  return sendEmail({
    to: user.email,
    subject: `Verify your email - ${process.env.STORE_NAME || 'Aryal Store'}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#e94560;color:#fff;padding:20px;text-align:center;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;">Email Verification</h2>
        </div>
        <div style="border:1px solid #ddd;border-top:0;padding:30px;border-radius:0 0 8px 8px;">
          <p>Hello <strong>${user.name}</strong>,</p>
          <p>Thank you for creating an account! Please verify your email address by clicking the button below:</p>
          <div style="text-align:center;margin:30px 0;">
            <a href="${verificationUrl}" style="background:#e94560;color:#fff;padding:12px 30px;border-radius:50px;text-decoration:none;font-weight:600;display:inline-block;">Verify Email Address</a>
          </div>
          <p>Or copy and paste this link in your browser:</p>
          <p style="word-break:break-all;color:#888;font-size:0.85rem;">${verificationUrl}</p>
          <p>This link expires in 24 hours.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
          <p style="font-size:0.85rem;color:#888;">If you did not create an account, please ignore this email.</p>
        </div>
      </div>
    `
  });
}

async function sendPasswordResetEmail(user, req) {
  const token = generateToken();
  const baseUrl = getBaseUrl(req);

  await supabase.from('password_reset_tokens').insert({
    user_id: user.id,
    email: user.email,
    token,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  });

  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  return sendEmail({
    to: user.email,
    subject: `Reset your password - ${process.env.STORE_NAME || 'Aryal Store'}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#e94560;color:#fff;padding:20px;text-align:center;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;">Password Reset</h2>
        </div>
        <div style="border:1px solid #ddd;border-top:0;padding:30px;border-radius:0 0 8px 8px;">
          <p>Hello <strong>${user.name}</strong>,</p>
          <p>We received a request to reset your password. Click the button below to set a new password:</p>
          <div style="text-align:center;margin:30px 0;">
            <a href="${resetUrl}" style="background:#e94560;color:#fff;padding:12px 30px;border-radius:50px;text-decoration:none;font-weight:600;display:inline-block;">Reset Password</a>
          </div>
          <p>Or copy and paste this link in your browser:</p>
          <p style="word-break:break-all;color:#888;font-size:0.85rem;">${resetUrl}</p>
          <p>This link expires in 1 hour.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
          <p style="font-size:0.85rem;color:#888;">If you did not request a password reset, please ignore this email.</p>
        </div>
      </div>
    `
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendEmail, generateToken };
