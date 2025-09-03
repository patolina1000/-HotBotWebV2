/**
 * ========================================
 * PAYMENT CONTROLLER - CONTROLADOR DE PAGAMENTOS
 * ========================================
 * 
 * Este controlador gerencia automaticamente qual API de pagamento usar
 * baseado na configuração definida em config.js
 * 
 * Funcionalidades:
 * - Troca automática entre SyncPay e PushinPay
 * - Autenticação automática
 * - Tratamento de erros padronizado
 * - Cache de tokens
 * - Logs detalhados
 */

const axios = require('axios');
const { 
    ACTIVE_GATEWAY, 
    ENVIRONMENT,
    getActiveGatewayConfig,
    getWebhookUrl,
    printConfigSummary,
    GENERAL_CONFIG 
} = require('./config');

class PaymentController {
    constructor() {
        this.gatewayConfig = getActiveGatewayConfig();
        this.tokenCache = { access_token: null, expires_at: null };
        
        // Imprimir resumo da configuração na inicialização
        if (GENERAL_CONFIG.ENABLE_DETAILED_LOGS) {
            printConfigSummary();
        }
        
        this.log('🚀 PaymentController inicializado', {
            gateway: this.gatewayConfig.gateway,
            environment: this.gatewayConfig.environment
        });
    }

    /**
     * Sistema de logs com níveis
     */
    log(message, data = null, level = 'info') {
        if (!GENERAL_CONFIG.ENABLE_DETAILED_LOGS && level === 'debug') {
            return;
        }

        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${this.gatewayConfig.gateway.toUpperCase()}]`;
        
        console.log(`${prefix} ${message}`);
        if (data && GENERAL_CONFIG.ENABLE_DETAILED_LOGS) {
            console.log(`${prefix} Dados:`, JSON.stringify(data, null, 2));
        }
    }

    /**
     * ============================
     * AUTENTICAÇÃO
     * ============================
     */

    /**
     * Obtém token de autenticação (SyncPay) ou retorna token fixo (PushinPay)
     */
    async getAuthToken() {
        if (this.gatewayConfig.gateway === 'pushinpay') {
            // PushinPay usa token fixo
            return this.gatewayConfig.config.TOKEN;
        }

        // SyncPay usa autenticação OAuth2
        return await this.getSyncPayToken();
    }

    /**
     * Obtém token do SyncPay com cache
     */
    async getSyncPayToken() {
        const now = Date.now();
        
        // Verificar se há token em cache e se ainda é válido
        if (
            this.tokenCache.access_token &&
            this.tokenCache.expires_at &&
            now < this.tokenCache.expires_at
        ) {
            this.log('🔐 Usando token em cache', null, 'debug');
            return this.tokenCache.access_token;
        }

        try {
            this.log('🔐 Obtendo novo token SyncPay...');
            
            const authData = {
                client_id: this.gatewayConfig.config.CLIENT_ID,
                client_secret: this.gatewayConfig.config.CLIENT_SECRET,
                '01K1259MAXE0TNRXV2C2WQN2MV': 'payment_controller_' + Date.now()
            };

            const response = await axios.post(
                this.gatewayConfig.config.AUTH_URL,
                authData,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    timeout: this.gatewayConfig.config.TIMEOUT
                }
            );

            this.log('✅ Token SyncPay obtido com sucesso');

            this.tokenCache = {
                access_token: response.data.access_token,
                expires_at: new Date(response.data.expires_at).getTime()
            };

            return this.tokenCache.access_token;

        } catch (error) {
            this.log('❌ Erro ao obter token SyncPay', {
                status: error.response?.status,
                message: error.response?.data || error.message
            }, 'error');
            
            throw new Error(`Falha na autenticação SyncPay: ${error.response?.status || error.message}`);
        }
    }

    /**
     * ============================
     * REQUISIÇÕES HTTP
     * ============================
     */

    /**
     * Realiza requisição GET para a API ativa
     */
    async get(endpoint, config = {}) {
        const token = await this.getAuthToken();
        const baseUrl = this.gatewayConfig.config.API_BASE_URL;
        
        const requestConfig = {
            ...config,
            headers: {
                ...(this.gatewayConfig.gateway === 'syncpay' ? 
                    { 'Authorization': `Bearer ${token}` } : 
                    { 
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                ),
                ...(config.headers || {})
            },
            timeout: this.gatewayConfig.config.TIMEOUT
        };

        this.log(`📡 GET ${endpoint}`, { url: `${baseUrl}${endpoint}` }, 'debug');

        try {
            const response = await axios.get(`${baseUrl}${endpoint}`, requestConfig);
            this.log(`✅ GET ${endpoint} - Sucesso`, { status: response.status }, 'debug');
            return response;
        } catch (error) {
            this.log(`❌ GET ${endpoint} - Erro`, {
                status: error.response?.status,
                message: error.response?.data || error.message
            }, 'error');
            throw error;
        }
    }

    /**
     * Realiza requisição POST para a API ativa
     */
    async post(endpoint, data, config = {}) {
        const token = await this.getAuthToken();
        const baseUrl = this.gatewayConfig.config.API_BASE_URL;
        
        const requestConfig = {
            ...config,
            headers: {
                ...(this.gatewayConfig.gateway === 'syncpay' ? 
                    { 'Authorization': `Bearer ${token}` } : 
                    { 
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                ),
                ...(config.headers || {})
            },
            timeout: this.gatewayConfig.config.TIMEOUT
        };

        this.log(`📡 POST ${endpoint}`, { 
            url: `${baseUrl}${endpoint}`,
            data: data 
        }, 'debug');

        try {
            const response = await axios.post(`${baseUrl}${endpoint}`, data, requestConfig);
            this.log(`✅ POST ${endpoint} - Sucesso`, { status: response.status }, 'debug');
            return response;
        } catch (error) {
            this.log(`❌ POST ${endpoint} - Erro`, {
                status: error.response?.status,
                message: error.response?.data || error.message
            }, 'error');
            throw error;
        }
    }

    /**
     * ============================
     * MÉTODOS DE PAGAMENTO
     * ============================
     */

    /**
     * Cria um pagamento PIX
     */
    async createPixPayment(paymentData) {
        this.log('💰 Iniciando criação de pagamento PIX...', paymentData);

        try {
            if (this.gatewayConfig.gateway === 'syncpay') {
                return await this.createSyncPayPixPayment(paymentData);
            } else {
                return await this.createPushinPayPixPayment(paymentData);
            }
        } catch (error) {
            this.log('❌ Erro ao criar pagamento PIX', {
                error: error.message,
                gateway: this.gatewayConfig.gateway
            }, 'error');
            throw error;
        }
    }

    /**
     * Cria pagamento PIX no SyncPay
     */
    async createSyncPayPixPayment(paymentData) {
        // Estrutura de dados específica do SyncPay
        const requestData = {
            amount: paymentData.amount,
            description: paymentData.description || 'Pagamento PIX',
            external_id: paymentData.external_id || `pix_${Date.now()}`,
            webhook_url: getWebhookUrl(),
            customer: paymentData.customer || {}
        };

        const response = await this.post('/pix/payment', requestData);
        
        this.log('✅ Pagamento PIX SyncPay criado', {
            id: response.data.id,
            amount: response.data.amount
        });

        return response.data;
    }

    /**
     * Cria pagamento PIX no PushinPay
     */
    async createPushinPayPixPayment(paymentData) {
        // Validar valor mínimo do PushinPay
        const valueInCents = Math.round(paymentData.amount * 100);
        if (valueInCents < this.gatewayConfig.config.MIN_VALUE_CENTS) {
            throw new Error(`Valor mínimo é de ${this.gatewayConfig.config.MIN_VALUE_CENTS} centavos (R$ ${this.gatewayConfig.config.MIN_VALUE_CENTS / 100})`);
        }

        // Estrutura de dados específica do PushinPay
        const requestData = {
            value: valueInCents,
            description: paymentData.description || 'Pagamento PIX',
            external_reference: paymentData.external_id || `pix_${Date.now()}`,
            webhook_url: getWebhookUrl()
        };

        const response = await this.post('/v1/pix/payment', requestData);
        
        this.log('✅ Pagamento PIX PushinPay criado', {
            id: response.data.id,
            value: response.data.value
        });

        return response.data;
    }

    /**
     * Consulta status de um pagamento
     */
    async getPaymentStatus(paymentId) {
        this.log(`🔍 Consultando status do pagamento: ${paymentId}`);

        try {
            let response;
            
            if (this.gatewayConfig.gateway === 'syncpay') {
                response = await this.get(`/payment/${paymentId}`);
            } else {
                response = await this.get(`/v1/payment/${paymentId}`);
            }

            this.log(`✅ Status consultado: ${response.data.status}`, {
                id: paymentId,
                status: response.data.status
            });

            return response.data;

        } catch (error) {
            this.log(`❌ Erro ao consultar status do pagamento ${paymentId}`, {
                error: error.message
            }, 'error');
            throw error;
        }
    }

    /**
     * ============================
     * MÉTODOS UTILITÁRIOS
     * ============================
     */

    /**
     * Retorna informações sobre o gateway ativo
     */
    getGatewayInfo() {
        return {
            gateway: this.gatewayConfig.gateway,
            environment: this.gatewayConfig.environment,
            webhook_url: getWebhookUrl(),
            api_base_url: this.gatewayConfig.config.API_BASE_URL
        };
    }

    /**
     * Testa conectividade com a API
     */
    async testConnection() {
        this.log('🔍 Testando conectividade...');

        try {
            // Tentar obter token (testa autenticação)
            await this.getAuthToken();
            
            // Fazer uma requisição simples para testar a API
            if (this.gatewayConfig.gateway === 'syncpay') {
                // SyncPay - tentar listar algo simples
                await this.get('/health'); // endpoint hipotético
            } else {
                // PushinPay - tentar endpoint de status
                await this.get('/v1/status'); // endpoint hipotético
            }

            this.log('✅ Conectividade OK');
            return { success: true, message: 'Conectividade OK' };

        } catch (error) {
            this.log('❌ Falha na conectividade', { error: error.message }, 'error');
            return { success: false, message: error.message };
        }
    }

    /**
     * Força renovação do token (útil para debugging)
     */
    async refreshToken() {
        this.log('🔄 Forçando renovação do token...');
        this.tokenCache = { access_token: null, expires_at: null };
        return await this.getAuthToken();
    }
}

module.exports = PaymentController;