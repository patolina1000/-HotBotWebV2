# 🔥 Sistema de Eventos Facebook Purchase Deduplicados

## ✅ Implementação Concluída

Sistema completo para enviar **2 eventos Purchase** por compra:
- **1 via Pixel (Browser)**
- **1 via CAPI (Server)**

Ambos com deduplicação garantida usando `event_id` único baseado em `sha256("pur:" + transaction_id)`.

## 📁 Arquivos Criados/Modificados

### Frontend (Checkout)
- `checkout/js/purchase-tracking.js` - Sistema principal de Purchase deduplicado
- `checkout/js/pixel-init.js` - Atualizado para usar sistema deduplicado
- `checkout/js/tracking-integration.js` - Atualizado para Purchase deduplicado
- `checkout/index.html` - Incluído sistema de Purchase tracking
- `checkout/funil_completo/up1.html` - Upsell com Purchase tracking

### Backend (Server)
- `services/purchaseDedup.js` - Serviço de deduplicação
- `services/facebook.js` - Atualizado para usar deduplicação
- `server.js` - Endpoint `/api/facebook-purchase` adicionado
- `create-purchase-dedup-table.js` - Script para criar tabela de deduplicação

## 🎯 Funcionalidades Implementadas

### 1. Geração de event_id Único
```javascript
event_id = sha256("pur:" + transaction_id)
```

### 2. Deduplicação Dupla
- **Cache em memória** (10 minutos TTL)
- **Banco de dados** (24 horas TTL) - opcional

### 3. Envio Duplo Garantido
- **Pixel (Browser)**: `fbq('track', 'Purchase', {...})`
- **CAPI (Server)**: POST para `/api/facebook-purchase`

### 4. Dados Completos
- `external_id` (SHA256)
- `fbc` e `fbp` cookies
- `ip_address` e `user_agent`
- `value` e `currency` (BRL)

## 🔧 Como Usar

### No Frontend (Checkout/Upsells)
```javascript
// Enviar Purchase deduplicado
if (window.PurchaseTracking) {
    window.PurchaseTracking.sendPurchase(transactionId, value, 'BRL', planName)
        .then(result => {
            console.log('Purchase enviado:', result);
        });
}
```

### No Backend (Webhooks)
```javascript
// Endpoint automático em /api/facebook-purchase
// Recebe dados do frontend e envia via CAPI
```

## 📊 Logs de Auditoria

### Console do Browser
```
[PURCHASE-TRACKING] ✅ Purchase enviado via Pixel: {event_id, value, currency, fbc, fbp}
```

### Logs do Servidor
```
[FACEBOOK-PURCHASE] ✅ Evento Purchase enviado com sucesso via CAPI: {event_id, transaction_id, value}
```

## 🚀 Fluxo Completo

1. **Usuário completa compra** no checkout
2. **Sistema gera transaction_id** único
3. **Frontend envia Pixel** com event_id deduplicado
4. **Frontend envia CAPI** via `/api/facebook-purchase`
5. **Backend processa CAPI** e envia para Meta
6. **Sistema registra** evento para deduplicação
7. **Apenas 2 eventos** chegam na Meta (1 Pixel + 1 CAPI)

## ⚙️ Configuração

### Variáveis de Ambiente Necessárias
```env
FB_PIXEL_ID=seu_pixel_id
FB_PIXEL_TOKEN=seu_access_token
DATABASE_URL=postgresql://... (opcional)
```

### Tabela de Deduplicação (Opcional)
```sql
CREATE TABLE purchase_event_dedup (
    event_id VARCHAR(64) UNIQUE NOT NULL,
    transaction_id VARCHAR(255) NOT NULL,
    source VARCHAR(20) NOT NULL, -- 'pixel' ou 'capi'
    -- ... outros campos
);
```

## 🎯 Aplicação

### Checkout Principal
- ✅ Implementado em `checkout/index.html`
- ✅ Dispara no callback de confirmação de pagamento

### Upsells
- ✅ Implementado em `checkout/funil_completo/up1.html`
- ✅ Dispara quando usuário compra upsell

### Backs (Futuro)
- 🔄 Pode ser implementado seguindo o mesmo padrão

## 🔍 Monitoramento

### Verificar Deduplicação
```javascript
// Verificar se Purchase já foi enviado
window.PurchaseTracking.isPurchaseAlreadySent(eventId, source)
```

### Estatísticas
```javascript
// Obter estatísticas de deduplicação
window.PurchaseTracking.getDedupStats()
```

## ⚠️ Importante

1. **NÃO TOCAR** no sistema do Kwai
2. **Sempre usar** `price_cents / 100` para valor
3. **Sempre usar** `sha256("pur:" + transaction_id)` para event_id
4. **Sempre enviar** 2 eventos (1 Pixel + 1 CAPI)
5. **Sempre deduplicar** para evitar duplicatas

## 🎉 Resultado Final

✅ **2 eventos Purchase por compra**
✅ **Deduplicação garantida**
✅ **Valor correto (price_cents / 100)**
✅ **Dados completos exigidos pela Meta**
✅ **Logs de auditoria completos**
✅ **Sistema resiliente (funciona sem banco)**

---

**Status**: ✅ **IMPLEMENTAÇÃO COMPLETA E FUNCIONAL**
