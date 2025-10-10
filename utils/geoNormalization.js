const ACCENT_REGEX = /[\u0300-\u036f]/g;

// 🗺️ Mapeamento de nomes de estados brasileiros para códigos UF (2 letras)
const BR_STATE_NAME_TO_UF = {
  'acre': 'ac',
  'alagoas': 'al',
  'amapa': 'ap',
  'amazonas': 'am',
  'bahia': 'ba',
  'ceara': 'ce',
  'distrito federal': 'df',
  'espirito santo': 'es',
  'goias': 'go',
  'maranhao': 'ma',
  'mato grosso': 'mt',
  'mato grosso do sul': 'ms',
  'minas gerais': 'mg',
  'para': 'pa',
  'paraiba': 'pb',
  'parana': 'pr',
  'pernambuco': 'pe',
  'piaui': 'pi',
  'rio de janeiro': 'rj',
  'rio grande do norte': 'rn',
  'rio grande do sul': 'rs',
  'rondonia': 'ro',
  'roraima': 'rr',
  'santa catarina': 'sc',
  'sao paulo': 'sp',
  'sergipe': 'se',
  'tocantins': 'to'
};

// 🌍 Códigos UF válidos brasileiros
const VALID_BR_UF = new Set([
  'ac', 'al', 'ap', 'am', 'ba', 'ce', 'df', 'es', 'go', 'ma',
  'mt', 'ms', 'mg', 'pa', 'pb', 'pr', 'pe', 'pi', 'rj', 'rn',
  'rs', 'ro', 'rr', 'sc', 'sp', 'se', 'to'
]);

function toStringValue(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  const coerced = String(value).trim();
  return coerced || null;
}

function norm(value) {
  const stringValue = toStringValue(value);
  if (!stringValue) {
    return null;
  }

  const normalized = stringValue
    .normalize('NFD')
    .replace(ACCENT_REGEX, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');

  return normalized || null;
}

function onlyDigits(value) {
  const stringValue = toStringValue(value);
  if (!stringValue) {
    return null;
  }

  const digits = stringValue.replace(/\D+/g, '');
  return digits || null;
}

/**
 * 🏙️ Normaliza nome de cidade para o formato CAPI:
 * - lowercase
 * - remove acentos
 * - remove pontuação
 * - remove espaços
 * Exemplo: "São Paulo" → "saopaulo"
 */
function normalizeCity(city) {
  const stringValue = toStringValue(city);
  if (!stringValue) {
    return null;
  }

  const normalized = stringValue
    .normalize('NFD')
    .replace(ACCENT_REGEX, '')              // Remove acentos
    .toLowerCase()
    .replace(/[^\w\s]/g, '')                // Remove pontuação
    .replace(/\s+/g, '');                   // Remove espaços

  return normalized || null;
}

/**
 * 🗺️ Normaliza código de estado/UF para formato CAPI (2 letras lowercase):
 * - Se receber UF de 2 letras (ex: "SP"), retorna lowercase ("sp")
 * - Se receber nome completo (ex: "São Paulo"), mapeia para UF ("sp")
 * - Valida se é UF brasileiro válido
 */
function normalizeState(stateValue, countryCode = 'BR') {
  const stringValue = toStringValue(stateValue);
  if (!stringValue) {
    return null;
  }

  // Normalizar para lowercase sem acentos
  const normalized = stringValue
    .normalize('NFD')
    .replace(ACCENT_REGEX, '')
    .toLowerCase()
    .trim();

  // Se já é um código de 2 letras e é válido para BR, retornar
  if (normalized.length === 2 && VALID_BR_UF.has(normalized)) {
    return normalized;
  }

  // Se é nome de estado brasileiro, mapear para UF
  if (countryCode.toUpperCase() === 'BR' && BR_STATE_NAME_TO_UF[normalized]) {
    return BR_STATE_NAME_TO_UF[normalized];
  }

  // Se tem mais de 2 caracteres mas não está no mapa, não enviar
  if (normalized.length > 2) {
    return null;
  }

  // Para outros países, retornar os primeiros 2 caracteres
  return normalized.length === 2 ? normalized : null;
}

/**
 * 📮 Normaliza CEP/código postal para formato CAPI (apenas dígitos):
 * Exemplo: "13202-000" → "13202000"
 * Valida mínimo de 4 dígitos
 */
function normalizeZip(zipValue) {
  const digits = onlyDigits(zipValue);
  if (!digits || digits.length < 4) {
    return null;
  }
  return digits;
}

/**
 * 🌍 Normaliza código de país para formato CAPI (ISO-2 lowercase):
 * Exemplo: "BR" → "br", "Brasil" → "br"
 */
function normalizeCountry(countryValue) {
  const stringValue = toStringValue(countryValue);
  if (!stringValue) {
    return null;
  }

  const normalized = stringValue
    .normalize('NFD')
    .replace(ACCENT_REGEX, '')
    .toLowerCase()
    .trim();

  // Se já é código de 2 letras, retornar
  if (normalized.length === 2) {
    return normalized;
  }

  // Mapear nomes comuns para códigos
  const countryMap = {
    'brasil': 'br',
    'brazil': 'br',
    'united states': 'us',
    'estados unidos': 'us'
  };

  return countryMap[normalized] || null;
}

/**
 * 🗺️ Processa dados de geolocalização e retorna objeto com campos normalizados
 * prontos para hash. Inclui logs detalhados de cada etapa.
 * 
 * @param {Object} geo - Dados de geolocalização (pode vir de IP-API ou payload)
 * @param {Object} options - Opções adicionais { logPrefix, telegramId }
 * @returns {Object} Objeto com ct, st, zp, country normalizados (sem hash)
 */
function processGeoData(geo = {}, options = {}) {
  const { logPrefix = '[LeadCAPI][GEO]', telegramId = null } = options;
  
  if (!geo || typeof geo !== 'object') {
    console.log(`${logPrefix} Nenhum dado de geolocalização fornecido`);
    return { raw: {}, normalized: {} };
  }

  // 1️⃣ Extrair valores brutos (priorizar payload sobre IP-API)
  const raw = {
    city: geo.geo_city ?? geo.city ?? null,
    region: geo.geo_region ?? geo.region ?? null,
    regionName: geo.geo_region_name ?? geo.region_name ?? geo.regionName ?? null,
    zip: geo.geo_postal_code ?? geo.postal_code ?? geo.postal ?? geo.zip ?? null,
    countryCode: geo.geo_country_code ?? geo.country_code ?? geo.countryCode ?? geo.geo_country ?? geo.country ?? null
  };

  // 🔍 Log dos insumos recebidos
  const source = geo.geo_city ? 'payload/cache' : (geo.city ? 'ip-api' : 'unknown');
  console.log(`${logPrefix} Insumos recebidos`, {
    telegram_id: telegramId,
    city: raw.city ? `"${raw.city}"` : null,
    region: raw.region ? `"${raw.region}"` : null,
    regionName: raw.regionName ? `"${raw.regionName}"` : null,
    zip: raw.zip ? `"${raw.zip}"` : null,
    countryCode: raw.countryCode ? `"${raw.countryCode}"` : null,
    source
  });

  // 2️⃣ Normalizar cada campo
  const countryNorm = normalizeCountry(raw.countryCode) || 'br';
  
  // Para estado: priorizar 'region' (UF de 2 letras) sobre 'regionName' (nome completo)
  let stateNorm = null;
  if (raw.region) {
    stateNorm = normalizeState(raw.region, countryNorm.toUpperCase());
  }
  // Fallback: se não houver region, tentar mapear regionName
  if (!stateNorm && raw.regionName) {
    stateNorm = normalizeState(raw.regionName, countryNorm.toUpperCase());
  }

  const cityNorm = normalizeCity(raw.city);
  const zipNorm = normalizeZip(raw.zip);

  // 3️⃣ Log da normalização (antes → depois)
  const normLog = [];
  if (raw.city) {
    normLog.push(`ct: "${raw.city}" → "${cityNorm || 'DESCARTADO'}"`);
  }
  if (raw.region || raw.regionName) {
    const stInput = raw.region || raw.regionName;
    normLog.push(`st: "${stInput}" → "${stateNorm || 'DESCARTADO'}"`);
  }
  if (raw.zip) {
    normLog.push(`zp: "${raw.zip}" → "${zipNorm || 'DESCARTADO'}"`);
  }
  if (raw.countryCode) {
    normLog.push(`country: "${raw.countryCode}" → "${countryNorm}"`);
  }

  if (normLog.length > 0) {
    console.log(`${logPrefix} Normalização`, {
      telegram_id: telegramId,
      transforms: normLog
    });
  }

  // 4️⃣ Montar objeto normalizado final
  const normalized = {};
  if (cityNorm) normalized.ct = cityNorm;
  if (stateNorm) normalized.st = stateNorm;
  if (zipNorm) normalized.zp = zipNorm;
  if (countryNorm) normalized.country = countryNorm;

  // 5️⃣ Log dos campos que serão enviados
  const fieldsToSend = Object.keys(normalized);
  if (fieldsToSend.length > 0) {
    console.log(`${logPrefix} Campos prontos para hash`, {
      telegram_id: telegramId,
      fields: fieldsToSend,
      count: fieldsToSend.length
    });
  } else {
    console.warn(`${logPrefix} Nenhum campo geo válido para enviar`, {
      telegram_id: telegramId
    });
  }

  return { raw, normalized };
}

/**
 * LEGADO: Função antiga mantida para compatibilidade
 */
function mapGeoToUserData(geo = {}) {
  const userData = {};

  const defaultCountry = norm('br');
  if (defaultCountry) {
    userData.country = defaultCountry;
  }

  if (!geo || typeof geo !== 'object') {
    return userData;
  }

  const cityCandidate =
    geo.geo_city ??
    geo.city ??
    geo.ct ??
    null;

  const regionCandidate =
    geo.geo_region ??
    geo.region ??
    geo.state ??
    null;

  const regionNameCandidate =
    geo.geo_region_name ??
    geo.region_name ??
    geo.regionName ??
    geo.state_name ??
    null;

  const postalCandidate =
    geo.geo_postal_code ??
    geo.postal_code ??
    geo.postal ??
    geo.zip ??
    geo.zp ??
    null;

  const countryCandidate =
    geo.geo_country_code ??
    geo.country_code ??
    geo.countryCode ??
    geo.geo_country ??
    geo.country ??
    null;

  const city = normalizeCity(cityCandidate);
  if (city) {
    userData.ct = city;
  }

  const countryNorm = normalizeCountry(countryCandidate) || 'br';
  const state = normalizeState(regionCandidate || regionNameCandidate, countryNorm.toUpperCase());
  if (state) {
    userData.st = state;
  }

  const postal = normalizeZip(postalCandidate);
  if (postal) {
    userData.zp = postal;
  }

  if (countryNorm) {
    userData.country = countryNorm;
  }

  return userData;
}

module.exports = {
  norm,
  onlyDigits,
  normalizeCity,
  normalizeState,
  normalizeZip,
  normalizeCountry,
  processGeoData,
  mapGeoToUserData,
  BR_STATE_NAME_TO_UF,
  VALID_BR_UF
};
