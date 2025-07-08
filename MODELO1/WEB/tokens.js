module.exports = (app, databasePool) => {
  const path = require('path');
  const cors = require('cors');
  const crypto = require('crypto');
  const rateLimit = require('express-rate-limit');
  const compression = require('compression');
  const helmet = require('helmet');
  const fs = require('fs');
  const express = require('express');
  
  console.log('🔍 tokens.js: Módulo iniciado');
  
  // Importar funções do postgres.js
  const postgres = require('../../src/core/database');

  // Verificar se o databasePool foi fornecido
  if (!databasePool) {
    console.error('❌ tokens.js: Pool de conexões PostgreSQL não foi fornecido');
    throw new Error('Pool de conexões PostgreSQL não foi fornecido');
  }

  // ====== FUNÇÕES UTILITÁRIAS (DECLARADAS NO INÍCIO) ======
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

  function sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    return input.replace(/[<>\"']/g, '');
  }

  function isValidToken(token) {
    return typeof token === 'string' && 
           token.length === 64 && 
           /^[a-f0-9]{64}$/.test(token);
  }

  // ====== CACHE SIMPLES ======
  class SimpleCache {
    constructor() {
      this.cache = new Map();
      this.ttl = new Map();
    }
    
    set(key, value, ttlSeconds = 300) {
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
  function log(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      meta
    };
    
    const logLine = JSON.stringify(logEntry) + '\n';
    
    // Log para console
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
    
    // Log para arquivo (apenas se a pasta existir)
    try {
      if (!fs.existsSync('./logs')) {
        fs.mkdirSync('./logs');
      }
      fs.appendFileSync(`./logs/${level}.log`, logLine);
    } catch (err) {
      // Falha silenciosa no log de arquivo
    }
  }

  // ====== CRIAR ROUTER ======
  const router = express.Router();
  
  // Middlewares
  router.use(helmet());
  router.use(compression());
  router.use(cors());
  router.use(express.json());

  // Rate limiting
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: 'Muitas tentativas na API, tente novamente em 15 minutos',
    standardHeaders: true,
    legacyHeaders: false,
  });

  router.use(apiLimiter);

  // ====== ROTAS ======
  
  // Health check
  router.get('/health', async (req, res) => {
    try {
      const healthResult = await postgres.healthCheck(databasePool);
      const poolStats = postgres.getPoolStats(databasePool);
      
      const health = {
        status: healthResult.healthy ? 'OK' : 'ERROR',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        memory: process.memoryUsage(),
        version: '2.0.0',
        cache_size: cache.cache.size,
        database: healthResult.healthy ? 'PostgreSQL conectado' : 'PostgreSQL com problemas',
        pool_stats: poolStats,
        database_health: healthResult
      };
      
      res.status(healthResult.healthy ? 200 : 500).json(health);
    } catch (error) {
      log('error', 'Erro no health check', { erro: error.message });
      res.status(500).json({
        status: 'ERROR',
        erro: 'Erro na conexão com o banco de dados'
      });
    }
  });

  // Gerar novo token
  router.post('/gerar-token', async (req, res) => {
    try {
      const valor = parseFloat(req.body.valor || 0);
      
      if (isNaN(valor) || valor < 0) {
        return res.status(400).json({ 
          sucesso: false, 
          erro: 'Valor inválido' 
        });
      }
      
      const token = gerarToken();
      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
      
      await databasePool.query(
        'INSERT INTO tokens (token, valor) VALUES ($1, $2)',
        [token, valor]
      );
      
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
  router.post('/verificar-token', async (req, res) => {
    try {
      const { token } = req.body;
      const ip = obterIP(req);
      const userAgent = sanitizeInput(req.get('User-Agent') || '');
      
      if (!token || !isValidToken(token)) {
        return res.status(400).json({ 
          sucesso: false, 
          erro: 'Token inválido' 
        });
      }
      
      const result = await databasePool.query(
        'SELECT id, valor, usado FROM tokens WHERE token = $1',
        [token]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ 
          sucesso: false, 
          erro: 'Token inválido' 
        });
      }
      
      const tokenData = result.rows[0];
      
      if (tokenData.usado) {
        return res.status(400).json({ 
          sucesso: false, 
          erro: 'Token já foi usado' 
        });
      }
      
      await databasePool.query(
        'UPDATE tokens SET usado = TRUE, data_uso = CURRENT_TIMESTAMP, ip_uso = $1, user_agent = $2 WHERE token = $3',
        [ip, userAgent, token]
      );
      
      cache.del('estatisticas');
      
      log('info', 'Token usado com sucesso', { 
        token: token.substring(0, 8) + '...', 
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

  // Listar tokens
  router.get('/tokens', async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page || '1'));
      const limit = Math.min(100, parseInt(req.query.limit || '50'));
      const offset = (page - 1) * limit;
      
      const tokensResult = await databasePool.query(
        `SELECT token, usado, valor, data_criacao, data_uso, ip_uso 
         FROM tokens 
         ORDER BY data_criacao DESC 
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      
      const countResult = await databasePool.query('SELECT COUNT(*) as total FROM tokens');
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

  // Estatísticas
  router.get('/estatisticas', async (req, res) => {
    try {
      const cached = cache.get('estatisticas');
      if (cached) {
        return res.json({ sucesso: true, estatisticas: cached });
      }
      
      const stats = await databasePool.query(`
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
      
      cache.set('estatisticas', estatisticas, 300);
      
      res.json({ sucesso: true, estatisticas });
      
    } catch (error) {
      log('error', 'Erro ao buscar estatísticas', { erro: error.message });
      res.status(500).json({ 
        sucesso: false, 
        erro: 'Erro interno do servidor' 
      });
    }
  });

  // Validar token via GET
  router.get('/validar-token/:token', async (req, res) => {
    try {
      const { token } = req.params;
      
      if (!token || !isValidToken(token)) {
        return res.status(400).json({ 
          valido: false, 
          erro: 'Token inválido' 
        });
      }
      
      const result = await databasePool.query(
        'SELECT id, valor, usado FROM tokens WHERE token = $1',
        [token]
      );
      
      if (result.rows.length === 0) {
        return res.json({ 
          valido: false, 
          erro: 'Token não encontrado' 
        });
      }
      
      const tokenData = result.rows[0];
      
      if (tokenData.usado) {
        return res.json({ 
          valido: false, 
          erro: 'Token já foi usado' 
        });
      }
      
      res.json({ 
        valido: true, 
        valor: parseFloat(tokenData.valor)
      });
      
    } catch (error) {
      log('error', 'Erro na validação GET do token', { erro: error.message });
      res.status(500).json({ 
        valido: false, 
        erro: 'Erro interno do servidor' 
      });
    }
  });

  // Debug files
  router.get('/debug/files', (req, res) => {
    const currentDir = __dirname;
    const webDir = path.join(currentDir, 'public');
    
    res.json({
      current_directory: currentDir,
      web_directory: webDir,
      web_exists: fs.existsSync(webDir),
      web_contents: fs.existsSync(webDir) ? fs.readdirSync(webDir) : [],
      admin_exists: fs.existsSync(path.join(webDir, 'admin.html')),
      obrigado_exists: fs.existsSync(path.join(webDir, 'obrigado.html'))
    });
  });

  // ====== MONTAR ROUTER ======
  app.use('/api', router);

  // ====== ROTA DIRETA PARA OBRIGADO.HTML ======
  app.get('/obrigado.html', (req, res) => {
    const obrigadoPath = path.join(__dirname, 'public', 'obrigado.html');
    if (fs.existsSync(obrigadoPath)) {
      res.sendFile(obrigadoPath);
    } else {
      res.status(404).json({ erro: 'Página não encontrada' });
    }
  });

  // ====== MIDDLEWARE DE ERRO ======
  router.use((error, req, res, next) => {
    log('error', 'Erro não tratado no router', { erro: error.message });
    res.status(500).json({
      sucesso: false,
      erro: 'Erro interno do servidor'
    });
  });

  // ====== RETORNO DO MÓDULO ======
  log('info', 'Módulo web inicializado com sucesso');
  
  return {
    router,
    databasePool,
    cache,
    log,
    getCache: () => cache,
    clearCache: () => {
      cache.cache.clear();
      cache.ttl.clear();
      log('info', 'Cache limpo manualmente');
    },
    gerarToken,
    obterIP
  };
};