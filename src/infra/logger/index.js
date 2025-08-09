const pino = require('pino');

const level = process.env.LOG_LEVEL || 'info';
const destination = pino.destination({ sync: process.env.LOG_ASYNC_ENABLED === 'false' });

const logger = pino({ level }, destination);

module.exports = logger;
