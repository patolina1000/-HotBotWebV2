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
    
    // 🔥 CONFIGURAÇÃO: SEMPRE usar PushinPay como padrão
    const syncpayConfigured = this.config.syncpay?.clientId && this.config.syncpay?.clientSecret;
    const pushinpayConfigured = this.config.pushinpay?.token && this.config.pushinpay?.token !== 'demo_pushinpay_token';
    
    // SEMPRE priorizar PushinPay, independente das configurações do SyncPay
    this.currentGateway = 'pushinpay';
    
    console.log('🎯 CONFIGURAÇÃO FORÇADA: Sempre usando PushinPay como gateway padrão');
    
    // Integração com PushinPay do bot
    this.pushinpayBot = new PushinPayBotIntegration();
    
    console.log(`🚀 UnifiedPaymentGateway inicializado - Gateway ativo: ${this.currentGateway}`);
    console.log(`📊 Status das configurações:`, {
      syncpay: syncpayConfigured ? '✅ Configurado' : '❌ Não configurado',
      pushinpay: pushinpayConfigured ? '✅ Configurado' : '❌ Não configurado'
    });
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
      
      // 🔥 CORREÇÃO: Verificar configurações antes de processar
      if (this.currentGateway === 'pushinpay') {
        const pushinpayConfigured = this.config.pushinpay?.token && this.config.pushinpay?.token !== 'demo_pushinpay_token';
        if (!pushinpayConfigured) {
          throw new Error('PushinPay selecionado mas token não está configurado. Configure PUSHINPAY_TOKEN.');
        }
        
        console.log('🚀 Criando pagamento via PushinPay (integração bot)...');
        return await this.pushinpayBot.createPixPayment(paymentData);
      } else if (this.currentGateway === 'syncpay') {
        const syncpayConfigured = this.config.syncpay?.clientId && this.config.syncpay?.clientSecret;
        if (!syncpayConfigured) {
          throw new Error('SyncPay selecionado mas credenciais não estão configuradas. Configure SYNCPAY_CLIENT_ID e SYNCPAY_CLIENT_SECRET.');
        }
        
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
      // Validar e converter amount para número
      const amount = parseFloat(paymentData.amount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error(`Valor inválido: ${paymentData.amount}. Deve ser um número maior que zero.`);
      }

      const syncPayData = {
        amount: amount, // Garantir que amount seja número
        description: paymentData.description || 'Pagamento via PIX',
        client: {
          name: paymentData.customer_name || 'Cliente',
          cpf: paymentData.customer_document || '12345678901',
          email: paymentData.customer_email || 'cliente@email.com',
          phone: paymentData.customer_phone || '11999999999'
        }
      };

      console.log('📤 [SYNCPAY] Enviando dados para API:', JSON.stringify(syncPayData, null, 2));

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
    console.log('🔍 [VALIDATION] Validando dados do pagamento para gateway:', this.currentGateway);
    console.log('📋 [VALIDATION] PaymentData recebido:', JSON.stringify(paymentData, null, 2));
    
    // Validar se amount existe e não está vazio
    if (!paymentData.hasOwnProperty('amount') || paymentData.amount === null || paymentData.amount === undefined || paymentData.amount === '') {
      console.error('❌ [VALIDATION] Amount não definido:', paymentData.amount);
      console.error('🔍 [VALIDATION] Estrutura completa dos dados:', Object.keys(paymentData));
      throw new Error('Valor é obrigatório - campo "amount" não encontrado ou vazio');
    }

    // Converter amount para número se for string
    const amount = typeof paymentData.amount === 'string' ? parseFloat(paymentData.amount) : paymentData.amount;
    
    console.log('💰 [VALIDATION] Amount original:', paymentData.amount, 'tipo:', typeof paymentData.amount);
    console.log('💰 [VALIDATION] Amount convertido:', amount, 'tipo:', typeof amount);
    
    if (isNaN(amount)) {
      console.error('❌ [VALIDATION] Amount não é um número válido:', paymentData.amount);
      throw new Error(`Valor deve ser um número válido. Recebido: ${paymentData.amount} (tipo: ${typeof paymentData.amount})`);
    }

    if (amount <= 0) {
      console.error('❌ [VALIDATION] Amount deve ser maior que zero:', amount);
      throw new Error(`Valor do pagamento deve ser maior que zero. Recebido: ${amount}`);
    }

    // Atualizar o amount no paymentData com o valor convertido
    paymentData.amount = amount;
    
    console.log('✅ [VALIDATION] Dados validados com sucesso. Amount final:', amount);

    // Validação específica para cada gateway
    if (this.currentGateway === 'pushinpay') {
      const valueInCents = Math.round(paymentData.amount * 100);
      console.log('💰 [VALIDATION] Valor em centavos para PushinPay:', valueInCents);
      if (valueInCents < 50) {
        throw new Error(`Valor mínimo para PushinPay é de 50 centavos (R$ 0,50). Recebido: ${valueInCents} centavos`);
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