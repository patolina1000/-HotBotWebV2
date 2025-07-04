module.exports = (app, pool) => {
  const path = require('path');
  const cors = require('cors');
  const crypto = require('crypto');
  const rateLimit = require('express-rate-limit');
  const compression = require('compression');
  const helmet = require('helmet');
  const fs = require('fs');
  const express = require('express');
  
  // Importar funções do postgres.js
  const postgres = require('../../postgres.js');

  // Verificar se o pool foi fornecido
  if (!pool) {
    throw new Error('Pool de conexões PostgreSQL não foi fornecido');
  }

  // ====== CACHE SIMPLES ======
  class SimpleCache {
    constructor() {
      this.cache = new Map();
      this.ttl = new Map();
    }
    
    set(key, value, ttlSeconds = 300) { // 5 minutos por padrão
      this.cache.set(key, value);
      this.ttl.set(key, Date.now() + (ttlSeconds * 1000));
    }
    
    get(key) {
      const expiry = this.ttl.get(key);
      if (!expiry || expiry < Date.now()) {
        this.cache.delete(key);
        this.ttl.delete(key);
        return null;
      }
      return this.cache.get(key);
    }
    
    del(key) {
      this.cache.delete(key);
      this.ttl.delete(key);
    }
  }

  const cache = new SimpleCache();

  // ====== SISTEMA DE LOG ======
  // Criar diretório de logs se não existir
  if (!fs.existsSync('./logs')) {
    fs.mkdirSync('./logs');
  }

  function log(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      meta
    };
    
    const logLine = JSON.stringify(logEntry) + '\n';
    
    // Log para arquivo
    try {
      fs.appendFileSync(`./logs/${level}.log`, logLine);
    } catch (err) {
      console.error('Erro ao escrever log:', err);
    }
    
    // Log para console
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
  }

  // ====== MIDDLEWARES DE PERFORMANCE ======
  app.use(helmet());
  app.use(compression());

  // Rate limiting - 1000 requests por 15 minutos por IP
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 1000, // 1000 requests por IP
    message: 'Muitas tentativas, tente novamente em 15 minutos',
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(limiter);
  app.use(cors());
  app.use(express.json());
  app.use(express.static('public'));

  // ====== FUNÇÕES UTILITÁRIAS ======
  function gerarToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  function obterIP(req) {
    return req.headers['x-forwarded-for'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           '127.0.0.1';
  }

  // ====== ENDPOINTS ======

  // Health check usando funções do postgres.js
  app.get('/api/health', async (req, res) => {
    try {
      const healthResult = await postgres.healthCheck(pool);
      const poolStats = postgres.getPoolStats(pool);
      
      const health = {
        status: healthResult.healthy ? 'OK' : 'ERROR',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        memory: process.memoryUsage(),
        version: '2.0.0',
        cache_size: cache.cache.size,
        database: healthResult.healthy ? 'PostgreSQL conectado' : 'PostgreSQL com problemas',
        server_time: healthResult.timestamp,
        pool_stats: poolStats,
        database_health: healthResult
      };
      
      if (healthResult.healthy) {
        res.json(health);
      } else {
        res.status(500).json({
          ...health,
          status: 'ERROR',
          erro: 'Erro na conexão com o banco de dados'
        });
      }
    } catch (error) {
      log('error', 'Erro no health check', { erro: error.message });
      res.status(500).json({
        status: 'ERROR',
        erro: 'Erro na conexão com o banco de dados'
      });
    }
  });

  // Gerar novo token
  app.post('/api/gerar-token', async (req, res) => {
    try {
      const { valor = 0 } = req.body;
      const token = gerarToken();
      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
      
      await pool.query(
        'INSERT INTO tokens (token, valor) VALUES ($1, $2)',
        [token, valor]
      );
      
      // Invalidar cache de estatísticas
      cache.del('estatisticas');
      
      log('info', 'Token gerado', { 
        token: token.substring(0, 8) + '...', 
        valor
      });
      
      res.json({ 
        sucesso: true, 
        token: token,
        url: `${baseUrl}/obrigado.html?token=${token}&valor=${valor}`,
        valor: parseFloat(valor)
      });
      
    } catch (error) {
      log('error', 'Erro ao criar token', { erro: error.message });
      res.status(500).json({ 
        sucesso: false, 
        erro: 'Erro interno do servidor' 
      });
    }
  });

  // Verificar e usar token
  app.post('/api/verificar-token', async (req, res) => {
    try {
      const { token } = req.body;
      const ip = obterIP(req);
      const userAgent = req.get('User-Agent') || '';
      
      if (!token) {
        return res.status(400).json({ 
          sucesso: false, 
          erro: 'Token não fornecido' 
        });
      }
      
      // Verificar se o token existe e não foi usado
      const result = await pool.query(
        'SELECT id, valor, usado FROM tokens WHERE token = $1',
        [token]
      );
      
      if (result.rows.length === 0) {
        log('warn', 'Token inválido', { token: token.substring(0, 8) + '...', ip });
        return res.status(404).json({ 
          sucesso: false, 
          erro: 'Token inválido' 
        });
      }
      
      const tokenData = result.rows[0];
      
      if (tokenData.usado) {
        log('warn', 'Token já usado', { token: token.substring(0, 8) + '...', ip });
        return res.status(400).json({ 
          sucesso: false, 
          erro: 'Token já foi usado' 
        });
      }
      
      // Marcar token como usado
      await pool.query(
        'UPDATE tokens SET usado = TRUE, data_uso = CURRENT_TIMESTAMP, ip_uso = $1, user_agent = $2 WHERE token = $3',
        [ip, userAgent, token]
      );
      
      // Invalidar cache de estatísticas
      cache.del('estatisticas');
      
      log('info', 'Token usado com sucesso', { 
        token: token.substring(0, 8) + '...', 
        ip,
        valor: tokenData.valor
      });
      
      res.json({ 
        sucesso: true, 
        valor: parseFloat(tokenData.valor),
        mensagem: 'Acesso liberado com sucesso!' 
      });
      
    } catch (error) {
      log('error', 'Erro ao verificar token', { erro: error.message });
      res.status(500).json({ 
        sucesso: false, 
        erro: 'Erro interno do servidor' 
      });
    }
  });

  // Listar tokens com paginação
  app.get('/api/tokens', async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, parseInt(req.query.limit) || 50);
      const offset = (page - 1) * limit;
      
      // Query com paginação
      const tokensResult = await pool.query(
        `SELECT token, usado, valor, data_criacao, data_uso, ip_uso 
         FROM tokens 
         ORDER BY data_criacao DESC 
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      
      // Contar total de registros
      const countResult = await pool.query('SELECT COUNT(*) as total FROM tokens');
      const total = parseInt(countResult.rows[0].total);
      
      res.json({ 
        sucesso: true, 
        tokens: tokensResult.rows,
        pagination: {
          page: page,
          limit: limit,
          total: total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      });
      
    } catch (error) {
      log('error', 'Erro ao buscar tokens', { erro: error.message });
      res.status(500).json({ 
        sucesso: false, 
        erro: 'Erro interno do servidor' 
      });
    }
  });

  // Estatísticas com cache
  app.get('/api/estatisticas', async (req, res) => {
    try {
      // Tentar pegar do cache primeiro
      const cached = cache.get('estatisticas');
      if (cached) {
        return res.json({ sucesso: true, estatisticas: cached });
      }
      
      const stats = await pool.query(`
        SELECT 
          COUNT(*) as total_tokens,
          COUNT(CASE WHEN usado = TRUE THEN 1 END) as tokens_usados,
          SUM(CASE WHEN usado = TRUE THEN valor ELSE 0 END) as valor_total,
          COUNT(CASE WHEN DATE(data_criacao) = CURRENT_DATE THEN 1 END) as tokens_hoje
        FROM tokens
      `);
      
      const estatisticas = {
        total_tokens: parseInt(stats.rows[0].total_tokens),
        tokens_usados: parseInt(stats.rows[0].tokens_usados),
        valor_total: parseFloat(stats.rows[0].valor_total) || 0,
        tokens_hoje: parseInt(stats.rows[0].tokens_hoje)
      };
      
      // Cachear por 5 minutos
      cache.set('estatisticas', estatisticas, 300);
      
      log('info', 'Estatísticas calculadas', estatisticas);
      
      res.json({ sucesso: true, estatisticas });
      
    } catch (error) {
      log('error', 'Erro ao buscar estatísticas', { erro: error.message });
      res.status(500).json({ 
        sucesso: false, 
        erro: 'Erro interno do servidor' 
      });
    }
  });

  // ====== SERVIR ARQUIVOS ESTÁTICOS ======
  app.get('/obrigado.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'obrigado.html'));
  });

  app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  });

  // ====== MIDDLEWARE DE ERRO GLOBAL ======
  app.use((error, req, res, next) => {
    log('error', 'Erro não tratado', { erro: error.message, stack: error.stack });
    res.status(500).json({
      sucesso: false,
      erro: 'Erro interno do servidor'
    });
  });

  // ====== FUNÇÕES UTILITÁRIAS EXPOSTAS ======
  function getCache() {
    return cache;
  }

  function clearCache() {
    cache.cache.clear();
    cache.ttl.clear();
    log('info', 'Cache limpo manualmente');
  }

  // ====== INICIALIZAÇÃO ======
  log('info', 'Módulo web inicializado com sucesso');
  console.log(`🎯 Módulo web de tokens carregado`);
  console.log(`📊 Pool de conexões: ${pool ? 'Fornecido' : 'Não fornecido'}`);
  console.log(`🔧 Cache: Inicializado`);
  console.log(`📝 Logs: Habilitados`);

  // ====== RETORNO DO MÓDULO ======
  return {
    pool,
    cache,
    log,
    getCache,
    clearCache,
    gerarToken,
    obterIP
  };
};