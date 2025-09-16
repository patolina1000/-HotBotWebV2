/**
 * Sistema de Controle de Pagamento - Evitar Múltiplos Pagamentos
 * 
 * Funcionalidades:
 * 1. Salva no localStorage quando usuário clica para copiar PIX ou abrir app do banco
 * 2. Verifica localStorage na tela Privacy e redireciona automaticamente
 * 3. Mostra aviso de pagamento já registrado nas páginas seguintes
 * 4. Compatível com mobile e navegação anônima
 */

class PaymentTracker {
    constructor() {
        this.STORAGE_KEY = 'privacy_payment_initiated';
        this.PAYMENT_TIMESTAMP_KEY = 'privacy_payment_timestamp';
        this.SESSION_ID_KEY = 'privacy_session_id';
        this.PAYMENT_CONFIRMED_KEY = 'privacy_payment_confirmed';
        this.PAYMENT_CONFIRMED_AT_KEY = 'privacy_payment_confirmed_at';
        this.LAST_TRANSACTION_DATA_KEY = 'last_successful_payment';
        
        // Tempo de expiração: 24 horas (em milissegundos)
        this.EXPIRATION_TIME = 24 * 60 * 60 * 1000;
        
        this.init();
    }

    init() {
        // Verificar se estamos em navegação anônima
        if (this.isPrivateMode()) {
            console.log('🔒 [PAYMENT-TRACKER] Navegação anônima detectada - localStorage não disponível');
            return;
        }

        // Gerar session ID único se não existir
        this.ensureSessionId();
        
        // Verificar se há pagamento pendente
        this.checkPendingPayment();
    }

    /**
     * Verifica se está em modo privado/anônimo
     */
    isPrivateMode() {
        try {
            const testKey = '__test_private_mode__';
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
            return false;
        } catch (e) {
            return true;
        }
    }

    /**
     * Gera um session ID único se não existir
     */
    ensureSessionId() {
        if (!localStorage.getItem(this.SESSION_ID_KEY)) {
            const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem(this.SESSION_ID_KEY, sessionId);
        }
    }

    /**
     * Marca que o usuário iniciou o processo de pagamento
     */
    markPaymentInitiated() {
        if (this.isPrivateMode()) {
            console.log('🔒 [PAYMENT-TRACKER] Não é possível salvar em modo anônimo');
            return false;
        }

        try {
            const timestamp = Date.now();
            localStorage.setItem(this.STORAGE_KEY, 'true');
            localStorage.setItem(this.PAYMENT_TIMESTAMP_KEY, timestamp.toString());
            
            console.log('💳 [PAYMENT-TRACKER] Pagamento marcado como iniciado:', new Date(timestamp).toLocaleString());
            return true;
        } catch (error) {
            console.error('❌ [PAYMENT-TRACKER] Erro ao salvar no localStorage:', error);
            return false;
        }
    }

    /**
     * Verifica se há um pagamento pendente
     */
    hasPendingPayment() {
        if (this.isPrivateMode()) {
            return false;
        }

        try {
            const paymentInitiated = localStorage.getItem(this.STORAGE_KEY);
            const timestamp = localStorage.getItem(this.PAYMENT_TIMESTAMP_KEY);
            
            if (!paymentInitiated || !timestamp) {
                return false;
            }

            // Verificar se não expirou
            const paymentTime = parseInt(timestamp);
            const now = Date.now();
            
            if (now - paymentTime > this.EXPIRATION_TIME) {
                // Limpar dados expirados
                this.clearPaymentData();
                return false;
            }

            return true;
        } catch (error) {
            console.error('❌ [PAYMENT-TRACKER] Erro ao verificar pagamento pendente:', error);
            return false;
        }
    }

    /**
     * Limpa os dados de pagamento
     */
    clearPaymentData() {
        try {
            localStorage.removeItem(this.STORAGE_KEY);
            localStorage.removeItem(this.PAYMENT_TIMESTAMP_KEY);
            // Não apagar flags de confirmação aqui
            console.log('🧹 [PAYMENT-TRACKER] Dados de pagamento limpos');
        } catch (error) {
            console.error('❌ [PAYMENT-TRACKER] Erro ao limpar dados:', error);
        }
    }

    /**
     * Marca pagamento como confirmado (integra com sistema de polling do frontend)
     */
    markPaymentConfirmed(transactionId, extraData) {
        if (this.isPrivateMode()) {
            return false;
        }

        try {
            const now = Date.now();
            localStorage.setItem(this.PAYMENT_CONFIRMED_KEY, 'true');
            localStorage.setItem(this.PAYMENT_CONFIRMED_AT_KEY, String(now));

            // Armazenar dados da transação, se fornecidos
            if (extraData && typeof extraData === 'object') {
                try {
                    localStorage.setItem(this.LAST_TRANSACTION_DATA_KEY, JSON.stringify(extraData));
                } catch (_) {}
            } else if (transactionId) {
                try {
                    const current = localStorage.getItem(this.LAST_TRANSACTION_DATA_KEY);
                    const parsed = current ? JSON.parse(current) : {};
                    parsed.transaction_id = transactionId;
                    parsed.payment_date = new Date(now).toISOString();
                    localStorage.setItem(this.LAST_TRANSACTION_DATA_KEY, JSON.stringify(parsed));
                } catch (_) {}
            }

            // Ao confirmar, removemos o estado "iniciado" para evitar redirecionamentos pendentes
            this.clearPaymentData();

            console.log('✅ [PAYMENT-TRACKER] Pagamento confirmado registrado no navegador');
            return true;
        } catch (error) {
            console.error('❌ [PAYMENT-TRACKER] Erro ao marcar pagamento confirmado:', error);
            return false;
        }
    }

    /**
     * Verifica se já foi confirmado
     */
    hasPaymentConfirmed() {
        if (this.isPrivateMode()) {
            return false;
        }
        try {
            return localStorage.getItem(this.PAYMENT_CONFIRMED_KEY) === 'true';
        } catch (_) {
            return false;
        }
    }

    /**
     * Verifica pagamento pendente e redireciona se necessário
     */
    checkPendingPayment() {
        if (this.hasPendingPayment()) {
            console.log('🔄 [PAYMENT-TRACKER] Pagamento pendente detectado - redirecionando...');
            this.redirectToNextStep();
        }
    }

    /**
     * Redireciona para o próximo passo do funil
     */
    redirectToNextStep() {
        // Somente prosseguir se houver pagamento pendente
        if (!this.hasPendingPayment()) {
            return;
        }

        // Evitar múltiplas execuções/loops
        if (this._redirecting) {
            return;
        }

        // Aguardar um pouco para garantir que a página carregou
        setTimeout(() => {
            try {
                const path = window.location.pathname || '';

                // Se já estiver na página de obrigado, não faz nada
                if (path.includes('/checkout/obrigado')) {
                    return;
                }

                // Se pagamento já foi confirmado, seguir fluxo normal do funil (sem loops)
                const isConfirmed = this.hasPaymentConfirmed();

                let target = null;

                // 1) index -> assinatura_premiada
                if (
                    path === '/checkout' ||
                    path === '/checkout/' ||
                    path.includes('/checkout/index') ||
                    path.endsWith('/index.html')
                ) {
                    // Arquivo existente no projeto
                    target = '/checkout/funil_completo/assinatura_premiada.html';
                }
                // 2) assinatura_premiada -> chamada_premiada
                else if (path.includes('assinatura_premiada')) {
                    target = '/checkout/funil_completo/chamada_premiada.html';
                }
                // 3) chamada_premiada -> obrigado
                else if (path.includes('chamada_premiada')) {
                    target = '/checkout/obrigado.html';
                }

                // Se encontrou destino e é diferente da página atual, redireciona
                if (target && !path.endsWith(target)) {
                    const url = window.location.origin + target;
                    this._redirecting = true;
                    console.log('🚀 [PAYMENT-TRACKER] Redirecionando para:', url);
                    window.location.href = url;
                }
            } catch (e) {
                console.error('❌ [PAYMENT-TRACKER] Erro no redirecionamento:', e);
            }
        }, 1000);
    }

    /**
     * Mostra aviso de pagamento já registrado
     */
    showPaymentWarning() {
        if (!this.hasPendingPayment()) {
            return;
        }

        // Criar elemento de aviso
        const warningDiv = document.createElement('div');
        warningDiv.id = 'payment-warning';
        warningDiv.innerHTML = `
            <div style="
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: linear-gradient(135deg, #ff6b6b, #ff8e8e);
                color: white;
                padding: 15px 25px;
                border-radius: 10px;
                box-shadow: 0 4px 20px rgba(255, 107, 107, 0.3);
                z-index: 10000;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-weight: 600;
                text-align: center;
                max-width: 90%;
                animation: slideDown 0.5s ease-out;
            ">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 20px;">⚠️</span>
                    <span>Seu pagamento já foi registrado. Não realize novamente.</span>
                </div>
            </div>
            <style>
                @keyframes slideDown {
                    from {
                        opacity: 0;
                        transform: translateX(-50%) translateY(-20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(-50%) translateY(0);
                    }
                }
            </style>
        `;

        document.body.appendChild(warningDiv);

        // Remover aviso após 5 segundos
        setTimeout(() => {
            if (warningDiv && warningDiv.parentNode) {
                warningDiv.remove();
            }
        }, 5000);
    }

    /**
     * Adiciona instruções na tela PIX
     */
    addPixInstructions() {
        // Aguardar o modal PIX aparecer
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    const pixModal = document.querySelector('.pix-modal');
                    if (pixModal && !document.getElementById('pix-instructions')) {
                        this.insertPixInstructions(pixModal);
                    }
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    /**
     * Insere instruções no modal PIX
     */
    insertPixInstructions(pixModal) {
        const instructionsDiv = document.createElement('div');
        instructionsDiv.id = 'pix-instructions';
        instructionsDiv.innerHTML = `
            <div style="
                background: linear-gradient(135deg, #e3f2fd, #f3e5f5);
                border: 2px solid #2196f3;
                border-radius: 12px;
                padding: 15px;
                margin: 15px 50px;
                text-align: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            ">
                <div style="
                    color: #1976d2;
                    font-weight: 600;
                    font-size: 14px;
                    margin-bottom: 8px;
                ">
                    📱 Instrução Importante
                </div>
                <div style="
                    color: #424242;
                    font-size: 13px;
                    line-height: 1.4;
                ">
                    Depois de pagar, volte aqui pelo <strong>mesmo navegador</strong> para continuar automaticamente.
                </div>
            </div>
        `;

        // Inserir antes do botão de copiar PIX
        const copyButton = pixModal.querySelector('#copiar-pix');
        if (copyButton && copyButton.parentNode) {
            copyButton.parentNode.insertBefore(instructionsDiv, copyButton);
        }
    }
}

// Inicializar o sistema
const paymentTracker = new PaymentTracker();

// Função global para marcar pagamento iniciado (chamada pelos botões)
window.markPaymentInitiated = function() {
    return paymentTracker.markPaymentInitiated();
};

// Função global para verificar pagamento pendente
window.hasPendingPayment = function() {
    return paymentTracker.hasPendingPayment();
};

// Função global para mostrar aviso
window.showPaymentWarning = function() {
    return paymentTracker.showPaymentWarning();
};

// Função global para adicionar instruções PIX
window.addPixInstructions = function() {
    return paymentTracker.addPixInstructions();
};

// Exportar para uso em outros scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PaymentTracker;
}
