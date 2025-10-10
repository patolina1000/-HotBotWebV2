# Implementação: Dados Geográficos no Purchase Flow

**Data**: 2025-10-10  
**Branch**: cursor/add-geo-data-to-purchase-flow-d533  
**Objetivo**: Adicionar campos geográficos (ct, st, zp, country) ao Purchase Flow (Browser Pixel e CAPI)

## ✅ Resumo da Implementação

### Arquivos Modificados
- ✅ `server.js` - Backend (contexto do Purchase + CAPI endpoint)
- ✅ `MODELO1/WEB/obrigado_purchase_flow.html` - Frontend (Pixel Browser)
- ✅ `services/purchaseCapi.js` - Serviço CAPI
- ✅ `IMPLEMENTACAO_PURCHASE_GEO_DATA.md` - Documentação (este arquivo)

---

## 1. Backend - Contexto do Purchase

### Endpoint: `GET /api/purchase/context`

**Localização**: `server.js` (linhas ~2201-2256)

**Mudanças**:
1. Busca dados geográficos da tabela `telegram_users` usando `telegram_id`
2. Normaliza os campos usando `processGeoData()` de `utils/geoNormalization.js`
3. Adiciona `geo_user_data` ao contexto retornado ao frontend

**Código**:
```javascript
// [PURCHASE-GEO] Buscar dados geográficos do telegram_users
let geoUserData = null;
const ENABLE_GEO_CAPTURE = process.env.ENABLE_GEO_CAPTURE !== 'false';
if (ENABLE_GEO_CAPTURE && telegramIdString) {
  const geoQuery = `SELECT geo_city, geo_region, geo_region_name, 
                     geo_postal_code, geo_country, geo_country_code 
                     FROM telegram_users WHERE telegram_id = $1`;
  const geoResult = await pool.query(geoQuery, [telegramIdString]);
  
  if (geoResult.rows.length > 0) {
    const { normalized } = processGeoData(geoResult.rows[0], {
      logPrefix: '[PURCHASE-CONTEXT][GEO]',
      telegramId: telegramIdString
    });
    
    geoUserData = {};
    if (normalized.ct) geoUserData.ct = normalized.ct;
    if (normalized.st) geoUserData.st = normalized.st;
    if (normalized.zp) geoUserData.zp = normalized.zp;
    if (normalized.country) geoUserData.country = normalized.country;
  }
}

// Adicionar ao contexto
contextPayload.geo_user_data = geoUserData && Object.keys(geoUserData).length > 0 
  ? geoUserData 
  : undefined;
```

**Logs**:
```
[PURCHASE-CONTEXT][GEO] Insumos recebidos { city, region, zip, country, source }
[PURCHASE-CONTEXT][GEO] Normalização { transforms: [...] }
[PURCHASE-CONTEXT][GEO] Campos prontos para hash { fields, count }
[PURCHASE-CONTEXT][GEO] Dados geo normalizados { token, telegram_id, fields, count }
```

---

## 2. Frontend - Browser Pixel

### Arquivo: `MODELO1/WEB/obrigado_purchase_flow.html`

**Localização**: Linhas ~680-697

**Mudanças**:
1. Lê `geo_user_data` do contexto recebido do backend
2. Adiciona campos geo ao `userDataPlain` (em **texto claro** - o Pixel hasheia no cliente)
3. Log dos campos adicionados

**Código**:
```javascript
// [PURCHASE-GEO] Adicionar dados geográficos do contexto (em texto claro)
const geo = (contextData?.geo_user_data) || {};
const hasGeoData = geo && (geo.ct || geo.st || geo.zp || geo.country);
if (hasGeoData) {
    if (geo.ct) userDataPlain.ct = geo.ct;
    if (geo.st) userDataPlain.st = geo.st;
    if (geo.zp) userDataPlain.zp = geo.zp;
    if (geo.country) userDataPlain.country = geo.country;

    console.log('[PURCHASE-BROWSER][GEO] advanced-matching', {
        ct: geo.ct || null,
        st: geo.st || null,
        zp: geo.zp || null,
        country: geo.country || null
    });
}

// userData é passado para fbq('init', PIXEL_ID, userDataPlain)
```

**Logs**:
```
[PURCHASE-BROWSER][GEO] advanced-matching { ct, st, zp, country }
```

**Importante**:
- ✅ Campos enviados em **texto claro** (normalized)
- ✅ O Pixel do Facebook hasheia automaticamente no cliente
- ✅ Não usar `fbq('set', 'userData', ...)` - usar `fbq('init', PIXEL_ID, userData)`

---

## 3. Server - CAPI Endpoint

### Endpoint: `POST /api/capi/purchase`

**Localização**: `server.js` (linhas ~2877-2957)

**Mudanças**:
1. Busca dados geográficos da tabela `telegram_users`
2. Normaliza usando `processGeoData()`
3. **Hasheia** os campos com SHA-256 usando `hashSha256()` de `helpers/purchaseFlow.js`
4. Adiciona `geo_hashed` ao `purchaseData`

**Código**:
```javascript
// [PURCHASE-GEO] Buscar e normalizar dados geográficos
let geoUserDataNormalized = null;
const ENABLE_GEO_CAPTURE = process.env.ENABLE_GEO_CAPTURE !== 'false';
if (ENABLE_GEO_CAPTURE && telegramIdString) {
  const geoQuery = `SELECT geo_city, geo_region, geo_region_name,
                     geo_postal_code, geo_country, geo_country_code 
                     FROM telegram_users WHERE telegram_id = $1`;
  const geoResult = await pool.query(geoQuery, [telegramIdString]);
  
  if (geoResult.rows.length > 0) {
    const { normalized } = processGeoData(geoResult.rows[0], {
      logPrefix: '[PURCHASE-CAPI][GEO]',
      telegramId: telegramIdString
    });
    
    if (Object.keys(normalized).length > 0) {
      geoUserDataNormalized = normalized;
    }
  }
}

// [PURCHASE-GEO] Hashear campos geográficos
const geoHashedFields = {};
if (geoUserDataNormalized) {
  const { hashSha256 } = require('./helpers/purchaseFlow');
  
  if (geoUserDataNormalized.ct) geoHashedFields.ct = hashSha256(geoUserDataNormalized.ct);
  if (geoUserDataNormalized.st) geoHashedFields.st = hashSha256(geoUserDataNormalized.st);
  if (geoUserDataNormalized.zp) geoHashedFields.zp = hashSha256(geoUserDataNormalized.zp);
  if (geoUserDataNormalized.country) geoHashedFields.country = hashSha256(geoUserDataNormalized.country);
  
  console.log('[PURCHASE-CAPI][GEO] user_data mesclado', {
    hasCt: !!geoHashedFields.ct,
    hasSt: !!geoHashedFields.st,
    hasZp: !!geoHashedFields.zp,
    hasCountry: !!geoHashedFields.country
  });
}

// Adicionar ao purchaseData
purchaseData.geo_hashed = geoHashedFields && Object.keys(geoHashedFields).length > 0 
  ? geoHashedFields 
  : undefined;
```

**Logs**:
```
[PURCHASE-CAPI][GEO] Insumos recebidos { city, region, zip, country, source }
[PURCHASE-CAPI][GEO] Normalização { transforms: [...] }
[PURCHASE-CAPI][GEO] Campos prontos para hash { fields, count }
[PURCHASE-CAPI][GEO] Dados geo normalizados { token, telegram_id, fields, count }
[PURCHASE-CAPI][GEO] user_data mesclado { hasCt, hasSt, hasZp, hasCountry }
```

---

## 4. Serviço CAPI

### Arquivo: `services/purchaseCapi.js`

**Localização**: Linhas ~299-316

**Mudanças**:
1. Extrai `geo_hashed` do `purchaseData`
2. Adiciona campos ao `userData` em formato de array (conforme spec da Meta)
3. Logs individuais para cada campo adicionado
4. Atualiza contagem de campos AM

**Código**:
```javascript
// [PURCHASE-GEO] Adicionar campos geográficos hasheados
const geoHashed = purchaseData.geo_hashed || {};
if (geoHashed.ct) {
  userData.ct = ensureArray(geoHashed.ct);
  console.log(`[PURCHASE-CAPI][GEO] 🏙️ user_data.ct: ${userData.ct.length} hash(es) included`);
}
if (geoHashed.st) {
  userData.st = ensureArray(geoHashed.st);
  console.log(`[PURCHASE-CAPI][GEO] 🗺️ user_data.st: ${userData.st.length} hash(es) included`);
}
if (geoHashed.zp) {
  userData.zp = ensureArray(geoHashed.zp);
  console.log(`[PURCHASE-CAPI][GEO] 📮 user_data.zp: ${userData.zp.length} hash(es) included`);
}
if (geoHashed.country) {
  userData.country = ensureArray(geoHashed.country);
  console.log(`[PURCHASE-CAPI][GEO] 🌍 user_data.country: ${userData.country.length} hash(es) included`);
}

// Atualizada contagem de campos AM
const amFieldsCount = [
  // ... campos existentes
  !!userData.ct,
  !!userData.st,
  !!userData.zp,
  !!userData.country
].filter(Boolean).length;
```

**Logs**:
```
[PURCHASE-CAPI][GEO] 🏙️ user_data.ct: 1 hash(es) included
[PURCHASE-CAPI][GEO] 🗺️ user_data.st: 1 hash(es) included
[PURCHASE-CAPI][GEO] 📮 user_data.zp: 1 hash(es) included
[PURCHASE-CAPI][GEO] 🌍 user_data.country: 1 hash(es) included
[PURCHASE-CAPI] 📊 user_data completo sendo enviado: { has_ct, has_st, has_zp, has_country, ... }
```

---

## 5. Normalização dos Dados

### Arquivo: `utils/geoNormalization.js` (já existente, reutilizado)

**Funções Utilizadas**:

1. **`normalizeCity(city)`**
   - Lowercase, sem acentos, sem espaços, sem pontuação
   - Ex: `"São Paulo"` → `"saopaulo"`

2. **`normalizeState(state, countryCode)`**
   - UF de 2 letras em lowercase
   - Mapeia nomes completos para UF (ex: "São Paulo" → "sp")
   - Ex: `"PE"` → `"pe"`, `"Pernambuco"` → `"pe"`

3. **`normalizeZip(zip)`**
   - Apenas dígitos/letras
   - Para BR: 8 dígitos se aplicável
   - Ex: `"13202-000"` → `"13202000"`

4. **`normalizeCountry(country)`**
   - Código ISO-2 em lowercase
   - Ex: `"BR"` → `"br"`, `"Brasil"` → `"br"`

5. **`processGeoData(geo, options)`**
   - Processa todos os campos de uma vez
   - Retorna objeto normalizado
   - Logs detalhados de cada etapa

---

## 6. Flag de Controle

### Variável de Ambiente: `ENABLE_GEO_CAPTURE`

**Comportamento**:
- ✅ **Padrão**: Habilitado (se não definida ou qualquer valor != `'false'`)
- ✅ **Desabilitado**: `ENABLE_GEO_CAPTURE=false` no `.env`

**Implementação**:
```javascript
const ENABLE_GEO_CAPTURE = process.env.ENABLE_GEO_CAPTURE !== 'false';
if (ENABLE_GEO_CAPTURE && telegramIdString) {
  // Buscar e processar dados geo
}
```

**Efeito**:
- Se desligado, `geo_user_data` **não é incluído** no contexto
- Frontend não envia campos geo ao Pixel
- CAPI não envia campos geo à Meta
- Nenhum erro; sistema funciona normalmente sem geo data

---

## 7. Fluxo de Dados

```
┌─────────────────────────────────────────────────────────────┐
│                    PURCHASE FLOW - GEO DATA                 │
└─────────────────────────────────────────────────────────────┘

1. ORIGEM DOS DADOS
   telegram_users table
   └─> geo_city, geo_region, geo_region_name, 
       geo_postal_code, geo_country, geo_country_code

2. BACKEND - GET /api/purchase/context
   ├─> Busca dados geo via telegram_id
   ├─> Normaliza com processGeoData()
   ├─> Retorna geo_user_data (texto claro)
   └─> { ct: "saopaulo", st: "sp", zp: "13202000", country: "br" }

3. FRONTEND - Browser Pixel
   ├─> Lê geo_user_data do contexto
   ├─> Adiciona ao userDataPlain (texto claro)
   ├─> fbq('init', PIXEL_ID, userDataPlain)
   └─> Pixel hasheia automaticamente no cliente

4. BACKEND - POST /api/capi/purchase
   ├─> Busca dados geo via telegram_id
   ├─> Normaliza com processGeoData()
   ├─> Hasheia com hashSha256() (SHA-256)
   └─> geo_hashed: { ct: "abc123...", st: "def456...", ... }

5. SERVIÇO CAPI - services/purchaseCapi.js
   ├─> Recebe geo_hashed
   ├─> Adiciona ao userData em arrays
   ├─> Envia à Meta CAPI
   └─> userData.ct = ["abc123..."], userData.st = ["def456..."], ...

6. META CAPI
   ✅ Recebe campos geo em user_data (hasheados)
   ✅ Usa para Advanced Matching
   ✅ Melhora Event Match Quality (EMQ)
```

---

## 8. Exemplo Completo

### Cenário: Usuário de Recife, PE

**Dados Brutos na DB**:
```sql
SELECT * FROM telegram_users WHERE telegram_id = '123456789';
-- geo_city: "Recife"
-- geo_region: "PE"  
-- geo_region_name: "Pernambuco"
-- geo_postal_code: "50010-000"
-- geo_country_code: "BR"
```

**Após Normalização**:
```javascript
{
  ct: "recife",
  st: "pe",
  zp: "50010000",
  country: "br"
}
```

**Browser Pixel**:
```javascript
fbq('init', '1234567890', {
  em: "user@example.com",
  ph: "5581987654321",
  fn: "João",
  ln: "Silva",
  ct: "recife",        // ← Texto claro
  st: "pe",            // ← Texto claro
  zp: "50010000",      // ← Texto claro
  country: "br",       // ← Texto claro
  fbp: "fb.1.123...",
  fbc: "fb.1.456..."
});
```

**CAPI user_data**:
```json
{
  "em": ["hash_sha256_email"],
  "ph": ["hash_sha256_phone"],
  "fn": ["hash_sha256_firstname"],
  "ln": ["hash_sha256_lastname"],
  "ct": ["a1b2c3d4e5f6..."],  // ← SHA-256 de "recife"
  "st": ["f6e5d4c3b2a1..."],  // ← SHA-256 de "pe"
  "zp": ["123abc456def..."],  // ← SHA-256 de "50010000"
  "country": ["789ghi012jkl..."],  // ← SHA-256 de "br"
  "fbp": "fb.1.123...",
  "fbc": "fb.1.456...",
  "client_ip_address": "192.168.1.1",
  "client_user_agent": "Mozilla/5.0..."
}
```

---

## 9. Critérios de Aceite

### ✅ Browser (Test Events do Pixel)
- [ ] Test Events mostra `ct`, `st`, `zp`, `country` em **Advanced Matching**
- [ ] Valores aparecem quando dados geo estão disponíveis
- [ ] Nenhum erro de Pixel no console
- [ ] Deduplicação (`event_id`) inalterada

### ✅ Server (CAPI Test Events)
- [ ] Test Events lista os mesmos campos em `user_data`
- [ ] Campos estão como **hashes SHA-256** (64 caracteres hex)
- [ ] Log `[PURCHASE-CAPI][GEO] user_data mesclado` presente
- [ ] EMQ (Event Match Quality) aumenta quando geo data disponível

### ✅ Logs
- [ ] `[PURCHASE-CONTEXT][GEO]` mostra normalização
- [ ] `[PURCHASE-BROWSER][GEO] advanced-matching` mostra campos enviados ao Pixel
- [ ] `[PURCHASE-CAPI][GEO] user_data mesclado` mostra campos enviados ao CAPI
- [ ] Nenhum log de erro relacionado a geo

### ✅ Flag
- [ ] Com `ENABLE_GEO_CAPTURE=false`, nenhum campo geo é enviado
- [ ] Sem flag (padrão), campos geo são enviados normalmente
- [ ] Sistema funciona normalmente mesmo sem dados geo

---

## 10. Checklist de Validação

```bash
# 1. Verificar logs do contexto
tail -f logs/app.log | grep '\[PURCHASE-CONTEXT\]\[GEO\]'

# 2. Verificar logs do browser
# No console do navegador:
# [PURCHASE-BROWSER][GEO] advanced-matching { ct: "saopaulo", st: "sp", ... }

# 3. Verificar logs do CAPI
tail -f logs/app.log | grep '\[PURCHASE-CAPI\]\[GEO\]'

# 4. Verificar Test Events (Meta Events Manager)
# Advanced Matching deve mostrar:
# - City (ct)
# - State (st) 
# - Zip (zp)
# - Country (country)

# 5. Verificar EMQ
# Event Match Quality deve mostrar score mais alto
# quando geo data está presente
```

---

## 11. Commits

Seguindo as instruções do usuário:

```bash
# Commit 1: Feature principal
git add server.js MODELO1/WEB/obrigado_purchase_flow.html services/purchaseCapi.js
git commit -m "feat(purchase-geo): expose ct/st/zp/country on browser and send hashed on CAPI

- Backend: Add geo_user_data to /api/purchase/context
- Frontend: Add geo fields to Pixel init userData (plaintext)
- CAPI: Add hashed geo fields to user_data (SHA-256)
- Normalize using processGeoData() from utils/geoNormalization.js
- Respect ENABLE_GEO_CAPTURE flag (enabled by default)"

# Commit 2: Documentação e logs
git add IMPLEMENTACAO_PURCHASE_GEO_DATA.md
git commit -m "chore(logs): add browser/CAPI geo logs on purchase

- Add [PURCHASE-BROWSER][GEO] logs
- Add [PURCHASE-CAPI][GEO] logs  
- Add comprehensive documentation"
```

---

## 12. Observações Importantes

### ✅ Segurança
- ✅ Browser: Dados em **texto claro** (o Pixel hasheia)
- ✅ CAPI: Dados **hasheados com SHA-256** antes do envio
- ✅ Mesma função `hashSha256()` usada para email/phone
- ✅ `fbp`, `fbc`, `client_ip_address`, `client_user_agent` **nunca** são hasheados

### ✅ Compatibilidade
- ✅ Código comentado com `// [PURCHASE-GEO]` para fácil identificação
- ✅ Nenhuma remoção de código existente
- ✅ Funciona mesmo sem dados geo (graceful degradation)
- ✅ Retrocompatível com fluxos existentes

### ✅ Performance
- ✅ Query adicional ao `telegram_users` é rápida (indexed telegram_id)
- ✅ Normalização é em memória (sem I/O)
- ✅ Hashing é computacionalmente barato

### ✅ Manutenibilidade
- ✅ Reutiliza utilities existentes (`processGeoData`, `hashSha256`)
- ✅ Logs detalhados em cada etapa
- ✅ Documentação completa
- ✅ Fácil de desabilitar via flag

---

**Implementado em**: 2025-10-10  
**Por**: Background Agent (Cursor)  
**Status**: ✅ Completo
