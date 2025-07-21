# Facebook/Meta Ads - Checklist Técnico: Pixel + Conversions API

## 🎯 DIAGNÓSTICO COMPLETO - PIXEL + CAPI

### 1. VERIFICAÇÃO DE EVENTOS NO EVENTS MANAGER

#### 1.1 Eventos Chegando em Paralelo (Pixel + CAPI)
**Indicadores:**
- ✅ Eventos duplicados com sources diferentes: `browser` e `server_side`
- ✅ Timeline consistente entre ambas as fontes
- ✅ Volume proporcional entre Pixel e CAPI

**Método de Checagem:**
```bash
# Via Facebook Graph API - Verificar eventos recentes
curl -X GET \
  "https://graph.facebook.com/v18.0/{PIXEL_ID}/events?access_token={ACCESS_TOKEN}&limit=100" \
  -H "Content-Type: application/json"
```

**No Events Manager:**
1. Acesse: `Business Manager > Events Manager > Data Sources > Seu Pixel`
2. Vá em `Overview > Activity`
3. Verifique se há eventos com fonte `Browser` e `Server`
4. Compare timestamps - diferença máxima de 5-10 segundos

---

### 2. DEDUPLICAÇÃO EFICIENTE (>90%)

#### 2.1 Event ID Matching
**Indicadores:**
- ✅ Taxa de deduplicação > 90%
- ✅ Mesmo `event_id` para Pixel e CAPI
- ✅ Diferença de timestamp < 5 minutos

**Código de Implementação Correta:**
```javascript
// Frontend - Pixel
fbq('track', 'Purchase', {
  value: 29.99,
  currency: 'BRL',
  content_ids: ['product_123'],
  content_type: 'product'
}, {
  eventID: 'unique_event_id_12345' // MESMO ID usado no servidor
});
```

```python
# Backend - CAPI
import hashlib
from facebook_business.adobjects.serverside import Event, EventRequest, UserData, CustomData

def send_capi_event():
    user_data = UserData(
        emails=['user@example.com'],  # NÃO hasheado - FB faz isso
        phones=['+5511999999999'],    # NÃO hasheado
        client_ip_address='192.168.1.1',
        client_user_agent='Mozilla/5.0...',
        fbp='fb.1.1234567890123.1234567890',  # Cookie _fbp
        fbc='fb.1.1234567890123.AbCdEfGhIjKlMnOpQrStUvWxYz1234567890'  # Cookie _fbc
    )
    
    custom_data = CustomData(
        value=29.99,
        currency='BRL',
        content_ids=['product_123'],
        content_type='product'
    )
    
    event = Event(
        event_name='Purchase',
        event_time=int(time.time()),  # Timestamp atual
        event_id='unique_event_id_12345',  # MESMO ID do frontend
        user_data=user_data,
        custom_data=custom_data,
        event_source_url='https://seusite.com/checkout',
        action_source='website'
    )
    
    event_request = EventRequest(
        events=[event],
        pixel_id='SEU_PIXEL_ID'
    )
    
    return event_request.execute()
```

**Verificação via Test Events:**
```bash
# Enviar evento de teste
curl -X POST \
  "https://graph.facebook.com/v18.0/{PIXEL_ID}/events?access_token={ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "data": [{
      "event_name": "Purchase",
      "event_time": '$(date +%s)',
      "event_id": "test_dedup_123",
      "action_source": "website",
      "event_source_url": "https://seusite.com/test",
      "user_data": {
        "em": ["test@example.com"],
        "ph": ["+5511999999999"],
        "client_ip_address": "192.168.1.1",
        "client_user_agent": "Mozilla/5.0 Test"
      },
      "custom_data": {
        "value": 99.99,
        "currency": "BRL"
      }
    }],
    "test_event_code": "TEST-12345"
  }'
```

---

### 3. EVENT MATCH SCORE (Mínimo 6/10)

#### 3.1 Otimização de User Data
**Indicadores:**
- ✅ Score ≥ 6 no Events Manager
- ✅ Múltiplos identificadores enviados
- ✅ Dados não hasheados (FB faz o hash)

**Dados Críticos para Score Alto:**
```python
# Ordem de prioridade para Match Score
user_data_optimized = UserData(
    # 1. EMAIL (peso alto)
    emails=['user@example.com'],  # NÃO hash manualmente
    
    # 2. PHONE (peso alto)  
    phones=['+5511999999999'],    # Formato internacional
    
    # 3. COOKIES FB (peso muito alto)
    fbp='fb.1.1234567890123.1234567890',      # Cookie _fbp
    fbc='fb.1.1234567890123.AbCdEfGhIjKlMn',  # Cookie _fbc (se disponível)
    
    # 4. DADOS TÉCNICOS (peso médio)
    client_ip_address='192.168.1.1',          # IP real do usuário
    client_user_agent='Mozilla/5.0...',       # User Agent completo
    
    # 5. DADOS DEMOGRÁFICOS (peso baixo)
    first_names=['João'],
    last_names=['Silva'],
    date_of_birth='19900101',  # YYYYMMDD
    genders=['m'],             # m, f
    cities=['sao paulo'],
    states=['sp'],
    zip_codes=['01234567'],
    countries=['br']
)
```

**Comando para Verificar Score:**
```bash
# Via Graph API - Event Match Quality
curl -X GET \
  "https://graph.facebook.com/v18.0/{PIXEL_ID}/stats?access_token={ACCESS_TOKEN}&aggregation_period=day&start_time=2024-01-01&end_time=2024-01-31" \
  -H "Content-Type: application/json"
```

---

### 4. COBERTURA DE EVENTOS (≥75% CAPI)

#### 4.1 Análise de Volume
**Indicadores:**
- ✅ CAPI contribui com ≥75% do volume total
- ✅ Eventos críticos (Purchase, AddToCart) com alta cobertura CAPI
- ✅ Fallback para eventos perdidos pelo Pixel

**Verificação no Events Manager:**
1. `Overview > Activity > View by Connection Method`
2. Compare volumes: `Browser` vs `Server-Side`
3. Foque nos eventos de conversão (Purchase, Lead)

**Script de Monitoramento:**
```python
import requests
from datetime import datetime, timedelta

def check_event_coverage(pixel_id, access_token):
    # Últimos 7 dias
    end_time = datetime.now()
    start_time = end_time - timedelta(days=7)
    
    url = f"https://graph.facebook.com/v18.0/{pixel_id}/stats"
    params = {
        'access_token': access_token,
        'aggregation_period': 'day',
        'start_time': start_time.strftime('%Y-%m-%d'),
        'end_time': end_time.strftime('%Y-%m-%d'),
        'breakdown': 'connection_method'
    }
    
    response = requests.get(url, params=params)
    data = response.json()
    
    browser_events = 0
    server_events = 0
    
    for stat in data.get('data', []):
        if stat['connection_method'] == 'browser':
            browser_events += stat['count']
        elif stat['connection_method'] == 'server_side':
            server_events += stat['count']
    
    total_events = browser_events + server_events
    capi_coverage = (server_events / total_events * 100) if total_events > 0 else 0
    
    print(f"CAPI Coverage: {capi_coverage:.1f}%")
    print(f"Browser Events: {browser_events}")
    print(f"Server Events: {server_events}")
    
    return capi_coverage >= 75
```

---

### 5. LATÊNCIA E FRESHNESS (<20 min)

#### 5.1 Timestamp Optimization
**Indicadores:**
- ✅ event_time dentro de 20 minutos do trigger real
- ✅ Diferença mínima entre Pixel e CAPI timestamps
- ✅ Processamento em tempo real

**Implementação Otimizada:**
```python
import time
from datetime import datetime

def send_realtime_event(user_action_timestamp=None):
    # Use timestamp da ação real do usuário, não do processamento
    if user_action_timestamp:
        event_time = user_action_timestamp
    else:
        event_time = int(time.time())  # Timestamp atual
    
    # Verificar se não está muito antigo (máx 7 dias)
    now = int(time.time())
    max_age = 7 * 24 * 60 * 60  # 7 dias em segundos
    
    if (now - event_time) > max_age:
        print("WARNING: Event timestamp older than 7 days!")
        event_time = now - max_age + 3600  # Ajustar para 6 dias atrás
    
    event = Event(
        event_name='Purchase',
        event_time=event_time,  # Timestamp otimizado
        event_id=f'evt_{int(time.time() * 1000)}',
        # ... resto dos dados
    )
    
    return event
```

**Monitoramento de Latência:**
```bash
# Script para monitorar latência dos eventos
curl -X GET \
  "https://graph.facebook.com/v18.0/{PIXEL_ID}/events?access_token={ACCESS_TOKEN}&limit=50" \
  -H "Content-Type: application/json" | \
jq '.data[] | {event_name: .event_name, event_time: .event_time, received_time: .received_time, latency: (.received_time - .event_time)}'
```

---

### 6. VERIFICAÇÃO DE ERROS COMUNS

#### 6.1 Checklist de Erros Críticos

**A. Event Time > 7 dias:**
```python
def validate_event_time(event_time):
    now = int(time.time())
    max_age = 7 * 24 * 60 * 60  # 7 dias
    
    if (now - event_time) > max_age:
        return False, "Event older than 7 days"
    
    if event_time > now:
        return False, "Event in the future"
    
    return True, "Valid timestamp"
```

**B. Token Expirado:**
```bash
# Verificar validade do token
curl -X GET \
  "https://graph.facebook.com/v18.0/me?access_token={ACCESS_TOKEN}" \
  -H "Content-Type: application/json"

# Verificar permissões do token
curl -X GET \
  "https://graph.facebook.com/v18.0/{PIXEL_ID}?access_token={ACCESS_TOKEN}" \
  -H "Content-Type: application/json"
```

**C. Domain Verification:**
```bash
# Verificar domínios verificados
curl -X GET \
  "https://graph.facebook.com/v18.0/{BUSINESS_ID}/owned_domains?access_token={ACCESS_TOKEN}" \
  -H "Content-Type: application/json"
```

**D. Limite de 8 Eventos por Domínio:**
```python
def check_domain_event_limit():
    """
    Facebook limita a 8 tipos de eventos por domínio não verificado
    Eventos padrão que contam: PageView, ViewContent, Search, AddToCart, 
    AddToWishlist, InitiateCheckout, AddPaymentInfo, Purchase
    """
    standard_events = [
        'PageView', 'ViewContent', 'Search', 'AddToCart',
        'AddToWishlist', 'InitiateCheckout', 'AddPaymentInfo', 'Purchase'
    ]
    
    if len(standard_events) > 8:
        print("WARNING: More than 8 standard events. Domain verification required!")
        return False
    
    return True
```

---

### 7. TESTES PRÁTICOS NO EVENTS MANAGER

#### 7.1 Test Events Setup
```python
# Configurar Test Event Code
def setup_test_events():
    test_code = "TEST-" + str(int(time.time()))
    
    # Enviar evento de teste
    test_event = {
        "data": [{
            "event_name": "Purchase",
            "event_time": int(time.time()),
            "event_id": f"test_{int(time.time())}",
            "action_source": "website",
            "event_source_url": "https://seusite.com/test",
            "user_data": {
                "em": ["test@example.com"],
                "ph": ["+5511999999999"],
                "client_ip_address": "192.168.1.1",
                "client_user_agent": "Mozilla/5.0 Test Agent"
            },
            "custom_data": {
                "value": 99.99,
                "currency": "BRL",
                "content_ids": ["test_product"]
            }
        }],
        "test_event_code": test_code
    }
    
    print(f"Test Event Code: {test_code}")
    print("Use this code in Events Manager > Test Events")
    
    return test_event
```

#### 7.2 Payload Checker
```bash
# Validar payload antes do envio
curl -X POST \
  "https://graph.facebook.com/v18.0/{PIXEL_ID}/events?access_token={ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "data": [{
      "event_name": "Purchase",
      "event_time": '$(date +%s)',
      "event_id": "payload_test_123",
      "action_source": "website",
      "user_data": {
        "em": ["test@example.com"]
      }
    }],
    "test_event_code": "PAYLOAD-TEST",
    "partner_agent": "your_platform_v1.0"
  }' | jq '.'
```

#### 7.3 Test IDs para Debugging
```javascript
// Frontend - Implementar Test ID
if (window.location.search.includes('test_mode=true')) {
    fbq('track', 'Purchase', {
        value: 29.99,
        currency: 'BRL'
    }, {
        eventID: 'debug_test_' + Date.now(),
        test_event_code: 'DEBUG-MODE-123'
    });
}
```

---

### 8. MONITORAMENTO CONTÍNUO

#### 8.1 Dashboard de Métricas
```python
def generate_capi_health_report(pixel_id, access_token):
    """
    Gera relatório completo de saúde CAPI
    """
    metrics = {
        'deduplication_rate': 0,
        'event_match_score': 0,
        'capi_coverage': 0,
        'avg_latency': 0,
        'error_rate': 0
    }
    
    # Implementar coleta de métricas via Graph API
    # ... código de coleta ...
    
    # Gerar alertas se métricas abaixo do ideal
    alerts = []
    
    if metrics['deduplication_rate'] < 90:
        alerts.append("⚠️ Deduplication rate below 90%")
    
    if metrics['event_match_score'] < 6:
        alerts.append("⚠️ Event Match Score below 6")
    
    if metrics['capi_coverage'] < 75:
        alerts.append("⚠️ CAPI coverage below 75%")
    
    return metrics, alerts
```

#### 8.2 Alertas Automatizados
```bash
#!/bin/bash
# Script de monitoramento para cron job

# Verificar eventos das últimas 24h
EVENTS_COUNT=$(curl -s -X GET \
  "https://graph.facebook.com/v18.0/{PIXEL_ID}/events?access_token={ACCESS_TOKEN}&limit=1000" | \
  jq '.data | length')

if [ "$EVENTS_COUNT" -lt 100 ]; then
    echo "ALERT: Low event volume detected: $EVENTS_COUNT events"
    # Enviar alerta via webhook/email
fi
```

---

## 🎯 CHECKLIST FINAL DE VERIFICAÇÃO

### ✅ Pré-Launch Checklist
- [ ] Pixel instalado e eventos básicos funcionando
- [ ] CAPI implementado com user_data não hasheado
- [ ] Event IDs únicos e consistentes entre Pixel e CAPI
- [ ] Domain verification configurado
- [ ] Test Events configurado e testado
- [ ] Event Match Score ≥ 6
- [ ] Deduplication rate ≥ 90%
- [ ] CAPI coverage ≥ 75%
- [ ] Latência < 20 minutos
- [ ] Monitoramento automatizado ativo

### 🚨 Alertas Críticos
- [ ] Eventos não chegando há > 1 hora
- [ ] Event Match Score < 4
- [ ] Deduplication rate < 70%
- [ ] Erros de token/permissão
- [ ] Timestamps inválidos (>7 dias ou futuro)

### 📊 KPIs de Performance
- **Deduplication Rate**: >90% (ideal >95%)
- **Event Match Score**: ≥6 (ideal ≥8)
- **CAPI Coverage**: ≥75% (ideal ≥85%)
- **Latência Média**: <10 min (ideal <5 min)
- **Error Rate**: <5% (ideal <1%)

---

## 🛠️ FERRAMENTAS RECOMENDADAS

1. **Events Manager**: Monitoramento visual principal
2. **Facebook Pixel Helper**: Chrome extension para debug
3. **Graph API Explorer**: Testes de API em tempo real
4. **Webhook Tester**: Validar payloads CAPI
5. **Postman Collection**: Automação de testes de API

---

*Este checklist garante uma implementação robusta e otimizada do Facebook Pixel + Conversions API com monitoramento contínuo e alertas proativos.*