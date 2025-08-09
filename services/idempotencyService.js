/**
 * idempotencyService.js - Serviço de Validação de Idempotência
 * 
 * Este módulo implementa:
 * - Validação de idempotência para eventos pix_paid
 * - Proteção contra recriação de pix_created
 * - Verificação de coerência de preços
 * - Cache em memória para performance
 */

const auditLogger = require('./auditLogger');

class IdempotencyService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutos
    this.maxCacheSize = 10000; // Máximo de 10k entradas
  }

  /**
   * Gera chave única para cache baseada nos parâmetros
   * @param {string} eventType - Tipo do evento
   * @param {string} transactionId - ID da transação
   * @param {string} [telegramId] - ID do Telegram (opcional)
   * @returns {string} Chave única para cache
   */
  generateCacheKey(eventType, transactionId, telegramId = null) {
    const parts = [eventType, transactionId];
    if (telegramId) parts.push(telegramId);
    return parts.join('|');
  }

  /**
   * Verifica se um evento já foi processado
   * @param {string} eventType - Tipo do evento
   * @param {string} transactionId - ID da transação
   * @param {string} [telegramId] - ID do Telegram (opcional)
   * @returns {Object} Resultado da verificação
   */
  checkEventExists(eventType, transactionId, telegramId = null) {
    const cacheKey = this.generateCacheKey(eventType, transactionId, telegramId);
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return {
        exists: true,
        cached: true,
        data: cached.data,
        timestamp: cached.timestamp
      };
    }
    
    return { exists: false, cached: false };
  }

  /**
   * Verifica se um webhook já foi processado (para validação de reprocessamento)
   * @param {string} eventType - Tipo do evento
   * @param {string} transactionId - ID da transação
   * @param {string} [telegramId] - ID do Telegram (opcional)
   * @returns {Promise<Object>} Resultado da verificação
   */
  async checkWebhookProcessed(eventType, transactionId, telegramId = null) {
    try {
      // Verificar cache primeiro
      const cacheCheck = this.checkEventExists(eventType, transactionId, telegramId);
      if (cacheCheck.exists) {
        return {
          exists: true,
          cached: true,
          data: cacheCheck.data,
          timestamp: cacheCheck.timestamp
        };
      }
      
      // Se não estiver no cache, retornar que não existe
      // (não vamos consultar o banco aqui para evitar overhead)
      return {
        exists: false,
        cached: false
      };
      
    } catch (error) {
      console.error('Erro ao verificar webhook processado:', error);
      return {
        exists: false,
        cached: false,
        error: error.message
      };
    }
  }

  /**
   * Registra um evento no cache para evitar duplicação
   * @param {string} eventType - Tipo do evento
   * @param {string} transactionId - ID da transação
   * @param {string} [telegramId] - ID do Telegram (opcional)
   * @param {Object} eventData - Dados do evento
   */
  registerEvent(eventType, transactionId, telegramId = null, eventData = {}) {
    const cacheKey = this.generateCacheKey(eventType, transactionId, telegramId);
    
    // Limpar cache se estiver muito grande
    if (this.cache.size >= this.maxCacheSize) {
      this.cleanupCache();
    }
    
    this.cache.set(cacheKey, {
      timestamp: Date.now(),
      data: eventData
    });
  }

  /**
   * Verifica idempotência para evento pix_paid
   * @param {Object} pixData - Dados do PIX pago
   * @param {Object} pool - Pool de conexão PostgreSQL
   * @returns {Object} Resultado da validação
   */
  async checkPixPaidIdempotency(pixData, pool) {
    const { transaction_id, telegram_id } = pixData;
    
    try {
      // Verificar cache primeiro
      const cacheCheck = this.checkEventExists('pix_paid', transaction_id, telegram_id);
      if (cacheCheck.exists) {
        auditLogger.logIdempotencyCheck({
          transaction_id,
          event_type: 'pix_paid',
          is_duplicate: true,
          existing_event_id: cacheCheck.data.id
        });
        
        return {
          isDuplicate: true,
          reason: 'Evento já processado (cache)',
          existingEvent: cacheCheck.data
        };
      }
      
      // Verificar banco de dados
      const query = `
        SELECT id, occurred_at, price_cents, offer_tier, meta
        FROM funnel_events 
        WHERE event_name = 'pix_paid' 
        AND transaction_id = $1
        ORDER BY occurred_at DESC 
        LIMIT 1
      `;
      
      const result = await pool.query(query, [transaction_id]);
      
      if (result.rows.length > 0) {
        const existingEvent = result.rows[0];
        
        // Registrar no cache
        this.registerEvent('pix_paid', transaction_id, telegram_id, existingEvent);
        
        auditLogger.logIdempotencyCheck({
          transaction_id,
          event_type: 'pix_paid',
          is_duplicate: true,
          existing_event_id: existingEvent.id
        });
        
        return {
          isDuplicate: true,
          reason: 'Evento já processado (banco)',
          existingEvent: existingEvent
        };
      }
      
      return {
        isDuplicate: false,
        reason: 'Evento novo'
      };
      
    } catch (error) {
      auditLogger.logError(error, {
        context: 'checkPixPaidIdempotency',
        transaction_id,
        telegram_id
      });
      
      // Em caso de erro, permitir o processamento para não bloquear
      return {
        isDuplicate: false,
        reason: 'Erro na validação, permitindo processamento',
        error: error.message
      };
    }
  }

  /**
   * Verifica se pix_created já existe e é válido
   * @param {Object} pixData - Dados do PIX a ser criado
   * @param {Object} pool - Pool de conexão PostgreSQL
   * @returns {Object} Resultado da validação
   */
  async checkPixCreatedIdempotency(pixData, pool) {
    const { transaction_id, telegram_id } = pixData;
    
    try {
      // Verificar cache primeiro
      const cacheCheck = this.checkEventExists('pix_created', transaction_id, telegram_id);
      if (cacheCheck.exists) {
        const cachedEvent = cacheCheck.data;
        
        // Verificar se o PIX ainda é válido (não expirado)
        const eventAge = Date.now() - new Date(cachedEvent.occurred_at).getTime();
        const maxAge = 30 * 60 * 1000; // 30 minutos
        
        if (eventAge < maxAge) {
          auditLogger.logIdempotencyCheck({
            transaction_id,
            event_type: 'pix_created',
            is_duplicate: true,
            existing_event_id: cachedEvent.id
          });
          
          return {
            isDuplicate: true,
            reason: 'PIX já criado e ainda válido',
            existingEvent: cachedEvent,
            isExpired: false
          };
        }
      }
      
      // Verificar banco de dados
      const query = `
        SELECT id, occurred_at, price_cents, offer_tier, meta
        FROM funnel_events 
        WHERE event_name = 'pix_created' 
        AND transaction_id = $1
        ORDER BY occurred_at DESC 
        LIMIT 1
      `;
      
      const result = await pool.query(query, [transaction_id]);
      
      if (result.rows.length > 0) {
        const existingEvent = result.rows[0];
        const eventAge = Date.now() - new Date(existingEvent.occurred_at).getTime();
        const maxAge = 30 * 60 * 1000; // 30 minutos
        
        if (eventAge < maxAge) {
          // Registrar no cache
          this.registerEvent('pix_created', transaction_id, telegram_id, existingEvent);
          
          auditLogger.logIdempotencyCheck({
            transaction_id,
            event_type: 'pix_created',
            is_duplicate: true,
            existing_event_id: existingEvent.id
          });
          
          return {
            isDuplicate: true,
            reason: 'PIX já criado e ainda válido',
            existingEvent: existingEvent,
            isExpired: false
          };
        } else {
          return {
            isDuplicate: false,
            reason: 'PIX anterior expirado, permitindo nova criação',
            existingEvent: existingEvent,
            isExpired: true
          };
        }
      }
      
      return {
        isDuplicate: false,
        reason: 'Nenhum PIX anterior encontrado'
      };
      
    } catch (error) {
      auditLogger.logError(error, {
        context: 'checkPixCreatedIdempotency',
        transaction_id,
        telegram_id
      });
      
      // Em caso de erro, permitir o processamento
      return {
        isDuplicate: false,
        reason: 'Erro na validação, permitindo processamento',
        error: error.message
      };
    }
  }

  /**
   * Verifica coerência de preços entre eventos
   * @param {Object} priceData - Dados de preço para validação
   * @param {Object} pool - Pool de conexão PostgreSQL
   * @returns {Object} Resultado da validação
   */
  async checkPriceConsistency(priceData, pool) {
    const { transaction_id, telegram_id, price_cents, offer_tier } = priceData;
    
    try {
      // Buscar último evento offer_shown para o usuário
      const query = `
        SELECT price_cents, offer_tier, occurred_at
        FROM funnel_events 
        WHERE event_name = 'offer_shown' 
        AND telegram_id = $1
        AND offer_tier = $2
        ORDER BY occurred_at DESC 
        LIMIT 1
      `;
      
      const result = await pool.query(query, [telegram_id, offer_tier]);
      
      if (result.rows.length > 0) {
        const shownEvent = result.rows[0];
        const priceDifference = Math.abs(price_cents - shownEvent.price_cents);
        const percentageDiff = ((priceDifference / shownEvent.price_cents) * 100).toFixed(2);
        
        // Se diferença > 1%, logar alerta
        if (priceDifference > (shownEvent.price_cents * 0.01)) {
          auditLogger.logPriceInconsistency({
            transaction_id,
            telegram_id,
            offer_tier,
            price_shown_cents: shownEvent.price_cents,
            price_actual_cents: price_cents,
            difference_cents: priceDifference,
            percentage_diff: percentageDiff
          });
          
          return {
            isConsistent: false,
            reason: 'Diferença de preço detectada',
            shownPrice: shownEvent.price_cents,
            actualPrice: price_cents,
            difference: priceDifference,
            percentageDiff: percentageDiff,
            severity: 'WARNING'
          };
        }
      }
      
      return {
        isConsistent: true,
        reason: 'Preços consistentes'
      };
      
    } catch (error) {
      auditLogger.logError(error, {
        context: 'checkPriceConsistency',
        transaction_id,
        telegram_id
      });
      
      return {
        isConsistent: true,
        reason: 'Erro na validação, assumindo consistência',
        error: error.message
      };
    }
  }

  /**
   * Limpa cache expirado
   */
  cleanupCache() {
    const now = Date.now();
    const expiredKeys = [];
    
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheTimeout) {
        expiredKeys.push(key);
      }
    }
    
    expiredKeys.forEach(key => this.cache.delete(key));
    
    if (expiredKeys.length > 0) {
      console.log(`🧹 Cache limpo: ${expiredKeys.length} entradas expiradas removidas`);
    }
  }

  /**
   * Obtém estatísticas do cache
   * @returns {Object} Estatísticas do cache
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      timeout: this.cacheTimeout,
      utilization: ((this.cache.size / this.maxCacheSize) * 100).toFixed(2) + '%'
    };
  }

  /**
   * Limpa todo o cache (útil para testes)
   */
  clearCache() {
    this.cache.clear();
    console.log('🗑️ Cache completamente limpo');
  }
}

// Singleton instance
const idempotencyService = new IdempotencyService();

module.exports = idempotencyService;
