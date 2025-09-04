# Implementação do Kwai Event API Tracking para Privacy

## Visão Geral

Sistema completo de tracking para a Kwai Event API integrado à pasta `privacy---sync`, implementando os mesmos eventos do bot:
- **EVENT_CONTENT_VIEW**: Quando alguém acessa a landing page do Privacy
- **EVENT_ADD_TO_CART**: Quando PIX é gerado
- **EVENT_PURCHASE**: Quando pagamento é aprovado

## Arquivos Implementados

### 1. Configuração
- **`loadConfig.js`**: Adicionadas configurações do Kwai Event API
  - `kwai.pixelId`: ID do pixel Kwai
  - `kwai.accessToken`: Token de acesso
  - `kwai.testFlag`: Flag de teste baseada no ambiente
  - `kwai.trackFlag`: Flag de tracking baseada no ambiente

### 2. Serviço Backend
- **`services/kwaiEventAPI.js`**: Classe principal para comunicação com a Kwai Event API
  - Métodos: `sendEvent()`, `sendContentView()`, `sendAddToCart()`, `sendPurchase()`
  - Validação de configurações e tratamento de erros
  - Suporte completo aos parâmetros da API

### 3. Frontend Tracking
- **`public/js/kwai-click-tracker.js`**: Sistema de captura e armazenamento do click_id
  - Captura automática do `click_id` da URL
  - Armazenamento persistente no localStorage
  - Expiração automática após 24 horas
  - API JavaScript global (`window.KwaiTracker`)

### 4. Integrações Backend

#### server.js
- Nova rota `/api/kwai-event` para processar eventos
- Modificação da rota `/api/config` para incluir status do Kwai

#### pushinpayWebhook.js
- Tracking ADD_TO_CART na criação de PIX
- Tracking PURCHASE na aprovação de pagamento
- Busca do `click_id` do webhook ou ID da transação como fallback

#### universal-payment-integration.js
- Tracking ADD_TO_CART na criação de PIX via frontend
- Integração com `window.KwaiTracker`

## Configuração Necessária

### Variáveis de Ambiente
```bash
KWAI_PIXEL_ID=seu_pixel_id_aqui
KWAI_ACCESS_TOKEN=seu_access_token_aqui
NODE_ENV=development  # ou production
```

### Banco de Dados
Não são necessárias alterações no banco de dados, pois o tracking é feito via localStorage e webhooks.

## Fluxo de Funcionamento

### 1. Captura Initial (Landing Page)
```
URL com click_id → kwai-click-tracker.js → localStorage
```

### 2. Evento CONTENT_VIEW
```
Acesso à página → KwaiTracker.sendContentView() → /api/kwai-event → Kwai API
```

### 3. Evento ADD_TO_CART
```
Gerar PIX → universal-payment-integration.js → KwaiTracker.sendAddToCart() → Kwai API
Gerar PIX → Webhook PushinPay → kwaiEventAPI.sendAddToCart() → Kwai API
```

### 4. Evento PURCHASE
```
Pagamento Aprovado → Webhook PushinPay → kwaiEventAPI.sendPurchase() → Kwai API
```

## Parâmetros Enviados

### EVENT_CONTENT_VIEW
- `content_name`: "Privacy - Landing Page"
- `content_category`: "Privacy"
- `content_id`: "privacy_landing"
- `currency`: "BRL"

### EVENT_ADD_TO_CART
- `value`: Valor em reais
- `contentName`: Nome da oferta
- `contentId`: ID da transação
- `contentCategory`: "Privacy - PIX"
- `currency`: "BRL"
- `quantity`: 1

### EVENT_PURCHASE
- `value`: Valor pago em reais
- `contentName`: Nome da oferta
- `contentId`: ID da transação
- `contentCategory`: "Privacy - PIX"
- `currency`: "BRL"
- `quantity`: 1
- `payer_name`: Nome do pagador
- `end_to_end_id`: ID end-to-end do PIX

## Tratamento de Erros

- Validação de configurações obrigatórias
- Logs detalhados para debug
- Fallback graceful quando click_id não disponível
- Timeout de 10 segundos nas requisições
- Não bloqueia o fluxo principal em caso de erro

## Debug e Monitoramento

### Logs Frontend
```javascript
// Habilitar debug no console
localStorage.setItem('kwai_debug', 'true');
```

### Logs Backend
```bash
# Procurar por logs do Kwai
grep -i "kwai" logs/app.log
```

### Verificar Click ID
```javascript
// No console do navegador
console.log(window.KwaiTracker.getClickId());
```

## Teste da Implementação

### 1. Testar Captura
```
1. Acesse: /privacy---sync/public/index.html?click_id=TEST123
2. Verifique console: "Click ID capturado"
3. Verifique localStorage: kwai_click_id
```

### 2. Testar Eventos
```
1. Clique em botões de plano (CONTENT_VIEW)
2. Gere PIX (ADD_TO_CART)
3. Simule pagamento via webhook (PURCHASE)
```

### 3. Verificar Logs
```
1. Console do navegador para eventos frontend
2. Logs do servidor para eventos backend
3. Painel da Kwai para confirmação
```

## Notas Técnicas

1. **Persistência**: Click_id persiste entre páginas via localStorage
2. **Expiração**: Click_id expira automaticamente após 24h
3. **Fallback**: Usa ID da transação como fallback quando click_id não disponível
4. **Performance**: Operações assíncronas não bloqueiam UI
5. **Compatibilidade**: Funciona em todos navegadores modernos
6. **Integração**: Funciona tanto via frontend quanto via webhooks

## Diferenças do Bot

1. **Frontend**: Implementado em `/privacy---sync/public/`
2. **Backend**: Implementado em `/privacy---sync/services/`
3. **Webhooks**: Integrado com PushinPay em vez de Telegram
4. **Eventos**: Mesma estrutura, mas adaptada para contexto Privacy
5. **Configuração**: Centralizada em `loadConfig.js`

## Próximos Passos

1. **Testar**: Verificar funcionamento em ambiente de desenvolvimento
2. **Monitorar**: Acompanhar eventos na tela da Kwai
3. **Otimizar**: Ajustar propriedades dos eventos conforme necessário
4. **Expandir**: Adicionar mais eventos se necessário
