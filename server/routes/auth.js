const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabase } = require('../../db');
const { generateToken, setAuthCookies, clearAuthCookies, authMiddleware, optionalAuth, JWT_SECRET } = require('../middleware/auth');
const { rateLimiter, checkAccountLockout, incrementLoginAttempts, resetLoginAttempts } = require('../middleware/rateLimiter');
const { validateSignupBody, validateLoginBody, sanitizeObject } = require('../middleware/validate');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');
const { generateCsrfToken } = require('../utils/csrf');

const router = express.Router();

// GET /api/auth/csrf-token
router.get('/csrf-token', (req, res) => {
  const sessionId = req.headers['x-session-id'] || req.ip;
  const token = generateCsrfToken(sessionId);
  res.json({ csrfToken: token });
});

// POST /api/auth/register
router.post('/register', rateLimiter(3, 60 * 1000), async (req, res) => {
  try {
    const validation = validateSignupBody(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: Object.values(validation.errors).join('. '), errors: validation.errors });
    }

    const { name, email, phone, password } = validation.sanitized;
    const address = req.body.address || '';

    const { data: existingEmail } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
    if (existingEmail) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    const { data: existingPhone } = await supabase.from('users').select('id').eq('phone', phone).maybeSingle();
    if (existingPhone) {
      return res.status(400).json({ error: 'An account with this phone number already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const userId = Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);

    const { error: insertErr } = await supabase.from('users').insert({
      id: userId,
      name,
      email,
      password: hashedPassword,
      phone,
      address,
      profile_picture: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    if (insertErr) throw insertErr;

    const userData = { id: userId, name, email, phone, address, profile_picture: '' };

    sendVerificationEmail(userData, req);

    const token = generateToken(userData);
    setAuthCookies(res, token);

    res.status(201).json({
      message: 'Account created successfully. Please check your email to verify your account.',
      token,
      user: userData
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', rateLimiter(5, 15 * 60 * 1000), async (req, res) => {
  try {
    const validation = validateLoginBody(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: Object.values(validation.errors).join('. ') });
    }

    const { email, password, rememberMe, mergeCart, sessionId } = req.body;
    const identifier = email || req.body.phone;

    const { locked, remaining, attempts } = await checkAccountLockout(identifier);
    if (locked) {
      return res.status(429).json({
        error: `Account locked. Try again in ${remaining} seconds.`,
        code: 'ACCOUNT_LOCKED',
        remaining
      });
    }

    let user;
    if (email) {
      const { data: u } = await supabase.from('users').select('*').eq('email', email.toLowerCase().trim()).maybeSingle();
      user = u;
    } else {
      const { data: u } = await supabase.from('users').select('*').eq('phone', req.body.phone.trim()).maybeSingle();
      user = u;
    }

    if (!user) {
      return res.status(401).json({ error: 'No account found with this ' + (email ? 'email' : 'phone number') });
    }

    if (!user.password) {
      return res.status(401).json({ error: 'This account uses social login. Please sign in with Google or Facebook.' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      await incrementLoginAttempts(identifier);
      const remainingAttempts = 4 - ((await checkAccountLockout(identifier)).attempts || 0);
      if (remainingAttempts <= 0) {
        return res.status(429).json({ error: 'Account locked due to too many failed attempts. Try again in 15 minutes.', code: 'ACCOUNT_LOCKED' });
      }
      return res.status(401).json({ error: `Incorrect password. ${remainingAttempts} attempt(s) remaining.` });
    }

    await resetLoginAttempts(identifier);

    await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);

    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      address: user.address || '',
      profile_picture: user.profile_picture || '',
      email_verified_at: user.email_verified_at
    };

    const token = generateToken(userData, !!rememberMe);
    setAuthCookies(res, token, !!rememberMe);

    if (mergeCart || req.body.mergeCart) {
      try {
        const sid = sessionId || req.body.sessionId || '';
        const { data: guestCart } = await supabase.from('user_cart').select('*').eq('session_id', sid);
        if (guestCart && guestCart.length) {
          for (const item of guestCart) {
            const { data: existing } = await supabase.from('user_cart')
              .select('id, quantity')
              .eq('user_id', user.id)
              .eq('product_id', item.product_id)
              .eq('size', item.size || '')
              .eq('color', item.color || '')
              .maybeSingle();
            if (existing) {
              await supabase.from('user_cart')
                .update({ quantity: existing.quantity + item.quantity })
                .eq('id', existing.id);
            } else {
              await supabase.from('user_cart').insert({
                user_id: user.id, product_id: item.product_id,
                quantity: item.quantity, size: item.size || '', color: item.color || ''
              });
            }
          }
          await supabase.from('user_cart').delete().eq('session_id', sid);
        }
      } catch {}
    }

    res.json({ message: 'Login successful', token, user: userData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    await supabase.from('user_sessions').update({ is_valid: false }).eq('user_id', req.user.id);
    clearAuthCookies(res);
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', rateLimiter(3, 60 * 1000), async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const { data: user } = await supabase.from('users').select('id, name, email').eq('email', email.toLowerCase().trim()).maybeSingle();

    const response = { message: 'If an account with this email exists, a password reset link has been sent.' };

    if (user) {
      const sent = await sendPasswordResetEmail(user, req);
      if (!sent) {
        const token = jwt.sign({ id: user.id, email: user.email, purpose: 'reset' }, JWT_SECRET, { expiresIn: '15m' });
        response.reset_token = token;
        response.debug = 'Email not configured. Use the reset_token directly.';
      }
    }

    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', rateLimiter(3, 60 * 1000), async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (!token || !password || !confirmPassword) {
      return res.status(400).json({ error: 'Token, password, and confirm password are required' });
    }

    const { data: resetToken } = await supabase
      .from('password_reset_tokens')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (!resetToken) {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.purpose !== 'reset') {
        return res.status(400).json({ error: 'Invalid reset token' });
      }
      if (password !== confirmPassword) {
        return res.status(400).json({ error: 'Passwords do not match' });
      }
      if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
        return res.status(400).json({ error: 'Password must be at least 8 characters with uppercase, lowercase, and number' });
      }
      const hashedPassword = await bcrypt.hash(password, 12);
      await supabase.from('users').update({ password: hashedPassword }).eq('id', decoded.id);
      return res.json({ message: 'Password has been reset successfully. Please login with your new password.' });
    }

    if (resetToken.used_at) {
      return res.status(400).json({ error: 'This reset token has already been used' });
    }

    if (new Date(resetToken.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters with uppercase, lowercase, and number' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await supabase.from('users').update({ password: hashedPassword }).eq('id', resetToken.user_id);
    await supabase.from('password_reset_tokens').update({ used_at: new Date().toISOString() }).eq('id', resetToken.id);

    res.json({ message: 'Password has been reset successfully. Please login with your new password.' });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/verify-email
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Verification token is required' });

    const { data: verToken } = await supabase
      .from('email_verification_tokens')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (!verToken) {
      return res.status(400).json({ error: 'Invalid verification token' });
    }

    if (new Date(verToken.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Verification token has expired. Request a new one.' });
    }

    await supabase.from('users').update({ email_verified_at: new Date().toISOString() }).eq('id', verToken.user_id);
    await supabase.from('email_verification_tokens').delete().eq('id', verToken.id);

    res.json({ message: 'Email verified successfully. You can now place orders.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/verify-email (for email link clicks)
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.redirect('/?verification=missing_token');

    const { data: verToken } = await supabase
      .from('email_verification_tokens')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (!verToken) return res.redirect('/?verification=invalid');

    if (new Date(verToken.expires_at) < new Date()) {
      return res.redirect('/?verification=expired');
    }

    await supabase.from('users').update({ email_verified_at: new Date().toISOString() }).eq('id', verToken.user_id);
    await supabase.from('email_verification_tokens').delete().eq('id', verToken.id);

    res.redirect('/?verification=success');
  } catch {
    res.redirect('/?verification=error');
  }
});

// POST /api/auth/resend-verification
router.post('/resend-verification', authMiddleware, async (req, res) => {
  try {
    const user = req.userData;
    if (user.email_verified_at) {
      return res.json({ message: 'Email is already verified' });
    }
    const sent = await sendVerificationEmail(user, req);
    res.json({ message: sent ? 'Verification email sent' : 'Could not send email. Contact support.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = req.userData;
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      address: user.address || '',
      profile_picture: user.profile_picture || '',
      email_verified: !!user.email_verified_at,
      email_verified_at: user.email_verified_at
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/users/profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const sanitized = sanitizeObject(req.body);
    const { name, phone, address } = sanitized;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    updateData.updated_at = new Date().toISOString();

    const { error } = await supabase.from('users').update(updateData).eq('id', req.user.id);
    if (error) throw error;

    res.json({
      message: 'Profile updated successfully',
      user: { ...req.userData, ...updateData }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/users/change-password
router.put('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'All password fields are required' });
    }

    const { data: user } = await supabase.from('users').select('password').eq('id', req.user.id).maybeSingle();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New passwords do not match' });
    }

    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters with uppercase, lowercase, and number' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await supabase.from('users').update({ password: hashedPassword, updated_at: new Date().toISOString() }).eq('id', req.user.id);

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/users/profile-picture
router.put('/profile-picture', authMiddleware, async (req, res) => {
  try {
    const { profile_picture } = req.body;
    if (!profile_picture) return res.status(400).json({ error: 'Profile picture URL is required' });

    await supabase.from('users').update({ profile_picture, updated_at: new Date().toISOString() }).eq('id', req.user.id);
    res.json({ message: 'Profile picture updated', profile_picture });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/addresses
router.get('/addresses', authMiddleware, async (req, res) => {
  try {
    const { data: addresses } = await supabase
      .from('user_addresses')
      .select('*')
      .eq('user_id', req.user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    res.json(addresses || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/addresses
router.post('/addresses', authMiddleware, async (req, res) => {
  try {
    const sanitized = sanitizeObject(req.body);
    const { label, full_name, phone, address, city, state, zip_code, country, is_default } = sanitized;

    if (!full_name || !phone || !address) {
      return res.status(400).json({ error: 'Full name, phone, and address are required' });
    }

    if (is_default) {
      await supabase.from('user_addresses').update({ is_default: false }).eq('user_id', req.user.id);
    }

    const { data, error } = await supabase.from('user_addresses').insert({
      user_id: req.user.id,
      label: label || 'Home',
      full_name,
      phone,
      address,
      city: city || '',
      state: state || '',
      zip_code: zip_code || '',
      country: country || 'Nepal',
      is_default: !!is_default
    }).select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/users/addresses/:id
router.put('/addresses/:id', authMiddleware, async (req, res) => {
  try {
    const sanitized = sanitizeObject(req.body);
    const { label, full_name, phone, address, city, state, zip_code, country, is_default } = sanitized;

    if (is_default) {
      await supabase.from('user_addresses').update({ is_default: false }).eq('user_id', req.user.id);
    }

    const { error } = await supabase.from('user_addresses').update({
      label, full_name, phone, address, city, state, zip_code, country,
      is_default: !!is_default,
      updated_at: new Date().toISOString()
    }).eq('id', req.params.id).eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/addresses/:id
router.delete('/addresses/:id', authMiddleware, async (req, res) => {
  try {
    const { error } = await supabase.from('user_addresses').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/orders
router.get('/orders', authMiddleware, async (req, res) => {
  try {
    const user = req.userData;
    const { data: orders } = await supabase
      .from('orders')
      .select('*')
      .or(`customer_email.eq.${user.email},customer_phone.eq.${user.phone}`)
      .order('created_at', { ascending: false })
      .limit(50);

    for (const order of orders || []) {
      const { data: items } = await supabase.from('order_items').select('*').eq('order_id', order.id);
      order.items = items || [];
      const { data: tracking } = await supabase.from('order_tracking').select('*').eq('order_id', order.id).order('created_at');
      order.tracking = tracking || [];
    }

    res.json(orders || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/wishlist
router.get('/wishlist', authMiddleware, async (req, res) => {
  try {
    const { data: items } = await supabase
      .from('wishlist')
      .select('*, products!inner(*)')
      .eq('session_id', req.user.id)
      .order('created_at', { ascending: false });
    const mapped = (items || []).map(w => w.products);
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/cart/merge
router.post('/cart/merge', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'Session ID required' });

    const { data: guestCart } = await supabase.from('user_cart').select('*').eq('session_id', sessionId);
    if (guestCart && guestCart.length) {
      for (const item of guestCart) {
        const { data: existing } = await supabase.from('user_cart')
          .select('id, quantity')
          .eq('user_id', req.user.id)
          .eq('product_id', item.product_id)
          .eq('size', item.size || '')
          .eq('color', item.color || '')
          .maybeSingle();
        if (existing) {
          await supabase.from('user_cart').update({ quantity: existing.quantity + item.quantity }).eq('id', existing.id);
        } else {
          await supabase.from('user_cart').insert({
            user_id: req.user.id, product_id: item.product_id,
            quantity: item.quantity, size: item.size || '', color: item.color || ''
          });
        }
      }
      await supabase.from('user_cart').delete().eq('session_id', sessionId);
    }

    res.json({ message: 'Cart merged successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== OTP VERIFICATION ====================

// In-memory OTP store (use Redis in production)
const otpStore = new Map();

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST /api/auth/send-otp
router.post('/send-otp', rateLimiter(3, 60 * 1000), async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || !/^[\d\s\-\+\(\)]{7,20}$/.test(phone)) {
      return res.status(400).json({ error: 'Valid phone number is required' });
    }

    const otp = generateOTP();
    const expiresAt = Date.now() + 5 * 60 * 1000;

    otpStore.set(phone, { otp, expiresAt, attempts: 0 });

    // In production, send via SMS gateway
    console.log(`[OTP] ${phone}: ${otp}`);

    res.json({
      message: 'OTP sent successfully',
      expiresIn: 300,
      debug: process.env.NODE_ENV !== 'production' ? otp : undefined
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', rateLimiter(5, 15 * 60 * 1000), async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ error: 'Phone and OTP are required' });
    }

    const stored = otpStore.get(phone);
    if (!stored) {
      return res.status(400).json({ error: 'No OTP sent to this number. Please request a new one.' });
    }

    if (Date.now() > stored.expiresAt) {
      otpStore.delete(phone);
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }

    stored.attempts++;
    if (stored.attempts > 5) {
      otpStore.delete(phone);
      return res.status(429).json({ error: 'Too many invalid attempts. Please request a new OTP.' });
    }

    if (stored.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP. Please try again.' });
    }

    otpStore.delete(phone);

    // Find or create user by phone
    let { data: user } = await supabase.from('users').select('*').eq('phone', phone).maybeSingle();

    if (!user) {
      // Auto-register with phone
      const userId = Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
      const { error: insertErr } = await supabase.from('users').insert({
        id: userId,
        name: 'User_' + phone.slice(-4),
        email: '',
        password: '',
        phone,
        profile_picture: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      if (insertErr) throw insertErr;
      user = { id: userId, name: 'User_' + phone.slice(-4), email: '', phone, profile_picture: '', email_verified_at: null };
    }

    const userData = {
      id: user.id,
      name: user.name,
      email: user.email || '',
      phone: user.phone,
      profile_picture: user.profile_picture || '',
      email_verified_at: user.email_verified_at
    };

    const token = generateToken(userData);
    setAuthCookies(res, token);

    res.json({
      message: 'OTP verified successfully',
      token,
      user: userData
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
