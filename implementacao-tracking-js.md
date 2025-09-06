# Implementação Prática - Arquivos JavaScript para Otimização

## 1. tracking-core.js - Sistema Central de Rastreamento

```javascript
// tracking-core.js - Núcleo do sistema de rastreamento
(function(window, document) {
  'use strict';
  
  const TrackingCore = {
    // Configuração
    config: {
      fbPixelId: 'YOUR_FB_PIXEL_ID',
      kwaiPixelId: 'YOUR_KWAI_PIXEL_ID',
      serverEndpoint: '/api/tracking',
      sessionTimeout: 30 * 60 * 1000, // 30 minutos
      enableServerSide: true
    },
    
    // Estado
    state: {
      initialized: false,
      sessionId: null,
      userId: null,
      trackingParams: {},
      eventQueue: [],
      lastActivity: Date.now()
    },
    
    // Inicialização
    init() {
      if (this.state.initialized) return;
      
      this.captureTrackingParams();
      this.initializeSession();
      this.loadStoredData();
      this.setupEventListeners();
      this.state.initialized = true;
      
      // Disparar PageView inicial
      this.trackEvent('PageView');
    },
    
    // Captura todos os parâmetros de rastreamento
    captureTrackingParams() {
      const params = new URLSearchParams(window.location.search);
      
      // UTMs
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(utm => {
        if (params.get(utm)) {
          this.state.trackingParams[utm] = params.get(utm);
        }
      });
      
      // Facebook
      this.state.trackingParams.fbp = this.getFbp();
      this.state.trackingParams.fbc = this.getFbc(params.get('fbclid'));
      
      // Kwai - múltiplas variações
      const kwaiClickId = params.get('click_id') || 
                         params.get('kwai_click_id') || 
                         params.get('kw_click_id') ||
                         this.getCookie('kwai_click_id');
                         
      if (kwaiClickId) {
        this.state.trackingParams.click_id = kwaiClickId;
        this.setCookie('kwai_click_id', kwaiClickId, 30);
      }
      
      // Salvar todos os parâmetros
      this.persistTrackingData();
    },
    
    // Facebook Browser ID
    getFbp() {
      let fbp = this.getCookie('_fbp');
      if (!fbp) {
        fbp = `fb.1.${Date.now()}.${Math.random().toString(36).substring(2, 15)}`;
        this.setCookie('_fbp', fbp, 90);
      }
      return fbp;
    },
    
    // Facebook Click ID
    getFbc(fbclid) {
      if (fbclid) {
        const fbc = `fb.1.${Date.now()}.${fbclid}`;
        this.setCookie('_fbc', fbc, 90);
        return fbc;
      }
      return this.getCookie('_fbc') || null;
    },
    
    // Sistema de eventos unificado
    trackEvent(eventName, parameters = {}) {
      const eventData = {
        eventName,
        parameters: {
          ...parameters,
          ...this.state.trackingParams,
          session_id: this.state.sessionId,
          event_id: this.generateEventId(),
          timestamp: Date.now()
        }
      };
      
      // Adicionar à fila
      this.state.eventQueue.push(eventData);
      
      // Client-side tracking
      this.fireClientSideEvent(eventData);
      
      // Server-side tracking
      if (this.config.enableServerSide) {
        this.queueServerSideEvent(eventData);
      }
    },
    
    // Disparo client-side
    fireClientSideEvent(eventData) {
      // Facebook
      if (typeof fbq !== 'undefined') {
        fbq('track', eventData.eventName, eventData.parameters);
      }
      
      // Kwai
      if (typeof kwaiPixel !== 'undefined') {
        const kwaiEventMap = {
          'PageView': 'PAGE_VIEW',
          'ViewContent': 'VIEW_CONTENT',
          'AddToCart': 'ADD_TO_CART',
          'InitiateCheckout': 'INITIATE_CHECKOUT',
          'Purchase': 'PURCHASE'
        };
        
        const kwaiEvent = kwaiEventMap[eventData.eventName];
        if (kwaiEvent) {
          kwaiPixel.track(kwaiEvent, eventData.parameters);
        }
      }
    },
    
    // Server-side queue
    serverQueue: [],
    serverTimer: null,
    
    queueServerSideEvent(eventData) {
      this.serverQueue.push(eventData);
      
      clearTimeout(this.serverTimer);
      this.serverTimer = setTimeout(() => this.flushServerEvents(), 1000);
    },
    
    flushServerEvents() {
      if (this.serverQueue.length === 0) return;
      
      const events = [...this.serverQueue];
      this.serverQueue = [];
      
      fetch(this.config.serverEndpoint, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          events,
          user_agent: navigator.userAgent,
          ip_address: 'server-will-detect',
          page_url: window.location.href
        }),
        keepalive: true
      }).catch(err => {
        console.error('Server tracking failed:', err);
        // Re-queue events on failure
        this.serverQueue.unshift(...events);
      });
    },
    
    // Persistência de dados
    persistTrackingData() {
      const data = {
        trackingParams: this.state.trackingParams,
        sessionId: this.state.sessionId,
        userId: this.state.userId,
        lastActivity: this.state.lastActivity
      };
      
      // Múltiplas camadas de persistência
      localStorage.setItem('tk_core', JSON.stringify(data));
      sessionStorage.setItem('tk_core', JSON.stringify(data));
      
      // Cookie como fallback
      this.setCookie('tk_data', btoa(JSON.stringify(data)), 30);
    },
    
    loadStoredData() {
      try {
        const stored = localStorage.getItem('tk_core') || 
                      sessionStorage.getItem('tk_core') ||
                      atob(this.getCookie('tk_data') || '');
                      
        if (stored) {
          const data = JSON.parse(stored);
          Object.assign(this.state, data);
        }
      } catch(e) {
        console.error('Failed to load stored tracking data:', e);
      }
    },
    
    // Utilities
    generateEventId() {
      return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    },
    
    generateSessionId() {
      return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    },
    
    initializeSession() {
      if (!this.state.sessionId) {
        this.state.sessionId = this.generateSessionId();
      }
      
      // Verificar timeout da sessão
      if (Date.now() - this.state.lastActivity > this.config.sessionTimeout) {
        this.state.sessionId = this.generateSessionId();
      }
      
      this.state.lastActivity = Date.now();
    },
    
    getCookie(name) {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop().split(';').shift();
      return null;
    },
    
    setCookie(name, value, days) {
      const expires = new Date(Date.now() + days * 864e5).toUTCString();
      document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`;
    },
    
    setupEventListeners() {
      // Salvar dados antes de sair
      window.addEventListener('beforeunload', () => {
        this.flushServerEvents();
        this.persistTrackingData();
      });
      
      // Atualizar atividade
      ['click', 'scroll', 'keypress'].forEach(event => {
        document.addEventListener(event, () => {
          this.state.lastActivity = Date.now();
        }, { passive: true });
      });
    }
  };
  
  // Auto-inicializar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => TrackingCore.init());
  } else {
    TrackingCore.init();
  }
  
  // Expor globalmente
  window.TrackingCore = TrackingCore;
  
})(window, document);
```

## 2. pix-tracker.js - Rastreamento Específico para PIX

```javascript
// pix-tracker.js - Rastreamento especializado para pagamentos PIX
(function(window) {
  'use strict';
  
  const PixTracker = {
    activePixSessions: {},
    checkInterval: null,
    
    // Rastrear geração de PIX
    trackPixGenerated(pixData) {
      const {planId, value, pixCode, expirationTime} = pixData;
      const pixSessionId = this.generatePixSessionId();
      
      // Salvar sessão ativa
      this.activePixSessions[pixSessionId] = {
        planId,
        value,
        pixCode: this.hashPixCode(pixCode),
        startTime: Date.now(),
        expirationTime,
        checkCount: 0
      };
      
      // Eventos de geração
      TrackingCore.trackEvent('AddPaymentInfo', {
        content_ids: [planId],
        content_type: 'product',
        value: value,
        currency: 'BRL',
        payment_method: 'pix'
      });
      
      // Evento customizado
      TrackingCore.trackEvent('PixGenerated', {
        plan_id: planId,
        value: value,
        pix_session_id: pixSessionId,
        expiration_minutes: Math.floor((expirationTime - Date.now()) / 60000)
      });
      
      // Iniciar monitoramento
      this.startPixMonitoring(pixSessionId);
      
      return pixSessionId;
    },
    
    // Monitorar status do PIX
    startPixMonitoring(pixSessionId) {
      if (!this.checkInterval) {
        this.checkInterval = setInterval(() => this.checkAllPixSessions(), 10000); // 10s
      }
      
      // Monitorar saída da página
      this.setupExitTracking(pixSessionId);
    },
    
    checkAllPixSessions() {
      Object.keys(this.activePixSessions).forEach(sessionId => {
        const session = this.activePixSessions[sessionId];
        
        // Verificar expiração
        if (Date.now() > session.expirationTime) {
          this.trackPixAbandoned(sessionId, 'expired');
          delete this.activePixSessions[sessionId];
          return;
        }
        
        // Incrementar verificações
        session.checkCount++;
        
        // Verificar status no servidor
        this.checkPixStatus(sessionId);
      });
      
      // Parar monitoramento se não há sessões ativas
      if (Object.keys(this.activePixSessions).length === 0) {
        clearInterval(this.checkInterval);
        this.checkInterval = null;
      }
    },
    
    // Verificar status do pagamento
    async checkPixStatus(pixSessionId) {
      try {
        const response = await fetch('/api/pix-status', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({pixSessionId})
        });
        
        const {status} = await response.json();
        
        if (status === 'paid') {
          this.trackPixPaid(pixSessionId);
          delete this.activePixSessions[pixSessionId];
        }
      } catch(e) {
        console.error('Failed to check PIX status:', e);
      }
    },
    
    // PIX pago com sucesso
    trackPixPaid(pixSessionId) {
      const session = this.activePixSessions[pixSessionId];
      if (!session) return;
      
      const timeToPayment = Date.now() - session.startTime;
      
      TrackingCore.trackEvent('Purchase', {
        content_ids: [session.planId],
        content_type: 'product',
        value: session.value,
        currency: 'BRL',
        num_items: 1,
        payment_method: 'pix'
      });
      
      // Métricas adicionais
      TrackingCore.trackEvent('PixPaymentCompleted', {
        plan_id: session.planId,
        value: session.value,
        time_to_payment_seconds: Math.floor(timeToPayment / 1000),
        check_count: session.checkCount
      });
    },
    
    // PIX abandonado
    trackPixAbandoned(pixSessionId, reason) {
      const session = this.activePixSessions[pixSessionId];
      if (!session) return;
      
      const timeOnPage = Date.now() - session.startTime;
      
      TrackingCore.trackEvent('PixAbandoned', {
        plan_id: session.planId,
        value: session.value,
        abandonment_reason: reason,
        time_on_page_seconds: Math.floor(timeOnPage / 1000),
        checks_performed: session.checkCount
      });
      
      // Adicionar à audiência de retargeting
      this.addToRetargetingAudience(session);
    },
    
    // Rastreamento de saída
    setupExitTracking(pixSessionId) {
      const handlers = {
        beforeunload: () => {
          if (this.activePixSessions[pixSessionId]) {
            this.trackPixAbandoned(pixSessionId, 'page_exit');
          }
        },
        
        visibilitychange: () => {
          if (document.hidden && this.activePixSessions[pixSessionId]) {
            TrackingCore.trackEvent('PixPageHidden', {
              pix_session_id: pixSessionId
            });
          }
        }
      };
      
      Object.keys(handlers).forEach(event => {
        window.addEventListener(event, handlers[event]);
      });
      
      // Limpar handlers quando PIX for pago/abandonado
      this.activePixSessions[pixSessionId].cleanupHandlers = () => {
        Object.keys(handlers).forEach(event => {
          window.removeEventListener(event, handlers[event]);
        });
      };
    },
    
    // Adicionar à audiência de retargeting
    addToRetargetingAudience(session) {
      // Facebook Custom Audience
      if (typeof fbq !== 'undefined') {
        fbq('trackCustom', 'AddToRetargetingPool', {
          audience_type: 'pix_abandonment',
          plan_attempted: session.planId,
          value_attempted: session.value
        });
      }
      
      // Server-side para outras plataformas
      fetch('/api/retargeting/add', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          audience: 'pix_abandonment',
          userData: TrackingCore.state.trackingParams,
          abandonmentData: session
        }),
        keepalive: true
      });
    },
    
    // Utilities
    generatePixSessionId() {
      return `pix_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    },
    
    hashPixCode(pixCode) {
      // Hash simples para não expor código PIX completo
      return btoa(pixCode.substring(0, 10) + '...' + pixCode.substring(-10));
    }
  };
  
  window.PixTracker = PixTracker;
  
})(window);
```

## 3. telegram-bridge.js - Bridge para Rastreamento Telegram

```javascript
// telegram-bridge.js - Preservar tracking ao redirecionar para Telegram
(function(window) {
  'use strict';
  
  const TelegramBridge = {
    config: {
      botUsername: 'your_bot_username',
      serverBridgeEndpoint: '/api/telegram-bridge',
      trackingTTL: 7 * 24 * 60 * 60 * 1000 // 7 dias
    },
    
    // Preparar redirecionamento para Telegram
    prepareRedirect(buttonSource) {
      const bridgeId = this.generateBridgeId();
      const trackingData = this.collectAllTrackingData();
      
      // Salvar dados no servidor ANTES de redirecionar
      this.saveBridgeData(bridgeId, trackingData);
      
      // Disparar eventos de transição
      TrackingCore.trackEvent('TelegramRedirectInitiated', {
        source_button: buttonSource,
        bridge_id: bridgeId,
        has_click_id: !!trackingData.click_id,
        has_fbclid: !!trackingData.fbclid
      });
      
      // Construir URL do Telegram com todos os parâmetros
      const telegramUrl = this.buildTelegramUrl(bridgeId, trackingData);
      
      // Redirecionar
      window.location.href = telegramUrl;
    },
    
    // Coletar TODOS os dados de rastreamento
    collectAllTrackingData() {
      const data = {
        // Parâmetros principais
        ...TrackingCore.state.trackingParams,
        
        // IDs de sessão e usuário
        session_id: TrackingCore.state.sessionId,
        user_id: TrackingCore.state.userId,
        
        // Timestamps
        landing_timestamp: TrackingCore.state.landingTime,
        redirect_timestamp: Date.now(),
        
        // Dados da página
        source_url: window.location.href,
        referrer: document.referrer,
        
        // Device info
        user_agent: navigator.userAgent,
        screen_resolution: `${screen.width}x${screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        
        // Performance metrics
        page_load_time: performance.timing.loadEventEnd - performance.timing.navigationStart,
        time_on_site: Date.now() - TrackingCore.state.landingTime
      };
      
      return data;
    },
    
    // Salvar dados no servidor
    async saveBridgeData(bridgeId, trackingData) {
      try {
        const response = await fetch(this.config.serverBridgeEndpoint, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            action: 'save',
            bridge_id: bridgeId,
            tracking_data: trackingData,
            ttl: this.config.trackingTTL
          })
        });
        
        if (!response.ok) {
          throw new Error('Failed to save bridge data');
        }
        
        // Salvar também localmente como backup
        localStorage.setItem(`tg_bridge_${bridgeId}`, JSON.stringify(trackingData));
        
      } catch(e) {
        console.error('Failed to save bridge data:', e);
        
        // Fallback: incluir todos os dados na URL
        return this.buildTelegramUrlWithFullData(trackingData);
      }
    },
    
    // Construir URL do Telegram
    buildTelegramUrl(bridgeId, trackingData) {
      const baseUrl = `https://t.me/${this.config.botUsername}`;
      const params = new URLSearchParams();
      
      // Parâmetros essenciais
      params.set('start', bridgeId);
      
      // UTMs
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(utm => {
        if (trackingData[utm]) params.set(utm, trackingData[utm]);
      });
      
      // IDs críticos
      if (trackingData.click_id) params.set('click_id', trackingData.click_id);
      if (trackingData.fbp) params.set('fbp', trackingData.fbp);
      if (trackingData.fbc) params.set('fbc', trackingData.fbc);
      
      // Hash de verificação
      params.set('h', this.generateVerificationHash(bridgeId, trackingData));
      
      return `${baseUrl}?${params.toString()}`;
    },
    
    // URL com dados completos (fallback)
    buildTelegramUrlWithFullData(trackingData) {
      const baseUrl = `https://t.me/${this.config.botUsername}`;
      const compressedData = this.compressData(trackingData);
      
      return `${baseUrl}?start=${compressedData}`;
    },
    
    // Comprimir dados para URL
    compressData(data) {
      const jsonString = JSON.stringify(data);
      const compressed = btoa(encodeURIComponent(jsonString))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      
      return compressed;
    },
    
    // Gerar ID único da bridge
    generateBridgeId() {
      const timestamp = Date.now().toString(36);
      const random = Math.random().toString(36).substring(2, 9);
      return `br_${timestamp}_${random}`;
    },
    
    // Hash de verificação
    generateVerificationHash(bridgeId, data) {
      const string = bridgeId + JSON.stringify(data) + 'your-secret-salt';
      
      // Simple hash function
      let hash = 0;
      for (let i = 0; i < string.length; i++) {
        const char = string.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      
      return Math.abs(hash).toString(36);
    },
    
    // Webhook handler para o bot (server-side)
    async handleTelegramWebhook(updateData) {
      const userId = updateData.message?.from?.id;
      const text = updateData.message?.text;
      
      // Extrair bridge_id do comando /start
      if (text?.startsWith('/start ')) {
        const bridgeId = text.split(' ')[1];
        
        // Recuperar dados de tracking
        const trackingData = await this.retrieveBridgeData(bridgeId);
        
        if (trackingData) {
          // Associar Telegram ID aos dados de tracking
          await this.linkTelegramUser(userId, trackingData);
          
          // Disparar evento de conversão
          await this.fireTelegramConversionEvent(userId, trackingData);
        }
      }
    },
    
    // Recuperar dados salvos
    async retrieveBridgeData(bridgeId) {
      const response = await fetch(this.config.serverBridgeEndpoint, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          action: 'retrieve',
          bridge_id: bridgeId
        })
      });
      
      if (response.ok) {
        return await response.json();
      }
      
      return null;
    },
    
    // Disparar eventos de conversão via server-side
    async fireTelegramConversionEvent(telegramUserId, trackingData) {
      // Facebook CAPI
      await fetch('/api/facebook-capi', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          event_name: 'Lead',
          event_time: Math.floor(Date.now() / 1000),
          user_data: {
            fbp: trackingData.fbp,
            fbc: trackingData.fbc,
            external_id: this.hashUserId(telegramUserId)
          },
          custom_data: {
            lead_source: 'telegram_bot',
            bridge_id: trackingData.bridge_id,
            ...trackingData
          }
        })
      });
      
      // Kwai Server API
      if (trackingData.click_id) {
        await fetch('/api/kwai-conversion', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            event_type: 'LEAD',
            click_id: trackingData.click_id,
            event_time: Date.now(),
            user_id: this.hashUserId(telegramUserId)
          })
        });
      }
    },
    
    // Hash do user ID para privacidade
    hashUserId(userId) {
      return btoa(userId.toString()).replace(/=/g, '');
    }
  };
  
  window.TelegramBridge = TelegramBridge;
  
})(window);
```

## 4. conversion-optimizer.js - Otimização Avançada de Conversões

```javascript
// conversion-optimizer.js - Sistema avançado de otimização
(function(window) {
  'use strict';
  
  const ConversionOptimizer = {
    config: {
      enablePredictiveAnalytics: true,
      enableMicroConversions: true,
      enableUserScoring: true,
      scoringThresholds: {
        cold: 0,
        warm: 30,
        hot: 70,
        ready: 90
      }
    },
    
    userProfile: {
      score: 0,
      signals: [],
      microConversions: [],
      predictedLTV: 0
    },
    
    // Inicializar otimizador
    init() {
      this.loadUserProfile();
      this.setupMicroConversionTracking();
      this.initializePredictiveModel();
    },
    
    // Rastreamento de micro-conversões
    setupMicroConversionTracking() {
      // Scroll depth
      let maxScroll = 0;
      window.addEventListener('scroll', () => {
        const scrollPercent = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight * 100;
        
        if (scrollPercent > maxScroll) {
          maxScroll = scrollPercent;
          
          // Marcos importantes
          [25, 50, 75, 90, 100].forEach(milestone => {
            if (maxScroll >= milestone && !this.userProfile.microConversions.includes(`scroll_${milestone}`)) {
              this.trackMicroConversion('scroll_depth', milestone);
            }
          });
        }
      });
      
      // Tempo na página
      const timeMarks = [10, 30, 60, 120, 300]; // segundos
      timeMarks.forEach(seconds => {
        setTimeout(() => {
          this.trackMicroConversion('time_on_page', seconds);
        }, seconds * 1000);
      });
      
      // Interações
      this.trackInteractions();
      
      // Rage clicks
      this.detectRageClicks();
      
      // Hesitação
      this.detectHesitation();
    },
    
    // Rastrear micro-conversão
    trackMicroConversion(type, value) {
      const microConversion = `${type}_${value}`;
      
      if (!this.userProfile.microConversions.includes(microConversion)) {
        this.userProfile.microConversions.push(microConversion);
        
        // Atualizar score
        this.updateUserScore(type, value);
        
        // Disparar evento
        TrackingCore.trackEvent('MicroConversion', {
          conversion_type: type,
          conversion_value: value,
          user_score: this.userProfile.score,
          total_micro_conversions: this.userProfile.microConversions.length
        });
        
        // Verificar mudança de segmento
        this.checkSegmentChange();
      }
    },
    
    // Sistema de scoring
    updateUserScore(type, value) {
      const scoreRules = {
        scroll_depth: {
          25: 5,
          50: 10,
          75: 15,
          90: 20,
          100: 25
        },
        time_on_page: {
          10: 5,
          30: 10,
          60: 15,
          120: 20,
          300: 30
        },
        interaction: {
          hover_cta: 5,
          click_cta: 15,
          form_focus: 10,
          video_play: 20
        },
        intent: {
          exit_intent_shown: -10,
          rage_click: -5,
          hesitation: -5,
          return_visit: 20
        }
      };
      
      const points = scoreRules[type]?.[value] || 0;
      this.userProfile.score = Math.min(100, Math.max(0, this.userProfile.score + points));
      
      // Adicionar sinal
      this.userProfile.signals.push({
        type,
        value,
        points,
        timestamp: Date.now()
      });
      
      this.saveUserProfile();
    },
    
    // Verificar mudança de segmento
    checkSegmentChange() {
      const oldSegment = this.getUserSegment(this.userProfile.score - 10);
      const newSegment = this.getUserSegment(this.userProfile.score);
      
      if (oldSegment !== newSegment) {
        TrackingCore.trackEvent('UserSegmentChanged', {
          old_segment: oldSegment,
          new_segment: newSegment,
          user_score: this.userProfile.score,
          predicted_ltv: this.calculatePredictedLTV()
        });
        
        // Ajustar estratégia de conversão
        this.adjustConversionStrategy(newSegment);
      }
    },
    
    getUserSegment(score) {
      if (score >= this.config.scoringThresholds.ready) return 'ready_to_buy';
      if (score >= this.config.scoringThresholds.hot) return 'hot_lead';
      if (score >= this.config.scoringThresholds.warm) return 'warm_lead';
      return 'cold_lead';
    },
    
    // Ajustar estratégia baseada no segmento
    adjustConversionStrategy(segment) {
      const strategies = {
        cold_lead: () => {
          // Mostrar conteúdo educativo
          this.showEducationalContent();
        },
        warm_lead: () => {
          // Oferecer incentivo moderado
          this.showModerateIncentive();
        },
        hot_lead: () => {
          // Criar urgência
          this.createUrgency();
        },
        ready_to_buy: () => {
          // Remover fricção e facilitar compra
          this.reduceFriction();
          this.showAgressiveOffer();
        }
      };
      
      strategies[segment]?.();
    },
    
    // Detectar rage clicks
    detectRageClicks() {
      let clicks = [];
      
      document.addEventListener('click', (e) => {
        const now = Date.now();
        clicks.push({time: now, x: e.clientX, y: e.clientY});
        
        // Manter apenas cliques dos últimos 2 segundos
        clicks = clicks.filter(click => now - click.time < 2000);
        
        // Detectar rage click (3+ cliques em área pequena)
        if (clicks.length >= 3) {
          const avgX = clicks.reduce((sum, c) => sum + c.x, 0) / clicks.length;
          const avgY = clicks.reduce((sum, c) => sum + c.y, 0) / clicks.length;
          
          const isRageClick = clicks.every(click => 
            Math.abs(click.x - avgX) < 50 && Math.abs(click.y - avgY) < 50
          );
          
          if (isRageClick) {
            this.trackMicroConversion('intent', 'rage_click');
            clicks = []; // Reset
          }
        }
      });
    },
    
    // Detectar hesitação
    detectHesitation() {
      let hesitationTimer;
      
      // Monitorar hover em CTAs
      document.querySelectorAll('[data-cta], button, .btn').forEach(element => {
        element.addEventListener('mouseenter', () => {
          hesitationTimer = setTimeout(() => {
            this.trackMicroConversion('intent', 'hesitation');
          }, 3000); // 3 segundos de hover = hesitação
        });
        
        element.addEventListener('mouseleave', () => {
          clearTimeout(hesitationTimer);
        });
      });
    },
    
    // Modelo preditivo simples
    calculatePredictedLTV() {
      const factors = {
        score: this.userProfile.score * 10,
        microConversions: this.userProfile.microConversions.length * 50,
        timeOnSite: Math.min(300, (Date.now() - TrackingCore.state.landingTime) / 1000) * 2,
        hasClickId: TrackingCore.state.trackingParams.click_id ? 200 : 0,
        device: this.isMobile() ? -100 : 100
      };
      
      const ltv = Object.values(factors).reduce((sum, val) => sum + val, 0);
      this.userProfile.predictedLTV = Math.max(0, ltv);
      
      return this.userProfile.predictedLTV;
    },
    
    // Rastrear interações
    trackInteractions() {
      // Hover em CTAs
      document.querySelectorAll('[data-cta]').forEach(cta => {
        cta.addEventListener('mouseenter', () => {
          this.trackMicroConversion('interaction', 'hover_cta');
        }, {once: true});
      });
      
      // Cliques em elementos importantes
      document.addEventListener('click', (e) => {
        const target = e.target.closest('[data-track-click]');
        if (target) {
          this.trackMicroConversion('interaction', 'click_cta');
        }
      });
      
      // Foco em formulários
      document.querySelectorAll('input, textarea').forEach(input => {
        input.addEventListener('focus', () => {
          this.trackMicroConversion('interaction', 'form_focus');
        }, {once: true});
      });
    },
    
    // Helpers
    isMobile() {
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    },
    
    saveUserProfile() {
      localStorage.setItem('conversion_profile', JSON.stringify(this.userProfile));
    },
    
    loadUserProfile() {
      try {
        const saved = localStorage.getItem('conversion_profile');
        if (saved) {
          this.userProfile = JSON.parse(saved);
        }
      } catch(e) {
        console.error('Failed to load user profile:', e);
      }
    }
  };
  
  // Auto-inicializar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ConversionOptimizer.init());
  } else {
    ConversionOptimizer.init();
  }
  
  window.ConversionOptimizer = ConversionOptimizer;
  
})(window);
```

## Integração dos Scripts

```html
<!-- Ordem de carregamento otimizada -->
<script src="/js/tracking-core.js" async></script>
<script src="/js/pix-tracker.js" defer></script>
<script src="/js/telegram-bridge.js" defer></script>
<script src="/js/conversion-optimizer.js" defer></script>

<!-- Inicialização -->
<script>
document.addEventListener('DOMContentLoaded', function() {
  // Aguardar carregamento dos scripts
  const checkReady = setInterval(() => {
    if (window.TrackingCore && window.PixTracker && window.TelegramBridge && window.ConversionOptimizer) {
      clearInterval(checkReady);
      
      // Configurar pixels
      TrackingCore.config.fbPixelId = 'YOUR_FB_PIXEL';
      TrackingCore.config.kwaiPixelId = 'YOUR_KWAI_PIXEL';
      
      // Inicializar tracking
      TrackingCore.init();
      
      // Setup específico da página
      if (window.location.pathname.includes('/checkout')) {
        // Página de checkout - ativar PIX tracker
        document.querySelector('[data-pix-generate]')?.addEventListener('click', function() {
          PixTracker.trackPixGenerated({
            planId: this.dataset.planId,
            value: parseFloat(this.dataset.value),
            pixCode: generatePixCode(), // Sua função
            expirationTime: Date.now() + 30 * 60 * 1000 // 30 min
          });
        });
      }
      
      // Botões Telegram
      document.querySelectorAll('[data-telegram-redirect]').forEach(btn => {
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          TelegramBridge.prepareRedirect(this.dataset.source || 'unknown');
        });
      });
    }
  }, 100);
});
</script>
```

Este conjunto de arquivos JavaScript implementa um sistema completo e otimizado de rastreamento focado em maximizar conversões e ROAS.