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

  // Captura cookies do Facebook de forma invisível
  function captureFacebookCookies() {
    const fbp = getPixelValue('fbp', '_fbp');
    const fbc = getPixelValue('fbc', '_fbc');
    
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
