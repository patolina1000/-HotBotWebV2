# Implementação do Fluxo Purchase com Deduplicação

## 📋 Resumo

Implementação completa do fluxo de compra (Purchase) que garante:
- **Ordem obrigatória**: Browser Pixel → CAPI
- **Mesmo event_id** compartilhado entre os dois eventos
- **Dados combinados**: Nome+CPF (webhook) + Email+Telefone (página de obrigado)
- **Deduplicação** correta no Meta via event_id único
- **Rastreabilidade** completa no banco de dados

## 🗂️ Arquivos Criados/Modificados

### 1. Migration SQL
**Arquivo**: `/workspace/migrations/20251006_add_purchase_flow_columns.sql`

Adiciona as seguintes colunas à tabela `tokens`:
- `payer_name` - Nome do pagador (webhook PushinPay)
- `payer_cpf` - CPF do pagador (webhook PushinPay)
- `transaction_id` - ID da transação
- `price_cents` - Valor em centavos
- `currency` - Moeda (padrão BRL)
- `email` - Email coletado na página de obrigado
- `event_id_purchase` - Event ID compartilhado
- `capi_ready` - Flag indicando que webhook recebeu dados
- `capi_sent` - Flag indicando que CAPI foi enviado
- `pixel_sent` - Flag indicando que browser pixel foi disparado
- `capi_processing` - Flag de processamento em andamento
- `event_attempts` - Contador de tentativas
- `first_event_sent_at` - Timestamp do primeiro envio

### 2. Helpers de Purchase Flow
**Arquivo**: `/workspace/helpers/purchaseFlow.js`

Funções utilitárias:
- `generatePurchaseEventId(transactionId)` - Gera event_id determinístico
- `hashSha256(value)` - Hash SHA-256 básico
- `hashEmail(email)` - Normaliza e hasheia email
- `hashPhone(phone)` - Normaliza telefone para E.164 e hasheia
- `hashCpf(cpf)` - Remove pontuação do CPF e hasheia
- `hashName(fullName)` - Separa e hasheia primeiro/último nome
- `isValidEmail(email)` - Valida email
- `isValidPhone(phone)` - Valida telefone

### 3. Serviço CAPI Purchase
**Arquivo**: `/workspace/services/purchaseCapi.js`

Funções principais:
- `sendPurchaseEvent(purchaseData)` - Envia Purchase via Meta CAPI
- `validatePurchaseReadiness(tokenData)` - Valida pré-condições

### 4. Webhook PushinPay Atualizado
**Arquivo**: `/workspace/MODELO1/core/TelegramBotService.js`

Modificações no método `webhookPushinPay()`:
- Extrai `payer_name`, `payer_cpf`, `value`, `currency`
- Gera `event_id_purchase` determinístico
- Salva dados no PostgreSQL com `capi_ready = true`
- Logs detalhados do fluxo Purchase

### 5. Endpoints da API
**Arquivo**: `/workspace/server.js`

Novos endpoints:
- `POST /api/save-contact` - Salva email e telefone
- `POST /api/mark-pixel-sent` - Marca pixel_sent como true
- `POST /api/capi/purchase` - Envia Purchase via CAPI

### 6. Página de Obrigado
**Arquivo**: `/workspace/MODELO1/WEB/obrigado_purchase_flow.html`

Nova página com:
- Formulário de coleta de email e telefone
- Validação client-side
- Disparo do Purchase (browser) com eventID
- Chamada ao endpoint CAPI Purchase
- UX moderna e responsiva

## 🔄 Fluxo Completo

### 1. Webhook PushinPay Recebe Pagamento

```javascript
// TelegramBotService.js - webhookPushinPay()
const payload = req.body;
const payerName = payload.payer_name;
const payerCpf = payload.payer_national_registration;
const transactionValue = payload.value; // em centavos
const transactionId = payload.id;

// Gerar event_id determinístico
const eventIdPurchase = generatePurchaseEventId(transactionId); // "pur:transaction_id"

// Salvar no banco
await pool.query(`
  INSERT INTO tokens (..., payer_name, payer_cpf, transaction_id, price_cents, 
                      event_id_purchase, capi_ready)
  VALUES (..., $1, $2, $3, $4, $5, TRUE)
`, [payerName, payerCpf, transactionId, transactionValue, eventIdPurchase]);
```

**Estado do Token após Webhook:**
```json
{
  "payer_name": "João da Silva",
  "payer_cpf": "12345678900",
  "transaction_id": "tx_abc123",
  "price_cents": 9700,
  "currency": "BRL",
  "event_id_purchase": "pur:tx_abc123",
  "capi_ready": true,
  "pixel_sent": false,
  "capi_sent": false
}
```

### 2. Usuário Acessa Página de Obrigado

```html
<!-- obrigado_purchase_flow.html -->
URL: /obrigado_purchase_flow.html?token=abc123&valor=97.00
```

Formulário pede:
- Email
- Telefone

### 3. Usuário Envia Formulário

#### 3.1. Salvar Email e Telefone
```javascript
// Frontend
const response = await fetch('/api/save-contact', {
  method: 'POST',
  body: JSON.stringify({ token, email, phone })
});

// Backend atualiza
UPDATE tokens SET email = $1, phone = $2 WHERE token = $3
```

**Estado do Token após Save Contact:**
```json
{
  "email": "joao@example.com",
  "phone": "11999999999",
  "event_id_purchase": "pur:tx_abc123"
}
```

#### 3.2. Disparar Purchase (Browser Pixel)
```javascript
// Frontend
fbq('track', 'Purchase', {
  value: 97.00,
  currency: 'BRL'
}, {
  eventID: 'pur:tx_abc123' // MESMO event_id
});

// Marcar como enviado
await fetch('/api/mark-pixel-sent', {
  method: 'POST',
  body: JSON.stringify({ token })
});
```

**Estado do Token após Pixel:**
```json
{
  "pixel_sent": true
}
```

#### 3.3. Disparar Purchase (CAPI)
```javascript
// Frontend chama
await fetch('/api/capi/purchase', {
  method: 'POST',
  body: JSON.stringify({ token, event_id: 'pur:tx_abc123' })
});

// Backend valida pré-condições
if (!pixel_sent || !capi_ready || !email || !phone) {
  return { error: 'Pré-condições não atendidas' };
}

// Backend monta payload
const purchaseData = {
  event_id: 'pur:tx_abc123', // MESMO event_id do browser
  transaction_id: 'tx_abc123',
  // Webhook data
  payer_name: 'João da Silva',
  payer_cpf: '12345678900',
  price_cents: 9700,
  currency: 'BRL',
  // Obrigado page data
  email: 'joao@example.com',
  phone: '11999999999',
  // Tracking
  fbp: 'fb.1.123456789.987654321',
  fbc: 'fb.1.123456789.fbclid123',
  utm_source: 'facebook',
  utm_campaign: 'promo2025'
};

// Envia para Meta CAPI
await sendPurchaseEvent(purchaseData);
```

**Payload enviado ao Meta CAPI:**
```json
{
  "data": [{
    "event_name": "Purchase",
    "event_time": 1696521600,
    "event_id": "pur:tx_abc123",
    "action_source": "website",
    "user_data": {
      "em": ["7b5...hash_email..."],
      "ph": ["9a3...hash_phone..."],
      "external_id": ["4f2...hash_cpf..."],
      "fn": ["8e1...hash_firstname..."],
      "ln": ["3c9...hash_lastname..."],
      "fbp": "fb.1.123456789.987654321",
      "fbc": "fb.1.123456789.fbclid123",
      "client_ip_address": "192.168.1.1",
      "client_user_agent": "Mozilla/5.0..."
    },
    "custom_data": {
      "value": 97.00,
      "currency": "BRL",
      "transaction_id": "tx_abc123",
      "utm_source": "facebook",
      "utm_campaign": "promo2025"
    }
  }],
  "access_token": "YOUR_FB_PIXEL_TOKEN"
}
```

**Estado Final do Token:**
```json
{
  "capi_sent": true,
  "pixel_sent": true,
  "capi_ready": true,
  "event_attempts": 1,
  "first_event_sent_at": "2025-10-06T10:30:00Z"
}
```

## ✅ Critérios de Aceite - Verificação

- [x] **Mesmo event_id** usado no Purchase browser e Purchase CAPI
- [x] **CAPI só dispara depois do browser** (condição `pixel_sent = true`)
- [x] **Webhook salva payer_name e payer_cpf** no tokens, com `capi_ready = true`
- [x] **Obrigado coleta e persiste email e phone**
- [x] **CAPI envia dados combinados** (nome+CPF do webhook + e-mail+telefone do obrigado)
- [x] **Hash aplicado corretamente** em e-mail, telefone e CPF (external_id); _fbp/_fbc em claro
- [x] **transaction_id = ID da PushinPay**; value e currency corretos
- [x] **capi_sent e pixel_sent mantidos corretamente**; event_attempts incrementa; first_event_sent_at no primeiro sucesso
- [x] **Logs informativos sem PII em claro**
- [x] **Reprocesso/retentativa** caso falte qualquer dado (sem duplicar evento)

## 🧪 Como Testar

### 1. Executar Migration

```bash
# Conectar ao banco PostgreSQL
psql $DATABASE_URL -f /workspace/migrations/20251006_add_purchase_flow_columns.sql
```

### 2. Simular Webhook PushinPay

```bash
curl -X POST http://localhost:3000/bot1/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": "tx_test_123",
    "status": "paid",
    "payer_name": "João da Silva Teste",
    "payer_national_registration": "12345678900",
    "value": 9700,
    "currency": "BRL"
  }'
```

**Verificar no banco:**
```sql
SELECT 
  token, event_id_purchase, transaction_id, 
  payer_name, payer_cpf, price_cents, currency,
  capi_ready, pixel_sent, capi_sent
FROM tokens 
WHERE transaction_id = 'tx_test_123';
```

**Esperado:**
- `event_id_purchase` = `"pur:tx_test_123"`
- `capi_ready` = `true`
- `pixel_sent` = `false`
- `capi_sent` = `false`

### 3. Acessar Página de Obrigado

```
http://localhost:3000/obrigado_purchase_flow.html?token=TOKEN_RECEBIDO&valor=97.00
```

1. Preencher email: `teste@example.com`
2. Preencher telefone: `(11) 99999-9999`
3. Clicar em "Confirmar e Continuar"

### 4. Verificar Logs

**Console do navegador:**
```
[OBRIGADO] 📝 Salvando email e telefone...
[OBRIGADO] ✅ Dados salvos
[OBRIGADO] 🎯 [PIXEL] Disparando Purchase browser com eventID: pur:tx_test_123
[OBRIGADO] ✅ [PIXEL] Purchase browser disparado
[OBRIGADO] 🚀 [CAPI] Chamando endpoint Purchase CAPI...
[OBRIGADO] ✅ [CAPI] Purchase CAPI enviado com sucesso
```

**Console do servidor:**
```
[SAVE-CONTACT] 📝 Salvando email e telefone
[SAVE-CONTACT] ✅ Email e telefone salvos
[MARK-PIXEL-SENT] ✅ Pixel marcado como enviado
[PURCHASE-CAPI] 📥 Requisição recebida
[PURCHASE-CAPI] 📊 Token encontrado
[PURCHASE-CAPI] 🚀 Enviando Purchase
[PURCHASE-CAPI] ✅ Purchase enviado com sucesso
```

### 5. Verificar no Banco de Dados

```sql
SELECT 
  token, event_id_purchase, transaction_id,
  email, phone,
  pixel_sent, capi_ready, capi_sent,
  event_attempts, first_event_sent_at
FROM tokens 
WHERE transaction_id = 'tx_test_123';
```

**Esperado:**
- `email` = `"teste@example.com"`
- `phone` = `"11999999999"`
- `pixel_sent` = `true`
- `capi_sent` = `true`
- `event_attempts` = `1`
- `first_event_sent_at` != `NULL`

### 6. Verificar no Meta Events Manager

1. Acessar: https://business.facebook.com/events_manager2/
2. Selecionar seu Pixel
3. Ir para "Test Events" (se usou test_event_code)
4. Verificar:
   - **2 eventos Purchase** com o **mesmo event_id** (`pur:tx_test_123`)
   - Um marcado como "Browser"
   - Um marcado como "Server"
   - Ambos com deduplicação ativa (ícone de corrente/link)

## 🔍 Logs e Observabilidade

### Backend

```
[PURCHASE-FLOW] token=abc123..., transaction_id=tx_123, event_id=pur:tx_123, 
                pixel_sent=true, capi_ready=true, capi_sent=false

[PURCHASE-CAPI] Payload pronto (sem PII em claro)

[PURCHASE-CAPI] Enviado com sucesso | event_id=pur:tx_123 | status=200
```

### Frontend

```
[PIXEL] Purchase disparado eventID=pur:tx_123

[CAPI] Purchase requisitado event_id=pur:tx_123
```

### Banco de Dados

- `event_attempts` incrementa a cada tentativa
- `first_event_sent_at` gravado no primeiro sucesso
- `capi_processing` usado para evitar envios duplicados

## 🔐 Segurança e Privacidade

### Dados Hasheados (SHA-256)
- ✅ Email: `hashEmail(email)` → lowercase, trim, SHA-256
- ✅ Telefone: `hashPhone(phone)` → E.164, SHA-256
- ✅ CPF: `hashCpf(cpf)` → remove pontuação, SHA-256
- ✅ Nome: `hashName(name)` → separa primeiro/último, SHA-256

### Dados em Texto Claro
- ✅ `_fbp` e `_fbc` - NÃO hashear (guideline Meta)

### Logs
- ❌ **Nunca** logar CPF, email ou telefone em texto claro
- ✅ Usar máscaras: `email: '***'`, `cpf: '***'`
- ✅ Logar apenas primeiros caracteres de IDs: `token.substring(0, 10) + '...'`

## 🚨 Troubleshooting

### Problema: CAPI não envia (reason: pixel_not_sent)
**Solução:** Verificar se o frontend chamou `/api/mark-pixel-sent`

### Problema: CAPI não envia (reason: missing_email_or_phone)
**Solução:** Verificar se `/api/save-contact` foi chamado com sucesso

### Problema: CAPI não envia (reason: capi_not_ready)
**Solução:** Verificar se o webhook PushinPay foi recebido e processado

### Problema: event_id diferentes entre browser e CAPI
**Solução:** Garantir que ambos usam `event_id_purchase` do banco

### Problema: Dados não combinados no CAPI
**Solução:** Verificar se todas as etapas do fluxo foram completadas:
1. Webhook salvou payer_name e payer_cpf
2. Obrigado salvou email e phone
3. CAPI foi chamado após pixel_sent=true

## 📚 Referências

- [Meta Conversions API Documentation](https://developers.facebook.com/docs/marketing-api/conversions-api)
- [Event Deduplication Guide](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events)
- [User Data Parameters](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters)
- [SHA-256 Hashing Requirements](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters#hashing)

## 📝 Notas Importantes

1. **Ordem é crítica**: Browser Pixel SEMPRE antes do CAPI
2. **event_id determinístico**: Usar formato `pur:transaction_id` para consistência
3. **Validação no backend**: Sempre validar pré-condições antes de enviar CAPI
4. **Idempotência**: Se CAPI falhar, pode retentar sem duplicar (mesmo event_id)
5. **Monitoramento**: Acompanhar `event_attempts` e `first_event_sent_at` para troubleshooting

## ✨ Melhorias Futuras

- [ ] Retry automático para CAPI failures (background job)
- [ ] Dashboard de monitoramento de Purchase events
- [ ] Webhook de confirmação do Meta para reconciliação
- [ ] A/B test de diferentes estratégias de deduplicação
- [ ] Alertas quando `event_attempts > 3` sem sucesso
