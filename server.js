// server.js - Arquivo de entrada único para o Render
require('dotenv').config();

console.log('🚀 Iniciando servidor SiteHot...');
console.log('📁 Executando a partir de:', __dirname);
console.log('🔧 Node.js versão:', process.version);
console.log('🌍 Ambiente:', process.env.NODE_ENV || 'development');

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// Verificar variáveis de ambiente essenciais
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const BASE_URL = process.env.BASE_URL;
const PORT = process.env.PORT || 3000;

if (!TELEGRAM_TOKEN) {
  console.error('❌ TELEGRAM_TOKEN não definido!');
  process.exit(1);
}

if (!BASE_URL) {
  console.error('❌ BASE_URL não definido!');
  process.exit(1);
}

console.log('🔐 TELEGRAM_TOKEN:', TELEGRAM_TOKEN ? 'DEFINIDO' : 'NÃO DEFINIDO');
console.log('🌐 BASE_URL:', BASE_URL);
console.log('🚪 PORT:', PORT);

// Inicializar Express
const app = express();

// Middlewares básicos
app.use(helmet({
  contentSecurityPolicy: false,
}));

app.use(compression());
app.use(cors({
  origin: true,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100
});
app.use(limiter);

// Middlewares para parsing do body
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware para logging
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

// Servir arquivos estáticos
const publicPath = path.join(__dirname, 'public');
const webPath = path.join(__dirname, 'MODELO1/WEB');

if (fs.existsSync(webPath)) {
  app.use(express.static(webPath));
  console.log('✅ Servindo arquivos estáticos da pasta MODELO1/WEB');
} else if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
  console.log('✅ Servindo arquivos estáticos da pasta public');
}

// Variáveis de controle de módulos
let bot, gerarCobranca, webhookPushinPay, gerenciadorMidia;
let databaseConnected = false;
let webModuleLoaded = false;
let postgres = null;
let databasePool = null;

// Função para carregar bot
function carregarBot() {
  try {
    const botPath = path.join(__dirname, 'MODELO1', 'BOT', 'bot.js');
    
    if (!fs.existsSync(botPath)) {
      console.error('❌ Arquivo bot.js não encontrado!');
      return false;
    }

    const botModule = require('./MODELO1/BOT/bot.js');
    bot = botModule.bot;
    gerarCobranca = botModule.gerarCobranca;
    webhookPushinPay = botModule.webhookPushinPay;
    gerenciadorMidia = botModule.gerenciadorMidia;
    
    console.log('✅ Bot carregado com sucesso');
    return true;
  } catch (error) {
    console.error('❌ Erro ao carregar bot:', error.message);
    return false;
  }
}

// Função para carregar postgres
function carregarPostgres() {
  try {
    const postgresPath = path.join(__dirname, 'postgres.js');
    
    if (fs.existsSync(postgresPath)) {
      postgres = require('./postgres');
      console.log('✅ Módulo postgres carregado');
      return true;
    } else {
      console.log('⚠️ Módulo postgres não encontrado');
      return false;
    }
  } catch (error) {
    console.error('❌ Erro ao carregar postgres:', error.message);
    return false;
  }
}

// Função para inicializar banco de dados
async function inicializarBanco() {
  if (!postgres) {
    console.log('⚠️ Módulo postgres não disponível');
    return false;
  }

  try {
    console.log('🗄️ Inicializando banco de dados...');
    databasePool = await postgres.initializeDatabase();
    
    if (databasePool) {
      databaseConnected = true;
      console.log('✅ Banco de dados inicializado com sucesso');
      return true;
    } else {
      console.log('❌ Falha ao inicializar banco de dados');
      return false;
    }
  } catch (error) {
    console.error('❌ Erro ao inicializar banco:', error.message);
    return false;
  }
}

// Função para carregar sistema de tokens
async function carregarSistemaTokens() {
  console.log('🔍 server.js: Iniciando carregamento do sistema de tokens...');
  console.log('🔍 server.js: databasePool disponível?', !!databasePool);
  console.log('🔍 server.js: databasePool.query disponível?', databasePool && typeof databasePool.query === 'function');
  
  try {
    const tokensPath = path.join(__dirname, 'MODELO1/WEB/tokens.js');
    
    if (!fs.existsSync(tokensPath)) {
      console.log('⚠️ Sistema de tokens não encontrado');
      return false;
    }

    // Tentar carregar o módulo tokens.js
    console.log('🔍 server.js: Tentando carregar tokens.js...');
    delete require.cache[require.resolve('./MODELO1/WEB/tokens')];
    const tokensModule = require('./MODELO1/WEB/tokens');
    console.log('🔍 server.js: tokens.js carregado com sucesso');
    console.log('🔍 server.js: Tipo do módulo:', typeof tokensModule);
    
    if (typeof tokensModule === 'function') {
      console.log('✅ server.js: Registrando rotas de tokens via tokens.js...');
      console.log('🔍 server.js: Passando parâmetros para tokens.js:');
      console.log('   - app disponível?', !!app);
      console.log('   - pool disponível?', !!databasePool);
      
      if (databasePool) {
        // Chamar o módulo passando app e pool
        const tokenSystem = tokensModule(app, databasePool);
        webModuleLoaded = true;
        console.log('✅ server.js: Sistema de tokens inicializado com sucesso');
        console.log('🔍 server.js: Objeto retornado pelo tokens.js:', Object.keys(tokenSystem || {}));
        
        // Verificar se as rotas foram realmente registradas
        console.log('🔍 server.js: Verificando rotas registradas no Express...');
        const routes = [];
        app._router.stack.forEach((middleware) => {
          if (middleware.route) {
            routes.push({
              method: Object.keys(middleware.route.methods)[0].toUpperCase(),
              path: middleware.route.path
            });
          } else if (middleware.name === 'router') {
            middleware.handle.stack.forEach((handler) => {
              if (handler.route) {
                routes.push({
                  method: Object.keys(handler.route.methods)[0].toUpperCase(),
                  path: handler.route.path
                });
              }
            });
          }
        });
        
        console.log('🔍 server.js: Rotas registradas no Express:');
        routes.forEach(route => {
          console.log(`   - ${route.method} ${route.path}`);
        });
        
        // Verificar especificamente as rotas de API
        const apiRoutes = routes.filter(route => route.path.startsWith('/api/'));
        console.log('🔍 server.js: Rotas de API encontradas:', apiRoutes.length);
        
        if (apiRoutes.length === 0) {
          console.warn('⚠️  server.js: NENHUMA ROTA DE API FOI REGISTRADA!');
        } else {
          console.log('✅ server.js: Rotas de API registradas com sucesso');
        }
        
      } else {
        console.log('⚠️ Sistema de tokens não carregado - pool não disponível');
      }
      return true;
    } else {
      console.error('❌ server.js: tokens.js não exportou uma função');
      console.error('❌ server.js: Tipo exportado:', typeof tokensModule);
      return false;
    }
  } catch (error) {
    console.error('❌ server.js: Erro ao carregar sistema de tokens:', error.message);
    console.error('❌ server.js: Stack trace:', error.stack);
    return false;
  }
}

// Configurar webhook do Telegram
const webhookPath = `/bot${TELEGRAM_TOKEN}`;
console.log('🔗 Configurando webhook no caminho:', webhookPath);

app.post(webhookPath, (req, res) => {
  try {
    console.log('📨 Webhook do Telegram recebido');
    
    if (!bot) {
      console.error('❌ Bot não inicializado');
      return res.status(500).json({ error: 'Bot não inicializado' });
    }
    
    bot.processUpdate(req.body);
    res.sendStatus(200);
    
  } catch (error) {
    console.error('❌ Erro ao processar webhook do Telegram:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Webhook do PushinPay
app.post('/webhook/pushinpay', async (req, res) => {
  try {
    console.log('💰 Webhook PushinPay recebido');
    
    if (!webhookPushinPay) {
      console.error('❌ Função webhookPushinPay não disponível');
      return res.status(500).json({ error: 'Webhook handler não disponível' });
    }
    
    await webhookPushinPay(req, res);
    
  } catch (error) {
    console.error('❌ Erro no webhook PushinPay:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// API para gerar cobrança
app.post('/api/gerar-cobranca', async (req, res) => {
  try {
    console.log('💳 API gerar cobrança chamada');
    
    if (!gerarCobranca) {
      console.error('❌ Função gerarCobranca não disponível');
      return res.status(500).json({ error: 'Função de cobrança não disponível' });
    }
    
    await gerarCobranca(req, res);
    
  } catch (error) {
    console.error('❌ Erro na API de cobrança:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota principal
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'MODELO1/WEB/index.html');
  
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({
      message: 'SiteHot Bot API',
      status: 'running',
      bot_status: bot ? 'Inicializado' : 'Não inicializado',
      database_connected: databaseConnected,
      web_module_loaded: webModuleLoaded,
      webhook_path: webhookPath,
      webhook_url: `${BASE_URL}${webhookPath}`
    });
  }
});

// Rota para admin (tanto /admin quanto /admin.html)
app.get('/admin', (req, res) => {
  const adminPath = path.join(__dirname, 'MODELO1/WEB/admin.html');
  
  if (fs.existsSync(adminPath)) {
    res.sendFile(adminPath);
  } else {
    // Fallback para a pasta public se não encontrar na WEB
    const publicAdminPath = path.join(__dirname, 'public/admin.html');
    if (fs.existsSync(publicAdminPath)) {
      res.sendFile(publicAdminPath);
    } else {
      res.status(404).json({
        error: 'Painel administrativo não encontrado',
        message: 'Arquivo admin.html não existe'
      });
    }
  }
});

// Rota alternativa para admin.html
app.get('/admin.html', (req, res) => {
  const adminPath = path.join(__dirname, 'MODELO1/WEB/admin.html');
  
  if (fs.existsSync(adminPath)) {
    res.sendFile(adminPath);
  } else {
    const publicAdminPath = path.join(__dirname, 'public/admin.html');
    if (fs.existsSync(publicAdminPath)) {
      res.sendFile(publicAdminPath);
    } else {
      res.status(404).json({
        error: 'Painel administrativo não encontrado'
      });
    }
  }
});

// Rota de saúde básica
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
    modules: {
      bot: !!bot,
      database: databaseConnected,
      web: webModuleLoaded
    }
  });
});

// Rota de health check básico (para monitoramento externo)
app.get('/health-basic', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'sitehot',
    version: '1.0.0'
  });
});

// Rota de teste
app.get('/test', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    webhook_url: `${BASE_URL}${webhookPath}`,
    bot_status: bot ? 'Inicializado' : 'Não inicializado',
    database_status: databaseConnected ? 'Conectado' : 'Desconectado',
    web_module_status: webModuleLoaded ? 'Carregado' : 'Não carregado'
  });
});

// Rota de debug
app.get('/debug/status', (req, res) => {
  const poolStats = databasePool && postgres ? postgres.getPoolStats(databasePool) : null;
  
  res.json({
    server: {
      status: 'running',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      env: process.env.NODE_ENV || 'development'
    },
    database: {
      connected: databaseConnected,
      pool_available: !!databasePool,
      pool_stats: poolStats
    },
    modules: {
      bot: !!bot,
      postgres: !!postgres,
      web: webModuleLoaded
    },
    environment: {
      database_url: process.env.DATABASE_URL ? 'DEFINIDA' : 'NÃO DEFINIDA',
      telegram_token: process.env.TELEGRAM_TOKEN ? 'DEFINIDO' : 'NÃO DEFINIDO',
      base_url: process.env.BASE_URL ? 'DEFINIDA' : 'NÃO DEFINIDA'
    }
  });
});

// Rota para arquivos (fallback)
app.get('/debug/files', (req, res) => {
  try {
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

// Middleware de debug para rotas
app.use((req, res, next) => {
  console.log(`🔍 server.js: Requisição recebida: ${req.method} ${req.path}`);
  
  // Verificar se a rota começa com /api/ e não foi encontrada
  if (req.path.startsWith('/api/')) {
    console.log('🔍 server.js: Requisição para rota de API detectada');
    console.log('🔍 server.js: Headers:', req.headers);
    console.log('🔍 server.js: Query params:', req.query);
    console.log('🔍 server.js: Body:', req.body);
  }
  
  next();
});

// Middleware para rotas não encontradas
app.use((req, res, next) => {
  console.log(`❌ server.js: Rota não encontrada: ${req.method} ${req.path}`);
  
  // Se for uma rota de API, dar informações mais detalhadas
  if (req.path.startsWith('/api/')) {
    console.log('❌ server.js: Rota de API não encontrada!');
    console.log('🔍 server.js: Rotas disponíveis no momento da requisição:');
    
    const routes = [];
    app._router.stack.forEach((middleware) => {
      if (middleware.route) {
        routes.push({
          method: Object.keys(middleware.route.methods)[0].toUpperCase(),
          path: middleware.route.path
        });
      } else if (middleware.name === 'router') {
        middleware.handle.stack.forEach((handler) => {
          if (handler.route) {
            routes.push({
              method: Object.keys(handler.route.methods)[0].toUpperCase(),
              path: handler.route.path
            });
          }
        });
      }
    });
    
    routes.forEach(route => {
      console.log(`   - ${route.method} ${route.path}`);
    });
    
    return res.status(404).json({
      erro: 'Rota de API não encontrada',
      rota_solicitada: `${req.method} ${req.path}`,
      rotas_disponiveis: routes.filter(r => r.path.startsWith('/api/'))
    });
  }
  
  res.status(404).json({
    erro: 'Rota não encontrada',
    rota: `${req.method} ${req.path}`
  });
});

// Middleware para tratamento de erros
app.use((error, req, res, next) => {
  console.error('❌ Erro não tratado:', error);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Algo deu errado'
  });
});

// Inicializar módulos após configurar rotas
async function inicializarModulos() {
  console.log('\n🚀 Inicializando módulos...');
  
  // 1. Carregar bot
  const botCarregado = carregarBot();
  if (botCarregado) {
    console.log('✅ Bot inicializado');
  } else {
    console.log('⚠️ Bot não inicializado');
  }
  
  // 2. Carregar postgres
  const postgresCarregado = carregarPostgres();
  
  // 3. Inicializar banco se postgres está disponível
  if (postgresCarregado) {
    await inicializarBanco();
  }
  
  // 4. Carregar sistema de tokens
  await carregarSistemaTokens();
  
  console.log('\n📊 Status dos módulos:');
  console.log(`🤖 Bot: ${bot ? 'OK' : 'ERRO'}`);
  console.log(`🗄️ Banco: ${databaseConnected ? 'OK' : 'ERRO'}`);
  console.log(`🎯 Tokens: ${webModuleLoaded ? 'OK' : 'ERRO'}`);
}

// Iniciar servidor
const server = app.listen(PORT, '0.0.0.0', async () => {
  console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🌐 URL base: ${BASE_URL}`);
  console.log(`🔗 Webhook URL: ${BASE_URL}${webhookPath}`);
  console.log(`📡 Rotas disponíveis:`);
  console.log(`   GET  /              - Página principal`);
  console.log(`   GET  /health        - Status de saúde`);
  console.log(`   GET  /test          - Teste de configuração`);
  console.log(`   GET  /debug/status  - Status completo`);
  console.log(`   POST ${webhookPath} - Webhook do Telegram`);
  console.log(`   POST /webhook/pushinpay - Webhook PushinPay`);
  console.log(`   POST /api/gerar-cobranca - API de cobrança`);
  
  // Inicializar módulos após servidor estar rodando
  await inicializarModulos();
  
  console.log(`\n✅ Servidor pronto para receber conexões!`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔄 Recebido SIGTERM, encerrando servidor...');
  
  if (databasePool && postgres) {
    databasePool.end().then(() => {
      console.log('🗄️ Pool de conexões fechado');
    }).catch(err => {
      console.error('❌ Erro ao fechar pool:', err);
    });
  }
  
  server.close(() => {
    console.log('✅ Servidor fechado');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🔄 Recebido SIGINT, encerrando servidor...');
  
  if (databasePool && postgres) {
    databasePool.end().then(() => {
      console.log('🗄️ Pool de conexões fechado');
    }).catch(err => {
      console.error('❌ Erro ao fechar pool:', err);
    });
  }
  
  server.close(() => {
    console.log('✅ Servidor fechado');
    process.exit(0);
  });
});

// Tratamento de erros não capturados (SEM process.exit)
process.on('uncaughtException', (error) => {
  console.error('❌ Erro não capturado:', error);
  // NÃO MATAR O PROCESSO - apenas log
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promise rejeitada não tratada:', reason);
  // NÃO MATAR O PROCESSO - apenas log
});

console.log('✅ Servidor configurado e pronto para iniciar');