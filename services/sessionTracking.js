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
    
    // Cache secundário para fallback com controle de tamanho
    this.fallbackCache = new Map();
    
    // CONFIGURAÇÕES DE CONTROLE DE MEMORY LEAK
    this.maxCacheSize = 1000; // Limite máximo de entradas
    this.maxFallbackSize = 500; // Limite para fallback cache
    this.cleanupStats = {
      totalCleanups: 0,
      entriesRemoved: 0,
      lastCleanup: null
    };
    
    // Limpeza periódica mais agressiva
    this.cleanupInterval = setInterval(() => {
      this.cleanupFallbackCache();
      this.enforceMaxCacheSize();
    }, 1800000); // 30 minutos (mais frequente)
    
    console.log('📊 SessionTrackingService iniciado com TTL de', ttl, 'segundos');
    console.log(`🔒 Limites de cache: Principal=${this.maxCacheSize}, Fallback=${this.maxFallbackSize}`);
  }

  /**
   * Armazena dados de rastreamento para um usuário
   * @param {string|number} telegramId - ID do usuário no Telegram
   * @param {Object} trackingData - Dados de rastreamento
   * @param {string} trackingData.fbp - Cookie _fbp do Facebook
   * @param {string} trackingData.fbc - Cookie _fbc do Facebook  
   * @param {string} trackingData.ip - IP do usuário
   * @param {string} trackingData.user_agent - User Agent do navegador
   * @param {string} trackingData.kwai_click_id - Click ID do Kwai (opcional)
   * @param {Object} trackingData.utm - Dados de UTM (opcional)
   */
  storeTrackingData(telegramId, trackingData) {
    if (!telegramId) {
      console.warn('SessionTracking: telegram_id obrigatório');
      return false;
    }

    // Verificar e aplicar limite de cache ANTES de adicionar
    this.enforceMaxCacheSize();

    const key = this.getKey(telegramId);
    const timestamp = Date.now();
    
    const data = {
      telegram_id: telegramId,
      fbp: trackingData.fbp || null,
      fbc: trackingData.fbc || null,
      ip: trackingData.ip || null,
      user_agent: trackingData.user_agent || null,
      kwai_click_id: trackingData.kwai_click_id || null,
      utm_source: trackingData.utm_source || null,
      utm_medium: trackingData.utm_medium || null,
      utm_campaign: trackingData.utm_campaign || null,
      utm_term: trackingData.utm_term || null,
      utm_content: trackingData.utm_content || null,
      geo_country: trackingData.geo_country || trackingData.geo?.country || null,
      geo_country_code: trackingData.geo_country_code || trackingData.geo?.country_code || null,
      geo_region: trackingData.geo_region || trackingData.geo?.region || null,
      geo_region_name: trackingData.geo_region_name || trackingData.geo?.region_name || null,
      geo_city: trackingData.geo_city || trackingData.geo?.city || null,
      geo_postal_code: trackingData.geo_postal_code || trackingData.geo?.postal_code || null,
      geo_ip_query: trackingData.geo_ip_query || trackingData.geo?.ip || null,
      created_at: timestamp,
      last_updated: timestamp,
      access_count: 1 // Para política LRU
    };

    // Armazena no cache principal
    this.cache.set(key, data);
    
    // Backup no fallback cache (com controle de tamanho)
    if (this.fallbackCache.size < this.maxFallbackSize) {
      this.fallbackCache.set(key, { 
        data, 
        expires: timestamp + (259200 * 1000),
        lastAccess: timestamp 
      });
    }
    
    console.log(`📱 Dados de rastreamento armazenados para usuário ${telegramId}:`, {
      fbp: !!data.fbp,
      fbc: !!data.fbc,
      ip: !!data.ip,
      kwai_click_id: !!data.kwai_click_id,
      utm_source: data.utm_source,
      cache_size: this.cache.keys().length,
      fallback_size: this.fallbackCache.size
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
        // Atualizar último acesso para LRU
        fallback.lastAccess = Date.now();
        // Recoloca no cache principal se houver espaço
        if (this.cache.keys().length < this.maxCacheSize) {
          this.cache.set(key, data);
        }
      }
    }
    
    // Atualizar contador de acesso para LRU
    if (data) {
      data.access_count = (data.access_count || 0) + 1;
      data.last_access = Date.now();
    }
    
    if (data) {
      console.log(`📱 Dados de rastreamento recuperados para usuário ${telegramId}:`, {
        fbp: !!data.fbp,
        fbc: !!data.fbc,
        kwai_click_id: !!data.kwai_click_id,
        age_minutes: Math.round((Date.now() - data.created_at) / 60000),
        access_count: data.access_count
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
   * Verifica se há dados válidos de Kwai para um usuário
   * @param {string|number} telegramId - ID do usuário no Telegram
   * @returns {boolean}
   */
  hasKwaiData(telegramId) {
    const data = this.getTrackingData(telegramId);
    return !!(data && data.kwai_click_id);
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
   * Retorna apenas os dados necessários para eventos Kwai
   * @param {string|number} telegramId - ID do usuário no Telegram
   * @returns {Object|null}
   */
  getKwaiData(telegramId) {
    const data = this.getTrackingData(telegramId);
    if (!data) return null;

    return {
      kwai_click_id: data.kwai_click_id,
      client_ip_address: data.ip,
      client_user_agent: data.user_agent
    };
  }

  /**
   * Limpa dados expirados do fallback cache COM POLÍTICA LRU
   */
  cleanupFallbackCache() {
    const now = Date.now();
    let expiredCleaned = 0;
    let lruCleaned = 0;
    
    // 1. Remover entradas expiradas primeiro
    for (const [key, entry] of this.fallbackCache) {
      if (entry.expires <= now) {
        this.fallbackCache.delete(key);
        expiredCleaned++;
      }
    }
    
    // 2. Se ainda ultrapassar o limite, aplicar LRU
    if (this.fallbackCache.size > this.maxFallbackSize) {
      // Converter para array e ordenar por lastAccess (mais antigos primeiro)
      const entries = Array.from(this.fallbackCache.entries());
      entries.sort((a, b) => (a[1].lastAccess || 0) - (b[1].lastAccess || 0));
      
      // Remover os mais antigos até atingir o limite
      const excessEntries = this.fallbackCache.size - this.maxFallbackSize;
      for (let i = 0; i < excessEntries; i++) {
        const [key] = entries[i];
        this.fallbackCache.delete(key);
        lruCleaned++;
      }
    }
    
    // Atualizar estatísticas
    this.cleanupStats.totalCleanups++;
    this.cleanupStats.entriesRemoved += (expiredCleaned + lruCleaned);
    this.cleanupStats.lastCleanup = new Date().toISOString();
    
    if ((expiredCleaned + lruCleaned) > 0) {
      console.log(`SessionTracking: Cache cleanup executado`);
      console.log(`  - Expirados removidos: ${expiredCleaned}`);
      console.log(`  - LRU removidos: ${lruCleaned}`);
      console.log(`  - Cache size atual: ${this.fallbackCache.size}/${this.maxFallbackSize}`);
    }
  }

  /**
   * NOVA: Aplicar limite máximo no cache principal
   */
  enforceMaxCacheSize() {
    const currentSize = this.cache.keys().length;
    
    if (currentSize > this.maxCacheSize) {
      // NodeCache não tem LRU nativo, então removemos aleatoriamente as mais antigas
      const keys = this.cache.keys();
      const excessKeys = currentSize - this.maxCacheSize;
      
      // Remover as primeiras chaves (aproximação de FIFO)
      for (let i = 0; i < excessKeys; i++) {
        this.cache.del(keys[i]);
      }
      
      console.log(`Cache principal reduzido: ${currentSize} -> ${this.cache.keys().length} entradas`);
    }
  }

  /**
   * Retorna estatísticas detalhadas do cache
   */
  getStats() {
    const mainKeys = this.cache.keys();
    const fallbackKeys = Array.from(this.fallbackCache.keys());
    
    return {
      main_cache_entries: mainKeys.length,
      main_cache_limit: this.maxCacheSize,
      main_cache_usage_percent: Math.round((mainKeys.length / this.maxCacheSize) * 100),
      fallback_cache_entries: fallbackKeys.length,
      fallback_cache_limit: this.maxFallbackSize,
      fallback_cache_usage_percent: Math.round((fallbackKeys.length / this.maxFallbackSize) * 100),
      total_users_tracked: new Set([...mainKeys, ...fallbackKeys]).size,
      cleanup_stats: this.cleanupStats,
      memory_status: mainKeys.length > (this.maxCacheSize * 0.8) ? 'HIGH' : 'NORMAL'
    };
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
    console.log(`📈 Estatísticas finais: ${this.cleanupStats.totalCleanups} limpezas, ${this.cleanupStats.entriesRemoved} entradas removidas`);
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
