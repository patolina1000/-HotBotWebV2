// server.js - suporta múltiplos bots automaticamente
const fs = require('fs');
const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const Database = require('better-sqlite3');
const TelegramBotService = require('./src/core/telegramBotService');
const postgres = require('./postgres');

dotenv.config();

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || '';
const FRONTEND_URL = process.env.FRONTEND_URL || BASE_URL;

const app = express();
app.use(express.json());

const pool = postgres.createPool();

const bots = new Map();

function loadBot(botDir) {
  const envPath = path.join(botDir, '.env');
  const env = fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {};

  const botId = env.BOT_ID || path.basename(botDir);
  console.log(`[${botId}] .env carregado`, {
    TELEGRAM_TOKEN: env.TELEGRAM_TOKEN,
    BOT_ID: env.BOT_ID,
    BASE_URL: env.BASE_URL
  });

  const botToken = env.TELEGRAM_TOKEN;
  if (!botToken) {
    console.warn(`[${botId}] TELEGRAM_TOKEN ausente. Bot ignorado.`);
    return;
  }

  const configPath = path.join(botDir, 'config.js');
  if (!fs.existsSync(configPath)) {
    console.warn(`[${botId}] config.js ausente em ${botDir}. Bot ignorado.`);
    return;
  }

  const config = require(configPath);
  config.pushinpayToken = env.PUSHINPAY_TOKEN || process.env.PUSHINPAY_TOKEN;

  const dbPath = path.join(botDir, 'pagamentos.db');
  const db = new Database(dbPath);
  db.prepare(`CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    telegram_id TEXT,
    valor INTEGER,
    utm_source TEXT,
    utm_campaign TEXT,
    utm_medium TEXT,
    status TEXT DEFAULT 'pendente',
    token_uuid TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    bot_id TEXT DEFAULT 'default'
  )`).run();

  const baseUrl = env.BASE_URL || BASE_URL;

  const service = new TelegramBotService(botToken, config, baseUrl, db, pool, botId);
  if (service.bot) {
    console.log(`[${botId}] Instância do bot criada com sucesso`);
  } else {
    console.error(`[${botId}] Falha ao criar instância do bot`);
  }
  bots.set(botId, service);

  app.post(`/bot${botToken}`, (req, res) => {
    const bodySnippet = JSON.stringify(req.body).slice(0, 200);
    console.log(`[${botId}] Webhook recebido:`, bodySnippet);
    try {
      service.bot.processUpdate(req.body);
    } catch (err) {
      console.error(`[${botId}] Erro no processUpdate:`, err);
    }
    res.sendStatus(200);
  });
  console.log(`[${botId}] Rota /bot${botToken} registrada`);

  console.log(`🤖 Bot ${botId} carregado`);
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

app.post('/api/gerar-cobranca', (req, res) => {
  const botId = req.body.bot_id;
  const service = bots.get(botId);
  if (!service) return res.status(400).json({ error: 'bot_id inválido' });
  return service.gerarCobranca(req, res);
});

app.post('/webhook/pushinpay', (req, res) => {
  const botId = req.query.bot_id || req.body.bot_id;
  const service = bots.get(botId);
  if (!service) return res.status(400).send('bot_id inválido');
  return service.webhookPushinPay(req, res);
});

app.listen(PORT, () => {
  console.log('Servidor iniciado na porta', PORT);
  loadBots();
});
