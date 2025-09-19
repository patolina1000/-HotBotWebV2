require('dotenv').config();
const TelegramBotService = require('../core/TelegramBotService');
const config = require('./config_especial');
const postgres = require('../../database/postgres');
const sqlite = require('../../database/sqlite');

// 🚀 DETERMINAR URL BASE BASEADA NO AMBIENTE
const ambiente = process.env.NODE_ENV || 'development';
const isTeste = process.env.AMBIENTE_TESTE === 'true' || ambiente === 'test';

const baseUrl = isTeste 
  ? process.env.BASE_URL_TESTE || process.env.BASE_URL 
  : process.env.BASE_URL;

const frontendUrl = isTeste 
  ? process.env.FRONTEND_URL_TESTE || process.env.FRONTEND_URL || baseUrl
  : process.env.FRONTEND_URL || baseUrl;

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
