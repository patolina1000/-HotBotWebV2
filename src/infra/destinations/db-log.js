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
    const lvl = payload && typeof payload.level === 'string' ? payload.level : 'INFO';
    const msg =
      payload && typeof payload.message === 'string' ? payload.message : 'no message';

    await pool.query(
      'INSERT INTO logs(level, message, data) VALUES ($1, $2, $3)',
      [lvl, msg, JSON.stringify(payload)]
    );
  } catch (err) {
    logger.error({ err }, 'db log error');
    throw err;
  }
};
