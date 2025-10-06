# HotBot Telegram Webhook

Este documento descreve como testar localmente o webhook do Telegram responsável por processar o comando `/start` com payload codificado em Base64, persistir os dados no PostgreSQL e disparar o evento **InitiateCheckout** via Meta CAPI.

## Variáveis de ambiente

Configure as seguintes variáveis no seu `.env`:

```dotenv
FB_PIXEL_ID=seu_pixel_id
FB_PIXEL_TOKEN=seu_token_do_pixel
FB_TEST_EVENT_CODE=opcional_para_ambiente_de_teste
DATABASE_URL=postgres://usuario:senha@host:porta/banco
NODE_ENV=development
```

As variáveis já existentes para o fluxo de WhatsApp continuam funcionado; apenas adicionamos as entradas acima ao arquivo `.env.example`.

## Migração necessária

Execute as migrações para criar a tabela `telegram_users`:

```bash
node migrate-database.js
```

A nova tabela realiza **upsert** pelo `telegram_id` e armazena hashes/UTMs usados para reenviar o InitiateCheckout quando necessário.

## Teste manual do webhook

1. Inicie o servidor local (`npm install` e `npm run dev`/`npm start`).
2. Execute o `curl` abaixo simulando o update `/start` enviado pelo Telegram:

```bash
curl -X POST http://localhost:3000/telegram/webhook \
  -H 'Content-Type: application/json' \
  -d '{
    "update_id": 1,
    "message": {
      "message_id": 10,
      "date": 1700000000,
      "text": "/start eyJleHRlcm5hbF9pZCI6IjhiMWE5OTUzYzQ2MTEyOTZhODI3YWJmOGM0NzgwNGQ3IiwiZmJwIjoiZmIuMS4xNzAwMDAwMDAwLjEyMzQ1Njc4OSIsImZiYyI6ImZiLjEuMTcwMDAwMDAwMC5BYkNkRWZHIiwiemlwIjoicG9zdGFsOjEyMzQ1Njc4IiwidXRtX2RhdGEiOnsidXRtX3NvdXJjZSI6InRlbGVncmFtIiwidXRtX21lZGl1bSI6ImNwYyIsInV0bV9jYW1wYWlnbiI6ImxhdW5jaCIsInV0bV9jb250ZW50Ijoic3RhcnQiLCJ1dG1fdGVybSI6ImJvdCJ9LCJjbGllbnRfaXBfYWRkcmVzcyI6IjIwMy4wLjExMy40MiIsImNsaWVudF91c2VyX2FnZW50IjoiY3VybC10ZXN0LWFnZW50LzEuMCIsImV2ZW50X3NvdXJjZV91cmwiOiJodHRwczovL2V4YW1wbGUuY29tL2xhbmRpbmcifQ==",
      "entities": [
        { "offset": 0, "length": 6, "type": "bot_command" }
      ],
      "from": { "id": 123456789, "is_bot": false, "first_name": "Teste" },
      "chat": { "id": 123456789, "type": "private" }
    }
  }'
```

3. O retorno deve conter `ok: true`, o `event_id` gerado e o resultado da chamada Meta CAPI.

## Eventos Purchase e deduplicação

Para facilitar a depuração, abaixo estão todos os gatilhos atuais do evento **Purchase**:

1. **Checkout Web** (`checkout/index.html` e `checkout/obrigado.html`)
   - O navegador dispara o Pixel e o CAPI client-side assim que o pagamento é confirmado e o usuário acessa a página de obrigado.
2. **Bots/WhatsApp** (`MODELO1/core/TelegramBotService.js`)
   - O webhook da PushinPay agora dispara o Purchase server-side imediatamente após receber o status `paid/approved/pago`.
   - O envio via webhook usa `transaction_id` como chave de idempotência; retries da PushinPay são ignorados com log explícito.
3. **Fallbacks agendados** (`server.js` e crons)
   - Continuam existindo para reenviar Purchases marcados como `capi_ready`, garantindo redundância caso o webhook falhe.

### Observações importantes

- Antes de cada POST para a Meta logamos `event_name`, `event_id`, `transaction_id`, `value`, `currency`, `action_source`, flags de `fbp/fbc/ip/ua` e o `test_event_code` aplicado.
- Eventos vindos do webhook usam sempre um `event_id` UUID v4 e passam o `transaction_id` para o serviço de dedupe server-side.
- Em ambientes de teste defina `TEST_EVENT_CODE` (ou `FB_TEST_EVENT_CODE`) para que tanto Lead quanto Purchase apareçam no **Test Events** do Gerenciador de Eventos.
- Caso o usuário não visite a página de obrigado, o evento Purchase será enviado mesmo assim pelo webhook.

## Fallback com `payload_id`

Quando o JSON codificado em Base64 ultrapassar 64 caracteres, o frontend passa a usar o endpoint `POST /api/gerar-payload` para armazenar os dados e redirecionar o usuário usando apenas o `payload_id` curto. O webhook agora aceita tanto o Base64 quanto o identificador persistido.

Fluxo resumido:

- Base64 com comprimento ≤ 64 caracteres &rarr; continua sendo enviado normalmente via `?start=<base64>`.
- Base64 com comprimento &gt; 64 caracteres &rarr; o navegador chama `/api/gerar-payload`, recebe `{ payload_id }` e redireciona com `?start=<payload_id>`.
- O webhook detecta automaticamente o formato, busca os dados quando necessário e executa o mesmo fluxo de upsert + Meta CAPI.

### Teste com `payload_id`

1. Gere um payload persistido:

   ```bash
   curl -X POST http://localhost:3000/api/gerar-payload \
     -H 'Content-Type: application/json' \
     -d '{
       "utm_source": "telegram",
       "utm_medium": "cpc",
       "utm_campaign": "campanha",
       "utm_term": "palavra",
       "utm_content": "variante",
       "fbp": "fb.1.1700000000000.1234567890",
       "fbc": "fb.1.1700000000000.ABCD1234",
       "ip": "203.0.113.10",
       "user_agent": "curl-test-agent/1.0"
     }'
   ```

   O retorno conterá um `payload_id` curto (por exemplo, `8f3a2c9b`).

2. Use o identificador no webhook:

   ```bash
   curl -X POST http://localhost:3000/telegram/webhook \
     -H 'Content-Type: application/json' \
     -d '{
       "update_id": 2,
       "message": {
         "message_id": 11,
         "date": 1700000001,
         "text": "/start 8f3a2c9b",
         "entities": [
           { "offset": 0, "length": 6, "type": "bot_command" }
         ],
         "from": { "id": 123456789, "is_bot": false, "first_name": "Teste" },
         "chat": { "id": 123456789, "type": "private" }
       }
     }'
   ```

   O log do servidor exibirá o caminho `[START] payload_id=<id>` e a resposta JSON seguirá o mesmo formato do teste anterior.

## Painel de debug e métricas

As rotas de observabilidade exigem o header `Authorization: Bearer $PANEL_ACCESS_TOKEN`.

### Consultar tracking consolidado

```bash
curl -H 'Authorization: Bearer supertoken' \
  http://localhost:3000/debug/telegram/123456789
```

### Reenviar eventos Meta CAPI

```bash
curl -X POST http://localhost:3000/debug/retry/capi \
  -H 'Authorization: Bearer supertoken' \
  -H 'Content-Type: application/json' \
  -d '{
        "telegram_id": "123456789",
        "type": "Purchase",
        "token": "pedido-abc"
      }'
```

Para reenviar `InitiateCheckout`, ajuste o campo `type` para `"InitiateCheckout"`.

### Reprocessar conversão na UTMify

```bash
curl -X POST http://localhost:3000/debug/retry/utmify \
  -H 'Authorization: Bearer supertoken' \
  -H 'Content-Type: application/json' \
  -d '{
        "telegram_id": "123456789",
        "token": "pedido-abc"
      }'
```

### Verificar configuração de ambiente

```bash
curl -H 'Authorization: Bearer supertoken' \
  http://localhost:3000/debug/config
```

### Métricas agregadas

```bash
curl -H 'Authorization: Bearer supertoken' \
  'http://localhost:3000/metrics/events/daily?days=14'

curl -H 'Authorization: Bearer supertoken' \
  http://localhost:3000/metrics/events/today
```

### Healthcheck completo

```bash
curl http://localhost:3000/health/full
```

O JSON de retorno indica `ok`, status do banco, contadores diários e se os módulos CAPI/UTMify/Geo estão configurados.

## Checklist de Deploy

- `PANEL_ACCESS_TOKEN` configurado e protegido.
- `FB_PIXEL_ID` e `FB_PIXEL_TOKEN` definidos; se aplicável, `WHATSAPP_FB_PIXEL_ID` e `WHATSAPP_FB_PIXEL_TOKEN` também.
- `UTMIFY_API_URL` e `UTMIFY_API_TOKEN` ativos para disparo de conversões.
- `GEO_PROVIDER_URL` (ou padrão) e `GEO_API_KEY` disponíveis para lookup de localização.
- `BASE_URL` e `FRONTEND_URL` alinhados com a configuração de CORS do ambiente.
- TLS e HSTS habilitados no proxy/reverse proxy diante do serviço.
- Rotas `/debug/*` e `/metrics/*` protegidas por token forte ou allowlist de IP.
- Cron diário de limpeza (payloads + funnel) configurado e monitorado.
