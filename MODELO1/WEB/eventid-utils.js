/**
 * Utilitários para geração de eventID compartilhado entre client-side e server-side
 * Garante deduplicação correta conforme diretrizes da Meta
 */

(function() {
  'use strict';

  /**
   * Gera um UUID v4 simples para usar como eventID
   * @returns {string} UUID v4
   */
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Gera um eventID baseado em timestamp + hash para garantir unicidade
   * @param {string} eventName - Nome do evento (ex: 'ViewContent', 'AddToCart', 'Purchase')
   * @param {string} [suffix] - Sufixo opcional (ex: token, session_id)
   * @returns {string} EventID único
   */
  function generateEventId(eventName, suffix = null) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    
    if (suffix) {
      return `${eventName.toLowerCase()}-${suffix}-${timestamp}-${random}`;
    }
    
    return `${eventName.toLowerCase()}-${timestamp}-${random}`;
  }

  /**
   * Gera um eventID baseado em hash para casos específicos (ex: Purchase com token)
   * @param {string} eventName - Nome do evento
   * @param {string} token - Token único para hasheamento
   * @returns {string} EventID baseado em hash
   */
  function generateHashedEventId(eventName, token) {
    // Para Purchase, usar o token como eventID para facilitar deduplicação
    if (eventName === 'Purchase' && token) {
      return token;
    }
    
    // Para outros eventos, gerar hash baseado no token
    return generateEventId(eventName, token ? token.substring(0, 8) : null);
  }

  /**
   * Armazena eventID no sessionStorage para uso posterior
   * @param {string} eventName - Nome do evento
   * @param {string} eventId - ID do evento
   */
  function storeEventId(eventName, eventId) {
    try {
      const key = `eventId_${eventName}`;
      sessionStorage.setItem(key, eventId);
      
      // Também armazenar no localStorage como backup
      localStorage.setItem(key, eventId);
      
      console.log(`🔑 EventID armazenado: ${eventName} = ${eventId}`);
    } catch (e) {
      console.warn('Erro ao armazenar eventID:', e);
    }
  }

  /**
   * Recupera eventID armazenado
   * @param {string} eventName - Nome do evento
   * @returns {string|null} EventID armazenado ou null
   */
  function getStoredEventId(eventName) {
    try {
      const key = `eventId_${eventName}`;
      return sessionStorage.getItem(key) || localStorage.getItem(key);
    } catch (e) {
      console.warn('Erro ao recuperar eventID:', e);
      return null;
    }
  }

  /**
   * Gera e armazena eventID para um evento específico
   * @param {string} eventName - Nome do evento
   * @param {string} [token] - Token opcional para eventos específicos
   * @returns {string} EventID gerado
   */
  function createEventId(eventName, token = null) {
    let eventId;
    
    // Para Purchase, sempre usar o token se disponível
    if (eventName === 'Purchase' && token) {
      eventId = token;
    } else {
      eventId = generateEventId(eventName, token);
    }
    
    storeEventId(eventName, eventId);
    return eventId;
  }

  /**
   * Gera eventID único para ViewContent baseado na página atual
   * @returns {string} EventID para ViewContent
   */
  function createViewContentEventId() {
    const pageIdentifier = window.location.pathname.replace(/[^a-zA-Z0-9]/g, '') || 'index';
    const sessionId = sessionStorage.getItem('session_id') || generateUUID().substring(0, 8);
    
    if (!sessionStorage.getItem('session_id')) {
      sessionStorage.setItem('session_id', sessionId);
    }
    
    return generateEventId('ViewContent', `${pageIdentifier}-${sessionId}`);
  }

  /**
   * Gera eventID único para AddToCart baseado na sessão do usuário
   * @returns {string} EventID para AddToCart
   */
  function createAddToCartEventId() {
    const sessionId = sessionStorage.getItem('session_id') || generateUUID().substring(0, 8);
    const timestamp = Date.now();
    
    if (!sessionStorage.getItem('session_id')) {
      sessionStorage.setItem('session_id', sessionId);
    }
    
    return generateEventId('AddToCart', `${sessionId}-${timestamp}`);
  }

  // Expor funções globalmente
  window.EventIdUtils = {
    generateUUID,
    generateEventId,
    generateHashedEventId,
    storeEventId,
    getStoredEventId,
    createEventId,
    createViewContentEventId,
    createAddToCartEventId
  };

  console.log('✅ EventID Utils carregado - Deduplicação Facebook Pixel/CAPI ativa');
})();