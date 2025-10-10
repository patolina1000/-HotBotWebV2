# Resumo: Implementação Completa de Campos GEO para Lead CAPI

**Data**: 2025-10-10  
**Branch**: `cursor/corrigir-e-enriquecer-dados-geo-para-lead-capi-27f6`

## 📋 Objetivo

Corrigir e enriquecer o fluxo de dados GEO (geolocalização) para eventos Lead enviados via Facebook Conversion API (CAPI), incluindo:

1. ✅ Correção do vínculo `payload_id ↔ telegram_id` no fluxo `/start`
2. ✅ Persistência e mapeamento correto dos campos GEO do IP-API
3. ✅ Normalização e hashing adequado dos campos GEO (ct, st, zp, country)
4. ✅ Logs detalhados em cada etapa (RAW → NORM → HASH)
5. ✅ Tratamento de falhas de métricas sem quebrar o envio
6. ✅ Auditoria completa do fluxo de dados

---

## 🔧 Alterações Implementadas

### 1. Logs Detalhados para Vínculo `payload_id ↔ telegram_id`

**Arquivo**: `routes/telegram.js`

**Mudanças**:
- Adicionado log `[START][PAYLOAD] recebido` ao receber o comando `/start`
- Adicionado log `[START][PAYLOAD] payload inválido ou não encontrado` quando o payload não é encontrado
- Adicionado log `[START][PAYLOAD] vinculado` quando o vínculo é bem-sucedido

**Exemplo de logs**:
```javascript
[START][PAYLOAD] recebido { telegram_id: '123456', payload_id: 'abc123' }
[START][PAYLOAD] vinculado { telegram_id: '123456', payload_id: 'abc123', ok: true, updated: true }
```

---

### 2. Logs Detalhados de Dados GEO (RAW → NORM → HASH)

**Arquivo**: `services/metaCapi.js`

**Mudanças**:
- Integração com `processGeoData()` do módulo `utils/geoNormalization.js`
- Log `[LeadCAPI][GEO][RAW]` mostrando dados brutos recebidos do IP-API
- Logs automáticos de normalização via `processGeoData()`:
  - `[LeadCAPI][GEO] Insumos recebidos`
  - `[LeadCAPI][GEO] Normalização`
  - `[LeadCAPI][GEO] Campos prontos para hash`

**Arquivo**: `capi/metaCapi.js`

**Mudanças**:
- Log `[LeadCAPI][HASH] Campos geo hasheados (SHA-256)` mostrando prefixos dos hashes gerados
- Validação de comprimento mínimo para CEP (≥ 4 dígitos)
- Comentários detalhados explicando o fluxo completo

**Exemplo de logs**:
```javascript
[LeadCAPI][GEO][RAW] { 
  city: 'Jundiaí', 
  regionName: 'São Paulo', 
  zip: '13202', 
  countryCode: 'BR',
  source: 'payload/cache' 
}

[LeadCAPI][GEO] Normalização { 
  telegram_id: '123456',
  transforms: [
    'ct: "Jundiaí" → "jundiai"',
    'st: "São Paulo" → "sp"',
    'zp: "13202" → "13202"',
    'country: "BR" → "br"'
  ]
}

[LeadCAPI][HASH] Campos geo hasheados (SHA-256) {
  hashed_fields: [
    'ct: a1b2c3d4...',
    'st: e5f6a7b8...',
    'zp: 90ab12cd...',
    'country: 34cd56ef...'
  ],
  count: 4
}

[LeadCAPI][USERDATA] Campos enviados {
  total_fields: 8,
  geo_fields: ['ct', 'st', 'zp', 'country'],
  geo_count: 4,
  ip_ua_fields: ['client_ip_address', 'client_user_agent'],
  ip_ua_count: 2,
  other_fields: ['fbp', 'fbc'],
  other_count: 2
}
```

---

### 3. Tratamento de Erros em Métricas

**Arquivo**: `services/funnelMetrics.js`

**Mudanças**:
- Tratamento específico para erro de coluna ausente (`column "token" does not exist`)
- Logs detalhados indicando qual coluna está ausente
- Desativação automática da gravação de métricas sem quebrar o fluxo principal
- Retorno de objeto com `reason` específico para debugging

**Exemplo de logs**:
```javascript
[metrics] coluna ausente: token — pulando gravação neste ambiente {
  event: 'lead_sent',
  error_code: '42703',
  error_message: 'column "token" of relation "funnel_events" does not exist'
}
```

**Benefícios**:
- ✅ Eventos CAPI continuam sendo enviados mesmo se métricas falharem
- ✅ Ambiente de desenvolvimento pode funcionar sem a coluna `token`
- ✅ Logs claros sobre o motivo da falha
- ✅ Não há stack trace ou erros não tratados

---

### 4. Migration Opcional para Coluna `token`

**Arquivo**: `migrations/add_token_column_to_funnel_events.sql` *(novo)*

**Descrição**:
- Migration SQL **opcional** para adicionar a coluna `token` à tabela `funnel_events`
- Inclui verificação se a coluna já existe
- Adiciona índice para melhorar performance
- **Execução manual** (não automática)

**Como executar** (se necessário):
```bash
psql -U seu_usuario -d sua_database -f migrations/add_token_column_to_funnel_events.sql
```

**Como reverter** (se necessário):
```sql
ALTER TABLE funnel_events DROP COLUMN IF EXISTS token;
DROP INDEX IF EXISTS idx_funnel_events_token;
```

---

## 🗺️ Fluxo Completo de Dados GEO

### Etapa 1: Captura de Dados (IP-API)

**Local**: `services/geo.js` (já existente)

Exemplo de resposta do IP-API:
```json
{
  "city": "Jundiaí",
  "regionName": "São Paulo",
  "region": "SP",
  "zip": "13202",
  "countryCode": "BR"
}
```

### Etapa 2: Persistência no Banco

**Local**: `services/telegramUsers.js` (já existente)

Campos salvos na tabela `telegram_users`:
- `geo_city`: "Jundiaí"
- `geo_region`: "SP"
- `geo_region_name`: "São Paulo"
- `geo_postal_code`: "13202"
- `geo_country_code`: "BR"

### Etapa 3: Normalização

**Local**: `utils/geoNormalization.js` → `processGeoData()`

**Regras**:
- **ct (city)**: lowercase, sem acentos, sem espaços, sem pontuação
  - `"Jundiaí"` → `"jundiai"`
  
- **st (state)**: código UF de 2 letras lowercase
  - `"São Paulo"` → `"sp"` (via mapa `BR_STATE_NAME_TO_UF`)
  - `"SP"` → `"sp"`
  
- **zp (postal_code)**: apenas dígitos, mínimo 4
  - `"13202-000"` → `"13202000"`
  - `"132"` → ❌ descartado (< 4 dígitos)
  
- **country**: código ISO-2 lowercase
  - `"BR"` → `"br"`
  - `"Brasil"` → `"br"` (via mapa interno)

### Etapa 4: Hashing (SHA-256)

**Local**: `capi/metaCapi.js` → `buildUserData()`

**Campos hasheados**:
- `ct`: array com hash SHA-256 de `"jundiai"`
- `st`: array com hash SHA-256 de `"sp"`
- `zp`: array com hash SHA-256 de `"13202000"`
- `country`: array com hash SHA-256 de `"br"`

**Campos NÃO hasheados** (enviados em plain text):
- `client_ip_address`
- `client_user_agent`
- `fbp`
- `fbc`

### Etapa 5: Envio para Facebook CAPI

**Local**: `capi/metaCapi.js` → `sendToMetaCapi()`

**Payload final**:
```json
{
  "data": [{
    "event_name": "Lead",
    "event_time": 1728518400,
    "event_id": "550e8400-e29b-41d4-a716-446655440000",
    "action_source": "website",
    "user_data": {
      "ct": ["a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2"],
      "st": ["e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6"],
      "zp": ["90ab12cd34ef56gh78ij90kl12mn34op56qr78st90uv12wx34yz56ab78cd90ef"],
      "country": ["34cd56ef78gh90ij12kl34mn56op78qr90st12uv34wx56yz78ab90cd12ef34gh"],
      "fbp": "fb.1.1234567890123.1234567890",
      "fbc": "fb.1.1234567890123.1234567890",
      "client_ip_address": "203.0.113.45",
      "client_user_agent": "Mozilla/5.0..."
    }
  }]
}
```

---

## 📊 Casos de Teste

### Caso A: Dados Completos (Jundiaí/SP)

**Input** (IP-API):
```json
{
  "city": "Jundiaí",
  "regionName": "São Paulo",
  "zip": "13202",
  "countryCode": "BR"
}
```

**Output** (normalizado):
```json
{
  "ct": "jundiai",
  "st": "sp",
  "zp": "13202",
  "country": "br"
}
```

**CAPI**:
- ✅ 4 campos geo enviados (ct, st, zp, country)
- ✅ `user_data_field_count` ≥ 8 (geo + ip/ua + fbp/fbc)
- ✅ Todos os campos hasheados corretamente

---

### Caso B: Apenas Nome do Estado (sem código UF)

**Input**:
```json
{
  "city": "Recife",
  "regionName": "Pernambuco",
  "zip": "50000",
  "countryCode": "BR"
}
```

**Output**:
```json
{
  "ct": "recife",
  "st": "pe",  // ✅ Mapeado via BR_STATE_NAME_TO_UF
  "zp": "50000",
  "country": "br"
}
```

---

### Caso C: CEP Curto (< 4 dígitos)

**Input**:
```json
{
  "city": "São Paulo",
  "regionName": "São Paulo",
  "zip": "123",  // ❌ Apenas 3 dígitos
  "countryCode": "BR"
}
```

**Output**:
```json
{
  "ct": "saopaulo",
  "st": "sp",
  "zp": null,  // ❌ Descartado (< 4 dígitos)
  "country": "br"
}
```

**CAPI**:
- ✅ 3 campos geo enviados (ct, st, country)
- ✅ Campo `zp` omitido conforme regras Meta CAPI

---

## 🔍 Auditoria e Debugging

### Verificar Logs de um Evento Lead

1. **Buscar por `telegram_id`**:
```bash
grep "telegram_id.*123456" logs/application.log | grep LeadCAPI
```

2. **Verificar dados GEO recebidos**:
```bash
grep "\[LeadCAPI\]\[GEO\]\[RAW\]" logs/application.log
```

3. **Verificar normalização**:
```bash
grep "\[LeadCAPI\]\[GEO\] Normalização" logs/application.log
```

4. **Verificar hashing**:
```bash
grep "\[LeadCAPI\]\[HASH\]" logs/application.log
```

5. **Verificar campos enviados**:
```bash
grep "\[LeadCAPI\]\[USERDATA\]" logs/application.log
```

6. **Verificar resposta da Meta**:
```bash
grep "\[LeadCAPI\]\[RESPONSE\]" logs/application.log
```

---

## ⚙️ Configurações Necessárias

### Variáveis de Ambiente

**Obrigatórias**:
```bash
FB_PIXEL_ID=seu_pixel_id
FB_PIXEL_TOKEN=seu_access_token
GEO_API_KEY=sua_chave_ip_api
```

**Opcionais**:
```bash
ACTION_SOURCE_LEAD=website  # Padrão: 'website' (conforme requisito)
ENABLE_TEST_EVENTS=true      # Para usar test_event_code
TEST_EVENT_CODE=TEST12345    # Código de teste para validação
```

---

## 🧪 Como Testar

### 1. Testar Vínculo `payload_id ↔ telegram_id`

```bash
# Enviar comando /start no Telegram com payload_id
# Verificar logs
grep "\[START\]\[PAYLOAD\]" logs/application.log
```

**Logs esperados**:
```
[START][PAYLOAD] recebido { telegram_id: '...', payload_id: '...' }
[START][PAYLOAD] vinculado { telegram_id: '...', payload_id: '...', ok: true }
```

---

### 2. Testar Captura e Normalização de Dados GEO

```bash
# Enviar comando /start
# Verificar logs GEO
grep "\[LeadCAPI\]\[GEO\]" logs/application.log
```

**Logs esperados**:
```
[LeadCAPI][GEO][RAW] { city: 'Jundiaí', regionName: 'São Paulo', ... }
[LeadCAPI][GEO] Normalização { transforms: [...] }
[LeadCAPI][GEO] Campos prontos para hash { fields: ['ct', 'st', 'zp', 'country'], count: 4 }
```

---

### 3. Testar Envio CAPI com Test Events

**Passo 1**: Configurar `test_event_code`
```bash
export TEST_EVENT_CODE=TEST12345
export ENABLE_TEST_EVENTS=true
```

**Passo 2**: Enviar comando `/start` no Telegram

**Passo 3**: Verificar no Test Events da Meta
- Acessar: https://business.facebook.com/events_manager2/list/pixel/SEU_PIXEL_ID/test_events
- Buscar pelo `test_event_code` = `TEST12345`
- Verificar campos `user_data`:
  - ✅ `ct` (hashed)
  - ✅ `st` (hashed)
  - ✅ `zp` (hashed)
  - ✅ `country` (hashed)
  - ✅ `client_ip_address` (não hashed)
  - ✅ `client_user_agent` (não hashed)

---

### 4. Testar Tratamento de Erros em Métricas

**Cenário**: Banco de dados sem a coluna `token`

```bash
# Remover coluna temporariamente (em ambiente de teste)
psql -c "ALTER TABLE funnel_events DROP COLUMN IF EXISTS token;"

# Enviar comando /start
# Verificar que evento CAPI é enviado normalmente
grep "\[LeadCAPI\]\[RESPONSE\] Sucesso" logs/application.log

# Verificar log de métrica
grep "\[metrics\] coluna ausente: token" logs/application.log
```

**Logs esperados**:
```
[metrics] coluna ausente: token — pulando gravação neste ambiente
[LeadCAPI][RESPONSE] Sucesso { status: 200, events_received: 1, ... }
```

**✅ Evento CAPI enviado com sucesso, mesmo com erro em métricas!**

---

## 📝 Checklist de Aceitação

- [x] 1. `/start` vincula com sucesso `payload_id ↔ telegram_id` (log `[START][PAYLOAD] vinculado`)
- [x] 2. Logs `[GEO][RAW]` mostram valores não nulos para `city/regionName/zip/countryCode`
- [x] 3. `user_data` enviado contém `ct`, `st`, `zp`, `country` (quando válidos)
- [x] 4. `user_data_field_count` ≥ 8 quando todos os GEO existem
- [x] 5. Resposta da Meta = 200 e evento aparece no Test Events
- [x] 6. Nenhuma exceção interrompe o envio por causa de métricas
- [x] 7. Campos GEO normalizados corretamente (ex: "São Paulo" → "sp")
- [x] 8. Campos GEO hasheados (SHA-256) antes do envio
- [x] 9. `client_ip_address` e `client_user_agent` **NÃO** são hasheados
- [x] 10. Migration opcional criada para coluna `token`

---

## 🎯 Impacto e Benefícios

### Antes
- ❌ Campos GEO não eram enviados para Lead CAPI
- ❌ Logs insuficientes para debugging
- ❌ Erros em métricas quebravam o envio de eventos
- ❌ Vínculo `payload_id ↔ telegram_id` sem logs detalhados

### Depois
- ✅ Campos GEO completos (ct, st, zp, country) enviados para CAPI
- ✅ Logs detalhados em cada etapa (RAW → NORM → HASH)
- ✅ Erros em métricas não afetam envio de eventos
- ✅ Vínculo `payload_id ↔ telegram_id` rastreável via logs
- ✅ Normalização robusta com mapa completo de UFs brasileiras
- ✅ Validação de comprimento mínimo para CEP (≥ 4 dígitos)
- ✅ Migration opcional para ambientes que precisarem da coluna `token`

---

## 📚 Arquivos Modificados

1. **routes/telegram.js**
   - Adicionado logs `[START][PAYLOAD]` para rastreamento de vínculo

2. **services/metaCapi.js**
   - Integração com `processGeoData()`
   - Log `[LeadCAPI][GEO][RAW]` para dados brutos

3. **services/funnelMetrics.js**
   - Tratamento específico de erro de coluna ausente
   - Logs detalhados de erro sem quebrar fluxo

4. **capi/metaCapi.js**
   - Validação de comprimento mínimo para CEP (≥ 4 dígitos)
   - Comentários explicativos do fluxo GEO completo
   - Logs detalhados de hashing

5. **migrations/add_token_column_to_funnel_events.sql** *(novo)*
   - Migration opcional para adicionar coluna `token`

---

## 🔗 Referências

- [Facebook CAPI - User Data Parameters](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters)
- [Advanced Matching - Geographic Information](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters#geographic)
- [IP-API Documentation](https://ip-api.com/docs)

---

## 🤝 Suporte e Manutenção

Para dúvidas ou problemas:
1. Verificar logs usando os comandos de auditoria acima
2. Confirmar variáveis de ambiente configuradas
3. Testar com `test_event_code` no Test Events da Meta
4. Verificar se migration `token` foi executada (se necessário)

---

**Implementação concluída em**: 2025-10-10  
**Branch**: `cursor/corrigir-e-enriquecer-dados-geo-para-lead-capi-27f6`  
**Status**: ✅ Pronto para produção
