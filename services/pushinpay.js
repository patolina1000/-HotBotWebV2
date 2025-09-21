const axios = require('axios');

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
   * Detecta se um valor provavelmente está em centavos baseado em heurística melhorada
   * @param {number} amount - Valor a ser analisado
   * @returns {boolean} True se provavelmente está em centavos
   */
  static isLikelyInCents(amount, options = {}) {
    const { explicitHint } = options || {};

    if (typeof explicitHint === 'boolean') {
      return explicitHint;
    }

    const normalizedAmount =
      typeof amount === 'string' && amount.trim() !== ''
        ? Number(amount)
        : amount;

    if (typeof normalizedAmount !== 'number' || Number.isNaN(normalizedAmount) || !Number.isFinite(normalizedAmount)) {
      return false;
    }

    // Heurística existente: valores muito altos provavelmente já estão em centavos
    if (Math.abs(normalizedAmount) >= 5000) {
      return true;
    }

    // Verificar casas decimais
    const decimalPlaces = (normalizedAmount.toString().split('.')[1] || '').length;
    if (decimalPlaces > 2) {
      return false; // Mais de 2 decimais = provavelmente reais
    }

    return false;
  }
}

/**
 * Resolve sinalizações explícitas sobre a unidade do valor
 *
 * @param {Object} paymentData
 * @returns {{ explicitHint: boolean | undefined, source: string | null, normalizedUnit: string | null }}
 */
function resolveAmountHint(paymentData = {}) {
  if (!paymentData || typeof paymentData !== 'object') {
    return { explicitHint: undefined, source: null, normalizedUnit: null };
  }

  const booleanKeys = ['isAmountInCents', 'amountInCents', 'amount_is_in_cents'];
  for (const key of booleanKeys) {
    if (typeof paymentData[key] === 'boolean') {
      return { explicitHint: paymentData[key], source: key, normalizedUnit: null };
    }
  }

  const unitCandidates = [
    paymentData.amount_unit,
    paymentData.amountUnit,
    paymentData.amount_format,
    paymentData.amountFormat,
    paymentData.unit,
    paymentData.metadata?.amount_unit,
    paymentData.metadata?.amountUnit
  ].filter(value => typeof value === 'string' && value.trim().length > 0);

  if (unitCandidates.length > 0) {
    const normalizedUnit = unitCandidates[0].trim().toLowerCase();

    if (['cent', 'cents', 'centavo', 'centavos'].includes(normalizedUnit)) {
      return { explicitHint: true, source: 'amount_unit', normalizedUnit };
    }

    if (['real', 'reais', 'brl', 'r$'].includes(normalizedUnit)) {
      return { explicitHint: false, source: 'amount_unit', normalizedUnit };
    }

    return { explicitHint: undefined, source: 'amount_unit', normalizedUnit };
  }

  return { explicitHint: undefined, source: null, normalizedUnit: null };
}

/**
 * Serviço de integração com PushinPay
 * Mantém compatibilidade com o sistema atual
 */
class PushinPayService {
  constructor() {
    this.baseUrl = 'https://api.pushinpay.com.br/api';
    this.token = process.env.PUSHINPAY_TOKEN;
    this.lastQueryTime = 0; // Para controle de rate limiting (1 consulta por minuto)
    
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

      // PushinPay sempre trabalha com centavos conforme documentação oficial
      // Detectar se o valor já está em centavos usando sinalização explícita ou heurística
      const amountHint = resolveAmountHint(paymentData);
      const isAmountInCents = CurrencyUtils.isLikelyInCents(amount, {
        explicitHint: amountHint.explicitHint
      });
      const valorCentavos = CurrencyUtils.toCents(amount, isAmountInCents);
      
      // Validar valor mínimo (50 centavos conforme documentação PushinPay)
      if (valorCentavos < 50) {
        throw new Error('Valor mínimo é de 50 centavos');
      }

      // Payload conforme documentação oficial PushinPay
      // IMPORTANTE: Não incluir 'metadata' - não está na documentação oficial
      const payload = {
        value: valorCentavos,
        split_rules: []
      };

      const effectiveWebhookUrl = callbackUrl || metadata?.webhook_url;

      // Adicionar webhook URL se fornecida (conforme documentação)
      if (effectiveWebhookUrl) {
        payload.webhook_url = effectiveWebhookUrl;
      }

      // NOTA: Dados do cliente e produtos não são suportados no payload do PushinPay
      // conforme documentação oficial. Estes dados serão logados separadamente.

      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        operation: 'create_pix_payment',
        gateway: 'pushinpay',
        data: {
          identifier,
          amount_original: amount,
          amount_centavos: valorCentavos,
          is_amount_in_cents: isAmountInCents,
          amount_hint_source: amountHint.source,
          amount_hint_unit: amountHint.normalizedUnit,
          amount_hint_applied: typeof amountHint.explicitHint === 'boolean',
          products_count: products.length,
          has_callback: !!effectiveWebhookUrl,
          callback_url_source: callbackUrl ? 'callbackUrl' : (metadata?.webhook_url ? 'metadata.webhook_url' : null),
          client_name: client?.name || 'N/A',
          client_email: client?.email || 'N/A'
        },
        // Metadados para auditoria (não enviados na API)
        metadata: {
          identifier,
          gateway: 'pushinpay',
          created_at: new Date().toISOString(),
          client_data: client ? {
            name: client.name,
            email: client.email,
            phone: client.phone,
            document: client.document
          } : null,
          products: products
        }
      }));

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

      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        operation: 'pix_payment_created',
        gateway: 'pushinpay',
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
        gateway: 'pushinpay',
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
          status_code: error.response.status,
          gateway: 'pushinpay'
        };
      }

      console.error(JSON.stringify(errorData));
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
        amount: amount || null, // PushinPay já retorna em centavos no webhook
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
   * Usa o endpoint oficial da PushInPay: GET /api/transactions/{ID}
   * Implementa rate limiting: máximo 1 consulta por minuto conforme documentação
   */
  async getTransactionStatus(transactionId) {
    try {
      if (!this.isConfigured()) {
        throw new Error('Token PushinPay não configurado');
      }

      // Rate limiting: máximo 1 consulta por minuto (60000ms)
      const now = Date.now();
      const timeSinceLastQuery = now - this.lastQueryTime;
      
      if (timeSinceLastQuery < 60000) {
        const waitTime = 60000 - timeSinceLastQuery;
        console.warn(`⚠️ [PUSHINPAY] Rate limiting: aguardando ${waitTime}ms antes da próxima consulta`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      this.lastQueryTime = Date.now();
      console.log('🔍 Consultando status da transação PushinPay:', transactionId);

      const response = await axios.get(`${this.baseUrl}/transactions/${transactionId}`, {
        headers: this.getAuthHeaders()
      });

      const responseData = response.data;
      
      // Normalizar resposta do status
      const normalizedStatus = {
        success: true,
        transaction_id: responseData.id,
        status: responseData.status?.toLowerCase() || 'unknown',
        amount: responseData.value || null, // PushinPay já retorna em centavos
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
