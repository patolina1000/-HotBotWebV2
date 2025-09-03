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

      // Estrutura de dados conforme implementação do bot
      const pushPayload = {
        value: valueInCents,
        split_rules: paymentData.split_rules || []
      };

      // Adicionar webhook_url se fornecido
      if (paymentData.webhook_url) {
        pushPayload.webhook_url = paymentData.webhook_url;
      }

      // Adicionar metadata se fornecido
      const metadata = {
        source: 'privacy-sync-bot-integration',
        ...(paymentData.metadata || {})
      };
      
      if (Object.keys(metadata).length > 0) {
        pushPayload.metadata = metadata;
      }

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
      
      // Validar resposta
      if (!qr_code_base64 || !qr_code || !apiId) {
        throw new Error('Resposta inválida da API PushinPay: campos obrigatórios ausentes');
      }

      // Retornar no formato esperado pelo privacy
      return {
        ...response.data,
        payment_id: apiId,
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

      // Usar o endpoint correto da implementação do bot
      const response = await axios.get(
        `${this.apiBase}/api/pix/cashIn/${paymentId}`,
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/json'
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