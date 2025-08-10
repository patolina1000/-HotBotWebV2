# 📊 Sistema de Logs - Dashboard

## Visão Geral

O **Sistema de Logs Dashboard** é uma interface moderna e funcional para análise de logs em tempo real, desenvolvida para substituir o antigo dashboard de eventos. O painel oferece monitoramento avançado, filtragem inteligente e visualizações interativas dos logs do sistema.

## 🎨 Características do Design

### Visual Dark Mode Profissional
- **Fundo**: Gradiente suave (preto → cinza escuro → azul escuro)
- **Glassmorphism**: Componentes com transparência e blur
- **Cores**: Paleta escura com acentos em azul/roxo
- **Tipografia**: Fonte clara e legível (Apple System Fonts)

### Responsividade
- ✅ Desktop (1600px+)
- ✅ Tablet (768px - 1599px)
- ✅ Mobile (< 768px)

## 🚀 Funcionalidades Principais

### 1. Filtro Avançado de Logs
- **Intervalo de datas**: Seleção precisa com datetime-local
- **Nível de log**: ERROR, WARN, INFO, DEBUG, SUCCESS
- **Serviço/Módulo**: Filtro por componente do sistema
- **Palavra-chave**: Busca full-text na mensagem
- **Token de acesso**: Autenticação segura

### 2. KPIs em Tempo Real
- **Total de logs** no período
- **Quantidade de erros** com tendência
- **Quantidade de warnings** com tendência
- **Serviços ativos** (quantidade distinta)
- **Último erro** registrado (timestamp e resumo)
- **Tempo médio de resposta**

### 3. Gráficos Interativos
- **Distribuição por nível**: Gráfico de rosca colorido
- **Timeline de logs**: Evolução ao longo do tempo (24h)
- **Tendências**: Comparação com período anterior

### 4. Tabela de Logs
- **Colunas**: Data/Hora, Nível, Serviço, Mensagem, Origem, IP, User Agent
- **Paginação**: Navegação intuitiva
- **Ordenação**: Por data (mais recente primeiro)
- **Preview**: Mensagens truncadas com tooltip completo

### 5. Funcionalidades Extras
- **Auto-refresh**: Atualização automática a cada 5s
- **Indicador de novos logs**: Notificação visual
- **Exportação**: CSV e JSON
- **Limpar filtros**: Reset rápido

## 📁 Estrutura de Arquivos

```
MODELO1/WEB/
├── logs-dashboard.html      # Interface principal
├── logs-dashboard.js        # Lógica JavaScript
└── LOGS_DASHBOARD_README.md # Esta documentação
```

## 🔌 APIs do Backend

### 1. GET `/api/logs`
**Busca logs com filtros e paginação**

**Parâmetros:**
- `token` (obrigatório): Token de acesso
- `limit` (opcional): Registros por página (padrão: 50)
- `offset` (opcional): Deslocamento para paginação
- `dateFrom` (opcional): Data/hora inicial
- `dateTo` (opcional): Data/hora final
- `level` (opcional): Nível de log
- `service` (opcional): Serviço/módulo
- `keyword` (opcional): Palavra-chave

**Resposta:**
```json
{
  "logs": [
    {
      "id": 1,
      "level": "ERROR",
      "message": "Erro na conexão com banco",
      "service": "database",
      "source": "api",
      "ip": "192.168.1.1",
      "userAgent": "Mozilla/5.0...",
      "timestamp": "2024-01-15T10:30:00Z",
      "metadata": {}
    }
  ],
  "total": 150,
  "page": 1,
  "totalPages": 3,
  "executionTime": 45
}
```

### 2. GET `/api/logs/stats`
**Estatísticas e métricas dos logs**

**Parâmetros:**
- `token` (obrigatório): Token de acesso
- `dateFrom` (opcional): Data inicial
- `dateTo` (opcional): Data final

**Resposta:**
```json
{
  "totalLogs": 1500,
  "errorCount": 45,
  "warningCount": 120,
  "infoCount": 1200,
  "debugCount": 100,
  "successCount": 35,
  "activeServices": 8,
  "avgResponseTime": 125.5,
  "lastError": {
    "id": 123,
    "message": "Timeout na requisição",
    "timestamp": "2024-01-15T10:25:00Z"
  },
  "levelDistribution": {
    "INFO": 1200,
    "WARN": 120,
    "ERROR": 45,
    "DEBUG": 100,
    "SUCCESS": 35
  },
  "timelineData": [
    {
      "timestamp": "2024-01-15T10:00:00Z",
      "errors": 2,
      "warnings": 5,
      "info": 25
    }
  ],
  "logsIncrease": 12,
  "errorChange": -5,
  "warningChange": 8,
  "errorTrend": "down",
  "warningTrend": "up"
}
```

### 3. GET `/api/logs/export`
**Exportação de logs em CSV ou JSON**

**Parâmetros:**
- `token` (obrigatório): Token de acesso
- `format` (opcional): "csv" ou "json" (padrão: "json")
- Filtros opcionais (mesmos do endpoint `/api/logs`)

## 🗄️ Estrutura do Banco de Dados

### Tabela `logs`
```sql
CREATE TABLE logs (
  id SERIAL PRIMARY KEY,
  level VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  service VARCHAR(100),
  source VARCHAR(100),
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Índices
- `idx_logs_timestamp`: Otimização por data
- `idx_logs_level`: Filtros por nível
- `idx_logs_service`: Filtros por serviço
- `idx_logs_source`: Filtros por origem
- `idx_logs_ip`: Filtros por IP

## 🔧 Configuração e Instalação

### 1. Dependências
O painel utiliza apenas bibliotecas CDN:
- **Chart.js**: Gráficos interativos
- **Lucide Icons**: Ícones modernos

### 2. Configuração do Backend
As APIs já estão integradas ao `server.js`:
- Validação de token
- Queries otimizadas
- Tratamento de erros
- Paginação eficiente

### 3. Autenticação
- Sistema de token simples
- Armazenamento no localStorage
- Validação em todas as requisições

## 🎯 Como Usar

### 1. Acesso ao Painel
```
http://seu-dominio.com/MODELO1/WEB/logs-dashboard.html
```

### 2. Configuração Inicial
1. Digite um token de acesso válido
2. Configure o intervalo de datas desejado
3. Aplique filtros conforme necessário

### 3. Monitoramento em Tempo Real
1. Ative o "Auto-refresh" para atualizações automáticas
2. Monitore os KPIs no topo da página
3. Analise os gráficos de distribuição e timeline

### 4. Análise Detalhada
1. Use a tabela para visualizar logs específicos
2. Aplique filtros para focar em problemas
3. Exporte dados para análise externa

## 🔍 Casos de Uso

### Monitoramento de Produção
- Identificar picos de erros
- Monitorar performance de serviços
- Detectar padrões de uso

### Debugging
- Filtrar por serviço específico
- Buscar por mensagens de erro
- Analisar logs de usuários específicos

### Relatórios
- Exportar dados para análise
- Gerar relatórios de tendências
- Auditoria de segurança

## 🛠️ Manutenção

### Logs de Sistema
O painel registra suas próprias operações:
- Acesso às APIs
- Erros de validação
- Performance das queries

### Performance
- Queries otimizadas com índices
- Paginação para grandes volumes
- Cache de resultados quando possível

### Segurança
- Validação de token em todas as APIs
- Sanitização de parâmetros SQL
- Rate limiting implícito

## 🔮 Próximas Funcionalidades

- [ ] Modal de detalhes do log
- [ ] Alertas configuráveis
- [ ] Dashboards personalizáveis
- [ ] Integração com sistemas externos
- [ ] Análise de padrões com IA
- [ ] Notificações em tempo real

## 📞 Suporte

Para dúvidas ou problemas:
1. Verifique os logs do próprio sistema
2. Consulte a documentação da API
3. Teste com dados de exemplo
4. Entre em contato com a equipe de desenvolvimento

---

**Versão**: 1.0.0  
**Última atualização**: Janeiro 2024  
**Desenvolvido por**: Equipe de Desenvolvimento