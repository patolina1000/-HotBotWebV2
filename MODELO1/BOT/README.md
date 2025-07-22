# Bot de Vendas no Telegram com Downsells Automatizados

Este projeto é um bot de vendas em Telegram com:
- Geração de cobranças via PIX (PushinPay)
- Sequência automática de downsells
- Entrega de conteúdo após pagamento
- Webhook de pagamento com interrupção dos downsells

---

## 🚀 Como rodar localmente

1. Clone este repositório:
```bash
git clone https://github.com/seuusuario/bot-vendas-telegram.git
cd bot-vendas-telegram
```

2. Instale as dependências:
```bash
npm install
```

3. Configure o `.env` com suas chaves:
```
TELEGRAM_TOKEN=seu_token_do_bot
PUSHINPAY_TOKEN=seu_token_pushinpay
UTMIFY_API_TOKEN=seu_token_utmify
```

4. Inicie o bot:
```bash
npm start
```

---

## 🌐 Deploy no Render

1. Suba o projeto para o GitHub (com `.env` e `pagamentos.db` no `.gitignore`)
2. No Render:
   - **Type:** Web Service
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** adicione `TELEGRAM_TOKEN`, `PUSHINPAY_TOKEN` e `UTMIFY_API_TOKEN`

3. Configure o webhook na PushinPay com:
```
https://seuapp.onrender.com/webhook/pushinpay
```

---

## 🛠 Scripts úteis

- `reset.js` → Reseta o progresso de downsells no banco (use para testes)

---

## 📁 Estrutura

```
BOT/
├── bot.js                 # Lógica principal do bot
├── config.js              # Configurações e textos do funil
├── pagamentos.db          # Banco SQLite para progresso de downsell
├── reset.js               # Script para debug (resetar usuários)
├── midia/                 # Mídias usadas (vídeos, imagens, áudio)
├── .env                   # Suas chaves (NÃO subir)
├── package.json
├── package-lock.json
```
