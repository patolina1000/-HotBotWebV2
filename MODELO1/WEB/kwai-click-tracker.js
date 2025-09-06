/**
 * Kwai Click ID Tracker
 * Captura e propaga o click_id do Kwai conforme documentação oficial
 * 
 * Funcionalidades:
 * - Captura click_id da URL (?click_id=xxx)
 * - Armazena em localStorage, sessionStorage e cookie
 * - Propaga para todas as páginas do funil
 * - Integra com sistema de tracking principal
 * - Compatível com UTM e outros parâmetros
 */

(function() {
  'use strict';

  // Configuração do Kwai Click Tracker
  const KwaiClickTracker = {
    // Configurações
    config: {
      cookieName: 'kwai_click_id',
      storageKey: 'kwai_click_id',
      sessionKey: 'kwai_click_id_session',
      cookieExpireDays: 30,
      debug: true,
      apiEndpoint: '/api/kwai-click-id'
    },

    // Estado
    clickId: null,
    captured: false,

    /**
     * Inicializa o tracker
     */
    init() {
      console.log('🎯 [KWAI-CLICK] Inicializando Kwai Click Tracker...');
      
      // Tentar capturar click_id da URL atual
      this.captureFromCurrentUrl();
      
      // Se não encontrou na URL, tentar recuperar do storage
      if (!this.clickId) {
        this.loadFromStorage();
      }

      // Configurar interceptadores para propagação
      this.setupUrlInterceptors();
      
      // Configurar listener para mudanças de página
      this.setupPageChangeListener();

      console.log('🎯 [KWAI-CLICK] Tracker inicializado', {
        clickId: this.clickId ? this.clickId.substring(0, 20) + '...' : 'não encontrado',
        captured: this.captured
      });
    },

    /**
     * Captura click_id da URL atual
     */
    captureFromCurrentUrl() {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const clickIdFromUrl = urlParams.get('click_id');
        
        if (clickIdFromUrl && clickIdFromUrl.trim()) {
          this.setClickId(clickIdFromUrl.trim());
          this.captured = true;
          
          console.log('🎯 [KWAI-CLICK] Click ID capturado da URL:', clickIdFromUrl.substring(0, 20) + '...');
          
          // Limpar o parâmetro da URL para não expor o click_id
          this.cleanUrlParameters();
          
          return true;
        }
      } catch (error) {
        console.error('🎯 [KWAI-CLICK] Erro ao capturar da URL:', error);
      }
      
      return false;
    },

    /**
     * Remove parâmetros sensíveis da URL
     */
    cleanUrlParameters() {
      try {
        if (window.history && window.history.replaceState) {
          const url = new URL(window.location);
          const params = url.searchParams;
          
          // Remover click_id da URL visível
          if (params.has('click_id')) {
            params.delete('click_id');
            
            // Reconstruir URL sem o click_id
            const newUrl = url.pathname + (params.toString() ? '?' + params.toString() : '') + url.hash;
            window.history.replaceState({}, document.title, newUrl);
            
            console.log('🎯 [KWAI-CLICK] Parâmetro click_id removido da URL');
          }
        }
      } catch (error) {
        console.error('🎯 [KWAI-CLICK] Erro ao limpar URL:', error);
      }
    },

    /**
     * Carrega click_id do storage
     */
    loadFromStorage() {
      // Tentar localStorage primeiro (mais persistente)
      let stored = localStorage.getItem(this.config.storageKey);
      if (stored) {
        this.clickId = stored;
        console.log('🎯 [KWAI-CLICK] Click ID recuperado do localStorage');
        return true;
      }

      // Tentar sessionStorage
      stored = sessionStorage.getItem(this.config.sessionKey);
      if (stored) {
        this.clickId = stored;
        console.log('🎯 [KWAI-CLICK] Click ID recuperado do sessionStorage');
        return true;
      }

      // Tentar cookie como último recurso
      stored = this.getCookie(this.config.cookieName);
      if (stored) {
        this.clickId = stored;
        console.log('🎯 [KWAI-CLICK] Click ID recuperado do cookie');
        return true;
      }

      return false;
    },

    /**
     * Define e armazena o click_id
     * @param {string} clickId - Click ID do Kwai
     */
    setClickId(clickId) {
      if (!clickId || !clickId.trim()) {
        console.warn('🎯 [KWAI-CLICK] Click ID inválido fornecido');
        return false;
      }

      const cleanClickId = clickId.trim();
      this.clickId = cleanClickId;

      // Armazenar em múltiplos locais para redundância
      try {
        // localStorage (persiste entre sessões)
        localStorage.setItem(this.config.storageKey, cleanClickId);
        
        // sessionStorage (persiste durante a sessão)
        sessionStorage.setItem(this.config.sessionKey, cleanClickId);
        
        // Cookie (fallback para navegadores com storage desabilitado)
        this.setCookie(this.config.cookieName, cleanClickId, this.config.cookieExpireDays);

        console.log('🎯 [KWAI-CLICK] Click ID armazenado em localStorage, sessionStorage e cookie');

        // Notificar outros scripts sobre o novo click_id
        this.notifyClickIdUpdate(cleanClickId);

        return true;
      } catch (error) {
        console.error('🎯 [KWAI-CLICK] Erro ao armazenar click_id:', error);
        return false;
      }
    },

    /**
     * Obtém o click_id atual
     * @returns {string|null}
     */
    getClickId() {
      return this.clickId;
    },

    /**
     * Notifica outros sistemas sobre atualização do click_id
     * @param {string} clickId 
     */
    notifyClickIdUpdate(clickId) {
      try {
        // Disparar evento customizado
        const event = new CustomEvent('kwaiClickIdUpdate', {
          detail: { clickId: clickId }
        });
        window.dispatchEvent(event);

        // Atualizar variável global se existir
        if (window.KWAI_CLICK_ID !== undefined) {
          window.KWAI_CLICK_ID = clickId;
        }

        // Integrar com outros sistemas de tracking se disponíveis
        if (window.KwaiTracker && typeof window.KwaiTracker.setClickId === 'function') {
          window.KwaiTracker.setClickId(clickId);
        }

        if (window.TrackingSystem && typeof window.TrackingSystem.setKwaiClickId === 'function') {
          window.TrackingSystem.setKwaiClickId(clickId);
        }

      } catch (error) {
        console.error('🎯 [KWAI-CLICK] Erro ao notificar atualização:', error);
      }
    },

    /**
     * Configura interceptadores para propagação automática
     */
    setupUrlInterceptors() {
      // Interceptar cliques em links para adicionar click_id
      document.addEventListener('click', (event) => {
        if (!this.clickId) return;

        const target = event.target.closest('a');
        if (target && target.href) {
          try {
            const url = new URL(target.href, window.location.origin);
            
            // Se é um link interno e não tem click_id, adicionar
            if (url.origin === window.location.origin && !url.searchParams.has('click_id')) {
              url.searchParams.set('click_id', this.clickId);
              target.href = url.toString();
              
              if (this.config.debug) {
                console.log('🎯 [KWAI-CLICK] Click ID adicionado ao link:', target.href.substring(0, 100) + '...');
              }
            }
          } catch (error) {
            // Ignorar erros de URL inválida
          }
        }
      });

      // Interceptar submissões de formulário
      document.addEventListener('submit', (event) => {
        if (!this.clickId) return;

        const form = event.target;
        if (form && form.method && form.method.toLowerCase() === 'get') {
          // Para formulários GET, adicionar como campo oculto
          const hiddenInput = document.createElement('input');
          hiddenInput.type = 'hidden';
          hiddenInput.name = 'click_id';
          hiddenInput.value = this.clickId;
          form.appendChild(hiddenInput);

          console.log('🎯 [KWAI-CLICK] Click ID adicionado ao formulário GET');
        }
      });
    },

    /**
     * Configura listener para mudanças de página (SPA)
     */
    setupPageChangeListener() {
      // Interceptar pushState e replaceState para SPAs
      const originalPushState = window.history.pushState;
      const originalReplaceState = window.history.replaceState;

      window.history.pushState = (...args) => {
        originalPushState.apply(window.history, args);
        setTimeout(() => this.handlePageChange(), 100);
      };

      window.history.replaceState = (...args) => {
        originalReplaceState.apply(window.history, args);
        setTimeout(() => this.handlePageChange(), 100);
      };

      // Listener para popstate (botão voltar/avançar)
      window.addEventListener('popstate', () => {
        setTimeout(() => this.handlePageChange(), 100);
      });
    },

    /**
     * Manipula mudanças de página
     */
    handlePageChange() {
      // Verificar se há novo click_id na URL
      const captured = this.captureFromCurrentUrl();
      
      if (!captured && !this.clickId) {
        // Tentar recuperar do storage
        this.loadFromStorage();
      }
    },

    /**
     * Envia click_id para o backend
     * @param {string} telegramId - ID do Telegram (opcional)
     */
    async sendToBackend(telegramId = null) {
      if (!this.clickId) {
        console.warn('🎯 [KWAI-CLICK] Nenhum click_id para enviar');
        return false;
      }

      try {
        const payload = {
          click_id: this.clickId
        };

        if (telegramId) {
          payload.telegram_id = telegramId;
        }

        const response = await fetch(this.config.apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          const result = await response.json();
          console.log('🎯 [KWAI-CLICK] Click ID enviado para backend:', result.message);
          return true;
        } else {
          console.warn('🎯 [KWAI-CLICK] Erro ao enviar para backend:', response.statusText);
          return false;
        }
      } catch (error) {
        console.error('🎯 [KWAI-CLICK] Erro na requisição:', error);
        return false;
      }
    },

    /**
     * Utilitários para cookies
     */
    setCookie(name, value, days) {
      const expires = new Date();
      expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
      document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
    },

    getCookie(name) {
      const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
      return match ? decodeURIComponent(match[1]) : null;
    },

    /**
     * API pública
     */
    api: {
      getClickId: () => KwaiClickTracker.getClickId(),
      setClickId: (clickId) => KwaiClickTracker.setClickId(clickId),
      hasClickId: () => !!KwaiClickTracker.getClickId(),
      sendToBackend: (telegramId) => KwaiClickTracker.sendToBackend(telegramId),
      forceCapture: () => KwaiClickTracker.captureFromCurrentUrl()
    }
  };

  // Auto-inicializar quando DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      KwaiClickTracker.init();
    });
  } else {
    KwaiClickTracker.init();
  }

  // Expor API globalmente
  window.KwaiClickTracker = KwaiClickTracker.api;

  // Variável global para compatibilidade
  window.KWAI_CLICK_ID = KwaiClickTracker.getClickId();

  // Atualizar variável global quando click_id mudar
  window.addEventListener('kwaiClickIdUpdate', (event) => {
    window.KWAI_CLICK_ID = event.detail.clickId;
  });

  console.log('🎯 [KWAI-CLICK] Script carregado - API disponível em window.KwaiClickTracker');

})();
