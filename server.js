require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');

// Middleware básico
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos da pasta WEB
app.use(express.static(path.join(__dirname, 'MODELO1/WEB')));

// Tratamento de erros não capturados
process.on('uncaughtException', (err) => {
  console.error('❌ Erro não capturado:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promise rejeitada não tratada:', reason);
  process.exit(1);
});

// Inicializar módulos
try {
  // Tentar inicializar o bot primeiro
  const botPath = path.join(__dirname, 'MODELO1/BOT/bot.js');
  
  if (require('fs').existsSync(botPath)) {
    console.log('🤖 Iniciando bot...');
    const botModule = require('./MODELO1/BOT/bot');
    
    // Registrar rotas do bot se exportar funções
    if (botModule && typeof botModule.gerarCobranca === 'function') {
      app.post('/api/gerar-cobranca', botModule.gerarCobranca);
      console.log('✅ Rota /api/gerar-cobranca registrada');
    }
    
    if (botModule && typeof botModule.webhookPushinPay === 'function') {
      app.post('/webhook/pushinpay', botModule.webhookPushinPay);
      console.log('✅ Rota /webhook/pushinpay registrada');
    }
    
    // Webhook do Telegram
    app.post(`/bot${process.env.TELEGRAM_TOKEN}`, (req, res) => {
      if (botModule && botModule.bot) {
        botModule.bot.processUpdate(req.body);
      }
      res.sendStatus(200);
    });
    
    console.log('✅ Bot iniciado com sucesso');
  } else {
    console.log('⚠️ Arquivo bot.js não encontrado, continuando sem bot...');
  }
  
  // CARREGAR MÓDULO WEB (SISTEMA DE TOKENS) - ESTA É A PARTE CRÍTICA
  try {
    const webServerPath = path.join(__dirname, 'MODELO1/WEB/server.js');
    
    if (require('fs').existsSync(webServerPath)) {
      console.log('🔄 Carregando sistema de tokens...');
      const webModule = require('./MODELO1/WEB/server');
      
      if (typeof webModule === 'function') {
        // Passar a instância do app para o módulo web
        webModule(app);
        console.log('✅ Sistema de tokens carregado com sucesso');
      } else {
        console.log('⚠️ Módulo web não é uma função');
      }
    } else {
      console.log('⚠️ Arquivo server.js não encontrado em MODELO1/WEB/');
    }
  } catch (webError) {
    console.error('❌ ERRO CRÍTICO ao carregar sistema de tokens:', webError.message);
    console.error('Stack:', webError.stack);
    // Não continue se o sistema de tokens falhar
    process.exit(1);
  }
  
} catch (error) {
  console.error('❌ Erro ao inicializar módulos:', error);
  process.exit(1);
}

// Rota principal - APENAS se não houver conflito com o sistema de tokens
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'MODELO1/WEB/index.html');
  
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    // Se não houver index.html, criar uma página básica
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>HotBot Web</title>
        <meta charset="UTF-8">
      </head>
      <body>
        <h1>🚀 HotBot Web Service</h1>
        <p>Servidor rodando com sucesso!</p>
        <p>Timestamp: ${new Date().toISOString()}</p>
        <p>Bot Status: <span id="bot-status">Verificando...</span></p>
        <script>
          fetch('/api/health')
            .then(r => r.json())
            .then(data => {
              document.getElementById('bot-status').textContent = data.status || 'Desconhecido';
            });
        </script>
      </body>
      </html>
    `);
  }
});

// Rota de saúde BÁSICA (não conflita com /api/health do sistema de tokens)
app.get('/health-basic', (req, res) => {
  const botStatus = process.env.TELEGRAM_TOKEN ? 'Configurado' : 'Token não definido';
  
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: process.env.NODE_ENV || 'development',
    bot_status: botStatus,
    webhook_url: process.env.BASE_URL ? `${process.env.BASE_URL}/bot${process.env.TELEGRAM_TOKEN}` : 'BASE_URL não definido',
    message: 'Servidor principal rodando'
  });
});

// Rota para listar arquivos (debug)
app.get('/debug/files', (req, res) => {
  try {
    const fs = require('fs');
    const files = {
      root: fs.readdirSync(__dirname),
      modelo1: fs.existsSync(path.join(__dirname, 'MODELO1')) ? 
        fs.readdirSync(path.join(__dirname, 'MODELO1')) : [],
      web: fs.existsSync(path.join(__dirname, 'MODELO1/WEB')) ? 
        fs.readdirSync(path.join(__dirname, 'MODELO1/WEB')) : [],
      bot: fs.existsSync(path.join(__dirname, 'MODELO1/BOT')) ? 
        fs.readdirSync(path.join(__dirname, 'MODELO1/BOT')) : []
    };
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Middleware para capturar rotas não encontradas (deve ser DEPOIS do sistema de tokens)
app.use('*', (req, res) => {
  // Tentar servir arquivos da pasta WEB
  const filePath = path.join(__dirname, 'MODELO1/WEB', req.originalUrl);
  
  if (require('fs').existsSync(filePath) && require('fs').statSync(filePath).isFile()) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({
      error: 'Página não encontrada',
      path: req.originalUrl,
      timestamp: new Date().toISOString()
    });
  }
});

// Start do servidor
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor HotBot rodando na porta ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health (sistema de tokens)`);
  console.log(`🏥 Health básico: http://localhost:${PORT}/health-basic`);
  console.log(`🔍 Debug files: http://localhost:${PORT}/debug/files`);
  console.log(`🎯 Sistema de tokens: ATIVO`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 Recebido SIGTERM, fechando servidor...');
  server.close(() => {
    console.log('✅ Servidor fechado');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('📴 Recebido SIGINT, fechando servidor...');
  server.close(() => {
    console.log('✅ Servidor fechado');
    process.exit(0);
  });
});