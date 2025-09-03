const axios = require('axios');

/**
 * Integração com PushinPay usando a implementação estável do projeto bot
 * Esta implementação replica a lógica testada e funcional do TelegramBotService
 */
class PushinPayBotIntegration {
  constructor() {
    this.apiBase = 'https://api.pushinpay.com.br';
    this.token = process.env.PUSHINPAY_TOKEN;
    
    if (!this.token) {
      console.warn('⚠️ PUSHINPAY_TOKEN não configurado');
    }
  }

  /**
   * Criar pagamento PIX usando a mesma lógica do bot
   * Baseado em TelegramBotService._executarGerarCobranca
   * 
   * @param {Object} paymentData - Dados do pagamento
   * @param {number} paymentData.amount - Valor em reais (será convertido para centavos)
   * @param {Array} paymentData.split_rules - Regras de split (opcional)
   * @param {string} paymentData.webhook_url - URL do webhook (opcional, será gerada automaticamente se não fornecida)
   * @param {Object} paymentData.trackingData - Dados de tracking UTM (opcional)
   * @param {string} paymentData.trackingData.utm_source - Fonte UTM
   * @param {string} paymentData.trackingData.utm_medium - Meio UTM
   * @param {string} paymentData.trackingData.utm_campaign - Campanha UTM
   * @param {string} paymentData.trackingData.utm_term - Termo UTM
   * @param {string} paymentData.trackingData.utm_content - Conteúdo UTM
   * @param {Object} paymentData.metadata - Metadata adicional (será mesclado com trackingData)
   */
  async createPixPayment(paymentData) {
    try {
      console.log('🚀 [PushinPay-Bot] Iniciando criação de pagamento PIX...');
      console.log('📋 [PushinPay-Bot] Dados recebidos:', JSON.stringify(paymentData, null, 2));

      if (!this.token) {
        throw new Error('Token PushinPay não configurado');
      }

      // Validar valor mínimo (50 centavos)
      const valueInCents = Math.round(paymentData.amount * 100);
      if (valueInCents < 50) {
        throw new Error('Valor mínimo é de 50 centavos (R$ 0,50)');
      }

      // 🔥 IMPLEMENTAÇÃO IGUAL AO BOT: Extrair UTMs do tracking data
      const metadata = {};
      
      // Verificar se paymentData.trackingData existe e é um objeto antes de acessar suas propriedades
      const trackingData = paymentData.trackingData || paymentData.metadata || {};
      if (trackingData && typeof trackingData === 'object') {
        if (trackingData.utm_source) metadata.utm_source = trackingData.utm_source;
        if (trackingData.utm_medium) metadata.utm_medium = trackingData.utm_medium;
        if (trackingData.utm_campaign) metadata.utm_campaign = trackingData.utm_campaign;
        if (trackingData.utm_term) metadata.utm_term = trackingData.utm_term;
        if (trackingData.utm_content) metadata.utm_content = trackingData.utm_content;
      }

      // Adicionar source para identificação
      metadata.source = 'privacy-sync-bot-integration';

      // 🔥 IMPLEMENTAÇÃO IGUAL AO BOT: Gerar webhook URL automaticamente se não fornecido
      const webhookUrl = paymentData.webhook_url || 
        (process.env.BASE_URL ? `${process.env.BASE_URL}/webhook/pushinpay` : undefined);

      // 🔥 IMPLEMENTAÇÃO IGUAL AO BOT: Estrutura de payload
      const pushPayload = {
        value: valueInCents,
        split_rules: paymentData.split_rules || []
      };
      
      // Adicionar webhook_url se disponível (igual ao bot)
      if (webhookUrl) pushPayload.webhook_url = webhookUrl;
      
      // Adicionar metadata se há dados (igual ao bot)
      if (Object.keys(metadata).length) pushPayload.metadata = metadata;

      // 🔥 LOGS DETALHADOS IGUAL AO BOT
      console.log('[DEBUG] Tracking data extraído:', {
        utm_source: trackingData.utm_source,
        utm_medium: trackingData.utm_medium,
        utm_campaign: trackingData.utm_campaign,
        utm_term: trackingData.utm_term,
        utm_content: trackingData.utm_content
      });
      console.log('[DEBUG] Metadata final:', metadata);
      console.log('[DEBUG] Webhook URL:', webhookUrl);
      console.log('[DEBUG] Corpo enviado à PushinPay:', pushPayload);
      
      console.log('📤 [PushinPay-Bot] Enviando dados para API:', JSON.stringify(pushPayload, null, 2));
      console.log('🌐 [PushinPay-Bot] Endpoint:', `${this.apiBase}/api/pix/cashIn`);

      // Usar a mesma chamada da implementação estável do bot
      const response = await axios.post(
        `${this.apiBase}/api/pix/cashIn`,
        pushPayload,
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          }
        }
      );

      console.log('📥 [PushinPay-Bot] Resposta recebida:', JSON.stringify(response.data, null, 2));

      const { qr_code_base64, qr_code, id: apiId } = response.data;
      
      // 🔥 IMPLEMENTAÇÃO IGUAL AO BOT: Normalizar ID
      const normalizedId = apiId ? apiId.toLowerCase() : null;

      if (!normalizedId) {
        throw new Error('ID da transação não retornado pela PushinPay');
      }
      
      // Validar resposta (igual ao bot)
      if (!qr_code_base64 || !qr_code) {
        throw new Error('QR code não retornado pela PushinPay');
      }

      console.log('✅ [PushinPay-Bot] PIX criado com sucesso:', normalizedId);

      // Retornar no formato esperado pelo privacy (com ID normalizado)
      return {
        ...response.data,
        id: normalizedId,
        payment_id: normalizedId,
        pix_code: qr_code,
        qr_code_image: qr_code_base64,
        gateway: 'pushinpay',
        source: 'bot-integration'
      };

    } catch (error) {
      console.error('❌ [PushinPay-Bot] Erro ao criar pagamento PIX:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });

      // Tratamento de erros baseado na implementação do bot
      if (error.response?.status === 429) {
        throw new Error('Limite de requisições PushinPay excedido');
      } else if (error.response?.status === 400) {
        throw new Error(`Erro de validação PushinPay: ${error.response.data?.message || 'Dados inválidos'}`);
      } else if (error.response?.status === 401) {
        throw new Error('Token de autenticação PushinPay inválido');
      }

      throw error;
    }
  }

  /**
   * Consultar status do pagamento usando a mesma lógica do bot
   * Baseado na implementação do server.js
   */
  async getPaymentStatus(paymentId) {
    try {
      console.log('🔍 [PushinPay-Bot] Consultando status do pagamento:', paymentId);

      if (!this.token) {
        throw new Error('Token PushinPay não configurado');
      }

      // Usar o endpoint correto conforme documentação PushinPay
      const response = await axios.get(
        `${this.apiBase}/api/transactions/${paymentId}`,
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/json',
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('📥 [PushinPay-Bot] Status recebido:', JSON.stringify(response.data, null, 2));

      return {
        ...response.data,
        payment_id: response.data.id,
        gateway: 'pushinpay',
        source: 'bot-integration'
      };

    } catch (error) {
      console.error('❌ [PushinPay-Bot] Erro ao consultar status:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        paymentId
      });

      // Se retornar 404, retornar null
      if (error.response?.status === 404) {
        console.log('ℹ️ [PushinPay-Bot] Pagamento não encontrado (404) - retornando null');
        return null;
      }

      if (error.response?.status === 401) {
        throw new Error('Token de autenticação PushinPay inválido');
      } else if (error.response?.status === 429) {
        throw new Error('Limite de requisições PushinPay excedido');
      }

      throw error;
    }
  }

  /**
   * Obter informações do ambiente
   */
  getEnvironmentInfo() {
    return {
      environment: process.env.NODE_ENV || 'production',
      api_base: this.apiBase,
      token_configured: !!this.token,
      token_preview: this.token ? `${this.token.substring(0, 10)}...` : 'Não configurado',
      source: 'bot-integration'
    };
  }

  /**
   * Validar split rules conforme implementação do bot
   */
  validateSplitRules(splitRules, totalValue) {
    if (!Array.isArray(splitRules)) {
      throw new Error('split_rules deve ser um array');
    }

    for (const rule of splitRules) {
      if (!rule.value || !rule.account_id) {
        throw new Error('Cada split_rule deve ter value e account_id');
      }
      
      if (rule.value > totalValue) {
        throw new Error('Valor do split não pode ser maior que o valor total da transação');
      }
    }

    const totalSplit = splitRules.reduce((sum, rule) => sum + rule.value, 0);
    if (totalSplit > totalValue) {
      throw new Error('Soma dos splits não pode exceder o valor total da transação');
    }

    return true;
  }
}

module.exports = PushinPayBotIntegration;