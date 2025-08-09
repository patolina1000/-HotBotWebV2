/**
 * requestTracking.js - Middleware de Tracking de Requisições
 * 
 * Este módulo implementa:
 * - Geração automática de request-id
 * - Captura de dados de tracking (UTMs, Facebook Pixel, etc.)
 * - Middleware para Express
 * - Integração com auditLogger
 * - Logs estruturados em JSON com payload_id, telegram_id, transaction_id, UTMs, fbp/fbc, IP e user agent
 * - Validação de reprocessamento de webhooks
 * - Timezone America/Recife para todos os registros
 */

const auditLogger = require('./auditLogger');
const idempotencyService = require('./idempotencyService');

/**
 * Middleware para capturar e rastrear requisições
 * @param {Object} req - Request Express
 * @param {Object} res - Response Express
 * @param {Function} next - Próximo middleware
 */
function requestTrackingMiddleware(req, res, next) {
  // Gerar request-id único se não existir
  if (!req.headers['x-request-id']) {
    req.headers['x-request-id'] = auditLogger.generateRequestId();
  }
  
  const requestId = req.headers['x-request-id'];
  
  // Adicionar request-id ao response headers
  res.setHeader('x-request-id', requestId);
  
  // Extrair dados de tracking
  const trackingData = auditLogger.extractTrackingData(req);
  
  // Adicionar dados ao request para uso posterior
  req.requestId = requestId;
  req.trackingData = trackingData;
  
  // Log estruturado de início da requisição
  const structuredLogData = {
    method: req.method,
    url: req.url,
    path: req.path,
    query: req.query,
    headers: {
      'user-agent': req.headers['user-agent'],
      'x-forwarded-for': req.headers['x-forwarded-for'],
      'x-real-ip': req.headers['x-real-ip']
    },
    // Dados de tracking estruturados
    payload_id: req.query.payload_id || req.body?.payload_id || null,
    telegram_id: req.query.telegram_id || req.body?.telegram_id || null,
    transaction_id: req.query.transaction_id || req.body?.transaction_id || null,
    utm_source: trackingData.utm_source || null,
    utm_medium: trackingData.utm_medium || null,
    utm_campaign: trackingData.utm_campaign || null,
    utm_content: trackingData.utm_content || null,
    utm_term: trackingData.utm_term || null,
    fbp: trackingData.fbp || null,
    fbc: trackingData.fbc || null,
    ip: trackingData.ip || null,
    user_agent: trackingData.user_agent || null
  };
  
  auditLogger.logFunnelEvent('info', 'request_start', structuredLogData, {
    request_id: requestId,
    tracking_data: trackingData
  });
  
  // Interceptar finalização da resposta
  const originalSend = res.send;
  res.send = function(data) {
    // Log estruturado de fim da requisição
    const endLogData = {
      method: req.method,
      url: req.url,
      status_code: res.statusCode,
      response_size: data ? data.length : 0,
      duration_ms: Date.now() - req.startTime,
      // Dados de tracking estruturados
      payload_id: req.query.payload_id || req.body?.payload_id || null,
      telegram_id: req.query.telegram_id || req.body?.telegram_id || null,
      transaction_id: req.query.transaction_id || req.body?.transaction_id || null,
      utm_source: trackingData.utm_source || null,
      utm_medium: trackingData.utm_medium || null,
      utm_campaign: trackingData.utm_campaign || null,
      utm_content: trackingData.utm_content || null,
      utm_term: trackingData.utm_term || null,
      fbp: trackingData.fbp || null,
      fbc: trackingData.fbc || null,
      ip: trackingData.ip || null,
      user_agent: trackingData.user_agent || null
    };
    
    auditLogger.logFunnelEvent('info', 'request_end', endLogData, {
      request_id: requestId,
      tracking_data: trackingData
    });
    
    return originalSend.call(this, data);
  };
  
  // Marcar tempo de início
  req.startTime = Date.now();
  
  next();
}

/**
 * Middleware para capturar erros e fazer logging
 * @param {Error} error - Erro capturado
 * @param {Object} req - Request Express
 * @param {Object} res - Response Express
 * @param {Function} next - Próximo middleware
 */
function errorTrackingMiddleware(error, req, res, next) {
  const requestId = req.requestId || auditLogger.generateRequestId();
  
  // Log estruturado de erro com contexto completo
  const errorLogData = {
    context: 'express_middleware',
    method: req.method,
    url: req.url,
    path: req.path,
    query: req.query,
    body: req.body,
    headers: req.headers,
    status_code: res.statusCode || 500,
    error_message: error.message,
    error_stack: error.stack,
    // Dados de tracking estruturados
    payload_id: req.query?.payload_id || req.body?.payload_id || null,
    telegram_id: req.query?.telegram_id || req.body?.telegram_id || null,
    transaction_id: req.query?.transaction_id || req.body?.transaction_id || null,
    utm_source: req.trackingData?.utm_source || null,
    utm_medium: req.trackingData?.utm_medium || null,
    utm_campaign: req.trackingData?.utm_campaign || null,
    utm_content: req.trackingData?.utm_content || null,
    utm_term: req.trackingData?.utm_term || null,
    fbp: req.trackingData?.fbp || null,
    fbc: req.trackingData?.fbc || null,
    ip: req.trackingData?.ip || null,
    user_agent: req.trackingData?.user_agent || null
  };
  
  auditLogger.logError(error, errorLogData, {
    request_id: requestId,
    tracking_data: req.trackingData || {}
  });
  
  // Adicionar request-id ao response de erro
  res.setHeader('x-request-id', requestId);
  
  next(error);
}

/**
 * Middleware para capturar dados específicos de webhook
 * @param {Object} req - Request Express
 * @param {Object} res - Response Express
 * @param {Function} next - Próximo middleware
 */
function webhookTrackingMiddleware(req, res, next) {
  const requestId = req.requestId || auditLogger.generateRequestId();
  
  // Log específico para webhooks
  if (req.path.includes('/webhook') || req.path.includes('/callback')) {
    const webhookLogData = {
      webhook_type: req.path.split('/').pop(),
      method: req.method,
      content_type: req.headers['content-type'],
      body_size: req.body ? JSON.stringify(req.body).length : 0,
      headers: {
        'user-agent': req.headers['user-agent'],
        'x-forwarded-for': req.headers['x-forwarded-for'],
        'x-real-ip': req.headers['x-real-ip']
      },
      // Dados de tracking estruturados
      payload_id: req.query?.payload_id || req.body?.payload_id || null,
      telegram_id: req.query?.telegram_id || req.body?.telegram_id || null,
      transaction_id: req.query?.transaction_id || req.body?.transaction_id || null,
      utm_source: req.trackingData?.utm_source || null,
      utm_medium: req.trackingData?.utm_medium || null,
      utm_campaign: req.trackingData?.utm_campaign || null,
      utm_content: req.trackingData?.utm_content || null,
      utm_term: req.trackingData?.utm_term || null,
      fbp: req.trackingData?.fbp || null,
      fbc: req.trackingData?.fbc || null,
      ip: req.trackingData?.ip || null,
      user_agent: req.trackingData?.user_agent || null
    };
    
    auditLogger.logFunnelEvent('info', 'webhook_received', webhookLogData, {
      request_id: requestId,
      tracking_data: req.trackingData || {}
    });
  }
  
  next();
}

/**
 * Middleware para capturar dados de pagamento
 * @param {Object} req - Request Express
 * @param {Object} res - Response Express
 * @param {Function} next - Próximo middleware
 */
function paymentTrackingMiddleware(req, res, next) {
  const requestId = req.requestId || auditLogger.generateRequestId();
  
  // Log específico para endpoints de pagamento
  if (req.path.includes('/pix') || req.path.includes('/payment') || req.path.includes('/webhook')) {
    const paymentData = {
      endpoint: req.path,
      method: req.method,
      has_body: !!req.body,
      body_keys: req.body ? Object.keys(req.body) : [],
      query_params: Object.keys(req.query),
      // Dados de tracking estruturados
      payload_id: req.query?.payload_id || req.body?.payload_id || null,
      telegram_id: req.query?.telegram_id || req.body?.telegram_id || null,
      transaction_id: req.query?.transaction_id || req.body?.transaction_id || null,
      utm_source: req.trackingData?.utm_source || null,
      utm_medium: req.trackingData?.utm_medium || null,
      utm_campaign: req.trackingData?.utm_campaign || null,
      utm_content: req.trackingData?.utm_content || null,
      utm_term: req.trackingData?.utm_term || null,
      fbp: req.trackingData?.fbp || null,
      fbc: req.trackingData?.fbc || null,
      ip: req.trackingData?.ip || null,
      user_agent: req.trackingData?.user_agent || null
    };
    
    // Capturar dados sensíveis de pagamento (sem expor valores)
    if (req.body && req.body.transaction_id) {
      paymentData.transaction_id = req.body.transaction_id;
    }
    if (req.body && req.body.telegram_id) {
      paymentData.telegram_id = req.body.telegram_id;
    }
    
    auditLogger.logFunnelEvent('info', 'payment_request', paymentData, {
      request_id: requestId,
      tracking_data: req.trackingData || {}
    });
  }
  
  next();
}

/**
 * Middleware para validação de reprocessamento de webhooks
 * @param {Object} req - Request Express
 * @param {Object} res - Response Express
 * @param {Function} next - Próximo middleware
 */
function webhookReprocessingValidationMiddleware(req, res, next) {
  const requestId = req.requestId || auditLogger.generateRequestId();
  
  // Aplicar apenas para webhooks
  if (req.path.includes('/webhook') || req.path.includes('/callback')) {
    const { transaction_id, telegram_id } = req.body || req.query || {};
    
    if (transaction_id) {
      // Verificar se já foi processado
      idempotencyService.checkWebhookProcessed('webhook_processed', transaction_id, telegram_id)
        .then(result => {
          if (result.exists) {
            // Log de reprocessamento detectado
            auditLogger.logFunnelEvent('warn', 'webhook_reprocessing_detected', {
              transaction_id,
              telegram_id,
              webhook_path: req.path,
              method: req.method,
              is_duplicate: true,
              existing_event_id: result.data?.id || null,
              // Dados de tracking estruturados
              payload_id: req.query?.payload_id || req.body?.payload_id || null,
              utm_source: req.trackingData?.utm_source || null,
              utm_medium: req.trackingData?.utm_medium || null,
              utm_campaign: req.trackingData?.utm_campaign || null,
              utm_content: req.trackingData?.utm_content || null,
              utm_term: req.trackingData?.utm_term || null,
              fbp: req.trackingData?.fbp || null,
              fbc: req.trackingData?.fbc || null,
              ip: req.trackingData?.ip || null,
              user_agent: req.trackingData?.user_agent || null
            }, {
              request_id: requestId,
              tracking_data: req.trackingData || {}
            });
            
            // Adicionar flag para indicar reprocessamento
            req.isReprocessing = true;
            req.existingEventId = result.data?.id || null;
          }
        })
        .catch(error => {
          // Log de erro na validação, mas não bloquear
          auditLogger.logError(error, {
            context: 'webhook_reprocessing_validation',
            transaction_id,
            telegram_id
          }, {
            request_id: requestId,
            tracking_data: req.trackingData || {}
          });
        });
    }
  }
  
  next();
}

/**
 * Função para obter dados de tracking de uma requisição
 * @param {Object} req - Request Express
 * @returns {Object} Dados de tracking
 */
function getRequestTrackingData(req) {
  return {
    request_id: req.requestId || auditLogger.generateRequestId(),
    tracking_data: req.trackingData || {},
    timestamp: new Date().toISOString(),
    url: req.url,
    method: req.method,
    // Dados estruturados adicionais
    payload_id: req.query?.payload_id || req.body?.payload_id || null,
    telegram_id: req.query?.telegram_id || req.body?.telegram_id || null,
    transaction_id: req.query?.transaction_id || req.body?.transaction_id || null,
    utm_source: req.trackingData?.utm_source || null,
    utm_medium: req.trackingData?.utm_medium || null,
    utm_campaign: req.trackingData?.utm_campaign || null,
    utm_content: req.trackingData?.utm_content || null,
    utm_term: req.trackingData?.utm_term || null,
    fbp: req.trackingData?.fbp || null,
    fbc: req.trackingData?.fbc || null,
    ip: req.trackingData?.ip || null,
    user_agent: req.trackingData?.user_agent || null
  };
}

/**
 * Função para obter request-id de uma requisição
 * @param {Object} req - Request Express
 * @returns {string} Request ID
 */
function getRequestId(req) {
  return req.requestId || auditLogger.generateRequestId();
}

/**
 * Função para verificar se uma requisição é reprocessamento
 * @param {Object} req - Request Express
 * @returns {boolean} True se for reprocessamento
 */
function isReprocessing(req) {
  return req.isReprocessing === true;
}

/**
 * Função para obter ID do evento existente em caso de reprocessamento
 * @param {Object} req - Request Express
 * @returns {string|null} ID do evento existente ou null
 */
function getExistingEventId(req) {
  return req.existingEventId || null;
}

module.exports = {
  requestTrackingMiddleware,
  errorTrackingMiddleware,
  webhookTrackingMiddleware,
  paymentTrackingMiddleware,
  webhookReprocessingValidationMiddleware,
  getRequestTrackingData,
  getRequestId,
  isReprocessing,
  getExistingEventId
};
