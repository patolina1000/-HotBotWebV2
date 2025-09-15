require('dotenv').config();
const TelegramBotService = require('../core/TelegramBotService');
const config = require('./config7');
const postgres = require('../../database/postgres');
const sqlite = require('../../database/sqlite');

const bot = new TelegramBotService({
  token: process.env.TELEGRAM_TOKEN_BOT7,
  baseUrl: process.env.BASE_URL,
  frontendUrl: process.env.FRONTEND_URL || process.env.BASE_URL,
  config,
  postgres,
  sqlite,
  bot_id: 'bot7'
});

function iniciar() {
  bot.iniciar();
  return bot;
}

module.exports = { iniciar, bot };
