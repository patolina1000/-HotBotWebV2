require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');

// Inicializa o backend Web (rotas, tokens etc)
require('./MODELO1/WEB/server')(app);

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'WEB/public')));

// Ativa o bot (já cuida do setWebHook internamente)
require('./MODELO1/BOT/bot');

// Start do servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Tudo rodando na porta ${PORT}`);
});
