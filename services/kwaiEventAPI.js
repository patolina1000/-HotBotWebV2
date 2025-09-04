const axios = require('axios');

/**
 * Serviço para enviar eventos para a Kwai Event API
 * Documentação: https://www.adsnebula.com/log/common/api
 */
class KwaiEventAPI {
  constructor() {
    this.baseUrl = 'https://www.adsnebula.com/log/common/api';
    
    // 🔥 NOVO: Permitir testes em produção via KWAI_TEST_MODE
    const isTestMode = process.env.KWAI_TEST_MODE === 'true';
    
    this.config = {
      pixelId: process.env.KWAI_PIXEL_ID || '',
      accessToken: process.env.KWAI_ACCESS_TOKEN || '',
      testFlag: false, // false sempre (requisito da Kwai)
      trackFlag: isTestMode, // true para testes, false para produção
      isAttributed: 1,
      mmpcode: 'PL',
      pixelSdkVersion: '9.9.9'
    };
    
    // Log do modo de operação
    console.log(`🎯 [KwaiEventAPI] Inicializado em modo ${isTestMode ? 'TESTE' : 'PRODUÇÃO'}`);
    console.log(`🎯 [KwaiEventAPI] trackFlag: ${this.config.trackFlag}`);
  }

  /**
   * Validar configurações necessárias
   */
  validateConfig() {
    if (!this.config.pixelId) {
      throw new Error('KWAI_PIXEL_ID não configurado nas variáveis de ambiente');
    }
    if (!this.config.accessToken) {
      throw new Error('KWAI_ACCESS_TOKEN não configurado nas variáveis de ambiente');
    }
  }

  /**
   * Enviar evento para a Kwai Event API
   * @param {Object} eventData - Dados do evento
   * @param {string} eventData.clickid - Click ID capturado da URL
   * @param {string} eventData.eventName - Nome do evento (EVENT_CONTENT_VIEW, EVENT_ADD_TO_CART, EVENT_PURCHASE)
   * @param {Object} eventData.properties - Propriedades opcionais do evento
   * @returns {Promise<Object>} Resposta da API
   */
  async sendEvent(eventData) {
    try {
      this.validateConfig();

      const { clickid, eventName, properties = {} } = eventData;

      if (!clickid) {
        console.warn('⚠️ [KwaiEventAPI] Click ID não fornecido, evento não será enviado');
        return { success: false, reason: 'Click ID não fornecido' };
      }

      if (!eventName) {
        throw new Error('Nome do evento é obrigatório');
      }

      // Preparar payload
      const payload = {
        access_token: this.config.accessToken,
        clickid: clickid,
        event_name: eventName,
        pixelId: this.config.pixelId,
        testFlag: this.config.testFlag,
        trackFlag: this.config.trackFlag,
        is_attributed: this.config.isAttributed,
        mmpcode: this.config.mmpcode,
        pixelSdkVersion: this.config.pixelSdkVersion
      };

      // Adicionar properties se fornecidas
      if (Object.keys(properties).length > 0) {
        payload.properties = JSON.stringify(properties);
      }

      console.log(`🎯 [KwaiEventAPI] Enviando evento ${eventName}:`, {
        clickid: clickid.substring(0, 10) + '...',
        eventName,
        properties,
        testMode: this.config.testFlag
      });

      const response = await axios.post(this.baseUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json;charset=utf-8'
        },
        timeout: 10000
      });

      console.log(`✅ [KwaiEventAPI] Evento ${eventName} enviado com sucesso:`, response.data);
      return { success: true, data: response.data };

    } catch (error) {
      console.error(`❌ [KwaiEventAPI] Erro ao enviar evento ${eventData.eventName}:`, {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });

      return { 
        success: false, 
        error: error.message,
        response: error.response?.data
      };
    }
  }

  /**
   * Enviar evento EVENT_CONTENT_VIEW
   * @param {string} clickid - Click ID do usuário
   * @param {Object} options - Opções do evento
   * @returns {Promise<Object>}
   */
  async sendContentView(clickid, options = {}) {
    const properties = {
      event_timestamp: Date.now(),
      content_type: 'product',
      content_name: options.contentName || 'Landing Page',
      content_category: options.contentCategory || 'Bot Telegram',
      currency: 'BRL',
      ...options.properties
    };

    return this.sendEvent({
      clickid,
      eventName: 'EVENT_CONTENT_VIEW',
      properties
    });
  }

  /**
   * Enviar evento EVENT_ADD_TO_CART
   * @param {string} clickid - Click ID do usuário
   * @param {Object} options - Opções do evento
   * @returns {Promise<Object>}
   */
  async sendAddToCart(clickid, options = {}) {
    const properties = {
      event_timestamp: Date.now(),
      content_type: 'product',
      content_id: options.contentId || 'telegram_bot_access',
      content_name: options.contentName || 'Acesso ao Bot Telegram',
      content_category: options.contentCategory || 'Bot Telegram',
      currency: 'BRL',
      value: options.value || 0,
      quantity: 1,
      ...options.properties
    };

    return this.sendEvent({
      clickid,
      eventName: 'EVENT_ADD_TO_CART',
      properties
    });
  }

  /**
   * Enviar evento EVENT_PURCHASE
   * @param {string} clickid - Click ID do usuário
   * @param {Object} options - Opções do evento
   * @returns {Promise<Object>}
   */
  async sendPurchase(clickid, options = {}) {
    const properties = {
      event_timestamp: Date.now(),
      content_type: 'product',
      content_id: options.contentId || 'telegram_bot_access',
      content_name: options.contentName || 'Acesso ao Bot Telegram',
      content_category: options.contentCategory || 'Bot Telegram',
      currency: 'BRL',
      value: options.value || 0,
      quantity: 1,
      ...options.properties
    };

    return this.sendEvent({
      clickid,
      eventName: 'EVENT_PURCHASE',
      properties
    });
  }
}

module.exports = new KwaiEventAPI();
