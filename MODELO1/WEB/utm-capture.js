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
        const subdomainIndex = getSubdomainIndex(hostname);
        
        fbc = `fb.${subdomainIndex}.${Date.now()}.${fbclid}`;
        
        // ✅ CORREÇÃO: Salvar o _fbc no cookie com 90 dias de expiração
        saveValidFBC(fbc);
        
        console.log('✅ _fbc criado a partir de fbclid:', {
          hostname,
          subdomainIndex,
          fbclid: fbclid.substring(0, 20) + '...'
        });
      }
    }
    
    // Validar formato do _fbc usando função aprimorada
    if (fbc && !validateFBCFormat(fbc)) {
      console.warn('⚠️ _fbc com formato inválido rejeitado:', fbc);
      return null;
    }
    
    return fbc;
  }

  /**
   * ✅ CORREÇÃO: Determina o subdomainIndex correto conforme especificação Meta
   */
  function getSubdomainIndex(hostname) {
    const parts = hostname.split('.');
    
    if (parts.length === 1) return 0;
    if (parts.length === 2) return 1;
    if (parts.length >= 3) return 2;
    
    return 1;
  }

  /**
   * ✅ CORREÇÃO: Validação rigorosa do formato _fbc
   */
  function validateFBCFormat(fbc) {
    if (!fbc || typeof fbc !== 'string') return false;
    
    const parts = fbc.split('.');
    if (parts.length < 4 || parts[0] !== 'fb') return false;
    
    const subdomainIndex = parseInt(parts[1]);
    if (isNaN(subdomainIndex) || subdomainIndex < 0 || subdomainIndex > 2) return false;
    
    const timestamp = parseInt(parts[2]);
    if (isNaN(timestamp) || timestamp < 1000000000000 || timestamp > Date.now() + 86400000) return false;
    
    const fbclid = parts.slice(3).join('.');
    if (!fbclid || fbclid.length < 10) return false;
    
    return true;
  }

  /**
   * ✅ CORREÇÃO: Salva o _fbc no cookie com 90 dias de expiração
   */
  function saveValidFBC(fbc) {
    if (!fbc) return;
    
    try {
      const expires = new Date();
      expires.setDate(expires.getDate() + 90);
      
      document.cookie = `_fbc=${fbc};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
      console.log('✅ _fbc salvo no cookie com 90 dias de expiração');
    } catch (error) {
      console.warn('⚠️ Erro ao salvar _fbc no cookie:', error);
    }
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
