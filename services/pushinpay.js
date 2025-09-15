const axios = require('axios');

/**
 * Serviço de integração com PushinPay
 * Mantém compatibilidade com o sistema atual
 */
class PushinPayService {
  constructor() {
    this.baseUrl = 'https://api.pushinpay.com.br/api';
    this.token = process.env.PUSHINPAY_TOKEN;
    
    if (!this.token) {
      console.warn('⚠️ Token PushinPay não configurado');
    }
  }

  /**
   * Verifica se o serviço está configurado corretamente
   */
  isConfigured() {
    return !!this.token;
  }

  /**
   * Cria headers de autenticação para requisições
   */
  getAuthHeaders() {
    if (!this.isConfigured()) {
      throw new Error('Token PushinPay não configurado');
    }

    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  /**
   * Cria cobrança PIX
   * @param {Object} paymentData - Dados do pagamento
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
      if (!identifier || !amount) {
        throw new Error('Dados obrigatórios não fornecidos: identifier, amount');
      }

      // Converter valor para centavos (PushinPay usa centavos)
      const valorCentavos = Math.round(amount * 100);

      const payload = {
        value: valorCentavos,
        split_rules: [],
        metadata: {
          ...metadata,
          identifier,
          gateway: 'pushinpay',
          created_at: new Date().toISOString()
        }
      };

      // Adicionar webhook URL se fornecida
      if (callbackUrl) {
        payload.webhook_url = callbackUrl;
      }

      // Adicionar dados do cliente se fornecidos
      if (client) {
        payload.metadata.client_name = client.name;
        payload.metadata.client_email = client.email;
        payload.metadata.client_phone = client.phone;
        payload.metadata.client_document = client.document;
      }

      // Adicionar produtos se fornecidos
      if (products && products.length > 0) {
        payload.metadata.products = JSON.stringify(products);
        payload.metadata.products_count = products.length;
      }

      console.log('🚀 Criando cobrança PIX via PushinPay:', {
        identifier,
        amount,
        valor_centavos: valorCentavos,
        products: products.length,
        callbackUrl: !!callbackUrl
      });

      const response = await axios.post(`${this.baseUrl}/pix/cashIn`, payload, {
        headers: this.getAuthHeaders()
      });

      const responseData = response.data;
      
      // Normalizar resposta
      const normalizedResponse = {
        success: true,
        transaction_id: responseData.id,
        qr_code_base64: responseData.qr_code_base64,
        pix_copia_cola: responseData.qr_code,
        qr_code_image: responseData.qr_code_image,
        fee: 0, // PushinPay não retorna fee na resposta
        status: 'OK',
        gateway: 'pushinpay',
        raw_response: responseData
      };

      console.log('✅ Cobrança PIX criada via PushinPay:', {
        transaction_id: normalizedResponse.transaction_id,
        status: normalizedResponse.status
      });

      return normalizedResponse;

    } catch (error) {
      console.error('❌ Erro ao criar cobrança PIX via PushinPay:', error.message);
      
      if (error.response) {
        console.error('Detalhes do erro:', error.response.data);
        return {
          success: false,
          error: error.response.data?.message || error.message,
          status_code: error.response.status,
          gateway: 'pushinpay'
        };
      }

      return {
        success: false,
        error: error.message,
        gateway: 'pushinpay'
      };
    }
  }

  /**
   * Processa webhook do PushinPay
   */
  processWebhook(payload) {
    try {
      const {
        id,
        status,
        payer_name,
        payer_national_registration,
        end_to_end_id,
        pix_end_to_end_id,
        amount,
        created_at,
        paid_at
      } = payload;

      // Normalizar dados do webhook para compatibilidade
      const normalizedWebhook = {
        event: status === 'paid' ? 'TRANSACTION_PAID' : 'TRANSACTION_UPDATED',
        transaction_id: id,
        client_identifier: id, // PushinPay usa o ID como identificador
        status: status?.toLowerCase(),
        payment_method: 'PIX',
        amount: amount ? amount / 100 : null, // Converter de centavos para reais (campo 'amount' no webhook)
        currency: 'BRL',
        created_at: created_at,
        payed_at: paid_at,
        client: {
          name: payer_name,
          document: payer_national_registration
        },
        pix_information: {
          end_to_end_id: end_to_end_id || pix_end_to_end_id
        },
        gateway: 'pushinpay',
        raw_payload: payload
      };

      console.log('📥 Webhook PushinPay processado:', {
        event: normalizedWebhook.event,
        transaction_id: normalizedWebhook.transaction_id,
        status: normalizedWebhook.status
      });

      return normalizedWebhook;

    } catch (error) {
      console.error('❌ Erro ao processar webhook PushinPay:', error.message);
      throw error;
    }
  }

  /**
   * Verifica status de uma transação
   * Usa o endpoint oficial da PushInPay: GET /api/pix/{id}
   */
  async getTransactionStatus(transactionId) {
    try {
      if (!this.isConfigured()) {
        throw new Error('Token PushinPay não configurado');
      }

      console.log('🔍 Consultando status da transação PushinPay:', transactionId);

      const response = await axios.get(`${this.baseUrl}/pix/${transactionId}`, {
        headers: this.getAuthHeaders()
      });

      const responseData = response.data;
      
      // Normalizar resposta do status
      const normalizedStatus = {
        success: true,
        transaction_id: responseData.id,
        status: responseData.status?.toLowerCase() || 'unknown',
        amount: responseData.value ? responseData.value / 100 : null, // Converter de centavos para reais (usar campo 'value')
        created_at: responseData.created_at,
        paid_at: responseData.paid_at,
        payer_name: responseData.payer_name,
        payer_national_registration: responseData.payer_national_registration,
        end_to_end_id: responseData.end_to_end_id || responseData.pix_end_to_end_id,
        gateway: 'pushinpay',
        raw_response: responseData
      };

      console.log('✅ Status da transação PushinPay consultado:', {
        transaction_id: normalizedStatus.transaction_id,
        status: normalizedStatus.status
      });

      return normalizedStatus;

    } catch (error) {
      console.error('❌ Erro ao consultar status da transação PushinPay:', error.message);
      
      if (error.response) {
        const statusCode = error.response.status;
        const errorData = error.response.data;
        
        // 404 significa que a transação não foi encontrada
        if (statusCode === 404) {
          return {
            success: false,
            error: 'Transação não encontrada',
            status_code: 404,
            transaction_id: transactionId,
            gateway: 'pushinpay'
          };
        }
        
        return {
          success: false,
          error: errorData?.message || error.message,
          status_code: statusCode,
          transaction_id: transactionId,
          gateway: 'pushinpay'
        };
      }

      return {
        success: false,
        error: error.message,
        transaction_id: transactionId,
        gateway: 'pushinpay'
      };
    }
  }
}

module.exports = PushinPayService;
