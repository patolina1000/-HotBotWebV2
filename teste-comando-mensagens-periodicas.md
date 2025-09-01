# 📋 Comando Manual para Mensagens Periódicas

## 🚀 Novo Comando Implementado

Agora você tem um comando manual no bot para testar todas as mensagens periódicas, similar ao comando `/enviar_todos_ds`.

### 📱 **Comando:**
```
/enviar_todas_mensagens_periodicas
```

### 🔧 **Como usar:**

1. **Abra o chat do bot no Telegram**
2. **Digite o comando:** `/enviar_todas_mensagens_periodicas`
3. **Aguarde** o envio de todas as mensagens periódicas configuradas

### 📊 **O que o comando faz:**

1. **Envia uma mensagem inicial** informando que está enviando as mensagens periódicas
2. **Para cada mensagem periódica configurada:**
   - Envia a mídia associada (se configurada)
   - Envia o texto da mensagem com o horário
   - Envia o menu inicial após cada mensagem
3. **Envia uma mensagem final** confirmando que todas foram enviadas

### ⏱️ **Timing:**
- **3 segundos** entre cada mensagem periódica
- **Delays automáticos** para evitar rate limiting do Telegram

### 📋 **Mensagens configuradas atualmente:**

- **08:00** - Mídia: `ds1.jpg`
- **19:00** - Mídia: `ds2.jpg` 
- **21:00** - Mídia: `ds1.jpg`
- **23:00** - Mídia: `ds2.jpg`

### 🎯 **Casos de uso:**

1. **Teste de copy** - Avaliar se os textos estão adequados
2. **Verificação de mídias** - Confirmar se as imagens estão sendo enviadas corretamente
3. **Ajustes de timing** - Testar os delays entre mensagens
4. **Validação do menu** - Verificar se o menu inicial aparece corretamente

### 🔄 **Comandos disponíveis:**

| Comando | Função |
|---------|--------|
| `/enviar_todos_ds` | Testa todos os downsells |
| `/enviar_todas_mensagens_periodicas` | Testa todas as mensagens periódicas |
| `/status` | Verifica status do usuário |
| `/reset` | Reseta progresso do usuário |

### 💡 **Dicas:**

- Use este comando sempre que fizer alterações nas mensagens periódicas
- Teste em um chat privado primeiro antes de usar em produção
- Monitore os logs para verificar se há erros
- As mídias devem estar na pasta `./midia/downsells/`

### 🚨 **Tratamento de erros:**

- Se não houver mensagens periódicas configuradas, o bot informará
- Erros de envio são logados mas não interrompem o processo
- Usuários bloqueados são automaticamente pulados
