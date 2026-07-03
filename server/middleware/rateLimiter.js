const { supabase } = require('../../db');

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

async function checkAccountLockout(email) {
  const { data: user } = await supabase
    .from('users')
    .select('login_attempts, locked_until')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (!user) return { locked: false };

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const remaining = Math.ceil((new Date(user.locked_until) - new Date()) / 1000);
    return { locked: true, remaining };
  }

  return { locked: false, attempts: user.login_attempts || 0 };
}

async function incrementLoginAttempts(email) {
  const { data: user } = await supabase
    .from('users')
    .select('login_attempts')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  const attempts = (user?.login_attempts || 0) + 1;
  const updateData = { login_attempts: attempts };

  if (attempts >= 5) {
    updateData.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  }

  await supabase.from('users').update(updateData).eq('email', email.toLowerCase());
}

async function resetLoginAttempts(email) {
  await supabase
    .from('users')
    .update({ login_attempts: 0, locked_until: null })
    .eq('email', email.toLowerCase());
}

module.exports = { rateLimiter, checkAccountLockout, incrementLoginAttempts, resetLoginAttempts };
