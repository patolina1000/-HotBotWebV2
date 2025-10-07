require('dotenv').config();
const TelegramBotService = require('../core/TelegramBotService');
const config = require('./config5');
const postgres = require('../../database/postgres');
const sqlite = require('../../database/sqlite');

const sanitizeUrl = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const baseUrl = sanitizeUrl(process.env.BASE_URL) || sanitizeUrl(process.env.FRONTEND_URL);
const frontendUrl = sanitizeUrl(process.env.FRONTEND_URL) || baseUrl;

const bot = new TelegramBotService({
  token: process.env.TELEGRAM_TOKEN_BOT5,
  baseUrl,
  frontendUrl,
  config,
  postgres,
  sqlite,
  bot_id: 'bot5'
});

function iniciar() {
  bot.iniciar();
  return bot;
}

module.exports = { iniciar, bot };
