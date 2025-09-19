const GatewaySelector = require('./gatewaySelector');

/**
 * Serviço unificado de PIX que abstrai a escolha do gateway
 * Permite alternar entre PushinPay e Oasyfy sem alterar o código das APIs
 */
class UnifiedPixService {
  constructor() {
    this.gatewaySelector = new GatewaySelector();
  }

  /**
   * Cria cobrança PIX usando o gateway ativo
   */
  async createPixPayment(paymentData, options = {}) {
    const {
      gateway = null, // Força um gateway específico
      fallback = true, // Permite fallback automático
      retryCount = 0
    } = options;

    try {
      console.log('🚀 Iniciando criação de cobrança PIX unificada');
      
      // Validar dados básicos
      this.validatePaymentData(paymentData);
      
      // Criar cobrança
      const result = await this.gatewaySelector.createPixPayment(paymentData, gateway);
      
      if (!result.success) {
        throw new Error(result.error || 'Erro desconhecido na criação da cobrança');
      }
      
      console.log('✅ Cobrança PIX criada com sucesso:', {
        transaction_id: result.transaction_id,
        gateway: result.gateway,
        status: result.status
      });
      
      return result;

    } catch (error) {
      console.error('❌ Erro na criação de cobrança PIX:', error.message);
      
      // Tentar fallback se habilitado e não foi especificado gateway
      if (fallback && !gateway && retryCount === 0) {
        console.log('🔄 Tentando fallback automático...');
        return await this.createPixPayment(paymentData, { ...options, retryCount: 1 });
      }
      
      throw error;
    }
  }

  /**
   * Valida dados do pagamento
   */
  validatePaymentData(paymentData) {
    const { identifier, amount, client } = paymentData;
    
    if (!identifier) {
      throw new Error('Identificador da transação é obrigatório');
    }
    
    if (!amount || amount <= 0) {
      throw new Error('Valor deve ser maior que zero');
    }
    
    if (!client || !client.name || !client.email) {
      throw new Error('Dados do cliente são obrigatórios (nome e email)');
    }
    
    // Validar formato do email (aceita .local e outros domínios de teste)
    const emailRegex = /^[^\s@]+@[^\s@]+(\.[^\s@]+)*$/;
    if (!emailRegex.test(client.email)) {
      console.error('❌ Email inválido:', client.email);
      throw new Error('Email do cliente inválido');
    }
  }

  /**
   * Processa webhook de qualquer gateway
   */
  async processWebhook(payload, headers = {}) {
    try {
      console.log('📥 Processando webhook unificado');
      
      const result = await this.gatewaySelector.processWebhook(payload, headers);
      
      console.log('✅ Webhook processado com sucesso:', {
        event: result.event,
        transaction_id: result.transaction_id,
        gateway: result.gateway
      });
      
      return result;

    } catch (error) {
      console.error('❌ Erro ao processar webhook:', error.message);
      throw error;
    }
  }

  /**
   * Obtém informações do gateway ativo
   */
  getActiveGateway() {
    return this.gatewaySelector.getActiveGateway();
  }

  /**
   * Altera o gateway ativo
   */
  setActiveGateway(gateway) {
    return this.gatewaySelector.setActiveGateway(gateway);
  }

  /**
   * Lista gateways disponíveis
   */
  getAvailableGateways() {
    return this.gatewaySelector.getAvailableGateways();
  }

  /**
   * Obtém estatísticas dos gateways
   */
  async getGatewayStats() {
    return await this.gatewaySelector.getGatewayStats();
  }

  /**
   * Valida configuração dos gateways
   */
  validateConfiguration() {
    return this.gatewaySelector.validateConfiguration();
  }

  /**
   * Cria cobrança PIX para bot do Telegram
   */
  async createBotPixPayment(telegramId, plano, valor, trackingData = {}, botId = null, options = {}) {
    const safeTrackingData = (trackingData && typeof trackingData === 'object') ? trackingData : {};
    const safeOptions = (options && typeof options === 'object') ? options : {};
    const resolvedBotId = botId || safeOptions.botId || null;

    const baseUrlCandidate = safeOptions.baseUrl || process.env.BASE_URL || process.env.FRONTEND_URL || null;
    const normalizedBaseUrl = typeof baseUrlCandidate === 'string'
      ? baseUrlCandidate.replace(/\/+$/, '')
      : null;

    const callbackUrlCandidates = [
      safeOptions.callbackUrl,
      safeOptions.callback_url,
      safeOptions.webhookUrl,
      safeOptions.webhook_url,
      safeTrackingData.callbackUrl,
      safeTrackingData.callback_url,
      safeTrackingData.webhook_url,
      safeTrackingData.webhookUrl
    ];

    let resolvedCallbackUrl = callbackUrlCandidates.find(url => typeof url === 'string' && url.trim().length > 0) || null;

    if (!resolvedCallbackUrl && normalizedBaseUrl && resolvedBotId) {
      resolvedCallbackUrl = `${normalizedBaseUrl}/${resolvedBotId}/webhook`;
    }

    console.log('🤖 [UNIFIED PIX] Criando PIX para bot:', {
      telegramId,
      plano,
      valor,
      botId: resolvedBotId,
      trackingData: safeTrackingData,
      callbackUrl: resolvedCallbackUrl
    });

    const identifier = `bot_${resolvedBotId || 'default'}_${telegramId}_${Date.now()}`;

    const metadata = {
      source: 'telegram_bot',
      telegram_id: telegramId,
      bot_id: resolvedBotId,
      plano_id: plano?.id || plano,
      plano_nome: plano?.nome || plano,
      ...safeTrackingData
    };

    if (resolvedCallbackUrl && !metadata.webhook_url) {
      metadata.webhook_url = resolvedCallbackUrl;
    }

    const paymentData = {
      identifier,
      amount: valor,
      client: {
        name: `Cliente Telegram ${telegramId}`,
        email: `telegram_${telegramId}@bot.local`,
        phone: null,
        document: null
      },
      products: [{
        id: plano?.id || plano,
        name: plano?.nome || plano,
        quantity: 1,
        price: valor
      }],
      metadata
    };

    if (resolvedCallbackUrl) {
      paymentData.callbackUrl = resolvedCallbackUrl;
    }

    console.log('🤖 [UNIFIED PIX] Dados do pagamento preparados:', JSON.stringify(paymentData, null, 2));

    const result = await this.createPixPayment(paymentData);
    
    console.log('🤖 [UNIFIED PIX] Resultado da criação:', {
      success: result.success,
      transaction_id: result.transaction_id,
      gateway: result.gateway,
      error: result.error
    });
    
    return result;
  }

  /**
   * Cria cobrança PIX para checkout web
   */
  async createWebPixPayment(planoId, valor, clientData = {}, trackingData = {}) {
    const identifier = `web_${planoId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Obter gateway ativo para determinar callback URL dinâmica
    const activeGateway = this.getActiveGateway();
    const baseUrl = process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:3000';
    
    // 🎯 CORREÇÃO PRIORITÁRIA #2: Usar webhook unificado para todos os gateways
    const callbackUrl = `${baseUrl}/webhook/unified`;
    
    const paymentData = {
      identifier,
      amount: valor,
      client: {
        name: clientData.name || 'Cliente Web',
        email: clientData.email || `web_${Date.now()}@checkout.local`,
        phone: clientData.phone || null,
        document: clientData.document || null
      },
      products: [{
        id: planoId,
        name: clientData.plano_nome || planoId,
        quantity: 1,
        price: valor
      }],
      callbackUrl,
      metadata: {
        source: 'checkout_web',
        plano_id: planoId,
        plano_nome: clientData.plano_nome || planoId,
        active_gateway: activeGateway,
        ...trackingData
      }
    };

    if (callbackUrl && !paymentData.metadata.webhook_url) {
      paymentData.metadata.webhook_url = callbackUrl;
    }

    return await this.createPixPayment(paymentData);
  }

  /**
   * Cria cobrança PIX para obrigado especial
   */
  async createSpecialPixPayment(valor = 100, metadata = {}) {
    const identifier = `special_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const baseUrlCandidate = process.env.FRONTEND_URL || process.env.BASE_URL || null;
    const normalizedBaseUrl = typeof baseUrlCandidate === 'string'
      ? baseUrlCandidate.replace(/\/+$/, '')
      : null;
    const callbackUrl = normalizedBaseUrl ? `${normalizedBaseUrl}/webhook/unified` : null;

    const paymentData = {
      identifier,
      amount: valor,
      client: {
        name: 'Cliente Especial',
        email: `special_${Date.now()}@obrigado.local`,
        phone: null,
        document: null
      },
      products: [{
        id: 'obrigado_especial',
        name: 'Obrigado Especial',
        quantity: 1,
        price: valor
      }],
      metadata: {
        source: 'obrigado_especial',
        valor_reais: valor,
        ...metadata
      }
    };

    if (callbackUrl) {
      paymentData.callbackUrl = callbackUrl;
      if (!paymentData.metadata.webhook_url) {
        paymentData.metadata.webhook_url = callbackUrl;
      }
    }

    return await this.createPixPayment(paymentData);
  }

  /**
   * Testa conectividade dos gateways
   */
  async testGateways() {
    const results = {
      pushinpay: { available: false, error: null },
      oasyfy: { available: false, error: null }
    };

    // Testar PushinPay
    try {
      if (this.gatewaySelector.pushinpay.isConfigured()) {
        // PushinPay não tem endpoint de ping, considerar como disponível se configurado
        results.pushinpay.available = true;
      }
    } catch (error) {
      results.pushinpay.error = error.message;
    }

    // Testar Oasyfy
    try {
      if (this.gatewaySelector.oasyfy.isConfigured()) {
        const pingResult = await this.gatewaySelector.oasyfy.ping();
        results.oasyfy.available = pingResult.success;
        if (!pingResult.success) {
          results.oasyfy.error = pingResult.error;
        }
      }
    } catch (error) {
      results.oasyfy.error = error.message;
    }

    return results;
  }
}

module.exports = UnifiedPixService;
