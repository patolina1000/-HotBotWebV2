// server.js - Arquivo de entrada único para o Render
require('dotenv').config();

process.on('uncaughtException', (err) => {
  console.error('Erro não capturado:', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Rejeição de Promise não tratada:', reason);
});

console.log('Iniciando servidor...');

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const axios = require('axios'); // 🔥 CORREÇÃO: Mover axios para o topo

// 🚀 SISTEMA DE MONITORAMENTO DE UPTIME
const { getUptimeMonitor } = require('./services/uptimeMonitor');
const cookieParser = require('cookie-parser');
const cron = require('node-cron');
const crypto = require('crypto');
const facebookService = require('./services/facebook');
const { sendFacebookEvent, generateEventId, checkIfEventSent } = facebookService;
const { formatForCAPI } = require('./services/purchaseValidation');
const facebookRouter = facebookService.router;
const protegerContraFallbacks = require('./services/protegerContraFallbacks');
const linksRoutes = require('./routes/links');
const { appendDataToSheet } = require('./services/googleSheets.js');
// 🔥 CORREÇÃO: Importar sessionTracking uma única vez no topo
const { getInstance: getSessionTracking } = require('./services/sessionTracking');
const kwaiEventAPI = require('./services/kwaiEventAPI');

// 🔥 NOVO: INTEGRAÇÃO PRIVACY---SYNC
const fetch = require('node-fetch');
let lastRateLimitLog = 0;
const bot1 = require('./MODELO1/BOT/bot1');
const bot2 = require('./MODELO1/BOT/bot2');
const botEspecial = require('./MODELO1/BOT/bot_especial');
const sqlite = require('./database/sqlite');
const bots = new Map();
const initPostgres = require("./init-postgres");
initPostgres();

// 🔥 NOVO: CARREGAR CONFIGURAÇÕES DO PRIVACY---SYNC
let privacyConfig = null;
let privacyUnifiedGateway = null;

try {
  const configPath = path.join(__dirname, 'privacy---sync', 'app-config.json');
  if (fs.existsSync(configPath)) {
    privacyConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log('✅ Configuração do privacy---sync carregada');
  }
} catch (error) {
  console.warn('⚠️ Erro ao carregar configuração do privacy---sync:', error.message);
}

// 🔥 NOVO: FUNÇÃO PARA INTEGRAR PRIVACY COM BOT
function setupPrivacyIntegration() {
  try {
    const UnifiedPaymentGateway = require('./privacy---sync/unifiedPaymentGateway');
    privacyUnifiedGateway = new UnifiedPaymentGateway();
    
    // Configurar webhook handler do bot para integração
    if (webhookPushinPay) {
      privacyUnifiedGateway.setBotWebhookHandler(webhookPushinPay);
      console.log('🔗 Privacy integrado com webhook PushinPay do bot');
    }
    
    // Verificar se o gateway foi inicializado corretamente
    const gatewayInfo = privacyUnifiedGateway.getAvailableGateways();
    console.log('📋 Gateways disponíveis:', gatewayInfo.map(g => g.name).join(', '));
    console.log('🎯 Gateway atual:', privacyUnifiedGateway.getCurrentGateway());
    
    console.log('✅ Privacy---sync integrado com sucesso ao projeto bot');
    return true;
  } catch (error) {
    console.error('❌ Erro ao integrar privacy com bot:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

// 🔥 NOVO: FUNÇÕES AUXILIARES DO PRIVACY---SYNC
function getPrivacyConfig() {
  if (!privacyConfig) {
    return {
      gateway: 'pushinpay',
      environment: 'production',
      pushinpay: { token: process.env.PUSHINPAY_TOKEN },
      syncpay: { 
        clientId: process.env.SYNCPAY_CLIENT_ID, 
        clientSecret: process.env.SYNCPAY_CLIENT_SECRET 
      }
    };
  }
  return privacyConfig;
}

function getActiveGateway() {
  const config = getPrivacyConfig();
  return config.gateway || 'pushinpay';
}

function getWebhookUrl() {
  const config = getPrivacyConfig();
  const baseUrl = process.env.BASE_URL || 'https://seu-dominio.com';
  const endpoints = {
    syncpay: '/webhook/syncpay',
    pushinpay: '/webhook/pushinpay'
  };
  return `${baseUrl}${endpoints[config.gateway] || endpoints.pushinpay}`;
}

// 🔥 CORREÇÃO: Função getPool que estava faltando
function getPool() {
  return pool;
}

// Heartbeat para indicar que o bot está ativo (apenas em desenvolvimento)
if (process.env.NODE_ENV !== 'production') {
  setInterval(() => {
    const horario = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    console.log(`Uptime OK — ${horario}`);
  }, 5 * 60 * 1000);
}

// Verificar variáveis de ambiente
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_TOKEN_BOT2 = process.env.TELEGRAM_TOKEN_BOT2;
const TELEGRAM_TOKEN_ESPECIAL = process.env.TELEGRAM_TOKEN_ESPECIAL;
const BASE_URL = process.env.BASE_URL;
const PORT = process.env.PORT || 3000;
const URL_ENVIO_1 = process.env.URL_ENVIO_1;
const URL_ENVIO_2 = process.env.URL_ENVIO_2;
const URL_ENVIO_3 = process.env.URL_ENVIO_3;

if (!TELEGRAM_TOKEN) {
  console.error('TELEGRAM_TOKEN não definido');
}
if (!TELEGRAM_TOKEN_BOT2) {
  console.error('TELEGRAM_TOKEN_BOT2 não definido');
}
if (!TELEGRAM_TOKEN_ESPECIAL) {
  console.error('TELEGRAM_TOKEN_ESPECIAL não definido');
}

if (!BASE_URL) {
  console.error('BASE_URL não definido');
}
if (!URL_ENVIO_1) {
  console.warn('URL_ENVIO_1 não definido');
}
if (!URL_ENVIO_2) {
  console.warn('URL_ENVIO_2 não definido');
}
if (!URL_ENVIO_3) {
  console.warn('URL_ENVIO_3 não definido');
}

// Inicializar Express
const app = express();

// Middleware para remover headers COOP/COEP
app.use((req, res, next) => {
  res.removeHeader("Cross-Origin-Opener-Policy");
  res.removeHeader("Cross-Origin-Embedder-Policy");
  next();
});

app.use(facebookRouter);

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Middlewares básicos
app.use(helmet({ 
  contentSecurityPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 🔥 NOVO: CORS ESPECÍFICO PARA PRIVACY---SYNC
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Rotas de redirecionamento
app.use('/', linksRoutes);
// 🔥 CORREÇÃO: Remover facebookRouter duplicado

// 🔥 NOVO: ROTAS DO PRIVACY---SYNC

// Rota para fornecer configurações públicas ao frontend
app.get('/api/config', (req, res) => {
  const config = getPrivacyConfig();
  res.json({
    model: config.model || { name: '', handle: '', bio: '' },
    plans: config.plans || {},
    gateway: config.gateway,
    syncpay: config.syncpay,
    pushinpay: config.pushinpay,
    redirectUrl: config.redirectUrl || '/compra-aprovada',
    generateQRCodeOnMobile: config.generateQRCodeOnMobile || false
  });
});

// Rota para obter token de autenticação SyncPay
app.post('/api/auth-token', async (req, res) => {
  try {
    const extraField = req.body['01K1259MAXE0TNRXV2C2WQN2MV'] || 'valor';
    const config = getPrivacyConfig();
    const clientId = config.syncpay?.clientId;
    const clientSecret = config.syncpay?.clientSecret;

    if (!clientId || !clientSecret) {
      console.error('[Auth] Credenciais não configuradas');
      return res.status(500).json({
        message: 'Credenciais da API não configuradas',
        error: 'syncpay.clientId ou syncpay.clientSecret não definidos'
      });
    }
    
    const authData = {
      client_id: clientId,
      client_secret: clientSecret,
      '01K1259MAXE0TNRXV2C2WQN2MV': extraField
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch('https://api.syncpayments.com.br/api/partner/v1/auth-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'SyncPay-Integration/1.0'
        },
        body: JSON.stringify(authData),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Auth] Erro na autenticação:', response.status, errorText);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { message: errorText };
        }
        
        return res.status(response.status).json({
          message: 'Erro na autenticação com a API SyncPayments',
          status: response.status,
          statusText: response.statusText,
          details: errorData
        });
      }

      const data = await response.json();
      
      if (!data.access_token) {
        console.error('[Auth] Token não encontrado na resposta');
        return res.status(500).json({
          message: 'Resposta inválida da API',
          error: 'access_token não encontrado na resposta'
        });
      }
      
      res.json(data);
      
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        console.error('[Auth] Timeout na requisição para API externa');
        return res.status(504).json({
          message: 'Timeout na conexão com a API SyncPayments',
          error: 'A requisição demorou mais de 30 segundos'
        });
      }
      
      console.error('[Auth] Erro de rede:', fetchError.message);
      return res.status(503).json({
        message: 'Erro de conexão com a API SyncPayments',
        error: fetchError.message,
        type: 'NETWORK_ERROR'
      });
    }
  } catch (err) {
    console.error('[Auth] Erro ao obter token:', err.message);
    res.status(500).json({
      message: 'Erro interno do servidor',
      error: err.message,
      type: err.name
    });
  }
});

// Rota para criar pagamento PIX unificado
app.post('/api/payments/pix/create', async (req, res) => {
  try {
    console.log('💰 [DEBUG] Criando pagamento PIX...');
    console.log('📋 [DEBUG] Dados recebidos:', JSON.stringify(req.body, null, 2));
    
    const config = getPrivacyConfig();
    const gateway = config.gateway;
    
    if (gateway === 'syncpay') {
      // Implementar lógica SyncPay
      res.status(501).json({
        success: false,
        message: 'SyncPay ainda não implementado',
        gateway: gateway
      });
    } else if (gateway === 'pushinpay') {
      // Usar implementação estável do bot via privacy unifiedGateway
      console.log('🚀 Usando implementação PushinPay do bot via privacy');
      
      if (!privacyUnifiedGateway) {
        return res.status(500).json({
          success: false,
          message: 'Integração privacy não disponível'
        });
      }

      // Aceitar tanto 'value' quanto 'amount' para compatibilidade
      const { value, amount, split_rules = [], metadata = {} } = req.body;
      const finalAmount = value || amount;
      
      if (!finalAmount) {
        console.error('❌ [DEBUG] Valor não fornecido. req.body:', req.body);
        return res.status(400).json({
          success: false,
          message: 'Valor é obrigatório (value ou amount)'
        });
      }

      console.log('💰 [DEBUG] Valor final a ser processado:', finalAmount);

      // Usar gateway unificado do privacy que usa implementação do bot
      privacyUnifiedGateway.setGateway('pushinpay');
      const result = await privacyUnifiedGateway.createPixPayment({
        amount: finalAmount,
        split_rules,
        metadata: {
          ...metadata,
          source: 'privacy-sync-integration'
        }
      });

      res.json({
        success: true,
        message: 'Pagamento PIX criado com sucesso (integração bot)',
        gateway: gateway,
        data: {
          id: result.payment_id,
          qr_code_base64: result.qr_code_image,
          qr_code: result.pix_code,
          pix_code: result.pix_code,
          pix_copia_cola: result.pix_code,
          transacao_id: result.payment_id,
          payment_id: result.payment_id,
          valor: finalAmount,
          amount: finalAmount
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Gateway não suportado',
        gateway: gateway
      });
    }
  } catch (error) {
    console.error('❌ [DEBUG] Erro ao criar pagamento PIX:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      message: 'Erro ao criar pagamento PIX',
      gateway: getActiveGateway(),
      error: error.response?.data || error.message
    });
  }
});

// Rota para consultar status do pagamento
app.get('/api/payments/:paymentId/status', async (req, res) => {
  try {
    const { paymentId } = req.params;
    console.log(`🔍 [DEBUG] Consultando status do pagamento ${paymentId}...`);
    
    const config = getPrivacyConfig();
    const gateway = config.gateway;
    
    if (gateway === 'pushinpay') {
      // Usar implementação estável do bot via privacy unifiedGateway
      console.log('🔍 Consultando status via implementação PushinPay do bot');
      
      if (!privacyUnifiedGateway) {
        return res.status(500).json({
          success: false,
          message: 'Integração privacy não disponível'
        });
      }

      privacyUnifiedGateway.setGateway('pushinpay');
      const result = await privacyUnifiedGateway.getPaymentStatus(paymentId);

      res.json({
        success: true,
        message: 'Status do pagamento consultado com sucesso (integração bot)',
        gateway: gateway,
        data: result
      });
    } else {
      res.status(501).json({
        success: false,
        message: 'Gateway não suportado para consulta de status',
        gateway: gateway
      });
    }
  } catch (error) {
    console.error('❌ [DEBUG] Erro ao consultar status:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      message: 'Erro ao consultar status do pagamento',
      gateway: getActiveGateway(),
      error: error.response?.data || error.message
    });
  }
});

// Rota para informações do gateway ativo
app.get('/api/controller/info', (req, res) => {
  try {
    const config = getPrivacyConfig();
    const info = {
      gateway: config.gateway,
      environment: config.environment || 'production',
      webhook_url: getWebhookUrl(),
      supported_gateways: ['pushinpay', 'syncpay'],
      current_config: {
        pushinpay_configured: !!config.pushinpay?.token,
        syncpay_configured: !!(config.syncpay?.clientId && config.syncpay?.clientSecret),
        integration_status: privacyUnifiedGateway ? 'active' : 'not_available'
      }
    };
    
    res.json({
      success: true,
      data: info,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Rota para testar conectividade
app.get('/api/controller/test', async (req, res) => {
  try {
    const config = getPrivacyConfig();
    const gateway = config.gateway;
    
    if (gateway === 'pushinpay') {
      if (!config.pushinpay?.token) {
        return res.json({
          success: false,
          message: 'Token PushinPay não configurado',
          gateway: gateway
        });
      }
      
      // Teste simples de conectividade
      res.json({
        success: true,
        message: 'Gateway PushinPay configurado e pronto para uso',
        gateway: gateway
      });
    } else if (gateway === 'syncpay') {
      if (!config.syncpay?.clientId || !config.syncpay?.clientSecret) {
        return res.json({
          success: false,
          message: 'Credenciais SyncPay não configuradas',
          gateway: gateway
        });
      }
      
      res.json({
        success: true,
        message: 'Gateway SyncPay configurado e pronto para uso',
        gateway: gateway
      });
    } else {
      res.json({
        success: false,
        message: 'Gateway não reconhecido',
        gateway: gateway
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rota de saúde do privacy-sync
app.get('/api/health-privacy', (req, res) => {
  const config = getPrivacyConfig();
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    message: 'Servidor privacy-sync funcionando corretamente',
    currentGateway: config.gateway,
    environment: config.environment || 'production',
    webhookUrl: getWebhookUrl()
  });
});

// Handler unificado de webhook por bot (Telegram ou PushinPay)
function criarRotaWebhook(botId) {
  return async (req, res) => {
    const botInstance = bots.get(botId);
    if (!botInstance) return res.status(404).json({ error: 'Bot não encontrado' });

    // Tentar parsear o corpo caso venha como texto
    let parsed = req.body;
    if (typeof req.body === 'string') {
      try {
        parsed = JSON.parse(req.body);
      } catch (err) {
        console.error('JSON malformado:', err.message);
        return res.status(400).json({ error: 'JSON inválido' });
      }
    }

    // Se for payload do Telegram
    const isTelegram = parsed && (parsed.update_id || parsed.message || parsed.callback_query);
    if (isTelegram) {
      if (botInstance.bot) {
        botInstance.bot.processUpdate(parsed);
        return res.sendStatus(200);
      }
      return res.sendStatus(500);
    }

    // Caso contrário tratar como webhook da PushinPay
    if (typeof botInstance.webhookPushinPay === 'function') {
      req.body = parsed; // manter compatibilidade com TelegramBotService
      await botInstance.webhookPushinPay(req, res);
    } else {
      res.status(404).json({ error: 'Webhook PushinPay não disponível' });
    }
  };
}

// Webhook para BOT 1
app.post('/bot1/webhook', express.text({ type: ['application/json', 'text/plain', 'application/x-www-form-urlencoded'] }), criarRotaWebhook('bot1'));

// Webhook para BOT 2
app.post('/bot2/webhook', express.text({ type: ['application/json', 'text/plain', 'application/x-www-form-urlencoded'] }), criarRotaWebhook('bot2'));

// Webhook para BOT ESPECIAL
app.post('/bot_especial/webhook', express.text({ type: ['application/json', 'text/plain', 'application/x-www-form-urlencoded'] }), criarRotaWebhook('bot_especial'));

// 🔥 NOVO: WEBHOOKS DO PRIVACY---SYNC
app.post('/webhook/syncpay', express.json(), (req, res) => {
  console.log('🔔 Webhook SyncPay recebido:', req.body);
  // Implementar lógica de webhook SyncPay aqui
  res.sendStatus(200);
});

app.post('/webhook/pushinpay', express.json(), (req, res) => {
  console.log('🔔 Webhook PushinPay recebido (privacy):', req.body);
  
  // Redirecionar para implementação estável do bot se disponível
  if (webhookPushinPay && typeof webhookPushinPay === 'function') {
    console.log('🔄 Redirecionando webhook PushinPay para implementação do bot');
    return webhookPushinPay(req, res);
  }
  
  // Fallback se bot não estiver disponível
  console.log('⚠️ Bot webhook não disponível - usando fallback');
  res.sendStatus(200);
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  skip: (req) => {
    const ignorar = req.path === '/health' || req.path === '/health-basic';
    if (ignorar) {
      const agora = Date.now();
      if (agora - lastRateLimitLog > 60 * 60 * 1000) {
        console.log('Ignorando rate-limit para', req.path);
        lastRateLimitLog = agora;
      }
    }
    return ignorar;
  }
});
app.use(limiter);

// Logging simplificado
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') && process.env.NODE_ENV !== 'production') {
    console.log(`API: ${req.method} ${req.path}`);
  }
  next();
});

app.post('/api/verificar-token', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ status: 'invalido' });
  }

  try {
    if (!pool) {
      return res.status(500).json({ status: 'invalido' });
    }

    const resultado = await pool.query(
      'SELECT usado, status, fn_hash, ln_hash, external_id_hash FROM tokens WHERE token = $1',
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

    // Buscar dados completos do token para CAPI
    const tokenCompleto = await pool.query(`
      SELECT token, valor, utm_source, utm_medium, utm_campaign, utm_term, utm_content, 
             fbp, fbc, ip_criacao, user_agent_criacao, event_time, criado_em,
             fn_hash, ln_hash, external_id_hash, pixel_sent, capi_sent, cron_sent, telegram_id,
             capi_ready, capi_processing
      FROM tokens WHERE token = $1
    `, [token]);

    const dadosToken = tokenCompleto.rows[0];

    // 🔥 NOVO: Buscar cookies do SessionTracking se telegram_id estiver disponível
    // 🔥 CORREÇÃO: sessionTracking já importado no topo
    if (dadosToken.telegram_id && (!dadosToken.fbp || !dadosToken.fbc)) {
      try {
        const sessionTracking = getSessionTracking();
        const sessionData = sessionTracking.getTrackingData(dadosToken.telegram_id);
        
        if (sessionData) {
          // Enriquecer dados do token com dados do SessionTracking
          if (!dadosToken.fbp && sessionData.fbp) {
            dadosToken.fbp = sessionData.fbp;
            console.log(`FBP recuperado do SessionTracking para token ${token} (telegram_id: ${dadosToken.telegram_id})`);
          }
          if (!dadosToken.fbc && sessionData.fbc) {
            dadosToken.fbc = sessionData.fbc;
            console.log(`FBC recuperado do SessionTracking para token ${token} (telegram_id: ${dadosToken.telegram_id})`);
          }
          if (!dadosToken.ip_criacao && sessionData.ip) {
            dadosToken.ip_criacao = sessionData.ip;
          }
          if (!dadosToken.user_agent_criacao && sessionData.user_agent) {
            dadosToken.user_agent_criacao = sessionData.user_agent;
          }
        }
      } catch (error) {
        console.warn('Erro ao buscar dados do SessionTracking para token:', error.message);
      }
    }

    await pool.query(
      'UPDATE tokens SET usado = TRUE, data_uso = CURRENT_TIMESTAMP WHERE token = $1',
      [token]
    );

    // Preparar user_data_hash se disponível
    let userDataHash = null;
    if (dadosToken.fn_hash || dadosToken.ln_hash || dadosToken.external_id_hash) {
      userDataHash = {
        fn: dadosToken.fn_hash,
        ln: dadosToken.ln_hash,
        external_id: dadosToken.external_id_hash
      };
    }

    // ✅ CORRIGIDO: Implementar transação atômica para envio CAPI e evitar race condition
    if (dadosToken.valor && !dadosToken.capi_sent && !dadosToken.capi_processing) {
      const client = await pool.connect();
      try {
        // Iniciar transação
        await client.query('BEGIN');
        
        // 1. Primeiro marcar como processando para evitar race condition
        const updateResult = await client.query(
          'UPDATE tokens SET capi_processing = TRUE WHERE token = $1 AND capi_sent = FALSE AND capi_processing = FALSE RETURNING id',
          [token]
        );
        
        if (updateResult.rows.length === 0) {
          // Token já está sendo processado ou já foi enviado
          await client.query('ROLLBACK');
          console.log(`CAPI para token ${token} já está sendo processado ou foi enviado`);
        } else {
          // 2. Realizar envio do evento CAPI
          const eventId = generateEventId(
            'Purchase',
            token,
            dadosToken.event_time || Math.floor(new Date(dadosToken.criado_em).getTime() / 1000)
          );
          
          // 🔥 CORREÇÃO CRÍTICA: Extrair parâmetros adicionais da URL original se disponível
          let eventSourceUrl = `https://ohvips.xyz/obrigado.html?token=${token}&valor=${dadosToken.valor}`;
          
          // Se houver UTM parameters ou outros parâmetros, incluir na URL
          const urlParams = [];
          if (dadosToken.utm_source) urlParams.push(`utm_source=${encodeURIComponent(dadosToken.utm_source)}`);
          if (dadosToken.utm_medium) urlParams.push(`utm_medium=${encodeURIComponent(dadosToken.utm_medium)}`);
          if (dadosToken.utm_campaign) urlParams.push(`utm_campaign=${encodeURIComponent(dadosToken.utm_campaign)}`);
          if (dadosToken.utm_term) urlParams.push(`utm_term=${encodeURIComponent(dadosToken.utm_term)}`);
          if (dadosToken.utm_content) urlParams.push(`utm_content=${encodeURIComponent(dadosToken.utm_content)}`);
          
          // Adicionar parâmetro G baseado na campanha se bio-instagram
          if (dadosToken.utm_campaign === 'bio-instagram') {
            urlParams.push('G1');
          }
          
          if (urlParams.length > 0) {
            eventSourceUrl += '&' + urlParams.join('&');
          }
          
          console.log(`CAPI event_source_url: ${eventSourceUrl}`);
          
          // 🔥 CORREÇÃO: Processar UTMs no formato nome|id
          const utmSource = processUTM(dadosToken.utm_source);
          const utmMedium = processUTM(dadosToken.utm_medium);
          const utmCampaign = processUTM(dadosToken.utm_campaign);
          const utmContent = processUTM(dadosToken.utm_content);
          const utmTerm = processUTM(dadosToken.utm_term);
          
          // 🔥 NOVO: Extrair fbclid do _fbc se disponível
          let fbclid = null;
          if (dadosToken.fbc) {
            const fbcMatch = dadosToken.fbc.match(/^fb\.1\.\d+\.(.+)$/);
            if (fbcMatch) {
              fbclid = fbcMatch[1];
              console.log(`✅ fbclid extraído do _fbc: ${fbclid}`);
            }
          }
          
          console.log('📊 UTMs processados para CAPI:', {
            utm_source: { name: utmSource.name, id: utmSource.id },
            utm_medium: { name: utmMedium.name, id: utmMedium.id },
            utm_campaign: { name: utmCampaign.name, id: utmCampaign.id },
            utm_content: { name: utmContent.name, id: utmContent.id },
            utm_term: { name: utmTerm.name, id: utmTerm.id },
            fbclid
          });
          
          const capiResult = await sendFacebookEvent({
            event_name: 'Purchase',
            event_time: dadosToken.event_time || Math.floor(new Date(dadosToken.criado_em).getTime() / 1000),
            event_id: eventId,
            event_source_url: eventSourceUrl, // 🔥 URL completa com todos os parâmetros
            value: formatForCAPI(dadosToken.valor),
            currency: 'BRL',
            fbp: dadosToken.fbp,
            fbc: dadosToken.fbc,
            client_ip_address: dadosToken.ip_criacao,
            client_user_agent: dadosToken.user_agent_criacao,
            telegram_id: dadosToken.telegram_id,
            user_data_hash: userDataHash,
            source: 'capi',
            client_timestamp: dadosToken.event_time, // 🔥 PASSAR TIMESTAMP DO CLIENTE PARA SINCRONIZAÇÃO
            custom_data: {
              // 🔥 CORREÇÃO: Enviar nomes e IDs separados
              utm_source: utmSource.name,
              utm_source_id: utmSource.id,
              utm_medium: utmMedium.name,
              utm_medium_id: utmMedium.id,
              utm_campaign: utmCampaign.name,
              utm_campaign_id: utmCampaign.id,
              utm_content: utmContent.name,
              utm_content_id: utmContent.id,
              utm_term: utmTerm.name,
              utm_term_id: utmTerm.id,
              fbclid: fbclid // 🔥 NOVO: Incluir fbclid
            }
          });

          if (capiResult.success) {
            // 3. Marcar como enviado e resetar flag de processamento
            await client.query(
              'UPDATE tokens SET capi_sent = TRUE, capi_processing = FALSE, first_event_sent_at = COALESCE(first_event_sent_at, CURRENT_TIMESTAMP), event_attempts = event_attempts + 1 WHERE token = $1',
              [token]
            );
            await client.query('COMMIT');
            console.log(`CAPI Purchase enviado com sucesso para token ${token} via transação atômica`);
          } else {
            // Rollback em caso de falha no envio
            await client.query('ROLLBACK');
                          console.error(`Erro ao enviar CAPI Purchase para token ${token}:`, capiResult.error);
          }
        }
      } catch (error) {
        // Garantir rollback em caso de qualquer erro
        await client.query('ROLLBACK');
                    console.error(`Erro inesperado na transação CAPI para token ${token}:`, error);
      } finally {
        // Sempre liberar a conexão
        client.release();
      }
    }

    // Retornar dados hasheados junto com o status
    const response = { status: 'valido' };
    
    // Incluir dados pessoais hasheados se disponíveis
    if (userDataHash) {
      response.user_data_hash = userDataHash;
    }

    return res.json(response);
  } catch (e) {
    console.error('Erro ao verificar token:', e);
    return res.status(500).json({ status: 'invalido' });
  }
});

app.post('/api/marcar-pixel-enviado', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ success: false, error: 'Token requerido' });
  }

  try {
    if (!pool) {
      return res.status(500).json({ success: false, error: 'Banco não disponível' });
    }

    await pool.query(`
      UPDATE tokens 
      SET pixel_sent = TRUE,
          first_event_sent_at = COALESCE(first_event_sent_at, CURRENT_TIMESTAMP),
          event_attempts = event_attempts + 1
      WHERE token = $1
    `, [token]);

            console.log(`Flag pixel_sent atualizada para token ${token}`);
    return res.json({ success: true });
  } catch (error) {
    console.error('Erro ao marcar pixel enviado:', error);
    return res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// 🔥 NOVO: Endpoint para sincronizar timestamp do cliente com servidor
app.post('/api/sync-timestamp', async (req, res) => {
  try {
    const { token, client_timestamp } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Token é obrigatório' });
    }
    
    if (!client_timestamp || typeof client_timestamp !== 'number') {
      return res.status(400).json({ error: 'client_timestamp deve ser um número (timestamp Unix)' });
    }
    
    const pool = getPool();
    if (!pool) {
      return res.status(500).json({ error: 'Erro de conexão com banco' });
    }
    
    // Atualizar o timestamp do evento no banco
    await pool.query(
      'UPDATE tokens SET event_time = $1 WHERE token = $2',
      [client_timestamp, token]
    );
    
            console.log(`Timestamp sincronizado para token ${token}: ${client_timestamp}`);
    
    res.json({ 
      success: true, 
      message: 'Timestamp sincronizado com sucesso',
      server_timestamp: Math.floor(Date.now() / 1000),
      client_timestamp: client_timestamp,
      diff_seconds: Math.abs(Math.floor(Date.now() / 1000) - client_timestamp)
    });
    
  } catch (error) {
    console.error('Erro ao sincronizar timestamp:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// 🔥 NOVO: Endpoint para evento ViewContent via Meta Conversions API
app.post('/api/capi/viewcontent', async (req, res) => {
  try {
    const {
      event_id,
      url: event_source_url,
      fbp,
      fbc,
      ip,
      user_agent,
      external_id,
      content_type = 'product',
      value,
      currency = 'BRL'
    } = req.body;

    // Validação de campos obrigatórios
    if (!event_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'event_id é obrigatório para deduplicação com o Pixel' 
      });
    }

    if (!event_source_url) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL da página (event_source_url) é obrigatória' 
      });
    }

    // Extrair IP do cabeçalho se não fornecido no body
    const clientIp = ip || 
      (req.headers['x-forwarded-for'] || '')
        .split(',')[0]
        .trim() ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      (req.connection && req.connection.socket?.remoteAddress);

    // Extrair User-Agent do cabeçalho se não fornecido no body
    const clientUserAgent = user_agent || req.get('user-agent');

    // Construir user_data seguindo o padrão existente
    const user_data = {};
    
    if (fbp) user_data.fbp = fbp;
    if (fbc) user_data.fbc = fbc;
    if (clientIp && clientIp !== '::1' && clientIp !== '127.0.0.1') {
      user_data.client_ip_address = clientIp;
    }
    if (clientUserAgent) user_data.client_user_agent = clientUserAgent;
    
    // Adicionar external_id se fornecido
    if (external_id) {
      // Hashar external_id se não estiver já hasheado (seguindo padrão de segurança)
      if (external_id.length !== 64 || !/^[a-f0-9]+$/i.test(external_id)) {
        const crypto = require('crypto');
        user_data.external_id = crypto.createHash('sha256').update(external_id).digest('hex');
        console.log('🔐 external_id hasheado para ViewContent');
      } else {
        user_data.external_id = external_id;
      }
    }

    // Validação: pelo menos 2 parâmetros obrigatórios conforme documentação Meta
    const requiredParams = ['fbp', 'fbc', 'client_ip_address', 'client_user_agent', 'external_id'];
    const availableParams = requiredParams.filter(param => user_data[param]);
    
    if (availableParams.length < 2) {
      const error = `ViewContent rejeitado: insuficientes parâmetros de user_data. Disponíveis: [${availableParams.join(', ')}]. Necessários: pelo menos 2 entre [${requiredParams.join(', ')}]`;
              console.error(`${error}`);
      return res.status(400).json({ 
        success: false, 
        error: 'Parâmetros insuficientes para ViewContent',
        details: error,
        available_params: availableParams,
        required_count: 2
      });
    }

            console.log(`ViewContent validado com ${availableParams.length} parâmetros: [${availableParams.join(', ')}]`);

    // Preparar dados do evento ViewContent
    const eventData = {
      event_name: 'ViewContent',
      event_time: Math.floor(Date.now() / 1000),
      event_id: event_id, // Usar eventID do Pixel para deduplicação
      event_source_url: event_source_url,
      fbp: user_data.fbp,
      fbc: user_data.fbc,
      client_ip_address: user_data.client_ip_address,
      client_user_agent: user_data.client_user_agent,
      source: 'capi',
      custom_data: {
        content_type: content_type
      }
    };

    // Adicionar external_id se disponível
    if (user_data.external_id) {
      eventData.user_data_hash = {
        external_id: user_data.external_id
      };
    }

    // Adicionar value e currency se fornecidos
    if (value) {
      eventData.value = parseFloat(value);
      eventData.currency = currency;
      eventData.custom_data.value = parseFloat(value);
      eventData.custom_data.currency = currency;
    }

    console.log(`📤 Enviando evento ViewContent via CAPI | Event ID: ${event_id} | URL: ${event_source_url}`);

    // Enviar evento usando a função existente
    const result = await sendFacebookEvent(eventData);

    if (result.success) {
              console.log(`Evento ViewContent enviado com sucesso via CAPI | Event ID: ${event_id}`);
      return res.json({ 
        success: true, 
        message: 'Evento ViewContent enviado com sucesso',
        event_id: event_id,
        event_time: eventData.event_time
      });
    } else if (result.duplicate) {
              console.log(`Evento ViewContent duplicado ignorado | Event ID: ${event_id}`);
      return res.json({ 
        success: true, 
        message: 'Evento já foi enviado (deduplicação ativa)',
        event_id: event_id,
        duplicate: true
      });
    } else {
              console.error(`Erro ao enviar evento ViewContent via CAPI:`, result.error);
      return res.status(500).json({ 
        success: false, 
        error: 'Falha ao enviar evento para Meta',
        details: result.error
      });
    }

  } catch (error) {
          console.error('Erro no endpoint ViewContent CAPI:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// Endpoint para monitoramento de eventos Purchase
app.get('/api/purchase-stats', async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({ error: 'Banco não disponível' });
    }

    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_tokens,
        COUNT(CASE WHEN status = 'valido' AND usado = TRUE THEN 1 END) as tokens_usados,
        COUNT(CASE WHEN pixel_sent = TRUE THEN 1 END) as pixel_enviados,
        COUNT(CASE WHEN capi_sent = TRUE THEN 1 END) as capi_enviados,
        COUNT(CASE WHEN cron_sent = TRUE THEN 1 END) as cron_enviados,
        COUNT(CASE WHEN pixel_sent = TRUE OR capi_sent = TRUE OR cron_sent = TRUE THEN 1 END) as algum_evento_enviado,
        COUNT(CASE WHEN pixel_sent = TRUE AND capi_sent = TRUE THEN 1 END) as pixel_e_capi,
        AVG(event_attempts) as media_tentativas,
        COUNT(CASE WHEN event_attempts >= 3 THEN 1 END) as max_tentativas_atingidas
      FROM tokens 
      WHERE status = 'valido' AND valor IS NOT NULL
    `);

    const recentStats = await pool.query(`
      SELECT 
        COUNT(*) as tokens_recentes,
        COUNT(CASE WHEN pixel_sent = TRUE THEN 1 END) as pixel_recentes,
        COUNT(CASE WHEN capi_sent = TRUE THEN 1 END) as capi_recentes,
        COUNT(CASE WHEN cron_sent = TRUE THEN 1 END) as cron_recentes
      FROM tokens 
      WHERE status = 'valido' 
        AND valor IS NOT NULL 
        AND criado_em > NOW() - INTERVAL '24 hours'
    `);

    const pendingFallback = await pool.query(`
      SELECT COUNT(*) as pendentes_fallback
      FROM tokens 
      WHERE status = 'valido' 
        AND (usado IS NULL OR usado = FALSE)
        AND criado_em < NOW() - INTERVAL '5 minutes'
        AND (
          (pixel_sent = FALSE OR pixel_sent IS NULL)
          OR (capi_ready = TRUE AND capi_sent = FALSE AND capi_processing = FALSE)
        )
        AND (cron_sent = FALSE OR cron_sent IS NULL)
        AND (event_attempts < 3 OR event_attempts IS NULL)
        AND valor IS NOT NULL
    `);

    // ✅ NOVO: Estatísticas das flags de controle CAPI
    const capiStats = await pool.query(`
      SELECT 
        COUNT(CASE WHEN capi_ready = TRUE THEN 1 END) as capi_ready_count,
        COUNT(CASE WHEN capi_processing = TRUE THEN 1 END) as capi_processing_count,
        COUNT(CASE WHEN capi_ready = TRUE AND capi_sent = FALSE THEN 1 END) as capi_ready_pending
      FROM tokens 
      WHERE criado_em > NOW() - INTERVAL '24 hours'
        AND valor IS NOT NULL
    `);

    return res.json({
      geral: stats.rows[0],
      ultimas_24h: recentStats.rows[0],
      pendentes_fallback: pendingFallback.rows[0].pendentes_fallback,
      capi_control: capiStats.rows[0], // ✅ NOVO: Controle CAPI
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao buscar estatísticas de Purchase:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

app.get('/api/verificar-token', async (req, res) => {
  let { token } = req.query;

  if (!token) {
    return res.status(400).json({ sucesso: false, erro: 'Token não informado' });
  }

  try {
    if (!pool) {
      return res.status(500).json({ sucesso: false, erro: 'Banco não disponível' });
    }

    token = token.toString().trim();
    console.log('Token recebido:', token);

    const resultado = await pool.query(
      'SELECT status, usado, bot_id FROM tokens WHERE token = $1',
      [token]
    );

    console.log('Resultado da consulta:', resultado.rows);

    const row = resultado.rows[0];
    
    if (!row) {
      return res.json({ sucesso: false, erro: 'Token não encontrado' });
    }
    
    if (row.status !== 'valido') {
      return res.json({ sucesso: false, erro: 'Token inválido' });
    }
    
    if (row.usado) {
      return res.json({ sucesso: false, erro: 'Token já foi usado' });
    }

    // Determinar URL de redirecionamento baseado no bot
    let redirectUrl = 'https://t.me/+0iLdVzcJsq9kOWQ5'; // Default para bot especial
    
    if (row.bot_id === 'bot1') {
      redirectUrl = 'https://t.me/+GCCPdMuNYSAyNmU5';
    } else if (row.bot_id === 'bot2') {
      redirectUrl = 'https://t.me/+Ks-ib0Kqh3FhOWI5';
    }

    return res.json({ 
      sucesso: true, 
      redirectUrl: redirectUrl,
      bot_id: row.bot_id 
    });
  } catch (e) {
    console.error('Erro ao verificar token (GET):', e);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno do servidor' });
  }
});

app.get('/api/marcar-usado', async (req, res) => {
  const token = String(req.query.token || '').trim();
  if (!token) {
    return res.status(400).json({ sucesso: false });
  }
  try {
    if (!pool) {
      return res.status(500).json({ sucesso: false });
    }
    await pool.query(
      "UPDATE tokens SET status = 'usado', usado = TRUE, data_uso = CURRENT_TIMESTAMP WHERE token = $1 AND status != 'expirado'",
      [token]
    );
    return res.json({ sucesso: true });
  } catch (e) {
    console.error('Erro ao marcar token usado:', e);
    return res.status(500).json({ sucesso: false });
  }
});

// API para buscar dados do comprador (apenas para bot especial)
app.get('/api/dados-comprador', async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token não informado' });
    }

    const resultado = await pool.query(
      'SELECT bot_id, fn_hash, ln_hash, external_id_hash FROM tokens WHERE token = $1 AND status != $2',
      [token, 'expirado']
    );

    if (!resultado.rows.length) {
      return res.status(404).json({ success: false, error: 'Token não encontrado' });
    }

    const row = resultado.rows[0];
    
    // Apenas para bot especial
    if (row.bot_id !== 'bot_especial') {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }

    // Buscar dados temporários do comprador para exibição
    try {
      // Buscar dados temporários armazenados no PostgreSQL
      const webhookData = await pool.query(
        'SELECT payer_name_temp, payer_cpf_temp, end_to_end_id_temp, ip_criacao, fn_hash, external_id_hash FROM tokens WHERE token = $1 AND bot_id = $2',
        [token, 'bot_especial']
      );
      
      if (webhookData.rows.length > 0) {
        const tokenData = webhookData.rows[0];
        
        // Retornar dados reais do comprador se disponíveis
        const nomeExibir = tokenData.payer_name_temp || (tokenData.fn_hash ? 'Comprador Verificado ✓' : 'N/A');
        const cpfExibir = tokenData.payer_cpf_temp ? mascarCPF(tokenData.payer_cpf_temp) : (tokenData.external_id_hash ? '***.***.***-**' : 'N/A');
        const endToEndIdExibir = tokenData.end_to_end_id_temp || 'N/A';
        const ipExibir = tokenData.ip_criacao || 'N/A';
        
        res.json({
          success: true,
          nome: nomeExibir,
          cpf: cpfExibir,
          end_to_end_id: endToEndIdExibir,
          ip: ipExibir,
          verificado: !!(tokenData.fn_hash && tokenData.external_id_hash)
        });
      } else {
        res.json({
          success: true,
          nome: row.fn_hash ? 'Comprador Verificado ✓' : 'N/A',
          cpf: row.external_id_hash ? '***.***.***-**' : 'N/A',
          end_to_end_id: 'N/A',
          ip: 'N/A',
          verificado: !!(row.fn_hash && row.external_id_hash)
        });
      }
    } catch (dbError) {
      console.error('Erro ao buscar dados do webhook:', dbError);
      res.json({
        success: true,
        nome: row.fn_hash ? 'Comprador Verificado ✓' : 'N/A',
        cpf: row.external_id_hash ? '***.***.***-**' : 'N/A',
        end_to_end_id: 'N/A',
        ip: 'N/A',
        verificado: !!(row.fn_hash && row.external_id_hash)
      });
    }

  } catch (error) {
    console.error('Erro ao buscar dados do comprador:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// Função auxiliar para formatar CPF completo
function mascarCPF(cpf) {
  if (!cpf) return '***.***.***-**';
  
  // Remove formatação existente
  const cpfNumeros = cpf.replace(/\D/g, '');
  
  if (cpfNumeros.length !== 11) {
    return '***.***.***-**';
  }
  
  // Formatar CPF completo: XXX.XXX.XXX-XX
  return `${cpfNumeros.slice(0,3)}.${cpfNumeros.slice(3,6)}.${cpfNumeros.slice(6,9)}-${cpfNumeros.slice(9,11)}`;
}

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

app.post('/api/gerar-payload', protegerContraFallbacks, async (req, res) => {
  try {
    const {
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      fbp,
      fbc,
      ip: bodyIp,
      user_agent: bodyUa,
      kwai_click_id
    } = req.body || {};

    const headerUa = req.get('user-agent') || null;
    const headerIp =
      (req.headers['x-forwarded-for'] || '')
        .split(',')[0]
        .trim() ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      (req.connection && req.connection.socket?.remoteAddress) ||
      null;

    const normalize = (val) => {
      if (typeof val === 'string') {
        const cleaned = val.toLowerCase().trim();
        return cleaned || 'unknown';
      }
      return 'unknown';
    };

    const normalizePreservingCase = (val) => {
      if (typeof val === 'string') {
        const cleaned = val.trim();
        return cleaned || 'unknown';
      }
      return 'unknown';
    };

    const payloadId = crypto.randomBytes(4).toString('hex');

    const values = {
      utm_source: normalize(utm_source),
      utm_medium: normalize(utm_medium),
      utm_campaign: normalize(utm_campaign),
      utm_term: normalize(utm_term),
      utm_content: normalize(utm_content),
      fbp: normalizePreservingCase(fbp),
      fbc: normalizePreservingCase(fbc),
      ip: normalize(bodyIp || headerIp),
      user_agent: normalizePreservingCase(bodyUa || headerUa),
      kwai_click_id: normalizePreservingCase(kwai_click_id)
    };

    if (pool) {
      try {
        await pool.query(
          `INSERT INTO payloads (payload_id, utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbp, fbc, ip, user_agent, kwai_click_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            payloadId,
            values.utm_source,
            values.utm_medium,
            values.utm_campaign,
            values.utm_term,
            values.utm_content,
            values.fbp,
            values.fbc,
            values.ip,
            values.user_agent,
            values.kwai_click_id
          ]
        );
        console.log(`[payload] Novo payload salvo: ${payloadId}`);
      } catch (e) {
        if (e.code === '23505') {
          console.warn('Payload_id duplicado. Tente novamente.');
        } else {
          console.error('Erro ao inserir payloads:', e.message);
        }
      }
    }

    res.json({ payload_id: payloadId });
  } catch (err) {
    console.error('Erro ao gerar payload_id:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Mantido para retrocompatibilidade
app.post('/api/payload', protegerContraFallbacks, async (req, res) => {
  try {
    const payloadId = crypto.randomBytes(4).toString('hex');
    const { fbp = null, fbc = null } = req.body || {};
    const userAgent = req.get('user-agent') || null;
    const ip =
      (req.headers['x-forwarded-for'] || '')
        .split(',')[0]
        .trim() ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      (req.connection && req.connection.socket?.remoteAddress) ||
      null;

    if (pool) {
      try {
        await pool.query(
          `INSERT INTO payload_tracking (payload_id, fbp, fbc, ip, user_agent)
           VALUES ($1, $2, $3, $4, $5)`,
          [payloadId, fbp, fbc, ip, userAgent]
        );
        console.log(`[payload] Novo payload salvo: ${payloadId}`);
      } catch (e) {
        if (e.code === '23505') {
          console.warn('Payload_id duplicado. Tente novamente.');
        } else {
          console.error('Erro ao inserir payload_tracking:', e.message);
        }
      }
    }

    res.json({ payload_id: payloadId });
  } catch (err) {
    console.error('Erro ao gerar payload_id:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// 🔥 NOVO: Endpoint para debug do rastreamento invisível
app.get('/api/session-tracking-stats', async (req, res) => {
  try {
    // 🔥 CORREÇÃO: sessionTracking já importado no topo
    const sessionTracking = getSessionTracking();
    const stats = sessionTracking.getStats();
    
    res.json({
      success: true,
      message: 'Estatísticas do rastreamento de sessão invisível',
      stats: stats,
      description: {
        main_cache_entries: 'Usuários ativos no cache principal',
        fallback_cache_entries: 'Usuários no cache secundário',
        total_users_tracked: 'Total de usuários únicos rastreados'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erro ao obter estatísticas',
      message: error.message
    });
  }
});

// 🔥 NOVO: Endpoint para buscar dados específicos de um usuário (só para debug)
app.get('/api/session-tracking/:telegram_id', async (req, res) => {
  try {
    const { telegram_id } = req.params;
    
    if (!telegram_id) {
      return res.status(400).json({
        success: false,
        error: 'telegram_id obrigatório'
      });
    }

    // 🔥 CORREÇÃO: sessionTracking já importado no topo
    const sessionTracking = getSessionTracking();
    const data = sessionTracking.getTrackingData(telegram_id);
    
    if (!data) {
      return res.json({
        success: false,
        message: 'Nenhum dado encontrado para este telegram_id',
        telegram_id: telegram_id
      });
    }

    // Não expor dados sensíveis completos em produção
    const sanitizedData = {
      telegram_id: data.telegram_id,
      has_fbp: !!data.fbp,
      has_fbc: !!data.fbc,
      has_ip: !!data.ip,
      has_user_agent: !!data.user_agent,
      utm_source: data.utm_source,
      utm_medium: data.utm_medium,
      utm_campaign: data.utm_campaign,
      created_at: data.created_at,
      last_updated: data.last_updated,
      age_minutes: Math.round((Date.now() - data.created_at) / 60000)
    };

    res.json({
      success: true,
      message: 'Dados de rastreamento encontrados',
      data: sanitizedData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar dados de rastreamento',
      message: error.message
    });
  }
});

// 🔥 NOVA ROTA: Rastrear evento 'welcome' quando usuário acessa boasvindas.html
app.post('/api/track-welcome', async (req, res) => {
  try {
    // Verificar se a variável de ambiente SPREADSHEET_ID está definida
    if (!process.env.SPREADSHEET_ID) {
      console.error('SPREADSHEET_ID não definido nas variáveis de ambiente');
      return res.status(500).json({ 
        success: false, 
        message: 'Configuração de planilha não encontrada' 
      });
    }

    // Preparar dados para inserção na planilha
    const range = 'welcome!A1';
    const values = [[new Date().toISOString().split('T')[0], 1]];

    // Chamar a função appendDataToSheet
    await appendDataToSheet(range, values);

    // Retornar sucesso
    return res.status(200).json({ 
      success: true, 
      message: 'Welcome event tracked successfully.' 
    });

  } catch (error) {
    // Log do erro no console
    console.error('Erro ao rastrear evento welcome:', error);
    
    // Retornar erro
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to track welcome event.' 
    });
  }
});

// 🔥 NOVA ROTA: Rastrear evento 'cta_clicker' quando usuário clica no botão
app.post('/api/track-cta-click', async (req, res) => {
  try {
    // Verificar se a variável de ambiente SPREADSHEET_ID está definida
    if (!process.env.SPREADSHEET_ID) {
      console.error('SPREADSHEET_ID não definido nas variáveis de ambiente');
      return res.status(500).json({ 
        success: false, 
        message: 'Configuração de planilha não encontrada' 
      });
    }

    // Preparar dados para inserção na planilha
    const range = 'cta_clicker!A1';
    const values = [[new Date().toISOString().split('T')[0], 1]];

    // Chamar a função appendDataToSheet
    await appendDataToSheet(range, values);

    // Retornar sucesso
    return res.status(200).json({ 
      success: true, 
      message: 'CTA click event tracked successfully.' 
    });

  } catch (error) {
    // Log do erro no console
    console.error('Erro ao rastrear evento cta_clicker:', error);
    
    // Retornar erro
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to track CTA click event.' 
    });
  }
});

// 🔥 NOVA ROTA: Rastrear evento '/start' quando usuário inicia conversa com o bot
app.post('/api/track-bot-start', async (req, res) => {
  try {
    // Verificar se a variável de ambiente SPREADSHEET_ID está definida
    if (!process.env.SPREADSHEET_ID) {
      console.error('SPREADSHEET_ID não definido nas variáveis de ambiente');
      return res.status(500).json({ 
        success: false, 
        message: 'Configuração de planilha não encontrada' 
      });
    }

    // Preparar dados para inserção na planilha
    const range = 'bot_start!A1';
    const values = [[new Date().toISOString().split('T')[0], 1]];

    // Chamar a função appendDataToSheet
    await appendDataToSheet(range, values);

    // Retornar sucesso
    return res.status(200).json({ 
      success: true, 
      message: 'Bot start event tracked successfully.' 
    });

  } catch (error) {
    // Log do erro no console
    console.error('Erro ao rastrear evento bot start:', error);
    
    // Retornar erro
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to track bot start event.' 
    });
  }
});

// 🔥 NOVA ROTA: Rastrear evento 'pix_generated' quando usuário gera uma cobrança PIX
app.post('/api/track-pix-generated', async (req, res) => {
  try {
    // Verificar se a variável de ambiente SPREADSHEET_ID está definida
    if (!process.env.SPREADSHEET_ID) {
      console.error('SPREADSHEET_ID não definido nas variáveis de ambiente');
      return res.status(500).json({ 
        success: false, 
        message: 'Configuração de planilha não encontrada' 
      });
    }

    // Preparar dados para inserção na planilha
    const range = 'pix_generated!A1';
    const values = [[new Date().toISOString().split('T')[0], 1]];

    // Chamar a função appendDataToSheet
    await appendDataToSheet(range, values);

    // Retornar sucesso
    return res.status(200).json({ 
      success: true, 
      message: 'PIX generated event tracked successfully.' 
    });

  } catch (error) {
    // Log do erro no console
    console.error('Erro ao rastrear evento PIX generated:', error);
    
    // Retornar erro
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to track PIX generated event.' 
    });
  }
});

// 🔥 ROTA REMOVIDA: /api/track-purchase 
// Esta rota foi removida pois o envio para Google Sheets agora é feito
// diretamente no TelegramBotService.js com o modelo antigo restaurado
// Data simplificada + Quantidade 1 + Nome oferta + UTMs separadas

// 🔥 NOVA ROTA: Rastrear acesso direto via /seusonho
app.post('/api/track-seusonho-access', async (req, res) => {
  try {
    // Verificar se a variável de ambiente SPREADSHEET_ID está definida
    if (!process.env.SPREADSHEET_ID) {
      console.error('SPREADSHEET_ID não definido nas variáveis de ambiente');
      return res.status(500).json({ 
        success: false, 
        message: 'Configuração de planilha não encontrada' 
      });
    }

    const {
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      fbp,
      fbc,
      user_agent,
      payload_id,
      timestamp,
      page
    } = req.body;

    // Preparar dados para inserção na planilha
    const range = 'welcome!A1';
    const values = [[new Date().toISOString().split('T')[0], 1]];

    // Chamar a função appendDataToSheet
    await appendDataToSheet(range, values);

    console.log(`✅ Acesso /seusonho registrado no Google Sheets - UTM Source: ${utm_source}, Payload: ${payload_id}`);

    // Retornar sucesso
    return res.status(200).json({ 
      success: true, 
      message: 'Seusonho access tracked successfully.' 
    });

  } catch (error) {
    // Log do erro no console
    console.error('Erro ao rastrear acesso /seusonho:', error);
    
    // Retornar erro
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to track seusonho access.' 
    });
  }
});

// 🔥 NOVA ROTA: Webhook para processar notificações de pagamento
app.post('/webhook', async (req, res) => {
  try {
    // Proteção contra payloads vazios
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).send('Payload inválido');
    }

    // Segurança simples no webhook
    if (process.env.WEBHOOK_SECRET) {
      const auth = req.headers['authorization'];
      if (auth !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
        return res.sendStatus(403);
      }
    }

    const payment = req.body;
    const { status } = payment || {};
    const idBruto = payment.id || payment.token || payment.transaction_id || null;
    const normalizedId = idBruto ? idBruto.toLowerCase().trim() : null;

    console.log('🔔 Webhook recebido');
    console.log('Payload:', JSON.stringify(payment, null, 2));
    console.log('Headers:', req.headers);
    console.log('ID normalizado:', normalizedId);
    console.log('Status:', status);

    // Verificar se o pagamento foi aprovado
    if (normalizedId && ['paid', 'approved', 'pago'].includes(status)) {
      console.log('✅ Pagamento aprovado detectado');
      
      // Buscar informações da transação no banco de dados PostgreSQL
      if (!pool) {
        console.error('❌ Pool de conexão PostgreSQL não disponível');
        return res.sendStatus(500);
      }
      
      const transaction_info = await pool.query('SELECT * FROM tokens WHERE id_transacao = $1', [normalizedId]);
      
      if (transaction_info.rows.length > 0) {
        const transaction = transaction_info.rows[0];
        console.log('📊 Dados da transação encontrados:', transaction);
        
        // 🔥 REMOVIDO: Chamada para /api/track-purchase
        // O registro no Google Sheets agora é feito diretamente no TelegramBotService.js
        // com o modelo antigo restaurado (data simplificada + quantidade 1 + nome oferta + UTMs)
        
        // Continuar com o processamento normal do webhook...
        // (aqui você pode adicionar a lógica existente do webhook)
        
      } else {
        console.log('❌ Transação não encontrada no banco de dados');
      }
    } else {
      console.log('ℹ️ Pagamento não aprovado ou ID inválido');
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error('Erro no webhook:', err.message);
    return res.sendStatus(500);
  }
});


// 🔥 NOVO: ROTAS ESPECÍFICAS DO PRIVACY---SYNC (DEVEM VIR ANTES DOS ARQUIVOS ESTÁTICOS)
const privacyPath = path.join(__dirname, 'privacy---sync');

// Rota para a página privacy (checkout)
app.get('/privacy', (req, res) => {
  const privacyIndexPath = path.join(__dirname, 'privacy---sync', 'public', 'index.html');
  if (fs.existsSync(privacyIndexPath)) {
    res.sendFile(privacyIndexPath);
  } else {
    res.status(404).json({ error: 'Página de checkout não encontrada' });
  }
});

// Rota para a página de links (página principal)
app.get('/links', (req, res) => {
  const linksPath = path.join(__dirname, 'privacy---sync', 'links', 'index.html');
  if (fs.existsSync(linksPath)) {
    res.sendFile(linksPath);
  } else {
    res.status(404).json({ error: 'Página de links não encontrada' });
  }
});

// Rota para a página de compra aprovada
app.get('/compra-aprovada', (req, res) => {
  const compraPath = path.join(__dirname, 'privacy---sync', 'compra-aprovada', 'index.html');
  if (fs.existsSync(compraPath)) {
    res.sendFile(compraPath);
  } else {
    res.status(404).json({ error: 'Página de compra aprovada não encontrada' });
  }
});

// Rota para a página de redirecionamento
app.get('/redirect', (req, res) => {
  const redirectPath = path.join(__dirname, 'privacy---sync', 'redirect', 'index.html');
  if (fs.existsSync(redirectPath)) {
    res.sendFile(redirectPath);
  } else {
    res.status(404).json({ error: 'Página de redirecionamento não encontrada' });
  }
});

// Servir arquivos estáticos
const publicPath = path.join(__dirname, 'public');
const webPath = path.join(__dirname, 'MODELO1/WEB');

if (fs.existsSync(webPath)) {
  app.use(express.static(webPath));
          console.log('Servindo arquivos estáticos da pasta MODELO1/WEB');
} else if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
          console.log('Servindo arquivos estáticos da pasta public');
}

// 🔥 NOVO: SERVIR ARQUIVOS ESTÁTICOS DO PRIVACY---SYNC (APÓS AS ROTAS ESPECÍFICAS)
if (fs.existsSync(privacyPath)) {
  // Servir assets do checkout (/privacy)
  app.use(express.static(path.join(privacyPath, 'public')));

  // Servir arquivos estáticos específicos
  app.use('/images', express.static(path.join(privacyPath, 'links/images')));
  app.use('/icons', express.static(path.join(privacyPath, 'links/icons')));
  app.use(
    '/compra-aprovada/images',
    express.static(path.join(privacyPath, 'compra-aprovada/images'))
  );

  console.log('✅ Arquivos estáticos do privacy---sync configurados');
}

// Variáveis de controle
let bot, webhookPushinPay;
let downsellInterval;
let postgres = null;
let pool = null;
let databaseConnected = false;
let webModuleLoaded = false;

function iniciarCronFallback() {
  cron.schedule('*/5 * * * *', async () => {
    if (!pool) return;
    try {
      // ✅ ATUALIZADO: Buscar tokens elegíveis para fallback - incluindo tokens com capi_ready = TRUE
      const res = await pool.query(`
        SELECT token, valor, utm_source, utm_medium, utm_campaign, utm_term, utm_content, 
               fbp, fbc, ip_criacao, user_agent_criacao, criado_em, event_time,
               fn_hash, ln_hash, external_id_hash, pixel_sent, capi_sent, cron_sent, event_attempts,
               capi_ready, capi_processing
        FROM tokens 
        WHERE status = 'valido' 
          AND (usado IS NULL OR usado = FALSE) 
          AND criado_em < NOW() - INTERVAL '5 minutes'
          AND (
            (pixel_sent = FALSE OR pixel_sent IS NULL)
            OR (capi_ready = TRUE AND capi_sent = FALSE AND capi_processing = FALSE)
          )
          AND (cron_sent = FALSE OR cron_sent IS NULL)
          AND (event_attempts < 3 OR event_attempts IS NULL)
      `);

      if (process.env.NODE_ENV !== 'production' && res.rows.length > 0) {
        console.log(`Cron Fallback: ${res.rows.length} tokens elegíveis para fallback`);
      }

      // ✅ PRIORIZAR tokens com capi_ready = TRUE (vindos do TelegramBotService)
      const tokensCapiReady = res.rows.filter(row => row.capi_ready === true);
      const tokensRegulares = res.rows.filter(row => row.capi_ready !== true);
      
              if (process.env.NODE_ENV !== 'production' && (tokensCapiReady.length > 0 || tokensRegulares.length > 0)) {
          console.log(`📍 ${tokensCapiReady.length} tokens com CAPI ready, ${tokensRegulares.length} tokens regulares`);
        }

      // Processar tokens com capi_ready primeiro
      const allTokens = [...tokensCapiReady, ...tokensRegulares];

      for (const row of allTokens) {
        // Verificar se o token tem dados mínimos necessários
        if (!row.valor || (!row.fbp && !row.fbc && !row.ip_criacao)) {
          // Log reduzido - apenas count a cada 10 tokens
          if (!global.fallbackLogCount) global.fallbackLogCount = 0;
          global.fallbackLogCount++;
          if (global.fallbackLogCount % 10 === 1) {
            console.log(`⚠️ ${global.fallbackLogCount} tokens sem dados para fallback (log a cada 10)`);
          }
          continue;
        }

        const tipoProcessamento = row.capi_ready ? 'CAPI READY' : 'FALLBACK';
                    console.log(`${tipoProcessamento} CRON: enviando evento para token ${row.token} (tentativa ${(row.event_attempts || 0) + 1}/3)`);

        // Preparar user_data_hash se disponível
        let userDataHash = null;
        if (row.fn_hash || row.ln_hash || row.external_id_hash) {
          userDataHash = {
            fn: row.fn_hash,
            ln: row.ln_hash,
            external_id: row.external_id_hash
          };
        }

        const eventName = 'Purchase';
        const eventId = generateEventId(
          eventName,
          row.token,
          row.event_time || Math.floor(new Date(row.criado_em).getTime() / 1000)
        );
        
        // 🔥 CORREÇÃO: Processar UTMs no formato nome|id para cron job
        const utmSource = processUTM(row.utm_source);
        const utmMedium = processUTM(row.utm_medium);
        const utmCampaign = processUTM(row.utm_campaign);
        const utmContent = processUTM(row.utm_content);
        const utmTerm = processUTM(row.utm_term);
        
        // 🔥 NOVO: Extrair fbclid do _fbc se disponível
        let fbclid = null;
        if (row.fbc) {
          const fbcMatch = row.fbc.match(/^fb\.1\.\d+\.(.+)$/);
          if (fbcMatch) {
            fbclid = fbcMatch[1];
            console.log(`✅ fbclid extraído do _fbc (cron): ${fbclid}`);
          }
        }
        
        const capiResult = await sendFacebookEvent({
          event_name: eventName,
          event_time: row.event_time || Math.floor(new Date(row.criado_em).getTime() / 1000),
          event_id: eventId,
          value: parseFloat(row.valor),
          currency: 'BRL',
          fbp: row.fbp,
          fbc: row.fbc,
          client_ip_address: row.ip_criacao,
          client_user_agent: row.user_agent_criacao,
          telegram_id: row.telegram_id,
          user_data_hash: userDataHash,
          source: 'cron',
          token: row.token,
          pool: pool,
          custom_data: {
            // 🔥 CORREÇÃO: Enviar nomes e IDs separados
            utm_source: utmSource.name,
            utm_source_id: utmSource.id,
            utm_medium: utmMedium.name,
            utm_medium_id: utmMedium.id,
            utm_campaign: utmCampaign.name,
            utm_campaign_id: utmCampaign.id,
            utm_content: utmContent.name,
            utm_content_id: utmContent.id,
            utm_term: utmTerm.name,
            utm_term_id: utmTerm.id,
            fbclid: fbclid // 🔥 NOVO: Incluir fbclid
          }
        });

        if (capiResult.success) {
                      console.log(`${tipoProcessamento} CRON: Purchase enviado com sucesso para token ${row.token}`);
          // Resetar flag capi_ready após envio bem-sucedido
          if (row.capi_ready) {
            await pool.query('UPDATE tokens SET capi_ready = FALSE WHERE token = $1', [row.token]);
          }
        } else if (!capiResult.duplicate) {
                      console.error(`${tipoProcessamento} CRON: Erro ao enviar Purchase para token ${row.token}:`, capiResult.error);
        }

        // Marcar token como expirado apenas se tentou 3 vezes ou teve sucesso
        if (capiResult.success || (row.event_attempts || 0) >= 2) {
          await pool.query(
            "UPDATE tokens SET status = 'expirado', usado = TRUE WHERE token = $1",
            [row.token]
          );
                      console.log(`Token ${row.token} marcado como expirado`);
        }
      }
    } catch (err) {
      console.error('Erro no cron de fallback:', err.message);
    }
  });
      console.log('Cron de fallback melhorado iniciado (verifica a cada 5 minutos, envia após 5 minutos de inatividade)');
}

// 🚀 SISTEMA DE PRÉ-AQUECIMENTO PERIÓDICO CENTRALIZADO
function iniciarPreAquecimentoPeriodico() {
  console.log('🔥 Sistema de pré-aquecimento CENTRALIZADO iniciado (a cada 30 minutos)');
  console.log('   ⚠️  Sistema individual desabilitado para evitar conflitos');
  
  // 🚀 EXECUÇÃO INSTANTÂNEA: Começar aquecimento imediatamente (10 segundos após boot)
  setTimeout(() => {
    console.log('🔥 INICIANDO AQUECIMENTO INSTANTÂNEO...');
    executarPreAquecimento();
  }, 10 * 1000); // 10 segundos apenas para bots estarem prontos
  
  // Cron job principal a cada 30 minutos - AQUECIMENTO
  cron.schedule('*/30 * * * *', () => {
    executarPreAquecimento();
  });
  
  // Cron job para logs de métricas a cada 30 minutos (offset de 15min)
  cron.schedule('15,45 * * * *', () => {
    logMetricasTodasInstancias();
  });
  
  // Cron job para validação de pools a cada 2 horas
  cron.schedule('0 */2 * * *', () => {
    validarPoolsTodasInstancias();
  });
}

async function executarPreAquecimento() {
  const startTime = Date.now();
  const timestamp = new Date().toLocaleString('pt-BR', { 
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  console.log('🔥 PRÉ-AQUECIMENTO: Iniciando aquecimento periódico das mídias...');
  
  let totalAquecidas = 0;
  let totalErros = 0;
  
  try {
    // Lista de bots para aquecer
    const bots = [
      { id: 'bot1', instance: global.bot1, nome: 'Bot1' },
      { id: 'bot2', instance: global.bot2, nome: 'Bot2' },
      { id: 'bot_especial', instance: global.botEspecial, nome: 'Bot Especial' }
    ];
    
    // Aquecer cada bot individualmente com delay de 1 minuto entre eles para evitar erro 429
    for (let i = 0; i < bots.length; i++) {
      const botInfo = bots[i];
      
      if (botInfo.instance && botInfo.instance.gerenciadorMidia) {
        console.log(`🔥 PRÉ-AQUECIMENTO: Processando ${botInfo.nome}...`);
        
        const botStartTime = Date.now();
        const resultado = await aquecerMidiasBot(botInfo.instance, botInfo.id);
        const botTempoTotal = Date.now() - botStartTime;
        
        totalAquecidas += resultado.aquecidas;
        totalErros += resultado.erros;
        
        // Criar log específico para este bot
        let logBotEspecifico = `🔥 **AQUECIMENTO ${botInfo.nome.toUpperCase()}**\n📅 ${timestamp}\n\n`;
        logBotEspecifico += `📊 **Resultados:**\n`;
        logBotEspecifico += `✅ Mídias aquecidas: ${resultado.aquecidas}\n`;
        logBotEspecifico += `❌ Erros: ${resultado.erros}\n`;
        logBotEspecifico += `⏱️ Tempo: ${botTempoTotal}ms\n`;
        
        if (resultado.detalhes) {
          logBotEspecifico += `\n📋 **Detalhes:**\n${resultado.detalhes}\n`;
        }
        
        logBotEspecifico += `\n🔄 Próximo aquecimento: ${new Date(Date.now() + 30 * 60 * 1000).toLocaleTimeString('pt-BR')}`;
        
        // Enviar log específico para o canal do bot
        await enviarLogParaChatTeste(logBotEspecifico, resultado.erros > 0 ? 'erro' : 'sucesso', botInfo.id);
        
        console.log(`✅ ${botInfo.nome}: ${resultado.aquecidas} aquecidas, ${resultado.erros} erros em ${botTempoTotal}ms`);
        
        // 🚀 DELAY ANTI-429: Aguardar 1 minuto antes do próximo bot (exceto o último)
        if (i < bots.length - 1) {
          const delayMinutos = 1;
          const proximoBot = bots[i + 1].nome;
          console.log(`⏳ PRÉ-AQUECIMENTO: Aguardando ${delayMinutos} minuto antes de processar ${proximoBot}...`);
          await new Promise(resolve => setTimeout(resolve, delayMinutos * 60 * 1000));
        }
        
      } else {
        console.log(`⚠️ ${botInfo.nome}: não disponível para aquecimento`);
      }
    }
    
    const tempoTotal = Date.now() - startTime;
    const tempoMinutos = Math.round(tempoTotal / 1000 / 60);
    console.log(`🔥 PRÉ-AQUECIMENTO CONCLUÍDO: ${totalAquecidas} mídias aquecidas, ${totalErros} erros em ${tempoTotal}ms (~${tempoMinutos} min)`);
    
    // Registrar atividade no monitor de uptime
    const uptimeMonitor = getUptimeMonitor();
    uptimeMonitor.recordActivity();
    
  } catch (error) {
    console.error('❌ PRÉ-AQUECIMENTO: Erro durante execução:', error.message);
    
    // Enviar log de erro para todos os canais
    const errorMessage = `❌ **ERRO NO PRÉ-AQUECIMENTO GERAL**\n📅 ${timestamp}\n\n🚨 **Erro**: ${error.message}\n\n⚠️ Sistema tentará novamente em 30 minutos`;
    await enviarLogParaChatTeste(errorMessage, 'erro');
  }
}

/**
 * 🔍 SCANNER DINÂMICO: Descobre TODAS as mídias disponíveis de um bot automaticamente
 */
function descobrirMidiasDinamicamente(botInstance, botId) {
  console.log(`🔍 PRÉ-AQUECIMENTO: ${botId} - Iniciando scanner dinâmico de mídias...`);
  
  const midiasEncontradas = [];
  const baseDir = botInstance.gerenciadorMidia.baseDir;
  
  try {
    // 🎯 ETAPA 1: ESCANEAR FISICAMENTE as pastas de mídia
    const midiasEscaneadas = escanearMidiasFisicamente(baseDir, botId);
    
    // 🎯 ETAPA 2: ANALISAR CONFIG do bot para mapear tipos
    const config = botInstance.config || {};
    const midiasConfig = analisarConfigMidias(config, botId);
    
    // 🎯 ETAPA 3: COMBINAR dados físicos + config para criar lista completa
    const midiasFinais = combinarMidiasEscaneadasComConfig(midiasEscaneadas, midiasConfig, baseDir);
    
    console.log(`🔍 PRÉ-AQUECIMENTO: ${botId} - Scanner encontrou ${midiasFinais.length} mídias`);
    console.log(`   📁 Mídias físicas: ${midiasEscaneadas.length}`);
    console.log(`   ⚙️ Mídias no config: ${Object.keys(midiasConfig).length}`);
    console.log(`   ✅ Mídias finais: ${midiasFinais.map(m => `${m.key}(${m.tipoMidia})`).join(', ')}`);
    
    return midiasFinais;
    
  } catch (error) {
    console.error(`❌ PRÉ-AQUECIMENTO: Erro no scanner dinâmico do ${botId}:`, error.message);
    return [];
  }
}

/**
 * 📁 ESCANEAR FISICAMENTE: Varre todas as pastas de mídia procurando arquivos
 */
function escanearMidiasFisicamente(baseDir, botId) {
  const midiasEscaneadas = [];
  const pastaMidia = path.resolve(baseDir, './midia');
  
  if (!fs.existsSync(pastaMidia)) {
    console.log(`⚠️ PRÉ-AQUECIMENTO: ${botId} - Pasta de mídia não encontrada: ${pastaMidia}`);
    return midiasEscaneadas;
  }
  
  try {
    // 🎬 ESCANEAR MÍDIAS INICIAIS na pasta raiz
    const arquivosRaiz = fs.readdirSync(pastaMidia);
    arquivosRaiz.forEach(arquivo => {
      const caminhoCompleto = path.join(pastaMidia, arquivo);
      const stats = fs.statSync(caminhoCompleto);
      
      if (stats.isFile()) {
        const extensao = path.extname(arquivo).toLowerCase();
        const nome = path.basename(arquivo, extensao);
        
        // Detectar tipo de mídia pela extensão
        let tipoMidia = null;
        if (['.mp4', '.avi', '.mov', '.mkv'].includes(extensao)) tipoMidia = 'video';
        else if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(extensao)) tipoMidia = 'imagem';
        else if (['.mp3', '.wav', '.ogg', '.m4a'].includes(extensao)) tipoMidia = 'audio';
        
        if (tipoMidia && nome.startsWith('inicial')) {
          midiasEscaneadas.push({
            tipo: 'inicial',
            key: 'inicial',
            tipoMidia: tipoMidia,
            arquivo: arquivo,
            caminho: `./midia/${arquivo}`,
            caminhoCompleto: caminhoCompleto,
            origem: 'escaneamento_fisico'
          });
        }
      }
    });
    
    // 🎯 ESCANEAR DOWNSELLS na pasta downsells
    const pastaDownsells = path.join(pastaMidia, 'downsells');
    if (fs.existsSync(pastaDownsells)) {
      const arquivosDownsells = fs.readdirSync(pastaDownsells);
      
      arquivosDownsells.forEach(arquivo => {
        const caminhoCompleto = path.join(pastaDownsells, arquivo);
        const stats = fs.statSync(caminhoCompleto);
        
        if (stats.isFile()) {
          const extensao = path.extname(arquivo).toLowerCase();
          const nome = path.basename(arquivo, extensao);
          
          // Detectar downsells (ds1, ds2, ds10, etc.)
          const matchDownsell = nome.match(/^ds(\d+)$/i);
          if (matchDownsell) {
            let tipoMidia = null;
            if (['.mp4', '.avi', '.mov', '.mkv'].includes(extensao)) tipoMidia = 'video';
            else if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(extensao)) tipoMidia = 'imagem';
            else if (['.mp3', '.wav', '.ogg', '.m4a'].includes(extensao)) tipoMidia = 'audio';
            
            if (tipoMidia) {
              midiasEscaneadas.push({
                tipo: 'downsell',
                key: nome.toLowerCase(), // ds1, ds2, etc.
                tipoMidia: tipoMidia,
                arquivo: arquivo,
                caminho: `./midia/downsells/${arquivo}`,
                caminhoCompleto: caminhoCompleto,
                origem: 'escaneamento_fisico'
              });
            }
          }
        }
      });
    }
    
    // 📊 ESCANEAR OUTRAS PASTAS (mensagens periódicas, etc.)
    const outrasPassas = ['08.mp4', '11.mp4', '18.mp4', '20.mp4', '23.mp4'];
    outrasPassas.forEach(arquivo => {
      const caminhoCompleto = path.join(pastaMidia, arquivo);
      if (fs.existsSync(caminhoCompleto)) {
        const nome = path.basename(arquivo, path.extname(arquivo));
        midiasEscaneadas.push({
          tipo: 'periodica',
          key: nome,
          tipoMidia: 'video',
          arquivo: arquivo,
          caminho: `./midia/${arquivo}`,
          caminhoCompleto: caminhoCompleto,
          origem: 'escaneamento_fisico'
        });
      }
    });
    
  } catch (error) {
    console.error(`❌ Erro ao escanear mídias fisicamente para ${botId}:`, error.message);
  }
  
  return midiasEscaneadas;
}

/**
 * ⚙️ ANALISAR CONFIG: Extrai configurações de mídia do config do bot
 */
function analisarConfigMidias(config, botId) {
  const midiasConfig = {};
  
  try {
    // Analisar midias definidas no config
    if (config.midias) {
      // Mídia inicial
      if (config.midias.inicial) {
        midiasConfig.inicial = config.midias.inicial;
      }
      
      // Downsells
      if (config.midias.downsells) {
        Object.keys(config.midias.downsells).forEach(dsKey => {
          midiasConfig[dsKey] = config.midias.downsells[dsKey];
        });
      }
    }
    
    // Analisar mensagens periódicas
    if (config.mensagensPeriodicas && Array.isArray(config.mensagensPeriodicas)) {
      config.mensagensPeriodicas.forEach(msg => {
        if (msg.midia) {
          const nome = path.basename(msg.midia, path.extname(msg.midia));
          midiasConfig[`periodica_${nome}`] = {
            video: msg.midia
          };
        }
      });
    }
    
    // Verificar configuração específica no início
    if (config.inicio && config.inicio.midia) {
      const caminhoMidia = config.inicio.midia;
      const tipoMidia = config.inicio.tipoMidia || 'video';
      
      // Se não existe inicial no config.midias, usar o do inicio
      if (!midiasConfig.inicial) {
        midiasConfig.inicial = {
          [tipoMidia]: caminhoMidia
        };
      }
    }
    
  } catch (error) {
    console.error(`❌ Erro ao analisar config de mídias para ${botId}:`, error.message);
  }
  
  return midiasConfig;
}

/**
 * 🔗 COMBINAR: Une dados físicos + config para criar lista final
 */
function combinarMidiasEscaneadasComConfig(midiasEscaneadas, midiasConfig, baseDir) {
  const midiasFinais = [];
  const processados = new Set();
  
  // 🎯 PRIORIDADE 1: Mídias do config (configurações específicas do bot)
  Object.keys(midiasConfig).forEach(configKey => {
    const configMidia = midiasConfig[configKey];
    
    ['video', 'imagem', 'audio'].forEach(tipoMidia => {
      if (configMidia[tipoMidia]) {
        const caminhoCompleto = path.resolve(baseDir, configMidia[tipoMidia]);
        
        // Verificar se arquivo existe
        if (fs.existsSync(caminhoCompleto)) {
          const tipo = configKey === 'inicial' || configKey === 'inicial_custom' ? 'inicial' : 
                      configKey.startsWith('ds') ? 'downsell' : 
                      configKey.startsWith('periodica_') ? 'periodica' : 'outro';
          
          const key = tipo === 'inicial' ? 'inicial' : 
                     tipo === 'downsell' ? configKey : 
                     configKey;
          
          const chave = `${tipo}_${key}_${tipoMidia}`;
          
          if (!processados.has(chave)) {
            midiasFinais.push({
              tipo: tipo,
              key: key,
              tipoMidia: tipoMidia,
              arquivo: path.basename(configMidia[tipoMidia]),
              caminho: configMidia[tipoMidia],
              caminhoCompleto: caminhoCompleto,
              origem: 'config'
            });
            processados.add(chave);
          }
        }
      }
    });
  });
  
  // 🎯 PRIORIDADE 2: Mídias encontradas fisicamente que não estão no config
  midiasEscaneadas.forEach(midia => {
    const chave = `${midia.tipo}_${midia.key}_${midia.tipoMidia}`;
    if (!processados.has(chave)) {
      midiasFinais.push(midia);
      processados.add(chave);
    }
  });
  
  // 🎯 ORDENAR: inicial primeiro, depois downsells em ordem, depois outros
  midiasFinais.sort((a, b) => {
    if (a.tipo === 'inicial' && b.tipo !== 'inicial') return -1;
    if (b.tipo === 'inicial' && a.tipo !== 'inicial') return 1;
    
    if (a.tipo === 'downsell' && b.tipo === 'downsell') {
      const numA = parseInt(a.key.replace('ds', '')) || 0;
      const numB = parseInt(b.key.replace('ds', '')) || 0;
      return numA - numB;
    }
    
    return a.key.localeCompare(b.key);
  });
  
  return midiasFinais;
}

async function aquecerMidiasBot(botInstance, botId) {
  let aquecidas = 0;
  let erros = 0;
  let detalhes = '';
  
  try {
    if (!botInstance.gerenciadorMidia || !botInstance.gerenciadorMidia.botInstance) {
      console.log(`⚠️ PRÉ-AQUECIMENTO: ${botId} não está pronto para aquecimento`);
      return { aquecidas: 0, erros: 1, detalhes: 'Bot não pronto' };
    }
    
    console.log(`🔥 PRÉ-AQUECIMENTO: Aquecendo mídias do ${botId}...`);
    
    // 🚀 DESCOBRIR DINAMICAMENTE as mídias deste bot específico
    const midiasEncontradas = descobrirMidiasDinamicamente(botInstance, botId);
    
    if (midiasEncontradas.length === 0) {
      console.log(`⚠️ PRÉ-AQUECIMENTO: ${botId} - Nenhuma mídia encontrada`);
      return { aquecidas: 0, erros: 0, detalhes: 'Nenhuma mídia encontrada' };
    }
    
    const processadas = [];
    
    // Priorizar mídia inicial primeiro
    const midiaInicial = midiasEncontradas.filter(m => m.tipo === 'inicial');
    const midiasDownsell = midiasEncontradas.filter(m => m.tipo === 'downsell');
    
    // Processar mídia inicial primeiro
    for (const midia of midiaInicial) {
      try {
        const resultado = await aquecerMidiaEspecifica(botInstance, midia, botId);
        if (resultado && resultado.sucesso) {
          aquecidas++;
          processadas.push(`✅ ${botId}:${midia.key}(${midia.tipoMidia})`);
        } else if (resultado && !resultado.sucesso) {
          // Erro real de aquecimento
          processadas.push(`❌ ${botId}:${midia.key}(${midia.tipoMidia})`);
          erros++;
        }
        // Se resultado === null, arquivo não existe (não logar)
        
        // 🚀 DELAY ANTI-429: Delay maior entre mídias individuais
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 segundos
        
      } catch (error) {
        console.error(`❌ PRÉ-AQUECIMENTO: Erro real ao aquecer ${midia.key} do ${botId}:`, error.message);
        processadas.push(`❌ ${botId}:${midia.key}(ERRO:${error.message.substring(0, 20)})`);
        erros++;
      }
    }
    
    // Processar downsells (limitar aos 10 primeiros para não sobrecarregar)
    const downsellsLimitados = midiasDownsell.slice(0, 10);
    for (const midia of downsellsLimitados) {
      try {
        const resultado = await aquecerMidiaEspecifica(botInstance, midia, botId);
        if (resultado && resultado.sucesso) {
          aquecidas++;
          processadas.push(`✅ ${botId}:${midia.key}(${midia.tipoMidia})`);
        } else if (resultado && !resultado.sucesso) {
          // Erro real de aquecimento
          processadas.push(`❌ ${botId}:${midia.key}(${midia.tipoMidia})`);
          erros++;
        }
        // Se resultado === null, arquivo não existe (não logar)
        
        // 🚀 DELAY ANTI-429: Delay maior entre mídias individuais
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 segundos
        
      } catch (error) {
        console.error(`❌ PRÉ-AQUECIMENTO: Erro real ao aquecer ${midia.key} do ${botId}:`, error.message);
        processadas.push(`❌ ${botId}:${midia.key}(ERRO:${error.message.substring(0, 20)})`);
        erros++;
      }
    }
    
    detalhes = processadas.join(', ');
    
  } catch (error) {
    console.error(`❌ PRÉ-AQUECIMENTO: Erro geral no ${botId}:`, error.message);
    erros++;
    detalhes = `Erro geral: ${error.message}`;
  }
  
  return { aquecidas, erros, detalhes };
}

// 🚀 SISTEMA POR BOT: Enviar logs para canal específico de cada bot
async function enviarLogParaChatTeste(message, tipo = 'info', botEspecifico = null) {
  try {
    // Se bot específico foi informado, enviar apenas para ele
    if (botEspecifico) {
      await enviarLogParaBotEspecifico(botEspecifico, message, tipo);
      return;
    }
    
    // Caso contrário, enviar para todos os bots ativos (comportamento anterior para compatibilidade)
    const bots = [
      { id: 'bot1', instance: global.bot1, chatVar: 'TEST_CHAT_ID_BOT1' },
      { id: 'bot2', instance: global.bot2, chatVar: 'TEST_CHAT_ID_BOT2' },
      { id: 'bot_especial', instance: global.botEspecial, chatVar: 'TEST_CHAT_ID_BOT_ESPECIAL' }
    ];
    
    for (const botInfo of bots) {
      if (botInfo.instance && botInfo.instance.bot) {
        await enviarLogParaBotEspecifico(botInfo.id, message, tipo);
      }
    }
    
  } catch (error) {
    console.error('❌ Erro geral ao enviar logs:', error.message);
  }
}

// 🚀 FUNÇÃO AUXILIAR: Enviar log para bot específico
async function enviarLogParaBotEspecifico(botId, message, tipo = 'info') {
  try {
    // Determinar qual bot e chat usar
    let botInstance = null;
    let testChatId = null;
    let botName = '';
    
    switch (botId) {
      case 'bot1':
        botInstance = global.bot1?.bot;
        testChatId = process.env.TEST_CHAT_ID_BOT1 || process.env.TEST_CHAT_ID;
        botName = 'BOT1';
        break;
      case 'bot2':
        botInstance = global.bot2?.bot;
        testChatId = process.env.TEST_CHAT_ID_BOT2 || process.env.TEST_CHAT_ID;
        botName = 'BOT2';
        break;
      case 'bot_especial':
        botInstance = global.botEspecial?.bot;
        testChatId = process.env.TEST_CHAT_ID_BOT_ESPECIAL || process.env.TEST_CHAT_ID;
        botName = 'BOT ESPECIAL';
        break;
      default:
        console.warn(`⚠️ Bot ID inválido: ${botId}`);
        return;
    }
    
    if (!botInstance) {
      console.warn(`⚠️ ${botName} não disponível para enviar log`);
      return;
    }
    
    if (!testChatId) {
      console.warn(`⚠️ Chat ID não configurado para ${botName} (variável: TEST_CHAT_ID_${botId.toUpperCase()})`);
      return;
    }
    
    // Adicionar emoji baseado no tipo
    let emoji = '📊';
    if (tipo === 'sucesso') emoji = '✅';
    if (tipo === 'erro') emoji = '❌';
    if (tipo === 'info') emoji = 'ℹ️';
    
    // Adicionar identificação do bot na mensagem
    const finalMessage = `${emoji} **LOG DO ${botName}**\n\n${message}`;
    
    await botInstance.sendMessage(testChatId, finalMessage, { 
      parse_mode: 'Markdown',
      disable_notification: true // Não fazer barulho
    });
    
    console.log(`📤 Log do ${botName} enviado para chat: ${testChatId}`);
    
  } catch (error) {
    console.error(`❌ Erro ao enviar log do ${botId}:`, error.message);
  }
}

// 🚀 SISTEMA CENTRALIZADO: Log de métricas de todas as instâncias
async function logMetricasTodasInstancias() {
  console.log('📊 MÉTRICAS CENTRALIZADAS: Coletando dados de performance...');
  
  const timestamp = new Date().toLocaleString('pt-BR', { 
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  let logMessage = `📊 **RELATÓRIO DE MÉTRICAS**\n📅 ${timestamp}\n\n`;
  
  const instancias = [
    { id: 'bot1', instance: global.bot1 },
    { id: 'bot2', instance: global.bot2 },
    { id: 'bot_especial', instance: global.botEspecial }
  ];
  
  instancias.forEach(({ id, instance }) => {
    if (instance && instance.gerenciadorMidia) {
      const relatorio = instance.gerenciadorMidia.obterRelatorioPerformance();
      logMessage += `🤖 **${id.toUpperCase()}**:\n`;
      logMessage += `   • Pools ativos: ${relatorio.poolsAtivos}\n`;
      logMessage += `   • File IDs: ${relatorio.totalPreAquecidos}\n`;
      logMessage += `   • Taxa cache: ${relatorio.taxaCache}\n`;
      logMessage += `   • Tempo médio: ${relatorio.tempoMedioMs}ms\n`;
      logMessage += `   • Eficiência: ${relatorio.eficiencia}\n\n`;
      
      console.log(`📊 MÉTRICAS ${id.toUpperCase()}:`);
      if (instance.logMetricasPerformance) {
        instance.logMetricasPerformance();
      }
    }
  });
  
  // 🚫 REMOVIDO: Não enviar métricas para todos os chats (evitar spam)
  // await enviarLogParaChatTeste(logMessage, 'info');
  console.log('📊 MÉTRICAS: Relatório coletado (não enviado para evitar spam nos chats)');
}

// 🚀 SISTEMA CENTRALIZADO: Validação de pools de todas as instâncias
async function validarPoolsTodasInstancias() {
  console.log('🔍 VALIDAÇÃO CENTRALIZADA: Verificando pools de file_ids...');
  
  const timestamp = new Date().toLocaleString('pt-BR', { 
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  let logMessage = `🔍 **VALIDAÇÃO DE POOLS**\n📅 ${timestamp}\n\n`;
  let totalValidacoes = 0;
  let totalErros = 0;
  
  const instancias = [
    { id: 'bot1', instance: global.bot1 },
    { id: 'bot2', instance: global.bot2 },
    { id: 'bot_especial', instance: global.botEspecial }
  ];
  
  for (const { id, instance } of instancias) {
    if (instance && instance.gerenciadorMidia && instance.gerenciadorMidia.validarELimparFileIds) {
      try {
        console.log(`🔍 Validando pools do ${id}...`);
        await instance.gerenciadorMidia.validarELimparFileIds();
        logMessage += `🤖 **${id.toUpperCase()}**: ✅ Validado com sucesso\n`;
        totalValidacoes++;
      } catch (error) {
        console.error(`❌ Erro na validação do ${id}:`, error.message);
        logMessage += `🤖 **${id.toUpperCase()}**: ❌ Erro - ${error.message}\n`;
        totalErros++;
      }
    }
  }
  
  logMessage += `\n📊 **RESUMO**: ${totalValidacoes} validações, ${totalErros} erros\n`;
  logMessage += `🔄 Próxima validação: ${new Date(Date.now() + 2 * 60 * 60 * 1000).toLocaleTimeString('pt-BR')}`;
  
  // 🚫 REMOVIDO: Não enviar validação para todos os chats (evitar spam)
  // await enviarLogParaChatTeste(logMessage, totalErros > 0 ? 'erro' : 'sucesso');
  console.log('🔍 VALIDAÇÃO: Verificação concluída (não enviada para evitar spam nos chats)');
}

/**
 * 🔥 AQUECIMENTO DINÂMICO: Aquece uma mídia específica usando estrutura dinâmica
 */
async function aquecerMidiaEspecifica(botInstance, midiaInfo, botId) {
  try {
    const gerenciador = botInstance.gerenciadorMidia;
    const { tipo, key, tipoMidia, caminho, caminhoCompleto, origem } = midiaInfo;
    
    // Verificar se já existe pool ativo e com file_ids suficientes
    const poolAtual = gerenciador.fileIdPool.get(caminho);
    if (poolAtual && poolAtual.length >= 2) {
      console.log(`💾 PRÉ-AQUECIMENTO: ${botId} - ${key}(${tipoMidia}) já aquecida (${poolAtual.length} file_ids) [${origem}]`);
      return { sucesso: true, jaAquecida: true };
    }
    
    // Verificar se arquivo existe fisicamente
    if (!fs.existsSync(caminhoCompleto)) {
      console.log(`⚠️ PRÉ-AQUECIMENTO: ${botId} - ${key}(${tipoMidia}) arquivo não encontrado: ${caminhoCompleto}`);
      return { sucesso: false, erro: 'arquivo_nao_encontrado' };
    }
    
    // Aquecer a mídia
    console.log(`🔥 PRÉ-AQUECIMENTO: ${botId} - Aquecendo ${key}(${tipoMidia}) [${origem}]...`);
    
    try {
      await gerenciador.criarPoolFileIds(caminho, tipoMidia);
      
      const novoPool = gerenciador.fileIdPool.get(caminho);
      if (novoPool && novoPool.length > 0) {
        console.log(`✅ PRÉ-AQUECIMENTO: ${botId} - ${key}(${tipoMidia}) aquecida (${novoPool.length} file_ids) [${origem}]`);
        return { sucesso: true, jaAquecida: false, fileIds: novoPool.length };
      } else {
        console.log(`⚠️ PRÉ-AQUECIMENTO: ${botId} - ${key}(${tipoMidia}) falhou ao criar pool [${origem}]`);
        return { sucesso: false, erro: 'falha_criar_pool' };
      }
      
    } catch (uploadError) {
      console.error(`❌ PRÉ-AQUECIMENTO: ${botId} - Erro ao aquecer ${key}(${tipoMidia}):`, uploadError.message);
      return { sucesso: false, erro: 'erro_upload', detalhes: uploadError.message };
    }
    
  } catch (error) {
    console.error(`❌ PRÉ-AQUECIMENTO: Erro específico em ${midiaInfo.key}(${midiaInfo.tipoMidia}):`, error.message);
    return { sucesso: false, erro: 'erro_geral', detalhes: error.message };
  }
}

// Iniciador do loop de downsells
function iniciarDownsellLoop() {
  // Execução imediata ao iniciar para todos os bots
  executarDownsellsTodosBots().catch(err => console.error('Erro no envio inicial de downsells:', err));
  
  downsellInterval = setInterval(async () => {
    try {
      await executarDownsellsTodosBots();
    } catch (err) {
      console.error('Erro no loop de downsells:', err);
    }
  }, 20 * 60 * 1000);
  console.log('Loop de downsells iniciado para todos os bots (executa a cada 20 minutos)');
}

// Função para executar downsells de todos os bots
async function executarDownsellsTodosBots() {
  const promises = [];
  
  for (const [botId, instancia] of bots) {
    if (instancia && typeof instancia.enviarDownsells === 'function') {
      console.log(`Executando downsells para ${botId}`);
      promises.push(
        instancia.enviarDownsells().catch(err => 
          console.error(`Erro nos downsells do ${botId}:`, err.message)
        )
      );
    }
  }
  
  if (promises.length > 0) {
    await Promise.all(promises);
  } else {
    console.warn('Nenhum bot com função enviarDownsells encontrado');
  }
}

function iniciarLimpezaTokens() {
  cron.schedule('*/20 * * * *', async () => {
    console.log('Limpando tokens expirados ou cancelados...');

    try {
      const db = sqlite.get();
      if (db) {
        // Verificar se tabela existe antes de tentar limpar
        const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='access_links'").get();
        if (tableExists) {
          const stmt = db.prepare(`
            DELETE FROM access_links
            WHERE (status IS NULL OR status = 'canceled')
              AND (enviado_pixel IS NULL OR enviado_pixel = 0)
              AND (acesso_usado IS NULL OR acesso_usado = 0)
          `);
          const info = stmt.run();
          if (info.changes > 0) {
            console.log(`SQLite: ${info.changes} tokens removidos`);
          }
        }
      }
    } catch (err) {
      // Log apenas erros relevantes
      if (!err.message.includes('no such table')) {
        console.error('❌ Erro SQLite:', err.message);
      }
    }

    if (pool) {
      try {
        const result = await pool.query(`
          DELETE FROM access_links
          WHERE (status IS NULL OR status = 'canceled')
            AND (enviado_pixel IS NULL OR enviado_pixel = false)
            AND (acesso_usado IS NULL OR acesso_usado = false)
        `);
        console.log(`PostgreSQL: ${result.rowCount} tokens removidos`);
      } catch (err) {
        console.error('❌ Erro PostgreSQL:', err.message);
      }
    }
  });
  console.log('Cron de limpeza de tokens iniciado a cada 20 minutos');
}

function iniciarLimpezaPayloadTracking() {
  cron.schedule('0 * * * *', async () => {
    console.log('Limpando registros antigos de payload_tracking...');

    try {
      const db = sqlite.get();
      if (db) {
        const stmt = db.prepare(`
          DELETE FROM payload_tracking
          WHERE datetime(created_at) <= datetime('now', '-2 hours')
        `);
        const info = stmt.run();
        console.log(`SQLite: ${info.changes} payloads removidos`);
      }
    } catch (err) {
      console.error('❌ Erro SQLite:', err.message);
    }

    if (pool) {
      try {
        const result = await pool.query(`
          DELETE FROM payload_tracking
          WHERE created_at < NOW() - INTERVAL '2 hours'
        `);
        console.log(`PostgreSQL: ${result.rowCount} payloads removidos`);
      } catch (err) {
        console.error('❌ Erro PostgreSQL:', err.message);
      }
    }
  });
  console.log('Cron de limpeza de payload_tracking iniciado a cada hora');
}

// Carregar módulos
function carregarBot() {
  try {
    const instancia1 = bot1.iniciar();
    const instancia2 = bot2.iniciar();
    const instanciaEspecial = botEspecial.iniciar();

    bots.set('bot1', instancia1);
    bots.set('bot2', instancia2);
    bots.set('bot_especial', instanciaEspecial);

    // 🚀 CORREÇÃO CRÍTICA: Definir variáveis globais para o sistema de pré-aquecimento
    global.bot1 = instancia1;
    global.bot2 = instancia2;
    global.botEspecial = instanciaEspecial;

    bot = instancia1;
    webhookPushinPay = instancia1.webhookPushinPay ? instancia1.webhookPushinPay.bind(instancia1) : null;
    // enviarDownsells agora é executado para todos os bots via executarDownsellsTodosBots()

    // 🔥 NOVO: Configurar integração do privacy após carregar bots
    setupPrivacyIntegration();

    console.log('Bots carregados com sucesso');
    console.log('🚀 Variáveis globais definidas para pré-aquecimento');
    return true;
  } catch (error) {
    console.error('Erro ao carregar bot:', error.message);
    return false;
  }
}

function carregarPostgres() {
  try {
    const postgresPath = path.join(__dirname, 'database/postgres.js');

    if (fs.existsSync(postgresPath)) {
      postgres = require('./database/postgres');
      console.log('Módulo postgres carregado');
      return true;
    }
    return false;
  } catch (error) {
    console.error('Erro ao carregar postgres:', error.message);
    return false;
  }
}

async function inicializarBanco() {
  if (!postgres) return false;

  try {
    console.log('Inicializando banco de dados...');
    pool = await postgres.initializeDatabase();
    
    if (pool) {
      databaseConnected = true;
      console.log('Banco de dados inicializado');
      return true;
    }
    return false;
  } catch (error) {
    console.error('Erro ao inicializar banco:', error.message);
    return false;
  }
}

async function carregarSistemaTokens() {
  try {
    const tokensPath = path.join(__dirname, 'MODELO1/WEB/tokens.js');
    
    if (!fs.existsSync(tokensPath)) {
      console.log('Sistema de tokens não encontrado');
      return false;
    }

    if (!pool) {
      console.error('Pool de conexões não disponível');
      return false;
    }

    // Limpar cache do módulo
    delete require.cache[require.resolve('./MODELO1/WEB/tokens')];
    
    const tokensModule = require('./MODELO1/WEB/tokens');
    
    if (typeof tokensModule === 'function') {
      const tokenSystem = tokensModule(app, pool);
      
      if (tokenSystem) {
        webModuleLoaded = true;
        console.log('Sistema de tokens carregado');
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Erro ao carregar sistema de tokens:', error.message);
    return false;
  }
}



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
    console.error('Erro na API de cobrança:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// 🎯 NOVA ROTA: Processar eventos do Kwai Event API
app.post('/api/kwai-event', async (req, res) => {
  try {
    const { clickid, eventName, properties = {} } = req.body;

    if (!clickid || !eventName) {
      return res.status(400).json({
        success: false,
        message: 'clickid e eventName são obrigatórios'
      });
    }

    console.log(`🎯 [KwaiAPI] Processando evento ${eventName} para click_id: ${clickid.substring(0, 10)}...`);

    const result = await kwaiEventAPI.sendEvent({
      clickid,
      eventName,
      properties
    });

    if (result.success) {
      res.json({
        success: true,
        message: `Evento ${eventName} enviado com sucesso`,
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        message: `Erro ao enviar evento ${eventName}`,
        error: result.error || result.reason
      });
    }

  } catch (error) {
    console.error('❌ [KwaiAPI] Erro na rota /api/kwai-event:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

// API para gerar QR code PIX para obrigado_especial
app.post('/api/gerar-qr-pix', async (req, res) => {
  try {
    // 🔥 CORREÇÃO: axios já importado no topo
    const valor = 100; // Valor fixo de R$ 100
    const valorCentavos = valor * 100; // Converter para centavos

    if (!process.env.PUSHINPAY_TOKEN) {
      return res.status(500).json({ 
        error: 'Token PushinPay não configurado' 
      });
    }

    const pushPayload = {
      value: valorCentavos,
      split_rules: [],
      metadata: {
        source: 'obrigado_especial',
        valor_reais: valor
      }
    };

    console.log('[DEBUG] Gerando QR code PIX para obrigado_especial:', pushPayload);

    const response = await axios.post(
      'https://api.pushinpay.com.br/api/pix/cashIn',
      pushPayload,
      {
        headers: {
          Authorization: `Bearer ${process.env.PUSHINPAY_TOKEN}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        }
      }
    );

    const { qr_code_base64, qr_code, id: apiId } = response.data;

    if (!qr_code_base64 || !qr_code) {
      throw new Error('QR code não retornado pela PushinPay');
    }

    console.log('[DEBUG] QR code PIX gerado com sucesso:', apiId);

    return res.json({
      success: true,
      qr_code_base64,
      qr_code,
      pix_copia_cola: qr_code,
      transacao_id: apiId,
      valor: valor
    });

  } catch (error) {
    console.error('Erro ao gerar QR code PIX:', error.message);
    
    if (error.response?.status === 429) {
      return res.status(429).json({ 
        error: 'Limite de requisições atingido. Tente novamente em alguns minutos.' 
      });
    }

    return res.status(500).json({ 
      error: 'Erro interno ao gerar QR code PIX',
      details: error.message 
    });
  }
});

// Rotas principais
// Rota raiz simplificada para health checks
app.get('/', (req, res) => {
  res.status(200).send('OK');
});

// 🔥 ROTAS DO PRIVACY---SYNC (MOVIDAS PARA CIMA - ANTES DOS ARQUIVOS ESTÁTICOS)

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
      webhook_urls: [`${BASE_URL}/bot1/webhook`, `${BASE_URL}/bot2/webhook`, `${BASE_URL}/bot_especial/webhook`],
      privacy_sync_routes: ['/links', '/privacy', '/compra-aprovada', '/redirect']
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

// 🚀 ENDPOINT OTIMIZADO PARA PING (FASE 1.5)
app.get('/ping', (req, res) => {
  // Registrar atividade para monitoramento de uptime
  const uptimeMonitor = getUptimeMonitor();
  uptimeMonitor.recordActivity();
  
  // Resposta ultra-rápida para GitHub Actions
  res.set('Cache-Control', 'no-cache');
  res.status(200).send('pong');
});

// 📊 ENDPOINT DE STATUS DE UPTIME
app.get('/uptime', (req, res) => {
  const uptimeMonitor = getUptimeMonitor();
  const stats = uptimeMonitor.getStats();
  
  res.json({
    status: 'ok',
    uptime: stats.uptimeFormatted,
    lastActivity: stats.lastActivityFormatted,
    memoryUsage: `${stats.memoryUsage}MB`,
    coldStartDetected: stats.coldStartDetected,
    startTime: new Date(stats.startTime).toISOString(),
    timestamp: new Date().toISOString()
  });
});

// 🔥 ENDPOINT DE STATUS DO PRÉ-AQUECIMENTO
app.get('/preaquecimento', (req, res) => {
  try {
    const statusBots = {};
    
    // Status do bot1
    if (global.bot1 && global.bot1.gerenciadorMidia) {
      statusBots.bot1 = obterStatusAquecimento(global.bot1);
    }
    
    // Status do bot2
    if (global.bot2 && global.bot2.gerenciadorMidia) {
      statusBots.bot2 = obterStatusAquecimento(global.bot2);
    }
    
    // Status do bot_especial
    if (global.botEspecial && global.botEspecial.gerenciadorMidia) {
      statusBots.bot_especial = obterStatusAquecimento(global.botEspecial);
    }
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      bots: statusBots
    });
    
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

function obterStatusAquecimento(botInstance) {
  const gerenciador = botInstance.gerenciadorMidia;
  const pools = {};
  let totalPools = 0;
  let totalFileIds = 0;
  
  if (gerenciador.fileIdPool) {
    for (const [key, pool] of gerenciador.fileIdPool) {
      pools[key] = {
        fileIds: pool.length,
        status: pool.length > 0 ? 'aquecida' : 'fria'
      };
      totalPools++;
      totalFileIds += pool.length;
    }
  }
  
  return {
    ready: gerenciador.botInstance ? true : false,
    totalPools,
    totalFileIds,
    pools,
    status: totalFileIds > 0 ? 'ativo' : 'inativo'
  };
}

// Rota de teste
app.get('/test', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    webhook_urls: [`${BASE_URL}/bot1/webhook`, `${BASE_URL}/bot2/webhook`, `${BASE_URL}/bot_especial/webhook`],
    bot_status: bot ? 'Inicializado' : 'Não inicializado',
    database_status: databaseConnected ? 'Conectado' : 'Desconectado',
    web_module_status: webModuleLoaded ? 'Carregado' : 'Não carregado'
  });
});

// Debug
app.get('/debug/status', (req, res) => {
  const poolStats = pool && postgres ? postgres.getPoolStats(pool) : null;
  
  res.json({
    server: {
      status: 'running',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
              env: process.env.NODE_ENV || 'production'
    },
    database: {
      connected: databaseConnected,
      pool_available: !!pool,
      pool_stats: poolStats
    },
    modules: {
      bot: !!bot,
      postgres: !!postgres,
      web: webModuleLoaded
    }
  });
});

// Endpoint para listar eventos de rastreamento
app.get('/api/eventos', async (req, res) => {
  const timestamp = new Date().toISOString();
  const requestId = crypto.randomBytes(8).toString('hex');
  
          console.log(`[${requestId}] Iniciando busca de eventos - ${timestamp}`);
  
  try {
    // Autenticação básica por token
    const authToken = req.query.token || req.headers.authorization?.replace('Bearer ', '');
    
    // Token simples para acesso ao painel (pode ser melhorado)
    const PANEL_ACCESS_TOKEN = process.env.PANEL_ACCESS_TOKEN || 'admin123';
    
    if (!authToken || authToken !== PANEL_ACCESS_TOKEN) {
      console.warn(`🔒 [${requestId}] Tentativa de acesso negada - token inválido`);
      return res.status(403).json({ erro: 'Token de acesso inválido' });
    }

    const { evento, inicio, fim, utm_campaign, limit = 100, offset = 0 } = req.query;
            console.log(`[${requestId}] Filtros aplicados:`, { evento, inicio, fim, utm_campaign, limit, offset });
    
    // Verificar se o pool está disponível
    if (!pool) {
              console.error(`[${requestId}] Pool de conexão não disponível - retornando dados simulados`);
      
      // Estrutura de fallback corrigida
      const fallbackData = [
        {
          data_evento: new Date().toISOString(),
          tipo_evento: 'Purchase',
          valor: null,
          token: null,
          utm_source: null,
          utm_medium: null,
          utm_campaign: null,
          telegram_id: null,
          status_envio: 'indisponível'
        }
      ];
      
      console.warn(`⚠️ [${requestId}] Retornando dados simulados devido à falta de conexão com banco`);
      return res.status(200).json(fallbackData);
    }
    
    // Query principal para eventos Purchase
    let query = `
      SELECT 
        COALESCE(t.criado_em, NOW()) as data_evento,
        'Purchase' as tipo_evento,
        t.valor,
        t.token,
        COALESCE(t.utm_source, td.utm_source, p.utm_source) as utm_source,
        COALESCE(t.utm_medium, td.utm_medium, p.utm_medium) as utm_medium,
        COALESCE(t.utm_campaign, td.utm_campaign, p.utm_campaign) as utm_campaign,
        -- ✅ CORREÇÃO: Cast seguro com tratamento de NULL e valores float
        CASE 
          WHEN t.telegram_id IS NULL THEN NULL
          WHEN t.telegram_id::text ~ '^[0-9]+(\.0+)?$' THEN 
            SPLIT_PART(t.telegram_id::text, '.', 1)
          ELSE t.telegram_id::text
        END as telegram_id,
        CASE 
          WHEN t.pixel_sent = true OR t.capi_sent = true OR t.cron_sent = true THEN 'enviado'
          ELSE 'pendente'
        END as status_envio,
        'tokens' as source_table
      FROM tokens t
      -- ✅ CORREÇÃO: JOIN mais seguro - converte telegram_id para comparação
      LEFT JOIN tracking_data td ON (
        CASE 
          WHEN t.telegram_id IS NULL THEN FALSE
          WHEN t.telegram_id::text ~ '^[0-9]+(\.0+)?$' THEN 
            SPLIT_PART(t.telegram_id::text, '.', 1)::bigint = td.telegram_id
          ELSE FALSE
        END
      )
      LEFT JOIN payload_tracking pt ON (
        CASE 
          WHEN t.telegram_id IS NULL THEN FALSE
          WHEN t.telegram_id::text ~ '^[0-9]+(\.0+)?$' THEN 
            SPLIT_PART(t.telegram_id::text, '.', 1)::bigint = pt.telegram_id
          ELSE FALSE
        END
      )
      LEFT JOIN payloads p ON t.token = p.payload_id
      WHERE (t.pixel_sent = true OR t.capi_sent = true OR t.cron_sent = true)
      
      UNION ALL
      
      SELECT 
        COALESCE(td.created_at, NOW()) as data_evento,
        'InitiateCheckout' as tipo_evento,
        NULL as valor,
        NULL as token,
        td.utm_source,
        td.utm_medium,
        td.utm_campaign,
        -- ✅ Conversão segura para TEXT preservando NULL
        CASE 
          WHEN td.telegram_id IS NULL THEN NULL
          ELSE td.telegram_id::text
        END as telegram_id,
        'enviado' as status_envio,
        'tracking_data' as source_table
      FROM tracking_data td
      WHERE td.created_at IS NOT NULL
      
      UNION ALL
      
      SELECT 
        COALESCE(p.created_at, NOW()) as data_evento,
        'AddToCart' as tipo_evento,
        NULL as valor,
        p.payload_id as token,
        p.utm_source,
        p.utm_medium,
        p.utm_campaign,
        NULL as telegram_id,
        'enviado' as status_envio,
        'payloads' as source_table
      FROM payloads p
      WHERE p.created_at IS NOT NULL
    `;
    
    // Envolver a query UNION em uma subquery para aplicar filtros
    query = `
      SELECT * FROM (${query}) as eventos
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    // Filtro por tipo de evento
    if (evento) {
      query += ` AND tipo_evento = $${paramIndex}`;
      params.push(evento);
      paramIndex++;
    }
    
    // Filtro por data inicial
    if (inicio) {
      query += ` AND data_evento >= $${paramIndex}`;
      params.push(inicio + ' 00:00:00');
      paramIndex++;
    }
    
    // Filtro por data final
    if (fim) {
      query += ` AND data_evento <= $${paramIndex}`;
      params.push(fim + ' 23:59:59');
      paramIndex++;
    }
    
    // Filtro por campanha
    if (utm_campaign) {
      query += ` AND utm_campaign = $${paramIndex}`;
      params.push(utm_campaign);
      paramIndex++;
    }
    
    // Ordenação e paginação
    query += ` ORDER BY data_evento DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));
    
            console.log(`[${requestId}] Executando query principal com ${params.length} parâmetros`);
    const result = await pool.query(query, params);
          console.log(`[${requestId}] Query executada com sucesso - ${result.rows.length} eventos encontrados`);
    
    // Query para estatísticas gerais  
    const statsQuery = `
      WITH eventos_combinados AS (
        SELECT 
          'Purchase' as evento,
          t.valor,
          COALESCE(t.utm_source, td.utm_source, p.utm_source) as utm_source
        FROM tokens t
        -- ✅ CORREÇÃO: JOIN mais seguro
        LEFT JOIN tracking_data td ON (
          CASE 
            WHEN t.telegram_id IS NULL THEN FALSE
            WHEN t.telegram_id::text ~ '^[0-9]+(\.0+)?$' THEN 
              SPLIT_PART(t.telegram_id::text, '.', 1)::bigint = td.telegram_id
            ELSE FALSE
          END
        )
        LEFT JOIN payload_tracking pt ON (
          CASE 
            WHEN t.telegram_id IS NULL THEN FALSE
            WHEN t.telegram_id::text ~ '^[0-9]+(\.0+)?$' THEN 
              SPLIT_PART(t.telegram_id::text, '.', 1)::bigint = pt.telegram_id
            ELSE FALSE
          END
        )
        LEFT JOIN payloads p ON t.token = p.payload_id
        WHERE (t.pixel_sent = true OR t.capi_sent = true OR t.cron_sent = true)
        
        UNION ALL
        
        SELECT 
          'InitiateCheckout' as evento,
          NULL as valor,
          td.utm_source
        FROM tracking_data td
        WHERE td.created_at IS NOT NULL
        
        UNION ALL
        
        SELECT 
          'AddToCart' as evento,
          NULL as valor,
          p.utm_source
        FROM payloads p
        WHERE p.created_at IS NOT NULL
      )
      SELECT 
        COUNT(*) as total_eventos,
        COUNT(CASE WHEN evento = 'Purchase' THEN 1 END) as total_purchases,
        COUNT(CASE WHEN evento = 'AddToCart' THEN 1 END) as total_addtocart,
        COUNT(CASE WHEN evento = 'InitiateCheckout' THEN 1 END) as total_initiatecheckout,
        COALESCE(SUM(CASE WHEN evento = 'Purchase' THEN valor ELSE 0 END), 0) as faturamento_total,
        COUNT(DISTINCT utm_source) FILTER (WHERE utm_source IS NOT NULL) as fontes_unicas
      FROM eventos_combinados
    `;
    
            console.log(`[${requestId}] Executando query de estatísticas`);
    const statsResult = await pool.query(statsQuery);
          console.log(`[${requestId}] Estatísticas calculadas com sucesso`);
    
    // Retornar dados com estrutura melhorada
    const responseData = {
      eventos: result.rows,
      estatisticas: statsResult.rows[0] || {
        total_eventos: 0,
        total_purchases: 0,
        total_addtocart: 0,
        total_initiatecheckout: 0,
        faturamento_total: 0,
        fontes_unicas: 0
      },
      metadata: {
        request_id: requestId,
        timestamp,
        total_found: result.rows.length,
        filters_applied: { evento, inicio, fim, utm_campaign },
        database_status: 'connected'
      }
    };
    
            console.log(`[${requestId}] Resposta preparada com sucesso - enviando ${result.rows.length} eventos`);
    res.status(200).json(responseData);
    
  } catch (error) {
            console.error(`[${requestId}] Erro detalhado ao buscar eventos:`, {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail,
      timestamp
    });
    
    // Estrutura de fallback em caso de erro
    const fallbackData = [
      {
        data_evento: new Date().toISOString(),
        tipo_evento: 'Purchase',
        valor: null,
        token: null,
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        telegram_id: null,
        status_envio: 'indisponível'
      }
    ];
    
    const fallbackResponse = {
      eventos: fallbackData,
      estatisticas: {
        total_eventos: 0,
        total_purchases: 0,
        total_addtocart: 0,
        total_initiatecheckout: 0,
        faturamento_total: 0,
        fontes_unicas: 0
      },
      metadata: {
        request_id: requestId,
        timestamp,
        total_found: 1,
        database_status: 'error',
        error_occurred: true,
        error_message: 'Falha na conexão com banco de dados - dados simulados'
      }
    };
    
            console.warn(`[${requestId}] Retornando dados simulados devido ao erro no banco de dados`);
    
    // Retornar status 200 com dados simulados para evitar quebra no painel
    res.status(200).json(fallbackResponse);
  }
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
      console.error('Erro não tratado:', error.message);
  res.status(500).json({
    error: 'Erro interno do servidor',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno do servidor'
  });
});

// Inicializar módulos
async function inicializarModulos() {
      console.log('Inicializando módulos...');
  
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
  iniciarLimpezaPayloadTracking();
  
  // 🚀 Iniciar sistema de pré-aquecimento periódico
  iniciarPreAquecimentoPeriodico();
  
  // Enviar log inicial para o chat de teste
  setTimeout(async () => {
    const timestamp = new Date().toLocaleString('pt-BR', { 
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    const logInicial = `🚀 **SISTEMA INICIADO**\n📅 ${timestamp}\n\n✅ Sistema de pré-aquecimento ativo\n🔄 Aquecimento: a cada 30 minutos\n📊 Métricas: a cada 30 minutos\n🔍 Validação: a cada 2 horas\n\n⚡ Primeiro aquecimento em 10 SEGUNDOS (modo teste)`;
    
    // Enviar log inicial para todos os canais
    await enviarLogParaChatTeste(logInicial, 'sucesso');
  }, 5000); // Aguardar 5 segundos para bots estarem prontos
  
      console.log('Status final dos módulos:');
      console.log(`Bot: ${bot ? 'OK' : 'ERRO'}`);
        console.log(`Banco: ${databaseConnected ? 'OK' : 'ERRO'}`);
      console.log(`Tokens: ${webModuleLoaded ? 'OK' : 'ERRO'}`);
}



// Endpoint para dados dos gráficos do dashboard
app.get('/api/dashboard-data', async (req, res) => {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const requestId = crypto.randomBytes(8).toString('hex');
  
  console.log(`📊 [${requestId}] Dashboard data request received - ${timestamp}:`, {
    query: req.query,
    headers: req.headers.authorization ? 'Bearer token present' : 'No authorization header'
  });

  try {
    // 1. VERIFICAÇÃO DO TOKEN DE ACESSO
    const authToken = req.query.token || req.headers.authorization?.replace('Bearer ', '');
    const PANEL_ACCESS_TOKEN = process.env.PANEL_ACCESS_TOKEN || 'admin123';
    
    console.log(`🔐 [${requestId}] Verificação de autenticação:`, {
      tokenReceived: authToken ? `${authToken.substring(0, 3)}***` : 'NENHUM',
      tokenExpected: `${PANEL_ACCESS_TOKEN.substring(0, 3)}***`,
      tokenMatch: authToken === PANEL_ACCESS_TOKEN,
      envVarExists: !!process.env.PANEL_ACCESS_TOKEN
    });

    if (!authToken || authToken !== PANEL_ACCESS_TOKEN) {
      console.warn(`🚫 [${requestId}] Token de acesso inválido`);
      return res.status(401).json({ 
        error: 'Token de acesso inválido',
        message: 'Acesso negado ao painel'
      });
    }

    // 2. VERIFICAÇÃO DA CONEXÃO COM O BANCO
    if (!pool) {
      console.error(`❌ [${requestId}] Pool de conexão não disponível - tentando reconectar...`);
      
      // Tentar reconectar ao banco
      try {
        if (postgres) {
          pool = await postgres.initializeDatabase();
          console.log(`🔄 [${requestId}] Reconnection attempt successful`);
        }
      } catch (reconnectError) {
        console.error(`❌ [${requestId}] Falha na reconexão:`, {
          message: reconnectError.message,
          stack: reconnectError.stack
        });
      }
      
      if (!pool) {
        console.error(`❌ [${requestId}] Pool de conexão ainda não disponível - retornando fallback`);
        const executionTime = Date.now() - startTime;
        
        const fallbackResponse = {
          faturamentoDiario: [{ 
            data: new Date().toISOString().split('T')[0], 
            faturamento: 0, 
            vendas: 0, 
            addtocart: 0, 
            initiatecheckout: 0 
          }],
          utmSource: [{ 
            utm_source: 'Direto', 
            vendas: 0, 
            addtocart: 0, 
            initiatecheckout: 0, 
            total_eventos: 0 
          }],
          campanhas: [{ 
            campanha: 'Sem Campanha', 
            vendas: 0, 
            addtocart: 0, 
            initiatecheckout: 0, 
            faturamento: 0, 
            total_eventos: 0 
          }],
          metadata: {
            request_id: requestId,
            executionTime,
            timestamp,
            database_status: 'disconnected',
            errorOccurred: true,
            error_message: 'Pool de conexão não disponível'
          }
        };
        
        console.warn(`[${requestId}] Retornando dados simulados devido à falta de conexão com banco`);
        return res.status(200).json(fallbackResponse);
      }
    }

    // 3. TESTE DE CONEXÃO BÁSICO
    try {
      await pool.query('SELECT 1 as test');
      console.log(`✅ [${requestId}] Conexão com banco confirmada`);
    } catch (connectionError) {
      console.error(`❌ [${requestId}] Erro de conexão com banco:`, {
        message: connectionError.message,
        code: connectionError.code,
        detail: connectionError.detail,
        stack: connectionError.stack
      });
      
      const executionTime = Date.now() - startTime;
      const fallbackResponse = {
        faturamentoDiario: [{ 
          data: new Date().toISOString().split('T')[0], 
          faturamento: 0, 
          vendas: 0, 
          addtocart: 0, 
          initiatecheckout: 0 
        }],
        utmSource: [{ 
          utm_source: 'Direto', 
          vendas: 0, 
          addtocart: 0, 
          initiatecheckout: 0, 
          total_eventos: 0 
        }],
        campanhas: [{ 
          campanha: 'Sem Campanha', 
          vendas: 0, 
          addtocart: 0, 
          initiatecheckout: 0, 
          faturamento: 0, 
          total_eventos: 0 
        }],
        metadata: {
          request_id: requestId,
          executionTime,
          timestamp,
          database_status: 'connection_error',
          errorOccurred: true,
          error_message: 'Falha no teste de conexão com banco de dados'
        }
      };
      
      console.warn(`⚠️ [${requestId}] Retornando dados simulados devido ao erro de conexão`);
      return res.status(200).json(fallbackResponse);
    }

    // 4. PROCESSAMENTO DOS PARÂMETROS DE DATA
    const { inicio, fim } = req.query;
    let dateFilter = '';
    const params = [];
    
    console.log(`📅 [${requestId}] Parâmetros de data recebidos:`, { inicio, fim });
    
    if (inicio && fim) {
      // Validar formato de data
      const inicioDate = new Date(inicio);
      const fimDate = new Date(fim);
      
      if (isNaN(inicioDate.getTime()) || isNaN(fimDate.getTime())) {
        console.warn(`⚠️ [${requestId}] Datas inválidas fornecidas, usando últimos 30 dias`);
        dateFilter = 'AND t.criado_em >= NOW() - INTERVAL \'30 days\'';
      } else {
        dateFilter = 'AND t.criado_em BETWEEN $1 AND $2';
        params.push(inicio + ' 00:00:00', fim + ' 23:59:59');
        console.log(`📅 [${requestId}] Filtro de data aplicado:`, { inicio: params[0], fim: params[1] });
      }
    } else {
      // Últimos 30 dias por padrão
      dateFilter = 'AND t.criado_em >= NOW() - INTERVAL \'30 days\'';
      console.log(`📅 [${requestId}] Usando filtro padrão: últimos 30 dias`);
    }
    
    // 5. QUERIES SIMPLIFICADAS PARA MELHOR PERFORMANCE
    console.log(`🔍 [${requestId}] Iniciando execução das queries...`);
    
    // Query simplificada para faturamento diário
    const faturamentoDiarioQuery = `
      SELECT 
        DATE(criado_em) as data,
        COUNT(*) as vendas,
        SUM(CASE WHEN valor IS NOT NULL THEN valor::numeric ELSE 0 END) as faturamento
      FROM tokens 
      WHERE (pixel_sent = true OR capi_sent = true OR cron_sent = true)
        AND criado_em IS NOT NULL
        ${dateFilter}
      GROUP BY DATE(criado_em)
      ORDER BY data ASC
    `;
    
    // Query simplificada para UTM sources
    const utmSourceQuery = `
      SELECT 
        COALESCE(utm_source, 'Direto') as utm_source,
        COUNT(*) as total_eventos
      FROM tokens 
      WHERE (pixel_sent = true OR capi_sent = true OR cron_sent = true)
        AND criado_em IS NOT NULL
        ${dateFilter}
      GROUP BY utm_source
      ORDER BY total_eventos DESC
      LIMIT 10
    `;
    
    // Query simplificada para campanhas
    const campanhasQuery = `
      SELECT 
        COALESCE(utm_campaign, 'Sem Campanha') as campanha,
        COUNT(*) as total_eventos,
        SUM(CASE WHEN valor IS NOT NULL THEN valor::numeric ELSE 0 END) as faturamento
      FROM tokens 
      WHERE (pixel_sent = true OR capi_sent = true OR cron_sent = true)
        AND criado_em IS NOT NULL
        ${dateFilter}
      GROUP BY utm_campaign
      ORDER BY total_eventos DESC
      LIMIT 10
    `;
    
    // 6. EXECUÇÃO DAS QUERIES COM TRATAMENTO INDIVIDUAL DE ERROS
    let faturamentoDiario, utmSource, campanhas;
    
    try {
      console.log(`📊 [${requestId}] Executando query de faturamento diário...`);
      faturamentoDiario = await pool.query(faturamentoDiarioQuery, params);
      console.log(`✅ [${requestId}] Faturamento diário: ${faturamentoDiario.rows.length} registros`);
    } catch (error) {
      console.error(`❌ [${requestId}] Erro na query de faturamento diário:`, {
        message: error.message,
        code: error.code,
        detail: error.detail,
        query: faturamentoDiarioQuery.substring(0, 200) + '...'
      });
      faturamentoDiario = { rows: [] };
    }
    
    try {
      console.log(`📊 [${requestId}] Executando query de UTM sources...`);
      utmSource = await pool.query(utmSourceQuery, params);
      console.log(`✅ [${requestId}] UTM Sources: ${utmSource.rows.length} registros`);
    } catch (error) {
      console.error(`❌ [${requestId}] Erro na query de UTM sources:`, {
        message: error.message,
        code: error.code,
        detail: error.detail,
        query: utmSourceQuery.substring(0, 200) + '...'
      });
      utmSource = { rows: [] };
    }
    
    try {
      console.log(`📊 [${requestId}] Executando query de campanhas...`);
      campanhas = await pool.query(campanhasQuery, params);
      console.log(`✅ [${requestId}] Campanhas: ${campanhas.rows.length} registros`);
    } catch (error) {
      console.error(`❌ [${requestId}] Erro na query de campanhas:`, {
        message: error.message,
        code: error.code,
        detail: error.detail,
        query: campanhasQuery.substring(0, 200) + '...'
      });
      campanhas = { rows: [] };
    }

    // 7. MONTAGEM DA RESPOSTA COM DADOS DE FALLBACK
    const today = new Date().toISOString().split('T')[0];
    
    const response = {
      faturamentoDiario: faturamentoDiario.rows.length > 0 ? faturamentoDiario.rows.map(row => ({
        data: row.data,
        faturamento: parseFloat(row.faturamento) || 0,
        vendas: parseInt(row.vendas) || 0,
        addtocart: 0, // Simplificado por enquanto
        initiatecheckout: 0 // Simplificado por enquanto
      })) : [
        {
          data: today,
          faturamento: 0,
          vendas: 0,
          addtocart: 0,
          initiatecheckout: 0
        }
      ],
      utmSource: utmSource.rows.length > 0 ? utmSource.rows.map(row => ({
        utm_source: row.utm_source || 'Direto',
        vendas: parseInt(row.total_eventos) || 0,
        addtocart: 0, // Simplificado por enquanto
        initiatecheckout: 0, // Simplificado por enquanto
        total_eventos: parseInt(row.total_eventos) || 0
      })) : [
        {
          utm_source: 'Direto',
          vendas: 0,
          addtocart: 0,
          initiatecheckout: 0,
          total_eventos: 0
        }
      ],
      campanhas: campanhas.rows.length > 0 ? campanhas.rows.map(row => ({
        campanha: row.campanha || 'Sem Campanha',
        vendas: parseInt(row.total_eventos) || 0,
        addtocart: 0, // Simplificado por enquanto
        initiatecheckout: 0, // Simplificado por enquanto
        faturamento: parseFloat(row.faturamento) || 0,
        total_eventos: parseInt(row.total_eventos) || 0
      })) : [
        {
          campanha: 'Sem Campanha',
          vendas: 0,
          addtocart: 0,
          initiatecheckout: 0,
          faturamento: 0,
          total_eventos: 0
        }
      ],
      metadata: {
        request_id: requestId,
        executionTime: Date.now() - startTime,
        timestamp,
        database_status: 'connected',
        dataRange: params.length > 0 ? { inicio: params[0], fim: params[1] } : 'últimos 30 dias',
        recordCounts: {
          faturamentoDiario: faturamentoDiario.rows.length,
          utmSource: utmSource.rows.length,
          campanhas: campanhas.rows.length
        }
      }
    };

    console.log(`✅ [${requestId}] Dashboard data response ready:`, {
      executionTime: `${Date.now() - startTime}ms`,
      faturamentoDiario: response.faturamentoDiario.length,
      utmSource: response.utmSource.length,
      campanhas: response.campanhas.length
    });
    
    res.json(response);

  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error(`❌ [${requestId}] ERRO CRÍTICO no endpoint dashboard-data:`, {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail,
      executionTime: `${executionTime}ms`,
      query: req.query,
      timestamp
    });
    
    // Retornar dados de fallback com status 200 para evitar erro no frontend
    const fallbackResponse = {
      faturamentoDiario: [{ 
        data: new Date().toISOString().split('T')[0], 
        faturamento: 0, 
        vendas: 0, 
        addtocart: 0, 
        initiatecheckout: 0 
      }],
      utmSource: [{ 
        utm_source: 'Direto', 
        vendas: 0, 
        addtocart: 0, 
        initiatecheckout: 0, 
        total_eventos: 0 
      }],
      campanhas: [{ 
        campanha: 'Sem Campanha', 
        vendas: 0, 
        addtocart: 0, 
        initiatecheckout: 0, 
        faturamento: 0, 
        total_eventos: 0 
      }],
      metadata: {
        request_id: requestId,
        executionTime,
        timestamp,
        database_status: 'critical_error',
        errorOccurred: true,
        error_message: 'Erro crítico no processamento - dados simulados'
      }
    };
    
    console.warn(`⚠️ [${requestId}] Retornando dados simulados devido ao erro crítico`);
    res.status(200).json(fallbackResponse);
  }
});

const server = app.listen(PORT, '0.0.0.0', async () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
      console.log(`🌐 URL: ${BASE_URL}`);
      console.log(`🤖 Webhook bot1: ${BASE_URL}/bot1/webhook`);
      console.log(`🤖 Webhook bot2: ${BASE_URL}/bot2/webhook`);
      console.log(`🤖 Webhook bot especial: ${BASE_URL}/bot_especial/webhook`);
      
      // 🔥 NOVO: Mostrar rotas do privacy-sync
      console.log(`📱 Página Principal: ${BASE_URL}/links`);
      console.log(`💳 Checkout Privacy: ${BASE_URL}/privacy`);
      console.log(`✅ Compra Aprovada: ${BASE_URL}/compra-aprovada`);
      console.log(`🔄 Redirecionamento: ${BASE_URL}/redirect`);
  
  // Inicializar módulos
  await inicializarModulos();
  
      console.log('✅ Servidor pronto!');
      console.log('💰 Valor do plano 1 semana atualizado para R$ 9,90 com sucesso.');
      
      // 🔥 NOVO: Mostrar informações do privacy-sync
      console.log('\n============================');
      console.log('PRIVACY---SYNC INTEGRADO');
      console.log('============================');
      const privacyConfig = getPrivacyConfig();
      console.log(`Gateway Ativo: ${privacyConfig.gateway.toUpperCase()}`);
      console.log(`Ambiente: ${privacyConfig.environment || 'production'}`);
      console.log(`Webhook URL: ${getWebhookUrl()}`);
      console.log(`Rotas Disponíveis: /links, /privacy, /compra-aprovada, /redirect`);
      console.log('============================\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 SIGTERM recebido - ignorando encerramento automático');
});

process.on('SIGINT', async () => {
  console.log('📴 Recebido SIGINT, encerrando servidor...');

  if (pool && postgres) {
    await pool.end().catch(console.error);
  }

  server.close(() => {
    console.log('Servidor fechado');
  });
});

    console.log('Servidor configurado e pronto');

// 🔥 NOVA FUNÇÃO: Processar UTMs no formato nome|id
function processUTM(utmValue) {
  if (!utmValue) return { name: null, id: null };
  
  try {
    const decoded = decodeURIComponent(utmValue);
    const parts = decoded.split('|');
    
    if (parts.length >= 2) {
      const name = parts[0].trim();
      const id = parts[1].trim();
      
      // Validar se o ID é numérico
      if (name && id && /^\d+$/.test(id)) {
        console.log(`✅ UTM processado: "${utmValue}" → nome: "${name}", id: "${id}"`);
        return { name, id };
      }
    }
    
    // Se não tem formato nome|id, retorna apenas o nome
    console.log(`ℹ️ UTM sem formato nome|id: "${utmValue}"`);
    return { name: decoded, id: null };
    
  } catch (error) {
    console.error(`❌ Erro ao processar UTM "${utmValue}":`, error.message);
    return { name: utmValue, id: null };
  }
}

// Timer sessions storage (in-memory for simplicity, could be moved to database)
const timerSessions = new Map();

// API para criar nova sessão de timer para um token
app.post('/api/criar-sessao-timer', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token não informado' });
    }

    // Verificar se o token é válido
    const resultado = await pool.query(
      'SELECT bot_id FROM tokens WHERE token = $1 AND status != $2',
      [token, 'expirado']
    );

    if (!resultado.rows.length) {
      return res.status(404).json({ success: false, error: 'Token não encontrado' });
    }

    const row = resultado.rows[0];
    
    // Apenas para bot especial
    if (row.bot_id !== 'bot_especial') {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }

    // Gerar ID único para esta sessão
    const sessionId = `${token}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Criar nova sessão de timer (10 minutos = 600 segundos)
    const startTime = Date.now();
    const endTime = startTime + (10 * 60 * 1000); // 10 minutos
    
    timerSessions.set(sessionId, {
      token: token,
      startTime: startTime,
      endTime: endTime,
      duration: 10 * 60, // 10 minutos em segundos
      active: true
    });

    res.json({
      success: true,
      sessionId: sessionId,
      startTime: startTime,
      endTime: endTime,
      duration: 10 * 60
    });

  } catch (error) {
    console.error('Erro ao criar sessão de timer:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// API para obter status de uma sessão de timer
app.get('/api/status-sessao-timer/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'ID da sessão não informado' });
    }

    const session = timerSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ success: false, error: 'Sessão não encontrada' });
    }

    const currentTime = Date.now();
    const timeRemaining = Math.max(0, Math.floor((session.endTime - currentTime) / 1000));
    const expired = timeRemaining === 0;

    res.json({
      success: true,
      sessionId: sessionId,
      token: session.token,
      timeRemaining: timeRemaining,
      expired: expired,
      active: session.active && !expired
    });

  } catch (error) {
    console.error('Erro ao obter status da sessão:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// API para enviar todas as mensagens periódicas de todos os bots
app.post('/api/enviar-todas-mensagens-periodicas', async (req, res) => {
  try {
    console.log('🚀 Iniciando envio de todas as mensagens periódicas...');
    
    const promises = [];
    
    for (const [botId, instancia] of bots) {
      if (instancia && typeof instancia.enviarTodasMensagensPeriodicas === 'function') {
        console.log(`📤 Executando envio de mensagens periódicas para ${botId}`);
        promises.push(
          instancia.enviarTodasMensagensPeriodicas().catch(err => 
            console.error(`❌ Erro no envio de mensagens periódicas do ${botId}:`, err.message)
          )
        );
      }
    }
    
    if (promises.length > 0) {
      await Promise.all(promises);
      console.log('✅ Envio de todas as mensagens periódicas concluído!');
      res.json({ 
        success: true, 
        message: 'Envio de todas as mensagens periódicas iniciado com sucesso',
        botsProcessados: promises.length
      });
    } else {
      console.warn('⚠️ Nenhum bot com função enviarTodasMensagensPeriodicas encontrado');
      res.status(404).json({ 
        success: false, 
        error: 'Nenhum bot com função enviarTodasMensagensPeriodicas encontrado' 
      });
    }
    
  } catch (error) {
    console.error('❌ Erro ao enviar todas as mensagens periódicas:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno ao enviar mensagens periódicas' 
    });
  }
});

// API para finalizar uma sessão de timer
app.post('/api/finalizar-sessao-timer', (req, res) => {
  try {
    // Suportar tanto JSON quanto FormData (para sendBeacon)
    const sessionId = req.body.sessionId || (req.body instanceof Object ? Object.keys(req.body)[0] : null);
    
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'ID da sessão não informado' });
    }

    const session = timerSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ success: false, error: 'Sessão não encontrada' });
    }

    // Marcar sessão como inativa
    session.active = false;
    timerSessions.set(sessionId, session);

    res.json({
      success: true,
      message: 'Sessão finalizada com sucesso'
    });

  } catch (error) {
    console.error('Erro ao finalizar sessão:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// Limpeza automática de sessões expiradas (executa a cada 5 minutos)
setInterval(() => {
  const currentTime = Date.now();
  for (const [sessionId, session] of timerSessions.entries()) {
    if (currentTime > session.endTime + (5 * 60 * 1000)) { // Remove sessões que expiraram há mais de 5 minutos
      timerSessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000);
