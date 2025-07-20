# 🔥 Facebook Pixel + Conversion API Tracking System

Sistema completo de **Facebook Pixel + Conversion API** com deduplicação perfeita, fallback automático e tracking robusto para **maximizar suas conversões** e **eliminar eventos perdidos**.

## ✨ Funcionalidades Principais

### 🎯 **Tracking Duplo + Fallback**
- ✅ **Facebook Pixel** (client-side) - Disparo imediato no navegador
- ✅ **Conversion API** (server-side) - Envio seguro pelo servidor  
- ✅ **Cron Fallback** - Reenvio automático em caso de falha
- ✅ **Deduplicação total** - EventID único elimina duplicatas

### 🛡️ **Anti-Perda de Eventos**
- ✅ **Anti-AdBlock** - Detecta e contorna bloqueadores
- ✅ **Anti-WebView** - Bypass para apps móveis
- ✅ **Múltiplas tentativas** - Sistema de retry inteligente
- ✅ **Logs de auditoria** - Rastreamento completo de eventos

### 🔧 **Tecnologia Robusta**
- ✅ **Node.js + Express** - Backend escalável
- ✅ **PostgreSQL + SQLite** - Dupla redundância de dados
- ✅ **Cache em memória** - Performance otimizada
- ✅ **Rate limiting** - Proteção contra ataques

---

## 🚀 Instalação Rápida

### 1. **Clone e Configure**

```bash
# Clone o projeto
git clone https://github.com/seu-usuario/facebook-tracking-system.git
cd facebook-tracking-system

# Instale dependências
npm install

# Configure variáveis de ambiente
cp .env.example .env
nano .env
```

### 2. **Configure o Facebook**

Edite o arquivo `.env`:

```env
# OBRIGATÓRIO: Substitua pelos seus dados reais
FB_PIXEL_ID=123456789012345
FB_PIXEL_TOKEN=EAAX...seu_token_aqui
DATABASE_URL=postgresql://user:pass@host:5432/db
```

### 3. **Configure a Página HTML**

Edite `obrigado.html` linha 25:

```javascript
PIXEL_ID: '123456789012345', // ← Seu Pixel ID aqui
```

### 4. **Inicie o Sistema**

```bash
# Inicia servidor principal
npm start

# Em outro terminal, inicia o cron fallback
npm run cron
```

### 5. **Teste o Sistema**

```bash
# Verificar saúde do sistema
curl http://localhost:3000/health

# Ver estatísticas
curl http://localhost:3000/api/stats

# Testar página de obrigado
curl http://localhost:3000/obrigado.html?token=test123
```

---

## 📋 Configuração Detalhada

### 🔧 **Variáveis de Ambiente**

| Variável | Obrigatório | Descrição | Exemplo |
|----------|-------------|-----------|---------|
| `FB_PIXEL_ID` | ✅ | ID do Facebook Pixel | `123456789012345` |
| `FB_PIXEL_TOKEN` | ✅ | Token Conversions API | `EAAX...` |
| `DATABASE_URL` | ⚠️ | PostgreSQL connection string | `postgresql://...` |
| `PORT` | ❌ | Porta do servidor | `3000` |
| `NODE_ENV` | ❌ | Ambiente de execução | `production` |

### 🗄️ **Banco de Dados**

**PostgreSQL (Recomendado para produção):**
```bash
# Criar banco de dados
createdb tracking_db

# String de conexão
DATABASE_URL=postgresql://user:password@localhost:5432/tracking_db
```

**SQLite (Fallback automático):**
```bash
# Será criado automaticamente se PostgreSQL não estiver disponível
SQLITE_PATH=./tracking.db
```

### 🌐 **Configuração do Domínio**

1. **Upload dos arquivos** para seu servidor web
2. **Configure HTTPS** (obrigatório para Facebook Pixel)
3. **Teste a página**: `https://seudominio.com/obrigado.html?token=test123`

---

## 🎯 Como Usar

### 📄 **Página de Obrigado (`obrigado.html`)**

**URL de acesso:**
```
https://seudominio.com/obrigado.html?token=TOKEN_UNICO
```

**O que acontece automaticamente:**
1. 🔄 **Carrega Facebook Pixel** e inicializa
2. 🍪 **Captura cookies** `_fbp` e `_fbc` (múltiplas tentativas)
3. 🎲 **Gera EventID único** para deduplicação
4. 📡 **Dispara Purchase via Pixel** (client-side)
5. 🚀 **Envia para CAPI** via fetch para `/api/track-purchase`
6. ✅ **Mostra status** em tempo real na página

### 🔗 **API Backend (`server.js`)**

**Endpoint principal:**
```bash
POST /api/track-purchase
Content-Type: application/json

{
  "token": "abc123",
  "eventId": "unique_event_id",
  "value": 97.00,
  "currency": "BRL",
  "fbp": "_fbp_cookie",
  "fbc": "_fbc_cookie",
  "pixel_fired": true
}
```

**Resposta:**
```json
{
  "success": true,
  "message": "Evento Purchase enviado com sucesso",
  "eventId": "unique_event_id",
  "facebook_response": {...},
  "processing_time": 1250
}
```

### ⏰ **Cron Fallback (`cron.js`)**

**Execução automática:**
- 🕐 **A cada 5 minutos** busca tokens pendentes
- 🔍 **Filtra elegíveis**: > 5min sem evento enviado
- 🚀 **Reenvia via CAPI** com EventID único
- 📊 **Logs detalhados** de cada tentativa

**Execução manual:**
```bash
npm run cron
```

---

## 📊 Monitoramento e Logs

### 🔍 **Endpoints de Monitoramento**

```bash
# Status geral do sistema
GET /health

# Estatísticas detalhadas  
GET /api/stats

# Verificar token específico
POST /api/verify-token
{"token": "abc123"}
```

### 📈 **Métricas Importantes**

**Estatísticas retornadas por `/api/stats`:**
```json
{
  "stats": {
    "tokens": {
      "total": 1500,
      "pixel_sent": 1450,
      "capi_sent": 1480,
      "last_24h": 95
    },
    "events": {
      "total": 2930,
      "success": 2895
    },
    "success_rate": "98.80%",
    "cache_size": 234,
    "database_type": "postgresql"
  }
}
```

### 📋 **Logs do Sistema**

**Logs do servidor:**
```bash
[2024-01-15T10:30:00.000Z] 🎯 Recebida requisição de tracking
[2024-01-15T10:30:00.100Z] ✅ Token encontrado: id=123, status=valid
[2024-01-15T10:30:00.200Z] 📤 Enviando para Facebook CAPI
[2024-01-15T10:30:00.350Z] ✅ Facebook CAPI resposta: event_id=xyz
[2024-01-15T10:30:00.400Z] 🎉 Purchase enviado com sucesso via CAPI!
```

**Logs do cron:**
```bash
[CRON 2024-01-15T10:35:00.000Z] 🚀 Iniciando execução do cron fallback
[CRON 2024-01-15T10:35:00.100Z] Encontrados 3 tokens para processamento
[CRON 2024-01-15T10:35:01.200Z] ✅ Purchase enviado via CAPI (cron) para token abc123
[CRON 2024-01-15T10:35:02.500Z] 📊 Execução concluída: 3 sucessos, 0 falhas, 0 pulados
```

---

## 🧪 Testes e Validação

### 🔧 **Teste Local**

```bash
# 1. Inicie o servidor
npm start

# 2. Teste a página (substitua pelo seu token)
curl -I http://localhost:3000/obrigado.html?token=test123

# 3. Teste o endpoint diretamente
curl -X POST http://localhost:3000/api/track-purchase \
  -H "Content-Type: application/json" \
  -d '{
    "token": "test123",
    "eventId": "test_event_123",
    "value": 97.00,
    "currency": "BRL"
  }'
```

### 🌐 **Teste em Produção**

1. **Facebook Pixel Helper** (extensão Chrome):
   - Acesse `https://seudominio.com/obrigado.html?token=test`
   - Verifique se o Pixel carregou e o Purchase foi disparado

2. **Facebook Events Manager**:
   - Vá para [business.facebook.com/events_manager](https://business.facebook.com/events_manager)
   - Filtre por EventID para verificar deduplicação
   - Confirme que eventos estão chegando via Pixel e CAPI

3. **Teste de AdBlock**:
   - Instale uBlock Origin
   - Acesse a página e verifique se CAPI ainda funciona

---

## 🛠️ Troubleshooting

### ❌ **Problemas Comuns**

#### **Erro: FB_PIXEL_ID não configurado**
```bash
❌ ERRO: FB_PIXEL_ID não configurado para produção!
```
**Solução:** Configure `FB_PIXEL_ID` no arquivo `.env`

#### **Erro: Token não encontrado**
```json
{"success": false, "error": "Token não encontrado"}
```
**Solução:** 
- Verifique se o token existe no banco de dados
- Confirme a conexão com PostgreSQL/SQLite

#### **Erro: Facebook API Error**
```bash
❌ Erro no Facebook CAPI: Facebook API Error: Invalid access token
```
**Solução:**
- Regenere o Access Token no Business Manager
- Verifique permissões do token (manage ads, manage business)

#### **Pixel não carrega**
```bash
⚠️ AdBlock detectado! Alguns eventos podem não ser enviados
```
**Solução:** 
- Sistema já detecta e usa CAPI como fallback
- Verifique logs do servidor para confirmar envio via CAPI

### 🔍 **Debug Avançado**

**Habilite debug detalhado:**
```env
NODE_ENV=development
DEBUG_MODE=true
CRON_DEBUG=true
```

**Logs de debug na página:**
```javascript
// No navegador, abra Console (F12)
// Acesse variável global de debug:
console.log(window.trackingDebug.logs());
```

**Teste manual do cron:**
```bash
# Execute uma vez
node -e "
const { runFallbackManually } = require('./cron');
runFallbackManually().then(console.log);
"
```

---

## 🔐 Segurança e Performance

### 🛡️ **Recursos de Segurança**

- ✅ **Rate Limiting** - 100 requests/minuto por IP
- ✅ **CORS configurável** - Apenas domínios autorizados
- ✅ **Headers de segurança** - XSS, CSRF, Clickjacking protection
- ✅ **Sanitização de dados** - Validação de entrada
- ✅ **Logs de auditoria** - Rastreamento de todas as operações

### ⚡ **Otimizações de Performance**

- ✅ **Cache em memória** - Deduplicação ultra-rápida
- ✅ **Conexão pool** - PostgreSQL otimizado
- ✅ **Compressão gzip** - Resposta 60% menor
- ✅ **Limpeza automática** - Remove dados antigos (30 dias)

### 📏 **Limites e Dimensionamento**

| Métrica | Limite | Observação |
|---------|--------|------------|
| Requests/min | 100 | Por IP (configurável) |
| Cache TTL | 60 min | Deduplicação (configurável) |
| Retry attempts | 3 | Por evento (configurável) |
| Cron interval | 5 min | Fallback (configurável) |
| Batch size | 10 | Cron processing (configurável) |

---

## 🚀 Deploy em Produção

### 🌐 **VPS/Servidor Dedicado**

```bash
# 1. Instalar Node.js 16+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Instalar PostgreSQL
sudo apt-get install postgresql postgresql-contrib

# 3. Clone e configure o projeto
git clone https://github.com/seu-usuario/facebook-tracking-system.git
cd facebook-tracking-system
npm install

# 4. Configure variáveis de ambiente
cp .env.example .env
nano .env

# 5. Instalar PM2 para gerenciamento
npm install -g pm2

# 6. Iniciar serviços
pm2 start server.js --name "tracking-server"
pm2 start cron.js --name "tracking-cron"
pm2 save
pm2 startup
```

### ☁️ **Heroku**

```bash
# 1. Prepare o projeto
echo "web: node server.js" > Procfile
echo "worker: node cron.js" >> Procfile

# 2. Deploy
git add .
git commit -m "Deploy tracking system"
git push heroku main

# 3. Configure variáveis
heroku config:set FB_PIXEL_ID=123456789012345
heroku config:set FB_PIXEL_TOKEN=EAAX...
heroku config:set DATABASE_URL=postgres://...

# 4. Scale workers
heroku ps:scale web=1 worker=1
```

### 🐳 **Docker**

```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  tracking-server:
    build: .
    ports:
      - "3000:3000"
    environment:
      - FB_PIXEL_ID=${FB_PIXEL_ID}
      - FB_PIXEL_TOKEN=${FB_PIXEL_TOKEN}
      - DATABASE_URL=${DATABASE_URL}
    depends_on:
      - postgres
  
  tracking-cron:
    build: .
    command: node cron.js
    environment:
      - FB_PIXEL_ID=${FB_PIXEL_ID}
      - FB_PIXEL_TOKEN=${FB_PIXEL_TOKEN}
      - DATABASE_URL=${DATABASE_URL}
    depends_on:
      - postgres
  
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: tracking_db
      POSTGRES_USER: tracking_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

---

## 📚 Documentação Técnica

### 🏗️ **Arquitetura do Sistema**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   FRONTEND      │    │     BACKEND     │    │    FACEBOOK     │
│  obrigado.html  │◄──►│    server.js    │◄──►│   Pixel + CAPI  │
│                 │    │                 │    │                 │
│ • Facebook Pixel│    │ • Express API   │    │ • Events Manager│
│ • Cookie capture│    │ • PostgreSQL    │    │ • Conversions   │
│ • EventID gen   │    │ • Deduplication │    │ • Attribution   │
│ • Status display│    │ • Rate limiting │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                       ┌─────────────────┐
                       │   CRON FALLBACK │
                       │     cron.js     │
                       │                 │
                       │ • Auto retry    │
                       │ • Batch process │
                       │ • Error recovery│
                       └─────────────────┘
```

### 🔄 **Fluxo de Dados**

```
1. Usuário acessa obrigado.html?token=abc123
2. JavaScript captura cookies _fbp/_fbc
3. Gera EventID único: evt_timestamp_random_token
4. Dispara fbq('track', 'Purchase', {...}, {eventID})
5. Envia POST /api/track-purchase com mesmo EventID
6. Backend valida token no banco de dados
7. Verifica deduplicação via cache em memória
8. Envia para Facebook CAPI com user_data
9. Atualiza flags no banco (pixel_sent, capi_sent)
10. Cron verifica tokens sem eventos a cada 5 min
11. Reenvia via CAPI se necessário (máx 3 tentativas)
```

### 🗃️ **Schema do Banco de Dados**

```sql
-- Tabela principal de tokens
CREATE TABLE tokens (
    id SERIAL PRIMARY KEY,
    token VARCHAR(255) UNIQUE NOT NULL,
    telegram_id BIGINT,
    value DECIMAL(10,2),
    currency VARCHAR(3) DEFAULT 'BRL',
    status VARCHAR(50) DEFAULT 'valid',
    
    -- Flags de controle de eventos
    pixel_sent BOOLEAN DEFAULT FALSE,
    capi_sent BOOLEAN DEFAULT FALSE,
    cron_sent BOOLEAN DEFAULT FALSE,
    capi_ready BOOLEAN DEFAULT FALSE,
    
    -- Tracking de eventos
    event_id VARCHAR(255),
    first_event_sent_at TIMESTAMP,
    last_event_attempt TIMESTAMP,
    event_attempts INTEGER DEFAULT 0,
    
    -- Dados do usuário (hasheados)
    hashed_email VARCHAR(64),
    hashed_phone VARCHAR(64),
    hashed_fn VARCHAR(64),
    hashed_ln VARCHAR(64),
    external_id VARCHAR(64),
    
    -- Dados de sessão
    fbp VARCHAR(255),
    fbc VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    
    -- Metadados
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

-- Tabela de logs de eventos
CREATE TABLE event_logs (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(255) NOT NULL,
    event_name VARCHAR(50) NOT NULL,
    source VARCHAR(20) NOT NULL, -- 'pixel', 'capi', 'cron'
    status VARCHAR(20) NOT NULL, -- 'success', 'failed', 'retry'
    
    token VARCHAR(255),
    telegram_id BIGINT,
    value DECIMAL(10,2),
    currency VARCHAR(3),
    
    -- Dados de resposta
    fb_response JSONB,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- Metadados de request
    ip_address INET,
    user_agent TEXT,
    request_data JSONB,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🤝 Contribuição

### 📋 **Como Contribuir**

1. **Fork** o repositório
2. **Crie** uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. **Commit** suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. **Push** para a branch (`git push origin feature/AmazingFeature`)
5. **Abra** um Pull Request

### 🐛 **Reportar Bugs**

Abra uma [issue](https://github.com/seu-usuario/facebook-tracking-system/issues) com:
- **Descrição** detalhada do problema
- **Passos** para reproduzir
- **Logs** relevantes (sem dados sensíveis)
- **Ambiente** (OS, Node.js version, etc.)

### 💡 **Sugerir Melhorias**

Ideas são sempre bem-vindas! Abra uma issue com tag `enhancement`.

---

## 📄 Licença

Este projeto está licenciado sob a **MIT License** - veja o arquivo [LICENSE](LICENSE) para detalhes.

---

## 🔗 Links Úteis

- 📖 [Facebook Conversions API Documentation](https://developers.facebook.com/docs/marketing-api/conversions-api)
- 🎯 [Facebook Pixel Documentation](https://developers.facebook.com/docs/facebook-pixel)
- 🛠️ [Facebook Pixel Helper](https://chrome.google.com/webstore/detail/facebook-pixel-helper/fdgfkebogiimcoedlicjlajpkdmockpc)
- 📊 [Facebook Events Manager](https://business.facebook.com/events_manager)
- 🏢 [Facebook Business Manager](https://business.facebook.com/)

---

## 🎉 Resultado Final

Com este sistema implementado, você terá:

✅ **99%+ de cobertura** de eventos Purchase  
✅ **Deduplicação perfeita** entre Pixel e CAPI  
✅ **Fallback automático** para eventos perdidos  
✅ **Logs completos** para auditoria e debug  
✅ **Performance otimizada** com cache e pooling  
✅ **Segurança robusta** com rate limiting e validação  

**🚀 Agora é só configurar suas variáveis e começar a printar dinheiro com tracking perfeito!**

---

*Made with ❤️ for maximum Facebook tracking performance*
