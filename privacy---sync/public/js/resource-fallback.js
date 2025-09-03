/**
 * RESOURCE FALLBACK SYSTEM
 * Sistema para lidar com recursos que falham ao carregar
 * Implementa fallbacks e alternativas para CSS e JS
 */

class ResourceFallback {
    constructor() {
        this.resourceErrors = new Map();
        this.retryAttempts = new Map();
        this.maxRetries = 3;
        this.init();
    }

    init() {
        console.log('🛡️ Resource Fallback: Sistema de fallback ativado');
        this.setupGlobalErrorHandler();
        this.setupResourceMonitoring();
        this.createFallbackCSS();
    }

    setupGlobalErrorHandler() {
        // Interceptar erros de recursos globalmente
        window.addEventListener('error', (event) => {
            if (event.target && (event.target.tagName === 'LINK' || event.target.tagName === 'SCRIPT')) {
                this.handleResourceError(event.target, event);
            }
        }, true);

        // Interceptar erros não capturados
        window.addEventListener('unhandledrejection', (event) => {
            console.error('❌ Promise rejeitada não tratada:', event.reason);
        });
    }

    setupResourceMonitoring() {
        // Monitorar recursos críticos
        const criticalResources = [
            { type: 'css', path: '/css/privacy.css', name: 'Privacy CSS' },
            { type: 'css', path: '/css/checkout.css', name: 'Checkout CSS' },
            { type: 'css', path: '/css/gateway-selector.css', name: 'Gateway Selector CSS' },
            { type: 'css', path: '/css/payment-modal.css', name: 'Payment Modal CSS' },
            { type: 'js', path: '/js/config.js', name: 'Config JS' },
            { type: 'js', path: '/js/gatewaySelector.js', name: 'Gateway Selector JS' }
        ];

        setTimeout(() => {
            this.checkCriticalResources(criticalResources);
        }, 3000);
    }

    handleResourceError(element, event) {
        const src = element.src || element.href;
        const type = element.tagName.toLowerCase();
        
        console.error(`❌ Erro ao carregar ${type}: ${src}`);
        
        // Incrementar contador de tentativas
        const attempts = this.retryAttempts.get(src) || 0;
        this.retryAttempts.set(src, attempts + 1);
        
        // Registrar erro
        this.resourceErrors.set(src, {
            element,
            error: event,
            attempts,
            timestamp: Date.now()
        });

        // Tentar novamente se não excedeu o limite
        if (attempts < this.maxRetries) {
            setTimeout(() => {
                this.retryResource(element, src);
            }, 1000 * (attempts + 1)); // Backoff exponencial
        } else {
            this.applyFallback(element, src);
        }
    }

    retryResource(element, src) {
        console.log(`🔄 Tentativa ${this.retryAttempts.get(src)} para: ${src}`);
        
        // Adicionar cache bust
        const cacheBust = `?retry=${Date.now()}`;
        const newSrc = src.includes('?') ? `${src}&retry=${Date.now()}` : `${src}${cacheBust}`;
        
        if (element.tagName === 'LINK') {
            element.href = newSrc;
        } else if (element.tagName === 'SCRIPT') {
            element.src = newSrc;
        }
    }

    applyFallback(element, src) {
        console.warn(`⚠️ Aplicando fallback para: ${src}`);
        
        if (element.tagName === 'LINK' && element.rel === 'stylesheet') {
            this.applyCSS_Fallback(src);
        } else if (element.tagName === 'SCRIPT') {
            this.applyJS_Fallback(src);
        }
    }

    applyCSS_Fallback(src) {
        const filename = src.split('/').pop().replace('.css', '');
        
        // CSS básico de fallback baseado no nome do arquivo
        let fallbackCSS = '';
        
        switch (filename) {
            case 'gateway-selector':
                fallbackCSS = this.getGatewaySelectorFallback();
                break;
            case 'checkout':
                fallbackCSS = this.getCheckoutFallback();
                break;
            case 'pix-modal':
                fallbackCSS = this.getPixModalFallback();
                break;
            case 'payment-modal':
                fallbackCSS = this.getPaymentModalFallback();
                break;
            default:
                fallbackCSS = this.getGenericFallback();
        }
        
        if (fallbackCSS) {
            this.injectCSS(fallbackCSS, `fallback-${filename}`);
            console.log(`✅ Fallback CSS aplicado para: ${filename}`);
        }
    }

    applyJS_Fallback(src) {
        const filename = src.split('/').pop().replace('.js', '');
        
        switch (filename) {
            case 'gatewaySelector':
                console.warn('⚠️ Gateway Selector JS falhou, usando fallback simples');
                window.GatewaySelector = class {
                    constructor() { console.log('Fallback Gateway Selector ativo'); }
                };
                break;
            case 'config':
                console.warn('⚠️ Config JS falhou, usando configuração padrão');
                this.loadDefaultConfig();
                break;
        }
    }

    checkCriticalResources(resources) {
        console.log('🔍 Verificando recursos críticos...');
        
        resources.forEach(resource => {
            const exists = this.checkResourceExists(resource);
            if (!exists) {
                console.warn(`⚠️ Recurso crítico não encontrado: ${resource.name}`);
                this.loadResourceFallback(resource);
            }
        });
    }

    checkResourceExists(resource) {
        if (resource.type === 'css') {
            return document.querySelector(`link[href*="${resource.path}"]`) !== null;
        } else if (resource.type === 'js') {
            return document.querySelector(`script[src*="${resource.path}"]`) !== null;
        }
        return false;
    }

    loadResourceFallback(resource) {
        if (resource.type === 'css') {
            this.ensureCSS(resource.path);
        } else if (resource.type === 'js') {
            this.ensureJS(resource.path);
        }
    }

    async ensureCSS(path) {
        try {
            const response = await fetch(`/${path}`, { method: 'HEAD' });
            if (response.ok) {
                this.injectCSSLink(`/${path}`);
            }
        } catch (error) {
            console.error(`❌ Erro ao verificar CSS: ${path}`, error);
        }
    }

    async ensureJS(path) {
        try {
            const response = await fetch(`/${path}`, { method: 'HEAD' });
            if (response.ok) {
                this.injectJSScript(`/${path}`);
            }
        } catch (error) {
            console.error(`❌ Erro ao verificar JS: ${path}`, error);
        }
    }

    injectCSSLink(href) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
        console.log(`✅ CSS injetado: ${href}`);
    }

    injectJSScript(src) {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        document.head.appendChild(script);
        console.log(`✅ JS injetado: ${src}`);
    }

    injectCSS(cssText, id) {
        if (document.getElementById(id)) {
            return; // Já existe
        }
        
        const style = document.createElement('style');
        style.id = id;
        style.textContent = cssText;
        document.head.appendChild(style);
    }

    createFallbackCSS() {
        // CSS de emergência para elementos críticos
        const emergencyCSS = `
            /* Fallback CSS de Emergência */
            .pageloader {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: #fff;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
            }
            
            .btn, button {
                padding: 10px 20px;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                background: #007bff;
                color: white;
                font-size: 14px;
            }
            
            .btn:hover, button:hover {
                background: #0056b3;
            }
            
            .modal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                z-index: 1000;
            }
            
            .modal.show {
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .modal-content {
                background: white;
                padding: 20px;
                border-radius: 10px;
                max-width: 500px;
                width: 90%;
            }
        `;
        
        this.injectCSS(emergencyCSS, 'emergency-fallback-css');
    }

    loadDefaultConfig() {
        // Configuração padrão caso o config.js falhe
        window.APP_CONFIG = window.APP_CONFIG || {
            model: {
                name: 'Privacy Creator',
                handle: '@creator',
                bio: 'Criador de conteúdo exclusivo'
            },
            plans: {
                monthly: {
                    buttonId: 'btn-1-mes',
                    label: '1 mês',
                    priceLabel: 'R$ 19,98',
                    price: 19.98
                }
            }
        };
        
        console.log('✅ Configuração padrão carregada');
    }

    // CSS de fallback específicos
    getGatewaySelectorFallback() {
        return `
            .gateway-selector {
                margin: 20px 0;
                padding: 15px;
                border: 1px solid #ddd;
                border-radius: 8px;
                background: #f9f9f9;
            }
            
            .gateway-selector select {
                width: 100%;
                padding: 10px;
                border: 1px solid #ccc;
                border-radius: 4px;
                background: white;
            }
        `;
    }

    getCheckoutFallback() {
        return `
            .checkout-container {
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
            }
            
            .plan-button {
                display: block;
                width: 100%;
                padding: 15px;
                margin: 10px 0;
                border: 2px solid #007bff;
                border-radius: 8px;
                background: white;
                color: #007bff;
                cursor: pointer;
                transition: all 0.3s;
            }
            
            .plan-button:hover {
                background: #007bff;
                color: white;
            }
        `;
    }

    getPixModalFallback() {
        return `
            .pix-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.8);
                display: none;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            }
            
            .pix-modal.show {
                display: flex;
            }
            
            .pix-modal-content {
                background: white;
                padding: 20px;
                border-radius: 10px;
                max-width: 400px;
                width: 90%;
                text-align: center;
            }
        `;
    }

    getPaymentModalFallback() {
        return `
            .payment-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.8);
                display: none;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            }
            
            .payment-modal.show {
                display: flex;
            }
            
            .payment-modal-content {
                background: white;
                padding: 30px;
                border-radius: 15px;
                max-width: 500px;
                width: 90%;
            }
        `;
    }

    getGenericFallback() {
        return `
            /* CSS genérico de fallback */
            .container { max-width: 1200px; margin: 0 auto; padding: 0 15px; }
            .text-center { text-align: center; }
            .d-none { display: none; }
            .d-block { display: block; }
            .d-flex { display: flex; }
            .justify-content-center { justify-content: center; }
            .align-items-center { align-items: center; }
            .mt-3 { margin-top: 1rem; }
            .mb-3 { margin-bottom: 1rem; }
            .p-3 { padding: 1rem; }
        `;
    }

    // Método para diagnóstico
    diagnose() {
        console.log('🔍 === DIAGNÓSTICO DE RECURSOS ===');
        console.log(`❌ Recursos com erro: ${this.resourceErrors.size}`);
        
        if (this.resourceErrors.size > 0) {
            console.log('❌ Detalhes dos erros:');
            this.resourceErrors.forEach((error, src) => {
                console.log(`  - ${src} (${error.attempts} tentativas)`);
            });
        }
        
        // Verificar recursos críticos
        this.checkCriticalResourcesStatus();
        
        return {
            errors: Array.from(this.resourceErrors.keys()),
            retries: Object.fromEntries(this.retryAttempts)
        };
    }

    checkCriticalResourcesStatus() {
        console.log('🔍 Status dos recursos críticos:');
        
        // Verificar jQuery
        console.log(`  ${typeof $ !== 'undefined' ? '✅' : '❌'} jQuery`);
        
        // Verificar SweetAlert
        console.log(`  ${typeof swal !== 'undefined' ? '✅' : '❌'} SweetAlert`);
        
        // Verificar QRCode
        console.log(`  ${typeof QRCode !== 'undefined' ? '✅' : '❌'} QRCode`);
        
        // Verificar configurações
        console.log(`  ${typeof window.APP_CONFIG !== 'undefined' ? '✅' : '❌'} APP_CONFIG`);
        console.log(`  ${typeof window.SYNCPAY_CONFIG !== 'undefined' ? '✅' : '❌'} SYNCPAY_CONFIG`);
        
        // Verificar classes principais
        console.log(`  ${typeof window.GatewaySelector !== 'undefined' ? '✅' : '❌'} GatewaySelector`);
        console.log(`  ${typeof window.PaymentModal !== 'undefined' ? '✅' : '❌'} PaymentModal`);
        console.log(`  ${typeof window.PixPopupAlternative !== 'undefined' ? '✅' : '❌'} PixPopupAlternative`);
    }

    // Método para limpar erros e tentar novamente
    clearErrorsAndRetry() {
        console.log('🔄 Limpando erros e tentando novamente...');
        this.resourceErrors.clear();
        this.retryAttempts.clear();
        
        // Recarregar página se necessário
        if (this.resourceErrors.size > 5) {
            console.log('⚠️ Muitos erros detectados, recomendando recarregamento da página');
            if (confirm('Muitos recursos falharam ao carregar. Deseja recarregar a página?')) {
                window.location.reload();
            }
        }
    }

    // Método para forçar carregamento de recursos essenciais
    forceLoadEssentials() {
        console.log('🚀 Forçando carregamento de recursos essenciais...');
        
        const essentials = [
            { type: 'css', path: '/css/privacy.css' },
            { type: 'css', path: '/css/checkout.css' },
            { type: 'css', path: '/css/gateway-selector.css' },
            { type: 'js', path: '/js/config.js' }
        ];
        
        essentials.forEach(resource => {
            if (resource.type === 'css') {
                this.injectCSSLink(resource.path);
            } else if (resource.type === 'js') {
                this.injectJSScript(resource.path);
            }
        });
    }
}

// Inicializar sistema de fallback
window.ResourceFallback = new ResourceFallback();

// Disponibilizar métodos globalmente
window.resourceDebug = {
    diagnose: () => window.ResourceFallback.diagnose(),
    retry: () => window.ResourceFallback.clearErrorsAndRetry(),
    forceLoad: () => window.ResourceFallback.forceLoadEssentials()
};

console.log('🛡️ Resource Fallback System ativado! Use window.resourceDebug para debug.');
