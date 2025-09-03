/**
 * Gateway de Pagamento Unificado
 * Integra PushinPay do projeto bot + SyncPay do privacy
 */

const PushinPayBotIntegration = require('./pushinpayBotIntegration');
const { syncpayGet, syncpayPost } = require('./syncpayApi');
const { getToken } = require('./authService');
const { getConfig } = require('./loadConfig');

class UnifiedPaymentGateway {
  constructor() {
    this.config = getConfig();
    this.currentGateway = this.config.gateway || 'pushinpay';
    
    // Integração com PushinPay do bot
    this.pushinpayBot = new PushinPayBotIntegration();
    
    console.log(`🚀 UnifiedPaymentGateway inicializado - Gateway ativo: ${this.currentGateway}`);
  }

  /**
   * Definir qual gateway usar
   */
  setGateway(gateway) {
    if (!['pushinpay', 'syncpay'].includes(gateway.toLowerCase())) {
      throw new Error(`Gateway não suportado: ${gateway}`);
    }
    
    this.currentGateway = gateway.toLowerCase();
    console.log(`🎯 Gateway alterado para: ${this.currentGateway}`);
  }

  /**
   * Obter gateway atual
   */
  getCurrentGateway() {
    return this.currentGateway;
  }

  /**
   * Criar pagamento PIX
   */
  async createPixPayment(paymentData) {
    try {
      this.validatePaymentData(paymentData);
      
      if (this.currentGateway === 'pushinpay') {
        console.log('🚀 Criando pagamento via PushinPay (integração bot)...');
        return await this.pushinpayBot.createPixPayment(paymentData);
      } else if (this.currentGateway === 'syncpay') {
        console.log('🚀 Criando pagamento via SyncPay...');
        return await this.createSyncPayPixPayment(paymentData);
      }
      
      throw new Error(`Gateway não suportado: ${this.currentGateway}`);
      
    } catch (error) {
      console.error(`❌ Erro ao criar pagamento via ${this.currentGateway}:`, error.message);
      throw error;
    }
  }

  /**
   * Consultar status do pagamento
   */
  async getPaymentStatus(paymentId) {
    try {
      if (this.currentGateway === 'pushinpay') {
        console.log('🔍 Consultando status via PushinPay (integração bot)...');
        return await this.pushinpayBot.getPaymentStatus(paymentId);
      } else if (this.currentGateway === 'syncpay') {
        console.log('🔍 Consultando status via SyncPay...');
        return await this.getSyncPayPaymentStatus(paymentId);
      }
      
      throw new Error(`Gateway não suportado: ${this.currentGateway}`);
      
    } catch (error) {
      console.error(`❌ Erro ao consultar status via ${this.currentGateway}:`, error.message);
      throw error;
    }
  }

  /**
   * Implementação específica do SyncPay para pagamento PIX
   */
  async createSyncPayPixPayment(paymentData) {
    try {
      const syncPayData = {
        amount: paymentData.amount,
        description: paymentData.description || 'Pagamento via PIX',
        client: {
          name: paymentData.customer_name || 'Cliente',
          cpf: paymentData.customer_document || '',
          email: paymentData.customer_email || 'cliente@email.com',
          phone: paymentData.customer_phone || '11999999999'
        }
      };

      const response = await syncpayPost('/cash-in', syncPayData);
      
      // Padronizar resposta para compatibilidade
      return {
        ...response.data,
        payment_id: response.data.id,
        gateway: 'syncpay',
        source: 'privacy-syncpay'
      };
      
    } catch (error) {
      console.error('❌ Erro ao criar pagamento SyncPay:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Consultar status do pagamento SyncPay
   */
  async getSyncPayPaymentStatus(paymentId) {
    try {
      const response = await syncpayGet(`/transaction/${paymentId}`);
      
      // Padronizar resposta para compatibilidade
      return {
        ...response.data,
        payment_id: response.data.id,
        gateway: 'syncpay',
        source: 'privacy-syncpay'
      };
      
    } catch (error) {
      console.error('❌ Erro ao consultar status SyncPay:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Listar pagamentos SyncPay
   */
  async listSyncPayPayments(filters = {}) {
    try {
      const queryParams = new URLSearchParams(filters).toString();
      const response = await syncpayGet(`/transactions?${queryParams}`);
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao listar pagamentos SyncPay:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Obter informações dos gateways disponíveis
   */
  getAvailableGateways() {
    const pushinpayInfo = this.pushinpayBot.getEnvironmentInfo();
    
    return [
      {
        id: 'pushinpay',
        name: 'PushinPay',
        description: 'Gateway de pagamento PushinPay - PIX com Split Rules (integração bot)',
        features: ['PIX', 'Split Rules', 'Webhooks', 'QR Code Base64'],
        status: pushinpayInfo.token_configured ? 'active' : 'needs_config',
        environment: pushinpayInfo.environment,
        api_base: pushinpayInfo.api_base,
        token_status: pushinpayInfo.token_configured ? 'configured' : 'missing',
        source: 'bot-integration',
        docs: {
          pix_create: 'POST /api/pix/cashIn',
          pix_status: 'GET /api/transactions/{ID}',
          min_value: '50 centavos (R$ 0,50)',
          webhook_support: true,
          split_support: true
        }
      },
      {
        id: 'syncpay',
        name: 'SyncPay',
        description: 'Gateway de pagamento SyncPay - Completo (implementação privacy)',
        features: ['PIX', 'Cash-in', 'Cash-out', 'Webhooks', 'Split'],
        status: 'active',
        environment: 'production',
        api_base: 'https://api.syncpayments.com.br/api/partner/v1',
        token_status: 'configured',
        source: 'privacy-native',
        docs: {
          auth: 'POST /auth-token',
          balance: 'GET /balance',
          cash_in: 'POST /cash-in',
          cash_out: 'POST /cash-out',
          transaction: 'GET /transaction/{identifier}',
          profile: 'GET /profile',
          webhooks: 'CRUD /webhooks'
        }
      }
    ];
  }

  /**
   * Validar dados do pagamento
   */
  validatePaymentData(paymentData) {
    const requiredFields = ['amount'];
    const missingFields = requiredFields.filter(field => !paymentData[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`Campos obrigatórios ausentes: ${missingFields.join(', ')}`);
    }

    if (paymentData.amount <= 0) {
      throw new Error('Valor do pagamento deve ser maior que zero');
    }

    // Validação específica para cada gateway
    if (this.currentGateway === 'pushinpay') {
      const valueInCents = Math.round(paymentData.amount * 100);
      if (valueInCents < 50) {
        throw new Error('Valor mínimo para PushinPay é de 50 centavos (R$ 0,50)');
      }
    }

    return true;
  }

  /**
   * Configurar webhook handler do bot para integração
   */
  setBotWebhookHandler(botWebhookHandler) {
    this.botWebhookHandler = botWebhookHandler;
    console.log('🔗 Bot webhook handler configurado para integração PushinPay');
  }

  /**
   * Obter informações do ambiente
   */
  getEnvironmentInfo() {
    const pushinpayInfo = this.pushinpayBot.getEnvironmentInfo();
    
    return {
      current_gateway: this.currentGateway,
      pushinpay: pushinpayInfo,
      syncpay: {
        environment: 'production',
        api_base: 'https://api.syncpayments.com.br/api/partner/v1',
        token_configured: !!(this.config.syncpay?.clientId && this.config.syncpay?.clientSecret),
        source: 'privacy-native'
      },
      integration_status: {
        pushinpay_source: 'bot-integration',
        syncpay_source: 'privacy-native',
        unified: true
      }
    };
  }
}

module.exports = UnifiedPaymentGateway;