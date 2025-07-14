# Sistema HotBot

Este repositório contém o bot de vendas para Telegram, as páginas web e o backend central que integra pagamento via PushinPay e rastreamento no Facebook Pixel.

## Visão geral

- **Front-end** (`MODELO1/WEB`): páginas HTML/JS para captação do tráfego, geração do token e validação do acesso. Inclui `index.html`, `boasvindas.html` e `obrigado.html`.
- **Bots** (`MODELO1/BOT`): código do bot do Telegram. Cada bot possui `botX.js`, `configX.js` e a pasta `midia/` com conteúdo personalizado.
- **Backend** (`server.js`): aplicação Express que serve as páginas, recebe webhooks da PushinPay e do Telegram e dispara eventos no Facebook (Pixel e CAPI).
- **Banco de dados**: suporta SQLite (para testes) e PostgreSQL.

## Tecnologias

- Node.js 20, Express e node-telegram-bot-api
- Banco PostgreSQL e SQLite
- Integração PushinPay (PIX)
- Facebook Pixel e Conversions API

## Estrutura de pastas

```
MODELO1/
  BOT/                 # Código dos bots e arquivos de mídia
  WEB/                 # Front-end estático
database/              # Conexões PostgreSQL e SQLite
services/facebook.js   # Envio de eventos ao Pixel
server.js              # Backend principal
```

## Instalação

1. Clone o repositório e instale as dependências:

```bash
npm install
```

2. Crie um arquivo `.env` na raiz com as variáveis necessárias:

```bash
TELEGRAM_TOKEN=bot_token_1
TELEGRAM_TOKEN_BOT2=bot_token_2
BASE_URL=https://seusite.onrender.com
FRONTEND_URL=https://seusite.onrender.com
DATABASE_URL=postgresql://usuario:senha@host:5432/banco
PUSHINPAY_TOKEN=token_pushinpay
URL_ENVIO_1=https://t.me/grupo1
URL_ENVIO_2=https://t.me/grupo2
URL_ENVIO_3=https://t.me/grupo3
FB_PIXEL_ID=ID_PIXEL
FB_PIXEL_TOKEN=TOKEN_PIXEL
FB_TEST_EVENT_CODE=codigo_teste
PORT=3000
```

## Como rodar

```bash
npm start
```
O servidor carrega os bots, inicializa o banco de dados e expõe as páginas da pasta `MODELO1/WEB`. Para testes rápidos de banco utilize `npm test`.

### Deploy na Render

O arquivo `render.yaml` já define um Web Service. Basta criar um serviço Node no painel da Render apontando para este repositório. O comando de build executa `npm install` e `npm run build` e o start é `npm start`.

## Fluxo de funcionamento

1. Visitante acessa `index.html` ou `boasvindas.html`.
2. O link gerado redireciona para o bot do Telegram com parâmetros UTM e dados de rastreamento (FBP, FBC, IP e User-Agent).
3. O bot gera uma cobrança via PushinPay e envia o Pix ao usuário.
4. Ao confirmar o pagamento, a PushinPay chama `/webhook/pushinpay`. O token é gravado no banco e o bot envia o link para `obrigado.html?token=...`.
5. A página `obrigado.html` valida o token em `/api/verificar-token`, dispara o evento `Purchase` e redireciona para o grupo definido nas variáveis `URL_ENVIO_X`.

## Comandos úteis

- `npm start` – inicia o servidor.
- `npm test` – testa conexão com o banco.
- `npm run tokens:list` – lista tokens no banco.
- `npm run tokens:used` – tokens já utilizados.
- `npm run tokens:stats` – estatísticas de tokens.
- `npm run tokens:delete-used` – remove tokens usados.
```
