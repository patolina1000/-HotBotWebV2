const axios = require('axios');
const { getConfig } = require('./loadConfig');

// Carregar configurações dinâmicas
const cfg = getConfig();
const PUSHINPAY_TOKEN = cfg.pushinpay?.token || '';

// URLs conforme documentação oficial
const API_BASE_PROD = 'https://api.pushinpay.com.br';
const API_BASE_SANDBOX = 'https://api-sandbox.pushinpay.com.br';
const API_BASE = cfg.environment === 'sandbox' ? API_BASE_SANDBOX : API_BASE_PROD;

async function pushinpayGet(endpoint, config = {}) {
  return axios.get(`${API_BASE}${endpoint}`, {
    ...config,
    headers: {
      'Authorization': `Bearer ${PUSHINPAY_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(config.headers || {})
    }
  });
}

async function pushinpayPost(endpoint, data, config = {}) {
  return axios.post(`${API_BASE}${endpoint}`, data, {
    ...config,
    headers: {
      'Authorization': `Bearer ${PUSHINPAY_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(config.headers || {})
    }
  });
}

// Função para criar um pagamento PIX
async function createPixPayment(paymentData) {
  try {
    console.log('🚀 [PushinPay] Iniciando criação de pagamento PIX...');
    console.log('📋 [PushinPay] Dados recebidos:', JSON.stringify(paymentData, null, 2));

    // Validar valor mínimo (50 centavos conforme documentação)
    const valueInCents = Math.round(paymentData.amount * 100);
    if (valueInCents < 50) {
      throw new Error('Valor mínimo é de 50 centavos (R$ 0,50) conforme documentação PushinPay');
    }

    // Estrutura de dados conforme documentação oficial da PushinPay
    const requestData = {
      value: valueInCents,  // Valor em centavos (obrigatório)
    };

    // Adicionar webhook_url se fornecido (opcional)
    if (paymentData.webhook_url) {
      requestData.webhook_url = paymentData.webhook_url;
    }

    // Adicionar split_rules se fornecido (opcional)
    if (paymentData.split_rules && Array.isArray(paymentData.split_rules)) {
      requestData.split_rules = paymentData.split_rules;
    } else {
      requestData.split_rules = []; // Array vazio por padrão
    }

    console.log('📤 [PushinPay] Enviando dados para API:', JSON.stringify(requestData, null, 2));
    console.log('🌐 [PushinPay] Endpoint:', `${API_BASE}/api/pix/cashIn`);

    // Endpoint correto conforme documentação: POST /api/pix/cashIn
    const response = await pushinpayPost('/api/pix/cashIn', requestData);
    
    console.log('📥 [PushinPay] Resposta recebida:', JSON.stringify(response.data, null, 2));
    
    // Validar resposta conforme documentação
    if (!response.data.id || !response.data.qr_code) {
      throw new Error('Resposta inválida da API PushinPay: faltam campos obrigatórios');
    }

    return {
      ...response.data,
      // Adicionar informações extras para compatibilidade
      payment_id: response.data.id,
      pix_code: response.data.qr_code,
      qr_code_image: response.data.qr_code_base64,
      gateway: 'pushinpay'
    };
  } catch (error) {
    console.error('❌ [PushinPay] Erro ao criar pagamento PIX:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      requestData: error.config?.data
    });
    
    // Melhorar tratamento de erros conforme documentação
    if (error.response?.status === 400) {
      throw new Error(`Erro de validação PushinPay: ${error.response.data?.message || 'Dados inválidos'}`);
    } else if (error.response?.status === 401) {
      throw new Error('Token de autenticação PushinPay inválido');
    } else if (error.response?.status === 429) {
      throw new Error('Limite de requisições PushinPay excedido');
    }
    
    throw error;
  }
}

// Função para consultar status do pagamento
async function getPaymentStatus(paymentId) {
  try {
    console.log('🔍 [PushinPay] Consultando status do pagamento:', paymentId);
    console.log('🌐 [PushinPay] Endpoint:', `${API_BASE}/api/transactions/${paymentId}`);
    
    // Endpoint correto conforme documentação: GET /api/transactions/{ID}
    const response = await pushinpayGet(`/api/transactions/${paymentId}`);
    
    console.log('📥 [PushinPay] Status recebido:', JSON.stringify(response.data, null, 2));
    
    // Adicionar informações extras para compatibilidade
    return {
      ...response.data,
      payment_id: response.data.id,
      gateway: 'pushinpay'
    };
  } catch (error) {
    console.error('❌ [PushinPay] Erro ao consultar status:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      paymentId
    });
    
    // Se retornar 404, a documentação menciona que retorna null
    if (error.response?.status === 404) {
      console.log('ℹ️ [PushinPay] Pagamento não encontrado (404) - retornando null');
      return null;
    }
    
    // Tratamento de outros erros conforme documentação
    if (error.response?.status === 401) {
      throw new Error('Token de autenticação PushinPay inválido');
    } else if (error.response?.status === 429) {
      throw new Error('Limite de requisições PushinPay excedido - aguarde 1 minuto entre consultas');
    }
    
    throw error;
  }
}

// Função para listar pagamentos
// NOTA: A documentação da PushinPay não fornece endpoint para listar pagamentos
// Esta funcionalidade pode não estar disponível na API atual
async function listPayments(filters = {}) {
  try {
    console.warn('⚠️ Endpoint de listagem não documentado na PushinPay');
    throw new Error('Funcionalidade de listagem de pagamentos não disponível na API PushinPay');
    
    // Código comentado - endpoint não existe na documentação oficial
    /*
    const queryParams = new URLSearchParams(filters).toString();
    const response = await pushinpayGet(`/api/payments?${queryParams}`);
    return response.data;
    */
  } catch (error) {
    console.error('❌ Erro ao listar pagamentos PushinPay:', error.response?.data || error.message);
    throw error;
  }
}

// Função para verificar configuração e ambiente
function getEnvironmentInfo() {
  const cfg = getConfig();
  const token = cfg.pushinpay?.token;
  const environment = cfg.environment || 'production';
  return {
    environment,
    api_base: environment === 'sandbox' ? API_BASE_SANDBOX : API_BASE_PROD,
    token_configured: !!token,
    token_preview: token ? `${token.substring(0, 10)}...` : 'Não configurado'
  };
}

// Função para validar dados de split conforme documentação
function validateSplitRules(splitRules, totalValue) {
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

module.exports = { 
  pushinpayGet, 
  pushinpayPost, 
  createPixPayment, 
  getPaymentStatus, 
  listPayments,
  getEnvironmentInfo,
  validateSplitRules
};