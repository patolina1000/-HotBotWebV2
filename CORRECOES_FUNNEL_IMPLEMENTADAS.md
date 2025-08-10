# Correções Implementadas no Funnel

## Resumo das Correções Aplicadas

### ✅ 1. Substituição do uso de pool na rota /routes/funnel.js

**Antes:**
```javascript
const pool = db.pool || (typeof db.createPool === 'function' ? db.createPool() : db);
const client = await pool.connect();
```

**Depois:**
```javascript
const pool = db.getPool();
const client = await pool.connect();
```

**Arquivo:** `routes/funnel.js` (linha 75)

### ✅ 2. Correção das consultas SQL da rota /api/funnel

**Query counters (linha 78-85):**
```sql
SELECT day::date AS day, metric, SUM(total)::int AS total
FROM public.funnel_counters
WHERE day BETWEEN $1::date AND $2::date
  AND metric IN ('welcome','cta_click','bot_start','pix_created','purchase')
GROUP BY 1,2
ORDER BY 1,2;
```

**Query fallback (linha 95-102):**
```sql
SELECT (occurred_at AT TIME ZONE 'America/Recife')::date AS day,
       event_name AS metric,
       COUNT(*)::int AS total
FROM public.funnel_events
WHERE occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
  AND event_name IN ('welcome','cta_click','bot_start','pix_created','purchase')
GROUP BY 1,2
ORDER BY 1,2;
```

### ✅ 3. Correção no insertFunnelEvent

**Antes:**
```javascript
const p = pool || createPool(); // garanta pool global
```

**Depois:**
```javascript
const p = pool || getPool();
```

**Arquivo:** `database/postgres.js` (linha 790)

### ✅ 4. Verificação do gerador de event_id (buildEventId)

**Status:** ✅ Já estava correto
- `randomUUID` já estava importado no topo do arquivo
- Função `buildEventId` já estava implementada corretamente
- Agora está sendo exportada corretamente

**Arquivo:** `database/postgres.js` (linha 5 e 774-786)

### ✅ 5. Variável de controle /start

**Status:** ✅ Já estava correto
- Variável `payloadTrackingSaved` já estava sendo usada corretamente
- Não havia inconsistências com `trackingSalvoDePayload`

**Arquivo:** `MODELO1/core/TelegramBotService.js` (linha 1443)

### ✅ 6. Encerramento idempotente do pool no SIGTERM

**Adicionado handler SIGTERM:**
```javascript
process.on('SIGTERM', async () => {
  console.log('🛑 Recebido SIGTERM, encerrando servidor...');
  try {
    const postgres = require('./database/postgres');
    await postgres.closePool();
    console.log('✅ Pool PostgreSQL fechado');
  } catch (e) {
    console.error('❌ Erro ao fechar pool PostgreSQL:', e);
  }
});
```

**Arquivo:** `server.js` (linha 2205-2213)

### ✅ 7. Verificação do INSERT em funnel_events

**Status:** ✅ Já estava correto
- INSERT já usa `ON CONFLICT (event_id) DO NOTHING`
- Garante idempotência dos eventos

**Arquivo:** `database/postgres.js` (linha 815)

## Testes Realizados

### ✅ Teste Básico das Funções
- `buildEventId`: ✅ Funcionando
- `normalizeEventName`: ✅ Funcionando  
- `getPool`: ✅ Funcionando
- `closePool`: ✅ Funcionando

### ✅ Verificações de Código
- Todas as consultas SQL corrigidas
- Pool singleton implementado corretamente
- Handlers de shutdown adicionados
- Funções exportadas corretamente

## Próximos Passos

1. **Testar API /api/funnel** em produção
2. **Verificar inserção de eventos** (welcome, cta_click, bot_start, pix_created, purchase)
3. **Monitorar logs** para garantir funcionamento correto
4. **Validar dados retornados** pela API

## Arquivos Modificados

1. `routes/funnel.js` - Correção do pool e consultas SQL
2. `database/postgres.js` - Correção do insertFunnelEvent e exports
3. `server.js` - Adição do handler SIGTERM
4. `teste-funnel-simples.js` - Script de teste criado

## Status Geral

🎉 **Todas as correções foram implementadas com sucesso!**

O sistema está pronto para funcionar corretamente com:
- Pool PostgreSQL singleton
- Consultas SQL otimizadas
- Handlers de shutdown idempotentes
- Eventos com idempotência garantida
