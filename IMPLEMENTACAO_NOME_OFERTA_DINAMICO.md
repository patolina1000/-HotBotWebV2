# Implementação: Nome da Oferta Dinâmico na UTMify

## 📋 Resumo das Modificações

Este documento descreve as modificações implementadas para tornar o campo `products[].name` dinâmico na UTMify, usando o nome real da oferta comprada ao invés do valor fixo "Curso Vitalício".

## 🔧 Modificações Implementadas

### 1. Estrutura do Banco de Dados

#### SQLite (`database/sqlite.js`)
- Adicionado campo `nome_oferta TEXT` na tabela `tokens`
- Campo armazena o nome da oferta no momento da criação da cobrança

#### PostgreSQL (`database/postgres.js`)
- Adicionado campo `nome_oferta TEXT` na tabela `tokens`
- Incluído na criação da tabela e verificação de colunas existentes

### 2. Processamento do Nome da Oferta

#### TelegramBotService.js (`MODELO1/core/TelegramBotService.js`)

**Função `_executarGerarCobranca`:**
- Adicionada lógica para identificar o nome da oferta baseado no `plano` recebido
- Busca o plano na configuração (`this.config.planos`) e downsells (`this.config.downsells`)
- Fallback para "Oferta Desconhecida" se não encontrar o plano
- Salva o nome da oferta no banco de dados durante a criação da cobrança

**Modificações na inserção:**
- SQLite: Incluído `nome_oferta` na query de inserção
- PostgreSQL: Incluído `nome_oferta` na query de inserção e update

**Webhook PushinPay:**
- Modificada chamada para `enviarConversaoParaUtmify` para incluir `nomeOferta`
- Usa `row.nome_oferta` do banco de dados ou fallback

**Callback do Bot:**
- Modificado para enviar `plano.id` ao invés de `plano.nome` na requisição
- Permite identificação correta do plano na API

### 3. Serviço UTMify

#### services/utmify.js

**Função `enviarConversaoParaUtmify`:**
- Adicionado parâmetro `nomeOferta` na assinatura da função
- Modificado payload para usar `nomeOferta` dinâmico:
  ```javascript
  products: [
    {
      id: 'curso-vitalicio',
      name: nomeOferta || 'Oferta Desconhecida',
      planId: 'curso-vitalicio',
      planName: nomeOferta || 'Oferta Desconhecida',
      quantity: 1,
      priceInCents: transactionValueCents
    }
  ]
  ```

## 🎯 Fluxo de Funcionamento

### 1. Criação da Cobrança
1. Usuário seleciona um plano no bot
2. Bot envia requisição para `/api/gerar-cobranca` com `plano.id`
3. API identifica o nome da oferta baseado no ID do plano
4. Nome da oferta é salvo no banco de dados junto com outros dados da transação

### 2. Aprovação do Pagamento
1. Webhook do PushinPay é recebido
2. Sistema busca o nome da oferta salvo no banco
3. Envia conversão para UTMify com o nome correto da oferta

### 3. Fallback
- Se não encontrar o nome da oferta, usa "Oferta Desconhecida"
- Mantém compatibilidade com estrutura existente

## 📊 Exemplos de Nomes de Ofertas

Baseado nas configurações dos bots:

### Bot1 (config1.js)
- `Vitalício` (R$19,90)
- `1 Semana` (R$9,90)
- Downsells: `Vitalício` com diferentes preços (R$18,90, R$17,90, R$15,90)

### Bot2 (config2.js)
- `Acesso Vitalício + Punheta Guiada` (R$19,90)
- `Acesso Vitalício` (R$15,90)

## 🧪 Teste

Criado script `teste-nome-oferta.js` para verificar:
- Nome da oferta válido
- Nome da oferta diferente
- Fallback com nome nulo

Para executar:
```bash
node teste-nome-oferta.js
```

## ✅ Compatibilidade

- Mantida compatibilidade com envio atual
- Estrutura de `products[]` preservada
- Fallback para "Oferta Desconhecida" garante funcionamento mesmo com dados ausentes

## 🎯 Resultado

Agora cada venda aparecerá na UTMify com o nome correto da oferta comprada, permitindo melhor análise de performance por produto/oferta. 