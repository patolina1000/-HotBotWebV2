# 📊 Exemplo Visual - Events Manager (Advanced Matching)

## 🎯 Como Visualizar no Facebook Events Manager

### 1. Acessar Test Events

1. Ir para [Facebook Events Manager](https://business.facebook.com/events_manager)
2. Selecionar o Pixel correto
3. Clicar em **"Test Events"** no menu lateral
4. Filtrar pelo seu dispositivo/navegador

---

## 2. Cartão do Evento "Purchase" (Browser)

### 📍 Localização do Advanced Matching

No cartão do evento Purchase, procurar a seção:

```
📊 Parâmetros de correspondência avançada
```

---

## 3. ANTES vs DEPOIS da Correção

### ❌ **ANTES (Incompleto)**

```
┌─────────────────────────────────────────────────────┐
│ 📊 Parâmetros de correspondência avançada           │
├─────────────────────────────────────────────────────┤
│                                                     │
│ 📍 Endereço IP:        203.0.113.45                │
│ 🖥️  Agente utilizador:  Mozilla/5.0 (Windows NT...│
│                                                     │
│ ⚠️ Apenas 2 parâmetros de correspondência          │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Problema:**
- ❌ E-mail ausente
- ❌ Telefone ausente
- ❌ Nome ausente
- ❌ Sobrenome ausente
- ❌ Identificação externa ausente

---

### ✅ **DEPOIS (Completo)**

```
┌─────────────────────────────────────────────────────┐
│ 📊 Parâmetros de correspondência avançada           │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ✅ E-mail:                  test@example.com        │
│ ✅ Telefone:                +5511999999999          │
│ ✅ Nome próprio:            João                    │
│ ✅ Apelido:                 Silva Santos            │
│ ✅ Identificação externa:   12345678901             │
│ ✅ Endereço IP:             203.0.113.45            │
│ ✅ Agente utilizador:       Mozilla/5.0 (Windows...│
│                                                     │
│ ✅ 7 parâmetros de correspondência avançada         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Sucesso:**
- ✅ E-mail presente
- ✅ Telefone presente
- ✅ Nome presente
- ✅ Sobrenome presente
- ✅ Identificação externa presente
- ✅ IP e User Agent (automático)

---

## 4. Detalhes do Evento Purchase

### 🔍 Expandir o cartão para ver mais detalhes:

```
┌─────────────────────────────────────────────────────┐
│ 🛒 Purchase                            🌐 Browser   │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ⏰ Hora:         08/10/2025 14:32:15 (há 2min)     │
│ 🆔 Event ID:     pur:abc123xyz456                   │
│ 💰 Valor:        R$ 97,00 BRL                       │
│                                                     │
├─────────────────────────────────────────────────────┤
│ 📊 Parâmetros de correspondência avançada           │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ✅ E-mail:                  test@example.com        │
│ ✅ Telefone:                +5511999999999          │
│ ✅ Nome próprio:            João                    │
│ ✅ Apelido:                 Silva Santos            │
│ ✅ Identificação externa:   12345678901             │
│ ✅ Endereço IP:             203.0.113.45            │
│ ✅ Agente utilizador:       Mozilla/5.0...          │
│                                                     │
├─────────────────────────────────────────────────────┤
│ 📦 Parâmetros personalizados                        │
├─────────────────────────────────────────────────────┤
│                                                     │
│ value:           97.00                              │
│ currency:        BRL                                │
│ transaction_id:  abc123xyz456                       │
│ content_name:    Plano Premium                      │
│ utm_source:      facebook                           │
│ utm_medium:      cpc                                │
│ utm_campaign:    campanha_teste                     │
│                                                     │
├─────────────────────────────────────────────────────┤
│ 🔗 URL do evento                                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│ https://seudominio.com/obrigado_purchase_flow.html │
│ ?token=ABC123&valor=97                              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 5. Comparação: Browser vs CAPI

Quando abrir ambos os eventos no Test Events, você verá **dois cartões**:

### 🌐 **Cartão 1: Browser (Pixel)**

```
┌─────────────────────────────────────────────────────┐
│ 🛒 Purchase                            🌐 Browser   │
├─────────────────────────────────────────────────────┤
│ 🆔 Event ID:     pur:abc123xyz456                   │
│ 💰 Valor:        R$ 97,00 BRL                       │
│                                                     │
│ 📊 Parâmetros de correspondência avançada           │
│                                                     │
│ ✅ E-mail:                  test@example.com        │
│ ✅ Telefone:                +5511999999999          │
│ ✅ Nome próprio:            João                    │
│ ✅ Apelido:                 Silva Santos            │
│ ✅ Identificação externa:   12345678901             │
│ ✅ Endereço IP:             203.0.113.45            │
│ ✅ Agente utilizador:       Mozilla/5.0...          │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 🖥️ **Cartão 2: Servidor (CAPI)**

```
┌─────────────────────────────────────────────────────┐
│ 🛒 Purchase                          🖥️ Servidor    │
├─────────────────────────────────────────────────────┤
│ 🆔 Event ID:     pur:abc123xyz456                   │
│ 💰 Valor:        R$ 97,00 BRL                       │
│                                                     │
│ 📊 Parâmetros de correspondência avançada           │
│                                                     │
│ ✅ E-mail:                  [hash SHA256]           │
│ ✅ Telefone:                [hash SHA256]           │
│ ✅ Nome próprio:            [hash SHA256]           │
│ ✅ Apelido:                 [hash SHA256]           │
│ ✅ Identificação externa:   [hash SHA256]           │
│ ✅ Endereço IP:             203.0.113.45            │
│ ✅ Agente utilizador:       Go-http-client/1.1      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 🔍 **Diferenças Esperadas:**

| Campo | Browser | CAPI |
|-------|---------|------|
| **E-mail** | Plaintext | Hash SHA256 |
| **Telefone** | Plaintext | Hash SHA256 |
| **Nome** | Plaintext | Hash SHA256 |
| **Sobrenome** | Plaintext | Hash SHA256 |
| **External ID** | Plaintext | Hash SHA256 |
| **User Agent** | Browser real | `Go-http-client/1.1` |
| **Event ID** | ✅ IGUAL (dedupe) | ✅ IGUAL (dedupe) |

---

## 6. Como Verificar se está Funcionando

### ✅ **Checklist Visual:**

1. **Abrir Test Events**
   - [ ] Ver dois cartões: um `🌐 Browser` e um `🖥️ Servidor`

2. **Verificar Event ID**
   - [ ] Ambos têm o **mesmo Event ID** (ex: `pur:abc123`)
   - [ ] Isso confirma que a deduplicação vai funcionar

3. **Contar parâmetros de AM no Browser**
   - [ ] Deve ter **7 parâmetros** (ou pelo menos 5 se FBC/FBP ausentes)
   - [ ] E-mail, Telefone, Nome, Sobrenome, External ID visíveis

4. **Verificar dados em plaintext no Browser**
   - [ ] E-mail deve estar em texto claro (ex: `test@example.com`)
   - [ ] Telefone deve estar em texto claro (ex: `+5511999999999`)
   - [ ] **NÃO** deve estar hasheado

5. **Verificar dados hasheados no CAPI**
   - [ ] E-mail deve estar hasheado (ex: `a665a45920422f9d417...`)
   - [ ] Telefone deve estar hasheado

---

## 7. Troubleshooting Visual

### ❌ **Problema 1: Campos ausentes no Browser**

**Visual:**
```
┌─────────────────────────────────────────────────────┐
│ 📊 Parâmetros de correspondência avançada           │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ❌ E-mail:               (ausente)                  │
│ ❌ Telefone:             (ausente)                  │
│ ✅ Endereço IP:          203.0.113.45               │
│ ✅ Agente utilizador:    Mozilla/5.0...             │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Causa:**
- `fbq('set', 'user_data')` não foi chamado ou foi chamado vazio

**Verificar no Console:**
```javascript
[ADVANCED-MATCH-FRONT] normalized { em: false, ph: false, ... }
```

---

### ❌ **Problema 2: Dados hasheados no Browser**

**Visual:**
```
┌─────────────────────────────────────────────────────┐
│ 📊 Parâmetros de correspondência avançada           │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ❌ E-mail:    a665a45920422f9d417e2264e99e...      │  ← ERRADO!
│ ❌ Telefone:  5d41402abc4b2a76b9719d911017c...      │  ← ERRADO!
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Problema:**
- Dados estão sendo hasheados no front ANTES de enviar ao Pixel

**Causa:**
- Código está usando `sha256()` antes de passar ao `fbq('set', 'user_data')`

**Solução:**
- ✅ JÁ CORRIGIDO - Enviamos plaintext diretamente

---

### ❌ **Problema 3: Dois eventos sem mesmo Event ID**

**Visual:**
```
Cartão 1 (Browser):   Event ID: pur:abc123
Cartão 2 (CAPI):      Event ID: pur:xyz789  ← DIFERENTE!
```

**Problema:**
- Dedupe não vai funcionar → eventos duplicados no Ads Manager

**Verificar no Console:**
```javascript
[PURCHASE-BROWSER] event_id=pur:abc123
[CAPI] event_id enviado: pur:abc123
```

---

## 8. Formato JSON (para desenvolvedores)

### Exemplo do objeto `user_data` enviado ao Pixel:

```javascript
{
  "em": "test@example.com",              // plaintext
  "ph": "+5511999999999",                // plaintext (com +55)
  "fn": "joão",                          // lowercase, sem acentos
  "ln": "silva santos",                  // lowercase, sem acentos
  "external_id": "12345678901",          // somente dígitos
  "fbp": "fb.1.1234567890.1234567890",   // cookie _fbp
  "fbc": "fb.1.1234567890.IwAR123abc"    // cookie _fbc ou reconstruído
}
```

**Importante:**
- ✅ **Plaintext** (não hasheado)
- ✅ **Normalizado** (lowercase, sem espaços extras, sem acentos)
- ✅ **Telefone com código do país** (+55)
- ✅ **Sem campos vazios**

---

## 9. Exemplo de URL de Teste

Para testar, acesse:

```
https://seudominio.com/obrigado_purchase_flow.html?token=TOKEN_VALIDO&valor=97&fbclid=IwAR123abc
```

**Parâmetros recomendados:**
- `token`: Token válido da tabela `purchase_tokens`
- `valor`: Valor da compra (ex: 97)
- `fbclid`: Facebook Click ID (para testar reconstrução de FBC)

---

## 10. Resumo Visual

### ✅ **Sucesso Esperado:**

```
┌─────────────────────────────────────────────────────┐
│                 EVENTS MANAGER                      │
├─────────────────────────────────────────────────────┤
│                                                     │
│  🌐 Browser Purchase          🖥️ CAPI Purchase     │
│  ├─ Event ID: pur:abc123      ├─ Event ID: pur:abc123  (IGUAL!)
│  ├─ Value: R$ 97,00           ├─ Value: R$ 97,00       │
│  └─ Advanced Matching:        └─ Advanced Matching:    │
│     ✅ E-mail (plaintext)        ✅ E-mail (hashed)    │
│     ✅ Telefone (plaintext)      ✅ Telefone (hashed)  │
│     ✅ Nome (plaintext)          ✅ Nome (hashed)      │
│     ✅ Sobrenome (plaintext)     ✅ Sobrenome (hashed) │
│     ✅ External ID (plaintext)   ✅ External ID (hashed)│
│     ✅ IP + User Agent           ✅ IP + User Agent    │
│                                                     │
│  🎯 PARIDADE COMPLETA!                              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

**✅ Com essa configuração, o Facebook vai conseguir fazer o melhor matching possível, aumentando a qualidade dos dados de conversão e melhorando a performance das campanhas!**

---

**📝 Criado em:** 08/10/2025  
**📂 Arquivo ajustado:** `/workspace/MODELO1/WEB/obrigado_purchase_flow.html`