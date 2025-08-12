# Configuração Google Sheets API

## Pré-requisitos

1. **Instalar dependência:**
   ```bash
   npm install googleapis
   ```

2. **Configurar Service Account no Google Cloud Console:**
   - Acesse [Google Cloud Console](https://console.cloud.google.com/)
   - Crie um projeto ou use o existente "rastreamento-funil"
   - Ative a Google Sheets API
   - Crie uma Service Account
   - Baixe o arquivo JSON de credenciais

## Configuração

### 1. Editar `services/googleSheets.js`

Substitua as credenciais vazias com os valores do arquivo JSON baixado:

```javascript
const CREDENTIALS = {
  "type": "service_account",
  "project_id": "rastreamento-funil",
  "private_key_id": "SEU_PRIVATE_KEY_ID_AQUI",
  "private_key": "-----BEGIN PRIVATE KEY-----\nSUA_CHAVE_PRIVADA_COMPLETA_AQUI\n-----END PRIVATE KEY-----",
  "client_email": "arthur@rastreamento-funil.iam.gserviceaccount.com",
  "client_id": "SEU_CLIENT_ID_AQUI",
  // ... resto das configurações
};
```

### 2. Compartilhar Planilha

- Abra a planilha: [FunilEventos](https://docs.google.com/spreadsheets/d/1SY_wan3SxwIs4Q58chDPp1HMmCCz4wEG3vIklv0QBXc)
- Compartilhe com: `arthur@rastreamento-funil.iam.gserviceaccount.com`
- Permissão: **Editor**

## Uso

### Função Principal

```javascript
const { logEvento } = require('./services/googleSheets');

// Logar evento simples
await logEvento('welcome');

// Logar compra com tipo de oferta
await logEvento('purchase', 'principal');
await logEvento('purchase', 'DS1');
await logEvento('purchase', 'MP1');
```

### Eventos Disponíveis

- **`welcome`** - Usuário entra no site
- **`cta_clicker`** - Clique em botão CTA
- **`bot1`** - Início do bot Telegram
- **`pix`** - PIX gerado
- **`purchase`** - Compra realizada (com tipo de oferta)

### Tipos de Oferta

- **`principal`** - Oferta principal
- **`DS1`** a **`DS12`** - Downsells
- **`MP1`** a **`MP...`** - Mensagens periódicas

## Estrutura da Planilha

| Coluna | Descrição | Exemplo |
|--------|-----------|---------|
| A | Data | 2024-01-15 |
| B | Evento | purchase |
| C | Quantidade | 1 |
| D | Oferta | principal |

## Teste

Execute o arquivo de exemplo:

```bash
node exemplo-uso-googleSheets.js
```

## Troubleshooting

### Erro de Autenticação
- Verifique se as credenciais estão preenchidas
- Confirme se a planilha foi compartilhada com o service account
- Verifique se a Google Sheets API está ativada

### Erro de Permissão
- Service Account deve ter permissão de **Editor** na planilha
- API Key só permite leitura (não pode logar eventos)

### Erro de Planilha
- Verifique se o SPREADSHEET_ID está correto
- Confirme se a planilha tem uma aba chamada "Sheet1"
- Verifique se as colunas A:D estão livres para escrita