// server.js - suporta múltiplos bots automaticamente
const fs = require('fs');
const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const Database = require('better-sqlite3');
const TelegramBotService = require('./src/core/telegramBotService');

dotenv.config();

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || '';
const FRONTEND_URL = process.env.FRONTEND_URL || BASE_URL;

const app = express();
app.use(express.json());

const bots = new Map();

function loadBot(botDir) {
  const envPath = path.join(botDir, '.env');
  const env = fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {};
  const token = env.TELEGRAM_TOKEN;
  if (!token) {
    console.warn('Bot ignorado, TELEGRAM_TOKEN ausente em', botDir);
    return;
  }
  const configPath = path.join(botDir, 'config.js');
  if (!fs.existsSync(configPath)) {
    console.warn('Bot ignorado, config.js ausente em', botDir);
    return;
  }
  const config = require(configPath);
  const dbPath = path.join(botDir, 'pagamentos.db');
  const db = new Database(dbPath);
  db.prepare(`CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    valor INTEGER,
    status TEXT DEFAULT 'pendente'
  )`).run();

  const baseUrl = env.BASE_URL || BASE_URL;
  const frontend = env.FRONTEND_URL || FRONTEND_URL;

  const service = new TelegramBotService(token, config, baseUrl, frontend, db);
  bots.set(token, service);

  app.post(`/bot${token}`, (req, res) => {
    service.bot.processUpdate(req.body);
    res.sendStatus(200);
  });

  console.log('Bot carregado:', path.basename(botDir));
}

function loadBots() {
  const botsDir = path.join(__dirname, 'bots');
  if (!fs.existsSync(botsDir)) return;
  const dirs = fs.readdirSync(botsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(botsDir, d.name));
  dirs.forEach(loadBot);
}

app.get('/health', (req, res) => res.send('OK'));

app.listen(PORT, () => {
  console.log('Servidor iniciado na porta', PORT);
  loadBots();
});
