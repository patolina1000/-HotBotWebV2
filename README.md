# 🚀 SiteHot - Sistema de Rastreamento e Analytics

Sistema completo de rastreamento de eventos com Bot Telegram + Backend Web integrado ao PostgreSQL, com foco em consistência de dados e performance.

## 📋 Visão Geral

Este projeto oferece uma solução robusta para rastreamento de eventos de marketing digital, integrando:
- **Bot Telegram** para interação com usuários
- **Backend Express.js** com APIs REST
- **PostgreSQL** para persistência de dados
- **Dashboard Web** para visualização de métricas
- **Integração Facebook Pixel/CAPI** para marketing

## ✅ Principais Correções Implementadas

### 🔧 Problemas Resolvidos

1. **Casting Seguro de `telegram_id`**
   - ✅ Conversão segura de valores float (`"7205343917.0"`) para `bigint`
   - ✅ Tratamento de valores `NULL` sem erros de casting
   - ✅ Validação de formato antes da conversão

2. **Eliminação de Fallbacks Hardcoded**
   - ❌ Removido: `'desconhecido'`, `'none'`, `'sem_campanha'`
   - ✅ Implementado: Retorno de `null` quando dados não disponíveis
   - ✅ Frontend recebe valores apropriados para renderização

3. **Padronização de `data_evento`**
   - ✅ Fallback inteligente: `t.criado_em` → `td.created_at` → `NOW()`
   - ✅ Garantia de sempre retornar data válida
   - ✅ Compatibilidade com dados antigos

4. **Consistência de Campos**
   - ✅ `tipo_evento` padronizado em todas as queries
   - ✅ Campos UTM tratados sem valores literais desnecessários
   - ✅ Estrutura consistente entre endpoints

## 🗄️ Estrutura do Banco de Dados

### Tabela `tokens`
```sql
CREATE TABLE tokens (
  id_transacao TEXT PRIMARY KEY,
  token TEXT UNIQUE,
  telegram_id TEXT,                    -- Suporta formato "7205343917.0"
  valor NUMERIC,
  criado_em TIMESTAMP DEFAULT NOW(),
  utm_source TEXT,                     -- Pode ser NULL
  utm_medium TEXT,                     -- Pode ser NULL  
  utm_campaign TEXT,                   -- Pode ser NULL
  pixel_sent BOOLEAN DEFAULT FALSE,
  capi_sent BOOLEAN DEFAULT FALSE,
  cron_sent BOOLEAN DEFAULT FALSE
  -- ... outros campos
);
```

### Tabela `tracking_data`
```sql
CREATE TABLE tracking_data (
  telegram_id BIGINT PRIMARY KEY,      -- Formato numérico limpo
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  -- ... outros campos
);
```

### Tabela `payloads`
```sql
CREATE TABLE payloads (
  payload_id TEXT PRIMARY KEY,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  -- ... outros campos
);
```

## 🔗 API Endpoints

### `GET /api/eventos`

Endpoint principal para buscar eventos de rastreamento com tratamento seguro de dados.

#### Parâmetros de Query:
- `token` - Token de autenticação (obrigatório)
- `evento` - Filtro por tipo: `Purchase`, `AddToCart`, `InitiateCheckout`
- `inicio` - Data inicial (formato: YYYY-MM-DD)
- `fim` - Data final (formato: YYYY-MM-DD)
- `utm_campaign` - Filtro por campanha específica
- `limit` - Limite de resultados (padrão: 100)
- `offset` - Offset para paginação (padrão: 0)

#### Exemplo de Resposta:
```json
{
  "eventos": [
    {
      "data_evento": "2024-01-15T10:30:00.000Z",
      "tipo_evento": "Purchase",
      "valor": 150.00,
      "token": "abc123def456",
      "utm_source": "facebook",
      "utm_medium": "cpc",
      "utm_campaign": "summer_sale",
      "telegram_id": "7205343917",
      "status_envio": "enviado",
      "source_table": "tokens"
    }
  ],
  "estatisticas": {
    "total_eventos": 1250,
    "total_purchases": 856,
    "total_addtocart": 234,
    "total_initiatecheckout": 160,
    "faturamento_total": 125600.50,
    "fontes_unicas": 8
  },
  "metadata": {
    "request_id": "a1b2c3d4",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "total_found": 1,
    "database_status": "connected"
  }
}
```

## 🔧 Configuração e Instalação

### Pré-requisitos
- Node.js 20.x
- PostgreSQL 13+
- Tokens do Telegram Bot
- Credenciais do Facebook (opcional)

### Variáveis de Ambiente
```bash
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# Telegram
TELEGRAM_TOKEN=your_bot_token_here
TELEGRAM_TOKEN_BOT2=your_second_bot_token

# Server
BASE_URL=https://your-domain.com
PORT=3000
PANEL_ACCESS_TOKEN=your_admin_token

# URLs de envio (opcional)
URL_ENVIO_1=https://webhook1.com
URL_ENVIO_2=https://webhook2.com
URL_ENVIO_3=https://webhook3.com

# Facebook (opcional)
FACEBOOK_ACCESS_TOKEN=your_facebook_token
FACEBOOK_PIXEL_ID=your_pixel_id
```

### Instalação
```bash
# Clone o repositório
git clone <repository-url>
cd sitehot

# Instale dependências
npm install

# Configure variáveis de ambiente
cp .env.example .env
# Edite .env com suas configurações

# Execute testes de validação
node test-eventos-endpoint.js

# Inicie o servidor
npm start
```

## 🧪 Testes e Validação

### Teste do Endpoint de Eventos
```bash
# Executa validações do parsing de telegram_id
node test-eventos-endpoint.js
```

### Teste de Conexão do Banco
```bash
# Testa conectividade e estrutura das tabelas
npm test
```

### Teste Manual da API
```bash
# Teste básico do endpoint
curl -X GET "http://localhost:3000/api/eventos?token=admin123&limit=5"
```

## 🔍 Lógica de Tratamento de Dados

### Parsing Seguro de `telegram_id`

```sql
-- Conversão segura que trata valores como "7205343917.0"
CASE 
  WHEN telegram_id IS NULL THEN NULL
  WHEN telegram_id::text ~ '^[0-9]+(\\.0+)?$' THEN 
    SPLIT_PART(telegram_id::text, '.', 1)
  ELSE telegram_id::text
END
```

### Fallback de Datas

```sql
-- Prioridade: criado_em > created_at > NOW()
COALESCE(t.criado_em, td.created_at, NOW()) as data_evento
```

### Campos UTM

```sql
-- Preserva NULL em vez de usar valores hardcoded
COALESCE(t.utm_source, td.utm_source, p.utm_source) as utm_source
-- Resultado: valor real ou NULL (nunca 'desconhecido')
```

## 📊 Dashboard e Visualização

O sistema inclui um dashboard web que consome os dados do endpoint `/api/eventos` com as seguintes funcionalidades:

- **Métricas em Tempo Real**: Eventos, faturamento, conversões
- **Filtros Avançados**: Por data, campanha, tipo de evento
- **Gráficos Interativos**: Evolução temporal dos eventos
- **Análise de Fontes**: Performance por utm_source

## 🚀 Deploy e Produção

### Render.com
```yaml
# render.yaml
services:
  - type: web
    name: sitehot
    env: node
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
```

### Docker (Opcional)
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 🔒 Segurança

- **Autenticação por Token**: Todas as APIs protegidas
- **Rate Limiting**: Proteção contra spam
- **Sanitização de Inputs**: Validação de parâmetros
- **SQL Injection Protection**: Queries parametrizadas
- **CORS Configurado**: Acesso controlado

## 📈 Performance

- **Connection Pooling**: Pool otimizado do PostgreSQL
- **Query Optimization**: Índices e consultas eficientes
- **Caching**: Cache de consultas frequentes
- **Compression**: Compressão gzip habilitada

## 🔄 Monitoramento

### Health Check
```bash
curl http://localhost:3000/health
# Resposta: "OK"
```

### Logs Estruturados
- Todas as operações são logadas com request IDs
- Erros incluem stack traces em desenvolvimento
- Métricas de performance registradas

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

## 📄 Licença

ISC License - veja o arquivo LICENSE para detalhes.

## 🆘 Suporte

Para problemas ou dúvidas:
1. Verifique os logs do servidor
2. Execute os testes de validação
3. Consulte a documentação da API
4. Abra uma issue no repositório

---

**Status do Projeto**: ✅ Produção - Estável e Testado

**Última Atualização**: Janeiro 2024

**Versão**: 1.0.0
