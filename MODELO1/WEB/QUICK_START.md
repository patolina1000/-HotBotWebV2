# 🚀 Guia de Início Rápido - Sistema de Logs

## 📋 Pré-requisitos

1. **Banco de dados PostgreSQL** configurado
2. **Servidor Node.js** rodando
3. **Tabela `logs`** criada (automática via bootstrap)

## ⚡ Configuração Rápida

### 1. Acessar o Painel
```
http://seu-dominio.com/MODELO1/WEB/logs-dashboard.html
```

### 2. Inserir Dados de Exemplo (Opcional)
```bash
# No diretório do projeto
cd MODELO1/WEB
node insert-sample-logs.js insert
```

### 3. Configurar Token de Acesso
- Digite qualquer token não vazio (ex: "admin123")
- O token será salvo automaticamente no navegador

### 4. Definir Período de Análise
- **Data Início**: Últimas 24 horas (padrão)
- **Data Fim**: Agora (padrão)

## 🎯 Primeiros Passos

### 1. Verificar KPIs
- Total de logs no período
- Quantidade de erros e warnings
- Serviços ativos
- Último erro registrado

### 2. Analisar Gráficos
- **Distribuição por Nível**: Ver proporção de cada tipo de log
- **Timeline**: Evolução dos logs ao longo do tempo

### 3. Explorar Tabela de Logs
- Visualizar logs mais recentes
- Aplicar filtros específicos
- Navegar pelas páginas

## 🔍 Filtros Úteis

### Para Debugging
```
Nível: ERROR
Serviço: api
Palavra-chave: timeout
```

### Para Monitoramento
```
Nível: WARN, ERROR
Período: Últimas 2 horas
```

### Para Análise de Performance
```
Serviço: database
Palavra-chave: slow
```

## 📊 Funcionalidades Principais

### Auto-refresh
- ✅ Ativar para monitoramento contínuo
- ⏱️ Atualiza a cada 5 segundos
- 🔔 Notifica novos logs

### Exportação
- 📄 CSV: Para análise em Excel
- 📋 JSON: Para integração com outras ferramentas

### Paginação
- 📄 50 logs por página
- ⬅️➡️ Navegação intuitiva
- 🔢 Indicador de página atual

## 🛠️ Comandos Úteis

### Inserir Dados de Teste
```bash
node insert-sample-logs.js insert
```

### Limpar Logs Antigos
```bash
node insert-sample-logs.js clear
```

### Ver Estatísticas
```bash
node insert-sample-logs.js stats
```

## 🔧 Solução de Problemas

### Painel não carrega
1. Verificar se o servidor está rodando
2. Confirmar acesso ao banco de dados
3. Verificar console do navegador para erros

### Sem dados exibidos
1. Inserir logs de exemplo
2. Verificar filtros de data
3. Confirmar token de acesso

### Erro de conexão
1. Verificar variável `DATABASE_URL`
2. Confirmar credenciais do banco
3. Verificar logs do servidor

## 📱 Responsividade

### Desktop (> 1200px)
- Layout completo com todos os elementos
- Gráficos lado a lado
- Tabela com todas as colunas

### Tablet (768px - 1199px)
- Gráficos empilhados
- Tabela com scroll horizontal
- Filtros em coluna única

### Mobile (< 768px)
- Layout otimizado para toque
- Gráficos responsivos
- Tabela com scroll

## 🎨 Personalização

### Cores do Tema
O painel usa variáveis CSS que podem ser modificadas:
```css
:root {
  --accent-primary: #667eea;
  --accent-secondary: #764ba2;
  --success: #10b981;
  --warning: #f59e0b;
  --error: #ef4444;
}
```

### Configurações
- Alterar número de logs por página
- Modificar intervalo de auto-refresh
- Personalizar campos da tabela

## 📞 Suporte

### Documentação Completa
- `LOGS_DASHBOARD_README.md`: Documentação detalhada
- `insert-sample-logs.js`: Scripts de exemplo

### Logs do Sistema
O próprio painel registra suas operações:
- Acessos às APIs
- Erros de validação
- Performance das queries

---

**🎉 Pronto!** Seu painel de logs está funcionando e pronto para monitorar o sistema.