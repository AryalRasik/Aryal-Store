const crypto = require('crypto');

const csrfTokens = new Map();

function generateCsrfToken(sessionId) {
  const token = crypto.randomBytes(32).toString('hex');
  csrfTokens.set(token, { sessionId, createdAt: Date.now() });
  return token;
}

function validateCsrfToken(token, sessionId) {
  if (!token || !csrfTokens.has(token)) return false;
  const data = csrfTokens.get(token);
  if (data.sessionId !== sessionId) return false;
  if (Date.now() - data.createdAt > 24 * 60 * 60 * 1000) {
    csrfTokens.delete(token);
    return false;
  }
  return true;
}

function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const sessionId = req.headers['x-session-id'] || req.ip;
  const token = req.headers['x-csrf-token'];

  if (!token || !validateCsrfToken(token, sessionId)) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  next();
}

module.exports = { generateCsrfToken, validateCsrfToken, csrfProtection };
