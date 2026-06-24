const { initDb } = require('../db');
const app = require('../server');

let initialised = false;

module.exports = async (req, res) => {
  if (!initialised) {
    await initDb();
    initialised = true;
  }
  return app(req, res);
};
