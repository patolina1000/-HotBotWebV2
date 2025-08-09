const express = require('express');
const router = express.Router();
const { getInstance: getFunnelQueriesInstance } = require('../services/funnelQueries');

/**
 * Rotas do Dashboard
 * Fornece APIs para KPIs e gráficos com filtros de período
 * Respeita timezone America/Recife
 */

// Middleware para validar parâmetros de data
function validateDateParams(req, res, next) {
  const { from, to } = req.query;
  
  if (!from || !to) {
    return res.status(400).json({
      error: 'Parâmetros obrigatórios ausentes',
      message: 'Os parâmetros "from" e "to" são obrigatórios no formato YYYY-MM-DD',
      example: '/api/dashboard/summary?from=2024-01-01&to=2024-01-31'
    });
  }

  // Validar formato da data
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(from) || !dateRegex.test(to)) {
    return res.status(400).json({
      error: 'Formato de data inválido',
      message: 'As datas devem estar no formato YYYY-MM-DD',
      received: { from, to }
    });
  }

  // Validar se from <= to
  const fromDate = new Date(from);
  const toDate = new Date(to);
  
  if (fromDate > toDate) {
    return res.status(400).json({
      error: 'Período inválido',
      message: 'A data inicial deve ser menor ou igual à data final',
      received: { from, to }
    });
  }

  next();
}

// Middleware para validar métricas
function validateMetricParam(req, res, next) {
  const { metric } = req.query;
  const validMetrics = ['welcome_click', 'bot_enter', 'pix_created', 'pix_paid'];
  
  if (!metric || !validMetrics.includes(metric)) {
    return res.status(400).json({
      error: 'Métrica inválida',
      message: `A métrica deve ser uma das seguintes: ${validMetrics.join(', ')}`,
      received: metric
    });
  }

  next();
}

// Middleware para validar agrupamento
function validateGroupParam(req, res, next) {
  const { group } = req.query;
  const validGroups = ['day', 'hour', 'week'];
  
  if (!group || !validGroups.includes(group)) {
    return res.status(400).json({
      error: 'Agrupamento inválido',
      message: `O agrupamento deve ser um dos seguintes: ${validGroups.join(', ')}`,
      received: group
    });
  }

  next();
}

// Middleware para validar filtro de bot
function validateBotParam(req, res, next) {
  const { bot } = req.query;
  const validBots = ['bot1', 'bot2', 'all'];
  
  if (bot && !validBots.includes(bot)) {
    return res.status(400).json({
      error: 'Filtro de bot inválido',
      message: `O filtro de bot deve ser um dos seguintes: ${validBots.join(', ')}`,
      received: bot
    });
  }

  next();
}

/**
 * GET /api/dashboard/summary
 * Retorna resumo geral dos KPIs para o período especificado
 * 
 * Parâmetros:
 * - from: Data inicial (YYYY-MM-DD)
 * - to: Data final (YYYY-MM-DD)
 * 
 * Retorna:
 * - welcome_clicks: Total de cliques na tela de boas-vindas
 * - bot_enters: Entradas nos bots por bot
 * - pix_created: PIXs criados por bot
 * - pix_paid: PIXs pagos por bot
 * - paid_by_tier_bot1: Pagamentos por tier do Bot1
 * - meta: Metadados da resposta
 */
router.get('/summary', validateDateParams, async (req, res) => {
  try {
    const { from, to } = req.query;
    const funnelQueries = getFunnelQueriesInstance();
    
    // Verificar se o serviço está inicializado
    if (!funnelQueries.initialized) {
      return res.status(503).json({
        error: 'Serviço não disponível',
        message: 'O serviço de consultas do dashboard não está inicializado'
      });
    }

    const summary = await funnelQueries.getDashboardSummary(from, to);
    
    res.json({
      success: true,
      data: summary
    });

  } catch (error) {
    console.error('Erro na API /api/dashboard/summary:', error);
    
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/dashboard/timeseries
 * Retorna série temporal para métrica específica
 * 
 * Parâmetros:
 * - metric: Nome da métrica (welcome_click, bot_enter, pix_created, pix_paid)
 * - group: Agrupamento (day, hour, week)
 * - from: Data inicial (YYYY-MM-DD)
 * - to: Data final (YYYY-MM-DD)
 * - bot: Filtro de bot (bot1, bot2, all) - opcional, padrão: all
 * 
 * Retorna:
 * - metric: Métrica solicitada
 * - group: Agrupamento aplicado
 * - bot: Filtro de bot aplicado
 * - data: Array de períodos com contagens
 * - meta: Metadados da resposta
 */
router.get('/timeseries', 
  validateDateParams, 
  validateMetricParam, 
  validateGroupParam, 
  validateBotParam, 
  async (req, res) => {
    try {
      const { metric, group, from, to, bot = 'all' } = req.query;
      const funnelQueries = getFunnelQueriesInstance();
      
      // Verificar se o serviço está inicializado
      if (!funnelQueries.initialized) {
        return res.status(503).json({
          error: 'Serviço não disponível',
          message: 'O serviço de consultas do dashboard não está inicializado'
        });
      }

      const timeSeries = await funnelQueries.getTimeSeries(metric, group, from, to, bot);
      
      res.json({
        success: true,
        data: timeSeries
      });

    } catch (error) {
      console.error('Erro na API /api/dashboard/timeseries:', error);
      
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * GET /api/dashboard/distribution
 * Retorna distribuição de pagamentos por tier para Bot1
 * 
 * Parâmetros:
 * - t: Tipo de distribuição (bot_paid_tiers)
 * - from: Data inicial (YYYY-MM-DD)
 * - to: Data final (YYYY-MM-DD)
 * 
 * Retorna:
 * - distribution: Array de tiers com contagens e receitas
 * - totals: Totais agregados
 * - meta: Metadados da resposta
 */
router.get('/distribution', validateDateParams, async (req, res) => {
  try {
    const { t, from, to } = req.query;
    
    // Validar tipo de distribuição
    if (t !== 'bot_paid_tiers') {
      return res.status(400).json({
        error: 'Tipo de distribuição inválido',
        message: 'O tipo deve ser "bot_paid_tiers"',
        received: t
      });
    }

    const funnelQueries = getFunnelQueriesInstance();
    
    // Verificar se o serviço está inicializado
    if (!funnelQueries.initialized) {
      return res.status(503).json({
        error: 'Serviço não disponível',
        message: 'O serviço de consultas do dashboard não está inicializado'
      });
    }

    const distribution = await funnelQueries.getBotPaidTiersDistribution(from, to);
    
    res.json({
      success: true,
      data: distribution
    });

  } catch (error) {
    console.error('Erro na API /api/dashboard/distribution:', error);
    
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/dashboard/conversion-stats
 * Retorna estatísticas de conversão para o período
 * 
 * Parâmetros:
 * - from: Data inicial (YYYY-MM-DD)
 * - to: Data final (YYYY-MM-DD)
 * 
 * Retorna:
 * - conversion_stats: Estatísticas de conversão por bot
 * - meta: Metadados da resposta
 */
router.get('/conversion-stats', validateDateParams, async (req, res) => {
  try {
    const { from, to } = req.query;
    const funnelQueries = getFunnelQueriesInstance();
    
    // Verificar se o serviço está inicializado
    if (!funnelQueries.initialized) {
      return res.status(503).json({
        error: 'Serviço não disponível',
        message: 'O serviço de consultas do dashboard não está inicializado'
      });
    }

    const conversionStats = await funnelQueries.getConversionStats(from, to);
    
    res.json({
      success: true,
      data: conversionStats
    });

  } catch (error) {
    console.error('Erro na API /api/dashboard/conversion-stats:', error);
    
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/dashboard/health
 * Retorna status de saúde das APIs do dashboard
 */
router.get('/health', (req, res) => {
  try {
    const funnelQueries = getFunnelQueriesInstance();
    
    res.json({
      success: true,
      data: {
        dashboard_apis: 'OK',
        timestamp: new Date().toISOString(),
        timezone: 'America/Recife',
        funnel_queries_service: funnelQueries.getHealthStatus()
      }
    });

  } catch (error) {
    console.error('Erro na API /api/dashboard/health:', error);
    
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/dashboard/available-metrics
 * Retorna lista de métricas disponíveis
 */
router.get('/available-metrics', (req, res) => {
  res.json({
    success: true,
    data: {
      metrics: [
        {
          name: 'welcome_click',
          description: 'Cliques na tela de boas-vindas',
          available_groups: ['day', 'hour', 'week']
        },
        {
          name: 'bot_enter',
          description: 'Entradas nos bots',
          available_groups: ['day', 'hour', 'week']
        },
        {
          name: 'pix_created',
          description: 'PIXs criados',
          available_groups: ['day', 'hour', 'week']
        },
        {
          name: 'pix_paid',
          description: 'PIXs pagos',
          available_groups: ['day', 'hour', 'week']
        }
      ],
      groups: [
        {
          name: 'day',
          description: 'Agrupamento diário'
        },
        {
          name: 'hour',
          description: 'Agrupamento por hora'
        },
        {
          name: 'week',
          description: 'Agrupamento semanal'
        }
      ],
      bots: [
        {
          name: 'bot1',
          description: 'Bot 1'
        },
        {
          name: 'bot2',
          description: 'Bot 2'
        },
        {
          name: 'all',
          description: 'Todos os bots'
        }
      ],
      timezone: 'America/Recife'
    }
  });
});

module.exports = router;
