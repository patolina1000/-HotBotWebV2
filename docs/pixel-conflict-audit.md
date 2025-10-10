# Auditoria de Conflitos do Meta Pixel

## Contexto
Auditoria realizada em 09/10/2025 para mapear todos os carregamentos, redefinições e chamadas do Meta Pixel (`fbevents.js` / `fbq`) no repositório, com foco especial nas páginas `obrigado_purchase_flow` e `/telegram`. Nenhuma correção funcional foi aplicada; foram adicionados apenas artefatos e logs marcados como `// [AUDIT-ONLY]`.

## Varredura Estática
### Inventário de ocorrências do Meta Pixel
| Tipo | Arquivo | Linha(s) | Pixel / Parâmetros | Locale | Observações |
| --- | --- | --- | --- | --- | --- |
| Carregamento `fbevents.js` (inline) | `MODELO1/WEB/obrigado_purchase_flow.html` | 10-17 | `https://connect.facebook.net/en_US/fbevents.js` | `en_US` | Snippet base padrão inserido no `<head>` antes de qualquer outro script do Pixel. |
| Redefinição de `window.fbq` (guard) | `MODELO1/WEB/obrigado_purchase_flow.html` | 20-37 | Wrapper bloqueia quarto argumento em `fbq('set','userData', ...)` e substitui `window.fbq` sem preservar metadados. | — | Executa imediatamente após o snippet base. |
| Chamada `fbq('init')` | `MODELO1/WEB/obrigado_purchase_flow.html` | 51-63 | `fbq('init', sanitizedPixelId)` (ID vindo de `/api/config`). | Herda do config | Executado após sanitização do ID com fetch. |
| Chamada `fbq('set','userData')` | `MODELO1/WEB/obrigado_purchase_flow.html` | 645-651 | `fbq('set', 'userData', userDataPlain)` | — | Dados plaintext para advanced matching. |
| Chamada `fbq('track','Purchase')` | `MODELO1/WEB/obrigado_purchase_flow.html` | 653-660 | `fbq('track','Purchase', pixelCustomData, { eventID })` | — | Purchase dispara após validações e logs. |
| Pixel `<noscript>` | `MODELO1/WEB/obrigado_purchase_flow.html` | 73-75 | `https://www.facebook.com/tr?id=YOUR_PIXEL_ID&ev=PageView&noscript=1` | — | Placeholder sem ID real definido. |
| Carregamento `fbevents.js` (inline) | `MODELO1/WEB/boasvindas.html` | 283-290 | `https://connect.facebook.net/en_US/fbevents.js` | `en_US` | Snippet base com inicialização retardada até config. |
| Chamadas `fbq` | `MODELO1/WEB/boasvindas.html` | 293-307 | `fbq('init', window.__env.FB_PIXEL_ID)`<br>`fbq('track','PageView', {eventID})`<br>`fbq('track','ViewContent', {...})` | Config | Eventos disparam após `loadFacebookConfig()`. |
| Carregamento `fbevents.js` (inline) | `MODELO1/WEB/obrigado.html` | 134-140 | `https://connect.facebook.net/en_US/fbevents.js` | `en_US` | Inclui `fbq.disablePushState = true` antes do init. |
| Chamadas `fbq` | `MODELO1/WEB/obrigado.html` | 143-160 | `fbq('init', window.__env.FB_PIXEL_ID)`<br>`fbq('track','PageView', {eventID})`<br>`fbq('track','ViewContent', {...})` | Config | Mesmo fluxo da página de boas-vindas. |
| Carregamento `fbevents.js` (inline) | `MODELO1/WEB/index-with-utm-tracking.html` | 23-29 | `https://connect.facebook.net/en_US/fbevents.js` | `en_US` | Snippet antes dos scripts de UTMs. |
| Chamadas `fbq` | `MODELO1/WEB/index-with-utm-tracking.html` | 31-47 | `fbq('init', window.__env.FB_PIXEL_ID)`<br>`fbq('track','PageView', {eventID})`<br>`fbq('track','ViewContent', {...})` | Config | Reexecuta caso config ainda não tenha carregado. |
| Carregamento `fbevents.js` (inline) | `MODELO1/WEB/viewcontent-integration-example.html` | 24-31 | `https://connect.facebook.net/en_US/fbevents.js` | `en_US` | Snippet padrão. |
| Chamadas `fbq` | `MODELO1/WEB/viewcontent-integration-example.html` | 34-108 | `fbq('init', window.__env.FB_PIXEL_ID)`<br>`fbq('track','ViewContent', viewContentData)` | Config | ViewContent acionado por interação do usuário. |
| Carregamento `fbevents.js` (inline) | `MODELO1/WEB/event-tracking-example.html` | 25-32 | `https://connect.facebook.net/en_US/fbevents.js` | `en_US` | Snippet padrão. |
| Chamada `fbq('init')` | `MODELO1/WEB/event-tracking-example.html` | 35-43 | `fbq('init', window.__env.FB_PIXEL_ID)` | Config | Base para demos de eventos manuais. |
| Loader dinâmico `fbevents.js` | `MODELO1/WEB/tracking.js` | 88-99 | `https://connect.facebook.net/en_US/fbevents.js` | `en_US` | Função `loadPixelScript()` injeta script e resolve promessa. |
| Chamadas `fbq` | `MODELO1/WEB/tracking.js` | 69-167 | `fbq('init', config.FB_PIXEL_ID)`<br>`fbq('track','PageView', eventData)`<br>`fbq('track','ViewContent', eventData)`<br>`fbq('track','InitiateCheckout', eventData)`<br>`fbq('track','Purchase', eventData)` | Config | Controladas por estado interno `pixelInitialized`. |
| Chamada `fbq('track','Purchase')` | `MODELO1/WEB/timestamp-sync.js` | 94-126 | `fbq('track','Purchase', dados)` | — | Requer `_fbp/_fbc`; envia evento com `eventID` vindo de token. |
| Chamada `fbq('track','ViewContent')` | `MODELO1/WEB/viewcontent-capi-example.js` | 63-110 | `fbq('track','ViewContent', viewContentData)` | — | Parte de rotina de deduplicação Pixel + CAPI. |
| Carregamento `fbevents.js` (inline) | `checkout/index.html` | 148-155 | `https://connect.facebook.net/en_US/fbevents.js` | `en_US` | Snippet base no checkout. |
| Chamadas `fbq` | `checkout/index.html` | 158-169 | `fbq('init', config.FB_PIXEL_ID)`<br>`fbq('track','PageView')` (após `load`) | Config | Inicialização ocorre após fetch do config. |
| Chamadas `fbq` (fluxo checkout) | `checkout/js/facebook-events.js` | 88-312 | `fbq('track','PageView')`<br>`fbq('track','ViewContent', eventData)`<br>`fbq('track','InitiateCheckout', eventData)`<br>`fbq('track','Purchase', eventData)` | Config | Eventos disparados conforme etapas do funil. |
| Loader dinâmico `fbevents.js` | `whatsapp/js/whatsapp-tracking.js` | 2061-2133 | `https://connect.facebook.net/en_US/fbevents.js` | `en_US` | Usa stub `window.fbq` próprio antes de anexar o script. |
| Chamadas `fbq` | `whatsapp/js/whatsapp-tracking.js` | 2213-2337 | `fbq('init', pixelId)`<br>`fbq('set','autoConfig', true, pixelId)`<br>`fbq('track','PageView', eventPayload)`<br>`fbq('track','ViewContent', eventPayload)`<br>`fbq('track','Purchase', pixelEventPayload)` | Config WhatsApp | Rotina rica em logs e tentativas de fallback. |
| Loader dinâmico `fbevents.js` | `whatsapp/js/whatsapp-pixel.js` | 210-270 | `https://connect.facebook.net/en_US/fbevents.js` | `en_US` | Implementação alternativa simplificada. |
| Chamadas `fbq` | `whatsapp/js/whatsapp-pixel.js` | 304-374 | `fbq('init', pixelId)`<br>`fbq('set','autoConfig', true, pixelId)`<br>`fbq('track','TestEvent', eventPayload)` | Config WhatsApp | Usa stub e carregamento próprio. |
| Carregamento `fbevents.js` (inline condicional) | `MODELO1/WEB/telegram/index.html` | 118-142 | `https://connect.facebook.net/en_US/fbevents.js` | `en_US` | Snippet com guardas para evitar múltiplos loaders; adiciona atributo `data-pixel-loader-initialized`. |
| Chamada `fbq('init')` | `MODELO1/WEB/telegram/index.html` | 52-66 | `fbq('init', config.FB_PIXEL_ID, {}, { autoConfig: false })` | Config Telegram | Executado assim que `fbevents.js` estiver disponível; armazena `__FB_PIXEL_ID__`. |
| Pixel `<noscript>` | `MODELO1/WEB/telegram/index.html` | 16-24 | `https://www.facebook.com/tr?id=YOUR_PIXEL_ID&ev=PageView&noscript=1` | — | Placeholder sem ID preenchido. |
| Reatribuição `window.fbq` (enriquecimento UTMs) | `MODELO1/WEB/telegram/utmify-pixel-interceptor.js` | 262-319 | Substitui `window.fbq` por wrapper que injeta UTMs/external_id e tenta instalar até 40 vezes. | — | Mantém `.queue`, `.version`, `.callMethod`, mas redefine função principal. |
| Chamadas `fbq('track', …)` (proxy) | `MODELO1/WEB/telegram/app.js` | 488-682 | `fbq('track','PageView', payload)`<br>`fbq('track','ViewContent', payload)` (em `sendViewContent` e `triggerRedirect`) | Config Telegram | Fluxo aguarda `ensurePixelReady()` e reutiliza wrapper do interceptor. |
| Chamada `fbq('init')` adicional (guard) | `MODELO1/WEB/obrigado_purchase_flow.html` | 20-37 | — | — | Guard altera assinatura de `fbq` antes da biblioteca completar o bootstrap, removendo metadados temporariamente. |

### Terceiros relacionados
- `MODELO1/WEB/index-with-utm-tracking.html` inclui `<script src="https://cdn.utmify.com.br/scripts/utms/latest.js" ...>` que pode manipular UTMs e interagir com `fbq` indiretamente.
- `MODELO1/WEB/telegram` utiliza utilitários próprios (`utmify.js`, `fbclid-handler.js`) que alimentam o interceptor de Pixel.
- Não foram encontrados carregamentos de Google Tag Manager, Segment ou outros injetores externos de Pixel.


## Evidências em Runtime
Para coletar os logs, foi usado um servidor estático (`http-server`) apontado para `MODELO1/WEB` com rotas interceptadas via Playwright para responder `api/config`, `api/geo` e `api/gerar-payload`. O arquivo `diagnostic-pixel-audit.js` (`// [AUDIT-ONLY]`) foi carregado por último em ambas as páginas.

### `obrigado_purchase_flow.html`
```
Failed to load resource: the server responded with a status of 404 (Not Found)
[PIXEL] ✅ Meta Pixel inicializado: 111111111111111
[AUDIT][PIXEL-CONFLICT] proxy aplicado em window.fbq (initial)
[AUDIT][PIXEL-CONFLICT] proxy aplicado em window.fbq (initial)
[AUDIT][PIXEL-CONFLICT] diagnostic-pixel-audit script carregado
[AUDIT][PIXEL-CONFLICT] fbq snapshot (script-load): typeof=function
[AUDIT][PIXEL-CONFLICT] fbq snapshot (script-load): queue=null
[AUDIT][PIXEL-CONFLICT] fbq snapshot (script-load): callMethod=undefined, version=undefined, loaded=undefined
[AUDIT][PIXEL-CONFLICT] fbq snapshot (script-load): window._fbq typeof=function
[PURCHASE-BROWSER] ❌ Biblioteca de normalização indisponível
[PURCHASE-BROWSER] 🔗 Parâmetros de URL {}
[AUDIT][PIXEL-CONFLICT] scripts fbevents detectados (phase=DOMContentLoaded, count=1):
[AUDIT][PIXEL-CONFLICT]  - https://connect.facebook.net/en_US/fbevents.js
[AUDIT][PIXEL-CONFLICT] fbq snapshot (DOMContentLoaded): typeof=function
[AUDIT][PIXEL-CONFLICT] fbq snapshot (DOMContentLoaded): queue=null
[AUDIT][PIXEL-CONFLICT] fbq snapshot (DOMContentLoaded): callMethod=undefined, version=undefined, loaded=undefined
[AUDIT][PIXEL-CONFLICT] fbq snapshot (DOMContentLoaded): window._fbq typeof=function
[Meta Pixel] - Multiple pixels with conflicting versions were detected on this page.
[AUDIT][PIXEL-CONFLICT] scripts fbevents detectados (phase=load, count=1):
[AUDIT][PIXEL-CONFLICT]  - https://connect.facebook.net/en_US/fbevents.js
[AUDIT][PIXEL-CONFLICT] fbq snapshot (load): typeof=function
[AUDIT][PIXEL-CONFLICT] fbq snapshot (load): queue=null
[AUDIT][PIXEL-CONFLICT] fbq snapshot (load): callMethod=function, version=2.9.234, loaded=undefined
[AUDIT][PIXEL-CONFLICT] fbq snapshot (load): window._fbq typeof=function
[AUDIT][PIXEL-CONFLICT] nenhuma chamada fbq registrada pelo proxy.
```
> Observação: o 404 refere-se a `/shared/purchaseNormalization.js` não servido pelo `http-server` (não afeta o Pixel). O aviso de conflito aparece mesmo após um único carregamento de `fbevents.js`, reforçando a hipótese de problemas com a redefinição de `window.fbq`.

### `/telegram/index.html`
```
[AUDIT][PIXEL-CONFLICT] proxy aplicado em window.fbq (initial)
[AUDIT][PIXEL-CONFLICT] proxy aplicado em window.fbq (initial)
[AUDIT][PIXEL-CONFLICT] diagnostic-pixel-audit script carregado
[AUDIT][PIXEL-CONFLICT] fbq snapshot (script-load): typeof=function
[AUDIT][PIXEL-CONFLICT] fbq snapshot (script-load): queue.length=0
[AUDIT][PIXEL-CONFLICT] fbq snapshot (script-load): callMethod=function, version=2.0, loaded=true
[AUDIT][PIXEL-CONFLICT] fbq snapshot (script-load): window._fbq typeof=function
[AUDIT][PIXEL-CONFLICT] scripts fbevents detectados (phase=DOMContentLoaded (immediate), count=1):
[AUDIT][PIXEL-CONFLICT]  - https://connect.facebook.net/en_US/fbevents.js
[AUDIT][PIXEL-CONFLICT] fbq snapshot (DOMContentLoaded (immediate)): typeof=function
[AUDIT][PIXEL-CONFLICT] fbq snapshot (DOMContentLoaded (immediate)): queue.length=0
[AUDIT][PIXEL-CONFLICT] fbq snapshot (DOMContentLoaded (immediate)): callMethod=function, version=2.0, loaded=true
[AUDIT][PIXEL-CONFLICT] fbq snapshot (DOMContentLoaded (immediate)): window._fbq typeof=function
[TRACK] external_id created: e7c6aac75ed670953cada32520ed5c77d072d9d8f12beabac517cb6efaef69b5
[TRACK] external_id ready: e7c6aac75ed670953cada32520ed5c77d072d9d8f12beabac517cb6efaef69b5
[geo] dados de geolocalização recebidos
[geo] cidade detectada
[Meta Pixel] - Multiple pixels with conflicting versions were detected on this page.
[AUDIT][PIXEL-CONFLICT] scripts fbevents detectados (phase=load, count=1):
[AUDIT][PIXEL-CONFLICT]  - https://connect.facebook.net/en_US/fbevents.js
[AUDIT][PIXEL-CONFLICT] fbq snapshot (load): typeof=function
[AUDIT][PIXEL-CONFLICT] fbq snapshot (load): queue.length=0
[AUDIT][PIXEL-CONFLICT] fbq snapshot (load): callMethod=function, version=2.9.234, loaded=true
[AUDIT][PIXEL-CONFLICT] fbq snapshot (load): window._fbq typeof=function
[AUDIT][PIXEL-CONFLICT] nenhuma chamada fbq registrada pelo proxy.
[PIXEL-INT] enrich PageView utms=false user_data.ext=false fbp=false fbc=false
[PIXEL-INT] enrich ViewContent utms=false user_data.ext=false fbp=false fbc=false
[FALLBACK] usando payload_id=payload123
[TRACK] start payload bytes=572
[TRACK] final redirect URL built (source=payload_id)
Failed to load resource: the server responded with a status of 404 (Not Found)
```
> Observação: o 404 ocorre porque o redirect final aponta para `https://t.me/testbot?start=payload123`, que não existe no ambiente de auditoria. O interceptor UTMify loga o enriquecimento e o alerta de conflito surge mesmo com um único script do Pixel.


## Hipóteses avaliadas
### H1 – `fbevents.js` carregado mais de uma vez na mesma página
- **Status:** Indeterminado / risco moderado.
- **Evidência:** Guardas em `MODELO1/WEB/telegram/index.html` verificam scripts existentes (`existingPixelScript`) antes de injetar, e logs do auditor listam apenas um `https://connect.facebook.net/en_US/fbevents.js` em ambas as páginas alvo.
- **Impacto potencial:** Caso alguma outra view (ex.: scripts externos, versões legadas de landing pages) reutilize `whatsapp-tracking.js` ou `tracking.js` no mesmo DOM, pode haver injeção múltipla.
- **Como reproduzir:** Abrir `obrigado_purchase_flow.html` e monitorar rede por `fbevents.js`; repetir em páginas que carreguem `whatsapp/js/whatsapp-tracking.js` simultaneamente para confirmar ausência de duplicidade.

### H2 – `fbevents.js` com locales diferentes simultaneamente
- **Status:** Não observado.
- **Evidência:** Todos os carregamentos apontam para `en_US`. Não há referências a `pt_BR`, `es_LA` ou outros locales.
- **Impacto potencial:** Baixo.
- **Como reproduzir:** Buscar por `connect.facebook.net/.*fbevents.js` e verificar locale; monitorar rede nas páginas principais.

### H3 – Snippet base duplicado (dois IIFEs `!function`)
- **Status:** Indeterminado.
- **Evidência:** Há múltiplas cópias do snippet em diferentes arquivos, mas não foram identificadas duas cópias executando na mesma página principal (`obrigado_purchase_flow` ou `/telegram`). Ainda assim, outras páginas (`boasvindas.html`, `obrigado.html`, etc.) podem coexistir em navegações dentro do mesmo domínio e reexecutar o snippet, especialmente se compondo uma SPA simples.
- **Impacto potencial:** Médio – reexecuções podem gerar o alerta de versões conflitantes.
- **Como reproduzir:** Navegar entre páginas que compartilham layout comum sem recarregar totalmente (p. ex. via `fetch` ou `iframe`) e observar se o snippet roda novamente.

### H4 – `window.fbq` redefinido após inicialização
- **Status:** **Sim** (forte candidato).
- **Evidência:**
  - Guard manual em `obrigado_purchase_flow.html` substitui `window.fbq` por wrapper que não replica `version`, `callMethod` e `loaded` (linhas 20-37).
  - `utmify-pixel-interceptor.js` redefine `window.fbq` diversas vezes com polling até 40 tentativas (linhas 262-319).
  - Logs do auditor mostram `callMethod=undefined` e `version=undefined` imediatamente após a carga na página de obrigado, o que é um gatilho conhecido para o warning.
- **Impacto potencial:** Alto – interferência direta no objeto `fbq` causa o alerta mesmo com um único script.
- **Como reproduzir:** Carregar `obrigado_purchase_flow.html`, abrir console e observar `window.fbq.version` logo após a redefinição. No `/telegram`, acompanhar as redefinições disparadas pelo interceptor.

### H5 – Terceiro injetando Pixel em versão diferente
- **Status:** Indeterminado.
- **Evidência:** Não há GTM/Segment, mas scripts de WhatsApp e UTMify podem ser reutilizados em páginas que não foram auditadas dinamicamente. Esses módulos carregam `fbevents.js` por conta própria e podem coexistir com outras instâncias.
- **Impacto potencial:** Médio – se `whatsapp-tracking.js` for incluído junto com snippet padrão, pode carregar uma cópia separada.
- **Como reproduzir:** Mapear onde `whatsapp/js/whatsapp-tracking.js` e `whatsapp/js/whatsapp-pixel.js` são incluídos; ao abrir essas páginas, verificar se o alerta aparece e quantos scripts `fbevents.js` são carregados.

### H6 – SPA / renders parciais disparando snippet novamente
- **Status:** Indeterminado.
- **Evidência:** Não foram identificados routers SPA explícitos, mas utilitários como `tracking.js` e `utmify` usam listeners e intervalos que podem reexecutar em atualizações parciais.
- **Impacto potencial:** Médio – se o snippet inline for reutilizado em componentes re-renderizados, pode gerar conflitos.
- **Como reproduzir:** Simular navegações internas nas páginas de demo (ex.: `event-tracking-example.html`) observando se novos `<script src="...fbevents.js">` aparecem.

### H7 – Mistura de `init` com `trackSingle` / múltiplos `init`
- **Status:** Não observado.
- **Evidência:** Nenhuma ocorrência de `trackSingle`; todas as chamadas `init` usam o mesmo ID por contexto (config do backend ou WhatsApp).
- **Impacto potencial:** Baixo para o alerta específico de versões.
- **Como reproduzir:** Inspecionar console/Network procurando `trackSingle` e múltiplos IDs simultâneos.

### H8 – Inclusão simultânea de `<noscript>` + JS causando ordem anômala
- **Status:** Não conclusivo.
- **Evidência:** Tanto `obrigado_purchase_flow` quanto `/telegram` possuem `<noscript>` placeholders sem ID válido. Não há sinal de que isso sozinho cause o alerta, mas vale garantir IDs consistentes ou remover placeholders quando não usados.
- **Impacto potencial:** Baixo.
- **Como reproduzir:** Preencher o `tr?id=` com o mesmo ID do `fbq('init')` e verificar se o warning persiste.


## Detalhes por página
### `MODELO1/WEB/obrigado_purchase_flow.html`
- **Ordem de scripts relevantes:** snippet base do Pixel → guard personalizado (`window.fbq` wrapper) → fetch `/api/config` → `purchaseNormalization` (404 em ambiente estático) → `diagnostic-pixel-audit.js` (`// [AUDIT-ONLY]`).
- **`fbq('init')`:** 1 chamada confirmada via código (linha 62) com ID sanitizado do backend.
- **Outros métodos `fbq`:** `set('userData')` (linha 647) e `track('Purchase')` (linha 653) após coleta de dados e UTMs.
- **Scripts `fbevents.js` no DOM:** Auditor registra apenas 1 `<script>` remoto (`https://connect.facebook.net/en_US/fbevents.js`).
- **Reatribuições `window.fbq`:** Guard inline reimplementa `window.fbq` sem copiar `version`/`loaded`; auditor não detectou novas reatribuições depois do load (não houve chamadas extras que gatilhem o proxy).
- **Alertas:** Console exibe `Multiple pixels with conflicting versions` imediatamente após carregamento do Pixel, reforçando que a redefinição inicial é problemática.

### `/telegram`
- **Ordem de scripts relevantes:** noscript → inline config/loader do Pixel → estilos → scripts auxiliares (`fbclid-handler`, `utmify`, `utmify-pixel-interceptor`, `geolocation`, `app`) → `diagnostic-pixel-audit.js` (`// [AUDIT-ONLY]`).
- **`fbq('init')`:** 1 chamada na linha 58 com opções `{ autoConfig: false }` logo após obter o ID do backend.
- **Eventos `fbq('track')`:** `PageView` enviado assim que `ensurePixelReady()` resolve; `ViewContent` disparado antes do redirect; ambos passam pelo interceptor UTMify e recebem enriquecimento condicional.
- **Scripts `fbevents.js` no DOM:** Apenas 1 instância detectada pelo auditor.
- **Reatribuições `window.fbq`:** Interceptor de UTMify substitui `window.fbq` (linhas 262-319) e agenda até 40 tentativas; auditor não registrou `fbq` calls (acontecem antes do proxy), mas snapshots mostram `version` mudando de `2.0` (stub) para `2.9.234` (biblioteca real).
- **Alertas:** Mesmo com guardas para evitar scripts duplicados, o warning de versões conflitantes aparece logo após os scripts de interceptação entrarem em ação.

## Causas mais prováveis (Top 3)
1. **Redefinições diretas de `window.fbq` sem preservar metadados** (`obrigado_purchase_flow` guard e `utmify-pixel-interceptor`): os snapshots mostram `version`/`callMethod` temporariamente `undefined`, que é o padrão de erro citado pela Meta para “conflicting versions”.
2. **Convivência de múltiplos loaders personalizados** (`whatsapp-tracking`, `tracking.js`, `utmify`), cada um com sua lógica de stub/queue. Mesmo quando apenas um é ativo na página, a presença de wrappers múltiplos pode confundir a detecção de versão.
3. **Possível execução repetida do snippet base em demos/páginas combinadas** (diversas cópias do IIFE `!function` presentes). Em cenários onde o HTML é montado dinamicamente ou páginas são incluídas via iframe, é fácil acionar o snippet mais de uma vez.

## Próximos passos sugeridos (sem implementar)
- Consolidar a criação do stub `fbq` em um único utilitário reutilizável, preservando `version`, `loaded`, `callMethod` e `queue` ao aplicar qualquer wrapper/guard.
- Revisar o guard de `userData` (`obrigado_purchase_flow`) para usar `fbq.callMethod`/`Function.prototype.apply` mantendo propriedades do objeto original (ou recorrer a `Proxy`).
- Avaliar se o interceptor UTMify pode operar como `fbq = new Proxy(original)` sem reatribuir globalmente várias vezes.
- Incluir testes manuais monitorando a aba Network (`fbevents.js`, `/?id=...`) para confirmar se apenas uma requisição do Pixel ocorre por página.
- Validar com o Events Manager se o warning persiste após harmonizar as redefinições; caso sim, investigar coexistência com scripts WhatsApp/checkout quando integrados no mesmo funil.

