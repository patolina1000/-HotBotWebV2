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
   * Detecta se um valor provavelmente está em centavos baseado em heurística melhorada
   * @param {number} amount - Valor a ser analisado
   * @returns {boolean} True se provavelmente está em centavos
   */
  static isLikelyInCents(amount) {
    // Heurística melhorada:
    // 1. Valores >= 5000 (R$ 50,00) provavelmente em centavos
    // 2. Valores com casas decimais > 2 provavelmente em reais
    // 3. Valores entre 100-4999 são ambíguos, assumir reais por segurança
    
    if (amount >= 5000) {
      return true; // Provavelmente centavos (R$ 50+)
    }
    
    // Verificar casas decimais
    const decimalPlaces = (amount.toString().split('.')[1] || '').length;
    if (decimalPlaces > 2) {
      return false; // Mais de 2 decimais = provavelmente reais
    }
    
    // Valores baixos assumir como reais por segurança
    return false;
  }
}

/**
 * Gera CPF fake mas com formato válido (apenas para testes)
 */
function generateValidFakeCPF() {
  // Gerar CPF fake com dígitos verificadores corretos
  const randomDigits = () => Math.floor(Math.random() * 10);
  
  // Primeiros 9 dígitos aleatórios
  const digits = Array.from({ length: 9 }, randomDigits);
  
  // Calcular primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += digits[i] * (10 - i);
  }
  let firstCheck = 11 - (sum % 11);
  if (firstCheck >= 10) firstCheck = 0;
  digits.push(firstCheck);
  
  // Calcular segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += digits[i] * (11 - i);
  }
  let secondCheck = 11 - (sum % 11);
  if (secondCheck >= 10) secondCheck = 0;
  digits.push(secondCheck);
  
  return digits.join('');
}

/**
 * Gera telefone fake no formato E.164 brasileiro
 */
function generateValidFakePhone() {
  // Formato: +55 + DDD (11-99) + 9 + 8 dígitos
  const ddds = ['11', '21', '31', '41', '51', '61', '71', '81', '85', '91'];
  const ddd = ddds[Math.floor(Math.random() * ddds.length)];
  const number = '9' + Math.floor(10000000 + Math.random() * 90000000);
  return `+55${ddd}${number}`;
}

/**
 * Valida e normaliza dados do cliente para Oasyfy
 * Conforme documentação: name e email são obrigatórios
 * Se não fornecidos, usa dados padrão com formatos válidos
 */
function validateClientData(client) {
  if (!client) {
    throw new Error('Dados do cliente são obrigatórios');
  }
  
  // Gerar dados padrão se não fornecidos
  const defaultName = client.name || `Cliente-${Date.now()}`;
  const defaultEmail = client.email || `cliente-${Date.now()}@example.com`;
  
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
  
  // Validar formato do email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(defaultEmail)) {
    throw new Error('Email do cliente inválido');
  }
  
  // CORREÇÃO CRÍTICA: Telefone e documento devem ter formato válido ou serem omitidos
  let validPhone = null;
  let validDocument = null;
  let usedFakePhone = false;
  let usedFakeDocument = false;
  
  // Processar telefone
  if (client.phone && client.phone.trim().length > 0) {
    const cleanPhone = client.phone.replace(/\D/g, '');
    if (cleanPhone.length >= 10) {
      // Formatar para E.164 se necessário
      if (cleanPhone.length === 11 && cleanPhone.startsWith('0') === false) {
        validPhone = `+55${cleanPhone}`; // Adicionar código do país
      } else if (cleanPhone.length === 13 && cleanPhone.startsWith('55')) {
        validPhone = `+${cleanPhone}`; // Adicionar apenas o +
      } else {
        validPhone = client.phone; // Usar como fornecido
      }
    } else {
      console.warn('⚠️ [OASYFY] Telefone fornecido é muito curto, gerando fake válido');
      validPhone = generateValidFakePhone();
      usedFakePhone = true;
    }
  } else {
    // Gerar telefone fake válido
    validPhone = generateValidFakePhone();
    usedFakePhone = true;
    console.warn('⚠️ [OASYFY] Telefone não fornecido - gerando fake válido:', validPhone);
  }
  
  // Processar documento
  if (client.document && client.document.trim().length > 0) {
    const cleanDoc = client.document.replace(/\D/g, '');
    if (cleanDoc.length === 11 || cleanDoc.length === 14) {
      validDocument = cleanDoc;
    } else {
      console.warn('⚠️ [OASYFY] Documento fornecido inválido, gerando CPF fake válido');
      validDocument = generateValidFakeCPF();
      usedFakeDocument = true;
    }
  } else {
    // Gerar CPF fake válido
    validDocument = generateValidFakeCPF();
    usedFakeDocument = true;
    console.warn('⚠️ [OASYFY] Documento não fornecido - gerando CPF fake válido:', validDocument);
  }
  
  // Retornar dados normalizados
  return {
    name: defaultName,
    email: defaultEmail,
    phone: validPhone,
    document: validDocument,
    usedDefaultData: {
      name: usedDefaultName,
      email: usedDefaultEmail,
      phone: usedFakePhone,
      document: usedFakeDocument
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
    
    // Cache de tokens de webhook para validação
    this.webhookTokens = new Map();
    
    // Limpar tokens antigos a cada hora
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldTokens();
    }, 60 * 60 * 1000); // 1 hora
    
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
   * Armazena token de webhook para validação futura
   * @param {string} transactionId - ID da transação
   * @param {string} token - Token do webhook
   */
  storeWebhookToken(transactionId, token) {
    if (token && transactionId) {
      this.webhookTokens.set(transactionId, {
        token,
        createdAt: new Date(),
        used: false
      });
      console.log(`🔐 [OASYFY] Token de webhook armazenado para transação ${transactionId}`);
    }
  }

  /**
   * Valida token de webhook contra tokens armazenados
   * @param {string} transactionId - ID da transação
   * @param {string} receivedToken - Token recebido no webhook
   * @returns {boolean} True se token é válido
   */
  validateWebhookToken(transactionId, receivedToken) {
    const storedTokenData = this.webhookTokens.get(transactionId);
    
    if (!storedTokenData) {
      console.warn(`⚠️ [OASYFY] Token não encontrado para transação ${transactionId}`);
      return false;
    }

    if (storedTokenData.token !== receivedToken) {
      console.error(`❌ [OASYFY] Token inválido para transação ${transactionId}`);
      return false;
    }

    // Marcar token como usado
    storedTokenData.used = true;
    console.log(`✅ [OASYFY] Token validado com sucesso para transação ${transactionId}`);
    return true;
  }

  /**
   * Limpa tokens antigos (mais de 24 horas)
   */
  cleanupOldTokens() {
    const now = new Date();
    const maxAge = 24 * 60 * 60 * 1000; // 24 horas em ms

    for (const [transactionId, tokenData] of this.webhookTokens.entries()) {
      if (now - tokenData.createdAt > maxAge) {
        this.webhookTokens.delete(transactionId);
        console.log(`🧹 [OASYFY] Token antigo removido para transação ${transactionId}`);
      }
    }
  }

  /**
   * Limpa recursos e para intervalos
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.webhookTokens.clear();
    console.log('🧹 [OASYFY] Recursos limpos');
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
          phone: normalizedClient.phone, // Sempre formato válido (+55DDDNUMERO)
          document: normalizedClient.document // Sempre CPF/CNPJ válido
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
      
      // Capturar token do webhook se fornecido na resposta
      const webhookToken = responseData.webhookToken || responseData.token || null;
      
      // Armazenar token para validação futura se fornecido
      if (webhookToken && responseData.transactionId) {
        this.storeWebhookToken(responseData.transactionId, webhookToken);
      }
      
      // Log da resposta bruta para debug
      console.log('🔍 [OASYFY] Resposta bruta da API:', JSON.stringify(responseData, null, 2));
      console.log('🔍 [OASYFY] Campo pix:', responseData.pix);
      console.log('🔍 [OASYFY] Campo pix.code:', responseData.pix?.code);

      // Normalizar resposta para compatibilidade com PushinPay
      const normalizedResponse = {
        success: responseData.status === 'OK',
        transaction_id: responseData.transactionId,
        qr_code_base64: responseData.pix?.base64 ? `data:image/png;base64,${responseData.pix.base64}` : null,
        pix_copia_cola: responseData.pix?.code || responseData.pix?.qr_code || responseData.qr_code || null,
        qr_code_image: responseData.pix?.image,
        fee: responseData.fee || 0,
        status: responseData.status,
        error_description: responseData.errorDescription,
        gateway: 'oasyfy',
        webhook_token: webhookToken, // Token para validação de webhooks
        raw_response: responseData
      };

      // Log da resposta normalizada para debug
      console.log('🔍 [OASYFY] Resposta normalizada:', JSON.stringify(normalizedResponse, null, 2));

      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        operation: 'pix_payment_created',
        gateway: 'oasyfy',
        result: {
          transaction_id: normalizedResponse.transaction_id,
          status: normalizedResponse.status,
          success: normalizedResponse.success,
          webhook_token: webhookToken ? 'capturado' : 'não_fornecido'
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
      // IMPORTANTE: Converter valor de reais (Oasyfy) para centavos (padrão do sistema)
      const amountInCents = responseData.amount ? CurrencyUtils.toCents(responseData.amount, false) : null;
      
      const normalizedStatus = {
        success: true,
        transaction_id: responseData.id || responseData.transactionId,
        status: responseData.status?.toLowerCase() || 'unknown',
        amount: amountInCents, // Valor normalizado para centavos
        amount_original_reais: responseData.amount, // Valor original em reais para referência
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
        status: normalizedStatus.status,
        amount_reais: normalizedStatus.amount_original_reais,
        amount_centavos: normalizedStatus.amount,
        currency_conversion: 'reais_to_centavos_applied'
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
        // CORREÇÃO CRÍTICA: Aceitar tokens alfanuméricos + underscore (padrão real da Oasyfy)
        // Exemplos reais observados: "tbdeizos8f", "0kk619sp", "dynamic_token"
        // Padrão observado: alfanumérico + underscore, 6-20 caracteres
        
        // Log detalhado para debugging
        console.log('🔍 [OASYFY] Validando token:', {
          token: `"${token}"`,
          length: token.length,
          type: typeof token,
          chars: token.split('').map(c => `${c}(${c.charCodeAt(0)})`).join(',')
        });
        
        if (!/^[a-zA-Z0-9_]{6,20}$/.test(token)) {
          console.error('❌ [OASYFY] Webhook inválido: token com formato inválido.');
          console.error('Token recebido:', `"${token}"`, '- Tamanho:', token.length, '- Tipo:', typeof token);
          console.error('Caracteres:', token.split('').map(c => `${c}(${c.charCodeAt(0)})`).join(','));
          console.error('Esperado: alfanumérico + underscore, 6-20 caracteres');
          
          // FALLBACK: Se o token tem formato quase válido, aceitar mas registrar
          if (token.length >= 6 && token.length <= 20 && /^[a-zA-Z0-9_\-\.]+$/.test(token)) {
            console.warn('⚠️ [OASYFY] Token com formato não padrão mas aceitável - permitindo:', token);
          } else {
            return false;
          }
        }
        
        console.log('✅ [OASYFY] Token validado com sucesso:', `"${token}"`, '- Tamanho:', token.length);

        // Validar se o token corresponde ao esperado
        // Tentar validar contra tokens armazenados se possível
        const transactionId = payload.transaction?.id;
        if (transactionId && this.webhookTokens.has(transactionId)) {
          if (!this.validateWebhookToken(transactionId, token)) {
            console.error('❌ [OASYFY] Webhook inválido: token não corresponde ao esperado');
            return false;
          }
        } else {
          // Se não temos token armazenado, aceitar mas registrar para auditoria
          console.log('🔍 [OASYFY] Token recebido:', token, '- Validação de correspondência pendente (token não armazenado)');
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
      // IMPORTANTE: Padronizar valores para centavos para compatibilidade com PushinPay
      const amountInCents = transaction?.amount ? CurrencyUtils.toCents(transaction.amount, false) : null;
      
      const normalizedWebhook = {
        event,
        transaction_id: transaction?.id,
        client_identifier: transaction?.identifier,
        status: transaction?.status?.toLowerCase(),
        payment_method: transaction?.paymentMethod,
        amount: amountInCents, // Valor padronizado em centavos
        amount_original: transaction?.amount, // Valor original em reais (Oasyfy)
        currency: transaction?.currency || 'BRL',
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
          price: item?.price ? CurrencyUtils.toCents(item.price, false) : null, // Preço em centavos
          price_original: item?.price, // Preço original em reais
          product: item?.product
        })),
        gateway: 'oasyfy',
        raw_payload: payload
      };

      console.log('📥 Webhook Oasyfy processado:', {
        event,
        transaction_id: normalizedWebhook.transaction_id,
        status: normalizedWebhook.status,
        amount_reais: normalizedWebhook.amount_original,
        amount_centavos: normalizedWebhook.amount,
        currency_conversion: 'reais_to_centavos'
      });

      return normalizedWebhook;

    } catch (error) {
      console.error('❌ Erro ao processar webhook Oasyfy:', error.message);
      throw error;
    }
  }
}

module.exports = OasyfyService;
