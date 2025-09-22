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

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const variantsMap = {
        _fbp: ['_fbp', 'fbp'],
        fbp: ['_fbp', 'fbp'],
        _fbc: ['_fbc', 'fbc'],
        fbc: ['_fbc', 'fbc']
    };

    const variants = variantsMap[name] || [name];

    for (const variant of variants) {
        const parts = value.split(`; ${variant}=`);
        if (parts.length === 2) {
            const cookieValue = parts.pop().split(';').shift();
            if (cookieValue) {
                return decodeURIComponent(cookieValue);
            }
        }
    }

    return null;
}

function generateMetaId(suffix) {
    return `fb.1.${Date.now()}.${suffix}`;
}

function generateRandomMetaSuffix() {
    return Math.floor(Math.random() * 1e10);
}

async function captureTrackingData() {
    console.log('Cookies brutos:', document.cookie);

    const urlParams = new URLSearchParams(window.location.search);
    const fbclid = urlParams.get('fbclid');
    const token = urlParams.get('token');

    console.log('FBCLID da URL:', fbclid);

    let fbp = getCookie('_fbp');
    console.log('🔍 [REDIRECT] FBP do cookie:', fbp);
    if (!fbp) {
        fbp = generateMetaId(generateRandomMetaSuffix());
        console.log('🔄 [REDIRECT] FBP gerado como fallback:', fbp);
    }
    console.log('✅ [REDIRECT] FBP final:', fbp);

    let fbc = getCookie('_fbc');
    console.log('🔍 [REDIRECT] FBC do cookie:', fbc);
    if (!fbc && fbclid) {
        fbc = generateMetaId(fbclid);
        console.log('🔄 [REDIRECT] FBC gerado com fbclid:', fbc);
    }
    if (!fbc) {
        fbc = generateMetaId(generateRandomMetaSuffix());
        console.log('🔄 [REDIRECT] FBC gerado como fallback:', fbc);
    }
    console.log('✅ [REDIRECT] FBC final:', fbc);

    const userAgent = navigator.userAgent || null;
    console.log('🧭 User Agent capturado:', userAgent);

    const trackingData = {
        fbp,
        fbc,
        userAgent,
        ip: null,
        city: null
    };

    try {
        const response = await fetch("https://pro.ip-api.com/json/?key=R1a8D9VJfrqTqpY&fields=status,country,countryCode,region,city,query");
        const data = await response.json();

        if (response.ok && data.status === "success") {
            trackingData.ip = data.query || null;
            trackingData.city = data.city || null;
            console.log('🌍 Dados de geolocalização capturados:', { ip: trackingData.ip, city: trackingData.city });
        } else {
            console.warn('⚠️ Falha ao capturar dados de geolocalização:', data);
        }
    } catch (error) {
        console.error('❌ Erro ao capturar dados de geolocalização:', error);
    }

    const dataToPersist = {
        fbp: trackingData.fbp,
        fbc: trackingData.fbc,
        userAgent: trackingData.userAgent,
        ip: trackingData.ip,
        city: trackingData.city
    };

    try {
        localStorage.setItem('trackingData', JSON.stringify(dataToPersist));
        console.log('✅ [REDIRECT] Tracking salvo no localStorage:', dataToPersist);
        console.log('✅ [REDIRECT] FBP salvo:', dataToPersist.fbp);
        console.log('✅ [REDIRECT] FBC salvo:', dataToPersist.fbc);
        
        // Verificar se realmente foi salvo
        const verificacao = localStorage.getItem('trackingData');
        console.log('✅ [REDIRECT] Verificação localStorage:', verificacao);
    } catch (error) {
        console.error('❌ Erro ao salvar tracking data no localStorage:', error);
    }

    if (token) {
        const payload = {
            token,
            trackingData: dataToPersist
        };

        try {
            console.log('Dados enviados para backend:', payload);
            const response = await fetch('/api/whatsapp/salvar-tracking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                console.warn('⚠️ Falha ao enviar tracking para o backend:', response.status, response.statusText);
            }
        } catch (requestError) {
            console.error('❌ Erro ao enviar tracking para o backend:', requestError);
        }
    } else {
        console.warn('⚠️ Token não encontrado na URL, envio ao backend não realizado.');
    }

    return dataToPersist;
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

    // Aguarda 5 segundos para mostrar a animação de carregamento
    setTimeout(async function() {
        // Obtém o link do WhatsApp que foi injetado pelo servidor
        const zapLink = window.zapLink;

        if (zapLink) {
            await captureTrackingData();
            // Redireciona para o WhatsApp
            window.location.href = zapLink;
        } else {
            // Fallback caso não tenha o link
            console.error('Link do WhatsApp não encontrado');
            document.querySelector('.loading-text').textContent = 'Erro: Link não encontrado';
        }
    }, 5000);
});
