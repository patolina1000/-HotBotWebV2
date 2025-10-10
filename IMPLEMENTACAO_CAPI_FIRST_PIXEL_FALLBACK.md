# Implementação: CAPI-First com Fallback do Pixel

## Objetivo
Otimizar o fluxo de Purchase para enviar **somente o CAPI** primeiro. O Pixel é disparado **apenas se o CAPI falhar** (HTTP não-2xx, timeout, network error). A deduplicação via `event_id` garante que a Meta não conte eventos duplicados quando ambos chegam.

## Mudanças Realizadas

### 1. Backend (Server-First)

#### Arquivo: `server.js` (linhas 2657-2680)
**Mudança:** Removida a dependência de `pixel_sent === true` para permitir envio do CAPI.

**Antes:**
```javascript
if (!tokenData.pixel_sent || !tokenData.capi_ready) {
  return res.status(400).json({
    success: false,
    reason: 'not_ready',
    details: {
      pixel_sent: !!tokenData.pixel_sent,
      capi_ready: !!tokenData.capi_ready
    }
  });
}
```

**Depois:**
```javascript
// [SERVER-FIRST] Validar capi_ready independente de pixel_sent
if (!tokenData.capi_ready) {
  console.warn('[PURCHASE-CAPI] ⚠️ Token ainda não está pronto para envio', {
    request_id: requestId,
    token,
    pixel_sent: tokenData.pixel_sent,
    capi_ready: tokenData.capi_ready,
    reason: 'capi_not_ready'
  });

  return res.status(400).json({
    success: false,
    reason: 'capi_not_ready',
    details: {
      pixel_sent: !!tokenData.pixel_sent,
      capi_ready: !!tokenData.capi_ready
    }
  });
}

// [SERVER-FIRST][CAPI] Log discreto: prosseguindo sem exigir pixel_sent
console.log(
  `[SERVER-FIRST][CAPI] prosseguindo sem pixel_sent (capi_ready=true) token=${token} event_id=${tokenData.event_id_purchase || 'pending'} request_id=${requestId}`
);
```

**Efeito:**
- CAPI pode ser enviado com `capi_ready === true` e `capi_sent === false`, independente de `pixel_sent`
- Bloqueio apenas quando `!capi_ready` (reason: `capi_not_ready`)
- Log discreto incluindo `token`, `event_id`, `request_id`

---

#### Arquivo: `services/purchaseCapi.js` (linhas 667-693)
**Mudança:** Função `validatePurchaseReadiness` não exige mais `pixel_sent === true`.

**Antes:**
```javascript
function validatePurchaseReadiness(tokenData) {
  if (!tokenData) {
    return { valid: false, reason: 'token_not_found', already_sent: false };
  }

  // Verificar se pixel já foi enviado
  if (!tokenData.pixel_sent) {
    return { valid: false, reason: 'pixel_not_sent', already_sent: false };
  }

  // Verificar se webhook já marcou como pronto
  if (!tokenData.capi_ready) {
    return { valid: false, reason: 'capi_not_ready', already_sent: false };
  }

  const already_sent = !!tokenData.capi_sent;

  // Verificar se tem email e telefone
  if (!tokenData.email || !tokenData.phone) {
    return { valid: false, reason: 'missing_email_or_phone', already_sent };
  }

  // Verificar se tem dados do webhook
  if (!tokenData.payer_name || !tokenData.payer_cpf) {
    return { valid: false, reason: 'missing_payer_data', already_sent };
  }

  return { valid: true, reason: null, already_sent };
}
```

**Depois:**
```javascript
function validatePurchaseReadiness(tokenData) {
  if (!tokenData) {
    return { valid: false, reason: 'token_not_found', already_sent: false };
  }

  // [SERVER-FIRST] Validar capi_ready independente de pixel_sent
  if (!tokenData.capi_ready) {
    return { valid: false, reason: 'capi_not_ready', already_sent: false };
  }

  // [SERVER-FIRST] Bloquear se já enviado (deduplicação server-side)
  if (tokenData.capi_sent) {
    return { valid: false, reason: 'already_sent', already_sent: true };
  }

  // Verificar se tem email e telefone
  if (!tokenData.email || !tokenData.phone) {
    return { valid: false, reason: 'missing_email_or_phone', already_sent: false };
  }

  // Verificar se tem dados do webhook
  if (!tokenData.payer_name || !tokenData.payer_cpf) {
    return { valid: false, reason: 'missing_payer_data', already_sent: false };
  }

  return { valid: true, reason: null, already_sent: false };
}
```

**Efeito:**
- Validação `pixel_sent` removida
- Bloqueia somente se `!capi_ready` ou `capi_sent === true`
- `already_sent: true` retornado quando `capi_sent === true`

---

### 2. Frontend (CAPI-First + Fallback)

#### Arquivo: `MODELO1/WEB/obrigado_purchase_flow.html` (linhas 824-1010)
**Mudança:** Invertida a ordem de envio. CAPI é enviado primeiro, Pixel apenas em caso de falha.

**Fluxo Implementado:**

1. **Enviar CAPI com timeout de 8s** (AbortController):
   ```javascript
   const controller = new AbortController();
   const timeoutId = setTimeout(() => controller.abort(), 8000);

   const capiResponse = await fetch('/api/capi/purchase', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(capiPayload),
     signal: controller.signal
   });
   ```

2. **Considerar sucesso se:**
   - `response.ok === true` e `capiData.success === true`, **OU**
   - HTTP 400 com `capiData.reason === 'already_sent'`

   ```javascript
   if (capiResponse.ok && capiData && capiData.success) {
     capiSuccess = true;
     console.log(`[FALLBACK] CAPI OK → pular Pixel (event_id=${eventIdPurchase})`);
   } else if (capiResponse.status === 400 && capiData && capiData.reason === 'already_sent') {
     capiSuccess = true;
     capiAlreadySent = true;
     console.log(`[FALLBACK] CAPI já enviado anteriormente → pular Pixel (event_id=${eventIdPurchase})`);
   }
   ```

3. **Se CAPI falhar** (timeout, network error, HTTP não-2xx fora de `already_sent`):
   - Disparar Pixel via `initPixelAndTrackPurchase()`
   - Chamar `/api/mark-pixel-sent` **somente após** o Pixel disparar
   - Buffer de 1-2s antes do redirect

   ```javascript
   if (!capiSuccess) {
     console.log(`[FALLBACK] CAPI falhou → disparando Pixel (event_id=${eventIdPurchase})`);
     
     if (window.__fbqReady && window.__fbqReady()) {
       await initPixelAndTrackPurchase();

       const markPixelResponse = await fetch('/api/mark-pixel-sent', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ token })
       });

       console.log(`[FALLBACK] Pixel enviado → mark-pixel-sent OK → redirect`);
       await new Promise(resolve => setTimeout(resolve, 1500));
     }
   }
   ```

4. **Guard anti-duplo no Pixel:**
   ```javascript
   if (window.__purchaseFired === eventIdPurchase) {
     console.log('[FALLBACK] Purchase Pixel já disparado, ignorando duplicata');
     return;
   }
   window.__purchaseFired = eventIdPurchase;
   ```

5. **Redirect:**
   - Se CAPI sucesso → redirect direto (sem marcar `pixel_sent`)
   - Se CAPI falha e Pixel disparou → redirect após `mark-pixel-sent` retornar 200

**Logs Adicionados:**
- `[FALLBACK] Tentando CAPI primeiro (event_id=...)`
- `[FALLBACK] CAPI OK → pular Pixel (event_id=...)`
- `[FALLBACK] CAPI falhou → disparando Pixel (event_id=...)`
- `[FALLBACK] Pixel enviado → mark-pixel-sent OK → redirect`
- `[FALLBACK] CAPI timeout após 8s (event_id=...)`
- `[FALLBACK] CAPI erro de rede: ... (event_id=...)`
- `[FALLBACK] Purchase Pixel já disparado, ignorando duplicata`

---

## O Que Não Foi Alterado

✅ **Mantidos intactos:**
- Função `initPixelAndTrackPurchase()` (inicialização do Pixel com Advanced Matching + GEO)
- Geração de `event_id` e `custom_data`
- UTMs, fbp, fbc, IP/UA, hashing server-side
- Normalização de dados (`normalizeEmail`, `normalizePhone`, etc.)
- Montagem de payload do CAPI
- Persistências no backend
- Deduplicação via `event_id` (Meta faz a deduplicação automática)

---

## Critérios de Aceite

### Caso A (Normal): CAPI Sucesso
1. CAPI responde 2xx com `success: true`
2. Pixel **não dispara**
3. `pixel_sent` **não é marcado**
4. Redirect funciona após 2s

**Log esperado:**
```
[FALLBACK] Tentando CAPI primeiro (event_id=pur:123)
[PURCHASE-BROWSER] call /api/capi/purchase resposta -> OK
[FALLBACK] CAPI OK → pular Pixel (event_id=pur:123)
```

---

### Caso B (Falha): CAPI Timeout/5xx/4xx (exceto already_sent)
1. CAPI não responde em 8s **OU** retorna erro HTTP
2. Pixel **dispara** via `initPixelAndTrackPurchase()`
3. `/api/mark-pixel-sent` é chamado **após** o Pixel
4. Buffer de 1-2s, depois redirect

**Log esperado:**
```
[FALLBACK] Tentando CAPI primeiro (event_id=pur:123)
[FALLBACK] CAPI timeout após 8s (event_id=pur:123)
[FALLBACK] CAPI falhou → disparando Pixel (event_id=pur:123)
[PIXEL] ✅ Meta Pixel inicializado com AM: 123456789
[PURCHASE-BROWSER] ✅ Purchase enviado ao Pixel (AM via init)
[PURCHASE-BROWSER] mark-pixel-sent -> OK
[FALLBACK] Pixel enviado → mark-pixel-sent OK → redirect
```

---

### Caso C (Deduplicação): CAPI Already Sent
1. CAPI responde 400 com `reason: 'already_sent'`
2. Considerado **sucesso** (não dispara Pixel)
3. Redirect funciona

**Log esperado:**
```
[FALLBACK] Tentando CAPI primeiro (event_id=pur:123)
[PURCHASE-BROWSER] call /api/capi/purchase resposta -> ERR
[FALLBACK] CAPI já enviado anteriormente → pular Pixel (event_id=pur:123)
```

---

## Arquivos Alterados

### Backend:
1. **`server.js`** (linhas 2657-2680)
   - Removida validação `!tokenData.pixel_sent`
   - Adicionado log `[SERVER-FIRST][CAPI]`

2. **`services/purchaseCapi.js`** (linhas 667-693)
   - Removida validação `!tokenData.pixel_sent` em `validatePurchaseReadiness`
   - Bloqueio agora apenas para `!capi_ready` ou `capi_sent === true`

### Frontend:
3. **`MODELO1/WEB/obrigado_purchase_flow.html`** (linhas 824-1010)
   - Implementado CAPI-first com timeout de 8s via `AbortController`
   - Fallback do Pixel condicionado à falha do CAPI
   - Guard anti-duplo: `window.__purchaseFired === eventIdPurchase`
   - Logs `[FALLBACK]` em todos os pontos de decisão

---

## Aplicação do Patch

O patch está disponível em formato unified diff para aplicação via:

```bash
git apply --3way capi-first-fallback-pixel.patch
```

Ou copie o diff diretamente e aplique manualmente.

---

## Testes Recomendados

1. **Fluxo normal (CAPI sucesso):**
   - Verificar que Pixel não dispara
   - Verificar que `pixel_sent` permanece `false`
   - Verificar redirect após 2s

2. **Fluxo fallback (CAPI timeout):**
   - Simular timeout no backend (delay > 8s)
   - Verificar que Pixel dispara
   - Verificar que `pixel_sent` é marcado `true`
   - Verificar redirect após buffer de 1-2s

3. **Fluxo fallback (CAPI 5xx):**
   - Simular erro 500 no backend
   - Verificar comportamento idêntico ao timeout

4. **Fluxo deduplicação (CAPI already_sent):**
   - Enviar Purchase duas vezes seguidas
   - Segunda tentativa deve retornar `already_sent`
   - Pixel não deve disparar na segunda tentativa
   - Redirect deve funcionar

5. **Guard anti-duplo:**
   - Verificar que múltiplas chamadas a `initPixelAndTrackPurchase()` com mesmo `event_id` não disparam múltiplos eventos

---

## Monitoramento

### Logs Chave (Backend):
- `[SERVER-FIRST][CAPI] prosseguindo sem pixel_sent (capi_ready=true) token=... event_id=... request_id=...`
- `[PURCHASE-CAPI] ⚠️ Token ainda não está pronto para envio` (reason: `capi_not_ready`)

### Logs Chave (Frontend):
- `[FALLBACK] Tentando CAPI primeiro (event_id=...)`
- `[FALLBACK] CAPI OK → pular Pixel (event_id=...)`
- `[FALLBACK] CAPI falhou → disparando Pixel (event_id=...)`
- `[FALLBACK] Pixel enviado → mark-pixel-sent OK → redirect`
- `[FALLBACK] CAPI timeout após 8s (event_id=...)`

---

## Próximos Passos

1. ✅ Aplicar patch em ambiente de staging
2. ✅ Executar testes manuais dos 5 cenários acima
3. ✅ Verificar logs no Meta Events Manager:
   - Deduplicação funcionando (mesmo `event_id` + `event_name`)
   - EMQ (Event Match Quality) mantido ou melhorado
4. ✅ Deploy em produção após validação
5. ✅ Monitorar taxa de fallback (% de eventos que caem no Pixel)

---

## Notas Adicionais

- **Deduplicação:** A Meta faz deduplicação automática quando eventos têm mesmo `event_id` + `event_name` (ex: `pur:123` + `Purchase`)
- **Timeout:** 8s é conservador para CAPI server-side. Ajustar se necessário baseado em latência real.
- **Buffer:** 1-2s após `mark-pixel-sent` garante que o Pixel tenha tempo de enviar antes do redirect.
- **Guard anti-duplo:** Protege contra múltiplos disparos caso o fluxo seja executado mais de uma vez na mesma sessão.
