/**
 * ========================================
 * CONFIGURAÇÃO DE PAGAMENTOS - CONTROLLER
 * ========================================
 * 
 * Este arquivo permite configurar facilmente qual API de pagamento usar
 * e definir as chaves de acesso necessárias.
 * 
 * INSTRUÇÕES PARA CONFIGURAÇÃO:
 * 1. Escolha qual API usar alterando ACTIVE_GATEWAY
 * 2. Configure as chaves da API escolhida na seção correspondente
 * 3. Salve o arquivo e reinicie o servidor
 * 
 * IMPORTANTE: Mantenha suas chaves seguras e nunca as compartilhe!
 */

// ============================
// CONFIGURAÇÃO PRINCIPAL
// ============================

const { getConfig } = require('../loadConfig');
const dynamic = getConfig();

/**
 * Gateway ativo e ambiente definidos em app-config.json
 */
const ACTIVE_GATEWAY = dynamic.gateway || 'syncpay';
const ENVIRONMENT = dynamic.environment || 'production';

// ============================
// CONFIGURAÇÕES SYNCPAY
// ============================
const SYNCPAY_CONFIG = {
    CLIENT_ID: dynamic.syncpay?.clientId || '',
    CLIENT_SECRET: dynamic.syncpay?.clientSecret || '',
    API_BASE_URL: 'https://api.syncpayments.com.br/api/partner/v1',
    AUTH_URL: 'https://api.syncpayments.com.br/api/partner/v1/auth-token',
    TIMEOUT: 30000,
    RETRY_ATTEMPTS: 3
};

// ============================
// CONFIGURAÇÕES PUSHINPAY
// ============================
const PUSHINPAY_CONFIG = {
    TOKEN: dynamic.pushinpay?.token || '',
    API_BASE_URL_PROD: 'https://api.pushinpay.com.br',
    API_BASE_URL_SANDBOX: 'https://api-sandbox.pushinpay.com.br',
    TIMEOUT: 30000,
    RETRY_ATTEMPTS: 3,
    MIN_VALUE_CENTS: 50
};

// Informações de modelo e planos
const MODEL_INFO = dynamic.model || { name: '', handle: '', bio: '' };
const PLANS = dynamic.plans || {};

// ============================
// CONFIGURAÇÕES WEBHOOK
// ============================
const WEBHOOK_CONFIG = {
    // URL base para receber webhooks (configure conforme seu domínio)
    BASE_URL: dynamic.webhook?.baseUrl || 'https://seu-dominio.com',

    // Endpoints de webhook
    ENDPOINTS: {
        syncpay: '/webhook/syncpay',
        pushinpay: '/webhook/pushinpay'
    },

    // Configurações de segurança
    VALIDATE_SIGNATURE: true,
    SECRET_KEY: dynamic.webhook?.secret || 'sua-chave-secreta-aqui'
};

// ============================
// CONFIGURAÇÕES GERAIS
// ============================
const GENERAL_CONFIG = {
    // Configurações de log
    ENABLE_DETAILED_LOGS: true,
    LOG_LEVEL: 'info', // 'debug', 'info', 'warn', 'error'
    
    // Configurações de cache
    CACHE_TOKEN_DURATION: 3600, // 1 hora em segundos
    
    // Configurações de retry
    DEFAULT_RETRY_DELAY: 1000, // 1 segundo
    MAX_RETRY_DELAY: 10000 // 10 segundos
};

// ============================
// VALIDAÇÃO DE CONFIGURAÇÃO
// ============================
function validateConfig() {
    const errors = [];
    
    // Validar gateway ativo
    if (!['syncpay', 'pushinpay'].includes(ACTIVE_GATEWAY)) {
        errors.push('ACTIVE_GATEWAY deve ser "syncpay" ou "pushinpay"');
    }
    
    // Validar configurações específicas do gateway
    if (ACTIVE_GATEWAY === 'syncpay') {
        if (!SYNCPAY_CONFIG.CLIENT_ID || !SYNCPAY_CONFIG.CLIENT_SECRET) {
            errors.push('SyncPay: CLIENT_ID e CLIENT_SECRET são obrigatórios');
        }
    }
    
    if (ACTIVE_GATEWAY === 'pushinpay') {
        if (!PUSHINPAY_CONFIG.TOKEN) {
            errors.push('PushinPay: TOKEN é obrigatório');
        }
    }
    
    // Validar ambiente
    if (!['production', 'sandbox'].includes(ENVIRONMENT)) {
        errors.push('ENVIRONMENT deve ser "production" ou "sandbox"');
    }
    
    if (errors.length > 0) {
        throw new Error(`Erro de configuração:\n${errors.join('\n')}`);
    }
    
    return true;
}

// ============================
// FUNÇÕES AUXILIARES
// ============================

/**
 * Retorna a configuração do gateway ativo
 */
function getActiveGatewayConfig() {
    validateConfig();
    
    const config = {
        gateway: ACTIVE_GATEWAY,
        environment: ENVIRONMENT,
        config: ACTIVE_GATEWAY === 'syncpay' ? SYNCPAY_CONFIG : PUSHINPAY_CONFIG
    };
    
    // Adicionar URL base baseada no ambiente para PushinPay
    if (ACTIVE_GATEWAY === 'pushinpay') {
        config.config.API_BASE_URL = ENVIRONMENT === 'sandbox' 
            ? PUSHINPAY_CONFIG.API_BASE_URL_SANDBOX 
            : PUSHINPAY_CONFIG.API_BASE_URL_PROD;
    }
    
    return config;
}

/**
 * Retorna a URL completa do webhook para o gateway ativo
 */
function getWebhookUrl() {
    const endpoint = WEBHOOK_CONFIG.ENDPOINTS[ACTIVE_GATEWAY];
    return `${WEBHOOK_CONFIG.BASE_URL}${endpoint}`;
}

/**
 * Imprime um resumo da configuração atual (sem expor chaves sensíveis)
 */
function printConfigSummary() {
    console.log('\n============================');
    console.log('RESUMO DA CONFIGURAÇÃO');
    console.log('============================');
    console.log(`Gateway Ativo: ${ACTIVE_GATEWAY.toUpperCase()}`);
    console.log(`Ambiente: ${ENVIRONMENT.toUpperCase()}`);
    console.log(`Webhook URL: ${getWebhookUrl()}`);
    console.log(`Logs Detalhados: ${GENERAL_CONFIG.ENABLE_DETAILED_LOGS ? 'SIM' : 'NÃO'}`);
    
    if (ACTIVE_GATEWAY === 'syncpay') {
        console.log(`SyncPay Client ID: ${SYNCPAY_CONFIG.CLIENT_ID.substring(0, 8)}...`);
    } else {
        console.log(`PushinPay Token: ${PUSHINPAY_CONFIG.TOKEN.substring(0, 10)}...`);
    }
    
    console.log('============================\n');
}

// ============================
// EXPORTS
// ============================
module.exports = {
    // Configuração principal
    ACTIVE_GATEWAY,
    ENVIRONMENT,
    
    // Configurações específicas
    SYNCPAY_CONFIG,
    PUSHINPAY_CONFIG,
    WEBHOOK_CONFIG,
    GENERAL_CONFIG,
    MODEL_INFO,
    PLANS,
    
    // Funções utilitárias
    validateConfig,
    getActiveGatewayConfig,
    getWebhookUrl,
    printConfigSummary
};