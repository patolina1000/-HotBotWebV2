# 🎯 Facebook CAPI - Kit Completo de Diagnóstico e Implementação

Este repositório contém um kit completo para diagnosticar, implementar e monitorar o **Facebook Conversions API (CAPI)** com máxima eficiência e performance.

## 📋 Conteúdo do Kit

### 1. **Checklist Técnico** (`facebook_capi_diagnostic_checklist.md`)
- Guia completo de diagnóstico Pixel + CAPI
- Verificação de deduplicação (>90%)
- Análise de Event Match Score (≥6)
- Monitoramento de cobertura CAPI (≥75%)
- Verificação de latência (<20 min)
- Detecção de erros comuns
- Testes práticos no Events Manager

### 2. **Monitor de Saúde** (`capi_health_monitor.py`)
- Análise automática da implementação CAPI
- Relatórios detalhados de performance
- Cálculo de health scores
- Recomendações personalizadas
- Monitoramento contínuo

### 3. **Suíte de Testes** (`capi_test_suite.py`)
- 6 testes automatizados completos
- Validação de deduplicação
- Teste de Event Match Score
- Verificação de latência e freshness
- Teste de timestamps inválidos
- Envio em lote de eventos

### 4. **Implementação de Referência** (`capi_implementation_example.py`)
- Código otimizado para produção
- Event Match Score >8
- Deduplicação >95%
- Latência <5 minutos
- Tratamento robusto de erros
- Pattern Builder para eventos

## 🚀 Instalação e Configuração

### 1. Instalar Dependências
```bash
pip install -r requirements.txt
```

### 2. Configurar Credenciais
Você precisará de:
- **Pixel ID**: ID do seu pixel do Facebook
- **Access Token**: Token de acesso da Graph API com permissões de `ads_management`

### 3. Verificar Permissões
```bash
# Testar token de acesso
curl -X GET \
  "https://graph.facebook.com/v18.0/me?access_token=SEU_ACCESS_TOKEN"
```

## 📊 Como Usar

### 1. Monitor de Saúde CAPI

Execute uma análise completa da sua implementação:

```bash
python capi_health_monitor.py \
  --pixel-id SEU_PIXEL_ID \
  --access-token SEU_ACCESS_TOKEN
```

**Saída esperada:**
```
📊 RELATÓRIO DE SAÚDE - FACEBOOK CAPI
====================================

🎯 PIXEL ID: 123456789
📅 TIMESTAMP: 2024-01-15T10:30:00

📈 HEALTH SCORES:
   Overall: 85.2/100
   Deduplicação: 92.0/100
   Cobertura CAPI: 78.5/100
   Latência: 95.0/100
   Timestamps: 100/100

💡 RECOMENDAÇÕES:
   1. ✅ Implementação está funcionando corretamente!
```

### 2. Suíte de Testes Automatizados

Execute todos os testes de validação:

```bash
python capi_test_suite.py \
  --pixel-id SEU_PIXEL_ID \
  --access-token SEU_ACCESS_TOKEN \
  --save-report relatorio_testes.json
```

**Testes incluídos:**
1. ✅ Envio básico de evento
2. ✅ Deduplicação (mesmo Event ID)
3. ✅ Event Match Score (dados completos)
4. ✅ Latência e Freshness
5. ✅ Timestamps inválidos
6. ✅ Envio em lote (múltiplos eventos)

### 3. Envio de Evento de Teste

Para testar rapidamente:

```bash
python capi_health_monitor.py \
  --pixel-id SEU_PIXEL_ID \
  --access-token SEU_ACCESS_TOKEN \
  --test-event \
  --test-code "MEUTEST-123"
```

## 🔧 Implementação em Produção

### Exemplo Básico

```python
from capi_implementation_example import CAPIConfig, CAPIClient

# Configuração
config = CAPIConfig(
    pixel_id="SEU_PIXEL_ID",
    access_token="SEU_ACCESS_TOKEN"
)

# Cliente
client = CAPIClient(config)

# Evento de compra
event = (client.create_event()
         .event_name("Purchase")
         .event_id("order_12345")
         .user_email("cliente@example.com")
         .user_phone("+5511999999999")
         .facebook_cookies(fbp="fb.1.1234567890.123")
         .purchase_data(
             value=99.99,
             currency="BRL",
             content_ids=["produto_123"]
         )
         .build())

# Enviar
client.send_single_event(event)
```

### Integração com Frontend

**JavaScript (Pixel):**
```javascript
// Gerar Event ID único
const eventID = 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

// Enviar via Pixel
fbq('track', 'Purchase', {
  value: 99.99,
  currency: 'BRL',
  content_ids: ['produto_123']
}, {
  eventID: eventID  // MESMO ID usado no servidor
});

// Enviar dados para servidor (CAPI)
fetch('/api/track-purchase', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    eventID: eventID,  // MESMO ID
    value: 99.99,
    currency: 'BRL',
    content_ids: ['produto_123'],
    user_data: {
      email: 'cliente@example.com',
      phone: '+5511999999999',
      fbp: getCookie('_fbp'),
      fbc: getCookie('_fbc')
    }
  })
});
```

## 📈 KPIs e Metas

### 🎯 Metas Ideais
- **Deduplication Rate**: >95%
- **Event Match Score**: ≥8
- **CAPI Coverage**: ≥85%
- **Latência Média**: <5 min
- **Error Rate**: <1%

### 📊 Metas Mínimas
- **Deduplication Rate**: >90%
- **Event Match Score**: ≥6
- **CAPI Coverage**: ≥75%
- **Latência Média**: <20 min
- **Error Rate**: <5%

## 🔍 Verificação no Events Manager

### 1. Test Events
1. Acesse: `Business Manager > Events Manager > Data Sources > Seu Pixel`
2. Vá em `Test Events`
3. Insira o Test Code gerado pelos scripts
4. Verifique se os eventos aparecem em tempo real

### 2. Activity Overview
1. Vá em `Overview > Activity`
2. Verifique eventos com fonte `Browser` e `Server`
3. Compare volumes e timestamps

### 3. Event Match Quality
1. Acesse `Diagnostics > Event Match Quality`
2. Verifique se o score está ≥6
3. Analise quais campos estão contribuindo

## 🚨 Troubleshooting

### Problema: Event Match Score Baixo (<6)
**Solução:**
```python
# Adicionar mais dados de usuário
.user_email(email)
.user_phone(phone)
.user_ip(ip_address)
.user_agent(user_agent)
.facebook_cookies(fbp=fbp_cookie, fbc=fbc_cookie)
.user_demographics(
    first_name=first_name,
    last_name=last_name,
    city=city,
    state=state,
    country="br"
)
```

### Problema: Baixa Cobertura CAPI (<75%)
**Soluções:**
1. Implementar fallback para eventos perdidos pelo Pixel
2. Enviar eventos críticos sempre via CAPI
3. Verificar se todos os eventos estão sendo capturados

### Problema: Alta Latência (>20 min)
**Soluções:**
1. Enviar eventos em tempo real, não em batch
2. Usar timestamp da ação real do usuário
3. Implementar retry automático para falhas

### Problema: Baixa Deduplicação (<90%)
**Soluções:**
1. Usar o mesmo Event ID no Pixel e CAPI
2. Sincronizar timestamps entre frontend e backend
3. Verificar se os Event IDs são únicos

## 🛠️ Monitoramento Contínuo

### Script de Monitoramento (Cron)
```bash
#!/bin/bash
# Executar a cada hora
0 * * * * /usr/bin/python3 /path/to/capi_health_monitor.py \
  --pixel-id SEU_PIXEL_ID \
  --access-token SEU_ACCESS_TOKEN \
  >> /var/log/capi_health.log 2>&1
```

### Alertas Críticos
Configure alertas para:
- ❌ Eventos não chegando há >1 hora
- ❌ Event Match Score <4
- ❌ Deduplication rate <70%
- ❌ Erros de token/permissão

## 📚 Recursos Adicionais

### Documentação Oficial
- [Facebook Conversions API](https://developers.facebook.com/docs/marketing-api/conversions-api)
- [Event Match Quality](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters)
- [Test Events](https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api#test-events)

### Ferramentas Recomendadas
1. **Facebook Pixel Helper** - Chrome extension
2. **Graph API Explorer** - Teste APIs em tempo real
3. **Events Manager** - Monitoramento visual
4. **Postman Collection** - Automação de testes

## 🤝 Suporte

Para dúvidas ou problemas:
1. Verifique o checklist técnico primeiro
2. Execute a suíte de testes
3. Analise os logs de erro
4. Consulte a documentação oficial do Facebook

---

**🎉 Com este kit, você terá uma implementação Facebook CAPI de nível enterprise com monitoramento proativo e performance otimizada!**
