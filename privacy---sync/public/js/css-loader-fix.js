/**
 * CSS LOADER FIX
 * Sistema para diagnosticar e corrigir problemas de carregamento de CSS
 * Evita erros 404 verificando a existência dos arquivos antes de carregá-los
 */

class CSSLoaderFix {
    constructor() {
        this.loadedCSS = new Set();
        this.failedCSS = new Set();
        this.init();
    }

    init() {
        console.log('🔧 CSS Loader Fix: Iniciando diagnóstico...');
        this.checkExistingCSS();
        this.setupErrorHandlers();
        this.loadMissingCSS();
    }

    checkExistingCSS() {
        const existingLinks = document.querySelectorAll('link[rel="stylesheet"]');
        console.log(`📋 Encontrados ${existingLinks.length} links CSS`);
        
        existingLinks.forEach(link => {
            const href = link.href;
            this.loadedCSS.add(href);
            
            // Verificar se o CSS carregou corretamente
            link.addEventListener('load', () => {
                console.log(`✅ CSS carregado: ${href}`);
            });
            
            link.addEventListener('error', () => {
                console.error(`❌ Erro ao carregar CSS: ${href}`);
                this.failedCSS.add(href);
                this.handleFailedCSS(link);
            });
        });
    }

    setupErrorHandlers() {
        // Interceptar erros de recursos
        window.addEventListener('error', (event) => {
            if (event.target.tagName === 'LINK' && event.target.rel === 'stylesheet') {
                const href = event.target.href;
                console.error(`❌ CSS falhou ao carregar: ${href}`);
                this.failedCSS.add(href);
                this.handleFailedCSS(event.target);
            }
        }, true);
    }

    handleFailedCSS(linkElement) {
        const href = linkElement.href;
        const filename = href.split('/').pop();
        
        // Tentar caminhos alternativos
        const alternativePaths = [
            `/css/${filename}`,
            `/public/css/${filename}`
        ];

        console.log(`🔄 Tentando caminhos alternativos para ${filename}...`);
        
        this.tryAlternativePaths(linkElement, alternativePaths, 0);
    }

    async tryAlternativePaths(linkElement, paths, index) {
        if (index >= paths.length) {
            console.error(`❌ Nenhum caminho alternativo funcionou para ${linkElement.href}`);
            return;
        }

        const path = paths[index];
        const fullPath = path.startsWith('/') ? path : `/${path}`;
        
        try {
            const response = await fetch(fullPath, { method: 'HEAD' });
            if (response.ok) {
                console.log(`✅ Caminho alternativo encontrado: ${fullPath}`);
                linkElement.href = fullPath;
                return;
            }
        } catch (error) {
            console.log(`❌ Caminho não funcionou: ${fullPath}`);
        }
        
        // Tentar próximo caminho
        this.tryAlternativePaths(linkElement, paths, index + 1);
    }

    loadMissingCSS() {
        // Lista de CSS essenciais que devem estar carregados
        const essentialCSS = [
            '/css/gateway-selector.css',
            '/css/checkout.css',
            '/css/pix-modal.css',
            '/css/payment-modal.css',
            '/css/privacy.css',
            '/css/privacy.components.css',
            '/css/shadow-styles.css'
        ];

        essentialCSS.forEach(cssPath => {
            this.ensureCSSLoaded(cssPath);
        });
    }

    async ensureCSSLoaded(cssPath) {
        const fullPath = cssPath.startsWith('/') ? cssPath : `/${cssPath}`;
        
        // Verificar se já está carregado
        const existingLink = document.querySelector(`link[href*="${cssPath}"]`) || 
                           document.querySelector(`link[href*="${fullPath}"]`);
        
        if (existingLink) {
            console.log(`✅ CSS já carregado: ${cssPath}`);
            return;
        }

        try {
            // Verificar se o arquivo existe
            const response = await fetch(fullPath, { method: 'HEAD' });
            if (response.ok) {
                this.loadCSS(fullPath);
                console.log(`✅ CSS carregado dinamicamente: ${fullPath}`);
            } else {
                console.warn(`⚠️ CSS não encontrado: ${fullPath}`);
            }
        } catch (error) {
            console.error(`❌ Erro ao verificar CSS: ${fullPath}`, error);
        }
    }

    loadCSS(href) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = href;
        
        link.addEventListener('load', () => {
            console.log(`✅ CSS carregado com sucesso: ${href}`);
            this.loadedCSS.add(href);
        });
        
        link.addEventListener('error', () => {
            console.error(`❌ Falha ao carregar CSS: ${href}`);
            this.failedCSS.add(href);
        });
        
        document.head.appendChild(link);
    }

    // Método para recarregar CSS com problemas
    reloadFailedCSS() {
        console.log('🔄 Recarregando CSS com falhas...');
        
        this.failedCSS.forEach(href => {
            const existingLink = document.querySelector(`link[href="${href}"]`);
            if (existingLink) {
                existingLink.remove();
            }
            
            // Tentar recarregar
            this.loadCSS(href);
        });
        
        this.failedCSS.clear();
    }

    // Método para diagnóstico completo
    diagnose() {
        console.log('🔍 === DIAGNÓSTICO CSS ===');
        console.log(`✅ CSS carregados: ${this.loadedCSS.size}`);
        console.log(`❌ CSS com falha: ${this.failedCSS.size}`);
        
        if (this.failedCSS.size > 0) {
            console.log('❌ Arquivos com problema:');
            this.failedCSS.forEach(href => {
                console.log(`  - ${href}`);
            });
        }
        
        // Verificar CSS essenciais
        const essentialCSS = [
            'gateway-selector.css',
            'checkout.css', 
            'pix-modal.css',
            'payment-modal.css',
            'privacy.css'
        ];
        
        console.log('🔍 Verificando CSS essenciais:');
        essentialCSS.forEach(filename => {
            const found = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
                .some(link => link.href.includes(filename));
            console.log(`  ${found ? '✅' : '❌'} ${filename}`);
        });
        
        return {
            loaded: Array.from(this.loadedCSS),
            failed: Array.from(this.failedCSS)
        };
    }

    // Método para forçar recarregamento de todos os CSS
    forceReloadAll() {
        console.log('🔄 Forçando recarregamento de todos os CSS...');
        
        const allLinks = document.querySelectorAll('link[rel="stylesheet"]');
        allLinks.forEach(link => {
            const href = link.href;
            const newHref = href.includes('?') ? `${href}&reload=${Date.now()}` : `${href}?reload=${Date.now()}`;
            link.href = newHref;
        });
    }
}

// Inicializar o sistema automaticamente
window.CSSLoaderFix = new CSSLoaderFix();

// Disponibilizar métodos globalmente para debug
window.cssDebug = {
    diagnose: () => window.CSSLoaderFix.diagnose(),
    reload: () => window.CSSLoaderFix.reloadFailedCSS(),
    forceReload: () => window.CSSLoaderFix.forceReloadAll()
};

// Executar diagnóstico após 2 segundos
setTimeout(() => {
    console.log('🔍 Executando diagnóstico automático...');
    window.cssDebug.diagnose();
}, 2000);

console.log('🔧 CSS Loader Fix carregado! Use window.cssDebug.diagnose() para verificar status.');
