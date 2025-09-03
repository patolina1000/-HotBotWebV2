/**
 * ========================================
 * EXEMPLO DE CONFIGURAÇÃO - CONTROLLER
 * ========================================
 * 
 * Este é um arquivo de exemplo mostrando como configurar o controller.
 * 
 * INSTRUÇÕES:
 * 1. Copie este arquivo para 'config.js'
 * 2. Altere as configurações conforme suas necessidades
 * 3. Salve e reinicie o servidor
 * 
 * COMANDO: cp config.example.js config.js
 */

// ============================
// CONFIGURAÇÃO PRINCIPAL
// ============================

/**
 * Escolha qual gateway de pagamento usar:
 * 'syncpay' - Para usar SyncPay
 * 'pushinpay' - Para usar PushinPay
 */
const ACTIVE_GATEWAY = 'syncpay'; // ← ALTERE AQUI

/**
 * Ambiente de execução:
 * 'production' - Ambiente de produção (URLs reais)
 * 'sandbox' - Ambiente de teste/desenvolvimento
 */
const ENVIRONMENT = 'production'; // ← ALTERE PARA 'sandbox' SE NECESSÁRIO

// ============================
// CONFIGURAÇÕES SYNCPAY
// ============================
const SYNCPAY_CONFIG = {
    // ⚠️  IMPORTANTE: Substitua pelas suas credenciais reais
    CLIENT_ID: 'SEU_CLIENT_ID_SYNCPAY_AQUI',
    CLIENT_SECRET: 'SEU_CLIENT_SECRET_SYNCPAY_AQUI',
    
    // URLs da API (não alterar)
    API_BASE_URL: 'https://api.syncpayments.com.br/api/partner/v1',
    AUTH_URL: 'https://api.syncpayments.com.br/api/partner/v1/auth-token',
    
    // Configurações técnicas
    TIMEOUT: 30000, // 30 segundos
    RETRY_ATTEMPTS: 3
};

// ============================
// CONFIGURAÇÕES PUSHINPAY
// ============================
const PUSHINPAY_CONFIG = {
    // ⚠️  IMPORTANTE: Substitua pelo seu token real
    TOKEN: 'SEU_TOKEN_PUSHINPAY_AQUI',
    
    // URLs da API (não alterar)
    API_BASE_URL_PROD: 'https://api.pushinpay.com.br',
    API_BASE_URL_SANDBOX: 'https://api-sandbox.pushinpay.com.br',
    
    // Configurações técnicas
    TIMEOUT: 30000, // 30 segundos
    RETRY_ATTEMPTS: 3,
    MIN_VALUE_CENTS: 50 // Valor mínimo em centavos (R$ 0,50)
};

// ============================
// CONFIGURAÇÕES WEBHOOK
// ============================
const WEBHOOK_CONFIG = {
    // ⚠️  IMPORTANTE: Substitua pela URL do seu domínio
    BASE_URL: 'https://SEU-DOMINIO.com',
    
    // Endpoints de webhook (não alterar)
    ENDPOINTS: {
        syncpay: '/webhook/syncpay',
        pushinpay: '/webhook/pushinpay'
    },
    
    // Configurações de segurança
    VALIDATE_SIGNATURE: true,
    SECRET_KEY: 'SUA_CHAVE_SECRETA_WEBHOOK_AQUI'
};

// ============================
// CONFIGURAÇÕES GERAIS
// ============================
const GENERAL_CONFIG = {
    // Configurações de log
    ENABLE_DETAILED_LOGS: true, // false para produção
    LOG_LEVEL: 'info', // 'debug', 'info', 'warn', 'error'
    
    // Configurações de cache
    CACHE_TOKEN_DURATION: 3600, // 1 hora em segundos
    
    // Configurações de retry
    DEFAULT_RETRY_DELAY: 1000, // 1 segundo
    MAX_RETRY_DELAY: 10000 // 10 segundos
};

// ============================
// EXEMPLOS DE CONFIGURAÇÃO
// ============================

/**
 * EXEMPLO 1: CONFIGURAÇÃO PARA SYNCPAY
 * 
 * const ACTIVE_GATEWAY = 'syncpay';
 * const SYNCPAY_CONFIG = {
 *     CLIENT_ID: '708ddc0b-357d-4548-b158-615684caa616',
 *     CLIENT_SECRET: 'c08d40e5-3049-48c9-85c0-fd3cc6ca502c',
 *     // ... outras configurações
 * };
 */

/**
 * EXEMPLO 2: CONFIGURAÇÃO PARA PUSHINPAY
 * 
 * const ACTIVE_GATEWAY = 'pushinpay';
 * const PUSHINPAY_CONFIG = {
 *     TOKEN: '36250|MPvURHE0gE6lqsPN0PtwDOUVISoLjSyvqYUvuDPi47f09b29',
 *     // ... outras configurações
 * };
 */

/**
 * EXEMPLO 3: CONFIGURAÇÃO PARA AMBIENTE DE TESTE
 * 
 * const ENVIRONMENT = 'sandbox';
 * const GENERAL_CONFIG = {
 *     ENABLE_DETAILED_LOGS: true,
 *     LOG_LEVEL: 'debug',
 *     // ... outras configurações
 * };
 */

// ============================
// VALIDAÇÃO DE CONFIGURAÇÃO
// ============================
function validateConfig() {
    const errors = [];
    
    // Validar gateway ativo
    if (!['syncpay', 'pushinpay'].includes(ACTIVE_GATEWAY)) {
        errors.push('❌ ACTIVE_GATEWAY deve ser "syncpay" ou "pushinpay"');
    }
    
    // Validar configurações específicas do gateway
    if (ACTIVE_GATEWAY === 'syncpay') {
        if (!SYNCPAY_CONFIG.CLIENT_ID || SYNCPAY_CONFIG.CLIENT_ID.includes('SEU_')) {
            errors.push('❌ SyncPay: Configure CLIENT_ID com sua credencial real');
        }
        if (!SYNCPAY_CONFIG.CLIENT_SECRET || SYNCPAY_CONFIG.CLIENT_SECRET.includes('SEU_')) {
            errors.push('❌ SyncPay: Configure CLIENT_SECRET com sua credencial real');
        }
    }
    
    if (ACTIVE_GATEWAY === 'pushinpay') {
        if (!PUSHINPAY_CONFIG.TOKEN || PUSHINPAY_CONFIG.TOKEN.includes('SEU_')) {
            errors.push('❌ PushinPay: Configure TOKEN com sua credencial real');
        }
    }
    
    // Validar webhook
    if (WEBHOOK_CONFIG.BASE_URL.includes('SEU-DOMINIO')) {
        errors.push('⚠️  Webhook: Configure BASE_URL com seu domínio real (opcional)');
    }
    
    // Validar ambiente
    if (!['production', 'sandbox'].includes(ENVIRONMENT)) {
        errors.push('❌ ENVIRONMENT deve ser "production" ou "sandbox"');
    }
    
    if (errors.length > 0) {
        console.error('\n🚨 ERRO DE CONFIGURAÇÃO:');
        errors.forEach(error => console.error(error));
        console.error('\n📝 Edite o arquivo config.js e corrija os erros acima.\n');
        throw new Error(`Configuração inválida: ${errors.length} erro(s) encontrado(s)`);
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
 * Imprime um resumo da configuração atual
 */
function printConfigSummary() {
    console.log('\n============================');
    console.log('📋 RESUMO DA CONFIGURAÇÃO');
    console.log('============================');
    console.log(`🏦 Gateway Ativo: ${ACTIVE_GATEWAY.toUpperCase()}`);
    console.log(`🌍 Ambiente: ${ENVIRONMENT.toUpperCase()}`);
    console.log(`📡 Webhook URL: ${getWebhookUrl()}`);
    console.log(`📝 Logs Detalhados: ${GENERAL_CONFIG.ENABLE_DETAILED_LOGS ? 'SIM' : 'NÃO'}`);
    
    if (ACTIVE_GATEWAY === 'syncpay') {
        const clientId = SYNCPAY_CONFIG.CLIENT_ID;
        console.log(`🔑 SyncPay Client ID: ${clientId.includes('SEU_') ? '❌ NÃO CONFIGURADO' : clientId.substring(0, 8) + '...'}`);
    } else {
        const token = PUSHINPAY_CONFIG.TOKEN;
        console.log(`🔑 PushinPay Token: ${token.includes('SEU_') ? '❌ NÃO CONFIGURADO' : token.substring(0, 10) + '...'}`);
    }
    
    console.log('============================\n');
}

// ============================
// CHECKLIST DE CONFIGURAÇÃO
// ============================
function showConfigChecklist() {
    console.log('\n✅ CHECKLIST DE CONFIGURAÇÃO');
    console.log('============================');
    console.log('□ 1. Escolheu o gateway (ACTIVE_GATEWAY)');
    console.log('□ 2. Configurou as credenciais da API');
    console.log('□ 3. Definiu o ambiente (production/sandbox)');
    console.log('□ 4. Configurou a URL do webhook (opcional)');
    console.log('□ 5. Ajustou as configurações de log');
    console.log('□ 6. Salvou o arquivo como config.js');
    console.log('□ 7. Reiniciou o servidor');
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
    
    // Funções utilitárias
    validateConfig,
    getActiveGatewayConfig,
    getWebhookUrl,
    printConfigSummary,
    showConfigChecklist
};

// ============================
// EXECUÇÃO DIRETA
// ============================
if (require.main === module) {
    console.log('🎮 CONTROLLER DE PAGAMENTOS - CONFIGURAÇÃO');
    console.log('==========================================');
    
    showConfigChecklist();
    
    try {
        printConfigSummary();
        console.log('✅ Configuração válida!');
    } catch (error) {
        console.error('❌ Configuração inválida:', error.message);
    }
}