# Sistema de Tracking de Cliques para Telegram

## Visão Geral

Este sistema implementa o registro de cliques na página de boas-vindas com redirect medido para o Telegram, permitindo contar quantos usuários clicaram no botão e propagar dados de tracking (payload_id + UTMs + fbp/fbc) até o bot escolhido.

## Funcionalidades

### ✅ Endpoint Implementado
- **GET** `/go/telegram?payload_id=...&dest=bot1|bot2`

### ✅ Eventos Registrados
- **`welcome_click`**: Disparado sempre que alguém clica no botão
- **`session_start`**: Disparado quando não existe payload prévio (opcional)

### ✅ Dados Capturados
- **UTMs**: source, medium, campaign, term, content
- **Facebook Pixel**: fbp, fbc
- **Informações do usuário**: IP, User Agent
- **Metadados**: bot de destino, payload_id

## Configuração

### 1. Configuração do Bot
Edite o arquivo `MODELO1/WEB/config.js`:

```javascript
window.config = {
  // ... outras configurações ...
  botDestination: "bot1", // ou "bot2"
  useNewTracking: true    // ativar novo sistema
};
```

### 2. Variáveis de Ambiente
Configure no seu `.env`:

```bash
# Usernames dos bots do Telegram (sem @)
TELEGRAM_BOT1_USERNAME=vipshadrie_bot
TELEGRAM_BOT2_USERNAME=seu_bot2_username
```

## Como Funciona

### Fluxo Completo
1. **Usuário acessa** a página de boas-vindas
2. **Sistema gera** payload_id via `/api/gerar-payload`
3. **Botão atualiza** href para `/go/telegram?payload_id=...&dest=...`
4. **Usuário clica** no botão
5. **Sistema registra** evento `welcome_click` com todos os dados
6. **Redireciona** para `https://t.me/BOT_USERNAME?start=PAYLOAD_ID`

### Estrutura do Evento
```json
{
  "event_name": "welcome_click",
  "bot": "bot1",
  "payload_id": "abc123",
  "meta": {
    "utm_source": "facebook",
    "utm_medium": "cpc",
    "utm_campaign": "campanha_teste",
    "fbp": "fb.1.1234567890.1234567890",
    "fbc": "fb.1.1234567890.1234567890.1234567890",
    "ip": "192.168.1.1",
    "user_agent": "Mozilla/5.0...",
    "redirect_dest": "bot1"
  }
}
```

## Arquivos Modificados

### ✅ `server.js`
- Novo endpoint `/go/telegram`
- Integração com `funnelEvents` service
- Busca de payload no banco de dados
- Redirecionamento para bot correto

### ✅ `MODELO1/WEB/config.js`
- Configuração `botDestination` (bot1/bot2)
- Flag `useNewTracking` para ativar sistema

### ✅ `MODELO1/WEB/index.html`
- Botão usa novo endpoint quando configurado
- Fallback para sistema antigo

### ✅ `MODELO1/WEB/index-with-utm-tracking.html`
- Mesma implementação do index.html
- Compatibilidade mantida

### ✅ `MODELO1/WEB/boasvindas.html`
- Mesma implementação dos outros arquivos
- Logs melhorados para debugging

## Testando o Sistema

### 1. Teste Básico
```bash
curl "http://localhost:3000/go/telegram?payload_id=abc123&dest=bot1"
```

### 2. Verificar Eventos
```bash
curl "http://localhost:3000/api/funnel-events?event_name=welcome_click&bot=bot1"
```

### 3. Verificar Payload
```bash
curl "http://localhost:3000/api/funnel-events?payload_id=abc123"
```

## Fallback e Compatibilidade

### Sistema Antigo
- Mantido para retrocompatibilidade
- Ativado quando `useNewTracking: false`
- Redireciona diretamente para `t.me/BOT?start=PAYLOAD`

### Sistema Novo
- Ativado quando `useNewTracking: true`
- Registra eventos antes do redirect
- Permite escolher entre bot1 e bot2

## Troubleshooting

### ❌ Erro 400: "payload_id e dest são obrigatórios"
- Verifique se os parâmetros estão sendo passados corretamente
- Confirme se o `gerarPayload()` está funcionando

### ❌ Erro 503: "Serviço de eventos do funil não inicializado"
- Verifique se o PostgreSQL está rodando
- Confirme se `funnelEvents` service foi inicializado

### ❌ Redirecionamento não funciona
- Verifique se `TELEGRAM_BOT1_USERNAME` está configurado
- Confirme se o username do bot está correto (sem @)

## Próximos Passos

### 🔮 Funcionalidades Futuras
- [ ] Dashboard para visualizar cliques por bot
- [ ] Métricas de conversão por UTM
- [ ] A/B testing entre bot1 e bot2
- [ ] Integração com analytics externos

### 🔧 Melhorias Técnicas
- [ ] Cache de payloads para performance
- [ ] Rate limiting no endpoint
- [ ] Validação mais robusta de parâmetros
- [ ] Logs estruturados para análise

## Suporte

Para dúvidas ou problemas:
1. Verifique os logs do servidor
2. Confirme configuração do banco de dados
3. Teste endpoint individualmente
4. Verifique variáveis de ambiente
