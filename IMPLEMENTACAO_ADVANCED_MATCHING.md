# Implementação de Advanced Matching - Meta Pixel e CAPI

## ✅ Alterações Implementadas

### 1. **shared/purchaseNormalization.js**
- ✅ Adicionada função `isValidSha256Hash()` para validar hashes (64 caracteres hexadecimais lowercase)
- ✅ Adicionada função `validateAndLogHashedField()` para validar e logar cada campo de AM
- ✅ Atualizada função `buildAdvancedMatching()` para usar validações antes de incluir no payload
- ✅ Logs detalhados sem expor PII:
  - `[AM] em normalized_len=X hashed_len=64 ok=true`
  - `⚠️ [AM] ph hash invalid hashed_len=128 expected=64 - field removed from payload`

### 2. **services/purchaseCapi.js**
- ✅ Melhorados logs de inclusão de campos AM no payload CAPI
- ✅ Adicionado contador de campos AM e estimativa de EMQ:
  - `am_fields_count`: Número de campos incluídos
  - `expected_emq`: HIGH (8-10), MEDIUM (5-7) ou LOW (<5)
- ✅ Logs por campo incluído:
  - `[PURCHASE-CAPI] 📧 user_data.em: 1 hash(es) included`
  - `[PURCHASE-CAPI] 📱 user_data.ph: 1 hash(es) included`

### 3. **services/metaCapi.js**
- ✅ Atualizada função `buildUserData()` para aceitar todos os campos AM:
  - `emailHash` (em)
  - `phoneHash` (ph)
  - `firstNameHash` (fn)
  - `lastNameHash` (ln)
  - `externalIdHash` (external_id)
- ✅ Atualizadas funções `sendLeadEvent()` e `sendInitiateCheckoutEvent()` para aceitar e processar os novos campos
- ✅ Logs de inclusão de cada campo no user_data

### 4. **checkout/js/facebook-events.js**
- ✅ Adicionadas funções de normalização para o Pixel (plain-text, sem hash):
  - `normalizeEmail()`: lowercase, trim
  - `normalizePhone()`: apenas dígitos, adiciona DDI 55 se necessário
  - `normalizeName()`: lowercase, trim, remove acentos
- ✅ Atualizada função `trackInitiateCheckout()` para aceitar `userData` com AM
- ✅ Atualizada função `trackPurchase()` para aceitar `userData` com AM
- ✅ **IMPORTANTE**: Dados enviados ao Pixel são **plain-text**, não hasheados (hashing automático do Meta)

### 5. **checkout/index.html**
- ✅ Criado formulário de captura de dados **ANTES** de gerar PIX:
  - Nome Completo (obrigatório, mínimo 2 palavras)
  - E-mail (obrigatório, validação de formato)
  - Telefone/WhatsApp (obrigatório, 10-11 dígitos)
- ✅ Validações em tempo real no formulário
- ✅ Dados salvos em localStorage para uso posterior
- ✅ Dados enviados ao criar o PIX (`client_data` inclui `first_name` e `last_name`)
- ✅ Disparo de `InitiateCheckout` ao abrir modal do PIX **com Advanced Matching plain-text**

### 6. **checkout/obrigado.html**
- ✅ Recuperação de dados do usuário do localStorage
- ✅ Envio de `Purchase` event ao Pixel **com Advanced Matching plain-text**
- ✅ Logs de confirmação de dados disponíveis

## 📋 Fluxo Completo Implementado

```
1. CHECKOUT (index.html)
   ├─ Usuário clica no plano
   ├─ 📝 Modal captura: Nome, Email, Telefone
   ├─ ✅ Validações aplicadas
   ├─ 💾 Dados salvos em localStorage
   ├─ 🔄 Gera PIX com dados reais
   └─ 📊 Pixel: InitiateCheckout + AM (plain-text)

2. WEBHOOK PUSHINPAY
   ├─ Recebe confirmação de pagamento
   ├─ 🔐 Normaliza dados (em, ph, fn, ln, external_id)
   ├─ 🔒 Hasheia SHA-256 (64 hex lowercase)
   ├─ ✅ Valida cada hash (regex ^[0-9a-f]{64}$)
   └─ 📤 Envia Purchase CAPI com hashes validados

3. PÁGINA OBRIGADO (obrigado.html)
   ├─ 💾 Recupera dados do localStorage
   └─ 📊 Pixel: Purchase + AM (plain-text)
```

## 🔒 Normalização e Hashing

### CAPI (Server-Side) - HASHEADO
```javascript
// Normalização ANTES do hash:
email:      lowercase, trim
phone:      apenas dígitos, DDI 55 se BR
first_name: lowercase, trim, sem acentos
last_name:  lowercase, trim, sem acentos
external_id: trim, lowercase se alfanumérico

// Hash: SHA-256 hexadecimal lowercase (64 chars)
// Validação: ^[0-9a-f]{64}$
```

### Pixel (Browser) - PLAIN-TEXT
```javascript
// Normalização (SEM hash - Meta faz automático):
email:      lowercase, trim
phone:      apenas dígitos, DDI 55 se BR
first_name: lowercase, trim, sem acentos
last_name:  lowercase, trim, sem acentos
```

## 📊 Logs Implementados

### Normalização (sem PII)
```
[AM] em normalized_len=25 hashed_len=64 ok=true
[AM] ph normalized_len=13 hashed_len=64 ok=true
[AM] fn normalized_len=5 hashed_len=64 ok=true
[AM] ln normalized_len=8 hashed_len=64 ok=true
[AM] external_id normalized_len=14 hashed_len=64 ok=true
```

### Validação de Erros
```
⚠️ [AM] em hash invalid hashed_len=128 expected=64 - field removed from payload
⚠️ [AM] ph hash invalid reason=has_uppercase hashed_len=64 - field removed from payload
⚠️ [AM] fn hash invalid reason=has_non_hex_chars hashed_len=64 - field removed from payload
[AM] ln skip reason=empty_after_normalization
```

### Purchase CAPI
```
[PURCHASE-CAPI] 📧 user_data.em: 1 hash(es) included
[PURCHASE-CAPI] 📱 user_data.ph: 1 hash(es) included
[PURCHASE-CAPI] 👤 user_data.fn: 1 hash(es) included
[PURCHASE-CAPI] 👥 user_data.ln: 1 hash(es) included
[PURCHASE-CAPI] 🆔 user_data.external_id: 1 hash(es) included

[PURCHASE-CAPI] 📊 user_data completo sendo enviado: {
  has_em: true,
  has_ph: true,
  has_fn: true,
  has_ln: true,
  has_external_id: true,
  has_fbp: true,
  has_fbc: true,
  has_client_ip: true,
  has_client_ua: true,
  total_fields: 9,
  am_fields_count: 9,
  expected_emq: 'HIGH (8-10)'
}
```

## 🧪 Testes Manuais (Events Manager)

### 1. Configurar Test Event Code
```bash
# Adicionar no .env ou Events Manager
TEST_EVENT_CODE=TEST12345
```

### 2. Teste Lead Event (Telegram /start)
```bash
# Disparar via Telegram /start
# Verificar no Events Manager:
# - Event: Lead
# - user_data: em, ph, fn, ln, external_id (hasheados)
# - IP e UA presentes
# - EMQ: 8-10
```

### 3. Teste Purchase Event (Checkout Web)
```bash
# 1. Acessar checkout
# 2. Clicar em plano
# 3. Preencher formulário: Nome, Email, Telefone
# 4. Gerar PIX
# 5. Verificar Pixel: InitiateCheckout com AM (plain-text)
# 6. Simular pagamento
# 7. Verificar CAPI: Purchase com AM (hasheado)
# 8. Acessar página obrigado
# 9. Verificar Pixel: Purchase com AM (plain-text)
```

### 4. Verificações no Events Manager
- [ ] **InitiateCheckout (Pixel)**: AM em plain-text, sem warnings
- [ ] **Purchase (CAPI)**: AM hasheado (64 hex), sem warnings
- [ ] **Purchase (Pixel)**: AM em plain-text, deduplicado com CAPI
- [ ] **EMQ Score**: 8-10 (alvo)
- [ ] **Deduplicação**: event_id igual entre Pixel e CAPI
- [ ] **Warnings**: Nenhum aviso de formatação de AM

## ✅ Critérios de Aceite

- [x] Todos os campos em, ph, fn, ln, external_id enviados ao CAPI passam na verificação 64-hex-lowercase
- [x] No Pixel, esses mesmos campos são enviados sem hash (plain-text)
- [x] Nenhum campo de AM é enviado com comprimento ≠ 64, base64, uppercase, ou com concatenação
- [x] Logs mostram a normalização aplicada, o resultado do hash (apenas metadados), e a validação ok=true
- [x] Pipeline preparado para melhorar EMQ (alvo 8–10) nos eventos Lead e Purchase

## 📝 Próximos Passos

1. **Testar em ambiente de desenvolvimento** com `TEST_EVENT_CODE`
2. **Verificar logs** no servidor para confirmar validações
3. **Abrir Events Manager** e verificar qualidade dos eventos
4. **Confirmar EMQ** nos eventos de teste (alvo 8-10)
5. **Validar deduplicação** entre Pixel e CAPI
6. **Deploy em produção** após testes bem-sucedidos

## 🚨 Não Fazer

- ❌ Não hashear IP/UA
- ❌ Não alterar action_source
- ❌ Não concatenar hashes
- ❌ Não usar SHA-512, PBKDF2 ou base64
- ❌ Não enviar hashes > 64 caracteres

## 📞 Suporte

Se encontrar problemas:
1. Verificar logs do servidor (`[AM]`, `[PURCHASE-CAPI]`)
2. Verificar console do browser (`[FACEBOOK-EVENTS]`, `[CHECKOUT]`)
3. Verificar Events Manager para avisos de formatação
4. Revisar este documento para entender o fluxo esperado

---

**Implementação concluída em:** 2025-10-08
**Versão:** 1.0.0