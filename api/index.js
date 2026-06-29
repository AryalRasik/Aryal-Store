const { initDb } = require('../db');
const app = require('../server');

let initialised = false;

module.exports = async (req, res) => {
  try {
    if (!initialised) {
      await initDb();
      initialised = true;
    }
    return app(req, res);
  } catch (err) {
    console.error('Init error:', err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
};
