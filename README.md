## SiteHot (Bot Telegram + Backend Web + Tracking + Dashboard)

Projeto unificado que integra:
- Bot(s) do Telegram para cobranças e funil (PIX)
- Backend Web em Express com APIs de tracking (Facebook Pixel/CAPI), funil de eventos e dashboard
- Persistência em PostgreSQL (principal) e SQLite (apoio)
- Módulo WEB com páginas estáticas e scripts de tracking

Foco: orquestrar geração/validação de tokens de acesso, rastrear eventos (AddToCart, InitiateCheckout, Purchase, ViewContent) e expor KPIs via APIs de dashboard.


### Funcionalidades principais
- **Bots do Telegram (bot1/bot2)**: criação de cobranças, webhooks PushinPay, loops de downsell.
- **APIs de tracking**:
  - CAPI Meta: ViewContent e Purchase com deduplicação e sincronização de timestamp cliente-servidor
  - Enriquecimento de `fbp`/`fbc` via rastreamento de sessão invisível
- **Tokens de acesso**: geração, verificação, expiração e flags de envio (pixel_sent/capi_sent/cron_sent)
- **Dashboard/KPIs**: endpoints para séries temporais, distribuição de tiers, conversão e dados agregados
- **Jobs/coron**: fallback de eventos, limpeza de payloads/tokens, manutenção
- **Segurança/Resiliência**: rate limit, helmet, CORS, idempotência em webhooks e pagamentos


### Tecnologias utilizadas
- Node.js 20, Express 4
- PostgreSQL (pg) e SQLite (better-sqlite3)
- Axios, node-cron, node-telegram-bot-api
- Helmet, CORS, express-rate-limit
- NodeCache (rastreamento de sessão), Luxon (datas) 


### Requisitos
- Node 20.x
- PostgreSQL 13+ acessível via `DATABASE_URL`

Variáveis de ambiente essenciais:
- `DATABASE_URL` (Postgres)
- `PORT` (opcional; padrão 3000)
- `BASE_URL` (URL pública do backend)
- `FRONTEND_URL` (opcional)
- `FB_PIXEL_ID`, `FB_PIXEL_TOKEN` (Meta CAPI)
- `TELEGRAM_TOKEN`, `TELEGRAM_TOKEN_BOT2` (Bots)
- `TELEGRAM_BOT1_USERNAME`, `TELEGRAM_BOT2_USERNAME` (usernames dos bots)
- `PANEL_ACCESS_TOKEN` (token para endpoints do painel)
- `URL_ENVIO_1`, `URL_ENVIO_2`, `URL_ENVIO_3` (destinos por grupo, quando aplicável)

Consulte também `ENV_EXAMPLE.md` no repositório.


### Como instalar e rodar (local)
1) Instalar dependências
```
npm ci
```

2) Provisionar Postgres (exemplo via Docker)
```
docker run --name sitehot-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=sitehot -p 5432:5432 -d postgres:14
```

3) Configurar `.env` na raiz
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sitehot
BASE_URL=http://localhost:3000
FB_PIXEL_ID=xxxxxxxxxxxxxxx
FB_PIXEL_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxx
TELEGRAM_TOKEN=xxxxx:yyyyy
TELEGRAM_TOKEN_BOT2=xxxxx:zzzzz
PANEL_ACCESS_TOKEN=troque-este-token
NODE_ENV=development
```

4) Inicializar tabelas e iniciar servidor
- As tabelas são criadas automaticamente na subida (módulos `database/postgres.js` e `init-postgres.js`).
- Iniciar o servidor:
```
npm run start
```

Servidor: `http://localhost:3000`

Rotas úteis:
- Saúde: `/health`, `/health-basic`, `/debug/status`, `/api/dashboard/health`
- Dashboard: `/api/dashboard/summary`, `/api/dashboard/timeseries`, `/api/dashboard/distribution`, `/api/dashboard/conversion-stats`
- Tokens/WEB: `/api/health` (módulo tokens), `/obrigado.html`


### Exemplos de uso
- ViewContent via CAPI
```
curl -X POST http://localhost:3000/api/capi/viewcontent \
  -H 'Content-Type: application/json' \
  -d '{
    "event_id": "evt_123",
    "url": "https://seusite/pagina",
    "fbp": "fb.1.1700000000.1111111111",
    "fbc": "fb.1.1700000000.ABCD",
    "ip": "203.0.113.10",
    "user_agent": "Mozilla/5.0",
    "external_id": "user-123",
    "content_type": "product",
    "value": 19.9,
    "currency": "BRL"
  }'
```

- Sincronizar timestamp do cliente (ajuda na deduplicação com o Pixel)
```
curl -X POST http://localhost:3000/api/sync-timestamp \
  -H 'Content-Type: application/json' \
  -d '{"token": "TOKEN_AQUI", "client_timestamp": 1700000500}'
```

- Dados do dashboard (autenticado por token)
```
curl 'http://localhost:3000/api/dashboard/summary?from=2024-01-01&to=2024-01-31' \
  -H 'Authorization: Bearer SEU_TOKEN_DO_PAINEL'
```

- Gerar payload para redirecionar ao Telegram e rastrear
```
# 1) gerar payload
curl -X POST http://localhost:3000/api/gerar-payload \
  -H 'Content-Type: application/json' \
  -d '{
    "utm_source": "bio|123",
    "utm_medium": "instagram|456",
    "utm_campaign": "campanha-x|789",
    "fbp": "fb.1.1700000000.1111111111",
    "fbc": "fb.1.1700000000.ABCD"
  }'
# resposta: {"payload_id":"abcd1234"}

# 2) redirecionar para o bot
open "http://localhost:3000/go/telegram?payload_id=abcd1234&dest=bot1"
```


### Avisos e boas práticas
- Defina SEMPRE `DATABASE_URL`, `FB_PIXEL_ID`, `FB_PIXEL_TOKEN` e tokens do Telegram via `.env` (não versione segredos).
- Configure `PANEL_ACCESS_TOKEN` (nunca use o default em produção).
- Restrinja CORS na produção para domínios de confiança.
- Monitoramento: use os endpoints de saúde e logs estruturados para diagnosticar deduplicação e envios CAPI.


### Problemas conhecidos e como corrigir
Abaixo estão os principais pontos de melhoria identificados no código atual, com sugestão de correção.

1) Dois servidores iniciados e dependência circular
- Problema: `server.js` importa `./app` para obter `getPool`, mas `app.js` inicia um servidor próprio (`app.listen`) ao ser importado. Isso pode criar dois servidores na mesma porta e conflitos de rota.
- Como corrigir:
  - Transformar `app.js` em módulo utilitário (não iniciar servidor ali). Exporte apenas funções (`getPool`, inicialização de módulos) e inicie servidor apenas em `server.js`.
  - Alternativa: remover a dependência de `./app` em `server.js` e usar somente o `pool` interno de `server.js`.

2) Segredo de banco hard-coded
- Problema: `app.js` define um fallback de `DATABASE_URL` com credenciais reais.
- Correção: remover fallback com credenciais e falhar claramente quando `DATABASE_URL` estiver ausente em produção; usar `.env` local para desenvolvimento.

3) Módulo `MODELO1/WEB/tokens.js` desatualizado versus schema
- Problemas:
  - Select/updates usam colunas inexistentes: `id`, `data_criacao`, `data_uso`, `ip_uso`, `user_agent`.
  - Insert sem preencher `id_transacao` (PRIMARY KEY da tabela `tokens`), potencial violação de NOT NULL.
- Correção:
  - Atualizar consultas para usar `criado_em`, `usado_em`, `ip_criacao`, `user_agent_criacao` ou incluir colunas de uso no schema, mantendo consistência.
  - Gerar `id_transacao` (ex.: UUID) ao inserir token, ou ajustar schema para incluir `id SERIAL` como PK.

4) Endpoints sensíveis com token default fraco
- Problema: `/api/eventos` e `/api/dashboard-data` aceitam `PANEL_ACCESS_TOKEN` com default `admin123`.
- Correção: exigir variável obrigatória em produção e remover defaults fracos; retornar 401 se ausente.

5) Duplicação/colisão de rotas
- Problema: `/api/config` existe em `app.js` e em `services/facebook.js` (router). Pode haver respostas divergentes.
- Correção: centralizar o endpoint no `services/facebook.js` e remover duplicata.

6) Inicialização de Postgres não aguardada
- Problema: `init-postgres.js` é chamado sem `await`, podendo gerar corrida com a inicialização principal.
- Correção: tornar a fase de bootstrap (tabelas) parte do fluxo assíncrono aguardado antes de aceitar requisições.

7) CORS e Helmet permissivos
- Problema: CORS aberto em produção; headers de COOP/COEP removidos manualmente.
- Correção: restringir `origin` no CORS por ambiente; deixar `helmet` gerenciar políticas (apenas desabilitar o necessário) e remover remoção manual de headers.

8) Logs verbosos com dados sensíveis
- Problema: logs imprimem `user_data`, IP, user-agent, e possivelmente hashes. Em produção, isso pode ser excessivo.
- Correção: padronizar logger (p. ex. pino/winston), mascarar dados, usar níveis por ambiente.

9) Hardcodes de URLs/domínios
- Problema: URLs como `ohvips.xyz` e usernames fallback de bots codificados no código.
- Correção: mover para `.env`; validar presença em produção.

10) Módulo `tokens.js` escreve logs em disco na thread de request
- Problema: `fs.appendFileSync` em cada requisição pode degradar performance.
- Correção: enviar logs para stdout ou logger async; usar agregação/rotacionamento.

11) Deduplicação e client timestamp
- Observação: a deduplicação com janela e sincronização de timestamp está correta, mas documente o fluxo para o frontend (incluir `client_timestamp` e `event_id` do Pixel) e valide clock skew.

12) Rate-limit
- Observação: manter `/health` e `/health-basic` fora do rate-limit está ok; adicione allowlist somente para monitoramento, se necessário.

13) Testes e lint
- Sugestão: adicionar ESLint/Prettier, testes de integração (supertest) e fake CAPI para ambientes de CI/CD.


### Estrutura de pastas (alto nível)
- `server.js`: entrypoint principal do backend
- `database/`: conexão PostgreSQL, criação/health, utilitários
- `services/`: facebook CAPI, tracking de sessão, eventos do funil, etc.
- `routes/`: rotas modulares (dashboard, links)
- `MODELO1/WEB/`: páginas estáticas e módulo de tokens
- `MODELO1/BOT/`: inicialização dos bots e configs


### Licença
ISC (veja `package.json`).
