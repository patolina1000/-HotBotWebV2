# Implementação do Kwai Event API Tracking

## Visão Geral

Sistema completo de tracking para a Kwai Event API integrado ao HotBot, implementando os eventos:
- **EVENT_CONTENT_VIEW**: Quando alguém clica em CTAs do index.html
- **EVENT_ADD_TO_CART**: Quando PIX é gerado
- **EVENT_PURCHASE**: Quando pagamento é aprovado

## Arquivos Implementados

### 1. Serviço Principal
- **`services/kwaiEventAPI.js`**: Classe principal para comunicação com a Kwai Event API
  - Métodos: `sendEvent()`, `sendContentView()`, `sendAddToCart()`, `sendPurchase()`
  - Validação de configurações e tratamento de erros
  - Suporte completo aos parâmetros da API

### 2. Frontend Tracking
- **`MODELO1/WEB/kwai-click-tracker.js`**: Sistema de captura e armazenamento do click_id
  - Captura automática do `click_id` da URL
  - Armazenamento persistente no localStorage
  - Expiração automática após 24 horas
  - API JavaScript global (`window.KwaiTracker`)

### 3. Integrações Backend

#### TelegramBotService.js
- Tracking ADD_TO_CART na geração de PIX (linha ~1123)
- Tracking PURCHASE na aprovação de pagamento (linha ~1342)
- Busca do `kwai_click_id` do tracking data

#### server.js
- Nova rota `/api/kwai-event` para processar eventos
- Modificação da rota `/api/gerar-payload` para incluir `kwai_click_id`

#### index.html
- Inclusão do script `kwai-click-tracker.js`
- Tracking CONTENT_VIEW no clique dos CTAs
- Envio do `kwai_click_id` no payload

## Configuração Necessária

### Variáveis de Ambiente
```bash
KWAI_PIXEL_ID=seu_pixel_id_aqui
KWAI_ACCESS_TOKEN=seu_access_token_aqui
NODE_ENV=development  # ou production
```

### Banco de Dados
Colunas adicionadas automaticamente:
- `payloads.kwai_click_id`
- `tokens.kwai_click_id`
- `tracking_data.kwai_click_id`

## Fluxo de Funcionamento

### 1. Captura Initial (Landing Page)
```
URL com click_id → kwai-click-tracker.js → localStorage
```

### 2. Evento CONTENT_VIEW
```
Clique CTA → KwaiTracker.sendContentView() → /api/kwai-event → Kwai API
```

### 3. Evento ADD_TO_CART
```
Gerar PIX → TelegramBotService → kwaiEventAPI.sendAddToCart() → Kwai API
```

### 4. Evento PURCHASE
```
Pagamento Aprovado → Webhook → kwaiEventAPI.sendPurchase() → Kwai API
```

## Parâmetros Enviados

### EVENT_CONTENT_VIEW
- `content_name`: Nome da landing page/headline
- `content_category`: "Bot Telegram"
- `content_id`: "telegram_cta"
- `currency`: "BRL"

### EVENT_ADD_TO_CART
- `value`: Valor em reais
- `contentName`: Nome da oferta
- `contentId`: ID da transação
- `contentCategory`: "Bot Telegram"
- `currency`: "BRL"

### EVENT_PURCHASE
- `value`: Valor pago em reais
- `contentName`: Nome da oferta
- `contentId`: ID da transação
- `contentCategory`: "Bot Telegram"
- `currency`: "BRL"

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

## Notas Técnicas

1. **Persistência**: Click_id persiste entre páginas via localStorage
2. **Expiração**: Click_id expira automaticamente após 24h
3. **Deduplicação**: Usa eventID para evitar eventos duplicados
4. **Performance**: Operações assíncronas não bloqueiam UI
5. **Compatibilidade**: Funciona em todos navegadores modernos

## Teste da Implementação

### 1. Testar Captura
```
1. Acesse: /modelo1/web/index.html?click_id=TEST123
2. Verifique console: "Click ID capturado"
3. Verifique localStorage: kwai_click_id
```

### 2. Testar CONTENT_VIEW
```
1. Com click_id válido, clique no CTA Telegram
2. Verifique console: "Kwai EVENT_CONTENT_VIEW enviado"
3. Verifique logs do servidor
```

### 3. Testar ADD_TO_CART
```
1. Complete fluxo até geração de PIX
2. Verifique logs: "Kwai ADD_TO_CART enviado"
```

### 4. Testar PURCHASE
```
1. Complete pagamento via PIX
2. Verifique logs webhook: "Kwai PURCHASE enviado"
```

## Manutenção

- Monitorar logs de erro regularmente
- Verificar rate limits da Kwai API
- Atualizar tokens de acesso conforme necessário
- Revisar configurações em mudanças de ambiente
