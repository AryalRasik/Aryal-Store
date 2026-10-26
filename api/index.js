// Force IPv4-first DNS before anything else — Vercel's Node runtime can fail
// Supabase connections with "TypeError: fetch failed" when AAAA records are tried first.
try { require('dns').setDefaultResultOrder('ipv4first'); } catch {}

const { initDb } = require('../db');
const app = require('../server');

let initialised = false;
let initPromise = null;

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
    if (!initialised) {
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
