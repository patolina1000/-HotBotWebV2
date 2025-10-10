# Implementação Server-First Purchase Tracking

## Objetivo

Implementar rastreamento de Purchase com abordagem server-first, onde:
- **CAPI (server)** dispara imediatamente quando email/telefone estão disponíveis
- **Pixel (browser)** dispara exatamente **30 segundos** após a montagem do Pixel (T0)
- **Deduplicação** através do mesmo `event_id` em ambos os eventos

## Arquivos Criados

### 1. `purchaseDedup.js`
**Função:** Gera event_id determinístico para deduplicação

```javascript
generatePurchaseEventId(txnId) // => "pur:${transactionId}"
```

### 2. `ensureFacebookPixel.js`
**Função:** Inicializa o Pixel e define T0 (momento de montagem)

- Define `window.__purchase_t0 = performance.now()`
- Inicializa guards: `__purchase_capi_sent`, `__purchase_pixel_scheduled`, `__purchase_pixel_fired`
- Chama `fbq('init', pixelId, advancedMatching)`

### 3. `purchaseFlow.js`
**Função:** Gerencia envio CAPI imediato e agendamento do Pixel

**Funções principais:**
- `sendCapiPurchase(eventId, context)` - Envia Purchase para CAPI imediatamente
- `schedulePixelPurchaseAtT0PlusDelay(eventId, customData)` - Agenda Pixel para T0+30s
- `buildPixelCustomData(context)` - Constrói dados do Pixel

**Constantes:**
```javascript
PIXEL_PURCHASE_DELAY_MS = 30000 // 30 segundos fixo
```

### 4. `confirm-form.js`
**Função:** Captura email/telefone e dispara CAPI quando disponível

**Fluxo:**
1. Ao inicializar, tenta capturar email/telefone dos inputs
2. Se ambos presentes → envia CAPI imediatamente
3. Se ausentes → configura listener no submit do formulário
4. No submit → envia CAPI (se ainda não enviado)

**Seletores de captura:**
- Email: `input[type="email"]`, `input[name*="email"]`, `#email`
- Telefone: `input[type="tel"]`, `input[name*="phone"]`, `input[name*="telefone"]`, `#phone`

### 5. `obrigado_purchase_flow.html` (modificado)
**Mudanças:**
- Adicionados scripts dos novos módulos (linhas 88-92)
- Comentado código legado de disparo imediato do Pixel
- Comentado envio CAPI no submit (agora é server-first)
- Adicionada inicialização do fluxo server-first (linhas 1042-1115)

## Fluxo de Execução

### Timeline

```
T=0ms    : Pixel montado (fbq('init')) → T0 definido
           ↓
           Captura email/telefone dos inputs
           ↓
           ┌─────────────────────────┐
           │ Email/Tel presentes?    │
           └─────────────────────────┘
                /              \
              SIM              NÃO
               ↓                ↓
         CAPI enviado      Aguarda submit
         imediatamente     do formulário
               ↓                ↓
         [CAPI Purchase]   [Submit form]
         eventId=pur:123        ↓
               ↓           [CAPI Purchase]
               └───────────eventId=pur:123
                           
T=30000ms: [Pixel Purchase]
           eventId=pur:123 (agendado em T0)
```

### Logs Esperados

```
[SERVER-FIRST][PIXEL] T0 definido: 1234.56
[SERVER-FIRST][PURCHASE-FLOW] Module loaded
[SERVER-FIRST][FORM] Module loaded
[SERVER-FIRST] Event ID gerado: pur:abc123

// Cenário 1: Email/tel já preenchidos
[SERVER-FIRST][FORM] Campos capturados: { email: '✓', phone: '✓', hasValues: true }
[SERVER-FIRST][FORM] Email/telefone presentes, enviando CAPI imediatamente
[SERVER-FIRST][PURCHASE-CAPI] Enviando agora (imediato após montar Pixel) { eventId: 'pur:abc123' }
[SERVER-FIRST][PURCHASE-CAPI] OK 2xx { eventId: 'pur:abc123', requestId: 'fb-req-xyz' }

// Cenário 2: Email/tel preenchidos no submit
[SERVER-FIRST][FORM] Email/telefone ausentes, aguardando submit do formulário
[SERVER-FIRST][FORM] submit capturado; enviando CAPI
[SERVER-FIRST][PURCHASE-CAPI] Enviando agora (imediato após montar Pixel) { eventId: 'pur:abc123' }
[SERVER-FIRST][PURCHASE-CAPI] OK 2xx { eventId: 'pur:abc123', requestId: 'fb-req-xyz' }

// Sempre 30s após T0
[SERVER-FIRST][PURCHASE-BROWSER] Pixel Purchase disparado (T+30s) { eventId: 'pur:abc123', value: 97, currency: 'BRL' }
```

## Deduplicação

O Meta Events Manager reconhece eventos duplicados através do `event_id`:
- CAPI: `event_id = "pur:abc123"`
- Pixel: `eventID = "pur:abc123"` (mesmo valor)
- Resultado: **1 único Purchase** registrado no Meta

## Guards de Segurança

```javascript
window.__purchase_capi_sent      // Garante 1 único envio CAPI
window.__purchase_pixel_scheduled // Garante 1 único agendamento Pixel
window.__purchase_pixel_fired     // Garante 1 único disparo Pixel
```

## Código Legado Comentado

Todas as alterações seguem o padrão:
```javascript
// [SERVER-FIRST] comentado: descrição do que foi substituído
// código legado aqui...
```

**Principais comentários:**
1. Linha ~950: `initPixelAndTrackPurchase()` - função de init+track imediato
2. Linha ~956: `await initPixelAndTrackPurchase()` - chamada da função
3. Linha ~989: Envio CAPI no submit do formulário

## Configuração do CAPI

O payload enviado ao CAPI sempre inclui:

```javascript
{
  token: "...",
  event_id: "pur:abc123",
  action_source: "website",        // [SERVER-FIRST] sempre 'website'
  event_source_url: "https://...",
  custom_data: {
    value: 97.00,
    currency: "BRL",
    transaction_id: "abc123",
    content_ids: ["txn_abc123"],
    content_type: "product",
    utm_source: "...",
    utm_medium: "...",
    utm_campaign: "...",
    // ... outros UTMs e fbclid
  },
  normalized_user_data: {
    email: "user@example.com",     // normalizado (lowercase)
    phone: "5511999999999",        // normalizado (só dígitos + DDI)
    fbp: "fb.1.1234567890.1234",
    fbc: "fb.1.1234567890.AbC123"
  }
}
```

## Testes

### Teste Manual

1. Abrir DevTools (F12) → Console
2. Acessar `obrigado_purchase_flow.html?token=xxx`
3. Verificar logs na ordem:
   - `[SERVER-FIRST][PIXEL] T0 definido`
   - `[SERVER-FIRST] Event ID gerado`
   - `[SERVER-FIRST][PURCHASE-CAPI] Enviando agora`
   - `[SERVER-FIRST][PURCHASE-CAPI] OK 2xx`
   - `[SERVER-FIRST][PURCHASE-BROWSER] Pixel agendado para T+30s`
   - (aguardar 30s)
   - `[SERVER-FIRST][PURCHASE-BROWSER] Pixel Purchase disparado (T+30s)`

4. Verificar no Network:
   - POST `/api/capi/purchase` → Status 200
   - GET `https://www.facebook.com/tr/` (Pixel) → Status 200 (após 30s)

### Teste de Deduplicação

1. Abrir Meta Events Manager
2. Acessar Test Events (modo de teste)
3. Executar fluxo completo
4. Verificar:
   - **2 eventos recebidos** (CAPI + Pixel)
   - **1 evento deduplicated** (mesmo event_id)
   - **1 Purchase registrado** (deduplicated_event_type = "Purchase")

### Teste de Cenários

**Cenário A: Email/Tel já preenchidos na carga**
```javascript
// Preencher inputs antes de carregar
document.getElementById('email').value = 'test@example.com';
document.getElementById('phone').value = '11999999999';
// Carregar página → CAPI dispara imediatamente
```

**Cenário B: Email/Tel preenchidos no submit**
```javascript
// Carregar página com inputs vazios
// Preencher email + telefone
// Clicar "Confirmar e Continuar" → CAPI dispara no submit
```

## Query Params de Debug

Para testes, você pode usar:
```
?fbq_debug=1         # Ativa logs detalhados do Pixel
?pixel_delay=30000   # Override do delay (opcional, para QA)
```

## Compatibilidade

- ✅ Funciona com Advanced Matching (AM)
- ✅ Funciona com geolocalização (ct, st, zp, country)
- ✅ Funciona com FBC/FBP (cookies do Facebook)
- ✅ Funciona com external_id (Telegram ID)
- ✅ Mantém backward compatibility (código legado comentado, não removido)

## Rollback

Se necessário reverter:
1. Remover `<script src="purchaseDedup.js"></script>` e similares
2. Descomentar código marcado com `[SERVER-FIRST] comentado:`
3. Remover seção de inicialização server-first (linhas 1042-1115)

## Action Source

Conforme especificado, sempre usamos:
```javascript
action_source: 'website'
```

Não usar `action_source: 'other'` ou outros valores.

## Observações Importantes

1. **Não remove código legado** - apenas comenta com tag `[SERVER-FIRST]`
2. **action_source sempre "website"** - conforme especificação
3. **Delay fixo de 30s** - não parametrizar em produção
4. **Guards evitam duplicação** - mesmo com múltiplos submits
5. **Normalização no front** - backend faz hashing antes de enviar à Meta
6. **Fallback para submit** - se inputs não existirem, não quebra o fluxo

## Manutenção Futura

Para ajustar o delay do Pixel:
```javascript
// Em purchaseFlow.js, linha 8
const PIXEL_PURCHASE_DELAY_MS = 30000; // Modificar aqui
```

Para adicionar novos seletores de captura:
```javascript
// Em confirm-form.js, função captureEmail() ou capturePhone()
const selectors = [
  'input[type="email"]',
  'input[name*="email"]',
  // Adicionar novo seletor aqui
];
```
