/**
 * Sistema de Tracking Purchase Deduplicado para Checkout
 * Implementa eventos Facebook Purchase com deduplicação (1 Browser + 1 Server)
 * Baseado na lógica do bot TelegramBotService.js
 */

(function() {
  'use strict';

  console.log('[PURCHASE-TRACKING] Sistema de Purchase deduplicado inicializado');

  // Configuração
  const CONFIG = {
    STORAGE_KEY_PREFIX: 'purchase_sent_',
    DEDUP_TTL_MS: 24 * 60 * 60 * 1000, // 24 horas
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 1000
  };

  // Função para gerar event_id baseado no transaction_id
  function generatePurchaseEventId(transactionId) {
    if (!transactionId) {
      console.error('[PURCHASE-TRACKING] transaction_id é obrigatório para gerar event_id');
      return null;
    }
    
    // Usar crypto.subtle se disponível (mais seguro), senão usar crypto simples
    if (window.crypto && window.crypto.subtle) {
      // Implementação assíncrona com crypto.subtle
      return generateEventIdAsync(transactionId);
    } else {
      // Implementação síncrona com crypto simples
      return generateEventIdSync(transactionId);
    }
  }

  // Implementação assíncrona com crypto.subtle
  async function generateEventIdAsync(transactionId) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(`pur:${transactionId}`);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return hashHex;
    } catch (error) {
      console.warn('[PURCHASE-TRACKING] Erro com crypto.subtle, usando fallback:', error);
      return generateEventIdSync(transactionId);
    }
  }

  // Implementação síncrona com crypto simples
  function generateEventIdSync(transactionId) {
    // Implementação simples de SHA-256 para compatibilidade
    const str = `pur:${transactionId}`;
    let hash = 0;
    if (str.length === 0) return hash.toString();
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    // Converter para hex e garantir 64 caracteres
    const hex = Math.abs(hash).toString(16);
    return hex.padStart(64, '0').substring(0, 64);
  }

  // Função para verificar se Purchase já foi enviado
  function isPurchaseAlreadySent(transactionId) {
    const storageKey = CONFIG.STORAGE_KEY_PREFIX + transactionId;
    const sentData = localStorage.getItem(storageKey);
    
    if (!sentData) return false;
    
    try {
      const data = JSON.parse(sentData);
      const now = Date.now();
      
      // Verificar se ainda está dentro do TTL
      if (now - data.timestamp < CONFIG.DEDUP_TTL_MS) {
        console.log(`[PURCHASE-TRACKING] Purchase já enviado para transaction_id: ${transactionId}`);
        return true;
      } else {
        // TTL expirado, remover do storage
        localStorage.removeItem(storageKey);
        return false;
      }
    } catch (error) {
      console.error('[PURCHASE-TRACKING] Erro ao verificar Purchase enviado:', error);
      return false;
    }
  }

  // Função para marcar Purchase como enviado
  function markPurchaseAsSent(transactionId, eventId, value, currency) {
    const storageKey = CONFIG.STORAGE_KEY_PREFIX + transactionId;
    const sentData = {
      transactionId,
      eventId,
      value,
      currency,
      timestamp: Date.now(),
      source: 'browser'
    };
    
    try {
      localStorage.setItem(storageKey, JSON.stringify(sentData));
      console.log(`[PURCHASE-TRACKING] Purchase marcado como enviado: ${transactionId}`);
    } catch (error) {
      console.error('[PURCHASE-TRACKING] Erro ao marcar Purchase como enviado:', error);
    }
  }

  // Função para obter dados de tracking do usuário
  function getTrackingData() {
    const fbp = getCookie('_fbp') || localStorage.getItem('fbp');
    const fbc = getCookie('_fbc') || localStorage.getItem('fbc');
    const clientIp = localStorage.getItem('client_ip_address');
    const userAgent = navigator.userAgent;
    
    return {
      fbp,
      fbc,
      client_ip_address: clientIp,
      client_user_agent: userAgent
    };
  }

  // Função auxiliar para obter cookies
  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  // Função para gerar external_id baseado nos dados do usuário
  function generateExternalId(transactionId, fbp, clientIp) {
    const base = `${transactionId || ''}|${fbp || ''}|${clientIp || ''}`;
    
    if (window.crypto && window.crypto.subtle) {
      return generateExternalIdAsync(base);
    } else {
      return generateExternalIdSync(base);
    }
  }

  async function generateExternalIdAsync(base) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(base);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      console.warn('[PURCHASE-TRACKING] Erro com crypto.subtle para external_id, usando fallback:', error);
      return generateExternalIdSync(base);
    }
  }

  function generateExternalIdSync(base) {
    let hash = 0;
    if (base.length === 0) return hash.toString();
    
    for (let i = 0; i < base.length; i++) {
      const char = base.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    const hex = Math.abs(hash).toString(16);
    return hex.padStart(64, '0').substring(0, 64);
  }

  // Função principal para enviar evento Purchase via Pixel
  async function sendPurchasePixel(transactionId, value, currency = 'BRL', planName = 'Plano Privacy') {
    // Verificar se já foi enviado
    if (isPurchaseAlreadySent(transactionId)) {
      console.log(`[PURCHASE-TRACKING] Purchase já enviado para transaction_id: ${transactionId}`);
      return { success: false, duplicate: true };
    }

    // Gerar event_id
    const eventId = await generatePurchaseEventId(transactionId);
    if (!eventId) {
      console.error('[PURCHASE-TRACKING] Falha ao gerar event_id');
      return { success: false, error: 'Falha ao gerar event_id' };
    }

    // Obter dados de tracking
    const trackingData = getTrackingData();
    const externalId = await generateExternalId(transactionId, trackingData.fbp, trackingData.client_ip_address);

    // Preparar dados do evento
    const eventData = {
      value: value,
      currency: currency,
      eventID: eventId,
      external_id: externalId,
      fbc: trackingData.fbc,
      fbp: trackingData.fbp,
      content_name: planName,
      content_category: 'Privacy Checkout'
    };

    // Verificar se fbq está disponível
    if (typeof fbq !== 'function') {
      console.error('[PURCHASE-TRACKING] fbq não disponível');
      return { success: false, error: 'Facebook Pixel não carregado' };
    }

    try {
      // Enviar evento via Pixel
      fbq('track', 'Purchase', eventData);
      
      // Marcar como enviado
      markPurchaseAsSent(transactionId, eventId, value, currency);
      
      // Log de auditoria
      console.log('[PURCHASE-TRACKING] ✅ Purchase enviado via Pixel:', {
        event_id: eventId,
        value: value,
        currency: currency,
        fbc: trackingData.fbc ? trackingData.fbc.substring(0, 20) + '...' : 'null',
        fbp: trackingData.fbp ? trackingData.fbp.substring(0, 20) + '...' : 'null',
        external_id: externalId.substring(0, 20) + '...',
        transaction_id: transactionId
      });

      return { success: true, eventId, eventData };
    } catch (error) {
      console.error('[PURCHASE-TRACKING] Erro ao enviar Purchase via Pixel:', error);
      return { success: false, error: error.message };
    }
  }

  // Função para enviar evento Purchase via CAPI (chamada para o servidor)
  async function sendPurchaseCAPI(transactionId, value, currency = 'BRL', planName = 'Plano Privacy') {
    try {
      const trackingData = getTrackingData();
      const eventId = await generatePurchaseEventId(transactionId);
      const externalId = await generateExternalId(transactionId, trackingData.fbp, trackingData.client_ip_address);

      const payload = {
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        event_source_url: window.location.href,
        value: value,
        currency: currency,
        transaction_id: transactionId,
        source: 'browser',
        user_data: {
          external_id: externalId,
          fbp: trackingData.fbp,
          fbc: trackingData.fbc,
          client_ip_address: trackingData.client_ip_address,
          client_user_agent: trackingData.client_user_agent
        },
        custom_data: {
          content_name: planName,
          content_category: 'Privacy Checkout'
        }
      };

      const response = await fetch('/api/facebook-purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        console.log('[PURCHASE-TRACKING] ✅ Purchase enviado via CAPI:', result);
        return { success: true, result };
      } else {
        const error = await response.text();
        console.error('[PURCHASE-TRACKING] Erro ao enviar Purchase via CAPI:', error);
        return { success: false, error };
      }
    } catch (error) {
      console.error('[PURCHASE-TRACKING] Erro na requisição CAPI:', error);
      return { success: false, error: error.message };
    }
  }

  // Função principal para enviar Purchase (Pixel + CAPI)
  async function sendPurchase(transactionId, value, currency = 'BRL', planName = 'Plano Privacy') {
    console.log(`[PURCHASE-TRACKING] Iniciando envio de Purchase para transaction_id: ${transactionId}`);
    
    // Validar parâmetros obrigatórios
    if (!transactionId) {
      console.error('[PURCHASE-TRACKING] transaction_id é obrigatório');
      return { success: false, error: 'transaction_id é obrigatório' };
    }

    if (!value || value <= 0) {
      console.error('[PURCHASE-TRACKING] value deve ser maior que 0');
      return { success: false, error: 'value deve ser maior que 0' };
    }

    // Verificar se já foi enviado
    if (isPurchaseAlreadySent(transactionId)) {
      console.log(`[PURCHASE-TRACKING] Purchase já enviado para transaction_id: ${transactionId}`);
      return { success: false, duplicate: true };
    }

    const results = {
      pixel: null,
      capi: null,
      success: false
    };

    // 1. Enviar via Pixel (Browser)
    console.log('[PURCHASE-TRACKING] Enviando Purchase via Pixel...');
    results.pixel = await sendPurchasePixel(transactionId, value, currency, planName);
    
    if (results.pixel.success) {
      console.log('[PURCHASE-TRACKING] ✅ Purchase enviado via Pixel com sucesso');
    } else {
      console.error('[PURCHASE-TRACKING] ❌ Falha ao enviar Purchase via Pixel:', results.pixel.error);
    }

    // 2. Enviar via CAPI (Server)
    console.log('[PURCHASE-TRACKING] Enviando Purchase via CAPI...');
    results.capi = await sendPurchaseCAPI(transactionId, value, currency, planName);
    
    if (results.capi.success) {
      console.log('[PURCHASE-TRACKING] ✅ Purchase enviado via CAPI com sucesso');
    } else {
      console.error('[PURCHASE-TRACKING] ❌ Falha ao enviar Purchase via CAPI:', results.capi.error);
    }

    // Considerar sucesso se pelo menos um dos dois foi enviado
    results.success = results.pixel.success || results.capi.success;

    if (results.success) {
      console.log('[PURCHASE-TRACKING] ✅ Purchase enviado com sucesso (Pixel: ' + results.pixel.success + ', CAPI: ' + results.capi.success + ')');
    } else {
      console.error('[PURCHASE-TRACKING] ❌ Falha total no envio de Purchase');
    }

    return results;
  }

  // Função para limpar dados de Purchase expirados
  function cleanupExpiredPurchases() {
    const now = Date.now();
    const keysToRemove = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CONFIG.STORAGE_KEY_PREFIX)) {
        try {
          const data = JSON.parse(localStorage.getItem(key));
          if (now - data.timestamp > CONFIG.DEDUP_TTL_MS) {
            keysToRemove.push(key);
          }
        } catch (error) {
          // Dados corrompidos, remover
          keysToRemove.push(key);
        }
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    if (keysToRemove.length > 0) {
      console.log(`[PURCHASE-TRACKING] Limpeza: ${keysToRemove.length} Purchase(s) expirado(s) removido(s)`);
    }
  }

  // API pública
  window.PurchaseTracking = {
    sendPurchase,
    sendPurchasePixel,
    sendPurchaseCAPI,
    isPurchaseAlreadySent,
    cleanupExpiredPurchases,
    generatePurchaseEventId,
    getTrackingData
  };

  // Limpeza automática a cada hora
  setInterval(cleanupExpiredPurchases, 60 * 60 * 1000);

  // Limpeza inicial
  cleanupExpiredPurchases();

  console.log('[PURCHASE-TRACKING] Sistema carregado e pronto para uso');
})();
