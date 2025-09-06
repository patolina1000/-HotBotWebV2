# Documentação Técnica - Funil de Conversão Multi-Plataforma

## 📊 Visão Geral da Arquitetura

### Stack de Rastreamento
- **Client-Side**: Facebook Pixel, Kwai Pixel
- **Server-Side**: Facebook Conversions API (CAPI), Kwai Server API
- **Parâmetros UTM**: Rastreamento de origem e campanhas
- **Identificadores**: fbp, fbc (Facebook), click_id (Kwai)

## 🔍 Análise Detalhada do Fluxo

### 1. Entrada do Funil - Presell (`/modelo1/web/index.html`)

#### Captura de Parâmetros (CRÍTICO)
```javascript
// Parâmetros que DEVEM ser capturados e persistidos
const trackingParams = {
  // UTM padrão
  utm_source: getParam('utm_source'),
  utm_medium: getParam('utm_medium'),
  utm_campaign: getParam('utm_campaign'),
  utm_content: getParam('utm_content'),
  utm_term: getParam('utm_term'),
  
  // Facebook
  fbp: getCookie('_fbp') || generateFbp(),
  fbc: getParam('fbclid') ? `fb.1.${Date.now()}.${getParam('fbclid')}` : getCookie('_fbc'),
  
  // Kwai - VERIFICAR IMPLEMENTAÇÃO
  click_id: getParam('click_id') || getParam('kwai_click_id') || getParam('kw_click_id'),
  
  // Dados adicionais para enriquecimento
  landing_time: Date.now(),
  session_id: generateSessionId(),
  device_id: getOrCreateDeviceId()
};
```

#### Eventos Disparados
- ✅ **PageView** (FB + Kwai)
- ✅ **ViewContent** (FB + Kwai)
- ❌ **Lead** (AUSENTE - Oportunidade perdida)

### 2. Fluxo Privacy (Conversão via PIX)

#### 2.1 Página de Planos
**Eventos Necessários:**
```javascript
// Client-side
fbq('track', 'ViewContent', {
  content_type: 'product_group',
  content_ids: ['plan_basic', 'plan_premium', 'plan_vip'],
  value: 0, // Valor mínimo disponível
  currency: 'BRL'
});

kwaiPixel.track('VIEW_CONTENT', {
  content_type: 'product_group',
  content_id: 'plans_page'
});

// ⚠️ EVENTO AUSENTE - Adicionar
fbq('track', 'Lead', {
  content_category: 'plans_viewed',
  value: calculateLeadValue() // Baseado no plano mais visualizado
});
```

#### 2.2 Checkout PIX
**Eventos Críticos:**
```javascript
// Ao gerar PIX
fbq('track', 'InitiateCheckout', {
  content_ids: [selected_plan_id],
  content_type: 'product',
  value: plan_value,
  currency: 'BRL',
  num_items: 1
});

kwaiPixel.track('ADD_TO_CART', {
  content_type: 'product',
  content_id: selected_plan_id,
  value: plan_value
});

// ⚠️ EVENTO AUSENTE - Crítico para otimização
fbq('track', 'AddPaymentInfo', {
  content_ids: [selected_plan_id],
  payment_method: 'pix'
});

// ⚠️ EVENTO CUSTOMIZADO AUSENTE
fbq('trackCustom', 'PixGenerated', {
  pix_code: hashPixCode(pix_code),
  expiration_time: pix_expiration,
  plan_id: selected_plan_id
});
```

#### 2.3 Confirmação de Pagamento
**Implementação Server-Side OBRIGATÓRIA:**
```javascript
// Server-side (Node.js exemplo)
const EventRequest = bizSdk.EventRequest;
const ServerEvent = bizSdk.ServerEvent;
const UserData = bizSdk.UserData;

const current_timestamp = Math.floor(Date.now() / 1000);

const userData = (new UserData())
  .setFbp(user_fbp)
  .setFbc(user_fbc)
  .setClientIpAddress(request.ip)
  .setClientUserAgent(request.headers['user-agent'])
  .setExternalId(hashed_user_id);

const purchaseEvent = (new ServerEvent())
  .setEventName('Purchase')
  .setEventTime(current_timestamp)
  .setUserData(userData)
  .setCustomData({
    currency: 'BRL',
    value: purchase_value,
    content_ids: [plan_id],
    content_type: 'product',
    num_items: 1,
    order_id: transaction_id
  })
  .setEventSourceUrl(source_url)
  .setActionSource('website');

// Deduplicação com client-side
purchaseEvent.setEventId(unique_event_id);
```

### 3. Cadeia de Upsells/Downsells

#### Problemas Identificados:
1. **Falta de rastreamento granular** entre transições
2. **Ausência de eventos de "oferta recusada"**
3. **Sem medição de tempo entre ofertas**

#### Implementação Otimizada:
```javascript
// Rastrear TODAS as transições
function trackOfferView(offerType, offerLevel, previousAction) {
  // Client-side
  fbq('track', 'ViewContent', {
    content_type: offerType, // 'upsell' ou 'downsell'
    content_ids: [`${offerType}_${offerLevel}`],
    content_category: `${offerType}_sequence`,
    custom_parameters: {
      previous_action: previousAction,
      time_since_last_action: getTimeSinceLastAction(),
      sequence_position: offerLevel
    }
  });
  
  // ⚠️ EVENTO CUSTOMIZADO IMPORTANTE
  fbq('trackCustom', 'OfferViewed', {
    offer_type: offerType,
    offer_level: offerLevel,
    user_journey_stage: getUserJourneyStage()
  });
}

// Rastrear recusas (CRÍTICO para otimização)
function trackOfferRejection(offerType, offerLevel, rejectionReason) {
  fbq('trackCustom', 'OfferRejected', {
    offer_type: offerType,
    offer_level: offerLevel,
    rejection_reason: rejectionReason, // timeout, explicit_no, page_exit
    time_on_page: getTimeOnPage(),
    scroll_percentage: getScrollPercentage()
  });
}
```

### 4. Fluxo Telegram (Alta Criticidade)

#### Problemas Graves:
1. **Perda de atribuição** ao sair do ambiente web
2. **click_id do Kwai pode ser perdido**
3. **Conversões não rastreadas adequadamente**

#### Solução Proposta:
```javascript
// Ao clicar no botão Telegram
function redirectToTelegram() {
  // 1. Disparar evento de transição
  fbq('trackCustom', 'TelegramRedirect', {
    source_page: 'presell',
    tracking_params: getAllTrackingParams()
  });
  
  // 2. Salvar dados para server-side
  saveTrackingDataToServer({
    user_id: getUserId(),
    tracking_params: getAllTrackingParams(),
    timestamp: Date.now()
  });
  
  // 3. Construir URL com TODOS os parâmetros
  const telegramUrl = buildTelegramUrl({
    ...getAllUTMParams(),
    fbp: getFbp(),
    fbc: getFbc(),
    click_id: getKwaiClickId(),
    sid: getSessionId(), // Session ID para matching
    uid: getUserId() // User ID hasheado
  });
  
  // 4. Webhook no Telegram para server-side tracking
  // Bot deve enviar eventos de volta para o servidor
}
```

## 🚨 Gargalos Críticos Identificados

### 1. **Abandono de PIX não rastreado**
- **Impacto**: Perda de 30-50% de potenciais conversões para retargeting
- **Solução**: Implementar evento customizado `PixAbandoned`

### 2. **Falta de eventos intermediários**
- **Impacto**: Algoritmos não otimizam corretamente
- **Solução**: Adicionar `Lead`, `AddPaymentInfo`, eventos customizados

### 3. **Perda de atribuição no Telegram**
- **Impacto**: ROI incorreto, otimização prejudicada
- **Solução**: Server-side tracking robusto + webhook

### 4. **click_id do Kwai não persistente**
- **Impacto**: Conversões não atribuídas
- **Solução**: Armazenamento em localStorage + cookie + server

### 5. **Sem rastreamento de micro-conversões**
- **Impacto**: Otimização lenta do algoritmo
- **Solução**: Eventos para scroll, tempo na página, interações

## 📈 Eventos Ausentes Críticos para Otimização

### Eventos Padrão Faltando:
1. **Lead** - Quando usuário visualiza planos
2. **AddPaymentInfo** - Quando PIX é gerado
3. **CompleteRegistration** - Após primeiro pagamento

### Eventos Customizados Essenciais:
```javascript
// 1. PIX Abandonado (CRÍTICO)
fbq('trackCustom', 'PixAbandoned', {
  plan_id: abandoned_plan,
  time_until_expiration: remaining_time,
  value: plan_value,
  abandonment_reason: reason // timeout, page_exit, new_session
});

// 2. Progresso no Funil
fbq('trackCustom', 'FunnelProgress', {
  stage: current_stage,
  completion_percentage: percentage,
  time_in_funnel: total_time,
  interactions_count: interaction_count
});

// 3. Qualidade do Lead
fbq('trackCustom', 'LeadScoring', {
  score: calculated_score,
  engagement_level: engagement,
  predicted_ltv: ltv_prediction
});

// 4. Oferta Visualizada/Recusada
fbq('trackCustom', 'OfferInteraction', {
  action: 'viewed|accepted|rejected',
  offer_id: offer_identifier,
  sequence_position: position,
  cumulative_value: total_cart_value
});
```

## 🔧 Otimizações de Performance

### 1. **Carregamento Assíncrono Otimizado**
```javascript
// Lazy load dos pixels após interação
let pixelsLoaded = false;
function loadTrackingPixels() {
  if (pixelsLoaded) return;
  
  // Facebook Pixel
  !function(f,b,e,v,n,t,s){...}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  
  // Kwai Pixel com prioridade menor
  setTimeout(() => {
    (function(w,d,s,l,i){...})(window,document,'script','kwDataLayer','KWAI_PIXEL_ID');
  }, 1000);
  
  pixelsLoaded = true;
}

// Trigger no primeiro toque
document.addEventListener('touchstart', loadTrackingPixels, {once: true});
document.addEventListener('mousemove', loadTrackingPixels, {once: true});
```

### 2. **Batching de Eventos**
```javascript
const eventQueue = [];
let batchTimer;

function queueEvent(eventName, parameters) {
  eventQueue.push({eventName, parameters, timestamp: Date.now()});
  
  clearTimeout(batchTimer);
  batchTimer = setTimeout(flushEvents, 1000);
}

function flushEvents() {
  if (eventQueue.length === 0) return;
  
  // Enviar todos os eventos de uma vez
  fetch('/api/batch-events', {
    method: 'POST',
    body: JSON.stringify({events: eventQueue}),
    keepalive: true
  });
  
  eventQueue.length = 0;
}
```

### 3. **Persistência Inteligente de Dados**
```javascript
class TrackingPersistence {
  constructor() {
    this.storage = this.getAvailableStorage();
  }
  
  getAvailableStorage() {
    // Ordem de preferência: localStorage > sessionStorage > cookie > memory
    try {
      localStorage.setItem('test', '1');
      localStorage.removeItem('test');
      return 'localStorage';
    } catch(e) {
      // Fallback para outros métodos
    }
  }
  
  saveTrackingData(data) {
    const encrypted = this.lightEncrypt(JSON.stringify(data));
    
    // Salvar em múltiplos locais para redundância
    localStorage.setItem('tk_data', encrypted);
    sessionStorage.setItem('tk_data', encrypted);
    this.setCookie('tk_data', encrypted, 30);
    
    // Backup no servidor
    navigator.sendBeacon('/api/tracking-backup', encrypted);
  }
  
  lightEncrypt(data) {
    // Ofuscação simples para não expor dados crus
    return btoa(encodeURIComponent(data).split('').reverse().join(''));
  }
}
```

## 📁 Arquivos JavaScript Necessários

### 1. **tracking-core.js**
```javascript
// Núcleo do sistema de rastreamento
- Inicialização de pixels
- Gestão de parâmetros UTM
- Persistência de dados
- Event queue management
```

### 2. **pixel-facebook.js**
```javascript
// Especializado em Facebook
- Eventos padrão e customizados
- Gestão de fbp/fbc
- Server-side API integration
- Deduplicação de eventos
```

### 3. **pixel-kwai.js**
```javascript
// Especializado em Kwai
- Gestão de click_id
- Eventos específicos Kwai
- Fallback tracking
- Server-side integration
```

### 4. **conversion-optimizer.js**
```javascript
// Otimização de conversões
- A/B testing framework
- Eventos de micro-conversão
- User scoring
- Predictive analytics hooks
```

### 5. **pix-tracker.js**
```javascript
// Específico para pagamentos PIX
- Geração de eventos PIX
- Timeout tracking
- Abandonment detection
- Recovery mechanisms
```

### 6. **telegram-bridge.js**
```javascript
// Bridge para Telegram
- Preservação de tracking
- Webhook handlers
- Server-side matching
- Return attribution
```

### 7. **server-events.js**
```javascript
// Server-side tracking
- Facebook CAPI
- Kwai Server API
- Event matching
- Batch processing
```

### 8. **analytics-enhanced.js**
```javascript
// Analytics avançado
- Heatmaps integration
- Session recording hooks
- Funnel visualization
- Real-time dashboards
```

## 🚀 Implementação Prioritária

### Fase 1 (Imediato):
1. Implementar eventos `Lead` e `AddPaymentInfo`
2. Adicionar tracking de abandono PIX
3. Corrigir persistência do click_id Kwai
4. Server-side tracking para Telegram

### Fase 2 (1 semana):
1. Eventos customizados de progresso
2. Otimização de carregamento
3. A/B testing framework
4. Enhanced attribution

### Fase 3 (2 semanas):
1. Machine learning hooks
2. Predictive analytics
3. Advanced segmentation
4. Real-time optimization

## 💡 Recomendações Finais

1. **Implementar Server-Side URGENTE** - Essencial para iOS 14.5+ e precisão
2. **Adicionar eventos intermediários** - Algoritmos precisam de sinais
3. **Criar sistema de recuperação** - PIX abandonado = dinheiro perdido
4. **Melhorar atribuição Telegram** - Conversões invisíveis = otimização ruim
5. **Testar, testar, testar** - Use Facebook Event Manager e Kwai Debug

## 🎯 KPIs para Monitorar

- **Event Match Quality**: >70% (Facebook)
- **Attribution Window**: 7-day click, 1-day view
- **PIX Abandonment Rate**: Objetivo <30%
- **Cross-Device Match Rate**: >60%
- **Server-Side Event Rate**: >95%

---

*Documentação focada 100% em performance e conversão. Implementar ASAP para maximizar ROAS.*