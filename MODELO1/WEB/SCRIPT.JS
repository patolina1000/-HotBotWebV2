// =========================================
// SCRIPT.JS - Funções para UTM, Token e Pixel
// =========================================

// Função para capturar e salvar UTMs em cookies
function capturarUTMs() {
  const urlParams = new URLSearchParams(window.location.search);
  const utmParams = ['utm_source', 'utm_campaign', 'utm_medium'];
  
  utmParams.forEach(param => {
    const valor = urlParams.get(param);
    if (valor) {
      // Salva cookie com validade de 7 dias
      const dataExpiracao = new Date();
      dataExpiracao.setDate(dataExpiracao.getDate() + 7);
      document.cookie = `${param}=${valor}; path=/; expires=${dataExpiracao.toUTCString()}`;
    }
  });
}

// Função para ler cookies
function lerCookie(nome) {
  const nomeEQ = nome + "=";
  const cookies = document.cookie.split(';');
  
  for (let i = 0; i < cookies.length; i++) {
    let cookie = cookies[i];
    while (cookie.charAt(0) === ' ') {
      cookie = cookie.substring(1, cookie.length);
    }
    if (cookie.indexOf(nomeEQ) === 0) {
      return cookie.substring(nomeEQ.length, cookie.length);
    }
  }
  return null;
}

// Função para verificar token e processar página de obrigado
function verificarToken() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const valor = urlParams.get('valor');
  
  // Se não tem token, redireciona para página de expirado
  if (!token) {
    window.location.href = 'expirado.html';
    return;
  }
  
  // Verifica se o token é válido no backend
  fetch(`https://seudominio.com/verify-token?token=${token}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Token inválido');
      }
      return response.json();
    })
    .then(data => {
      if (data.valid) {
        // Token válido - mostra conteúdo e gera botão
        mostrarConteudo(token, valor);
        dispararEventoCompra(valor);
      } else {
        // Token inválido - redireciona
        window.location.href = 'expirado.html';
      }
    })
    .catch(error => {
      console.error('Erro ao verificar token:', error);
      document.getElementById('erro').style.display = 'block';
      setTimeout(() => {
        window.location.href = 'expirado.html';
      }, 3000);
    });
}

// Função para mostrar conteúdo na página de obrigado
function mostrarConteudo(token, valor) {
  const conteudoDiv = document.getElementById('conteudo');
  const botaoLink = document.querySelector('#conteudo .botao');
  
  // Atualiza o link do botão com o token
  if (botaoLink) {
    botaoLink.href = `https://conteudo.com/video.mp4?token=${token}`;
  }
  
  // Mostra o conteúdo
  conteudoDiv.style.display = 'block';
}

// Função para disparar evento de compra no Facebook Pixel
function dispararEventoCompra(valor) {
  // Recupera UTMs dos cookies
  const utmSource = lerCookie('utm_source') || 'direto';
  const utmCampaign = lerCookie('utm_campaign') || 'sem_campanha';
  const utmMedium = lerCookie('utm_medium') || 'organico';
  
  // Converte valor para número
  const valorNumerico = parseFloat(valor) || 0;
  
  // Dispara evento Purchase no Facebook Pixel
  if (typeof fbq !== 'undefined') {
    fbq('track', 'Purchase', {
      value: valorNumerico,
      currency: 'BRL',
      utm_source: utmSource,
      utm_campaign: utmCampaign,
      utm_medium: utmMedium
    });
    
    console.log('Evento Purchase disparado:', {
      value: valorNumerico,
      currency: 'BRL',
      utm_source: utmSource,
      utm_campaign: utmCampaign,
      utm_medium: utmMedium
    });
  }
}

// Função para inicializar baseado na página atual
function inicializar() {
  const pathname = window.location.pathname;
  const filename = pathname.split('/').pop();
  
  if (filename === 'index.html' || filename === '' || filename === '/') {
    // Página de boas-vindas - captura UTMs
    capturarUTMs();
  } else if (filename === 'obrigado.html') {
    // Página de obrigado - verifica token
    verificarToken();
  }
}

// Inicializa quando a página carrega
document.addEventListener('DOMContentLoaded', inicializar);

// Para compatibilidade, também executa se já carregou
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializar);
} else {
  inicializar();
}