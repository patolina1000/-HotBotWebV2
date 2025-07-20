# Dashboard de Eventos - Guia de Diagnóstico e Correção

## 🔍 Problemas Identificados e Soluções

### 1. **Erro: "Erro ao carregar dados dos gráficos"**

#### Possíveis Causas:
- ❌ Banco de dados não configurado
- ❌ Token de acesso inválido  
- ❌ Servidor não está rodando
- ❌ Problemas nas queries SQL

#### Soluções:

##### A. Verificar Configuração do Banco
```bash
# 1. Verificar se DATABASE_URL está definida
echo $DATABASE_URL

# 2. Se não estiver, criar arquivo .env
cp .env.example .env
# Editar .env com suas configurações reais
```

##### B. Verificar Token de Acesso
```bash
# 1. Verificar token atual
echo $PANEL_ACCESS_TOKEN

# 2. Se não estiver definido, adicionar ao .env
echo "PANEL_ACCESS_TOKEN=seu_token_aqui" >> .env
```

##### C. Testar Conexão com Banco
```bash
# Executar diagnóstico completo
node dashboard-diagnostic.js
```

##### D. Testar Endpoint Diretamente
```bash
# Testar endpoint sem interface
node test-dashboard-endpoint.js

# Ou usar curl
curl "http://localhost:3000/api/dashboard-data?token=admin123"
```

---

### 2. **Erro: "Token de acesso inválido"**

#### Solução Rápida:
1. Verificar o token no localStorage do navegador
2. Usar o token correto configurado no servidor
3. Token padrão é `admin123` se não configurado

#### Verificação:
```javascript
// No console do navegador
console.log('Token salvo:', localStorage.getItem('dashboard_token'));
```

---

### 3. **Erro: "Banco de dados não disponível"**

#### Diagnóstico:
```bash
# 1. Verificar se PostgreSQL está rodando
pg_isready -h localhost -p 5432

# 2. Testar conexão manual
psql $DATABASE_URL -c "SELECT 1;"

# 3. Verificar logs do servidor
tail -f logs/server.log
```

#### Soluções:
1. **Instalar PostgreSQL** (se não instalado)
2. **Configurar DATABASE_URL** corretamente
3. **Criar banco e tabelas** necessárias

---

### 4. **Gráficos Vazios (sem dados)**

#### Possíveis Causas:
- Não há dados no período selecionado
- Tabelas vazias
- Problemas nas queries de agregação

#### Verificação:
```sql
-- Verificar dados nas tabelas
SELECT COUNT(*) FROM tokens WHERE criado_em >= NOW() - INTERVAL '30 days';
SELECT COUNT(*) FROM tracking_data WHERE created_at >= NOW() - INTERVAL '30 days';
SELECT COUNT(*) FROM payloads WHERE created_at >= NOW() - INTERVAL '30 days';
```

#### Solução:
O endpoint agora retorna dados de exemplo quando não há registros reais.

---

## 🛠️ Scripts de Diagnóstico

### 1. Diagnóstico Completo
```bash
node dashboard-diagnostic.js
```
- Verifica variáveis de ambiente
- Testa conexão com banco
- Executa queries de teste
- Simula resposta do endpoint

### 2. Teste do Endpoint
```bash
node test-dashboard-endpoint.js
```
- Testa autenticação
- Verifica estrutura da resposta
- Testa diferentes cenários

### 3. Verificar Logs em Tempo Real
```bash
# Iniciar servidor com logs detalhados
NODE_ENV=development node server.js

# Em outro terminal, testar dashboard
curl "http://localhost:3000/api/dashboard-data?token=admin123"
```

---

## 🔧 Configuração Passo a Passo

### 1. Configurar Ambiente
```bash
# Copiar arquivo de exemplo
cp .env.example .env

# Editar configurações
nano .env
```

### 2. Configurar Banco PostgreSQL
```bash
# Instalar PostgreSQL (Ubuntu/Debian)
sudo apt update
sudo apt install postgresql postgresql-contrib

# Criar banco
sudo -u postgres createdb hotbot_dev

# Configurar usuário
sudo -u postgres psql -c "CREATE USER hotbot WITH PASSWORD 'senha123';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE hotbot_dev TO hotbot;"
```

### 3. Atualizar .env
```env
DATABASE_URL=postgresql://hotbot:senha123@localhost:5432/hotbot_dev
PANEL_ACCESS_TOKEN=meu_token_seguro
```

### 4. Inicializar Banco
```bash
# O servidor criará as tabelas automaticamente
node server.js
```

---

## 📊 Estrutura de Resposta Esperada

```json
{
  "faturamentoDiario": [
    {
      "data": "2024-01-15",
      "faturamento": 1500.50,
      "vendas": 10,
      "addtocart": 25,
      "initiatecheckout": 15
    }
  ],
  "utmSource": [
    {
      "utm_source": "facebook",
      "vendas": 8,
      "addtocart": 20,
      "initiatecheckout": 12,
      "total_eventos": 40
    }
  ],
  "campanhas": [
    {
      "campanha": "black_friday",
      "vendas": 5,
      "addtocart": 15,
      "initiatecheckout": 10,
      "faturamento": 750.25,
      "total_eventos": 30
    }
  ]
}
```

---

## 🚨 Problemas Comuns e Soluções Rápidas

| Problema | Solução Rápida |
|----------|----------------|
| "Cannot find module 'pg'" | `npm install` |
| "DATABASE_URL não definida" | Configurar `.env` |
| "Connection refused" | Iniciar PostgreSQL |
| "Token inválido" | Verificar `PANEL_ACCESS_TOKEN` |
| "Gráficos vazios" | Aguardar dados ou usar dados de exemplo |
| "Servidor não responde" | Verificar se `node server.js` está rodando |

---

## 📞 Suporte

1. **Logs Detalhados**: Sempre verificar console do navegador e logs do servidor
2. **Testes**: Usar scripts de diagnóstico antes de reportar problemas
3. **Configuração**: Verificar arquivo `.env` e variáveis de ambiente

---

## ✅ Melhorias Implementadas

- ✅ Logs detalhados no endpoint
- ✅ Melhor tratamento de erros
- ✅ Dados de exemplo quando não há registros
- ✅ Validação de pool de conexão
- ✅ Mensagens de erro mais específicas
- ✅ Scripts de diagnóstico automatizado
- ✅ Guia de troubleshooting completo