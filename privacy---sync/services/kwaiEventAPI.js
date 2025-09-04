const axios = require('axios');
const { getConfig } = require('../loadConfig');

/**
 * Serviço para enviar eventos para a Kwai Event API
 * Documentação: https://www.adsnebula.com/log/common/api
 * Implementado para a pasta privacy---sync
 */
class KwaiEventAPI {
  constructor() {
    this.baseUrl = 'https://www.adsnebula.com/log/common/api';
    this.config = getConfig().kwai;
  }

  /**
   * Validar configurações necessárias
   */
  validateConfig() {
    if (!this.config.pixelId) {
      throw new Error('KWAI_PIXEL_ID não configurado');
    }
    if (!this.config.accessToken) {
      throw new Error('KWAI_ACCESS_TOKEN não configurado');
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
   * Enviar evento de visualização de conteúdo
   * @param {string} clickid - Click ID capturado da URL
   * @param {Object} properties - Propriedades opcionais
   * @returns {Promise<Object>} Resposta da API
   */
  async sendContentView(clickid, properties = {}) {
    const defaultProperties = {
      content_name: 'Privacy - Landing Page',
      content_category: 'Privacy',
      content_id: 'privacy_landing',
      currency: 'BRL'
    };

    return this.sendEvent({
      clickid,
      eventName: 'EVENT_CONTENT_VIEW',
      properties: { ...defaultProperties, ...properties }
    });
  }

  /**
   * Enviar evento de adicionar ao carrinho
   * @param {string} clickid - Click ID capturado da URL
   * @param {number} value - Valor em reais
   * @param {Object} properties - Propriedades opcionais
   * @returns {Promise<Object>} Resposta da API
   */
  async sendAddToCart(clickid, value, properties = {}) {
    const defaultProperties = {
      value: value,
      contentName: 'Privacy - Assinatura',
      contentId: `privacy_plan_${Date.now()}`,
      contentCategory: 'Privacy',
      currency: 'BRL',
      quantity: 1
    };

    return this.sendEvent({
      clickid,
      eventName: 'EVENT_ADD_TO_CART',
      properties: { ...defaultProperties, ...properties }
    });
  }

  /**
   * Enviar evento de compra aprovada
   * @param {string} clickid - Click ID capturado da URL
   * @param {number} value - Valor pago em reais
   * @param {Object} properties - Propriedades opcionais
   * @returns {Promise<Object>} Resposta da API
   */
  async sendPurchase(clickid, value, properties = {}) {
    const defaultProperties = {
      value: value,
      contentName: 'Privacy - Assinatura',
      contentId: `privacy_purchase_${Date.now()}`,
      contentCategory: 'Privacy',
      currency: 'BRL',
      quantity: 1
    };

    return this.sendEvent({
      clickid,
      eventName: 'EVENT_PURCHASE',
      properties: { ...defaultProperties, ...properties }
    });
  }

  /**
   * Verificar se o serviço está configurado
   * @returns {boolean} True se configurado, false caso contrário
   */
  isConfigured() {
    try {
      this.validateConfig();
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = KwaiEventAPI;
