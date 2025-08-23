# Variáveis de Ambiente Necessárias

## Configurações do Banco de Dados
```bash
DATABASE_URL=postgresql://usuario:senha@localhost:5432/nome_banco
```

## Configurações do Telegram
```bash
TELEGRAM_TOKEN=SEU_TOKEN_BOT1_AQUI
TELEGRAM_TOKEN_BOT2=SEU_TOKEN_BOT2_AQUI
TELEGRAM_TOKEN_BOT3=SEU_TOKEN_BOT3_AQUI
TELEGRAM_TOKEN_ESPECIAL=SEU_TOKEN_BOT_ESPECIAL_AQUI
```

## URLs
```bash
BASE_URL=https://seudominio.com
FRONTEND_URL=https://seudominio.com
```

## URLs de Envio
```bash
URL_ENVIO_1=https://seudominio.com/enviar1
URL_ENVIO_2=https://seudominio.com/enviar2
URL_ENVIO_3=https://seudominio.com/enviar3
```

## Configurações do Google Sheets
```bash
SPREADSHEET_ID=SEU_SPREADSHEET_ID_AQUI
```

## Configurações do Facebook
```bash
FB_PIXEL_ID=SEU_FB_PIXEL_ID_AQUI
FB_TEST_EVENT_CODE=SEU_TEST_EVENT_CODE_AQUI
```

## Configurações de Segurança
```bash
WEBHOOK_SECRET=SEU_WEBHOOK_SECRET_AQUI
PANEL_ACCESS_TOKEN=SEU_PANEL_ACCESS_TOKEN_AQUI
```

## Configurações do PushInPay
```bash
PUSHINPAY_TOKEN=SEU_PUSHINPAY_TOKEN_AQUI
```

## Ambiente
```bash
NODE_ENV=production
PORT=3000
```

## Como Configurar

1. Crie um arquivo `.env` no diretório raiz do projeto
2. Copie as variáveis acima para o arquivo `.env`
3. Substitua os valores `SEU_*_AQUI` pelos valores reais das suas configurações
4. **IMPORTANTE**: Adicione a nova variável `TELEGRAM_TOKEN_ESPECIAL` com o token do seu bot especial

## Exemplo de Arquivo .env
```bash
# Configurações do Banco de Dados
DATABASE_URL=postgresql://hotbot_user:password@localhost:5432/hotbot_db

# Configurações do Telegram
TELEGRAM_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_TOKEN_BOT2=0987654321:ZYXwvuTSRqpoNMLkjIHGfedCBA
TELEGRAM_TOKEN_BOT3=1122334455:ABCDefghIJKLmnopQRSTuvwx
TELEGRAM_TOKEN_ESPECIAL=5566778899:EFGHijklMNOPqrstUVWXyzab

# URLs
BASE_URL=https://meubot.com
FRONTEND_URL=https://meubot.com

# URLs de Envio
URL_ENVIO_1=https://meubot.com/enviar1
URL_ENVIO_2=https://meubot.com/enviar2
URL_ENVIO_3=https://meubot.com/enviar3

# Configurações do Google Sheets
SPREADSHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms

# Configurações do Facebook
FB_PIXEL_ID=123456789012345
FB_TEST_EVENT_CODE=TEST12345

# Configurações de Segurança
WEBHOOK_SECRET=meu_secret_super_seguro
PANEL_ACCESS_TOKEN=admin123

# Configurações do PushInPay
PUSHINPAY_TOKEN=pushinpay_token_aqui

# Ambiente
NODE_ENV=production
PORT=3000
```

## Nota sobre o Bot Especial

O bot especial foi configurado com:
- **Arquivo de lógica**: `MODELO1/BOT/bot_especial.js`
- **Arquivo de configuração**: `MODELO1/BOT/config_especial.js`
- **Token**: `TELEGRAM_TOKEN_ESPECIAL`
- **ID do bot**: `bot_especial`

Certifique-se de configurar o `TELEGRAM_TOKEN_ESPECIAL` no seu arquivo `.env` para que o bot especial funcione corretamente.
