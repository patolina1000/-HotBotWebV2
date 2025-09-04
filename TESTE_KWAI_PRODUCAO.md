# 🎯 TESTE DO FLUXO REAL DA KWAI EVENT API EM PRODUÇÃO

## 📋 VISÃO GERAL

Este guia explica como testar o fluxo completo de eventos da Kwai Event API **mesmo com `NODE_ENV=production`**, permitindo validar seu sistema antes de ativar campanhas reais.

## 🔧 CONFIGURAÇÃO RÁPIDA

### 1. Configurar variáveis de ambiente
```bash
# Copiar arquivo de exemplo
cp KWAI_TEST_CONFIG.env .env

# Editar com suas credenciais reais
nano .env
```

### 2. Preencher credenciais no .env
```bash
# Credenciais obrigatórias da Kwai
KWAI_PIXEL_ID=seu_pixel_id_real_aqui
KWAI_ACCESS_TOKEN=seu_access_token_real_aqui

# 🔥 NOVO: Modo de teste (funciona mesmo em produção)
KWAI_TEST_MODE=true

# 🔥 NOVO: Click ID para testes (opcional)
KWAI_CLICK_ID_TESTE=click_id_de_teste_aqui

# Ambiente
NODE_ENV=production
```

## 🎯 COMO FUNCIONA

### Modo de Teste vs Produção
- **`KWAI_TEST_MODE=true`**: Eventos aparecem na aba "Test Events" da Kwai
- **`KWAI_TEST_MODE=false`**: Eventos aparecem na aba "Live Events" da Kwai

### Fluxo de Eventos Implementado
1. **EVENT_CONTENT_VIEW** - Usuário visualiza a página
2. **EVENT_ADD_TO_CART** - Usuário gera PIX (adiciona ao carrinho)
3. **EVENT_PURCHASE** - Pagamento aprovado

## 🧪 EXECUTANDO TESTES

### Teste Automático
```bash
# Testar fluxo completo
node test-kwai-producao.js
```

### Teste Manual via Interface Web
1. Acesse sua landing page com parâmetros UTM
2. Clique no CTA (dispara EVENT_CONTENT_VIEW)
3. Gere um PIX (dispara EVENT_ADD_TO_CART)
4. Aprove o pagamento (dispara EVENT_PURCHASE)

## 🔍 VERIFICANDO RESULTADOS

### Na Interface da Kwai
1. Acesse: https://business.kwai.com/
2. Vá em "Test Events" do seu pixel
3. Verifique se os eventos aparecem com "happened..."

### Nos Logs do Servidor
```bash
# Ver logs em tempo real
tail -f logs/app.log

# Ou no console onde executou o servidor
```

## 🚨 SOLUÇÃO DE PROBLEMAS

### Eventos não aparecem na Kwai
1. ✅ Verificar se `KWAI_TEST_MODE=true`
2. ✅ Confirmar credenciais no .env
3. ✅ Verificar se pixel está "Active"
4. ✅ Testar com click_id válido da interface

### Erro "Click ID não fornecido"
1. ✅ Verificar captura de UTMs na landing page
2. ✅ Confirmar se `click_id` está na URL
3. ✅ Verificar localStorage do navegador

### Erro de autenticação
1. ✅ Verificar `KWAI_ACCESS_TOKEN`
2. ✅ Confirmar se token não expirou
3. ✅ Verificar permissões do pixel

## 🔄 TRANSIÇÃO PARA PRODUÇÃO

### Quando estiver funcionando:
```bash
# 1. Testar com KWAI_TEST_MODE=true
# 2. Validar todos os eventos na interface
# 3. Mudar para produção:

KWAI_TEST_MODE=false
NODE_ENV=production
```

### Monitoramento em Produção
- Eventos aparecerão na aba "Live Events"
- Dados serão usados para otimização de campanhas
- `trackFlag=false` para campanhas reais

## 📱 TESTE DO FLUXO COMPLETO

### 1. Landing Page
- Acesse com parâmetros UTM incluindo `click_id`
- Verifique se `click_id` é capturado e armazenado

### 2. CTA Click
- Clique no botão do Telegram
- Deve disparar `EVENT_CONTENT_VIEW`

### 3. Geração PIX
- Gere um PIX de teste
- Deve disparar `EVENT_ADD_TO_CART`

### 4. Aprovação
- Aprove o pagamento
- Deve disparar `EVENT_PURCHASE`

## 🎉 SUCESSO!

Se todos os eventos aparecerem na aba "Test Events" da Kwai:
- ✅ Seu sistema está funcionando
- ✅ Fluxo de tracking está correto
- ✅ Pode ativar campanhas reais
- ✅ Mude para `KWAI_TEST_MODE=false`

## 📞 SUPORTE

### Logs Úteis
- Console do navegador
- Logs do servidor
- Interface da Kwai (Test Events)

### Verificações Finais
1. Todos os eventos aparecem na Kwai
2. `click_id` é capturado corretamente
3. Propriedades dos eventos estão corretas
4. Respostas da API são `result: 1`
