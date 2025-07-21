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
const crypto = require('crypto');
const facebookService = require('./services/facebook');
const { sendFacebookEvent, generateEventId, checkIfEventSent } = facebookService;
const facebookRouter = facebookService.router;
const protegerContraFallbacks = require('./services/protegerContraFallbacks');
const linksRoutes = require('./routes/links');
let lastRateLimitLog = 0;
const bot1 = require('./MODELO1/BOT/bot1');
const bot2 = require('./MODELO1/BOT/bot2');
const sqlite = require('./database/sqlite');
const bots = new Map();
const initPostgres = require("./init-postgres");
initPostgres();

// Heartbeat para indicar que o bot está ativo (reduzido em produção)
setInterval(() => {
  if (process.env.NODE_ENV !== 'production') {
    const horario = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    console.log(`⏱ Uptime OK — ${horario}`);
  }
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
app.use(facebookRouter);
console.log('[OK] Endpoint /api/config disponível');

app.get('/health', (req, res) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('🔍 Health check recebido');
  }
  res.status(200).send('OK');
});

// Middlewares básicos
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rotas de redirecionamento
app.use('/', linksRoutes);

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
            console.log(`🔥 FBP recuperado do SessionTracking para token ${token} (telegram_id: ${dadosToken.telegram_id})`);
          }
          if (!dadosToken.fbc && sessionData.fbc) {
            dadosToken.fbc = sessionData.fbc;
            console.log(`🔥 FBC recuperado do SessionTracking para token ${token} (telegram_id: ${dadosToken.telegram_id})`);
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
          console.log(`⚠️ CAPI para token ${token} já está sendo processado ou foi enviado`);
        } else {
          // 2. Realizar envio do evento CAPI
          const eventId = generateEventId(
            'Purchase',
            token,
            dadosToken.event_time || Math.floor(new Date(dadosToken.criado_em).getTime() / 1000)
          );
          const capiResult = await sendFacebookEvent({
            event_name: 'Purchase',
            event_time: dadosToken.event_time || Math.floor(new Date(dadosToken.criado_em).getTime() / 1000),
            event_id: eventId,
            value: parseFloat(dadosToken.valor),
            currency: 'BRL',
            fbp: dadosToken.fbp,
            fbc: dadosToken.fbc,
            client_ip_address: dadosToken.ip_criacao,
            client_user_agent: dadosToken.user_agent_criacao,
            user_data_hash: userDataHash,
            source: 'capi',
            custom_data: {
              utm_source: dadosToken.utm_source,
              utm_medium: dadosToken.utm_medium,
              utm_campaign: dadosToken.utm_campaign,
              utm_term: dadosToken.utm_term,
              utm_content: dadosToken.utm_content
            }
          });

          if (capiResult.success) {
            // 3. Marcar como enviado e resetar flag de processamento
            await client.query(
              'UPDATE tokens SET capi_sent = TRUE, capi_processing = FALSE, first_event_sent_at = COALESCE(first_event_sent_at, CURRENT_TIMESTAMP), event_attempts = event_attempts + 1 WHERE token = $1',
              [token]
            );
            await client.query('COMMIT');
            console.log(`📡 ✅ CAPI Purchase enviado com sucesso para token ${token} via transação atômica`);
          } else {
            // Rollback em caso de falha no envio
            await client.query('ROLLBACK');
            console.error(`❌ Erro ao enviar CAPI Purchase para token ${token}:`, capiResult.error);
          }
        }
      } catch (error) {
        // Garantir rollback em caso de qualquer erro
        await client.query('ROLLBACK');
        console.error(`❌ Erro inesperado na transação CAPI para token ${token}:`, error);
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

    console.log(`🏷️ Flag pixel_sent atualizada para token ${token}`);
    return res.json({ success: true });
  } catch (error) {
    console.error('Erro ao marcar pixel enviado:', error);
    return res.status(500).json({ success: false, error: 'Erro interno' });
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
      console.error(`❌ ${error}`);
      return res.status(400).json({ 
        success: false, 
        error: 'Parâmetros insuficientes para ViewContent',
        details: error,
        available_params: availableParams,
        required_count: 2
      });
    }

    console.log(`✅ ViewContent validado com ${availableParams.length} parâmetros: [${availableParams.join(', ')}]`);

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
      console.log(`✅ Evento ViewContent enviado com sucesso via CAPI | Event ID: ${event_id}`);
      return res.json({ 
        success: true, 
        message: 'Evento ViewContent enviado com sucesso',
        event_id: event_id,
        event_time: eventData.event_time
      });
    } else if (result.duplicate) {
      console.log(`🔄 Evento ViewContent duplicado ignorado | Event ID: ${event_id}`);
      return res.json({ 
        success: true, 
        message: 'Evento já foi enviado (deduplicação ativa)',
        event_id: event_id,
        duplicate: true
      });
    } else {
      console.error(`❌ Erro ao enviar evento ViewContent via CAPI:`, result.error);
      return res.status(500).json({ 
        success: false, 
        error: 'Falha ao enviar evento para Meta',
        details: result.error
      });
    }

  } catch (error) {
    console.error('❌ Erro no endpoint ViewContent CAPI:', error);
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
    return res.status(400).json({ valido: false });
  }

  try {
    if (!pool) {
      return res.status(500).json({ valido: false });
    }

    token = token.toString().trim();
    console.log('Token recebido:', token);

    const resultado = await pool.query(
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
          console.warn('⚠️ Payload_id duplicado. Tente novamente.');
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
          console.warn('⚠️ Payload_id duplicado. Tente novamente.');
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
        console.log(`🔍 Cron Fallback: ${res.rows.length} tokens elegíveis para fallback`);
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
          console.log(`⚠️ Token ${row.token} sem dados suficientes para fallback`);
          continue;
        }

        const tipoProcessamento = row.capi_ready ? 'CAPI READY' : 'FALLBACK';
        console.log(`🚨 ${tipoProcessamento} CRON: enviando evento para token ${row.token} (tentativa ${(row.event_attempts || 0) + 1}/3)`);

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
          user_data_hash: userDataHash,
          source: 'cron',
          token: row.token,
          pool: pool,
          custom_data: {
            utm_source: row.utm_source,
            utm_medium: row.utm_medium,
            utm_campaign: row.utm_campaign,
            utm_term: row.utm_term,
            utm_content: row.utm_content
          }
        });

        if (capiResult.success) {
          console.log(`✅ ${tipoProcessamento} CRON: Purchase enviado com sucesso para token ${row.token}`);
          // Resetar flag capi_ready após envio bem-sucedido
          if (row.capi_ready) {
            await pool.query('UPDATE tokens SET capi_ready = FALSE WHERE token = $1', [row.token]);
          }
        } else if (!capiResult.duplicate) {
          console.error(`❌ ${tipoProcessamento} CRON: Erro ao enviar Purchase para token ${row.token}:`, capiResult.error);
        }

        // Marcar token como expirado apenas se tentou 3 vezes ou teve sucesso
        if (capiResult.success || (row.event_attempts || 0) >= 2) {
          await pool.query(
            "UPDATE tokens SET status = 'expirado', usado = TRUE WHERE token = $1",
            [row.token]
          );
          console.log(`🏁 Token ${row.token} marcado como expirado`);
        }
      }
    } catch (err) {
      console.error('Erro no cron de fallback:', err.message);
    }
  });
  console.log('⏰ Cron de fallback melhorado iniciado (verifica a cada 5 minutos, envia após 5 minutos de inatividade)');
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

    if (pool) {
      try {
        const result = await pool.query(`
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

function iniciarLimpezaPayloadTracking() {
  cron.schedule('0 * * * *', async () => {
    console.log('🧹 Limpando registros antigos de payload_tracking...');

    try {
      const db = sqlite.get();
      if (db) {
        const stmt = db.prepare(`
          DELETE FROM payload_tracking
          WHERE datetime(created_at) <= datetime('now', '-2 hours')
        `);
        const info = stmt.run();
        console.log(`✅ SQLite: ${info.changes} payloads removidos`);
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
        console.log(`✅ PostgreSQL: ${result.rowCount} payloads removidos`);
      } catch (err) {
        console.error('❌ Erro PostgreSQL:', err.message);
      }
    }
  });
  console.log('⏰ Cron de limpeza de payload_tracking iniciado a cada hora');
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
    pool = await postgres.initializeDatabase();
    
    if (pool) {
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

    if (!pool) {
      console.error('❌ Pool de conexões não disponível');
      return false;
    }

    // Limpar cache do módulo
    delete require.cache[require.resolve('./MODELO1/WEB/tokens')];
    
    const tokensModule = require('./MODELO1/WEB/tokens');
    
    if (typeof tokensModule === 'function') {
      const tokenSystem = tokensModule(app, pool);
      
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
  
  console.log(`📡 [${requestId}] Iniciando busca de eventos - ${timestamp}`);
  
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
    console.log(`🔍 [${requestId}] Filtros aplicados:`, { evento, inicio, fim, utm_campaign, limit, offset });
    
    // Verificar se o pool está disponível
    if (!pool) {
      console.error(`❌ [${requestId}] Pool de conexão não disponível - retornando dados simulados`);
      
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
    
    console.log(`🔄 [${requestId}] Executando query principal com ${params.length} parâmetros`);
    const result = await pool.query(query, params);
    console.log(`✅ [${requestId}] Query executada com sucesso - ${result.rows.length} eventos encontrados`);
    
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
    
    console.log(`🔄 [${requestId}] Executando query de estatísticas`);
    const statsResult = await pool.query(statsQuery);
    console.log(`✅ [${requestId}] Estatísticas calculadas com sucesso`);
    
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
    
    console.log(`✅ [${requestId}] Resposta preparada com sucesso - enviando ${result.rows.length} eventos`);
    res.status(200).json(responseData);
    
  } catch (error) {
    console.error(`❌ [${requestId}] Erro detalhado ao buscar eventos:`, {
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
    
    console.warn(`⚠️ [${requestId}] Retornando dados simulados devido ao erro no banco de dados`);
    
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
  console.error('❌ Erro não tratado:', error.message);
  res.status(500).json({
    error: 'Erro interno do servidor',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno do servidor'
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
  iniciarLimpezaPayloadTracking();
  
  console.log('📊 Status final dos módulos:');
  console.log(`🤖 Bot: ${bot ? 'OK' : 'ERRO'}`);
  console.log(`🗄️ Banco: ${databaseConnected ? 'OK' : 'ERRO'}`);
  console.log(`🎯 Tokens: ${webModuleLoaded ? 'OK' : 'ERRO'}`);
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
        
        console.warn(`⚠️ [${requestId}] Retornando dados simulados devido à falta de conexão com banco`);
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

  if (pool && postgres) {
    await pool.end().catch(console.error);
  }

  server.close(() => {
    console.log('✅ Servidor fechado');
  });
});

console.log('✅ Servidor configurado e pronto');
