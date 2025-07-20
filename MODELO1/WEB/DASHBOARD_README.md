# 📊 Dashboard de Eventos - SiteHot

## Descrição

Painel web para visualizar os eventos de rastreamento (Purchase, AddToCart, InitiateCheckout) coletados pelo sistema de forma simples e intuitiva.

## Acesso

**URL:** `/dashboard.html`

### Autenticação

O painel utiliza autenticação por token. Configure a variável de ambiente:

```bash
PANEL_ACCESS_TOKEN=seu_token_seguro_aqui
```

**Token padrão:** `admin123` (recomenda-se alterar em produção)

## Funcionalidades

### 📈 Gráficos e Visualizações

- **Faturamento Diário**: Gráfico de linha mostrando vendas e faturamento por dia
- **Distribuição por UTM Source**: Gráfico de pizza com origem dos eventos
- **Estatísticas Gerais**: Cards com métricas importantes

### 🔍 Filtros Disponíveis

- **Tipo de Evento**: Purchase, AddToCart, InitiateCheckout
- **Período**: Data inicial e final
- **Campanha**: Filtro por utm_campaign específica

### 📊 Estatísticas Exibidas

- **Faturamento Total**: Soma de todas as vendas (Purchase)
- **Vendas (Purchase)**: Número total de conversões
- **Add to Cart**: Eventos de adição ao carrinho
- **Initiate Checkout**: Eventos de início de checkout
- **Total de Eventos**: Soma de todos os tipos de eventos
- **Fontes UTM Únicas**: Quantidade de fontes diferentes

### 📋 Tabela de Eventos

Exibe eventos recentes com as seguintes informações:

- Data/Hora do evento
- Tipo de evento (Purchase, AddToCart, InitiateCheckout)
- Valor (apenas para Purchase)
- Token identificador
- UTM Source, Medium e Campaign
- Telegram ID (quando disponível)
- Status de envio (Pixel, CAPI, Cron)

## Endpoints da API

### GET `/api/eventos`

Retorna lista de eventos com filtros.

**Parâmetros:**
- `token` (obrigatório): Token de autenticação
- `evento`: Filtro por tipo (Purchase, AddToCart, InitiateCheckout)
- `inicio`: Data inicial (YYYY-MM-DD)
- `fim`: Data final (YYYY-MM-DD)
- `utm_campaign`: Filtro por campanha
- `limit`: Limite de resultados (padrão: 100)
- `offset`: Offset para paginação (padrão: 0)

**Exemplo:**
```
GET /api/eventos?token=admin123&evento=Purchase&inicio=2025-01-15&fim=2025-01-20
```

### GET `/api/dashboard-data`

Retorna dados para os gráficos do dashboard.

**Parâmetros:**
- `token` (obrigatório): Token de autenticação
- `inicio`: Data inicial (padrão: últimos 30 dias)
- `fim`: Data final (padrão: hoje)

## Segurança

- ✅ Autenticação por token
- ✅ Apenas leitura (não altera eventos)
- ✅ CORS configurado
- ✅ Rate limiting aplicado
- ✅ Meta robots noindex/nofollow

## Tecnologias Utilizadas

- **Backend**: Node.js + Express + PostgreSQL
- **Frontend**: HTML5 + CSS3 + JavaScript (ES6+)
- **Gráficos**: Chart.js 4.x
- **Responsivo**: CSS Grid + Flexbox

## Layout Responsivo

O painel se adapta automaticamente a diferentes tamanhos de tela:

- **Desktop**: Layout em grid com gráficos lado a lado
- **Mobile**: Layout em coluna única
- **Tablet**: Layout intermediário

## Performance

- Carregamento paralelo de dados
- Cache no localStorage para token
- Otimização de queries SQL
- Gráficos renderizados sob demanda

## Monitoramento

O painel permite visualizar rapidamente:

- 🎯 **Origem do tráfego**: Quais UTM sources geram mais eventos
- 💰 **Performance financeira**: Faturamento diário e tendências
- 🔄 **Funil de conversão**: AddToCart → InitiateCheckout → Purchase
- 📱 **Campanhas efetivas**: Quais campanhas geram mais resultados

---

**Nota**: O painel é read-only e não afeta o funcionamento dos bots ou sistema de rastreamento.