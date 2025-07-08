const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const Database = require('better-sqlite3');
const TelegramBotService = require('../../src/core/telegramBotService');

const envPath = path.join(__dirname, '.env');
let env = {};
if (fs.existsSync(envPath)) {
  env = dotenv.parse(fs.readFileSync(envPath));
}

const TELEGRAM_TOKEN = env.TELEGRAM_TOKEN;
const BASE_URL = env.BASE_URL || process.env.BASE_URL;
const FRONTEND_URL = env.FRONTEND_URL || process.env.FRONTEND_URL || BASE_URL;

const config = require('./config');

function createDatabase() {
  const dbPath = path.join(__dirname, 'pagamentos.db');
  const db = new Database(dbPath);
  db.prepare(`CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    valor INTEGER,
    status TEXT DEFAULT 'pendente'
  )`).run();
  return db;
}

module.exports = function startBot() {
  if (!TELEGRAM_TOKEN) {
    console.error('Token ausente para bot em', __dirname);
    return null;
  }
  const db = createDatabase();
  const service = new TelegramBotService(
    TELEGRAM_TOKEN,
    config,
    BASE_URL,
    FRONTEND_URL,
    db
  );
  console.log('Bot iniciado em', __dirname);
  return service;
};
