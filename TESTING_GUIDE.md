# 🧪 GUIA DE TESTES - Meta Pixel Consolidado

## Objetivo
Validar que o Meta Pixel está carregando uma única vez em todo o funil, eliminando o aviso "Multiple pixels with conflicting versions...".

---

## 🔧 Preparação

### 1. Certifique-se de que o servidor está rodando
```bash
npm start
# ou
node server.js
```

### 2. Abra as ferramentas de desenvolvedor do navegador
- Chrome/Edge: F12 ou Ctrl+Shift+I
- Firefox: F12 ou Ctrl+Shift+K
- Safari: Cmd+Option+I

---

## ✅ Testes Obrigatórios

### Teste 1: Página de Obrigado (Purchase Flow)
**URL:** `http://localhost:PORT/obrigado_purchase_flow.html?token=TEST_TOKEN`

**Console esperado:**
```
[PIXEL] 📋 ensureFacebookPixel.js carregado
[PIXEL] 📦 Injetando base code do Meta Pixel...
[PIXEL] ✅ Base code injetado com sucesso
[PIXEL] ✅ init 123456789 (v=2.0)
[PIXEL] fbevents scripts: ["https://connect.facebook.net/en_US/fbevents.js"]
[PIXEL] ✅ Apenas 1 fbevents.js carregado (correto)
```

**Verificação:**
```javascript
// No console do navegador
document.querySelectorAll('script[src*="fbevents.js"]').length
// Deve retornar: 1
```

### Teste 2: Página Telegram
**URL:** `http://localhost:PORT/telegram/`

**Console esperado:**
```
[PIXEL] 📋 ensureFacebookPixel.js carregado
[PIXEL] 📦 Injetando base code do Meta Pixel...
[PIXEL] ✅ Base code injetado com sucesso
[PIXEL] ✅ init 123456789 (v=2.0)
[PIXEL] fbevents scripts: ["https://connect.facebook.net/en_US/fbevents.js"]
[PIXEL] ✅ Apenas 1 fbevents.js carregado (correto)
```

### Teste 3: Script de Validação (Opcional)
Adicionar em qualquer página para diagnóstico completo:

```html
<script src="/js/pixelValidation.js"></script>
```

**Console esperado:**
```
═══════════════════════════════════════════════
🔍 RELATÓRIO DE VALIDAÇÃO DO META PIXEL
═══════════════════════════════════════════════

✅ Scripts fbevents.js: 1
   Esperado: 1
✅ fbq disponível: true
✅ Versão do fbq: 2.0
   Esperado: 2.0
✅ window.__PIXEL_INIT__: true
✅ Pixel ID configurado: 1234...5678
✅ Cookie _fbp: presente
⚠️ Cookie _fbc: ausente (normal se não houver fbclid)
✅ ensureFacebookPixel disponível: true

═══════════════════════════════════════════════
✅ VALIDAÇÃO COMPLETA: Pixel configurado corretamente!
═══════════════════════════════════════════════
```

---

## 🚨 Problemas Comuns e Soluções

### Problema 1: "Multiple pixels with conflicting versions..."
**Causa:** Múltiplos scripts fbevents.js carregados

**Solução:**
1. Verificar se ensureFacebookPixel.js está sendo carregado primeiro
2. Confirmar que código antigo está comentado
3. Limpar cache do navegador (Ctrl+Shift+Delete)

### Problema 2: fbq não está definido
**Causa:** Script não carregou ou erro de rede

**Solução:**
1. Verificar rede (Network tab) se fbevents.js foi carregado
2. Verificar console por erros de CORS ou CSP
3. Verificar se /js/ensureFacebookPixel.js está acessível

### Problema 3: Pixel ID não encontrado
**Causa:** Endpoint /api/config não retornando FB_PIXEL_ID

**Solução:**
1. Verificar se .env tem FB_PIXEL_ID configurado
2. Testar endpoint: `curl http://localhost:PORT/api/config`
3. Verificar logs do servidor

---

## 📊 Validação de Eventos Purchase

### Teste de Purchase Event
1. Acessar página de obrigado com token válido
2. Preencher email e telefone
3. Clicar em "Confirmar e Continuar"

**Console esperado:**
```
[PURCHASE-BROWSER] evento enviado, eventID=pur:12345, has_fbp=true, has_fbc=true
[Meta Pixel] request:body
data[0].event_name = "Purchase"
data[0].event_time = 1234567890
data[0].event_id = "pur:12345"
data[0].action_source = "website"
data[0].user_data = { em: "...", ph: "...", fbp: "...", fbc: "..." }
data[0].custom_data = { value: 19.90, currency: "BRL", ... }
```

**Verificação no Events Manager:**
1. Acessar Meta Events Manager
2. Verificar evento "Purchase" recebido
3. Confirmar eventID para deduplicação Pixel/CAPI

---

## 🔍 Comandos Úteis de Debug

### Verificar scripts carregados:
```javascript
console.log([...document.querySelectorAll('script[src*="fbevents.js"]')].map(s => s.src));
```

### Verificar estado do pixel:
```javascript
console.log({
  fbq: typeof window.fbq,
  pixelInit: window.__PIXEL_INIT__,
  pixelId: window.ENV?.FB_PIXEL_ID,
  version: window.fbq?.version
});
```

### Verificar cookies:
```javascript
const getCookie = (name) => {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
};
console.log({
  _fbp: getCookie('_fbp'),
  _fbc: getCookie('_fbc')
});
```

### Disparar evento de teste:
```javascript
if (typeof fbq === 'function') {
  fbq('track', 'ViewContent', { 
    content_name: 'Teste',
    value: 9.90,
    currency: 'BRL'
  });
  console.log('Evento ViewContent enviado');
}
```

---

## ✅ Checklist Final

- [ ] Sem aviso "Multiple pixels with conflicting versions..." no console
- [ ] `document.querySelectorAll('script[src*="fbevents.js"]').length === 1`
- [ ] `window.__PIXEL_INIT__ === true`
- [ ] `window.fbq.version === '2.0'`
- [ ] Eventos Purchase sendo enviados corretamente
- [ ] EventID presente em todos os eventos
- [ ] Cookies _fbp e _fbc sendo capturados
- [ ] Deduplicação Pixel/CAPI funcionando (mesma eventID)

---

## 📞 Suporte

Se encontrar problemas:
1. Verificar PIXEL_CONSOLIDATION_SUMMARY.md
2. Revisar logs do servidor
3. Testar com script de validação: `/js/pixelValidation.js`
4. Verificar Events Manager da Meta

**Documentação de referência:**
- `/workspace/PIXEL_CONSOLIDATION_SUMMARY.md` - Resumo completo das mudanças
- `/workspace/public/js/ensureFacebookPixel.js` - Código fonte do loader centralizado
