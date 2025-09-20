// Função de geolocalização baseada na lógica do index.html
async function detectCity() {
    const statusTextEl = document.getElementById('status-text');
    if (!statusTextEl) return;
    
    try {
        // Usar a mesma API do index.html para consistência
        const response = await fetch("https://pro.ip-api.com/json/?key=R1a8D9VJfrqTqpY&fields=status,country,countryCode,region,city");
        const data = await response.json();
        
        if (data.status === "success" && data.city) {
            statusTextEl.textContent = `ONLINE AGORA · ${data.city}`;
            console.log('Cidade detectada:', data.city);
            return;
        }
    } catch (error) {
        console.log('Erro na API principal, tentando fallbacks:', error);
    }
    
    // Fallback para outras APIs se a principal falhar
    const tries = [
        {url: "https://ipinfo.io/json", parse: d => d.city},
        {url: "https://ipapi.co/json/", parse: d => !d.error ? d.city : null},
        {url: "https://geolocation-db.com/json/", parse: d => d.city && "Not found" !== d.city ? d.city : null}
    ];
    
    for (const t of tries) {
        try {
            const r = await fetch(t.url, {headers: {Accept: "application/json"}});
            if (!r.ok) continue;
            const j = await r.json();
            const c = t.parse(j);
            if (c) {
                statusTextEl.textContent = `ONLINE AGORA · ${c}`;
                console.log('Cidade detectada via fallback:', c);
                return;
            }
        } catch (e) {
            // Continua para próxima tentativa
        }
    }
    
    // Se não conseguir detectar a cidade, mantém apenas "ONLINE AGORA"
    statusTextEl.textContent = "ONLINE AGORA";
    console.log('Fallback: Cidade não detectada');
}

// Função para pré-carregar imagens
function preloadImages() {
    const images = [
        'assets/background.jpg',
        'assets/perfil.jpg'
    ];
    
    const promises = images.map(src => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                console.log(`Imagem carregada: ${src}`);
                resolve({ src, success: true });
            };
            img.onerror = () => {
                console.warn(`Falha ao carregar imagem: ${src}`);
                resolve({ src, success: false }); // Resolve mesmo com erro para não bloquear o fluxo
            };
            img.src = src;
        });
    });
    
    return Promise.all(promises);
}

// Função para verificar se o avatar carregou e aplicar fallback se necessário
function checkAvatarLoad(results) {
    const avatarEl = document.querySelector('.avatar');
    if (!avatarEl) return;
    
    const perfilResult = results.find(r => r.src === 'assets/perfil.jpg');
    if (perfilResult && !perfilResult.success) {
        console.log('Aplicando fallback para avatar');
        avatarEl.classList.add('fallback');
    }
}

// Aguarda o carregamento completo da página
document.addEventListener('DOMContentLoaded', async function() {
    // Pré-carrega as imagens
    const imageResults = await preloadImages();
    
    // Verifica se o avatar carregou corretamente
    checkAvatarLoad(imageResults);
    
    // Chama a função de geolocalização imediatamente
    detectCity();
    
    // Aguarda 2 segundos para mostrar a animação de carregamento
    setTimeout(function() {
        // Obtém o link do WhatsApp que foi injetado pelo servidor
        const zapLink = window.zapLink;
        
        if (zapLink) {
            // Redireciona para o WhatsApp
            window.location.href = zapLink;
        } else {
            // Fallback caso não tenha o link
            console.error('Link do WhatsApp não encontrado');
            document.querySelector('.loading-text').textContent = 'Erro: Link não encontrado';
        }
    }, 2000);
});
