# 🚀 HotBot Web V2 - Sistema de Esteira de Pagamento e Dashboard

## 📋 Visão Geral

Sistema integrado de **esteira de pagamento** que conecta Facebook Ads → Página (pixel) → Telegram Bot → PIX (PushinPay) → Webhook → Dashboard → UTMify, implementando rastreabilidade ponta a ponta com alta confiabilidade.

### 🎯 Principais Objetivos
- **Rastreabilidade ponta a ponta** desde o clique no Facebook até a conversão
- **Idempotência** para evitar duplicação de eventos e transações
- **Coerência de preços** entre exibição e cobrança
- **Timezone America/Recife** para relatórios precisos
- **UTMs corretas** com deduplicação Pixel/CAPI
- **Logs estruturados** para auditoria e troubleshooting

---

## 🏗️ Arquitetura

### Fluxo de Eventos (Client-Side + Server-Side)

```mermaid
graph TD
    A[Facebook Ads] --> B[Página Landing]
    B --> C[Pixel: offer_shown]
    B --> D[Telegram Bot: /start]
    D --> E[Bot: offer_shown]
    E --> F[PushinPay: pix_created]
    F --> G[Webhook: pix_created]
    G --> H[Database: funnel_events]
    F --> I[Cliente Paga PIX]
    I --> J[PushinPay: pix_paid]
    J --> K[Webhook: pix_paid]
    K --> L[Database: pix_paid]
    L --> M[UTMify: enviarConversao]
    M --> N[Dashboard: KPIs]
    
    subgraph "Server-Side"
        G --> H
        K --> L
        L --> M
        M --> N
    end
    
    subgraph "Client-Side"
        B --> C
        B --> D
    end
    
    subgraph "Idempotência"
        G --> O[webhookReprocessingValidationMiddleware]
        K --> O
        O --> P[transaction_id + telegram_id]
    end
    
    subgraph "Timezone"
        H --> Q[America/Recife]
        L --> Q
        N --> Q
    end
```

### Componentes Principais

- **`services/funnelEvents.js`** - Persistência de eventos com validação
- **`services/auditLogger.js`** - Logs estruturados e auditoria
- **`services/idempotencyService.js`** - Proteção contra duplicação
- **`services/funnelQueries.js`** - Consultas com timezone correto
- **`MODELO1/core/TelegramBotService.js`** - Integração Telegram + PushinPay
- **`services/utmify.js`** - Envio de conversões para UTMify

---

## 📊 Padrões de Tracking

### Campos Obrigatórios nos Eventos

| Campo | Descrição | Persistido em |
|-------|-----------|---------------|
| `payload_id` | ID único da sessão | `funnel_events.meta` |
| `telegram_id` | ID do usuário Telegram | `funnel_events.telegram_id` |
| `transaction_id` | ID da transação PushinPay | `funnel_events.transaction_id` |
| `UTMs` | Parâmetros de campanha | `funnel_events.meta.utm_*` |
| `fbp/fbc` | Cookies do Facebook | `funnel_events.meta.fbp/fbc` |
| `ip` | Endereço IP do cliente | `funnel_events.meta.ip` |
| `user_agent` | User-Agent do navegador | `funnel_events.meta.user_agent` |

### Convenções de UTMs

```javascript
// Formato padrão: nome|id
utm_source: "facebook|123456789"
utm_medium: "cpc|search"
utm_campaign: "black_friday|2024"
utm_content: "video_ads|001"
utm_term: "hotbot|premium"
```

**Regras:**
- Usar **minúsculas** para todos os parâmetros
- `utm_source`: plataforma|id_conta
- `utm_medium`: tipo|método
- `utm_campaign`: nome|ano
- `utm_content`: tipo_midia|id
- `utm_term`: produto|tier

### Regras para fbp e fbc

- **fbp**: Cookie de navegação do Facebook (ex: `fb.1.123456789.987654321`)
- **fbc**: Cookie de clique do Facebook (ex: `fb.1.123456789.987654321.1234567890`)
- Validação básica: formato `fb.1.{timestamp}.{random}`

### Boas Práticas para Deduplicação Pixel/CAPI

- **event_id** consistente entre `offer_shown` e `pix_created`
- Uso de `transaction_id` como chave de idempotência
- Cache em memória para eventos recentes (5 minutos)

---

## 🔒 Idempotência e Anti-reprocessamento

### Como a Idempotência é Garantida

#### Chaves de Idempotência
```javascript
// services/idempotencyService.js
generateCacheKey(eventType, transactionId, telegramId) {
  return `${eventType}|${transactionId}|${telegramId}`;
}
```

#### Validações Implementadas
- **Cache em memória** com TTL de 5 minutos
- **Verificação no banco** para eventos persistentes
- **Middleware global** em `app.js` para webhooks
- **Proteção específica** para `pix_created` e `pix_paid`

#### Comportamento em Chamadas Repetidas
```javascript
// Webhook reprocessado retorna:
{
  "success": false,
  "error": "Evento já processado",
  "transaction_id": "pix_123456",
  "timestamp": "2024-01-15T10:30:00-03:00"
}
```

#### Logs de "Duplicate Hit"
```json
{
  "timestamp": "2024-01-15 10:30:00",
  "level": "WARN",
  "event": "idempotency_check",
  "message": "Webhook reprocessado detectado",
  "transaction_id": "pix_123456",
  "telegram_id": "123456789",
  "request_id": "req_abc123"
}
```

---

## 💰 Coerência de Preço

### Validação Implementada

#### Localização da Validação
- **`services/idempotencyService.js`** - Função `checkPriceConsistency()`
- **`services/auditLogger.js`** - Logs de auditoria de preço
- **Webhook PushinPay** - Validação antes de persistir

#### Estratégia de Auditoria
```javascript
// Validação automática em pix_paid
const priceValidation = validatePriceConsistency(
  displayedPriceCents, 
  chargedPriceCents
);

if (!priceValidation.isValid) {
  await auditLogger.logPriceInconsistency({
    displayed: displayedPriceCents,
    charged: chargedPriceCents,
    difference: Math.abs(displayedPriceCents - chargedPriceCents),
    transaction_id: transaction_id
  });
}
```

#### Pontos de Falha Comuns
1. **Mudança de tier** durante o processo
2. **Cache desatualizado** no frontend
3. **Promoções aplicadas** no momento do pagamento
4. **Erro de formatação** de preços

---

## 🔌 Webhooks PushinPay

### Endpoint Utilizado
```
POST /webhook/pushinpay
```

### Headers Obrigatórios
```http
Content-Type: application/json
X-PushinPay-Signature: sha256=...
User-Agent: PushinPay-Webhook/1.0
```

### Eventos Relevantes
- **`pix_created`** - PIX gerado com sucesso
- **`pix_paid`** - PIX pago pelo cliente
- **`pix_expired`** - PIX expirado (não processado)

### Política de Reentrega
- **Máximo 3 tentativas** com backoff exponencial
- **Validação de idempotência** em cada tentativa
- **Logs estruturados** para auditoria de reentregas

### Observações sobre Polling vs Webhook
- **Preferência: Webhook** para atualizações em tempo real
- **Fallback: Polling** a cada 30 segundos (máximo)
- **Rate limiting**: 200 requests/minuto na API PushinPay

---

## 🔗 UTMify

### Integração na Conversão

#### Quando é Enviado
- **Evento**: `pix_paid` confirmado
- **Trigger**: Webhook PushinPay processado com sucesso
- **Dados**: UTMs + informações da transação

#### Validação de Campos Obrigatórios
```javascript
// services/utmify.js
const requiredFields = {
  customer: {
    email: 'string válido ou fake',
    name: 'string não vazio'
  },
  products: {
    name: 'string não vazio',
    priceInCents: 'integer > 0'
  },
  dates: 'formato UTC ISO 8601'
};
```

#### Processamento de UTMs
```javascript
// Formato nome|id para UTMify
function processUTMForUtmify(utmValue) {
  if (!utmValue) return { name: null, id: null, formatted: null };
  
  const parts = utmValue.split('|');
  return {
    name: parts[0] || null,
    id: parts[1] || null,
    formatted: utmValue
  };
}
```

### Observação sobre Metadados PushinPay
**PushinPay não carrega metadados de UTM** - a associação é feita localmente através do `transaction_id` e reportada no webhook de pagamento. Isso garante rastreabilidade completa mesmo quando o cliente não retorna à página após o pagamento.

---

## 🕐 Timezone

### Justificativa do Uso
- **Localização**: Brasil (Recife)
- **Horário comercial**: UTC-3 (America/Recife)
- **Relatórios**: Precisão para análise de performance por horário

### Impacto nos Relatórios
- **Consultas agregadas** respeitam timezone local
- **KPIs diários** baseados em dia comercial brasileiro
- **Gráficos temporais** com horários corretos

### Implementação no Código
```javascript
// services/funnelQueries.js
constructor() {
  this.timezone = 'America/Recife';
}

parseDateRange(from, to) {
  // Converter para timezone America/Recife
  const fromRecife = new Date(fromDate.toLocaleString('en-US', { 
    timeZone: this.timezone 
  }));
}
```

---

## 📝 Logs Estruturados

### Formato JSON
```json
{
  "timestamp": "2024-01-15 10:30:00",
  "level": "INFO",
  "event": "pix_paid",
  "environment": "production",
  "request_id": "req_abc123",
  "payload_id": "sess_xyz789",
  "telegram_id": "123456789",
  "transaction_id": "pix_123456",
  "meta": {
    "utm_source": "facebook|123456789",
    "utm_medium": "cpc|search",
    "fbp": "fb.1.123456789.987654321",
    "ip": "192.168.1.1",
    "user_agent": "Mozilla/5.0..."
  }
}
```

### Chaves Mínimas
- `timestamp` - Data/hora no timezone Recife
- `level` - INFO, WARN, ERROR
- `event` - Nome do evento
- `request_id` - ID único da requisição
- `payload_id` - ID da sessão
- `telegram_id` - ID do usuário Telegram
- `transaction_id` - ID da transação (quando aplicável)

### Níveis de Log por Etapa
| Etapa | Nível | Descrição |
|-------|-------|-----------|
| `offer_shown` | INFO | Oferta apresentada ao usuário |
| `pix_created` | INFO | PIX gerado com sucesso |
| `pix_paid` | INFO | Pagamento confirmado |
| `price_inconsistency` | WARN | Divergência de preço detectada |
| `duplicate_webhook` | WARN | Webhook reprocessado |
| `error` | ERROR | Erro no processamento |

### Como Filtrar e Correlacionar
```sql
-- Buscar eventos por transaction_id
SELECT * FROM funnel_events 
WHERE transaction_id = 'pix_123456';

-- Correlacionar por payload_id
SELECT * FROM funnel_events 
WHERE payload_id = 'sess_xyz789'
ORDER BY occurred_at;

-- Filtrar por período e bot
SELECT * FROM funnel_events 
WHERE bot = 'bot1' 
AND occurred_at >= '2024-01-01' 
AND occurred_at <= '2024-01-31';
```

---

## 🚀 Como Rodar e Variáveis de Ambiente

### Setup Básico
```bash
# 1. Clonar repositório
git clone <repository-url>
cd -HotBotWebV2

# 2. Instalar dependências
npm install

# 3. Configurar variáveis de ambiente
cp ENV_EXAMPLE.md .env
# Editar .env com valores reais

# 4. Inicializar banco de dados
node init-postgres.js

# 5. Executar aplicação
npm start
```

### Variáveis de Ambiente Relevantes

#### PushinPay (Produção)
```bash
PUSHINPAY_TOKEN=token_producao
PUSHINPAY_URL=https://api.pushinpay.com.br
PUSHINPAY_WEBHOOK_SECRET=secret_webhook
```

#### PushinPay (Sandbox)
```bash
PUSHINPAY_TOKEN_SANDBOX=token_sandbox
PUSHINPAY_URL_SANDBOX=https://sandbox.pushinpay.com.br
PUSHINPAY_WEBHOOK_SECRET_SANDBOX=secret_webhook_sandbox
```

#### UTMify
```bash
UTMIFY_API_KEY=api_key_utmify
UTMIFY_AD_ACCOUNT_ID=129355640213755
UTMIFY_WEBHOOK_URL=https://webhook.utmify.com
```

#### Telegram
```bash
TELEGRAM_TOKEN=token_bot1
TELEGRAM_TOKEN_BOT2=token_bot2
```

#### Banco de Dados
```bash
DATABASE_URL=postgresql://user:pass@host:port/database
NODE_ENV=production
```

#### Debug e Logs
```bash
LOG_LEVEL=info
DEBUG_TRACKING=true
ENABLE_AUDIT_LOGS=true
```

### Chaves Sensíveis (NÃO EXPOR)
- **Tokens PushinPay** - Acesso à API de pagamentos
- **Webhook Secrets** - Validação de webhooks
- **API Keys UTMify** - Envio de conversões
- **Tokens Telegram** - Controle dos bots
- **Credenciais de Banco** - Acesso aos dados

---

## 🧪 Testes Manuais e Validações

### Teste 1: Simular pix_created + pix_paid

#### Comando curl para pix_created
```bash
curl -X POST http://localhost:3000/webhook/pushinpay \
  -H "Content-Type: application/json" \
  -H "X-PushinPay-Signature: sha256=test" \
  -d '{
    "event": "pix_created",
    "transaction_id": "test_pix_123",
    "telegram_id": "123456789",
    "price_cents": 9900,
    "offer_tier": "premium"
  }'
```

#### Comando curl para pix_paid
```bash
curl -X POST http://localhost:3000/webhook/pushinpay \
  -H "Content-Type: application/json" \
  -H "X-PushinPay-Signature: sha256=test" \
  -d '{
    "event": "pix_paid",
    "transaction_id": "test_pix_123",
    "telegram_id": "123456789",
    "price_cents": 9900,
    "offer_tier": "premium"
  }'
```

### Teste 2: Reenvio para Provar Idempotência
```bash
# Reenviar o mesmo webhook
curl -X POST http://localhost:3000/webhook/pushinpay \
  -H "Content-Type: application/json" \
  -H "X-PushinPay-Signature: sha256=test" \
  -d '{
    "event": "pix_paid",
    "transaction_id": "test_pix_123",
    "telegram_id": "123456789",
    "price_cents": 9900,
    "offer_tier": "premium"
  }'
```

**Resultado esperado**: `{"success": false, "error": "Evento já processado"}`

### Teste 3: Cenário sem UTMs
```bash
curl -X POST http://localhost:3000/webhook/pushinpay \
  -H "Content-Type: application/json" \
  -H "X-PushinPay-Signature: sha256=test" \
  -d '{
    "event": "pix_created",
    "transaction_id": "test_no_utm_123",
    "telegram_id": "123456789",
    "price_cents": 9900,
    "offer_tier": "premium"
  }'
```

### Teste 4: Cenário com UTMs Válidas
```bash
curl -X POST http://localhost:3000/webhook/pushinpay \
  -H "Content-Type: application/json" \
  -H "X-PushinPay-Signature: sha256=test" \
  -d '{
    "event": "pix_created",
    "transaction_id": "test_utm_123",
    "telegram_id": "123456789",
    "price_cents": 9900,
    "offer_tier": "premium",
    "meta": {
      "utm_source": "facebook|123456789",
      "utm_medium": "cpc|search",
      "utm_campaign": "black_friday|2024"
    }
  }'
```

### Como Coletar Evidências para PR

#### 1. Screenshots Obrigatórios
- **Dashboard principal** com dados de teste
- **Filtros de período** funcionando
- **Gráficos** com dados visíveis
- **Tabelas** com informações corretas

#### 2. JSON dos Logs
```bash
# Buscar logs no banco
SELECT * FROM funnel_events 
WHERE transaction_id LIKE 'test_%'
ORDER BY occurred_at DESC;
```

#### 3. Verificação do Dashboard
- **Hoje**: Dados do dia atual
- **Semana**: Últimos 7 dias
- **Mês**: Últimos 30 dias
- **7d**: Período customizado de 7 dias
- **30d**: Período customizado de 30 dias
- **Custom**: Seleção manual de datas

---

## 🔧 Troubleshooting

### Problemas Comuns

#### 1. UTMs Inválidas
```json
// Erro: utm_source nulo
{
  "error": "UTM source é obrigatório",
  "received": null,
  "expected": "facebook|123456789"
}
```

**Solução**: Verificar parâmetros na URL de entrada

#### 2. fbc Malformado
```json
// Erro: Formato inválido
{
  "error": "FBC deve seguir formato fb.1.{timestamp}.{random}",
  "received": "invalid_fbc_value"
}
```

**Solução**: Validar cookies do Facebook na página

#### 3. Divergência de Preço
```json
// Warning: Preços diferentes
{
  "level": "WARN",
  "event": "price_inconsistency",
  "displayed": 9900,
  "charged": 8900,
  "difference": 1000
}
```

**Solução**: Verificar mudança de tier durante processo

#### 4. Falta de Payload no /start
```json
// Erro: Payload ausente
{
  "error": "Payload obrigatório para /start",
  "telegram_id": "123456789"
}
```

**Solução**: Verificar link de entrada com parâmetros

#### 5. Erros 500 com utm_source Nulo
```json
// Erro interno
{
  "error": "Cannot read property 'utm_source' of null",
  "stack": "..."
}
```

**Solução**: Verificar middleware de tracking

#### 6. Mídia Ausente
```json
// Warning: Arquivo não encontrado
{
  "level": "WARN",
  "event": "missing_media",
  "file": "ds1.jpg",
  "path": "./midia/downsells/ds1.jpg"
}
```

**Solução**: Verificar arquivos na pasta `MODELO1/BOT/midia/`

### Como Interpretar Mensagens

#### AuditLogger
```javascript
// Logs estruturados com contexto completo
auditLogger.logFunnelEvent('info', 'pix_paid', {
  transaction_id: 'pix_123',
  telegram_id: '123456789',
  meta: { utm_source: 'facebook|123' }
});
```

#### Middleware de Tracking
```javascript
// Middleware global aplicado em app.js
app.use(requestTracking.requestTrackingMiddleware);
```

---

## 🛡️ Segurança e Conformidade

### Cabeçalhos de Segurança
```javascript
// Headers implementados
app.use(helmet()); // Segurança básica
app.use(cors()); // Controle de origem
```

### Proteção de Webhook
```javascript
// Validação de assinatura PushinPay
const signature = req.headers['x-pushinpay-signature'];
if (!validateSignature(signature, req.body)) {
  return res.status(401).json({ error: 'Assinatura inválida' });
}
```

### Rate Limiting
```javascript
// Limite de 100 requests/minuto por IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100
});
```

### Validação de Input
```javascript
// Sanitização de parâmetros UTM
function sanitizeUTM(utmValue) {
  return (utmValue || '').toString().toLowerCase().trim();
}
```

### Limites da API PushinPay
- **Intervalo de consulta**: Mínimo 30 segundos
- **Rate limit**: 200 requests/minuto
- **Timeout**: 30 segundos por request
- **Retry**: Máximo 3 tentativas

---

## ✅ Critérios de Aceite

### Checklist Essencial para Mudanças Futuras

#### ✅ Idempotência
- [ ] Webhooks podem ser reenviados sem duplicação
- [ ] Cache em memória funciona corretamente
- [ ] Validação no banco previne duplicatas

#### ✅ Logs Estruturados
- [ ] Todos os eventos têm campos obrigatórios
- [ ] Timestamps estão no timezone Recife
- [ ] Correlação via request_id funciona

#### ✅ Timezone America/Recife
- [ ] Consultas respeitam timezone local
- [ ] Relatórios mostram horários corretos
- [ ] Agregações diárias baseadas em dia comercial

#### ✅ UTMs Válidas e Coerentes
- [ ] Formato nome|id é respeitado
- [ ] Parâmetros são persistidos corretamente
- [ ] Deduplicação Pixel/CAPI funciona

#### ✅ Coerência de Preço
- [ ] Validação entre offer_shown e pix_created
- [ ] Logs de auditoria são gerados
- [ ] Alertas para divergências são exibidos

#### ✅ Proteção de Reprocessamento
- [ ] Middleware global está ativo
- [ ] Webhooks são protegidos contra duplicação
- [ ] Logs de reprocessamento são claros

---

## 📚 Apêndice

### Exemplos de Payloads JSON

#### 1. Evento offer_shown
```json
{
  "event_name": "offer_shown",
  "bot": "bot1",
  "offer_tier": "premium",
  "price_cents": 9900,
  "telegram_id": "123456789",
  "meta": {
    "utm_source": "facebook|123456789",
    "utm_medium": "cpc|search",
    "utm_campaign": "black_friday|2024",
    "fbp": "fb.1.123456789.987654321",
    "ip": "192.168.1.1",
    "user_agent": "Mozilla/5.0..."
  }
}
```

#### 2. Webhook pix_created
```json
{
  "event": "pix_created",
  "transaction_id": "pix_123456",
  "telegram_id": "123456789",
  "price_cents": 9900,
  "offer_tier": "premium",
  "meta": {
    "utm_source": "facebook|123456789",
    "utm_medium": "cpc|search"
  }
}
```

#### 3. Webhook pix_paid
```json
{
  "event": "pix_paid",
  "transaction_id": "pix_123456",
  "telegram_id": "123456789",
  "price_cents": 9900,
  "offer_tier": "premium",
  "payer_name": "João Silva",
  "meta": {
    "utm_source": "facebook|123456789",
    "utm_medium": "cpc|search"
  }
}
```

### Referências Cruzadas aos Arquivos-Chave

| Funcionalidade | Arquivo | Linha |
|----------------|---------|-------|
| **Idempotência** | `services/idempotencyService.js` | 1-413 |
| **Logs Estruturados** | `services/auditLogger.js` | 1-337 |
| **Eventos do Funil** | `services/funnelEvents.js` | 1-729 |
| **Consultas Dashboard** | `services/funnelQueries.js` | 1-406 |
| **Integração Telegram** | `MODELO1/core/TelegramBotService.js` | 1-2189 |
| **UTMify** | `services/utmify.js` | 1-245 |
| **Middleware Global** | `app.js` | 1-567 |
| **Rotas Dashboard** | `routes/dashboard.js` | 1-389 |
| **Interface Dashboard** | `MODELO1/WEB/dashboard.html` | 1-343 |
| **Lógica Dashboard** | `MODELO1/WEB/dashboard.js` | 1-539 |

### Comandos de Teste Úteis

#### Verificar Status dos Serviços
```bash
# Status do banco
curl http://localhost:3000/api/health/database

# Status dos serviços
curl http://localhost:3000/api/health/services

# Status do Telegram
curl http://localhost:3000/api/health/telegram
```

#### Testar Endpoints do Dashboard
```bash
# Resumo geral
curl "http://localhost:3000/api/dashboard/summary?from=2024-01-01&to=2024-01-31"

# Série temporal
curl "http://localhost:3000/api/dashboard/timeseries?metric=pix_paid&group=day&from=2024-01-01&to=2024-01-31"

# Distribuição de tiers
curl "http://localhost:3000/api/dashboard/tiers?from=2024-01-01&to=2024-01-31"
```

---

## 🔗 Links Relacionados

- **[ROTEIRO_VALIDACAO_PR.md](./ROTEIRO_VALIDACAO_PR.md)** - Checklist de validação para PRs
- **[CORRECOES.md](./CORRECOES.md)** - Histórico de correções implementadas
- **[TESTES.md](./TESTES.md)** - Guia de testes e validações
- **[FACEBOOK_PIXEL_CORRECOES_IMPLEMENTADAS.md](./FACEBOOK_PIXEL_CORRECOES_IMPLEMENTADAS.md)** - Correções do Facebook Pixel

---

## 📞 Suporte

Para dúvidas técnicas ou problemas de implementação, consulte:
1. **Logs estruturados** no banco de dados
2. **AuditLogger** para eventos específicos
3. **ROTEIRO_VALIDACAO_PR.md** para checklist de validação
4. **Testes manuais** com comandos curl fornecidos

---

*Documentação gerada automaticamente baseada no código do repositório HotBot Web V2. Última atualização: Janeiro 2024.*
