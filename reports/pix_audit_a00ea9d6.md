# PIX Audit Report - Transaction a00ea9d6-3889-4c8e-b934-2978787285fd

## Extracted Facts
| Campo | Valor |
| --- | --- |
| Gateway usado | pushinpay |
| Transaction ID | a00ea9d6-3889-4c8e-b934-2978787285fd |
| Status de criação | OK (gateway), raw_response.status=created |
| raw_response.value | 2000 |
| webhook.status | paid |
| webhook.value | '2000' |
| end_to_end_id | E18236120202510071446s15ee279393 |
| payer_name | ARTHUR LOPES DE FRANÇA |
| payer_national_registration | 12861888490 |
| BASE URL | https://ohvips.xyz |
| FRONTEND URL | https://ohvips.xyz |

## Valor Unificado
- webhook.value → 2000 centavos → valor_reais 20.00.

## Consistência
- Corpo da requisição (valor=20), raw_response.value=2000, webhook.value='2000' → todos concordam (20,00 BRL).

## Observações de Ruído
- [funnel-metrics] falha ao registrar evento devido a coluna `token` ausente (não relacionado ao pagamento).

## Diagnóstico de price_cents nulo/0
- Webhook normaliza price_cents=2000, porém sincronização posterior persiste `price_cents: null` no PostgreSQL (`[bot1] 💾 Registro sincronizado ... price_cents: null`).
- Consequência: Link omitindo `valor` e CAPI bloqueado por `price_cents` ausente. O 0 surge ao recarregar da base com valor nulo antes de montar o link/pixel.
- Prioridade correta de fonte para valor: `webhook.value` → `raw_response.value` → `body.valor * 100`.


## Snippet Sugerido
```javascript
const sources = {
  webhook: payload?.value,
  raw: rawResponse?.value,
  body: typeof body?.valor === 'number' ? Math.round(body.valor * 100) : null,
};

const cents = [sources.webhook, sources.raw, sources.body]
  .map((v, idx) => {
    if (v == null) return null;
    const coerced = typeof v === 'string' ? Number.parseInt(v, 10) : Number(v);
    return Number.isFinite(coerced) ? coerced : null;
  })
  .find((v) => v != null);

if (!Number.isFinite(cents) || cents <= 0) {
  throw new Error('price_cents inválido');
}

const valor = (cents / 100).toFixed(2);
const url = new URL('/obrigado_purchase_flow.html', FRONTEND_URL);
const params = new URLSearchParams({ token, price_cents: String(cents), valor });
url.search = params.toString();

logger.info({ source: 'pix-link', price_cents: cents, valor, url: url.toString() });
```
