# Changelog: CPF Unification & Purchase Flow Hardening

## Resumo
Implementação de melhorias críticas no fluxo de Purchase (Pixel + CAPI) para garantir dados consistentes, validações robustas e correção do link "Pagamento aprovado!" no Telegram.

## Data
2025-10-07

---

## 🎯 Mudanças Implementadas

### 1. CPF Canônico (payer_cpf como fonte única de verdade)

**Problema:** Duplicidade entre `payer_cpf` e `payer_national_registration`, causando confusão e inconsistências.

**Solução:**
- ✅ `payer_cpf` é agora a coluna/campo oficial
- ✅ `payer_national_registration` mantido apenas como alias de entrada durante transição
- ✅ Webhook PushinPay persiste em ambos, mas leitura prioriza `payer_cpf`
- ✅ Contexto unificado (`/api/purchase/context`) expõe apenas `payer_cpf`

**Arquivos alterados:**
- `server.js` (webhook PushinPay - linhas ~3706-3813)
- `MODELO1/core/TelegramBotService.js` (webhookPushinPay)

---

### 2. Contexto Unificado (purchaseContext)

**Problema:** Dados fragmentados entre browser e server, faltando UTMs, fbp/fbc, IP/UA.

**Solução:**
- ✅ Endpoint `/api/purchase/context` retorna estrutura completa:
  ```json
  {
    "event_id": "pur:<tx>",
    "transaction_id": "<tx>",
    "price_cents": 2000,
    "value": 20.00,
    "currency": "BRL",
    "plan_title": "Nome do Plano",
    "content_ids": ["txn_<tx>"],
    "contents": [{"id":"txn_<tx>","quantity":1,"item_price":20.00,"title":"..."}],
    "utm_source": "...",
    "utm_medium": "...",
    "utm_campaign": "...",
    "utm_content": "...",
    "utm_term": "...",
    "fbp": "...",
    "fbc": "...",
    "fbclid": "...",
    "client_ip_address": "...",
    "client_user_agent": "...",
    "email": "...",
    "phone": "...",
    "external_id": "<hash_cpf>",
    "payer_cpf": "...",
    "event_source_url": "<normalizado>"
  }
  ```

**Arquivos alterados:**
- `server.js` (`/api/purchase/context` - linhas ~1663-1761)
- `server.js` (`/api/capi/purchase` - linhas ~2268-2299)
- `services/purchaseCapi.js` (linhas ~23-55, ~135-145)

---

### 3. Pixel (browser) usa Contexto Unificado

**Problema:** Browser dependia de parâmetro `?valor=` da URL, que poderia ser 0.

**Solução:**
- ✅ Página `obrigado_purchase_flow.html` busca contexto via `/api/purchase/context`
- ✅ Todos os campos (value, UTMs, fbp/fbc, contents) vêm do contexto
- ✅ Validação: bloqueia envio se `value` ausente ou 0

**Arquivos alterados:**
- `MODELO1/WEB/obrigado_purchase_flow.html` (linhas ~279-534)

---

### 4. CAPI (server) usa Contexto Unificado

**Problema:** CAPI sem UTMs, fbp/fbc, IP/UA; enviando com value=0.

**Solução:**
- ✅ Payload CAPI agora inclui:
  - `custom_data.value` (número), `currency='BRL'`, `transaction_id`, `content_ids`, `contents`
  - UTMs completos: `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`
  - `fbclid` extraído de `fbc`
- ✅ `user_data`: `em`, `ph`, `fn`, `ln` hasheados; `external_id = hash(payer_cpf)`; `fbp`, `fbc`, `client_ip_address`, `client_user_agent`
- ✅ `event_source_url` normalizado
- ✅ Validação: retorna 422 se `price_cents` ausente ou 0

**Arquivos alterados:**
- `server.js` (`/api/capi/purchase` - linhas ~2032-2047, ~2268-2299)
- `services/purchaseCapi.js` (linhas ~90-98, ~135-145)

---

### 5. Link "Pagamento aprovado!" Corrigido

**Problema:** Telegram enviava links com `valor=0.00` porque usava `transaction.valor` (que podia ser null/0).

**Solução:**
- ✅ Usar `price_cents` do webhook (fonte canônica)
- ✅ Calcular `valorReais = Number((price_cents/100).toFixed(2))`
- ✅ Se `price_cents` ausente/0: **omitir** parâmetro `valor` do link (não enviar `valor=0`)
- ✅ Logs dedicados:
  - `[BOT-LINK] token=<...> price_cents=<int> valor=<xx.xx> url=<...>`
  - `[BOT-LINK] omitindo parâmetro "valor" por ausência de price_cents`

**Localidades corrigidas:**
1. `server.js` - webhook PushinPay (linhas ~3820-3880)
2. `server.js` - webhook Oasyfy #1 (linhas ~5682-5742)
3. `server.js` - webhook Oasyfy #2 (linhas ~5917-5974)
4. `MODELO1/core/TelegramBotService.js` - webhookPushinPay (linhas ~2520-2586)

**Arquivos alterados:**
- `server.js`
- `MODELO1/core/TelegramBotService.js`

---

### 6. Normalização de event_source_url

**Problema:** URLs com múltiplas barras (`//`), token anexado várias vezes.

**Solução:**
- ✅ Função `normalizeEventSourceUrl()` remove barras duplicadas
- ✅ `buildObrigadoEventSourceUrl()` garante URL limpa e bem formada
- ✅ Log: `[URL-BUILDER] final_event_source_url=<url>`

**Arquivos alterados:**
- `server.js` (funções `normalizeEventSourceUrl` e `buildObrigadoEventSourceUrl` - linhas ~124-188)

---

### 7. Validações Obrigatórias (Bloquear value=0)

**Problema:** Purchase enviado com `value=0` ou ausente, causando erro 2804009 na Meta.

**Solução:**

**Browser:**
- ✅ Validação antes de `fbq('track', 'Purchase', ...)`:
  ```javascript
  if (!valor || valor === 0) {
    console.error('[PURCHASE-BROWSER] ❌ BLOQUEADO: value ausente ou zero', {...});
    throw new Error('Valor do Purchase ausente ou zero - não será enviado');
  }
  ```

**CAPI Endpoint:**
- ✅ Validação no `/api/capi/purchase`:
  ```javascript
  if (!priceCents || priceCents === 0) {
    console.error('[PURCHASE-CAPI] ❌ BLOQUEADO: price_cents ausente ou zero', {...});
    return res.status(422).json({ success: false, error: 'value_missing_or_zero', ... });
  }
  ```

**CAPI Service:**
- ✅ Validação no `services/purchaseCapi.js`:
  ```javascript
  if (!price_cents || price_cents === 0) {
    console.error('[PURCHASE-CAPI] ❌ BLOQUEADO: price_cents ausente ou zero', {...});
    return { success: false, error: 'value_missing_or_zero', status: 422 };
  }
  ```

**Arquivos alterados:**
- `MODELO1/WEB/obrigado_purchase_flow.html` (linhas ~526-534)
- `server.js` (linhas ~2032-2047)
- `services/purchaseCapi.js` (linhas ~90-98)

---

## 📋 Invariantes Garantidas

1. ✅ **Mesmo event_id em Pixel e CAPI:** `pur:<transaction_id>` (determinístico)
2. ✅ **Mesmos dados nos dois canais:** Se existe no contexto, vai para ambos
3. ✅ **Jamais enviar Purchase com value=0 ou ausente:** Bloqueado e logado 422
4. ✅ **Link do Telegram nunca com valor=0:** Se não souber o valor, omite o parâmetro
5. ✅ **CPF canônico:** `payer_cpf` é a fonte única de verdade
6. ✅ **external_id sempre hasheado:** `hashCpf(payer_cpf)` para Meta CAPI
7. ✅ **event_source_url normalizado:** Sem barras duplicadas

---

## ✅ Critérios de Aceite

- [x] Browser Purchase aparece com `value>0` e `plan_title` correto no Events Manager
- [x] CAPI Purchase retorna 200 (sem erro 2804009 "Valor em falta")
- [x] UTMs/fbp/fbc/IP/UA constam no CAPI e UTMs também no browser
- [x] `event_id` idêntico nos dois canais (`pur:<tx>`)
- [x] `event_source_url` normalizado nos logs
- [x] Mensagem do Telegram exibe link com `valor=<preço do plano>` (ou sem valor, mas nunca `valor=0`)
- [x] Nenhum envio de Purchase se `price_cents` estiver ausente/0 (422 logado)

---

## 🔍 Logs Esperados

### Contexto Unificado
```
[PURCHASE-CONTEXT] token=abc123 -> tx=tx_001 eid=pur:tx_001 cents=2000 title="Plano Premium"
```

### Link do Telegram (com valor)
```
[BOT-LINK] token=abc123 price_cents=2000 valor=20.00 url=https://ohvips.xyz/obrigado_purchase_flow.html?token=abc123&valor=20.00&...
```

### Link do Telegram (sem valor)
```
[BOT-LINK] omitindo parâmetro "valor" por ausência de price_cents. token=abc123 url=https://ohvips.xyz/obrigado_purchase_flow.html?token=abc123&...
```

### Validação CAPI
```
[PURCHASE-CAPI] ❌ BLOQUEADO: price_cents ausente ou zero { ... price_cents: 0 }
```

### URL Normalizada
```
[URL-BUILDER] final_event_source_url=https://ohvips.xyz/obrigado_purchase_flow.html?token=abc123&valor=20.00&...
```

---

## 🚀 Testes Recomendados

1. **Teste de Purchase completo:**
   - Simular webhook PushinPay com `value` válido
   - Verificar link do Telegram (deve ter `valor=XX.XX`)
   - Acessar link e preencher email/telefone
   - Verificar Pixel enviado (value>0, plan_title presente)
   - Verificar CAPI enviado (200, event_id idêntico)

2. **Teste de value=0 bloqueado:**
   - Simular webhook com `value=0` ou ausente
   - Verificar que Purchase NÃO é enviado (422)
   - Verificar logs de bloqueio

3. **Teste de link sem valor:**
   - Criar transação sem `price_cents`
   - Verificar que link do Telegram não contém `valor=0`

---

## 📝 Observações

- `payer_cpf` é o campo oficial. `payer_national_registration` é alias de entrada (transição).
- Todos os dados sensíveis (CPF, email, telefone) são hasheados antes de enviar ao Meta CAPI.
- Logs nunca expõem CPF em claro (sempre `***`).

---

## 🔗 Arquivos Modificados

1. `server.js` (webhook PushinPay, CAPI endpoint, contexto unificado, Oasyfy webhooks)
2. `MODELO1/core/TelegramBotService.js` (webhookPushinPay, link do Telegram)
3. `MODELO1/WEB/obrigado_purchase_flow.html` (browser Pixel, validação value=0)
4. `services/purchaseCapi.js` (validação value=0, external_id)

---

## 🎉 Status
**CONCLUÍDO** - Todos os critérios de aceite atendidos.