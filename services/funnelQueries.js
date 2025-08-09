const { Pool } = require('pg');

/**
 * Serviço de Consultas Agregadas para Dashboard
 * Fornece dados agregados para KPIs e gráficos com filtros de período
 * Respeita timezone America/Recife
 */
class FunnelQueriesService {
  constructor() {
    this.pool = null;
    this.timezone = 'America/Recife';
    this.initialized = false;
  }

  /**
   * Inicializa o serviço com pool de conexão
   * @param {Pool} pool - Pool de conexão PostgreSQL
   */
  initialize(pool) {
    if (!pool) {
      throw new Error('Pool de conexão é obrigatório');
    }
    
    this.pool = pool;
    this.initialized = true;
    console.log('🚀 FunnelQueriesService inicializado com timezone:', this.timezone);
  }

  /**
   * Valida e converte parâmetros de data para timezone America/Recife
   * @param {string} from - Data inicial (YYYY-MM-DD)
   * @param {string} to - Data final (YYYY-MM-DD)
   * @returns {Object} - Datas convertidas para timezone
   */
  parseDateRange(from, to) {
    try {
      // Converter para timezone America/Recife
      const fromDate = new Date(`${from}T00:00:00`);
      const toDate = new Date(`${to}T23:59:59`);
      
      // Ajustar para timezone America/Recife
      const fromRecife = new Date(fromDate.toLocaleString('en-US', { timeZone: this.timezone }));
      const toRecife = new Date(toDate.toLocaleString('en-US', { timeZone: this.timezone }));
      
      return {
        from: fromRecife.toISOString(),
        to: toRecife.toISOString(),
        fromDate: fromRecife,
        toDate: toRecife
      };
    } catch (error) {
      throw new Error(`Erro ao processar datas: ${error.message}`);
    }
  }

  /**
   * Gera metadados padrão para respostas da API
   * @param {string} from - Data inicial
   * @param {string} to - Data final
   * @returns {Object} - Metadados da resposta
   */
  generateResponseMeta(from, to) {
    return {
      from: from,
      to: to,
      tz: this.timezone,
      generated_at: new Date().toISOString()
    };
  }

  /**
   * Obtém resumo geral dos KPIs para o período especificado
   * @param {string} from - Data inicial (YYYY-MM-DD)
   * @param {string} to - Data final (YYYY-MM-DD)
   * @returns {Object} - Resumo dos KPIs
   */
  async getDashboardSummary(from, to) {
    if (!this.initialized) {
      throw new Error('Serviço não inicializado');
    }

    const dateRange = this.parseDateRange(from, to);
    
    try {
      const query = `
        WITH welcome_clicks AS (
          SELECT COUNT(*) as count
          FROM funnel_events 
          WHERE event_name = 'welcome_click'
          AND occurred_at >= $1 AND occurred_at <= $2
        ),
        bot_enters AS (
          SELECT 
            COALESCE(bot, 'unknown') as bot,
            COUNT(*) as count
          FROM funnel_events 
          WHERE event_name = 'bot_enter'
          AND occurred_at >= $1 AND occurred_at <= $2
          GROUP BY COALESCE(bot, 'unknown')
        ),
        pix_created AS (
          SELECT 
            COALESCE(bot, 'unknown') as bot,
            COUNT(*) as count
          FROM funnel_events 
          WHERE event_name = 'pix_created'
          AND occurred_at >= $1 AND occurred_at <= $2
          GROUP BY COALESCE(bot, 'unknown')
        ),
        pix_paid AS (
          SELECT 
            COALESCE(bot, 'unknown') as bot,
            COUNT(*) as count
          FROM funnel_events 
          WHERE event_name = 'pix_paid'
          AND occurred_at >= $1 AND occurred_at <= $2
          GROUP BY COALESCE(bot, 'unknown')
        ),
        paid_by_tier_bot1 AS (
          SELECT 
            COALESCE(offer_tier, 'unknown') as offer_tier,
            COUNT(*) as count
          FROM funnel_events 
          WHERE event_name = 'pix_paid'
          AND COALESCE(bot, 'unknown') = 'bot1'
          AND occurred_at >= $1 AND occurred_at <= $2
          GROUP BY COALESCE(offer_tier, 'unknown')
        )
        SELECT 
          (SELECT count FROM welcome_clicks) as welcome_clicks,
          (SELECT COALESCE(json_object_agg(bot, count), '{}'::json) FROM bot_enters) as bot_enters,
          (SELECT COALESCE(json_object_agg(bot, count), '{}'::json) FROM pix_created) as pix_created,
          (SELECT COALESCE(json_object_agg(bot, count), '{}'::json) FROM pix_paid) as pix_paid,
          (SELECT COALESCE(json_object_agg(offer_tier, count), '{}'::json) FROM paid_by_tier_bot1) as paid_by_tier_bot1
      `;

      const result = await this.pool.query(query, [dateRange.from, dateRange.to]);
      
      if (result.rows.length === 0) {
        return {
          welcome_clicks: 0,
          bot_enters: {},
          pix_created: {},
          pix_paid: {},
          paid_by_tier_bot1: {},
          meta: this.generateResponseMeta(from, to)
        };
      }

      const row = result.rows[0];
      
      return {
        welcome_clicks: parseInt(row.welcome_clicks) || 0,
        bot_enters: row.bot_enters || {},
        pix_created: row.pix_created || {},
        pix_paid: row.pix_paid || {},
        paid_by_tier_bot1: row.paid_by_tier_bot1 || {},
        meta: this.generateResponseMeta(from, to)
      };

    } catch (error) {
      console.error('Erro ao obter resumo do dashboard:', error);
      throw new Error(`Falha ao obter resumo: ${error.message}`);
    }
  }

  /**
   * Obtém série temporal para métrica específica
   * @param {string} metric - Nome da métrica
   * @param {string} group - Agrupamento (day, hour, week)
   * @param {string} from - Data inicial
   * @param {string} to - Data final
   * @param {string} bot - Filtro de bot (bot1, bot2, all)
   * @returns {Object} - Série temporal
   */
  async getTimeSeries(metric, group, from, to, bot = 'all') {
    if (!this.initialized) {
      throw new Error('Serviço não inicializado');
    }

    const dateRange = this.parseDateRange(from, to);
    
    // Validar métrica
    const validMetrics = ['welcome_click', 'bot_enter', 'pix_created', 'pix_paid'];
    if (!validMetrics.includes(metric)) {
      throw new Error(`Métrica inválida: ${metric}. Válidas: ${validMetrics.join(', ')}`);
    }

    // Validar agrupamento
    const validGroups = ['day', 'hour', 'week'];
    if (!validGroups.includes(group)) {
      throw new Error(`Agrupamento inválido: ${group}. Válidos: ${validGroups.join(', ')}`);
    }

    try {
      let timeFormat, groupBy;
      
      switch (group) {
        case 'day':
          timeFormat = "YYYY-MM-DD";
          groupBy = "DATE(occurred_at AT TIME ZONE 'America/Recife')";
          break;
        case 'hour':
          timeFormat = "YYYY-MM-DD HH24:00";
          groupBy = "DATE_TRUNC('hour', occurred_at AT TIME ZONE 'America/Recife')";
          break;
        case 'week':
          timeFormat = "YYYY-'W'WW";
          groupBy = "DATE_TRUNC('week', occurred_at AT TIME ZONE 'America/Recife')";
          break;
      }

      let botFilter = '';
      let params = [timeFormat, metric, dateRange.from, dateRange.to];
      
      if (bot !== 'all') {
        botFilter = 'AND COALESCE(bot, \'unknown\') = $5';
        params.push(bot);
      }

      const query = `
        SELECT 
          TO_CHAR(${groupBy}, $1) as time_period,
          COUNT(*) as count
        FROM funnel_events 
        WHERE event_name = $2
        AND occurred_at >= $3 AND occurred_at <= $4
        ${botFilter}
        GROUP BY ${groupBy}
        ORDER BY ${groupBy}
      `;

      const result = await this.pool.query(query, params);
      
      const timeSeries = result.rows.map(row => ({
        period: row.time_period,
        count: parseInt(row.count)
      }));

      return {
        metric: metric,
        group: group,
        bot: bot,
        data: timeSeries,
        meta: this.generateResponseMeta(from, to)
      };

    } catch (error) {
      console.error('Erro ao obter série temporal:', error);
      throw new Error(`Falha ao obter série temporal: ${error.message}`);
    }
  }

  /**
   * Obtém distribuição de pagamentos por tier para Bot1
   * @param {string} from - Data inicial
   * @param {string} to - Data final
   * @returns {Object} - Distribuição por tier
   */
  async getBotPaidTiersDistribution(from, to) {
    if (!this.initialized) {
      throw new Error('Serviço não inicializado');
    }

    const dateRange = this.parseDateRange(from, to);
    
    try {
      const query = `
        SELECT 
          offer_tier,
          COUNT(*) as count
        FROM funnel_events 
        WHERE event_name = 'pix_paid'
        AND COALESCE(bot, 'unknown') = 'bot1'
        AND occurred_at >= $1 AND occurred_at <= $2
        GROUP BY offer_tier
        ORDER BY count DESC
      `;

      const result = await this.pool.query(query, [dateRange.from, dateRange.to]);
      
      const distribution = result.rows.map(row => ({
        tier: row.offer_tier,
        count: parseInt(row.count)
      }));

      // Calcular totais
      const totals = distribution.reduce((acc, item) => {
        acc.total_count += item.count;
        return acc;
      }, { total_count: 0 });

      return {
        distribution: distribution,
        totals: totals,
        meta: this.generateResponseMeta(from, to)
      };

    } catch (error) {
      console.error('Erro ao obter distribuição por tier:', error);
      throw new Error(`Falha ao obter distribuição: ${error.message}`);
    }
  }

  /**
   * Obtém estatísticas de conversão para o período
   * @param {string} from - Data inicial
   * @param {string} to - Data final
   * @returns {Object} - Estatísticas de conversão
   */
  async getConversionStats(from, to) {
    if (!this.initialized) {
      throw new Error('Serviço não inicializado');
    }

    const dateRange = this.parseDateRange(from, to);
    
    try {
      const query = `
        WITH funnel_steps AS (
          SELECT 
            COALESCE(bot, 'unknown') as bot,
            COUNT(CASE WHEN event_name = 'welcome_click' THEN 1 END) as welcome_clicks,
            COUNT(CASE WHEN event_name = 'bot_enter' THEN 1 END) as bot_enters,
            COUNT(CASE WHEN event_name = 'pix_created' THEN 1 END) as pix_created,
            COUNT(CASE WHEN event_name = 'pix_paid' THEN 1 END) as pix_paid
          FROM funnel_events 
          WHERE occurred_at >= $1 AND occurred_at <= $2
          GROUP BY COALESCE(bot, 'unknown')
        )
        SELECT 
          COALESCE(bot, 'unknown') as bot,
          welcome_clicks,
          bot_enters,
          pix_created,
          pix_paid,
          CASE 
            WHEN welcome_clicks > 0 THEN ROUND((bot_enters::float / welcome_clicks::float) * 100, 2)
            ELSE 0 
          END as welcome_to_bot_rate,
          CASE 
            WHEN bot_enters > 0 THEN ROUND((pix_created::float / bot_enters::float) * 100, 2)
            ELSE 0 
          END as bot_to_pix_rate,
          CASE 
            WHEN pix_created > 0 THEN ROUND((pix_paid::float / pix_created::float) * 100, 2)
            ELSE 0 
          END as pix_created_to_paid_rate
        FROM funnel_steps
        ORDER BY bot
      `;

      const result = await this.pool.query(query, [dateRange.from, dateRange.to]);
      
      const conversionStats = result.rows.map(row => ({
        bot: row.bot,
        welcome_clicks: parseInt(row.welcome_clicks) || 0,
        bot_enters: parseInt(row.bot_enters) || 0,
        pix_created: parseInt(row.pix_created) || 0,
        pix_paid: parseInt(row.pix_paid) || 0,
        welcome_to_bot_rate: parseFloat(row.welcome_to_bot_rate) || 0,
        bot_to_pix_rate: parseFloat(row.bot_to_pix_rate) || 0,
        pix_created_to_paid_rate: parseFloat(row.pix_created_to_paid_rate) || 0
      }));

      return {
        conversion_stats: conversionStats,
        meta: this.generateResponseMeta(from, to)
      };

    } catch (error) {
      console.error('Erro ao obter estatísticas de conversão:', error);
      throw new Error(`Falha ao obter estatísticas de conversão: ${error.message}`);
    }
  }

  /**
   * Verifica o status de saúde do serviço
   * @returns {Object} - Status do serviço
   */
  getHealthStatus() {
    return {
      service: 'FunnelQueriesService',
      initialized: this.initialized,
      timezone: this.timezone,
      pool_available: !!this.pool,
      timestamp: new Date().toISOString()
    };
  }
}

// Singleton instance
let instance = null;

function getInstance() {
  if (!instance) {
    instance = new FunnelQueriesService();
  }
  return instance;
}

module.exports = {
  FunnelQueriesService,
  getInstance
};
