# 🔥 Sistema de Rastreamento Avançado HotBot

> **Sistema completo de vendas com rastreamento invisível e eventos Purchase via múltiplos canais (Pixel + CAPI + Cron)**

[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-blue.svg)](https://www.postgresql.org/)
[![Facebook API](https://img.shields.io/badge/Facebook-API%20v18.0-blue.svg)](https://developers.facebook.com/)
[![Telegram](https://img.shields.io/badge/Telegram-Bot%20API-blue.svg)](https://core.telegram.org/bots/api)

## 📋 Visão Geral

Sistema integrado de vendas para produtos sensíveis com **anonimato total** e **rastreamento invisível**. Combina bot do Telegram, páginas web otimizadas e backend robusto com rastreamento Facebook via Pixel + CAPI + fallback automático.

### 🎯 **Objetivo Principal**
Maximizar conversões e dados de rastreamento enquanto preserva 100% do anonimato do usuário através de:
- ✅ Rastreamento invisível de cookies (_fbp/_fbc) via Telegram
- ✅ Coleta segura de dados sensíveis com hash SHA-256
- ✅ Tripla garantia de eventos Purchase (Pixel + CAPI + Cron)
- ✅ TTL automático para preservar privacidade

## 🏗️ **Stack Tecnológica**

```bash
Backend:      Node.js 20.x + Express + PostgreSQL
Frontend:     HTML5 + Vanilla JS + Facebook Pixel
Bot:          Telegram Bot API + Webhook
Pagamento:    PushinPay (PIX)
Rastreamento: Facebook Pixel + Conversions API (CAPI)
Cache:        NodeCache + Fallback em memória
Deploy:       Render.com + Docker
```

## 📊 **Fluxo de Conversão Completo**

### 1. 🎯 **Captação de Tráfego**
```
Usuário → Landing Page (index.html/boasvindas.html)
       ↓
   Captura automática de:
   • Cookies Facebook (_fbp, _fbc)
   • Parâmetros UTM
   • IP + User-Agent
   • Dados de sessão
```

### 2. 🤖 **Entrada no Bot**
```
Link personalizado → Telegram Bot
                   ↓
   Armazenamento invisível (TTL 3 dias):
   • telegram_id → cookies reais
   • SessionTracking cache
   • Dados de origem preservados
```

### 3. 💰 **Processo de Compra**
```
Bot → Geração PIX (PushinPay) → Usuário paga
    ↓
Webhook confirmação → Token criado no banco
                    ↓
   Link de acesso enviado:
   /obrigado.html?token=xyz&valor=16.47
```

### 4. 📤 **Eventos Purchase (TRIPLA GARANTIA)**

#### **🔴 CAPI (Imediato)**
```javascript
// Servidor envia evento via Conversions API
// IMEDIATAMENTE após validação do token
await sendFacebookEvent({
  event_name: 'Purchase',
  source: 'capi',
  value: 16.47,
  fbp: 'fb.1.abc123...',
  user_data_hash: { fn: 'hash_nome', external_id: 'hash_cpf' }
});
```

#### **🟡 Pixel (Frontend)**
```javascript
// Página obrigado.html dispara automaticamente
fbq('track', 'Purchase', {
  value: 16.47,
  currency: 'BRL',
  fn: 'hash_nome',
  external_id: 'hash_cpf'
}, { eventID: token });
```

#### **🟢 Cron (Fallback)**
```javascript
// Executa a cada 5 minutos para tokens "abandonados"
// Garante que nenhuma conversão seja perdida
cron.schedule('*/5 * * * *', processFallbackPurchases);
```

## 🔥 **Rastreamento Invisível**

### **Como Funciona**
1. **Captura Automática**: JavaScript captura cookies Facebook na landing page
2. **Transporte Seguro**: Dados enviados via URL/payload para o bot Telegram  
3. **Cache Temporário**: Armazenados com TTL de 3 dias (259200 segundos)
4. **Reutilização**: Eventos Purchase usam os mesmos cookies para consistência

### **Para Que Serve**
- ✅ **Deduplicação perfeita** entre Pixel e CAPI
- ✅ **Anonimato total** - nenhum dado pessoal persistido
- ✅ **Rastreamento consistente** mesmo com múltiplos dispositivos
- ✅ **Fallback inteligente** para casos edge

### **Como Usar**
```javascript
// Automático! Só configurar as variáveis:
FB_PIXEL_ID=1429424624747459
FB_PIXEL_TOKEN=seu_token_capi

// O sistema captura e usa os cookies automaticamente
```

## 🗄️ **Banco vs Cache**

### **🔒 PostgreSQL (Persistente)**
```sql
-- APENAS dados não sensíveis + hashes
tokens (
  token TEXT,
  valor NUMERIC,
  fn_hash TEXT,           -- SHA-256 do primeiro nome
  ln_hash TEXT,           -- SHA-256 do sobrenome  
  external_id_hash TEXT,  -- SHA-256 do CPF
  pixel_sent BOOLEAN,
  capi_sent BOOLEAN,
  cron_sent BOOLEAN
)
```

### **💾 Cache (Temporário - TTL 3 dias)**
```javascript
// SessionTracking - dados sensíveis temporários
{
  telegram_id: 123456789,
  fbp: 'fb.1.1234567890.987654321',
  fbc: 'fb.2.1234567890.abc123def',
  ip: '192.168.1.1',
  user_agent: 'Mozilla/5.0...',
  utm_source: 'instagram'
  // ⏰ EXPIRA automaticamente em 3 dias
}
```

### **Por Que Essa Separação?**
- 🔐 **Anonimato**: Dados sensíveis nunca persistem no banco
- ⚡ **Performance**: Cache rápido para consultas frequentes  
- 🛡️ **Segurança**: Hashes SHA-256 são irreversíveis
- 📊 **Compliance**: Adequado para produtos sensíveis

## 🔍 **Endpoint de Verificação de Token**

### **POST** `/api/verificar-token`
```javascript
// Request
{
  "token": "abc123xyz"
}

// Response (Sucesso)
{
  "status": "valido",
  "user_data_hash": {
    "fn": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
    "ln": "b5d4045c3f466fa91fe2cc6abe79232a1a57cdf104f7a26e716e0a1e2789df78", 
    "external_id": "c3499c2729730a7f807efb8676a92dcb6f8a3f8f3c4f4b0a3d4c5e6f7a8b9c0d"
  }
}

// Response (Erro)
{
  "status": "invalido"
}
```

**🎯 Funcionalidades:**
- ✅ Valida token e marca como usado (transação atômica)
- ✅ Retorna hashes SHA-256 para eventos Purchase
- ✅ Dispara evento CAPI automaticamente
- ✅ Previne reutilização de tokens

## 🚀 **Instruções de Deploy**

### **1. Configuração de Ambiente**
```bash
# Clone o repositório
git clone https://github.com/seu-repo/hotbot.git
cd hotbot

# Instale dependências
npm install

# Configure variáveis (criar arquivo .env)
cp .env.example .env
```

### **2. Configuração para PRODUÇÃO REAL**
```bash
# ⚠️ IMPORTANTE: Copie .env.production para .env e configure:
cp .env.production .env

# OBRIGATÓRIO - Configure essas variáveis:
NODE_ENV=production
DATABASE_URL=postgresql://usuario:senha@host:5432/database
TELEGRAM_TOKEN=seu_bot_token_principal  
TELEGRAM_TOKEN_BOT2=seu_bot_token_secundario
BASE_URL=https://seudominio.com
FB_PIXEL_ID=1429424624747459
FB_PIXEL_TOKEN=seu_token_conversions_api_real
URL_ENVIO_1=https://t.me/+seugrupo1
URL_ENVIO_2=https://t.me/+seugrupo2
URL_ENVIO_3=https://t.me/+seugrupo3

# 🚨 NUNCA DEFINIR FB_TEST_EVENT_CODE EM PRODUÇÃO
# Eventos reais apenas - sem códigos de teste
```

### **3. Checklist de Produção**
- ✅ NODE_ENV=production
- ✅ FB_TEST_EVENT_CODE removido/comentado
- ✅ DATABASE_URL configurada (PostgreSQL real)
- ✅ Tokens do Telegram válidos
- ✅ FB_PIXEL_TOKEN válido (Conversions API)
- ✅ URLs dos grupos funcionando
- ✅ Domínio próprio configurado

### **4. Deploy e Execução PRODUÇÃO**
```bash
# 1. Configurar variáveis (obrigatório)
cp .env.production .env
nano .env  # Configure DATABASE_URL, tokens, etc.

# 2. Instalar e executar
npm install --production
npm start

# 3. Verificar funcionamento
npm run test        # Testa banco
curl /health        # Health check
npm run tokens:stats # Estatísticas
```

### **5. Monitoramento de Produção**
- 📊 **Facebook Events Manager** - Eventos Purchase chegando
- 🗄️ **PostgreSQL** - Flags pixel_sent/capi_sent/cron_sent
- 📱 **Telegram Groups** - Usuários sendo direcionados  
- 📈 **Logs do servidor** - Eventos CAPI/Pixel/Cron

### **6. Comandos de Manutenção**
```bash
npm run tokens:list     # Listar tokens
npm run tokens:used     # Tokens utilizados
npm run tokens:stats    # Estatísticas detalhadas
```

## 🧪 **Como Simular uma Compra**

### **1. Acesso à Landing Page**
```bash
# Acesse uma das páginas com UTMs
https://seusite.com/boasvindas.html?utm_source=instagram&utm_medium=cpm&utm_campaign=teste
```

### **2. Entre no Bot**
```bash
# Clique no botão da landing page
# Será redirecionado para: t.me/seu_bot?start=payload_com_cookies
```

### **3. Faça um PIX Teste**
```bash
# Use os dados de teste da PushinPay
# Valor: R$ 16,47
# PIX será gerado automaticamente
```

### **4. Validação do Rastreamento**
```bash
# Acesse as estatísticas
GET https://seusite.com/api/purchase-stats

# Verifique os logs em tempo real
tail -f logs/app.log
```

### **5. Eventos Esperados**
```bash
✅ CAPI Purchase enviado (fonte: capi)
✅ Pixel Purchase disparado (fonte: pixel)  
✅ Deduplicação funcionando (mesmo event_id)
✅ Token marcado como usado
```

## ⚠️ **Observações de Uso**

### **🚫 Evitar**
- ❌ **Reenvio manual de eventos** (duplicação automática)
- ❌ **Modificar tokens** após geração (quebra deduplicação)
- ❌ **Usar tokens expirados** (>5 minutos)
- ❌ **Bypass de TTL** do cache (quebra anonimato)

### **⏰ TTL e Limites**
- 📅 **Cache SessionTracking**: 3 dias (259200s)
- 🕐 **Deduplicação**: 10 minutos (600s)
- 🔄 **Cron fallback**: A cada 5 minutos
- 🎯 **Tentativas máximas**: 3 por token
- ⏱️ **Timeout tokens**: 5 minutos após geração

### **📊 Monitoramento**
```bash
# Estatísticas em tempo real
GET /api/purchase-stats

# Tracking por usuário  
GET /api/session-tracking/:telegram_id

# Health check
GET /health
```

## 🔧 **Comandos Úteis**

```bash
# Desenvolvimento
npm start              # Iniciar servidor
npm run dev           # Modo desenvolvimento  
npm test              # Testar banco de dados

# Tokens
npm run tokens:list   # Listar todos os tokens
npm run tokens:used   # Apenas tokens usados
npm run tokens:stats  # Estatísticas detalhadas
npm run tokens:delete-used  # Limpar tokens usados

# Build
npm run build         # Compilar dependências nativas
```

## 🛡️ **Considerações de Segurança**

### **🔐 Para Produtos Sensíveis**
- ✅ **Anonimato total**: Zero dados pessoais persistidos
- ✅ **Coleta invisível**: Usuário não sabe que está sendo rastreado
- ✅ **Hashes irreversíveis**: SHA-256 protege identidades  
- ✅ **TTL automático**: Dados expiram automaticamente
- ✅ **Sem email/telefone**: Evita identificação

### **🚨 Limitações Intencionais**
- 📧 **Email NÃO coletado** (identificação fácil)
- 📱 **Telefone NÃO coletado** (identificação fácil)
- 🏠 **Endereço NÃO coletado** (desnecessário para digital)
- 👤 **CPF hasheado apenas** (compliance fiscal)

---

## 📞 **Suporte e Documentação**

- 📋 **Rastreamento**: [INVISIBLE_TRACKING_GUIDE.md](./INVISIBLE_TRACKING_GUIDE.md)
- 🎯 **Purchase Events**: [PURCHASE_TRACKING_GUIDE.md](./PURCHASE_TRACKING_GUIDE.md)
- 🤖 **Bot Config**: [MODELO1/BOT/README.md](./MODELO1/BOT/README.md)

---

### 💡 **Dica Final**
> Este sistema foi otimizado para **produtos sensíveis** onde **anonimato é essencial**. A arquitetura prioriza privacidade e compliance sobre coleta máxima de dados.

---

**🔥 HotBot - Rastreamento Invisível e Vendas Seguras** 
*Versão 2.0 - Atualizado em 2024*
