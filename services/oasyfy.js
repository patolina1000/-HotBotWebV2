const axios = require('axios');
const crypto = require('crypto');

/**
 * Serviço de integração com a API Oasyfy
 * Documentação: https://app.oasyfy.com/api/v1
 */
class OasyfyService {
  constructor() {
    this.baseUrl = 'https://app.oasyfy.com/api/v1';
    this.publicKey = process.env.OASYFY_PUBLIC_KEY;
    this.secretKey = process.env.OASYFY_SECRET_KEY;
    
    if (!this.publicKey || !this.secretKey) {
      console.warn('⚠️ Credenciais Oasyfy não configuradas');
    }
  }

  /**
   * Verifica se o serviço está configurado corretamente
   */
  isConfigured() {
    return !!(this.publicKey && this.secretKey);
  }

  /**
   * Cria headers de autenticação para requisições
   */
  getAuthHeaders() {
    if (!this.isConfigured()) {
      throw new Error('Credenciais Oasyfy não configuradas');
    }

    return {
      'x-public-key': this.publicKey,
      'x-secret-key': this.secretKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  /**
   * Verifica status da API
   */
  async ping() {
    try {
      const response = await axios.get(`${this.baseUrl}/ping`, {
        headers: this.getAuthHeaders()
      });
      return { success: true, data: response.data };
    } catch (error) {
      console.error('❌ Erro ao verificar status Oasyfy:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtém informações do produtor
   */
  async getProducerInfo() {
    try {
      const response = await axios.get(`${this.baseUrl}/gateway/producer`, {
        headers: this.getAuthHeaders()
      });
      return { success: true, data: response.data };
    } catch (error) {
      console.error('❌ Erro ao obter informações do produtor:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtém saldo da conta
   */
  async getBalance() {
    try {
      const response = await axios.get(`${this.baseUrl}/gateway/producer/balance`, {
        headers: this.getAuthHeaders()
      });
      return { success: true, data: response.data };
    } catch (error) {
      console.error('❌ Erro ao obter saldo:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cria cobrança PIX
   * @param {Object} paymentData - Dados do pagamento
   * @param {string} paymentData.identifier - Identificador único da transação
   * @param {number} paymentData.amount - Valor em reais
   * @param {Object} paymentData.client - Dados do cliente
   * @param {Array} paymentData.products - Lista de produtos
   * @param {string} paymentData.callbackUrl - URL do webhook
   * @param {Object} paymentData.metadata - Metadados adicionais
   */
  async createPixPayment(paymentData) {
    try {
      const {
        identifier,
        amount,
        client,
        products = [],
        callbackUrl,
        metadata = {},
        shippingFee = 0,
        extraFee = 0,
        discount = 0
      } = paymentData;

      // Validar dados obrigatórios
      if (!identifier || !amount || !client) {
        throw new Error('Dados obrigatórios não fornecidos: identifier, amount, client');
      }

      // Calcular valor total dos produtos
      const totalProducts = products.reduce((acc, product) => {
        return acc + (product.price * product.quantity);
      }, 0);

      // Validar se o valor total está correto
      const calculatedTotal = totalProducts + shippingFee + extraFee - discount;
      if (Math.abs(calculatedTotal - amount) > 0.01) {
        console.warn(`⚠️ Diferença no cálculo: esperado ${amount}, calculado ${calculatedTotal}`);
      }

      const payload = {
        identifier,
        amount,
        shippingFee,
        extraFee,
        discount,
        client: {
          name: client.name,
          email: client.email,
          phone: client.phone,
          document: client.document
        },
        products: products.map(product => ({
          id: product.id,
          name: product.name,
          quantity: product.quantity,
          price: product.price
        })),
        metadata: {
          ...metadata,
          gateway: 'oasyfy',
          created_at: new Date().toISOString()
        }
      };

      // Adicionar callback URL se fornecida
      if (callbackUrl) {
        payload.callbackUrl = callbackUrl;
      }

      console.log('🚀 Criando cobrança PIX via Oasyfy:', {
        identifier,
        amount,
        products: products.length,
        callbackUrl: !!callbackUrl
      });

      const response = await axios.post(`${this.baseUrl}/gateway/pix/receive`, payload, {
        headers: this.getAuthHeaders()
      });

      const responseData = response.data;
      
      // Normalizar resposta para compatibilidade com PushinPay
      const normalizedResponse = {
        success: responseData.status === 'OK',
        transaction_id: responseData.transactionId,
        qr_code_base64: responseData.pix?.base64,
        pix_copia_cola: responseData.pix?.code,
        qr_code_image: responseData.pix?.image,
        fee: responseData.fee || 0,
        status: responseData.status,
        error_description: responseData.errorDescription,
        gateway: 'oasyfy',
        raw_response: responseData
      };

      console.log('✅ Cobrança PIX criada via Oasyfy:', {
        transaction_id: normalizedResponse.transaction_id,
        status: normalizedResponse.status
      });

      return normalizedResponse;

    } catch (error) {
      console.error('❌ Erro ao criar cobrança PIX via Oasyfy:', error.message);
      
      if (error.response) {
        console.error('Detalhes do erro:', error.response.data);
        return {
          success: false,
          error: error.response.data?.message || error.message,
          error_code: error.response.data?.errorCode,
          status_code: error.response.status,
          gateway: 'oasyfy'
        };
      }

      return {
        success: false,
        error: error.message,
        gateway: 'oasyfy'
      };
    }
  }

  /**
   * Busca transação por ID
   */
  async getTransaction(transactionId) {
    try {
      const response = await axios.get(`${this.baseUrl}/gateway/transactions`, {
        headers: this.getAuthHeaders(),
        params: { id: transactionId }
      });
      return { success: true, data: response.data };
    } catch (error) {
      console.error('❌ Erro ao buscar transação:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Valida webhook do Oasyfy
   */
  validateWebhook(payload, token) {
    // Implementar validação de webhook conforme documentação
    // Por enquanto, retorna true (implementar validação real)
    return true;
  }

  /**
   * Processa webhook do Oasyfy
   */
  processWebhook(payload) {
    try {
      const {
        event,
        token,
        transaction,
        client,
        orderItems = []
      } = payload;

      // Validar webhook
      if (!this.validateWebhook(payload, token)) {
        throw new Error('Webhook inválido');
      }

      // Normalizar dados do webhook para compatibilidade
      const normalizedWebhook = {
        event,
        transaction_id: transaction?.id,
        client_identifier: transaction?.identifier,
        status: transaction?.status?.toLowerCase(),
        payment_method: transaction?.paymentMethod,
        amount: transaction?.amount,
        currency: transaction?.currency,
        created_at: transaction?.createdAt,
        payed_at: transaction?.payedAt,
        client: {
          id: client?.id,
          name: client?.name,
          email: client?.email,
          phone: client?.phone,
          document: client?.cpf || client?.cnpj
        },
        pix_information: transaction?.pixInformation,
        pix_metadata: transaction?.pixMetadata,
        products: orderItems.map(item => ({
          id: item?.id,
          price: item?.price,
          product: item?.product
        })),
        gateway: 'oasyfy',
        raw_payload: payload
      };

      console.log('📥 Webhook Oasyfy processado:', {
        event,
        transaction_id: normalizedWebhook.transaction_id,
        status: normalizedWebhook.status
      });

      return normalizedWebhook;

    } catch (error) {
      console.error('❌ Erro ao processar webhook Oasyfy:', error.message);
      throw error;
    }
  }
}

module.exports = OasyfyService;
