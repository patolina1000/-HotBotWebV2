# 🔥 Sistema de Rastreamento de Eventos - AddToCart + InitiateCheckout

## 📋 Visão Geral

Sistema robusto para rastreamento de eventos de conversão no Facebook Pixel, implementando **AddToCart** e **InitiateCheckout** com deduplicação avançada e logging detalhado.

## 🎯 Funcionalidades

### ✅ Eventos Implementados
- **AddToCart**: Disparado quando usuário inicia processo de compra
- **InitiateCheckout**: Disparado em sequência após AddToCart
- **Deduplicação**: EventID único para cada evento
- **Cookies**: Captura automática de _fbp e _fbc
- **Logging**: Console logs detalhados para debug

### 🔧 Características Técnicas
- **EventID Robusto**: Timestamp + Random + Session ID
- **Fallback fbclid**: Geração de _fbc a partir do fbclid
- **Session Storage**: Controle de eventos por sessão
- **Local Storage**: Armazenamento do checkout_event_id
- **Validação**: Verificação do Facebook Pixel antes do disparo

## 📦 Arquivos do Sistema

```
MODELO1/WEB/
├── event-tracking-initiate.js    # Script principal
├── event-tracking-example.html   # Página de teste
├── utm-capture.js               # Captura de UTMs
├── fbclid-handler.js            # Processamento de fbclid
└── event-id.js                  # Geração de EventID
```

## 🚀 Como Usar

### 1. Incluir o Script

```html
<!-- Scripts necessários -->
<script src="utm-capture.js"></script>
<script src="fbclid-handler.js"></script>
<script src="event-id.js"></script>
<script src="event-tracking-initiate.js"></script>
```

### 2. Disparar Eventos

```javascript
// Disparar fluxo completo (recomendado)
window.EventTracking.triggerInitiateFlowEvents();

// Ou disparar eventos individualmente
window.EventTracking.triggerAddToCartEvent();
window.EventTracking.triggerInitiateCheckoutEvent();
```

### 3. Exemplo de Implementação

```javascript
// No evento de clique do CTA
document.getElementById('cta').addEventListener('click', function() {
    // Disparar eventos de conversão
    const flowResult = window.EventTracking.triggerInitiateFlowEvents();
    
    // Redirecionar para Telegram
    window.location.href = 'https://t.me/seubot?start=payload';
});
```

## 📊 Logs Esperados

### Console Output
```yaml
🔥 Iniciando AddToCart - EventID: atc_1703123456789_abc123_session456
🍪 FBP capturado: fb.1.1703123456.abc...
🍪 FBC capturado: fb.1.1703123456.xyz...
🔥 AddToCart disparado com sucesso!
   - EventID: atc_1703123456789_abc123_session456
   - FBP: fb.1.1703123456.abc...
   - FBC: fb.1.1703123456.xyz...
   - Valor: R$ 19.90

🛒 Iniciando InitiateCheckout - EventID: ic_1703123456890_def456_session456
💾 EventID armazenado em localStorage: ic_1703123456890_def456_session456
🛒 InitiateCheckout disparado com sucesso!
   - EventID: ic_1703123456890_def456_session456
   - FBP: fb.1.1703123456.abc...
   - FBC: fb.1.1703123456.xyz...
   - Valor: R$ 19.90

✅ Fluxo de eventos concluído!
📊 Resumo:
   - AddToCart: ✅
   - InitiateCheckout: ✅
```

## 🔧 Funções Disponíveis

### `triggerInitiateFlowEvents()`
Dispara ambos os eventos em sequência com controle de sessão.

**Retorno:**
```javascript
{
  success: true,
  addToCart: { success: true, eventID: 'atc_...', fbp: '...', fbc: '...' },
  initiateCheckout: { success: true, eventID: 'ic_...', fbp: '...', fbc: '...' },
  timestamp: 1703123456789
}
```

### `triggerAddToCartEvent()`
Dispara apenas o evento AddToCart.

### `triggerInitiateCheckoutEvent()`
Dispara apenas o evento InitiateCheckout e armazena o eventID.

### `getEventDataForBackend()`
Retorna dados capturados para envio ao backend.

**Retorno:**
```javascript
{
  checkout_event_id: 'ic_1703123456890_def456_session456',
  fbp: 'fb.1.1703123456.abc...',
  fbc: 'fb.1.1703123456.xyz...',
  timestamp: 1703123456789,
  url: 'https://site.com/page',
  user_agent: 'Mozilla/5.0...'
}
```

### `clearEventData()`
Limpa todos os dados de eventos (útil para testes).

### `validateFacebookPixel()`
Verifica se o Facebook Pixel está carregado e configurado.

### `captureFacebookCookies()`
Captura cookies _fbp e _fbc com fallback para fbclid.

## ⚙️ Configurações

### Eventos Configurados
```javascript
const EVENT_CONFIG = {
  ADD_TO_CART: {
    name: 'AddToCart',
    prefix: 'atc',
    value: 19.90,
    currency: 'BRL',
    content_type: 'product',
    content_ids: ['curso-vitalicio'],
    content_name: 'Curso Vitalício - Acesso Completo',
    content_category: 'Adult Content'
  },
  INITIATE_CHECKOUT: {
    name: 'InitiateCheckout',
    prefix: 'ic',
    value: 19.90,
    currency: 'BRL',
    content_type: 'product',
    content_ids: ['curso-vitalicio'],
    content_name: 'Curso Vitalício - Acesso Completo',
    content_category: 'Adult Content'
  }
};
```

## 🔒 Segurança e Compliance

### ✅ Dados Seguros
- **Sem dados pessoais**: Não coleta email, telefone, CPF
- **Cookies técnicos**: Apenas _fbp e _fbc
- **EventID único**: Deduplicação sem identificação pessoal
- **Session control**: Controle por sessão do navegador

### ✅ Compliance Adult Content
- **Categoria adequada**: 'Adult Content'
- **Sem identificadores**: Anonimato total
- **Dados hasheados**: Quando necessário
- **Política de dados**: Respeitada

## 🧪 Testes

### Página de Teste
Acesse `event-tracking-example.html` para testar:
- ✅ Fluxo completo
- ✅ Eventos individuais
- ✅ Validação de status
- ✅ Dados para backend
- ✅ Limpeza de dados

### Debug no Console
```javascript
// Verificar status
window.EventTracking.validateFacebookPixel();

// Capturar cookies
window.EventTracking.captureFacebookCookies();

// Limpar dados
window.EventTracking.clearEventData();
```

## 📈 Benefícios

### Para Meta Ads
- **Melhor correspondência**: Eventos estruturados
- **Deduplicação exata**: EventID único
- **Otimização**: Dados limpos para algoritmos
- **Performance**: Rastreamento eficiente

### Para Desenvolvimento
- **Debug fácil**: Logs detalhados
- **Flexibilidade**: Eventos individuais ou em fluxo
- **Manutenção**: Código modular e documentado
- **Testes**: Página de exemplo incluída

## 🚨 Troubleshooting

### Pixel não carregado
```
❌ Facebook Pixel não está carregado - fbq não disponível
```
**Solução:** Verificar se o script do Facebook está incluído e carregado.

### Cookies não encontrados
```
⚠️ FBP não encontrado
⚠️ FBC não encontrado
```
**Solução:** Verificar se o usuário passou pelo pixel antes de acessar a página.

### Eventos duplicados
```
⚠️ Eventos já disparados nesta sessão, ignorando
```
**Solução:** Usar `clearEventData()` para limpar e testar novamente.

## 📝 Exemplo de Integração Completa

```html
<!DOCTYPE html>
<html>
<head>
  <!-- Facebook Pixel -->
  <script>
    !function(f,b,e,v,n,t,s){
      if(f.fbq)return;n=f.fbq=function(){
        n.callMethod ? n.callMethod.apply(n,arguments) : n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    
    fbq('init', 'SEU_PIXEL_ID');
  </script>
  
  <!-- Scripts de tracking -->
  <script src="event-tracking-initiate.js"></script>
</head>
<body>
  <button id="cta">Quero Acessar Agora</button>
  
  <script>
    document.getElementById('cta').addEventListener('click', function() {
      // Disparar eventos de conversão
      const result = window.EventTracking.triggerInitiateFlowEvents();
      
      // Redirecionar para Telegram
      window.location.href = 'https://t.me/seubot?start=payload';
    });
  </script>
</body>
</html>
```

---

**Desenvolvido com ❤️ para otimização de campanhas no Meta Ads** 