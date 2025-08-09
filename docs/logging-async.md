# Logging Assíncrono

Este documento descreve a arquitetura do novo sistema de logging assíncrono.

## Arquitetura
- `src/infra/logger`: instância Pino com destino assíncrono.
- `src/infra/log-queue`: fila em memória e worker para logs pesados.
- Destinos:
  - `src/infra/destinations/db-log.js`
  - `src/infra/destinations/http-log.js`

## Variáveis de Ambiente
- `LOG_LEVEL` (padrão: `info`)
- `LOG_QUEUE_MAX` (padrão: `1000`)
- `LOG_RETRY_MAX` (padrão: `5`)
- `LOG_CIRCUIT_COOLDOWN_MS` (padrão: `10000`)
- `LOG_HTTP_TIMEOUT_MS` (padrão: `1500`)
- `LOG_FLUSH_TIMEOUT_MS` (padrão: `3000`)
- `LOG_ASYNC_ENABLED` (padrão: `true`)

## Depuração
1. Acompanhe `/healthz` para métricas da fila.
2. Use `LOG_ASYNC_ENABLED=false` para voltar ao modo síncrono em debug local.

## Desligar
`LOG_ASYNC_ENABLED=false` ativa destino síncrono (útil para desenvolvimento).
