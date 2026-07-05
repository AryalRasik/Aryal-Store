const jwt = require('jsonwebtoken');
const { supabase, from } = require('../../db');

const JWT_SECRET = process.env.JWT_SECRET || 'aryal-store-jwt-secret-2026';
const JWT_EXPIRES_IN = '7d';
const REMEMBER_EXPIRES_IN = '30d';

function generateToken(user, rememberMe = false) {
  return jwt.sign(
    { role: 'user', id: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: rememberMe ? REMEMBER_EXPIRES_IN : JWT_EXPIRES_IN }
  );
}

function generateRefreshToken() {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

function setAuthCookies(res, token, rememberMe = false) {
  const maxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge
  });
  res.cookie('is_authenticated', 'true', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge
  });
}

function clearAuthCookies(res) {
  res.clearCookie('token');
  res.clearCookie('is_authenticated');
}

async function authMiddleware(req, res, next) {
  let token = null;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;

    const { data: user } = await (await from('users'))
      .select('id, name, email, phone, address, profile_picture, email_verified_at')
      .eq('id', decoded.id)
      .maybeSingle();

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.userData = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please login again.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function optionalAuth(req, res, next) {
  let token = null;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    req.user = null;
    req.userData = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    (async () => {
      const { data: user } = await (await from('users'))
        .select('id, name, email, phone, address, profile_picture')
        .eq('id', decoded.id)
        .maybeSingle();
      req.userData = user;
      next();
    })().catch(() => { next(); });
  } catch {
    req.user = null;
    req.userData = null;
    next();
  }
}

function adminMiddleware(req, res, next) {
  authMiddleware(req, res, function(err) {
    if (err) return next(err);
    if (req.user && req.user.role === 'admin') return next();
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  });
}

module.exports = {
  generateToken,
  generateRefreshToken,
  setAuthCookies,
  clearAuthCookies,
  authMiddleware,
  optionalAuth,
  adminMiddleware,
  JWT_SECRET
};
