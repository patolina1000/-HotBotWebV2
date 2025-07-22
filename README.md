# 🚀 SiteHot - Sistema de Rastreamento e Analytics

Sistema completo de rastreamento de eventos com Bot Telegram + Backend Web integrado ao PostgreSQL, com foco em consistência de dados e performance.

## 📋 Visão Geral

Este projeto oferece uma solução robusta para rastreamento de eventos de marketing digital, integrando:
- **Bot Telegram** para interação com usuários
- **Backend Express.js** com APIs REST
- **PostgreSQL** para persistência de dados
- **Dashboard Web** para visualização de métricas
- **Integração Facebook Pixel/CAPI** para marketing

## ⚡ Instalação e Configuração

### Pré-requisitos
- Node.js 18+
- PostgreSQL 13+
- Token Bot Telegram

### Instalação
```bash
# 1. Clone o repositório
git clone [repo-url]
cd sitehot

# 2. Instale dependências
npm install

# 3. Configure variáveis de ambiente
cp .env.example .env
# Edite o .env com suas configurações

# 4. Execute migrações do banco
npm run migrate

# 5. Inicie o servidor
npm start
```

### Variáveis de Ambiente Principais
```env
# Banco de dados
POSTGRES_URL=postgresql://user:pass@localhost:5432/sitehot

# Autenticação
PANEL_ACCESS_TOKEN=admin123

# Bot Telegram
BOT_TOKEN=seu_token_aqui

# Facebook API
ACCESS_TOKEN=seu_token_facebook
PIXEL_ID=seu_pixel_id
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
      "data_evento": "2025-01-15T10:30:00.000Z",
      "tipo_evento": "Purchase",
      "valor": 97.00,
      "token": "abc123def456",
      "utm_source": "facebook",
      "utm_medium": "cpc",
      "utm_campaign": "black_friday",
      "telegram_id": "7205343917",
      "status_envio": "enviado",
      "source_table": "tokens"
    }
  ],
  "estatisticas": {
    "total_eventos": 150,
    "total_purchases": 45,
    "total_addtocart": 65,
    "total_initiatecheckout": 40,
    "faturamento_total": 4365.00,
    "fontes_unicas": 5
  },
  "metadata": {
    "request_id": "a1b2c3d4",
    "timestamp": "2025-01-15T10:30:00.000Z",
    "total_found": 150,
    "filters_applied": {
      "evento": null,
      "inicio": "2025-01-10",
      "fim": "2025-01-15",
      "utm_campaign": null
    },
    "database_status": "connected"
  }
}
```

#### Exemplo de Requisição:
```bash
curl -X GET "http://localhost:3000/api/eventos?token=admin123&evento=Purchase&inicio=2025-01-10&fim=2025-01-15&limit=50"
```

### `GET /api/dashboard-data`

Endpoint para dados dos gráficos do dashboard.

#### Parâmetros de Query:
- `token` - Token de autenticação (obrigatório)
- `inicio` - Data inicial (formato: YYYY-MM-DD)
- `fim` - Data final (formato: YYYY-MM-DD)

#### Exemplo de Resposta:
```json
{
  "faturamentoDiario": [
    {
      "data": "2025-01-15",
      "faturamento": 1250.00,
      "vendas": 15,
      "addtocart": 25,
      "initiatecheckout": 20
    }
  ],
  "utmSource": [
    {
      "utm_source": "facebook",
      "vendas": 12,
      "addtocart": 18,
      "initiatecheckout": 15,
      "total_eventos": 45
    }
  ],
  "campanhas": [
    {
      "campanha": "black_friday",
      "vendas": 8,
      "addtocart": 12,
      "initiatecheckout": 10,
      "faturamento": 876.00,
      "total_eventos": 30
    }
  ],
  "metadata": {
    "request_id": "x1y2z3w4",
    "executionTime": 245,
    "timestamp": "2025-01-15T10:30:00.000Z",
    "database_status": "connected"
  }
}
```

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
);
```

### Tabela `tracking_data`
```sql
CREATE TABLE tracking_data (
  telegram_id BIGINT PRIMARY KEY,      -- Formato numérico limpo
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Tabela `payloads`
```sql
CREATE TABLE payloads (
  payload_id TEXT PRIMARY KEY,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 📊 Dashboard Web

O sistema inclui um dashboard web que consome os dados do endpoint `/api/eventos` com as seguintes funcionalidades:

### Funcionalidades Principais:
- **Gráfico de Faturamento Diário** - Mostra vendas e faturamento ao longo do tempo
- **Gráfico de UTM Source** - Distribuição de eventos por fonte de tráfego
- **Tabela de Eventos** - Lista detalhada de todos os eventos rastreados
- **Filtros Avançados** - Por data, tipo de evento, campanha

### Acesso:
```
http://localhost:3000/dashboard
```

### Autenticação:
- Token de acesso: `admin123` (configurável via `PANEL_ACCESS_TOKEN`)

## 🔧 Funcionalidades Principais

### ✅ Rastreamento Seguro
- Casting seguro de `telegram_id` com tratamento de valores float
- Tratamento adequado de valores `NULL` sem fallbacks artificiais
- JOINs seguros entre tabelas com diferentes tipos de dados

### ✅ Campos Padronizados
- `data_evento` - Data do evento (padronizada)
- `tipo_evento` - Tipo do evento (`Purchase`, `AddToCart`, `InitiateCheckout`)
- `valor` - Valor da transação (quando aplicável)
- `token` - Token único da transação
- `utm_source`, `utm_medium`, `utm_campaign` - Dados de UTM (podem ser NULL)
- `telegram_id` - ID do usuário Telegram (string segura)
- `status_envio` - Status do envio (`enviado` ou `pendente`)
- `source_table` - Tabela de origem dos dados

### ✅ Integração Facebook
- Envio automático via Pixel e CAPI
- Fallback inteligente em caso de falha
- Retry automático para eventos não enviados

## 🐛 Troubleshooting

### Problemas Comuns

1. **Erro de Conexão com Banco**
   ```
   Solução: Verificar POSTGRES_URL no .env
   ```

2. **Token Inválido**
   ```
   Solução: Verificar PANEL_ACCESS_TOKEN no .env
   ```

3. **Dashboard não carrega dados**
   ```
   Solução: Verificar logs do servidor para erros de query
   ```

4. **Datas inválidas no frontend**
   ```
   Solução: Verificar se o backend retorna data_evento corretamente
   ```

## 📝 Logs e Monitoramento

O sistema possui logging detalhado em todas as operações:

- **Request IDs únicos** para rastreamento de requisições
- **Timestamps precisos** em todas as operações
- **Logs de performance** para queries do banco
- **Logs de erro detalhados** com stack traces

Exemplo de log:
```
📡 [a1b2c3d4] Iniciando busca de eventos - 2025-01-15T10:30:00.000Z
🔍 [a1b2c3d4] Filtros aplicados: { evento: 'Purchase', inicio: '2025-01-10', fim: '2025-01-15' }
✅ [a1b2c3d4] Query executada com sucesso - 150 eventos encontrados
```

## 🎯 Integrações

### UTMify
Rastreamento preciso de conversões com envio automático de ordens manuais quando pagamentos são aprovados.

**Recursos:**
- ✅ Envio automático para UTMify quando status = "pago"
- ✅ Recuperação de UTMs do banco de dados
- ✅ Sistema de retry com 3 tentativas
- ✅ Logs detalhados para monitoramento
- ✅ Tratamento robusto de erros

**Configuração:**
```env
UTMIFY_API_TOKEN=seu_token_utmify
```

**Teste:**
```bash
npm run test:utmify
```

📖 **[Guia Completo de Integração UTMify](./UTMIFY_INTEGRATION_GUIDE.md)**

## 🚀 Deploy em Produção

### Checklist Pré-Deploy:
- [ ] Variáveis de ambiente configuradas
- [ ] Banco de dados criado e migrado
- [ ] Tokens de API validados
- [ ] Token UTMify configurado (se usado)
- [ ] HTTPS configurado
- [ ] Backup do banco configurado
- [ ] Monitoramento ativo

### Considerações de Segurança:
- Token de acesso forte (mínimo 32 caracteres)
- HTTPS obrigatório em produção
- Rate limiting configurado
- Logs de acesso habilitados

## 📄 Licença

MIT License - Veja LICENSE.md para detalhes.

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -am 'Add nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request
