# ⚡ Setup Rápido - Facebook Pixel + CAPI

**Guia de 5 minutos para colocar o sistema funcionando em produção**

---

## 🚀 1. Download e Instalação

```bash
# Clone o projeto
git clone https://github.com/seu-usuario/facebook-tracking-system.git
cd facebook-tracking-system

# Instale dependências
npm install
```

---

## 🔧 2. Configuração Obrigatória

### **A. Configure variáveis de ambiente**
```bash
# Copie o arquivo de exemplo
cp .env.example .env

# Edite o arquivo .env com seus dados reais
nano .env
```

### **B. OBRIGATÓRIO - Configure estas 3 variáveis:**
```env
FB_PIXEL_ID=123456789012345           # ← SEU PIXEL ID
FB_PIXEL_TOKEN=EAAX_seu_token_aqui    # ← SEU ACCESS TOKEN
DATABASE_URL=postgresql://user:pass@host:5432/db  # ← SEU BANCO (opcional)
```

### **C. Configure a página HTML**
Edite `obrigado.html` linha 25:
```javascript
PIXEL_ID: '123456789012345', // ← MESMO PIXEL ID
```

---

## 🌐 3. Como Obter Facebook Pixel ID e Token

### **A. Pixel ID**
1. Acesse [business.facebook.com](https://business.facebook.com)
2. Vá em **Ferramentas de Dados** → **Pixels**
3. Copie o **ID do Pixel** (15 dígitos)

### **B. Access Token**
1. Acesse [business.facebook.com/settings/system-users](https://business.facebook.com/settings/system-users)
2. Crie um **System User** ou use existente
3. Gere **Access Token** com permissões:
   - `ads_management`
   - `business_management`
4. Copie o token (começa com `EAAX...`)

---

## 💾 4. Banco de Dados (Opcional)

### **SQLite (Automático)**
```bash
# Nada para fazer - será criado automaticamente em ./tracking.db
```

### **PostgreSQL (Recomendado)**
```bash
# Instale PostgreSQL
sudo apt-get install postgresql

# Crie banco
sudo -u postgres createdb tracking_db

# Configure .env
DATABASE_URL=postgresql://postgres:senha@localhost:5432/tracking_db
```

---

## 🎬 5. Execute o Sistema

```bash
# Terminal 1: Servidor principal
npm start

# Terminal 2: Cron fallback
npm run cron
```

**Pronto! Sistema rodando em:** `http://localhost:3000`

---

## ✅ 6. Teste Rápido

### **A. Health Check**
```bash
curl http://localhost:3000/health
# Deve retornar: {"status":"ok"...}
```

### **B. Teste da Página**
```bash
# Acesse no navegador:
http://localhost:3000/obrigado.html?token=test123

# Abra Console (F12) e veja logs do tracking
```

### **C. Teste da API**
```bash
curl -X POST http://localhost:3000/api/track-purchase \
  -H "Content-Type: application/json" \
  -d '{
    "token": "test123",
    "eventId": "test_event",
    "value": 97.00
  }'
```

---

## 🌐 7. Deploy em Produção

### **VPS/Servidor**
```bash
# 1. Upload dos arquivos
scp -r ./* user@servidor.com:/var/www/tracking/

# 2. No servidor
cd /var/www/tracking
npm install --production

# 3. Configure .env com dados reais
nano .env

# 4. Instale PM2
npm install -g pm2

# 5. Execute
pm2 start server.js --name tracking-server
pm2 start cron.js --name tracking-cron
pm2 save && pm2 startup
```

### **Heroku**
```bash
# 1. Crie Procfile
echo "web: node server.js" > Procfile
echo "worker: node cron.js" >> Procfile

# 2. Deploy
git add . && git commit -m "Deploy"
git push heroku main

# 3. Configure variáveis
heroku config:set FB_PIXEL_ID=123456789012345
heroku config:set FB_PIXEL_TOKEN=EAAX_seu_token
```

---

## 🎯 8. Como Usar na Sua Landing

### **A. Página de Obrigado**
```html
<!-- Redirecione usuários após pagamento para: -->
https://seudominio.com/obrigado.html?token=TOKEN_UNICO_DO_PAGAMENTO
```

### **B. O que Acontece Automaticamente**
1. ✅ Facebook Pixel carrega e dispara Purchase
2. ✅ Cookies `_fbp`/`_fbc` são capturados
3. ✅ EventID único é gerado para deduplicação
4. ✅ CAPI envia Purchase para servidor Facebook
5. ✅ Cron reenvia se algo falhar (fallback)

---

## 📊 9. Monitoramento

### **A. Verificar Status**
```bash
# Status geral
curl http://localhost:3000/health

# Estatísticas
curl http://localhost:3000/api/stats
```

### **B. Facebook Events Manager**
1. Acesse [business.facebook.com/events_manager](https://business.facebook.com/events_manager)
2. Veja eventos **Purchase** chegando
3. Filtre por **Event ID** para ver deduplicação

### **C. Logs do Sistema**
```bash
# Acompanhe logs em tempo real
tail -f logs/tracking.log

# Ou veja logs do PM2
pm2 logs tracking-server
```

---

## 🔧 10. Comandos Úteis

```bash
# Verificar saúde
npm run health

# Ver estatísticas
npm run stats

# Executar cron manualmente
npm run cron

# Testar conexão do banco
npm run test

# Parar sistema
pm2 stop all

# Reiniciar sistema
pm2 restart all
```

---

## ⚠️ 11. Checklist de Produção

Antes de ir para produção, verifique:

- ✅ `FB_PIXEL_ID` configurado corretamente
- ✅ `FB_PIXEL_TOKEN` com permissões corretas
- ✅ `NODE_ENV=production` no .env
- ✅ HTTPS configurado no domínio
- ✅ Página `obrigado.html` acessível
- ✅ Eventos chegando no Events Manager
- ✅ Logs sem erros críticos
- ✅ Cron rodando automaticamente

---

## 🚨 12. Troubleshooting Rápido

### **Erro: FB_PIXEL_ID não configurado**
```bash
# Verifique se está no .env
grep FB_PIXEL_ID .env
```

### **Erro: Token não encontrado**
```bash
# Verifique conexão do banco
npm run test
```

### **Pixel não carrega**
```bash
# Teste com Facebook Pixel Helper (extensão Chrome)
# Desabilite AdBlock temporariamente
```

### **CAPI falhando**
```bash
# Verifique token no Business Manager
# Regenere se necessário
```

---

## 💬 13. Suporte

- 📖 **Documentação completa:** [README.md](README.md)
- 🐛 **Reportar bugs:** GitHub Issues
- 💡 **Sugestões:** GitHub Discussions

---

**🎉 Pronto! Seu sistema de tracking está funcionando!**

**Em 5 minutos você tem:**
- ✅ Facebook Pixel + CAPI integrados
- ✅ Deduplicação automática
- ✅ Fallback para eventos perdidos
- ✅ Logs completos de auditoria
- ✅ 99%+ de cobertura de eventos

**Agora é só direcionar suas conversões para `/obrigado.html?token=XXX` e ver os Purchase chegando no Facebook!** 🚀