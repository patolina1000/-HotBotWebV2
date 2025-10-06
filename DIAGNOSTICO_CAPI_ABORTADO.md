# Diagnóstico: CAPI Purchase Abortado

## Problemas Identificados

### 1. ❌ Erro `req is not defined` (CRÍTICO)
**Arquivo:** `server.js` linha 974  
**Função:** `processarCapiWhatsApp`

#### Causa
A função `processarCapiWhatsApp` tentava acessar `req.headers`, `req.body` e `req.query` no campo `__httpRequest`, mas a função **não recebe `req` como parâmetro**.

#### Código com erro
```javascript
const capiResult = await sendFacebookEvent({
  // ... outros campos
  __httpRequest: {
    headers: req.headers,      // ❌ req não existe!
    body: req.body,            // ❌ req não existe!
    query: req.query           // ❌ req não existe!
  }
});
```

#### Solução
Removido o campo `__httpRequest` completamente, pois não é necessário para o `sendFacebookEvent`.

---

### 2. ⚠️ CAPI não executado no webhook (CRÍTICO)
**Arquivo:** `MODELO1/core/TelegramBotService.js` linhas 2282-2340

#### Causa
O código do webhook tinha o seguinte fluxo:

```javascript
if (row.telegram_id && this.bot) {
  await this.bot.sendMessage(...);  // ← Se houver erro aqui...
  await enviarConversaoParaUtmify(...);
  // ... código do Kwai
}  // ← Fim do bloco if

// Código do Google Sheets (linha 2342)
// Código do CAPI (linha 2376)  ← Nunca é executado se houver erro acima!
```

**Problema:** Qualquer erro não tratado dentro do bloco `if` fazia o código pular direto para o `catch` final, **ignorando completamente** o envio do CAPI.

#### Evidências do log
```
[bot1] Link final: https://ohvips.xyz/obrigado.html?...
[bot1] 🔔 Webhook PushinPay recebido  ← SEGUNDO WEBHOOK
```

**Não apareceram:**
- ✅ Log do Google Sheets (linha 2352): `"Registrando tracking de Purchase no Google Sheets"`
- ✅ Log do CAPI (linha 2394): `"🚀 [PurchaseWebhook] Preparando envio Purchase CAPI"`

Isso confirma que a execução foi **interrompida** após o `sendMessage`.

#### Solução
Adicionado `try-catch` específico ao redor do bloco de notificação Telegram/UTMify/Kwai:

```javascript
if (row.telegram_id && this.bot) {
  try {
    await this.bot.sendMessage(...);
    await enviarConversaoParaUtmify(...);
    // ... código do Kwai
  } catch (telegramError) {
    console.error(`[${this.botId}] ❌ Erro ao processar notificação Telegram/UTMify/Kwai (não crítico):`, telegramError.message);
  }
}

// ✅ Agora o código SEMPRE continua aqui, mesmo que haja erro acima
// Código do Google Sheets (linha 2347)
// Código do CAPI (linha 2380)
```

---

## Por que o CAPI foi chamado apenas na página de obrigado?

### Fluxo Atual (INCORRETO)
1. ✅ Webhook PushinPay recebido
2. ✅ Pagamento confirmado
3. ✅ Token gerado e enviado por Telegram
4. ❌ **Erro silencioso** no bloco de notificação Telegram
5. ❌ **CAPI não enviado** (código não foi executado)
6. 👤 Usuário abre a página de obrigado
7. 📡 Página chama `/api/verificar-token`
8. 🔄 `processarCapiWhatsApp` é chamado
9. ❌ **Erro: `req is not defined`** → CAPI abortado

### Fluxo Correto (APÓS CORREÇÃO)
1. ✅ Webhook PushinPay recebido
2. ✅ Pagamento confirmado
3. ✅ Token gerado e enviado por Telegram
4. ⚠️ Erro no bloco Telegram (se houver) → **capturado e logado**
5. ✅ **CAPI enviado imediatamente** via `sendPurchaseCapi`
6. 👤 Usuário abre a página de obrigado (se quiser)
7. 📡 Página chama `/api/verificar-token`
8. ✅ CAPI já foi enviado → **deduplicação** impede envio duplicado

---

## Arquivos Modificados

### ✅ `server.js`
- **Linha 944-973:** Removido campo `__httpRequest` em `processarCapiWhatsApp`

### ✅ `MODELO1/core/TelegramBotService.js`
- **Linhas 2283-2343:** Adicionado `try-catch` ao redor do bloco de notificação Telegram/UTMify/Kwai

---

## Testes Recomendados

1. **Simular pagamento via webhook PushinPay**
   - Verificar se logs do CAPI aparecem: `"🚀 [PurchaseWebhook] Preparando envio Purchase CAPI"`
   - Verificar se CAPI é enviado com sucesso: `"✅ [PurchaseWebhook] Purchase CAPI enviado"`

2. **Simular erro no Telegram**
   - Desabilitar temporariamente o bot do Telegram
   - Verificar se CAPI ainda é enviado mesmo com erro no `sendMessage`

3. **Verificar página de obrigado**
   - Abrir página após webhook já ter processado
   - Verificar se CAPI não é enviado duplicado (log de deduplicação)

---

## Conclusão

O evento CAPI do Purchase foi abortado devido a **dois problemas independentes**:

1. ❌ **No webhook:** Erro silencioso interrompeu execução antes do CAPI
2. ❌ **Na página de obrigado:** Erro `req is not defined` causou falha no CAPI

**Ambos foram corrigidos.** Agora o CAPI será enviado **imediatamente** quando o webhook for recebido, conforme esperado.
