/**
 * Universal Payment Integration - Integração universal que funciona com qualquer gateway
 * Detecta automaticamente o gateway selecionado e usa a API correspondente
 */

(function() {
    'use strict';

    /**
     * Classe para integração universal de pagamentos
     */
    class UniversalPaymentIntegration {
        constructor() {
            this.currentGateway = 'pushinpay'; // 🔥 SEMPRE usar PushinPay como padrão
            this.init();
        }

        async init() {
            await this.loadCurrentGateway();
        }

        async loadCurrentGateway() {
            // 🔥 FORÇAR SEMPRE PUSHINPAY - Ignorar resposta da API
            this.currentGateway = 'pushinpay';
            console.log('🎯 CONFIGURAÇÃO FORÇADA: Frontend sempre usando PushinPay');
            
            // Comentando a lógica de carregamento automático
            /*
            try {
                const response = await fetch('/api/gateways/current');
                const data = await response.json();
                if (data.success) {
                    this.currentGateway = data.gateway;
                    console.log(`🎯 Gateway atual carregado: ${this.currentGateway}`);
                }
            } catch (error) {
                console.error('Erro ao carregar gateway atual:', error);
                this.currentGateway = 'pushinpay';
                console.log('⚠️ Erro ao carregar gateway, usando PushinPay como fallback');
            }
            */
        }

        getCurrentGateway() {
            return this.currentGateway;
        }

        async createPixTransaction(amount, description, clientData = null) {
            try {
                console.log(`💰 Criando transação PIX via ${this.currentGateway.toUpperCase()}...`);
                
                // 🔥 NOVO: Tracking Kwai Event API - EVENT_ADD_TO_CART
                if (window.KwaiTracker && window.KwaiTracker.hasValidClickId()) {
                    try {
                        console.log('🎯 [KWAI] Enviando EVENT_ADD_TO_CART para criação de PIX');
                        await window.KwaiTracker.sendAddToCart(amount, {
                            content_name: `Privacy - ${description}`,
                            content_id: `pix_creation_${Date.now()}`,
                            content_category: 'Privacy - PIX Creation'
                        });
                    } catch (error) {
                        console.warn('⚠️ [KWAI] Erro ao enviar evento ADD_TO_CART:', error.message);
                    }
                } else {
                    console.log('ℹ️ [KWAI] Click ID não disponível para tracking');
                }
                
                // Dados padrão do cliente se não fornecidos
                const defaultClientData = {
                    name: 'Cliente',
                    cpf: '12345678901',
                    email: 'cliente@exemplo.com',
                    phone: '11999999999'
                };

                const finalClientData = { ...defaultClientData, ...clientData };

                // Validar amount antes de enviar
                const numericAmount = parseFloat(amount);
                if (isNaN(numericAmount) || numericAmount <= 0) {
                    throw new Error(`Valor inválido: ${amount}. Deve ser um número maior que zero.`);
                }

                // Preparar dados para o endpoint unificado
                const paymentData = {
                    amount: numericAmount,
                    description: description,
                    customer_name: finalClientData.name,
                    customer_email: finalClientData.email,
                    customer_document: finalClientData.cpf,
                    customer_phone: finalClientData.phone
                };

                console.log('📤 Enviando dados do pagamento:', paymentData);
                console.log('💵 Amount validado:', numericAmount, 'tipo:', typeof numericAmount);

                // Usar o endpoint unificado que já detecta o gateway
                const response = await fetch('/api/payments/pix/create', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(paymentData)
                }).catch(err => {
                    console.error('❌ [UNIVERSAL-PAYMENT] Falha na requisição PIX:', err);
                    throw err;
                });

                console.log('📥 Resposta recebida:', response.status, response.statusText);

                if (!response.ok) {
                    let errorPayload;
                    try {
                        errorPayload = await response.json();
                    } catch (parseError) {
                        errorPayload = await response.text();
                    }
                    console.error('❌ [UNIVERSAL-PAYMENT] Erro HTTP:', response.status, errorPayload);
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                let data;
                try {
                    data = await response.json();
                } catch (parseError) {
                    const rawText = await response.text();
                    console.error('❌ [UNIVERSAL-PAYMENT] Erro ao parsear resposta PIX:', parseError, rawText);
                    throw parseError;
                }

                console.log(`✅ Transação PIX criada via ${data.gateway?.toUpperCase() || this.currentGateway.toUpperCase()}:`, data);

                if (!data?.data || (!data.data.pix_code && !data.data.qr_code)) {
                    console.warn('⚠️ [UNIVERSAL-PAYMENT] Resposta PIX sem código:', data);
                }

                // Retornar dados padronizados independente do gateway
                return {
                    id: data.data.id || data.data.identifier || data.data.payment_id,
                    pix_code: data.data.pix_code || data.data.qr_code,
                    message: data.message,
                    gateway: data.gateway,
                    amount: amount,
                    description: description
                };

            } catch (error) {
                console.error(`❌ Erro ao criar transação PIX via ${this.currentGateway}:`, error);
                throw error;
            }
        }

        async getPaymentStatus(paymentId) {
            try {
                console.log(`🔍 Consultando status via ${this.currentGateway.toUpperCase()}...`);
                
                const response = await fetch(`/api/payments/${paymentId}/status`);
                const data = await response.json();
                
                if (data.success) {
                    return data.data;
                } else {
                    throw new Error(data.message || 'Erro ao consultar status');
                }
            } catch (error) {
                console.error('Erro ao consultar status:', error);
                throw error;
            }
        }

        showLoading() {
            console.log('🔄 Carregando...');
            
            // Criar loading nativo se SweetAlert não estiver disponível
            if (typeof swal !== 'undefined') {
                try {
                    swal({
                        title: 'Processando pagamento...',
                        icon: 'info',
                        buttons: false,
                        closeOnClickOutside: false,
                        closeOnEsc: false
                    });
                } catch (error) {
                    console.warn('Erro ao mostrar loading SweetAlert:', error);
                    this.showNativeLoading();
                }
            } else {
                this.showNativeLoading();
            }
        }
        
        showNativeLoading() {
            // Remover loading anterior se existir
            const existingLoading = document.getElementById('nativeLoading');
            if (existingLoading) {
                existingLoading.remove();
            }
            
            // Criar loading nativo
            const loading = document.createElement('div');
            loading.id = 'nativeLoading';
            loading.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                color: white;
                font-size: 18px;
                font-weight: 500;
            `;
            loading.innerHTML = `
                <div style="text-align: center;">
                    <div style="margin-bottom: 15px;">
                        <div style="border: 4px solid #f3f3f3; border-top: 4px solid #F58170; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto;"></div>
                    </div>
                    <div>Processando pagamento...</div>
                </div>
                <style>
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
            `;
            document.body.appendChild(loading);
        }

        showPixModal(data) {
            // Usar o modal de pagamento personalizado
            console.log(`💳 PIX gerado via ${data.gateway?.toUpperCase() || this.currentGateway.toUpperCase()}:`, data);
            
            try {
                if (window.showPaymentModal && typeof window.showPaymentModal === 'function') {
                    // 🔥 CORREÇÃO: Passar TODOS os dados, incluindo qr_code_image
                    console.log('🔍 [UNIVERSAL-PAYMENT] Dados completos recebidos:', data);
                    window.showPaymentModal({
                        // Dados transformados para compatibilidade
                        pix_qr_code: data.pix_code,
                        pix_copy_paste: data.pix_code,
                        amount: data.amount || 0,
                        identifier: data.id,
                        status: 'pending',
                        gateway: data.gateway || this.currentGateway,

                        // 🔥 NOVO: Passar dados originais completos
                        data: data,

                        // 🔥 NOVO: Campos diretos para QR Code
                        qr_code_image: data.qr_code_image,
                        qr_code_base64: data.qr_code_base64,
                        pix_code: data.pix_code,
                        id: data.id
                    });
                } else {
                    // Fallback para alert simples
                    alert(`PIX gerado com sucesso via ${(data.gateway || this.currentGateway).toUpperCase()}! Código: ${data.pix_code ? data.pix_code.substring(0, 50) + '...' : 'Não disponível'}`);
                }
            } catch (error) {
                console.error('Erro ao mostrar modal PIX:', error);
                // Fallback final
                alert(`PIX gerado via ${(data.gateway || this.currentGateway).toUpperCase()}! Código: ${data.pix_code ? data.pix_code.substring(0, 50) + '...' : 'Não disponível'}`);
            }
        }

        // Método para atualizar o gateway atual - SEMPRE forçar PushinPay
        updateCurrentGateway(gateway) {
            this.currentGateway = 'pushinpay'; // 🔥 Ignorar parâmetro, sempre usar PushinPay
            console.log(`🔄 FORÇADO: Tentativa de alterar para ${gateway}, mas mantendo PushinPay`);
        }
    }

    // Instanciar a integração universal
    const universalPayment = new UniversalPaymentIntegration();

    // Expor para uso global - substituindo o window.syncPay existente
    window.universalPayment = universalPayment;

    // Manter compatibilidade com código existente criando um bridge
    window.syncPay = {
        showLoading: () => universalPayment.showLoading(),
        createPixTransaction: (amount, description, clientData) => universalPayment.createPixTransaction(amount, description, clientData),
        showPixModal: (data) => universalPayment.showPixModal(data)
    };

    // 🔥 LISTENERS DESABILITADOS - PushinPay sempre forçada
    document.addEventListener('DOMContentLoaded', () => {
        console.log('🚫 Listeners de mudança de gateway DESABILITADOS');
        console.log('🎯 PushinPay será sempre usado independente da seleção do usuário');
        
        // Comentando todos os listeners para evitar mudanças de gateway
        /*
        setTimeout(() => {
            const gatewaySelect = document.getElementById('gateway-select');
            if (gatewaySelect) {
                gatewaySelect.addEventListener('change', (e) => {
                    universalPayment.updateCurrentGateway(e.target.value);
                    console.log(`🎯 Gateway selecionado: ${e.target.value}`);
                });
            }

            window.addEventListener('gateway-changed', (event) => {
                universalPayment.updateCurrentGateway(event.detail.gateway);
                console.log(`🎯 Gateway alterado via evento: ${event.detail.gateway}`);
            });

            if (window.gatewaySelector && typeof window.gatewaySelector.getCurrentGateway === 'function') {
                const currentGateway = window.gatewaySelector.getCurrentGateway();
                universalPayment.updateCurrentGateway(currentGateway);
                console.log(`🔄 Sincronizado com gateway atual: ${currentGateway}`);
            }
        }, 200);
        */
    });

    console.log('🔧 Universal Payment Integration carregado!');
    console.log('🎯 CONFIGURAÇÃO FORÇADA: PushinPay sempre como padrão');
    console.log('📚 Funcionalidades:');
    console.log('  - ✅ PushinPay sempre usado (configuração forçada)');
    console.log('  - ✅ Bridge para código existente (window.syncPay)');
    console.log('  - 🚫 Detecção automática DESABILITADA');
    console.log('  - 🚫 Mudança de gateway DESABILITADA');

})();