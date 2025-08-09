const { Pool } = require('pg');
const auditLogger = require('./auditLogger');
const idempotencyService = require('./idempotencyService');

/**
 * Serviço de Eventos do Funil
 * Gerencia a persistência de eventos do funil com alta confiabilidade
 * e timezone configurado para America/Recife
 * 
 * Implementa:
 * - Idempotência para evitar duplicação
 * - Auditoria completa de eventos
 * - Validação de coerência de preços
 * - Logging estruturado para produção
 */
class FunnelEventsService {
  constructor() {
    this.pool = null;
    this.timezone = 'America/Recife';
    this.initialized = false;
  }

  /**
   * Inicializa o serviço com pool de conexão
   * @param {Pool} pool - Pool de conexão PostgreSQL
   */
  initialize(pool) {
    if (!pool) {
      throw new Error('Pool de conexão é obrigatório');
    }
    
    this.pool = pool;
    this.initialized = true;
    console.log('🚀 FunnelEventsService inicializado com timezone:', this.timezone);
  }

  /**
   * Valida os dados do evento antes da persistência
   * @param {Object} eventData - Dados do evento
   * @returns {Object} - Resultado da validação
   */
  validateEventData(eventData) {
    const errors = [];
    
    // Validar event_name (obrigatório e não vazio)
    if (!eventData.event_name || typeof eventData.event_name !== 'string' || eventData.event_name.trim() === '') {
      errors.push('event_name é obrigatório e deve ser uma string não vazia');
    }
    
    // Validar price_cents (deve ser >= 0 quando presente)
    if (eventData.price_cents !== undefined && eventData.price_cents !== null) {
      if (!Number.isInteger(eventData.price_cents) || eventData.price_cents < 0) {
        errors.push('price_cents deve ser um inteiro >= 0 quando presente');
      }
    }
    
    // Validar meta (deve ser objeto quando presente)
    if (eventData.meta !== undefined && eventData.meta !== null) {
      if (typeof eventData.meta !== 'object' || Array.isArray(eventData.meta)) {
        errors.push('meta deve ser um objeto quando presente');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Converte timestamp para timezone America/Recife
   * @param {Date|string} timestamp - Timestamp a ser convertido
   * @returns {string} - Timestamp formatado no timezone correto
   */
  formatTimestampForTimezone(timestamp) {
    if (!timestamp) {
      return new Date().toISOString();
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
      return new Date().toISOString();
    }
  }

  /**
   * Registra um evento do funil no banco de dados
   * @param {Object} eventData - Dados do evento
   * @param {string} eventData.event_name - Nome do evento (obrigatório)
   * @param {string} [eventData.bot] - ID do bot
   * @param {string|number} [eventData.telegram_id] - ID do usuário no Telegram
   * @param {string} [eventData.payload_id] - ID do payload
   * @param {string} [eventData.session_id] - ID da sessão
   * @param {string} [eventData.offer_tier] - Nível da oferta
   * @param {number} [eventData.price_cents] - Preço em centavos
   * @param {string} [eventData.transaction_id] - ID da transação
   * @param {Object} [eventData.meta] - Metadados adicionais
   * @returns {Object} - Resultado da operação
   */
  async logEvent(eventData, pool = null) {
    const targetPool = pool || this.pool;
    
    if (!this.initialized || !targetPool) {
      throw new Error('Serviço não inicializado. Chame initialize() primeiro.');
    }

    // Validar dados do evento
    const validation = this.validateEventData(eventData);
    if (!validation.isValid) {
      return {
        success: false,
        error: 'Dados inválidos',
        details: validation.errors
      };
    }

    const client = await targetPool.connect();
    
    try {
      // Preparar query com timezone
      const query = `
        INSERT INTO funnel_events (
          event_name, bot, telegram_id, payload_id, session_id, 
          offer_tier, price_cents, transaction_id, meta
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, occurred_at
      `;
      
      const values = [
        eventData.event_name.trim(),
        eventData.bot || null,
        eventData.telegram_id ? String(eventData.telegram_id) : null,
        eventData.payload_id || null,
        eventData.session_id || null,
        eventData.offer_tier || null,
        eventData.price_cents || null,
        eventData.transaction_id || null,
        eventData.meta ? JSON.stringify(eventData.meta) : '{}'
      ];
      
      const result = await client.query(query, values);
      
      const insertedEvent = result.rows[0];
      
      console.log('📊 Evento do funil registrado:', {
        id: insertedEvent.id,
        event_name: eventData.event_name,
        telegram_id: eventData.telegram_id,
        occurred_at: this.formatTimestampForTimezone(insertedEvent.occurred_at)
      });
      
      return {
        success: true,
        event_id: insertedEvent.id,
        occurred_at: insertedEvent.occurred_at,
        formatted_time: this.formatTimestampForTimezone(insertedEvent.occurred_at)
      };
      
    } catch (error) {
      console.error('❌ Erro ao registrar evento do funil:', error.message);
      
      return {
        success: false,
        error: 'Erro interno do banco',
        details: error.message
      };
      
    } finally {
      client.release();
    }
  }

  /**
   * Helper para logar entrada no bot com auditoria
   * @param {Object} options - Opções do evento
   * @param {string} options.bot - ID do bot (bot1|bot2)
   * @param {string|number} options.telegram_id - ID do usuário no Telegram
   * @param {string} options.payload_id - ID do payload
   * @param {Pool} options.pool - Pool de conexão PostgreSQL
   * @param {string} [options.request_id] - ID do request para auditoria
   */
  async logBotEnter({ bot, telegram_id, payload_id, pool, request_id }) {
    if (!this.initialized) {
      throw new Error('FunnelEventsService não foi inicializado');
    }

    const eventData = {
      event_name: 'bot_enter',
      bot,
      telegram_id,
      payload_id,
      meta: {
        timestamp: new Date().toISOString(),
        source: 'telegram_bot'
      }
    };

    const result = await this.logEvent(eventData, pool);

    // Log de auditoria
    if (result.success) {
      auditLogger.logFunnelEvent('info', 'bot_enter', {
        bot,
        telegram_id: String(telegram_id),
        payload_id,
        event_id: result.event_id,
        occurred_at: result.occurred_at
      }, { request_id });
    }

    return result;
  }

  /**
   * Helper para logar exibição de oferta com auditoria
   * @param {Object} options - Opções do evento
   * @param {string} options.bot - ID do bot (bot1|bot2)
   * @param {string} options.offer_tier - Nível da oferta (full|d1|d2|d3)
   * @param {number} options.price_cents - Preço em centavos
   * @param {string|number} options.telegram_id - ID do usuário no Telegram
   * @param {Pool} options.pool - Pool de conexão PostgreSQL
   * @param {string} [options.request_id] - ID do request para auditoria
   */
  async logOfferShown({ bot, offer_tier, price_cents, telegram_id, pool, request_id }) {
    if (!this.initialized) {
      throw new Error('FunnelEventsService não foi inicializado');
    }

    const eventData = {
      event_name: 'offer_shown',
      bot,
      offer_tier,
      price_cents,
      telegram_id,
      meta: {
        timestamp: new Date().toISOString(),
        source: 'telegram_bot',
        offer_type: 'tier_display'
      }
    };

    const result = await this.logEvent(eventData, pool);

    // Log de auditoria
    if (result.success) {
      auditLogger.logFunnelEvent('info', 'offer_shown', {
        bot,
        offer_tier,
        price_cents,
        telegram_id: String(telegram_id),
        event_id: result.event_id,
        occurred_at: result.occurred_at
      }, { request_id });
    }

    return result;
  }

  /**
   * Helper para logar criação de PIX com validação de idempotência
   * @param {Object} options - Opções do evento
   * @param {string} options.bot - ID do bot (bot1|bot2)
   * @param {string|number} options.telegram_id - ID do usuário no Telegram
   * @param {string} options.offer_tier - Nível da oferta
   * @param {number} options.price_cents - Preço em centavos
   * @param {string} options.transaction_id - ID da transação retornado pela API
   * @param {Object} options.meta - Metadados adicionais
   * @param {Pool} options.pool - Pool de conexão PostgreSQL
   * @param {string} [options.request_id] - ID do request para auditoria
   */
  async logPixCreated({ bot, telegram_id, offer_tier, price_cents, transaction_id, meta = {}, pool, request_id }) {
    if (!this.initialized) {
      throw new Error('FunnelEventsService não foi inicializado');
    }

    // Verificar idempotência antes de processar
    const idempotencyCheck = await idempotencyService.checkPixCreatedIdempotency(
      { transaction_id, telegram_id }, 
      pool
    );

    if (idempotencyCheck.isDuplicate && !idempotencyCheck.isExpired) {
      auditLogger.logIdempotencyCheck({
        transaction_id,
        event_type: 'pix_created',
        is_duplicate: true,
        existing_event_id: idempotencyCheck.existingEvent.id
      }, { request_id });

      return {
        success: true,
        event_id: idempotencyCheck.existingEvent.id,
        occurred_at: idempotencyCheck.existingEvent.occurred_at,
        message: 'PIX já existe e é válido',
        isDuplicate: true,
        existingEvent: idempotencyCheck.existingEvent
      };
    }

    // Verificar coerência de preços
    const priceConsistency = await idempotencyService.checkPriceConsistency(
      { transaction_id, telegram_id, price_cents, offer_tier },
      pool
    );

    if (!priceConsistency.isConsistent) {
      auditLogger.logPriceInconsistency({
        transaction_id,
        telegram_id,
        offer_tier,
        price_shown_cents: priceConsistency.shownPrice,
        price_actual_cents: price_cents,
        difference_cents: priceConsistency.difference,
        percentage_diff: priceConsistency.percentageDiff
      }, { request_id });
    }

    const eventData = {
      event_name: 'pix_created',
      bot,
      telegram_id,
      offer_tier,
      price_cents,
      transaction_id,
      meta: {
        timestamp: new Date().toISOString(),
        source: 'telegram_bot',
        payment_method: 'pix',
        idempotency_check: idempotencyCheck,
        price_consistency: priceConsistency,
        ...meta
      }
    };

    const result = await this.logEvent(eventData, pool);

    // Registrar no cache de idempotência se foi criado com sucesso
    if (result.success && result.event_id) {
      idempotencyService.registerEvent('pix_created', transaction_id, telegram_id, {
        id: result.event_id,
        occurred_at: result.occurred_at,
        price_cents,
        offer_tier
      });
    }

    // Log de auditoria
    auditLogger.logPaymentAudit({
      transaction_id,
      telegram_id,
      payload_id: meta.payload_id,
      bot_id: bot,
      offer_tier,
      price_cents,
      status: 'created',
      event_type: 'pix_created'
    }, { request_id });

    return {
      ...result,
      isDuplicate: false,
      priceConsistency
    };
  }

  /**
   * Busca um evento específico por transaction_id
   * @param {string} transaction_id - ID da transação
   * @param {Pool} pool - Pool de conexão PostgreSQL
   * @returns {Object|null} - Evento encontrado ou null
   */
  async getEventByTransactionId(transaction_id, pool) {
    if (!this.initialized || !pool) {
      throw new Error('Serviço não inicializado. Chame initialize() primeiro.');
    }

    const client = await pool.connect();
    
    try {
      const query = 'SELECT * FROM funnel_events WHERE transaction_id = $1 ORDER BY occurred_at DESC LIMIT 1';
      const result = await client.query(query, [transaction_id]);
      
      return result.rows.length > 0 ? result.rows[0] : null;
    } finally {
      client.release();
    }
  }

  /**
   * Registra um pagamento confirmado (pix_paid) com validação de idempotência
   * @param {Object} options - Opções do evento
   * @param {string} options.bot - ID do bot
   * @param {string} options.offer_tier - Nível da oferta
   * @param {number} options.price_cents - Preço em centavos
   * @param {string} options.telegram_id - ID do usuário no Telegram
   * @param {string} options.transaction_id - ID da transação
   * @param {Object} options.meta - Metadados adicionais
   * @param {Pool} options.pool - Pool de conexão PostgreSQL
   * @param {string} [options.request_id] - ID do request para auditoria
   * @returns {Object} - Resultado da operação
   */
  async logPixPaid({ bot, offer_tier, price_cents, telegram_id, transaction_id, meta = {}, pool, request_id }) {
    if (!this.initialized) {
      throw new Error('FunnelEventsService não foi inicializado');
    }

    // Verificar idempotência para pix_paid (deve ser único por transaction_id)
    const idempotencyCheck = await idempotencyService.checkPixPaidIdempotency(
      { transaction_id, telegram_id }, 
      pool
    );

    if (idempotencyCheck.isDuplicate) {
      auditLogger.logIdempotencyCheck({
        transaction_id,
        event_type: 'pix_paid',
        is_duplicate: true,
        existing_event_id: idempotencyCheck.existingEvent.id
      }, { request_id });

      return {
        success: true,
        event_id: idempotencyCheck.existingEvent.id,
        occurred_at: idempotencyCheck.existingEvent.occurred_at,
        message: 'Pagamento já foi registrado anteriormente',
        isDuplicate: true,
        existingEvent: idempotencyCheck.existingEvent
      };
    }

    // Verificar coerência de preços
    const priceConsistency = await idempotencyService.checkPriceConsistency(
      { transaction_id, telegram_id, price_cents, offer_tier },
      pool
    );

    if (!priceConsistency.isConsistent) {
      auditLogger.logPriceInconsistency({
        transaction_id,
        telegram_id,
        offer_tier,
        price_shown_cents: priceConsistency.shownPrice,
        price_actual_cents: price_cents,
        difference_cents: priceConsistency.difference,
        percentage_diff: priceConsistency.percentageDiff
      }, { request_id });
    }

    const eventData = {
      event_name: 'pix_paid',
      bot,
      telegram_id,
      offer_tier,
      price_cents,
      transaction_id,
      meta: {
        timestamp: new Date().toISOString(),
        source: 'telegram_bot',
        payment_method: 'pix',
        payment_status: 'confirmed',
        idempotency_check: idempotencyCheck,
        price_consistency: priceConsistency,
        ...meta
      }
    };

    const result = await this.logEvent(eventData, pool);

    // Registrar no cache de idempotência se foi registrado com sucesso
    if (result.success && result.event_id) {
      idempotencyService.registerEvent('pix_paid', transaction_id, telegram_id, {
        id: result.event_id,
        occurred_at: result.occurred_at,
        price_cents,
        offer_tier
      });
    }

    // Log de auditoria
    auditLogger.logPaymentAudit({
      transaction_id,
      telegram_id,
      payload_id: meta.payload_id,
      bot_id: bot,
      offer_tier,
      price_cents,
      status: 'paid',
      event_type: 'pix_paid'
    }, { request_id });

    return {
      ...result,
      isDuplicate: false,
      priceConsistency
    };
  }

  /**
   * Busca eventos por critérios específicos
   * @param {Object} filters - Filtros de busca
   * @param {string} [filters.event_name] - Nome do evento
   * @param {string} [filters.bot] - ID do bot
   * @param {string|number} [filters.telegram_id] - ID do usuário
   * @param {string} [filters.payload_id] - ID do payload
   * @param {string} [filters.transaction_id] - ID da transação
   * @param {string} [filters.offer_tier] - Nível da oferta
   * @param {Date} [filters.start_date] - Data de início
   * @param {Date} [filters.end_date] - Data de fim
   * @param {number} [filters.limit] - Limite de resultados
   * @param {number} [filters.offset] - Offset para paginação
   * @returns {Object} - Resultado da busca
   */
  async queryEvents(filters = {}) {
    if (!this.initialized || !this.pool) {
      throw new Error('Serviço não inicializado. Chame initialize() primeiro.');
    }

    const client = await this.pool.connect();
    
    try {
      let query = 'SELECT * FROM funnel_events WHERE 1=1';
      const values = [];
      let paramIndex = 1;
      
      // Aplicar filtros
      if (filters.event_name) {
        query += ` AND event_name = $${paramIndex++}`;
        values.push(filters.event_name);
      }
      
      if (filters.bot) {
        query += ` AND bot = $${paramIndex++}`;
        values.push(filters.bot);
      }
      
      if (filters.telegram_id) {
        query += ` AND telegram_id = $${paramIndex++}`;
        values.push(String(filters.telegram_id));
      }
      
      if (filters.payload_id) {
        query += ` AND payload_id = $${paramIndex++}`;
        values.push(filters.payload_id);
      }
      
      if (filters.transaction_id) {
        query += ` AND transaction_id = $${paramIndex++}`;
        values.push(filters.transaction_id);
      }
      
      if (filters.offer_tier) {
        query += ` AND offer_tier = $${paramIndex++}`;
        values.push(filters.offer_tier);
      }
      
      if (filters.start_date) {
        query += ` AND occurred_at >= $${paramIndex++}`;
        values.push(filters.start_date);
      }
      
      if (filters.end_date) {
        query += ` AND occurred_at <= $${paramIndex++}`;
        values.push(filters.end_date);
      }
      
      // Ordenar por data mais recente
      query += ' ORDER BY occurred_at DESC';
      
      // Aplicar limite e offset
      if (filters.limit) {
        query += ` LIMIT $${paramIndex++}`;
        values.push(filters.limit);
      }
      
      if (filters.offset) {
        query += ` OFFSET $${paramIndex++}`;
        values.push(filters.offset);
      }
      
      const result = await client.query(query, values);
      
      // Formatar timestamps para o timezone correto
      const formattedEvents = result.rows.map(event => ({
        ...event,
        formatted_occurred_at: this.formatTimestampForTimezone(event.occurred_at)
      }));
      
      return {
        success: true,
        events: formattedEvents,
        total: formattedEvents.length,
        query: query,
        filters: filters
      };
      
    } catch (error) {
      console.error('❌ Erro ao buscar eventos:', error.message);
      
      return {
        success: false,
        error: 'Erro interno do banco',
        details: error.message
      };
      
    } finally {
      client.release();
    }
  }

  /**
   * Obtém estatísticas dos eventos
   * @param {Object} options - Opções de agregação
   * @param {string} [options.group_by] - Campo para agrupar (event_name, bot, offer_tier)
   * @param {Date} [options.start_date] - Data de início
   * @param {Date} [options.end_date] - Data de fim
   * @returns {Object} - Estatísticas agregadas
   */
  async getEventStats(options = {}) {
    if (!this.initialized || !this.pool) {
      throw new Error('Serviço não inicializado. Chame initialize() primeiro.');
    }

    const client = await this.pool.connect();
    
    try {
      let query = 'SELECT ';
      const values = [];
      let paramIndex = 1;
      
      if (options.group_by) {
        query += `${options.group_by}, `;
      }
      
      query += `
        COUNT(*) as total_events,
        COUNT(DISTINCT telegram_id) as unique_users,
        COUNT(DISTINCT session_id) as unique_sessions,
        SUM(CASE WHEN price_cents IS NOT NULL THEN price_cents ELSE 0 END) as total_revenue_cents,
        AVG(CASE WHEN price_cents IS NOT NULL THEN price_cents ELSE NULL END) as avg_price_cents,
        MIN(occurred_at) as first_event,
        MAX(occurred_at) as last_event
      FROM funnel_events
      WHERE 1=1
      `;
      
      if (options.start_date) {
        query += ` AND occurred_at >= $${paramIndex++}`;
        values.push(options.start_date);
      }
      
      if (options.end_date) {
        query += ` AND occurred_at <= $${paramIndex++}`;
        values.push(options.end_date);
      }
      
      if (options.group_by) {
        query += ` GROUP BY ${options.group_by}`;
      }
      
      query += ' ORDER BY total_events DESC';
      
      const result = await client.query(query, values);
      
      return {
        success: true,
        stats: result.rows,
        timezone: this.timezone
      };
      
    } catch (error) {
      console.error('❌ Erro ao obter estatísticas:', error.message);
      
      return {
        success: false,
        error: 'Erro interno do banco',
        details: error.message
      };
      
    } finally {
      client.release();
    }
  }

  /**
   * Verifica a saúde do serviço
   * @returns {Object} - Status do serviço
   */
  getHealthStatus() {
    return {
      service: 'FunnelEventsService',
      initialized: this.initialized,
      timezone: this.timezone,
      pool_available: !!this.pool,
      timestamp: this.formatTimestampForTimezone(new Date())
    };
  }
}

// Instância singleton
let instance = null;

/**
 * Obtém instância singleton do serviço
 * @returns {FunnelEventsService} - Instância do serviço
 */
function getInstance() {
  if (!instance) {
    instance = new FunnelEventsService();
  }
  return instance;
}

module.exports = {
  FunnelEventsService,
  getInstance
};
