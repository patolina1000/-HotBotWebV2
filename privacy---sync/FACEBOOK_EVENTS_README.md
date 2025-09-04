# 🎯 Sistema de Eventos Facebook para Privacy

Este sistema implementa o tracking completo de eventos do Facebook Pixel para a página Privacy, seguindo as melhores práticas de marketing digital.

## 🚀 Funcionalidades Implementadas

### 1. **ViewContent** (Visualização de Conteúdo)
- **Quando**: Disparado automaticamente após 2 segundos ao carregar a página
- **Propósito**: Marcar que o usuário visualizou o conteúdo da página
- **Valor**: R$ 19,90 (padrão)

### 2. **InitiateCheckout** (Início do Checkout)
- **Quando**: Disparado quando o usuário clica em qualquer botão de plano (1 mês, 3 meses, 6 meses)
- **Propósito**: Marcar que o usuário iniciou o processo de compra
- **Valor**: Dinâmico baseado no plano selecionado
- **Integração**: Conectado automaticamente aos botões de PIX

### 3. **Purchase** (Compra)
- **Quando**: Disparado quando um pagamento PIX é confirmado
- **Propósito**: Marcar que a compra foi finalizada com sucesso
- **Valor**: Dinâmico baseado no plano comprado
- **Integração**: Conectado aos webhooks de pagamento

## 📁 Arquivos do Sistema

### `facebook-event-tracking.js`
- Sistema principal de tracking
- Gerencia todos os eventos do Facebook
- Integra com botões de planos e webhooks

### `pix-plan-buttons.js`
- Gerencia os botões de PIX
- Dispara eventos quando PIX é gerado
- Integra com eventos do Facebook

### `pushinpayWebhook.js`
- Processa webhooks de pagamento
- Dispara eventos quando PIX é aprovado
- Integra com sistema de tracking

## 🔧 Como Usar

### 1. **Inclusão Automática**
O sistema é carregado automaticamente na página `index.html`:

```html
<script src="/js/facebook-event-tracking.js"></script>
```

### 2. **Verificação de Status**
```javascript
// Verificar se o sistema está funcionando
if (window.PrivacyEventTracking) {
    console.log('✅ Sistema Facebook carregado');
} else {
    console.log('❌ Sistema Facebook não encontrado');
}
```

### 3. **Disparar Eventos Manualmente**
```javascript
// ViewContent
window.PrivacyEventTracking.triggerContentViewEvent();

// InitiateCheckout
window.PrivacyEventTracking.triggerInitiateCheckoutEvent(19.90, '1 mês');

// Purchase
window.PrivacyEventTracking.triggerPurchaseEvent(19.90, '1 mês', 'transaction-123');
```

## 🧪 Página de Teste

Acesse `/test-facebook-events.html` para testar todos os eventos:

- ✅ Verificar status do sistema
- 🔥 Testar ViewContent
- 🛒 Testar InitiateCheckout com diferentes planos
- 💰 Testar Purchase com diferentes valores
- 💳 Simular geração de PIX
- 🎉 Simular aprovação de pagamento

## 📊 Dados Capturados

### Cookies Facebook
- `_fbp`: Facebook Browser ID
- `_fbc`: Facebook Click ID (com fallback para fbclid)

### Informações dos Eventos
- **EventID**: Identificador único para cada evento
- **Valor**: Valor do plano selecionado
- **Plano**: Nome do plano (1 mês, 3 meses, 6 meses)
- **Transaction ID**: ID da transação (quando disponível)
- **Timestamp**: Momento exato do evento
- **URL**: Página onde o evento foi disparado

## 🔄 Fluxo de Eventos

```
1. Usuário acessa a página
   ↓
2. Após 2 segundos → ViewContent disparado
   ↓
3. Usuário clica em plano → InitiateCheckout disparado
   ↓
4. PIX é gerado → Evento pix-generated disparado
   ↓
5. Pagamento é aprovado → Purchase disparado
```

## 🎯 Integração com Botões

### Botões Automáticos
- `#btn-1-mes` → R$ 19,90
- `#btn-3-meses` → R$ 59,70  
- `#btn-6-meses` → R$ 119,40

### Configuração Automática
```javascript
// O sistema configura automaticamente os botões
setupFacebookPlanButtons();
```

## 🌐 Integração com Webhooks

### Eventos Disparados
- `pix-generated`: Quando PIX é criado
- `payment-approved`: Quando pagamento é confirmado

### Listener Automático
```javascript
// Configurado automaticamente
setupFacebookWebhookIntegration();
```

## 📈 Monitoramento e Debug

### Console Logs
Todos os eventos são logados no console com detalhes:
```
🔥 Iniciando ViewContent - EventID: vc_1234567890_abc123_session456
✅ ViewContent disparado com sucesso!
   - EventID: vc_1234567890_abc123_session456
   - FBP: fb.1.1234567890.abc123...
   - FBC: fb.1.1234567890.def456...
   - Valor: R$ 19.90
```

### LocalStorage
Dados dos eventos são armazenados para uso posterior:
- `checkout_event_id`: ID do evento InitiateCheckout
- `purchase_event_id`: ID do evento Purchase
- `checkout_plan_info`: Informações do plano selecionado
- `purchase_info`: Informações da compra

## 🚨 Solução de Problemas

### 1. **Pixel não carregado**
```javascript
// Verificar se fbq está disponível
if (typeof fbq !== 'function') {
    console.error('Facebook Pixel não carregado');
}
```

### 2. **Eventos não disparando**
```javascript
// Verificar status do sistema
window.PrivacyEventTracking.validateFacebookPixel();
```

### 3. **Cookies não capturados**
```javascript
// Verificar cookies disponíveis
const cookies = window.PrivacyEventTracking.captureFacebookCookies();
console.log('Cookies:', cookies);
```

## 🔒 Segurança e Privacidade

- ✅ Cookies são capturados de forma segura
- ✅ Dados são armazenados localmente
- ✅ Não há envio de dados sensíveis para terceiros
- ✅ Sistema respeita configurações de privacidade do usuário

## 📱 Compatibilidade

- ✅ Chrome, Firefox, Safari, Edge
- ✅ Dispositivos móveis e desktop
- ✅ Navegadores com JavaScript habilitado
- ✅ Facebook Pixel carregado corretamente

## 🎉 Resultado Esperado

Com este sistema implementado, você terá:

1. **Tracking completo** de todos os eventos importantes
2. **Integração automática** com botões de PIX
3. **Webhooks funcionais** para confirmação de pagamentos
4. **Dados estruturados** para análise e otimização
5. **Sistema robusto** com fallbacks e tratamento de erros

## 📞 Suporte

Para dúvidas ou problemas:

1. Verifique o console do navegador para logs detalhados
2. Use a página de teste para verificar funcionalidades
3. Verifique se o Facebook Pixel está carregando corretamente
4. Confirme se os botões de PIX estão funcionando

---

**🎯 Sistema implementado e testado para máxima eficiência de tracking!**
