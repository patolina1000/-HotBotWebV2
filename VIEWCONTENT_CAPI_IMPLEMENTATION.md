# 🔥 Implementação ViewContent via Meta Conversions API

## 📋 Resumo da Implementação

Implementação completa do evento **ViewContent** via Meta Conversions API (server-side) com **deduplicação garantida** com o Pixel e **conformidade 100%** com a documentação oficial da Meta.

### ✅ Checklist de Conformidade Atendido

- ✅ **event_name**: "ViewContent"
- ✅ **eventID**: reutilizado do Pixel para deduplicação
- ✅ **event_source_url**: extraído de `req.body.url`
- ✅ **user_data**: contém pelo menos 2 parâmetros obrigatórios (fbp, fbc, ip, user_agent, external_id)
- ✅ **Dados sensíveis**: hasheados automaticamente (SHA-256)
- ✅ **Payload**: 100% conforme API da Meta
- ✅ **Arquitetura**: preservada sem modificações estruturais

## 🛠️ Implementação Técnica

### 1. Nova Rota API

**Endpoint**: `POST /api/capi/viewcontent`

**Localização**: `server.js` (linhas 325-450)

```javascript
app.post('/api/capi/viewcontent', async (req, res) => {
  // Implementação completa com validações e conformidade Meta
});
```

### 2. Campos Obrigatórios

| Campo | Tipo | Descrição | Validação |
|-------|------|-----------|-----------|
| `event_id` | String | ID único para deduplicação com Pixel | Obrigatório |
| `url` | String | URL da página (event_source_url) | Obrigatório |
| `fbp` | String | Cookie _fbp do Facebook | Recomendado |
| `fbc` | String | Cookie _fbc do Facebook | Recomendado |
| `ip` | String | IP do usuário | Extraído automaticamente se não fornecido |
| `user_agent` | String | User-Agent do navegador | Extraído automaticamente se não fornecido |
| `external_id` | String | ID externo do usuário | Opcional, hasheado automaticamente |

### 3. Campos Opcionais

| Campo | Tipo | Padrão | Descrição |
|-------|------|--------|-----------|
| `content_type` | String | "product" | Tipo de conteúdo visualizado |
| `value` | Number | - | Valor monetário (opcional) |
| `currency` | String | "BRL" | Moeda (se value fornecido) |

## 🔧 Integração no Frontend

### Exemplo Básico

```javascript
// 1. Gerar eventID compartilhado
const eventId = generateEventID('ViewContent');

// 2. Enviar via Pixel
fbq('track', 'ViewContent', {
  value: 15.90,
  currency: 'BRL',
  eventID: eventId // IMPORTANTE: mesmo ID para deduplicação
});

// 3. Enviar via CAPI
await fetch('/api/capi/viewcontent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    event_id: eventId, // MESMO ID do Pixel
    url: window.location.href,
    fbp: getCookie('_fbp'),
    fbc: getCookie('_fbc'),
    content_type: 'product',
    value: 15.90,
    currency: 'BRL'
  })
});
```

### Implementação Completa

Consulte o arquivo `viewcontent-capi-example.js` para exemplos completos de integração.

## 🔒 Segurança e Validações

### 1. Validação de Parâmetros Mínimos

A API valida que pelo menos **2 parâmetros** estão presentes em `user_data`:
- `fbp`
- `fbc` 
- `client_ip_address`
- `client_user_agent`
- `external_id`

### 2. Hash Automático de Dados Sensíveis

```javascript
// external_id é automaticamente hasheado se não estiver no formato SHA-256
if (external_id.length !== 64 || !/^[a-f0-9]+$/i.test(external_id)) {
  user_data.external_id = crypto.createHash('sha256').update(external_id).digest('hex');
}
```

### 3. Deduplicação Ativa

- Sistema de cache com TTL de 10 minutos
- Chave de deduplicação: `event_name|event_id|event_time|fbp|fbc`
- Eventos duplicados são ignorados automaticamente

## 📊 Monitoramento e Logs

### Logs de Sucesso
```
✅ ViewContent validado com 3 parâmetros: [fbp, fbc, client_ip_address]
📤 Enviando evento ViewContent via CAPI | Event ID: e7a2b4c8 | URL: https://example.com
✅ Evento ViewContent enviado com sucesso via CAPI | Event ID: e7a2b4c8
```

### Logs de Erro
```
❌ ViewContent rejeitado: insuficientes parâmetros de user_data. Disponíveis: [fbp]. Necessários: pelo menos 2
```

## 🚀 Exemplos de Uso

### 1. Landing Page (Entrada)

```javascript
document.addEventListener('DOMContentLoaded', async () => {
  const eventId = generateEventID('ViewContent');
  
  // Pixel
  fbq('track', 'ViewContent', { eventID: eventId });
  
  // CAPI
  await fetch('/api/capi/viewcontent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_id: eventId,
      url: window.location.href,
      fbp: getCookie('_fbp'),
      fbc: getCookie('_fbc'),
      content_type: 'landing_page'
    })
  });
});
```

### 2. CTA Click

```javascript
document.getElementById('cta').addEventListener('click', async () => {
  const eventId = generateEventID('ViewContent');
  
  // Pixel
  fbq('track', 'ViewContent', {
    content_name: 'CTA Clicked',
    eventID: eventId
  });
  
  // CAPI
  await fetch('/api/capi/viewcontent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_id: eventId,
      url: window.location.href,
      fbp: getCookie('_fbp'),
      fbc: getCookie('_fbc'),
      content_type: 'cta_engagement'
    })
  });
});
```

### 3. Usuário Identificado

```javascript
async function sendViewContentForUser(userId, userToken) {
  const eventId = generateEventID('ViewContent', userId);
  
  // Pixel
  fbq('track', 'ViewContent', { eventID: eventId });
  
  // CAPI
  await fetch('/api/capi/viewcontent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_id: eventId,
      url: window.location.href,
      fbp: getCookie('_fbp'),
      fbc: getCookie('_fbc'),
      external_id: userToken, // Será hasheado automaticamente
      content_type: 'user_content'
    })
  });
}
```

## 🔄 Fluxo de Deduplicação

```
1. Frontend gera eventID único
   ↓
2. Pixel envia evento com eventID
   ↓
3. CAPI recebe mesmo eventID
   ↓
4. Meta deduplica automaticamente
   ↓
5. Apenas 1 evento é contabilizado
```

## 📈 Respostas da API

### Sucesso
```json
{
  "success": true,
  "message": "Evento ViewContent enviado com sucesso",
  "event_id": "e7a2b4c8",
  "event_time": 1703123456
}
```

### Deduplicação
```json
{
  "success": true,
  "message": "Evento já foi enviado (deduplicação ativa)",
  "event_id": "e7a2b4c8",
  "duplicate": true
}
```

### Erro de Validação
```json
{
  "success": false,
  "error": "Parâmetros insuficientes para ViewContent",
  "details": "ViewContent rejeitado: insuficientes parâmetros de user_data...",
  "available_params": ["fbp"],
  "required_count": 2
}
```

## 🛡️ Conformidade com LGPD/GDPR

- ✅ Dados pessoais hasheados automaticamente (SHA-256)
- ✅ Validação de formato de hash antes do envio
- ✅ Logs de auditoria de segurança
- ✅ Não exposição de dados sensíveis em logs

## 🔧 Funções Utilizadas

### Do Sistema Existente
- ✅ `sendFacebookEvent()` - Envio para Meta
- ✅ `generateEventId()` - Geração de IDs únicos
- ✅ Deduplicação automática (cache existente)
- ✅ Validações de segurança existentes

### Novas Validações
- ✅ Validação específica para ViewContent
- ✅ Hash automático de external_id
- ✅ Extração automática de IP/User-Agent

## 📝 Notas Importantes

1. **Deduplicação**: O mesmo `event_id` DEVE ser usado no Pixel e CAPI
2. **Timing**: Recomenda-se enviar CAPI logo após o Pixel
3. **Fallback**: Se fbp/fbc não estiverem disponíveis, usar IP + User-Agent
4. **Testing**: Em ambiente de desenvolvimento, use `FB_TEST_EVENT_CODE`
5. **Produção**: Remover completamente `test_event_code` em produção

## 🚀 Deploy e Ativação

A implementação está **pronta para uso imediato**:

1. ✅ Rota API implementada em `server.js`
2. ✅ Validações e segurança configuradas
3. ✅ Integração com sistema existente
4. ✅ Exemplos de frontend disponíveis
5. ✅ Documentação completa

**Para ativar**: Integre o código de exemplo nos seus arquivos HTML existentes.