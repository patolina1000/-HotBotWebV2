# Implementação Server-First Purchase Tracking

## Objetivo

Implementar um sistema de tracking de Purchase com abordagem **server-first**, onde:

1. **CAPI (server)** é disparado **imediatamente** quando o Pixel (browser) é montado, já com email e telefone capturados
2. **Pixel Purchase (browser)** é disparado **exatamente 30.000 ms (30s) após** o instante de montagem (T0)
3. **Mesmo event_id** é usado em ambos para **deduplicação** no Facebook Events Manager
4. **Código legado** é preservado (comentado e marcado com `[SERVER-FIRST]`)

## Arquivos Criados

### 1. `purchaseDedup.js`
**Função:** Geração determinística de `event_id` para deduplicação.

- **Formato do event_id:** `pur:${transactionId}`
- **Função exportada:** `window.generatePurchaseEventId(txnId)`
- **Fallback:** Se `txnId` ausente, usa timestamp

### 2. `ensureFacebookPixel.js`
**Função:** Inicialização do Facebook Pixel e registro de T0.

- **Define T0:** `window.__purchase_t0 = performance.now()`
- **Inicializa guards globais:**
  - `window.__purchase_capi_sent = false`
  - `window.__purchase_pixel_scheduled = false`
  - `window.__purchase_pixel_fired = false`
- **Função exportada:** `window.ensureFacebookPixel(pixelId, advancedMatching)`
- **Observação:** Advanced Matching é reduzido no client; enriquecimento fica no CAPI

### 3. `purchaseFlow.js`
**Função:** Gerenciamento do fluxo de Purchase (CAPI imediato + agendamento do Pixel).

- **Constante:** `PIXEL_PURCHASE_DELAY_MS = 30000` (30 segundos fixos)
- **Funções exportadas via `window.PurchaseFlow`:**
  - `sendCapiPurchase(eventId, context)`: Envia Purchase para CAPI imediatamente
    - `action_source`: sempre `'website'`
    - Logs: `[SERVER-FIRST][PURCHASE-CAPI] Enviando agora...`
    - Em sucesso: `[SERVER-FIRST][PURCHASE-CAPI] OK 2xx { eventId, requestId }`
    - Em erro: `[SERVER-FIRST][PURCHASE-CAPI] erro { eventId, err }`
    - Define `window.__purchase_capi_sent = true` após sucesso
  - `schedulePixelPurchaseAtT0PlusDelay(eventId, customData)`: Agenda Pixel para T0+30s
    - Calcula delay baseado em `window.__purchase_t0`
    - Usa `setTimeout` com delay ajustado
    - Dispara `fbq('track', 'Purchase', customData, { eventID })`
    - Log: `[SERVER-FIRST][PURCHASE-BROWSER] Pixel Purchase disparado (T+30s)`
  - `buildPixelCustomData(context)`: Constrói `custom_data` para o Pixel

### 4. `confirm-form.js`
**Função:** Captura de email/telefone e disparo do CAPI no momento adequado.

- **Funções exportadas via `window.ConfirmForm`:**
  - `captureEmail()`: Captura email de inputs (seletores: `input[type="email"]`, `input[name*="email"]`, etc.)
  - `capturePhone()`: Captura telefone de inputs (seletores: `input[name*="phone"]`, `input[type="tel"]`, etc.)
  - `captureContactData()`: Retorna `{ email, phone, hasValues }`
  - `normalizeContactData(email, phone)`: Normaliza dados usando `PurchaseNormalization` library
  - `triggerCapiIfReady(context)`: Dispara CAPI imediatamente se email/telefone presentes
  - `setupFormSubmitListener(formSelector, context)`: Configura listener de submit para capturar CAPI se não enviado ainda
  - `initConfirmForm(context, formSelector)`: Função principal de inicialização

### 5. `obrigado_purchase_flow.html` (atualizado)

**Alterações principais:**

1. **Scripts adicionados (após `purchaseNormalization.js`):**
   ```html
   <script src="purchaseDedup.js"></script>
   <script src="ensureFacebookPixel.js"></script>
   <script src="purchaseFlow.js"></script>
   <script src="confirm-form.js"></script>
   ```

2. **Código legado comentado:**
   - `initPixelAndTrackPurchase()` → Função completa comentada com tag `[SERVER-FIRST]`
   - `await initPixelAndTrackPurchase()` → Chamada comentada
   - CAPI no submit do form → Chamada comentada (agora é feita pelos módulos)

3. **Nova lógica de inicialização (server-first):**
   ```javascript
   // [SERVER-FIRST] Inicialização do fluxo server-first
   (async () => {
       // 1. Aguardar contexto e pixel config
       // 2. Gerar event_id determinístico
       // 3. Inicializar Pixel e definir T0
       // 4. Construir contexto completo
       // 5. Agendar Pixel para T0+30s
       // 6. Tentar enviar CAPI imediatamente (se email/telefone disponíveis)
   })();
   ```

## Fluxo de Execução

### Cenário 1: Email/Telefone já preenchidos ao carregar a página

```
T0: Pixel montado (ensureFacebookPixel)
    └─> window.__purchase_t0 definido
    └─> Guards inicializados
    
T0+0ms: Pixel agendado para T0+30s
        └─> setTimeout configurado
        
T0+0ms: CAPI enviado imediatamente
        └─> captureContactData() encontra valores
        └─> sendCapiPurchase() disparado
        └─> [SERVER-FIRST][PURCHASE-CAPI] Enviando agora...
        └─> [SERVER-FIRST][PURCHASE-CAPI] OK 2xx (se sucesso)
        
T0+30000ms: Pixel Purchase disparado
            └─> [SERVER-FIRST][PURCHASE-BROWSER] Pixel Purchase disparado (T+30s)
```

### Cenário 2: Email/Telefone preenchidos apenas no submit

```
T0: Pixel montado (ensureFacebookPixel)
    └─> window.__purchase_t0 definido
    └─> Guards inicializados
    
T0+0ms: Pixel agendado para T0+30s
        └─> setTimeout configurado
        
T0+0ms: CAPI NÃO enviado (email/telefone ausentes)
        └─> Listener de submit configurado
        
T0+5000ms (exemplo): Usuário preenche e submete form
                     └─> captureContactData() captura valores
                     └─> sendCapiPurchase() disparado
                     └─> [SERVER-FIRST][FORM] submit capturado; enviando CAPI
                     └─> [SERVER-FIRST][PURCHASE-CAPI] Enviando agora...
                     └─> [SERVER-FIRST][PURCHASE-CAPI] OK 2xx (se sucesso)
        
T0+30000ms: Pixel Purchase disparado
            └─> [SERVER-FIRST][PURCHASE-BROWSER] Pixel Purchase disparado (T+30s)
```

## Constantes e Guards

### Constante
- `PIXEL_PURCHASE_DELAY_MS = 30000` (fixo, 30 segundos)

### Guards Globais
- `window.__purchase_t0` - Timestamp de montagem do Pixel
- `window.__purchase_capi_sent` - Flag indicando se CAPI já foi enviado
- `window.__purchase_pixel_scheduled` - Flag indicando se Pixel foi agendado
- `window.__purchase_pixel_fired` - Flag indicando se Pixel já disparou

## Event ID Determinístico

**Formato:** `pur:${transactionId}`

**Geração:**
```javascript
const purchaseEventId = window.generatePurchaseEventId(transactionId);
// Resultado: "pur:123456789" (exemplo)
```

**Uso:**
- Mesmo `event_id` é passado para:
  - CAPI: `capiPayload.event_id`
  - Pixel: `fbq('track', 'Purchase', customData, { eventID })`
- Permite deduplicação automática no Facebook Events Manager

## Logs Padronizados

### CAPI
```
[SERVER-FIRST][PURCHASE-CAPI] Enviando agora (imediato após montar Pixel) { eventId: "pur:123" }
[SERVER-FIRST][PURCHASE-CAPI] OK 2xx { eventId: "pur:123", requestId: "xyz" }
[SERVER-FIRST][PURCHASE-CAPI] erro { eventId: "pur:123", err: ... }
```

### Pixel Browser
```
[SERVER-FIRST][PURCHASE-BROWSER] Pixel agendado para T+30s { eventId: "pur:123", t0: 12345, fireAt: 42345, delay: "30000ms" }
[SERVER-FIRST][PURCHASE-BROWSER] Pixel Purchase disparado (T+30s) { eventId: "pur:123", value: 97.00, currency: "BRL" }
```

### Form
```
[SERVER-FIRST][FORM] Inicializando confirm-form
[SERVER-FIRST][FORM] Campos capturados: { email: '✓', phone: '✓', hasValues: true }
[SERVER-FIRST][FORM] Email/telefone presentes, enviando CAPI imediatamente
[SERVER-FIRST][FORM] submit capturado; enviando CAPI
```

## Action Source

**Sempre:** `action_source: 'website'`

Definido em `purchaseFlow.js`:
```javascript
const capiPayload = {
  token,
  event_id: eventId,
  action_source: 'website', // [SERVER-FIRST] sempre 'website'
  event_source_url: event_source_url || window.location.href,
  custom_data,
  normalized_user_data: normalized_user_data || {}
};
```

## Advanced Matching

**Estratégia:** Reduzido no client, enriquecimento no CAPI

- **Client (Pixel):** Apenas `fbp` e `fbc` são passados inicialmente
- **CAPI:** Recebe `normalized_user_data` com email, phone, etc.
- **Backend:** Enriquece e hasheia os dados antes de enviar à Meta

**Observação:** O código legado de AM via `fbq('init', pid, userDataAM)` foi comentado e a inicialização é feita via `ensureFacebookPixel(pixelId, null)` sem AM no 3º argumento.

## Compatibilidade com Código Legado

Todo código substituído foi **comentado** (não removido) com tag `[SERVER-FIRST]`.

**Exemplos:**
```javascript
// [SERVER-FIRST] comentado: Pixel imediato substituído por agendamento T+30s
// await initPixelAndTrackPurchase();

// [SERVER-FIRST] comentado: CAPI agora é enviado imediatamente após montar Pixel, não no submit
// const capiResponse = await fetch('/api/capi/purchase', { ... });
```

## Testes

### Teste em QA com override de delay (opcional)

Se implementado no backend:
```
?pixel_delay=5000  // Testa com 5 segundos em vez de 30
```

**Produção:** Sempre 30.000ms fixo.

### Verificação no Events Manager

1. **Deduplicação:** Verificar que apenas 1 Purchase aparece (não 2)
2. **Event ID:** Verificar que `event_id` está presente e no formato `pur:${txnId}`
3. **Timing:** CAPI deve aparecer primeiro (imediato), Pixel após 30s
4. **Action Source:** Verificar que `action_source = website`

## Critérios de Aceite ✅

- [x] Ao montar o Pixel: define `__purchase_t0` e agenda o Pixel para T0+30s (log visível)
- [x] CAPI é enviado imediatamente na montagem se e-mail/telefone estiverem presentes
- [x] Caso contrário, CAPI é enviado no submit do formulário (uma única vez)
- [x] Mesmo `event_id` em CAPI e Pixel (formato `pur:${txnId}`)
- [x] Nenhum `fbq('track', 'Purchase')` executa antes de T0+30s
- [x] Logs em ordem esperada:
  - `[SERVER-FIRST][PURCHASE-CAPI] Enviando agora...`
  - `[SERVER-FIRST][PURCHASE-CAPI] OK 2xx...`
  - `[SERVER-FIRST][PURCHASE-BROWSER] Pixel Purchase disparado (T+30s)...`
- [x] Código legado comentado com tag `[SERVER-FIRST]`
- [x] `action_source` sempre "website"

## Arquivos Modificados/Criados

### Criados:
- `MODELO1/WEB/purchaseDedup.js`
- `MODELO1/WEB/ensureFacebookPixel.js`
- `MODELO1/WEB/purchaseFlow.js`
- `MODELO1/WEB/confirm-form.js`

### Modificados:
- `MODELO1/WEB/obrigado_purchase_flow.html`
  - Adicionados scripts dos novos módulos
  - Código legado comentado
  - Nova lógica server-first adicionada

## Dependências

- `shared/purchaseNormalization.js` - Normalização de dados (email, phone, etc.)
- `shared/fbq-safe-proxy.js` - Proxy seguro do fbq
- Backend endpoint `/api/capi/purchase` - Recebe e envia eventos para CAPI

## Observações Finais

1. **Não remove código:** Todo código legado está comentado, não removido
2. **Logs detalhados:** Todos os passos principais têm logs para debugging
3. **Guards:** Previnem duplicação de envios
4. **Timing preciso:** Uso de `performance.now()` para T0 e cálculo de delay
5. **Fallbacks:** Se campos não estiverem disponíveis, o sistema não quebra
6. **Action source fixo:** Sempre 'website' conforme especificação
