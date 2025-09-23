# Implementação de Campos Nome e Telefone na Tabela Tokens

## Resumo
Implementação de processamento automático de nome e telefone quando tokens são criados, salvando os campos `first_name`, `last_name` e `phone` na tabela tokens.

## Modificações Realizadas

### 1. Banco de Dados

#### Novas Colunas Adicionadas
- `first_name` (TEXT) - Primeiro nome extraído do nome completo
- `last_name` (TEXT) - Sobrenome(s) extraído do nome completo  
- `phone` (TEXT) - Telefone normalizado com código do país

#### Arquivos Modificados
- `database/sqlite.js` - Adicionadas colunas na criação/migração do SQLite
- `database/postgres.js` - Adicionadas colunas na criação/migração do PostgreSQL
- `migrations/20250923_add_name_phone_columns.sql` - Script de migração

### 2. Funções Utilitárias

#### `splitFullName(fullName)`
Divide nome completo em firstName e lastName:
- **Entrada**: `"João Silva"` → **Saída**: `{firstName: "João", lastName: "Silva"}`
- **Entrada**: `"Ana Carolina de Souza"` → **Saída**: `{firstName: "Ana", lastName: "Carolina de Souza"}`
- **Entrada**: `"Pedro"` → **Saída**: `{firstName: "Pedro", lastName: null}`
- **Entrada**: `null/undefined/""` → **Saída**: `{firstName: null, lastName: null}`

#### `normalizePhone(phone)`
Normaliza telefone removendo caracteres não numéricos e adicionando +55 para números BR:
- **Entrada**: `"(11) 99988-7766"` → **Saída**: `"+5511999887766"`
- **Entrada**: `"11999887766"` → **Saída**: `"+5511999887766"`
- **Entrada**: `"+55 11 99988-7766"` → **Saída**: `"+5511999887766"`
- **Entrada**: `null/undefined/""` → **Saída**: `null`

### 3. Endpoints Modificados

#### `/api/whatsapp/gerar-token`
- ✅ **Processa nome e telefone** do formulário
- ✅ Salva `first_name`, `last_name` e `phone` processados
- ✅ Mantém compatibilidade com campos `nome` e `telefone` existentes

#### `/api/gerar-pix-checkout`
- ✅ Adicionadas colunas na query de inserção
- ⚠️ Salva `null` para campos nome/telefone (não disponíveis neste endpoint)

#### `/api/pix/create`
- ✅ Processa `client_data.nome` e `client_data.telefone` se disponíveis
- ✅ Salva campos processados ou `null` se não disponíveis
- ✅ Funciona tanto para SQLite quanto PostgreSQL

#### `MODELO1/core/TelegramBotService.js`
- ✅ Adicionadas colunas na query de inserção
- ⚠️ Salva `null` para campos nome/telefone (não disponíveis no webhook do bot)

#### `MODELO1/WEB/tokens.js`
- ✅ Adicionadas colunas na query de inserção
- ⚠️ Salva `null` para campos nome/telefone (não disponíveis neste endpoint)

### 4. Comportamento

#### Quando Nome/Telefone Estão Disponíveis
```javascript
// Exemplo: Endpoint WhatsApp
const nome = "João Silva Santos";
const telefone = "(11) 99988-7766";

// Processamento
const { firstName, lastName } = splitFullName(nome);
const normalizedPhone = normalizePhone(telefone);

// Resultado salvo no banco:
// first_name: "João"
// last_name: "Silva Santos"  
// phone: "+5511999887766"
```

#### Quando Nome/Telefone NÃO Estão Disponíveis
```javascript
// Exemplo: Endpoint checkout web
// Não há campos de nome/telefone no formulário

// Resultado salvo no banco:
// first_name: null
// last_name: null
// phone: null
```

### 5. Scripts Utilitários

#### `run-migration-name-phone.js`
Script para executar migração em bancos existentes:
```bash
node run-migration-name-phone.js
```

#### `test-name-phone-functions.js`  
Script de teste das funções implementadas:
```bash
node test-name-phone-functions.js
```

## Compatibilidade

### ✅ Mantém Compatibilidade Total
- Campos existentes `nome` e `telefone` continuam funcionando
- Endpoints existentes continuam funcionando normalmente
- Banco de dados existente continua funcionando (com migração)

### ✅ Não Quebra Funcionalidades
- Tokens existentes continuam válidos
- Sistemas dependentes continuam funcionando
- Frontend não precisa ser modificado

## Execução da Migração

### 1. Executar Script de Migração
```bash
node run-migration-name-phone.js
```

### 2. Verificar Logs
O script mostrará:
- ✅ Colunas adicionadas com sucesso
- ℹ️ Colunas já existentes (se executado novamente)
- ❌ Erros (se houver problemas)

## Testes

### Executar Testes
```bash
node test-name-phone-functions.js
```

### Casos de Teste Cobertos
- ✅ Nomes simples e compostos
- ✅ Telefones com diferentes formatações
- ✅ Valores nulos/indefinidos/vazios
- ✅ Tipos de dados inválidos

## Status da Implementação

- ✅ **Banco de Dados**: Colunas adicionadas
- ✅ **Funções Utilitárias**: Implementadas e testadas
- ✅ **Endpoint WhatsApp**: Totalmente funcional
- ✅ **Outros Endpoints**: Modificados para compatibilidade
- ✅ **Migração**: Script criado e testado
- ✅ **Testes**: Criados e executados com sucesso

**Status**: 🎉 **IMPLEMENTAÇÃO CONCLUÍDA COM SUCESSO**
