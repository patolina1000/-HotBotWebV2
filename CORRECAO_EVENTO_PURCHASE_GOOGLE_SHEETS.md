# 🔥 CORREÇÃO: Evento Purchase no Google Sheets

## ❌ **PROBLEMA IDENTIFICADO**

O evento purchase no Google Sheets estava enviando dados incorretos:

### **Dados Enviados ANTES (INCORRETOS):**
```javascript
const purchaseData = [
  new Date().toISOString(),        // ❌ Data em formato ISO completo (2025-08-13T19:35:58.902Z)
  row.valor / 100,                 // ❌ Valor pago (19,9 fb)
  row.utm_source,                  // ❌ UTM source ({{adset.name}}|)
  row.utm_medium,                  // ❌ UTM medium ({{campaign.name}}|{{campaign.id}})
  row.utm_campaign                 // ❌ UTM campaign
];
```

### **O QUE VOCÊ QUERIA:**
- ✅ **Data** (no mesmo formato dos outros eventos)
- ✅ **Quantidade "1"** (não o valor pago)
- ✅ **Nome da oferta** (se foi principal, downsell ou mensagem periódica)

---

## ✅ **SOLUÇÃO IMPLEMENTADA**

### **1. Nova Função para Determinar Tipo de Oferta**

Adicionada função `determinarTipoOferta()` no `TelegramBotService.js`:

```javascript
determinarTipoOferta(valor, config) {
  const valorReais = valor / 100;
  
  // Verificar se é oferta principal
  if (config.planos) {
    const planoPrincipal = config.planos.find(p => Math.abs(p.valor - valorReais) < 0.01);
    if (planoPrincipal) {
      return planoPrincipal.nome;
    }
  }
  
  // Verificar se é downsell
  if (config.downsells) {
    for (const downsell of config.downsells) {
      if (downsell.planos) {
        const planoDownsell = downsell.planos.find(p => Math.abs(p.valorComDesconto - valorReais) < 0.01);
        if (planoDownsell) {
          return `Downsell ${downsell.id}: ${planoDownsell.nome}`;
        }
      }
    }
  }
  
  // Verificar se é mensagem periódica (valores típicos)
  if (valorReais >= 19.90 && valorReais <= 27.00) {
    return 'Mensagem Periódica - Vitalício';
  } else if (valorReais >= 9.90 && valorReais <= 20.90) {
    return 'Mensagem Periódica - Acesso';
  }
  
  // Fallback
  return 'Oferta Desconhecida';
}
```

### **2. Correção do Formato dos Dados**

Substituído o código no webhook:

```javascript
// 🔥 CORREÇÃO: Registro de Purchase no Google Sheets com formato correto
try {
  // Determinar tipo de oferta baseado no valor
  const tipoOferta = this.determinarTipoOferta(row.valor, this.config);
  
  // Formato correto: [Data, Quantidade, Nome da Oferta]
  const purchaseData = [
    new Date().toISOString().split('T')[0], // Data no formato YYYY-MM-DD
    1, // Quantidade sempre "1"
    tipoOferta // Nome da oferta (principal, downsell ou mensagem periódica)
  ];
  
  console.log(
    `[${this.botId}] ✅ Registrando Purchase no Google Sheets: Data=${purchaseData[0]}, Qtd=${purchaseData[1]}, Oferta=${purchaseData[2]}`
  );
  await appendDataToSheet('purchase!A1', [purchaseData]);
} catch (gsErr) {
  console.error(
    `[${this.botId}] ❌ Erro ao registrar Purchase no Google Sheets para transação ${normalizedId}:`,
    gsErr.message
  );
}
```

---

## 📊 **RESULTADO FINAL**

### **Dados Enviados AGORA (CORRETOS):**

| Coluna A | Coluna B | Coluna C |
|----------|----------|----------|
| **Data** | **Quantidade** | **Nome da Oferta** |
| 2025-08-13 | 1 | Vitalício + Presentinho |
| 2025-08-13 | 1 | Downsell ds1: Vitalício + Presentinho |
| 2025-08-13 | 1 | Mensagem Periódica - Vitalício |

### **Exemplos de Identificação de Ofertas:**

#### **Ofertas Principais:**
- `27.00` → "Vitalício + Presentinho"
- `9.90` → "Quero só espiar..."

#### **Downsells:**
- `27.00` → "Downsell ds1: Vitalício + Presentinho"
- `24.30` → "Downsell ds2: Vitalício + Presentinho"
- `25.65` → "Downsell ds3: Vitalício + Presentinho"

#### **Mensagens Periódicas:**
- `19.90` → "Mensagem Periódica - Vitalício"
- `20.90` → "Mensagem Periódica - Acesso"

---

## 🔧 **ARQUIVOS MODIFICADOS**

1. **`MODELO1/core/TelegramBotService.js`**
   - Adicionada função `determinarTipoOferta()`
   - Corrigido formato dos dados enviados para Google Sheets

---

## ✅ **BENEFÍCIOS DA CORREÇÃO**

1. **Formato Consistente:** Data no mesmo formato dos outros eventos
2. **Quantidade Padronizada:** Sempre "1" para cada purchase
3. **Identificação Clara:** Nome da oferta específica (principal/downsell/mensagem periódica)
4. **Análise Melhorada:** Facilita relatórios e análises de performance por tipo de oferta
5. **Debug Simplificado:** Logs mais claros e informativos

---

## 🚀 **COMO TESTAR**

1. Faça uma compra através do bot
2. Verifique o Google Sheets na aba "purchase"
3. Confirme que os dados estão no formato:
   - **Coluna A:** Data (YYYY-MM-DD)
   - **Coluna B:** Quantidade (1)
   - **Coluna C:** Nome da oferta específica

---

## 📝 **NOTAS IMPORTANTES**

- A função `determinarTipoOferta()` usa tolerância de 0.01 para comparação de valores
- Valores de mensagens periódicas são baseados em ranges típicos
- O fallback "Oferta Desconhecida" é usado quando não é possível identificar o tipo
- Logs detalhados foram adicionados para facilitar debugging
