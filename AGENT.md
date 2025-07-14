# Guia Rápido para Agentes

Este sistema automatiza a venda de conteúdo adulto via Telegram. O bot envia um PIX pela PushinPay e, após o pagamento, libera um link único para o grupo VIP.

## Verificar se o bot está online

1. Acesse `https://SEU_DOMINIO/health-basic` ou `https://SEU_DOMINIO/debug/status`.
2. Deve retornar `status: ok` e informações do servidor. Se não responder, reinicie o serviço.

## Conferir pagamentos e envio de link

- Rode `npm run tokens:list` para listar todos os tokens gerados. Tokens com `usado = true` indicam que o pagamento foi confirmado e o link já foi enviado.
- Também é possível consultar diretamente a tabela `tokens` no banco PostgreSQL.

## Checar se um token já foi utilizado

Use o endpoint `GET /api/validar-token/<token>` ou execute `npm run tokens:list` para ver o campo `usado`.

## Acessar os logs

Os arquivos de log ficam na pasta `./logs`. Cada nível (info, error) possui seu próprio arquivo.

## Alterar valores dos planos

Edite o arquivo `MODELO1/BOT/config.js` na seção `planos`. Mude o valor em reais e reinicie o servidor para aplicar.

## Reiniciar um bot

Se estiver rodando localmente, pare o processo e execute `npm start` novamente. Na Render, utilize o botão **Restart** no painel do serviço.

## Adicionar um novo bot

1. Copie `MODELO1/BOT/bot1.js` e `config1.js` alterando os nomes (ex.: `bot3.js`, `config3.js`).
2. Ajuste o token Telegram no `.env` (por exemplo `TELEGRAM_TOKEN_BOT3`).
3. Edite `server.js` e carregue o novo bot adicionando `const bot3 = require('./MODELO1/BOT/bot3');` e `bots.set('bot3', instancia3);` no método `carregarBot`.
4. Reinicie o servidor.

## Testar o sistema

- Execute `npm start` e gere um pagamento de teste pelo bot.
- Após pagar, verifique se `obrigado.html` redireciona para o grupo correto.

Pronto! Estes são os passos básicos para acompanhar o funcionamento do sistema e ajudar clientes.
