const PushinPayService = require('./pushinpay');
const OasyfyService = require('./oasyfy');

/**
 * Sistema de seleção de gateway de pagamento PIX
 * Permite alternar entre PushinPay e Oasyfy
 */
class GatewaySelector {
  constructor() {
    this.pushinpay = new PushinPayService();
    this.oasyfy = new OasyfyService();
    
    // Gateway padrão (pode ser alterado via variável de ambiente)
    this.defaultGateway = process.env.DEFAULT_PIX_GATEWAY || 'pushinpay';
    
    console.log(`🎯 Gateway PIX padrão: ${this.defaultGateway}`);
    this.logGatewayStatus();
  }

  /**
   * Loga o status de cada gateway
   */
  logGatewayStatus() {
    console.log('📊 Status dos Gateways PIX:');
    console.log(`  PushinPay: ${this.pushinpay.isConfigured() ? '✅ Configurado' : '❌ Não configurado'}`);
    console.log(`  Oasyfy: ${this.oasyfy.isConfigured() ? '✅ Configurado' : '❌ Não configurado'}`);
    console.log(`  Gateway ativo: ${this.defaultGateway}`);
    console.log(`  DEFAULT_PIX_GATEWAY: ${process.env.DEFAULT_PIX_GATEWAY || 'não definido'}`);
    console.log(`  OASYFY_PUBLIC_KEY: ${process.env.OASYFY_PUBLIC_KEY ? '✅ Configurado' : '❌ Não configurado'}`);
    console.log(`  OASYFY_SECRET_KEY: ${process.env.OASYFY_SECRET_KEY ? '✅ Configurado' : '❌ Não configurado'}`);
  }

  /**
   * Obtém o gateway ativo
   */
  getActiveGateway() {
    return this.defaultGateway;
  }

  /**
   * Define o gateway ativo
   */
  setActiveGateway(gateway) {
    const validGateways = ['pushinpay', 'oasyfy'];
    
    if (!validGateways.includes(gateway)) {
      throw new Error(`Gateway inválido: ${gateway}. Gateways válidos: ${validGateways.join(', ')}`);
    }

    this.defaultGateway = gateway;
    console.log(`🔄 Gateway PIX alterado para: ${gateway}`);
    return true;
  }

  /**
   * Obtém instância do gateway especificado
   */
  getGatewayInstance(gateway = null) {
    const targetGateway = gateway || this.defaultGateway;
    
    switch (targetGateway) {
      case 'pushinpay':
        return this.pushinpay;
      case 'oasyfy':
        return this.oasyfy;
      default:
        throw new Error(`Gateway não encontrado: ${targetGateway}`);
    }
  }

  /**
   * Verifica se um gateway está disponível
   */
  isGatewayAvailable(gateway) {
    try {
      const instance = this.getGatewayInstance(gateway);
      return instance.isConfigured();
    } catch (error) {
      return false;
    }
  }

  /**
   * Lista gateways disponíveis
   */
  getAvailableGateways() {
    const gateways = [];
    
    if (this.pushinpay.isConfigured()) {
      gateways.push({
        id: 'pushinpay',
        name: 'PushinPay',
        configured: true,
        active: this.defaultGateway === 'pushinpay'
      });
    }
    
    if (this.oasyfy.isConfigured()) {
      gateways.push({
        id: 'oasyfy',
        name: 'Oasyfy',
        configured: true,
        active: this.defaultGateway === 'oasyfy'
      });
    }
    
    return gateways;
  }

  /**
   * Valida dados específicos por gateway
   */
  validateGatewayData(paymentData, gateway) {
    const { client } = paymentData;
    
    if (gateway === 'oasyfy') {
      if (!client || !client.name || !client.email) {
        throw new Error('Oasyfy requer dados completos do cliente (nome e email)');
      }
    }
    // PushinPay pode funcionar sem dados do cliente
    return true;
  }

  /**
   * Cria cobrança PIX usando o gateway ativo
   */
  async createPixPayment(paymentData, gateway = null) {
    const targetGateway = gateway || this.defaultGateway;
    
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      operation: 'gateway_selector_create_pix',
      gateway_requested: gateway || 'default',
      gateway_active: this.defaultGateway,
      gateways_status: {
        pushinpay: this.pushinpay.isConfigured(),
        oasyfy: this.oasyfy.isConfigured()
      }
    }));
    
    try {
      const gatewayInstance = this.getGatewayInstance(targetGateway);
      
      if (!gatewayInstance.isConfigured()) {
        throw new Error(`Gateway ${targetGateway} não está configurado`);
      }

      // Validar dados específicos do gateway
      this.validateGatewayData(paymentData, targetGateway);

      // Adicionar metadados do gateway
      const enhancedPaymentData = {
        ...paymentData,
        metadata: {
          ...paymentData.metadata,
          gateway: targetGateway,
          created_at: new Date().toISOString()
        }
      };

      const result = await gatewayInstance.createPixPayment(enhancedPaymentData);
      
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        operation: 'gateway_selector_pix_created',
        gateway: targetGateway,
        result: {
          transaction_id: result.transaction_id,
          status: result.status,
          success: result.success
        }
      }));
      
      return result;

    } catch (error) {
      console.error(`❌ Erro ao criar cobrança PIX via ${targetGateway.toUpperCase()}:`, error.message);
      
      // Se o gateway ativo falhar, tentar fallback para o outro
      if (!gateway && this.shouldTryFallback(targetGateway)) {
        console.log(`🔄 Tentando fallback para outro gateway...`);
        return await this.createPixPaymentWithFallback(paymentData);
      }
      
      throw error;
    }
  }

  /**
   * Verifica se deve tentar fallback
   */
  shouldTryFallback(failedGateway) {
    const otherGateway = failedGateway === 'pushinpay' ? 'oasyfy' : 'pushinpay';
    return this.isGatewayAvailable(otherGateway);
  }

  /**
   * Cria cobrança com fallback automático
   */
  async createPixPaymentWithFallback(paymentData) {
    const primaryGateway = this.defaultGateway;
    const fallbackGateway = primaryGateway === 'pushinpay' ? 'oasyfy' : 'pushinpay';
    
    try {
      console.log(`🔄 Tentando fallback para ${fallbackGateway.toUpperCase()}`);
      return await this.createPixPayment(paymentData, fallbackGateway);
    } catch (fallbackError) {
      console.error(`❌ Fallback também falhou:`, fallbackError.message);
      throw new Error(`Ambos os gateways falharam. Primary: ${primaryGateway}, Fallback: ${fallbackGateway}`);
    }
  }

  /**
   * Processa webhook (detecta automaticamente o gateway)
   */
  async processWebhook(payload, headers = {}) {
    try {
      // Detectar gateway baseado no payload
      const gateway = this.detectGatewayFromPayload(payload, headers);
      
      if (!gateway) {
        throw new Error('Não foi possível detectar o gateway do webhook');
      }

      console.log(`📥 Processando webhook do ${gateway.toUpperCase()}`);
      
      const gatewayInstance = this.getGatewayInstance(gateway);
      return await gatewayInstance.processWebhook(payload);

    } catch (error) {
      console.error('❌ Erro ao processar webhook:', error.message);
      throw error;
    }
  }

  /**
   * Detecta o gateway baseado no payload do webhook
   */
  detectGatewayFromPayload(payload, headers = {}) {
    // PushinPay: geralmente tem campos como 'id', 'status', 'payer_name'
    if (payload.id && payload.status && (payload.payer_name || payload.payer)) {
      return 'pushinpay';
    }
    
    // Oasyfy: tem estrutura específica com 'event', 'transaction', 'client'
    if (payload.event && payload.transaction && payload.client) {
      return 'oasyfy';
    }
    
    // Verificar headers para identificar gateway
    const userAgent = headers['user-agent'] || '';
    if (userAgent.includes('pushinpay')) {
      return 'pushinpay';
    }
    if (userAgent.includes('oasyfy')) {
      return 'oasyfy';
    }
    
    return null;
  }

  /**
   * Obtém estatísticas dos gateways
   */
  async getGatewayStats() {
    const stats = {
      active_gateway: this.defaultGateway,
      available_gateways: this.getAvailableGateways(),
      pushinpay: {
        configured: this.pushinpay.isConfigured(),
        status: 'unknown'
      },
      oasyfy: {
        configured: this.oasyfy.isConfigured(),
        status: 'unknown'
      }
    };

    // Verificar status dos gateways
    try {
      if (this.pushinpay.isConfigured()) {
        // Implementar verificação de status do PushinPay se necessário
        stats.pushinpay.status = 'available';
      }
    } catch (error) {
      stats.pushinpay.status = 'error';
    }

    try {
      if (this.oasyfy.isConfigured()) {
        const pingResult = await this.oasyfy.ping();
        stats.oasyfy.status = pingResult.success ? 'available' : 'error';
      }
    } catch (error) {
      stats.oasyfy.status = 'error';
    }

    return stats;
  }

  /**
   * Valida configuração de todos os gateways
   */
  validateConfiguration() {
    const issues = [];
    
    if (!this.pushinpay.isConfigured()) {
      issues.push('PushinPay não configurado (PUSHINPAY_TOKEN)');
    }
    
    if (!this.oasyfy.isConfigured()) {
      issues.push('Oasyfy não configurado (OASYFY_PUBLIC_KEY, OASYFY_SECRET_KEY)');
    }
    
    if (issues.length === 0) {
      console.log('✅ Todos os gateways estão configurados');
    } else {
      console.warn('⚠️ Problemas de configuração:', issues);
    }
    
    return {
      valid: issues.length === 0,
      issues,
      available_gateways: this.getAvailableGateways()
    };
  }
}

module.exports = GatewaySelector;
