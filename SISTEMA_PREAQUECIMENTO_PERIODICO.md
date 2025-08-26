# 🔥 SISTEMA DE PRÉ-AQUECIMENTO PERIÓDICO DE MÍDIAS

## 🎯 **OBJETIVO**
Manter as mídias principais sempre "aquecidas" (file_ids pré-carregados no Telegram) para garantir resposta instantânea no `/start`, eliminando latência de upload.

## 🚀 **COMO FUNCIONA**

### **1. Aquecimento Automático**
- **Frequência:** A cada 30 minutos
- **Execução inicial:** 2 minutos após inicialização
- **Mídias prioritárias:** `inicial`, `ds1`, `ds2`, `ds3`

### **2. Processo Inteligente**
```javascript
// Verifica se pool já tem file_ids suficientes
if (poolAtual.length >= 2) {
  console.log('💾 Mídia já aquecida');
  return; // Não reaquece desnecessariamente
}

// Aquece apenas se necessário
await gerenciador.criarPoolMidia(caminhoMidia, key);
```

### **3. Logs de Monitoramento**
```bash
🔥 PRÉ-AQUECIMENTO: Iniciando aquecimento periódico das mídias...
🔥 PRÉ-AQUECIMENTO: Aquecendo mídias do bot1...
💾 PRÉ-AQUECIMENTO: bot1 - inicial já aquecida (3 file_ids)
✅ PRÉ-AQUECIMENTO: bot1 - ds1 aquecida (3 file_ids)
🔥 PRÉ-AQUECIMENTO CONCLUÍDO: 8 mídias aquecidas, 0 erros em 2340ms
```

## 📊 **MONITORAMENTO**

### **Endpoints de Status**
- **Uptime:** `https://ohvips.xyz/uptime`
- **Pré-aquecimento:** `https://ohvips.xyz/preaquecimento`

### **Exemplo de Resposta `/preaquecimento`**
```json
{
  "status": "ok",
  "timestamp": "2025-08-26T15:30:00.000Z",
  "bots": {
    "bot1": {
      "ready": true,
      "totalPools": 4,
      "totalFileIds": 12,
      "pools": {
        "inicial": { "fileIds": 3, "status": "aquecida" },
        "ds1": { "fileIds": 3, "status": "aquecida" },
        "ds2": { "fileIds": 3, "status": "aquecida" },
        "ds3": { "fileIds": 3, "status": "aquecida" }
      },
      "status": "ativo"
    }
  }
}
```

## ⚡ **BENEFÍCIOS**

### **1. Performance Máxima**
- ✅ **Zero latência** no primeiro `/start`
- ✅ **Resposta instantânea** para usuários novos
- ✅ **Experiência perfeita** mesmo após cold starts

### **2. Proteção Anti-Cold Start**
- ✅ **Mídias sempre prontas** mesmo após inatividade
- ✅ **Pools renovados** automaticamente
- ✅ **Cobertura completa** para todos os bots

### **3. Uso Inteligente de Recursos**
- ✅ **Só aquece quando necessário** (pools vazios)
- ✅ **Delay entre aquecimentos** (500ms) para não sobrecarregar
- ✅ **Registro de atividade** no monitor de uptime

## 🔧 **CONFIGURAÇÃO**

### **Mídias Prioritárias**
```javascript
const midiasPrioritarias = [
  { tipo: 'inicial', key: 'inicial' },    // Mídia principal do /start
  { tipo: 'downsell', key: 'ds1' },       // Primeiro downsell
  { tipo: 'downsell', key: 'ds2' },       // Segundo downsell
  { tipo: 'downsell', key: 'ds3' }        // Terceiro downsell
];
```

### **Timing**
- **Cron:** `*/30 * * * *` (a cada 30 minutos)
- **Delay inicial:** 2 minutos após boot
- **Delay entre mídias:** 500ms

## 🎯 **ESTRATÉGIA**

### **Antes (sem pré-aquecimento):**
```
Usuário /start → Bot precisa fazer upload → 2-5s de latência → Mídia enviada
```

### **Depois (com pré-aquecimento):**
```
Usuário /start → Bot usa file_id do pool → 0s de latência → Mídia enviada instantaneamente
```

## 📈 **MÉTRICAS ESPERADAS**

- **Latência inicial:** De 2-5s para **0s**
- **Taxa de sucesso:** **100%** para mídias aquecidas
- **Uso de bandwidth:** Mínimo (apenas uploads periódicos)
- **Cold start recovery:** **Automático** em 2 minutos

## 🚨 **TROUBLESHOOTING**

### **Pool vazio após aquecimento**
```bash
⚠️ PRÉ-AQUECIMENTO: bot1 - inicial arquivo não encontrado
```
**Solução:** Verificar se arquivo existe em `./midia/inicial.mp4`

### **Bot não pronto**
```bash
⚠️ PRÉ-AQUECIMENTO: bot1 não está pronto para aquecimento
```
**Solução:** Bot ainda inicializando, aguardar próximo ciclo

### **Erro de upload**
```bash
❌ PRÉ-AQUECIMENTO: Erro ao aquecer inicial do bot1: Request failed
```
**Solução:** Problema temporário do Telegram, próximo ciclo resolverá

## 🎉 **RESULTADO FINAL**

**🚀 ZERO LATÊNCIA NO /START!**
- Usuários novos recebem mídia instantaneamente
- Pools sempre aquecidos e prontos
- Proteção total contra cold starts
- Monitoramento completo via endpoints

---

**Status:** ✅ **IMPLEMENTADO E ATIVO**
**Próximo aquecimento:** Verificar logs ou endpoint `/preaquecimento`
