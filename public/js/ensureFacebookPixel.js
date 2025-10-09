/**
 * 🎯 CARREGADOR CENTRALIZADO DO META PIXEL
 * 
 * Objetivo: Garantir que o Meta Pixel seja carregado UMA ÚNICA VEZ em todo o funil,
 * eliminando o aviso "Multiple pixels with conflicting versions..."
 * 
 * Uso:
 *   <script src="/js/ensureFacebookPixel.js"></script>
 *   <script>
 *     ensureFacebookPixel(window.ENV.FB_PIXEL_ID, window.__USER_DATA || null);
 *   </script>
 */

(function(window) {
  'use strict';

  /**
   * Garante que o Meta Pixel seja carregado e inicializado uma única vez
   * @param {string} pixelId - ID do Pixel vindo de .env
   * @param {object|null} userData - Dados do usuário para Advanced Matching (opcional)
   */
  function ensureFacebookPixel(pixelId, userData) {
    // [AM-FIX] Sanitizar pixelId antes de qualquer uso
    const cleanPixelId = window.fbPixelUtils 
      ? window.fbPixelUtils.sanitizePixelId(pixelId)
      : (pixelId || '').toString().trim().replace(/^['"]+|['"]+$/g, '');
    
    console.debug('[AM-FIX] ensureFacebookPixel | pixelId sanitized | before=', pixelId, 'after=', cleanPixelId);

    // 🔒 GUARDA 1: Verificar se já foi inicializado
    if (window.__PIXEL_INIT__ === true) {
      console.log('[PIXEL] ⏭️ Pixel já inicializado, pulando.');
      return;
    }

    // 🔒 GUARDA 2: Verificar se o script SDK já existe no DOM
    const existingScript = document.getElementById('fb-pixel-sdk');
    if (existingScript) {
      console.log('[PIXEL] ⏭️ Script SDK já existe no DOM, pulando injeção.');
      
      // Se fbq já existe, apenas inicializar se necessário
      if (window.fbq && typeof window.fbq === 'function') {
        if (!window.__PIXEL_INIT__) {
          initPixel(cleanPixelId, userData);
        }
      }
      return;
    }

    // 🔒 GUARDA 3: Injetar base code APENAS se fbq ainda não existe
    if (!window.fbq) {
      injectPixelBaseCode();
    }

    // ✅ Inicializar o Pixel
    initPixel(cleanPixelId, userData);
  }

  /**
   * Injeta o base code do Meta Pixel (script SDK)
   */
  function injectPixelBaseCode() {
    console.log('[PIXEL] 📦 Injetando base code do Meta Pixel...');
    
    !function(f,b,e,v,n,t,s){
      if(f.fbq)return; 
      n=f.fbq=function(){
        n.callMethod ? n.callMethod.apply(n,arguments) : n.queue.push(arguments)
      }; 
      if(!f._fbq)f._fbq=n; 
      n.push=n; 
      n.loaded=!0; 
      n.version='2.0'; 
      n.queue=[]; 
      t=b.createElement(e); 
      t.id='fb-pixel-sdk'; 
      t.async=!0; 
      t.src=v; 
      s=b.getElementsByTagName(e)[0]; 
      s.parentNode.insertBefore(t,s)
    }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    
    console.log('[PIXEL] ✅ Base code injetado com sucesso');
  }

  /**
   * Inicializa o Pixel com o ID fornecido
   */
  function initPixel(pixelId, userData) {
    if (!pixelId || typeof pixelId !== 'string' || pixelId.trim() === '') {
      console.error('[PIXEL] ❌ pixelId inválido:', pixelId);
      return;
    }

    // [AM-FIX] pixelId já vem sanitizado do ensureFacebookPixel
    const sanitizedPixelId = pixelId;
    
    if (!sanitizedPixelId) {
      console.error('[PIXEL] ❌ pixelId vazio após sanitização');
      return;
    }

    // [AM-FIX] Sanitizar userData removendo chaves de pixel
    let sanitizedUserData = null;
    let userDataSource = 'none';
    let removedPixelKeys = false;
    let removedKeys = [];

    if (userData && typeof userData === 'object') {
      // Usar helper se disponível, senão fazer manualmente
      if (window.fbPixelUtils) {
        sanitizedUserData = window.fbPixelUtils.sanitizeUserData(userData);
        removedKeys = Object.keys(userData).filter(key => !(key in sanitizedUserData));
        removedPixelKeys = removedKeys.length > 0;
      } else {
        sanitizedUserData = { ...userData };
        const forbiddenKeys = ['pixel_id', 'pixelId', 'pixelID', 'pixel-id', 'fb_pixel_id'];
        for (const key of forbiddenKeys) {
          if (sanitizedUserData[key] !== undefined) {
            delete sanitizedUserData[key];
            removedPixelKeys = true;
            removedKeys.push(key);
          }
        }
      }
      userDataSource = 'init';

      // [AM-FIX] Log userData passado via init
      console.debug(
        '[AM-FIX] init userData source=init | keys=',
        Object.keys(sanitizedUserData),
        '| removedPixelKeys=',
        removedPixelKeys,
        '| removedKeys=',
        removedKeys
      );
    }

    // Aguardar fbq estar disponível
    const maxAttempts = 20;
    let attempts = 0;

    const waitForFbq = setInterval(function() {
      attempts++;
      
      if (window.fbq && typeof window.fbq === 'function') {
        clearInterval(waitForFbq);
        
        try {
          // [AM-FIX] Inicializar o Pixel com userData sanitizado (ou undefined se não houver)
          if (sanitizedUserData && Object.keys(sanitizedUserData).length > 0) {
            fbq('init', sanitizedPixelId, sanitizedUserData);
            window.__fbUserDataSetViaInit = true; // Marcar que userData foi passado via init
          } else {
            fbq('init', sanitizedPixelId);
          }
          
          // Marcar como inicializado
          window.__PIXEL_INIT__ = true;
          
          // Log de sucesso com versão
          const version = window.fbq.version || 'unknown';
          console.log(`[PIXEL] ✅ init ${sanitizedPixelId} (v=${version}) | userData=${userDataSource}`);
          
          // Disparar evento PageView automático (se necessário)
          // fbq('track', 'PageView');
          
        } catch (error) {
          console.error('[PIXEL] ❌ Erro ao inicializar:', error);
        }
      } else if (attempts >= maxAttempts) {
        clearInterval(waitForFbq);
        console.error('[PIXEL] ❌ Timeout: fbq não disponível após', maxAttempts, 'tentativas');
      }
    }, 50);
  }

  // 📤 Exportar função global
  window.ensureFacebookPixel = ensureFacebookPixel;

  console.log('[PIXEL] 📋 ensureFacebookPixel.js carregado');

})(window);
