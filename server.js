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
const cookieParser = require('cookie-parser');
const cron = require('node-cron');
const crypto = require('crypto');
const facebookService = require('./services/facebook');
const { sendFacebookEvent, generateEventId, checkIfEventSent } = facebookService;
const { formatForCAPI } = require('./services/purchaseValidation');
const facebookRouter = facebookService.router;
const kwaiEventAPI = require('./services/kwaiEventAPI');
const { getInstance: getKwaiEventAPI } = kwaiEventAPI;
const protegerContraFallbacks = require('./services/protegerContraFallbacks');
const linksRoutes = require('./routes/links');
const { appendDataToSheet } = require('./services/googleSheets.js');
let lastRateLimitLog = 0;
const bot1 = require('./MODELO1/BOT/bot1');
const bot2 = require('./MODELO1/BOT/bot2');
const botEspecial = require('./MODELO1/BOT/bot_especial');
const sqlite = require('./database/sqlite');
const bots = new Map();
const initPostgres = require("./init-postgres");
initPostgres();

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

// Rotas de redirecionamento
app.use('/', linksRoutes);
app.use(facebookRouter);

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
    const { getInstance: getSessionTracking } = require('./services/sessionTracking');
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
      user_agent: bodyUa
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
      user_agent: normalizePreservingCase(bodyUa || headerUa)
    };

    if (pool) {
      try {
        await pool.query(
          `INSERT INTO payloads (payload_id, utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbp, fbc, ip, user_agent)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
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
            values.user_agent
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
    const { getInstance: getSessionTracking } = require('./services/sessionTracking');
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

    const { getInstance: getSessionTracking } = require('./services/sessionTracking');
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

// ====================================
// 🎯 SISTEMA COMPLETO DE RASTREAMENTO
// ====================================

// 📊 ROTA: Registrar UTMs capturadas
app.post('/utm', async (req, res) => {
  try {
    const utmData = req.body;
    console.log('[UTM] Dados recebidos:', utmData);
    
    // Aqui você pode salvar os UTMs no banco de dados se necessário
    // Por enquanto, apenas logamos
    
    res.status(200).json({ 
      success: true, 
      message: 'UTMs registrados com sucesso',
      data: utmData
    });
  } catch (error) {
    console.error('[UTM] Erro ao registrar UTMs:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor' 
    });
  }
});

// 🚀 ROTA: Facebook CAPI (Conversions API)
app.post('/capi', async (req, res) => {
  try {
    const FB_PIXEL_ID = process.env.FB_PIXEL_ID;
    const FB_PIXEL_TOKEN = process.env.FB_PIXEL_TOKEN;
    
    if (!FB_PIXEL_ID || !FB_PIXEL_TOKEN) {
      console.error('[CAPI] Configurações do Facebook não encontradas');
      return res.status(500).json({ 
        success: false, 
        message: 'Configurações do Facebook não encontradas' 
      });
    }

    const {
      event_name,
      event_time,
      event_source_url,
      value,
      currency = 'BRL',
      event_id,
      user_data,
      fbp,
      fbc,
      client_ip_address,
      client_user_agent
    } = req.body;

    const normalizedUserData = user_data || {
      fbp,
      fbc,
      ip_address: client_ip_address,
      user_agent: client_user_agent
    };

    // Construir payload para Facebook CAPI
    const eventData = {
      event_name,
      event_time,
      event_source_url: event_source_url || process.env.FRONTEND_URL,
      action_source: 'website',
      event_id,
      user_data: {
        client_ip_address: normalizedUserData.ip_address || req.ip,
        client_user_agent: normalizedUserData.user_agent || req.get('User-Agent'),
        fbc: normalizedUserData.fbc,
        fbp: normalizedUserData.fbp
      }
    };

    // Adicionar dados de compra se houver valor
    if (value && value > 0) {
      eventData.custom_data = {
        value: parseFloat(value),
        currency: currency
      };
    }

    // Enviar para Facebook CAPI
    const capiUrl = `https://graph.facebook.com/v18.0/${FB_PIXEL_ID}/events`;
    const capiPayload = {
      data: [eventData],
      // 🧪 CÓDIGO DE TESTE FACEBOOK: Sempre incluir TEST55446 para testes
      test_event_code: 'TEST55446'
    };

    console.log('[CAPI] Enviando evento:', event_name, capiPayload);

    const response = await fetch(capiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FB_PIXEL_TOKEN}`
      },
      body: JSON.stringify(capiPayload)
    });

    const result = await response.json();

    if (response.ok) {
      console.log('[CAPI] Evento enviado com sucesso:', result);
      res.status(200).json({ 
        success: true, 
        message: 'Evento enviado para Facebook CAPI',
        data: result
      });
    } else {
      console.error('[CAPI] Erro na resposta do Facebook:', result);
      res.status(400).json({ 
        success: false, 
        message: 'Erro ao enviar evento para Facebook',
        error: result
      });
    }

  } catch (error) {
    console.error('[CAPI] Erro interno:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor' 
    });
  }
});

// 💼 ROTA: UTMify Conversions
app.post('/utimify', async (req, res) => {
  try {
    const UTIMIFY_AD_ACCOUNT_ID = process.env.UTIMIFY_AD_ACCOUNT_ID;
    const UTIMIFY_API_TOKEN = process.env.UTIMIFY_API_TOKEN;
    
    if (!UTIMIFY_AD_ACCOUNT_ID || !UTIMIFY_API_TOKEN) {
      console.log('[UTIMIFY] Configurações não encontradas - pulando envio');
      return res.status(200).json({ 
        success: true, 
        message: 'UTMify não configurado - conversão não enviada' 
      });
    }

    const { value, currency = 'BRL', utm_data } = req.body;
    
    if (!value || value <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valor da conversão é obrigatório' 
      });
    }

    // Usar serviço existente do UTMify
    const { enviarConversaoParaUtmify } = require('./services/utmify');
    
    const conversionData = {
      payer_name: 'Cliente Privacy',
      telegram_id: 'privacy_' + Date.now(),
      transactionValueCents: Math.round(value * 100),
      trackingData: utm_data || {},
      orderId: `privacy_${Date.now()}`,
      nomeOferta: 'Privacy Checkout'
    };

    const result = await enviarConversaoParaUtmify(conversionData);
    
    console.log('[UTIMIFY] Conversão enviada com sucesso:', result);
    
    res.status(200).json({ 
      success: true, 
      message: 'Conversão enviada para UTMify',
      data: result
    });

  } catch (error) {
    console.error('[UTIMIFY] Erro ao enviar conversão:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor',
      error: error.message
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

// 🔥 NOVA ROTA: Rastrear evento 'purchase' quando usuário realiza uma compra
app.post('/api/track-purchase', async (req, res) => {
  try {
    // Extrair offerName do corpo da requisição
    const { offerName } = req.body;

    // Validar se offerName foi fornecido
    if (!offerName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Offer name is required.' 
      });
    }

    // Verificar se a variável de ambiente SPREADSHEET_ID está definida
    if (!process.env.SPREADSHEET_ID) {
      console.error('SPREADSHEET_ID não definido nas variáveis de ambiente');
      return res.status(500).json({ 
        success: false, 
        message: 'Configuração de planilha não encontrada' 
      });
    }

    // Preparar dados para inserção na planilha
    const range = 'purchase!A1';
    const values = [[new Date().toISOString().split('T')[0], 1, offerName]];

    // Chamar a função appendDataToSheet
    await appendDataToSheet(range, values);

    // Retornar sucesso
    return res.status(200).json({ 
      success: true, 
      message: 'Purchase event tracked successfully.' 
    });

  } catch (error) {
    // Log do erro no console
    console.error('Erro ao rastrear evento purchase:', error);
    
    // Retornar erro
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to track purchase event.' 
    });
  }
});

// 🎯 NOVA ROTA: Armazenar click ID do Kwai
app.post('/api/kwai-click-id', async (req, res) => {
  try {
    const { telegram_id, click_id } = req.body;

    if (!telegram_id || !click_id) {
      return res.status(400).json({
        success: false,
        message: 'telegram_id e click_id são obrigatórios'
      });
    }

    const kwaiAPI = getKwaiEventAPI();
    const stored = kwaiAPI.storeKwaiClickId(telegram_id, click_id);

    if (stored) {
      return res.status(200).json({
        success: true,
        message: 'Click ID do Kwai armazenado com sucesso'
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Erro ao armazenar click ID do Kwai'
      });
    }

  } catch (error) {
    console.error('Erro ao armazenar click ID do Kwai:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// 🎯 NOVA ROTA: API para envio de eventos Kwai
app.post('/api/kwai-event', async (req, res) => {
  try {
    const { eventName, clickid, properties, telegramId } = req.body;

    // Validações básicas
    if (!eventName) {
      return res.status(400).json({
        success: false,
        error: 'eventName é obrigatório'
      });
    }

    // Se não tem clickid nem telegramId, tentar extrair de headers/cookies
    let finalClickid = clickid;
    let finalTelegramId = telegramId;

    if (!finalClickid && !finalTelegramId) {
      // Tentar obter dados de tracking da sessão atual
      const userAgent = req.headers['user-agent'];
      const sessionData = req.session || {};
      
      console.log('🎯 [KWAI-API] Tentando detectar clickid/telegramId automaticamente');
    }

    const kwaiAPI = getKwaiEventAPI();
    
    // Verificar se o serviço está configurado
    if (!kwaiAPI.isConfigured()) {
      console.warn('⚠️ [KWAI-API] Serviço não configurado');
      return res.status(200).json({
        success: false,
        error: 'Serviço Kwai não configurado (KWAI_ACCESS_TOKEN ou KWAI_PIXEL_ID ausentes)',
        configured: false
      });
    }

    console.log(`🎯 [KWAI-API] Recebendo evento: ${eventName}`, {
      hasClickid: !!finalClickid,
      hasTelegramId: !!finalTelegramId,
      properties: properties || {}
    });

    // Enviar evento
    const result = await kwaiAPI.sendKwaiEvent(
      eventName, 
      finalClickid, 
      properties || {}, 
      finalTelegramId
    );

    // Retornar resultado
    if (result.success) {
      console.log(`✅ [KWAI-API] Evento ${eventName} processado com sucesso`);
      return res.status(200).json({
        success: true,
        message: `Evento ${eventName} enviado com sucesso`,
        kwaiResponse: result.response,
        clickid: result.clickid ? result.clickid.substring(0, 20) + '...' : null
      });
    } else {
      console.error(`❌ [KWAI-API] Erro ao processar evento ${eventName}:`, result.error);
      return res.status(400).json({
        success: false,
        error: result.error,
        eventName: result.eventName,
        clickid: result.clickid ? result.clickid.substring(0, 20) + '...' : null
      });
    }

  } catch (error) {
    console.error('❌ [KWAI-API] Erro interno:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// 🎯 NOVA ROTA: Configurações do Kwai para o frontend
app.get('/api/kwai-config', (req, res) => {
  try {
    const kwaiAPI = getKwaiEventAPI();
    const config = kwaiAPI.getConfig();
    
    res.status(200).json({
      success: true,
      config: config,
      endpoints: {
        sendEvent: '/api/kwai-event',
        storeClickId: '/api/kwai-click-id'
      }
    });
  } catch (error) {
    console.error('Erro ao obter configurações do Kwai:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
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
        
        // 🔥 NOVO: Chamar API de tracking para registrar a compra na planilha
        try {
          const axios = require('axios');
          await axios.post('http://localhost:3000/api/track-purchase', {
            offerName: transaction.nome_oferta || 'Oferta Desconhecida'
          });
          console.log('✅ Evento de purchase registrado na planilha com sucesso');
        } catch (error) {
          console.error('Falha ao registrar o evento de purchase na planilha:', error.message);
          // A falha no registro da planilha não deve impedir o restante do processamento
        }

        // 🔥 DISPARAR EVENTO PURCHASE DO FACEBOOK PIXEL
        try {
          const { sendFacebookEvent } = require('./services/facebook');
          
          const purchaseValue = payment.value ? payment.value / 100 : transaction.valor || 0;
          const planName = transaction.nome_oferta || payment.metadata?.plano_nome || 'Plano Privacy';
          
          await sendFacebookEvent({
            event_name: 'Purchase',
            value: purchaseValue,
            currency: 'BRL',
            event_id: `purchase_${normalizedId}_${Date.now()}`,
            event_source_url: 'https://ohvips.xyz/checkout/',
            custom_data: {
              content_name: planName,
              content_category: 'Privacy Checkout',
              transaction_id: normalizedId
            },
            // Tentar recuperar dados de tracking se disponíveis
            fbp: transaction.fbp,
            fbc: transaction.fbc,
            client_ip_address: transaction.ip,
            client_user_agent: transaction.user_agent,
            source: 'webhook',
            token: transaction.token
          });
          
          console.log(`✅ Evento Purchase enviado via Pixel/CAPI - Valor: R$ ${purchaseValue} - Plano: ${planName}`);
        } catch (error) {
          console.error('❌ Erro ao enviar evento Purchase:', error.message);
        }

        // 🎯 NOVO: Enviar evento Purchase via Kwai Event API
        try {
          const kwaiAPI = getKwaiEventAPI();
          
          if (kwaiAPI.isConfigured()) {
            const purchaseValue = payment.value ? payment.value / 100 : transaction.valor || 0;
            const planName = transaction.nome_oferta || payment.metadata?.plano_nome || 'Plano Privacy';
            
            const kwaiResult = await kwaiAPI.sendPurchaseEvent(
              transaction.telegram_id || transaction.token,
              {
                content_id: transaction.nome_oferta || 'plano_privacy',
                content_name: planName,
                value: purchaseValue,
                currency: 'BRL'
              },
              transaction.kwai_click_id // Click ID do Kwai se disponível
            );
            
            if (kwaiResult.success) {
              console.log(`✅ Evento Purchase enviado via Kwai Event API - Valor: R$ ${purchaseValue} - Plano: ${planName}`);
            } else {
              console.error('❌ Erro ao enviar evento Purchase via Kwai:', kwaiResult.error);
            }
          } else {
            console.log('ℹ️ Kwai Event API não configurado, pulando envio');
          }
        } catch (error) {
          console.error('❌ Erro ao enviar evento Purchase via Kwai Event API:', error.message);
        }
        
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

// 🔥 WEBHOOK UNIFICADO: Processar notificações de pagamento (bot + site)
app.post('/webhook/pushinpay', async (req, res) => {
  const correlationId = `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Proteção contra payloads vazios
    if (!req.body || typeof req.body !== 'object') {
      console.log(`[${correlationId}] ❌ Payload inválido`);
      return res.status(400).send('Payload inválido');
    }

    // Segurança simples no webhook
    if (process.env.WEBHOOK_SECRET) {
      const auth = req.headers['authorization'];
      if (auth !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
        console.log(`[${correlationId}] ❌ Autorização inválida`);
        return res.sendStatus(403);
      }
    }

    const payment = req.body;
    const { status } = payment || {};
    const idBruto = payment.id || payment.token || payment.transaction_id || null;
    const normalizedId = idBruto ? idBruto.toLowerCase().trim() : null;

    console.log(`[${correlationId}] 🔔 Webhook PushinPay recebido`);
    console.log(`[${correlationId}] Payload:`, JSON.stringify(payment, null, 2));
    console.log(`[${correlationId}] Headers:`, req.headers);
    console.log(`[${correlationId}] ID normalizado:`, normalizedId);
    console.log(`[${correlationId}] Status:`, status);

    // Verificar se o pagamento foi aprovado
    if (normalizedId && ['paid', 'approved', 'pago'].includes(status)) {
      console.log(`[${correlationId}] ✅ Pagamento aprovado, processando...`);
      
      // Buscar transação no banco de dados
      let transaction = null;
      
      // Tentar SQLite primeiro
      const db = sqlite.get();
      if (db) {
        transaction = db.prepare('SELECT * FROM tokens WHERE LOWER(id_transacao) = ?').get(normalizedId);
        console.log(`[${correlationId}] 🔍 Busca no SQLite:`, transaction ? 'Encontrada' : 'Não encontrada');
      }
      
      // Se não encontrou no SQLite, tentar PostgreSQL
      if (!transaction && pool) {
        try {
          const result = await pool.query('SELECT * FROM tokens WHERE LOWER(id_transacao) = LOWER($1)', [normalizedId]);
          if (result.rows.length > 0) {
            transaction = result.rows[0];
            console.log(`[${correlationId}] 🔍 Busca no PostgreSQL: Encontrada`);
          }
        } catch (pgError) {
          console.error(`[${correlationId}] ❌ Erro ao buscar no PostgreSQL:`, pgError.message);
        }
      }
      
      if (transaction) {
        console.log(`[${correlationId}] ✅ Transação encontrada no banco de dados:`, {
          id: transaction.id_transacao,
          valor: transaction.valor,
          plano: transaction.nome_oferta,
          source: transaction.bot_id
        });
        
        // Extrair dados do pagamento do webhook
        const paidAt = new Date().toISOString();
        const endToEndId = payment.end_to_end_id || payment.pix_end_to_end_id || null;
        const payerName = payment.payer_name || payment.pix_payer_name || null;
        const payerNationalRegistration = payment.payer_national_registration || payment.pix_payer_national_registration || null;
        
        console.log(`[${correlationId}] 📋 Dados do pagamento extraídos:`, {
          paidAt,
          endToEndId,
          payerName,
          payerNationalRegistration
        });
        
        // Atualizar status da transação com dados completos
        if (db) {
          db.prepare(`
            UPDATE tokens SET 
              status = ?, 
              usado = ?, 
              is_paid = ?, 
              paid_at = ?, 
              end_to_end_id = ?, 
              payer_name = ?, 
              payer_national_registration = ?
            WHERE id_transacao = ?
          `).run('pago', true, true, paidAt, endToEndId, payerName, payerNationalRegistration, normalizedId);
          console.log(`[${correlationId}] ✅ Status da transação atualizado para pago (SQLite)`);
        }
        
        if (pool) {
          try {
            await pool.query(`
              UPDATE tokens SET 
                status = $1, 
                usado = $2, 
                is_paid = $3, 
                paid_at = $4, 
                end_to_end_id = $5, 
                payer_name = $6, 
                payer_national_registration = $7
              WHERE id_transacao = $8
            `, ['pago', true, true, paidAt, endToEndId, payerName, payerNationalRegistration, normalizedId]);
            console.log(`[${correlationId}] ✅ Status da transação atualizado para pago (PostgreSQL)`);
          } catch (pgError) {
            console.error(`[${correlationId}] ❌ Erro ao atualizar no PostgreSQL:`, pgError.message);
          }
        }
        
        // 🎯 NOVO: Enviar evento Purchase via Facebook CAPI
        try {
          const facebookAPI = getFacebookAPI();
          
          if (facebookAPI.isConfigured()) {
            const purchaseValue = payment.value ? payment.value / 100 : transaction.valor || 0;
            const planName = transaction.nome_oferta || payment.metadata?.plano_nome || 'Plano Privacy';
            
            const facebookResult = await facebookAPI.sendPurchaseEvent(
              transaction.telegram_id || transaction.token,
              {
                value: purchaseValue,
                currency: 'BRL',
                content_name: planName,
                content_category: 'subscription'
              },
              transaction.fbp,
              transaction.fbc,
              transaction.ip_criacao,
              transaction.user_agent_criacao
            );
            
            if (facebookResult.success) {
              console.log(`[${correlationId}] ✅ Evento Purchase enviado via Facebook CAPI - Valor: R$ ${purchaseValue} - Plano: ${planName}`);
            } else {
              console.error(`[${correlationId}] ❌ Erro ao enviar evento Purchase via Facebook:`, facebookResult.error);
            }
          } else {
            console.log(`[${correlationId}] ℹ️ Facebook CAPI não configurado, pulando envio`);
          }
        } catch (error) {
          console.error(`[${correlationId}] ❌ Erro ao enviar evento Purchase via Facebook:`, error.message);
        }

        // 🎯 NOVO: Enviar evento Purchase via Kwai Event API
        try {
          const kwaiAPI = getKwaiEventAPI();
          
          if (kwaiAPI.isConfigured()) {
            const purchaseValue = payment.value ? payment.value / 100 : transaction.valor || 0;
            const planName = transaction.nome_oferta || payment.metadata?.plano_nome || 'Plano Privacy';
            
            const kwaiResult = await kwaiAPI.sendPurchaseEvent(
              transaction.telegram_id || transaction.token,
              {
                content_id: transaction.nome_oferta || 'plano_privacy',
                content_name: planName,
                value: purchaseValue,
                currency: 'BRL'
              },
              transaction.kwai_click_id // Click ID do Kwai se disponível
            );
            
            if (kwaiResult.success) {
              console.log(`[${correlationId}] ✅ Evento Purchase enviado via Kwai Event API - Valor: R$ ${purchaseValue} - Plano: ${planName}`);
            } else {
              console.error(`[${correlationId}] ❌ Erro ao enviar evento Purchase via Kwai:`, kwaiResult.error);
            }
          } else {
            console.log(`[${correlationId}] ℹ️ Kwai Event API não configurado, pulando envio`);
          }
        } catch (error) {
          console.error(`[${correlationId}] ❌ Erro ao enviar evento Purchase via Kwai Event API:`, error.message);
        }
        
        // 🎯 NOVO: Redirecionamento para checkout web (se for transação do site)
        if (transaction.bot_id === 'checkout_web') {
          console.log(`[${correlationId}] 🔄 Transação do checkout web detectada - preparando redirecionamento`);
          
          // Aqui você pode implementar lógica adicional para notificar o frontend
          // Por exemplo, via WebSocket ou polling
          // Por enquanto, vamos apenas logar que o pagamento foi confirmado
          console.log(`[${correlationId}] ✅ Pagamento do checkout web confirmado - ID: ${normalizedId}`);
        }
        
      } else {
        console.log(`[${correlationId}] ❌ Transação não encontrada no banco de dados`);
      }
    } else {
      console.log(`[${correlationId}] ℹ️ Pagamento não aprovado ou ID inválido`);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error(`[${correlationId}] ❌ Erro no webhook:`, err.message);
    return res.sendStatus(500);
  }
});

// 🔥 ENDPOINT: Verificar status do pagamento (para polling do frontend)
app.get('/api/payment-status/:transactionId', async (req, res) => {
  const correlationId = `status_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Headers para evitar cache
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  
  // CORS headers
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  
  try {
    const { transactionId } = req.params;
    
    console.log(`[${correlationId}] 🔍 Verificando status do pagamento: ${transactionId}`);
    
    let transaction = null;
    
    // Tentar SQLite primeiro
    const db = sqlite.get();
    if (db) {
      transaction = db.prepare('SELECT * FROM tokens WHERE LOWER(id_transacao) = ?').get(transactionId.toLowerCase());
      console.log(`[${correlationId}] 🔍 Busca no SQLite:`, transaction ? 'Encontrada' : 'Não encontrada');
    }
    
    // Se não encontrou no SQLite, tentar PostgreSQL
    if (!transaction && pool) {
      try {
        const result = await pool.query('SELECT * FROM tokens WHERE LOWER(id_transacao) = LOWER($1)', [transactionId]);
        if (result.rows.length > 0) {
          transaction = result.rows[0];
          console.log(`[${correlationId}] 🔍 Busca no PostgreSQL: Encontrada`);
        }
      } catch (pgError) {
        console.error(`[${correlationId}] ❌ Erro ao buscar no PostgreSQL:`, pgError.message);
      }
    }
    
    if (!transaction) {
      console.log(`[${correlationId}] ❌ Transação não encontrada`);
      return res.status(404).json({
        success: false,
        error: 'Transação não encontrada',
        transactionId: transactionId
      });
    }
    
    // Verificar se a transação não é muito antiga (mais de 5 minutos)
    const transactionTime = new Date(transaction.criado_em || transaction.event_time);
    const now = new Date();
    const timeDiffMinutes = (now - transactionTime) / (1000 * 60);
    
    if (timeDiffMinutes > 5) {
      console.log(`[${correlationId}] ⏰ Transação muito antiga (${timeDiffMinutes.toFixed(1)} min), parando busca`);
      return res.json({
        success: false,
        error: 'Transação expirada',
        transactionId: transaction.id_transacao,
        expired: true,
        age_minutes: timeDiffMinutes
      });
    }
    
    // Verificar se está pago usando múltiplos campos
    const isPaid = transaction.is_paid === true || 
                   transaction.status === 'pago' || 
                   transaction.usado === true;
    
    console.log(`[${correlationId}] 📊 Status da transação:`, {
      id: transaction.id_transacao,
      status: transaction.status,
      usado: transaction.usado,
      is_paid: transaction.is_paid,
      isPaid: isPaid,
      paid_at: transaction.paid_at,
      age_minutes: timeDiffMinutes.toFixed(1)
    });
    
    return res.json({
      success: true,
      is_paid: isPaid,
      transactionId: transaction.id_transacao,
      status: transaction.status,
      valor: transaction.valor,
      plano: transaction.nome_oferta,
      created_at: transaction.criado_em,
      paid_at: transaction.paid_at,
      end_to_end_id: transaction.end_to_end_id,
      payer_name: transaction.payer_name,
      payer_national_registration: transaction.payer_national_registration
    });
    
  } catch (error) {
    console.error(`[${correlationId}] ❌ Erro ao verificar status:`, error.message);
    return res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// 🔥 ENDPOINT: Página de obrigado para checkout web
app.get('/checkout/obrigado', (req, res) => {
  try {
    const checkoutPath = path.join(__dirname, 'checkout', 'obrigado.html');
    
    // Verificar se o arquivo existe, senão usar o index.html como fallback
    if (fs.existsSync(checkoutPath)) {
      res.sendFile(checkoutPath);
    } else {
      // Criar página de obrigado dinâmica
      const obrigadoHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pagamento Confirmado - Obrigado!</title>
    <style>
        body {
            font-family: 'Poppins', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            max-width: 500px;
            width: 90%;
        }
        .success-icon {
            font-size: 80px;
            color: #4CAF50;
            margin-bottom: 20px;
        }
        h1 {
            color: #333;
            margin-bottom: 20px;
            font-weight: 600;
        }
        p {
            color: #666;
            margin-bottom: 30px;
            line-height: 1.6;
        }
        .btn {
            background: linear-gradient(45deg, #f68d3d, #f69347);
            color: white;
            padding: 15px 30px;
            border: none;
            border-radius: 50px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            transition: transform 0.3s ease;
        }
        .btn:hover {
            transform: translateY(-2px);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon">✅</div>
        <h1>Pagamento Confirmado!</h1>
        <p>Obrigado pela sua compra! Seu pagamento foi processado com sucesso e você receberá o acesso em breve.</p>
        <a href="/privacy" class="btn">Voltar ao Início</a>
    </div>
</body>
</html>
      `;
      res.send(obrigadoHtml);
    }
  } catch (error) {
    console.error('Erro ao servir página de obrigado:', error);
    res.status(500).send('Erro interno do servidor');
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

// Variáveis de controle
let bot, webhookPushinPay, enviarDownsells;
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
          // Pular token sem dados suficientes (log removido para manter logs limpos)
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

// Iniciador do loop de downsells
function iniciarDownsellLoop() {
  if (!enviarDownsells) {
    console.warn('Função enviarDownsells não disponível');
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
      console.log('Loop de downsells ativo a cada 20 minutos');
}

function iniciarLimpezaTokens() {
  cron.schedule('*/20 * * * *', async () => {
    console.log('Limpando tokens expirados ou cancelados...');

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
        console.log(`SQLite: ${info.changes} tokens removidos`);
      }
    } catch (err) {
      console.error('❌ Erro SQLite:', err.message);
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

    bot = instancia1;
    webhookPushinPay = instancia1.webhookPushinPay ? instancia1.webhookPushinPay.bind(instancia1) : null;
    enviarDownsells = instancia1.enviarDownsells ? instancia1.enviarDownsells.bind(instancia1) : null;

    console.log('Bots carregados com sucesso');
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

// API para gerar QR code PIX para obrigado_especial
app.post('/api/gerar-qr-pix', async (req, res) => {
  try {
    const axios = require('axios');
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

    // 🎯 NOVO: Enviar evento InitiateCheckout via Kwai Event API
    try {
      const kwaiAPI = getKwaiEventAPI();
      
      if (kwaiAPI.isConfigured()) {
        const kwaiResult = await kwaiAPI.sendInitiateCheckoutEvent(
          req.body.telegram_id || req.body.token || 'obrigado_especial', // ID do usuário se disponível
          {
            content_id: 'obrigado_especial',
            content_name: 'Oferta Especial',
            value: valor,
            currency: 'BRL'
          },
          req.body.kwai_click_id // Click ID do Kwai se disponível
        );
        
        if (kwaiResult.success) {
          console.log(`✅ Evento InitiateCheckout enviado via Kwai Event API - Oferta Especial - Valor: R$ ${valor}`);
        } else {
          console.error('❌ Erro ao enviar evento InitiateCheckout via Kwai:', kwaiResult.error);
        }
      } else {
        console.log('ℹ️ Kwai Event API não configurado, pulando envio de InitiateCheckout');
      }
    } catch (error) {
      console.error('❌ Erro ao enviar evento InitiateCheckout via Kwai Event API:', error.message);
    }

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

// API para gerar QR code PIX para checkout web com planos específicos
app.post('/api/gerar-pix-checkout', async (req, res) => {
  try {
    const axios = require('axios');
    const { plano_id, valor } = req.body;

    if (!plano_id) {
      return res.status(400).json({
        error: 'ID do plano é obrigatório'
      });
    }

    // Definir planos disponíveis (mesmo do bot)
    const planos = {
      'plano_1_mes': { nome: '1 mês', valor: 19.90 },
      'plano_3_meses': { nome: '3 meses (30% OFF)', valor: 41.90 },
      'plano_6_meses': { nome: '6 meses (50% OFF)', valor: 59.90 }
    };

    const basePlano = planos[plano_id];
    const valorFinal = typeof valor === 'number' ? valor : basePlano?.valor;

    if (!basePlano && typeof valor !== 'number') {
      return res.status(400).json({
        error: 'Plano não encontrado'
      });
    }

    if (!valorFinal) {
      return res.status(400).json({
        error: 'Valor do plano é obrigatório'
      });
    }

    const valorCentavos = Math.round(valorFinal * 100);

    if (!process.env.PUSHINPAY_TOKEN) {
      return res.status(500).json({ 
        error: 'Token PushinPay não configurado' 
      });
    }

    const pushPayload = {
      value: valorCentavos,
      split_rules: [],
      webhook_url: `${process.env.FRONTEND_URL || 'https://ohvips.xyz'}/webhook/pushinpay`,
      metadata: {
        source: 'checkout_web',
        plano_id: plano_id,
        plano_nome: basePlano ? basePlano.nome : plano_id,
        valor_reais: valorFinal
      }
    };

    console.log('[DEBUG] Gerando QR code PIX para checkout web:', pushPayload);

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

    console.log('[DEBUG] QR code PIX gerado com sucesso para checkout:', apiId);

    // 🎯 NOVO: Salvar transação no banco de dados para webhook processar
    const correlationId = `checkout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    try {
      console.log(`[${correlationId}] 💾 Salvando transação no banco de dados...`);
      
      // Capturar dados de tracking da requisição
      const trackingData = {
        utm_source: req.body.utm_source || req.query.utm_source || null,
        utm_medium: req.body.utm_medium || req.query.utm_medium || null,
        utm_campaign: req.body.utm_campaign || req.query.utm_campaign || null,
        utm_term: req.body.utm_term || req.query.utm_term || null,
        utm_content: req.body.utm_content || req.query.utm_content || null,
        fbp: req.body.fbp || req.query.fbp || null,
        fbc: req.body.fbc || req.query.fbc || null,
        ip_criacao: req.ip || req.connection.remoteAddress || null,
        user_agent_criacao: req.get('User-Agent') || null,
        kwai_click_id: req.body.kwai_click_id || req.query.kwai_click_id || null
      };

      // Salvar no banco de dados
      const db = sqlite.get();
      if (db) {
        const insertQuery = `
          INSERT INTO tokens (
            id_transacao, token, telegram_id, valor, status, usado, bot_id, 
            utm_source, utm_medium, utm_campaign, utm_term, utm_content, 
            fbp, fbc, ip_criacao, user_agent_criacao, nome_oferta, 
            event_time, external_id_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const externalId = `checkout_web_${apiId}`;
        const crypto = require('crypto');
        const externalIdHash = crypto.createHash('sha256').update(externalId).digest('hex');
        
        // Garantir que todos os valores sejam strings válidas para SQLite
        const safeString = (val) => val !== null && val !== undefined ? String(val) : null;
        
        console.log(`[${correlationId}] 🔍 Dados para inserção:`, {
          apiId,
          valorFinal,
          trackingData,
          basePlano: basePlano ? basePlano.nome : plano_id,
          eventTime: new Date().toISOString(),
          externalIdHash
        });
        
        db.prepare(insertQuery).run(
          apiId, // id_transacao
          apiId, // token (usando o mesmo ID)
          'checkout_web', // telegram_id (identificador para checkout web)
          valorFinal, // valor
          'pendente', // status
          0, // usado
          'checkout_web', // bot_id
          safeString(trackingData.utm_source),
          safeString(trackingData.utm_medium),
          safeString(trackingData.utm_campaign),
          safeString(trackingData.utm_term),
          safeString(trackingData.utm_content),
          safeString(trackingData.fbp),
          safeString(trackingData.fbc),
          safeString(trackingData.ip_criacao),
          safeString(trackingData.user_agent_criacao),
          safeString(basePlano ? basePlano.nome : plano_id), // nome_oferta
          new Date().toISOString(), // event_time (convertido para string ISO)
          externalIdHash // external_id_hash
        );
        
        console.log(`[${correlationId}] ✅ Transação salva no banco de dados - ID: ${apiId}`);
      } else {
        console.log(`[${correlationId}] ⚠️ Banco de dados não disponível, transação não salva`);
      }
    } catch (dbError) {
      console.error(`[${correlationId}] ❌ Erro ao salvar transação no banco:`, dbError.message);
    }

    // 🎯 NOVO: Enviar evento InitiateCheckout via Kwai Event API
    try {
      const kwaiAPI = getKwaiEventAPI();
      
      if (kwaiAPI.isConfigured()) {
        const planoNome = basePlano ? basePlano.nome : plano_id;
        
        const kwaiResult = await kwaiAPI.sendInitiateCheckoutEvent(
          req.body.telegram_id || req.body.token || 'checkout_web', // ID do usuário se disponível
          {
            content_id: plano_id,
            content_name: planoNome,
            value: valorFinal,
            currency: 'BRL'
          },
          req.body.kwai_click_id // Click ID do Kwai se disponível
        );
        
        if (kwaiResult.success) {
          console.log(`✅ Evento InitiateCheckout enviado via Kwai Event API - Plano: ${planoNome} - Valor: R$ ${valorFinal}`);
        } else {
          console.error('❌ Erro ao enviar evento InitiateCheckout via Kwai:', kwaiResult.error);
        }
      } else {
        console.log('ℹ️ Kwai Event API não configurado, pulando envio de InitiateCheckout');
      }
    } catch (error) {
      console.error('❌ Erro ao enviar evento InitiateCheckout via Kwai Event API:', error.message);
    }

    return res.json({
      success: true,
      qr_code_base64,
      qr_code,
      pix_copia_cola: qr_code,
      transacao_id: apiId,
      plano: basePlano ? { nome: basePlano.nome, valor: valorFinal } : { nome: plano_id, valor: valorFinal },
      valor: valorFinal
    });

  } catch (error) {
    console.error('Erro ao gerar QR code PIX para checkout:', error.message);
    
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

// Servir assets estáticos do checkout
app.use('/checkout', express.static(path.join(__dirname, 'checkout'), {
  maxAge: '1d',
  etag: false
}));

// Rota /privacy para renderizar o checkout web
app.get('/privacy', (req, res) => {
  try {
    const checkoutPath = path.join(__dirname, 'checkout', 'index.html');
    res.sendFile(checkoutPath);
  } catch (error) {
    console.error('Erro ao servir checkout:', error);
    res.status(500).send('Erro interno do servidor');
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
      webhook_urls: [`${BASE_URL}/bot1/webhook`, `${BASE_URL}/bot2/webhook`, `${BASE_URL}/bot_especial/webhook`]
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
    // Lista de bots para aquecer (usando o Map bots)
    const botsParaAquecer = [
      { id: 'bot1', instance: bots.get('bot1'), nome: 'Bot1' },
      { id: 'bot2', instance: bots.get('bot2'), nome: 'Bot2' },
      { id: 'bot_especial', instance: bots.get('bot_especial'), nome: 'Bot Especial' }
    ];
    
    // Aquecer cada bot individualmente com delay de 1 minuto entre eles para evitar erro 429
    for (let i = 0; i < botsParaAquecer.length; i++) {
      const botInfo = botsParaAquecer[i];
      
      if (botInfo.instance && botInfo.instance.gerenciadorMidia) {
        console.log(`🔥 PRÉ-AQUECIMENTO: Processando ${botInfo.nome}...`);
        
        const botStartTime = Date.now();
        const resultado = await aquecerMidiasBot(botInfo.instance, botInfo.id);
        const botTempoTotal = Date.now() - botStartTime;
        
        if (resultado.aquecidas > 0) {
          console.log(`✅ ${botInfo.nome}: ${resultado.aquecidas} mídias aquecidas em ${botTempoTotal}ms`);
          totalAquecidas += resultado.aquecidas;
        }
        
        if (resultado.erros > 0) {
          console.log(`⚠️ ${botInfo.nome}: ${resultado.erros} erros durante aquecimento`);
          totalErros += resultado.erros;
        }
        
        console.log(`📋 ${botInfo.nome}: ${resultado.detalhes}`);
        
        // Configurar pré-aquecimento se não estiver configurado
        if (botInfo.instance && typeof botInfo.instance.configurarPreWarming === 'function') {
          try {
            botInfo.instance.configurarPreWarming();
          } catch (configError) {
            console.log(`⚠️ ${botInfo.nome}: Erro na configuração PRE-WARMING:`, configError.message);
          }
        }
        
        // 🚀 DELAY ANTI-429: Aguardar 1 minuto antes do próximo bot (exceto o último)
        if (i < botsParaAquecer.length - 1) {
          const delayMinutos = 1;
          const proximoBot = botsParaAquecer[i + 1].nome;
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
    
  } catch (error) {
    console.error('❌ PRÉ-AQUECIMENTO: Erro durante execução:', error.message);
    
    // Enviar log de erro para todos os canais
    const errorMessage = `❌ **ERRO NO PRÉ-AQUECIMENTO GERAL**\n📅 ${timestamp}\n\n🚨 **Erro**: ${error.message}\n\n⚠️ Sistema tentará novamente em 30 minutos`;
    await enviarLogParaChatTeste(errorMessage, 'erro');
  }
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
    
    // Aquecer as primeiras 5 mídias mais importantes (inicial + ds1-ds3)
    const midiasImportantes = midiasEncontradas.slice(0, 5);
    
    for (const midia of midiasImportantes) {
      try {
        const resultado = await aquecerMidiaEspecifica(botInstance.gerenciadorMidia, midia, botId);
        
        if (resultado.sucesso && !resultado.jaAquecida) {
          aquecidas++;
          processadas.push(`✅ ${botId}:${midia.key}(${midia.tipoMidia})`);
        } else if (resultado.jaAquecida) {
          processadas.push(`💾 ${botId}:${midia.key}(${midia.tipoMidia})`);
        } else {
          processadas.push(`❌ ${botId}:${midia.key}(${resultado.erro || 'erro'})`);
          erros++;
        }
        
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

function descobrirMidiasDinamicamente(botInstance, botId) {
  console.log(`🔍 PRÉ-AQUECIMENTO: ${botId} - Iniciando scanner dinâmico de mídias...`);
  
  try {
    const baseDir = botInstance.gerenciadorMidia.baseDir;
    const config = botInstance.config || {};
    
    // Mídias prioritárias para pré-aquecimento
    const midiasImportantes = [];
    
    // Verificar mídia inicial
    if (config.midias && config.midias.inicial) {
      Object.entries(config.midias.inicial).forEach(([tipo, caminho]) => {
        if (caminho && typeof caminho === 'string') {
          const caminhoCompleto = path.resolve(baseDir, caminho);
          if (fs.existsSync(caminhoCompleto)) {
            // Normalizar tipo de mídia (video2 -> video, etc.)
            let tipoNormalizado = tipo;
            if (tipo.startsWith('video')) {
              tipoNormalizado = 'video';
            } else if (tipo === 'imagem') {
              tipoNormalizado = 'imagem';
            }
            
            midiasImportantes.push({
              key: `inicial_${tipo}`,
              tipoMidia: tipoNormalizado,
              caminho,
              caminhoCompleto,
              origem: 'config'
            });
          }
        }
      });
    }
    
    // Verificar downsells importantes (ds1, ds2, ds3)
    if (config.midias && config.midias.downsells) {
      ['ds1', 'ds2', 'ds3'].forEach(dsId => {
        const downsell = config.midias.downsells[dsId];
        if (downsell) {
          Object.entries(downsell).forEach(([tipo, caminho]) => {
            if (caminho && typeof caminho === 'string') {
              const caminhoCompleto = path.resolve(baseDir, caminho);
              if (fs.existsSync(caminhoCompleto)) {
                // Normalizar tipo de mídia (video2 -> video, etc.)
                let tipoNormalizado = tipo;
                if (tipo.startsWith('video')) {
                  tipoNormalizado = 'video';
                } else if (tipo === 'imagem') {
                  tipoNormalizado = 'imagem';
                }
                
                midiasImportantes.push({
                  key: `${dsId}_${tipo}`,
                  tipoMidia: tipoNormalizado,
                  caminho,
                  caminhoCompleto,
                  origem: 'config'
                });
              }
            }
          });
        }
      });
    }
    
    console.log(`🔍 PRÉ-AQUECIMENTO: ${botId} - Scanner encontrou ${midiasImportantes.length} mídias importantes`);
    
    return midiasImportantes;
    
  } catch (error) {
    console.error(`❌ PRÉ-AQUECIMENTO: Erro no scanner dinâmico do ${botId}:`, error.message);
    return [];
  }
}

async function aquecerMidiaEspecifica(gerenciador, midiaInfo, botId) {
  const { key, tipoMidia, caminho, caminhoCompleto } = midiaInfo;
  
  try {
    // Verificar se já existe pool ativo e com file_ids suficientes
    const poolAtual = gerenciador.fileIdPool.get(caminho);
    if (poolAtual && poolAtual.length >= 2) {
      console.log(`💾 PRÉ-AQUECIMENTO: ${botId} - ${key}(${tipoMidia}) já aquecida (${poolAtual.length} file_ids)`);
      return { sucesso: true, jaAquecida: true };
    }
    
    // Verificar se arquivo existe fisicamente
    if (!fs.existsSync(caminhoCompleto)) {
      console.log(`⚠️ PRÉ-AQUECIMENTO: ${botId} - ${key}(${tipoMidia}) arquivo não encontrado: ${caminhoCompleto}`);
      return { sucesso: false, erro: 'arquivo_nao_encontrado' };
    }
    
    // Aquecer a mídia
    console.log(`🔥 PRÉ-AQUECIMENTO: ${botId} - Aquecendo ${key}(${tipoMidia})...`);
    console.log(`📁 PRÉ-AQUECIMENTO: ${botId} - Arquivo: ${caminhoCompleto}`);
    console.log(`🎯 PRÉ-AQUECIMENTO: ${botId} - Chat teste: ${gerenciador.testChatId}`);
    
    try {
      await gerenciador.criarPoolFileIds(caminho, tipoMidia);
      
      const novoPool = gerenciador.fileIdPool.get(caminho);
      if (novoPool && novoPool.length > 0) {
        console.log(`✅ PRÉ-AQUECIMENTO: ${botId} - ${key}(${tipoMidia}) aquecida (${novoPool.length} file_ids)`);
        return { sucesso: true, jaAquecida: false, fileIds: novoPool.length };
      } else {
        console.log(`⚠️ PRÉ-AQUECIMENTO: ${botId} - ${key}(${tipoMidia}) falhou ao criar pool (pool vazio após criação)`);
        console.log(`🔍 PRÉ-AQUECIMENTO: ${botId} - Debug: botInstance=${!!gerenciador.botInstance}, testChatId=${gerenciador.testChatId}`);
        return { sucesso: false, erro: 'falha_criar_pool' };
      }
    } catch (criarPoolError) {
      console.error(`❌ PRÉ-AQUECIMENTO: ${botId} - Erro específico ao criar pool para ${key}:`, criarPoolError.message);
      return { sucesso: false, erro: `pool_error: ${criarPoolError.message}` };
    }
    
  } catch (uploadError) {
    console.error(`❌ PRÉ-AQUECIMENTO: ${botId} - Erro ao aquecer ${key}(${tipoMidia}):`, uploadError.message);
    return { sucesso: false, erro: uploadError.message };
  }
}

async function enviarLogParaChatTeste(message, tipo = 'info') {
  try {
    const botsParaLog = [
      { id: 'bot1', instance: bots.get('bot1'), chatVar: 'TEST_CHAT_ID_BOT1' },
      { id: 'bot2', instance: bots.get('bot2'), chatVar: 'TEST_CHAT_ID_BOT2' },
      { id: 'bot_especial', instance: bots.get('bot_especial'), chatVar: 'TEST_CHAT_ID_BOT_ESPECIAL' }
    ];
    
    for (const botInfo of botsParaLog) {
      if (botInfo.instance && botInfo.instance.bot) {
        const testChatId = process.env[botInfo.chatVar] || process.env.TEST_CHAT_ID;
        if (testChatId) {
          try {
            await botInfo.instance.bot.sendMessage(testChatId, message, { parse_mode: 'Markdown' });
          } catch (sendError) {
            console.log(`⚠️ Erro ao enviar log para ${botInfo.id}:`, sendError.message);
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ Erro geral ao enviar logs:', error.message);
  }
}

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
  
  try {
    const botsParaMetricas = [
      { id: 'bot1', instance: bots.get('bot1'), nome: 'Bot1' },
      { id: 'bot2', instance: bots.get('bot2'), nome: 'Bot2' },
      { id: 'bot_especial', instance: bots.get('bot_especial'), nome: 'Bot Especial' }
    ];
    
    let metricas = `📊 **MÉTRICAS DE PERFORMANCE**\n📅 ${timestamp}\n\n`;
    
    for (const botInfo of botsParaMetricas) {
      if (botInfo.instance && botInfo.instance.gerenciadorMidia) {
        try {
          const relatorio = botInfo.instance.gerenciadorMidia.obterRelatorioPerformance();
          metricas += `🤖 **${botInfo.nome}**\n`;
          metricas += `├ Pool ativo: ${relatorio.preWarmingAtivo ? '✅' : '❌'}\n`;
          metricas += `├ Pools: ${relatorio.poolsAtivos}\n`;
          metricas += `├ Cache: ${relatorio.taxaCache}\n`;
          metricas += `├ Tempo médio: ${relatorio.tempoMedioMs}ms\n`;
          metricas += `└ Eficiência: ${relatorio.eficiencia}\n\n`;
        } catch (error) {
          metricas += `🤖 **${botInfo.nome}**: ❌ Erro ao coletar métricas\n\n`;
        }
      } else {
        metricas += `🤖 **${botInfo.nome}**: ⚠️ Não disponível\n\n`;
      }
    }
    
    await enviarLogParaChatTeste(metricas, 'metricas');
    
  } catch (error) {
    console.error('❌ Erro ao coletar métricas:', error.message);
  }
}

async function validarPoolsTodasInstancias() {
  console.log('🔍 VALIDAÇÃO CENTRALIZADA: Verificando pools de file_ids...');
  
  try {
    const botsParaValidacao = [
      { id: 'bot1', instance: bots.get('bot1'), nome: 'Bot1' },
      { id: 'bot2', instance: bots.get('bot2'), nome: 'Bot2' },
      { id: 'bot_especial', instance: bots.get('bot_especial'), nome: 'Bot Especial' }
    ];
    
    for (const botInfo of botsParaValidacao) {
      if (botInfo.instance && botInfo.instance.gerenciadorMidia && typeof botInfo.instance.gerenciadorMidia.validarELimparFileIds === 'function') {
        try {
          console.log(`🔍 Validando pools do ${botInfo.nome}...`);
          await botInfo.instance.gerenciadorMidia.validarELimparFileIds();
        } catch (error) {
          console.error(`❌ Erro na validação do ${botInfo.nome}:`, error.message);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Erro geral na validação de pools:', error.message);
  }
}

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
      
      const logInicial = `🚀 **SISTEMA INICIADO**\n📅 ${timestamp}\n\n✅ Sistema de pré-aquecimento ativo\n🔄 Aquecimento: a cada 30 minutos\n📊 Métricas: a cada 30 minutos\n🔍 Validação: a cada 2 horas\n\n⚡ Primeiro aquecimento em 10 SEGUNDOS`;
      
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
      console.log(`Servidor rodando na porta ${PORT}`);
      console.log(`URL: ${BASE_URL}`);
      console.log(`Webhook bot1: ${BASE_URL}/bot1/webhook`);
      console.log(`Webhook bot2: ${BASE_URL}/bot2/webhook`);
      console.log(`Webhook bot especial: ${BASE_URL}/bot_especial/webhook`);
  
     // Inicializar módulos automaticamente
   console.log('🚀 Iniciando sistema com pré-aquecimento automático...');
   await inicializarModulos();
  
      console.log('Servidor pronto!');
  console.log('Valor do plano 1 semana atualizado para R$ 9,90 com sucesso.');
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
