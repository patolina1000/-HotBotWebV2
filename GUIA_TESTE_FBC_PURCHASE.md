# Guia Rápido de Teste - FBC nos Purchases

## 🎯 Objetivo
Validar que ambos os eventos Purchase (Browser Pixel e CAPI server) enviam `fbc` corretamente.

---

## 📋 Checklist de Testes

### Teste 1: fbclid na URL da obrigado
**Cenário**: fbclid presente diretamente na URL da página de obrigado

**Passos**:
1. Navegar para: `/obrigado_purchase_flow.html?token=abc123&fbclid=IwAR1234567890`
2. Abrir DevTools (F12) → Console
3. Preencher email e telefone
4. Clicar em "Confirmar e Continuar"

**Validação Browser** (Console):
```
✅ [PURCHASE-BROWSER] (a) _fbc reconstruído de fbclid da URL e setado: fb.1.1731024000000.IwAR1234567890
✅ [PURCHASE-BROWSER] fbc_resolved=true fbc=fb.1...
✅ [PURCHASE-BROWSER] fbq Purchase ready (event_id=pur:abc123) _fbc_present=true
```

**Validação CAPI** (Logs do servidor):
```
✅ [PURCHASE-CAPI] user_data.fbc=fb.1.1731024000000.IwAR1234567890 fbp=... event_id=pur:abc123
```

---

### Teste 2: fbc recuperado do backend
**Cenário**: fbclid foi capturado anteriormente e está persistido no backend

**Passos**:
1. Certifique-se de que o token tem `fbc` no banco de dados
2. Navegar para: `/obrigado_purchase_flow.html?token=abc123` (SEM fbclid na URL)
3. Abrir DevTools (F12) → Console
4. Preencher email e telefone
5. Clicar em "Confirmar e Continuar"

**Validação Browser** (Console):
```
✅ [PURCHASE-BROWSER] (b) _fbc recuperado do backend e setado: fb.1...
✅ [PURCHASE-BROWSER] fbc_resolved=true fbc=fb.1...
✅ [PURCHASE-BROWSER] fbq Purchase ready (event_id=pur:abc123) _fbc_present=true
```

**Validação CAPI** (Logs do servidor):
```
✅ [PURCHASE-CAPI] user_data.fbc=fb.1... fbp=... event_id=pur:abc123
```

---

### Teste 3: fbc ausente (alerta esperado em DEV)
**Cenário**: fbclid nunca foi capturado

**Passos**:
1. Certifique-se de que `NODE_ENV=development` ou `NODE_ENV=dev`
2. Token NÃO tem `fbc` nem `fbclid` no banco
3. Navegar para: `/obrigado_purchase_flow.html?token=abc123` (SEM fbclid na URL)
4. Abrir DevTools (F12) → Console
5. Preencher email e telefone
6. Clicar em "Confirmar e Continuar"

**Validação Browser** (Console):
```
⚠️ [PURCHASE-BROWSER] fbc_resolved=false fbc=vazio
⚠️ [PURCHASE-BROWSER] fbq Purchase ready (event_id=pur:abc123) _fbc_present=false
```

**Validação CAPI** (Logs do servidor - apenas em DEV):
```
⚠️ [PURCHASE-CAPI] fbc ausente, tentando fallback...
⚠️ [PURCHASE-CAPI] ⚠️ fbc não pôde ser resolvido - fbclid ausente ou inválido
⚠️ [ALERTA] FBC ausente em Browser e CAPI — verificar captura na presell/propagação
```

---

## 🔍 Como Validar no Events Manager do Facebook

1. Acesse: https://business.facebook.com/events_manager2/list/pixel/
2. Selecione seu Pixel
3. Clique em "Test Events" (se estiver usando test_event_code) ou "Events"
4. Filtre por "Purchase"
5. Verifique o evento recente:
   - **Event ID**: deve ser o mesmo em Browser e CAPI (ex: `pur:abc123`)
   - **Browser Event**: deve mostrar `fbc` nos parâmetros
   - **Server Event**: deve mostrar `fbc` no `user_data`

---

## 🐛 Troubleshooting

### Problema: fbc_resolved=false mesmo com fbclid na URL
**Possível causa**: fbclid pode estar malformado ou vazio

**Solução**:
```javascript
// No console do browser, verificar:
const urlParams = new URLSearchParams(window.location.search);
console.log('fbclid na URL:', urlParams.get('fbclid'));
```

### Problema: Cookie _fbc não está sendo setado
**Possível causa**: Restrições de cookies do navegador

**Solução**:
1. Verifique se cookies de terceiros estão bloqueados
2. Verifique se o domínio está correto (deve ser first-party)
3. No console: `document.cookie` para ver todos os cookies

### Problema: CAPI não está enviando fbc
**Possível causa**: fbclid não foi persistido no banco

**Solução**:
```sql
-- Verificar no banco de dados:
SELECT token, fbc, fbclid FROM tokens WHERE token = 'abc123';
```

---

## 📊 Métricas de Sucesso

### Taxa de Resolução de FBC (Meta: >80%)
```
fbc_resolvidos / total_purchases * 100
```

### Verificar nos logs:
```bash
# Browser Pixel
grep "fbc_resolved=true" logs/app.log | wc -l

# CAPI
grep "user_data.fbc=fb.1" logs/app.log | wc -l
```

---

## 🚀 Teste Rápido Automatizado

### Script de Verificação (bash)
```bash
#!/bin/bash
# verify-fbc-purchase.sh

echo "🔍 Verificando implementação FBC em Purchases..."

# 1. Verificar se arquivos foram modificados
echo "1. Arquivos modificados:"
git diff --name-only HEAD | grep -E "(obrigado_purchase_flow.html|purchaseCapi.js)"

# 2. Verificar logs no browser
echo ""
echo "2. Para testar no browser:"
echo "   - Abra: http://localhost:3000/obrigado_purchase_flow.html?token=TEST&fbclid=IwARtest123"
echo "   - Abra DevTools Console"
echo "   - Procure por: [PURCHASE-BROWSER] fbc_resolved=true"

# 3. Verificar logs do servidor
echo ""
echo "3. Para testar CAPI:"
echo "   - Monitore logs: tail -f logs/app.log | grep PURCHASE-CAPI"
echo "   - Procure por: [PURCHASE-CAPI] user_data.fbc=fb.1..."

echo ""
echo "✅ Implementação completa! Siga os passos acima para validar."
```

---

## ✅ Critérios de Aceite

- [ ] Browser: Console mostra `fbc_resolved=true`
- [ ] Browser: Console mostra `_fbc_present=true` antes do `fbq('track','Purchase')`
- [ ] CAPI: Log mostra `user_data.fbc=<não vazio>`
- [ ] Ambos: Usam mesmo `event_id` (ex: `pur:txn_abc123`)
- [ ] Ambos: Têm `fbc` resolvido (exceto Teste 3 onde é esperado ausente)
- [ ] DEV: Alerta aparece quando `fbc` ausente em ambos

---

**Data**: 2025-10-10  
**Branch**: cursor/ensure-fbc-for-browser-and-capi-purchases-dd27
