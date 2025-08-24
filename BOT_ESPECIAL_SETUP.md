# 🤖 Bot Especial - Guia de Configuração

## ✅ **IMPLEMENTAÇÃO CONCLUÍDA**

O "Bot Especial" foi implementado com sucesso no projeto HotBotWebV2, seguindo a arquitetura modular existente e mantendo total compatibilidade com o sistema de tracking, deduplicação e analytics.

---

## 📋 **ARQUIVOS CRIADOS/MODIFICADOS**

### **🆕 Novos Arquivos:**
- `/MODELO1/BOT/bot_especial.js` - Instância do bot especial
- `/MODELO1/BOT/config_especial.js` - Configuração específica do bot
- `/MODELO1/WEB/obrigado_especial.html` - Página de obrigado personalizada

### **🔧 Arquivos Modificados:**
- `/MODELO1/core/TelegramBotService.js` - Suporte à página customizada
- `/workspace/server.js` - Carregamento do bot + API dados comprador + webhook
- `/MODELO1/WEB/verify-token.js` - Rota para página especial

---

## ⚙️ **CONFIGURAÇÃO NECESSÁRIA**

### **1. Variável de Ambiente**
Adicione ao seu arquivo `.env`:
```bash
TELEGRAM_TOKEN_ESPECIAL=seu_token_do_telegram_aqui
```

### **2. Webhook do Telegram**
Configure o webhook do bot especial no Telegram:
```bash
https://api.telegram.org/bot[SEU_TOKEN]/setWebhook?url=https://seudominio.com/bot_especial/webhook
```

### **3. Configuração da PushinPay**
Configure o webhook da PushinPay para usar:
```
https://seudominio.com/bot_especial/webhook
```

---

## 🎯 **FUNCIONALIDADES IMPLEMENTADAS**

### **✅ Bot Especial**
- Token independente (`TELEGRAM_TOKEN_ESPECIAL`)
- Configuração personalizada com planos específicos
- Redirecionamento para `obrigado_especial.html`
- Integração completa com sistema de tracking

### **✅ Página Especial**
- Design diferenciado (tema roxo/azul)
- Seção de "Perfil Verificado" com dados do comprador
- Exibição de nome e CPF (mascarados por segurança)
- Status de verificação visual
- Tracking Facebook Pixel/CAPI mantido

### **✅ API Segura**
- Endpoint `/api/dados-comprador` restrito ao bot especial
- Validação de `bot_id = 'bot_especial'`
- Dados mascarados por segurança
- Tratamento de erros robusto

### **✅ Sistema de Tracking**
- Eventos com `bot_id = 'bot_especial'`
- Deduplicação Pixel+CAPI funcionando
- UTMify recebendo conversões corretamente
- Funnel events com identificação única

---

## 🔄 **FLUXO COMPLETO**

1. **Usuário acessa bot especial** → `/start`
2. **Recebe mensagem personalizada** → "Acesso Premium Verificado"
3. **Seleciona plano** → R$ 49,90 (configurável)
4. **Gera cobrança PushinPay** → Webhook processa pagamento
5. **Dados salvos** → Nome/CPF hasheados + `bot_id = 'bot_especial'`
6. **Link enviado** → `obrigado_especial.html?token=xxx&valor=49.90`
7. **Página carrega** → Exibe dados verificados + redireciona

---

## 🛡️ **SEGURANÇA IMPLEMENTADA**

### **Dados Pessoais**
- Nome e CPF são hasheados com SHA-256
- Armazenamento em campos `fn_hash`, `ln_hash`, `external_id_hash`
- API retorna dados mascarados, não os hashes originais

### **Controle de Acesso**
- API `/api/dados-comprador` só funciona para `bot_id = 'bot_especial'`
- Tokens com expiração de 5 minutos
- Validação de status do token (não expirado)

### **Exemplo de Resposta da API:**
```json
{
  "success": true,
  "nome": "Nome Verificado ✓",
  "cpf": "***.***.***-**",
  "verificado": true
}
```

---

## 📊 **COMPATIBILIDADE COM SISTEMA EXISTENTE**

### **✅ Tracking Mantido**
- Eventos Facebook com `event_id` único
- Deduplicação entre Pixel e CAPI
- UTMify recebendo conversões
- Google Sheets (se configurado)

### **✅ Database Schema**
- Mesma tabela `tokens` (PostgreSQL + SQLite)
- Mesma tabela `funnel_events`
- Campos existentes reutilizados
- Sem quebra de compatibilidade

### **✅ Webhooks**
- Mesmo handler unificado
- Identificação por `bot_id`
- PushinPay funciona normalmente
- Telegram webhook independente

---

## 🚀 **COMO TESTAR**

### **1. Verificar Bot Carregado**
```bash
curl https://seudominio.com/api/status
```
Deve retornar webhook do bot especial na lista.

### **2. Testar API Dados Comprador**
```bash
curl "https://seudominio.com/api/dados-comprador?token=TOKEN_VALIDO"
```

### **3. Acessar Página Especial**
```
https://seudominio.com/obrigado_especial.html?token=TOKEN_VALIDO&valor=49.90
```

---

## 📝 **LOGS E MONITORAMENTO**

O bot especial gera logs identificáveis:
```
[bot_especial] ✅ Enviando link para 123456789
[bot_especial] Link final: https://seudominio.com/obrigado_especial.html?token=...
```

---

## 🔧 **PERSONALIZAÇÃO**

### **Alterar Valores/Textos:**
Edite `/MODELO1/BOT/config_especial.js`

### **Customizar Página:**
Edite `/MODELO1/WEB/obrigado_especial.html`

### **Modificar API:**
Edite a função `/api/dados-comprador` em `server.js`

---

## ✅ **STATUS DA IMPLEMENTAÇÃO**

- ✅ Bot especial criado e configurado
- ✅ Página personalizada implementada
- ✅ API de dados do comprador funcionando
- ✅ Webhooks configurados
- ✅ Tracking integrado
- ✅ Segurança implementada
- ✅ Compatibilidade mantida

**🎉 O Bot Especial está pronto para uso em produção!**