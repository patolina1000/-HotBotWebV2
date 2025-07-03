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
  // Verificar se o arquivo do servidor web existe
  const webServerPath = path.join(__dirname, 'MODELO1/WEB/server.js');
  
  if (require('fs').existsSync(webServerPath)) {
    console.log('🔄 Carregando módulo web...');
    const webModule = require('./MODELO1/WEB/server');
    
    if (typeof webModule === 'function') {
      webModule(app);
      console.log('✅ Módulo web carregado com sucesso');
    } else {
      console.log('⚠️ Módulo web não é uma função, tentando rotas manuais...');
    }
  } else {
    console.log('⚠️ Arquivo server.js não encontrado em MODELO1/WEB/');
  }
  
  // Rota principal - servir index.html
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
        </body>
        </html>
      `);
    }
  });
  
  // Tentar inicializar o bot apenas se o arquivo existir
  const botPath = path.join(__dirname, 'MODELO1/BOT/bot.js');
  
  if (require('fs').existsSync(botPath)) {
    console.log('🤖 Iniciando bot...');
    require('./MODELO1/BOT/bot');
    console.log('✅ Bot iniciado com sucesso');
  } else {
    console.log('⚠️ Arquivo bot.js não encontrado, continuando sem bot...');
  }
  
} catch (error) {
  console.error('❌ Erro ao inicializar módulos:', error);
  
  // Fallback - criar rota básica se tudo falhar
  app.get('/', (req, res) => {
    res.json({ 
      status: 'OK', 
      message: 'Servidor rodando (modo fallback)',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  });
}

// Rota de saúde
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: process.env.NODE_ENV || 'development'
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

// Middleware para capturar todas as rotas não encontradas
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
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`🔍 Debug files: http://localhost:${PORT}/debug/files`);
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