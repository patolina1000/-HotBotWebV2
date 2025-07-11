# SiteHot Backend

Este projeto reúne o bot do Telegram e o backend web. Para enviar eventos do Facebook Pixel (Conversions API) configure as seguintes variáveis no arquivo `.env`:

```
FB_PIXEL_ID=seu_id_do_pixel
FB_PIXEL_TOKEN=seu_token_de_acesso
FB_TEST_EVENT_CODE=codigo_de_teste_opcional
```

O evento `InitiateCheckout` é disparado após a geração do Pix no endpoint `/api/gerar-cobranca`. O serviço `services/facebook.js` envia os dados `fbp`, `fbc`, IP, User-Agent e valor em reais utilizando a Conversions API.

Para executar testes básicos do banco de dados use:

```
npm test
```
