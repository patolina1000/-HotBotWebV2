# 📋 API de Dados do Comprador

## Visão Geral

Esta API permite buscar informações do comprador (nome, CPF e cidade) através de um token de compra válido. A cidade é determinada automaticamente através da geolocalização do IP de criação do token.

## 🔗 Endpoint

```
GET /api/dados-comprador
```

## 📝 Parâmetros

### Query Parameters

| Parâmetro | Tipo   | Obrigatório | Descrição                    |
|-----------|--------|-------------|------------------------------|
| `token`   | string | ✅ Sim      | Token de compra válido       |

## 📤 Resposta

### Sucesso (200 OK)

```json
{
  "sucesso": true,
  "dados": {
    "nome": "João Silva",
    "cpf": "123.456.789-00",
    "cidade": "São Paulo"
  }
}
```

### Erro - Token não fornecido (400 Bad Request)

```json
{
  "sucesso": false,
  "erro": "Token não fornecido"
}
```

### Erro - Token não encontrado (404 Not Found)

```json
{
  "sucesso": false,
  "erro": "Token não encontrado"
}
```

### Erro - Banco indisponível (500 Internal Server Error)

```json
{
  "sucesso": false,
  "erro": "Banco de dados não disponível"
}
```

### Erro - Erro interno (500 Internal Server Error)

```json
{
  "sucesso": false,
  "erro": "Erro interno do servidor"
}
```

## 🔧 Como Funciona

1. **Validação do Token**: Verifica se o token foi fornecido na requisição
2. **Conexão com Banco**: Verifica se o banco de dados está disponível
3. **Busca no Banco**: Consulta a tabela `tokens` usando o token fornecido
4. **Geolocalização**: Usa o IP armazenado (`ip_criacao`) para determinar a cidade
5. **Resposta**: Retorna os dados do comprador em formato JSON

## 🌍 Geolocalização

A API utiliza o serviço gratuito [ip-api.com](http://ip-api.com) para determinar a cidade baseada no IP de criação do token. Se a geolocalização falhar, retorna "Não encontrada".

### Exemplo de Resposta da API de Geolocalização

```json
{
  "status": "success",
  "country": "Brasil",
  "countryCode": "BR",
  "region": "SP",
  "regionName": "São Paulo",
  "city": "São Paulo",
  "zip": "01310-100",
  "lat": -23.5505,
  "lon": -46.6333,
  "timezone": "America/Sao_Paulo",
  "isp": "Vivo",
  "org": "Telefonica Brasil",
  "as": "AS26599 TELEFONICA BRASIL S.A",
  "query": "189.90.123.45"
}
```

## 📊 Estrutura do Banco

A API consulta a tabela `tokens` com as seguintes colunas:

- `payer_name`: Nome do pagador
- `payer_cpf`: CPF do pagador  
- `ip_criacao`: IP de criação do token

## 🚀 Exemplos de Uso

### JavaScript (Fetch API)

```javascript
async function buscarDadosComprador(token) {
  try {
    const response = await fetch(`/api/dados-comprador?token=${encodeURIComponent(token)}`);
    const data = await response.json();
    
    if (data.sucesso && data.dados) {
      console.log('Nome:', data.dados.nome);
      console.log('CPF:', data.dados.cpf);
      console.log('Cidade:', data.dados.cidade);
    } else {
      console.error('Erro:', data.erro);
    }
  } catch (error) {
    console.error('Erro de conexão:', error.message);
  }
}

// Uso
buscarDadosComprador('seu_token_aqui');
```

### JavaScript (Axios)

```javascript
const axios = require('axios');

async function buscarDadosComprador(token) {
  try {
    const response = await axios.get('/api/dados-comprador', {
      params: { token }
    });
    
    const { nome, cpf, cidade } = response.data.dados;
    console.log('Dados do comprador:', { nome, cpf, cidade });
    
  } catch (error) {
    if (error.response) {
      console.error('Erro da API:', error.response.data.erro);
    } else {
      console.error('Erro de conexão:', error.message);
    }
  }
}
```

### cURL

```bash
curl "http://localhost:3000/api/dados-comprador?token=seu_token_aqui"
```

### Python

```python
import requests

def buscar_dados_comprador(token):
    try:
        response = requests.get('/api/dados-comprador', params={'token': token})
        data = response.json()
        
        if data['sucesso'] and 'dados' in data:
            print(f"Nome: {data['dados']['nome']}")
            print(f"CPF: {data['dados']['cpf']}")
            print(f"Cidade: {data['dados']['cidade']}")
        else:
            print(f"Erro: {data['erro']}")
            
    except requests.exceptions.RequestException as e:
        print(f"Erro de conexão: {e}")

# Uso
buscar_dados_comprador('seu_token_aqui')
```

## 🧪 Testando a API

### 1. Arquivo de Teste

Use o arquivo `teste-dados-comprador.js` para testar a API:

```bash
node teste-dados-comprador.js
```

### 2. Página de Exemplo

Abra o arquivo `exemplo-dados-comprador.html` no navegador para testar a API através de uma interface web.

### 3. Teste Manual

```bash
# Teste sem token (deve retornar 400)
curl "http://localhost:3000/api/dados-comprador"

# Teste com token inválido (deve retornar 404)
curl "http://localhost:3000/api/dados-comprador?token=token_invalido"

# Teste com token válido (deve retornar 200)
curl "http://localhost:3000/api/dados-comprador?token=seu_token_valido"
```

## ⚠️ Considerações de Segurança

1. **Validação de Token**: A API valida se o token existe no banco antes de retornar dados
2. **Logs Seguros**: Os logs não expõem dados sensíveis completos (CPF é mascarado)
3. **Rate Limiting**: A API está sujeita ao rate limiting configurado no servidor
4. **CORS**: Configure adequadamente as políticas de CORS se necessário

## 🔍 Troubleshooting

### Erro: "Banco de dados não disponível"
- Verifique se o PostgreSQL está rodando
- Verifique as configurações de conexão no arquivo `database-config.js`

### Erro: "Token não encontrado"
- Verifique se o token está correto
- Verifique se o token existe na tabela `tokens`
- Verifique se o token não foi usado ou expirado

### Erro: "Erro interno do servidor"
- Verifique os logs do servidor para mais detalhes
- Verifique se todas as dependências estão instaladas
- Verifique se o serviço de geolocalização está acessível

## 📈 Monitoramento

A API registra logs detalhados para monitoramento:

- ✅ Sucessos com dados mascarados
- ❌ Erros com detalhes técnicos
- 🔍 Tentativas de geolocalização
- 📊 Estatísticas de uso

## 🔄 Atualizações Futuras

Possíveis melhorias para versões futuras:

- Cache de geolocalização para IPs já consultados
- Suporte a múltiplos serviços de geolocalização
- Histórico de consultas
- Métricas de performance
- Autenticação adicional para endpoints sensíveis
