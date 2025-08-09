module.exports = (app /* legacy: databasePool (ignored) */) => {
  const path = require('path');
  const cors = require('cors');
  const crypto = require('crypto');
  const rateLimit = require('express-rate-limit');
  const compression = require('compression');
  const helmet = require('helmet');
  const fs = require('fs');
  const express = require('express');
  
  console.log('🔍 tokens.js: Módulo iniciado');
  
  // Importar funções do banco de dados
  const postgres = require('../../database/postgres.js');
  const { getDatabasePool } = require('../../bootstrap');

  // Obter pool via bootstrap (não criar pool novo)
  const databasePool = getDatabasePool();

  // Verificar se o databasePool foi fornecido
  if (!databasePool) {
    console.error('❌ tokens.js: Pool de conexões PostgreSQL não disponível via bootstrap');
    throw new Error('Pool de conexões PostgreSQL não foi fornecido');
  }

  // ====== FUNÇÕES UTILITÁRIAS (DECLARADAS NO INÍCIO) ======
  function gerarToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  function obterIP(req) {
    const raw = req.headers['x-forwarded-for'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           '127.0.0.1';
    // Se vier lista no XFF, pegar o primeiro
    if (typeof raw === 'string' && raw.includes(',')) {
      return raw.split(',')[0].trim();
    }
    return raw;
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

  // ====== REPOSITÓRIO TOKENS (USANDO EXATAMENTE O SCHEMA) ======
  const ALLOWED_TRACKING_FIELDS = new Set([
    'utm_campaign',
    'utm_medium',
    'utm_term',
    'utm_content',
    'fbp',
    'fbc',
    'ip_criacao',
    'user_agent_criacao',
    'event_time',
    'external_id_hash',
    'nome_oferta'
  ]);

  const tokensRepository = {
    async createToken(data) {
      const {
        token,
        valor = 0,
        status = 'valido', // manter compat com fluxo atual
        usado = false,
        utm_campaign = null,
        utm_medium = null,
        utm_term = null,
        utm_content = null,
        fbp = null,
        fbc = null,
        ip_criacao = null,
        user_agent_criacao = null,
        event_time = null,
        external_id_hash = null,
        nome_oferta = null
      } = data || {};

      // Garante id_transacao, pois o schema exige essa coluna como PK
      const id_transacao = (data && data.id_transacao) || require('crypto').randomUUID();

      const sql = `
        INSERT INTO tokens (
          id_transacao,
          token, valor, status, usado,
          utm_campaign, utm_medium, utm_term, utm_content,
          fbp, fbc,
          ip_criacao, user_agent_criacao,
          event_time, external_id_hash,
          nome_oferta
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11,
          $12, $13,
          $14, $15,
          $16
        ) RETURNING *`;

      const params = [
        id_transacao,
        token, valor, status, usado,
        utm_campaign, utm_medium, utm_term, utm_content,
        fbp, fbc,
        ip_criacao, user_agent_criacao,
        event_time, external_id_hash,
        nome_oferta
      ];

      const result = await databasePool.query(sql, params);
      log('info', 'TOKENS_CREATE_OK', { token: token?.slice(0, 8) + '...', id_transacao });
      return result.rows[0];
    },

    async findByToken(token) {
      const result = await databasePool.query(
        'SELECT * FROM tokens WHERE token = $1 LIMIT 1',
        [token]
      );
      log('info', 'TOKENS_FIND_BY_TOKEN', { token: token?.slice(0, 8) + '...' });
      return result.rows[0] || null;
    },

    async markUsed({ token }) {
      // Ajustado ao schema real: marca usado e registra usado_em
      const result = await databasePool.query(
        `UPDATE tokens 
         SET usado = TRUE,
             usado_em = CURRENT_TIMESTAMP,
             status = 'usado'
         WHERE token = $1
         RETURNING *`,
        [token]
      );
      log('info', 'TOKENS_MARK_USED_OK', { token: token?.slice(0, 8) + '...' });
      return result.rows[0] || null;
    },

    async updateTracking(token, patch = {}) {
      const entries = Object.entries(patch).filter(([k, v]) => ALLOWED_TRACKING_FIELDS.has(k));
      if (entries.length === 0) {
        return await this.findByToken(token);
      }

      const sets = entries.map(([key], idx) => `${key} = $${idx + 2}`);
      const params = [token, ...entries.map(([, v]) => v)];
      const sql = `UPDATE tokens SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE token = $1 RETURNING *`;
      const result = await databasePool.query(sql, params);
      log('info', 'TOKENS_UPDATE_TRACKING_OK', { token: token?.slice(0, 8) + '...', fields: entries.map(([k]) => k) });
      return result.rows[0] || null;
    },

    async incrementAttempts(token) {
      const result = await databasePool.query(
        `UPDATE tokens 
         SET event_attempts = COALESCE(event_attempts, 0) + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE token = $1 RETURNING *`,
        [token]
      );
      log('info', 'TOKENS_INCREMENT_ATTEMPTS_OK', { token: token?.slice(0, 8) + '...' });
      return result.rows[0] || null;
    },

    async setPixelSent(token) {
      const result = await databasePool.query(
        `UPDATE tokens 
         SET pixel_sent = TRUE,
             first_event_sent_at = COALESCE(first_event_sent_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE token = $1 RETURNING *`,
        [token]
      );
      log('info', 'TOKENS_SET_PIXEL_SENT_OK', { token: token?.slice(0, 8) + '...' });
      return result.rows[0] || null;
    },

    async setCapiSent(token) {
      const result = await databasePool.query(
        `UPDATE tokens 
         SET capi_sent = TRUE,
             capi_processing = FALSE,
             first_event_sent_at = COALESCE(first_event_sent_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE token = $1 RETURNING *`,
        [token]
      );
      log('info', 'TOKENS_SET_CAPI_SENT_OK', { token: token?.slice(0, 8) + '...' });
      return result.rows[0] || null;
    },

    async setCapiReady(token, isReady) {
      const result = await databasePool.query(
        `UPDATE tokens 
         SET capi_ready = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE token = $1 RETURNING *`,
        [token, !!isReady]
      );
      log('info', 'TOKENS_SET_CAPI_READY_OK', { token: token?.slice(0, 8) + '...', value: !!isReady });
      return result.rows[0] || null;
    },

    async setCapiProcessing(token, isProcessing) {
      const result = await databasePool.query(
        `UPDATE tokens 
         SET capi_processing = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE token = $1 RETURNING *`,
        [token, !!isProcessing]
      );
      log('info', 'TOKENS_SET_CAPI_PROCESSING_OK', { token: token?.slice(0, 8) + '...', value: !!isProcessing });
      return result.rows[0] || null;
    }
  };

  // ====== TTL/EXPIRAÇÃO ======
  function getTTLMinutes() {
    const raw = process.env.TOKEN_TTL_MINUTES;
    const ttl = raw ? parseFloat(raw) : 60;
    return Number.isFinite(ttl) && ttl > 0 ? ttl : 60;
  }

  function isExpiredRow(row) {
    if (!row) return true;
    try {
      const ttlMinutes = getTTLMinutes();
      const createdAt = row.criado_em || row.created_at || row.data_criacao;
      const usedFlag = row.usado === true || row.usado === 't';
      if (!createdAt) return false; // sem data, não expira automaticamente
      const createdMs = new Date(createdAt).getTime();
      const expiresAt = createdMs + ttlMinutes * 60 * 1000;
      const expired = !usedFlag && Date.now() > expiresAt;
      return expired;
    } catch (e) {
      log('error', 'TOKENS_IS_EXPIRED_ERROR', { erro: e.message });
      return false;
    }
  }

  async function validateToken(token) {
    try {
      const row = await tokensRepository.findByToken(token);
      if (!row) {
        log('info', 'TOKENS_VALIDATE_NOT_FOUND', { token: token?.slice(0, 8) + '...' });
        return { ok: false, reason: 'not_found' };
      }
      if (row.usado) {
        log('info', 'TOKENS_VALIDATE_USED', { token: token?.slice(0, 8) + '...' });
        return { ok: false, reason: 'used' };
      }
      if (isExpiredRow(row)) {
        log('info', 'TOKENS_VALIDATE_EXPIRED', { token: token?.slice(0, 8) + '...' });
        return { ok: false, reason: 'expired' };
      }
      log('info', 'TOKENS_VALIDATE_OK', { token: token?.slice(0, 8) + '...' });
      return { ok: true, row };
    } catch (e) {
      log('error', 'TOKENS_VALIDATE_ERROR', { erro: e.message, token: token?.slice(0, 8) + '...' });
      return { ok: false, reason: 'error', error: e };
    }
  }

  async function cleanupExpired() {
    try {
      const ttlMinutes = getTTLMinutes();
      const sql = `
        DELETE FROM tokens
        WHERE usado = FALSE
          AND criado_em < (NOW()::timestamp - ($1::text || ' minutes')::interval)
      `;
      const result = await databasePool.query(sql, [String(ttlMinutes)]);
      log('info', 'TOKENS_CLEANUP_EXPIRED_OK', { removed: result.rowCount, ttl_minutes: ttlMinutes });
      return result.rowCount;
    } catch (e) {
      log('error', 'TOKENS_CLEANUP_EXPIRED_ERROR', { erro: e.message });
      throw e;
    }
  }

  // ====== CRIAR ROUTER ======
  const router = express.Router();
  
  // Middlewares
  router.use(helmet({
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false
  }));
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

      const created = await tokensRepository.createToken({
        token,
        valor,
        status: 'valido',
        ip_criacao: obterIP(req),
        user_agent_criacao: sanitizeInput(req.get('User-Agent') || '')
      });
      
      cache.del('estatisticas');
      
      log('info', 'Token gerado', { 
        token: token.substring(0, 8) + '...', 
        valor,
        id: created?.id
      });
      
      res.json({
        sucesso: true,
        token: token,
        url: `${baseUrl}/obrigado.html?token=${encodeURIComponent(token)}&valor=${valor}`,
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
      
      const tokenData = await tokensRepository.findByToken(token);
      
      if (!tokenData) {
        return res.status(404).json({ 
          sucesso: false, 
          erro: 'Token inválido' 
        });
      }
      
      if (tokenData.status !== 'valido') {
        return res.status(400).json({
          sucesso: false,
          erro: 'Token inválido'
        });
      }

      if (tokenData.usado) {
        return res.status(400).json({
          sucesso: false,
          erro: 'Token já foi usado'
        });
      }
      
      await tokensRepository.markUsed({ token, ip_uso: ip, user_agent: userAgent });
      
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
    obterIP,
    repository: tokensRepository,
    isExpiredRow,
    validateToken,
    cleanupExpired
  };
};