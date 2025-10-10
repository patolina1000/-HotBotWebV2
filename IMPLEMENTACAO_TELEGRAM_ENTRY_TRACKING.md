# Implementação: Captura e Persistência de _fbc/_fbp para Entrada via Telegram

**Data:** 2025-10-10  
**Objetivo:** Capturar e persistir cookies do Facebook (_fbc/_fbp) antes de abrir o bot do Telegram, garantindo rastreamento completo para eventos CAPI (Lead e Purchase).

---

## 📋 Resumo da Implementação

### 1. Migração SQL
**Arquivo:** `migrations/012_add_telegram_entry_fields.sql`

Adiciona 8 colunas à tabela `payloads` para armazenar dados capturados na página `/telegram`:

```sql
ALTER TABLE payloads ADD COLUMN IF NOT EXISTS telegram_entry_at TIMESTAMPTZ;
ALTER TABLE payloads ADD COLUMN IF NOT EXISTS telegram_entry_fbc TEXT;
ALTER TABLE payloads ADD COLUMN IF NOT EXISTS telegram_entry_fbp TEXT;
ALTER TABLE payloads ADD COLUMN IF NOT EXISTS telegram_entry_fbclid TEXT;
ALTER TABLE payloads ADD COLUMN IF NOT EXISTS telegram_entry_user_agent TEXT;
ALTER TABLE payloads ADD COLUMN IF NOT EXISTS telegram_entry_event_source_url TEXT;
ALTER TABLE payloads ADD COLUMN IF NOT EXISTS telegram_entry_referrer TEXT;
ALTER TABLE payloads ADD COLUMN IF NOT EXISTS telegram_entry_ip TEXT;
```

**Executar migração:**
```bash
psql $DATABASE_URL < migrations/012_add_telegram_entry_fields.sql
```

---

### 2. Backend - Endpoint de Persistência
**Arquivo:** `server.js` (linhas ~3014-3109)

**Endpoint:** `POST /api/payload/telegram-entry`

**Request Body:**
```json
{
  "payload_id": "abc123",
  "fbc": "fb.1.1728576000000.abcd1234",
  "fbp": "fb.1.1728000000000.1234567890",
  "fbclid": "IwAR...",
  "user_agent": "Mozilla/5.0...",
  "event_source_url": "https://ohvips.xyz/telegram?start=abc123",
  "referrer": "https://example.com"
}
```

**Comportamento:**
- Valida `payload_id` obrigatório
- **Upsert inteligente**: se payload_id não existe, cria novo registro; se existe, atualiza somente campos vazios (prioriza dados da presell)
- Feature flag: `ENABLE_TELEGRAM_REDIRECT_CAPTURE` (default: true)
- Captura IP automaticamente via `extractClientIp(req)`

**Logs:**
```
[PAYLOAD] telegram-entry payload_id=abc123 fbc=fb.1.1728576000000... fbp=fb.1.1728000000... ip=203.0.113.45
```

---

### 3. Frontend - Captura no Browser
**Arquivo:** `MODELO1/WEB/telegram/app.js` (linhas ~107-645)

**Funcionalidades adicionadas:**

#### 3.1. Funções auxiliares
```javascript
getQueryParam(name)           // Ler parâmetros da URL
buildFbcFromFbclid(fbclid)   // Construir _fbc a partir de fbclid
```

#### 3.2. Fluxo de captura (na função `triggerRedirect`)

```javascript
// 1. Ler parâmetros
const startParam = getQueryParam('start');  // payload_id
const fbclidParam = getQueryParam('fbclid');

// 2. Resolver _fbc
let resolvedFbc = getRawFbc();  // Cookie existente

if (!resolvedFbc && fbclidParam) {
  resolvedFbc = buildFbcFromFbclid(fbclidParam);  // "fb.1.{timestamp}.{fbclid}"
  setCookie('_fbc', resolvedFbc, 30);  // Setar cookie (30 dias)
}

// 3. Resolver _fbp
const resolvedFbp = getRawFbp();  // Cookie existente

// 4. Persistir no backend
await fetch('/api/payload/telegram-entry', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ payload_id, fbc, fbp, fbclid, user_agent, event_source_url, referrer })
});

// 5. Redirecionar (timeout 900ms para não bloquear)
window.location.href = `tg://resolve?domain=${BOT}&start=${payload_id}`;
```

**Logs no console do browser:**
```
[TELEGRAM-PAGE] start=abc123 fbclid=IwAR...
[TELEGRAM-PAGE] _fbc construído a partir de fbclid e setado em cookie
[TELEGRAM-PAGE] fbc_resolved=true fbc=fb.1.1728576000000.abcd1234 fbp=fb.1.1728000000.1234567890
[TELEGRAM-PAGE] persisted ok payload_id=abc123
```

---

### 4. Service de Payloads
**Arquivo:** `services/payloads.js` (linhas ~31-40)

Query `getPayloadById` atualizada para incluir campos `telegram_entry_*`:

```javascript
SELECT payload_id, utm_source, utm_medium, utm_campaign, utm_term,
       utm_content, fbp, fbc, ip, user_agent, kwai_click_id,
       telegram_entry_at, telegram_entry_fbc, telegram_entry_fbp, telegram_entry_fbclid,
       telegram_entry_user_agent, telegram_entry_event_source_url, 
       telegram_entry_referrer, telegram_entry_ip
  FROM payloads
 WHERE payload_id = $1
```

---

### 5. Webhook /start - Merge de Dados
**Arquivo:** `routes/telegram.js` (linhas ~323-366)

**Merge inteligente no webhook do Telegram:**

```javascript
// Priorizar dados da presell, fallback para telegram_entry
const mergedFbp = storedPayload.fbp || storedPayload.telegram_entry_fbp || null;
const mergedFbc = storedPayload.fbc || storedPayload.telegram_entry_fbc || null;
const mergedFbclid = storedPayload.telegram_entry_fbclid || null;
const mergedIp = storedPayload.ip || storedPayload.telegram_entry_ip || null;
const mergedUserAgent = storedPayload.user_agent || storedPayload.telegram_entry_user_agent || null;
```

**Logs:**
```
[BOT-START] payload_id=abc123 telegram_id=123456789
[MERGE] fbc=fb.1.1728576000000... source=telegram-entry
[MERGE] fbp=fb.1.1728000000... source=presell
[MERGE] fbclid=IwAR... source=telegram-entry
```

---

### 6. Eventos CAPI - Logs Obrigatórios

#### 6.1. Lead CAPI
**Arquivo:** `services/metaCapi.js` (linha ~513)

```javascript
console.log(`[LEAD-CAPI] user_data.fbc=${fbc || 'vazio'} fbp=${fbp || 'vazio'} event_id=${attemptEventId}`);
```

#### 6.2. Purchase CAPI
**Arquivo:** `services/purchaseCapi.js` (linha ~352) - **Já existente**

```javascript
console.log(`[PURCHASE-CAPI] user_data.fbc=${userData.fbc || 'vazio'} fbp=${userData.fbp || 'vazio'} event_id=${resolvedEventId}`);
```

---

### 7. Rota /telegram - Log de Acesso
**Arquivo:** `server.js` (linhas ~4754-4760)

```javascript
console.log('[STATIC] route=/telegram', 
            'file=MODELO1/WEB/telegram/index.html',
            'start=', startParam || 'vazio',
            'fbclid=', fbclidParam || 'vazio');
```

---

## 🧪 Testes Manuais

### Cenário 1: Entrada via Telegram com fbclid
1. Acessar: `https://ohvips.xyz/telegram?start=test123&fbclid=IwAR_test`
2. **Verificar console do browser:**
   - `[TELEGRAM-PAGE] start=test123 fbclid=IwAR_test`
   - `[TELEGRAM-PAGE] _fbc construído a partir de fbclid e setado em cookie`
   - `[TELEGRAM-PAGE] fbc_resolved=true fbc=fb.1... fbp=fb.1...`
   - `[TELEGRAM-PAGE] persisted ok payload_id=test123`
3. **Verificar logs do backend:**
   - `[STATIC] route=/telegram file=MODELO1/WEB/telegram/index.html start=test123 fbclid=IwAR_test`
   - `[PAYLOAD] telegram-entry payload_id=test123 fbc=fb.1... fbp=... ip=203.0.113.45`
4. **Abrir bot no Telegram:** clicar em "Iniciar" ou `/start test123`
5. **Verificar logs do backend:**
   - `[BOT-START] payload_id=test123 telegram_id=123456789`
   - `[MERGE] fbc=fb.1... source=telegram-entry`
   - `[MERGE] fbp=fb.1... source=telegram-entry`
   - `[LEAD-CAPI] user_data.fbc=fb.1... fbp=fb.1... event_id=...`

### Cenário 2: Purchase CAPI
1. Completar compra após passar pelo fluxo acima
2. **Verificar logs:**
   - `[PURCHASE-CAPI] user_data.fbc=fb.1... fbp=fb.1... event_id=...`

### Cenário 3: Fallback quando presell já tem fbc/fbp
1. Criar payload na presell: `POST /api/gerar-payload` com fbc/fbp
2. Acessar: `https://ohvips.xyz/telegram?start={payload_id}`
3. **Verificar merge:**
   - `[MERGE] fbc=fb.1... source=presell` (prioridade)
   - `[MERGE] fbp=fb.1... source=presell`

---

## ⚙️ Configuração

### Variáveis de ambiente
```bash
ENABLE_TELEGRAM_REDIRECT_CAPTURE=true  # Feature flag (default: true)
BOT1_USERNAME=seu_bot                  # Username do bot (obrigatório)
```

### Desabilitar captura (se necessário)
```bash
ENABLE_TELEGRAM_REDIRECT_CAPTURE=false
```

**Logs quando desabilitado:**
```
[PAYLOAD] telegram-entry: ENABLE_TELEGRAM_REDIRECT_CAPTURE=false, persistência desabilitada
```

---

## 📊 Estrutura de Dados

### Tabela `payloads` (após migração)

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `payload_id` | TEXT | ID único do payload (PK) |
| `fbp` | TEXT | Cookie _fbp da presell |
| `fbc` | TEXT | Cookie _fbc da presell |
| `telegram_entry_at` | TIMESTAMPTZ | Timestamp da entrada via /telegram |
| `telegram_entry_fbc` | TEXT | Cookie _fbc capturado em /telegram |
| `telegram_entry_fbp` | TEXT | Cookie _fbp capturado em /telegram |
| `telegram_entry_fbclid` | TEXT | Parâmetro fbclid da URL |
| `telegram_entry_user_agent` | TEXT | User agent do browser |
| `telegram_entry_event_source_url` | TEXT | URL completa da página /telegram |
| `telegram_entry_referrer` | TEXT | Referrer (de onde veio) |
| `telegram_entry_ip` | TEXT | IP capturado no backend |

---

## 🔍 Prioridade de Dados (Merge)

Quando o bot recebe `/start {payload_id}`, o merge funciona assim:

```
fbc  = payload.fbc (presell) || payload.telegram_entry_fbc || null
fbp  = payload.fbp (presell) || payload.telegram_entry_fbp || null
ip   = payload.ip (presell)  || payload.telegram_entry_ip  || null
ua   = payload.user_agent     || payload.telegram_entry_user_agent || null
```

**Lógica:** sempre prioriza dados da presell (se existirem), senão usa telegram_entry, senão null.

---

## 📝 Salvaguardas Implementadas

1. ✅ **Idempotência**: múltiplos hits em `/telegram` não quebram (sempre upsert)
2. ✅ **Nunca gerar fbc sem fbclid**: só constrói se `fbclid` existir na URL
3. ✅ **Timeout de 900ms**: persistência não bloqueia redirecionamento
4. ✅ **Logs claros**: todos os eventos têm logs com `[TELEGRAM-PAGE]`, `[PAYLOAD]`, `[BOT-START]`, `[MERGE]`, `[LEAD-CAPI]`, `[PURCHASE-CAPI]`
5. ✅ **Feature flag**: `ENABLE_TELEGRAM_REDIRECT_CAPTURE` para desabilitar se necessário
6. ✅ **Nenhum código removido**: apenas comentado com `// [CODEX]` quando substituído

---

## 🚀 Deploy

1. **Executar migração SQL:**
   ```bash
   psql $DATABASE_URL < migrations/012_add_telegram_entry_fields.sql
   ```

2. **Reiniciar servidor:**
   ```bash
   pm2 restart all
   # ou
   systemctl restart seu-servico
   ```

3. **Verificar logs na inicialização:**
   ```
   [MIGRATION] Colunas telegram_entry_* adicionadas à tabela payloads
   [STATIC] root=/workspace/MODELO1/WEB route=/
   ```

---

## 📚 Arquivos Modificados

1. `migrations/012_add_telegram_entry_fields.sql` - **NOVO**
2. `server.js` - Rota POST /api/payload/telegram-entry + logs
3. `MODELO1/WEB/telegram/app.js` - Captura fbc/fbp + persistência
4. `services/payloads.js` - Query com campos telegram_entry_*
5. `routes/telegram.js` - Merge inteligente no webhook /start
6. `services/metaCapi.js` - Log obrigatório de fbc/fbp no Lead CAPI

---

## ✅ Checklist de Aceite

- [x] Migração SQL criada e idempotente
- [x] Endpoint POST /api/payload/telegram-entry funcionando
- [x] Frontend captura _fbc/_fbp e persiste via API
- [x] _fbc construído a partir de fbclid quando necessário
- [x] Merge no webhook /start prioriza presell sobre telegram_entry
- [x] Lead CAPI recebe fbc/fbp
- [x] Purchase CAPI recebe fbc/fbp
- [x] Logs claros em todas as etapas
- [x] Feature flag ENABLE_TELEGRAM_REDIRECT_CAPTURE
- [x] Timeout de 900ms para não bloquear redirecionamento
- [x] Código antigo comentado (não removido)

---

## 🐛 Troubleshooting

### Problema: Persistência não ocorre
**Sintoma:** Não aparece log `[TELEGRAM-PAGE] persisted ok`

**Verificar:**
1. Feature flag: `ENABLE_TELEGRAM_REDIRECT_CAPTURE=true`
2. Migração executada: `SELECT column_name FROM information_schema.columns WHERE table_name='payloads' AND column_name LIKE 'telegram_entry%';`
3. Endpoint acessível: `curl -X POST http://localhost:3000/api/payload/telegram-entry -H 'Content-Type: application/json' -d '{"payload_id":"test"}'`

### Problema: Merge não usa telegram_entry
**Sintoma:** Log mostra `source=vazio` em vez de `source=telegram-entry`

**Verificar:**
1. Query do service: `services/payloads.js` deve incluir campos `telegram_entry_*`
2. Dados persistidos: `SELECT telegram_entry_fbc, telegram_entry_fbp FROM payloads WHERE payload_id='test123';`

### Problema: CAPI não recebe fbc/fbp
**Sintoma:** Log mostra `[LEAD-CAPI] user_data.fbc=vazio fbp=vazio`

**Verificar:**
1. Merge no webhook: deve aparecer `[MERGE] fbc=... source=...`
2. Dados no payload: verificar query acima
3. Service metaCapi: `buildUserData` deve incluir `fbc` e `fbp`

---

**Fim da documentação**
