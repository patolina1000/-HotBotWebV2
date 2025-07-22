# 🔥 RELATÓRIO: Correção do Bug dos UTMs

## 📌 **Problema Identificado**

Os parâmetros UTM da URL (`utm_source`, `utm_medium`, `utm_campaign`) estavam sendo **ignorados** e substituídos por valores antigos do cache/cookie (ex: 'instagram', 'bio', 'bio-instagram'), mesmo quando a URL atual continha UTMs corretos como:
```
https://ohvips.xyz/?utm_source=FB&utm_medium=Conjunto_Teste%7C987654321&utm_campaign=Campanha_Teste%7C123456789
```

## 🔍 **Causas Raiz Identificadas**

### 1. **Função `mergeTrackingData` ignorava UTMs**
**Arquivo**: `services/trackingValidation.js`
- ❌ **PROBLEMA**: A função só processava 4 campos: `['fbp', 'fbc', 'ip', 'user_agent']`
- ❌ **PROBLEMA**: UTMs eram completamente ignorados no merge
- ❌ **PROBLEMA**: Não havia lógica para priorizar UTMs da requisição atual

### 2. **`dadosRequisicao` não incluía UTMs**
**Arquivo**: `MODELO1/core/TelegramBotService.js` (linha ~459)
- ❌ **PROBLEMA**: O objeto `dadosRequisicao` só incluía dados de tracking (fbp, fbc, ip, user_agent)
- ❌ **PROBLEMA**: UTMs da URL atual não eram adicionados ao objeto para merge

### 3. **Fallbacks fixos mascaravam o problema**
**Arquivo**: `MODELO1/core/TelegramBotService.js` (linha ~1267)
- ❌ **PROBLEMA**: Quando não havia tracking data, usava fallbacks fixos:
  - `utm_source: 'telegram'`
  - `utm_campaign: 'bot_principal'` 
  - `utm_medium: 'telegram_bot'`

## ✅ **Correções Implementadas**

### 1. **Correção da função `mergeTrackingData`**
```javascript
// ✅ NOVA LÓGICA: Priorizar UTMs da requisição atual
const utmFields = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
const hasNewUtms = utmFields.some(field => dadosRequisicao[field]);

if (hasNewUtms) {
  // Usar UTMs da requisição atual + fallback para campos vazios
  utmFields.forEach(field => {
    utmFromRequest[field] = dadosRequisicao[field] || dadosSalvos[field] || null;
  });
} else {
  // Manter UTMs salvos quando não há novos
  utmFields.forEach(field => {
    utmFromRequest[field] = dadosSalvos[field] || null;
  });
}
```

### 2. **Inclusão de UTMs em `dadosRequisicao`**
```javascript
const dadosRequisicao = {
  fbp: reqFbp || req.body.fbp || req.body._fbp || cookies._fbp || cookies.fbp || null,
  fbc: reqFbc || req.body.fbc || req.body._fbc || cookies._fbc || cookies.fbc || null,
  ip: reqIp || ipBody || ipRaw || null,
  user_agent: reqUa || uaCriacao || null,
  // 🔥 CORREÇÃO: Incluir UTMs da URL atual
  utm_source: utm_source || null,
  utm_medium: utm_medium || null,
  utm_campaign: utm_campaign || null,
  utm_term: utm_term || null,
  utm_content: utm_content || null
};
```

### 3. **Melhoria na lógica de cobrança**
```javascript
// 🔥 CORREÇÃO: Priorizar sessionTracking sobre cache antigo
const finalUtms = {
  utm_source: (sessionTrack?.utm_source && sessionTrack.utm_source !== 'unknown') 
    ? sessionTrack.utm_source : (track.utm_source || 'telegram'),
  utm_campaign: (sessionTrack?.utm_campaign && sessionTrack.utm_campaign !== 'unknown') 
    ? sessionTrack.utm_campaign : (track.utm_campaign || 'bot_principal'),
  utm_medium: (sessionTrack?.utm_medium && sessionTrack.utm_medium !== 'unknown') 
    ? sessionTrack.utm_medium : (track.utm_medium || 'telegram_bot')
};
```

### 4. **Logs de Debug Adicionados**
- ✅ Logs detalhados dos UTMs extraídos da requisição
- ✅ Logs do processo de merge dos dados
- ✅ Logs dos UTMs finais usados na cobrança
- ✅ Logs comparativos entre sessionTracking e cache

## 🧪 **Testes Realizados**

### Teste 1: UTMs novos devem sobrepor antigos
```
ENTRADA:
- Dados salvos: utm_source='instagram', utm_medium='bio', utm_campaign='bio-instagram'
- Dados novos: utm_source='FB', utm_medium='Conjunto_Teste|987654321', utm_campaign='Campanha_Teste|123456789'

RESULTADO: ✅ SUCESSO
- utm_source: 'FB' (novo)
- utm_medium: 'Conjunto_Teste|987654321' (novo)  
- utm_campaign: 'Campanha_Teste|123456789' (novo)
```

### Teste 2: UTMs salvos devem ser mantidos quando não há novos
```
ENTRADA:
- Dados salvos: utm_source='instagram', utm_medium='bio', utm_campaign='bio-instagram'
- Dados novos: (apenas fbp, fbc, ip, user_agent - sem UTMs)

RESULTADO: ✅ SUCESSO  
- utm_source: 'instagram' (mantido)
- utm_medium: 'bio' (mantido)
- utm_campaign: 'bio-instagram' (mantido)
```

## 📋 **Comportamento Esperado Após Correção**

1. **URL com UTMs novos**: 
   - `https://ohvips.xyz/?utm_source=FB&utm_medium=Conjunto_Teste%7C987654321&utm_campaign=Campanha_Teste%7C123456789`
   - ✅ **Resultado**: UTMs do evento = `utm_source='FB'`, `utm_medium='Conjunto_Teste|987654321'`, `utm_campaign='Campanha_Teste|123456789'`

2. **URL sem UTMs**: 
   - `https://ohvips.xyz/`
   - ✅ **Resultado**: UTMs do evento = valores salvos anteriormente ou fallbacks ('telegram', 'bot_principal', 'telegram_bot')

3. **Prioridade de dados**:
   - 🥇 **1º**: UTMs da URL atual (req.body)
   - 🥈 **2º**: UTMs do sessionTracking (dados recentes)
   - 🥉 **3º**: UTMs do cache/banco (dados antigos)
   - 🔄 **4º**: Fallbacks padrão

## 🎯 **Validação da Correção**

Para validar se a correção funcionou, verifique nos logs:

```bash
# 1. UTMs extraídos da requisição
[DEBUG] 🎯 UTMs extraídos da requisição: { utm_source: 'FB', utm_medium: 'Conjunto_Teste|987654321', utm_campaign: 'Campanha_Teste|123456789' }

# 2. UTMs após merge
[DEBUG] 🎯 UTMs FINAIS após merge: { utm_source: 'FB', utm_medium: 'Conjunto_Teste|987654321', utm_campaign: 'Campanha_Teste|123456789' }

# 3. UTMs usados na cobrança  
[DEBUG] 🎯 UTMs FINAIS para cobrança: { utm_source: 'FB', utm_campaign: 'Campanha_Teste|123456789', utm_medium: 'Conjunto_Teste|987654321' }
```

## 📁 **Arquivos Modificados**

1. **`services/trackingValidation.js`** - Função `mergeTrackingData` corrigida
2. **`MODELO1/core/TelegramBotService.js`** - Inclusão de UTMs em `dadosRequisicao` e melhoria na lógica de cobrança

---

✅ **STATUS**: **CORRIGIDO**  
🚀 **Impacto**: UTMs da URL atual são corretamente priorizados sobre dados antigos  
📊 **Rastreabilidade**: Logs detalhados permitem debugging futuro