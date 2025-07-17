function isValidFbc(fbc) {
  if (!fbc || typeof fbc !== 'string') return false;
  const trimmed = fbc.trim();
  return /^fb\.1\.\d+\.[a-zA-Z0-9_-]+$/.test(trimmed);
}

function isRealTrackingData(data) {
  if (!data) return false;
  const { fbp, fbc, ip, user_agent } = data;

  const validFbp = fbp && typeof fbp === 'string' && !/FALLBACK/i.test(fbp.trim());
  const validFbc = isValidFbc(fbc);

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

  if (salvoReal && reqReal) {
    console.log('[DEBUG] Ambos trackingData são reais, usando dadosSalvos');
    return { ...dadosSalvos };
  }

  if (salvoReal) {
    console.log('[DEBUG] Apenas dadosSalvos é real, utilizando-o');
    return { ...dadosSalvos };
  }

  if (reqReal) {
    console.log('[DEBUG] Apenas dadosRequisicao é real, utilizando-o');
    return { ...dadosRequisicao };
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
  const resultado = {};
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

  return resultado;
}

module.exports = { isRealTrackingData, mergeTrackingData, isValidFbc };

