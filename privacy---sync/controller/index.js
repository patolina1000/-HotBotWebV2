/**
 * ========================================
 * CONTROLLER INDEX - PONTO DE ENTRADA
 * ========================================
 * 
 * Este arquivo facilita a importação dos componentes do controller
 */

const PaymentController = require('./PaymentController');
const config = require('./config');

// Criar instância única do controller (singleton)
let controllerInstance = null;

/**
 * Retorna uma instância do PaymentController (singleton)
 */
function getPaymentController() {
    if (!controllerInstance) {
        controllerInstance = new PaymentController();
    }
    return controllerInstance;
}

/**
 * Força a criação de uma nova instância do controller
 * (útil quando a configuração muda)
 */
function resetPaymentController() {
    controllerInstance = null;
    return getPaymentController();
}

module.exports = {
    // Classes
    PaymentController,
    
    // Instância singleton
    getPaymentController,
    resetPaymentController,
    
    // Configurações
    config,
    
    // Atalhos para funções de configuração
    getActiveGatewayConfig: config.getActiveGatewayConfig,
    getWebhookUrl: config.getWebhookUrl,
    printConfigSummary: config.printConfigSummary,
    validateConfig: config.validateConfig
};