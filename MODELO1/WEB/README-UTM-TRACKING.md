# 🎯 UTM Tracking Script Robusto

Script JavaScript para captura e preservação robusta de parâmetros UTM, otimizado para integração com UTMify.

## 🚀 Características

- ✅ **Execução precoce**: Carrega antes de qualquer redirecionamento
- ✅ **Decodificação automática**: Trata `%7C` e outros caracteres codificados
- ✅ **Validação de formato**: Verifica estrutura `nome|id`
- ✅ **Preservação em redirecionamentos**: Mantém UTMs em navegação interna
- ✅ **Fallback inteligente**: Usa dados salvos quando URL não tem UTMs válidos
- ✅ **Logs detalhados**: Debug completo em ambiente de desenvolvimento
- ✅ **Zero dependências**: Script puro JavaScript

## 📦 Instalação

### 1. Incluir o Script

Adicione o script no `<head>` da sua página, **antes de qualquer outro script**:

```html
<head>
    <!-- UTM Tracking - DEVE SER O PRIMEIRO -->
    <script src="utm-tracking-robust.js"></script>
    
    <!-- Outros scripts depois -->
    <script src="outros-scripts.js"></script>
</head>
```

### 2. Para Single Page Apps (SPA)

Para aplicações com roteamento baseado em hash (`#`), adicione este código adicional:

```javascript
// Após carregar o script UTM Tracking
if (window.UTMTracking) {
    // Capturar UTMs em mudanças de hash
    window.addEventListener('hashchange', () => {
        window.UTMTracking.capture();
    });
    
    // Capturar UTMs em mudanças de rota (para frameworks como React/Vue)
    if (window.history && window.history.pushState) {
        const originalPushState = window.history.pushState;
        window.history.pushState = function(state, title, url) {
            originalPushState.call(this, state, title, url);
            window.UTMTracking.capture();
        };
    }
}
```

### 3. Integração com UTMify

O script é compatível com o pixel da UTMify. Certifique-se de que o script UTM Tracking seja carregado **antes** do pixel:

```html
<head>
    <!-- 1. UTM Tracking primeiro -->
    <script src="utm-tracking-robust.js"></script>
    
    <!-- 2. Pixel UTMify depois -->
    <script
        src="https://cdn.utmify.com.br/scripts/utms/latest.js"
        data-utmify-prevent-xcod-sck
        data-utmify-prevent-subids
        async
        defer
    ></script>
</head>
```

## 🔧 API do Script

### Funções Disponíveis

```javascript
// Capturar UTMs da URL atual
window.UTMTracking.capture();

// Obter UTMs processados do localStorage
const utms = window.UTMTracking.get();
// Retorna: { utm_source: "FB", utm_campaign: "Campanha|123", ... }

// Preservar UTMs em redirecionamento manual
const urlComUTMs = window.UTMTracking.preserve('/nova-pagina');
```

### Exemplo de Uso

```javascript
// Capturar UTMs quando necessário
function processarUTMs() {
    const utms = window.UTMTracking.get();
    
    if (utms.utm_campaign) {
        console.log('Campanha:', utms.utm_campaign);
        // Enviar para UTMify ou processar
    }
}

// Preservar UTMs em redirecionamento
function irParaPagina(url) {
    const urlComUTMs = window.UTMTracking.preserve(url);
    window.location.href = urlComUTMs;
}
```

## 🧪 Testes

### 1. Página de Teste

Use a página `utm-tracking-test.html` para testar diferentes cenários:

```bash
# Abrir no navegador
open utm-tracking-test.html
```

### 2. Testes Manuais

#### Teste com Pipe Codificado (`%7C`)
```
URL: /?utm_campaign=Teste%7C1234&utm_medium=Conjunto%7C5678
Resultado Esperado: utm_campaign="Teste|1234", utm_medium="Conjunto|5678"
```

#### Teste com Pipe Normal
```
URL: /?utm_campaign=Campanha_Teste|123456789&utm_medium=Conjunto_Teste|987654321
Resultado Esperado: utm_campaign="Campanha_Teste|123456789", utm_medium="Conjunto_Teste|987654321"
```

#### Teste sem Formato nome|id
```
URL: /?utm_source=FB&utm_campaign=Sem_ID
Resultado Esperado: utm_source="FB", utm_campaign="Sem_ID" (salvo mesmo sem formato)
```

### 3. Teste de Redirecionamento

```javascript
// Antes do redirecionamento
console.log('UTMs antes:', window.UTMTracking.get());

// Redirecionar
window.location.href = '/nova-pagina';

// Na nova página, verificar se UTMs foram preservados
console.log('UTMs preservados:', window.UTMTracking.get());
```

## 🔍 Debug e Logs

### Logs Automáticos

Em ambiente de desenvolvimento (`localhost` ou domínio com `dev`), o script gera logs detalhados:

```
[UTM-TRACKING] === INICIANDO CAPTURA DE UTMs ===
[UTM-TRACKING] URL Original: http://localhost:3000/?utm_campaign=Teste%7C1234
[UTM-TRACKING] Query Params Bruto: ?utm_campaign=Teste%7C1234
[UTM-TRACKING] Decodificado: "Teste%7C1234" → "Teste|1234"
[UTM-TRACKING] Parse UTM: "Teste|1234" → nome: "Teste", id: "1234", válido: true
[UTM-TRACKING] UTM utm_campaign: {raw: "Teste%7C1234", decoded: "Teste|1234", parsed: {...}}
[UTM-TRACKING] Salvo no localStorage: utm_campaign = "Teste|1234"
[UTM-TRACKING] Usando UTM da URL: utm_campaign = "Teste|1234"
[UTM-TRACKING] === UTMs CAPTURADOS === {utm_campaign: "Teste|1234"}
```

### Habilitar Logs em Produção

Para habilitar logs em produção, modifique a linha:

```javascript
const DEBUG_MODE = true; // Forçar logs em produção
```

## ⚠️ Considerações Importantes

### 1. Ordem de Carregamento

O script **DEVE** ser carregado antes de qualquer redirecionamento ou outro script que possa modificar a URL.

### 2. Compatibilidade com Browsers

- ✅ Chrome 60+
- ✅ Firefox 55+
- ✅ Safari 12+
- ✅ Edge 79+

### 3. Limitações

- Não funciona com redirecionamentos via `<meta http-equiv="refresh">`
- Não preserva UTMs em redirecionamentos do servidor (301/302)
- Requer JavaScript habilitado

### 4. Performance

- Script leve (~3KB minificado)
- Execução síncrona para captura imediata
- Sem impacto perceptível no carregamento da página

## 🐛 Troubleshooting

### Problema: UTMs não são capturados

**Solução:**
1. Verificar se o script está carregado antes de outros scripts
2. Verificar console para erros JavaScript
3. Confirmar que a URL contém parâmetros UTM válidos

### Problema: UTMs não são preservados em redirecionamento

**Solução:**
1. Verificar se o redirecionamento usa `window.location.href`
2. Confirmar que o script foi carregado antes do redirecionamento
3. Verificar logs para confirmar interceptação

### Problema: Pipe (`|`) não é decodificado

**Solução:**
1. Verificar se a URL contém `%7C` (pipe codificado)
2. Confirmar que `decodeURIComponent` está funcionando
3. Verificar logs para ver o processo de decodificação

## 📊 Monitoramento

### Métricas Recomendadas

```javascript
// Adicionar ao seu sistema de analytics
function monitorarUTMs() {
    const utms = window.UTMTracking.get();
    
    // Enviar para Google Analytics
    if (window.gtag) {
        window.gtag('event', 'utm_captured', {
            utm_source: utms.utm_source,
            utm_campaign: utms.utm_campaign,
            utm_medium: utms.utm_medium
        });
    }
    
    // Enviar para seu sistema
    if (Object.keys(utms).length > 0) {
        fetch('/api/track-utms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(utms)
        });
    }
}
```

## 🔄 Atualizações

### Versão 1.0.0
- ✅ Captura básica de UTMs
- ✅ Decodificação de caracteres especiais
- ✅ Validação de formato nome|id
- ✅ Preservação em redirecionamentos
- ✅ Logs detalhados
- ✅ API global

---

**Desenvolvido para máxima compatibilidade com UTMify e cenários reais de marketing digital.** 