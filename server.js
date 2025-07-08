// server.js - Arquivo de entrada único para o Render
require('dotenv').config();

const { getPerfilVar } = require('./perfil');

process.on('uncaughtException', (err) => {
  console.error('❌ Erro não capturado:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Rejeição de Promise não tratada:', reason);
});

console.log('🚀 Iniciando servidor SiteHot...');

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cron = require('node-cron');
const rateLimit = require('express-rate-limit');
let lastRateLimitLog = 0;

// Heartbeat para indicar que o bot está ativo
setInterval(() => {
  const horario = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  console.log(`⏱ Uptime OK — ${horario}`);
}, 5 * 60 * 1000);


// Variáveis de ambiente
const BASE_URL = process.env.BASE_URL;
const PORT = process.env.PORT || 3000;

if (!BASE_URL) {
  console.error('❌ BASE_URL não definido!');
}

// Inicializar Express
const app = express();

app.get('/health', (req, res) => {
  console.log('🔍 Health check recebido');
  res.status(200).send('OK');
});

// Middlewares básicos
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  skip: (req) => {
    const ignorar = req.path === '/health' || req.path === '/health-basic';
    if (ignorar) {
      const agora = Date.now();
      if (agora - lastRateLimitLog > 60 * 60 * 1000) {
        console.log('⏩ Ignorando rate-limit para', req.path);
        lastRateLimitLog = agora;
      }
    }
    return ignorar;
  }
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

    await databasePool.query(
      'UPDATE tokens SET usado = TRUE, data_uso = CURRENT_TIMESTAMP WHERE token = $1',
      [token]
    );

    return res.json({ sucesso: true, valor: resultado.rows[0].valor });
  } catch (e) {
    console.error('Erro ao verificar token:', e);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno' });
  }
});

app.get('/api/verificar-token', async (req, res) => {
  let { token } = req.query;

  if (!token) {
    return res.status(400).json({ status: 'invalido' });
  }

  try {
    if (!databasePool) {
      return res.status(500).json({ status: 'invalido' });
    }

    token = token.toString().trim();
    console.log('Token recebido:', token);

    const query =
      "SELECT * FROM tokens WHERE token = $1 AND (COALESCE(usado::text, 'false')) IN ('false', '0', 'f')";
    const resultado = await databasePool.query(query, [token]);

    console.log('Resultado da consulta:', resultado.rows);

    if (resultado.rows.length === 0) {
      return res.json({ status: 'invalido' });
    }

    await databasePool.query(
      'UPDATE tokens SET usado = TRUE, data_uso = CURRENT_TIMESTAMP WHERE token = $1',
      [token]
    );

    return res.json({ status: 'valido' });
  } catch (e) {
    console.error('Erro ao verificar token (GET):', e);
    return res.status(500).json({ status: 'invalido' });
  }
});

// Endpoint para expor variáveis de ambiente necessárias no frontend
app.get('/api/env', (req, res) => {
  const pixelId = process.env.FB_PIXEL_ID || process.env.PIXEL_ID || null;
  const redirects = Object.keys(process.env)
    .filter(key => key.startsWith('REDIRECT'))
    .reduce((acc, key) => {
      acc[key.toLowerCase()] = process.env[key];
      return acc;
    }, {});

  res.json({ pixelId, redirects });
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

// Variáveis de controle por bot
const bots = [];
let postgres = null;
let databasePool = null;
let databaseConnected = false;
let webModuleLoaded = false;

// Iniciador do loop de downsells
function iniciarDownsellLoop() {
  bots.forEach(botMod => {
    if (!botMod.enviarDownsells) {
      console.warn('⚠️ Função enviarDownsells não disponível para um perfil');
      return;
    }
    // Execução imediata ao iniciar
    botMod.enviarDownsells().catch(err => console.error('Erro no envio inicial de downsells:', err));
    botMod.downsellInterval = setInterval(async () => {
      try {
        await botMod.enviarDownsells();
      } catch (err) {
        console.error('Erro no loop de downsells:', err);
      }
    }, 5 * 60 * 1000);
  });
  console.log('⏰ Loop de downsells ativo a cada 5 minutos para todos os perfis');
}

// Carregar módulos
function carregarBots() {
  const perfis = ['perfil1', 'perfil2'];
  perfis.forEach(perfil => {
    try {
      const botPath = path.join(__dirname, 'MODELO1', perfil, 'bot.js');
      if (!fs.existsSync(botPath)) {
        console.warn(`⚠️ Bot do ${perfil} não encontrado`);
        return;
      }
      const botModule = require(botPath);
      bots.push(botModule);
      console.log(`✅ Bot carregado: ${perfil}`);
      if (!botModule.bot) {
        console.error(`⚠️ Bot do ${perfil} não inicializado - comandos não registrados`);
      }
    } catch (error) {
      console.error(`❌ Erro ao carregar bot ${perfil}:`, error.message);
    }
  });

  if (bots.length > 0) {
    gerarCobranca = bots[0].gerarCobranca;
    webhookPushinPay = bots[0].webhookPushinPay;
    enviarDownsells = bots[0].enviarDownsells;
    enviarMensagemPeriodica = bots[0].enviarMensagemPeriodica;
    return true;
  }

  return false;
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

// Configurar webhooks para cada bot
bots.forEach(botMod => {
  const webhookPath = `/bot${botMod.TELEGRAM_TOKEN}`;
  app.post(webhookPath, (req, res) => {
    try {
      if (!botMod.bot) {
        return res.status(500).json({ error: 'Bot não inicializado' });
      }
      botMod.bot.processUpdate(req.body);
      res.sendStatus(200);
    } catch (error) {
      console.error('❌ Erro no webhook Telegram:', error);
      res.status(500).json({ error: 'Erro interno' });
    }
  });
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
// Rota raiz simplificada para health checks
app.get('/', (req, res) => {
  res.status(200).send('OK');
});

// Rota de informações completa (mantida para compatibilidade)
app.get('/info', (req, res) => {
  const indexPath = path.join(__dirname, 'MODELO1/WEB/index.html');

  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    const webhookPaths = bots.map(b => `${BASE_URL}/bot${b.TELEGRAM_TOKEN}`);
    res.json({
      message: 'SiteHot Bot API',
      status: 'running',
      bot_status: bots.length ? 'Inicializado' : 'Não inicializado',
      database_connected: databaseConnected,
      web_module_loaded: webModuleLoaded,
      webhook_urls: webhookPaths
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
app.get('/health-basic', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Rota de teste
app.get('/test', (req, res) => {
  const webhookPaths = bots.map(b => `${BASE_URL}/bot${b.TELEGRAM_TOKEN}`);
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    webhook_urls: webhookPaths,
    bot_status: bots.length ? 'Inicializado' : 'Não inicializado',
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
      bots: bots.length,
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
  
  // Carregar bots
  carregarBots();
  
  // Carregar postgres
  const postgresCarregado = carregarPostgres();
  
  // Inicializar banco
  if (postgresCarregado) {
    await inicializarBanco();
  }
  
  // Carregar sistema de tokens
  await carregarSistemaTokens();

  // Iniciar loop de downsells
  iniciarDownsellLoop();

  // Agendar mensagens periódicas para cada perfil
  bots.forEach(botMod => {
    if (botMod.enviarMensagemPeriodica && botMod.config && botMod.config.horariosEnvioPeriodico) {
      botMod.config.horariosEnvioPeriodico.forEach((cronExp, idx) => {
        cron.schedule(cronExp, () => {
          console.log(`[${new Date().toISOString()}] ⏰ Disparando mensagem periódica ${idx} do perfil ${botMod.MEU_PERFIL}`);
          botMod.enviarMensagemPeriodica(idx).catch(err =>
            console.error(`[${new Date().toISOString()}] Erro no envio periódico:`, err.message)
          );
        }, { timezone: 'America/Sao_Paulo' });
      });
    }
  });
  console.log('⏰ Agendadores de mensagens periódicas configurados');
  
  console.log('📊 Status final dos módulos:');
  console.log(`🤖 Bots: ${bots.length}`);
  console.log(`🗄️ Banco: ${databaseConnected ? 'OK' : 'ERRO'}`);
  console.log(`🎯 Tokens: ${webModuleLoaded ? 'OK' : 'ERRO'}`);
}

// Iniciar servidor
const server = app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🌐 URL: ${BASE_URL}`);
  // Inicializar módulos
  await inicializarModulos();

  bots.forEach(b => {
    console.log(`🔗 Webhook: ${BASE_URL}/bot${b.TELEGRAM_TOKEN}`);
  });
  
  console.log('✅ Servidor pronto!');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 SIGTERM recebido - ignorando encerramento automático');
});

process.on('SIGINT', async () => {
  console.log('📴 Recebido SIGINT, encerrando servidor...');

  if (databasePool && postgres) {
    await databasePool.end().catch(console.error);
  }

  server.close(() => {
    console.log('✅ Servidor fechado');
  });
});

console.log('✅ Servidor configurado e pronto');
