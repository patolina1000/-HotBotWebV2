/**
 * 🎯 [AM-FIX] UTILITÁRIOS PARA SANITIZAÇÃO DO META PIXEL
 * 
 * Funções puras e reutilizáveis para sanitizar Pixel ID e userData,
 * eliminando aspas residuais e chaves proibidas que causam warnings.
 */

(function(window) {
  'use strict';

  /**
   * Sanitiza o Pixel ID removendo aspas simples/duplas residuais
   * @param {string|any} raw - Pixel ID bruto (pode vir com aspas do .env)
   * @returns {string} Pixel ID limpo
   */
  function sanitizePixelId(raw) {
    if (!raw) return raw;
    const cleaned = String(raw).trim().replace(/^['"]+|['"]+$/g, '');
    
    // [AM-FIX] Log de sanitização
    if (cleaned !== String(raw).trim()) {
      console.debug('[AM-FIX] sanitizePixelId | before=', raw, 'after=', cleaned);
    }
    
    return cleaned;
  }

  /**
   * Sanitiza userData removendo chaves de pixel proibidas e 4º argumento
   * @param {object} userData - Objeto userData original
   * @returns {object} Objeto userData sanitizado
   */
  function sanitizeUserData(userData) {
    if (!userData || typeof userData !== 'object') {
      return userData;
    }

    const sanitized = { ...userData };
    const FORBIDDEN_KEYS = [
      'pixel_id', 
      'pixelId', 
      'pixelID', 
      'pixel-id', 
      'fb_pixel_id',
      'FB_PIXEL_ID',
      'Pixel_Id'
    ];

    let removedKeys = [];
    
    // Remover chaves proibidas (case-insensitive)
    for (const key of Object.keys(sanitized)) {
      const lowerKey = key.toLowerCase();
      if (FORBIDDEN_KEYS.some(forbidden => forbidden.toLowerCase() === lowerKey)) {
        delete sanitized[key];
        removedKeys.push(key);
      }
    }

    // [AM-FIX] Log de remoção
    if (removedKeys.length > 0) {
      console.debug('[AM-FIX] sanitizeUserData | removedPixelKeys=', removedKeys);
    }

    return sanitized;
  }

  /**
   * Sanitiza argumentos de fbq('set', 'userData') removendo 4º arg e chaves proibidas
   * @param {array-like} argsLike - Arguments do fbq
   * @returns {array} Argumentos sanitizados
   */
  function sanitizeFbqSetUserDataArgs(argsLike) {
    const args = Array.from(argsLike || []);
    
    // Verificar se é fbq('set', 'userData', ...)
    if (args.length < 3 || args[0] !== 'set' || !['userData', 'user_data'].includes(args[1])) {
      return args;
    }

    const sanitizedArgs = [...args];
    let removed4thArg = false;
    
    // Remover 4º argumento se existir
    if (sanitizedArgs.length > 3) {
      sanitizedArgs.splice(3);
      removed4thArg = true;
    }

    // Sanitizar userData (3º argumento)
    if (sanitizedArgs[2] && typeof sanitizedArgs[2] === 'object') {
      const originalUserData = sanitizedArgs[2];
      sanitizedArgs[2] = sanitizeUserData(originalUserData);
    }

    // [AM-FIX] Log de sanitização
    if (removed4thArg) {
      console.debug('[AM-FIX] sanitizeFbqArgs | removed4thArg=true');
    }

    return sanitizedArgs;
  }

  // 📤 Exportar funções globalmente
  window.fbPixelUtils = {
    sanitizePixelId,
    sanitizeUserData,
    sanitizeFbqSetUserDataArgs
  };

  console.log('[AM-FIX] fbPixelUtils.js carregado');

})(window);
