/**
 * purchaseValidation.js - Validação e formatação de valores para eventos Purchase
 * 
 * Este módulo valida e formata os valores monetários dos eventos Purchase
 * garantindo consistência e conformidade com a Meta Conversions API.
 */

/**
 * Configurações de validação
 */
const PURCHASE_CONFIG = {
  // Valor mínimo em centavos (R$ 0,01)
  MIN_VALUE_CENTS: 1,
  
  // Valor máximo em centavos (R$ 10.000,00) 
  MAX_VALUE_CENTS: 1000000,
  
  // Valor padrão em caso de erro (R$ 0,01)
  DEFAULT_VALUE_CENTS: 1,
  
  // Moeda padrão
  DEFAULT_CURRENCY: 'BRL'
};

/**
 * Valida se um valor é numérico válido
 * @param {any} value - Valor a ser validado
 * @returns {boolean} True se for número válido
 */
function isValidNumber(value) {
  if (value === null || value === undefined || value === '') {
    return false;
  }
  
  // Converter para número se for string
  const num = Number(value);
  
  // Verificar se é um número válido e finito
  return !isNaN(num) && isFinite(num);
}

/**
 * Converte valor para centavos, lidando com diferentes formatos
 * @param {any} value - Valor em diferentes formatos
 * @returns {number} Valor em centavos
 */
function convertToCents(value) {
  if (!isValidNumber(value)) {
    console.warn(`Valor inválido recebido: ${value}, usando valor padrão`);
    return PURCHASE_CONFIG.DEFAULT_VALUE_CENTS;
  }
  
  let numValue = Number(value);
  
  // Se o valor já está em centavos (valores > 100), manter como está
  // Se o valor está em reais (valores <= 100), converter para centavos
  if (numValue <= 100) {
    numValue = Math.round(numValue * 100);
  } else {
    // Valor já está em centavos, apenas arredondar
    numValue = Math.round(numValue);
  }
  
  return numValue;
}

/**
 * Valida se o valor está dentro do intervalo esperado
 * @param {number} valueInCents - Valor em centavos
 * @returns {boolean} True se válido
 */
function isValueInRange(valueInCents) {
  return valueInCents >= PURCHASE_CONFIG.MIN_VALUE_CENTS && 
         valueInCents <= PURCHASE_CONFIG.MAX_VALUE_CENTS;
}

/**
 * Valida e formata o valor de um evento Purchase
 * @param {any} value - Valor a ser validado (pode ser em reais ou centavos)
 * @param {object} options - Opções de validação
 * @param {boolean} options.allowZero - Permitir valor zero (padrão: false)
 * @param {boolean} options.strictMode - Modo estrito (padrão: false)
 * @returns {object} Resultado da validação
 */
function validatePurchaseValue(value, options = {}) {
  const opts = {
    allowZero: false,
    strictMode: false,
    ...options
  };
  
      console.log(`Validando valor Purchase: ${value} (tipo: ${typeof value})`);
  
  // Verificar se é um número válido
  if (!isValidNumber(value)) {
    const error = `Valor inválido: ${value} não é um número válido`;
    console.error(`${error}`);
    
    if (opts.strictMode) {
      return {
        valid: false,
        error,
        originalValue: value,
        formattedValue: null
      };
    }
    
    // Modo permissivo: usar valor padrão
    return {
      valid: true,
      warning: error,
      originalValue: value,
      valueInCents: PURCHASE_CONFIG.DEFAULT_VALUE_CENTS,
      valueInReais: (PURCHASE_CONFIG.DEFAULT_VALUE_CENTS / 100).toFixed(2),
      formattedValue: parseFloat((PURCHASE_CONFIG.DEFAULT_VALUE_CENTS / 100).toFixed(2))
    };
  }
  
  // Converter para centavos
  const valueInCents = convertToCents(value);
  
  // Verificar se valor é zero
  if (valueInCents === 0 && !opts.allowZero) {
    const error = 'Valor zero não permitido para eventos Purchase';
    console.error(`${error}`);
    
    if (opts.strictMode) {
      return {
        valid: false,
        error,
        originalValue: value,
        formattedValue: null
      };
    }
    
    // Usar valor mínimo
    return {
      valid: true,
      warning: error,
      originalValue: value,
      valueInCents: PURCHASE_CONFIG.MIN_VALUE_CENTS,
      valueInReais: (PURCHASE_CONFIG.MIN_VALUE_CENTS / 100).toFixed(2),
      formattedValue: parseFloat((PURCHASE_CONFIG.MIN_VALUE_CENTS / 100).toFixed(2))
    };
  }
  
  // Verificar se está dentro do intervalo
  if (!isValueInRange(valueInCents)) {
    const error = `Valor fora do intervalo permitido: ${valueInCents} centavos (min: ${PURCHASE_CONFIG.MIN_VALUE_CENTS}, max: ${PURCHASE_CONFIG.MAX_VALUE_CENTS})`;
    console.error(`${error}`);
    
    if (opts.strictMode) {
      return {
        valid: false,
        error,
        originalValue: value,
        formattedValue: null
      };
    }
    
    // Ajustar para o limite mais próximo
    const adjustedValue = Math.max(
      PURCHASE_CONFIG.MIN_VALUE_CENTS,
      Math.min(valueInCents, PURCHASE_CONFIG.MAX_VALUE_CENTS)
    );
    
    return {
      valid: true,
      warning: error,
      originalValue: value,
      valueInCents: adjustedValue,
      valueInReais: (adjustedValue / 100).toFixed(2),
      formattedValue: parseFloat((adjustedValue / 100).toFixed(2))
    };
  }
  
  // Valor válido
  const valueInReais = (valueInCents / 100).toFixed(2);
  const formattedValue = parseFloat(valueInReais);
  
  console.log(`Valor Purchase validado: ${value} → ${formattedValue} BRL (${valueInCents} centavos)`);
  
  return {
    valid: true,
    originalValue: value,
    valueInCents,
    valueInReais,
    formattedValue
  };
}

/**
 * Valida múltiplos valores Purchase de uma vez
 * @param {Array} values - Array de valores para validar
 * @param {object} options - Opções de validação
 * @returns {object} Resultado da validação em lote
 */
function validatePurchaseValues(values, options = {}) {
  if (!Array.isArray(values)) {
    return {
      valid: false,
      error: 'Entrada deve ser um array',
      results: []
    };
  }
  
  const results = values.map((value, index) => ({
    index,
    ...validatePurchaseValue(value, options)
  }));
  
  const validResults = results.filter(r => r.valid);
  const invalidResults = results.filter(r => !r.valid);
  
  return {
    valid: invalidResults.length === 0,
    totalCount: values.length,
    validCount: validResults.length,
    invalidCount: invalidResults.length,
    results,
    validResults,
    invalidResults
  };
}

/**
 * Função utilitária para formatar valor diretamente para Facebook CAPI
 * @param {any} value - Valor a ser formatado
 * @returns {number} Valor formatado para CAPI (em reais com 2 casas decimais)
 */
function formatForCAPI(value) {
  const validation = validatePurchaseValue(value);
  
  if (!validation.valid) {
    console.warn(`Erro na validação, usando valor padrão: ${validation.error}`);
    return parseFloat((PURCHASE_CONFIG.DEFAULT_VALUE_CENTS / 100).toFixed(2));
  }
  
  return validation.formattedValue;
}

/**
 * Função para detectar se um valor está em centavos ou reais
 * @param {number} value - Valor numérico
 * @returns {string} 'cents' ou 'reais'
 */
function detectValueFormat(value) {
  if (!isValidNumber(value)) {
    return 'unknown';
  }
  
  const num = Number(value);
  
  // Heurística: valores acima de 100 provavelmente estão em centavos
  // valores até 100 provavelmente estão em reais
  return num > 100 ? 'cents' : 'reais';
}

/**
 * Configurar valores padrão (uso administrativo)
 * @param {object} newConfig - Nova configuração
 */
function configureDefaults(newConfig) {
  Object.assign(PURCHASE_CONFIG, newConfig);
  console.log('Configuração Purchase atualizada:', PURCHASE_CONFIG);
}

module.exports = {
  validatePurchaseValue,
  validatePurchaseValues,
  formatForCAPI,
  detectValueFormat,
  configureDefaults,
  isValidNumber,
  convertToCents,
  isValueInRange,
  PURCHASE_CONFIG
};