const pino = require('pino');

const level = process.env.LOG_LEVEL || 'info';
const asyncEnabled = process.env.LOG_ASYNC_ENABLED !== 'false';
const destination = pino.destination({ sync: !asyncEnabled ? true : false });

const logger = pino({ level }, destination);

module.exports = logger;
