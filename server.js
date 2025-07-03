require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');

// Inicializa o backend Web (rotas, tokens etc)
require('./MODELO1/WEB/server')(app); // agora server.js da WEB exporta uma função que recebe app

// Servir arquivos estáticos (caso o WEB precise direto)
app.use(express.static(path.join(__dirname, 'WEB/public')));

// Ativa o bot
const bot = require('./MODELO1/BOT/bot');
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const BASE_URL = process.env.BASE_URL;

bot.setWebHook(`${BASE_URL}/bot${TELEGRAM_TOKEN}`);
app.post(`/bot${TELEGRAM_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Start do servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Tudo rodando na porta ${PORT}`);
});
