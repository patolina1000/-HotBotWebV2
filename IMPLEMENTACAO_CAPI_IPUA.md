# Implementação de IP/UA no CAPI

## 📋 Resumo

Implementação completa de captura, persistência e envio de `client_ip_address` e `client_user_agent` no Facebook Conversion API (CAPI), garantindo que esses dados estejam disponíveis mesmo quando o evento não nasce de uma requisição de navegador.

## 🎯 Objetivos Alcançados

✅ **Captura na presell**: IP e User-Agent são capturados no backend durante a criação do payload  
✅ **Persistência**: Dados são armazenados nas tabelas `payloads` e `telegram_users`  
✅ **Fallback inteligente**: Sistema busca IP/UA históricos quando não disponíveis na request atual  
✅ **Logs obrigatórios**: Todos os envios CAPI registram `[CAPI-IPUA]` com origem e presença de dados  
✅ **Sem hash**: IP e UA são sempre enviados em texto puro ao Facebook  
✅ **Sem regressões**: Nenhuma alteração em `action_source`, funções públicas ou fluxos existentes  

## 📂 Arquivos Modificados

### 1. `/services/metaCapi.js`
**Modificações:**
- Adicionados logs `[CAPI-IPUA]` em `sendLeadEvent` (linhas 356-365)
- Adicionados logs `[CAPI-IPUA]` em `sendInitiateCheckoutEvent` (linhas 211-216)
- Logs incluem: origem do evento, presença de IP/UA, e user_agent truncado

**Exemplo de log:**
```javascript
[CAPI-IPUA] origem=chat ip=192.168.1.1 ua_present=true
[CAPI-IPUA] user_data aplicado { client_ip_address: "192.168.1.1", client_user_agent_present: true }
[CAPI-IPUA] Fallback aplicado (tracking) ip=192.168.1.1 ua_present=true
```

### 2. `/services/purchaseCapi.js`
**Modificações:**
- Importação do helper `getTrackingFallback` (linha 4)
- Novos parâmetros aceitos: `telegram_id`, `payload_id`, `origin` (linhas 68-72)
- Lógica de fallback implementada (linhas 125-174)
- Logs `[CAPI-IPUA]` completos (linhas 169, 173, 428)
- Detecção de origem do evento (website/webhook/chat)

**Fluxo de fallback:**
1. Verifica se IP/UA vieram da request atual
2. Se origem é webhook/chat e dados estão ausentes, busca fallback
3. Prioridade: `transaction_id` → `telegram_id` → `payload_id`
4. Loga se fallback foi aplicado e de qual fonte

**Exemplo de log:**
```javascript
[CAPI-IPUA] Tentando fallback para IP/UA...
[TRACKING-FALLBACK] Dados encontrados em telegram_users
[CAPI-IPUA] Fallback aplicado (tracking) ip=192.168.1.1 ua_present=true source=telegram_id
[CAPI-IPUA] origem=webhook ip=192.168.1.1 ua_present=true
[CAPI-IPUA] user_data aplicado { client_ip_address: "192.168.1.1", client_user_agent_present: true }
```

### 3. `/helpers/trackingFallback.js` (NOVO)
**Funções criadas:**
- `getTrackingByTelegramId(telegramId)` - Busca em `telegram_users` e `tracking_data`
- `getTrackingByTransactionId(transactionId)` - Busca em `tokens`, depois em `telegram_users`
- `getTrackingByPayloadId(payloadId)` - Busca em `payloads`
- `getTrackingFallback({ transaction_id, telegram_id, payload_id })` - Tenta múltiplas fontes em ordem de prioridade

**Prioridade de busca:**
1. `transaction_id` → tabela `tokens` (mais completo, inclui dados do pagamento)
2. `telegram_id` → tabela `telegram_users` (dados do /start do Telegram)
3. `payload_id` → tabela `payloads` (dados originais da presell)

## 🔄 Fluxo Completo

### 1️⃣ Presell (Captura)
```
Endpoint: POST /api/gerar-payload
├─ Front envia: user_agent (opcional), UTMs, fbp, fbc
├─ Backend captura:
│  ├─ IP: headers['x-forwarded-for'] || connection.remoteAddress
│  └─ UA: body.user_agent || headers['user-agent']
└─ Persiste em: tabela `payloads` (colunas `ip`, `user_agent`)
```

**Arquivo:** `/workspace/server.js` linhas 2694-2792  
**Status:** ✅ JÁ IMPLEMENTADO (não alterado)

### 2️⃣ Telegram /start (Lead)
```
Endpoint: POST /telegram/webhook
├─ Busca payload_id em: tabela `payloads`
├─ Extrai IP/UA do payload
├─ Persiste em: tabela `telegram_users` (ip_capturado, ua_capturado)
└─ Envia Lead CAPI com IP/UA
    └─ Log: [CAPI-IPUA] origem=chat
```

**Arquivo:** `/workspace/routes/telegram.js` linhas 269-382  
**Status:** ✅ JÁ IMPLEMENTADO (não alterado, apenas logs adicionados)

### 3️⃣ Webhook de Pagamento (Purchase)
```
Endpoint: POST /webhook/pushinpay
├─ Recebe: transaction_id, payer_name, payer_cpf, value
├─ Busca token em: tabela `tokens`
├─ Envia Purchase CAPI:
│  ├─ IP/UA da request? → Usa direto
│  └─ Senão → Fallback:
│     ├─ Busca por transaction_id → tokens + telegram_users
│     ├─ Busca por telegram_id → telegram_users
│     └─ Log: [CAPI-IPUA] Fallback aplicado
└─ Log: [CAPI-IPUA] origem=webhook
```

**Arquivo:** `/workspace/services/purchaseCapi.js` linhas 125-174  
**Status:** ✅ IMPLEMENTADO (modificado)

### 4️⃣ Página de Obrigado (Purchase)
```
Página: /obrigado
├─ Browser envia: event_id, transaction_id, email, phone, IP/UA da request
├─ Origin: 'website' ou 'obrigado'
└─ Purchase CAPI usa IP/UA da request atual
    └─ Log: [CAPI-IPUA] origem=website
```

**Arquivo:** `/workspace/services/purchaseCapi.js` linhas 132-136  
**Status:** ✅ IMPLEMENTADO (modificado)

## 📊 Tabelas e Colunas

### `payloads` (presell)
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `payload_id` | TEXT | ID único do payload |
| `ip` | TEXT | IP capturado no backend |
| `user_agent` | TEXT | User-Agent do navegador |
| `fbp`, `fbc` | TEXT | Cookies do Facebook |
| `utm_*` | TEXT | Parâmetros UTM |
| `created_at` | TIMESTAMP | Data de criação |

### `telegram_users` (Telegram /start)
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `telegram_id` | BIGINT | ID do usuário no Telegram |
| `ip_capturado` | TEXT | IP histórico (do payload) |
| `ua_capturado` | TEXT | User-Agent histórico |
| `fbp`, `fbc` | TEXT | Cookies do Facebook |
| `utm_*` | TEXT | Parâmetros UTM |
| `criado_em` | TIMESTAMP | Data do /start |

### `tokens` (transações)
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id_transacao` | TEXT | ID da transação |
| `telegram_id` | TEXT | ID do Telegram |
| `ip_criacao` | TEXT | IP na criação |
| `user_agent_criacao` | TEXT | User-Agent na criação |
| `payer_name`, `payer_cpf` | TEXT | Dados do pagamento |

## 🔍 Logs Implementados

### Lead (origem: chat)
```
[CAPI-IPUA] origem=chat ip=192.168.1.1 ua_present=true
[CAPI-IPUA] user_data aplicado { client_ip_address: "192.168.1.1", client_user_agent_present: true }
[CAPI-IPUA] Fallback aplicado (tracking) ip=192.168.1.1 ua_present=true
```

### Purchase (origem: webhook)
```
[CAPI-IPUA] Tentando fallback para IP/UA... { identifiers: {...} }
[TRACKING-FALLBACK] Dados encontrados em tokens
[TRACKING-FALLBACK] Usando dados mais recentes de telegram_users
[CAPI-IPUA] Fallback aplicado (tracking) ip=192.168.1.1 ua_present=true source=transaction_id
[CAPI-IPUA] origem=webhook ip=192.168.1.1 ua_present=true
[CAPI-IPUA] user_data aplicado { client_ip_address: "192.168.1.1", client_user_agent_present: true }
```

### Purchase (origem: website)
```
[CAPI-IPUA] origem=website ip=192.168.1.1 ua_present=true
[CAPI-IPUA] user_data aplicado { client_ip_address: "192.168.1.1", client_user_agent_present: true }
```

### Warning (UA ausente em website)
```
⚠️ [CAPI-IPUA] UA ausente em website; fallback tentado=sim
```

## ✅ Validações Implementadas

### 1. IP/UA não são hasheados
**Arquivo:** `/workspace/capi/metaCapi.js` linhas 317-323

```javascript
if (raw.client_ip_address || raw.clientIpAddress) {
  userData.client_ip_address = raw.client_ip_address || raw.clientIpAddress;
}

if (raw.client_user_agent || raw.clientUserAgent) {
  userData.client_user_agent = raw.client_user_agent || raw.clientUserAgent;
}
```

✅ IP e UA são copiados diretamente, SEM `hashSha256()`  
✅ Campos como `em`, `ph`, `fn`, `ln`, `external_id` continuam hasheados  

### 2. Action source não foi alterado
- Lead: `action_source = 'chat'` (conforme env `ACTION_SOURCE_LEAD`)
- InitiateCheckout: `action_source = 'website'`
- Purchase: `action_source = 'website'`

### 3. Funções públicas não foram renomeadas
- `sendLeadEvent()` → mantido
- `sendInitiateCheckoutEvent()` → mantido
- `sendPurchaseEvent()` → mantido
- `buildUserData()` → mantido

### 4. Fallback não bloqueia envio
- Se IP/UA não forem encontrados, o evento é enviado mesmo assim
- Log de warning é emitido: `[CAPI-IPUA] ⚠️ Fallback não encontrou dados de tracking`

## 📝 Testes Manuais

### Teste 1: Presell → Criar Payload
**Endpoint:** `POST /api/gerar-payload`

**Payload:**
```json
{
  "utm_source": "facebook",
  "utm_campaign": "teste-ipua",
  "fbp": "fb.1.12345.67890",
  "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
}
```

**Verificação:**
1. Consultar tabela `payloads`:
```sql
SELECT payload_id, ip, user_agent FROM payloads ORDER BY created_at DESC LIMIT 1;
```
2. Confirmar que `ip` e `user_agent` estão preenchidos

**Critério de aceite:**
✅ IP vem de `x-forwarded-for` ou `remoteAddress`  
✅ UA vem de `body.user_agent` ou `headers['user-agent']`

---

### Teste 2: Lead (Telegram /start)
**Endpoint:** `POST /telegram/webhook`

**Payload:**
```json
{
  "message": {
    "from": { "id": 123456789 },
    "text": "/start abc123def456"
  }
}
```
(onde `abc123def456` é um `payload_id` válido)

**Verificação:**
1. Buscar em logs:
```
[CAPI-IPUA] origem=chat ip=... ua_present=true
[CAPI-IPUA] user_data aplicado { client_ip_address: "...", client_user_agent_present: true }
```
2. Consultar tabela `telegram_users`:
```sql
SELECT telegram_id, ip_capturado, ua_capturado FROM telegram_users WHERE telegram_id = 123456789;
```

**Critério de aceite:**
✅ Logs `[CAPI-IPUA]` presentes  
✅ `ip_capturado` e `ua_capturado` persistidos  
✅ Lead enviado ao Facebook sem warnings

---

### Teste 3: Purchase (webhook)
**Endpoint:** `POST /webhook/pushinpay`

**Payload:**
```json
{
  "id": "txn_123456",
  "status": "paid",
  "value": 9700,
  "payer_name": "João Silva",
  "payer_national_registration": "12345678901"
}
```

**Verificação:**
1. Buscar em logs:
```
[CAPI-IPUA] Tentando fallback para IP/UA...
[TRACKING-FALLBACK] Dados encontrados em...
[CAPI-IPUA] Fallback aplicado (tracking) ip=... ua_present=true source=...
[CAPI-IPUA] origem=webhook ip=... ua_present=true
[CAPI-IPUA] user_data aplicado { client_ip_address: "...", client_user_agent_present: true }
```

**Critério de aceite:**
✅ Fallback tentado e aplicado  
✅ Logs evidenciam fonte do fallback (transaction_id, telegram_id ou payload_id)  
✅ Purchase enviado ao Facebook sem warnings de IP/UA

---

### Teste 4: Purchase (página web)
**Endpoint:** `POST /api/capi/purchase` (ou similar)

**Payload:**
```json
{
  "origin": "obrigado",
  "transaction_id": "txn_123456",
  "email": "joao@example.com",
  "phone": "11987654321",
  "client_ip_address": "203.0.113.45",
  "client_user_agent": "Mozilla/5.0..."
}
```

**Verificação:**
1. Buscar em logs:
```
[CAPI-IPUA] origem=website ip=203.0.113.45 ua_present=true
[CAPI-IPUA] user_data aplicado { client_ip_address: "203.0.113.45", client_user_agent_present: true }
```
2. Confirmar que fallback NÃO foi tentado (IP/UA vieram da request)

**Critério de aceite:**
✅ IP/UA da request atual usados  
✅ Fallback não foi acionado  
✅ Purchase enviado ao Facebook sem warnings

---

## 🚨 Cenários de Erro e Warnings

### 1. IP/UA não encontrados em nenhum lugar
**Log:**
```
[CAPI-IPUA] Tentando fallback para IP/UA...
[TRACKING-FALLBACK] Nenhum dado encontrado para transaction_id
[TRACKING-FALLBACK] Nenhum dado encontrado para telegram_id
[CAPI-IPUA] ⚠️ Fallback não encontrou dados de tracking
[CAPI-IPUA] origem=webhook ip=vazio ua_present=false
[CAPI-IPUA] user_data aplicado { client_ip_address: "vazio", client_user_agent_present: false }
```

**Comportamento:** Evento é enviado mesmo assim (não bloqueia)

---

### 2. UA ausente em origem website
**Log:**
```
⚠️ [CAPI-IPUA] UA ausente em website; fallback tentado=sim
```

**Causa provável:** Navegador bloqueou envio do User-Agent, ou front não enviou

---

### 3. Pool PostgreSQL indisponível
**Log:**
```
[TRACKING-FALLBACK] Pool PostgreSQL não disponível
[CAPI-IPUA] ⚠️ Fallback não encontrou dados de tracking
```

**Comportamento:** Fallback retorna `{ ip: null, user_agent: null }`

---

## 📊 Validação no Events Manager

Após cada teste, verificar no Facebook Events Manager (Test Events):

1. **Evento aceito:** Status verde ✅
2. **Matched Parameters:**
   - `client_ip_address` presente
   - `client_user_agent` presente
3. **Warnings:** Nenhum warning relacionado a IP/UA
4. **Event Match Quality:** Alta (devido a IP/UA + outros parâmetros)

---

## 🎉 Conclusão

A implementação está **completa e pronta para produção**. Todos os requisitos foram atendidos:

✅ IP e UA capturados na presell  
✅ Dados persistidos em múltiplas tabelas  
✅ Fallback inteligente implementado  
✅ Logs obrigatórios presentes  
✅ IP/UA enviados sem hash  
✅ Nenhuma regressão introduzida  
✅ Documentação completa criada  

---

## 📚 Referências

- **Facebook CAPI Docs:** https://developers.facebook.com/docs/marketing-api/conversions-api
- **User Data Parameters:** https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
- **Server-Side Events:** https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api

---

**Data de Implementação:** 2025-01-08  
**Versão:** 1.0  
**Autor:** Background Agent (Cursor AI)