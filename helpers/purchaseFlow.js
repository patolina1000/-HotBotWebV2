const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const TRACKING_UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

/**
 * Helper para geração de event_id determinístico para Purchase
 * Garante que browser e CAPI usem o mesmo event_id
 */

/**
 * Gera um event_id determinístico baseado no transaction_id
 * @param {string} transactionId - ID da transação PushinPay
 * @returns {string} Event ID no formato "pur:transaction_id"
 */
function generatePurchaseEventId(transactionId) {
  if (!transactionId || typeof transactionId !== 'string') {
    // Fallback para UUID se não houver transaction_id
    return `pur:${uuidv4()}`;
  }

  // Formato determinístico: pur:transaction_id
  const cleanTransactionId = transactionId.trim().toLowerCase();
  return `pur:${cleanTransactionId}`;
}

function normalizeTransactionId(transactionId) {
  if (!transactionId || typeof transactionId !== 'string') {
    return null;
  }

  const trimmed = transactionId.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.toLowerCase();
}

function normalizeCpf(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const digits = value.replace(/\D/g, '');
  if (!digits) {
    return null;
  }

  return digits;
}

function buildObrigadoUrl({
  frontendUrl,
  path = 'obrigado_purchase_flow.html',
  token,
  valor,
  utms = {},
  extras = {}
} = {}) {
  const rawBase = typeof frontendUrl === 'string' ? frontendUrl.trim() : '';
  const normalizedBase = rawBase.replace(/\/+$/u, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const baseUrl = normalizedBase || 'http://localhost:3000';

  const url = new URL(`${baseUrl}${normalizedPath}`);

  if (token) {
    url.searchParams.set('token', token);
  }

  if (valor !== null && valor !== undefined) {
    url.searchParams.set('valor', String(valor));
  }

  for (const field of TRACKING_UTM_FIELDS) {
    const value = utms?.[field];
    if (value) {
      url.searchParams.set(field, value);
    }
  }

  if (extras && typeof extras === 'object') {
    for (const [key, value] of Object.entries(extras)) {
      if (value !== null && value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return {
    rawBase,
    normalizedBase: baseUrl,
    normalizedUrl: url.toString()
  };
}

function extractUtmsFromSource(source = {}) {
  const utms = {};

  for (const field of TRACKING_UTM_FIELDS) {
    if (source[field]) {
      utms[field] = source[field];
    }
  }

  return utms;
}

/**
 * Hash SHA-256 para dados sensíveis conforme guideline Meta
 * @param {string} value - Valor a ser hasheado
 * @returns {string|null} Hash SHA-256 lowercase ou null se inválido
 */
function hashSha256(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }
  
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  
  return crypto.createHash('sha256').update(trimmed).digest('hex');
}

/**
 * Normaliza e hasheia email para Meta CAPI
 * @param {string} email - Email a ser normalizado
 * @returns {string|null} Email hasheado ou null
 */
function hashEmail(email) {
  if (!email || typeof email !== 'string') {
    return null;
  }
  
  // Trim, lowercase e hash
  return hashSha256(email);
}

/**
 * Normaliza telefone para E.164 e hasheia
 * @param {string} phone - Telefone a ser normalizado
 * @returns {string|null} Telefone hasheado ou null
 */
function hashPhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return null;
  }
  
  // Remover caracteres não numéricos
  let cleaned = phone.replace(/\D/g, '');
  
  // Se não começar com +, assumir Brasil (+55)
  if (!phone.startsWith('+')) {
    // Se tiver 11 dígitos (DDD + 9 dígitos), adicionar +55
    if (cleaned.length === 11) {
      cleaned = `55${cleaned}`;
    }
    // Se tiver 13 dígitos (55 + DDD + 9 dígitos), está OK
    else if (cleaned.length === 13 && cleaned.startsWith('55')) {
      // Já está correto
    }
    // Outros casos: tentar adicionar +55
    else if (cleaned.length >= 10) {
      cleaned = `55${cleaned}`;
    }
  } else {
    // Remover o + para hashear apenas números
    cleaned = cleaned.substring(1);
  }
  
  // Hash do telefone normalizado
  return hashSha256(cleaned);
}

/**
 * Normaliza CPF (remove pontuação) e hasheia para external_id
 * @param {string} cpf - CPF a ser normalizado
 * @returns {string|null} CPF hasheado ou null
 */
function hashCpf(cpf) {
  if (!cpf || typeof cpf !== 'string') {
    return null;
  }
  
  // Remover caracteres não numéricos
  const cleaned = cpf.replace(/\D/g, '');
  
  if (cleaned.length !== 11) {
    return null; // CPF inválido
  }
  
  // Hash do CPF limpo
  return hashSha256(cleaned);
}

/**
 * Separa nome completo em primeiro e último nome e hasheia
 * @param {string} fullName - Nome completo
 * @returns {{fn: string|null, ln: string|null}} Primeiro e último nome hasheados
 */
function hashName(fullName) {
  if (!fullName || typeof fullName !== 'string') {
    return { fn: null, ln: null };
  }
  
  const parts = fullName.trim().split(/\s+/);
  
  if (parts.length === 0) {
    return { fn: null, ln: null };
  }
  
  const firstName = parts[0];
  const lastName = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  
  return {
    fn: hashSha256(firstName),
    ln: hashSha256(lastName)
  };
}

/**
 * Valida email com regex simples
 * @param {string} email - Email a validar
 * @returns {boolean} True se válido
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Valida telefone (deve ter pelo menos 10 dígitos)
 * @param {string} phone - Telefone a validar
 * @returns {boolean} True se válido
 */
function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return false;
  }
  
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10;
}

module.exports = {
  generatePurchaseEventId,
  normalizeTransactionId,
  normalizeCpf,
  buildObrigadoUrl,
  extractUtmsFromSource,
  hashSha256,
  hashEmail,
  hashPhone,
  hashCpf,
  hashName,
  isValidEmail,
  isValidPhone
};
