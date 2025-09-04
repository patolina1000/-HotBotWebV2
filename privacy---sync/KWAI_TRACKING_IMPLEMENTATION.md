# Sistema de Tracking Kwai para Privacy - IDÊNTICO AO BOT DO TELEGRAM

## 📋 Visão Geral

Este sistema implementa tracking completo da Kwai Event API para o Privacy, sendo **IDÊNTICO AO BOT DO TELEGRAM** mas adaptado para web. O sistema captura automaticamente o `click_id` da URL e envia eventos para a Kwai em momentos específicos do funil de conversão.

## 🎯 Eventos Implementados

### 1. EVENT_CONTENT_VIEW
- **Quando**: Automaticamente quando a página carrega
- **Onde**: Todas as páginas do Privacy
- **Dados**: Nome da página, categoria, ID do conteúdo

### 2. EVENT_ADD_TO_CART  
- **Quando**: Quando um PIX é gerado
- **Onde**: Sistema de pagamento
- **Dados**: Valor, nome do produto, categoria

### 3. EVENT_PURCHASE
- **Quando**: Quando o pagamento é aprovado
- **Onde**: Webhook da PushinPay
- **Dados**: Valor pago, dados do pagador, ID da transação

## 🚀 Como Funciona

### Captura Automática de Click ID
```javascript
// O sistema captura automaticamente da URL:
// https://privacy.com/?click_id=ABC123&utm_source=kwai&utm_campaign=privacy

// E armazena em:
localStorage.setItem('kwai_click_id', 'ABC123');
sessionStorage.setItem('kwai_click_id', 'ABC123');
```

### Tracking Automático de Visualização
```javascript
// Evento enviado automaticamente quando a página carrega
document.addEventListener('DOMContentLoaded', () => {
    if (hasValidClickId()) {
        sendContentView({
            content_name: document.title,
            content_category: 'Privacy',
            content_id: window.location.pathname
        });
    }
});
```

### Tracking de Geração de PIX
```javascript
// No sistema de pagamento
if (window.KwaiTracker && window.KwaiTracker.hasValidClickId()) {
    await window.KwaiTracker.sendAddToCart(amount, {
        content_name: `Privacy - ${description}`,
        content_id: `pix_creation_${Date.now()}`,
        content_category: 'Privacy - PIX Creation'
    });
}
```

### Tracking de Pagamento Aprovado
```javascript
// No webhook da PushinPay
async handlePaidStatus(webhookData) {
    const clickId = webhookData.click_id || webhookData.id;
    
    if (clickId) {
        await kwaiService.sendPurchase(clickId, webhookData.value, {
            contentName: `Privacy - PIX ${webhookData.id}`,
            contentId: webhookData.id,
            contentCategory: 'Privacy - PIX',
            transaction_id: webhookData.id
        });
    }
}
```

## 🔧 Configuração

### Variáveis de Ambiente
```bash
# Obrigatórias
KWAI_PIXEL_ID=seu_pixel_id_aqui
KWAI_ACCESS_TOKEN=seu_access_token_aqui

# Opcionais
KWAI_TEST_MODE=true  # Para testes (trackFlag=true)
```

### Estrutura de Arquivos
```
privacy---sync/
├── public/js/
│   └── kwai-click-tracker.js          # Sistema principal de tracking
├── services/
│   └── kwaiEventAPI.js                # Serviço de envio de eventos
├── pushinpayWebhook.js                # Webhook com tracking integrado
└── test-tracking-completo.js          # Testes do sistema
```

## 📱 API do Frontend

### Métodos Disponíveis
```javascript
window.KwaiTracker = {
    // Captura e armazenamento
    captureClickId(),           // Captura click_id da URL
    getClickId(),               // Obtém click_id armazenado
    hasValidClickId(),          // Verifica se há click_id válido
    clearClickId(),             // Limpa dados armazenados
    
    // Dados de tracking
    getTrackingData(),          // Obtém UTMs e outros parâmetros
    
    // Envio de eventos
    sendEvent(eventName, properties),
    sendContentView(properties),
    sendAddToCart(value, properties),
    sendPurchase(value, properties)
};
```

### Exemplo de Uso
```javascript
// Verificar se há tracking disponível
if (window.KwaiTracker.hasValidClickId()) {
    // Enviar evento personalizado
    await window.KwaiTracker.sendEvent('EVENT_CUSTOM', {
        custom_property: 'valor',
        content_name: 'Página Especial'
    });
}
```

## 🔄 Fluxo Completo

### 1. Usuário Clica no Anúncio Kwai
```
URL: https://privacy.com/?click_id=ABC123&utm_source=kwai
↓
Sistema captura click_id e UTMs
↓
Armazena em localStorage + sessionStorage
↓
Envia EVENT_CONTENT_VIEW automaticamente
```

### 2. Usuário Gera PIX
```
Usuário clica em "Gerar PIX"
↓
Sistema verifica se há click_id
↓
Envia EVENT_ADD_TO_CART
↓
PIX é criado via PushinPay
```

### 3. Usuário Paga
```
Pagamento é processado
↓
PushinPay envia webhook
↓
Sistema processa webhook
↓
Envia EVENT_PURCHASE
```

## 🧪 Testes

### Executar Testes Completos
```bash
cd privacy---sync
node test-tracking-completo.js
```

### Testes Disponíveis
- ✅ Configuração do serviço
- ✅ Envio de eventos
- ✅ Fluxo completo simulado
- ✅ Integração com webhook

## 🚨 Troubleshooting

### Click ID Não Capturado
```javascript
// Verificar se está na URL
console.log('URL params:', new URLSearchParams(window.location.search));

// Verificar storage
console.log('localStorage:', localStorage.getItem('kwai_click_id'));
console.log('sessionStorage:', sessionStorage.getItem('kwai_click_id'));
```

### Eventos Não Enviados
```javascript
// Verificar configuração
if (window.KwaiTracker.hasValidClickId()) {
    console.log('Click ID válido:', window.KwaiTracker.getClickId());
} else {
    console.log('Nenhum Click ID válido');
}
```

### Debug Mode
```javascript
// Ativar debug
localStorage.setItem('kwai_debug', 'true');
// Recarregar página
```

## 📊 Monitoramento

### Logs Automáticos
- Captura de click_id
- Envio de eventos
- Erros de tracking
- Status do sistema

### Métricas Disponíveis
- Eventos enviados com sucesso
- Eventos com falha
- Click IDs capturados
- Tempo de resposta da API

## 🔗 Integrações

### Backend
- `/api/kwai-event` - Endpoint para eventos
- Webhook PushinPay - Tracking automático de pagamentos

### Frontend
- Sistema de pagamento universal
- Todas as páginas do Privacy
- Modais e popups

## 🎉 Benefícios

1. **Tracking Automático**: Não precisa de código manual
2. **Persistência**: Click ID mantido entre páginas
3. **Integração Completa**: Facebook + Kwai + UTMs
4. **Idêntico ao Bot**: Mesma lógica do sistema Telegram
5. **Debug Completo**: Logs detalhados para desenvolvimento
6. **Fallbacks**: Múltiplas estratégias de captura

## 🚀 Próximos Passos

1. Configurar variáveis de ambiente
2. Testar com `node test-tracking-completo.js`
3. Verificar logs no console do navegador
4. Monitorar eventos na plataforma Kwai
5. Ajustar propriedades dos eventos conforme necessário

---

**Sistema implementado e testado para funcionar IDENTICAMENTE ao bot do Telegram, adaptado para web.**
