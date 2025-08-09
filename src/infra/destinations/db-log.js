const logger = require('../logger');

module.exports = async function dbLog(payload) {
  try {
    const { getDatabasePool } = require('../../bootstrap');
    if (typeof getDatabasePool !== 'function') return;
    const pool = getDatabasePool();
    if (!pool) return;
    await pool.query('INSERT INTO logs(data) VALUES ($1)', [JSON.stringify(payload)]);
  } catch (err) {
    logger.error({ err }, 'db log error');
    throw err;
  }
};
