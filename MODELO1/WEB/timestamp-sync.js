/**
 * 🔥 SINCRONIZAÇÃO DE TIMESTAMP PARA DEDUPLICAÇÃO PERFEITA
 * 
 * Este arquivo resolve o problema de delay entre eventos do Facebook Pixel (navegador)
 * e Meta Conversions API (servidor) garantindo que ambos usem o mesmo timestamp.
 * 
 * PROBLEMA RESOLVIDO:
 * - Delay de 1+ minuto entre eventos do pixel e CAPI
 * - Eventos aparecem como "Processado" duas vezes no Events Manager
 * - Falha na deduplicação por diferença de timestamp
 * 
 * SOLUÇÃO:
 * 1. Capturar timestamp no momento exato do evento no navegador
 * 2. Sincronizar com o servidor antes de enviar evento CAPI
 * 3. Usar o mesmo timestamp em ambos os eventos
 */

// 🔥 FUNÇÃO PRINCIPAL: Sincronizar timestamp com servidor
async function syncTimestampWithServer(token, eventTimestamp = null) {
  try {
    // Usar timestamp fornecido ou capturar timestamp atual do navegador
    const clientTimestamp = eventTimestamp || Math.floor(Date.now() / 1000);
    
    console.log(`🕐 Sincronizando timestamp com servidor | Token: ${token} | Timestamp: ${clientTimestamp}`);
    
    const response = await fetch('/api/sync-timestamp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token: token,
        client_timestamp: clientTimestamp
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (result.success) {
      console.log(`✅ Timestamp sincronizado com sucesso`);
      console.log(`📊 Diferença servidor/cliente: ${result.diff_seconds}s`);
      console.log(`🕐 Timestamp cliente: ${result.client_timestamp}`);
      console.log(`🕐 Timestamp servidor: ${result.server_timestamp}`);
      
      return {
        success: true,
        clientTimestamp: result.client_timestamp,
        serverTimestamp: result.server_timestamp,
        diffSeconds: result.diff_seconds
      };
    } else {
      throw new Error(result.error || 'Erro desconhecido na sincronização');
    }
    
  } catch (error) {
    console.error('❌ Erro ao sincronizar timestamp:', error);
    return {
      success: false,
      error: error.message,
      clientTimestamp: eventTimestamp || Math.floor(Date.now() / 1000)
    };
  }
}

// 🔥 FUNÇÃO: Disparar evento Purchase com timestamp sincronizado
async function dispararPurchaseComTimestampSincronizado(token, valorNumerico, dadosEvento = {}) {
  try {
    // 1. Capturar timestamp EXATO do momento do evento
    const eventoTimestamp = Math.floor(Date.now() / 1000);
    console.log(`🕐 Timestamp capturado no momento do evento: ${eventoTimestamp}`);
    
    // 2. Sincronizar timestamp com servidor ANTES de enviar eventos
    const syncResult = await syncTimestampWithServer(token, eventoTimestamp);
    
    // 3. Preparar dados do evento com timestamp sincronizado
    /**
     * Captura _fbc seguindo especificação do Meta Conversions API
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

    const fbp = getCookie('_fbp');
    const fbc = getValidFBC(); // Usar função corrigida
    
    if (!fbp && !fbc) {
      console.warn('⚠️ Cookies _fbp/_fbc ausentes; Purchase não será enviado');
      return { success: false, error: 'Cookies Facebook ausentes' };
    }
    
    // 4. Verificar se Facebook Pixel está disponível
    if (typeof fbq === 'undefined') {
      console.error('❌ Facebook Pixel não disponível - fbq não está definido');
      return { success: false, error: 'Facebook Pixel não disponível' };
    }
    
    // 5. Preparar dados do evento Purchase
    const dados = {
      value: valorNumerico,
      currency: 'BRL',
      eventID: token, // 🔥 IMPORTANTE: Usar token como eventID para deduplicação
      ...dadosEvento
    };
    
    // === COMENTAR FB TEST EVENT CODE ===
    // Adicionar test_event_code se disponível
    // if (window.fbConfig && window.fbConfig.FB_TEST_EVENT_CODE) {
    //   dados.test_event_code = window.fbConfig.FB_TEST_EVENT_CODE;
    // }
    
    // 6. Disparar evento Purchase via Facebook Pixel
    fbq('track', 'Purchase', dados);
    
    // 7. Marcar no localStorage para evitar duplicatas
    localStorage.setItem('purchase_sent_' + token, '1');
    
    console.log(`📤 Evento Purchase enviado via Pixel com timestamp sincronizado`);
    console.log(`🔑 EventID: ${token} | Valor: ${valorNumerico.toFixed(2)} | Timestamp: ${eventoTimestamp}`);
    
    // 8. Notificar backend que o Pixel foi disparado
    try {
      await fetch('/api/marcar-pixel-enviado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          token: token,
          pixel_timestamp: eventoTimestamp // 🔥 Enviar timestamp para referência
        })
      });
    } catch (e) {
      console.log('Aviso: Erro ao marcar pixel enviado:', e);
    }
    
    return {
      success: true,
      timestamp: eventoTimestamp,
      eventID: token,
      value: valorNumerico,
      syncResult: syncResult
    };
    
  } catch (error) {
    console.error('❌ Erro ao disparar Purchase com timestamp sincronizado:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// 🔥 FUNÇÃO UTILITÁRIA: Obter cookie
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

// 🔥 FUNÇÃO: Validar diferença de timestamp (debug)
function validateTimestampDiff(clientTimestamp, serverTimestamp) {
  const diff = Math.abs(serverTimestamp - clientTimestamp);
  
  if (diff > 300) { // 5 minutos
    console.warn(`⚠️ Grande diferença de timestamp detectada: ${diff}s`);
    console.log('💡 Possíveis causas: Diferença de fuso horário, clock drift, ou latência de rede');
  } else if (diff > 60) { // 1 minuto
    console.log(`ℹ️ Diferença moderada de timestamp: ${diff}s`);
  } else {
    console.log(`✅ Timestamps bem sincronizados: diferença de ${diff}s`);
  }
  
  return {
    diffSeconds: diff,
    isWellSynced: diff <= 60,
    isCritical: diff > 300
  };
}

// 🔥 FUNÇÃO: Monitorar performance da deduplicação
function monitorDeduplicationPerformance(token) {
  const startTime = Date.now();
  
  return {
    end: () => {
      const duration = Date.now() - startTime;
      console.log(`⏱️ Processo de sincronização completado em ${duration}ms | Token: ${token}`);
      
      if (duration > 5000) {
        console.warn('⚠️ Sincronização demorou mais que 5 segundos - verifique latência de rede');
      }
      
      return duration;
    }
  };
}

// 🔥 EXPORTAR FUNÇÕES PARA USO GLOBAL
window.FacebookTimestampSync = {
  syncTimestampWithServer,
  dispararPurchaseComTimestampSincronizado,
  validateTimestampDiff,
  monitorDeduplicationPerformance,
  getCookie
};

console.log('🔥 Facebook Timestamp Sync carregado com sucesso!');
console.log('💡 Use: FacebookTimestampSync.dispararPurchaseComTimestampSincronizado(token, valor)');