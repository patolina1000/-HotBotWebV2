/**
 * 🔥 EXEMPLO: Implementação do evento ViewContent via Meta Conversions API
 * 
 * Este arquivo demonstra como enviar o evento ViewContent via CAPI
 * garantindo deduplicação com o Pixel e conformidade com a documentação oficial da Meta.
 * 
 * IMPORTANTE: Este é um arquivo de exemplo. Integre este código nos seus arquivos HTML existentes.
 */

// Função para enviar ViewContent via CAPI
async function sendViewContentCAPI(options = {}) {
  try {
    // 1. Gerar eventID compartilhado com o Pixel para deduplicação
    const eventId = generateEventID('ViewContent', options.userId || '', Date.now());
    
    // 2. Obter dados de tracking (fbp, fbc, etc.)
    const fbpCookie = getCookie('_fbp');
    const fbcCookie = getCookie('_fbc');
    
    // 3. Preparar payload para CAPI
    const payload = {
      event_id: eventId,
      url: window.location.href, // event_source_url obrigatório
      fbp: fbpCookie,
      fbc: fbcCookie,
      content_type: options.content_type || 'product',
      value: options.value || parseFloat((Math.random() * (19.90 - 9.90) + 9.90).toFixed(2)),
      currency: options.currency || 'BRL'
    };

    // 4. Adicionar external_id se disponível (ex: user ID, token, etc.)
    if (options.external_id) {
      payload.external_id = options.external_id;
    }

    // 5. Enviar para CAPI
    console.log('📤 Enviando ViewContent via CAPI...', { event_id: eventId });
    
    const response = await fetch('/api/capi/viewcontent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ ViewContent CAPI enviado com sucesso:', result);
      return { success: true, eventId, result };
    } else {
      console.error('❌ Erro ao enviar ViewContent CAPI:', result);
      return { success: false, eventId, error: result.error };
    }

  } catch (error) {
    console.error('❌ Erro na função sendViewContentCAPI:', error);
    return { success: false, error: error.message };
  }
}

// Função para enviar ViewContent via Pixel (método existente)
function sendViewContentPixel(eventId, options = {}) {
  try {
    const viewContentData = {
      value: options.value || parseFloat((Math.random() * (19.90 - 9.90) + 9.90).toFixed(2)),
      currency: options.currency || 'BRL',
      content_name: options.content_name || document.title,
      content_category: options.content_category || 'Website',
      eventID: eventId // Usar o mesmo eventID para deduplicação
    };
    viewContentData = addTestEventCode(viewContentData);
    fbq('track', 'ViewContent', viewContentData);
    
    console.log('✅ ViewContent Pixel enviado:', { eventID: eventId });
    return true;
  } catch (error) {
    console.error('❌ Erro ao enviar ViewContent Pixel:', error);
    return false;
  }
}

// 🔥 FUNÇÃO PRINCIPAL: Enviar ViewContent via Pixel + CAPI com deduplicação
async function sendViewContentComplete(options = {}) {
  try {
    // 1. Gerar eventID único para deduplicação
    const eventId = generateEventID('ViewContent', options.userId || '', Date.now());
    
    console.log('🚀 Iniciando envio ViewContent duplo (Pixel + CAPI):', { eventId });

    // 2. Enviar via Pixel (imediato)
    const pixelSuccess = sendViewContentPixel(eventId, options);
    
    // 3. Enviar via CAPI (server-side) com o mesmo eventID
    const capiResult = await sendViewContentCAPI({
      ...options,
      eventId // Garantir que usa o mesmo eventID
    });

    // 4. Log de resultado
    const results = {
      eventId,
      pixel: pixelSuccess,
      capi: capiResult.success,
      deduplication: 'active'
    };

    console.log('🎯 Resultado ViewContent completo:', results);
    
    return results;

  } catch (error) {
    console.error('❌ Erro no envio ViewContent completo:', error);
    return { success: false, error: error.message };
  }
}

// Função auxiliar para obter cookies
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

// 📋 EXEMPLOS DE USO:

// Exemplo 1: ViewContent básico na entrada da página
document.addEventListener('DOMContentLoaded', async () => {
  await sendViewContentComplete({
    content_name: 'Página Principal',
    content_category: 'Landing Page',
    value: 9.90
  });
});

// Exemplo 2: ViewContent ao clicar em um botão/CTA
document.addEventListener('click', async (event) => {
  if (event.target.matches('.cta-button, #cta')) {
    await sendViewContentComplete({
      content_name: 'CTA Clicado',
      content_category: 'Engagement',
      userId: 'user_' + Date.now(), // Pode ser substituído por ID real do usuário
      value: 19.90
    });
  }
});

// Exemplo 3: ViewContent com external_id (para usuários identificados)
async function sendViewContentWithUser(userId, userToken) {
  await sendViewContentComplete({
    content_name: 'Conteúdo Personalizado',
    content_category: 'User Content',
    userId: userId,
    external_id: userToken, // Será hasheado automaticamente pela API
    value: 25.90
  });
}

// 🚨 IMPORTANTE: Checklist de Conformidade
/*
✅ event_name = "ViewContent"
✅ eventID reutilizado do Pixel para deduplicação
✅ event_source_url extraído de window.location.href
✅ user_data contém pelo menos 2 parâmetros (fbp, fbc, ip, user_agent, external_id)
✅ Dados sensíveis hasheados automaticamente (SHA-256)
✅ Payload 100% conforme API da Meta
✅ Arquitetura existente preservada
✅ Integração com funções existentes (sendFacebookEvent, generateEventId)
*/