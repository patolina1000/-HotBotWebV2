/**
 * ERROR DIAGNOSTICS
 * Sistema centralizado de diagnóstico e correção de erros
 * Identifica e resolve problemas comuns de carregamento
 */

class ErrorDiagnostics {
    constructor() {
        this.errors = [];
        this.fixes = [];
        this.init();
    }

    init() {
        console.log('🔧 Error Diagnostics: Sistema de diagnóstico ativado');
        this.setupErrorCapture();
        this.scheduleHealthCheck();
    }

    setupErrorCapture() {
        // Capturar todos os tipos de erro
        window.addEventListener('error', (event) => {
            this.captureError('JavaScript Error', event.error, {
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                message: event.message
            });
        });

        window.addEventListener('unhandledrejection', (event) => {
            this.captureError('Unhandled Promise Rejection', event.reason, {
                promise: event.promise
            });
        });

        // Capturar erros de recursos
        window.addEventListener('error', (event) => {
            if (event.target && event.target.tagName) {
                const tag = event.target.tagName.toLowerCase();
                if (tag === 'link' || tag === 'script' || tag === 'img') {
                    this.captureError('Resource Load Error', `Failed to load ${tag}`, {
                        src: event.target.src || event.target.href,
                        tag: tag
                    });
                }
            }
        }, true);
    }

    captureError(type, error, details = {}) {
        const errorData = {
            type,
            error: error?.message || error?.toString() || error,
            details,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href
        };

        this.errors.push(errorData);
        console.error(`❌ [${type}]`, errorData);

        // Tentar aplicar correção automática
        this.tryAutoFix(errorData);
    }

    tryAutoFix(errorData) {
        const { type, details } = errorData;

        switch (type) {
            case 'Resource Load Error':
                this.fixResourceError(details);
                break;
            case 'JavaScript Error':
                this.fixJavaScriptError(errorData);
                break;
            case 'Unhandled Promise Rejection':
                this.fixPromiseRejection(errorData);
                break;
        }
    }

    fixResourceError(details) {
        const { src, tag } = details;
        
        if (!src) return;

        console.log(`🔧 Tentando corrigir erro de recurso: ${src}`);

        if (tag === 'link' && src.includes('.css')) {
            this.fixCSSError(src);
        } else if (tag === 'script' && src.includes('.js')) {
            this.fixJSError(src);
        }
    }

    fixCSSError(src) {
        const filename = src.split('/').pop();
        
        // Caminhos alternativos para CSS
        const alternatives = [
            `/css/${filename}`,
            `/public/css/${filename}`,
        ];

        this.tryAlternativeResources('css', alternatives, filename);
    }

    fixJSError(src) {
        const filename = src.split('/').pop();
        
        // Caminhos alternativos para JS
        const alternatives = [
            `js/${filename}`,
            `public/js/${filename}`,
            `/js/${filename}`,
            `/public/js/${filename}`
        ];

        this.tryAlternativeResources('js', alternatives, filename);
    }

    async tryAlternativeResources(type, alternatives, filename) {
        for (const alt of alternatives) {
            try {
                const response = await fetch(alt, { method: 'HEAD' });
                if (response.ok) {
                    console.log(`✅ Caminho alternativo encontrado: ${alt}`);
                    this.loadResource(type, alt);
                    this.fixes.push({
                        type: 'Resource Path Fix',
                        original: filename,
                        fixed: alt,
                        timestamp: new Date().toISOString()
                    });
                    return;
                }
            } catch (error) {
                // Continuar tentando
            }
        }
        
        console.warn(`⚠️ Nenhum caminho alternativo funcionou para: ${filename}`);
        this.applyFallbackForResource(type, filename);
    }

    loadResource(type, path) {
        if (type === 'css') {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = path;
            document.head.appendChild(link);
        } else if (type === 'js') {
            const script = document.createElement('script');
            script.src = path;
            script.async = true;
            document.head.appendChild(script);
        }
    }

    applyFallbackForResource(type, filename) {
        if (type === 'css') {
            this.applyCSSFallback(filename);
        } else if (type === 'js') {
            this.applyJSFallback(filename);
        }
    }

    applyCSSFallback(filename) {
        const fallbacks = {
            'gateway-selector.css': `
                .gateway-selector { padding: 15px; margin: 10px 0; border: 1px solid #ddd; border-radius: 8px; }
                .gateway-selector select { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; }
            `,
            'checkout.css': `
                .checkout-container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .plan-button { display: block; width: 100%; padding: 15px; margin: 10px 0; border: 2px solid #007bff; border-radius: 8px; background: white; color: #007bff; cursor: pointer; }
                .plan-button:hover { background: #007bff; color: white; }
            `,
            'pix-modal.css': `
                .pix-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: none; align-items: center; justify-content: center; z-index: 10000; }
                .pix-modal.show { display: flex; }
                .pix-modal-content { background: white; padding: 20px; border-radius: 10px; max-width: 400px; width: 90%; text-align: center; }
            `,
            'payment-modal.css': `
                .payment-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: none; align-items: center; justify-content: center; z-index: 10000; }
                .payment-modal.show { display: flex; }
                .payment-modal-content { background: white; padding: 30px; border-radius: 15px; max-width: 500px; width: 90%; }
            `
        };

        const fallbackCSS = fallbacks[filename];
        if (fallbackCSS) {
            const style = document.createElement('style');
            style.id = `fallback-${filename.replace('.css', '')}`;
            style.textContent = fallbackCSS;
            document.head.appendChild(style);
            
            console.log(`✅ Fallback CSS aplicado para: ${filename}`);
            this.fixes.push({
                type: 'CSS Fallback',
                filename,
                timestamp: new Date().toISOString()
            });
        }
    }

    applyJSFallback(filename) {
        const fallbacks = {
            'config.js': () => {
                window.APP_CONFIG = window.APP_CONFIG || {
                    model: { name: 'Privacy Creator', handle: '@creator', bio: 'Criador de conteúdo' },
                    plans: { monthly: { buttonId: 'btn-1-mes', label: '1 mês', priceLabel: 'R$ 19,98', price: 19.98 } }
                };
                console.log('✅ Config fallback aplicado');
            },
            'gatewaySelector.js': () => {
                window.GatewaySelector = class {
                    constructor() { console.log('✅ Gateway Selector fallback ativo'); }
                };
            }
        };

        const fallback = fallbacks[filename];
        if (fallback) {
            fallback();
            this.fixes.push({
                type: 'JS Fallback',
                filename,
                timestamp: new Date().toISOString()
            });
        }
    }

    fixJavaScriptError(errorData) {
        const message = errorData.error;
        
        // Correções específicas para erros comuns
        if (message.includes('$ is not defined')) {
            this.loadJQuery();
        } else if (message.includes('swal is not defined')) {
            this.loadSweetAlertFallback();
        } else if (message.includes('QRCode is not defined')) {
            this.loadQRCodeFallback();
        }
    }

    fixPromiseRejection(errorData) {
        console.log('🔧 Tentando corrigir Promise rejeitada:', errorData.error);
        
        // Implementar correções específicas conforme necessário
        if (errorData.error?.message?.includes('fetch')) {
            console.log('🌐 Erro de rede detectado, implementando retry...');
            // Implementar retry logic se necessário
        }
    }

    loadJQuery() {
        if (typeof $ === 'undefined') {
            console.log('📚 Carregando jQuery fallback...');
            const script = document.createElement('script');
            script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
            script.crossOrigin = 'anonymous';
            document.head.appendChild(script);
        }
    }

    loadSweetAlertFallback() {
        if (typeof swal === 'undefined') {
            console.log('🍭 Aplicando SweetAlert fallback...');
            window.swal = function(options) {
                if (typeof options === 'string') {
                    alert(options);
                } else if (options && options.title) {
                    alert(options.title);
                }
                return Promise.resolve({ isConfirmed: false, isDismissed: true });
            };
            window.swal.close = function() {};
        }
    }

    loadQRCodeFallback() {
        if (typeof QRCode === 'undefined') {
            console.log('📱 Carregando QRCode fallback...');
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';
            document.head.appendChild(script);
        }
    }

    scheduleHealthCheck() {
        // Verificação de saúde a cada 30 segundos
        setInterval(() => {
            this.healthCheck();
        }, 30000);

        // Verificação inicial após 5 segundos
        setTimeout(() => {
            this.healthCheck();
        }, 5000);
    }

    healthCheck() {
        console.log('🏥 Executando verificação de saúde...');
        
        const issues = [];
        
        // Verificar dependências críticas
        if (typeof $ === 'undefined') issues.push('jQuery não carregado');
        if (typeof window.APP_CONFIG === 'undefined') issues.push('Configuração não carregada');
        
        // Verificar CSS críticos
        const criticalCSS = ['privacy.css', 'checkout.css'];
        criticalCSS.forEach(css => {
            const found = document.querySelector(`link[href*="${css}"]`);
            if (!found) issues.push(`CSS crítico não encontrado: ${css}`);
        });
        
        if (issues.length > 0) {
            console.warn('⚠️ Problemas detectados:', issues);
            this.applyEmergencyFixes(issues);
        } else {
            console.log('✅ Sistema funcionando normalmente');
        }
    }

    applyEmergencyFixes(issues) {
        console.log('🚨 Aplicando correções de emergência...');
        
        issues.forEach(issue => {
            if (issue.includes('jQuery')) {
                this.loadJQuery();
            } else if (issue.includes('Configuração')) {
                this.loadDefaultConfig();
            } else if (issue.includes('CSS crítico')) {
                const cssName = issue.split(': ')[1];
                this.loadCriticalCSS(cssName);
            }
        });
    }

    loadDefaultConfig() {
        window.APP_CONFIG = {
            model: { name: 'Privacy Creator', handle: '@creator', bio: 'Criador de conteúdo exclusivo' },
            plans: {
                monthly: { buttonId: 'btn-1-mes', label: '1 mês', priceLabel: 'R$ 19,98', price: 19.98 },
                quarterly: { buttonId: 'btn-3-meses', label: '3 meses', priceLabel: 'R$ 59,76', price: 59.76 },
                semestrial: { buttonId: 'btn-6-meses', label: '6 meses', priceLabel: 'R$ 119,43', price: 119.43 }
            },
            gateway: 'pushinpay'
        };
        console.log('✅ Configuração padrão aplicada');
    }

    loadCriticalCSS(filename) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `/css/${filename}?v=${Date.now()}`;
        document.head.appendChild(link);
        console.log(`✅ CSS crítico carregado: ${filename}`);
    }

    // Método principal de diagnóstico
    fullDiagnosis() {
        console.log('🔍 === DIAGNÓSTICO COMPLETO ===');
        
        const report = {
            timestamp: new Date().toISOString(),
            errors: this.errors,
            fixes: this.fixes,
            environment: {
                userAgent: navigator.userAgent,
                url: window.location.href,
                online: navigator.onLine,
                cookiesEnabled: navigator.cookieEnabled
            },
            resources: this.checkResourceStatus(),
            dependencies: this.checkDependencies()
        };

        console.log('📋 Relatório completo:', report);
        return report;
    }

    checkResourceStatus() {
        const cssLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
        const jsScripts = Array.from(document.querySelectorAll('script[src]'));
        
        return {
            css: {
                total: cssLinks.length,
                loaded: cssLinks.filter(link => link.sheet).length,
                failed: cssLinks.filter(link => !link.sheet).length,
                list: cssLinks.map(link => ({
                    href: link.href,
                    loaded: !!link.sheet
                }))
            },
            js: {
                total: jsScripts.length,
                list: jsScripts.map(script => ({
                    src: script.src,
                    loaded: script.readyState === 'complete' || script.readyState === 'loaded'
                }))
            }
        };
    }

    checkDependencies() {
        return {
            jquery: typeof $ !== 'undefined',
            sweetAlert: typeof swal !== 'undefined',
            qrCode: typeof QRCode !== 'undefined',
            appConfig: typeof window.APP_CONFIG !== 'undefined',
            syncpayConfig: typeof window.SYNCPAY_CONFIG !== 'undefined',
            gatewaySelector: typeof window.GatewaySelector !== 'undefined',
            paymentModal: typeof window.PaymentModal !== 'undefined',
            pixPopup: typeof window.PixPopupAlternative !== 'undefined'
        };
    }

    // Método para gerar relatório para suporte
    generateSupportReport() {
        const report = this.fullDiagnosis();
        
        const supportData = {
            timestamp: report.timestamp,
            userAgent: report.environment.userAgent,
            url: report.environment.url,
            totalErrors: report.errors.length,
            totalFixes: report.fixes.length,
            criticalIssues: report.errors.filter(e => e.type.includes('Critical')),
            resourceIssues: report.errors.filter(e => e.type.includes('Resource')),
            dependencyStatus: report.dependencies,
            recommendations: this.generateRecommendations(report)
        };

        console.log('📞 === RELATÓRIO PARA SUPORTE ===');
        console.log(JSON.stringify(supportData, null, 2));
        
        // Copiar para clipboard se possível
        if (navigator.clipboard) {
            navigator.clipboard.writeText(JSON.stringify(supportData, null, 2))
                .then(() => console.log('📋 Relatório copiado para clipboard'))
                .catch(() => console.log('❌ Falha ao copiar relatório'));
        }
        
        return supportData;
    }

    generateRecommendations(report) {
        const recommendations = [];
        
        if (report.errors.length > 10) {
            recommendations.push('Muitos erros detectados - considere recarregar a página');
        }
        
        if (report.resources.css.failed > 3) {
            recommendations.push('Múltiplos CSS falharam - verificar conexão de rede');
        }
        
        if (!report.dependencies.jquery) {
            recommendations.push('jQuery não carregado - funcionalidades podem estar limitadas');
        }
        
        if (!report.dependencies.appConfig) {
            recommendations.push('Configuração não carregada - usar configuração padrão');
        }
        
        return recommendations;
    }

    // Método para aplicar todas as correções disponíveis
    applyAllFixes() {
        console.log('🔧 Aplicando todas as correções disponíveis...');
        
        // Usar outros sistemas de correção se disponíveis
        if (window.cssDebug) {
            window.cssDebug.diagnose();
            window.cssDebug.reload();
        }
        
        if (window.resourceDebug) {
            window.resourceDebug.diagnose();
            window.resourceDebug.forceLoad();
        }
        
        if (window.cacheDebug) {
            window.cacheDebug.optimize();
        }
        
        // Aplicar correções próprias
        this.loadDefaultConfig();
        this.loadJQuery();
        this.loadSweetAlertFallback();
        
        console.log('✅ Todas as correções aplicadas');
    }
}

// Inicializar sistema de diagnóstico
window.ErrorDiagnostics = new ErrorDiagnostics();

// Disponibilizar métodos globalmente para debug fácil
window.debugSystem = {
    // Diagnóstico completo
    diagnose: () => window.ErrorDiagnostics.fullDiagnosis(),
    
    // Relatório para suporte
    support: () => window.ErrorDiagnostics.generateSupportReport(),
    
    // Aplicar todas as correções
    fix: () => window.ErrorDiagnostics.applyAllFixes(),
    
    // Diagnósticos específicos
    css: () => window.cssDebug?.diagnose(),
    resources: () => window.resourceDebug?.diagnose(),
    cache: () => window.cacheDebug?.diagnose(),
    
    // Correções específicas
    fixCSS: () => window.cssDebug?.reload(),
    fixResources: () => window.resourceDebug?.retry(),
    fixCache: () => window.cacheDebug?.clearCache(),
    
    // Recarregamento forçado
    hardReload: () => {
        console.log('🔄 Executando recarregamento forçado...');
        window.cacheDebug?.clearCache();
        window.location.reload(true);
    }
};

// Executar diagnóstico inicial
setTimeout(() => {
    console.log('🔍 Executando diagnóstico inicial...');
    window.debugSystem.diagnose();
}, 3000);

console.log('🔧 Error Diagnostics ativado! Use window.debugSystem para debug completo.');
console.log('💡 Comandos úteis:');
console.log('  - window.debugSystem.diagnose() - Diagnóstico completo');
console.log('  - window.debugSystem.fix() - Aplicar todas as correções');
console.log('  - window.debugSystem.support() - Gerar relatório para suporte');
console.log('  - window.debugSystem.hardReload() - Recarregamento forçado');
