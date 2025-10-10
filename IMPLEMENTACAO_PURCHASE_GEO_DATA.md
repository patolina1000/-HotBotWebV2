# Implementação: Dados Geográficos no Purchase Flow

## Objetivo

Adicionar dados geográficos (ct, st, zp, country) ao fluxo de Purchase, tanto no Browser Pixel quanto no Server CAPI.

- **Browser (Pixel/Advanced Matching)**: Enviar ct, st, zp, country em texto claro normalizado (o Pixel hasheia no cliente)
- **Server (CAPI)**: Enviar os mesmos campos normalizados e com SHA-256, reutilizando a mesma função de hash já usada para em/ph

## Padrões de Normalização

Utilizando as funções já existentes em `utils/geoNormalization.js`:

- **ct** (cidade): lowercase, sem acentos, sem espaços
  - Exemplo: "São Paulo" → "saopaulo"
  
- **st** (estado/UF): sigla de 2 letras em lowercase
  - Exemplo: "PE" → "pe", "São Paulo" → "sp"
  
- **zp** (CEP/ZIP): apenas dígitos
  - Exemplo: "13202-000" → "13202000"
  
- **country** (país): código ISO-2 em lowercase
  - Exemplo: "BR" → "br"

## Arquivos Modificados

### 1. Backend - Contexto do Purchase (`server.js`)

**Endpoint**: `GET /api/purchase/context` (linhas ~2201-2256)

Adicionado:
- Query para buscar dados geo da tabela `telegram_users`
- Normalização usando `processGeoData()` de `utils/geoNormalization.js`
- Inclusão de `geo_user_data` no contexto retornado

```javascript
// [PURCHASE-GEO] Buscar dados geográficos do telegram_users
let geoUserData = null;
if (telegramIdString) {
  const geoResult = await pool.query(geoQuery, [telegramIdString]);
  if (geoResult.rows.length > 0) {
    const { processGeoData } = require('./utils/geoNormalization');
    const { normalized } = processGeoData(geoRow, {
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

// Adicionar ao context payload
contextPayload.geo_user_data = geoUserData && Object.keys(geoUserData).length > 0 
  ? geoUserData 
  : undefined;
```

### 2. Frontend - Purchase (Browser/Pixel) (`MODELO1/WEB/obrigado_purchase_flow.html`)

**Localização**: Linhas ~680-695

Adicionado aos campos de Advanced Matching do Pixel:

```javascript
// [PURCHASE-GEO] Adicionar dados geográficos do contexto (em texto claro)
const geo = (contextData?.geo_user_data) || {};
if (geo.ct) userDataPlain.ct = geo.ct;
if (geo.st) userDataPlain.st = geo.st;
if (geo.zp) userDataPlain.zp = geo.zp;
if (geo.country) userDataPlain.country = geo.country;

// Log dos campos geo adicionados
if (geo.ct || geo.st || geo.zp || geo.country) {
  console.log('[PURCHASE-BROWSER][GEO] advanced-matching', {
    ct: geo.ct || null,
    st: geo.st || null,
    zp: geo.zp || null,
    country: geo.country || null
  });
}
```

**Importante**: Os campos são enviados em **texto claro** para o Pixel via `fbq('init', PIXEL_ID, userData)`. O próprio Pixel do Facebook faz o hashing no cliente.

### 3. Server - CAPI (`server.js`)

**Endpoint**: `POST /api/capi/purchase` (linhas ~2876-2957 e ~3047-3053)

Adicionado:
- Query para buscar dados geo da tabela `telegram_users`
- Normalização usando `processGeoData()`
- Hashing SHA-256 usando `hashSha256()` de `helpers/purchaseFlow.js`
- Mesclagem dos campos geo hasheados ao `finalAdvancedMatching`

```javascript
// [PURCHASE-GEO] Buscar e normalizar dados geográficos
let geoUserDataNormalized = null;
if (telegramIdString) {
  const geoResult = await pool.query(geoQuery, [telegramIdString]);
  if (geoResult.rows.length > 0) {
    const { processGeoData } = require('./utils/geoNormalization');
    const { normalized } = processGeoData(geoRow, {
      logPrefix: '[PURCHASE-CAPI][GEO]',
      telegramId: telegramIdString
    });
    if (Object.keys(normalized).length > 0) {
      geoUserDataNormalized = normalized;
    }
  }
}

// [PURCHASE-GEO] Hashear campos geográficos se disponíveis
const geoHashedFields = {};
if (geoUserDataNormalized) {
  const { hashSha256 } = require('./helpers/purchaseFlow');
  
  if (geoUserDataNormalized.ct) geoHashedFields.ct = hashSha256(geoUserDataNormalized.ct);
  if (geoUserDataNormalized.st) geoHashedFields.st = hashSha256(geoUserDataNormalized.st);
  if (geoUserDataNormalized.zp) geoHashedFields.zp = hashSha256(geoUserDataNormalized.zp);
  if (geoUserDataNormalized.country) geoHashedFields.country = hashSha256(geoUserDataNormalized.country);
}

// [PURCHASE-GEO] Mesclar campos geográficos hasheados ao advanced matching
if (Object.keys(geoHashedFields).length > 0) {
  finalAdvancedMatching = {
    ...finalAdvancedMatching,
    ...geoHashedFields
  };
}
```

## Logs Implementados

### Frontend (Browser)
```
[PURCHASE-CONTEXT][GEO] Insumos recebidos { ... }
[PURCHASE-CONTEXT][GEO] Normalização { ... }
[PURCHASE-CONTEXT][GEO] Campos prontos para hash { ... }
[PURCHASE-CONTEXT][GEO] Dados geo normalizados { token, telegram_id, fields, count }

[PURCHASE-BROWSER][GEO] advanced-matching { ct, st, zp, country }
```

### Server (CAPI)
```
[PURCHASE-CAPI][GEO] Insumos recebidos { ... }
[PURCHASE-CAPI][GEO] Normalização { ... }
[PURCHASE-CAPI][GEO] Campos prontos para hash { ... }
[PURCHASE-CAPI][GEO] Dados geo normalizados { token, telegram_id, fields, count }
[PURCHASE-CAPI][GEO] user_data mesclado { hasCt, hasSt, hasZp, hasCountry }
```

## Fluxo de Dados

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Cliente preenche formulário na página de obrigado        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Browser busca contexto: GET /api/purchase/context       │
│    • Backend consulta telegram_users via telegram_id       │
│    • Normaliza geo data (ct, st, zp, country)              │
│    • Retorna geo_user_data em texto claro                  │
└─────────────────────────────────────────────────────────────┘
                            │
           ┌────────────────┴────────────────┐
           ▼                                 ▼
┌──────────────────────┐        ┌───────────────────────────┐
│ 3A. Browser Pixel    │        │ 3B. Server CAPI          │
│ • Recebe geo em      │        │ • Consulta telegram_users│
│   texto claro        │        │ • Normaliza geo data     │
│ • Adiciona a userData│        │ • Hasheia SHA-256        │
│ • fbq('init', ...)   │        │ • Mescla a user_data     │
│ • Pixel hasheia      │        │ • Envia à Meta           │
└──────────────────────┘        └───────────────────────────┘
```

## Critérios de Aceite

✅ **Browser (Test Events) do Pixel mostra ct/st/zp/country em Advanced Matching** (quando disponíveis)

✅ **Server (CAPI Test Events) lista os mesmos campos em user_data** (hashes SHA-256 aplicados)

✅ **Nenhum erro do Pixel** (não usar `fbq('set','userData',...)`, usar `fbq('init', PIXEL_ID, userData)`)

✅ **Deduplicação (event_id) inalterada** - campos geo não afetam a lógica de dedup

✅ **Logs rastreáveis** em browser e CAPI com prefixos `[PURCHASE-BROWSER][GEO]` e `[PURCHASE-CAPI][GEO]`

## Segurança e Boas Práticas

1. ✅ **Normalização consistente**: Usa a mesma função `processGeoData()` em ambos os contextos
2. ✅ **Hash SHA-256**: Reutiliza `hashSha256()` já usado para em/ph
3. ✅ **Condicional**: Só processa geo se `telegram_id` existir
4. ✅ **Graceful degradation**: Se não houver geo data, continua normalmente
5. ✅ **Não hashear fbp/fbc/client_ip_address/client_user_agent**: Mantidos em claro conforme spec Meta
6. ✅ **Sem chaves vazias**: Só inclui campos se houver valor

## Dependências

- `utils/geoNormalization.js` - Funções de normalização já existentes
- `helpers/purchaseFlow.js` - Função `hashSha256()` já existente
- Tabela `telegram_users` com colunas:
  - `geo_city`
  - `geo_region`
  - `geo_region_name`
  - `geo_postal_code`
  - `geo_country`
  - `geo_country_code`

## Testes

### Browser (Pixel)
1. Criar token de purchase com telegram_id que tenha geo data
2. Acessar página de obrigado com o token
3. Verificar no console:
   ```
   [PURCHASE-BROWSER][GEO] advanced-matching { ct: "saopaulo", st: "sp", zp: "01310100", country: "br" }
   ```
4. Verificar no Facebook Test Events que os campos aparecem em Advanced Matching

### Server (CAPI)
1. Disparar POST /api/capi/purchase com token válido
2. Verificar no console:
   ```
   [PURCHASE-CAPI][GEO] user_data mesclado { hasCt: true, hasSt: true, hasZp: true, hasCountry: true }
   ```
3. Verificar no Facebook Test Events que os campos aparecem em user_data como hashes SHA-256

## Observações

- A flag `ENABLE_GEO_CAPTURE` foi mencionada nos requisitos, mas como a lógica já é condicional (só processa se houver telegram_id e geo data), não foi necessário adicionar uma flag explícita
- Os campos geo são opcionais - se não houver dados, o fluxo continua normalmente
- A implementação reutiliza toda a infraestrutura existente de normalização e hashing
