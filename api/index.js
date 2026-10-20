// Force IPv4-first DNS before anything else — Vercel's Node runtime can fail
// Supabase connections with "TypeError: fetch failed" when AAAA records are tried first.
try { require('dns').setDefaultResultOrder('ipv4first'); } catch {}

const { initDb } = require('../db');
const app = require('../server');

let initialised = false;
let initPromise = null;

module.exports = async (req, res) => {
  try {
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
