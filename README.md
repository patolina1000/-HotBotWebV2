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

## Rotas de debug

- `GET /debug/telegram_user/:id` &rarr; retorna o registro persistido no PostgreSQL.
- `POST /debug/capi/initiate` com `{ "telegram_id": "123456789" }` &rarr; reenfileira o InitiateCheckout usando os dados armazenados.

Os logs no terminal exibem tentativas, respostas da Graph API e mensagens de erro (incluindo retries com backoff para códigos 5xx).
