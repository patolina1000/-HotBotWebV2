# ✅ Checklist de Deploy - Purchase Flow

## 📋 Pré-Deploy

### 1. Verificar Ambiente
- [ ] Node.js versão 20.x instalado
- [ ] PostgreSQL acessível via `$DATABASE_URL`
- [ ] Variáveis de ambiente configuradas:
  - [ ] `FB_PIXEL_ID`
  - [ ] `FB_PIXEL_TOKEN`
  - [ ] `DATABASE_URL`
  - [ ] `FRONTEND_URL` ou `BASE_URL`

### 2. Backup
- [ ] Fazer backup do banco de dados
- [ ] Backup dos arquivos modificados:
  - [ ] `server.js`
  - [ ] `MODELO1/core/TelegramBotService.js`

### 3. Revisar Código
- [ ] Todos os 6 arquivos novos criados
- [ ] Todos os 2 arquivos modificados sem erros de sintaxe
- [ ] Dependências no `package.json` (uuid já está lá)

---

## 🗄️ Deploy de Banco de Dados

### 1. Conectar ao Banco
```bash
psql $DATABASE_URL
```

### 2. Executar Migration
```sql
-- Executar o arquivo de migration
\i migrations/20251006_add_purchase_flow_columns.sql

-- Verificar colunas criadas
\d tokens

-- Verificar índices
\di idx_tokens_*
```

### 3. Validar Schema
```sql
-- Verificar se todas as colunas existem
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'tokens' 
  AND column_name IN (
    'payer_name', 'payer_cpf', 'transaction_id', 'price_cents', 
    'currency', 'email', 'event_id_purchase', 'capi_ready', 
    'pixel_sent', 'capi_sent', 'capi_processing', 'event_attempts', 
    'first_event_sent_at'
  )
ORDER BY column_name;
```

**Esperado: 13 linhas** (phone já existia)

---

## 🚀 Deploy de Código

### 1. Instalar Dependências (se necessário)
```bash
npm install
```

### 2. Validar Sintaxe
```bash
# Verificar se os arquivos não têm erros de sintaxe
node -c helpers/purchaseFlow.js
node -c services/purchaseCapi.js
node -c server.js
node -c MODELO1/core/TelegramBotService.js
```

**Esperado: Nenhuma saída = sucesso**

### 3. Reiniciar Servidor
```bash
# Parar servidor atual
# Iniciar novamente
npm start
```

### 4. Verificar Logs de Inicialização
Procurar por:
- [ ] `🚀 Servidor HotBot rodando na porta ...`
- [ ] `✅ Conexão com PostgreSQL estabelecida`
- [ ] Nenhum erro de import/require

---

## 🧪 Testes Pós-Deploy

### Teste 1: Simular Webhook (2 min)

```bash
# 1. Enviar webhook de teste
curl -X POST http://localhost:3000/bot1/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": "tx_deploy_test_001",
    "status": "paid",
    "payer_name": "Deploy Test User",
    "payer_national_registration": "12345678901",
    "value": 9700,
    "currency": "BRL"
  }'

# 2. Verificar no banco
psql $DATABASE_URL -c "
  SELECT token, event_id_purchase, payer_name, payer_cpf, 
         price_cents, currency, capi_ready 
  FROM tokens 
  WHERE transaction_id = 'tx_deploy_test_001';
"
```

**Checklist:**
- [ ] Token criado
- [ ] `event_id_purchase = "pur:tx_deploy_test_001"`
- [ ] `payer_name = "Deploy Test User"`
- [ ] `payer_cpf = "12345678901"`
- [ ] `price_cents = 9700`
- [ ] `currency = "BRL"`
- [ ] `capi_ready = true`

**Logs esperados:**
```
[bot1] 🎯 [PURCHASE-FLOW] Dados do webhook: {
  transaction_id: 'tx_deploy_test_001',
  payer_name: '***',
  payer_cpf: '***',
  value: 9700,
  currency: 'BRL',
  event_id_purchase: 'pur:tx_deploy_test_001'
}
[bot1] ✅ [PURCHASE-FLOW] Token ... salvo no PostgreSQL com capi_ready=true
```

---

### Teste 2: Endpoint Save Contact (1 min)

```bash
# Usar o token do teste anterior
TOKEN="TOKEN_DO_TESTE_1"

curl -X POST http://localhost:3000/api/save-contact \
  -H "Content-Type: application/json" \
  -d "{
    \"token\": \"$TOKEN\",
    \"email\": \"deploy.test@example.com\",
    \"phone\": \"11999998888\"
  }"
```

**Resposta esperada:**
```json
{
  "success": true,
  "event_id_purchase": "pur:tx_deploy_test_001",
  "transaction_id": "tx_deploy_test_001"
}
```

**Checklist:**
- [ ] Status 200
- [ ] `success = true`
- [ ] `event_id_purchase` presente

---

### Teste 3: Endpoint Mark Pixel Sent (30 seg)

```bash
curl -X POST http://localhost:3000/api/mark-pixel-sent \
  -H "Content-Type: application/json" \
  -d "{\"token\": \"$TOKEN\"}"
```

**Resposta esperada:**
```json
{"success": true}
```

**Verificar no banco:**
```sql
SELECT pixel_sent FROM tokens WHERE token = 'TOKEN_AQUI';
-- Esperado: pixel_sent = true
```

---

### Teste 4: Endpoint CAPI Purchase (1 min)

```bash
curl -X POST http://localhost:3000/api/capi/purchase \
  -H "Content-Type: application/json" \
  -d "{
    \"token\": \"$TOKEN\",
    \"event_id\": \"pur:tx_deploy_test_001\"
  }"
```

**Resposta esperada (sucesso):**
```json
{
  "success": true,
  "event_id": "pur:tx_deploy_test_001",
  "transaction_id": "tx_deploy_test_001",
  "message": "Purchase enviado com sucesso"
}
```

**Logs esperados:**
```
[PURCHASE-CAPI] 📥 Requisição recebida
[PURCHASE-CAPI] 📊 Token encontrado
[PURCHASE-CAPI] 🚀 Enviando Purchase
[PURCHASE-CAPI] ✅ Purchase enviado com sucesso
```

**Checklist:**
- [ ] Status 200
- [ ] `success = true`
- [ ] Logs no servidor confirmam envio
- [ ] No Meta Events Manager (Test Events), aparecem 2 eventos:
  - [ ] 1 Purchase (browser) - se testou frontend
  - [ ] 1 Purchase (server) - do teste CAPI

---

### Teste 5: Página de Obrigado (2 min)

```
http://localhost:3000/obrigado_purchase_flow.html?token=TOKEN&valor=97.00
```

**No navegador:**
1. [ ] Página carrega sem erros
2. [ ] Formulário de email/telefone aparece
3. [ ] Preencher email: `frontend.test@example.com`
4. [ ] Preencher telefone: `(11) 98888-7777`
5. [ ] Clicar "Confirmar e Continuar"

**Console do navegador - esperado:**
```
[OBRIGADO] 📝 Salvando email e telefone...
[OBRIGADO] ✅ Dados salvos
[OBRIGADO] 🎯 [PIXEL] Disparando Purchase browser
[OBRIGADO] ✅ [PIXEL] Purchase browser disparado
[OBRIGADO] 🚀 [CAPI] Chamando endpoint Purchase CAPI...
[OBRIGADO] ✅ [CAPI] Purchase CAPI enviado com sucesso
```

**Console do servidor - esperado:**
```
[SAVE-CONTACT] 📝 Salvando email e telefone
[SAVE-CONTACT] ✅ Email e telefone salvos
[MARK-PIXEL-SENT] ✅ Pixel marcado como enviado
[PURCHASE-CAPI] 📥 Requisição recebida
[PURCHASE-CAPI] ✅ Purchase enviado com sucesso
```

---

## 📊 Validação no Meta

### Events Manager

1. [ ] Acessar: https://business.facebook.com/events_manager2/
2. [ ] Selecionar seu Pixel
3. [ ] Ir para "Test Events" (se usou test_event_code)
4. [ ] Verificar eventos Purchase:
   - [ ] Aparecem 2 eventos com mesmo event_id
   - [ ] 1 marcado como "Browser"
   - [ ] 1 marcado como "Server"
   - [ ] Ícone de deduplicação (corrente/link) presente
   - [ ] Dados do evento incluem:
     - [ ] `value` e `currency`
     - [ ] `transaction_id`
     - [ ] User data hasheada
     - [ ] UTMs (se disponíveis)

---

## 🔍 Monitoramento Pós-Deploy

### Dashboard de Queries (executar a cada hora nas primeiras 24h)

```sql
-- 1. Tokens recebidos hoje
SELECT COUNT(*) as total_hoje
FROM tokens
WHERE DATE(criado_em) = CURRENT_DATE;

-- 2. Tokens com Purchase flow completo
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN capi_ready THEN 1 ELSE 0 END) as webhook_ok,
  SUM(CASE WHEN pixel_sent THEN 1 ELSE 0 END) as pixel_ok,
  SUM(CASE WHEN capi_sent THEN 1 ELSE 0 END) as capi_ok
FROM tokens
WHERE DATE(criado_em) = CURRENT_DATE;

-- 3. Taxa de sucesso CAPI
SELECT 
  ROUND(100.0 * SUM(CASE WHEN capi_sent THEN 1 ELSE 0 END) / 
        NULLIF(SUM(CASE WHEN capi_ready AND pixel_sent THEN 1 ELSE 0 END), 0), 2) 
  as taxa_sucesso_capi
FROM tokens
WHERE DATE(criado_em) = CURRENT_DATE;

-- 4. Tokens com erro (tentativas > 3)
SELECT token, transaction_id, event_attempts, capi_sent
FROM tokens
WHERE event_attempts >= 3 
  AND capi_sent = false
  AND DATE(criado_em) = CURRENT_DATE;

-- 5. Tempo médio até primeiro envio
SELECT 
  AVG(EXTRACT(EPOCH FROM (first_event_sent_at - criado_em))) as segundos_media
FROM tokens
WHERE first_event_sent_at IS NOT NULL
  AND DATE(criado_em) = CURRENT_DATE;
```

### Alertas

Configurar alertas para:
- [ ] `event_attempts > 3` sem sucesso
- [ ] Taxa de sucesso CAPI < 90%
- [ ] Tempo até primeiro envio > 300 segundos
- [ ] Erros de hash (verificar logs)

---

## 🚨 Rollback (se necessário)

### Se houver problemas críticos:

1. **Reverter código:**
   ```bash
   git revert HEAD  # ou commit específico
   npm start
   ```

2. **Banco de dados:**
   ```sql
   -- As novas colunas podem permanecer (não afetam funcionalidade antiga)
   -- OU reverter com:
   ALTER TABLE tokens 
     DROP COLUMN IF EXISTS payer_name,
     DROP COLUMN IF EXISTS payer_cpf,
     -- ... etc
   ```

3. **Validar rollback:**
   - [ ] Servidor inicia sem erros
   - [ ] Fluxo antigo funciona normalmente
   - [ ] Nenhum erro nos logs

---

## ✅ Aprovação Final

### Checklist de Conclusão

- [ ] Migration executada com sucesso
- [ ] Código deployado sem erros
- [ ] Todos os 5 testes passaram
- [ ] Validação no Meta Events Manager OK
- [ ] Monitoramento configurado
- [ ] Equipe treinada
- [ ] Documentação acessível

### Sign-off

- Data do deploy: ________________
- Responsável: ________________
- Ambiente: [ ] Staging [ ] Produção
- Status: [ ] ✅ Aprovado [ ] ❌ Rollback

---

## 📞 Suporte

**Em caso de problemas:**

1. Verificar logs do servidor (procurar por `[PURCHASE-FLOW]`, `[PURCHASE-CAPI]`)
2. Executar queries de monitoramento
3. Consultar documentação:
   - `IMPLEMENTACAO_PURCHASE_FLOW.md` - Troubleshooting
   - `GUIA_RAPIDO_PURCHASE_FLOW.md` - Queries úteis
4. Verificar event_attempts no banco para diagnóstico

**Logs importantes:**
```bash
# Filtrar logs de Purchase
grep -E '\[PURCHASE-FLOW\]|\[PURCHASE-CAPI\]|\[SAVE-CONTACT\]' logs/app.log

# Ver últimos erros
grep ERROR logs/app.log | tail -50
```

---

**Última atualização:** 2025-10-06  
**Versão do checklist:** 1.0
