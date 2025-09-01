# Facebook Pixel Manager - Sistema Robusto de Inicialização

## 📋 Visão Geral

O **Facebook Pixel Manager** é um sistema robusto para inicialização do Facebook Pixel que carrega dinamicamente as configurações do arquivo `.env` e garante que o pixel seja inicializado corretamente antes de disparar qualquer evento.

## 🚀 Características Principais

### ✅ Carregamento Dinâmico de Configurações
- Carrega `FB_PIXEL_ID` e `FB_PIXEL_TOKEN` diretamente do `.env`
- Não requer configuração hardcoded no front-end
- Atualização automática das configurações sem rebuild

### ✅ Inicialização Condicional
- O evento `fbq('init', FB_PIXEL_ID)` só é executado após o ID estar disponível
- PageView e outros eventos só são disparados após inicialização bem-sucedida
- Sistema de retry inteligente com backoff exponencial

### ✅ Modo de Teste Automático
- Suporte ao `FORCE_FB_TEST_MODE=true` no `.env`
- Adiciona automaticamente `test_event_code: "TEST74140"` em todos os eventos
- Controle centralizado do modo de teste

### ✅ Compatibilidade com SPAs
- Funciona perfeitamente com Next.js, React, Vue.js e outros frameworks
- Aguarda hidratação e disponibilidade das variáveis
- Sistema de reinicialização para mudanças de rota

## 🔧 Configuração

### 1. Variáveis de Ambiente (.env)

```bash
# Obrigatório
FB_PIXEL_ID=123456789012345

# Opcional - para API de Conversões
FB_PIXEL_TOKEN=your_facebook_pixel_token

# Opcional - ativar modo de teste
FORCE_FB_TEST_MODE=true
```

### 2. Inclusão nos Arquivos HTML

```html
<!-- Incluir o manager antes de qualquer outro script do Facebook -->
<script src="fb-pixel-manager.js"></script>

<!-- Script de compatibilidade (opcional) -->
<script>
  // Aguardar pixel estar pronto
  function waitForPixelManager(callback) {
    if (window.FBPixelManager && window.FBPixelManager.isReady()) {
      callback();
    } else {
      setTimeout(() => waitForPixelManager(callback), 100);
    }
  }
  
  // Usar o sistema
  waitForPixelManager(() => {
    window.FBPixelManager.track('ViewContent', {
      value: 97.0,
      currency: 'BRL'
    });
  });
</script>
```

## 📖 API de Uso

### Verificar Status
```javascript
// Verificar se está pronto
const isReady = window.FBPixelManager.isReady();

// Obter status completo
const status = window.FBPixelManager.getStatus();
console.log(status);
```

### Rastrear Eventos
```javascript
// Rastrear evento com Promise
window.FBPixelManager.track('Purchase', {
  value: 97.0,
  currency: 'BRL',
  content_name: 'Produto Exemplo'
}).then(result => {
  console.log('Evento enviado:', result);
}).catch(error => {
  console.error('Erro:', error);
});

// Eventos suportados: PageView, ViewContent, AddToCart, Purchase, etc.
```

### Configurações
```javascript
// Obter configuração atual
const config = window.FBPixelManager.getConfig();
console.log('Pixel ID:', config.FB_PIXEL_ID);
console.log('Modo de Teste:', config.FORCE_FB_TEST_MODE);

// Gerar Event ID
const eventId = window.FBPixelManager.generateEventID('Purchase');

// Adicionar test_event_code manualmente
const eventData = window.FBPixelManager.addTestEventCode({
  value: 97.0,
  currency: 'BRL'
});
```

### Reinicialização (para SPAs)
```javascript
// Forçar reinicialização (útil após mudanças de rota)
window.FBPixelManager.reinitialize().then(() => {
  console.log('Pixel reinicializado');
});
```

### Debug
```javascript
// Ativar logs de debug
window.FBPixelManager.enableDebug();

// Desativar logs de debug
window.FBPixelManager.disableDebug();
```

## 🔄 Fluxo de Inicialização

1. **Carregamento do Script**: O manager é carregado e inicia automaticamente
2. **Busca de Configurações**: Faz requisição para `/api/config` para obter configurações do .env
3. **Inicialização do SDK**: Carrega o SDK do Facebook Pixel
4. **Inicialização do Pixel**: Executa `fbq('init', PIXEL_ID)`
5. **Eventos Iniciais**: Dispara PageView automático
6. **Pronto para Uso**: API fica disponível para rastreamento

## 🛠️ Compatibilidade com Código Legado

O sistema mantém total compatibilidade com código existente:

```javascript
// Código legado ainda funciona
if (window.fbConfig && window.fbConfig.loaded) {
  // Usar fbConfig normalmente
}

// Função addTestEventCode ainda disponível
const data = addTestEventCode({ value: 97.0, currency: 'BRL' });
```

## 🔍 Debug e Monitoramento

### Logs Automáticos
- Logs detalhados no console (modo debug)
- Rastreamento de tentativas e erros
- Auditoria de eventos enviados

### Eventos Customizados
```javascript
// Escutar quando o pixel estiver pronto
window.addEventListener('fbPixelManagerReady', (event) => {
  console.log('Pixel pronto:', event.detail);
});
```

### Health Check
```javascript
// Verificar saúde do sistema
const status = window.FBPixelManager.getStatus();
console.log('Sistema funcionando:', status.ready);
console.log('Configurações carregadas:', status.state.configLoaded);
console.log('Callbacks pendentes:', status.pendingCallbacks);
```

## ⚠️ Solução de Problemas

### Pixel não inicializa
1. Verificar se `FB_PIXEL_ID` está definido no `.env`
2. Verificar se endpoint `/api/config` está respondendo
3. Verificar console para erros de rede
4. Verificar se não há AdBlockers interferindo

### Eventos não disparam
1. Aguardar `FBPixelManager.isReady()` retornar `true`
2. Verificar se há erros no console
3. Verificar se cookies `_fbp` e `_fbc` estão sendo definidos
4. Verificar se modo de teste está configurado corretamente

### Modo de Teste não funciona
1. Verificar se `FORCE_FB_TEST_MODE=true` no `.env`
2. Verificar se endpoint `/api/config` retorna `FORCE_FB_TEST_MODE: true`
3. Verificar se eventos incluem `test_event_code` no payload

## 🚀 Migração do Sistema Legado

### Passo 1: Incluir o novo sistema
```html
<script src="fb-pixel-manager.js"></script>
```

### Passo 2: Aguardar inicialização
```javascript
// Substituir código direto do fbq por:
waitForPixelManager(() => {
  window.FBPixelManager.track('Purchase', eventData);
});
```

### Passo 3: Remover inicialização manual (opcional)
- O manager cuida de toda a inicialização
- Remover código de carregamento manual do SDK
- Remover configuração hardcoded de PIXEL_ID

## 📈 Benefícios

- ✅ **Confiabilidade**: Sistema robusto com retry automático
- ✅ **Flexibilidade**: Configuração via .env sem rebuild
- ✅ **Compatibilidade**: Funciona com SPAs e código legado
- ✅ **Debug**: Logs detalhados para troubleshooting
- ✅ **Teste**: Controle centralizado do modo de teste
- ✅ **Performance**: Carregamento otimizado e deduplicação

## 🔒 Segurança

- Configurações sensíveis não são expostas no front-end
- Token do Facebook não é enviado para o cliente
- Validação de configurações no servidor
- Logs de auditoria para rastreamento de eventos
