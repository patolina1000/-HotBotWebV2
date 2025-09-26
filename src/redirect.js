// ThumbmarkJS carregado via bundle NPM
import Thumbmark from '@thumbmarkjs/thumbmarkjs';

// Log imediato para confirmar carregamento do script
console.log('🚀 [REDIRECT] Script redirect.js carregado!');
console.log('🚀 [REDIRECT] Timestamp:', new Date().toISOString());
console.log('🚀 [REDIRECT] User Agent:', navigator.userAgent);
console.log('🚀 [REDIRECT] URL atual:', window.location.href);
console.log('🚀 [REDIRECT] Cookies disponíveis:', document.cookie);
console.log('🚀 [REDIRECT] localStorage disponível:', typeof localStorage !== 'undefined');

async function getThumbmarkId() {
    try {
        const thumbmark = new Thumbmark();
        const { id } = await thumbmark.get();
        console.log('✅ Thumbmark ID via bundle:', id);
        return id;
    } catch (error) {
        console.error('❌ [THUMBMARK] Erro ao gerar ID via bundle:', error);
        const fallbackId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : generateUUID();
        console.warn('⚠️ [THUMBMARK] UUID fallback gerado:', fallbackId);
        return fallbackId;
    }
}

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

// Helper function to generate canvas hash
function generateCanvasHash() {
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('Canvas fingerprint', 2, 2);
        return canvas.toDataURL().slice(-50); // Get last 50 chars as simple hash
    } catch (error) {
        console.warn('Canvas hash generation failed:', error);
        return 'canvas_unavailable';
    }
}

// Helper function to generate UUID fallback
function generateUUID() {
    if (crypto && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback UUID generation
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Função para salvar sessão WhatsApp
async function salvarSessaoWhatsApp(trackingData) {
    try {
        console.log('🔍 [TRACKING] Iniciando salvarSessaoWhatsApp...');
        
        const thumbmark_id = await getThumbmarkId();
        console.log('🔑 [TRACKING] Thumbmark ID utilizado:', thumbmark_id ? thumbmark_id.substring(0, 8) + '...' : null);
        
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
        
        // Collect additional signals
        const screenResolution = window.screen.width + "x" + window.screen.height;
        const hardwareConcurrency = navigator.hardwareConcurrency || "unknown";
        const canvasHash = generateCanvasHash();
        
        const payload = {
            session_id,
            ip: trackingData.ip,
            user_agent: trackingData.userAgent,
            thumbmark_id,
            utms: utms,
            fbp: trackingData.fbp,
            fbc: trackingData.fbc,
            city: trackingData.city,
            screen_resolution: screenResolution,
            hardware_concurrency: hardwareConcurrency,
            canvas_hash: canvasHash
        };
        
        console.log('📤 [TRACKING] Enviando payload para /api/track-redirect:', {
            thumbmark_id: thumbmark_id ? thumbmark_id.substring(0, 8) + '...' : null,
            ip: trackingData.ip,
            utms,
            fbclid: utms.fbclid,
            screen_resolution: screenResolution,
            hardware_concurrency: hardwareConcurrency,
            canvas_hash: canvasHash.substring(0, 10) + '...'
        });
        
        const response = await fetch('/api/track-redirect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                thumbmark_id,
                utms: utms,
                fbclid: utms.fbclid,
                ip: trackingData.ip,
                screen_resolution: screenResolution,
                hardware_concurrency: hardwareConcurrency,
                canvas_hash: canvasHash,
                user_agent: trackingData.userAgent
            })
        });
        
        if (response.ok) {
            console.log('✅ [TRACKING] Sessão salva com thumbmark', thumbmark_id ? thumbmark_id.substring(0, 8) + '...' : 'N/A');
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

    const thumbmark_id = await getThumbmarkId();
    console.log('🔑 [REDIRECT] Thumbmark ID obtido:', thumbmark_id ? thumbmark_id.substring(0, 8) + '...' : null);

    // Collect additional signals
    const screenResolution = window.screen.width + "x" + window.screen.height;
    const hardwareConcurrency = navigator.hardwareConcurrency || "unknown";
    const canvasHash = generateCanvasHash();

    const trackingData = {
        fbp,
        fbc,
        userAgent,
        thumbmark_id,
        screen_resolution: screenResolution,
        hardware_concurrency: hardwareConcurrency,
        canvas_hash: canvasHash,
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
        thumbmark_id: trackingData.thumbmark_id,
        screen_resolution: trackingData.screen_resolution,
        hardware_concurrency: trackingData.hardware_concurrency,
        canvas_hash: trackingData.canvas_hash,
        ip: trackingData.ip,
        city: trackingData.city
    };

    try {
        localStorage.setItem('trackingData', JSON.stringify(dataToPersist));
        console.log('✅ [REDIRECT] Tracking salvo no localStorage:', dataToPersist);
        console.log('✅ [REDIRECT] FBP salvo:', dataToPersist.fbp);
        console.log('✅ [REDIRECT] FBC salvo:', dataToPersist.fbc);
        console.log('✅ [REDIRECT] Thumbmark ID salvo:', dataToPersist.thumbmark_id ? dataToPersist.thumbmark_id.substring(0, 8) + '...' : null);
        console.log('✅ [REDIRECT] Screen resolution:', dataToPersist.screen_resolution);
        console.log('✅ [REDIRECT] Hardware concurrency:', dataToPersist.hardware_concurrency);
        
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
        console.log('📊 [REDIRECT] Thumbmark ID capturado:', dataToPersist.thumbmark_id ? dataToPersist.thumbmark_id.substring(0, 8) + '...' : null);
        console.log('📊 [REDIRECT] Screen resolution capturado:', dataToPersist.screen_resolution);
        console.log('📊 [REDIRECT] Hardware concurrency capturado:', dataToPersist.hardware_concurrency);
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

// Função para verificar se a página foi acessada pela rota correta
function verificarRotaCorreta() {
    // Verifica se window.zapLink foi injetado pelo servidor
    if (typeof window.zapLink === 'undefined') {
        console.warn('⚠️ [REDIRECT] window.zapLink não encontrado - página pode ter sido acessada diretamente');
        
        // Verifica se estamos no caminho correto
        const currentPath = window.location.pathname;
        const currentSearch = window.location.search;
        
        if (currentPath.includes('/redirect.html') || currentPath.endsWith('.html')) {
            console.log('🔄 [REDIRECT] Redirecionando para rota correta /whatsapp...');
            
            // Preserva os parâmetros UTM da URL atual
            const urlParams = new URLSearchParams(currentSearch);
            const newUrl = `/whatsapp${currentSearch}`;
            
            // Redireciona para a rota correta do servidor
            window.location.href = newUrl;
            return false; // Interrompe a execução
        }
    }
    return true;
}

// Aguarda o carregamento completo da página
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🎉 [REDIRECT] DOMContentLoaded - Página carregada');
    
    // Verifica se a página foi acessada pela rota correta
    if (!verificarRotaCorreta()) {
        return; // Para a execução se precisar redirecionar
    }
    
    // Pré-carrega as imagens
    const imageResults = await preloadImages();
    
    // Verifica se o avatar carregou corretamente
    checkAvatarLoad(imageResults);
    
    // Chama a função de geolocalização imediatamente
    detectCity();

    // Aguarda 3.5 segundos para mostrar a animação de carregamento e garantir tempo para o Thumbmark carregar
    console.log('⏰ [REDIRECT] Iniciando setTimeout de 3.5 segundos...');
    setTimeout(async function() {
        console.log('⏰ [REDIRECT] setTimeout executado após 3.5 segundos');
        // Obtém o link do WhatsApp que foi injetado pelo servidor
        const zapLink = window.zapLink;
        
        console.log('🔍 [REDIRECT] zapLink encontrado:', zapLink);
        console.log('🔍 [REDIRECT] window.zapLink:', window.zapLink);

        if (zapLink && zapLink !== 'undefined' && zapLink.trim() !== '') {
            console.log('✅ [REDIRECT] Executando captureTrackingData...');
            const trackingData = await captureTrackingData();
            console.log('✅ [REDIRECT] captureTrackingData concluído, salvando sessão...');

            // Salvar sessão com thumbmark antes de redirecionar
            await salvarSessaoWhatsApp(trackingData);
            
            console.log('✅ [REDIRECT] Sessão salva, redirecionando...');
            // Redireciona para o WhatsApp
            window.location.href = zapLink;
        } else {
            // Fallback caso não tenha o link
            console.error('❌ [REDIRECT] Link do WhatsApp não encontrado ou inválido');
            console.error('❌ [REDIRECT] zapLink value:', zapLink);
            console.error('❌ [REDIRECT] typeof zapLink:', typeof zapLink);
            
            // Tentar redirecionar para a rota correta uma vez como fallback
            if (!window.reloadAttempted) {
                console.log('🔄 [REDIRECT] Tentando redirecionar para rota correta...');
                window.reloadAttempted = true;
                
                // Preserva os parâmetros UTM da URL atual
                const currentSearch = window.location.search;
                const newUrl = `/whatsapp${currentSearch}`;
                
                document.querySelector('.loading-text').textContent = 'Redirecionando para rota correta...';
                setTimeout(() => {
                    window.location.href = newUrl;
                }, 1000);
            } else {
                document.querySelector('.loading-text').innerHTML = `
                    <div style="color: #ff6b6b; margin-bottom: 15px;">⚠️ Erro de Configuração</div>
                    <div style="font-size: 0.9rem; line-height: 1.4;">
                        Link do WhatsApp não encontrado.<br>
                        <strong>Acesse através da rota:</strong><br>
                        <code style="background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 4px;">/whatsapp</code>
                    </div>
                `;
                
                // Adiciona botão para tentar novamente
                setTimeout(() => {
                    const container = document.querySelector('.container');
                    const button = document.createElement('button');
                    button.textContent = 'Tentar Novamente';
                    button.style.cssText = `
                        background: #4CAF50;
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 25px;
                        font-size: 1rem;
                        font-weight: 600;
                        cursor: pointer;
                        margin-top: 20px;
                        transition: background 0.3s;
                    `;
                    button.onmouseover = () => button.style.background = '#45a049';
                    button.onmouseout = () => button.style.background = '#4CAF50';
                    button.onclick = () => {
                        const currentSearch = window.location.search;
                        window.location.href = `/whatsapp${currentSearch}`;
                    };
                    container.appendChild(button);
                }, 500);
            }
        }
    }, 3500);
});

// Log imediato quando o script é executado
console.log('🎯 [REDIRECT] Script executado - DOM pronto:', document.readyState);
console.log('🔍 [REDIRECT] window.zapLink no carregamento:', window.zapLink);

} catch (error) {
    console.error('❌ [REDIRECT] Erro no script redirect.js:', error);
    console.error('❌ [REDIRECT] Stack trace:', error.stack);
}
