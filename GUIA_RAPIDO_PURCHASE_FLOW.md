# 🚀 Guia Rápido - Purchase Flow com Deduplicação

## ⚡ Setup Rápido

### 1. Instalar Dependências (se necessário)
```bash
npm install
```

### 2. Executar Migration
```bash
# Conectar ao banco e executar migration
psql $DATABASE_URL -f migrations/20251006_add_purchase_flow_columns.sql
```

### 3. Verificar Variáveis de Ambiente
```bash
# No arquivo .env, garantir que existem:
FB_PIXEL_ID=seu_pixel_id
FB_PIXEL_TOKEN=seu_token
DATABASE_URL=postgresql://...
```

### 4. Reiniciar Servidor
```bash
npm start
```

## 📋 Checklist de Implementação

### Arquivos Criados ✅
- [x] `/migrations/20251006_add_purchase_flow_columns.sql` - Migration do banco
- [x] `/helpers/purchaseFlow.js` - Funções de hash e validação
- [x] `/services/purchaseCapi.js` - Serviço CAPI Purchase
- [x] `/MODELO1/WEB/obrigado_purchase_flow.html` - Nova página de obrigado
- [x] `/IMPLEMENTACAO_PURCHASE_FLOW.md` - Documentação completa

### Arquivos Modificados ✅
- [x] `/MODELO1/core/TelegramBotService.js` - Webhook PushinPay atualizado
- [x] `/server.js` - 3 novos endpoints adicionados:
  - `POST /api/save-contact`
  - `POST /api/mark-pixel-sent`
  - `POST /api/capi/purchase`

## 🧪 Teste Rápido

### Passo 1: Simular Webhook PushinPay
```bash
curl -X POST http://localhost:3000/bot1/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": "tx_test_001",
    "status": "paid",
    "payer_name": "Maria Silva",
    "payer_national_registration": "12345678901",
    "value": 9700
  }'
```

**Esperado no log:**
```
[bot1] 🎯 [PURCHASE-FLOW] Dados do webhook: {
  transaction_id: 'tx_test_001',
  payer_name: '***',
  payer_cpf: '***',
  value: 9700,
  currency: 'BRL',
  event_id_purchase: 'pur:tx_test_001'
}
[bot1] ✅ [PURCHASE-FLOW] Token tx_test_001 salvo no PostgreSQL com capi_ready=true
```

### Passo 2: Verificar no Banco
```sql
SELECT 
  token, event_id_purchase, payer_name, payer_cpf, 
  price_cents, capi_ready, pixel_sent, capi_sent
FROM tokens 
WHERE transaction_id = 'tx_test_001';
```

**Esperado:**
```
token     | abc123-def456-...
event_id  | pur:tx_test_001
payer_name| Maria Silva
payer_cpf | 12345678901
price_cents| 9700
capi_ready| true
pixel_sent| false
capi_sent | false
```

### Passo 3: Acessar Página de Obrigado
```
http://localhost:3000/obrigado_purchase_flow.html?token=TOKEN_DO_PASSO_2&valor=97.00
```

### Passo 4: Preencher Formulário
1. Email: `teste@example.com`
2. Telefone: `11999999999`
3. Clicar "Confirmar e Continuar"

**Esperado no console do navegador:**
```
[OBRIGADO] 📝 Salvando email e telefone...
[OBRIGADO] ✅ Dados salvos: {event_id_purchase: "pur:tx_test_001"}
[OBRIGADO] 🎯 [PIXEL] Disparando Purchase browser com eventID: pur:tx_test_001
[OBRIGADO] ✅ [PIXEL] Purchase browser disparado
[OBRIGADO] 🚀 [CAPI] Chamando endpoint Purchase CAPI...
[OBRIGADO] ✅ [CAPI] Purchase CAPI enviado com sucesso
```

**Esperado no log do servidor:**
```
[SAVE-CONTACT] 📝 Salvando email e telefone
[SAVE-CONTACT] ✅ Email e telefone salvos
[MARK-PIXEL-SENT] ✅ Pixel marcado como enviado
[PURCHASE-CAPI] 📥 Requisição recebida
[PURCHASE-CAPI] 📊 Token encontrado
[PURCHASE-CAPI] 🚀 Enviando Purchase
[PURCHASE-CAPI] ✅ Purchase enviado com sucesso
```

### Passo 5: Verificar Estado Final
```sql
SELECT 
  email, phone, pixel_sent, capi_sent, 
  event_attempts, first_event_sent_at
FROM tokens 
WHERE transaction_id = 'tx_test_001';
```

**Esperado:**
```
email      | teste@example.com
phone      | 11999999999
pixel_sent | true
capi_sent  | true
event_attempts | 1
first_event_sent_at | 2025-10-06 10:30:00
```

## 🎯 Fluxo Visual

```
┌─────────────────────────────────────────────────────────────┐
│ 1. WEBHOOK PUSHINPAY                                         │
│    Recebe: payer_name, payer_cpf, value, transaction_id     │
│    Salva no DB com capi_ready=true                          │
│    Gera: event_id_purchase = "pur:transaction_id"           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. PÁGINA DE OBRIGADO                                        │
│    Usuário acessa com ?token=...                            │
│    Preenche: email + telefone                               │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. SALVAR CONTATO                                            │
│    POST /api/save-contact                                   │
│    Salva email e phone no DB                                │
│    Retorna event_id_purchase                                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. PURCHASE BROWSER PIXEL                                    │
│    fbq('track', 'Purchase', {...}, {eventID: "pur:tx_123"}) │
│    POST /api/mark-pixel-sent                                │
│    Marca pixel_sent=true                                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. PURCHASE CAPI                                             │
│    POST /api/capi/purchase                                  │
│    Valida: pixel_sent=true, capi_ready=true                │
│    Envia dados combinados ao Meta                           │
│    Marca capi_sent=true                                     │
└─────────────────────────────────────────────────────────────┘

RESULTADO NO META:
2 eventos Purchase com MESMO event_id = "pur:tx_123"
✅ Deduplicação automática
✅ Dados combinados: webhook + obrigado
```

## ⚠️ Pontos de Atenção

### 1. Ordem é Crítica
- ❌ **ERRADO**: Enviar CAPI antes do Browser Pixel
- ✅ **CORRETO**: Browser Pixel → Marcar pixel_sent → CAPI

### 2. Mesmo event_id
- ❌ **ERRADO**: Gerar event_id diferentes
- ✅ **CORRETO**: Usar `event_id_purchase` do banco em ambos

### 3. Validações
- ❌ **ERRADO**: Enviar CAPI sem email/phone
- ✅ **CORRETO**: Validar todas pré-condições antes de enviar

### 4. Hash vs Texto Claro
- ✅ **Hash**: email, phone, CPF, nome
- ✅ **Texto claro**: _fbp, _fbc

### 5. Logs
- ❌ **ERRADO**: Logar `payer_cpf: "12345678901"`
- ✅ **CORRETO**: Logar `payer_cpf: "***"`

## 🐛 Troubleshooting Rápido

| Erro | Causa | Solução |
|------|-------|---------|
| `pixel_not_sent` | Frontend não chamou mark-pixel-sent | Verificar se fbq() disparou |
| `capi_not_ready` | Webhook não foi recebido | Verificar webhook PushinPay |
| `missing_email_or_phone` | Formulário não foi enviado | Verificar save-contact |
| `already_sent` | Tentativa de reenvio | Normal, evento já processado |
| `event_id não disponível` | Token sem event_id_purchase | Regenerar via webhook |

## 📊 Monitoramento

### Queries Úteis

**Tokens prontos para CAPI:**
```sql
SELECT token, transaction_id, event_id_purchase, email, phone
FROM tokens
WHERE capi_ready = true 
  AND pixel_sent = true
  AND capi_sent = false
  AND email IS NOT NULL
  AND phone IS NOT NULL;
```

**Eventos com falha:**
```sql
SELECT token, transaction_id, event_attempts, capi_sent, pixel_sent
FROM tokens
WHERE event_attempts > 0 
  AND capi_sent = false
ORDER BY event_attempts DESC;
```

**Performance do dia:**
```sql
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN pixel_sent THEN 1 ELSE 0 END) as pixel_ok,
  SUM(CASE WHEN capi_sent THEN 1 ELSE 0 END) as capi_ok,
  AVG(event_attempts) as avg_attempts
FROM tokens
WHERE DATE(criado_em) = CURRENT_DATE;
```

## ✅ Tudo Pronto!

Agora você tem:
1. ✅ Migration executada
2. ✅ Código implementado
3. ✅ Endpoints funcionando
4. ✅ Página de obrigado pronta
5. ✅ Fluxo testado

**Próximos passos:**
1. Testar em ambiente de staging
2. Verificar deduplicação no Meta Events Manager
3. Monitorar logs por 24h
4. Deploy em produção
5. Acompanhar métricas

---

**Dúvidas?** Consulte a [documentação completa](./IMPLEMENTACAO_PURCHASE_FLOW.md)
