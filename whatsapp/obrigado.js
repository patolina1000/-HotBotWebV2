// ThumbmarkJS será carregado via CDN no HTML
// Aguarda o carregamento do ThumbmarkJS via CDN
// Updated: 2025-09-26 - Fixed ES6 import error
// Preferir import via NPM; o CDN atua como backup quando o bundler não estiver disponível.

// Log imediato para confirmar carregamento do script
console.log('🚀 [OBRIGADO] Script obrigado.js carregado!');
console.log('🚀 [OBRIGADO] Timestamp:', new Date().toISOString());
console.log('🚀 [OBRIGADO] User Agent:', navigator.userAgent);
console.log('🚀 [OBRIGADO] URL atual:', window.location.href);
console.log('🚀 [OBRIGADO] Cookies disponíveis:', document.cookie);
console.log('🚀 [OBRIGADO] localStorage disponível:', typeof localStorage !== 'undefined');

// Promise compartilhada para import assíncrono do ThumbmarkJS via NPM
let thumbmarkImportPromise = null;
let thumbmarkImportLoggedFailure = false;

function startThumbmarkImport() {
    if (!thumbmarkImportPromise) {
        thumbmarkImportPromise = import('@thumbmarkjs/thumbmarkjs')
            .then((module) => {
                const ThumbmarkFromNpm = module && module.Thumbmark ? module.Thumbmark : null;
                if (ThumbmarkFromNpm) {
                    console.log('✅ [THUMBMARK] Biblioteca carregada via NPM');
                } else {
                    console.warn('⚠️ [THUMBMARK] Módulo NPM sem constructor válido, aguardando CDN...');
                }
                return ThumbmarkFromNpm;
            })
            .catch((error) => {
                if (!thumbmarkImportLoggedFailure) {
                    console.warn('⚠️ [THUMBMARK] Falha ao importar ThumbmarkJS via NPM. Aguardando CDN como fallback...', error);
                    thumbmarkImportLoggedFailure = true;
                }
                return null;
            });
    }
    return thumbmarkImportPromise;
}

async function getThumbmarkId() {
    startThumbmarkImport();

    let thumbmarkFromNpm = null;
    if (thumbmarkImportPromise) {
        try {
            thumbmarkFromNpm = await thumbmarkImportPromise;
        } catch (error) {
            if (!thumbmarkImportLoggedFailure) {
                console.warn('⚠️ [THUMBMARK] Erro ao aguardar import NPM. Aguardando CDN como fallback...', error);
                thumbmarkImportLoggedFailure = true;
            }
            thumbmarkFromNpm = null;
        }
    }

    const maxAttempts = 20;
    const delayMs = 100;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const globalThumbmark = typeof window !== 'undefined' ? window.Thumbmark : undefined;
        console.log('ℹ️ [THUMBMARK] Disponível:', typeof window !== 'undefined' ? !!window.Thumbmark : false);

        const ThumbmarkCtor = thumbmarkFromNpm || globalThumbmark;

        if (ThumbmarkCtor) {
            try {
                const thumbmark = new ThumbmarkCtor();
                const result = await thumbmark.get();
                if (result && result.id) {
                    console.log('✅ [THUMBMARK] ID gerado:', result.id);
                    return result.id;
                }
            } catch (error) {
                console.warn(`⚠️ [THUMBMARK] Falha ao gerar ID (tentativa ${attempt + 1}/${maxAttempts}):`, error);
            }
        }

        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    console.warn('⚠️ [THUMBMARK] Timeout, usando UUID fallback');
    const fallbackId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : generateUUID();
    console.log('✅ [THUMBMARK] ID gerado:', fallbackId);
    return fallbackId;
}

// Função de geolocalização baseada na lógica do redirect.js
async function detectCity() {
    const statusTextEl = document.getElementById('status-text');
    if (!statusTextEl) return;

    try {
        // Usar a mesma API do redirect.js para consistência
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
                console.log(`✅ [OBRIGADO] Cookie ${variant} encontrado:`, cookieValue);
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
                console.log(`✅ [OBRIGADO] Cookie ${variant} encontrado (fallback):`, cookieValue);
                return decodeURIComponent(cookieValue);
            }
        }
    }

    console.log(`❌ [OBRIGADO] Cookie ${name} não encontrado. Variantes testadas:`, variants);
    return null;
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

// Função para recuperar tracking WhatsApp
async function recuperarTrackingWhatsApp(token) {
    try {
        console.log('🔍 [TRACKING] Iniciando recuperarTrackingWhatsApp para token:', token ? token.substring(0, 8) + '...' : 'N/A');
        
        const thumbmark_id = await getThumbmarkId();
        console.log('🔑 [TRACKING] Thumbmark ID utilizado:', thumbmark_id ? thumbmark_id.substring(0, 8) + '...' : null);
        
        // Capturar IP atual
        let ip = null;
        try {
            const ipRes = await fetch('https://api.ipify.org?format=json');
            const ipData = await ipRes.json();
            ip = ipData.ip;
            console.log('🌍 [TRACKING] IP capturado:', ip);
        } catch (e) {
            console.warn('⚠️ [TRACKING] Falha ao capturar IP, tentando fallback:', e);
            // Fallback: tentar outras APIs de IP
            try {
                const fallbackRes = await fetch('https://httpbin.org/ip');
                const fallbackData = await fallbackRes.json();
                ip = fallbackData.origin;
                console.log('🌍 [TRACKING] IP capturado via fallback:', ip);
            } catch (e2) {
                console.warn('⚠️ [TRACKING] Falha no fallback de IP, usando IP padrão:', e2);
                ip = '0.0.0.0'; // IP padrão para evitar erro 400
            }
        }
        
        const user_agent = navigator.userAgent;
        
        // Validar dados obrigatórios antes de enviar
        if (!ip || !user_agent) {
            console.error('❌ [TRACKING] Dados obrigatórios ausentes para recuperar tracking:', { ip, user_agent: user_agent ? 'presente' : 'ausente' });
            return null;
        }

        const payload = {
            ip,
            user_agent,
            thumbmark_id,
            token
        };
        
        console.log('📤 [TRACKING] Enviando payload para /api/whatsapp/recuperar-tracking:', {
            ip,
            thumbmark_id: thumbmark_id ? thumbmark_id.substring(0, 8) + '...' : null,
            token: token ? token.substring(0, 8) + '...' : null
        });
        
        const response = await fetch('/api/whatsapp/recuperar-tracking', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log('✅ [TRACKING] Match encontrado! UTMs:', data.utms);
            
            // Enriquecer trackingData com os dados recuperados
            if (data.fbp) {
                trackingData.fbp = data.fbp;
                console.log('🔄 [TRACKING] FBP atualizado:', data.fbp.substring(0, 20) + '...');
            }
            if (data.fbc) {
                trackingData.fbc = data.fbc;
                console.log('🔄 [TRACKING] FBC atualizado:', data.fbc.substring(0, 20) + '...');
            }
            if (data.utms) {
                trackingData.utms = data.utms;
                console.log('🔄 [TRACKING] UTMs atualizadas:', data.utms);
            }
            if (data.city) {
                trackingData.city = data.city;
                console.log('🔄 [TRACKING] Cidade atualizada:', data.city);
            }
            
            // 🔥 NOVA FUNCIONALIDADE: Disponibilizar dados globalmente para whatsapp-tracking.js
            const existingTrackingData = typeof window !== 'undefined' && window.trackingData
                ? window.trackingData
                : {};

            window.trackingData = {
                ...existingTrackingData,
                ...trackingData,
                utms: data.utms || existingTrackingData.utms || trackingData.utms || null,
                fbp: data.fbp || existingTrackingData.fbp || trackingData.fbp || null,
                fbc: data.fbc || existingTrackingData.fbc || trackingData.fbc || null,
                city: data.city || existingTrackingData.city || trackingData.city || null,
                ip: data.ip || existingTrackingData.ip || trackingData.ip || null,
                userAgent: data.userAgent || existingTrackingData.userAgent || trackingData.userAgent || null
            };
            
            console.log('🌍 [TRACKING] Dados disponibilizados globalmente:', window.trackingData);
            
            return data;
        } else {
            console.warn('⚠️ [TRACKING] Nenhum match encontrado, usando fallback localStorage/URL.');
            return null;
        }
    } catch (err) {
        console.error('❌ [TRACKING] Erro ao recuperar tracking WhatsApp:', err);
        return null;
    }
}

let trackingData = {};

function loadTrackingData() {
    try {
        const storedData = localStorage.getItem('trackingData');
        console.log('🔍 [OBRIGADO] Dados brutos do localStorage:', storedData);
        
        if (storedData) {
            trackingData = JSON.parse(storedData) || {};
            console.log('📥 [OBRIGADO] Tracking data carregado do localStorage:', trackingData);
            console.log('📥 [OBRIGADO] FBP carregado:', trackingData.fbp);
            console.log('📥 [OBRIGADO] FBC carregado:', trackingData.fbc);
        } else {
            trackingData = {};
            console.log('ℹ️ [OBRIGADO] Nenhum tracking data encontrado no localStorage.');
        }
    } catch (error) {
        console.error('❌ [OBRIGADO] Erro ao carregar tracking data do localStorage:', error);
        trackingData = {};
    }

    // Garantir que fbp e fbc nunca sejam null
    const urlParams = new URLSearchParams(window.location.search);
    const fbclid = urlParams.get('fbclid');

    // Verificar e corrigir fbp
    if (!trackingData.fbp) {
        let fbp = getCookie('_fbp');
        if (!fbp) {
            fbp = generateMetaId(generateRandomMetaSuffix());
        }
        trackingData.fbp = fbp;
        console.log('🔄 FBP corrigido com fallback:', fbp);
    }

    // Verificar e corrigir fbc - priorizar cookie existente
    if (!trackingData.fbc) {
        let fbc = getCookie('_fbc');
        console.log('🔍 [OBRIGADO] FBC do cookie atual:', fbc);
        
        if (!fbc) {
            if (fbclid) {
                fbc = generateMetaId(fbclid);
                console.log('🔄 [OBRIGADO] FBC gerado com fbclid:', fbc);
            } else {
                fbc = generateMetaId(generateRandomMetaSuffix());
                console.log('🔄 [OBRIGADO] FBC gerado como fallback:', fbc);
            }
        } else {
            console.log('✅ [OBRIGADO] Usando FBC existente do cookie:', fbc);
        }
        
        trackingData.fbc = fbc;
    }

    return trackingData;
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

// Função para simular o processo de confirmação
function showConfirmationProcess() {
    const spinner = document.querySelector('.spinner');
    const confirmationMessage = document.querySelector('.confirmation-message');
    
    // Simular diferentes etapas do processo
    const steps = [
        { delay: 2000, message: '✅ Processando seu pedido...' },
        { delay: 4000, message: '✅ Tirando a roupa...' },
        { delay: 6000, message: '✅ Tudo certo! Você receberá seu conteúdo em breve' }
    ];
    
    let currentStep = 0;
    
    function showNextStep() {
        if (currentStep < steps.length) {
            const step = steps[currentStep];
            setTimeout(() => {
                confirmationMessage.textContent = step.message;
                currentStep++;
                showNextStep();
            }, step.delay);
        } else {
            // Após o último passo, esconder o spinner
            setTimeout(() => {
                if (spinner) {
                    spinner.style.display = 'none';
                }
            }, 1000);
        }
    }
    
    showNextStep();
}

// Função para coletar sinais e enviar para o backend
async function collectAndTriggerEvents() {
    try {
        console.log('🚀 [OBRIGADO] Coletando sinais para envio ao backend...');
        
        const thumbmark_id = await getThumbmarkId();
        console.log('🔑 [TRACKING] Thumbmark ID utilizado para recuperação:', thumbmark_id ? thumbmark_id.substring(0, 8) + '...' : null);
        
        // Collect additional signals
        const screen_resolution = window.screen.width + "x" + window.screen.height;
        const hardware_concurrency = navigator.hardwareConcurrency || "unknown";
        const canvas_hash = generateCanvasHash();
        const user_agent = navigator.userAgent;
        const timestamp = Date.now();
        
        // Get purchase token from URL
        const urlParams = new URLSearchParams(window.location.search);
        const purchaseToken = urlParams.get('token') || null;
        
        // Mount sessionData object
        const sessionData = {
            thumbmark_id,
            screen_resolution,
            hardware_concurrency,
            canvas_hash,
            user_agent,
            timestamp,
            purchaseToken
        };
        
        // Debug logs showing collected signals
        console.log('📊 [OBRIGADO] Sinais coletados:', {
            thumbmark_id: thumbmark_id ? thumbmark_id.substring(0, 8) + '...' : null,
            screen_resolution,
            hardware_concurrency,
            canvas_hash: canvas_hash.substring(0, 10) + '...',
            user_agent: user_agent.substring(0, 50) + '...',
            timestamp,
            purchaseToken: purchaseToken ? purchaseToken.substring(0, 8) + '...' : null
        });
        
        // Send to backend
        console.log('📤 [OBRIGADO] Enviando dados para /api/track-obrigado...');
        const response = await fetch('/api/track-obrigado', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sessionData)
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ [OBRIGADO] Dados enviados com sucesso para /api/track-obrigado:', result);
        } else {
            console.warn('⚠️ [OBRIGADO] Falha ao enviar dados para /api/track-obrigado:', response.status, response.statusText);
            // Fallback: continue normal flow even if backend fails
            console.log('🔄 [OBRIGADO] Continuando fluxo normal mesmo com falha no backend');
        }
        
    } catch (error) {
        console.error('❌ [OBRIGADO] Erro ao coletar/enviar sinais:', error);
        // Fallback: continue normal flow even if collection fails
        console.log('🔄 [OBRIGADO] Continuando fluxo normal mesmo com erro na coleta');
    }
}

// Função para marcar token como usado
async function marcarTokenComoUsado(token) {
    try {
        console.log('📝 Marcando token como usado...');
        
        const response = await fetch('/api/whatsapp/marcar-usado', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });

        if (response.ok) {
            console.log('✅ Token marcado como usado com sucesso!');
        } else {
            console.log('⚠️ Falha ao marcar token como usado');
        }
    } catch (error) {
        console.error('❌ Erro ao marcar token como usado:', error);
    }
}

// Função para enviar evento de compra
async function enviarEventoPurchase(valor, customerData = null) {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        
        if (!token) {
            console.log('❌ Token não encontrado para envio do evento Purchase');
            return;
        }
        
        // Verificar se a função trackPurchase está disponível
        if (typeof window.whatsappTracking !== 'undefined' && typeof window.whatsappTracking.trackPurchase === 'function') {
            console.log('📊 Enviando evento Purchase para Facebook...');
            
            // Usar customerData se fornecido, senão usar dados padrão
            const customerDetails = customerData || {
                productId: 'whatsapp-premium',
                planId: 'whatsapp-premium-plan',
                produto: 'WhatsApp Premium',
                plano: 'Plano Premium WhatsApp',
                content_name: 'WhatsApp Premium Access',
                content_category: 'premium_content'
            };
            
            console.log('📊 [OBRIGADO] Dados do cliente/produto incluídos:', customerDetails);
            const sucesso = await window.whatsappTracking.trackPurchase(token, valor, customerDetails);
            
            if (sucesso) {
                console.log('✅ Evento Purchase enviado com sucesso!');
            } else {
                console.log('⚠️ Falha ao enviar evento Purchase');
            }
        } else {
            console.log('⚠️ Função trackPurchase não disponível');
        }
    } catch (error) {
        console.error('❌ Erro ao enviar evento Purchase:', error);
    }
}

// Função para verificar token via API
async function verificarToken() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    console.log(`📌 Token detectado: ${token}`);
    console.log('🔎 Tracking data disponível antes da verificação:', trackingData);

    if (!token) {
        console.log('❌ Token não encontrado');
        mostrarErro('Token não encontrado na URL.');
        return;
    }

    try {
        // Requisição POST para verificar o token
        const requestPayload = {
            token,
            fbp: trackingData?.fbp || null,
            fbc: trackingData?.fbc || null,
            user_agent: trackingData?.userAgent || null,
            ip: trackingData?.ip || null,
            city: trackingData?.city || null,
            client_timestamp: Math.floor(Date.now() / 1000),
            event_source_url: window.location.href
        };

        console.log('📦 [OBRIGADO] Payload enviado para verificação:', requestPayload);
        console.log('📦 [OBRIGADO] FBP no payload:', requestPayload.fbp);
        console.log('📦 [OBRIGADO] FBC no payload:', requestPayload.fbc);
        console.log('📦 [OBRIGADO] TrackingData completo:', trackingData);

        const response = await fetch('/api/whatsapp/verificar-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload)
        });

        let dados = {};
        try {
            dados = await response.json();
        } catch (e) {
            console.error('Erro ao processar resposta JSON:', e);
        }
        console.log('Resposta da API:', dados);

        if (!response.ok) {
            console.log('❌ Erro da API:', dados.erro || response.statusText);
            setTimeout(() => {
                mostrarErro(dados.erro || 'Erro ao acessar API');
            }, 2000);
            return;
        }

        if (dados.sucesso === true) {
            console.log('✅ Token validado com sucesso!');
            
            // Preparar dados do cliente recebidos do backend
            const customerData = {
                first_name: dados.first_name || null,
                last_name: dados.last_name || null,
                phone: dados.phone || null,
                productId: 'whatsapp-premium',
                planId: 'whatsapp-premium-plan',
                produto: 'WhatsApp Premium',
                plano: 'Plano Premium WhatsApp',
                content_name: 'WhatsApp Premium Access',
                content_category: 'premium_content'
            };
            
            console.log('📊 [OBRIGADO] Dados do cliente recebidos do backend:', {
                first_name: dados.first_name,
                last_name: dados.last_name,
                phone: dados.phone,
                valor: dados.valor
            });
            
            // Enviar evento EVENT_PURCHASE antes de redirecionar com dados reais
            await enviarEventoPurchase(dados.valor, customerData);
            
            // Marcar token como usado ANTES do redirecionamento
            await marcarTokenComoUsado(token);
            
            // Aguarda 2 segundos antes de redirecionar para o Google
            setTimeout(() => {
                window.location.href = 'https://www.google.com/?hl=pt_BR';
            }, 2000);
        } else {
            console.log('❌ Token inválido ou já utilizado');
            setTimeout(() => {
                mostrarErro('Token inválido ou já foi usado.');
            }, 2000);
        }
    } catch (error) {
        console.error('Erro ao verificar token:', error);
        setTimeout(() => {
            mostrarErro('Erro de conexão. Tente novamente.');
        }, 2000);
    }
}

// Função para mostrar conteúdo de sucesso
function mostrarSucesso() {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('conteudo').classList.remove('hidden');
    
    // Inicia o processo de confirmação
    showConfirmationProcess();
}

// Função para mostrar erro
function mostrarErro(mensagem = 'Token inválido ou já foi usado.') {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('erro').classList.remove('hidden');
    document.getElementById('erro-mensagem').textContent = mensagem;
    
    setTimeout(() => {
        // Redireciona para página de erro ou inicial
        window.location.href = '/whatsapp';
    }, 4000);
}

// Aguarda o carregamento completo da página
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🎉 [OBRIGADO] Página de agradecimento carregada');
    console.log('🎉 [OBRIGADO] Timestamp:', new Date().toISOString());
    console.log('🎉 [OBRIGADO] URL atual:', window.location.href);
    console.log('🎉 [OBRIGADO] Cookies disponíveis:', document.cookie);

    // Pré-carrega as imagens
    const imageResults = await preloadImages();
    
    // Verifica se o avatar carregou corretamente
    checkAvatarLoad(imageResults);
    
    // Chama a função de geolocalização imediatamente
    detectCity();

    // Carrega os dados de tracking do localStorage
    loadTrackingData();
    
    // Coletar sinais e enviar para o backend imediatamente
    await collectAndTriggerEvents();
    
    // Recuperar tracking do WhatsApp antes de verificar token
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    if (token) {
        console.log('🔍 [OBRIGADO] Recuperando tracking para token:', token.substring(0, 8) + '...');
        await recuperarTrackingWhatsApp(token);
    }

    // Verifica o token
    verificarToken();

    // Log de sucesso
    console.log('✅ Página de agradecimento configurada com sucesso');
});
