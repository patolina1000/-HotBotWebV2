# 🎯 Sistema de Seleção de Gateway PIX

## 📋 Visão Geral

Este sistema permite alternar entre diferentes gateways de pagamento PIX (PushinPay e Oasyfy) de forma transparente, sem alterar o código das aplicações que consomem as APIs.

## 🏗️ Arquitetura

### Componentes Principais

1. **GatewaySelector** (`services/gatewaySelector.js`)
   - Gerencia a seleção entre gateways
   - Implementa fallback automático
   - Detecta gateway automaticamente nos webhooks

2. **UnifiedPixService** (`services/unifiedPixService.js`)
   - API unificada para criação de PIX
   - Abstrai diferenças entre gateways
   - Mantém compatibilidade com código existente

3. **PushinPayService** (`services/pushinpay.js`)
   - Wrapper para PushinPay (gateway atual)
   - Mantém compatibilidade com sistema existente

4. **OasyfyService** (`services/oasyfy.js`)
   - Integração com Oasyfy (novo gateway)
   - Baseado na documentação oficial

## 🚀 Como Usar

### 1. Configuração de Variáveis de Ambiente

```bash
# Gateway padrão (pushinpay ou oasyfy)
DEFAULT_PIX_GATEWAY=pushinpay

# PushinPay (existente)
PUSHINPAY_TOKEN=seu_token_pushinpay

# Oasyfy (novo)
OASYFY_PUBLIC_KEY=sua_chave_publica_oasyfy
OASYFY_SECRET_KEY=sua_chave_secreta_oasyfy
```

### 2. APIs Disponíveis

#### Status dos Gateways
```http
GET /api/gateways/status
```

Resposta:
```json
{
  "active_gateway": "pushinpay",
  "available_gateways": [
    {
      "id": "pushinpay",
      "name": "PushinPay",
      "configured": true,
      "active": true
    },
    {
      "id": "oasyfy", 
      "name": "Oasyfy",
      "configured": true,
      "active": false
    }
  ]
}
```

#### Alterar Gateway Ativo
```http
POST /api/gateways/set-active
Content-Type: application/json

{
  "gateway": "oasyfy"
}
```

#### Testar Conectividade
```http
GET /api/gateways/test
```

#### Criar PIX Unificado
```http
POST /api/pix/create
Content-Type: application/json

{
  "type": "bot",
  "telegram_id": "123456789",
  "plano": {
    "id": "plano_1_mes",
    "nome": "Plano 1 Mês"
  },
  "valor": 19.90,
  "tracking_data": {
    "utm_source": "telegram",
    "utm_campaign": "lancamento"
  },
  "bot_id": "bot1"
}
```

### 3. Tipos de PIX Suportados

#### Bot do Telegram
```json
{
  "type": "bot",
  "telegram_id": "123456789",
  "plano": { "id": "plano_1_mes", "nome": "Plano 1 Mês" },
  "valor": 19.90,
  "tracking_data": {},
  "bot_id": "bot1"
}
```

#### Checkout Web
```json
{
  "type": "web",
  "plano_id": "plano_1_mes",
  "valor": 19.90,
  "client_data": {
    "name": "João Silva",
    "email": "joao@email.com",
    "phone": "(11) 99999-9999"
  },
  "tracking_data": {
    "utm_source": "facebook",
    "utm_campaign": "lancamento"
  }
}
```

#### PIX Especial
```json
{
  "type": "special",
  "valor": 100,
  "metadata": {
    "source": "obrigado_especial"
  }
}
```

### 4. Webhook Unificado

```http
POST /webhook/unified
```

O webhook detecta automaticamente o gateway baseado no payload e processa adequadamente.

## 🔄 Migração do Sistema Atual

### Passo 1: Configurar Oasyfy
1. Obter credenciais no painel Oasyfy
2. Adicionar variáveis de ambiente
3. Testar conectividade: `GET /api/gateways/test`

### Passo 2: Testar com Oasyfy
1. Alterar gateway: `POST /api/gateways/set-active` com `"gateway": "oasyfy"`
2. Criar PIX de teste
3. Verificar funcionamento

### Passo 3: Atualizar Código (Opcional)
Substituir chamadas diretas para PushinPay pela API unificada:

**Antes:**
```javascript
// Código antigo usando PushinPay diretamente
const response = await axios.post('/api/gerar-pix-checkout', {
  plano_id: 'plano_1_mes',
  valor: 19.90
});
```

**Depois:**
```javascript
// Código novo usando API unificada
const response = await axios.post('/api/pix/create', {
  type: 'web',
  plano_id: 'plano_1_mes',
  valor: 19.90,
  client_data: {
    name: 'Cliente Web',
    email: 'cliente@email.com'
  }
});
```

## 🛡️ Fallback Automático

O sistema implementa fallback automático:
1. Se o gateway ativo falhar, tenta o outro automaticamente
2. Logs detalhados para debugging
3. Retorna erro apenas se ambos falharem

## 📊 Monitoramento

### Logs Importantes
- `🎯 Gateway PIX padrão: pushinpay`
- `🚀 Criando cobrança PIX via PUSHINPAY/OASYFY`
- `✅ Cobrança PIX criada via PUSHINPAY/OASYFY`
- `📥 Webhook unificado recebido`
- `🔄 Tentando fallback para outro gateway...`

### Endpoints de Monitoramento
- `GET /api/gateways/status` - Status atual
- `GET /api/gateways/test` - Teste de conectividade
- `GET /api/config` - Configurações (inclui status dos gateways)

## 🔧 Configurações Avançadas

### Forçar Gateway Específico
```javascript
// Forçar Oasyfy mesmo com PushinPay como padrão
const result = await unifiedPixService.createPixPayment(paymentData, { 
  gateway: 'oasyfy' 
});
```

### Desabilitar Fallback
```javascript
// Desabilitar fallback automático
const result = await unifiedPixService.createPixPayment(paymentData, { 
  fallback: false 
});
```

## 🚨 Troubleshooting

### Gateway Não Configurado
```
⚠️ Credenciais Oasyfy não configuradas
```
**Solução:** Verificar variáveis `OASYFY_PUBLIC_KEY` e `OASYFY_SECRET_KEY`

### Erro de Conectividade
```
❌ Erro ao verificar status Oasyfy: timeout
```
**Solução:** Verificar conectividade de rede e credenciais

### Webhook Não Detectado
```
❌ Não foi possível detectar o gateway do webhook
```
**Solução:** Verificar formato do payload do webhook

## 📈 Vantagens do Sistema

1. **Flexibilidade**: Alternar entre gateways sem alterar código
2. **Confiabilidade**: Fallback automático em caso de falha
3. **Compatibilidade**: Mantém funcionamento do sistema atual
4. **Monitoramento**: Logs detalhados e endpoints de status
5. **Escalabilidade**: Fácil adição de novos gateways

## 🔮 Próximos Passos

1. **Testes em Produção**: Validar Oasyfy em ambiente real
2. **Migração Gradual**: Alternar gateways por período
3. **Novos Gateways**: Adicionar outros provedores PIX
4. **Dashboard**: Interface web para gerenciar gateways
5. **Métricas**: Coletar estatísticas de performance

---

**Suporte**: Para dúvidas sobre implementação, consulte os logs do servidor ou entre em contato com a equipe de desenvolvimento.
