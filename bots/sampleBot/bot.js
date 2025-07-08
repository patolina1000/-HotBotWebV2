const path = require('path');
const TelegramBotService = require('../../src/core/telegramBotService');
const { loadEnv, createDatabase } = require('../../src/core/helpers');

const env = loadEnv(__dirname);
const TELEGRAM_TOKEN = env.TELEGRAM_TOKEN;
const BASE_URL = env.BASE_URL || process.env.BASE_URL;
const BOT_ID = env.BOT_ID || path.basename(__dirname);

const config = require('./config');

module.exports = function startBot(pgPool) {
  if (!TELEGRAM_TOKEN) {
    console.error('Token ausente para bot em', __dirname);
    return null;
  }
  const db = createDatabase(__dirname);
  const service = new TelegramBotService(
    TELEGRAM_TOKEN,
    config,
    BASE_URL,
    db,
    pgPool,
    BOT_ID
  );
  console.log('Bot iniciado em', __dirname);
  return service;
};
