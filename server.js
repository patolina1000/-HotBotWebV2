// server.js - Arquivo de entrada único para o Render
require('dotenv').config();

console.log('🚀 Iniciando servidor SiteHot...');

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');


// Verificar variáveis de ambiente
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

// Inicializar Express
const app = express();

// Middlewares básicos
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// Logging simplificado
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    console.log(`📡 API: ${req.method} ${req.path}`);
  }
  next();
});

app.post('/api/verificar-token', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ sucesso: false, erro: 'Token ausente' });
  }

  try {
    if (!databasePool) {
      return res.status(500).json({ sucesso: false, erro: 'Banco de dados não inicializado' });
    }

    const resultado = await databasePool.query(
      'SELECT * FROM tokens WHERE token = $1 AND usado = FALSE',
      [token]
    );

    if (resultado.rows.length === 0) {
      return res
        .status(401)
        .json({ sucesso: false, erro: 'Token inválido ou já usado' });
    }

    await databasePool.query('UPDATE tokens SET usado = TRUE WHERE token = $1', [token]);

    return res.json({ sucesso: true, valor: resultado.rows[0].valor });
  } catch (e) {
    console.error('Erro ao verificar token:', e);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno' });
  }
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

// Variáveis de controle
let bot, gerarCobranca, webhookPushinPay;
let botModule = null;
let postgres = null;
let databasePool = null;
let databaseConnected = false;
let webModuleLoaded = false;

// Carregar módulos
function carregarBot() {
  try {
    const botPath = path.join(__dirname, 'MODELO1', 'BOT', 'bot.js');
    
    if (!fs.existsSync(botPath)) {
      console.error('❌ Arquivo bot.js não encontrado!');
      return false;
    }

    botModule = require('./MODELO1/BOT/bot.js');
    bot = botModule.bot;
    gerarCobranca = botModule.gerarCobranca;
    webhookPushinPay = botModule.webhookPushinPay;
    
    console.log('✅ Bot carregado com sucesso');
    return true;
  } catch (error) {
    console.error('❌ Erro ao carregar bot:', error.message);
    return false;
  }
}

function carregarPostgres() {
  try {
    const postgresPath = path.join(__dirname, 'postgres.js');
    
    if (fs.existsSync(postgresPath)) {
      postgres = require('./postgres');
      console.log('✅ Módulo postgres carregado');
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Erro ao carregar postgres:', error.message);
    return false;
  }
}

async function inicializarBanco() {
  if (!postgres) return false;

  try {
    console.log('🗄️ Inicializando banco de dados...');
    databasePool = await postgres.initializeDatabase();
    
    if (databasePool) {
      databaseConnected = true;
      console.log('✅ Banco de dados inicializado');
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Erro ao inicializar banco:', error.message);
    return false;
  }
}

async function carregarSistemaTokens() {
  try {
    const tokensPath = path.join(__dirname, 'MODELO1/WEB/tokens.js');
    
    if (!fs.existsSync(tokensPath)) {
      console.log('⚠️ Sistema de tokens não encontrado');
      return false;
    }

    if (!databasePool) {
      console.error('❌ Pool de conexões não disponível');
      return false;
    }

    // Limpar cache do módulo
    delete require.cache[require.resolve('./MODELO1/WEB/tokens')];
    
    const tokensModule = require('./MODELO1/WEB/tokens');
    
    if (typeof tokensModule === 'function') {
      const tokenSystem = tokensModule(app, databasePool);
      
      if (tokenSystem) {
        webModuleLoaded = true;
        console.log('✅ Sistema de tokens carregado');
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('❌ Erro ao carregar sistema de tokens:', error.message);
    return false;
  }
}

// Configurar webhooks
const webhookPath = `/bot${TELEGRAM_TOKEN}`;

app.post(webhookPath, (req, res) => {
  try {
    if (!bot) {
      return res.status(500).json({ error: 'Bot não inicializado' });
    }
    
    bot.processUpdate(req.body);
    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Erro no webhook Telegram:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.post('/webhook/pushinpay', async (req, res) => {
  try {
    if (!webhookPushinPay) {
      return res.status(500).json({ error: 'Handler não disponível' });
    }
    
    await webhookPushinPay(req, res);
  } catch (error) {
    console.error('❌ Erro no webhook PushinPay:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// API para gerar cobrança
app.post('/api/gerar-cobranca', async (req, res) => {
  try {
    if (!gerarCobranca) {
      return res.status(500).json({ error: 'Função não disponível' });
    }
    
    await gerarCobranca(req, res);
  } catch (error) {
    console.error('❌ Erro na API de cobrança:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Rotas principais
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
      webhook_url: `${BASE_URL}${webhookPath}`
    });
  }
});

app.get('/admin', (req, res) => {
  const adminPath = path.join(__dirname, 'MODELO1/WEB/admin.html');
  
  if (fs.existsSync(adminPath)) {
    res.sendFile(adminPath);
  } else {
    const publicAdminPath = path.join(__dirname, 'public/admin.html');
    if (fs.existsSync(publicAdminPath)) {
      res.sendFile(publicAdminPath);
    } else {
      res.status(404).json({ error: 'Painel administrativo não encontrado' });
    }
  }
});

app.get('/admin.html', (req, res) => {
  const adminPath = path.join(__dirname, 'MODELO1/WEB/admin.html');
  
  if (fs.existsSync(adminPath)) {
    res.sendFile(adminPath);
  } else {
    const publicAdminPath = path.join(__dirname, 'public/admin.html');
    if (fs.existsSync(publicAdminPath)) {
      res.sendFile(publicAdminPath);
    } else {
      res.status(404).json({ error: 'Painel administrativo não encontrado' });
    }
  }
});

// Rotas de saúde
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    modules: {
      bot: !!bot,
      database: databaseConnected,
      web: webModuleLoaded
    }
  });
});

app.get('/health-basic', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Rota para compatibilidade com /obrigado/:token
app.get('/obrigado/:token', (req, res) => {
  const { token } = req.params;
  const valor = req.query.valor;
  const query = valor ? `?token=${token}&valor=${valor}` : `?token=${token}`;
  res.redirect(`/obrigado.html${query}`);
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

// Debug
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
    }
  });
});

// Middleware para rotas não encontradas
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      erro: 'Rota de API não encontrada',
      rota_solicitada: `${req.method} ${req.path}`
    });
  }
  
  res.status(404).json({
    erro: 'Rota não encontrada',
    rota: `${req.method} ${req.path}`
  });
});

// Middleware para erros
app.use((error, req, res, next) => {
  console.error('❌ Erro não tratado:', error.message);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Algo deu errado'
  });
});

// Inicializar módulos
async function inicializarModulos() {
  console.log('🚀 Inicializando módulos...');
  
  // Carregar bot
  carregarBot();
  
  // Carregar postgres
  const postgresCarregado = carregarPostgres();

  // Inicializar banco
  if (postgresCarregado) {
    await inicializarBanco();
    if (botModule && typeof botModule.setDatabasePool === 'function') {
      botModule.setDatabasePool(databasePool);
    }
  }
  
  // Carregar sistema de tokens
  await carregarSistemaTokens();
  
  console.log('📊 Status final dos módulos:');
  console.log(`🤖 Bot: ${bot ? 'OK' : 'ERRO'}`);
  console.log(`🗄️ Banco: ${databaseConnected ? 'OK' : 'ERRO'}`);
  console.log(`🎯 Tokens: ${webModuleLoaded ? 'OK' : 'ERRO'}`);
}

// Iniciar servidor
const server = app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🌐 URL: ${BASE_URL}`);
  console.log(`🔗 Webhook: ${BASE_URL}${webhookPath}`);
  
  // Inicializar módulos
  await inicializarModulos();
  
  console.log('✅ Servidor pronto!');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔄 Encerrando servidor...');
  
  if (databasePool && postgres) {
    databasePool.end().catch(console.error);
  }
  
  server.close(() => {
    console.log('✅ Servidor fechado');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🔄 Encerrando servidor...');
  
  if (databasePool && postgres) {
    databasePool.end().catch(console.error);
  }
  
  server.close(() => {
    console.log('✅ Servidor fechado');
    process.exit(0);
  });
});

// Tratamento de erros
process.on('uncaughtException', (error) => {
  console.error('❌ Erro não capturado:', error.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Promise rejeitada:', reason);
});

console.log('✅ Servidor configurado e pronto');