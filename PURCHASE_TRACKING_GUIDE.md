# Guia do Sistema de Rastreamento Purchase Avançado

## 📊 Visão Geral da Estratégia

Este sistema implementa um rastreamento robusto de eventos `Purchase` com **tripla redundância** e **deduplicação perfeita** entre:

1. **🔥 Facebook Pixel** (Client-side)
2. **📡 Facebook CAPI** (Server-side imediato)  
3. **⏰ Facebook CAPI Cron** (Fallback em 5 minutos)

## 🏗️ Arquitetura do Sistema

### Fluxo Principal
```
Usuário chega → Valida token (/api/verificar-token) → CAPI enviado imediatamente
    ↓
Acessa obrigado.html → Pixel disparado → Flag pixel_sent atualizada
    ↓
Após 5 min → Cron verifica → Se nenhum evento foi enviado → CAPI Fallback
```

### Colunas de Controle no Banco
```sql
-- Flags de controle de eventos
pixel_sent BOOLEAN DEFAULT FALSE      -- Pixel foi disparado
capi_sent BOOLEAN DEFAULT FALSE       -- CAPI foi enviado  
cron_sent BOOLEAN DEFAULT FALSE       -- Cron fallback foi executado
first_event_sent_at TIMESTAMP         -- Timestamp do primeiro evento
event_attempts INTEGER DEFAULT 0      -- Contador de tentativas
```

## 🔐 Segurança e Deduplicação

### Dados Pessoais Hasheados
- **SHA-256** aplicado consistentemente entre client/server
- Nunca armazenados em plain text
- Validação automática de formato e integridade
- Logs de auditoria para monitoramento

### Sistema de Deduplicação
- **eventID**: Token único para cada compra
- **Cache em memória**: TTL de 10 minutos
- **Chave composta**: `event_name|event_id|event_time|fbp|fbc`

## 📈 Monitoramento e Estatísticas

### Endpoint de Estatísticas
```bash
GET /api/purchase-stats
```

**Métricas Disponíveis:**
- Total de tokens e conversões
- Eventos enviados por canal (Pixel/CAPI/Cron)
- Taxa de deduplicação
- Tokens pendentes de fallback
- Média de tentativas por evento

### Logs de Auditoria
```javascript
// Exemplo de log de auditoria
🔒 AUDIT: {
  "timestamp": "2024-01-15T10:30:00.000Z",
  "action": "send_purchase",
  "token": "abc12345***",
  "source": "capi",
  "has_hashed_data": true,
  "data_fields": ["fn", "ln", "external_id"]
}
```

## ⚙️ Configuração e Manutenção

### Variáveis de Ambiente Obrigatórias
```bash
FB_PIXEL_ID=seu_pixel_id
FB_PIXEL_TOKEN=seu_access_token
DATABASE_URL=sua_conexao_postgres
```

### Configuração do Cron
- **Frequência**: A cada 5 minutos
- **Delay de Fallback**: 5 minutos após criação do token
- **Máximo de Tentativas**: 3 por token
- **Condições**: Token válido, não usado, sem eventos enviados

## 🚨 Alertas e Troubleshooting

### Problemas Comuns

**1. Evento não enviado via Pixel**
```bash
# Verificar se cookies _fbp/_fbc estão presentes
# Verificar se Facebook Pixel está carregado
# Verificar AdBlockers
```

**2. CAPI falhando**
```bash
# Verificar FB_PIXEL_TOKEN
# Verificar conectividade com Facebook
# Verificar formato dos dados
```

**3. Dados hasheados inválidos**
```bash
⚠️ SECURITY WARNING: Hash fn não está no formato SHA-256 válido
```

### Comandos de Diagnóstico
```sql
-- Verificar tokens sem eventos enviados
SELECT token, criado_em, pixel_sent, capi_sent, cron_sent, event_attempts
FROM tokens 
WHERE valor IS NOT NULL 
  AND (pixel_sent = FALSE OR capi_sent = FALSE OR cron_sent = FALSE)
ORDER BY criado_em DESC;

-- Verificar taxa de sucesso por canal
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN pixel_sent THEN 1 END) as pixel_success,
  COUNT(CASE WHEN capi_sent THEN 1 END) as capi_success,
  COUNT(CASE WHEN cron_sent THEN 1 END) as cron_success
FROM tokens 
WHERE valor IS NOT NULL 
  AND criado_em > NOW() - INTERVAL '24 hours';
```

## 🛡️ Boas Práticas de Segurança

### 1. Proteção de Dados Pessoais
- ✅ **SEMPRE** hashear dados pessoais antes de armazenar
- ✅ **NUNCA** logar dados pessoais em plain text
- ✅ **VALIDAR** formato dos hashes antes de usar
- ✅ **MASCARAR** tokens em logs

### 2. Monitoramento de Vazamentos
- Detectar padrões suspeitos em hashes
- Alertar sobre dados não hasheados
- Auditoria completa de acessos a dados

### 3. Controle de Acesso
- Restringir acesso aos endpoints de estatísticas
- Implementar rate limiting em APIs sensíveis
- Logar todas as operações de dados pessoais

## 📊 KPIs e Métricas de Sucesso

### Métricas Primárias
- **Taxa de Cobertura**: % de compras com pelo menos 1 evento enviado
- **Taxa de Deduplicação**: % de eventos únicos vs total
- **Latência Média**: Tempo entre compra e primeiro evento
- **Taxa de Fallback**: % de eventos enviados via cron

### Metas Recomendadas
- 🎯 **Cobertura**: > 98%
- 🎯 **Deduplicação**: 100% (zero duplicatas)
- 🎯 **Latência**: < 30 segundos (95% dos casos)
- 🎯 **Fallback**: < 5% do total

## 🔄 Processo de Atualizações

### Ao Fazer Mudanças
1. **Testar** em ambiente de desenvolvimento
2. **Monitorar** métricas antes e depois
3. **Validar** deduplicação continua funcionando
4. **Verificar** logs de segurança
5. **Confirmar** compatibilidade com dados existentes

### Rollback de Emergência
- Manter versão anterior do serviço Facebook
- Backup das configurações de banco
- Procedimentos documentados de reversão

---

## 💡 Próximas Melhorias Sugeridas

1. **Dashboard Web** para monitoramento em tempo real
2. **Alertas automáticos** via webhook/email para falhas
3. **Retry inteligente** com backoff exponencial
4. **Compressão de logs** para otimizar armazenamento
5. **Integração com DataDog/New Relic** para métricas avançadas

---

*Este documento deve ser atualizado sempre que houver mudanças no sistema de rastreamento.*