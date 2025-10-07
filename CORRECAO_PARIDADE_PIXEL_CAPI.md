# Correção de Paridade entre Browser Pixel e CAPI

## 📋 Problema Identificado

Os eventos de **Purchase** estavam sendo enviados com parâmetros diferentes entre:
- **Browser (Pixel)**: 12 parâmetros
- **CAPI (Conversion API)**: apenas 7 parâmetros

### Parâmetros enviados pelo Browser:
1. value: 20
2. currency: BRL
3. content_ids: ["txn_a00f2d34-03fb-4044-b417-c2fecd2bae81"]
4. content_type: product
5. transaction_id: a00f2d34-03fb-4044-b417-c2fecd2bae81
6. utm_source: facebook
7. utm_medium: paid_social
8. utm_campaign: teste-funnel
9. utm_content: criativo-a
10. utm_term: interesse-a
11. contents: [{"id":"txn_...","quantity":1,"item_price":20,"title":"Oferta Desconhecida"}]
12. content_name: Oferta Desconhecida

### Parâmetros enviados pelo CAPI:
Apenas alguns dos parâmetros acima, faltando UTMs e outros campos importantes.

---

## 🔍 Causa Raiz

O problema estava na implementação do fluxo:

1. A página `obrigado_purchase_flow.html` buscava **TODOS** os dados via `/api/purchase/context`
2. O **Browser Pixel** usava esses dados completos corretamente
3. Mas ao chamar `/api/capi/purchase`, apenas 3 parâmetros eram enviados:
   - token
   - event_id
   - event_source_url
4. O endpoint `/api/capi/purchase` tinha que **reconstruir** todos os dados do banco de dados
5. Se algum dado não estivesse salvo no banco (como UTMs em casos de backfill), ele não seria enviado ao CAPI

---

## ✅ Solução Implementada

### 1. Modificações em `obrigado_purchase_flow.html`

**Arquivo**: `/workspace/MODELO1/WEB/obrigado_purchase_flow.html`

**Mudança**: Agora o browser envia **TODOS** os parâmetros ao CAPI, não apenas token e event_id.

```javascript
// ANTES (apenas 3 parâmetros)
const capiPayload = {
    token,
    event_id: eventId,
    event_source_url: eventSourceUrl
};

// DEPOIS (todos os parâmetros)
const capiPayload = {
    token,
    event_id: eventId,
    event_source_url: eventSourceUrl,
    // Enviar custom_data completo ao CAPI
    custom_data: pixelCustomData,
    // Enviar user_data normalizado
    normalized_user_data: normalizedData,
    advanced_matching: advancedMatchingHashed
};
```

### 2. Modificações em `server.js`

**Arquivo**: `/workspace/server.js`

#### a) Extração dos novos parâmetros do body

```javascript
const { 
  token, 
  event_id: eventIdFromBody, 
  event_source_url: eventSourceUrlFromBody,
  custom_data: customDataFromBrowser,
  normalized_user_data: normalizedUserDataFromBrowser,
  advanced_matching: advancedMatchingFromBrowser
} = req.body || {};
```

#### b) Priorização dos dados do browser

O endpoint agora **prioriza** os dados enviados pelo browser, usando o banco de dados apenas como fallback:

```javascript
// 🎯 PRIORIZAR DADOS DO BROWSER
const hasBrowserData = customDataFromBrowser && Object.keys(customDataFromBrowser).length > 0;

// UTMs do browser ou do banco
const utms = hasBrowserData && customDataFromBrowser.utm_source 
  ? {
      utm_source: customDataFromBrowser.utm_source || null,
      utm_medium: customDataFromBrowser.utm_medium || null,
      utm_campaign: customDataFromBrowser.utm_campaign || null,
      utm_term: customDataFromBrowser.utm_term || null,
      utm_content: customDataFromBrowser.utm_content || null
    }
  : extractUtmsFromSource(tokenData);

// Contents do browser ou do banco
if (hasBrowserData && customDataFromBrowser.contents) {
  contents = customDataFromBrowser.contents;
  contentIds = customDataFromBrowser.content_ids;
  contentType = customDataFromBrowser.content_type;
  contentName = customDataFromBrowser.content_name;
} else {
  // Fallback: reconstruir do banco
}
```

#### c) Log de paridade

Adicionado log detalhado para facilitar debugging:

```javascript
console.log('[PURCHASE-CAPI] 📊 Parâmetros completos para CAPI', {
  request_id: requestId,
  event_id: finalEventId,
  transaction_id: tokenData.transaction_id,
  value,
  currency,
  utm_source: utms.utm_source,
  utm_medium: utms.utm_medium,
  utm_campaign: utms.utm_campaign,
  utm_term: utms.utm_term,
  utm_content: utms.utm_content,
  contents_count: contents?.length || 0,
  content_ids_count: contentIds?.length || 0,
  content_type: contentType,
  content_name: contentName,
  fbclid: fbclidToUse,
  has_fbp: !!tokenData.fbp,
  has_fbc: !!tokenData.fbc
});
```

---

## 🎯 Resultado

Agora os eventos **Browser Pixel** e **CAPI** enviam **parâmetros idênticos**:

✅ value  
✅ currency  
✅ transaction_id  
✅ utm_source  
✅ utm_medium  
✅ utm_campaign  
✅ utm_term  
✅ utm_content  
✅ contents  
✅ content_ids  
✅ content_type  
✅ content_name  
✅ fbclid  

---

## 🧪 Como Testar

1. Gerar um novo pagamento com UTMs na URL
2. Acessar a página `obrigado_purchase_flow.html`
3. Verificar os logs no console do browser e no servidor
4. Confirmar no **Gerenciador de Eventos do Meta** que ambos os eventos (Browser e CAPI) têm os mesmos parâmetros

### Logs esperados:

**Browser:**
```
[PURCHASE-BROWSER] 🧾 Pixel custom_data {
  value: 20,
  currency: 'BRL',
  transaction_id: 'a00f2d34...',
  utm_source: 'facebook',
  utm_medium: 'paid_social',
  utm_campaign: 'teste-funnel',
  utm_term: 'interesse-a',
  utm_content: 'criativo-a',
  contents: [...],
  content_ids: [...],
  content_type: 'product',
  content_name: 'Oferta Desconhecida'
}
```

**CAPI:**
```
[PURCHASE-CAPI] 📊 Parâmetros completos para CAPI {
  value: 20,
  currency: 'BRL',
  transaction_id: 'a00f2d34...',
  utm_source: 'facebook',
  utm_medium: 'paid_social',
  utm_campaign: 'teste-funnel',
  utm_term: 'interesse-a',
  utm_content: 'criativo-a',
  contents_count: 1,
  content_ids_count: 1,
  content_type: 'product',
  content_name: 'Oferta Desconhecida'
}
```

---

## 📁 Arquivos Modificados

1. `/workspace/MODELO1/WEB/obrigado_purchase_flow.html` (linhas ~580-592)
2. `/workspace/server.js` (linhas ~1938-2356)

---

## ✨ Benefícios

1. **Paridade total** entre Browser Pixel e CAPI
2. **Deduplicação correta** no Meta (mesmo event_id, mesmos parâmetros)
3. **Dados mais precisos** para otimização de campanhas
4. **Fallback robusto** - se o browser não enviar dados, o servidor reconstrói do banco
5. **Logs detalhados** para debugging e auditoria

---

## 🔧 Compatibilidade

- ✅ Retrocompatível com fluxos antigos (sem custom_data no body)
- ✅ Funciona com tokens criados antes e depois da mudança
- ✅ Suporta backfill de dados quando webhook chega antes do token
- ✅ Não quebra fluxos existentes
