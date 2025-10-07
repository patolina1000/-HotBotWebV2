require('dotenv').config();
const TelegramBotService = require('../core/TelegramBotService');
const config = require('./config_especial');
const postgres = require('../../database/postgres');
const sqlite = require('../../database/sqlite');

// 🚀 DETERMINAR URL BASE BASEADA NO AMBIENTE
const ambiente = process.env.NODE_ENV || 'development';
const isTeste = process.env.AMBIENTE_TESTE === 'true' || ambiente === 'test';

const sanitizeUrl = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const baseUrlTeste = sanitizeUrl(process.env.BASE_URL_TESTE);
const baseUrlProd = sanitizeUrl(process.env.BASE_URL);
const rawBaseUrl = isTeste
  ? baseUrlTeste || baseUrlProd
  : baseUrlProd;

const fallbackBaseUrl = rawBaseUrl || (isTeste
  ? sanitizeUrl(process.env.FRONTEND_URL_TESTE) || sanitizeUrl(process.env.FRONTEND_URL)
  : sanitizeUrl(process.env.FRONTEND_URL));

const baseUrl = fallbackBaseUrl;

const frontendUrl = (isTeste ? sanitizeUrl(process.env.FRONTEND_URL_TESTE) : null)
  || sanitizeUrl(process.env.FRONTEND_URL)
  || baseUrl;

const bot = new TelegramBotService({
  token: process.env.TELEGRAM_TOKEN_ESPECIAL,
  baseUrl: baseUrl,
  frontendUrl: frontendUrl,
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
