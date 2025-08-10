# Dashboard de Logs - Sistema de Autenticação

## Visão Geral

O dashboard de logs implementa um sistema de autenticação baseado em token para proteger as APIs de acesso aos dados de logs, mantendo a interface web acessível sem autenticação.

## Configuração

### Variável de Ambiente

Configure a variável de ambiente `PANEL_ACCESS_TOKEN` com um token seguro:

```bash
# .env ou variável de ambiente
PANEL_ACCESS_TOKEN=seu_token_seguro_aqui_123456
```

**⚠️ Importante:** 
- Nunca use tokens fracos como "admin123" em produção
- O token deve ter pelo menos 16 caracteres
- Use caracteres aleatórios (letras, números, símbolos)

### Verificação de Configuração

No boot do servidor, você verá um dos seguintes logs:

```
✅ PANEL_ACCESS_TOKEN configurado - dashboard ativo
```

ou

```
⚠️  PANEL_ACCESS_TOKEN não configurado - dashboard em modo bloqueado
```

## Rotas Disponíveis

### Dashboard (Sem Autenticação)

- **GET** `/logs-dashboard` - Acesso principal ao dashboard
- **GET** `/logs-dashboard.html` - Arquivo HTML direto
- **GET** `/logs-dashboard.js` - JavaScript do dashboard
- **GET** `/style.css` - Estilos CSS

### APIs Protegidas (Com Autenticação)

Todas as APIs de logs requerem autenticação via token:

- **GET** `/api/logs` - Lista de logs com filtros e paginação
- **GET** `/api/logs/stats` - Estatísticas e métricas dos logs
- **GET** `/api/logs/export` - Exportação em CSV/JSON

## Métodos de Autenticação

### 1. Header Authorization (Recomendado)

```bash
curl -H "Authorization: Bearer seu_token_aqui" \
     "https://seu-dominio.com/api/logs?limit=10"
```

### 2. Query Parameter

```bash
curl "https://seu-dominio.com/api/logs?token=seu_token_aqui&limit=10"
```

## Comportamentos

### Token Válido
- **Status:** 200 OK
- **Resposta:** Dados solicitados

### Token Ausente
- **Status:** 401 Unauthorized
- **Resposta:** `{"error": "Token inválido"}`

### Token Inválido
- **Status:** 401 Unauthorized
- **Resposta:** `{"error": "Token inválido"}`

### PANEL_ACCESS_TOKEN Não Configurado
- **Status:** 503 Service Unavailable
- **Resposta:** `{"error": "PANEL_ACCESS_TOKEN não configurado"}`

## Testes

Execute o script de teste para validar a implementação:

```bash
# Com token configurado
PANEL_ACCESS_TOKEN=teste123 node test-dashboard-auth.js

# Sem token (modo bloqueado)
unset PANEL_ACCESS_TOKEN && node test-dashboard-auth.js
```

### Critérios de Aceite

✅ **Dashboard acessível sem token**
```bash
curl https://seu-dominio.com/logs-dashboard
# Deve retornar 200 OK
```

✅ **APIs negam sem token**
```bash
curl https://seu-dominio.com/api/logs
# Deve retornar 401 Unauthorized
```

✅ **APIs aceitam com header**
```bash
curl -H "Authorization: Bearer admin123" \
     https://seu-dominio.com/api/logs?limit=1
# Deve retornar 200 OK
```

✅ **APIs aceitam com query**
```bash
curl https://seu-dominio.com/api/logs?token=admin123&limit=1
# Deve retornar 200 OK
```

✅ **Token inválido rejeitado**
```bash
curl https://seu-dominio.com/api/logs?token=invalid
# Deve retornar 401 Unauthorized
```

## Segurança

### Logs
- O valor do token **NUNCA** é registrado nos logs
- Apenas o status de configuração é logado no boot

### Middleware
- Validação centralizada via `authDashboard(req, res, next)`
- Suporte a header Authorization e query parameter
- Reutilizável para futuras APIs protegidas

### Robustez
- Funciona mesmo sem `PANEL_ACCESS_TOKEN` configurado
- Não quebra outras rotas do sistema
- Graceful degradation para modo bloqueado

## Implementação Técnica

### Middleware de Autenticação

```javascript
function authDashboard(req, res, next) {
  const cfg = process.env.PANEL_ACCESS_TOKEN;
  if (!cfg) {
    return res.status(503).json({ error: 'PANEL_ACCESS_TOKEN não configurado' });
  }
  const token = extractToken(req);
  if (!token || token !== cfg) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  return next();
}
```

### Extração de Token

```javascript
function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  return (req.query.token || '').toString().trim();
}
```

## Troubleshooting

### Dashboard não carrega
- Verifique se o arquivo `MODELO1/WEB/logs-dashboard.html` existe
- Confirme que o express.static está configurado corretamente

### APIs retornam 503
- Configure a variável `PANEL_ACCESS_TOKEN`
- Reinicie o servidor após configurar

### Token não funciona
- Verifique se o token está correto (sem espaços extras)
- Confirme se está usando o formato correto (Bearer ou query)
- Teste com curl para isolar problemas do frontend

### Logs de erro
- Verifique os logs do servidor para detalhes
- O middleware não loga tokens, apenas status de validação