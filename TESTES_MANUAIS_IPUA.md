# 🧪 Guia de Testes Manuais - IP/UA no CAPI

## 🎯 Objetivo

Validar que o sistema de captura, persistência e envio de IP/User-Agent funciona corretamente em todos os pontos do funil: presell → Telegram /start → webhook de pagamento → página de obrigado.

---

## 🛠️ Ferramentas Necessárias

- **cURL** ou **Postman**
- **PostgreSQL Client** (psql, DBeaver, pgAdmin)
- **Facebook Events Manager** (Test Events)
- Acesso aos **logs** da aplicação

---

## 1️⃣ Teste: Presell → Criar Payload

### 📝 Objetivo
Validar que o IP e User-Agent são capturados e persistidos na criação do payload.

### 🔧 Comando cURL
```bash
curl -X POST https://seu-app.com/api/gerar-payload \
  -H "Content-Type: application/json" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
  -d '{
    "utm_source": "facebook",
    "utm_medium": "cpc",
    "utm_campaign": "teste-ipua",
    "fbp": "fb.1.1234567890.9876543210",
    "fbc": "fb.1.1234567890.IwAR123abc",
    "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
  }'
```

### ✅ Resposta Esperada
```json
{
  "payload_id": "abc123def456"
}
```

### 🔍 Verificação no Banco
```sql
SELECT 
  payload_id,
  ip,
  user_agent,
  utm_source,
  fbp,
  created_at
FROM payloads
WHERE payload_id = 'abc123def456';
```

### ✅ Critérios de Aceite
- [x] `ip` está preenchido (ex: `203.0.113.45`)
- [x] `user_agent` está preenchido (começa com `Mozilla/5.0`)
- [x] `utm_source` = `'facebook'`
- [x] `fbp` está presente

### 📊 Logs Esperados
```
[payload] Novo payload salvo: abc123def456
```

---

## 2️⃣ Teste: Telegram /start → Lead CAPI

### 📝 Objetivo
Validar que o Lead CAPI é enviado com IP/UA recuperados do payload, e que os logs [CAPI-IPUA] aparecem.

### 🔧 Comando cURL
```bash
curl -X POST https://seu-app.com/telegram/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "from": {
        "id": 123456789,
        "first_name": "João",
        "username": "joao_teste"
      },
      "chat": {"id": 123456789},
      "text": "/start abc123def456"
    }
  }'
```
*Obs: Substitua `abc123def456` pelo `payload_id` do teste anterior.*

### ✅ Resposta Esperada
```json
{
  "ok": true,
  "event_name": "Lead",
  "event_id": "...",
  "capi": true,
  "has_min_user_data": true
}
```

### 🔍 Verificação no Banco
```sql
SELECT 
  telegram_id,
  ip_capturado,
  ua_capturado,
  fbp,
  utm_source,
  criado_em
FROM telegram_users
WHERE telegram_id = 123456789;
```

### ✅ Critérios de Aceite
- [x] `ip_capturado` está preenchido
- [x] `ua_capturado` está preenchido
- [x] Lead enviado ao Facebook (capi: true)

### 📊 Logs Esperados
```
[CAPI-IPUA] origem=chat ip=203.0.113.45 ua_present=true
[CAPI-IPUA] user_data aplicado { client_ip_address: "203.0.113.45", client_user_agent_present: true }
[CAPI-IPUA] Fallback aplicado (tracking) ip=203.0.113.45 ua_present=true
[Meta CAPI] Lead enviado com sucesso
```

### 🎯 Validação no Facebook
1. Acesse: https://business.facebook.com/events_manager2/list/pixel/[SEU_PIXEL_ID]/test_events
2. Procure pelo evento Lead recente
3. Verifique:
   - ✅ `client_ip_address` presente
   - ✅ `client_user_agent` presente
   - ✅ Status: Aceito ✅
   - ✅ Sem warnings

---

## 3️⃣ Teste: Webhook → Purchase CAPI (com fallback)

### 📝 Objetivo
Validar que o Purchase CAPI usa fallback de IP/UA quando disparado via webhook (sem request de browser).

### 🔧 Pré-requisito
Crie uma transação no banco manualmente:
```sql
INSERT INTO tokens (
  id_transacao, token, telegram_id, valor, price_cents, 
  ip_criacao, user_agent_criacao, status, criado_em
) VALUES (
  'txn_test_123', 'tok_test_123', '123456789', 97.00, 9700,
  '203.0.113.45', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  'pendente', NOW()
);
```

### 🔧 Comando cURL
```bash
curl -X POST https://seu-app.com/webhook/pushinpay \
  -H "Content-Type: application/json" \
  -d '{
    "id": "txn_test_123",
    "status": "paid",
    "value": 9700,
    "payer_name": "João Silva",
    "payer_national_registration": "12345678901",
    "end_to_end_id": "E12345678202501080000000001"
  }'
```

### ✅ Resposta Esperada
```
200 OK
```

### 📊 Logs Esperados
```
[CAPI-IPUA] Tentando fallback para IP/UA... { identifiers: { transaction_id: 'txn_test_123', ... } }
[TRACKING-FALLBACK] Dados encontrados em tokens
[TRACKING-FALLBACK] Usando dados mais recentes de telegram_users
[CAPI-IPUA] Fallback aplicado (tracking) ip=203.0.113.45 ua_present=true source=transaction_id
[CAPI-IPUA] origem=webhook ip=203.0.113.45 ua_present=true
[CAPI-IPUA] user_data aplicado { client_ip_address: "203.0.113.45", client_user_agent_present: true }
[Meta CAPI] response:summary { status: 200, events_received: 1, ... }
```

### 🎯 Validação no Facebook
1. Acesse Test Events
2. Procure pelo evento Purchase recente
3. Verifique:
   - ✅ `client_ip_address` = `203.0.113.45`
   - ✅ `client_user_agent` presente
   - ✅ `value` = `97.00`
   - ✅ `currency` = `BRL`
   - ✅ Status: Aceito ✅

---

## 4️⃣ Teste: Página Obrigado → Purchase CAPI (website)

### 📝 Objetivo
Validar que o Purchase CAPI usa IP/UA da request atual quando vem do website.

### 🔧 Comando cURL
```bash
curl -X POST https://seu-app.com/api/capi/purchase \
  -H "Content-Type: application/json" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" \
  -H "X-Forwarded-For: 198.51.100.42" \
  -d '{
    "token": "tok_test_456",
    "email": "joao@example.com",
    "phone": "11987654321",
    "first_name": "João",
    "last_name": "Silva"
  }'
```
*Obs: Este endpoint pode variar dependendo da sua implementação.*

### 📊 Logs Esperados
```
[CAPI-IPUA] origem=website ip=198.51.100.42 ua_present=true
[CAPI-IPUA] user_data aplicado { client_ip_address: "198.51.100.42", client_user_agent_present: true }
[Meta CAPI] response:summary { status: 200, events_received: 1, ... }
```

**Nota:** Observe que o fallback **NÃO** foi tentado, pois o IP/UA vieram da request.

### 🎯 Validação no Facebook
1. Acesse Test Events
2. Procure pelo evento Purchase recente
3. Verifique:
   - ✅ `client_ip_address` = `198.51.100.42` (da request)
   - ✅ `client_user_agent` presente (da request)
   - ✅ Status: Aceito ✅

---

## 🚨 Teste de Cenário de Erro: IP/UA Não Encontrados

### 📝 Objetivo
Validar que o sistema não bloqueia o envio mesmo quando IP/UA não são encontrados.

### 🔧 Pré-requisito
Crie uma transação sem IP/UA:
```sql
INSERT INTO tokens (
  id_transacao, token, valor, price_cents, status, criado_em
) VALUES (
  'txn_sem_ipua', 'tok_sem_ipua', 97.00, 9700, 'pendente', NOW()
);
```

### 🔧 Comando cURL
```bash
curl -X POST https://seu-app.com/webhook/pushinpay \
  -H "Content-Type: application/json" \
  -d '{
    "id": "txn_sem_ipua",
    "status": "paid",
    "value": 9700,
    "payer_name": "Maria Santos",
    "payer_national_registration": "98765432100"
  }'
```

### 📊 Logs Esperados
```
[CAPI-IPUA] Tentando fallback para IP/UA...
[TRACKING-FALLBACK] Nenhum dado encontrado para transaction_id
[CAPI-IPUA] ⚠️ Fallback não encontrou dados de tracking
[CAPI-IPUA] origem=webhook ip=vazio ua_present=false
[CAPI-IPUA] user_data aplicado { client_ip_address: "vazio", client_user_agent_present: false }
[Meta CAPI] response:summary { status: 200, events_received: 1, ... }
```

### ✅ Critérios de Aceite
- [x] Warning foi logado
- [x] Evento foi enviado mesmo assim (não bloqueou)
- [x] Facebook aceitou o evento (pode ter Match Quality menor)

---

## 📊 Resumo dos Logs por Origem

| Origem | Log Padrão | Fallback? |
|--------|------------|-----------|
| **chat** | `[CAPI-IPUA] origem=chat` | ✅ Sim (busca payload) |
| **webhook** | `[CAPI-IPUA] origem=webhook` | ✅ Sim (busca tokens/telegram_users) |
| **website** | `[CAPI-IPUA] origem=website` | ❌ Não (usa request) |

---

## 🔍 Queries Úteis para Debug

### 1. Últimos payloads criados
```sql
SELECT payload_id, ip, user_agent, utm_source, created_at
FROM payloads
ORDER BY created_at DESC
LIMIT 10;
```

### 2. Últimos usuários Telegram com tracking
```sql
SELECT telegram_id, ip_capturado, ua_capturado, utm_source, criado_em
FROM telegram_users
ORDER BY criado_em DESC
LIMIT 10;
```

### 3. Transações com dados de pagamento
```sql
SELECT 
  id_transacao, 
  telegram_id, 
  ip_criacao, 
  user_agent_criacao,
  payer_name,
  status,
  criado_em
FROM tokens
WHERE status = 'pendente'
ORDER BY criado_em DESC
LIMIT 10;
```

### 4. Buscar tracking por telegram_id
```sql
SELECT * FROM telegram_users WHERE telegram_id = 123456789;
```

### 5. Buscar transação por ID
```sql
SELECT * FROM tokens WHERE id_transacao = 'txn_test_123';
```

---

## 🎯 Validação Completa no Facebook Events Manager

### Passo a Passo:

1. **Acesse o Events Manager:**
   ```
   https://business.facebook.com/events_manager2/list/pixel/[SEU_PIXEL_ID]/test_events
   ```

2. **Configure Test Events (se usando):**
   - Cole o `TEST_EVENT_CODE` da env
   - Ou envie via header: `X-Test-Event-Code: seu_codigo`

3. **Envie os 4 testes acima**

4. **Verifique cada evento:**
   - ✅ Status: Verde (aceito)
   - ✅ Match Quality: 7-10 (alto)
   - ✅ `client_ip_address`: Presente
   - ✅ `client_user_agent`: Presente
   - ✅ Outros parâmetros: fbp, fbc, UTMs

5. **Sem Warnings:**
   - ❌ "Missing client_ip_address"
   - ❌ "Missing client_user_agent"

---

## ✅ Checklist Final de Testes

### Funcionalidades
- [ ] Teste 1: Presell - Payload criado com IP/UA ✅
- [ ] Teste 2: Lead - Enviado com IP/UA do fallback ✅
- [ ] Teste 3: Purchase (webhook) - Enviado com fallback ✅
- [ ] Teste 4: Purchase (website) - Enviado com IP/UA da request ✅
- [ ] Teste 5: Erro - Sistema não bloqueia envio ✅

### Logs
- [ ] Logs `[CAPI-IPUA]` aparecem em todos os cenários
- [ ] Logs `[TRACKING-FALLBACK]` aparecem quando necessário
- [ ] Warnings apropriados quando IP/UA ausentes

### Facebook
- [ ] Todos os eventos aceitos no Events Manager
- [ ] IP e UA presentes nos eventos
- [ ] Match Quality alto (7-10)
- [ ] Sem warnings críticos

### Banco de Dados
- [ ] Payloads salvos com IP/UA
- [ ] Telegram_users salvos com IP/UA
- [ ] Tokens relacionados corretamente

---

## 🚀 Próximos Passos

Após todos os testes passarem:
1. ✅ Deploy em staging
2. ✅ Testes em staging com dados reais
3. ✅ Validação com equipe QA
4. ✅ Deploy em produção
5. ✅ Monitoramento por 24h

---

**Data:** 2025-01-08  
**Versão:** 1.0  
**Autor:** Background Agent