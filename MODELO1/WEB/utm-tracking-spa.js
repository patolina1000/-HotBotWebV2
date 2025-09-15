/**
 * UTM Tracking para Single Page Apps (SPA)
 * Captura UTMs em mudanças de rota e hash
 * Deve ser carregado APÓS o script principal utm-tracking-robust.js
 */
(function() {
    'use strict';
    
    // Aguardar o script principal carregar
    function waitForUTMTracking() {
        if (window.UTMTracking) {
            initializeSPATracking();
        } else {
            setTimeout(waitForUTMTracking, 100);
        }
    }
    
    function initializeSPATracking() {
        console.log('[UTM-SPA] Inicializando tracking para SPA');
        
        // 1. Capturar UTMs em mudanças de hash
        window.addEventListener('hashchange', function() {
            console.log('[UTM-SPA] Hash mudou, capturando UTMs');
            window.UTMTracking.capture();
        });
        
        // 2. Interceptar pushState para mudanças de rota
        if (window.history && window.history.pushState) {
            const originalPushState = window.history.pushState;
            window.history.pushState = function(state, title, url) {
                console.log('[UTM-SPA] pushState chamado:', url);
                originalPushState.call(this, state, title, url);
                window.UTMTracking.capture();
            };
        }
        
        // 3. Interceptar replaceState
        if (window.history && window.history.replaceState) {
            const originalReplaceState = window.history.replaceState;
            window.history.replaceState = function(state, title, url) {
                console.log('[UTM-SPA] replaceState chamado:', url);
                originalReplaceState.call(this, state, title, url);
                window.UTMTracking.capture();
            };
        }
        
        // 4. Para frameworks específicos (React Router, Vue Router, etc.)
        setupFrameworkSpecificTracking();
        
        console.log('[UTM-SPA] Tracking configurado para SPA');
    }
    
    function setupFrameworkSpecificTracking() {
        // React Router
        if (window.ReactRouter) {
            console.log('[UTM-SPA] React Router detectado');
            // React Router v6
            if (window.ReactRouter.useLocation) {
                const originalUseLocation = window.ReactRouter.useLocation;
                window.ReactRouter.useLocation = function() {
                    const location = originalUseLocation();
                    window.UTMTracking.capture();
                    return location;
                };
            }
        }
        
        // Vue Router
        if (window.Vue && window.Vue.prototype.$router) {
            console.log('[UTM-SPA] Vue Router detectado');
            const router = window.Vue.prototype.$router;
            if (router && router.beforeEach) {
                router.beforeEach((to, from, next) => {
                    console.log('[UTM-SPA] Vue Router navegação:', to.path);
                    window.UTMTracking.capture();
                    next();
                });
            }
        }
        
        // Angular Router
        if (window.angular) {
            console.log('[UTM-SPA] Angular detectado');
            const app = window.angular.element(document).scope();
            if (app && app.$on) {
                app.$on('$routeChangeStart', function() {
                    console.log('[UTM-SPA] Angular rota mudando');
                    window.UTMTracking.capture();
                });
            }
        }
    }
    
    // Inicializar quando DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForUTMTracking);
    } else {
        waitForUTMTracking();
    }
    
    // Expor função para captura manual
    window.UTMSPATracking = {
        capture: function() {
            if (window.UTMTracking) {
                window.UTMTracking.capture();
            }
        },
        get: function() {
            return window.UTMTracking ? window.UTMTracking.get() : {};
        }
    };
    
})(); 
