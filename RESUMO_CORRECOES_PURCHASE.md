# 🔧 RESUMO EXECUTIVO: Correções Purchase CAPI

## 📊 Análise do Problema

Analisando o log fornecido, identificamos **3 problemas principais** que impedem o Purchase CAPI de funcionar corretamente:

### ❌ Problema 1: Erro de Schema - Coluna `expires_at` não existe
```
[PURCHASE-DEDUP] Erro ao verificar transaction_id no banco: error: column "expires_at" does not exist
```
- **Impacto:** Deduplicação não funciona, Purchase pode ser enviado múltiplas vezes
- **Frequência:** Ocorre 3x no log fornecido
- **Status:** ✅ **CORRIGIDO** com `fix-purchase-schema.sql`

### ❌ Problema 2: Erro de Schema - Coluna `bot_id` não existe
```
[bot1] ❌ Erro ao sincronizar registro no PostgreSQL: column "bot_id" of relation "tokens" does not exist
```
- **Impacto:** Dados não são sincronizados corretamente no PostgreSQL
- **Frequência:** Ocorre 1x no log fornecido
- **Status:** ✅ **CORRIGIDO** com `fix-purchase-schema.sql`

### ❌ Problema 3: Falta de Logging Detalhado
- **Impacto:** Impossível diagnosticar se o Purchase está sendo enviado ao Meta
- **Observação:** Lead CAPI tem logging completo, Purchase CAPI não tinha
- **Status:** ✅ **CORRIGIDO** com alterações em `services/facebook.js`

## ✅ Soluções Implementadas

### 1. Script SQL de Correção (`fix-purchase-schema.sql`)

**O que faz:**
- ✅ Cria tabela `purchase_event_dedup` se não existir
- ✅ Adiciona coluna `expires_at` se não existir
- ✅ Adiciona coluna `transaction_id` se não existir
- ✅ Adiciona todas as colunas necessárias (event_name, value, currency, source, etc.)
- ✅ Cria 5 índices para performance
- ✅ Adiciona coluna `bot_id` à tabela `tokens`
- ✅ Adiciona colunas CAPI à tabela `tokens` (capi_ready, capi_sent, pixel_sent, etc.)
- ✅ Limpa dados expirados
- ✅ Valida estrutura final

**Como executar:**
```bash
# Opção 1: Via psql
psql -h <host> -U <usuario> -d <database> -f fix-purchase-schema.sql

# Opção 2: Via Node.js
node execute-purchase-fix.js
```

### 2. Logging Detalhado em `services/facebook.js`

**O que foi adicionado:**
- ✅ Log de preparação do evento
- ✅ Log de deduplicação robusta
- ✅ Log de timestamp usado
- ✅ Log de rastreamento invisível
- ✅ Log de auditoria (AUDIT)
- ✅ Log de user_data montado
- ✅ Log completo da request (incluindo body JSON)
- ✅ Log completo da response (incluindo body JSON)
- ✅ Log de sucesso/erro detalhado

**Exemplo de log gerado:**
```
[PurchaseCAPI] Evento preparado para envio { event_name: 'Purchase', ... }
🔍 DEDUPLICAÇÃO ROBUSTA { ... }
🕐 Timestamp final usado { ... }
[Meta CAPI] request:body
{
  "data": [
    {
      "event_name": "Purchase",
      "event_time": 1759778111,
      ...
    }
  ]
}
[Meta CAPI] response:body
{
  "events_received": 1,
  "fbtrace_id": "..."
}
✅ Evento enviado com sucesso { ... }
```

### 3. Script de Execução Automatizada (`execute-purchase-fix.js`)

**O que faz:**
- ✅ Conecta ao PostgreSQL
- ✅ Executa o SQL de correção
- ✅ Valida todas as alterações
- ✅ Exibe relatório detalhado
- ✅ Lista todas as colunas e índices criados
- ✅ Mostra estatísticas da tabela

## 📋 Checklist de Implementação

### Fase 1: Correção de Schema (CRÍTICO)
- [ ] **Executar** `fix-purchase-schema.sql` no banco de produção
  ```bash
  node execute-purchase-fix.js
  ```
- [ ] **Verificar** que o script executou sem erros
- [ ] **Confirmar** que as colunas foram criadas:
  - `purchase_event_dedup.expires_at`
  - `purchase_event_dedup.transaction_id`
  - `tokens.bot_id`

### Fase 2: Deploy do Código
- [ ] **Commit** das alterações em `services/facebook.js`
- [ ] **Deploy** para produção
- [ ] **Reiniciar** a aplicação
  ```bash
  npm restart
  # ou
  pm2 restart all
  ```

### Fase 3: Teste e Validação
- [ ] **Realizar** um teste de pagamento completo
- [ ] **Verificar** nos logs que aparece:
  - `[PurchaseCAPI] Evento preparado para envio`
  - `[Meta CAPI] request:body` com JSON completo
  - `[Meta CAPI] response:body` com JSON completo
  - `✅ Evento enviado com sucesso`
- [ ] **Confirmar** no Gerenciador de Eventos do Meta:
  - Acessar: https://business.facebook.com/events_manager2/list/pixel/1280205146659070/test_events
  - Verificar se Purchase aparece
  - Copiar `fbtrace_id` dos logs e buscar
  - Verificar Match Quality

### Fase 4: Monitoramento (24h)
- [ ] **Monitorar** logs por erros de schema
- [ ] **Verificar** que Purchase aparece consistentemente no Meta
- [ ] **Confirmar** que não há duplicação de eventos
- [ ] **Validar** que deduplicação está funcionando

## 🚨 Troubleshooting

### Se Purchase ainda não aparecer no Meta após correções:

#### 1. Verificar Credentials
```bash
# Verificar se as variáveis de ambiente estão corretas
echo $FB_PIXEL_ID
echo $FB_PIXEL_TOKEN
echo $TEST_EVENT_CODE
```

#### 2. Verificar Logs Detalhados
Procurar por:
- ✅ `[Meta CAPI] response:body` - Se aparece, evento está sendo enviado
- ✅ `events_received: 1` - Se aparece, Meta recebeu o evento
- ❌ `error:` - Se aparece, há um problema no envio
- ❌ `missing credentials` - Faltam credenciais

#### 3. Usar fbtrace_id para Debug
```
1. Copiar fbtrace_id dos logs
2. Acessar Meta Events Manager > Test Events
3. Buscar pelo fbtrace_id
4. Ver detalhes do erro (se houver)
```

#### 4. Verificar Deduplicação
```sql
-- Ver eventos registrados
SELECT * FROM purchase_event_dedup 
WHERE transaction_id = 'a00d0711-1fc6-4bf8-afd5-722b84684dd8';

-- Ver se há duplicados
SELECT transaction_id, COUNT(*) 
FROM purchase_event_dedup 
GROUP BY transaction_id 
HAVING COUNT(*) > 1;
```

## 📊 Comparação Antes vs Depois

| Aspecto | Antes | Depois |
|---------|-------|--------|
| **Schema purchase_event_dedup** | ❌ Incompleto | ✅ Completo |
| **Coluna expires_at** | ❌ Não existe | ✅ Existe |
| **Coluna transaction_id** | ⚠️ Pode não existir | ✅ Existe |
| **Schema tokens** | ❌ Falta bot_id | ✅ Completo |
| **Logging Purchase CAPI** | ❌ Mínimo | ✅ Detalhado |
| **Debug no Meta** | ❌ Impossível | ✅ Possível com fbtrace_id |
| **Deduplicação** | ❌ Quebrada | ✅ Funcional |
| **Visibilidade** | ❌ Cega | ✅ Total |

## 🎯 Resultado Esperado

Após implementar as correções:

1. ✅ **Sem erros de schema** nos logs
2. ✅ **Logging completo** de todos os eventos Purchase
3. ✅ **Purchase aparece** no Gerenciador de Eventos do Meta
4. ✅ **Deduplicação funciona** corretamente
5. ✅ **Debug facilitado** com fbtrace_id
6. ✅ **Paridade** entre Lead e Purchase CAPI

## 📁 Arquivos Criados/Modificados

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `fix-purchase-schema.sql` | ✨ Novo | Script SQL de correção de schema |
| `execute-purchase-fix.js` | ✨ Novo | Script Node.js para executar correções |
| `INSTRUCOES_PURCHASE_CAPI_LOGGING.md` | ✨ Novo | Instruções detalhadas |
| `RESUMO_CORRECOES_PURCHASE.md` | ✨ Novo | Este documento |
| `services/facebook.js` | ✏️ Modificado | Adicionado logging detalhado |

## 🚀 Próximos Passos Imediatos

### 1. AGORA (Crítico)
```bash
# Executar correção de schema
node execute-purchase-fix.js
```

### 2. EM SEGUIDA (Importante)
```bash
# Deploy do código
git add services/facebook.js
git commit -m "feat: adiciona logging detalhado para Purchase CAPI"
git push

# Reiniciar aplicação
pm2 restart all
```

### 3. VALIDAR (Essencial)
- Realizar teste de pagamento
- Verificar logs completos
- Confirmar Purchase no Meta

## 📞 Suporte

Se após implementar todas as correções o Purchase ainda não aparecer:

1. **Copiar** os logs completos do último teste
2. **Incluir** o `fbtrace_id` retornado
3. **Verificar** no Meta Events Manager o que está acontecendo
4. **Compartilhar** os logs para análise adicional

---

**Status Atual:** ✅ Soluções implementadas, aguardando deploy e teste  
**Data:** 2025-10-06  
**Próxima Ação:** Executar `execute-purchase-fix.js`
