# Serviço de Eventos do Funil - HotBot Web V2

## Visão Geral

O serviço de eventos do funil (`FunnelEventsService`) é uma camada de dados robusta para registrar e consultar eventos do funil de vendas com alta confiabilidade e timezone configurado para America/Recife.

## Características

- ✅ **Alta Confiabilidade**: Validação rigorosa de dados antes da persistência
- ✅ **Timezone Configurado**: America/Recife para todas as operações de data/hora
- ✅ **Índices Otimizados**: Performance otimizada para consultas frequentes
- ✅ **Validações**: Verificação automática de integridade dos dados
- ✅ **JSONB**: Suporte a metadados flexíveis
- ✅ **Singleton Pattern**: Instância única para toda a aplicação

## Estrutura da Tabela

### Tabela: `funnel_events`

| Coluna | Tipo | Descrição | Restrições |
|--------|------|-----------|------------|
| `id` | SERIAL | ID único do evento | PRIMARY KEY |
| `occurred_at` | TIMESTAMPTZ | Timestamp do evento | DEFAULT NOW() |
| `event_name` | TEXT | Nome do evento | NOT NULL |
| `bot` | TEXT | ID do bot | Opcional |
| `telegram_id` | TEXT | ID do usuário no Telegram | Opcional |
| `payload_id` | TEXT | ID do payload relacionado | Opcional |
| `session_id` | TEXT | ID da sessão do usuário | Opcional |
| `offer_tier` | TEXT | Nível da oferta | Opcional |
| `price_cents` | INTEGER | Preço em centavos | >= 0 quando presente |
| `transaction_id` | TEXT | ID da transação | Opcional |
| `meta` | JSONB | Metadados adicionais | DEFAULT '{}' |

### Índices Criados

- `idx_funnel_events_event_name_occurred_at` - (event_name, occurred_at)
- `idx_funnel_events_bot_occurred_at` - (bot, occurred_at)
- `idx_funnel_events_telegram_id` - (telegram_id)
- `idx_funnel_events_payload_id` - (payload_id)
- `idx_funnel_events_transaction_id` - (transaction_id)
- `idx_funnel_events_offer_tier` - (offer_tier)

## Uso Básico

### 1. Inicialização

```javascript
const { getInstance: getFunnelEventsInstance } = require('./services/funnelEvents');

// Obter instância singleton
const funnelEventsService = getFunnelEventsInstance();

// Inicializar com pool de conexão
funnelEventsService.initialize(pool);
```

### 2. Registrar Evento

```javascript
const resultado = await funnelEventsService.logEvent({
  event_name: 'page_view',
  bot: 'bot1',
  telegram_id: '123456789',
  payload_id: 'payload_001',
  session_id: 'session_001',
  offer_tier: 'premium',
  price_cents: 9900,
  transaction_id: 'tx_001',
  meta: { 
    source: 'telegram', 
    campaign: 'test',
    user_agent: 'Mozilla/5.0...'
  }
});

if (resultado.success) {
  console.log('Evento registrado:', resultado.event_id);
  console.log('Timestamp:', resultado.formatted_time);
}
```

### 3. Consultar Eventos

```javascript
// Buscar eventos de um usuário específico
const eventos = await funnelEventsService.queryEvents({
  telegram_id: '123456789',
  limit: 10,
  offset: 0
});

// Buscar eventos por tipo
const pageViews = await funnelEventsService.queryEvents({
  event_name: 'page_view',
  start_date: new Date('2024-01-01'),
  end_date: new Date('2024-01-31')
});
```

### 4. Estatísticas

```javascript
// Estatísticas por tipo de evento
const stats = await funnelEventsService.getEventStats({
  group_by: 'event_name',
  start_date: new Date(Date.now() - 24 * 60 * 60 * 1000) // Últimas 24h
});

// Estatísticas por bot
const botStats = await funnelEventsService.getEventStats({
  group_by: 'bot'
});
```

## Validações Implementadas

### event_name
- ✅ Obrigatório
- ✅ Deve ser string não vazia
- ✅ É automaticamente trimado

### price_cents
- ✅ Deve ser inteiro >= 0 quando presente
- ✅ Pode ser null/undefined

### meta
- ✅ Deve ser objeto quando presente
- ✅ Não pode ser array
- ✅ É convertido para JSON antes da persistência

## Timezone America/Recife

O serviço automaticamente:
- Formata timestamps para o timezone America/Recife
- Mantém compatibilidade com o banco de dados
- Fornece timestamps legíveis para usuários brasileiros

## Exemplos de Eventos Comuns

### Page View
```javascript
{
  event_name: 'page_view',
  bot: 'bot1',
  telegram_id: '123456789',
  meta: { page: '/oferta', referrer: 'telegram' }
}
```

### Add to Cart
```javascript
{
  event_name: 'add_to_cart',
  bot: 'bot1',
  telegram_id: '123456789',
  offer_tier: 'premium',
  price_cents: 9900,
  meta: { product_name: 'Curso Premium' }
}
```

### Purchase
```javascript
{
  event_name: 'purchase',
  bot: 'bot1',
  telegram_id: '123456789',
  offer_tier: 'premium',
  price_cents: 9900,
  transaction_id: 'tx_12345',
  meta: { 
    payment_method: 'pix',
    currency: 'BRL'
  }
}
```

## Tratamento de Erros

O serviço retorna objetos padronizados:

```javascript
// Sucesso
{
  success: true,
  event_id: 123,
  occurred_at: '2024-01-15T10:30:00.000Z',
  formatted_time: '15/01/2024 07:30:00'
}

// Erro de validação
{
  success: false,
  error: 'Dados inválidos',
  details: ['event_name é obrigatório e deve ser uma string não vazia']
}

// Erro interno
{
  success: false,
  error: 'Erro interno do banco',
  details: 'connection timeout'
}
```

## Monitoramento e Saúde

```javascript
// Verificar status do serviço
const health = funnelEventsService.getHealthStatus();
console.log(health);
// {
//   service: 'FunnelEventsService',
//   initialized: true,
//   timezone: 'America/Recife',
//   pool_available: true,
//   timestamp: '15/01/2024 07:30:00'
// }
```

## Migração

Para criar a tabela em um ambiente existente:

```bash
# Executar o arquivo de migração
psql -d seu_banco -f database/migrations/001_create_funnel_events.sql

# Ou executar via Node.js
node -e "
const postgres = require('./database/postgres');
postgres.initializeDatabase().then(pool => {
  console.log('Tabela criada com sucesso');
  pool.end();
});
"
```

## Testes

Execute o arquivo de teste para verificar a funcionalidade:

```bash
node teste-funnel-events.js
```

## Integração com Sistema Existente

O serviço é automaticamente inicializado no `server.js` quando o banco de dados está disponível. Não é necessário fazer alterações manuais.

## Performance

- **Índices otimizados** para consultas por data e usuário
- **Connection pooling** para reutilização de conexões
- **Validação em memória** antes de acessar o banco
- **JSONB nativo** para metadados flexíveis

## Segurança

- **Validação rigorosa** de todos os inputs
- **Prepared statements** para prevenir SQL injection
- **Sanitização automática** de dados antes da persistência
- **Controle de acesso** via pool de conexões

## Suporte

Para dúvidas ou problemas:
1. Verifique os logs do console
2. Execute o arquivo de teste
3. Verifique a saúde do serviço via `getHealthStatus()`
4. Consulte a documentação da tabela no banco
