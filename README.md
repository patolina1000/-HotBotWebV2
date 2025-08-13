# 🚀 SiteHot - Sistema Unificado de Bot Telegram + Backend Web

## 📋 Descrição Geral

O **SiteHot** é um sistema completo de automação de vendas que integra bots do Telegram com um backend web robusto para processamento de pagamentos PIX, rastreamento de conversões e envio de eventos para Facebook Pixel e Meta Conversions API (CAPI).

### 🎯 Funcionalidades Principais

- **🤖 Bots Telegram**: Dois bots independentes com sistema de downsells automático
- **💳 Processamento PIX**: Integração com PushinPay para cobranças instantâneas
- **📊 Rastreamento Avançado**: Facebook Pixel + Meta Conversions API com deduplicação
- **🔗 Sistema de Tokens**: Geração e validação de tokens únicos para acesso
- **📈 Dashboard**: Painel administrativo com métricas em tempo real
- **🔄 UTMify**: Integração para tracking de campanhas e comissões
- **🛡️ Segurança**: Hashing de dados pessoais e proteções contra fraudes

## 🏗️ Arquitetura

### Tecnologias Utilizadas

- **Backend**: Node.js 20.x + Express.js
- **Banco de Dados**: PostgreSQL (principal) + SQLite (fallback)
- **Bots**: node-telegram-bot-api
- **Pagamentos**: PushinPay API
- **Tracking**: Facebook Pixel + Meta Conversions API
- **Cache**: node-cache + SessionTrackingService
- **Monitoramento**: node-cron para tarefas agendadas

### Estrutura de Pastas

```
-HotBotWebV2/
├── server.js                 # Servidor principal (entry point)
├── app.js                    # Aplicação Express alternativa
├── package.json              # Dependências e scripts
├── database/
│   ├── postgres.js          # Configuração PostgreSQL
│   └── sqlite.js            # Configuração SQLite
├── services/
│   ├── facebook.js          # Serviço Facebook CAPI
│   ├── sessionTracking.js   # Rastreamento invisível
│   ├── utmify.js           # Integração UTMify
│   ├── purchaseValidation.js # Validação de compras
│   └── trackingValidation.js # Validação de tracking
├── MODELO1/
│   ├── BOT/
│   │   ├── bot1.js         # Bot principal
│   │   ├── bot2.js         # Bot secundário
│   │   ├── config1.js      # Configuração bot1
│   │   ├── config2.js      # Configuração bot2
│   │   └── utils/midia.js  # Gerenciador de mídias
│   ├── core/
│   │   └── TelegramBotService.js # Classe principal dos bots
│   └── WEB/
│       ├── index.html       # Landing page
│       ├── obrigado.html    # Página de sucesso
│       ├── dashboard.html   # Painel administrativo
│       ├── tokens.js        # Sistema de tokens
│       ├── utm-capture.js   # Captura de UTMs
│       ├── fbclid-handler.js # Gerenciamento fbclid
│       ├── event-id.js      # Geração de event IDs
│       └── dashboard.js     # Lógica do dashboard
└── routes/
    └── links.js             # Rotas de redirecionamento
```

## ⚙️ Instalação e Configuração

### Pré-requisitos

- Node.js 20.x ou superior
- PostgreSQL (banco principal)
- Conta PushinPay para processamento PIX
- Facebook Pixel ID e Access Token
- Tokens dos bots do Telegram

### Variáveis de Ambiente

```bash
# Configurações do Servidor
NODE_ENV=production
PORT=3000
BASE_URL=https://seudominio.com

# Banco de Dados
DATABASE_URL=postgresql://user:password@host:port/database

# Bots Telegram
TELEGRAM_TOKEN=seu_token_bot1
TELEGRAM_TOKEN_BOT2=seu_token_bot2

# PushinPay
PUSHINPAY_TOKEN=seu_token_pushinpay

# Facebook Pixel
FB_PIXEL_ID=seu_pixel_id
FB_PIXEL_TOKEN=seu_access_token

# UTMify
UTMIFY_API_TOKEN=seu_token_utmify
UTMIFY_AD_ACCOUNT_ID=seu_ad_account_id

# URLs de Redirecionamento
URL_ENVIO_1=https://grupo1.com
URL_ENVIO_2=https://grupo2.com
URL_ENVIO_3=https://grupo3.com

# Segurança
PANEL_ACCESS_TOKEN=token_acesso_dashboard
WEBHOOK_SECRET=secret_webhook_pushinpay
```

### Instalação

```bash
# Clonar repositório
git clone <repository-url>
cd HotBotWebV2

# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas configurações

# Inicializar banco de dados
npm run build

# Iniciar servidor
npm start
```

## 🔄 Fluxo do Usuário Final

### 1. Acesso Inicial
```
Usuário clica em anúncio → Landing page (index.html)
↓
Captura automática de UTMs e cookies Facebook
↓
Geração de payload_id único
↓
Redirecionamento para bot Telegram com payload
```

### 2. Interação com Bot
```
Bot recebe /start com payload_id
↓
Busca dados de tracking no banco
↓
Associa payload ao telegram_id
↓
Exibe menu de planos
↓
Usuário seleciona plano
↓
Geração de cobrança PIX via PushinPay
```

### 3. Processamento de Pagamento
```
PushinPay gera QR Code PIX
↓
Usuário paga via PIX
↓
Webhook PushinPay → servidor
↓
Validação de pagamento
↓
Geração de token único
↓
Envio de link para usuário
```

### 4. Acesso ao Conteúdo
```
Usuário acessa obrigado.html?token=xxx
↓
Validação do token
↓
Disparo de evento Purchase (Pixel + CAPI)
↓
Redirecionamento para URL final
```

## 🎯 Sistema de Rastreamento

### Captura de Dados

**Frontend (utm-capture.js + fbclid-handler.js):**
- Captura automática de UTMs da URL
- Gerenciamento correto do cookie `_fbc` via fbclid
- Armazenamento em localStorage e sessionStorage
- Fallback para cookies do Facebook Pixel

**Backend (sessionTracking.js):**
- Cache em memória com TTL de 3 dias
- Associação automática de cookies ao telegram_id
- Sistema de fallback com política LRU
- Limpeza automática para evitar memory leaks

### Envio de Eventos

**Facebook Pixel (Client-side):**
```javascript
// Eventos enviados automaticamente
fbq('track', 'PageView', { 
  eventID: generateEventID('PageView'),
  test_event_code: 'TEST11543'
});
fbq('track', 'ViewContent', { 
  value: 9.90, 
  currency: 'BRL',
  test_event_code: 'TEST11543'
});
fbq('track', 'Purchase', { 
  value: valor, 
  currency: 'BRL',
  eventID: token,
  event_source_url: window.location.href,
  test_event_code: 'TEST11543'
});
```

**Meta Conversions API (Server-side):**
```javascript
// Eventos enviados via CAPI
await sendFacebookEvent({
  event_name: 'Purchase',
  event_time: timestamp,
  event_id: token,
  value: valor,
  currency: 'BRL',
  fbp: fbp,
  fbc: fbc,
  client_ip_address: ip,
  client_user_agent: userAgent
});
// O código de teste TEST11543 é adicionado automaticamente no payload
```

### Deduplicação

- **Event ID único**: Token do usuário como event_id
- **Cache de deduplicação**: 10 minutos TTL
- **Sincronização de timestamp**: Cliente ↔ Servidor
- **Fallback automático**: Cron job para eventos não enviados

## 🧪 Endpoints e APIs

### Endpoints Principais

```javascript
// Verificação de token
POST /api/verificar-token
{
  "token": "token_64_chars"
}

// Geração de payload
POST /api/gerar-payload
{
  "utm_source": "facebook",
  "utm_medium": "cpc",
  "utm_campaign": "campanha1",
  "fbp": "_fbp_cookie",
  "fbc": "_fbc_cookie"
}

// Marcar pixel enviado
POST /api/marcar-pixel-enviado
{
  "token": "token_64_chars"
}

// Sincronizar timestamp
POST /api/sync-timestamp
{
  "token": "token_64_chars",
  "client_timestamp": 1234567890
}

// ViewContent via CAPI
POST /api/capi/viewcontent
{
  "event_id": "unique_event_id",
  "url": "https://site.com/page",
  "fbp": "_fbp_cookie",
  "fbc": "_fbc_cookie"
}
```

### Webhooks

```javascript
// Webhook PushinPay
POST /bot1/webhook
POST /bot2/webhook

// Webhook Telegram
POST /bot1/webhook (processUpdate)
POST /bot2/webhook (processUpdate)
```

### Dashboard APIs

```javascript
// Estatísticas de eventos
GET /api/eventos?token=access_token&evento=Purchase&inicio=2024-01-01&fim=2024-01-31

// Dados do dashboard
GET /api/dashboard-data?token=access_token&inicio=2024-01-01&fim=2024-01-31

// Estatísticas de Purchase
GET /api/purchase-stats
```

## 🔐 Segurança

### Geração de Tokens
```javascript
// Tokens são gerados com crypto.randomBytes(32)
const token = crypto.randomBytes(32).toString('hex');
// Resultado: 64 caracteres hexadecimais
```

### Hashing de Dados Pessoais
```javascript
// Dados pessoais são hasheados com SHA-256
const fnHash = crypto.createHash('sha256').update(primeiroNome).digest('hex');
const lnHash = crypto.createHash('sha256').update(sobrenome).digest('hex');
const externalIdHash = crypto.createHash('sha256').update(cpf).digest('hex');
```

### Proteções Implementadas

- **Rate Limiting**: 100 requests/15min por IP
- **SQL Injection**: Prepared statements em todas as queries
- **XSS Protection**: Helmet.js com CSP configurado
- **Token Validation**: Validação rigorosa de formato e existência
- **Access Control**: Token de acesso para dashboard
- **Data Sanitization**: Limpeza de inputs em todos os endpoints

## 🧰 Debug e Logs

### Logs Principais

```bash
# Verificar status do servidor
curl https://seudominio.com/health

# Verificar banco de dados
curl https://seudominio.com/health-database

# Debug completo
curl https://seudominio.com/debug/status

# Estatísticas de eventos
curl https://seudominio.com/api/purchase-stats
```

### Logs de Eventos

```javascript
// Logs de rastreamento
console.log('📱 Dados de rastreamento armazenados para usuário:', telegramId);
console.log('🔥 FBP recuperado do SessionTracking para telegram_id:', telegramId);
console.log('📤 Evento Purchase enviado via Pixel | eventID:', token);

// Logs de erro
console.error('❌ Erro ao enviar evento CAPI:', error);
console.warn('⚠️ Evento duplicado detectado e ignorado');
```

### Monitoramento

- **Health Checks**: `/health`, `/health-basic`, `/health-database`
- **Cron Jobs**: Limpeza automática de dados antigos
- **Memory Management**: Cache com TTL e limpeza automática
- **Error Tracking**: Logs detalhados com stack traces

## 📈 Possíveis Extensões

### TikTok Events API
```javascript
// Implementação futura
const tiktokEvent = {
  event: 'Purchase',
  event_time: timestamp,
  user_data: {
    ip: clientIp,
    user_agent: userAgent,
    external_id: hashedUserId
  },
  properties: {
    value: valor,
    currency: 'BRL'
  }
};
```

### Webhooks Customizados
```javascript
// Sistema de webhooks configuráveis
app.post('/webhooks/custom', async (req, res) => {
  const { event_type, data } = req.body;
  // Processar evento customizado
  await processCustomWebhook(event_type, data);
});
```

### Integração com CRM
```javascript
// Integração com sistemas externos
const crmIntegration = {
  createLead: async (userData) => {
    // Integração com CRM
  },
  updateConversion: async (purchaseData) => {
    // Atualizar conversão no CRM
  }
};
```

## 🚀 Deploy

### Render.com
```yaml
# render.yaml
services:
  - type: web
    name: sitehot-backend
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        sync: false
```

### Docker
```dockerfile
# Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 📊 Métricas e Analytics

### Eventos Rastreados

1. **PageView**: Carregamento de páginas
2. **ViewContent**: Visualização de conteúdo
3. **AddToCart**: Interação com bot (Telegram)
4. **InitiateCheckout**: Início do processo de pagamento
5. **Purchase**: Compra finalizada

### KPIs Monitorados

- **Conversão**: PageView → Purchase
- **Faturamento**: Valor total das vendas
- **ROAS**: Return on Ad Spend
- **CAC**: Customer Acquisition Cost
- **LTV**: Lifetime Value

## 🔧 Manutenção

### Comandos Úteis

```bash
# Gerenciar tokens
npm run tokens:list          # Listar todos os tokens
npm run tokens:used          # Listar tokens usados
npm run tokens:stats         # Estatísticas dos tokens
npm run tokens:delete-used   # Deletar tokens usados
npm run tokens:delete-all    # Deletar todos os tokens

# Testes
npm test                     # Testar conexão com banco
npm run build               # Build com dependências nativas
```

### Backup e Recuperação

```javascript
// Backup automático
const backup = await postgres.createBackup(pool);
console.log('Backup criado:', backup);

// Restauração
const restoreData = JSON.parse(fs.readFileSync(backupFile));
await restoreFromBackup(restoreData);
```

---

**Desenvolvido com ❤️ para automação de vendas e rastreamento avançado de conversões.**
