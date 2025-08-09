const logger = require('../logger');

module.exports = async function dbLog(payload) {
  let getDatabasePool;
  try {
    ({ getDatabasePool } = require('../../../bootstrap'));
  } catch (err) {
    logger.error({ err }, 'db log bootstrap require error');
    return;
  }

  if (typeof getDatabasePool !== 'function') return;
  const pool = getDatabasePool();
  if (!pool) return;

  try {
    await pool.query('INSERT INTO logs(data) VALUES ($1)', [JSON.stringify(payload)]);
  } catch (err) {
    logger.error({ err }, 'db log error');
    throw err;
  }
};
