# Configuração GeoIP - MaxMind GeoLite2

## Visão Geral

Este projeto utiliza MaxMind GeoLite2 City para detectar a localização geográfica dos visitantes baseado no IP. A implementação é totalmente local e gratuita.

## Configuração

### 1. Obter Chave de Licença MaxMind

1. Acesse [MaxMind.com](https://www.maxmind.com/en/geolite2/signup)
2. Crie uma conta gratuita
3. Gere uma chave de licença gratuita
4. Adicione a variável de ambiente:

```bash
MAXMIND_LICENSE_KEY=sua_chave_aqui
```

### 2. Variáveis de Ambiente

Adicione ao seu arquivo `.env` ou variáveis de ambiente do servidor:

```bash
# GeoIP MaxMind (obrigatória para download)
MAXMIND_LICENSE_KEY=sua_chave_aqui

# Token de acesso ao painel (já existente)
PANEL_ACCESS_TOKEN=seu_token_aqui
```

### 3. Deploy/Hosting

Para plataformas como Render, adicione as variáveis de ambiente no painel de controle.

## Funcionamento

### Download Automático

O banco GeoLite2-City é baixado automaticamente durante o build:

```bash
npm run build
```

O script `scripts/download-geoip.js`:
- Verifica se `MAXMIND_LICENSE_KEY` está definida
- Baixa o arquivo `.tar.gz` do MaxMind
- Extrai para `geo/GeoLite2-City.mmdb`
- Pula download se arquivo já existir

### Middleware GeoIP

O middleware `geo/geo-middleware.js`:

1. **Inicialização**: `initGeo()` carrega o banco na memória
2. **Detecção de IP**: Prioriza headers `X-Forwarded-For`, `X-Real-IP`, etc.
3. **Lookup**: Consulta o banco MaxMind
4. **Resultado**: Popula `req.geo` com dados de localização

### Estrutura de Dados

```javascript
req.geo = {
  source: 'maxmind',
  country: 'BR',           // Código do país
  state: 'São Paulo',      // Nome do estado
  stateCode: 'SP',         // Sigla do estado
  city: 'São Paulo',       // Nome da cidade
  lat: -23.5505,           // Latitude
  lon: -46.6333            // Longitude
}
```

## Endpoints

### Debug GeoIP

```
GET /debug/geo
```

**Proteção**:
- Em produção: Requer `Authorization: Bearer <PANEL_ACCESS_TOKEN>`
- Em desenvolvimento: Acesso direto permitido

**Resposta**:
```json
{
  "ipDetectado": "192.168.1.1",
  "geo": {
    "source": "maxmind",
    "country": "BR",
    "state": "São Paulo",
    "stateCode": "SP",
    "city": "São Paulo",
    "lat": -23.5505,
    "lon": -46.6333
  },
  "headers": {
    "x-forwarded-for": "192.168.1.1",
    "x-real-ip": null,
    "cf-connecting-ip": null,
    "remote-address": "::ffff:192.168.1.1"
  }
}
```

## Logs

Todos os logs relacionados ao GeoIP têm prefixo `[GEO]`:

- `[GEO] Download OK - GeoLite2-City.mmdb pronto`
- `[GEO] DB pronto - GeoLite2-City carregado`
- `[GEO] Arquivo GeoLite2-City.mmdb não encontrado`
- `[GEO] Erro no download: ...`

## Tratamento de Erros

- **Sem chave de licença**: Pula download, continua funcionamento
- **Arquivo não encontrado**: Middleware retorna dados nulos
- **Erro de lookup**: Middleware retorna dados nulos
- **Erro de rede**: Build não falha, apenas loga erro

## Arquivos Criados/Modificados

### Novos Arquivos
- `scripts/download-geoip.js` - Script de download
- `geo/geo-middleware.js` - Middleware GeoIP
- `geo/.gitignore` - Ignora arquivos .mmdb
- `GEOIP_SETUP.md` - Esta documentação

### Arquivos Modificados
- `package.json` - Adicionada dependência `maxmind`
- `server.js` - Bootstrap e middleware GeoIP
- `server.js` - Rota `/debug/geo`

## Próximos Passos

Após esta implementação, o `req.geo` estará disponível em todas as rotas para uso futuro na página de obrigado com dados do PushinPay.
