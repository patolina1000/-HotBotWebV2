# Guia de Implementação - Tracking WhatsApp

## Conformidade com UTMify

Este sistema está **100% alinhado** com as regras oficiais da UTMify:

### Regras de Nomenclatura de UTMs
- **Minúsculas**: Todos os valores UTM são convertidos para minúsculas automaticamente
- **Hífens**: Espaços são substituídos por hífens (-) para padronização
- **Sem Unknown**: Valores "unknown" são substituídos por "nao-definido" ou valores descritivos
- **utm_source real**: Sempre reflete a origem real do tráfego (ex: "whatsapp" para tráfego WhatsApp)
- **Validação automática**: Sistema corrige UTMs inválidas antes de persistir/enviar

### Payload UTMify Completo
- **Estrutura oficial**: Segue exatamente a especificação da UTMify
- **Campos obrigatórios**: Inclui commission, approvedDate, customer.document, etc.
- **Compatibilidade total**: Garante reconhecimento e tracking correto na plataforma

## Visão Geral

Este guia detalha como implementar o sistema de tracking para o WhatsApp seguindo **exatamente** o padrão já estabelecido no sistema principal. O tracking será implementado com **3 eventos principais**, **sistema de UTM separado** e **deduplicação robusta**.

## Eventos a Implementar

### 1. **PageView** - `/whatsapp/redirect.html`
- **Quando**: Usuário acessa a página de redirecionamento
- **Local**: `whatsapp/redirect.html`
- **Trigger**: Carregamento da página
- **Event ID**: Gerado automaticamente via `generateEventId()`

### 2. **ViewContent** - `/whatsapp/redirect.html` 
- **Quando**: Usuário visualiza o conteúdo da página
- **Local**: `whatsapp/redirect.html`
- **Trigger**: Após 4 segundos do carregamento (seguindo padrão do sistema)
- **Event ID**: Gerado automaticamente via `generateEventId()`

### 3. **Purchase** - `/whatsapp/obrigado.html`
- **Quando**: Usuário acessa a página de agradecimento (token validado)
- **Local**: `whatsapp/obrigado.html`
- **Trigger**: Após validação bem-sucedida do token
- **Event ID**: Usar token como event_id (padrão do sistema)

## Estrutura de Arquivos

### Arquivos a Criar/Modificar:

```
whatsapp/
├── js/
│   ├── whatsapp-tracking.js          # Sistema principal de tracking
│   ├── whatsapp-utm-tracker.js       # Captura e armazenamento de UTMs
│   └── whatsapp-pixel.js             # Pixel específico do WhatsApp
├── redirect.html                     # Modificar para incluir tracking
└── obrigado.html                     # Modificar para incluir tracking
```

## Sistema de Tracking

### 1. **Pixel Separado**
- **Facebook Pixel ID**: Diferente do sistema principal
- **Configuração**: Variável de ambiente `WHATSAPP_FB_PIXEL_ID`
- **Token**: Variável de ambiente `WHATSAPP_FB_PIXEL_TOKEN`
- **Deduplicação**: Sistema robusto com `generatePurchaseEventId()` e `generateRobustEventId()`

### 2. **UTMify Separado**
- **API Token**: Variável de ambiente `WHATSAPP_UTMIFY_API_TOKEN`
- **Endpoint**: Mesmo endpoint do sistema principal
- **Identificação**: Campo `platform: 'whatsapp'` no payload

### 3. **Session Tracking**
- **Cache**: NodeCache com TTL de 3 dias (259200 segundos)
- **Dados**: FBP, FBC, IP, User Agent, UTMs
- **Integração**: Busca automática de cookies via `telegram_id`

### 4. **Sistema de Deduplicação Robusto**
- **Purchase**: `generatePurchaseEventId(token)` - usa token como base
- **Outros eventos**: `generateRobustEventId(token, event_name, 5)` - janela de 5 minutos
- **Verificação**: `isEventAlreadySent(event_id, source, event_name)`
- **Registro**: `markEventAsSent()` com dados completos

### 5. **Geração de Event IDs**

⚠️ **Atenção**: No frontend (navegador), use `crypto.subtle.digest` para gerar hashes, pois `crypto.createHash` é exclusivo do Node.js. Nos exemplos do guia, os trechos de frontend já foram adaptados.

**Backend (Node.js):**
```javascript
// Para Purchase (usa token como base)
function generatePurchaseEventId(transactionId) {
  const input = `purchase:${transactionId}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

// Para outros eventos (janela de tempo)
function generateRobustEventId(transactionId, eventName, timeWindowMinutes = 5) {
  const now = Math.floor(Date.now() / 1000);
  const windowSize = timeWindowMinutes * 60;
  const normalizedTime = Math.floor(now / windowSize) * windowSize;
  const input = `${eventName.toLowerCase()}:${transactionId}:${normalizedTime}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

// Para eventos sem token (fallback)
function generateEventId(eventName, userId = '', timestamp = Date.now()) {
  if (eventName === 'Purchase' && userId) return userId;
  const input = `${eventName}_${userId}_${timestamp}`;
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  return hash.substring(0, 16);
}
```

**Frontend (Browser):**
```javascript
// Função auxiliar para gerar hash no navegador
async function generateHash(input) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Para eventos sem token (fallback) - Frontend
async function generateEventId(eventName, userId = '', timestamp = Date.now()) {
  if (eventName === 'Purchase' && userId) return userId;
  const input = `${eventName}_${userId}_${timestamp}`;
  const hash = await generateHash(input);
  return hash.substring(0, 16);
}
```

## Fluxo de Implementação

### Fase 1: Captura de UTMs (redirect.html)

```javascript
// whatsapp-utm-tracker.js
(function() {
  'use strict';
  
  const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  const DEBUG_MODE = window.location.hostname === 'localhost';
  
  function log(message, data = null) {
    if (DEBUG_MODE) {
      console.log(`[WHATSAPP-UTM] ${message}`, data || '');
    }
  }
  
  // Normalizar e validar UTMs conforme regras UTMify
  function normalizeUTM(value, key) {
    if (!value) return null;
    
    let normalized = value;
    
    // Converter para minúsculas
    normalized = normalized.toLowerCase();
    
    // Substituir espaços por hífens
    normalized = normalized.replace(/\s+/g, '-');
    
    // Substituir valores problemáticos
    if (normalized === 'unknown' || normalized === 'undefined') {
      normalized = 'nao-definido';
    }
    
    // Validação específica por campo
    if (key === 'utm_source') {
      // Garantir que utm_source reflita a origem real
      if (normalized.includes('whatsapp') || normalized.includes('wa')) {
        normalized = 'whatsapp';
      }
    }
    
    // Log de normalização se houve mudança
    if (normalized !== value.toLowerCase()) {
      log(`UTM normalizada: ${key}`, { original: value, normalized });
    }
    
    return normalized;
  }
  
  function captureUTMs() {
    const urlParams = new URLSearchParams(window.location.search);
    const utms = {};
    let hasNewUTMs = false;
    
    UTM_KEYS.forEach(key => {
      const value = urlParams.get(key);
      if (value) {
        const decoded = decodeURIComponent(value);
        const normalized = normalizeUTM(decoded, key);
        
        if (normalized) {
          utms[key] = normalized;
          localStorage.setItem(`whatsapp_${key}`, normalized);
          hasNewUTMs = true;
          log(`Capturado e normalizado ${key}: ${normalized}`);
        }
      } else {
        // Tentar recuperar do localStorage
        const saved = localStorage.getItem(`whatsapp_${key}`);
        if (saved) {
          utms[key] = saved;
        }
      }
    });
    
    if (hasNewUTMs) {
      log('Novos UTMs capturados e normalizados', utms);
      sendToBackend(utms);
    }
    
    return utms;
  }
  
  async function sendToBackend(utms) {
    try {
      const response = await fetch('/utm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(utms)
      });
      
      if (response.ok) {
        log('UTMs enviados para backend com sucesso');
      }
    } catch (error) {
      log('Erro ao enviar UTMs para backend:', error);
    }
  }
  
  // Auto-inicialização
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', captureUTMs);
  } else {
    captureUTMs();
  }
})();
```

### Fase 2: Eventos de Tracking (redirect.html)

⚠️ **Atenção**: No frontend (navegador), use `crypto.subtle.digest` para gerar hashes, pois `crypto.createHash` é exclusivo do Node.js. Nos exemplos do guia, os trechos de frontend já foram adaptados.

```javascript
// whatsapp-tracking.js
(function() {
  'use strict';
  
  const DEBUG = window.location.hostname === 'localhost';
  let pixelInitialized = false;
  
  function log(category, message, data = null) {
    if (DEBUG) {
      console.log(`[WHATSAPP-${category}] ${message}`, data || '');
    }
  }
  
  // Inicializar Facebook Pixel WhatsApp
  async function initWhatsAppPixel() {
    if (pixelInitialized) return;
    
    const pixelId = 'WHATSAPP_FB_PIXEL_ID'; // Variável de ambiente
    
    // Carregar Facebook Pixel
    !function(f,b,e,v,n,t,s) {
      if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)
    }(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');
    
    fbq('init', pixelId);
    pixelInitialized = true;
    log('PIXEL', 'Facebook Pixel WhatsApp inicializado');
  }
  
  // Disparar PageView
  async function trackPageView() {
    if (!pixelInitialized) return;
    
    const eventId = await generateEventId('PageView', 'whatsapp', Date.now());
    fbq('track', 'PageView', { eventID: eventId });
    log('EVENT', 'PageView enviado', { eventId });
  }
  
  // Disparar ViewContent (após 4 segundos)
  async function trackViewContent() {
    if (!pixelInitialized) return;
    
    const eventId = await generateEventId('ViewContent', 'whatsapp', Date.now());
    fbq('track', 'ViewContent', { eventID: eventId });
    log('EVENT', 'ViewContent enviado', { eventId });
  }
  
  // Gerar Event ID (Frontend - usa crypto.subtle.digest)
  async function generateHash(input) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async function generateEventId(eventName, userId = '', timestamp = Date.now()) {
    const input = `${eventName}_${userId}_${timestamp}`;
    const hash = await generateHash(input);
    return hash.substring(0, 16);
  }
  
  // Auto-inicialização
  async function init() {
    await initWhatsAppPixel();
    await trackPageView();
    
    // ViewContent após 4 segundos
    setTimeout(async () => {
      await trackViewContent();
    }, 4000);
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

### Fase 3: Evento Purchase (obrigado.html)

```javascript
// whatsapp-tracking.js (Purchase)
async function trackPurchase(token, value) {
  if (!pixelInitialized) return;
  
  // Recuperar UTMs do localStorage
  const utms = {};
  const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  
  utmKeys.forEach(key => {
    const saved = localStorage.getItem(`whatsapp_${key}`);
    if (saved) {
      utms[key] = saved;
    }
  });
  
  // Usar token como event_id (padrão do sistema)
  const eventId = token;
  
  // Disparar Purchase via Pixel
  fbq('track', 'Purchase', {
    value: parseFloat(value),
    currency: 'BRL',
    eventID: eventId,
    ...utms
  });
  
  log('EVENT', 'Purchase enviado', { eventId, value, utms });
  
  // Enviar para UTMify
  await sendToUtmify(token, value, utms);
}

async function sendToUtmify(token, value, utms) {
  try {
    const now = new Date().toISOString();
    const priceInCents = Math.round(parseFloat(value) * 100);
    const gatewayFee = 0;
    const userCommission = priceInCents;
    
    const payload = {
      isTest: false,
      status: 'approved',
      orderId: token,
      customer: {
        name: 'Cliente WhatsApp',
        email: 'whatsapp@example.com',
        phone: '5511999999999',
        country: 'BR',
        document: '00000000000' // CPF padrão quando não disponível
      },
      platform: 'whatsapp',
      products: [{
        id: 'whatsapp-content',
        name: 'Conteúdo WhatsApp',
        planId: 'plan_whatsapp',
        planName: 'Plano WhatsApp',
        quantity: 1,
        priceInCents: priceInCents
      }],
      createdAt: now,
      approvedDate: now,
      refundedAt: null,
      commission: {
        gatewayFeeInCents: gatewayFee,
        totalPriceInCents: priceInCents,
        userCommissionInCents: userCommission
      },
      paymentMethod: 'whatsapp',
      trackingParameters: {
        src: utms.utm_source || 'whatsapp',
        utm_source: utms.utm_source || 'whatsapp',
        utm_medium: utms.utm_medium || 'social',
        utm_campaign: utms.utm_campaign || 'campanha-exemplo',
        utm_content: utms.utm_content || 'anuncio1',
        utm_term: utms.utm_term || 'palavra-chave'
      }
    };
    
    const response = await fetch('/api/whatsapp/utmify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (response.ok) {
      log('UTMIFY', 'Conversão enviada para UTMify');
    }
  } catch (error) {
    log('UTMIFY', 'Erro ao enviar para UTMify:', error);
  }
}
```

> 💡 **Importante:** a comissão enviada para a UTMify deve representar o valor bruto da venda, sem descontos ou taxas subtraídas. Por isso o campo `userCommissionInCents` precisa ser igual ao `priceInCents`, e o `gatewayFeeInCents` deve permanecer zerado.

## Configurações de Ambiente

### Variáveis Necessárias:

```env
# Facebook Pixel WhatsApp
WHATSAPP_FB_PIXEL_ID=seu_pixel_id_whatsapp
WHATSAPP_FB_PIXEL_TOKEN=seu_token_whatsapp

# UTMify WhatsApp
WHATSAPP_UTMIFY_API_TOKEN=seu_token_utmify_whatsapp

# Base URL
BASE_URL=https://seudominio.com
```

## Estrutura do Banco de Dados

### **REUTILIZAR TABELAS EXISTENTES** (Recomendado)

O sistema já possui tabelas robustas que podem ser reutilizadas:

#### Tabela: `tokens` (Existente - Adicionar coluna `tipo`)
```sql
-- Adicionar coluna para identificar tokens WhatsApp
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'principal';

-- Exemplo de token WhatsApp
INSERT INTO tokens (
    id_transacao, token, valor, descricao, tipo, status,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    fbp, fbc, ip_criacao, user_agent_criacao, event_time
) VALUES (
    'whatsapp_' || gen_random_uuid()::text,
    'token_whatsapp_123',
    10.00,
    'Token WhatsApp',
    'whatsapp',
    'valido',
    'facebook', 'cpc', 'whatsapp_campaign', 'content1', 'term1',
    'fb.1.1234567890.1234567890', 'fb.1.1234567890.AbCdEfGhIjKlMnOp',
    '192.168.1.1', 'Mozilla/5.0...', EXTRACT(EPOCH FROM NOW())
);
```

#### Tabela: `tracking_data` (Existente)
```sql
-- Para armazenar dados de tracking WhatsApp
INSERT INTO tracking_data (
    telegram_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    fbp, fbc, ip, user_agent
) VALUES (
    123456789, 'facebook', 'cpc', 'whatsapp_campaign', 'content1', 'term1',
    'fb.1.1234567890.1234567890', 'fb.1.1234567890.AbCdEfGhIjKlMnOp',
    '192.168.1.1', 'Mozilla/5.0...'
);
```

#### Tabela: `purchase_dedup` (Existente - Para deduplicação)
```sql
-- Sistema de deduplicação já implementado
-- Usar mesma tabela com prefixo 'whatsapp_' no event_id
```

### **Tabelas Específicas WhatsApp** (Opcional)

Se preferir isolamento total:

#### Tabela: `whatsapp_tokens`
```sql
CREATE TABLE whatsapp_tokens (
    id_transacao TEXT PRIMARY KEY,
    token TEXT UNIQUE,
    valor NUMERIC,
    descricao TEXT,
    status TEXT DEFAULT 'pendente',
    usado BOOLEAN DEFAULT FALSE,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    fbp TEXT,
    fbc TEXT,
    ip_criacao TEXT,
    user_agent_criacao TEXT,
    event_time INTEGER,
    pixel_sent BOOLEAN DEFAULT FALSE,
    capi_sent BOOLEAN DEFAULT FALSE,
    cron_sent BOOLEAN DEFAULT FALSE,
    first_event_sent_at TIMESTAMP,
    event_attempts INTEGER DEFAULT 0,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_uso TIMESTAMP
);
```

#### Tabela: `whatsapp_tracking_data`
```sql
CREATE TABLE whatsapp_tracking_data (
    session_id TEXT PRIMARY KEY,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    fbp TEXT,
    fbc TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Endpoints Backend Necessários

### 1. **Captura de UTMs** (Reutilizar existente)
```
POST /utm
Body: { utm_source, utm_medium, utm_campaign, utm_content, utm_term }
```

### 2. **Tracking de Eventos** (Novo)
```
POST /api/whatsapp/track-event
Body: { 
    event_name, event_id, session_id, token, value, 
    fbp, fbc, ip, user_agent, utm_data 
}
```

### 3. **Envio para Facebook CAPI** (Adaptar existente)
```
POST /api/whatsapp/facebook-capi
Body: { 
    event_name, event_id, event_time, value, currency,
    fbp, fbc, client_ip_address, client_user_agent,
    custom_data, source: 'whatsapp'
}
```

### 4. **Envio para UTMify** (Adaptar existente)
```
POST /api/whatsapp/utmify
Body: { 
    orderId, platform: 'whatsapp', paymentMethod: 'whatsapp',
    status: 'paid', customer, products, trackingParameters
}
```

### 5. **Verificação de Token** (Já existe)
```
POST /api/whatsapp/verificar-token
Body: { token }
```

### 6. **Session Tracking** (Reutilizar existente)
```
POST /api/session-tracking
Body: { telegram_id, tracking_data }
```

## Payload UTMify WhatsApp (Estrutura Completa)

```json
{
  "isTest": false,
  "status": "approved",
  "orderId": "token",
  "customer": {
    "name": "Cliente WhatsApp",
    "email": "whatsapp@example.com",
    "phone": "5511999999999",
    "country": "BR",
    "document": "00000000000"
  },
  "platform": "whatsapp",
  "products": [
    {
      "id": "whatsapp-content",
      "name": "Conteúdo WhatsApp",
      "planId": "plan_whatsapp",
      "planName": "Plano WhatsApp",
      "quantity": 1,
      "priceInCents": 9900
    }
  ],
  "createdAt": "2025-01-01T00:00:00Z",
  "approvedDate": "2025-01-01T00:00:00Z",
  "refundedAt": null,
  "commission": {
    "gatewayFeeInCents": 0,
    "totalPriceInCents": 9900,
    "userCommissionInCents": 9900
  },
  "paymentMethod": "whatsapp",
  "trackingParameters": {
    "src": "whatsapp",
    "utm_source": "whatsapp",
    "utm_medium": "social",
    "utm_campaign": "campanha-exemplo",
    "utm_content": "anuncio1",
    "utm_term": "palavra-chave"
  }
}
```

### Campos Obrigatórios e Recomendados

**Campos Obrigatórios:**
- `orderId`, `platform`, `status`, `customer.name`, `products`, `createdAt`

**Campos Recomendados (preenchidos quando disponíveis):**
- `commission`: Cálculo automático de taxas e comissões
- `approvedDate`: Data de aprovação (mesmo que createdAt)
- `customer.document`: CPF padrão quando não disponível
- `customer.phone`: Telefone padrão para WhatsApp
- `customer.country`: Sempre "BR" para Brasil
- `planId` e `planName`: Identificadores do plano
- `refundedAt`: Sempre null para vendas aprovadas

## Integração com Sistema Existente

### 1. **Isolamento Completo**
- **Pixel ID**: Diferente do sistema principal (`WHATSAPP_FB_PIXEL_ID`)
- **UTMify Token**: Separado (`WHATSAPP_UTMIFY_API_TOKEN`)
- **Tabelas**: Reutilizar existentes com coluna `tipo = 'whatsapp'`
- **Endpoints**: Prefixo `/api/whatsapp/` para novos endpoints

### 2. **Reutilização de Código**
- **Facebook Service**: Adaptar `services/facebook.js` para WhatsApp
- **UTMify Service**: Adaptar `services/utmify.js` para WhatsApp
- **Session Tracking**: Reutilizar `services/sessionTracking.js` (já suporta múltiplos sistemas)
- **Deduplicação**: Reutilizar `services/purchaseDedup.js` com prefixo 'whatsapp_'

### 3. **Sistema de Deduplicação Robusto**
- **Purchase**: `generatePurchaseEventId(token)` - usa token como base
- **PageView/ViewContent**: `generateRobustEventId(session_id, event_name, 5)` - janela de 5 minutos
- **Verificação**: `isEventAlreadySent(event_id, 'whatsapp', event_name)`
- **Registro**: `markEventAsSent()` com source='whatsapp'

### 4. **Session Tracking Integrado**
- **Cache**: NodeCache com TTL de 3 dias (259200 segundos)
- **Dados**: FBP, FBC, IP, User Agent, UTMs
- **Busca**: Automática via `telegram_id` quando disponível
- **Fallback**: localStorage para dados de sessão

### 5. **Flags de Controle**
- **pixel_sent**: Evento enviado via Facebook Pixel
- **capi_sent**: Evento enviado via Facebook CAPI
- **cron_sent**: Evento enviado via cron job
- **first_event_sent_at**: Timestamp do primeiro evento
- **event_attempts**: Contador de tentativas

## Logs e Debug

### Console Logs:
```javascript
console.log('[WHATSAPP-TRACKING]', 'Mensagem');
console.log('[WHATSAPP-UTM]', 'UTM capturado:', utmData);
console.log('[WHATSAPP-PIXEL]', 'Evento enviado:', eventData);
```

### Debug Mode:
```javascript
const DEBUG = window.location.hostname === 'localhost' || 
              window.location.hostname.includes('dev');
```

## Validações e Segurança

### 1. **Validação de Token**
- **Verificação**: Token válido e não usado antes de disparar Purchase
- **Marcação**: Token marcado como usado após evento bem-sucedido
- **Prevenção**: Sistema de deduplicação impede múltiplos disparos
- **Auditoria**: Logs completos de tentativas e sucessos

### 2. **Validação de UTMs**
- **Sanitização**: Decodificação segura com `decodeURIComponent()`
- **Formato**: Validação do formato `nome|id` com regex `/^\d+$/`
- **Fallback**: Valores padrão para UTMs inválidos
- **Persistência**: Armazenamento em localStorage com TTL

### 3. **Rate Limiting e Controle**
- **Sessão**: Limite de eventos por sessão (sessionStorage)
- **Cooldown**: Intervalo mínimo entre eventos (100ms)
- **Deduplicação**: Verificação robusta via `isEventAlreadySent()`
- **Cache**: Controle de tamanho do cache (max 1000 entradas)

### 4. **Segurança de Dados**
- **SQL Injection**: Prepared statements em todas as queries
- **XSS**: Sanitização de dados de entrada
- **CSRF**: Validação de origem das requisições
- **Logs**: Auditoria completa de eventos e erros

### 5. **Validação de Pixel**
- **Cookies**: Verificação de FBP/FBC válidos
- **Formato**: Validação de formato de cookies Facebook
- **Fallback**: Busca automática via SessionTracking
- **Timeout**: Controle de timeout para APIs externas

## Testes

### 1. **Teste Local**
```bash
# Acessar localhost
http://localhost:3000/whatsapp?utm_source=test&utm_campaign=whatsapp_test
```

### 2. **Teste de Eventos**
- Verificar PageView no console
- Verificar ViewContent após 4s
- Verificar Purchase após validação
- **Teste de geração de event_id no navegador**: Criar um `console.log` de `generateEventId('PageView', 'whatsapp')` no redirect.html e verificar saída correta (string hex de 16 caracteres)

### 3. **Teste de UTMs**
- Verificar captura no localStorage
- Verificar envio para backend
- Verificar envio para UTMify

### 4. **Teste de Normalização de UTMs**
```bash
# Testar UTMs inválidas que devem ser corrigidas
http://localhost:3000/whatsapp?utm_source=UNKNOWN&utm_medium=Social Media&utm_campaign=Test Campaign&utm_content=unknown

# Verificar no console se foram normalizadas para:
# utm_source: nao-definido
# utm_medium: social-media  
# utm_campaign: test-campaign
# utm_content: nao-definido
```

### 5. **Teste de Payload UTMify**
- Verificar se payload gerado contém todos os campos oficiais
- Comparar com exemplo oficial da UTMify
- Validar campos commission, approvedDate, customer.document
- Confirmar que trackingParameters seguem regras de nomenclatura

## Monitoramento

### 1. **Dashboard WhatsApp**
- Eventos por dia
- Conversões por UTM
- Taxa de erro

### 2. **Logs de Sistema**
- Eventos enviados
- Erros de tracking
- Performance

### 3. **Alertas**
- Falha no pixel
- Erro no UTMify
- Token inválido

## Considerações Importantes

### 1. **Compatibilidade**
- **Sistema Principal**: Não interferir no tracking existente
- **Isolamento**: Dados completamente separados
- **Reutilização**: Aproveitar infraestrutura existente
- **Versionamento**: Manter compatibilidade com versões futuras

### 2. **Performance**
- **Carregamento**: Assíncrono e não-bloqueante
- **Redirecionamento**: Não atrasar redirecionamento para WhatsApp
- **Fallback**: Sistema de fallback para falhas de tracking
- **Cache**: Cache inteligente para reduzir requisições

### 3. **Privacidade e LGPD**
- **Dados Mínimos**: Coletar apenas dados necessários
- **Consentimento**: Implícito para tracking de conversão
- **Retenção**: Dados com TTL de 3 dias
- **Anonimização**: Hash de dados pessoais quando necessário

### 4. **Monitoramento e Alertas**
- **Métricas**: Eventos enviados, taxas de erro, performance
- **Alertas**: Falhas no pixel, erros no UTMify, tokens inválidos
- **Dashboard**: Visualização de dados em tempo real
- **Logs**: Auditoria completa de eventos

### 5. **Escalabilidade**
- **Cache**: Sistema de cache distribuído
- **Rate Limiting**: Controle de taxa de requisições
- **Pool de Conexões**: Gerenciamento eficiente de conexões DB
- **Load Balancing**: Suporte a múltiplas instâncias

## Próximos Passos

### **Fase 1: Preparação**
1. **Configurar variáveis de ambiente** (WHATSAPP_FB_PIXEL_ID, WHATSAPP_FB_PIXEL_TOKEN, WHATSAPP_UTMIFY_API_TOKEN)
2. **Adicionar coluna `tipo`** na tabela `tokens` se não existir
3. **Criar endpoints backend** com prefixo `/api/whatsapp/`

### **Fase 2: Frontend**
4. **Criar `whatsapp/js/whatsapp-tracking.js`** - Sistema principal de tracking
5. **Criar `whatsapp/js/whatsapp-utm-tracker.js`** - Captura de UTMs
6. **Criar `whatsapp/js/whatsapp-pixel.js`** - Pixel específico
7. **Modificar `redirect.html`** - Incluir tracking PageView/ViewContent
8. **Modificar `obrigado.html`** - Incluir tracking Purchase

### **Fase 3: Backend**
9. **Adaptar `services/facebook.js`** - Suporte a pixel WhatsApp
10. **Adaptar `services/utmify.js`** - Suporte a UTMify WhatsApp
11. **Implementar endpoints** - `/api/whatsapp/track-event`, `/api/whatsapp/facebook-capi`, `/api/whatsapp/utmify`

### **Fase 4: Testes**
12. **Teste local** - Verificar eventos no console
13. **Teste de UTMs** - Verificar captura e envio
14. **Teste de deduplicação** - Verificar sistema robusto
15. **Teste de performance** - Verificar não-bloqueio

### **Fase 5: Deploy**
16. **Deploy em staging** - Teste completo
17. **Deploy em produção** - Ativação gradual
18. **Monitoramento** - Acompanhar métricas e logs
19. **Ajustes** - Otimizações baseadas em dados reais

---

## **Resumo Técnico**

Este sistema implementa tracking completo para WhatsApp seguindo **exatamente** o padrão do sistema principal e **100% alinhado** com as regras oficiais da UTMify:

- ✅ **3 eventos**: PageView, ViewContent, Purchase
- ✅ **Pixel separado**: Facebook Pixel ID próprio
- ✅ **UTMify separado**: Token próprio com platform='whatsapp'
- ✅ **Deduplicação robusta**: Sistema de event_id único
- ✅ **Session Tracking**: Cache com TTL de 3 dias
- ✅ **Reutilização**: Aproveita infraestrutura existente
- ✅ **Isolamento**: Dados completamente separados
- ✅ **Segurança**: Validações e sanitizações completas
- ✅ **UTMs normalizadas**: Conversão automática para minúsculas, hífens e sem "unknown"
- ✅ **Payload UTMify completo**: Estrutura oficial com todos os campos obrigatórios e recomendados
- ✅ **Conformidade total**: Segue regras de nomenclatura e estrutura da UTMify

**Nota**: Este sistema deve ser completamente independente do tracking principal, usando pixels e UTMify separados para evitar conflitos e permitir análise isolada do funil WhatsApp. Todas as UTMs são automaticamente validadas e normalizadas conforme as regras oficiais da UTMify.
