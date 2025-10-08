# Changelog - Remoção de QR Code (Apenas PIX Copia e Cola)

**Data:** 2025-10-08  
**Objetivo:** Eliminar completamente a funcionalidade de QR Code no fluxo do bot, mantendo apenas o código PIX "copia e cola" em texto.

---

## Arquivos Modificados

### 1. `/workspace/MODELO1/core/TelegramBotService.js`

#### Handler de Callback `qr_code_` (Linhas 4636-4672)
- **COMENTADO** - Handler completo que enviava imagem do QR Code quando usuário clicava no botão "Qr code"
- Não é mais necessário, pois o botão foi removido

#### Envio de Imagem PIX (Linhas 4803-4815)
- **COMENTADO** - Envio da imagem `./midia/pix_image.png` via `sendPhoto`
- O fluxo agora envia apenas mensagens de texto com o código PIX

#### Botão "Qr code" (Linha 4836-4839)
- **COMENTADO** - Botão inline que disparava o callback `qr_code_${transacao_id}`
- **ADICIONADO** - Log `[PIX-SHOW]` demonstrando envio do texto com código

#### Botão de Verificação (Linha 4837)
- **ALTERADO** - Texto do botão de "EFETUEI O PAGAMENTO" para "✅ Já paguei (verificar)"
- Mantém a mesma funcionalidade de verificação

### 2. `/workspace/MODELO1/BOT/config.js`

#### Mensagem de Expiração (Linha 383)
- **ANTES:** `'❌ Este QR Code expirou. Por favor, gere uma nova cobrança.'`
- **DEPOIS:** `'❌ Este código PIX expirou. Por favor, gere uma nova cobrança.'`

### 3. `/workspace/MODELO1/BOT/config.default.js`

#### Mensagem de Expiração (Linha 334)
- **ANTES:** `'❌ Este QR Code expirou. Por favor, gere uma nova cobrança.'`
- **DEPOIS:** `'❌ Este código PIX expirou. Por favor, gere uma nova cobrança.'`

### 4. `/workspace/MODELO1/WEB/obrigado_especial.html`

#### Exibição do QR Code (Linhas 312-315)
- **COMENTADO** - Div que exibia a imagem do QR Code (`<img id="qr-image">`)

#### Mensagens de Loading/Erro (Linhas 308-326)
- **ALTERADO** - Textos de "Gerando QR code PIX..." para "Gerando código PIX..."
- **ALTERADO** - "Erro ao gerar QR code" para "Erro ao gerar código PIX"

#### Função JavaScript `gerarQRCodePIX()` (Linhas 503-555)
- **COMENTADO** - Referências a `qrContainer` e `qrImage`
- **COMENTADO** - Código que exibia a imagem: `qrImage.src = data.qr_code_base64`
- **ALTERADO** - Validação não mais requer `data.qr_code_base64`, apenas `data.pix_copia_cola`
- Mantém apenas a exibição do código PIX em texto

### 5. `/workspace/checkout/index.html`

#### Validação de Resposta (Linha 1205)
- **ANTES:** `if (data.success && data.qr_code_base64 && data.pix_copia_cola)`
- **DEPOIS:** `if (data.success && data.pix_copia_cola)` (com comentário explicativo)

#### Exibição do QR Code (Linhas 1562-1567)
- **COMENTADO** - Div que exibia a imagem do QR Code

### 6. `/workspace/checkout/funil_completo/assinatura_premiada.html`

#### Exibição do QR Code (Linhas 658-663)
- **COMENTADO** - Div que exibia a imagem do QR Code

### 7. `/workspace/checkout/funil_completo/chamada_premiada.html`

#### Exibição do QR Code (Linhas 1221-1226)
- **COMENTADO** - Div que exibia a imagem do QR Code

---

## Fluxo Atual (Após Mudanças)

### Quando usuário seleciona um plano:

1. **Mensagem de aguarde** - "⏳ Aguarde um instante, estou gerando seu PIX..."

2. **Instruções de pagamento** - Passo a passo de como pagar:
   ```
   ✅ Como realizar o pagamento:
   1. Abra o aplicativo do seu banco.
   2. Selecione a opção "Pagar" ou "PIX".
   3. Escolha "PIX Copia e Cola".
   4. Cole a chave que está abaixo e finalize o pagamento com segurança.
   ```

3. **Aviso para copiar** - "Copie o código abaixo:"

4. **Código PIX** - Em formato `<pre>` para facilitar cópia:
   ```
   <pre>00020126580014br.gov.bcb.pix...</pre>
   ```

5. **Botão de verificação** - Apenas 1 botão:
   - **"✅ Já paguei (verificar)"** → Callback `verificar_pagamento_${transacao_id}`

### Handler de Verificação (Sem mudanças)

- Continua funcionando normalmente
- Chama endpoint `/api/payment-status/${transacao_id}`
- Se `paid`:
  - Atualiza DB com `status='valido'`
  - Persiste `payer_name` e `payer_cpf`
  - Envia CTA de acesso via `URL_ENVIO_X`
- Se `pending`: "Ainda pendente..."
- Se `expired`: Oferece "🔄 Gerar novo código"

---

## Dados Mantidos (Não Apagados)

### Banco de Dados
- Campo `qr_code_base64` em `tokens` table - **MANTIDO** (não usado)
- Campo `pix_copia_cola` em `tokens` table - **USADO ATIVAMENTE**

### Arquivos
- `./midia/pix_image.png` - **MANTIDO** (não usado)
- `qr_debug.png` - **MANTIDO** (não usado)

### Código Backend
- Rotas `/api/gerar-qr-pix` - **MANTIDAS** (ainda retornam `qr_code_base64`, mas não é mais usado)
- Gateway PIX (`services/pushinpay.js`, `services/oasyfy.js`) - **SEM ALTERAÇÕES**
- Webhook handlers - **SEM ALTERAÇÕES**

---

## Logs Implementados

### `[PIX-SHOW]` - Quando enviado código PIX
```javascript
console.log(`[${this.botId}] [PIX-SHOW] Texto enviado para ${chatId}:`, {
  telegram_id: chatId,
  provider_id: transacao_id,
  has_qr_code_string: !!pix_copia_cola
});
```

### Logs Existentes Mantidos
- `[PIX-VERIFY]` - Verificação de status
- `[PIX-WEBHOOK]` - Update via webhook
- Logs de criação de cobrança

---

## Testes Sugeridos

1. ✅ Selecionar plano → Receber apenas código PIX (sem imagem)
2. ✅ Clicar em "Já paguei" → Verificar status
3. ✅ Pagamento confirmado via webhook → Receber CTA de acesso
4. ✅ Código expirado → Receber mensagem correta ("código PIX" não "QR Code")
5. ✅ Páginas web (checkout/obrigado) → Exibir apenas código PIX (sem imagem)

---

## Compatibilidade

- ✅ Gateway PIX continua funcionando normalmente
- ✅ Webhook continua recebendo notificações
- ✅ Persistência de dados continua igual
- ✅ Verificação de pagamento continua funcional
- ✅ Tracking e CAPI não afetados

---

## Próximos Passos (Opcional)

1. Remover dependência `qrcode` do `package.json` (se existir)
2. Remover coluna `qr_code_base64` do banco (após backup)
3. Remover arquivos de imagem não usados
4. Atualizar documentação do projeto

---

**Nota:** Todas as mudanças foram feitas **comentando** o código antigo, não apagando. Isso facilita rollback se necessário.