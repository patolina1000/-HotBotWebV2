# Implementação Advanced Matching - Página de Obrigado Purchase Flow

## 📋 Escopo da Implementação

**Arquivo Ajustado:** `MODELO1/WEB/obrigado_purchase_flow.html`  
**Pastas Ignoradas:** `checkout/` (conforme solicitado)

---

## ✅ O Que Foi Implementado

### 1. **Advanced Matching Correto no Pixel (Browser)**

O código já estava enviando Advanced Matching em **plaintext** (sem hash) corretamente ao Facebook Pixel. A implementação garante:

- ✅ Uso de `fbq('set', 'user_data', advancedMatching)` em **snake_case**
- ✅ **Ordem correta**: `fbq('set', 'user_data', ...)` chamado **ANTES** de `fbq('track', 'Purchase', ...)`
- ✅ Dados enviados em **plaintext** (o próprio Pixel faz o hash internamente)
- ✅ **Não** inclui `pixel_id` dentro do objeto `user_data`
- ✅ **Não** envia campos vazios/nulos

### 2. **Campos de Advanced Matching Enviados**

```javascript
{
  em: <email normalizado>,           // E-mail
  ph: <telefone normalizado>,        // Telefone
  fn: <primeiro nome normalizado>,   // Nome próprio
  ln: <sobrenome normalizado>,       // Apelido
  external_id: <CPF normalizado>,    // Identificação externa
  fbp: <cookie _fbp>,                // Facebook Browser ID
  fbc: <cookie _fbc ou reconstruído> // Facebook Click ID
}
```

### 3. **Reconstrução de FBC**

Se o cookie `_fbc` estiver ausente e houver `fbclid` na URL, o código **reconstrói** automaticamente:

```javascript
fbc = `fb.1.<unix_timestamp>.<fbclid>`
```

**Log gerado:**
```
[ADVANCED-MATCH-FRONT] fbc reconstructed from fbclid
```

### 4. **Logs de Debug Implementados (Formato Solicitado)**

#### Log 1: Normalização dos Campos
```javascript
[ADVANCED-MATCH-FRONT] normalized { 
  em: true, 
  ph: true, 
  fn: true, 
  ln: true, 
  external_id: true, 
  fbp: true, 
  fbc: true 
}
```

#### Log 2: Confirmação de Ordem Correta
```javascript
[ADVANCED-MATCH-FRONT] set user_data before Purchase | ok=true
```

#### Log 3: Reconstrução de FBC (se aplicável)
```javascript
[ADVANCED-MATCH-FRONT] fbc reconstructed from fbclid
```

---

## 🔄 Fluxo de Execução

### Página de Obrigado (`obrigado_purchase_flow.html`)

1. **Carregamento inicial:**
   - Pixel inicializado via `/api/config`
   - Contexto da compra recuperado via `/api/purchase/context?token=...`
   - Cookies `_fbp` e `_fbc` lidos

2. **Usuário preenche email e telefone:**
   - Submit do formulário

3. **Dados enviados para `/api/save-contact`:**
   - Recebe `event_id_purchase` e `transaction_id`

4. **Normalização dos dados:**
   - Email, telefone, nome, sobrenome, CPF normalizados
   - Log: `[ADVANCED-MATCH-FRONT] normalized { ... }`

5. **Advanced Matching aplicado:**
   - `fbq('set', 'user_data', advancedMatching)` - **PLAINTEXT**
   - Log: `[ADVANCED-MATCH-FRONT] set user_data before Purchase | ok=true`

6. **Evento Purchase enviado:**
   - `fbq('track', 'Purchase', pixelCustomData, { eventID })`
   - Custom data: `value`, `currency`, `transaction_id`, `contents`, UTMs

7. **CAPI Purchase enviado:**
   - POST para `/api/capi/purchase`
   - Backend faz o hash antes de enviar à Meta

---

## 🧪 Testes de Aceitação

### ✅ Teste 1: Console Logs
Ao abrir a página com token válido, os logs devem aparecer:

```
[ADVANCED-MATCH-FRONT] normalized { em: true, ph: true, fn: true, ln: true, external_id: true, fbp: true, fbc: true }
[ADVANCED-MATCH-FRONT] set user_data before Purchase | ok=true
[PURCHASE-BROWSER] ✅ Purchase enviado ao Pixel (plaintext AM)
```

### ✅ Teste 2: Events Manager (Test Events)

No **cartão do browser**, em "Parâmetros de correspondência avançada", devem aparecer:

- ✅ **E-mail** (em)
- ✅ **Identificação externa** (external_id)
- ✅ **Nome próprio** (fn)
- ✅ **Apelido** (ln)
- ✅ **Telefone** (ph)
- ✅ **Endereço IP** (automático)
- ✅ **Agente utilizador** (automático)

### ✅ Teste 3: Reconstrução de FBC

Cenário: `_fbc` ausente + `fbclid` presente na URL

**Resultado esperado:**
```
[ADVANCED-MATCH-FRONT] fbc reconstructed from fbclid
[ADVANCED-MATCH-FRONT] normalized { ..., fbc: true }
```

### ✅ Teste 4: Reload da Página

Ao recarregar, o AM deve ser reaplicado **sem warnings** do Pixel.

---

## 🚫 Restrições Respeitadas

- ✅ **Não** editado nada na pasta `checkout/`
- ✅ **Somente** `obrigado_purchase_flow.html` foi alterado
- ✅ **Sem hash no front** (plaintext enviado ao Pixel)
- ✅ **Sem parâmetros inválidos** em `user_data` (ex.: `pixel_id`)
- ✅ **Não** envia campos vazios

---

## 📊 Comparação: Browser vs CAPI

| Parâmetro | Browser (Pixel) | CAPI (Servidor) |
|-----------|-----------------|-----------------|
| **E-mail** | ✅ Plaintext | ✅ Hashed (SHA256) |
| **Telefone** | ✅ Plaintext | ✅ Hashed (SHA256) |
| **Nome próprio** | ✅ Plaintext | ✅ Hashed (SHA256) |
| **Apelido** | ✅ Plaintext | ✅ Hashed (SHA256) |
| **Identificação externa** | ✅ Plaintext | ✅ Hashed (SHA256) |
| **fbp** | ✅ Cookie | ✅ Enviado |
| **fbc** | ✅ Cookie/Reconstruído | ✅ Enviado |
| **IP** | ✅ Automático (Browser) | ✅ Capturado (req.ip) |
| **User Agent** | ✅ Automático (Browser) | ✅ Capturado (req.headers) |

---

## 🎯 Resultado Final

Com essas correções, o **Events Manager** agora deve mostrar **TODOS os campos de Advanced Matching** no evento Purchase do **browser**, igualando a paridade com o CAPI.

**Antes:**
- Browser: Apenas IP e User Agent ❌

**Depois:**
- Browser: E-mail, Telefone, Nome, Sobrenome, External ID, FBP, FBC, IP, User Agent ✅

---

## 📝 Notas Técnicas

1. **Por que plaintext no browser?**
   - O Facebook Pixel faz o hashing **automaticamente** no client-side
   - Enviar dados já hasheados causa **perda de qualidade** no matching

2. **Por que hash no CAPI?**
   - O CAPI **exige** dados hasheados por segurança
   - O backend faz o hash antes de enviar à Meta

3. **Deduplicação garantida:**
   - `event_id` compartilhado entre Pixel e CAPI
   - Formato: `pur:<transaction_id>`

---

## 🔗 Arquivos Relacionados

- **Página ajustada:** `/workspace/MODELO1/WEB/obrigado_purchase_flow.html`
- **Normalização:** `/workspace/shared/purchaseNormalization.js`
- **Backend CAPI:** `/workspace/routes/capi.js`

---

**✅ Implementação concluída conforme especificação!**