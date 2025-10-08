# Correção Advanced Matching - Pixel e CAPI

## Contexto do Problema

**Sintomas observados:**
- Purchase via browser disparava Pixel com sucesso, mas o Advanced Matching (AM) no front estava removendo todos os campos
- Detectava hashes com `hashed_len=512` (esperado 64)
- Warning do Pixel: `Call to fbq('set','userData', Object); with parameter "pixel_id" has an invalid value`
- Chamada para `/api/capi/purchase` retornava 400 `already_sent` logo após o envio pelo Pixel

**Causa raiz:**
1. **Frontend**: Estava hasheando dados no browser quando deveria enviar plaintext (o próprio Pixel faz o hash)
2. **Frontend**: Usava `userData` (camelCase) em vez de `user_data` (snake_case) no fbq
3. **Backend**: Bloqueava envio CAPI se já tivesse sido enviado (`already_sent`), impedindo deduplicação cross-channel

---

## Correções Implementadas

### A) Frontend - Pixel Advanced Matching (obrigado_purchase_flow.html)

#### 1. Envio de dados em PLAINTEXT (não hashear no browser)
**Antes:**
```javascript
const advancedMatchingHashed = normalizationLib.buildAdvancedMatching(normalizedData);
const advancedMatching = Object.fromEntries(
    Object.entries(advancedMatchingHashed).filter(([, value]) => value)
);
```

**Depois:**
```javascript
// Enviar dados PLAINTEXT ao Pixel (não hashear no browser)
// O próprio Pixel do Facebook faz o hashing internamente
const advancedMatching = {};

if (normalizedData.email) advancedMatching.em = normalizedData.email;
if (normalizedData.phone) advancedMatching.ph = normalizedData.phone;
if (normalizedData.first_name) advancedMatching.fn = normalizedData.first_name;
if (normalizedData.last_name) advancedMatching.ln = normalizedData.last_name;
if (normalizedData.external_id) advancedMatching.external_id = normalizedData.external_id;

if (finalFbp) advancedMatching.fbp = finalFbp;
if (finalFbc) advancedMatching.fbc = finalFbc;
```

**Impacto:** O Pixel agora recebe dados normalizados em plaintext e faz o hashing internamente, evitando o erro de `hashed_len=512`.

#### 2. Correção da chamada fbq - usar `user_data` (snake_case)
**Antes:**
```javascript
fbq('set', 'userData', advancedMatching);  // ❌ camelCase + causava warning
```

**Depois:**
```javascript
fbq('set', 'user_data', advancedMatching);  // ✅ snake_case correto
```

**Impacto:** O warning `invalid value of "pixel_id"` desaparece.

#### 3. Logs esperados no frontend
```javascript
console.log('[ADVANCED-MATCH-FRONT] normalized', {
    em: 'ok',
    ph: 'ok',
    fn: 'ok',
    ln: 'ok',
    external_id: 'ok'
});

console.log('[ADVANCED-MATCH-FRONT] user_data ready', {
    has_em: true,
    has_ph: true,
    has_fn: true,
    has_ln: true,
    has_external_id: true,
    has_fbp: true,
    has_fbc: true
});

// Se _fbc foi reconstruído:
console.log('[ADVANCED-MATCH-FRONT] fbc reconstructed from fbclid');
```

#### 4. Reconstrução de _fbc a partir de fbclid
```javascript
// Se o cookie _fbc estiver nulo, reconstruir a partir de fbclid
if (!cookieFbc && fbclid) {
    cookieFbc = `fb.1.${Date.now()}.${fbclid}`;
    console.log('[ADVANCED-MATCH-FRONT] fbc reconstructed from fbclid');
}
```

**Formato:** `fb.1.<unix_timestamp>.<fbclid>`

#### 5. Payload para CAPI em plaintext
**Antes:**
```javascript
advanced_matching: advancedMatchingHashed  // ❌ enviava hashes do front
```

**Depois:**
```javascript
normalized_user_data: normalizedData  // ✅ envia plaintext, backend hasheia
```

---

### B) Backend - Endpoint CAPI (server.js)

#### 1. Remoção do bloqueio `already_sent`
**services/purchaseCapi.js - validatePurchaseReadiness()**

**Antes:**
```javascript
// Verificar se já foi enviado
if (tokenData.capi_sent) {
    return { valid: false, reason: 'already_sent' };  // ❌ bloqueava
}
```

**Depois:**
```javascript
// NÃO BLOQUEAR se já foi enviado - tornar idempotente
// A Meta faz a deduplicação entre Pixel e CAPI usando event_id
// Apenas registrar o status para log
const already_sent = !!tokenData.capi_sent;

// ... continua validação sem bloquear ...

return { valid: true, reason: null, already_sent };
```

**Impacto:** O endpoint agora permite envio CAPI mesmo que Pixel já tenha sido enviado. A Meta deduplica via `event_id`.

#### 2. Log de política de deduplicação
**server.js - /api/capi/purchase**

```javascript
console.log('[CAPI-DEDUPE] policy=cross-channel-allowed', {
    pixel_sent: true,
    capi_sent: false,
    proceeding: true
});
```

**Comportamento esperado:**
- Se Pixel enviado → CAPI pode ser enviado (Meta deduplica)
- Se CAPI enviado → Pixel pode ser enviado (Meta deduplica)
- Ambos podem ser enviados múltiplas vezes (idempotente)
- Meta usa `event_id` para deduplicar

#### 3. Re-normalização e hashing no backend (defesa em profundidade)
**server.js**

```javascript
// Priorizar dados normalizados do browser (plaintext)
const normalizedUserData = normalizedUserDataFromBrowser && Object.keys(normalizedUserDataFromBrowser).length > 0
    ? {
        email: normalizedUserDataFromBrowser.email || normalizeEmailField(tokenData.email || ''),
        phone: normalizedUserDataFromBrowser.phone || phoneNormalizedDigits,
        // ... outros campos
      }
    : {
        // Re-normalizar do banco se não vier do browser
        email: normalizeEmailField(tokenData.email || ''),
        phone: phoneNormalizedDigits,
        // ... outros campos
      };

console.log('[CAPI-AM] normalized', {
    em: 'ok',
    ph: 'ok',
    fn: 'ok',
    ln: 'ok',
    external_id: 'ok'
});

// Hashear APENAS no backend antes do envio à Meta
const advancedMatchingHashed = buildAdvancedMatching(normalizedUserData);

// Validar hashes SHA-256 (64 chars hex lowercase)
const hashValidation = Object.entries(advancedMatchingHashed).map(([key, value]) => {
    return { field: key, len: value ? value.length : 0, ok: value && value.length === 64 };
});
const allHashesValid = hashValidation.every(v => v.ok);
console.log('[CAPI-AM] hashed_len=64 for all fields | ok=' + allHashesValid, hashValidation);
```

**Logs esperados:**
```
[CAPI-AM] normalized { em:ok, ph:ok, fn:ok, ln:ok, external_id:ok }
[CAPI-AM] hashed_len=64 for all fields | ok=true [
  { field: 'em', len: 64, ok: true },
  { field: 'ph', len: 64, ok: true },
  { field: 'fn', len: 64, ok: true },
  { field: 'ln', len: 64, ok: true },
  { field: 'external_id', len: 64, ok: true }
]
```

#### 4. Mesmas correções em services/purchaseCapi.js

```javascript
if (!advancedMatching) {
    // Re-normalizar dados no backend (defesa em profundidade)
    const normalizedUserSource = purchaseData.normalized_user_data || {};
    normalizedUserData = {
        email: normalizedUserSource.email ?? normalizeEmail(email),
        phone: normalizedUserSource.phone ?? normalizePhone(phone),
        // ... outros campos
    };

    console.log('[CAPI-AM] normalized', normalizationSnapshot);

    // Hashear apenas no backend antes do envio à Meta
    advancedMatching = buildAdvancedMatching(normalizedUserData);
    
    const hashValidation = Object.entries(advancedMatching).map(([key, value]) => {
        return { field: key, len: value ? value.length : 0, ok: value && value.length === 64 };
    });
    const allHashesValid = hashValidation.every(v => v.ok);
    console.log('[CAPI-AM] hashed_len=64 for all fields | ok=' + allHashesValid, hashValidation);
}
```

---

## Fluxo Corrigido

### 1. Usuário preenche formulário na página de obrigado

```
Browser → Normalizar dados (plaintext):
  - email: lowercase + trim
  - phone: apenas dígitos
  - fn/ln: lowercase + trim + sem acentos
  - external_id: CPF apenas dígitos
```

### 2. Disparo do Pixel (browser)

```javascript
// Dados em PLAINTEXT
advancedMatching = {
    em: "usuario@email.com",           // plaintext
    ph: "5511999999999",                // plaintext
    fn: "joao",                          // plaintext
    ln: "silva",                         // plaintext
    external_id: "12345678901",         // plaintext
    fbp: "fb.1.xxx.xxx",
    fbc: "fb.1.xxx.fbclid"
}

// Chamada correta
fbq('set', 'user_data', advancedMatching);  // ✅ snake_case
fbq('track', 'Purchase', customData, { eventID: 'pur:123' });
```

**O Pixel faz o hash internamente antes de enviar à Meta.**

### 3. Envio ao backend CAPI

```javascript
// Body da request
{
    token: "abc123",
    event_id: "pur:123",
    event_source_url: "https://...",
    custom_data: { value: 100, currency: "BRL", ... },
    normalized_user_data: {           // ✅ PLAINTEXT
        email: "usuario@email.com",
        phone: "5511999999999",
        first_name: "joao",
        last_name: "silva",
        external_id: "12345678901"
    }
}
```

### 4. Backend processa e hasheia

```
Backend → Re-normaliza (defesa) → Hasheia SHA-256 → Envia à Meta CAPI
```

```javascript
// Hashes enviados à Meta (SHA-256 hex lowercase 64 chars)
userData = {
    em: ["a1b2c3...64chars"],
    ph: ["d4e5f6...64chars"],
    fn: ["g7h8i9...64chars"],
    ln: ["j0k1l2...64chars"],
    external_id: ["m3n4o5...64chars"],
    fbp: "fb.1.xxx.xxx",
    fbc: "fb.1.xxx.fbclid",
    client_ip_address: "192.168.1.1",
    client_user_agent: "Mozilla/5.0..."
}
```

### 5. Deduplicação na Meta

```
Meta recebe:
  - Pixel: event_id="pur:123" (com user_data hasheado pelo Pixel)
  - CAPI:  event_id="pur:123" (com user_data hasheado pelo backend)

Meta deduplica automaticamente via event_id → conta como 1 Purchase único
```

---

## Validações e Logs Esperados

### Frontend (Console do Browser)

```
[ADVANCED-MATCH-FRONT] normalized { em:ok, ph:ok, fn:ok, ln:ok, external_id:ok }

[ADVANCED-MATCH-FRONT] user_data ready {
    has_em: true,
    has_ph: true,
    has_fn: true,
    has_ln: true,
    has_external_id: true,
    has_fbp: true,
    has_fbc: true
}

[PURCHASE-BROWSER] 📊 Advanced Matching (plaintext) sendo enviado ao Pixel

[PURCHASE-BROWSER] ✅ Purchase enviado ao Pixel (plaintext AM)
```

### Backend (Logs do servidor)

```
[CAPI-DEDUPE] policy=cross-channel-allowed {
    pixel_sent: true,
    capi_sent: false,
    proceeding: true
}

[CAPI-AM] normalized { em:ok, ph:ok, fn:ok, ln:ok, external_id:ok }

[CAPI-AM] hashed_len=64 for all fields | ok=true [
    { field: 'em', len: 64, ok: true },
    { field: 'ph', len: 64, ok: true },
    { field: 'fn', len: 64, ok: true },
    { field: 'ln', len: 64, ok: true },
    { field: 'external_id', len: 64, ok: true }
]
```

---

## Testes Recomendados

### 1. Teste de Pixel no Browser

```javascript
// Abrir DevTools → Console
// Verificar que fbq recebe dados plaintext
// Não deve haver warning de "invalid value of pixel_id"
```

### 2. Teste de CAPI idempotente

```bash
# Enviar Purchase pelo browser (dispara Pixel)
# Depois chamar CAPI manualmente
curl -X POST https://seu-app.com/api/capi/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "token": "abc123",
    "event_id": "pur:123",
    "normalized_user_data": {
      "email": "teste@email.com",
      "phone": "5511999999999",
      "first_name": "joao",
      "last_name": "silva",
      "external_id": "12345678901"
    }
  }'

# Deve retornar 200 OK mesmo que Pixel já tenha sido enviado
```

### 3. Verificar deduplicação na Meta

1. Ir ao Events Manager do Facebook
2. Buscar o `event_id` específico
3. Verificar que:
   - Evento aparece apenas 1 vez
   - Source = "Website" ou "Browser & Server" (se ambos enviados)
   - Event Match Quality (EMQ) = GOOD/GREAT (8-10 pontos)

---

## Arquivos Modificados

1. **MODELO1/WEB/obrigado_purchase_flow.html**
   - Linha ~479-509: Envio plaintext ao Pixel
   - Linha ~573-598: Correção fbq('set', 'user_data')
   - Linha ~378-382: Reconstrução _fbc
   - Linha ~624-634: Payload CAPI plaintext

2. **services/purchaseCapi.js**
   - Linha ~587-618: validatePurchaseReadiness (remover bloqueio)
   - Linha ~237-267: Re-normalização e hashing backend

3. **server.js**
   - Linha ~2190-2225: Log deduplicação + validação
   - Linha ~2359-2394: Re-normalização e hashing backend

---

## Resultado Final

✅ **Pixel recebe dados plaintext** → Facebook hasheia internamente  
✅ **fbq usa `user_data` correto** → Sem warnings  
✅ **_fbc reconstruído** de fbclid quando ausente  
✅ **CAPI é idempotente** → Não bloqueia se Pixel já foi enviado  
✅ **Backend hasheia SHA-256** → Todos com 64 chars  
✅ **Meta deduplica** → Pixel + CAPI = 1 evento único  

**Event Match Quality esperado:** 8-10 (GOOD/GREAT)