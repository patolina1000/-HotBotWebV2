# 🚀 Google Sheets Tracker - Sistema de Rastreamento de Eventos

Sistema Node.js para registrar eventos do funil de vendas diretamente no Google Sheets, com contagem diária de eventos.

## 📊 Funcionalidades

- **Registro automático de eventos** com data e contagem
- **5 abas separadas** para cada tipo de evento
- **Contagem diária** (não duplica linhas do mesmo dia)
- **Endpoint específico para compras** com identificação de oferta
- **API REST simples** e fácil de integrar

## 🎯 Eventos Suportados

| Evento | Aba | Descrição |
|--------|-----|-----------|
| `welcome` | Welcome | Usuário entrou no site |
| `cta_click` | CTA_Click | Clique no botão de chamada |
| `botstart` | BotStart | Usuário deu /start no bot |
| `pixgerado` | PixGerado | Usuário gerou uma cobrança |
| `purchase` | Purchase | Pagamento realizado (com oferta) |

## 🛠️ Instalação

### 1. Clonar/baixar os arquivos
```bash
# Os arquivos necessários são:
# - google-sheets-tracker.js
# - service-account-key.json
# - package-sheets-tracker.json
```

### 2. Instalar dependências
```bash
# Copiar o package.json para package.json
cp package-sheets-tracker.json package.json

# Instalar dependências
npm install
```

### 3. Configurar autenticação Google Sheets

**IMPORTANTE:** Você precisa substituir o arquivo `service-account-key.json` com suas credenciais reais.

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um projeto ou selecione o existente
3. Ative a Google Sheets API
4. Crie uma conta de serviço
5. Baixe a chave JSON da conta de serviço
6. Substitua o arquivo `service-account-key.json` com o conteúdo real

### 4. Compartilhar a planilha
- Abra sua planilha do Google Sheets
- Clique em "Compartilhar"
- Adicione o email da conta de serviço: `arthur@rastreamento-funil.iam.gserviceaccount.com`
- Dê permissão de "Editor"

## 🚀 Como Executar

### Execução local
```bash
# Iniciar o servidor
npm start

# Ou em modo desenvolvimento (com auto-reload)
npm run dev
```

O servidor estará rodando em `http://localhost:3001`

### Variáveis de ambiente (opcional)
```bash
# Para mudar a porta
export PORT=3002
npm start
```

## 📡 Endpoints da API

### 1. Registrar Evento Simples
```http
POST /registrar-evento
Content-Type: application/json

{
  "evento": "welcome"
}
```

**Eventos válidos:** `welcome`, `cta_click`, `botstart`, `pixgerado`

**Resposta:**
```json
{
  "success": true,
  "message": "Evento welcome registrado com sucesso"
}
```

### 2. Registrar Compra
```http
POST /registrar-purchase
Content-Type: application/json

{
  "oferta": "DS3"
}
```

**Resposta:**
```json
{
  "success": true,
  "message": "Purchase registrado com sucesso para oferta: DS3"
}
```

### 3. Status do Sistema
```http
GET /status
```

**Resposta:**
```json
{
  "status": "online",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "endpoints": [
    "POST /registrar-evento",
    "POST /registrar-purchase",
    "GET /status"
  ]
}
```

### 4. Ajuda
```http
GET /
```

## 🧪 Testando com Postman

### 1. Testar endpoint de evento
- **Método:** POST
- **URL:** `http://localhost:3001/registrar-evento`
- **Headers:** `Content-Type: application/json`
- **Body (raw JSON):**
```json
{
  "evento": "cta_click"
}
```

### 2. Testar endpoint de compra
- **Método:** POST
- **URL:** `http://localhost:3001/registrar-purchase`
- **Headers:** `Content-Type: application/json`
- **Body (raw JSON):**
```json
{
  "oferta": "Principal"
}
```

## 🧪 Testando com cURL

### 1. Registrar evento
```bash
curl -X POST http://localhost:3001/registrar-evento \
  -H "Content-Type: application/json" \
  -d '{"evento": "welcome"}'
```

### 2. Registrar compra
```bash
curl -X POST http://localhost:3001/registrar-purchase \
  -H "Content-Type: application/json" \
  -d '{"oferta": "DS1"}'
```

### 3. Verificar status
```bash
curl http://localhost:3001/status
```

## 📊 Estrutura da Planilha

### Aba Welcome
| Data | Quantidade |
|------|------------|
| 15/01/2024 | 25 |
| 16/01/2024 | 18 |

### Aba CTA_Click
| Data | Quantidade |
|------|------------|
| 15/01/2024 | 12 |
| 16/01/2024 | 8 |

### Aba Purchase
| Data | Quantidade | Oferta |
|------|------------|--------|
| 15/01/2024 | 1 | Principal |
| 15/01/2024 | 1 | DS3 |
| 16/01/2024 | 1 | DS1 |

## 🔧 Configurações Avançadas

### Mudar porta do servidor
```javascript
// No arquivo google-sheets-tracker.js
const PORT = process.env.PORT || 3001; // Mude para a porta desejada
```

### Mudar ID da planilha
```javascript
// No arquivo google-sheets-tracker.js
const SPREADSHEET_ID = 'SEU_NOVO_ID_AQUI';
```

### Mudar formato de data
```javascript
// No arquivo google-sheets-tracker.js
function getDataAtual() {
  const hoje = new Date();
  // Formato brasileiro (DD/MM/AAAA)
  return hoje.toLocaleDateString('pt-BR');
  
  // Ou formato ISO (AAAA-MM-DD)
  // return hoje.toISOString().split('T')[0];
}
```

## 🚨 Solução de Problemas

### Erro de autenticação
- Verifique se o arquivo `service-account-key.json` está correto
- Confirme se a conta de serviço tem acesso à planilha
- Verifique se a Google Sheets API está ativada

### Erro de permissão
- Confirme se a planilha foi compartilhada com a conta de serviço
- Verifique se a conta de serviço tem permissão de "Editor"

### Erro de porta em uso
```bash
# Verificar portas em uso
lsof -i :3001

# Matar processo usando a porta
kill -9 <PID>
```

## 📱 Integração com Frontend

### JavaScript (fetch)
```javascript
// Registrar evento
async function registrarEvento(evento) {
  try {
    const response = await fetch('http://localhost:3001/registrar-evento', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ evento })
    });
    
    const resultado = await response.json();
    console.log('Evento registrado:', resultado);
  } catch (error) {
    console.error('Erro:', error);
  }
}

// Usar
registrarEvento('welcome');
```

### HTML com tracking automático
```html
<!DOCTYPE html>
<html>
<head>
    <title>Página de Vendas</title>
</head>
<body>
    <h1>Bem-vindo!</h1>
    <button onclick="registrarEvento('cta_click')">Clique Aqui</button>
    
    <script>
        // Registrar entrada automática
        window.addEventListener('load', () => {
            registrarEvento('welcome');
        });
        
        async function registrarEvento(evento) {
            try {
                await fetch('http://localhost:3001/registrar-evento', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ evento })
                });
            } catch (error) {
                console.error('Erro ao registrar evento:', error);
            }
        }
    </script>
</body>
</html>
```

## 🔒 Segurança

- **Não exponha** o arquivo `service-account-key.json` publicamente
- Use **HTTPS** em produção
- Considere implementar **rate limiting** para endpoints públicos
- Monitore o uso da API para detectar abusos

## 📈 Monitoramento

### Logs do servidor
O servidor registra todas as operações no console:
```
🚀 Google Sheets Tracker rodando na porta 3001
📊 Planilha: 1SY_wan3SxwIs4Q58chDPp1HMmCCz4wEG3vIklv0QBXc
🔗 Endpoints disponíveis:
   POST http://localhost:3001/registrar-evento
   POST http://localhost:3001/registrar-purchase
   GET  http://localhost:3001/status
```

### Verificar planilha
- Acesse sua planilha do Google Sheets
- Verifique se as abas estão sendo atualizadas
- Confirme se as datas e quantidades estão corretas

## 🚀 Deploy em Produção

### 1. Servidor Linux
```bash
# Instalar PM2 para gerenciar processos
npm install -g pm2

# Iniciar aplicação
pm2 start google-sheets-tracker.js --name "sheets-tracker"

# Configurar para iniciar com o sistema
pm2 startup
pm2 save
```

### 2. Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

### 3. Variáveis de ambiente em produção
```bash
# .env
PORT=3001
SPREADSHEET_ID=1SY_wan3SxwIs4Q58chDPp1HMmCCz4wEG3vIklv0QBXc
```

## 📞 Suporte

Para dúvidas ou problemas:
1. Verifique os logs do servidor
2. Confirme as configurações de autenticação
3. Teste os endpoints com Postman/cURL
4. Verifique as permissões da planilha

---

**🎯 Sistema pronto para rastrear seu funil de vendas!**