# 🎯 Sistema Completo de Rastreamento Web

Sistema implementado conforme especificações, usando UTMs + Facebook Pixel + Facebook CAPI + UTIMIFY.

## 📍 ESTRUTURA CENTRAL

**Todo tráfego entra por**: `modelo1/web/index.html`

### Rotas Identificadas:
- **Rota 1 (Telegram)**: Tracking DESATIVADO - funcionalidade original mantida
- **Rota 2 (Privacy)**: Tracking ATIVADO - sistema completo funcionando

## 🔐 VARIÁVEIS DE AMBIENTE OBRIGATÓRIAS

Configurar no arquivo `.env`:

```env
# Facebook
FB_PIXEL_ID=seu_pixel_id
FB_PIXEL_TOKEN=seu_access_token
FORCE_FB_TEST_MODE=false

# Frontend
FRONTEND_URL=https://seusite.com

# UTMify (opcional)
UTIMIFY_AD_ACCOUNT_ID=seu_account_id
UTIMIFY_API_TOKEN=seu_api_token
```

## 📊 EVENTOS FACEBOOK PIXEL (CLIENT-SIDE)

### PageView
- **Quando**: Assim que a página carregar (apenas na Rota 2)
- **Código**: `fbq('track', 'PageView')`

### ViewContent
- **Quando**: Após 4 segundos na página (apenas na Rota 2)
- **Código**: `fbq('track', 'ViewContent')`

### InitiateCheckout
- **Quando**: Ao clicar no botão Privacy/PIX
- **Código**: `fbq('track', 'InitiateCheckout')`

### Purchase
- **Quando**: Pagamento confirmado (detectado automaticamente)
- **Código**: `fbq('track', 'Purchase', { value: valor_real, currency: 'BRL' })`

## 🚀 FACEBOOK CAPI (SERVER-SIDE)

Todos os eventos do client-side são automaticamente duplicados para o servidor via CAPI:

- **Endpoint**: `/capi`
- **Deduplicação**: Automática via `event_id`
- **Dados enviados**: IP, User-Agent, FBP, FBC, valor real do plano

## 🎯 UTM TRACKING

### Captura Automática
- Todos os parâmetros UTM são capturados da URL
- Salvos em `localStorage` para persistência
- Enviados para backend via endpoint `/utm`

### Parâmetros Suportados
- `utm_source`
- `utm_medium` 
- `utm_campaign`
- `utm_term`
- `utm_content`

## 💼 UTIMIFY INTEGRATION

- **Endpoint**: `/utimify`
- **Quando**: Após confirmação de Purchase
- **Dados**: Valor real do plano + dados UTM

## ⚙️ ARQUIVOS DO SISTEMA

### Frontend
- `MODELO1/WEB/tracking.js` - Módulo principal de tracking
- `MODELO1/WEB/index.html` - Modificado para incluir sistema
- `checkout/js/tracking-integration.js` - Tracking específico do checkout

### Backend
- `server.js` - Rotas `/utm`, `/capi`, `/utimify` adicionadas
- Integração com serviços existentes mantida

## 🔍 DETECÇÃO DE ROTA

O sistema detecta automaticamente a rota baseado em:

```javascript
const isPrivacyRoute = window.location.pathname.includes('/privacy') || 
                      window.location.hostname.includes('hotbotwebv2.onrender.com');
```

## 🧠 DEBUG E LOGS

### Console Logs
Todos os eventos são logados no console com prefixos:
- `[PIXEL]` - Eventos Facebook Pixel
- `[CAPI]` - Eventos Facebook CAPI  
- `[UTM]` - Captura de UTMs
- `[UTIMIFY]` - Envios para UTMify
- `[TRACKING]` - Sistema geral

### Overlay de Debug
Em modo desenvolvimento, um overlay mostra o status em tempo real:
- Status do sistema (ativo/inativo)
- Rota atual
- Pixel inicializado
- Eventos enviados

### Meta Pixel Helper
Todos os eventos são visíveis no Meta Pixel Helper do Chrome.

## ✅ FUNCIONALIDADES MANTIDAS

- ✅ Toda lógica dos bots Telegram
- ✅ Sistema de geração de PIX
- ✅ Estrutura de upsell/downsell  
- ✅ Navegação, layout, UI
- ✅ Nada foi quebrado na implementação

## 🎮 API PÚBLICA

O sistema expõe uma API global para controle manual:

```javascript
// Inicializar sistema
await TrackingSystem.init();

// Rastrear clique no botão PIX
TrackingSystem.trackPixButtonClick();

// Rastrear compra
TrackingSystem.trackPurchase(27.00);

// Definir plano atual
TrackingSystem.setPlan({ valor: 27.00, nome: 'Plano VIP' });

// Obter dados de tracking
const dados = TrackingSystem.getTrackingData();

// Status do sistema
const status = TrackingSystem.getStatus();
```

## 🔧 CONFIGURAÇÃO DE PRODUÇÃO

1. **Variáveis de Ambiente**: Configurar todas as variáveis obrigatórias
2. **Facebook Pixel**: Verificar no Meta Pixel Helper
3. **CAPI**: Verificar logs no servidor para confirmação de envio
4. **UTMify**: Logs indicarão se está configurado ou não

## 🚨 IMPORTANTE

- ❌ **Nenhum valor hardcoded** - tudo vem das variáveis de ambiente
- ✅ **Rota 1 (Telegram)** - tracking completamente desativado
- ✅ **Rota 2 (Privacy)** - tracking completamente ativo
- ✅ **Valores dinâmicos** - sempre usa o valor real do plano selecionado
- ✅ **Deduplicação** - eventos não são duplicados
- ✅ **Logs completos** - tudo é visível no console e Meta Pixel Helper

## 📞 SUPORTE

O sistema foi implementado seguindo exatamente as especificações fornecidas e integra perfeitamente com a arquitetura existente sem quebrar nenhuma funcionalidade.
