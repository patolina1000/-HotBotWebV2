# 🚀 Roteiro de Validação - PR HotBot Web V2

## 📋 Objetivo
Garantir que todos os fluxos críticos estejam funcionando perfeitamente antes do merge, incluindo validação de dados, webhooks e dashboard.

---

## ✅ Checklist de Validação

### 🔄 Fluxo Principal Completo
- [ ] **Sessão** → **Clique** → **/start** → **Oferta** → **PIX** → **Pagamento** → **Dashboard Atualiza**
  - [ ] Usuário inicia sessão
  - [ ] Clique é registrado
  - [ ] Comando /start é processado
  - [ ] Oferta é apresentada
  - [ ] PIX é gerado
  - [ ] Pagamento é processado
  - [ ] Dashboard é atualizado em tempo real

### 🌐 Funcionamento Sem UTMs
- [ ] **Dados Mínimos Funcionam**
  - [ ] Sistema aceita requisições sem parâmetros UTM
  - [ ] Tracking básico funciona com IP e User-Agent
  - [ ] Sessão é criada corretamente
  - [ ] Eventos são registrados no banco

### 🔄 Reentrega de Webhook
- [ ] **Sem Duplicidade**
  - [ ] Webhook pode ser reenviado sem criar registros duplicados
  - [ ] Sistema de idempotência está funcionando
  - [ ] Logs mostram prevenção de duplicatas
  - [ ] Dashboard não mostra dados duplicados

### 💰 Troca de Tier
- [ ] **Dashboard Reflete Pagamento no Tier Final**
  - [ ] Usuário pode trocar de tier
  - [ ] Pagamento é processado no tier correto
  - [ ] Dashboard mostra valor do tier final
  - [ ] Histórico de mudanças é registrado

### 📅 Períodos de Filtro
- [ ] **Todos os Períodos Funcionam**
  - [ ] **Hoje**: Dados do dia atual
  - [ ] **Semana**: Últimos 7 dias
  - [ ] **Mês**: Últimos 30 dias
  - [ ] **7d**: Período customizado de 7 dias
  - [ ] **30d**: Período customizado de 30 dias
  - [ ] **Custom**: Seleção manual de datas

---

## 📸 Evidências Visuais Obrigatórias

### 🖥️ Screenshots do Dashboard
- [ ] **Dashboard Principal** com dados de teste
- [ ] **Filtros de Período** funcionando
- [ ] **Gráficos** com dados visíveis
- [ ] **Tabelas** com informações corretas
- [ ] **Responsividade** em diferentes tamanhos de tela

### 🎬 GIFs Demonstrativos
- [ ] **Fluxo Completo**: Do clique até o dashboard
- [ ] **Filtros de Período**: Mudança entre diferentes períodos
- [ ] **Troca de Tier**: Processo de mudança de plano
- [ ] **Atualização em Tempo Real**: Dashboard atualizando

---

## 🔌 Amostras de JSON das APIs

### 📊 API do Dashboard
```json
// Exemplo de resposta da API /api/dashboard
{
  "success": true,
  "data": {
    "period": "7d",
    "startDate": "2024-01-01",
    "endDate": "2024-01-07",
    "metrics": {
      "totalSessions": 150,
      "totalClicks": 89,
      "totalConversions": 23,
      "totalRevenue": 1250.00
    },
    "events": [...],
    "funnel": {...}
  }
}
```

### 🎯 API de Eventos
```json
// Exemplo de resposta da API /api/events
{
  "success": true,
  "data": {
    "events": [
      {
        "id": "evt_123",
        "sessionId": "sess_456",
        "eventType": "click",
        "timestamp": "2024-01-01T10:00:00Z",
        "metadata": {...}
      }
    ]
  }
}
```

### 💳 API de Pagamentos
```json
// Exemplo de resposta da API /api/payments
{
  "success": true,
  "data": {
    "payments": [
      {
        "id": "pay_789",
        "sessionId": "sess_456",
        "amount": 97.00,
        "tier": "premium",
        "status": "completed",
        "createdAt": "2024-01-01T10:30:00Z"
      }
    ]
  }
}
```

---

## 🧪 Testes de Validação

### 🔍 Teste de Sessão
```bash
# Testar criação de sessão sem UTMs
curl -X POST http://localhost:3000/api/session \
  -H "Content-Type: application/json" \
  -d '{"ip": "192.168.1.1", "userAgent": "Mozilla/5.0..."}'
```

### 🎯 Teste de Eventos
```bash
# Testar registro de evento
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "sess_123", "eventType": "click", "metadata": {...}}'
```

### 💰 Teste de Webhook
```bash
# Testar webhook de pagamento
curl -X POST http://localhost:3000/api/webhook/payment \
  -H "Content-Type: application/json" \
  -d '{"paymentId": "pay_123", "status": "completed", "amount": 97.00}'
```

---

## ✅ Critérios de Aceite

### 🎯 **OBRIGATÓRIO** - Todos os itens devem estar marcados:
- [ ] Fluxo principal completo funcionando
- [ ] Sistema sem UTMs funcionando
- [ ] Webhooks sem duplicidade
- [ ] Troca de tier funcionando
- [ ] Todos os períodos de filtro funcionando

### 📸 **OBRIGATÓRIO** - Evidências visuais:
- [ ] Screenshots do dashboard anexados
- [ ] GIFs demonstrativos anexados
- [ ] Amostras de JSON das APIs anexadas

### 🔍 **OBRIGATÓRIO** - Revisão e aprovação:
- [ ] Código revisado por pelo menos 1 desenvolvedor
- [ ] Testes executados e aprovados
- [ ] Documentação atualizada
- [ ] PR aprovado para merge

---

## 🚨 Checklist de Emergência

### ⚠️ Se algo falhar:
- [ ] Criar issue detalhando o problema
- [ ] Adicionar logs de erro
- [ ] Reverter mudanças se necessário
- [ ] Notificar equipe
- [ ] Agendar nova validação

---

## 📝 Notas da Validação

**Data da Validação:** _______________
**Responsável:** _______________
**Observações:** _______________

---

## 🎉 Status Final

- [ ] **PR APROVADO** - Todos os critérios atendidos
- [ ] **PR REJEITADO** - Problemas encontrados (ver issues)
- [ ] **PR EM REVISÃO** - Aguardando correções

**Assinatura do Validador:** _______________
**Data:** _______________
