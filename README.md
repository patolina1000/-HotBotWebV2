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

## Rotas de debug

- `GET /debug/telegram_user/:id` &rarr; retorna o registro persistido no PostgreSQL.
- `POST /debug/capi/initiate` com `{ "telegram_id": "123456789" }` &rarr; reenfileira o InitiateCheckout usando os dados armazenados.

Os logs no terminal exibem tentativas, respostas da Graph API e mensagens de erro (incluindo retries com backoff para códigos 5xx).
