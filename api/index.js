// Force IPv4-first DNS before anything else — Vercel's Node runtime can fail
// Supabase connections with "TypeError: fetch failed" when AAAA records are tried first.
try { require('dns').setDefaultResultOrder('ipv4first'); } catch {}

const { initDb } = require('../db');
const app = require('../server');

let initialised = false;
let initPromise = null;

function hasAdminBearer(req) {
  const header = req.headers && req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return false;
  try {
    const parts = header.slice(7).split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return payload && payload.role === 'admin';
  } catch { return false; }
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET' && req.url.split('?')[0] === '/api/config/oauth') {
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
      return res.status(200).json({
        google_client_id: process.env.GOOGLE_CLIENT_ID || '',
        facebook_app_id: process.env.FACEBOOK_APP_ID || '',
        environment: process.env.NODE_ENV || 'production'
      });
    }
    const path = req.url.split('?')[0];
    const adminFastPath = (req.method === 'POST' && path === '/api/login') ||
      (req.method === 'GET' && path === '/api/auth/me' && hasAdminBearer(req));
    if (!initialised && !adminFastPath) {
      if (!initPromise) {
        initPromise = initDb()
          .then(() => { initialised = true; })
          .finally(() => { initPromise = null; });
      }
      await initPromise;
    }
    return app(req, res);
  } catch (err) {
    console.error('Init error:', err);
    // Serve the request anyway — individual routes handle their own DB errors,
    // so a flaky init no longer takes down every endpoint.
    try { return app(req, res); } catch (e2) {
      res.status(500).json({ error: err.message });
    }
  }
};
