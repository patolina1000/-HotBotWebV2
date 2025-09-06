# Integração Kwai Event API

## Visão Geral

Esta integração permite enviar eventos de conversão para a plataforma Kwai através da Kwai Event API. Os eventos são enviados automaticamente quando ocorrem compras (Purchase) ou quando usuários iniciam o checkout (InitiateCheckout).

## Configuração

### Variáveis de Ambiente

Adicione as seguintes variáveis ao seu arquivo `.env`:

```env
# Kwai Event API
KWAI_ACCESS_TOKEN=seu_access_token_aqui
KWAI_PIXEL_ID=seu_pixel_id_aqui
KWAI_TEST_MODE=false  # true para modo de teste, false para produção
```

### Instalação

A integração já está incluída no projeto. Não são necessárias dependências adicionais.

## Funcionalidades

### 1. Serviço KwaiEventAPI

O serviço principal está localizado em `services/kwaiEventAPI.js` e oferece:

- **sendKwaiEvent()**: Envia eventos genéricos para a Kwai
- **sendPurchaseEvent()**: Envia eventos de compra
- **sendInitiateCheckoutEvent()**: Envia eventos de início de checkout
- **storeKwaiClickId()**: Armazena click ID do Kwai
- **getKwaiClickId()**: Recupera click ID do Kwai

### 2. Integração Automática

#### Eventos de Compra (Purchase)
- **Localização**: Webhook `/webhook`
- **Trigger**: Quando um pagamento é aprovado
- **Dados enviados**: Valor, nome do plano, ID do produto

#### Eventos de Checkout (InitiateCheckout)
- **Localização**: Endpoints de geração de PIX
  - `/api/gerar-pix-checkout` (checkout web)
  - `/api/gerar-qr-pix` (obrigado especial)
- **Trigger**: Quando um QR code PIX é gerado
- **Dados enviados**: Plano selecionado, valor, ID do produto

### 3. Endpoints da API

#### POST /api/kwai-click-id
Armazena o click ID do Kwai para um usuário.

**Request:**
```json
{
  "telegram_id": "123456789",
  "click_id": "kwai_click_12345"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Click ID do Kwai armazenado com sucesso"
}
```

#### GET /api/kwai-config
Retorna as configurações do Kwai para o frontend.

**Response:**
```json
{
  "success": true,
  "config": {
    "hasAccessToken": true,
    "hasPixelId": true,
    "testMode": false,
    "trackFlag": true,
    "apiUrl": "https://www.adsnebula.com/log/common/api"
  }
}
```

## Uso no Frontend

### 1. Capturar Click ID do Kwai

```javascript
// Capturar click_id da URL
const urlParams = new URLSearchParams(window.location.search);
const kwaiClickId = urlParams.get('click_id');

if (kwaiClickId) {
  // Enviar para o backend
  fetch('/api/kwai-click-id', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      telegram_id: 'SEU_TELEGRAM_ID',
      click_id: kwaiClickId
    })
  });
}
```

### 2. Verificar Configuração

```javascript
// Verificar se o Kwai está configurado
fetch('/api/kwai-config')
  .then(response => response.json())
  .then(data => {
    if (data.success && data.config.hasAccessToken) {
      console.log('Kwai Event API configurado');
    }
  });
```

## Estrutura dos Eventos

### Payload Padrão

```json
{
  "access_token": "KWAI_ACCESS_TOKEN",
  "clickid": "click_id_do_kwai",
  "event_name": "EVENT_PURCHASE",
  "pixelId": "KWAI_PIXEL_ID",
  "testFlag": false,
  "trackFlag": true,
  "is_attributed": 1,
  "mmpcode": "PL",
  "pixelSdkVersion": "9.9.9",
  "properties": "{\"content_id\":\"plano_1mes\",\"content_name\":\"Plano Mensal\",\"content_type\":\"product\",\"currency\":\"BRL\",\"value\":29.9}"
}
```

### Tipos de Eventos Suportados

- **EVENT_PURCHASE**: Compra realizada
- **EVENT_INITIATED_CHECKOUT**: Início do checkout

## Teste da Integração

Execute o script de teste:

```bash
node test-kwai-integration.js
```

Este script irá:
1. Verificar as configurações
2. Testar armazenamento de click ID
3. Testar envio de eventos
4. Mostrar logs detalhados

## Logs e Monitoramento

### Logs de Sucesso
```
✅ Evento Purchase enviado via Kwai Event API - Valor: R$ 29.90 - Plano: Plano Mensal
✅ Evento InitiateCheckout enviado via Kwai Event API - Plano: 1 mês - Valor: R$ 19.90
```

### Logs de Erro
```
❌ Erro ao enviar evento Purchase via Kwai: Click ID não fornecido
ℹ️ Kwai Event API não configurado, pulando envio
```

### Logs de Configuração
```
🎯 KwaiEventAPIService iniciado: {
  pixelId: "123456789",
  testMode: false,
  hasAccessToken: true
}
```

## Troubleshooting

### 1. Eventos não são enviados
- Verifique se as variáveis de ambiente estão configuradas
- Confirme se o click ID está sendo capturado e armazenado
- Verifique os logs do servidor para erros específicos

### 2. Click ID não encontrado
- Certifique-se de que o click ID está sendo capturado no frontend
- Verifique se o endpoint `/api/kwai-click-id` está sendo chamado
- Confirme se o telegram_id está correto

### 3. Configuração incorreta
- Verifique se `KWAI_ACCESS_TOKEN` e `KWAI_PIXEL_ID` estão definidos
- Confirme se `KWAI_TEST_MODE` está configurado corretamente
- Teste com o script `test-kwai-integration.js`

## Arquivos Modificados

- `services/kwaiEventAPI.js` - Novo serviço
- `server.js` - Integração nos webhooks e endpoints
- `test-kwai-integration.js` - Script de teste
- `KWAI_INTEGRATION_README.md` - Esta documentação

## Próximos Passos

1. Configure as variáveis de ambiente
2. Teste a integração com o script fornecido
3. Monitore os logs em produção
4. Ajuste os parâmetros conforme necessário
5. Considere adicionar mais tipos de eventos conforme a necessidade
