/**
 * CACHE MANAGER
 * Sistema para gerenciar cache e evitar problemas de carregamento
 * Implementa estratégias inteligentes de cache busting
 */

class CacheManager {
    constructor() {
        this.cacheVersion = '1.0.0';
        this.resourceCache = new Map();
        this.init();
    }

    init() {
        console.log('💾 Cache Manager: Sistema de cache ativado');
        this.checkCacheHealth();
        this.setupCacheBusting();
        this.monitorPerformance();
    }

    checkCacheHealth() {
        // Verificar se há problemas de cache
        const performance = window.performance;
        if (performance && performance.getEntriesByType) {
            const resources = performance.getEntriesByType('resource');
            
            resources.forEach(resource => {
                if (resource.name.includes('.css') || resource.name.includes('.js')) {
                    // Verificar se o recurso carregou corretamente
                    if (resource.transferSize === 0 && resource.decodedBodySize === 0) {
                        console.warn(`⚠️ Possível problema de cache: ${resource.name}`);
                        this.addCacheBuster(resource.name);
                    } else {
                        console.log(`✅ Recurso carregado: ${resource.name} (${resource.transferSize} bytes)`);
                    }
                }
            });
        }
    }

    setupCacheBusting() {
        // Adicionar cache busting para recursos críticos em caso de problemas
        const criticalResources = document.querySelectorAll('link[rel="stylesheet"], script[src]');
        
        criticalResources.forEach(element => {
            const originalLoad = element.onload;
            const originalError = element.onerror;
            
            element.onload = (event) => {
                const src = element.href || element.src;
                console.log(`✅ Recurso carregado com sucesso: ${src}`);
                if (originalLoad) originalLoad.call(element, event);
            };
            
            element.onerror = (event) => {
                const src = element.href || element.src;
                console.error(`❌ Erro ao carregar recurso: ${src}`);
                
                // Tentar com cache busting
                this.reloadWithCacheBust(element);
                
                if (originalError) originalError.call(element, event);
            };
        });
    }

    reloadWithCacheBust(element) {
        const src = element.href || element.src;
        const cacheBuster = `v=${this.cacheVersion}&t=${Date.now()}`;
        
        let newSrc;
        if (src.includes('?')) {
            newSrc = `${src}&${cacheBuster}`;
        } else {
            newSrc = `${src}?${cacheBuster}`;
        }
        
        console.log(`🔄 Recarregando com cache bust: ${newSrc}`);
        
        if (element.tagName === 'LINK') {
            element.href = newSrc;
        } else if (element.tagName === 'SCRIPT') {
            // Para scripts, precisamos criar um novo elemento
            const newScript = document.createElement('script');
            newScript.src = newSrc;
            newScript.async = element.async;
            newScript.defer = element.defer;
            
            // Copiar atributos importantes
            if (element.crossOrigin) newScript.crossOrigin = element.crossOrigin;
            if (element.referrerPolicy) newScript.referrerPolicy = element.referrerPolicy;
            
            element.parentNode.replaceChild(newScript, element);
        }
    }

    addCacheBuster(resourceUrl) {
        const elements = document.querySelectorAll(`link[href*="${resourceUrl}"], script[src*="${resourceUrl}"]`);
        
        elements.forEach(element => {
            this.reloadWithCacheBust(element);
        });
    }

    monitorPerformance() {
        // Monitorar performance de carregamento
        if (window.PerformanceObserver) {
            const observer = new PerformanceObserver((list) => {
                list.getEntries().forEach((entry) => {
                    if (entry.entryType === 'resource') {
                        this.analyzeResourcePerformance(entry);
                    }
                });
            });
            
            observer.observe({ entryTypes: ['resource'] });
        }
        
        // Verificar recursos após carregamento completo
        window.addEventListener('load', () => {
            setTimeout(() => {
                this.performanceReport();
            }, 1000);
        });
    }

    analyzeResourcePerformance(entry) {
        const duration = entry.responseEnd - entry.startTime;
        const size = entry.transferSize;
        
        // Detectar recursos lentos
        if (duration > 5000) { // Mais de 5 segundos
            console.warn(`⚠️ Recurso lento detectado: ${entry.name} (${duration.toFixed(2)}ms)`);
        }
        
        // Detectar recursos grandes
        if (size > 1024 * 1024) { // Mais de 1MB
            console.warn(`⚠️ Recurso grande detectado: ${entry.name} (${(size / 1024 / 1024).toFixed(2)}MB)`);
        }
        
        this.resourceCache.set(entry.name, {
            duration,
            size,
            status: entry.responseStatus || 'unknown'
        });
    }

    performanceReport() {
        console.log('📊 === RELATÓRIO DE PERFORMANCE ===');
        
        const totalResources = this.resourceCache.size;
        let totalSize = 0;
        let totalDuration = 0;
        let slowResources = 0;
        let failedResources = 0;
        
        this.resourceCache.forEach((data, url) => {
            totalSize += data.size || 0;
            totalDuration += data.duration || 0;
            
            if (data.duration > 3000) slowResources++;
            if (data.status >= 400) failedResources++;
        });
        
        console.log(`📋 Total de recursos: ${totalResources}`);
        console.log(`📦 Tamanho total: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
        console.log(`⏱️ Tempo médio: ${(totalDuration / totalResources).toFixed(2)}ms`);
        console.log(`🐌 Recursos lentos: ${slowResources}`);
        console.log(`❌ Recursos com falha: ${failedResources}`);
        
        if (failedResources > 0) {
            console.log('❌ Recursos que falharam:');
            this.resourceCache.forEach((data, url) => {
                if (data.status >= 400) {
                    console.log(`  - ${url} (Status: ${data.status})`);
                }
            });
        }
    }

    // Método para limpar cache problemático
    clearProblematicCache() {
        console.log('🧹 Limpando cache problemático...');
        
        // Limpar localStorage relacionado
        Object.keys(localStorage).forEach(key => {
            if (key.includes('css') || key.includes('js') || key.includes('cache')) {
                localStorage.removeItem(key);
                console.log(`🗑️ Cache removido: ${key}`);
            }
        });
        
        // Limpar sessionStorage relacionado
        Object.keys(sessionStorage).forEach(key => {
            if (key.includes('css') || key.includes('js') || key.includes('cache')) {
                sessionStorage.removeItem(key);
                console.log(`🗑️ Session cache removido: ${key}`);
            }
        });
    }

    // Método para forçar recarregamento sem cache
    forceHardReload() {
        console.log('🔄 Forçando recarregamento completo sem cache...');
        
        // Limpar cache
        this.clearProblematicCache();
        
        // Recarregar página com cache busting
        const url = new URL(window.location);
        url.searchParams.set('nocache', Date.now());
        window.location.href = url.toString();
    }

    // Método para pré-carregar recursos críticos
    preloadCriticalResources() {
        const criticalCSS = [
            '/css/privacy.css',
            '/css/checkout.css',
            '/css/gateway-selector.css',
            '/css/payment-modal.css'
        ];
        
        const criticalJS = [
            '/js/config.js',
            '/js/gatewaySelector.js',
            '/js/payment-modal.js'
        ];
        
        console.log('🚀 Pré-carregando recursos críticos...');
        
        // Pré-carregar CSS
        criticalCSS.forEach(href => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.as = 'style';
            link.href = href;
            document.head.appendChild(link);
        });
        
        // Pré-carregar JS
        criticalJS.forEach(src => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.as = 'script';
            link.href = src;
            document.head.appendChild(link);
        });
    }

    // Método para diagnóstico completo
    diagnose() {
        console.log('🔍 === DIAGNÓSTICO DE CACHE ===');
        this.performanceReport();
        
        // Verificar se há recursos duplicados
        const cssLinks = document.querySelectorAll('link[rel="stylesheet"]');
        const jsScripts = document.querySelectorAll('script[src]');
        
        const cssHrefs = Array.from(cssLinks).map(link => link.href);
        const jsHrefs = Array.from(jsScripts).map(script => script.src);
        
        // Detectar duplicatas
        const duplicateCSS = cssHrefs.filter((href, index) => cssHrefs.indexOf(href) !== index);
        const duplicateJS = jsHrefs.filter((src, index) => jsHrefs.indexOf(src) !== index);
        
        if (duplicateCSS.length > 0) {
            console.warn('⚠️ CSS duplicados detectados:', duplicateCSS);
        }
        
        if (duplicateJS.length > 0) {
            console.warn('⚠️ JS duplicados detectados:', duplicateJS);
        }
        
        return {
            performance: Object.fromEntries(this.resourceCache),
            duplicates: {
                css: duplicateCSS,
                js: duplicateJS
            }
        };
    }

    // Método para otimizar carregamento
    optimize() {
        console.log('⚡ Otimizando carregamento de recursos...');
        
        // Remover recursos duplicados
        this.removeDuplicates();
        
        // Pré-carregar recursos críticos
        this.preloadCriticalResources();
        
        // Aplicar cache busting onde necessário
        this.applyCacheBusting();
    }

    removeDuplicates() {
        const seen = new Set();
        
        // Remover CSS duplicados
        document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
            const href = link.href;
            if (seen.has(href)) {
                link.remove();
                console.log(`🗑️ CSS duplicado removido: ${href}`);
            } else {
                seen.add(href);
            }
        });
        
        seen.clear();
        
        // Remover JS duplicados
        document.querySelectorAll('script[src]').forEach(script => {
            const src = script.src;
            if (seen.has(src)) {
                script.remove();
                console.log(`🗑️ JS duplicado removido: ${src}`);
            } else {
                seen.add(src);
            }
        });
    }

    applyCacheBusting() {
        // Aplicar cache busting apenas em recursos que apresentaram problemas
        const problematicResources = [
            'gateway-selector.css',
            'checkout.css',
            'payment-modal.css'
        ];
        
        problematicResources.forEach(filename => {
            const elements = document.querySelectorAll(`link[href*="${filename}"], script[src*="${filename}"]`);
            elements.forEach(element => {
                const src = element.href || element.src;
                if (!src.includes('?v=') && !src.includes('&v=')) {
                    const cacheBuster = `?v=${this.cacheVersion}&t=${Date.now()}`;
                    if (element.tagName === 'LINK') {
                        element.href = src + cacheBuster;
                    } else if (element.tagName === 'SCRIPT') {
                        element.src = src + cacheBuster;
                    }
                    console.log(`🔄 Cache busting aplicado: ${src}`);
                }
            });
        });
    }
}

// Inicializar sistema de cache
window.CacheManager = new CacheManager();

// Disponibilizar métodos globalmente
window.cacheDebug = {
    diagnose: () => window.CacheManager.diagnose(),
    optimize: () => window.CacheManager.optimize(),
    hardReload: () => window.CacheManager.forceHardReload(),
    clearCache: () => window.CacheManager.clearProblematicCache()
};

// Executar otimização após carregamento
window.addEventListener('load', () => {
    setTimeout(() => {
        console.log('⚡ Executando otimização automática...');
        window.CacheManager.optimize();
    }, 1000);
});

console.log('💾 Cache Manager ativado! Use window.cacheDebug para debug.');
