function validateFbcFormat(fbc) {
  if (!fbc || typeof fbc !== 'string') {
    console.warn('[VALIDATION] _fbc ausente ou não é string:', fbc);
    return false;
  }

  // Regex para validar formato: fb.1.timestamp.fbclid
  // Exemplo válido: fb.1.1640995200.AbCdEfGhIjKlMnOp-123_456
  const fbcRegex = /^fb\.1\.\d+\.[\w-]+$/;

  const valid = fbcRegex.test(fbc.trim());
  if (!valid) {
    console.warn('[VALIDATION] _fbc com formato inválido:', fbc);
  }
  return valid;
}

function validateValue(value, { min = 0.01, max = 10000 } = {}) {
  if (value === null || value === undefined) {
    console.warn('[VALIDATION] value ausente');
    return false;
  }

  const num = Number(value);
  if (!Number.isFinite(num)) {
    console.warn('[VALIDATION] value não numérico:', value);
    return false;
  }

  if (num <= 0) {
    console.warn('[VALIDATION] value deve ser positivo:', value);
    return false;
  }

  if (num < min || num > max) {
    console.warn(
      `[VALIDATION] value fora do intervalo permitido (${min} - ${max}):`,
      value
    );
    return false;
  }

  return true;
}

function validateCurrency(currency) {
  if (!currency || typeof currency !== 'string') {
    console.warn('[VALIDATION] currency ausente ou não é string:', currency);
    return false;
  }

  const trimmed = currency.trim();
  const valid = /^[A-Za-z]{3}$/.test(trimmed);

  if (!valid) {
    console.warn('[VALIDATION] currency inválida:', currency);
  }

  return valid;
}

function isRealTrackingData(data) {
  if (!data) return false;
  const { fbp, fbc, ip, user_agent } = data;

  const validFbp = fbp && typeof fbp === 'string' && !/FALLBACK/i.test(fbp.trim());
  const validFbc = fbc && typeof fbc === 'string' && !/FALLBACK/i.test(fbc.trim()) && validateFbcFormat(fbc);

  if (!validFbp || !validFbc) {
    console.warn('[VALIDATION] Dados de tracking inválidos:', { fbp, fbc });
    return false;
  }

  const ipIsServer = ip === '127.0.0.1' || ip === '::1';
  const uaIsServer = typeof user_agent === 'string' && /^axios\//i.test(user_agent);

  if (ipIsServer || uaIsServer) {
    console.warn('[VALIDATION] Tracking data parece vir do servidor', {
      ip,
      user_agent
    });
    return false;
  }

  return true;
}

function mergeTrackingData(dadosSalvos, dadosRequisicao) {
      // Garantir que parâmetros sempre sejam objetos válidos
  dadosSalvos = dadosSalvos && typeof dadosSalvos === 'object' ? dadosSalvos : {};
  dadosRequisicao = dadosRequisicao && typeof dadosRequisicao === 'object' ? dadosRequisicao : {};

  const salvoReal = isRealTrackingData(dadosSalvos);
  const reqReal = isRealTrackingData(dadosRequisicao);

      // CORREÇÃO: Criar lógica especial para UTMs - sempre priorizar requisição atual
  const utmFields = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  const utmFromRequest = {};
  const hasNewUtms = utmFields.some(field => dadosRequisicao[field]);
  
  console.log('[DEBUG] UTMs na requisição atual:', {
    utm_source: dadosRequisicao.utm_source,
    utm_medium: dadosRequisicao.utm_medium,
    utm_campaign: dadosRequisicao.utm_campaign,
    hasNewUtms
  });

  // Se há UTMs novos na requisição, usar eles
  if (hasNewUtms) {
    utmFields.forEach(field => {
      utmFromRequest[field] = dadosRequisicao[field] || dadosSalvos[field] || null;
    });
    console.log('[DEBUG] UTMs da requisição atual detectados, priorizando-os:', utmFromRequest);
  } else {
    // Senão, usar UTMs salvos
    utmFields.forEach(field => {
      utmFromRequest[field] = dadosSalvos[field] || null;
    });
    console.log('[DEBUG] Sem UTMs novos, usando UTMs salvos:', utmFromRequest);
  }

  if (salvoReal && reqReal) {
    console.log('[DEBUG] Ambos trackingData são reais, usando dadosSalvos + UTMs da requisição');
    return { ...dadosSalvos, ...utmFromRequest };
  }

  if (salvoReal) {
    console.log('[DEBUG] Apenas dadosSalvos é real, utilizando-o + UTMs da requisição');
    return { ...dadosSalvos, ...utmFromRequest };
  }

  if (reqReal) {
    console.log('[DEBUG] Apenas dadosRequisicao é real, utilizando-o');
    return { ...dadosRequisicao, ...utmFromRequest };
  }

  console.log('[DEBUG] Nenhum trackingData é real, mesclando campo a campo');

  function isGeneric(field, value) {
    if (!value) return true;
    switch (field) {
      case 'fbp':
      case 'fbc':
        return /FALLBACK/i.test(value);
      case 'ip':
        return value === '127.0.0.1' || value === '::1';
      case 'user_agent':
        return /^axios\//i.test(value);
      default:
        return false;
    }
  }

  const campos = ['fbp', 'fbc', 'ip', 'user_agent'];
      const resultado = { ...utmFromRequest }; // CORREÇÃO: Começar com UTMs já definidos
  
  for (const campo of campos) {
    const valSalvo = dadosSalvos[campo];
    const valReq = dadosRequisicao[campo];

    if (!isGeneric(campo, valSalvo)) {
      resultado[campo] = valSalvo;
    } else if (!isGeneric(campo, valReq)) {
      resultado[campo] = valReq;
    } else {
      resultado[campo] = valSalvo || valReq || null;
    }
  }

  // 🔥 NOVO: Lógica especial para kwai_click_id - sempre preservar se existir
  if (dadosRequisicao.kwai_click_id) {
    resultado.kwai_click_id = dadosRequisicao.kwai_click_id;
    console.log('[DEBUG] kwai_click_id da requisição preservado:', dadosRequisicao.kwai_click_id);
  } else if (dadosSalvos.kwai_click_id) {
    resultado.kwai_click_id = dadosSalvos.kwai_click_id;
    console.log('[DEBUG] kwai_click_id salvo preservado:', dadosSalvos.kwai_click_id);
  }

      // PROTEÇÃO: Garantir que nunca retorne null ou undefined
  if (!resultado || typeof resultado !== 'object') {
    console.warn('[ERRO] mergeTrackingData retornou resultado inválido:', resultado);
    return {};
  }

  return resultado;
}

module.exports = {
  isRealTrackingData,
  mergeTrackingData,
  validateFbcFormat,
  validateValue,
  validateCurrency
};

