# ✅ Checklist de Deploy - IP/UA no CAPI

## 📋 Pré-Deploy (Staging)

### 1. Validação de Código
- [ ] Código revisado e sem erros de sintaxe
- [ ] Nenhum `TODO` ou `FIXME` pendente nos arquivos modificados
- [ ] Sem `console.error` desnecessários
- [ ] Imports corretos em todos os arquivos

### 2. Testes Locais/Staging
- [ ] **Teste 1:** Presell - Payload criado com IP/UA
- [ ] **Teste 2:** Telegram /start - Lead enviado com IP/UA
- [ ] **Teste 3:** Webhook - Purchase enviado com fallback de IP/UA
- [ ] **Teste 4:** Obrigado - Purchase enviado com IP/UA da request

### 3. Validação de Logs
- [ ] Logs `[CAPI-IPUA]` aparecem em todos os envios
- [ ] Logs `[TRACKING-FALLBACK]` aparecem quando necessário
- [ ] Nenhum erro crítico nos logs

### 4. Facebook Events Manager
- [ ] Eventos aparecendo no Test Events
- [ ] IP e UA presentes nos eventos
- [ ] Sem warnings de dados ausentes
- [ ] Match Quality alto (7-10)

---

## 🚀 Deploy em Produção

### 1. Backup
- [ ] Backup do banco de dados PostgreSQL
- [ ] Backup da aplicação atual (branch/commit)
- [ ] Plano de rollback documentado

### 2. Variáveis de Ambiente
- [ ] `FB_PIXEL_ID` configurado
- [ ] `FB_PIXEL_TOKEN` configurado
- [ ] `DATABASE_URL` configurado
- [ ] `TEST_EVENT_CODE` configurado (opcional)

### 3. Deploy da Aplicação
- [ ] Código deployado via Git
- [ ] Dependências instaladas (`npm install`)
- [ ] Aplicação reiniciada
- [ ] Health check passou (ex: `/health-database`)

### 4. Verificação Pós-Deploy
- [ ] Aplicação está rodando sem erros
- [ ] Conexão com PostgreSQL OK
- [ ] Logs aparecendo corretamente
- [ ] Primeiro evento de teste enviado com sucesso

---

## 🧪 Monitoramento (Primeiras 24h)

### 1. Logs para Monitorar
```bash
# Buscar logs de IP/UA
grep "CAPI-IPUA" /var/log/app.log | tail -100

# Verificar fallback
grep "TRACKING-FALLBACK" /var/log/app.log | tail -50

# Verificar warnings
grep "⚠️.*CAPI-IPUA" /var/log/app.log
```

### 2. Métricas a Acompanhar
- [ ] Taxa de eventos com IP presente (> 90%)
- [ ] Taxa de eventos com UA presente (> 80%)
- [ ] Taxa de fallback aplicado (webhook/chat)
- [ ] Taxa de eventos aceitos pelo Facebook (> 95%)

### 3. Facebook Events Manager
- [ ] Eventos continuam aparecendo
- [ ] Match Quality não degradou
- [ ] Nenhum aumento de eventos rejeitados

---

## 🚨 Plano de Rollback

Se algo der errado:

### 1. Rollback Rápido (< 5 minutos)
```bash
# Voltar para o commit anterior
git checkout <commit-anterior>

# Reinstalar dependências se necessário
npm install

# Reiniciar aplicação
pm2 restart all
```

### 2. Rollback do Banco (se necessário)
```bash
# Restaurar backup do PostgreSQL
pg_restore -d hotbot_postgres backup.dump
```

### 3. Verificação Pós-Rollback
- [ ] Aplicação voltou a funcionar
- [ ] Eventos sendo enviados normalmente
- [ ] Logs normais retornaram

---

## ✅ Critérios de Sucesso

O deploy é considerado bem-sucedido quando:

1. ✅ **Captura:** Payloads na presell têm IP/UA persistidos
2. ✅ **Lead:** Eventos Lead no Telegram incluem IP/UA
3. ✅ **Purchase (webhook):** Fallback funciona, IP/UA presentes
4. ✅ **Purchase (website):** IP/UA da request são usados
5. ✅ **Logs:** `[CAPI-IPUA]` aparecem em todos os envios
6. ✅ **Facebook:** Eventos aceitos sem warnings de IP/UA
7. ✅ **Zero Regressões:** Nenhum fluxo existente quebrou

---

## 📊 Monitoramento Contínuo

### Queries Úteis (PostgreSQL)

#### 1. Verificar payloads recentes com IP/UA
```sql
SELECT payload_id, ip, user_agent, created_at
FROM payloads
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 10;
```

#### 2. Verificar telegram_users com IP/UA
```sql
SELECT telegram_id, ip_capturado, ua_capturado, criado_em
FROM telegram_users
WHERE criado_em > NOW() - INTERVAL '1 hour'
ORDER BY criado_em DESC
LIMIT 10;
```

#### 3. Verificar tokens com tracking
```sql
SELECT id_transacao, telegram_id, ip_criacao, user_agent_criacao, criado_em
FROM tokens
WHERE criado_em > NOW() - INTERVAL '1 hour'
  AND (ip_criacao IS NOT NULL OR user_agent_criacao IS NOT NULL)
ORDER BY criado_em DESC
LIMIT 10;
```

---

## 🔔 Alertas Recomendados

Configure alertas para:

1. **Taxa de IP/UA ausente > 20%**
   - Log: `CAPI-IPUA.*ip=vazio.*ua_present=false`
   
2. **Fallback falhando > 30%**
   - Log: `⚠️.*Fallback não encontrou dados`
   
3. **Erros no Facebook CAPI > 5%**
   - Log: `[Meta CAPI] error`
   
4. **Pool PostgreSQL indisponível**
   - Log: `Pool PostgreSQL não disponível`

---

## 📞 Contatos de Suporte

**Desenvolvedor Responsável:**
- Nome: [A definir]
- Email: [A definir]
- Telefone: [A definir]

**Escalação:**
- Facebook Support: https://business.facebook.com/support
- Render.com Support: https://render.com/support

---

## 📝 Notas Finais

- Este checklist deve ser seguido **rigorosamente** antes do deploy
- Cada item marcado deve ter evidência (screenshot, log, etc.)
- Monitoramento pós-deploy é **crítico** nas primeiras 24h
- Mantenha o plano de rollback sempre atualizado

---

**Data de Criação:** 2025-01-08  
**Versão:** 1.0  
**Próxima Revisão:** Após primeiro deploy em produção