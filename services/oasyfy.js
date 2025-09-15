const axios = require('axios');
const crypto = require('crypto');

/**
 * Utilitários para conversão de valores monetários
 */
class CurrencyUtils {
  /**
   * Converte valor para centavos (PushinPay sempre usa centavos)
   * @param {number} amount - Valor em reais ou centavos
   * @param {boolean} isAmountInCents - Se true, amount já está em centavos
   * @returns {number} Valor em centavos
   */
  static toCents(amount, isAmountInCents = false) {
    if (isAmountInCents) {
      return Math.round(amount);
    }
    return Math.round(amount * 100);
  }

  /**
   * Converte valor para reais (Oasyfy sempre usa reais)
   * @param {number} amount - Valor em reais ou centavos
   * @param {boolean} isAmountInCents - Se true, amount está em centavos
   * @returns {number} Valor em reais
   */
  static toReais(amount, isAmountInCents = false) {
    if (isAmountInCents) {
      return amount / 100;
    }
    return amount;
  }

  /**
   * Detecta se um valor provavelmente está em centavos baseado em heurística
   * @param {number} amount - Valor a ser analisado
   * @returns {boolean} True se provavelmente está em centavos
   */
  static isLikelyInCents(amount) {
    // Heurística: valores maiores que 1000 provavelmente já estão em centavos
    // Isso funciona para valores acima de R$ 10,00
    return amount > 1000;
  }
}

/**
 * Valida e normaliza dados do cliente para Oasyfy
 * Conforme documentação: name e email são obrigatórios
 * Se não fornecidos, usa dados padrão inteligentes
 */
function validateClientData(client) {
  if (!client) {
    throw new Error('Dados do cliente são obrigatórios');
  }
  
  // Gerar dados padrão se não fornecidos
  const defaultName = client.name || `Cliente-${Date.now()}`;
  const defaultEmail = client.email || `cliente-${Date.now()}@sistema.local`;
  
  // Validar se dados padrão foram usados
  const usedDefaultName = !client.name || client.name.trim().length === 0;
  const usedDefaultEmail = !client.email || client.email.trim().length === 0;
  
  if (usedDefaultName || usedDefaultEmail) {
    console.warn('⚠️ [OASYFY] Dados do cliente não fornecidos - usando dados padrão:', {
      default_name: usedDefaultName,
      default_email: usedDefaultEmail,
      identifier: client.identifier || 'N/A'
    });
  }
  
  // Validar formato do email (mesmo sendo padrão)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(defaultEmail)) {
    throw new Error('Email do cliente inválido');
  }
  
  // Campos opcionais conforme documentação oficial
  if (!client.phone || client.phone.trim().length === 0) {
    console.warn('⚠️ [OASYFY] Telefone do cliente não fornecido - campo opcional');
  }
  
  if (!client.document || client.document.trim().length === 0) {
    console.warn('⚠️ [OASYFY] Documento do cliente não fornecido - campo opcional');
  }
  
  // Retornar dados normalizados
  return {
    name: defaultName,
    email: defaultEmail,
    phone: client.phone || '',
    document: client.document || '',
    usedDefaultData: {
      name: usedDefaultName,
      email: usedDefaultEmail
    }
  };
}

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
      if (!identifier || !amount) {
        throw new Error('Dados obrigatórios não fornecidos: identifier, amount');
      }
      
      // Validar e normalizar dados do cliente específicos para Oasyfy
      const normalizedClient = validateClientData(client);

      // Oasyfy sempre trabalha com reais conforme documentação oficial
      // Detectar se o valor já está em centavos usando heurística
      const isAmountInCents = CurrencyUtils.isLikelyInCents(amount);
      const amountInReais = CurrencyUtils.toReais(amount, isAmountInCents);
      const shippingFeeInReais = CurrencyUtils.toReais(shippingFee || 0, isAmountInCents);
      const extraFeeInReais = CurrencyUtils.toReais(extraFee || 0, isAmountInCents);
      const discountInReais = CurrencyUtils.toReais(discount || 0, isAmountInCents);

      // Calcular valor total dos produtos em reais
      const totalProductsInReais = products.reduce((acc, product) => {
        const productPriceInReais = CurrencyUtils.toReais(product.price, isAmountInCents);
        return acc + (productPriceInReais * product.quantity);
      }, 0);

      // Validar se o valor total está correto
      const calculatedTotalInReais = totalProductsInReais + shippingFeeInReais + extraFeeInReais - discountInReais;
      if (Math.abs(calculatedTotalInReais - amountInReais) > 0.01) {
        console.warn(`⚠️ Diferença no cálculo: esperado ${amountInReais} reais, calculado ${calculatedTotalInReais} reais`);
      }

      // Dados do cliente já foram validados e normalizados pela função validateClientData
      const payload = {
        identifier,
        amount: amountInReais, // Valor em reais para Oasyfy
        shippingFee: shippingFeeInReais,
        extraFee: extraFeeInReais,
        discount: discountInReais,
        client: {
          name: normalizedClient.name,
          email: normalizedClient.email,
          phone: normalizedClient.phone,
          document: normalizedClient.document
        },
        products: products.map(product => ({
          id: product.id,
          name: product.name,
          quantity: product.quantity,
          price: CurrencyUtils.toReais(product.price, isAmountInCents) // Preço em reais para Oasyfy
        })),
        metadata: {
          ...metadata,
          gateway: 'oasyfy',
          created_at: new Date().toISOString(),
          // Indicar se dados padrão foram usados (para transparência)
          default_data_used: normalizedClient.usedDefaultData,
          // Indicar se campos opcionais foram fornecidos (conforme documentação oficial)
          optional_fields_provided: {
            phone: !!(normalizedClient.phone && normalizedClient.phone.trim().length > 0),
            document: !!(normalizedClient.document && normalizedClient.document.trim().length > 0)
          },
          // Manter referência aos valores originais em centavos
          original_amount_centavos: amount,
          original_shipping_centavos: shippingFee || 0,
          original_extra_fee_centavos: extraFee || 0,
          original_discount_centavos: discount || 0
        }
      };

      // Adicionar callback URL se fornecida
      if (callbackUrl) {
        payload.callbackUrl = callbackUrl;
      }

      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        operation: 'create_pix_payment',
        gateway: 'oasyfy',
        data: {
          identifier,
          amount_centavos: amount,
          amount_reais: amountInReais,
          is_amount_in_cents: isAmountInCents,
          products_count: products.length,
          has_callback: !!callbackUrl,
          client_name: normalizedClient.name,
          client_email: normalizedClient.email,
          default_data_used: normalizedClient.usedDefaultData
        }
      }));

      const response = await axios.post(`${this.baseUrl}/gateway/pix/receive`, payload, {
        headers: this.getAuthHeaders()
      });

      const responseData = response.data;
      
      // Normalizar resposta para compatibilidade com PushinPay
      const normalizedResponse = {
        success: responseData.status === 'OK',
        transaction_id: responseData.transactionId,
        qr_code_base64: responseData.pix?.base64 ? `data:image/png;base64,${responseData.pix.base64}` : null,
        pix_copia_cola: responseData.pix?.code,
        qr_code_image: responseData.pix?.image,
        fee: responseData.fee || 0,
        status: responseData.status,
        error_description: responseData.errorDescription,
        gateway: 'oasyfy',
        raw_response: responseData
      };

      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        operation: 'pix_payment_created',
        gateway: 'oasyfy',
        result: {
          transaction_id: normalizedResponse.transaction_id,
          status: normalizedResponse.status,
          success: normalizedResponse.success
        }
      }));

      return normalizedResponse;

    } catch (error) {
      const errorData = {
        timestamp: new Date().toISOString(),
        operation: 'create_pix_payment_error',
        gateway: 'oasyfy',
        error: {
          message: error.message,
          type: error.name,
          has_response: !!error.response
        }
      };

      if (error.response) {
        errorData.error.response_data = error.response.data;
        errorData.error.status_code = error.response.status;
        console.error(JSON.stringify(errorData));
        
        return {
          success: false,
          error: error.response.data?.message || error.message,
          error_code: error.response.data?.errorCode,
          status_code: error.response.status,
          gateway: 'oasyfy'
        };
      }

      console.error(JSON.stringify(errorData));
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
      const response = await axios.get(`${this.baseUrl}/gateway/transactions?id=${transactionId}`, {
        headers: this.getAuthHeaders()
      });
      return { success: true, data: response.data };
    } catch (error) {
      console.error('❌ Erro ao buscar transação:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verifica status de uma transação
   * Usa o endpoint oficial da Oasyfy: GET /gateway/transactions?id={transactionId}
   */
  async getTransactionStatus(transactionId) {
    try {
      if (!this.isConfigured()) {
        throw new Error('Credenciais Oasyfy não configuradas');
      }

      console.log('🔍 Consultando status da transação Oasyfy:', transactionId);

      const response = await axios.get(`${this.baseUrl}/gateway/transactions?id=${transactionId}`, {
        headers: this.getAuthHeaders()
      });

      const responseData = response.data;
      
      // Normalizar resposta do status para compatibilidade com PushinPay
      const normalizedStatus = {
        success: true,
        transaction_id: responseData.id || responseData.transactionId,
        status: responseData.status?.toLowerCase() || 'unknown',
        amount: responseData.amount,
        created_at: responseData.createdAt || responseData.created_at,
        paid_at: responseData.payedAt || responseData.paid_at,
        payer_name: responseData.client?.name || responseData.payer_name,
        payer_national_registration: responseData.client?.cpf || responseData.client?.cnpj || responseData.payer_national_registration,
        end_to_end_id: responseData.pixInformation?.endToEndId || responseData.end_to_end_id,
        gateway: 'oasyfy',
        raw_response: responseData
      };

      console.log('✅ Status da transação Oasyfy consultado:', {
        transaction_id: normalizedStatus.transaction_id,
        status: normalizedStatus.status
      });

      return normalizedStatus;

    } catch (error) {
      console.error('❌ Erro ao consultar status da transação Oasyfy:', error.message);
      
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
            gateway: 'oasyfy'
          };
        }
        
        return {
          success: false,
          error: errorData?.message || error.message,
          status_code: statusCode,
          transaction_id: transactionId,
          gateway: 'oasyfy'
        };
      }

      return {
        success: false,
        error: error.message,
        transaction_id: transactionId,
        gateway: 'oasyfy'
      };
    }
  }

  /**
   * Valida webhook do Oasyfy
   * Conforme documentação: validar token e estrutura do payload
   */
  validateWebhook(payload, token) {
    try {
      // Validar estrutura básica do webhook
      if (!payload || typeof payload !== 'object') {
        console.error('❌ [OASYFY] Webhook inválido: payload não é um objeto');
        return false;
      }

      // Validar campos obrigatórios
      if (!payload.event || !payload.transaction || !payload.client) {
        console.error('❌ [OASYFY] Webhook inválido: campos obrigatórios ausentes');
        return false;
      }

      // Validar token (se fornecido)
      if (token) {
        // Verificar se o token tem formato válido (alfanumérico, 6-20 caracteres)
        if (!/^[a-zA-Z0-9]{6,20}$/.test(token)) {
          console.error('❌ [OASYFY] Webhook inválido: token com formato inválido');
          return false;
        }
      }

      // Validar estrutura da transação
      const transaction = payload.transaction;
      if (!transaction.id || !transaction.status) {
        console.error('❌ [OASYFY] Webhook inválido: dados da transação incompletos');
        return false;
      }

      // Validar status válido
      const validStatuses = ['COMPLETED', 'PENDING', 'FAILED', 'REFUNDED', 'CHARGED_BACK'];
      if (!validStatuses.includes(transaction.status)) {
        console.error('❌ [OASYFY] Webhook inválido: status inválido:', transaction.status);
        return false;
      }

      // Validar estrutura do cliente
      const client = payload.client;
      if (!client.id || !client.name || !client.email) {
        console.error('❌ [OASYFY] Webhook inválido: dados do cliente incompletos');
        return false;
      }

      console.log('✅ [OASYFY] Webhook validado com sucesso:', {
        event: payload.event,
        transaction_id: transaction.id,
        status: transaction.status,
        token_present: !!token
      });

      return true;

    } catch (error) {
      console.error('❌ [OASYFY] Erro ao validar webhook:', error.message);
      return false;
    }
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
        throw new Error('Webhook Oasyfy inválido: falha na validação');
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
