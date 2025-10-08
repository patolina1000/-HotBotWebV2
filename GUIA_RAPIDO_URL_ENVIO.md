# Guia Rápido - URL_ENVIO após Pagamento

## ✅ O que mudou?

**ANTES**: Sistema redirecionava para `/obrigado?token=...&utm_source=...&fbp=...`

**AGORA**: Sistema envia mensagem no Telegram com URL limpa do `.env`

## 🔧 Configuração Rápida

### 1. Adicionar ao `.env`

```env
URL_ENVIO_1=https://exemplo.com/destino-bot1
URL_ENVIO_2=https://exemplo.com/destino-bot2
URL_ENVIO_3=https://exemplo.com/destino-bot3
```

**IMPORTANTE**: bot3 (URL_ENVIO_3) **nunca** terá query params anexados.

### 2. Reiniciar servidor

```bash
npm restart
```

## 📱 Mensagem Enviada

```
✅ Pagamento aprovado!

Pagamento aprovado? Clica aqui: https://exemplo.com/destino-bot1
```

**Nota**: URL é exatamente como configurado no `.env` - SEM modificações.

## 🔍 Como Testar

### Teste Local (webhook simulado)

```bash
# Bot1
curl -X POST http://localhost:3000/webhook/pushinpay \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-001",
    "status": "paid",
    "value": 9700
  }'
```

**Verificar**:
1. ✅ Console: `[PAGAMENTO] URL_ENVIO aplicada para bot1`
2. ✅ Telegram: Mensagem com URL limpa
3. ✅ URL não contém `?` ou `&`

### Teste Bot3 (sem query params)

```bash
# Bot3 / bot_especial
curl -X POST http://localhost:3000/bot_especial/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-003",
    "status": "paid",
    "value": 4900
  }'
```

**Verificar**:
- ✅ URL = valor exato de `URL_ENVIO_3`
- ✅ **SEM** query params (nem `?` nem `&`)

## 📋 Logs Esperados

### ✅ Sucesso

```
[PAGAMENTO] Redirecionamento para /obrigado desativado (status=paid)
[ENVIO-URL] ✅ URL_ENVIO_1 encontrada para bot1
[PAGAMENTO] URL_ENVIO aplicada para bot1: https://exemplo.com/destino
[bot1] ✅ Mensagem de pagamento aprovado enviada para 123456789
```

### ⚠️ URL não configurada

```
[ENVIO-URL] ⚠️ URL_ENVIO_4 não configurada no .env
[PAGAMENTO] URL_ENVIO ausente para bot4 (erro)
```

**Fallback**: Sistema envia mensagem genérica sem link.

## 🚨 Troubleshooting

### Problema: URL com query params no bot3

**Causa**: URL_ENVIO_3 já contém `?` no valor do `.env`

**Solução**: Remover query params da variável `.env`

```env
# ❌ ERRADO
URL_ENVIO_3=https://exemplo.com/destino?utm_source=...

# ✅ CORRETO
URL_ENVIO_3=https://exemplo.com/destino
```

### Problema: Link não enviado

**Verificar**:
1. ✅ `URL_ENVIO_X` configurada no `.env`?
2. ✅ Servidor reiniciado após adicionar variáveis?
3. ✅ Logs mostram `[PAGAMENTO] URL_ENVIO aplicada`?

### Problema: Bot não encontrado

**Causa**: `bot_id` não segue padrão esperado

**Solução**: Usar formato `bot1`, `bot2`, `bot3`, etc.

## 📍 Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `utils/envioUrl.js` | **Criado** - Helper para obter URLs |
| `config_gateway_pix.env.example` | **Atualizado** - Exemplos de URLs |
| `MODELO1/core/TelegramBotService.js` | **Modificado** - 2 locais atualizados |
| `server.js` | **Modificado** - 1 webhook atualizado |

## ✅ Checklist Pós-Deploy

- [ ] Variáveis `URL_ENVIO_*` adicionadas ao `.env` de produção
- [ ] Servidor reiniciado
- [ ] Teste com webhook real do PushinPay
- [ ] Verificar logs: `[PAGAMENTO] URL_ENVIO aplicada`
- [ ] Confirmar mensagem no Telegram
- [ ] Testar bot3 (sem query params)
- [ ] Página `/obrigado` ainda acessível (não foi deletada)

## 🎯 URLs por Bot

| Bot | Variável | Descrição |
|-----|----------|-----------|
| bot1 | `URL_ENVIO_1` | URL destino bot 1 |
| bot2 | `URL_ENVIO_2` | URL destino bot 2 |
| bot3/bot_especial | `URL_ENVIO_3` | ⚠️ **SEM query params** |
| bot4 | `URL_ENVIO_4` | URL destino bot 4 |
| bot5 | `URL_ENVIO_5` | URL destino bot 5 |
| ... | ... | ... |

## 📞 Suporte

**Documentação Completa**: `IMPLEMENTACAO_URL_ENVIO.md`

**Helper Utility**: `utils/envioUrl.js`