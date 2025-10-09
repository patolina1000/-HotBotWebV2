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
          initPixel(pixelId, userData);
        }
      }
      return;
    }

    // 🔒 GUARDA 3: Injetar base code APENAS se fbq ainda não existe
    if (!window.fbq) {
      injectPixelBaseCode();
    }

    // ✅ Inicializar o Pixel
    initPixel(pixelId, userData);
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

    const sanitizedPixelId = pixelId.trim().replace(/^['"]+|['"]+$/g, '');
    
    if (!sanitizedPixelId) {
      console.error('[PIXEL] ❌ pixelId vazio após sanitização');
      return;
    }

    // Aguardar fbq estar disponível
    const maxAttempts = 20;
    let attempts = 0;

    const waitForFbq = setInterval(function() {
      attempts++;
      
      if (window.fbq && typeof window.fbq === 'function') {
        clearInterval(waitForFbq);
        
        try {
          // Inicializar o Pixel
          fbq('init', sanitizedPixelId, userData || null);
          
          // Marcar como inicializado
          window.__PIXEL_INIT__ = true;
          
          // Log de sucesso com versão
          const version = window.fbq.version || 'unknown';
          console.log(`[PIXEL] ✅ init ${sanitizedPixelId} (v=${version})`);
          
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
