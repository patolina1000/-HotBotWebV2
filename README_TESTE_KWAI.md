# Teste da Kwai Event API

Este teste verifica se os eventos da API do Kwai estão sendo enviados corretamente para a plataforma de monitoramento.

## 🎯 O que o teste faz

O teste envia 3 eventos principais para a Kwai Event API:

1. **EVENT_CONTENT_VIEW** - Simula quando alguém clica em CTA
2. **EVENT_ADD_TO_CART** - Simula quando um PIX é gerado  
3. **EVENT_PURCHASE** - Simula quando um pagamento é aprovado

## 🔧 Configuração necessária

### 1. Variáveis de ambiente
Crie um arquivo `.env` na raiz do projeto com:

```bash
KWAI_PIXEL_ID=seu_pixel_id_real
KWAI_ACCESS_TOKEN=seu_access_token_real
NODE_ENV=development
```

### 2. Instalar dependências
```bash
npm install axios
```

## 🚀 Como executar o teste

### Opção 1: Teste completo (recomendado)
```bash
node test-kwai-events.js
```

### Opção 2: Teste individual
```javascript
const { testSingleEvent } = require('./test-kwai-events');

// Testar apenas EVENT_CONTENT_VIEW
testSingleEvent('EVENT_CONTENT_VIEW', {
  content_id: 'test_content_001',
  currency: 'BRL'
});
```

## 📋 Parâmetros de teste

O teste usa os seguintes parâmetros conforme especificado pela Kwai:

- **clickid**: `Lw2HvYVkoj1MyzQwwNX4dg` (fixo para teste)
- **trackFlag**: `true` (modo de teste ativado)
- **testFlag**: `true` (modo de teste ativado)
- **URL da API**: `https://www.adsnebula.com/log/common/api`

## 🔍 O que verificar

### 1. No console do teste
- ✅ Mensagens de sucesso para cada evento
- ✅ Status HTTP 200
- ✅ Resposta da API do Kwai

### 2. Na plataforma de monitoramento do Kwai
- Os eventos devem aparecer na tela de monitoramento
- Verificar se o click_id está sendo recebido corretamente
- Confirmar que as properties estão sendo processadas

## ⚠️ Solução de problemas

### Erro: "KWAI_PIXEL_ID não configurado"
- Verifique se o arquivo `.env` existe
- Confirme se as variáveis estão preenchidas corretamente

### Erro: "KWAI_ACCESS_TOKEN não configurado"
- Verifique se o access_token está correto
- Confirme se não há espaços extras

### Erro: "Request timeout"
- Verifique sua conexão com a internet
- A API pode estar lenta, tente novamente

### Erro: "Unauthorized" (401)
- Verifique se o access_token está correto
- Confirme se o pixel_id está ativo

## 🔄 Para produção

Quando estiver funcionando em produção, altere no código:

```javascript
testFlag: false,  // false para produção
trackFlag: false, // false para produção
```

## 📱 Eventos implementados no sistema

### 1. EVENT_CONTENT_VIEW
- **Quando**: Usuário clica em CTA no `/modelo1/web/index.html`
- **Arquivo**: `MODELO1/WEB/kwai-click-tracker.js`

### 2. EVENT_ADD_TO_CART  
- **Quando**: PIX é gerado
- **Arquivo**: `MODELO1/core/TelegramBotService.js` (linha ~1138)

### 3. EVENT_PURCHASE
- **Quando**: Pagamento é aprovado
- **Arquivo**: `MODELO1/core/TelegramBotService.js` (linha ~1357)

## 🔗 Arquivos relacionados

- `services/kwaiEventAPI.js` - Serviço principal da API
- `server.js` - Rota `/api/kwai-event`
- `MODELO1/WEB/kwai-click-tracker.js` - Tracking no frontend
- `MODELO1/core/TelegramBotService.js` - Tracking no backend

## 📞 Suporte

Se os testes falharem:
1. Verifique as credenciais no arquivo `.env`
2. Confirme se a API do Kwai está funcionando
3. Verifique os logs de erro no console
4. Teste com um evento individual primeiro
