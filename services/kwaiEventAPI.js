const axios = require('axios');
const { getInstance: getSessionTracking } = require('./sessionTracking');

/**
 * Serviço de Integração com Kwai Event API
 * Implementação completa seguindo a documentação oficial da Kwai
 * 
 * Eventos suportados:
 * - EVENT_CONTENT_VIEW: Visualização de página/produto
 * - EVENT_ADD_TO_CART: Adicionar ao carrinho / Iniciar checkout
 * - EVENT_PURCHASE: Compra finalizada
 * - EVENT_INITIATED_CHECKOUT: Processo de checkout iniciado
 * - EVENT_BUTTON_CLICK: Clique em botão
 * - EVENT_FORM_SUBMIT: Envio de formulário
 */
class KwaiEventAPIService {
  constructor() {
    this.accessToken = process.env.KWAI_ACCESS_TOKEN;
    this.pixelId = process.env.KWAI_PIXEL_ID;
    this.testMode = process.env.KWAI_TEST_MODE === 'true';
    this.apiUrl = 'https://www.adsnebula.com/log/common/api';
    
    // Lista de eventos suportados pela Kwai
    this.supportedEvents = [
      'EVENT_CONTENT_VIEW',
      'EVENT_ADD_TO_CART', 
      'EVENT_PURCHASE',
      'EVENT_INITIATED_CHECKOUT',
      'EVENT_BUTTON_CLICK',
      'EVENT_FORM_SUBMIT',
      'EVENT_ADD_PAYMENT_INFO',
      'EVENT_DOWNLOAD',
      'EVENT_CONTACT',
      'EVENT_PLACE_ORDER',
      'EVENT_SEARCH',
      'EVENT_COMPLETE_REGISTRATION',
      'EVENT_ADD_TO_WISHLIST',
      'EVENT_SUBSCRIBE'
    ];
    
    // Validação das configurações
    this.validateConfig();
    
    console.log('🎯 KwaiEventAPIService iniciado (v2.0):', {
      pixelId: this.pixelId,
      testMode: this.testMode,
      hasAccessToken: !!this.accessToken,
      apiUrl: this.apiUrl
    });
  }

  /**
   * Valida se as configurações necessárias estão presentes
   */
  validateConfig() {
    if (!this.accessToken) {
      console.warn('⚠️ KWAI_ACCESS_TOKEN não definido. Eventos Kwai não serão enviados.');
    }
    if (!this.pixelId) {
      console.warn('⚠️ KWAI_PIXEL_ID não definido. Eventos Kwai não serão enviados.');
    }
  }

  /**
   * Envia evento para a Kwai Event API seguindo a documentação oficial
   * @param {string} eventName - Nome do evento (EVENT_CONTENT_VIEW, EVENT_ADD_TO_CART, EVENT_PURCHASE, etc.)
   * @param {string} clickid - Click ID do Kwai (obrigatório)
   * @param {Object} properties - Propriedades do evento
   * @param {string} properties.content_id - ID do conteúdo/produto
   * @param {string} properties.content_name - Nome do produto/plano
   * @param {string} properties.content_type - Tipo do conteúdo ("product" ou "product_group")
   * @param {string} properties.currency - Moeda (BRL, USD, IDR)
   * @param {number} properties.value - Valor do evento
   * @param {number} properties.quantity - Quantidade (opcional)
   * @param {number} properties.price - Preço unitário (opcional)
   * @param {string} properties.content_category - Categoria do produto (opcional)
   * @param {string} properties.query - Texto de busca (para EVENT_SEARCH)
   * @param {number} properties.event_timestamp - Timestamp do evento (opcional)
   * @param {string|number} telegramId - ID do Telegram para buscar clickid automaticamente
   * @returns {Promise<Object>} Resultado do envio
   */
  async sendKwaiEvent(eventName, clickid, properties = {}, telegramId = null) {
    // Validações básicas
    if (!this.accessToken || !this.pixelId) {
      console.warn('⚠️ Kwai não configurado - ACCESS_TOKEN ou PIXEL_ID ausentes');
      return {
        success: false,
        error: 'Configurações do Kwai não encontradas (ACCESS_TOKEN ou PIXEL_ID)'
      };
    }

    if (!eventName) {
      return {
        success: false,
        error: 'Nome do evento é obrigatório'
      };
    }

    // Validar se o evento é suportado
    if (!this.supportedEvents.includes(eventName)) {
      console.warn(`⚠️ Evento não suportado pela Kwai: ${eventName}`);
      return {
        success: false,
        error: `Evento não suportado: ${eventName}. Eventos válidos: ${this.supportedEvents.join(', ')}`
      };
    }

    // Buscar clickid automaticamente se telegramId fornecido
    let finalClickid = clickid;
    if (telegramId && !finalClickid) {
      try {
        const sessionTracking = getSessionTracking();
        const sessionData = sessionTracking.getTrackingData(telegramId);
        
        if (sessionData && sessionData.kwai_click_id) {
          finalClickid = sessionData.kwai_click_id;
          console.log(`🎯 Click ID recuperado do SessionTracking para telegram_id ${telegramId}: ${finalClickid}`);
        }
      } catch (error) {
        console.warn('Erro ao buscar click ID do SessionTracking:', error.message);
      }
    }

    // Se ainda não tem clickid, gerar um fallback baseado no telegramId
    if (!finalClickid) {
      if (telegramId) {
        finalClickid = `fallback_${telegramId}_${Date.now()}`;
        console.log(`🎯 Click ID fallback gerado: ${finalClickid}`);
      } else {
        return {
          success: false,
          error: 'Click ID não fornecido e não foi possível recuperar automaticamente'
        };
      }
    }

    // Validação de propriedades baseada no tipo de evento
    const validationResult = this.validateEventProperties(eventName, properties);
    if (!validationResult.valid) {
      return {
        success: false,
        error: validationResult.error
      };
    }

    // Adicionar timestamp se não fornecido
    if (!properties.event_timestamp) {
      properties.event_timestamp = Math.floor(Date.now() / 1000);
    }

    // Montar payload conforme documentação oficial da Kwai
    const payload = {
      access_token: this.accessToken,
      clickid: finalClickid,
      event_name: eventName,
      pixelId: this.pixelId,
      testFlag: false, // Sempre false conforme especificação
      trackFlag: this.testMode, // true para testes, false para produção
      is_attributed: 1, // Sempre 1 conforme especificação
      mmpcode: "PL", // Sempre "PL" conforme especificação
      pixelSdkVersion: "9.9.9", // Sempre "9.9.9" conforme especificação
      properties: JSON.stringify(properties),
      third_party: "privacy_system" // Identificar nossa plataforma
    };

    console.log(`🎯 [KWAI] Enviando evento: ${eventName}`, {
      clickid: finalClickid.substring(0, 20) + '...', // Mostrar apenas início por segurança
      trackFlag: payload.trackFlag,
      testMode: this.testMode,
      properties: this.sanitizePropertiesForLog(properties),
      timestamp: new Date(properties.event_timestamp * 1000).toISOString()
    });

    try {
      const response = await axios.post(this.apiUrl, payload, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 segundos de timeout
      });

      console.log(`✅ [KWAI] Evento ${eventName} enviado com sucesso:`, {
        status: response.status,
        result: response.data?.result,
        clickid: finalClickid.substring(0, 20) + '...'
      });

      // Verificar se houve erro na resposta da Kwai
      if (response.data?.result !== 1) {
        console.warn(`⚠️ [KWAI] Resposta com resultado não esperado:`, response.data);
      }

      return {
        success: true,
        response: response.data,
        eventName,
        clickid: finalClickid
      };

    } catch (error) {
      console.error(`❌ [KWAI] Erro ao enviar evento ${eventName}:`, {
        message: error.message,
        status: error.response?.status,
        kwaiError: error.response?.data,
        clickid: finalClickid.substring(0, 20) + '...',
        url: this.apiUrl
      });

      return {
        success: false,
        error: error.response?.data || error.message,
        eventName,
        clickid: finalClickid
      };
    }
  }

  /**
   * Valida propriedades do evento baseado no tipo
   * @param {string} eventName - Nome do evento
   * @param {Object} properties - Propriedades do evento
   * @returns {Object} Resultado da validação
   */
  validateEventProperties(eventName, properties) {
    // Eventos que requerem dados de produto/valor
    const ecommerceEvents = ['EVENT_PURCHASE', 'EVENT_ADD_TO_CART', 'EVENT_INITIATED_CHECKOUT', 'EVENT_CONTENT_VIEW'];
    
    if (ecommerceEvents.includes(eventName)) {
      // Para eventos de e-commerce, valor e moeda são recomendados
      if (properties.value && !properties.currency) {
        return { valid: false, error: 'currency é obrigatório quando value é fornecido' };
      }
      
      // content_id é obrigatório para DPA (Dynamic Product Ads)
      if (!properties.content_id && !properties.contents) {
        console.warn(`⚠️ [KWAI] content_id recomendado para ${eventName}`);
      }
    }
    
    // Validação específica para EVENT_SEARCH
    if (eventName === 'EVENT_SEARCH' && !properties.query) {
      return { valid: false, error: 'query é obrigatório para evento EVENT_SEARCH' };
    }
    
    // Validar moedas suportadas
    if (properties.currency && !['BRL', 'USD', 'IDR'].includes(properties.currency)) {
      console.warn(`⚠️ [KWAI] Moeda ${properties.currency} pode não ser suportada. Moedas recomendadas: BRL, USD, IDR`);
    }
    
    return { valid: true };
  }

  /**
   * Sanitiza propriedades para log (remove dados sensíveis)
   * @param {Object} properties - Propriedades originais
   * @returns {Object} Propriedades sanitizadas
   */
  sanitizePropertiesForLog(properties) {
    const sanitized = { ...properties };
    // Manter apenas dados não sensíveis para log
    return {
      content_id: sanitized.content_id,
      content_name: sanitized.content_name,
      content_type: sanitized.content_type,
      currency: sanitized.currency,
      value: sanitized.value,
      quantity: sanitized.quantity
    };
  }

  /**
   * Envia evento de Purchase para Kwai
   * @param {string|number} telegramId - ID do Telegram
   * @param {Object} purchaseData - Dados da compra
   * @param {string} purchaseData.content_id - ID do produto
   * @param {string} purchaseData.content_name - Nome do produto
   * @param {number} purchaseData.value - Valor da compra
   * @param {string} purchaseData.currency - Moeda (padrão: BRL)
   * @param {string} clickid - Click ID (opcional, será buscado automaticamente)
   * @returns {Promise<Object>} Resultado do envio
   */
  async sendPurchaseEvent(telegramId, purchaseData, clickid = null) {
    const properties = {
      content_id: purchaseData.content_id || `plano_${Date.now()}`,
      content_name: purchaseData.content_name || 'Plano Privacy',
      content_type: 'product',
      currency: purchaseData.currency || 'BRL',
      value: parseFloat(purchaseData.value) || 0,
      event_timestamp: Math.floor(Date.now() / 1000)
    };

    // Adicionar quantidade se fornecida
    if (purchaseData.quantity) {
      properties.quantity = parseInt(purchaseData.quantity);
    }

    return await this.sendKwaiEvent('EVENT_PURCHASE', clickid, properties, telegramId);
  }

  /**
   * Envia evento de AddToCart para Kwai (usado quando inicia checkout)
   * @param {string|number} telegramId - ID do Telegram
   * @param {Object} cartData - Dados do carrinho
   * @param {string} cartData.content_id - ID do produto
   * @param {string} cartData.content_name - Nome do produto
   * @param {number} cartData.value - Valor do produto
   * @param {string} cartData.currency - Moeda (padrão: BRL)
   * @param {string} clickid - Click ID (opcional, será buscado automaticamente)
   * @returns {Promise<Object>} Resultado do envio
   */
  async sendAddToCartEvent(telegramId, cartData, clickid = null) {
    const properties = {
      content_id: cartData.content_id || `plano_${Date.now()}`,
      content_name: cartData.content_name || 'Plano Privacy',
      content_type: 'product',
      currency: cartData.currency || 'BRL',
      value: parseFloat(cartData.value) || 0,
      quantity: parseInt(cartData.quantity) || 1,
      event_timestamp: Math.floor(Date.now() / 1000)
    };

    return await this.sendKwaiEvent('EVENT_ADD_TO_CART', clickid, properties, telegramId);
  }

  /**
   * Envia evento de InitiateCheckout para Kwai
   * @param {string|number} telegramId - ID do Telegram
   * @param {Object} checkoutData - Dados do checkout
   * @param {string} checkoutData.content_id - ID do produto
   * @param {string} checkoutData.content_name - Nome do produto
   * @param {number} checkoutData.value - Valor do checkout
   * @param {string} checkoutData.currency - Moeda (padrão: BRL)
   * @param {string} clickid - Click ID (opcional, será buscado automaticamente)
   * @returns {Promise<Object>} Resultado do envio
   */
  async sendInitiateCheckoutEvent(telegramId, checkoutData, clickid = null) {
    const properties = {
      content_id: checkoutData.content_id || `plano_${Date.now()}`,
      content_name: checkoutData.content_name || 'Plano Privacy',
      content_type: 'product',
      currency: checkoutData.currency || 'BRL',
      value: parseFloat(checkoutData.value) || 0,
      event_timestamp: Math.floor(Date.now() / 1000)
    };

    return await this.sendKwaiEvent('EVENT_INITIATED_CHECKOUT', clickid, properties, telegramId);
  }

  /**
   * Envia evento de ContentView para Kwai
   * @param {string|number} telegramId - ID do Telegram
   * @param {Object} contentData - Dados do conteúdo
   * @param {string} contentData.content_id - ID do conteúdo
   * @param {string} contentData.content_name - Nome do conteúdo
   * @param {string} contentData.content_category - Categoria (opcional)
   * @param {string} clickid - Click ID (opcional, será buscado automaticamente)
   * @returns {Promise<Object>} Resultado do envio
   */
  async sendContentViewEvent(telegramId, contentData, clickid = null) {
    const properties = {
      content_id: contentData.content_id || `page_${Date.now()}`,
      content_name: contentData.content_name || 'Página Privacy',
      content_type: 'product',
      event_timestamp: Math.floor(Date.now() / 1000)
    };

    // Adicionar categoria se fornecida
    if (contentData.content_category) {
      properties.content_category = contentData.content_category;
    }

    // Adicionar valor se for página de produto
    if (contentData.value) {
      properties.value = parseFloat(contentData.value);
      properties.currency = contentData.currency || 'BRL';
    }

    return await this.sendKwaiEvent('EVENT_CONTENT_VIEW', clickid, properties, telegramId);
  }

  /**
   * Armazena click ID do Kwai no SessionTracking
   * @param {string|number} telegramId - ID do Telegram
   * @param {string} clickId - Click ID do Kwai
   */
  storeKwaiClickId(telegramId, clickId) {
    if (!telegramId || !clickId) return false;

    try {
      const sessionTracking = getSessionTracking();
      sessionTracking.updateTrackingData(telegramId, {
        kwai_click_id: clickId
      });
      
      console.log(`🎯 Click ID Kwai armazenado para telegram_id ${telegramId}: ${clickId}`);
      return true;
    } catch (error) {
      console.error('Erro ao armazenar click ID do Kwai:', error);
      return false;
    }
  }

  /**
   * Recupera click ID do Kwai do SessionTracking
   * @param {string|number} telegramId - ID do Telegram
   * @returns {string|null} Click ID ou null se não encontrado
   */
  getKwaiClickId(telegramId) {
    if (!telegramId) return null;

    try {
      const sessionTracking = getSessionTracking();
      const sessionData = sessionTracking.getTrackingData(telegramId);
      
      return sessionData?.kwai_click_id || null;
    } catch (error) {
      console.error('Erro ao recuperar click ID do Kwai:', error);
      return null;
    }
  }

  /**
   * Verifica se o serviço está configurado corretamente
   * @returns {boolean}
   */
  isConfigured() {
    return !!(this.accessToken && this.pixelId);
  }

  /**
   * Função universal para envio de eventos Kwai (uso direto)
   * @param {string} eventName - Nome do evento
   * @param {string} clickid - Click ID do Kwai
   * @param {Object} properties - Propriedades do evento
   * @returns {Promise<Object>} Resultado do envio
   */
  async sendEvent(eventName, clickid, properties = {}) {
    return await this.sendKwaiEvent(eventName, clickid, properties);
  }

  /**
   * Retorna informações de configuração (sem dados sensíveis)
   * @returns {Object}
   */
  getConfig() {
    return {
      hasAccessToken: !!this.accessToken,
      hasPixelId: !!this.pixelId,
      testMode: this.testMode,
      trackFlag: this.testMode, // true para teste, false para produção
      apiUrl: this.apiUrl,
      supportedEvents: this.supportedEvents
    };
  }
}

// Instância singleton
let instance = null;

/**
 * Retorna instância singleton do serviço
 * @returns {KwaiEventAPIService}
 */
function getInstance() {
  if (!instance) {
    instance = new KwaiEventAPIService();
  }
  return instance;
}

module.exports = {
  KwaiEventAPIService,
  getInstance
};
