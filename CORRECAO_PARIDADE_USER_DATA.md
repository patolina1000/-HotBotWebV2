# Correção de Paridade de User Data - Browser vs CAPI

## Problema Identificado

Os eventos de Purchase enviados pelo Browser Pixel e pelo CAPI (Servidor) estavam enviando dados de usuário diferentes:

### Antes da Correção:

**Browser Pixel:**
- Mostrava apenas: "Parâmetros de correspondência avançada: Endereço IP, Agente utilizador"
- Não estava enviando os hashes de: Email, Nome próprio, Apelido, Telefone, Identificação externa (CPF)

**CAPI (Servidor):**
- Mostrava: "Chaves de dados do utilizador: E-mail, Identificação externa, Nome próprio, Apelido, Telefone"
- Não estava mostrando claramente o IP e User Agent

## Solução Implementada

### 1. Browser Pixel (`MODELO1/WEB/obrigado_purchase_flow.html`)

**Alterações:**
- Adicionado `fbp` e `fbc` ao objeto `advancedMatching`
- Implementada estratégia dupla de envio:
  1. `fbq('set', 'userData', advancedMatching)` - Define dados globalmente
  2. Envio direto dos campos hasheados no evento Purchase

**Código:**
```javascript
// 1. Definir userData globalmente
fbq('set', 'userData', advancedMatching);

// 2. Enviar userData diretamente no evento
const purchaseEventData = {
    ...pixelCustomData,
    em: advancedMatching.em,         // Email hash
    ph: advancedMatching.ph,         // Phone hash
    fn: advancedMatching.fn,         // First name hash
    ln: advancedMatching.ln,         // Last name hash
    external_id: advancedMatching.external_id  // CPF hash
};

fbq('track', 'Purchase', purchaseEventData, { eventID: eventId });
```

### 2. CAPI (`services/purchaseCapi.js`)

**Alterações:**
- Melhorados os logs para mostrar TODOS os campos enviados
- Adicionado log detalhado de user_data antes do envio

**Dados enviados pelo CAPI:**
```javascript
userData = {
    em: [hash_email],              // Email (SHA256)
    ph: [hash_phone],              // Phone (SHA256)
    fn: [hash_first_name],         // First name (SHA256)
    ln: [hash_last_name],          // Last name (SHA256)
    external_id: [hash_cpf],       // CPF (SHA256)
    fbp: cookie_fbp,               // Facebook Browser ID
    fbc: cookie_fbc,               // Facebook Click ID
    client_ip_address: ip,         // IP do usuário
    client_user_agent: user_agent  // User Agent do navegador
}
```

### 3. Função `buildUserData` (`capi/metaCapi.js`)

Já estava correta! A função já captura:
- ✅ Email hash (em)
- ✅ Phone hash (ph)
- ✅ First name hash (fn)
- ✅ Last name hash (ln)
- ✅ External ID hash (external_id / CPF)
- ✅ FBP (Facebook Browser ID)
- ✅ FBC (Facebook Click ID)
- ✅ Client IP Address
- ✅ Client User Agent

## Como Verificar

### No Console do Browser

Ao enviar um Purchase, você deve ver logs assim:

```
[PURCHASE-BROWSER] 📊 Advanced Matching enviado ao Pixel:
{
    fields: ["em", "ph", "fn", "ln", "external_id", "fbp", "fbc"],
    has_em: true,
    has_ph: true,
    has_fn: true,
    has_ln: true,
    has_external_id: true,
    has_fbp: true,
    has_fbc: true
}

[PURCHASE-BROWSER] ✅ Purchase enviado ao Pixel com TODOS os dados:
{
    event_id: "pur:xxx",
    has_em: true,
    has_ph: true,
    has_fn: true,
    has_ln: true,
    has_external_id: true
}
```

### No Log do Servidor

Ao processar o Purchase CAPI, você deve ver:

```
[PURCHASE-CAPI] 📊 user_data completo sendo enviado:
{
    has_em: true,
    has_ph: true,
    has_fn: true,
    has_ln: true,
    has_external_id: true,
    has_fbp: true,
    has_fbc: true,
    has_client_ip: true,
    has_client_ua: true,
    total_fields: 9
}

[PURCHASE-CAPI] 📋 RESUMO COMPLETO DO EVENTO:
{
    event_id: "pur:xxx",
    transaction_id: "xxx",
    value: 20.00,
    currency: "BRL",
    user_data_fields: {
        em: "1 hash(es)",
        ph: "1 hash(es)",
        fn: "1 hash(es)",
        ln: "1 hash(es)",
        external_id: "1 hash(es)",
        fbp: "enviado",
        fbc: "enviado",
        client_ip_address: "enviado",
        client_user_agent: "enviado"
    }
}
```

### No Facebook Events Manager

Agora AMBOS os eventos devem mostrar:

**Browser Event:**
- ✅ E-mail
- ✅ Telefone
- ✅ Nome próprio
- ✅ Apelido
- ✅ Identificação externa (CPF)
- ✅ Endereço IP (capturado automaticamente)
- ✅ Agente utilizador (capturado automaticamente)

**Server Event (CAPI):**
- ✅ E-mail
- ✅ Telefone
- ✅ Nome próprio
- ✅ Apelido
- ✅ Identificação externa (CPF)
- ✅ Endereço IP
- ✅ Agente utilizador

## Deduplicação

Com esta correção, o Facebook conseguirá fazer a deduplicação perfeita entre os dois eventos, pois ambos têm:
- ✅ Mesmo `event_id`
- ✅ Mesmos dados de usuário (email, phone, nome, CPF, IP, UA)
- ✅ Mesmos cookies (fbp, fbc)
- ✅ Mesmo timestamp (sincronizado)

## Resultado Esperado

No Facebook Events Manager, ao clicar em um evento Purchase, você deve ver em "Parâmetros de correspondência" (tanto para Browser quanto CAPI):

- ✅ E-mail
- ✅ Telefone
- ✅ Nome próprio
- ✅ Apelido
- ✅ Identificação externa
- ✅ Endereço IP
- ✅ Agente utilizador

Isso garante a **máxima qualidade de correspondência** e permite que o Facebook:
1. Faça deduplicação perfeita entre Browser e Server events
2. Atribua conversões corretamente às campanhas
3. Melhore o match rate com os perfis do Facebook
4. Otimize melhor as campanhas publicitárias

## Arquivos Modificados

1. `MODELO1/WEB/obrigado_purchase_flow.html` - Browser Pixel
2. `services/purchaseCapi.js` - CAPI
3. `capi/metaCapi.js` - Já estava correto (sem alterações)

## Próximos Passos

1. Testar um Purchase completo (browser + CAPI)
2. Verificar os logs no console e no servidor
3. Confirmar no Facebook Events Manager que ambos os eventos mostram todos os dados
4. Verificar a deduplicação no Facebook (deve mostrar 1 evento dedupado ao invés de 2)
