/**
 * auditLogger.js - Serviço de Auditoria e Logging Estruturado para Produção
 * 
 * Este módulo implementa:
 * - Logging estruturado em JSON
 * - Correlação de request-id
 * - Auditoria completa de eventos
 * - Timezone America/Recife
 * - Validação de coerência de dados
 */

const crypto = require('crypto');

class AuditLogger {
  constructor() {
    this.timezone = 'America/Recife';
    this.environment = process.env.NODE_ENV || 'production';
    this.logLevel = process.env.LOG_LEVEL || 'info';
  }

  /**
   * Gera um ID único para correlacionar requests
   * @returns {string} Request ID único
   */
  generateRequestId() {
    return crypto.randomUUID();
  }

  /**
   * Formata timestamp para timezone America/Recife
   * @param {Date|string} timestamp - Timestamp a ser formatado
   * @returns {string} Timestamp formatado
   */
  formatTimestampForTimezone(timestamp) {
    if (!timestamp) {
      timestamp = new Date();
    }
    
    try {
      const date = new Date(timestamp);
      return date.toLocaleString('pt-BR', {
        timeZone: this.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch (error) {
      console.warn('Erro ao formatar timestamp, usando ISO:', error.message);
      return new Date(timestamp).toISOString();
    }
  }

  /**
   * Extrai informações de tracking do request
   * @param {Object} req - Request Express
   * @returns {Object} Dados de tracking extraídos
   */
  extractTrackingData(req) {
    const trackingData = {};
    
    // Headers de tracking do Facebook
    if (req.headers['x-fb-pixel-id']) trackingData.fb_pixel_id = req.headers['x-fb-pixel-id'];
    if (req.headers['x-fbp']) trackingData.fbp = req.headers['x-fbp'];
    if (req.headers['x-fbc']) trackingData.fbc = req.headers['x-fbc'];
    
    // Parâmetros UTM
    if (req.query.utm_source) trackingData.utm_source = req.query.utm_source;
    if (req.query.utm_medium) trackingData.utm_medium = req.query.utm_medium;
    if (req.query.utm_campaign) trackingData.utm_campaign = req.query.utm_campaign;
    if (req.query.utm_content) trackingData.utm_content = req.query.utm_content;
    if (req.query.utm_term) trackingData.utm_term = req.query.utm_term;
    
    // Informações do cliente
    trackingData.ip = req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
    trackingData.user_agent = req.headers['user-agent'] || 'unknown';
    
    return trackingData;
  }

  /**
   * Log estruturado para eventos do funil
   * @param {string} level - Nível do log (info, warn, error)
   * @param {string} event - Nome do evento
   * @param {Object} data - Dados do evento
   * @param {Object} options - Opções adicionais
   */
  logFunnelEvent(level, event, data, options = {}) {
    const logEntry = {
      timestamp: this.formatTimestampForTimezone(new Date()),
      level: level.toUpperCase(),
      event: event,
      environment: this.environment,
      request_id: options.request_id || this.generateRequestId(),
      // Dados estruturados obrigatórios
      payload_id: data.payload_id || null,
      telegram_id: data.telegram_id || null,
      transaction_id: data.transaction_id || null,
      // UTMs
      utm_source: data.utm_source || null,
      utm_medium: data.utm_medium || null,
      utm_campaign: data.utm_campaign || null,
      utm_content: data.utm_content || null,
      utm_term: data.utm_term || null,
      // Facebook Pixel
      fbp: data.fbp || null,
      fbc: data.fbc || null,
      // Informações do cliente
      ip: data.ip || null,
      user_agent: data.user_agent || null,
      // Dados específicos do evento
      ...data
    };

    // Adicionar dados de tracking se disponíveis
    if (options.tracking_data) {
      logEntry.tracking = options.tracking_data;
    }

    // Adicionar metadados adicionais
    if (options.meta) {
      logEntry.meta = options.meta;
    }

    // Log estruturado em JSON
    console.log(JSON.stringify(logEntry));
    
    // Em produção, também salvar em arquivo ou serviço externo
    if (this.environment === 'production') {
      this.saveToProductionLog(logEntry);
    }
  }

  /**
   * Log de auditoria para eventos de pagamento
   * @param {Object} paymentData - Dados do pagamento
   * @param {Object} options - Opções de auditoria
   */
  logPaymentAudit(paymentData, options = {}) {
    const auditData = {
      transaction_id: paymentData.transaction_id,
      telegram_id: paymentData.telegram_id,
      payload_id: paymentData.payload_id,
      bot_id: paymentData.bot_id,
      offer_tier: paymentData.offer_tier,
      price_cents: paymentData.price_cents,
      status: paymentData.status,
      event_type: paymentData.event_type,
      timestamp: this.formatTimestampForTimezone(new Date()),
      request_id: options.request_id || this.generateRequestId(),
      // Dados estruturados obrigatórios
      utm_source: options.tracking_data?.utm_source || null,
      utm_medium: options.tracking_data?.utm_medium || null,
      utm_campaign: options.tracking_data?.utm_campaign || null,
      utm_content: options.tracking_data?.utm_content || null,
      utm_term: options.tracking_data?.utm_term || null,
      fbp: options.tracking_data?.fbp || null,
      fbc: options.tracking_data?.fbc || null,
      ip: options.tracking_data?.ip || null,
      user_agent: options.tracking_data?.user_agent || null
    };

    // Adicionar dados de tracking
    if (options.tracking_data) {
      auditData.tracking = options.tracking_data;
    }

    // Adicionar dados de validação
    if (options.validation_data) {
      auditData.validation = options.validation_data;
    }

    // Log de auditoria
    this.logFunnelEvent('info', 'payment_audit', auditData, {
      request_id: options.request_id,
      meta: { audit_type: 'payment' }
    });
  }

  /**
   * Log de alerta para inconsistências de preço
   * @param {Object} priceData - Dados de preço
   * @param {Object} options - Opções do alerta
   */
  logPriceInconsistency(priceData, options = {}) {
    const alertData = {
      transaction_id: priceData.transaction_id,
      telegram_id: priceData.telegram_id,
      offer_tier: priceData.offer_tier,
      price_shown_cents: priceData.price_shown_cents,
      price_actual_cents: priceData.price_actual_cents,
      difference_cents: Math.abs(priceData.price_shown_cents - priceData.price_actual_cents),
      percentage_diff: ((Math.abs(priceData.price_shown_cents - priceData.price_actual_cents) / priceData.price_shown_cents) * 100).toFixed(2),
      timestamp: this.formatTimestampForTimezone(new Date()),
      request_id: options.request_id || this.generateRequestId(),
      severity: 'WARNING',
      // Dados estruturados obrigatórios
      payload_id: options.tracking_data?.payload_id || null,
      utm_source: options.tracking_data?.utm_source || null,
      utm_medium: options.tracking_data?.utm_medium || null,
      utm_campaign: options.tracking_data?.utm_campaign || null,
      utm_content: options.tracking_data?.utm_content || null,
      utm_term: options.tracking_data?.utm_term || null,
      fbp: options.tracking_data?.fbp || null,
      fbc: options.tracking_data?.fbc || null,
      ip: options.tracking_data?.ip || null,
      user_agent: options.tracking_data?.user_agent || null
    };

    // Log de alerta
    this.logFunnelEvent('warn', 'price_inconsistency', alertData, {
      request_id: options.request_id,
      meta: { alert_type: 'price_mismatch' }
    });
  }

  /**
   * Log de validação de idempotência
   * @param {Object} idempotencyData - Dados de idempotência
   * @param {Object} options - Opções de validação
   */
  logIdempotencyCheck(idempotencyData, options = {}) {
    const checkData = {
      transaction_id: idempotencyData.transaction_id,
      event_type: idempotencyData.event_type,
      is_duplicate: idempotencyData.is_duplicate,
      existing_event_id: idempotencyData.existing_event_id,
      timestamp: this.formatTimestampForTimezone(new Date()),
      request_id: options.request_id || this.generateRequestId(),
      // Dados estruturados obrigatórios
      telegram_id: idempotencyData.telegram_id || null,
      payload_id: options.tracking_data?.payload_id || null,
      utm_source: options.tracking_data?.utm_source || null,
      utm_medium: options.tracking_data?.utm_medium || null,
      utm_campaign: options.tracking_data?.utm_campaign || null,
      utm_content: options.tracking_data?.utm_content || null,
      utm_term: options.tracking_data?.utm_term || null,
      fbp: options.tracking_data?.fbp || null,
      fbc: options.tracking_data?.fbc || null,
      ip: options.tracking_data?.ip || null,
      user_agent: options.tracking_data?.user_agent || null
    };

    // Log de validação
    this.logFunnelEvent('info', 'idempotency_check', checkData, {
      request_id: options.request_id,
      meta: { validation_type: 'idempotency' }
    });
  }

  /**
   * Log de erro estruturado
   * @param {Error} error - Erro capturado
   * @param {Object} context - Contexto do erro
   * @param {Object} options - Opções do log
   */
  logError(error, context = {}, options = {}) {
    const errorData = {
      error_message: error.message,
      error_stack: error.stack,
      error_name: error.name,
      context: context,
      timestamp: this.formatTimestampForTimezone(new Date()),
      request_id: options.request_id || this.generateRequestId(),
      // Dados estruturados obrigatórios
      payload_id: context.payload_id || options.tracking_data?.payload_id || null,
      telegram_id: context.telegram_id || options.tracking_data?.telegram_id || null,
      transaction_id: context.transaction_id || options.tracking_data?.transaction_id || null,
      utm_source: context.utm_source || options.tracking_data?.utm_source || null,
      utm_medium: context.utm_medium || options.tracking_data?.utm_medium || null,
      utm_campaign: context.utm_campaign || options.tracking_data?.utm_campaign || null,
      utm_content: context.utm_content || options.tracking_data?.utm_content || null,
      utm_term: context.utm_term || options.tracking_data?.utm_term || null,
      fbp: context.fbp || options.tracking_data?.fbp || null,
      fbc: context.fbc || options.tracking_data?.fbc || null,
      ip: context.ip || options.tracking_data?.ip || null,
      user_agent: context.user_agent || options.tracking_data?.user_agent || null
    };

    // Log de erro
    this.logFunnelEvent('error', 'system_error', errorData, {
      request_id: options.request_id,
      meta: { error_type: 'system' }
    });
  }

  /**
   * Salva log em produção (implementar conforme necessidade)
   * @param {Object} logEntry - Entrada do log
   */
  saveToProductionLog(logEntry) {
    // Implementar salvamento em arquivo, banco de dados ou serviço externo
    // Por exemplo: Winston, Bunyan, ou serviço de logging em nuvem
    try {
      // Aqui você pode implementar o salvamento em arquivo ou serviço externo
      // Por enquanto, apenas console.log
    } catch (error) {
      console.error('Erro ao salvar log de produção:', error.message);
    }
  }

  /**
   * Gera relatório de auditoria para um período
   * @param {Date} startDate - Data de início
   * @param {Date} endDate - Data de fim
   * @param {Object} filters - Filtros adicionais
   * @returns {Object} Relatório de auditoria
   */
  async generateAuditReport(startDate, endDate, filters = {}) {
    // Implementar geração de relatório baseado nos logs
    // Por enquanto, retorna estrutura básica
    return {
      period: {
        start: this.formatTimestampForTimezone(startDate),
        end: this.formatTimestampForTimezone(endDate)
      },
      filters: filters,
      summary: {
        total_events: 0,
        total_transactions: 0,
        price_inconsistencies: 0,
        duplicate_events: 0,
        errors: 0
      },
      details: []
    };
  }
}

// Singleton instance
const auditLogger = new AuditLogger();

module.exports = auditLogger;
