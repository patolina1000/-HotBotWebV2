# 🎯 Facebook Pixel - Rastreamento de Eventos no Chatbot

## Visão Geral

Este documento serve como guia definitivo para o rastreamento de eventos do Facebook Pixel implementado em nosso chatbot. O sistema de rastreamento foi desenvolvido para análise de funil de conversão, otimização de campanhas publicitárias e criação de audiências para retargeting, permitindo acompanhar o comportamento dos usuários desde a entrada no bot até a conclusão da compra.

O rastreamento é exclusivamente baseado nas interações dentro do chatbot Telegram, sem dependência de páginas web externas, garantindo que todos os eventos sejam originados diretamente das ações do usuário no bot.

---

## 📊 Detalhamento dos Eventos

### PageView

#### Descrição do Evento
O evento PageView representa o carregamento inicial da página de destino após o usuário clicar em um link do chatbot. Este evento marca o primeiro contato do usuário com nossa plataforma web.

#### Quando é Acionado no Bot
O evento PageView é disparado **automaticamente** quando:
- O usuário clica em um link de pagamento gerado pelo bot
- A página de destino (`obrigado.html` ou `obrigado_especial.html`) é carregada completamente
- O Facebook Pixel é inicializado com sucesso na página

**Fluxo específico:**
1. Usuário seleciona um plano no chatbot
2. Bot gera link de pagamento PIX
3. Usuário clica no link e é redirecionado para página de destino
4. Página carrega e dispara automaticamente o evento PageView

#### Parâmetros Enviados
- **event_source_url**: URL da página de destino
- **fbp**: Cookie do Facebook Pixel (se disponível)
- **fbc**: Cookie do Facebook Click ID (se disponível)

---

### AddToCart

#### Descrição do Evento
O evento AddToCart representa o momento em que o usuário demonstra interesse inicial em adquirir um produto, marcando o início do processo de conversão.

#### Quando é Acionado no Bot
O evento AddToCart é disparado **automaticamente** quando:
- O usuário envia o comando `/start` no chatbot
- É a primeira interação do usuário com o bot (não há cache de AddToCart para este chat)
- O sistema detecta que é uma nova sessão de interesse

**Fluxo específico:**
1. Usuário inicia conversa com o bot via `/start`
2. Sistema verifica se já existe cache de AddToCart para este chat_id
3. Se não existir, dispara automaticamente o evento AddToCart
4. Sistema marca no cache para evitar duplicatas

#### Parâmetros Enviados
- **value**: Valor aleatório entre R$ 9,90 e R$ 19,90 (gerado automaticamente)
- **currency**: "BRL"
- **content_name**: "Entrada pelo Bot"
- **content_category**: "Telegram Funil +18"
- **external_id**: Hash SHA-256 do token do usuário (se disponível)
- **fbp**: Cookie do Facebook Pixel (se disponível)
- **fbc**: Cookie do Facebook Click ID (se disponível)

---

### InitiateCheckout

#### Descrição do Evento
O evento InitiateCheckout representa o momento em que o usuário inicia o processo de pagamento, demonstrando intenção clara de compra ao selecionar um plano específico.

#### Quando é Acionado no Bot
O evento InitiateCheckout é disparado quando:
- O usuário seleciona um plano específico através dos botões inline do chatbot
- O sistema inicia o processo de geração do PIX
- A cobrança é criada com sucesso no gateway de pagamento

**Fluxo específico:**
1. Usuário navega pelo menu de planos do bot
2. Usuário clica em um dos botões de plano (ex: "🥉 7 Dias de Grupo VIP - R$ 19,90")
3. Bot processa a seleção e inicia geração do PIX
4. Sistema dispara evento InitiateCheckout antes de enviar o link de pagamento
5. Bot envia mensagem com link do PIX para o usuário

#### Parâmetros Enviados
- **value**: Valor exato do plano selecionado (em reais)
- **currency**: "BRL"
- **utm_source**: Fonte da campanha (se disponível)
- **utm_medium**: Meio da campanha (se disponível)
- **utm_campaign**: Nome da campanha (se disponível)
- **utm_term**: Termo da campanha (se disponível)
- **utm_content**: Conteúdo da campanha (se disponível)
- **fbp**: Cookie do Facebook Pixel (se disponível)
- **fbc**: Cookie do Facebook Click ID (se disponível)

---

### Purchase

#### Descrição do Evento
O evento Purchase representa a conclusão bem-sucedida de uma compra, sendo o evento mais importante para medição de conversões e otimização de campanhas.

#### Quando é Acionado no Bot
O evento Purchase é disparado quando:
- O pagamento PIX é confirmado pelo gateway de pagamento
- O webhook recebe notificação de pagamento aprovado
- O usuário acessa a página de agradecimento após pagamento confirmado

**Fluxo específico:**
1. Usuário realiza pagamento PIX através do link gerado
2. Gateway de pagamento processa e aprova o pagamento
3. Webhook `/webhook/pushinpay` recebe notificação de pagamento aprovado
4. Sistema dispara evento Purchase via Facebook CAPI (server-side)
5. Usuário é redirecionado para página de agradecimento
6. Página de agradecimento dispara evento Purchase via Facebook Pixel (client-side)
7. Sistema marca evento como enviado para evitar duplicatas

#### Parâmetros Enviados
- **value**: Valor real do plano adquirido (em reais)
- **currency**: "BRL"
- **content_name**: Nome do plano adquirido
- **content_category**: "subscription" ou "Privacy Checkout"
- **transaction_id**: ID único da transação
- **external_id**: Hash SHA-256 gerado com dados do usuário
- **fbp**: Cookie do Facebook Pixel (se disponível)
- **fbc**: Cookie do Facebook Click ID (se disponível)
- **client_ip_address**: Endereço IP do usuário
- **client_user_agent**: User-Agent do navegador

---

## 🔧 Configurações Técnicas

### Variáveis de Ambiente Necessárias
```env
FB_PIXEL_ID=seu_pixel_id_aqui
FB_PIXEL_TOKEN=seu_access_token_aqui
FORCE_FB_TEST_MODE=false
```

### Sistema de Deduplicação
- Todos os eventos utilizam `event_id` único para evitar duplicatas
- Sistema de cache LRU com TTL de 3 dias para otimização de memória
- Deduplicação automática baseada em janela de tempo para eventos Purchase

### Rastreamento Invisível
- Sistema de vinculação automática de cookies `_fbp`/`_fbc` ao `telegram_id`
- Fallback cache para redundância em caso de falhas
- Limpeza automática de cache a cada 30 minutos

---

## 📈 Monitoramento e Logs

### Logs de Eventos
- Todos os eventos são logados com prefixo `[PIXEL]` ou `[FACEBOOK]`
- Logs incluem valor, event_id, fonte e status de envio
- Sistema de auditoria de segurança para compliance

### Métricas Disponíveis
- Taxa de conversão por evento
- Valor médio por transação
- Tempo de conversão do funil
- Taxa de deduplicação de eventos

---

## ⚠️ Considerações Importantes

### Restrições de Funcionamento
- **Exclusividade do Bot**: Todos os eventos são originados exclusivamente do chatbot Telegram
- **Sem Dependência Web**: Não há eventos disparados por páginas web externas como `/checkout`
- **Foco Facebook**: Sistema dedicado exclusivamente ao Facebook Pixel, sem integração com outras plataformas

### Validações de Segurança
- Validação de dados PII hasheados com SHA-256
- Controle de acesso por tokens de API
- Sanitização de dados sensíveis antes do envio
- Logs de auditoria para compliance com LGPD

### Performance
- Processamento assíncrono de eventos para não impactar UX
- Cache inteligente para otimização de memória
- Sistema de filas para evitar sobrecarga do Facebook API
