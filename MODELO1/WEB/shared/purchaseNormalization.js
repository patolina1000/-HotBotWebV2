/**
 * Purchase Normalization Library
 * Funções de normalização de dados para eventos de Purchase
 */
(function(window) {
  'use strict';

  /**
   * Normaliza URL para event_source_url
   * Remove fragmentos e parâmetros sensíveis
   */
  function normalizeUrlForEventSource(url) {
    if (!url || typeof url !== 'string') return null;
    
    try {
      var urlObj = new URL(url);
      // Remove fragmento (#)
      urlObj.hash = '';
      // Remove parâmetros sensíveis comuns
      var sensitiveParams = ['token', 'password', 'secret', 'key', 'auth'];
      sensitiveParams.forEach(function(param) {
        urlObj.searchParams.delete(param);
      });
      return urlObj.toString();
    } catch (e) {
      return url;
    }
  }

  /**
   * Normaliza telefone
   * Remove caracteres não numéricos
   */
  function normalizePhone(phone) {
    if (!phone || typeof phone !== 'string') return null;
    
    // Remove todos os caracteres não numéricos
    var cleaned = phone.replace(/\D/g, '');
    
    if (!cleaned) return null;
    
    return cleaned;
  }

  /**
   * Normaliza email
   * Converte para lowercase e remove espaços
   */
  function normalizeEmail(email) {
    if (!email || typeof email !== 'string') return null;
    
    var cleaned = email.trim().toLowerCase();
    
    // Validação básica de email
    if (!cleaned.includes('@')) return null;
    
    return cleaned;
  }

  /**
   * Normaliza nome (firstName ou lastName)
   * Remove espaços extras e converte para lowercase
   */
  function normalizeName(name) {
    if (!name || typeof name !== 'string') return null;
    
    var cleaned = name.trim().toLowerCase();
    
    if (!cleaned) return null;
    
    return cleaned;
  }

  /**
   * Normaliza external_id (CPF)
   * Remove caracteres não numéricos
   */
  function normalizeExternalId(externalId) {
    if (!externalId || typeof externalId !== 'string') return null;
    
    // Remove todos os caracteres não numéricos
    var cleaned = externalId.replace(/\D/g, '');
    
    if (!cleaned) return null;
    
    return cleaned;
  }

  // Exportar a biblioteca
  window.PurchaseNormalization = {
    normalizeUrlForEventSource: normalizeUrlForEventSource,
    normalizePhone: normalizePhone,
    normalizeEmail: normalizeEmail,
    normalizeName: normalizeName,
    normalizeExternalId: normalizeExternalId
  };

})(window);
