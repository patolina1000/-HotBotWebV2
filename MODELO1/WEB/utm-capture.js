(function(){
  // Captura UTMs
  const params = new URLSearchParams(window.location.search);
  const utmKeys = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'];
  utmKeys.forEach(key => {
    const value = params.get(key);
    if (value !== null) {
      localStorage.setItem(key, value);
    }
  });

  // Função para obter cookie
  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  // Função para capturar valores de pixel (_fbp, _fbc)
  function getPixelValue(lsKey, cookieName) {
    try {
      // Primeiro tenta localStorage
      const stored = localStorage.getItem(lsKey);
      if (stored) return stored;
      
      // Se não encontrou, tenta cookie
      const cookieVal = getCookie(cookieName);
      if (cookieVal) {
        localStorage.setItem(lsKey, cookieVal);
        return cookieVal;
      }
    } catch (e) {
      console.warn('Erro ao acessar storage/cookie:', e);
    }
    return null;
  }

  /**
   * Captura _fbc corretamente seguindo especificação do Meta
   */
  function getValidFBC() {
    let fbc = getCookie('_fbc');
    
    if (!fbc) {
      const fbclid = new URLSearchParams(window.location.search).get('fbclid');
      if (fbclid) {
        const hostname = window.location.hostname;
        let subdomainIndex = 1;
        if (hostname === 'com') subdomainIndex = 0;
        else if (hostname.split('.').length > 2) subdomainIndex = 2;
        
        fbc = `fb.${subdomainIndex}.${Date.now()}.${fbclid}`;
        
        // Salvar como cookie (90 dias)
        try {
          const expires = new Date();
          expires.setTime(expires.getTime() + (90 * 24 * 60 * 60 * 1000));
          document.cookie = `_fbc=${fbc};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
        } catch (e) {
          console.warn('Erro ao salvar _fbc cookie:', e);
        }
      }
    }
    
    // Validar formato
    if (fbc) {
      const parts = fbc.split('.');
      const isValid = parts.length >= 4 && 
                     parts[0] === 'fb' && 
                     !isNaN(parseInt(parts[1])) && 
                     !isNaN(parseInt(parts[2])) &&
                     parts.slice(3).join('.').length > 10;
      
      if (!isValid) {
        console.warn('⚠️ _fbc inválido:', fbc);
        return null;
      }
    }
    
    return fbc;
  }

  // Captura cookies do Facebook de forma invisível
  function captureFacebookCookies() {
    const fbp = getPixelValue('fbp', '_fbp');
    const fbc = getValidFBC(); // Usar função corrigida para _fbc
    
    // Armazena no sessionStorage para uso posterior
    if (fbp) {
      localStorage.setItem('captured_fbp', fbp);
      sessionStorage.setItem('captured_fbp', fbp);
    }
    if (fbc) {
      localStorage.setItem('captured_fbc', fbc);
      sessionStorage.setItem('captured_fbc', fbc);
    }

    // Log para debug (apenas em desenvolvimento)
    if (window.location.hostname === 'localhost' || window.location.hostname.includes('dev')) {
      console.log('Facebook cookies capturados:', { fbp, fbc });
    }

    return { fbp, fbc };
  }

  // Executa captura imediatamente
  captureFacebookCookies();

  // Reexecuta após 1 segundo para garantir que o pixel carregou
  setTimeout(captureFacebookCookies, 1000);
  
  // Reexecuta após 3 segundos como fallback
  setTimeout(captureFacebookCookies, 3000);

  // Expor função globalmente para uso na página
  window.getFacebookCookies = captureFacebookCookies;
})();
