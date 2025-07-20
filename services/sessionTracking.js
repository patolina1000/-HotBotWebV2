const NodeCache = require('node-cache');

/**
 * Serviço de Rastreamento de Sessão Invisível
 * Gerencia cookies _fbp/_fbc vinculados ao telegram_id
 * com TTL de 3 dias para anonimato total
 */
class SessionTrackingService {
  constructor(ttl = 259200) { // 3 dias em segundos
    // Cache em memória com TTL automático
    this.cache = new NodeCache({ 
      stdTTL: ttl, 
      checkperiod: 600,  // Verifica a cada 10 minutos
      useClones: false   // Performance
    });
    
    // Cache secundário para fallback
    this.fallbackCache = new Map();
    
    // Limpeza periódica do fallback cache
    this.cleanupInterval = setInterval(() => {
      this.cleanupFallbackCache();
    }, 3600000); // 1 hora
    
    console.log('📊 SessionTrackingService iniciado com TTL de', ttl, 'segundos');
  }

  /**
   * Armazena dados de rastreamento para um usuário
   * @param {string|number} telegramId - ID do usuário no Telegram
   * @param {Object} trackingData - Dados de rastreamento
   * @param {string} trackingData.fbp - Cookie _fbp do Facebook
   * @param {string} trackingData.fbc - Cookie _fbc do Facebook  
   * @param {string} trackingData.ip - IP do usuário
   * @param {string} trackingData.user_agent - User Agent do navegador
   * @param {Object} trackingData.utm - Dados de UTM (opcional)
   */
  storeTrackingData(telegramId, trackingData) {
    if (!telegramId) {
      console.warn('⚠️ SessionTracking: telegram_id obrigatório');
      return false;
    }

    const key = this.getKey(telegramId);
    const timestamp = Date.now();
    
    const data = {
      telegram_id: telegramId,
      fbp: trackingData.fbp || null,
      fbc: trackingData.fbc || null,
      ip: trackingData.ip || null,
      user_agent: trackingData.user_agent || null,
      utm_source: trackingData.utm_source || null,
      utm_medium: trackingData.utm_medium || null,
      utm_campaign: trackingData.utm_campaign || null,
      utm_term: trackingData.utm_term || null,
      utm_content: trackingData.utm_content || null,
      created_at: timestamp,
      last_updated: timestamp
    };

    // Armazena no cache principal
    this.cache.set(key, data);
    
    // Backup no fallback cache
    this.fallbackCache.set(key, { data, expires: timestamp + (259200 * 1000) });
    
    console.log(`📱 Dados de rastreamento armazenados para usuário ${telegramId}:`, {
      fbp: !!data.fbp,
      fbc: !!data.fbc,
      ip: !!data.ip,
      utm_source: data.utm_source
    });
    
    return true;
  }

  /**
   * Recupera dados de rastreamento de um usuário
   * @param {string|number} telegramId - ID do usuário no Telegram
   * @returns {Object|null} Dados de rastreamento ou null se não encontrado
   */
  getTrackingData(telegramId) {
    if (!telegramId) return null;

    const key = this.getKey(telegramId);
    
    // Tenta cache principal primeiro
    let data = this.cache.get(key);
    
    // Se não encontrou, tenta fallback
    if (!data) {
      const fallback = this.fallbackCache.get(key);
      if (fallback && fallback.expires > Date.now()) {
        data = fallback.data;
        // Recoloca no cache principal
        this.cache.set(key, data);
      }
    }
    
    if (data) {
      console.log(`📱 Dados de rastreamento recuperados para usuário ${telegramId}:`, {
        fbp: !!data.fbp,
        fbc: !!data.fbc,
        age_minutes: Math.round((Date.now() - data.created_at) / 60000)
      });
    }
    
    return data;
  }

  /**
   * Atualiza dados de rastreamento existentes
   * @param {string|number} telegramId - ID do usuário no Telegram
   * @param {Object} updateData - Dados para atualizar
   */
  updateTrackingData(telegramId, updateData) {
    const existing = this.getTrackingData(telegramId);
    if (!existing) {
      return this.storeTrackingData(telegramId, updateData);
    }

    const merged = {
      ...existing,
      ...updateData,
      last_updated: Date.now()
    };

    return this.storeTrackingData(telegramId, merged);
  }

  /**
   * Remove dados de rastreamento de um usuário
   * @param {string|number} telegramId - ID do usuário no Telegram
   */
  removeTrackingData(telegramId) {
    if (!telegramId) return false;

    const key = this.getKey(telegramId);
    this.cache.del(key);
    this.fallbackCache.delete(key);
    
    console.log(`🗑️ Dados de rastreamento removidos para usuário ${telegramId}`);
    return true;
  }

  /**
   * Verifica se há dados válidos de Facebook para um usuário
   * @param {string|number} telegramId - ID do usuário no Telegram
   * @returns {boolean}
   */
  hasFacebookData(telegramId) {
    const data = this.getTrackingData(telegramId);
    return !!(data && (data.fbp || data.fbc));
  }

  /**
   * Retorna apenas os dados necessários para eventos CAPI
   * @param {string|number} telegramId - ID do usuário no Telegram
   * @returns {Object|null}
   */
  getCAPIData(telegramId) {
    const data = this.getTrackingData(telegramId);
    if (!data) return null;

    return {
      fbp: data.fbp,
      fbc: data.fbc,
      client_ip_address: data.ip,
      client_user_agent: data.user_agent
    };
  }

  /**
   * Retorna estatísticas do cache
   */
  getStats() {
    const mainKeys = this.cache.keys();
    const fallbackKeys = Array.from(this.fallbackCache.keys());
    
    return {
      main_cache_entries: mainKeys.length,
      fallback_cache_entries: fallbackKeys.length,
      total_users_tracked: new Set([...mainKeys, ...fallbackKeys]).size
    };
  }

  /**
   * Limpa dados expirados do fallback cache
   */
  cleanupFallbackCache() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.fallbackCache) {
      if (entry.expires <= now) {
        this.fallbackCache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 SessionTracking: ${cleaned} entradas expiradas removidas do fallback cache`);
    }
  }

  /**
   * Gera chave normalizada para o cache
   * @param {string|number} telegramId 
   * @returns {string}
   */
  getKey(telegramId) {
    return `tracking_${telegramId}`;
  }

  /**
   * Destroi o serviço e limpa recursos
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.close();
    this.fallbackCache.clear();
    console.log('📊 SessionTrackingService destruído');
  }
}

// Instância singleton
let instance = null;

/**
 * Retorna instância singleton do serviço
 * @param {number} ttl - TTL em segundos (opcional, só usado na primeira chamada)
 * @returns {SessionTrackingService}
 */
function getInstance(ttl = 259200) {
  if (!instance) {
    instance = new SessionTrackingService(ttl);
  }
  return instance;
}

module.exports = {
  SessionTrackingService,
  getInstance
};