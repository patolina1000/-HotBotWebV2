// server.js - Arquivo de entrada único para o Render
require('dotenv').config();

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
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const { sendFacebookEvent } = require('./services/facebook');
let lastRateLimitLog = 0;
const bot1 = require('./MODELO1/BOT/bot1');
const bot2 = require('./MODELO1/BOT/bot2');
const sqlite = require('./database/sqlite');
const bots = new Map();

// Heartbeat para indicar que o bot está ativo
setInterval(() => {
  const horario = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  console.log(`⏱ Uptime OK — ${horario}`);
}, 5 * 60 * 1000);


// Verificar variáveis de ambiente
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_TOKEN_BOT2 = process.env.TELEGRAM_TOKEN_BOT2;
const BASE_URL = process.env.BASE_URL;
const PORT = process.env.PORT || 3000;
const URL_ENVIO_1 = process.env.URL_ENVIO_1;
const URL_ENVIO_2 = process.env.URL_ENVIO_2;
const URL_ENVIO_3 = process.env.URL_ENVIO_3;

if (!TELEGRAM_TOKEN) {
  console.error('❌ TELEGRAM_TOKEN não definido!');
}
if (!TELEGRAM_TOKEN_BOT2) {
  console.error('❌ TELEGRAM_TOKEN_BOT2 não definido!');
}

if (!BASE_URL) {
  console.error('❌ BASE_URL não definido!');
}
if (!URL_ENVIO_1) {
  console.warn('⚠️ URL_ENVIO_1 não definido');
}
if (!URL_ENVIO_2) {
  console.warn('⚠️ URL_ENVIO_2 não definido');
}
if (!URL_ENVIO_3) {
  console.warn('⚠️ URL_ENVIO_3 não definido');
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

// Webhook para BOT 1
app.post('/bot1/webhook', (req, res) => {
  if (bot1.bot && bot1.bot.bot) {
    bot1.bot.bot.processUpdate(req.body);
    return res.sendStatus(200);
  }
  res.sendStatus(500);
});

// Webhook para BOT 2
app.post('/bot2/webhook', (req, res) => {
  if (bot2.bot && bot2.bot.bot) {
    bot2.bot.bot.processUpdate(req.body);
    return res.sendStatus(200);
  }
  res.sendStatus(500);
});
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
    return res.status(400).json({ status: 'invalido' });
  }

  try {
    if (!databasePool) {
      return res.status(500).json({ status: 'invalido' });
    }

    const resultado = await databasePool.query(
      'SELECT usado, status FROM tokens WHERE token = $1',
      [token]
    );

    if (resultado.rows.length === 0) {
      return res.json({ status: 'invalido' });
    }

    const tokenData = resultado.rows[0];

    if (tokenData.status !== 'valido') {
      return res.json({ status: 'invalido' });
    }

    if (tokenData.usado) {
      return res.json({ status: 'usado' });
    }

    await databasePool.query(
      'UPDATE tokens SET usado = TRUE, data_uso = CURRENT_TIMESTAMP WHERE token = $1',
      [token]
    );

    return res.json({ status: 'valido' });
  } catch (e) {
    console.error('Erro ao verificar token:', e);
    return res.status(500).json({ status: 'invalido' });
  }
});

app.get('/api/verificar-token', async (req, res) => {
  let { token } = req.query;

  if (!token) {
    return res.status(400).json({ valido: false });
  }

  try {
    if (!databasePool) {
      return res.status(500).json({ valido: false });
    }

    token = token.toString().trim();
    console.log('Token recebido:', token);

    const resultado = await databasePool.query(
      'SELECT status, usado FROM tokens WHERE token = $1',
      [token]
    );

    console.log('Resultado da consulta:', resultado.rows);

    const row = resultado.rows[0];
    const valido = row && row.status === 'valido' && !row.usado;
    return res.json({ valido });
  } catch (e) {
    console.error('Erro ao verificar token (GET):', e);
    return res.status(500).json({ valido: false });
  }
});

app.get('/api/marcar-usado', async (req, res) => {
  const token = String(req.query.token || '').trim();
  if (!token) {
    return res.status(400).json({ sucesso: false });
  }
  try {
    if (!databasePool) {
      return res.status(500).json({ sucesso: false });
    }
    await databasePool.query(
      "UPDATE tokens SET status = 'usado', usado = TRUE, data_uso = CURRENT_TIMESTAMP WHERE token = $1 AND status != 'expirado'",
      [token]
    );
    return res.json({ sucesso: true });
  } catch (e) {
    console.error('Erro ao marcar token usado:', e);
    return res.status(500).json({ sucesso: false });
  }
});

// Retorna a URL final de redirecionamento conforme grupo
app.get('/api/url-final', (req, res) => {
  const grupo = String(req.query.grupo || '').toUpperCase();
  let url = null;

  if (grupo === 'G1') {
    url = URL_ENVIO_1;
  } else if (grupo === 'G2') {
    url = URL_ENVIO_2;
  } else if (grupo === 'G3') {
    url = URL_ENVIO_3;
  }

  if (!url) {
    return res.status(400).json({ sucesso: false, erro: 'Grupo inválido' });
  }

  res.json({ sucesso: true, url });
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
let bot, webhookPushinPay, enviarDownsells;
let downsellInterval;
let postgres = null;
let databasePool = null;
let databaseConnected = false;
let webModuleLoaded = false;

function iniciarCronFallback() {
  cron.schedule('* * * * *', async () => {
    if (!databasePool) return;
    try {
      const res = await databasePool.query(
        "SELECT token, valor, utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbp, fbc, ip_criacao, criado_em, event_time FROM tokens WHERE status = 'valido' AND (usado IS NULL OR usado = FALSE) AND criado_em < NOW() - INTERVAL '1 minute'"
      );
      for (const row of res.rows) {
        if (row.fbp || row.fbc || row.ip_criacao) {
          console.log(`\u26A0\uFE0F Fallback CAPI: enviando evento atrasado para o token ${row.token}`);
          await sendFacebookEvent({
            event_name: 'Purchase',
            event_time: row.event_time || Math.floor(new Date(row.criado_em).getTime() / 1000),
            event_id: row.token,
            value: parseFloat(row.valor),
            currency: 'BRL',
            fbp: row.fbp,
            fbc: row.fbc,
            client_ip_address: row.ip_criacao,
            custom_data: {
              utm_source: row.utm_source,
              utm_medium: row.utm_medium,
              utm_campaign: row.utm_campaign,
              utm_term: row.utm_term,
              utm_content: row.utm_content
            }
          });
        }
        await databasePool.query(
          "UPDATE tokens SET status = 'expirado', usado = TRUE WHERE token = $1",
          [row.token]
        );
      }
    } catch (err) {
      console.error('Erro no cron de fallback:', err.message);
    }
  });
  console.log('⏰ Cron de fallback iniciado');
}

// Iniciador do loop de downsells
function iniciarDownsellLoop() {
  if (!enviarDownsells) {
    console.warn('⚠️ Função enviarDownsells não disponível');
    return;
  }
  // Execução imediata ao iniciar
  enviarDownsells().catch(err => console.error('Erro no envio inicial de downsells:', err));
  downsellInterval = setInterval(async () => {
    try {
      await enviarDownsells();
    } catch (err) {
      console.error('Erro no loop de downsells:', err);
    }
  }, 20 * 60 * 1000);
  console.log('⏰ Loop de downsells ativo a cada 20 minutos');
}

function iniciarLimpezaTokens() {
  cron.schedule('*/20 * * * *', async () => {
    console.log('🧹 Limpando tokens expirados ou cancelados...');

    try {
      const db = sqlite.get();
      if (db) {
        const stmt = db.prepare(`
          DELETE FROM access_links
          WHERE (status IS NULL OR status = 'canceled')
            AND (enviado_pixel IS NULL OR enviado_pixel = 0)
            AND (acesso_usado IS NULL OR acesso_usado = 0)
        `);
        const info = stmt.run();
        console.log(`✅ SQLite: ${info.changes} tokens removidos`);
      }
    } catch (err) {
      console.error('❌ Erro SQLite:', err.message);
    }

    if (databasePool) {
      try {
        const result = await databasePool.query(`
          DELETE FROM access_links
          WHERE (status IS NULL OR status = 'canceled')
            AND (enviado_pixel IS NULL OR enviado_pixel = false)
            AND (acesso_usado IS NULL OR acesso_usado = false)
        `);
        console.log(`✅ PostgreSQL: ${result.rowCount} tokens removidos`);
      } catch (err) {
        console.error('❌ Erro PostgreSQL:', err.message);
      }
    }
  });
  console.log('⏰ Cron de limpeza de tokens iniciado a cada 20 minutos');
}

// Carregar módulos
function carregarBot() {
  try {
    const instancia1 = bot1.iniciar();
    const instancia2 = bot2.iniciar();

    bots.set('bot1', instancia1);
    bots.set('bot2', instancia2);

    bot = instancia1;
    webhookPushinPay = instancia1.webhookPushinPay ? instancia1.webhookPushinPay.bind(instancia1) : null;
    enviarDownsells = instancia1.enviarDownsells ? instancia1.enviarDownsells.bind(instancia1) : null;

    console.log('✅ Bots carregados com sucesso');
    return true;
  } catch (error) {
    console.error('❌ Erro ao carregar bot:', error.message);
    return false;
  }
}

function carregarPostgres() {
  try {
    const postgresPath = path.join(__dirname, 'database/postgres.js');

    if (fs.existsSync(postgresPath)) {
      postgres = require('./database/postgres');
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


app.post('/webhook/pushinpay', async (req, res) => {
  try {
    const rawId = req.body?.token || req.body?.id || req.body?.transaction_id || '';
    const idTrimmed = String(rawId).trim();
    const token = idTrimmed.toLowerCase();
    console.log('📥 Webhook recebido da PushinPay:', req.body);
    console.log('🔍 ID bruto extraído do webhook:', rawId);
    console.log('🔍 Token normalizado:', token);
    if (!token) {
      return res.status(400).json({ error: 'Token ausente' });
    }

    const db = sqlite.get();
    if (!db) {
      return res.status(500).json({ error: 'SQLite não inicializado' });
    }

    const row = db
      .prepare('SELECT bot_id FROM tokens WHERE LOWER(id_transacao) = LOWER(?) LIMIT 1')
      .get(token);

    if (!row) {
      console.warn('Token não encontrado:', token);
      return res.status(404).json({ error: 'Token não encontrado' });
    }

    const { bot_id } = row;
    const botInstance = bots.get(bot_id);

    if (botInstance && typeof botInstance.webhookPushinPay === 'function') {
      await botInstance.webhookPushinPay(req, res);
    } else {
      console.error('Bot não encontrado para bot_id:', bot_id);
      res.status(404).json({ error: 'Bot não encontrado' });
    }
  } catch (error) {
    console.error('❌ Erro no webhook PushinPay:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// API para gerar cobrança
app.post('/api/gerar-cobranca', async (req, res) => {
  try {
    const botId = req.body.bot_id;
    const botInstance = bots.get(botId);

    if (!botInstance || !botInstance.gerarCobranca) {
      return res
        .status(404)
        .json({ error: 'Bot não encontrado ou função gerarCobranca ausente' });
    }

    await botInstance.gerarCobranca(req, res);
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
    res.json({
      message: 'SiteHot Bot API',
      status: 'running',
      bot_status: bot ? 'Inicializado' : 'Não inicializado',
      database_connected: databaseConnected,
      web_module_loaded: webModuleLoaded,
      webhook_urls: [`${BASE_URL}/bot1/webhook`, `${BASE_URL}/bot2/webhook`]
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
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    webhook_urls: [`${BASE_URL}/bot1/webhook`, `${BASE_URL}/bot2/webhook`],
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
  }
  
  // Carregar sistema de tokens
  await carregarSistemaTokens();

  // Iniciar loop de downsells
  iniciarDownsellLoop();
  iniciarCronFallback();
  iniciarLimpezaTokens();
  
  console.log('📊 Status final dos módulos:');
  console.log(`🤖 Bot: ${bot ? 'OK' : 'ERRO'}`);
  console.log(`🗄️ Banco: ${databaseConnected ? 'OK' : 'ERRO'}`);
  console.log(`🎯 Tokens: ${webModuleLoaded ? 'OK' : 'ERRO'}`);
}

// Iniciar servidor
const server = app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🌐 URL: ${BASE_URL}`);
  console.log(`🔗 Webhook bot1: ${BASE_URL}/bot1/webhook`);
  console.log(`🔗 Webhook bot2: ${BASE_URL}/bot2/webhook`);
  
  // Inicializar módulos
  await inicializarModulos();
  
  console.log('✅ Servidor pronto!');
console.log('📦 Valor do plano 1 semana atualizado para R$ 9,90 com sucesso.');
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
