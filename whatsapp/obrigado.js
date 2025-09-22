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
async function enviarEventoPurchase(valor) {
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
            
            // 🔥 CORREÇÃO: Incluir dados de produto/plano para evitar fallback
            const customerDetails = {
                productId: 'whatsapp-premium',
                planId: 'whatsapp-premium-plan',
                produto: 'WhatsApp Premium',
                plano: 'Plano Premium WhatsApp',
                content_name: 'WhatsApp Premium Access',
                content_category: 'premium_content'
            };
            
            console.log('📊 [OBRIGADO] Dados do produto incluídos:', customerDetails);
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
        const payload = {
            token,
            fbp: (trackingData && trackingData.fbp) || null,
            fbc: (trackingData && trackingData.fbc) || null,
            user_agent: (trackingData && trackingData.userAgent) || null,
            ip: (trackingData && trackingData.ip) || null,
            city: (trackingData && trackingData.city) || null
        };

        console.log('📦 [OBRIGADO] Payload enviado para verificação:', payload);
        console.log('📦 [OBRIGADO] FBP no payload:', payload.fbp);
        console.log('📦 [OBRIGADO] FBC no payload:', payload.fbc);
        console.log('📦 [OBRIGADO] TrackingData completo:', trackingData);

        const response = await fetch('/api/whatsapp/verificar-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
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
            
            // Enviar evento EVENT_PURCHASE antes de redirecionar
            await enviarEventoPurchase(dados.valor);
            
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
        window.location.href = '/whatsapp/redirect.html';
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

    // Verifica o token
    verificarToken();

    // Log de sucesso
    console.log('✅ Página de agradecimento configurada com sucesso');
});
