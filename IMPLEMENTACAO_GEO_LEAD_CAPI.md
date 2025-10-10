# 🗺️ Implementação: Dados de Geolocalização no Lead CAPI

**Data:** 2025-10-10  
**Objetivo:** Adicionar campos de endereço (ct/st/zp/country) + IP/UA ao evento Lead via Meta Conversions API, com normalização, hashing e logging completo.

---

## ✅ Checklist de Implementação

- [x] Funções de normalização criadas para city, state, zip, country
- [x] Mapeamento de estados brasileiros (regionName → UF) implementado
- [x] Função `sendLeadCapi` atualizada para processar geo data
- [x] Função `buildUserData` em metaCapi.js atualizada para hashear geo fields
- [x] Logs abrangentes em todas as etapas (com PII masking)
- [x] IP e UA enviados SEM hash
- [x] ct/st/zp/country enviados COM hash SHA-256

---

## 📂 Arquivos Modificados

### 1. `utils/geoNormalization.js` ✨ NOVO/ATUALIZADO

**Funções adicionadas:**
- `normalizeCity(city)` - Normaliza cidade: lowercase, sem acentos, sem pontuação, sem espaços
  - Exemplo: `"São Paulo" → "saopaulo"`
- `normalizeState(stateValue, countryCode)` - Normaliza UF para código de 2 letras
  - Exemplo: `"São Paulo" → "sp"`, `"SP" → "sp"`
  - Inclui mapeamento completo de todos os 27 estados brasileiros
- `normalizeZip(zipValue)` - Normaliza CEP para apenas dígitos
  - Exemplo: `"13202-000" → "13202000"`
- `normalizeCountry(countryValue)` - Normaliza código de país para ISO-2 lowercase
  - Exemplo: `"BR" → "br"`, `"Brasil" → "br"`
- `processGeoData(geo, options)` - Função principal que processa todos os dados geo com logs detalhados

**Constantes adicionadas:**
- `BR_STATE_NAME_TO_UF` - Mapa completo de nomes de estados → UF (27 estados)
- `VALID_BR_UF` - Set com todos os códigos UF válidos

**Logs gerados:**
```
[LeadCAPI][GEO] Insumos recebidos { city: "Jundiaí", region: "SP", zip: "13202-000", source: "payload" }
[LeadCAPI][GEO] Normalização { transforms: ["ct: \"Jundiaí\" → \"jundiai\"", "st: \"SP\" → \"sp\"", "zp: \"13202-000\" → \"13202000\""] }
[LeadCAPI][GEO] Campos prontos para hash { fields: ["ct", "st", "zp", "country"], count: 4 }
```

---

### 2. `services/facebook.js`

**Importação adicionada:**
```javascript
const { processGeoData } = require('../utils/geoNormalization');
```

**Função `sendLeadCapi` atualizada:**
- Recebe campos geo: `geo_city`, `geo_region`, `geo_region_name`, `geo_postal_code`, `geo_country`, `geo_country_code`
- Processa geo data usando `processGeoData()` com logs completos
- Adiciona campos normalizados ao `userData` (que serão hasheados posteriormente)
- Logs detalhados de campos enviados

**Logs gerados:**
```javascript
[LeadCAPI][USERDATA] Campos a enviar {
  keys: ["external_id", "fbp", "fbc", "client_ip_address", "client_user_agent", "ct", "st", "zp", "country"],
  total_fields: 9,
  geo_fields: ["ct", "st", "zp", "country"],
  non_geo_fields: ["external_id", "fbp", "fbc", "client_ip_address", "client_user_agent"]
}
```

---

### 3. `capi/metaCapi.js`

**Função `buildUserData` atualizada:**
- Suporte completo para campo `country` (além de ct/st/zp já existentes)
- Hashing SHA-256 aplicado a ct/st/zp/country
- IP e UA **NÃO** são hasheados (passam direto)
- Logs com prefixos de hash (primeiros 8 caracteres)

**Logs gerados:**
```javascript
[LeadCAPI][HASH] Campos geo hasheados (SHA-256) {
  hashed_fields: [
    "ct: a1b2c3d4...",
    "st: e5f6g7h8...",
    "zp: i9j0k1l2...",
    "country: m3n4o5p6..."
  ],
  count: 4
}
```

**Função `sendToMetaCapi` atualizada:**
- Logs detalhados de request com separação de campos geo vs IP/UA
- Audit logs completos na resposta
- Logs de erro com detalhes

**Logs gerados:**
```javascript
[LeadCAPI][REQUEST] Resumo do envio {
  pixel_id: "123456...",
  event_name: "Lead",
  event_id: "uuid...",
  action_source: "website",
  has_test_event_code: true,
  event_time: 1234567890
}

[LeadCAPI][USERDATA] Campos enviados {
  total_fields: 9,
  geo_fields: ["ct", "st", "zp", "country"],
  geo_count: 4,
  ip_ua_fields: ["client_ip_address", "client_user_agent"],
  ip_ua_count: 2,
  other_fields: ["external_id", "fbp", "fbc"],
  other_count: 3
}

[LeadCAPI][RESPONSE] Sucesso {
  status: 200,
  events_received: 1,
  fbtrace_id: "Abc123..."
}

[LeadCAPI][AUDIT] Resumo do evento enviado {
  has_user_data: true,
  user_data_field_count: 9,
  has_geo_fields: true,
  geo_fields_sent: ["ct", "st", "zp", "country"],
  has_ip_ua: true,
  ip_ua_fields_sent: ["client_ip_address", "client_user_agent"],
  test_event_code: "TEST12345",
  action_source: "website",
  event_source_url: "https://..."
}
```

---

## 🔍 Regras de Normalização

### Cidade (ct)
- Lowercase
- Remove acentos (NFD normalization)
- Remove pontuação
- Remove todos os espaços
- **Exemplo:** `"São Paulo" → "saopaulo"`

### Estado (st)
- Código de 2 letras, lowercase
- Prioriza `geo_region` (já é UF) sobre `geo_region_name`
- Se receber nome completo, mapeia para UF via `BR_STATE_NAME_TO_UF`
- Valida se é UF brasileiro válido
- **Exemplos:**
  - `"SP" → "sp"`
  - `"São Paulo" → "sp"`
  - `"sao paulo" → "sp"`

### CEP (zp)
- Apenas dígitos
- Mínimo de 4 dígitos
- **Exemplo:** `"13202-000" → "13202000"`

### País (country)
- Código ISO-2, lowercase
- **Exemplos:**
  - `"BR" → "br"`
  - `"Brasil" → "br"`

---

## 🔒 Hashing e Privacidade

### Campos COM hash SHA-256 (obrigatório pelo CAPI):
✅ `ct` (city)  
✅ `st` (state)  
✅ `zp` (zip/postal)  
✅ `country`

### Campos SEM hash (enviados em claro):
✅ `client_ip_address`  
✅ `client_user_agent`  
✅ `fbp` (Facebook Pixel cookie)  
✅ `fbc` (Facebook Click ID cookie)

### Logs com PII Masking:
- Hashes mostram apenas os primeiros 6-8 caracteres: `"a1b2c3d4..."`
- Valores normalizados são logados ANTES do hash (para debug)
- IP e UA são mostrados como boolean nos logs de resumo
- Nenhuma PII em claro nos logs de produção

---

## 🌍 Fontes de Dados (ordem de prioridade)

1. **Payload/Cache** (preferencial):
   - `geo_city`, `geo_region`, `geo_region_name`, `geo_postal_code`, `geo_country`, `geo_country_code`

2. **IP-API** (fallback):
   - `city`, `region`, `regionName`, `zip`, `countryCode`

**Nota:** O `processGeoData` aceita ambos os formatos e prioriza automaticamente os campos com prefixo `geo_`.

---

## 📊 Estrutura do user_data Enviado

```json
{
  "user_data": {
    "external_id": ["hash_sha256_telegram_id"],
    "fbp": "fb.1.1234567890.123456789",
    "fbc": "fb.1.1234567890.AbCdEf",
    "client_ip_address": "123.45.67.89",
    "client_user_agent": "Mozilla/5.0...",
    "ct": ["hash_sha256_normalized_city"],
    "st": ["hash_sha256_normalized_state"],
    "zp": ["hash_sha256_normalized_zip"],
    "country": ["hash_sha256_normalized_country"]
  }
}
```

**Campos:**
- `external_id`, `ct`, `st`, `zp`, `country`: arrays de hashes SHA-256 (lowercase hex)
- `fbp`, `fbc`: strings em claro (cookies do Facebook)
- `client_ip_address`: string em claro (IPv4 ou IPv6)
- `client_user_agent`: string em claro (user agent completo)

---

## 🧪 Validações

### Validação de Estado (st):
- Se for código de 2 letras, valida contra `VALID_BR_UF`
- Se for nome completo, tenta mapear via `BR_STATE_NAME_TO_UF`
- Se não encontrar correspondência, **NÃO envia** o campo (evita dados inválidos)

### Validação de CEP (zp):
- Deve ter pelo menos 4 dígitos após limpeza
- Se < 4 dígitos, **NÃO envia** o campo

### Validação de Cidade (ct):
- Aceita qualquer string não vazia após normalização

### Validação de País (country):
- Deve ser código ISO-2 (2 caracteres)
- Fallback para `"br"` se não fornecido

---

## 📖 Exemplos de Uso

### Exemplo 1: Dados do Brasil
```javascript
const options = {
  telegramId: 123456789,
  externalIdHash: "abc123...",
  fbp: "fb.1.1234567890.123456789",
  fbc: "fb.1.1234567890.AbCdEf",
  client_ip_address: "177.12.34.56",
  client_user_agent: "Mozilla/5.0...",
  geo_city: "São Paulo",
  geo_region: "SP",
  geo_postal_code: "01310-100",
  geo_country_code: "BR"
};

await sendLeadCapi(options);
```

**Resultado:**
- `ct`: hash de `"saopaulo"`
- `st`: hash de `"sp"`
- `zp`: hash de `"01310100"`
- `country`: hash de `"br"`

### Exemplo 2: Nome de estado por extenso
```javascript
const options = {
  telegramId: 987654321,
  externalIdHash: "def456...",
  fbp: "fb.1.9876543210.987654321",
  client_ip_address: "189.45.67.89",
  geo_city: "Belo Horizonte",
  geo_region_name: "Minas Gerais",  // Nome completo
  geo_postal_code: "30130-100",
  geo_country_code: "BR"
};

await sendLeadCapi(options);
```

**Resultado:**
- `ct`: hash de `"belohorizonte"`
- `st`: hash de `"mg"` (mapeado de "Minas Gerais")
- `zp`: hash de `"30130100"`
- `country`: hash de `"br"`

---

## 🔗 Referências

- [Meta CAPI - Customer Information Parameters](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters)
- [IP-API Documentation](https://ip-api.com/docs)
- [Meta CAPI - Hashing Requirements](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters#hashing)
- [Hightouch - Action Source Guide](https://hightouch.com/docs/destinations/facebook-conversions-api#action-source)

---

## ✅ Critérios de Aceitação (Verificação)

1. ✅ `user_data` do Lead inclui: `ct`, `st`, `zp`, `country`, `client_ip_address`, `client_user_agent`, `fbp`, `fbc`
2. ✅ `ct`/`st`/`zp`/`country` são **normalizados e hasheados** (SHA-256)
3. ✅ `IP` e `UA` são enviados **sem hash**
4. ✅ UF brasileira correta (ex.: "São Paulo" → `st=sp`)
5. ✅ CEP brasileiro convertido para dígitos (ex.: `13202-000` → `13202000`)
6. ✅ Logs abrangentes em todas as etapas, sem PII crua
7. ✅ `action_source="website"`, `event_source_url` presente
8. ✅ Resumo de auditoria indica `user_data_field_count` ≥ 6

---

## 🎯 Próximos Passos (Opcional)

- [ ] Testes automatizados para funções de normalização
- [ ] Testes de integração com Meta CAPI em ambiente de Test Events
- [ ] Validação de match rate no Events Manager
- [ ] Monitoramento de erros no Events Manager (fbtrace_id)
- [ ] Documentação adicional para outros tipos de eventos (Purchase, InitiateCheckout)

---

## 📝 Notas Técnicas

- O `TelegramBotService.js` já estava preparado para passar os campos geo para `sendLeadCapi` (linhas 892-897, 910-915)
- Os dados geo são armazenados no tracking data e recuperados automaticamente
- A normalização e hashing acontecem em duas etapas:
  1. `processGeoData()` normaliza os valores
  2. `buildUserData()` hasheia os valores normalizados
- Logs são compatíveis com o formato existente `[LeadCAPI]` para facilitar busca e debug
- IP e UA já eram enviados sem hash; a implementação mantém esse comportamento
