# Implementação: Captura de Geo na Página de Obrigado (Purchase)

## Objetivo

Parar de ler/gravar dados de localização em `telegram_users` para o fluxo de Purchase.

Capturar a localização na própria requisição da página `obrigado_purchase_flow`, reutilizando o sistema de captura de localização já existente no projeto (GeoService, processGeoData, etc.).

Expor `ct`, `st`, `zp`, `country` no browser (Pixel/Advanced Matching) da página de obrigado.

Enviar os mesmos campos no CAPI, hasheados com a mesma função usada para `em`/`ph`.

## Arquivos Modificados

### 1. `server.js` - Endpoint `/api/purchase/context`

**Alterações:**
- Adicionada captura de geolocalização usando `geoService.lookupGeo()` com o IP da requisição
- Processamento e normalização dos dados com `processGeoData()` de `utils/geoNormalization.js`
- Exposição de `geo_user_data` no contexto retornado ao browser (campos plaintext: `ct`, `st`, `zp`, `country`)
- Respeita flag `ENABLE_GEO_CAPTURE` (default: true)
- Logs detalhados de captura e normalização

**Código adicionado (linhas ~2201-2294):**
```javascript
// 🗺️ [GEO-OBRIGADO] Capturar geolocalização do request (não consultar telegram_users)
const { processGeoData } = require('./utils/geoNormalization');
const { lookupGeo } = geoService;

// Capturar IP real do request
const forwarded = req.headers['x-forwarded-for'];
let clientIp = row.client_ip_address; // IP do banco como fallback

if (forwarded && typeof forwarded === 'string') {
  const ips = forwarded.split(',').map(ip => ip.trim());
  // Pegar primeiro IP público
  for (const ip of ips) {
    if (ip && !ip.startsWith('10.') && !ip.startsWith('192.168.') && !ip.startsWith('172.')) {
      clientIp = ip;
      break;
    }
  }
} else if (req.ip) {
  clientIp = req.ip;
}

// Capturar User Agent do request
const clientUserAgent = req.get('user-agent') || row.client_user_agent || '';

let geoUserData = {};

// Verificar se geo capture está habilitado
const ENABLE_GEO_CAPTURE = process.env.ENABLE_GEO_CAPTURE !== 'false';

if (ENABLE_GEO_CAPTURE && clientIp && geoService.isGeoConfigured()) {
  try {
    const geoResult = await lookupGeo(clientIp, { timeout: 3000, requestId });
    
    if (geoResult.ok && geoResult.normalized) {
      // Processar e normalizar dados de geo usando o sistema existente
      const { normalized } = processGeoData({
        geo_city: geoResult.normalized.city,
        geo_region: geoResult.normalized.region,
        geo_region_name: geoResult.normalized.region_name,
        geo_postal_code: geoResult.normalized.postal_code,
        geo_country_code: geoResult.normalized.country_code,
        geo_country: geoResult.normalized.country
      }, {
        logPrefix: '[PURCHASE-GEO]',
        telegramId: telegramIdString
      });
      
      // Expor campos normalizados (sem hash) para o browser
      geoUserData = {
        ct: normalized.ct || undefined,
        st: normalized.st || undefined,
        zp: normalized.zp || undefined,
        country: normalized.country || undefined
      };
    }
  } catch (geoError) {
    // Log de erro com throttling
  }
}

// ... no contextPayload:
geo_user_data: geoUserData,
```

### 2. `server.js` - Endpoint `/api/capi/purchase`

**Alterações:**
- Adicionada captura de geolocalização idêntica ao endpoint `/api/purchase/context`
- Hashing dos campos geo com `hashSha256()` (mesma função usada para email/phone)
- Inclusão de `geo_user_data_hashed` no `purchaseData` passado para `sendPurchaseEvent()`
- Logs detalhados do processo

**Código adicionado (linhas ~3083-3178):**
```javascript
// 🗺️ [GEO-OBRIGADO] Capturar geolocalização do request (não consultar telegram_users)
const { processGeoData } = require('./utils/geoNormalization');
const { hashSha256 } = require('./helpers/purchaseFlow');
const { lookupGeo } = geoService;

let geoUserDataHashed = {};

// Verificar se geo capture está habilitado
const ENABLE_GEO_CAPTURE = process.env.ENABLE_GEO_CAPTURE !== 'false';

if (ENABLE_GEO_CAPTURE && finalIp && geoService.isGeoConfigured()) {
  try {
    const geoResult = await lookupGeo(finalIp, { timeout: 3000, requestId });
    
    if (geoResult.ok && geoResult.normalized) {
      // Processar e normalizar dados de geo
      const { normalized } = processGeoData({
        geo_city: geoResult.normalized.city,
        geo_region: geoResult.normalized.region,
        geo_region_name: geoResult.normalized.region_name,
        geo_postal_code: geoResult.normalized.postal_code,
        geo_country_code: geoResult.normalized.country_code,
        geo_country: geoResult.normalized.country
      }, {
        logPrefix: '[PURCHASE-CAPI][GEO]',
        telegramId: telegramIdString
      });
      
      // Hashear campos geo com a mesma função usada para em/ph
      const h = v => v ? hashSha256(v) : undefined;
      
      geoUserDataHashed = {
        ct: h(normalized.ct),
        st: h(normalized.st),
        zp: h(normalized.zp),
        country: h(normalized.country)
      };
      
      // Remover campos undefined
      Object.keys(geoUserDataHashed).forEach(key => {
        if (geoUserDataHashed[key] === undefined) {
          delete geoUserDataHashed[key];
        }
      });
      
      // Log dos campos que serão enviados
      const geoFieldsPresent = Object.keys(geoUserDataHashed);
      if (geoFieldsPresent.length > 0) {
        console.log('[PURCHASE-CAPI][GEO] user_data mesclado', {
          hasCt: !!geoUserDataHashed.ct,
          hasSt: !!geoUserDataHashed.st,
          hasZp: !!geoUserDataHashed.zp,
          hasCountry: !!geoUserDataHashed.country,
          fields: geoFieldsPresent
        });
      }
    }
  } catch (geoError) {
    // Log de erro
  }
}

// ... no purchaseData:
geo_user_data_hashed: geoUserDataHashed,
```

### 3. `MODELO1/WEB/obrigado_purchase_flow.html`

**Alterações:**
- Inclusão dos campos geo em `userDataPlain` para Advanced Matching (sem hash, Pixel faz hashing automático)
- Adicionados logs de geo fields no normalization snapshot
- Log separado `[PURCHASE-BROWSER][GEO] AM pronto` para campos geo

**Código adicionado (linhas ~680-685):**
```javascript
// 🗺️ [GEO-OBRIGADO] Incluir geo em Advanced Matching (browser - sem hash)
const geo = (window.__PURCHASE_CONTEXT__?.geo_user_data) || {};
if (geo.ct) userDataPlain.ct = geo.ct;
if (geo.st) userDataPlain.st = geo.st;
if (geo.zp) userDataPlain.zp = geo.zp;
if (geo.country) userDataPlain.country = geo.country;
```

**Logs adicionados (linhas ~696-714):**
```javascript
const normalizationSnapshot = {
  em: !!normalizedData.email,
  ph: !!normalizedData.phone,
  fn: !!normalizedData.first_name,
  ln: !!normalizedData.last_name,
  external_id: !!normalizedData.external_id,
  fbp: !!finalFbp,
  fbc: !!finalFbc,
  ct: !!geo.ct,
  st: !!geo.st,
  zp: !!geo.zp,
  country: !!geo.country
};
console.log('[ADVANCED-MATCH-FRONT] presence', normalizationSnapshot);

// 🗺️ [GEO-OBRIGADO] Log geo fields
if (geo.ct || geo.st || geo.zp || geo.country) {
  console.log('[PURCHASE-BROWSER][GEO] AM pronto', { 
    ct: geo.ct, 
    st: geo.st, 
    zp: geo.zp, 
    country: geo.country 
  });
}
```

### 4. `services/purchaseCapi.js`

**Alterações:**
- Inclusão dos campos geo hasheados em `userData` antes do envio para Meta CAPI
- Uso de `ensureArray()` para garantir formato correto (array)
- Logs detalhados de cada campo geo incluído
- Atualização do contador `amFieldsCount` para incluir campos geo
- Atualização dos logs de resumo para incluir geo

**Código adicionado (linhas ~337-354):**
```javascript
// 🗺️ [GEO-OBRIGADO] Incluir campos de geo hasheados (CAPI)
const geoUserDataHashed = purchaseData.geo_user_data_hashed || {};
if (geoUserDataHashed.ct) {
  userData.ct = ensureArray(geoUserDataHashed.ct);
  console.log(`[PURCHASE-CAPI][GEO] 🏙️ user_data.ct: ${userData.ct.length} hash(es) included`);
}
if (geoUserDataHashed.st) {
  userData.st = ensureArray(geoUserDataHashed.st);
  console.log(`[PURCHASE-CAPI][GEO] 🗺️ user_data.st: ${userData.st.length} hash(es) included`);
}
if (geoUserDataHashed.zp) {
  userData.zp = ensureArray(geoUserDataHashed.zp);
  console.log(`[PURCHASE-CAPI][GEO] 📮 user_data.zp: ${userData.zp.length} hash(es) included`);
}
if (geoUserDataHashed.country) {
  userData.country = ensureArray(geoUserDataHashed.country);
  console.log(`[PURCHASE-CAPI][GEO] 🌍 user_data.country: ${userData.country.length} hash(es) included`);
}
```

**Logs atualizados (linhas ~357-401 e 486-506):**
```javascript
// Contador de campos AM atualizado
const amFieldsCount = [
  !!userData.em,
  !!userData.ph,
  !!userData.fn,
  !!userData.ln,
  !!userData.external_id,
  !!userData.fbp,
  !!userData.fbc,
  !!userData.client_ip_address,
  !!userData.client_user_agent,
  !!userData.ct,
  !!userData.st,
  !!userData.zp,
  !!userData.country
].filter(Boolean).length;

// Logs de resumo incluindo geo
console.log('[PURCHASE-CAPI] 📊 user_data completo sendo enviado:', {
  has_em: !!userData.em,
  has_ph: !!userData.ph,
  has_fn: !!userData.fn,
  has_ln: !!userData.ln,
  has_external_id: !!userData.external_id,
  has_fbp: !!userData.fbp,
  has_fbc: !!userData.fbc,
  has_client_ip: !!userData.client_ip_address,
  has_client_ua: !!userData.client_user_agent,
  has_ct: !!userData.ct,
  has_st: !!userData.st,
  has_zp: !!userData.zp,
  has_country: !!userData.country,
  total_fields: Object.keys(userData).length,
  am_fields_count: amFieldsCount,
  expected_emq: amFieldsCount >= 5 ? 'HIGH (8-10)' : amFieldsCount >= 3 ? 'MEDIUM (5-7)' : 'LOW (<5)'
});
```

## Sistema de Geo Reutilizado

### Arquivos Existentes Utilizados

1. **`services/geo.js`**
   - `lookupGeo(ip, options)` - Consulta IP-API para obter dados de geolocalização
   - `isGeoConfigured()` - Verifica se GEO_API_KEY está configurada
   - Normaliza dados brutos do IP-API

2. **`utils/geoNormalization.js`**
   - `processGeoData(geo, options)` - Processa e normaliza dados de geo
   - `normalizeCity(city)` - Normaliza cidade (lowercase, sem acentos/pontuação)
   - `normalizeState(state, country)` - Normaliza UF (sigla de 2 letras, mapeia nomes completos)
   - `normalizeZip(zip)` - Normaliza CEP (apenas dígitos, mínimo 4)
   - `normalizeCountry(country)` - Normaliza país (ISO-2 lowercase)

3. **`helpers/purchaseFlow.js`**
   - `hashSha256(value)` - Hash SHA-256 usado para em/ph e agora também para geo

## Normalização de Campos Geo

### Campo `ct` (City)
- Entrada: "São Paulo", "Rio de Janeiro"
- Normalização: lowercase, remove acentos, remove pontuação, remove espaços
- Saída: "saopaulo", "riodejaneiro"
- Hash: SHA-256 hex (64 caracteres)

### Campo `st` (State)
- Entrada: "SP", "Pernambuco", "RJ"
- Normalização: 
  - Se 2 letras válidas (UF): lowercase "sp", "rj"
  - Se nome completo: mapeia para UF "pernambuco" → "pe"
- Saída: "sp", "pe", "rj" (sempre 2 letras)
- Hash: SHA-256 hex (64 caracteres)

### Campo `zp` (Zip/CEP)
- Entrada: "13202-000", "01310100"
- Normalização: apenas dígitos, mínimo 4
- Saída: "13202000", "01310100"
- Hash: SHA-256 hex (64 caracteres)

### Campo `country` (Country)
- Entrada: "BR", "Brasil", "Brazil"
- Normalização: ISO-2 lowercase, mapeia nomes comuns
- Saída: "br", "us"
- Hash: SHA-256 hex (64 caracteres)

## Fluxo de Dados

### Browser (Pixel)
1. Página `/obrigado_purchase_flow.html` carrega
2. Faz GET `/api/purchase/context?token=XXX`
3. Backend captura IP da requisição
4. Backend consulta IP-API
5. Backend normaliza campos geo
6. Backend retorna `geo_user_data: { ct, st, zp, country }` (plaintext)
7. Browser inclui campos em `userDataPlain` (plaintext)
8. `fbq('init', PIXEL_ID, userDataPlain)` - Pixel faz hash automático
9. Log: `[PURCHASE-BROWSER][GEO] AM pronto { ct, st, zp, country }`

### Server (CAPI)
1. Browser faz POST `/api/capi/purchase`
2. Backend captura IP da requisição CAPI
3. Backend consulta IP-API
4. Backend normaliza campos geo
5. Backend hasheia com `hashSha256()` (mesma função de em/ph)
6. Backend passa `geo_user_data_hashed` para `sendPurchaseEvent()`
7. `sendPurchaseEvent()` inclui em `userData` (hasheados)
8. Envia para Meta CAPI
9. Log: `[PURCHASE-CAPI][GEO] user_data mesclado { hasCt, hasSt, hasZp, hasCountry }`

## Flags e Configuração

### Variáveis de Ambiente

```bash
# Habilitar/desabilitar captura de geo (default: true)
ENABLE_GEO_CAPTURE=true

# Configuração do serviço de geo (IP-API)
GEO_API_KEY=your_api_key_here
GEO_API_URL=https://pro.ip-api.com/json/
```

### Comportamento
- Se `ENABLE_GEO_CAPTURE=false`: nenhuma captura de geo é feita
- Se `GEO_API_KEY` não configurada: geo lookup é pulado com warning
- Se lookup falha: continua sem geo (não bloqueia Purchase)
- Timeout do lookup: 3 segundos

## Logs Implementados

### Backend Context Endpoint
```
[geo] resolved { ip, city, region, region_name, zip, countryCode, request_id }
[PURCHASE-GEO] Insumos recebidos { city, region, regionName, zip, countryCode, source }
[PURCHASE-GEO] Normalização { transforms }
[PURCHASE-GEO] Campos prontos para hash { fields, count }
[PURCHASE-BROWSER][GEO] AM pronto { ct, st, zp, country }
```

### Backend CAPI Endpoint
```
[geo] resolved { ip, city, region, region_name, zip, countryCode, request_id }
[PURCHASE-CAPI][GEO] Insumos recebidos { city, region, regionName, zip, countryCode, source }
[PURCHASE-CAPI][GEO] Normalização { transforms }
[PURCHASE-CAPI][GEO] Campos prontos para hash { fields, count }
[PURCHASE-CAPI][GEO] user_data mesclado { hasCt, hasSt, hasZp, hasCountry, fields }
```

### Browser
```
[ADVANCED-MATCH-FRONT] presence { em, ph, fn, ln, external_id, fbp, fbc, ct, st, zp, country }
[PURCHASE-BROWSER][GEO] AM pronto { ct, st, zp, country }
```

### CAPI Service
```
[PURCHASE-CAPI][GEO] 🏙️ user_data.ct: 1 hash(es) included
[PURCHASE-CAPI][GEO] 🗺️ user_data.st: 1 hash(es) included
[PURCHASE-CAPI][GEO] 📮 user_data.zp: 1 hash(es) included
[PURCHASE-CAPI][GEO] 🌍 user_data.country: 1 hash(es) included
[PURCHASE-CAPI] 📊 user_data completo sendo enviado { has_ct, has_st, has_zp, has_country, ... }
[PURCHASE-CAPI] 📋 RESUMO COMPLETO DO EVENTO { user_data_fields: { ct, st, zp, country, ... } }
```

## Dados NÃO Consultados

### telegram_users
- **NÃO** consultamos `telegram_users` para obter dados de geo no fluxo de Purchase
- A tabela `telegram_users` continua armazenando geo (para o evento Lead)
- No Purchase, a geo é capturada **sempre do request atual**

## Critérios de Aceite

✅ **Browser (Pixel)**
- Em Test Events do Pixel, campos `ct`, `st`, `zp`, `country` aparecem quando disponíveis
- Campos enviados em plaintext (Pixel faz hash automático)
- Log `[PURCHASE-BROWSER][GEO] AM pronto` exibe campos capturados

✅ **Server (CAPI)**
- Em Test Events do CAPI, os mesmos campos constam em `user_data` (hasheados SHA-256)
- Hash feito com `hashSha256()` (mesma função de em/ph)
- Log `[PURCHASE-CAPI][GEO] user_data mesclado` exibe campos enviados

✅ **Independência de telegram_users**
- Zero referências a `telegram_users` para geo no fluxo de Purchase
- Geo capturado diretamente do request (IP-API)

✅ **Sem quebras**
- Pixel continua funcionando normalmente
- CAPI continua funcionando normalmente
- Nenhum erro novo do Pixel

## Compatibilidade

- ✅ Reutiliza sistema de geo existente (`services/geo.js`, `utils/geoNormalization.js`)
- ✅ Usa mesma função de hash (`hashSha256`) que em/ph
- ✅ Respeita flag `ENABLE_GEO_CAPTURE`
- ✅ Graceful degradation (falha de geo não bloqueia Purchase)
- ✅ Logs padronizados e informativos

## Testing

Para testar a implementação:

1. Configure `GEO_API_KEY` no `.env`
2. Acesse página de obrigado com token válido
3. Verifique logs no console do browser:
   - `[PURCHASE-BROWSER][GEO] AM pronto`
4. Verifique logs no servidor:
   - `[geo] resolved`
   - `[PURCHASE-CAPI][GEO] user_data mesclado`
5. Verifique Test Events do Facebook:
   - **Pixel**: campos `ct`, `st`, `zp`, `country` em Advanced Matching
   - **CAPI**: mesmos campos em `user_data` (hasheados)

## Observações

- A captura de geo é feita **duas vezes**: uma no `/api/purchase/context` (para browser) e outra no `/api/capi/purchase` (para CAPI)
- Isso garante que sempre usamos o IP mais atual da requisição
- Se o IP mudar entre as duas requisições (improvável), cada evento terá a geo correspondente ao seu momento
- O timeout de 3 segundos garante que geo lookup não atrasa demais o fluxo
- Se geo falhar, Purchase continua normalmente sem geo (não é bloqueante)
