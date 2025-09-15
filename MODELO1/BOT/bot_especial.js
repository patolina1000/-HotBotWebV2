require('dotenv').config();
const TelegramBotService = require('../core/TelegramBotService');
const config = require('./config_especial');
const postgres = require('../../database/postgres');
const sqlite = require('../../database/sqlite');

const bot = new TelegramBotService({
  token: process.env.TELEGRAM_TOKEN_ESPECIAL,
  baseUrl: process.env.BASE_URL,
  frontendUrl: process.env.FRONTEND_URL || process.env.BASE_URL,
  config,
  postgres,
  sqlite,
  bot_id: 'bot_especial'
});

function iniciar() {
  bot.iniciar();
  return bot;
}

module.exports = { iniciar, bot };
