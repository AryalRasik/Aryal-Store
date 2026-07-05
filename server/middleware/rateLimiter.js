const { supabase, from } = require('../../db');

const loginAttempts = new Map();

function rateLimiter(maxAttempts = 5, windowMs = 15 * 60 * 1000) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const key = req.path.includes('login') ? `login:${ip}` : `global:${ip}`;

    const now = Date.now();
    if (!loginAttempts.has(key)) {
      loginAttempts.set(key, { count: 1, start: now });
      return next();
    }

    const data = loginAttempts.get(key);
    if (now - data.start > windowMs) {
      loginAttempts.set(key, { count: 1, start: now });
      return next();
    }

    if (data.count >= maxAttempts) {
      const retryAfter = Math.ceil((windowMs - (now - data.start)) / 1000);
      return res.status(429).json({
        error: `Too many attempts. Please try again in ${retryAfter} seconds.`,
        retryAfter
      });
    }

    data.count++;
    next();
  };
}

async function checkAccountLockout(identifier) {
  const field = identifier.includes('@') ? 'email' : 'phone';
  const { data: user } = await (await from('users'))
    .select('login_attempts, locked_until')
    .eq(field, identifier.toLowerCase())
    .maybeSingle();

  if (!user) return { locked: false };

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const remaining = Math.ceil((new Date(user.locked_until) - new Date()) / 1000);
    return { locked: true, remaining };
  }

  return { locked: false, attempts: user.login_attempts || 0 };
}

async function incrementLoginAttempts(identifier) {
  const field = identifier.includes('@') ? 'email' : 'phone';
  const { data: user } = await (await from('users'))
    .select('login_attempts')
    .eq(field, identifier.toLowerCase())
    .maybeSingle();

  const attempts = (user?.login_attempts || 0) + 1;
  const updateData = { login_attempts: attempts };

  if (attempts >= 5) {
    updateData.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  }

  await (await from('users')).update(updateData).eq(field, identifier.toLowerCase());
}

async function resetLoginAttempts(identifier) {
  const field = identifier.includes('@') ? 'email' : 'phone';
  await (await from('users'))
    .update({ login_attempts: 0, locked_until: null })
    .eq(field, identifier.toLowerCase());
}

module.exports = { rateLimiter, checkAccountLockout, incrementLoginAttempts, resetLoginAttempts };
