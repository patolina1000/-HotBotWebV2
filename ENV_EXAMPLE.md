# Exemplo de Configuração de Ambiente (.env)

## Configuração do Sistema de Tracking de Cliques para Telegram

Copie este arquivo para `.env` e configure os valores:

```bash
# URLs dos bots do Telegram (sem @)
TELEGRAM_BOT1_USERNAME=vipshadrie_bot
TELEGRAM_BOT2_USERNAME=seu_bot2_username

# Outras configurações existentes
TELEGRAM_TOKEN=seu_token_bot1
TELEGRAM_TOKEN_BOT2=seu_token_bot2
BASE_URL=https://seudominio.com
PORT=3000

# URLs de envio (se aplicável)
URL_ENVIO_1=https://exemplo1.com
URL_ENVIO_2=https://exemplo2.com
URL_ENVIO_3=https://exemplo3.com

# Configuração do logger assíncrono
LOG_LEVEL=info
LOG_QUEUE_MAX=1000
LOG_RETRY_MAX=5
LOG_CIRCUIT_COOLDOWN_MS=10000
LOG_HTTP_TIMEOUT_MS=1500
LOG_FLUSH_TIMEOUT_MS=3000
LOG_ASYNC_ENABLED=true
```

## Configuração do Banco de Dados

```ini
APP_ENV=production
DATABASE_URL=postgresql://user:pass@host:5432/dbname
# DB_EXPECTED_ENV=prod # opcional: se informado, valida se DATABASE_URL contém esse valor
DB_SSL=true
DB_POOL_MIN=2
DB_POOL_MAX=10
DB_CONN_TIMEOUT_MS=5000
```

> **Importante:** Não existe fallback. A aplicação não sobe sem `DATABASE_URL`.

## Variáveis Obrigatórias para o Novo Sistema

### `TELEGRAM_BOT1_USERNAME`
- Username do bot1 no Telegram (sem @)
- Exemplo: `vipshadrie_bot`
- Padrão: `vipshadrie_bot`

### `TELEGRAM_BOT2_USERNAME`
- Username do bot2 no Telegram (sem @)
- Exemplo: `meu_bot2`
- Padrão: `vipshadrie_bot` (usa bot1 como fallback)

## Como Configurar

1. **Copie o arquivo:**
   ```bash
   cp ENV_EXAMPLE.md .env
   ```

2. **Edite o arquivo .env:**
   ```bash
   nano .env
   # ou
   code .env
   ```

3. **Configure os valores:**
   - Substitua `vipshadrie_bot` pelo username real do seu bot1
   - Substitua `seu_bot2_username` pelo username real do seu bot2
   - Mantenha as outras configurações existentes

4. **Reinicie o servidor:**
   ```bash
   npm restart
   # ou
   node server.js
   ```

## Verificação

Após configurar, teste o sistema:

```bash
node teste-telegram-tracking.js
```

O sistema deve funcionar corretamente e redirecionar para os bots configurados.
