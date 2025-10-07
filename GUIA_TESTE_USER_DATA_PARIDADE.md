# 🧪 Guia de Teste - Paridade de User Data

## Objetivo
Verificar se os eventos Purchase do Browser e CAPI estão enviando **TODOS** os dados de usuário.

---

## 📋 Pré-requisitos

- [ ] Servidor Node.js rodando
- [ ] Acesso ao console do navegador (F12)
- [ ] Acesso aos logs do servidor
- [ ] Acesso ao Facebook Events Manager

---

## 🔍 Teste Completo

### Passo 1: Preparar o Ambiente

1. **Abra o terminal do servidor:**
   ```bash
   # Certifique-se de que o servidor está rodando
   node server.js
   ```

2. **Abra o navegador com Developer Tools (F12):**
   - Vá para a aba "Console"
   - Limpe o console (botão 🚫 ou `Ctrl+L`)

3. **Abra o Facebook Events Manager em outra aba:**
   - Vá para: https://business.facebook.com/events_manager/
   - Acesse o pixel correto
   - Vá para "Test Events" ou "Eventos"

---

### Passo 2: Realizar uma Compra de Teste

1. **Inicie o fluxo de checkout:**
   - Acesse a página de checkout
   - Preencha os dados
   - Gere o PIX
   - Complete o pagamento (teste)

2. **Acesse a página de obrigado:**
   ```
   /obrigado_purchase_flow.html?token=seu_token&valor=20
   ```

3. **Preencha o formulário:**
   - Email: `teste@exemplo.com`
   - Telefone: `(11) 99999-9999`
   - Clique em "Confirmar e Continuar"

---

### Passo 3: Verificar Logs do Browser

No console do navegador, procure por estes logs:

#### ✅ Log 1: Advanced Matching Preparado
```javascript
[PURCHASE-BROWSER] 📊 Advanced Matching enviado ao Pixel:
{
    fields: Array(7) ["em", "ph", "fn", "ln", "external_id", "fbp", "fbc"],
    has_em: true,           // ← DEVE SER TRUE
    has_ph: true,           // ← DEVE SER TRUE
    has_fn: true,           // ← DEVE SER TRUE
    has_ln: true,           // ← DEVE SER TRUE
    has_external_id: true,  // ← DEVE SER TRUE
    has_fbp: true,          // ← DEVE SER TRUE
    has_fbc: true           // ← DEVE SER TRUE
}
```

#### ✅ Log 2: Purchase Enviado com User Data
```javascript
[PURCHASE-BROWSER] ✅ Purchase enviado ao Pixel com TODOS os dados:
{
    event_id: "pur:a00f3d93-605b-4b89-b6d9-38a57f59800c",
    custom_data_fields: 12,
    user_data_fields: 7,
    has_em: true,           // ← DEVE SER TRUE
    has_ph: true,           // ← DEVE SER TRUE
    has_fn: true,           // ← DEVE SER TRUE
    has_ln: true,           // ← DEVE SER TRUE
    has_external_id: true   // ← DEVE SER TRUE
}
```

**⚠️ Se algum campo for `false`, há um problema!**

---

### Passo 4: Verificar Logs do Servidor

No terminal do servidor, procure por:

#### ✅ Log 1: User Data Completo
```
[PURCHASE-CAPI] 📊 user_data completo sendo enviado:
{
    has_em: true,           // ← DEVE SER TRUE
    has_ph: true,           // ← DEVE SER TRUE
    has_fn: true,           // ← DEVE SER TRUE
    has_ln: true,           // ← DEVE SER TRUE
    has_external_id: true,  // ← DEVE SER TRUE
    has_fbp: true,          // ← DEVE SER TRUE
    has_fbc: true,          // ← DEVE SER TRUE
    has_client_ip: true,    // ← DEVE SER TRUE
    has_client_ua: true,    // ← DEVE SER TRUE
    total_fields: 9         // ← DEVE SER 9
}
```

#### ✅ Log 2: Resumo Completo do Evento
```
[PURCHASE-CAPI] 📋 RESUMO COMPLETO DO EVENTO:
{
    event_id: "pur:xxx",
    transaction_id: "xxx",
    value: 20.00,
    currency: "BRL",
    user_data_fields: {
        em: "1 hash(es)",              // ← DEVE TER HASH
        ph: "1 hash(es)",              // ← DEVE TER HASH
        fn: "1 hash(es)",              // ← DEVE TER HASH
        ln: "1 hash(es)",              // ← DEVE TER HASH
        external_id: "1 hash(es)",     // ← DEVE TER HASH
        fbp: "enviado",                // ← DEVE SER "enviado"
        fbc: "enviado",                // ← DEVE SER "enviado"
        client_ip_address: "enviado",  // ← DEVE SER "enviado"
        client_user_agent: "enviado"   // ← DEVE SER "enviado"
    }
}
```

**⚠️ Se algum campo for "não enviado", há um problema!**

---

### Passo 5: Verificar no Facebook Events Manager

#### Opção A: Test Events (Tempo Real)

1. Vá para "Test Events" no Events Manager
2. Você deve ver **2 eventos Purchase** (Browser + Server)
3. Clique em cada evento para ver detalhes

**Browser Event - Deve mostrar:**
- ✅ E-mail
- ✅ Telefone
- ✅ Nome próprio
- ✅ Apelido
- ✅ Identificação externa
- ✅ Endereço IP
- ✅ Agente utilizador

**Server Event - Deve mostrar:**
- ✅ E-mail
- ✅ Telefone
- ✅ Nome próprio
- ✅ Apelido
- ✅ Identificação externa
- ✅ Endereço IP
- ✅ Agente utilizador

#### Opção B: Eventos (Produção)

1. Vá para "Eventos" no Events Manager
2. Filtre por "Purchase"
3. Clique em um evento recente
4. Vá para a aba "Detalhes do evento"
5. Procure por "Parâmetros de correspondência avançada"

**Deve mostrar TODOS os 7 campos:**
- ✅ E-mail
- ✅ Telefone
- ✅ Nome próprio
- ✅ Apelido
- ✅ Identificação externa
- ✅ Endereço IP
- ✅ Agente utilizador

---

## 📊 Tabela de Verificação

Use esta tabela para marcar o que está funcionando:

| Verificação | Browser | CAPI | Status |
|-------------|---------|------|--------|
| Email (em) | [ ] | [ ] | |
| Telefone (ph) | [ ] | [ ] | |
| Nome (fn) | [ ] | [ ] | |
| Sobrenome (ln) | [ ] | [ ] | |
| CPF (external_id) | [ ] | [ ] | |
| FBP | [ ] | [ ] | |
| FBC | [ ] | [ ] | |
| IP | [ ] | [ ] | |
| User Agent | [ ] | [ ] | |

**✅ Teste aprovado se TODOS os campos estiverem marcados!**

---

## 🐛 Troubleshooting

### Problema 1: `has_em: false` no Browser

**Causa:** Email não foi normalizado ou hash não foi gerado.

**Solução:**
1. Verifique se o script `/shared/purchaseNormalization.js` está carregando
2. Verifique se o email foi preenchido corretamente
3. Verifique o console por erros

### Problema 2: `has_client_ip: false` no CAPI

**Causa:** IP não foi capturado no banco de dados.

**Solução:**
1. Verifique a coluna `ip_criacao` na tabela `tokens`
2. Verifique se o middleware de captura de IP está funcionando
3. Verifique os logs do servidor

### Problema 3: Não vejo os campos no Facebook

**Causa:** Dados podem estar sendo enviados mas o Facebook ainda está processando.

**Solução:**
1. Aguarde alguns minutos (o Facebook pode demorar para processar)
2. Use "Test Events" para ver em tempo real
3. Verifique se o `test_event_code` está configurado

### Problema 4: `total_fields: 5` ao invés de 9

**Causa:** Alguns campos estão `null` ou `undefined`.

**Solução:**
1. Verifique se todos os dados estão no banco (email, phone, payer_name, payer_cpf, ip_criacao, user_agent_criacao)
2. Verifique se o webhook do PushinPay está salvando todos os dados
3. Verifique se o formulário de contato está salvando email e phone

---

## ✅ Checklist Final

- [ ] Browser envia 7 campos de user data
- [ ] CAPI envia 9 campos de user data
- [ ] Facebook mostra todos os campos no evento Browser
- [ ] Facebook mostra todos os campos no evento CAPI
- [ ] Deduplicação está funcionando (1 evento ao invés de 2)
- [ ] Logs do browser estão completos
- [ ] Logs do servidor estão completos

**Se todos os itens estiverem marcados, a correção está funcionando perfeitamente! 🎉**

---

## 📞 Suporte

Se encontrar problemas:

1. Verifique os logs detalhados no console e servidor
2. Compare com os exemplos deste guia
3. Consulte `CORRECAO_PARIDADE_USER_DATA.md` para detalhes técnicos
4. Verifique o código em:
   - `MODELO1/WEB/obrigado_purchase_flow.html`
   - `services/purchaseCapi.js`
   - `capi/metaCapi.js`
