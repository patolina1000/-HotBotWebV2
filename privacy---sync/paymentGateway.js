const { createPixPayment, getPaymentStatus, listPayments, validateSplitRules, getEnvironmentInfo } = require('./pushinpayApi');
const { syncpayGet, syncpayPost } = require('./syncpayApi');
const { getToken } = require('./authService');

class PaymentGateway {
  constructor(gateway = 'syncpay') {
    this.gateway = gateway.toLowerCase();
  }

  // Método para definir qual gateway usar
  setGateway(gateway) {
    this.gateway = gateway.toLowerCase();
    console.log(`🎯 Gateway de pagamento alterado para: ${this.gateway}`);
  }

  // Método para obter o gateway atual
  getCurrentGateway() {
    return this.gateway;
  }

  // Método para criar pagamento PIX
  async createPixPayment(paymentData) {
    try {
      if (this.gateway === 'pushinpay') {
        console.log('🚀 Criando pagamento via PushinPay...');
        
        // Validar split_rules se fornecidas
        if (paymentData.split_rules && paymentData.split_rules.length > 0) {
          const valueInCents = Math.round(paymentData.amount * 100);
          validateSplitRules(paymentData.split_rules, valueInCents);
        }
        
        return await createPixPayment(paymentData);
      } else if (this.gateway === 'syncpay') {
        console.log('🚀 Criando pagamento via SyncPay...');
        return await this.createSyncPayPixPayment(paymentData);
      } else {
        throw new Error(`Gateway não suportado: ${this.gateway}`);
      }
    } catch (error) {
      console.error(`❌ Erro ao criar pagamento via ${this.gateway}:`, error.message);
      throw error;
    }
  }

  // Método para consultar status do pagamento
  async getPaymentStatus(paymentId) {
    try {
      if (this.gateway === 'pushinpay') {
        console.log('🔍 Consultando status via PushinPay...');
        return await getPaymentStatus(paymentId);
      } else if (this.gateway === 'syncpay') {
        console.log('🔍 Consultando status via SyncPay...');
        return await this.getSyncPayPaymentStatus(paymentId);
      } else {
        throw new Error(`Gateway não suportado: ${this.gateway}`);
      }
    } catch (error) {
      console.error(`❌ Erro ao consultar status via ${this.gateway}:`, error.message);
      throw error;
    }
  }

  // Método para listar pagamentos
  async listPayments(filters = {}) {
    try {
      if (this.gateway === 'pushinpay') {
        console.log('📋 Listando pagamentos via PushinPay...');
        return await listPayments(filters);
      } else if (this.gateway === 'syncpay') {
        console.log('📋 Listando pagamentos via SyncPay...');
        return await this.listSyncPayPayments(filters);
      } else {
        throw new Error(`Gateway não suportado: ${this.gateway}`);
      }
    } catch (error) {
      console.error(`❌ Erro ao listar pagamentos via ${this.gateway}:`, error.message);
      throw error;
    }
  }

  // Métodos específicos do SyncPay
  async createSyncPayPixPayment(paymentData) {
    try {
      const token = await getToken();
      
      const syncPayData = {
        amount: paymentData.amount,
        description: paymentData.description || 'Pagamento via PIX',
        client: {
          name: paymentData.customer_name,
          cpf: paymentData.customer_document,
          email: paymentData.customer_email,
          phone: paymentData.customer_phone || '11999999999'
        }
      };

      const response = await syncpayPost('/cash-in', syncPayData);
      return response.data;
    } catch (error) {
      console.error('Erro ao criar pagamento SyncPay:', error.response?.data || error.message);
      throw error;
    }
  }

  async getSyncPayPaymentStatus(paymentId) {
    try {
      const response = await syncpayGet(`/transaction/${paymentId}`);
      return response.data;
    } catch (error) {
      console.error('Erro ao consultar status SyncPay:', error.response?.data || error.message);
      throw error;
    }
  }

  async listSyncPayPayments(filters = {}) {
    try {
      const queryParams = new URLSearchParams(filters).toString();
      const response = await syncpayGet(`/transactions?${queryParams}`);
      return response.data;
    } catch (error) {
      console.error('Erro ao listar pagamentos SyncPay:', error.response?.data || error.message);
      throw error;
    }
  }

  // Método para obter informações dos gateways disponíveis
  getAvailableGateways() {
    const pushinpayInfo = getEnvironmentInfo();
    
    return [
      {
        id: 'pushinpay',
        name: 'PushinPay',
        description: 'Gateway de pagamento PushinPay - PIX com Split Rules',
        features: ['PIX', 'Split Rules', 'Webhooks', 'QR Code Base64'],
        status: pushinpayInfo.token_configured ? 'active' : 'needs_config',
        environment: pushinpayInfo.environment,
        api_base: pushinpayInfo.api_base,
        token_status: pushinpayInfo.token_configured ? 'configured' : 'missing',
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
        description: 'Gateway de pagamento SyncPay - Completo',
        features: ['PIX', 'Cash-in', 'Cash-out', 'Webhooks', 'Split'],
        status: 'active',
        environment: 'production',
        api_base: 'https://api.syncpayments.com.br/api/partner/v1',
        token_status: 'configured',
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

  // Método para validar dados do pagamento
  validatePaymentData(paymentData) {
    const requiredFields = ['amount', 'customer_name', 'customer_email'];
    const missingFields = requiredFields.filter(field => !paymentData[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`Campos obrigatórios ausentes: ${missingFields.join(', ')}`);
    }

    if (paymentData.amount <= 0) {
      throw new Error('Valor do pagamento deve ser maior que zero');
    }

    return true;
  }
}

module.exports = PaymentGateway;