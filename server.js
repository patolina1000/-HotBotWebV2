require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');

// Middleware básico
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos da pasta WEB
app.use(express.static(path.join(__dirname, 'MODELO1/WEB')));

// Variáveis de controle
let webModuleLoaded = false;
let webModuleError = null;

// Tratamento de erros não capturados (SEM process.exit)
process.on('uncaughtException', (err) => {
  console.error('❌ Erro não capturado:', err);
  // NÃO MATAR O PROCESSO - apenas log
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promise rejeitada não tratada:', reason);
  // NÃO MATAR O PROCESSO - apenas log
});

// Verificar variáveis de ambiente essenciais
function checkEnvironmentVariables() {
  console.log('🔍 Verificando variáveis de ambiente...');
  
  const envVars = {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN ? 'DEFINIDO' : 'NÃO DEFINIDO'
  };
  
  console.log('📋 Variáveis de ambiente:');
  Object.entries(envVars).forEach(([key, value]) => {
    if (key === 'DATABASE_URL' && value) {
      // Mascarar senha
      const masked = value.replace(/:([^:@]+)@/, ':***@');
      console.log(`  ${key}: ${masked}`);
    } else {
      console.log(`  ${key}: ${value || 'NÃO DEFINIDO'}`);
    }
  });
  
  // Definir DATABASE_URL padrão se não existir
  if (!process.env.DATABASE_URL) {
    console.log('⚠️ DATABASE_URL não definida, usando valor padrão...');
    process.env.DATABASE_URL = 'postgresql://hotbot_postgres_user:ZaBruwkb23NUQrq0FR6i1koTBeoEecNY@dpg-d1jgucili9vc73886630-a.oregon-postgres.render.com/hotbot_postgres';
  }
}

// Função para carregar módulo web com retry
async function loadWebModuleWithRetry(maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Tentativa ${attempt}/${maxRetries} - Carregando sistema de tokens...`);
      
      // Aguardar entre tentativas
      if (attempt > 1) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      const webServerPath = path.join(__dirname, 'MODELO1/WEB/server.js');
      
      if (!require('fs').existsSync(webServerPath)) {
        throw new Error('Arquivo server.js não encontrado em MODELO1/WEB/');
      }
      
      // Limpar cache do módulo para tentar novamente
      delete require.cache[require.resolve('./MODELO1/WEB/server')];
      
      const webModule = require('./MODELO1/WEB/server');
      
      if (typeof webModule === 'function') {
        webModule(app);
        console.log('✅ Sistema de tokens carregado com sucesso');
        webModuleLoaded = true;
        webModuleError = null;
        return true;
      } else {
        throw new Error('Módulo web não é uma função');
      }
      
    } catch (error) {
      webModuleError = error;
      console.error(`❌ Tentativa ${attempt}/${maxRetries} falhou:`, error.message);
      
      if (attempt === maxRetries) {
        console.error('❌ Todas as tentativas falharam. Sistema de tokens não disponível.');
        console.log('⚠️ O servidor continuará rodando sem o sistema de tokens.');
        return false;
      }
    }
  }
  
  return false;
}

// Inicializar módulos
async function initializeModules() {
  try {
    // Verificar ambiente
    checkEnvironmentVariables();
    
    // Tentar inicializar o bot primeiro
    const botPath = path.join(__dirname, 'MODELO1/BOT/bot.js');
    
    if (require('fs').existsSync(botPath)) {
      console.log('🤖 Iniciando bot...');
      try {
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
        if (process.env.TELEGRAM_TOKEN) {
          app.post(`/bot${process.env.TELEGRAM_TOKEN}`, (req, res) => {
            if (botModule && botModule.bot) {
              botModule.bot.processUpdate(req.body);
            }
            res.sendStatus(200);
          });
          console.log('✅ Webhook do Telegram configurado');
        }
        
        console.log('✅ Bot iniciado com sucesso');
      } catch (botError) {
        console.log('⚠️ Erro ao inicializar bot:', botError.message);
      }
    } else {
      console.log('⚠️ Arquivo bot.js não encontrado, continuando sem bot...');
    }
    
    // Carregar sistema de tokens (com retry)
    await loadWebModuleWithRetry(3);
    
  } catch (error) {
    console.error('❌ Erro ao inicializar módulos:', error);
    // NÃO MATAR O PROCESSO - continuar sem os módulos
  }
}

// Rota principal
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'MODELO1/WEB/index.html');
  
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    // Página de status
    const webStatus = webModuleLoaded ? 'Online' : 'Offline';
    const webError = webModuleError ? webModuleError.message : 'Nenhum erro';
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>HotBot Web</title>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; }
          .status { padding: 10px; margin: 10px 0; border-radius: 5px; }
          .online { background: #d4edda; color: #155724; }
          .offline { background: #f8d7da; color: #721c24; }
          .info { background: #d1ecf1; color: #0c5460; }
          pre { background: #f8f9fa; padding: 10px; border-radius: 5px; }
        </style>
      </head>
      <body>
        <h1>🚀 HotBot Web Service</h1>
        <div class="status info">
          <strong>Servidor Principal:</strong> Online<br>
          <strong>Timestamp:</strong> ${new Date().toISOString()}<br>
          <strong>Uptime:</strong> ${Math.floor(process.uptime())}s
        </div>
        <div class="status ${webStatus === 'Online' ? 'online' : 'offline'}">
          <strong>Sistema de Tokens:</strong> ${webStatus}<br>
          ${webModuleError ? `<strong>Erro:</strong> ${webError}` : ''}
        </div>
        <h3>🔗 Links Úteis</h3>
        <ul>
          <li><a href="/api/health">Health Check (Sistema de Tokens)</a></li>
          <li><a href="/health-basic">Health Check (Básico)</a></li>
          <li><a href="/debug/files">Debug Files</a></li>
          <li><a href="/debug/status">Status Completo</a></li>
        </ul>
        <script>
          // Verificar se o sistema de tokens está funcionando
          fetch('/api/health')
            .then(r => r.json())
            .then(data => {
              console.log('Sistema de tokens:', data);
            })
            .catch(err => {
              console.log('Sistema de tokens offline:', err);
            });
        </script>
      </body>
      </html>
    `);
  }
});

// Rota de saúde básica
app.get('/health-basic', (req, res) => {
  const botStatus = process.env.TELEGRAM_TOKEN ? 'Configurado' : 'Token não definido';
  
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: process.env.NODE_ENV || 'development',
    bot_status: botStatus,
    web_module_loaded: webModuleLoaded,
    web_module_error: webModuleError ? webModuleError.message : null,
    webhook_url: process.env.BASE_URL ? `${process.env.BASE_URL}/bot${process.env.TELEGRAM_TOKEN}` : 'BASE_URL não definido',
    message: 'Servidor principal rodando'
  });
});

// Rota de status completo
app.get('/debug/status', (req, res) => {
  res.json({
    server: {
      status: 'running',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      env: process.env.NODE_ENV || 'development'
    },
    modules: {
      web: {
        loaded: webModuleLoaded,
        error: webModuleError ? webModuleError.message : null
      },
      bot: {
        configured: !!process.env.TELEGRAM_TOKEN
      }
    },
    environment: {
      database_url: process.env.DATABASE_URL ? 'DEFINIDA' : 'NÃO DEFINIDA',
      telegram_token: process.env.TELEGRAM_TOKEN ? 'DEFINIDO' : 'NÃO DEFINIDO',
      node_env: process.env.NODE_ENV || 'development'
    }
  });
});

// Rota para retry do sistema de tokens
app.post('/debug/retry-web-module', async (req, res) => {
  console.log('🔄 Tentando recarregar sistema de tokens...');
  const success = await loadWebModuleWithRetry(1);
  
  res.json({
    success,
    webModuleLoaded,
    error: webModuleError ? webModuleError.message : null
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

// Middleware para capturar rotas não encontradas
app.use('*', (req, res) => {
  const filePath = path.join(__dirname, 'MODELO1/WEB', req.originalUrl);
  
  if (require('fs').existsSync(filePath) && require('fs').statSync(filePath).isFile()) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({
      error: 'Página não encontrada',
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
      web_module_loaded: webModuleLoaded
    });
  }
});

// Start do servidor
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Servidor HotBot rodando na porta ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health-basic`);
  console.log(`🔍 Debug: http://localhost:${PORT}/debug/status`);
  
  // Inicializar módulos após o servidor estar rodando
  setTimeout(async () => {
    await initializeModules();
    
    if (webModuleLoaded) {
      console.log(`🎯 Sistema de tokens: ATIVO`);
      console.log(`🏥 Token health: http://localhost:${PORT}/api/health`);
    } else {
      console.log(`⚠️ Sistema de tokens: INATIVO`);
      console.log(`🔄 Retry: POST http://localhost:${PORT}/debug/retry-web-module`);
    }
  }, 2000);
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