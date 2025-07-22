function isRealTrackingData(data) {
  if (!data) return false;
  const { fbp, fbc, ip, user_agent } = data;

  const validFbp = fbp && typeof fbp === 'string' && !/FALLBACK/i.test(fbp.trim());
  const validFbc = fbc && typeof fbc === 'string' && !/FALLBACK/i.test(fbc.trim());

  if (!validFbp || !validFbc) {
    return false;
  }

  const ipIsServer = ip === '127.0.0.1' || ip === '::1';
  const uaIsServer = typeof user_agent === 'string' && /^axios\//i.test(user_agent);

  if (ipIsServer || uaIsServer) {
    return false;
  }

  return true;
}

function mergeTrackingData(dadosSalvos = {}, dadosRequisicao = {}) {
  const salvoReal = isRealTrackingData(dadosSalvos);
  const reqReal = isRealTrackingData(dadosRequisicao);

  // 🔥 CORREÇÃO: Criar lógica especial para UTMs - sempre priorizar requisição atual
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
    console.log('[DEBUG] 🔥 UTMs da requisição atual detectados, priorizando-os:', utmFromRequest);
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
  const resultado = { ...utmFromRequest }; // 🔥 CORREÇÃO: Começar com UTMs já definidos
  
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

  // 🔧 PROTEÇÃO: Garantir que nunca retorne null ou undefined
  if (!resultado || typeof resultado !== 'object') {
    console.warn('[ERRO] mergeTrackingData retornou resultado inválido:', resultado);
    return {};
  }

  return resultado;
}

module.exports = { isRealTrackingData, mergeTrackingData };

