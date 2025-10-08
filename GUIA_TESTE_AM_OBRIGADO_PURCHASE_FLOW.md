# 🧪 Guia de Teste - Advanced Matching na Página de Obrigado

## 📍 Como Testar a Implementação

### 1️⃣ Preparação

1. **Abrir Chrome DevTools** (F12)
2. **Ir para a aba Console**
3. **Acessar a página de obrigado** com um token válido:
   ```
   https://seudominio.com/obrigado_purchase_flow.html?token=ABC123&valor=97
   ```

---

## 2️⃣ Logs Esperados no Console

### ✅ **Sequência de Logs Correta:**

```javascript
// 1. Pixel inicializado
[PIXEL] ✅ Meta Pixel inicializado: 1234567890123456

// 2. Contexto da compra carregado
[PURCHASE-BROWSER] 🧾 Contexto recebido { transaction_id: "abc123", value: 97, ... }

// 3. Identificadores resolvidos
[PURCHASE-BROWSER] 🍪 Identificadores resolvidos {
  fbp_cookie: "fb.1.1234567890.1234567890",
  fbc_cookie: "fb.1.1234567890.IwAR123...",
  fbp_final: "fb.1.1234567890.1234567890",
  fbc_final: "fb.1.1234567890.IwAR123...",
  fbclid: "IwAR123..."
}

// 4. (SE fbclid presente e _fbc ausente) Reconstrução de FBC
[ADVANCED-MATCH-FRONT] fbc reconstructed from fbclid

// === APÓS PREENCHER E SUBMETER O FORMULÁRIO ===

// 5. Save-contact enviado
[PURCHASE-BROWSER] ✉️ Enviando save-contact { token: "ABC123", email: "...", phone: "..." }

// 6. Resposta do save-contact
[PURCHASE-BROWSER] 📬 Resposta save-contact { success: true, event_id_purchase: "pur:abc123" }

// 7. NORMALIZAÇÃO DOS CAMPOS (formato exato solicitado)
[ADVANCED-MATCH-FRONT] normalized { 
  em: true, 
  ph: true, 
  fn: true, 
  ln: true, 
  external_id: true, 
  fbp: true, 
  fbc: true 
}

// 8. Event ID confirmado
[PURCHASE-BROWSER] event_id=pur:abc123

// 9. CONFIRMAÇÃO DE ORDEM CORRETA (antes do Purchase)
[ADVANCED-MATCH-FRONT] set user_data before Purchase | ok=true

// 10. Purchase enviado ao Pixel
[PURCHASE-BROWSER] ✅ Purchase enviado ao Pixel (plaintext AM): {
  event_id: "pur:abc123",
  custom_data_fields: 8,
  user_data_fields: 7,
  value: 97,
  currency: "BRL"
}

// 11. CAPI chamado
[PURCHASE-BROWSER] call /api/capi/purchase com body { ... }

// 12. CAPI respondido
[PURCHASE-BROWSER] call /api/capi/purchase resposta -> OK { success: true, ... }
```

---

## 3️⃣ Verificação no Facebook Events Manager

### 📊 **Acessar Test Events:**

1. Ir para **Events Manager** do Facebook Business
2. Selecionar o **Pixel ID** correto
3. Clicar em **Test Events**
4. Filtrar pelo navegador/device que está testando

### ✅ **O Que Deve Aparecer no Cartão do Evento "Purchase" (Browser):**

#### **Parâmetros de correspondência avançada:**

| Campo | Valor Exemplo | Status |
|-------|---------------|--------|
| **E-mail** | `test@example.com` | ✅ |
| **Telefone** | `+5511999999999` | ✅ |
| **Nome próprio** | `João` | ✅ |
| **Apelido** | `Silva Santos` | ✅ |
| **Identificação externa** | `12345678901` | ✅ |
| **Endereço IP** | `203.0.113.45` | ✅ (automático) |
| **Agente utilizador** | `Mozilla/5.0...` | ✅ (automático) |

#### **Parâmetros personalizados (Custom Data):**

| Campo | Valor Exemplo |
|-------|---------------|
| **value** | `97.00` |
| **currency** | `BRL` |
| **transaction_id** | `abc123xyz` |
| **content_name** | `Plano Premium` |
| **utm_source** | `facebook` |
| **utm_medium** | `cpc` |
| **utm_campaign** | `campanha_teste` |

---

## 4️⃣ Cenários de Teste

### ✅ **Cenário 1: Fluxo Completo com FBC Presente**

**Setup:**
- Acessar página com `fbclid` na URL
- Cookie `_fbc` já existe no browser

**Resultado esperado:**
- ✅ `fbc` presente no log de normalização
- ✅ Sem log de reconstrução
- ✅ FBC enviado ao Pixel

---

### ✅ **Cenário 2: Reconstrução de FBC**

**Setup:**
1. Limpar cookies do site
2. Acessar página com `fbclid` na URL (ex: `?fbclid=IwAR123abc`)

**Resultado esperado:**
```javascript
[ADVANCED-MATCH-FRONT] fbc reconstructed from fbclid
[ADVANCED-MATCH-FRONT] normalized { ..., fbc: true }
```

---

### ✅ **Cenário 3: Campos Parciais (Nome Incompleto)**

**Setup:**
- Pagador tem apenas primeiro nome (ex: "Maria")

**Resultado esperado:**
```javascript
[ADVANCED-MATCH-FRONT] normalized { 
  em: true, 
  ph: true, 
  fn: true,     // ✅
  ln: false,    // ❌ (sobrenome ausente)
  external_id: true, 
  fbp: true, 
  fbc: true 
}
```

---

### ✅ **Cenário 4: Reload da Página**

**Setup:**
1. Completar fluxo normalmente
2. Recarregar a página (F5)

**Resultado esperado:**
- ✅ Token ainda válido → formulário aparece novamente
- ✅ Ao resubmeter, Advanced Matching reaplicado
- ✅ Sem warnings do Pixel no console

---

## 5️⃣ Troubleshooting

### ❌ **Problema: "E-mail" não aparece no Events Manager**

**Possível causa:**
- Email não foi normalizado corretamente

**Como verificar:**
1. Checar log: `[ADVANCED-MATCH-FRONT] normalized { em: true, ... }`
2. Se `em: false`, verificar se email está vazio
3. Conferir `/shared/purchaseNormalization.js`

**Solução:**
- Garantir que o campo email está sendo preenchido no formulário

---

### ❌ **Problema: "Identificação externa" ausente**

**Possível causa:**
- CPF não foi capturado no contexto da compra

**Como verificar:**
```javascript
[PURCHASE-BROWSER] 🧾 Contexto recebido { payer_cpf: "...", ... }
```

**Solução:**
- Verificar se o webhook/checkout está salvando `payer_cpf`
- Conferir tabela `purchase_tokens` no banco

---

### ❌ **Problema: FBC sempre `false`**

**Possível causa:**
- URL sem `fbclid`
- Cookie `_fbc` não criado

**Como verificar:**
```javascript
[PURCHASE-BROWSER] 🍪 Identificadores resolvidos {
  fbc_cookie: null,
  fbclid: null,
  fbc_final: null
}
```

**Solução:**
- Testar com URL contendo `fbclid`
- Verificar se cookies estão habilitados no browser

---

### ❌ **Problema: Purchase enviado ANTES do user_data**

**Sintoma:**
- Warnings no console do Pixel
- Advanced Matching não aparece no Events Manager

**Como verificar:**
- Procurar por: `[ADVANCED-MATCH-FRONT] set user_data before Purchase | ok=true`
- Se não aparecer, a ordem está errada

**Solução:**
- ✅ JÁ CORRIGIDO na implementação atual
- Ordem garantida: `fbq('set', 'user_data', ...)` → `fbq('track', 'Purchase', ...)`

---

## 6️⃣ Checklist Final de Aceitação

### ✅ **Antes de considerar PRONTO:**

- [ ] Logs `[ADVANCED-MATCH-FRONT]` aparecem no console
- [ ] Log `normalized` mostra todos os campos como `true` (exceto `ln` se nome único)
- [ ] Log `set user_data before Purchase | ok=true` aparece
- [ ] Events Manager (browser) mostra **E-mail, Telefone, Nome, Sobrenome, External ID**
- [ ] Reconstrução de FBC funciona quando `fbclid` presente
- [ ] Reload da página não causa erros
- [ ] Purchase com `value` correto
- [ ] CAPI também envia evento com sucesso (paridade)

---

## 📸 Screenshots Esperados

### 1. **Console do Browser:**
```
✅ [ADVANCED-MATCH-FRONT] normalized { em:true, ph:true, fn:true, ln:true, external_id:true, fbp:true, fbc:true }
✅ [ADVANCED-MATCH-FRONT] set user_data before Purchase | ok=true
✅ [PURCHASE-BROWSER] ✅ Purchase enviado ao Pixel (plaintext AM)
```

### 2. **Events Manager (Test Events):**

**Cartão do evento Purchase (Browser):**
- ✅ **7 campos** em "Parâmetros de correspondência avançada"
- ✅ E-mail, Telefone, Nome, Sobrenome, External ID visíveis
- ✅ IP e User Agent preenchidos automaticamente

**Cartão do evento Purchase (Servidor/CAPI):**
- ✅ Mesmos 7 campos em "Parâmetros de correspondência avançada"
- ✅ Valores hasheados (SHA256)

---

## 🎯 Resultado Final Esperado

### **Antes da correção:**
```
Browser: 2 campos (IP, User Agent) ❌
CAPI:    7 campos (Email, Phone, FN, LN, External ID, IP, UA) ✅
```

### **Depois da correção:**
```
Browser: 7 campos (Email, Phone, FN, LN, External ID, IP, UA) ✅
CAPI:    7 campos (Email, Phone, FN, LN, External ID, IP, UA) ✅
```

**✅ PARIDADE COMPLETA entre Browser e CAPI!**

---

**📝 Documentação criada: 08/10/2025**  
**📂 Arquivo ajustado: `/workspace/MODELO1/WEB/obrigado_purchase_flow.html`**