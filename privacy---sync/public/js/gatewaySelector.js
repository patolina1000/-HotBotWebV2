// Gateway Selector - Sistema de seleção de gateway de pagamento
class GatewaySelector {
    constructor() {
        this.currentGateway = 'syncpay';
        this.init();
    }

    async init() {
        await this.loadCurrentGateway();
        this.setupEventListeners();
        this.updateUI();
    }

    async loadCurrentGateway() {
        try {
            const response = await fetch('/api/gateways/current');
            const data = await response.json();
            if (data.success) {
                this.currentGateway = data.gateway;
            }
        } catch (error) {
            console.error('Erro ao carregar gateway atual:', error);
        }
    }

    setupEventListeners() {
        // Adicionar listener para mudança de gateway
        const gatewaySelect = document.getElementById('gateway-select');
        if (gatewaySelect) {
            gatewaySelect.addEventListener('change', (e) => {
                this.switchGateway(e.target.value);
            });
        }

        // Adicionar listener para botão de teste
        const testButton = document.getElementById('test-gateway');
        if (testButton) {
            testButton.addEventListener('click', () => {
                this.testCurrentGateway();
            });
        }

        // Adicionar listener para botão de teste de configuração
        const testConfigButton = document.getElementById('test-config');
        if (testConfigButton) {
            testConfigButton.addEventListener('click', () => {
                this.testGatewayConfiguration();
            });
        }
    }

    async switchGateway(gateway) {
        try {
            const response = await fetch('/api/gateways/switch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ gateway })
            });

            const data = await response.json();
            
            if (data.success) {
                this.currentGateway = data.current;
                this.updateUI();
                this.showNotification(`Gateway alterado para ${gateway}`, 'success');
                
                // Disparar evento customizado para notificar outras partes do sistema
                window.dispatchEvent(new CustomEvent('gateway-changed', {
                    detail: { 
                        gateway: this.currentGateway,
                        previous: gateway 
                    }
                }));
                
                // Também atualizar a integração universal se disponível
                if (window.universalPayment && typeof window.universalPayment.updateCurrentGateway === 'function') {
                    window.universalPayment.updateCurrentGateway(this.currentGateway);
                }
            } else {
                this.showNotification('Erro ao alterar gateway', 'error');
            }
        } catch (error) {
            console.error('Erro ao alterar gateway:', error);
            this.showNotification('Erro ao alterar gateway', 'error');
        }
    }

    async testCurrentGateway() {
        try {
            const testData = {
                amount: 1.00, // Valor mínimo para teste
                description: `Teste ${this.currentGateway.toUpperCase()} - ${new Date().toISOString()}`,
                customer_name: 'Cliente Teste',
                customer_email: 'teste@exemplo.com',
                customer_document: '12345678901'
            };

            this.showNotification('Iniciando teste de pagamento...', 'info');

            const response = await fetch('/api/payments/pix/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(testData)
            });

            const data = await response.json();
            
            if (data.success) {
                this.showNotification(`✅ Teste realizado com sucesso via ${this.currentGateway.toUpperCase()}!`, 'success');
                console.log('✅ Resultado do teste:', data);
                
                // Mostrar detalhes do pagamento criado
                if (data.data) {
                    console.log('💰 Detalhes do pagamento:', {
                        id: data.data.id || data.data.payment_id,
                        gateway: data.gateway,
                        qr_code: data.data.qr_code || data.data.pix_code,
                        status: data.data.status
                    });
                }
            } else {
                this.showNotification(`❌ Erro no teste ${this.currentGateway.toUpperCase()}: ${data.message || data.error}`, 'error');
                console.error('❌ Erro no teste:', data);
            }
        } catch (error) {
            console.error('❌ Erro no teste:', error);
            this.showNotification(`❌ Erro ao testar ${this.currentGateway.toUpperCase()}: ${error.message}`, 'error');
        }
    }

    async testGatewayConfiguration() {
        try {
            const response = await fetch('/api/gateways/test');
            const data = await response.json();
            
            if (data.success) {
                console.log('🔧 Configuração dos gateways:', data);
                
                // Mostrar informações detalhadas
                let configInfo = `📊 CONFIGURAÇÃO DOS GATEWAYS\n\n`;
                configInfo += `Gateway Atual: ${data.current_gateway.toUpperCase()}\n\n`;
                
                data.gateways.forEach(gateway => {
                    configInfo += `${gateway.name}: ${gateway.status === 'active' ? '✅' : '⚠️'}\n`;
                    configInfo += `  Ambiente: ${gateway.environment}\n`;
                    configInfo += `  Token: ${gateway.token_status}\n\n`;
                });
                
                configInfo += `VARIÁVEIS DE AMBIENTE:\n`;
                Object.entries(data.environment_vars).forEach(([key, value]) => {
                    configInfo += `${key}: ${value}\n`;
                });
                
                console.log(configInfo);
                this.showNotification('Configuração verificada - veja o console para detalhes', 'info');
            } else {
                this.showNotification('Erro ao verificar configuração', 'error');
            }
        } catch (error) {
            console.error('Erro ao testar configuração:', error);
            this.showNotification('Erro ao verificar configuração', 'error');
        }
    }

    updateUI() {
        // Atualizar select
        const gatewaySelect = document.getElementById('gateway-select');
        if (gatewaySelect) {
            gatewaySelect.value = this.currentGateway;
        }

        // Atualizar indicador visual
        const gatewayIndicator = document.getElementById('gateway-indicator');
        if (gatewayIndicator) {
            gatewayIndicator.textContent = this.currentGateway.toUpperCase();
            gatewayIndicator.className = `gateway-indicator ${this.currentGateway}`;
        }

        // Atualizar informações do gateway
        this.updateGatewayInfo();
    }

    async updateGatewayInfo() {
        try {
            const response = await fetch('/api/gateways');
            const data = await response.json();
            
            if (data.success) {
                const currentGatewayInfo = data.gateways.find(g => g.id === this.currentGateway);
                const gatewayInfo = document.getElementById('gateway-info');
                
                if (gatewayInfo && currentGatewayInfo) {
                    const statusIcon = currentGatewayInfo.status === 'active' ? '✅' : 
                                     currentGatewayInfo.status === 'needs_config' ? '⚠️' : '❌';
                    
                    const statusText = currentGatewayInfo.status === 'active' ? 'Ativo' : 
                                     currentGatewayInfo.status === 'needs_config' ? 'Precisa Configuração' : 'Inativo';

                    gatewayInfo.innerHTML = `
                        <div class="gateway-details">
                            <h4>${currentGatewayInfo.name} ${statusIcon}</h4>
                            <p class="gateway-description">${currentGatewayInfo.description}</p>
                            
                            <div class="gateway-status">
                                <strong>Status:</strong> ${statusText}
                                ${currentGatewayInfo.environment ? `<br><strong>Ambiente:</strong> ${currentGatewayInfo.environment}` : ''}
                                ${currentGatewayInfo.token_status ? `<br><strong>Token:</strong> ${currentGatewayInfo.token_status}` : ''}
                            </div>

                            <div class="gateway-features">
                                <strong>Recursos:</strong>
                                <ul>
                                    ${currentGatewayInfo.features.map(feature => `<li>${feature}</li>`).join('')}
                                </ul>
                            </div>

                            ${currentGatewayInfo.docs ? `
                                <div class="gateway-docs">
                                    <strong>Endpoints:</strong>
                                    <ul class="docs-list">
                                        ${Object.entries(currentGatewayInfo.docs).map(([key, value]) => 
                                            `<li><code>${key}:</code> ${value}</li>`
                                        ).join('')}
                                    </ul>
                                </div>
                            ` : ''}
                        </div>
                    `;
                }
            }
        } catch (error) {
            console.error('Erro ao carregar informações do gateway:', error);
        }
    }

    showNotification(message, type = 'info') {
        // Criar notificação usando SweetAlert2 se disponível
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: type === 'success' ? 'Sucesso!' : type === 'error' ? 'Erro!' : 'Informação',
                text: message,
                icon: type,
                timer: 3000,
                showConfirmButton: false
            });
        } else {
            // Fallback para alert simples
            alert(`${type.toUpperCase()}: ${message}`);
        }
    }

    // Método para obter gateway atual
    getCurrentGateway() {
        return this.currentGateway;
    }

    // Método para verificar se é PushinPay
    isPushinPay() {
        return this.currentGateway === 'pushinpay';
    }

    // Método para verificar se é SyncPay
    isSyncPay() {
        return this.currentGateway === 'syncpay';
    }
}

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    window.gatewaySelector = new GatewaySelector();
});

// Exportar para uso global
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GatewaySelector;
}