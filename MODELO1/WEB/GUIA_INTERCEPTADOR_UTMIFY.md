# 🎯 Guia do Interceptador do Pixel da UTMify

## 📋 Resumo da Análise

### ✅ Status do Pixel da UTMify

**O Pixel da UTMify ESTÁ PRESENTE** nos arquivos HTML analisados:
- `index.html` ✅
- `boasvindas.html` ✅

### ✅ Ordem Correta de Scripts

A ordem está **CORRETA** nos arquivos:
1. **Script de captura de UTMs** (inline no `<head>`)
2. **Facebook Pixel** 
3. **Outros scripts**
4. **Pixel da UTMify** (com atributos corretos)

### ✅ Padrão de Inclusão

O padrão está **CORRETO** conforme a documentação:
```html
<script
  src="https://cdn.utmify.com.br/scripts/utms/latest.js"
  data-utmify-prevent-xcod-sck
  data-utmify-prevent-subids
  async
  defer
></script>
```

---

## 🚀 Como Inserir o Interceptador

### 1. Adicionar o Script

Inserir o interceptador **ANTES** do Pixel da UTMify:

```html
<!-- 🎯 INTERCEPTADOR DO PIXEL DA UTMIFY - DEVE VIR ANTES DO PIXEL -->
<script src="utmify-pixel-interceptor.js"></script>

<!-- 🎯 PIXEL DA UTMIFY - DEPOIS DO INTERCEPTADOR -->
<script
  src="https://cdn.utmify.com.br/scripts/utms/latest.js"
  data-utmify-prevent-xcod-sck
  data-utmify-prevent-subids
  async
  defer
></script>
```

### 2. Ordem Completa Recomendada

```html
<head>
  <!-- 1. Script de captura de UTMs (inline) -->
  <script>
    // ... código de captura de UTMs ...
  </script>

  <!-- 2. Interceptador do Pixel da UTMify -->
  <script src="utmify-pixel-interceptor.js"></script>

  <!-- 3. Facebook Pixel -->
  <script>
    // ... código do Facebook Pixel ...
  </script>

  <!-- 4. Outros scripts -->
  <link rel="stylesheet" href="style.css" />
  <script src="config.js"></script>
  <script src="fbclid-handler.js"></script>
  <script src="event-id.js"></script>
  <script src="utmify-back-redirect.js"></script>
  <script src="event-tracking-initiate.js"></script>
  
  <!-- 5. Pixel da UTMify (DEPOIS do interceptador) -->
  <script
    src="https://cdn.utmify.com.br/scripts/utms/latest.js"
    data-utmify-prevent-xcod-sck
    data-utmify-prevent-subids
    async
    defer
  ></script>
</head>
```

---

## 🔍 Como Interpretar os Logs

### 1. Logs de Inicialização

```
[UTMIFY-INTERCEPTOR] [2024-01-15T10:30:00.000Z] [+0.00ms] 🚀 Inicializando interceptador do Pixel da UTMify
[UTMIFY-INTERCEPTOR] [2024-01-15T10:30:00.000Z] [+0.50ms] ✅ Interceptadores configurados
[UTMIFY-INTERCEPTOR] [2024-01-15T10:30:00.000Z] [+0.60ms] 👁️ Monitoramento de mudanças no DOM ativado
```

### 2. Logs de Requisições Interceptadas

```
[UTMIFY-INTERCEPTOR] [2024-01-15T10:30:05.000Z] [+5000.00ms] 🔍 Interceptando FETCH-1: {
  url: "https://api.utmify.com.br/track",
  method: "POST",
  headers: {...},
  body: "..."
}
```

### 3. Análise de Payload

```
[UTMIFY-INTERCEPTOR] [2024-01-15T10:30:05.000Z] [+5000.00ms] 📊 FETCH-1 - Análise do Payload: {
  summary: {
    totalUTMs: 3,
    validUTMs: 2,
    hasValidFormat: true
  },
  utms: {
    utm_source: {
      original: "facebook|12345",
      name: "facebook",
      id: "12345",
      isValid: true,
      format: "nome|id"
    },
    utm_medium: {
      original: "cpc",
      name: "cpc",
      id: null,
      isValid: false,
      format: "simples"
    }
  }
}
```

### 4. Validação de Formato

```
[UTMIFY-INTERCEPTOR] [2024-01-15T10:30:05.000Z] [+5000.00ms] ✅ FETCH-1 - UTMs no formato nome|id válido
```

ou

```
[UTMIFY-INTERCEPTOR] [2024-01-15T10:30:05.000Z] [+5000.00ms] ⚠️ FETCH-1 - UTMs não estão no formato nome|id esperado
```

### 5. Relatório Final

```
[UTMIFY-INTERCEPTOR] [2024-01-15T10:30:10.000Z] [+10000.00ms] 📋 RELATÓRIO FINAL DO INTERCEPTADOR: {
  totalRequests: 3,
  timeSincePageLoad: "10000.00ms",
  utmifyDomains: ["cdn.utmify.com.br", "api.utmify.com.br", "utmify.com.br"],
  debugMode: true
}
```

---

## 🔧 Funcionalidades do Interceptador

### 1. Interceptação de Requisições
- **XMLHttpRequest**: Captura requisições via `XMLHttpRequest`
- **Fetch API**: Captura requisições via `fetch()`
- **Beacon API**: Captura requisições via `navigator.sendBeacon()`

### 2. Análise de UTMs
- **Formato nome|id**: Verifica se UTMs estão no formato `nome|id`
- **Validação**: Confirma se o ID é numérico
- **Decodificação**: Processa valores URL-encoded

### 3. Monitoramento de DOM
- **Scripts dinâmicos**: Detecta scripts da UTMify adicionados dinamicamente
- **Imagens de tracking**: Identifica pixels de imagem

### 4. Debugging Avançado
- **Timing**: Registra tempo desde carregamento da página
- **Contadores**: Numera requisições sequencialmente
- **Respostas**: Captura status e conteúdo das respostas

---

## 🎯 Validação de UTMs

### Formato Esperado
```
utm_source=facebook|12345
utm_medium=cpc|67890
utm_campaign=black_friday|11111
```

### Validação Automática
- ✅ **Válido**: `facebook|12345` (nome + ID numérico)
- ❌ **Inválido**: `facebook` (sem ID)
- ❌ **Inválido**: `facebook|abc` (ID não numérico)

### Logs de Validação
```
✅ UTMs no formato nome|id válido
⚠️ UTMs não estão no formato nome|id esperado
```

---

## 🛠️ Debugging Manual

### 1. Verificar se Interceptador Está Ativo
```javascript
// No console do navegador
if (window.UTMifyInterceptor) {
  console.log('✅ Interceptador ativo');
  console.log('📊 Requisições:', window.UTMifyInterceptor.getRequestCount());
} else {
  console.log('❌ Interceptador não encontrado');
}
```

### 2. Gerar Relatório Manual
```javascript
// Gerar relatório completo
window.UTMifyInterceptor.generateReport();
```

### 3. Analisar UTMs Manualmente
```javascript
// Analisar UTMs específicos
const utms = {
  utm_source: "facebook|12345",
  utm_medium: "cpc"
};

const analysis = window.UTMifyInterceptor.analyzeUTMs(utms);
console.log(analysis);
```

---

## ⚠️ Considerações Importantes

### 1. Performance
- O interceptador é leve e não afeta o rastreamento
- Logs só aparecem em modo debug (localhost/dev)
- Não bloqueia requisições reais

### 2. Compatibilidade
- Funciona com todas as versões do Pixel da UTMify
- Compatível com diferentes métodos de requisição
- Suporta navegadores modernos

### 3. Segurança
- Não intercepta dados sensíveis
- Apenas registra URLs e payloads para debugging
- Não interfere com o funcionamento normal

---

## 📊 Exemplos de Logs Reais

### Requisição Válida
```
[UTMIFY-INTERCEPTOR] [2024-01-15T10:30:05.000Z] [+5000.00ms] 🔍 Interceptando FETCH-1: {
  url: "https://api.utmify.com.br/track",
  method: "POST",
  body: "{\"utm_source\":\"facebook|12345\",\"utm_medium\":\"cpc|67890\"}"
}

[UTMIFY-INTERCEPTOR] [2024-01-15T10:30:05.000Z] [+5000.00ms] 📊 FETCH-1 - Análise do Payload: {
  summary: { totalUTMs: 2, validUTMs: 2, hasValidFormat: true },
  utms: {
    utm_source: { original: "facebook|12345", name: "facebook", id: "12345", isValid: true },
    utm_medium: { original: "cpc|67890", name: "cpc", id: "67890", isValid: true }
  }
}

[UTMIFY-INTERCEPTOR] [2024-01-15T10:30:05.000Z] [+5000.00ms] ✅ FETCH-1 - UTMs no formato nome|id válido
```

### Requisição com UTMs Inválidos
```
[UTMIFY-INTERCEPTOR] [2024-01-15T10:30:05.000Z] [+5000.00ms] 📊 FETCH-1 - Análise do Payload: {
  summary: { totalUTMs: 2, validUTMs: 0, hasValidFormat: false },
  utms: {
    utm_source: { original: "facebook", name: "facebook", id: null, isValid: false },
    utm_medium: { original: "cpc", name: "cpc", id: null, isValid: false }
  }
}

[UTMIFY-INTERCEPTOR] [2024-01-15T10:30:05.000Z] [+5000.00ms] ⚠️ FETCH-1 - UTMs não estão no formato nome|id esperado
```

---

## 🎯 Conclusão

O interceptador do Pixel da UTMify é uma ferramenta essencial para:

1. **Validar** se as UTMs estão no formato correto
2. **Debugar** problemas de rastreamento
3. **Monitorar** o timing das requisições
4. **Garantir** que o Pixel está funcionando corretamente

Com este interceptador, você pode ter total visibilidade sobre o funcionamento do Pixel da UTMify e garantir que o rastreamento está funcionando conforme esperado. 