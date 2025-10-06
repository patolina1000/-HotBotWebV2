# ⚡ IMPLEMENTAR AGORA - Purchase CAPI

## 🎯 Problema Identificado

Analisando seu log, encontrei **3 erros críticos** que impedem o Purchase CAPI de funcionar:

1. ❌ `column "expires_at" does not exist` - Tabela purchase_event_dedup incompleta
2. ❌ `column "bot_id" does not exist` - Tabela tokens incompleta  
3. ❌ Logging insuficiente - Impossível diagnosticar o que está acontecendo

## ✅ Solução Pronta

Criei 4 arquivos que resolvem TUDO:

1. `fix-purchase-schema.sql` - Corrige o schema do banco
2. `execute-purchase-fix.js` - Executa as correções automaticamente
3. `services/facebook.js` - Adicionado logging detalhado (JÁ MODIFICADO)
4. `INSTRUCOES_PURCHASE_CAPI_LOGGING.md` - Documentação completa

## 🚀 Implementação (3 Passos)

### Passo 1: Corrigir o Banco de Dados (2 minutos)

```bash
# Executar correção de schema
node execute-purchase-fix.js
```

**O que acontece:**
- ✅ Cria/corrige tabela `purchase_event_dedup`
- ✅ Adiciona coluna `expires_at`
- ✅ Adiciona coluna `transaction_id`
- ✅ Adiciona coluna `bot_id` na tabela `tokens`
- ✅ Cria 5 índices para performance
- ✅ Valida tudo automaticamente

### Passo 2: Deploy do Código (1 minuto)

```bash
# Reiniciar aplicação para carregar novo logging
pm2 restart all
# ou
npm restart
```

**O que acontece:**
- ✅ Logging detalhado do Purchase CAPI é ativado
- ✅ Logs idênticos ao Lead CAPI
- ✅ Request e Response completos são logados

### Passo 3: Testar (5 minutos)

```bash
# 1. Fazer um teste de pagamento
# 2. Verificar os logs
# 3. Procurar por: [Meta CAPI] request:body
# 4. Procurar por: ✅ Evento enviado com sucesso
# 5. Copiar o fbtrace_id
# 6. Verificar no Meta Events Manager
```

## 📊 O Que Você Verá nos Logs (DEPOIS)

```log
[PurchaseCAPI] Evento preparado para envio {
  event_name: 'Purchase',
  event_id: 'pur:a00d0711-1fc6-4bf8-afd5-722b84684dd8',
  transaction_id: 'a00d0711-1fc6-4bf8-afd5-722b84684dd8',
  has_fbp: true,
  has_fbc: true,
  ...
}

[Meta CAPI] request:body
{
  "data": [
    {
      "event_name": "Purchase",
      "event_id": "pur:...",
      "user_data": { ... },
      "custom_data": { 
        "transaction_id": "...",
        "value": 20.00,
        "currency": "BRL"
      }
    }
  ],
  "test_event_code": "TEST31753"
}

[Meta CAPI] response:body
{
  "events_received": 1,
  "fbtrace_id": "ADPDZ_P2MKwLNTy0swAXMnt"
}

✅ Evento enviado com sucesso { ... }
```

## ❌ O Que Você Via nos Logs (ANTES)

```log
[PURCHASE-DEDUP] Erro ao verificar transaction_id no banco: 
  error: column "expires_at" does not exist ❌

[bot1] ❌ Erro ao sincronizar registro no PostgreSQL: 
  column "bot_id" of relation "tokens" does not exist ❌

(Sem logs detalhados do envio) ❌
```

## 🎯 Resultado Esperado

Após os 3 passos:

- ✅ **SEM ERROS** de schema nos logs
- ✅ **LOGGING COMPLETO** de Purchase CAPI (igual ao Lead)
- ✅ **PURCHASE APARECE** no Gerenciador de Eventos do Meta
- ✅ **DEDUPLICAÇÃO FUNCIONA** corretamente
- ✅ **DEBUG FÁCIL** com fbtrace_id

## 📁 Arquivos Importantes

| Arquivo | O que é | Ação |
|---------|---------|------|
| `execute-purchase-fix.js` | Script de correção | ▶️ **EXECUTAR AGORA** |
| `fix-purchase-schema.sql` | SQL de correção | ℹ️ Usado pelo script acima |
| `RESUMO_CORRECOES_PURCHASE.md` | Resumo executivo | 📖 Ler para entender tudo |
| `INSTRUCOES_PURCHASE_CAPI_LOGGING.md` | Documentação completa | 📖 Referência futura |

## ⚠️ IMPORTANTE

**Execute o Passo 1 PRIMEIRO!** O banco precisa estar corrigido antes de fazer qualquer teste.

## 🆘 Se Algo Der Errado

1. **Erro ao executar script:**
   ```bash
   # Verificar conexão com banco
   echo $DATABASE_URL
   ```

2. **Purchase ainda não aparece no Meta:**
   - Verificar logs completos
   - Procurar por `[Meta CAPI] response:body`
   - Copiar `fbtrace_id` e buscar no Meta Events Manager

3. **Outros erros:**
   - Ler `RESUMO_CORRECOES_PURCHASE.md` seção "Troubleshooting"

## 🚀 COMECE AGORA

```bash
# Cole este comando no terminal:
node execute-purchase-fix.js
```

---

**Tempo total:** ~8 minutos  
**Dificuldade:** Fácil ⭐  
**Impacto:** CRÍTICO 🔥
