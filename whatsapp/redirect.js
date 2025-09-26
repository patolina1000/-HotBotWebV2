// Log imediato para confirmar carregamento do script
console.log('🚀 [REDIRECT] Script redirect.js carregado!');
console.log('🚀 [REDIRECT] Timestamp:', new Date().toISOString());
console.log('🚀 [REDIRECT] User Agent:', navigator.userAgent);
console.log('🚀 [REDIRECT] URL atual:', window.location.href);
console.log('🚀 [REDIRECT] Cookies disponíveis:', document.cookie);
console.log('🚀 [REDIRECT] localStorage disponível:', typeof localStorage !== 'undefined');

// Try-catch para capturar erros
try {

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
        // 🔥 CORREÇÃO: Usar regex mais robusta para cookies duplicados
        const regex = new RegExp(`(?:^|; )${variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`);
        const match = document.cookie.match(regex);
        
        if (match) {
            const cookieValue = decodeURIComponent(match[1]);
            if (cookieValue) {
                console.log(`✅ [REDIRECT] Cookie ${variant} encontrado:`, cookieValue);
                return cookieValue;
            }
        }
    }

    // 🔥 FALLBACK: Se regex falhar, tentar método de split mais robusto
    for (const variant of variants) {
        const parts = value.split(`; ${variant}=`);
        if (parts.length >= 2) {
            // Pegar a ÚLTIMA ocorrência (mais recente)
            const cookieValue = parts[parts.length - 1].split(';')[0];
            if (cookieValue && cookieValue.trim()) {
                console.log(`✅ [REDIRECT] Cookie ${variant} encontrado (fallback):`, cookieValue);
                return decodeURIComponent(cookieValue);
            }
        }
    }

    console.log(`❌ [REDIRECT] Cookie ${name} não encontrado. Variantes testadas:`, variants);
    console.log(`🔍 [REDIRECT] Cookies brutos para debug:`, document.cookie);
    return null;
}

// Função para criar cookie _fbp/_fbc se não existir
function setCookie(name, value, days = 90) {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    const expiresStr = expires.toUTCString();
    document.cookie = `${name}=${value}; expires=${expiresStr}; path=/; SameSite=Lax`;
    console.log(`🍪 [REDIRECT] Cookie ${name} criado:`, value);
}

function generateMetaId(suffix) {
    return `fb.1.${Date.now()}.${suffix}`;
}

function generateRandomMetaSuffix() {
    return Math.floor(Math.random() * 1e10);
}

// Função para salvar sessão WhatsApp com FingerprintJS
async function salvarSessaoWhatsApp(trackingData) {
    try {
        console.log('🔍 [TRACKING] Iniciando salvarSessaoWhatsApp...');
        
        // Aguardar carregamento do FingerprintJS se necessário
        let tentativas = 0;
        while (!window.FingerprintJSLoaded && tentativas < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            tentativas++;
        }
        
        if (!window.FingerprintJSLoaded) {
            console.warn('⚠️ [TRACKING] FingerprintJS não carregou a tempo, continuando sem fingerprint');
        }
        
        let fingerprint_id = null;
        
        if (window.FingerprintJSLoaded) {
            try {
                const fpPromise = import('https://openfpcdn.io/fingerprintjs/v4')
                    .then(FingerprintJS => FingerprintJS.load());
                const fp = await fpPromise;
                const result = await fp.get();
                fingerprint_id = result.visitorId;
                console.log('🔍 [TRACKING] Fingerprint ID capturado:', fingerprint_id.substring(0, 8) + '...');
            } catch (fpError) {
                console.warn('⚠️ [TRACKING] Erro ao capturar fingerprint:', fpError);
            }
        }
        
        const session_id = generateMetaId(Date.now() + Math.random().toString(36).slice(2));
        
        // Capturar UTMs da URL atual
        const urlParams = new URLSearchParams(window.location.search);
        const utms = {
            utm_source: urlParams.get('utm_source') || null,
            utm_medium: urlParams.get('utm_medium') || null,
            utm_campaign: urlParams.get('utm_campaign') || null,
            utm_content: urlParams.get('utm_content') || null,
            utm_term: urlParams.get('utm_term') || null,
            fbclid: urlParams.get('fbclid') || null
        };
        
        const payload = {
            session_id,
            ip: trackingData.ip,
            user_agent: trackingData.userAgent,
            fingerprint_id,
            utms: utms,
            fbp: trackingData.fbp,
            fbc: trackingData.fbc,
            city: trackingData.city
        };
        
        console.log('📤 [TRACKING] Enviando payload para /api/whatsapp/salvar-sessao:', {
            session_id,
            ip: trackingData.ip,
            fingerprint_id: fingerprint_id ? fingerprint_id.substring(0, 8) + '...' : null,
            utms,
            city: trackingData.city
        });
        
        const response = await fetch('/api/whatsapp/salvar-sessao', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            console.log('✅ [TRACKING] Sessão salva com fingerprint', fingerprint_id ? fingerprint_id.substring(0, 8) + '...' : 'N/A');
        } else {
            console.warn('⚠️ [TRACKING] Falha ao salvar sessão:', response.status, response.statusText);
        }
    } catch (err) {
        console.error('❌ [TRACKING] Erro ao salvar sessão WhatsApp:', err);
    }
}

async function captureTrackingData() {
    console.log('🚀 [REDIRECT] captureTrackingData() INICIADA');
    console.log('Cookies brutos:', document.cookie);

    const urlParams = new URLSearchParams(window.location.search);
    const fbclid = urlParams.get('fbclid');
    const token = urlParams.get('token');

    console.log('FBCLID da URL:', fbclid);

    let fbp = getCookie('_fbp');
    console.log('🔍 [REDIRECT] FBP do cookie:', fbp);
    if (!fbp) {
        fbp = generateMetaId(generateRandomMetaSuffix());
        setCookie('_fbp', fbp, 90); // Criar cookie _fbp
        console.log('🔄 [REDIRECT] FBP gerado como fallback:', fbp);
    }
    console.log('✅ [REDIRECT] FBP final:', fbp);

    let fbc = getCookie('_fbc');
    console.log('🔍 [REDIRECT] FBC do cookie:', fbc);
    
    // Só gerar novo _fbc se não existir cookie válido
    if (!fbc) {
        if (fbclid) {
            fbc = generateMetaId(fbclid);
            setCookie('_fbc', fbc, 90); // Criar cookie _fbc com fbclid
            console.log('🔄 [REDIRECT] FBC gerado com fbclid:', fbc);
        } else {
            fbc = generateMetaId(generateRandomMetaSuffix());
            setCookie('_fbc', fbc, 90); // Criar cookie _fbc fallback
            console.log('🔄 [REDIRECT] FBC gerado como fallback:', fbc);
        }
    } else {
        console.log('✅ [REDIRECT] Usando FBC existente do cookie:', fbc);
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

    // Sempre tentar enviar tracking, mesmo sem token (para capturar dados de sessão)
    if (token) {
        const payload = {
            token,
            trackingData: dataToPersist
        };

        try {
            console.log('📤 [REDIRECT] Enviando dados com token para backend:', payload);
            const response = await fetch('/api/whatsapp/salvar-tracking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                console.warn('⚠️ [REDIRECT] Falha ao enviar tracking com token para o backend:', response.status, response.statusText);
            } else {
                console.log('✅ [REDIRECT] Tracking com token enviado com sucesso');
            }
        } catch (requestError) {
            console.error('❌ [REDIRECT] Erro ao enviar tracking com token para o backend:', requestError);
        }
    } else {
        // Mesmo sem token, enviar dados de tracking para uma rota alternativa ou log
        console.log('ℹ️ [REDIRECT] Token não encontrado, mas dados de tracking foram capturados:', dataToPersist);
        console.log('📊 [REDIRECT] FBP capturado:', dataToPersist.fbp);
        console.log('📊 [REDIRECT] FBC capturado:', dataToPersist.fbc);
        console.log('📊 [REDIRECT] IP capturado:', dataToPersist.ip);
        console.log('📊 [REDIRECT] UserAgent capturado:', dataToPersist.userAgent ? dataToPersist.userAgent.substring(0, 50) + '...' : 'null');
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
    console.log('🎉 [REDIRECT] DOMContentLoaded - Página carregada');
    
    // Pré-carrega as imagens
    const imageResults = await preloadImages();
    
    // Verifica se o avatar carregou corretamente
    checkAvatarLoad(imageResults);
    
    // Chama a função de geolocalização imediatamente
    detectCity();

    // Aguarda 2 segundos para mostrar a animação de carregamento
    console.log('⏰ [REDIRECT] Iniciando setTimeout de 2 segundos...');
    setTimeout(async function() {
        console.log('⏰ [REDIRECT] setTimeout executado após 2 segundos');
        // Obtém o link do WhatsApp que foi injetado pelo servidor
        const zapLink = window.zapLink;
        
        console.log('🔍 [REDIRECT] zapLink encontrado:', zapLink);
        console.log('🔍 [REDIRECT] window.zapLink:', window.zapLink);

        if (zapLink) {
            console.log('✅ [REDIRECT] Executando captureTrackingData...');
            await captureTrackingData();
            console.log('✅ [REDIRECT] captureTrackingData concluído, salvando sessão...');
            
            // Salvar sessão com fingerprint antes de redirecionar
            await salvarSessaoWhatsApp(dataToPersist);
            
            console.log('✅ [REDIRECT] Sessão salva, redirecionando...');
            // Redireciona para o WhatsApp
            window.location.href = zapLink;
        } else {
            // Fallback caso não tenha o link
            console.error('❌ [REDIRECT] Link do WhatsApp não encontrado');
            document.querySelector('.loading-text').textContent = 'Erro: Link não encontrado';
        }
     }, 2000);
});

// Log imediato quando o script é executado
console.log('🎯 [REDIRECT] Script executado - DOM pronto:', document.readyState);
console.log('🔍 [REDIRECT] window.zapLink no carregamento:', window.zapLink);

} catch (error) {
    console.error('❌ [REDIRECT] Erro no script redirect.js:', error);
    console.error('❌ [REDIRECT] Stack trace:', error.stack);
}
