module.exports = (app) => {
const Database = require('better-sqlite3');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const helmet = require('helmet');
const fs = require('fs');
const express = require('express'); // ✅ Só importa o express

const PORT = process.env.PORT || 3000;

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
  fs.appendFileSync(`./logs/${level}.log`, logLine);
  
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

// ====== CONFIGURAÇÃO DO BANCO OTIMIZADA ======
const db = new sqlite3.Database('./tokens.db');

// Configurar SQLite para alta performance
db.serialize(() => {
  // Configurações de performance para SQLite
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA cache_size = 10000;
    PRAGMA temp_store = MEMORY;
    PRAGMA mmap_size = 268435456;
  `);
  
  // Criar tabela se não existir
  db.run(`CREATE TABLE IF NOT EXISTS tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    usado BOOLEAN DEFAULT 0,
    valor REAL DEFAULT 0,
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    data_uso DATETIME,
    ip_uso TEXT,
    user_agent TEXT
  )`);
  
  // Índices para performance
  db.run(`CREATE INDEX IF NOT EXISTS idx_tokens_token ON tokens(token)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tokens_usado ON tokens(usado)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tokens_data_criacao ON tokens(data_criacao)`);
  
  log('info', 'Banco de dados inicializado com otimizações');
});

// ====== FUNÇÕES UTILITÁRIAS ======
function gerarToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ====== ENDPOINTS ======

// Health check
app.get('/api/health', (req, res) => {
  const health = {
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    version: '1.0.0',
    cache_size: cache.cache.size
  };
  
  res.json(health);
});

// Gerar novo token
app.post('/api/gerar-token', (req, res) => {
  const { valor = 0 } = req.body;
  const token = gerarToken();
  
  db.run(
    'INSERT INTO tokens (token, valor) VALUES (?, ?)',
    [token, valor],
    function(err) {
      if (err) {
        log('error', 'Erro ao criar token', { erro: err.message });
        return res.status(500).json({ 
          sucesso: false, 
          erro: 'Erro interno do servidor' 
        });
      }
      
      // Invalidar cache de estatísticas
      cache.del('estatisticas');
      
      log('info', 'Token gerado', { 
        token: token.substring(0, 8) + '...', 
        valor,
        id: this.lastID
      });
      
      res.json({ 
        sucesso: true, 
        token: token,
        url: `${req.protocol}://${req.get('host')}/obrigado.html?token=${token}&valor=${valor}`
      });
    }
  );
});

// Verificar e usar token
app.post('/api/verificar-token', (req, res) => {
  const { token } = req.body;
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || '';
  
  if (!token) {
    return res.status(400).json({ 
      sucesso: false, 
      erro: 'Token não fornecido' 
    });
  }
  
  // Verificar se o token existe e não foi usado
  db.get(
    'SELECT * FROM tokens WHERE token = ? AND usado = 0',
    [token],
    (err, row) => {
      if (err) {
        log('error', 'Erro ao verificar token', { erro: err.message, token: token.substring(0, 8) + '...' });
        return res.status(500).json({ 
          sucesso: false, 
          erro: 'Erro interno do servidor' 
        });
      }
      
      if (!row) {
        log('warn', 'Token inválido ou já usado', { token: token.substring(0, 8) + '...', ip });
        return res.status(400).json({ 
          sucesso: false, 
          erro: 'Token inválido ou já foi usado' 
        });
      }
      
      // Marcar token como usado
      db.run(
        'UPDATE tokens SET usado = 1, data_uso = CURRENT_TIMESTAMP, ip_uso = ?, user_agent = ? WHERE token = ?',
        [ip, userAgent, token],
        function(err) {
          if (err) {
            log('error', 'Erro ao marcar token como usado', { erro: err.message, token: token.substring(0, 8) + '...' });
            return res.status(500).json({ 
              sucesso: false, 
              erro: 'Erro interno do servidor' 
            });
          }
          
          // Invalidar cache de estatísticas
          cache.del('estatisticas');
          
          log('info', 'Token usado com sucesso', { 
            token: token.substring(0, 8) + '...', 
            ip,
            valor: row.valor
          });
          
          res.json({ 
            sucesso: true, 
            valor: row.valor,
            mensagem: 'Acesso liberado com sucesso!' 
          });
        }
      );
    }
  );
});

// Listar tokens com paginação
app.get('/api/tokens', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 50);
  const offset = (page - 1) * limit;
  
  // Query com paginação
  db.all(
    `SELECT token, usado, valor, data_criacao, data_uso, ip_uso 
     FROM tokens 
     ORDER BY data_criacao DESC 
     LIMIT ? OFFSET ?`,
    [limit, offset],
    (err, rows) => {
      if (err) {
        log('error', 'Erro ao buscar tokens', { erro: err.message });
        return res.status(500).json({ 
          sucesso: false, 
          erro: 'Erro interno do servidor' 
        });
      }
      
      // Contar total de registros
      db.get('SELECT COUNT(*) as total FROM tokens', [], (err, countRow) => {
        if (err) {
          log('error', 'Erro ao contar tokens', { erro: err.message });
          return res.status(500).json({ 
            sucesso: false, 
            erro: 'Erro interno do servidor' 
          });
        }
        
        const total = countRow.total;
        
        res.json({ 
          sucesso: true, 
          tokens: rows,
          pagination: {
            page: page,
            limit: limit,
            total: total,
            totalPages: Math.ceil(total / limit),
            hasNext: page * limit < total,
            hasPrev: page > 1
          }
        });
      });
    }
  );
});

// Estatísticas com cache
app.get('/api/estatisticas', (req, res) => {
  // Tentar pegar do cache primeiro
  const cached = cache.get('estatisticas');
  if (cached) {
    return res.json({ sucesso: true, estatisticas: cached });
  }
  
  const queries = [
    'SELECT COUNT(*) as total FROM tokens',
    'SELECT COUNT(*) as usados FROM tokens WHERE usado = 1',
    'SELECT SUM(valor) as valor_total FROM tokens WHERE usado = 1',
    'SELECT COUNT(*) as hoje FROM tokens WHERE DATE(data_criacao) = DATE("now")'
  ];
  
  Promise.all(queries.map(query => 
    new Promise((resolve, reject) => {
      db.get(query, [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    })
  )).then(results => {
    const stats = {
      total_tokens: results[0].total || 0,
      tokens_usados: results[1].usados || 0,
      valor_total: results[2].valor_total || 0,
      tokens_hoje: results[3].hoje || 0
    };
    
    // Cachear por 5 minutos
    cache.set('estatisticas', stats, 300);
    
    log('info', 'Estatísticas calculadas', stats);
    
    res.json({ sucesso: true, estatisticas: stats });
  }).catch(err => {
    log('error', 'Erro ao buscar estatísticas', { erro: err.message });
    res.status(500).json({ 
      sucesso: false, 
      erro: 'Erro interno do servidor' 
    });
  });
});

// ====== SERVIR ARQUIVOS ESTÁTICOS ======
app.get('/obrigado.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'obrigado.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
/*
// ====== INICIAR SERVIDOR ======
app.listen(PORT, () => {
  log('info', `Servidor iniciado na porta ${PORT}`, { 
    port: PORT,
    node_env: process.env.NODE_ENV || 'development'
  });
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(`📊 Painel admin: http://localhost:${PORT}/admin.html`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
});
*/
// ====== GRACEFUL SHUTDOWN ======
process.on('SIGINT', () => {
  log('info', 'Recebido sinal de shutdown');
  console.log('\n🔄 Fechando servidor...');
  
  db.close((err) => {
    if (err) {
      log('error', 'Erro ao fechar banco de dados', { erro: err.message });
      console.error('Erro ao fechar banco de dados:', err);
    } else {
      log('info', 'Banco de dados fechado com sucesso');
      console.log('✅ Banco de dados fechado');
    }
    process.exit(0);
  });
});

// ====== TRATAMENTO DE ERROS NÃO CAPTURADOS ======
process.on('uncaughtException', (err) => {
  log('error', 'Erro não capturado', { erro: err.message, stack: err.stack });
  console.error('Erro não capturado:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log('error', 'Promise rejeitada não tratada', { reason, promise });
  console.error('Promise rejeitada não tratada:', reason);
});
  
};
/*
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const helmet = require('helmet');
const fs = require('fs');

const PORT = process.env.PORT || 3000;

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
  fs.appendFileSync(`./logs/${level}.log`, logLine);
  
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

// ====== CONFIGURAÇÃO DO BANCO OTIMIZADA ======
const db = new sqlite3.Database('./tokens.db');

// Configurar SQLite para alta performance
db.serialize(() => {
  // Configurações de performance para SQLite
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA cache_size = 10000;
    PRAGMA temp_store = MEMORY;
    PRAGMA mmap_size = 268435456;
  `);
  
  // Criar tabela se não existir
  db.run(`CREATE TABLE IF NOT EXISTS tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    usado BOOLEAN DEFAULT 0,
    valor REAL DEFAULT 0,
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    data_uso DATETIME,
    ip_uso TEXT,
    user_agent TEXT
  )`);
  
  // Índices para performance
  db.run(`CREATE INDEX IF NOT EXISTS idx_tokens_token ON tokens(token)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tokens_usado ON tokens(usado)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tokens_data_criacao ON tokens(data_criacao)`);
  
  log('info', 'Banco de dados inicializado com otimizações');
});

// ====== FUNÇÕES UTILITÁRIAS ======
function gerarToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ====== ENDPOINTS ======

// Health check
app.get('/api/health', (req, res) => {
  const health = {
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    version: '1.0.0',
    cache_size: cache.cache.size
  };
  
  res.json(health);
});

// Gerar novo token
app.post('/api/gerar-token', (req, res) => {
  const { valor = 0 } = req.body;
  const token = gerarToken();
  
  db.run(
    'INSERT INTO tokens (token, valor) VALUES (?, ?)',
    [token, valor],
    function(err) {
      if (err) {
        log('error', 'Erro ao criar token', { erro: err.message });
        return res.status(500).json({ 
          sucesso: false, 
          erro: 'Erro interno do servidor' 
        });
      }
      
      // Invalidar cache de estatísticas
      cache.del('estatisticas');
      
      log('info', 'Token gerado', { 
        token: token.substring(0, 8) + '...', 
        valor,
        id: this.lastID
      });
      
      res.json({ 
        sucesso: true, 
        token: token,
        url: `${req.protocol}://${req.get('host')}/obrigado.html?token=${token}&valor=${valor}`
      });
    }
  );
});

// Verificar e usar token
app.post('/api/verificar-token', (req, res) => {
  const { token } = req.body;
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || '';
  
  if (!token) {
    return res.status(400).json({ 
      sucesso: false, 
      erro: 'Token não fornecido' 
    });
  }
  
  // Verificar se o token existe e não foi usado
  db.get(
    'SELECT * FROM tokens WHERE token = ? AND usado = 0',
    [token],
    (err, row) => {
      if (err) {
        log('error', 'Erro ao verificar token', { erro: err.message, token: token.substring(0, 8) + '...' });
        return res.status(500).json({ 
          sucesso: false, 
          erro: 'Erro interno do servidor' 
        });
      }
      
      if (!row) {
        log('warn', 'Token inválido ou já usado', { token: token.substring(0, 8) + '...', ip });
        return res.status(400).json({ 
          sucesso: false, 
          erro: 'Token inválido ou já foi usado' 
        });
      }
      
      // Marcar token como usado
      db.run(
        'UPDATE tokens SET usado = 1, data_uso = CURRENT_TIMESTAMP, ip_uso = ?, user_agent = ? WHERE token = ?',
        [ip, userAgent, token],
        function(err) {
          if (err) {
            log('error', 'Erro ao marcar token como usado', { erro: err.message, token: token.substring(0, 8) + '...' });
            return res.status(500).json({ 
              sucesso: false, 
              erro: 'Erro interno do servidor' 
            });
          }
          
          // Invalidar cache de estatísticas
          cache.del('estatisticas');
          
          log('info', 'Token usado com sucesso', { 
            token: token.substring(0, 8) + '...', 
            ip,
            valor: row.valor
          });
          
          res.json({ 
            sucesso: true, 
            valor: row.valor,
            mensagem: 'Acesso liberado com sucesso!' 
          });
        }
      );
    }
  );
});

// Listar tokens com paginação
app.get('/api/tokens', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 50);
  const offset = (page - 1) * limit;
  
  // Query com paginação
  db.all(
    `SELECT token, usado, valor, data_criacao, data_uso, ip_uso 
     FROM tokens 
     ORDER BY data_criacao DESC 
     LIMIT ? OFFSET ?`,
    [limit, offset],
    (err, rows) => {
      if (err) {
        log('error', 'Erro ao buscar tokens', { erro: err.message });
        return res.status(500).json({ 
          sucesso: false, 
          erro: 'Erro interno do servidor' 
        });
      }
      
      // Contar total de registros
      db.get('SELECT COUNT(*) as total FROM tokens', [], (err, countRow) => {
        if (err) {
          log('error', 'Erro ao contar tokens', { erro: err.message });
          return res.status(500).json({ 
            sucesso: false, 
            erro: 'Erro interno do servidor' 
          });
        }
        
        const total = countRow.total;
        
        res.json({ 
          sucesso: true, 
          tokens: rows,
          pagination: {
            page: page,
            limit: limit,
            total: total,
            totalPages: Math.ceil(total / limit),
            hasNext: page * limit < total,
            hasPrev: page > 1
          }
        });
      });
    }
  );
});

// Estatísticas com cache
app.get('/api/estatisticas', (req, res) => {
  // Tentar pegar do cache primeiro
  const cached = cache.get('estatisticas');
  if (cached) {
    return res.json({ sucesso: true, estatisticas: cached });
  }
  
  const queries = [
    'SELECT COUNT(*) as total FROM tokens',
    'SELECT COUNT(*) as usados FROM tokens WHERE usado = 1',
    'SELECT SUM(valor) as valor_total FROM tokens WHERE usado = 1',
    'SELECT COUNT(*) as hoje FROM tokens WHERE DATE(data_criacao) = DATE("now")'
  ];
  
  Promise.all(queries.map(query => 
    new Promise((resolve, reject) => {
      db.get(query, [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    })
  )).then(results => {
    const stats = {
      total_tokens: results[0].total || 0,
      tokens_usados: results[1].usados || 0,
      valor_total: results[2].valor_total || 0,
      tokens_hoje: results[3].hoje || 0
    };
    
    // Cachear por 5 minutos
    cache.set('estatisticas', stats, 300);
    
    log('info', 'Estatísticas calculadas', stats);
    
    res.json({ sucesso: true, estatisticas: stats });
  }).catch(err => {
    log('error', 'Erro ao buscar estatísticas', { erro: err.message });
    res.status(500).json({ 
      sucesso: false, 
      erro: 'Erro interno do servidor' 
    });
  });
});

// ====== SERVIR ARQUIVOS ESTÁTICOS ======
app.get('/obrigado.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'obrigado.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
/*
// ====== INICIAR SERVIDOR ======
app.listen(PORT, () => {
  log('info', `Servidor iniciado na porta ${PORT}`, { 
    port: PORT,
    node_env: process.env.NODE_ENV || 'development'
  });
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(`📊 Painel admin: http://localhost:${PORT}/admin.html`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
});
*/
// ====== GRACEFUL SHUTDOWN ======

/*
process.on('SIGINT', () => {
  log('info', 'Recebido sinal de shutdown');
  console.log('\n🔄 Fechando servidor...');
  
  db.close((err) => {
    if (err) {
      log('error', 'Erro ao fechar banco de dados', { erro: err.message });
      console.error('Erro ao fechar banco de dados:', err);
    } else {
      log('info', 'Banco de dados fechado com sucesso');
      console.log('✅ Banco de dados fechado');
    }
    process.exit(0);
  });
});

// ====== TRATAMENTO DE ERROS NÃO CAPTURADOS ======
process.on('uncaughtException', (err) => {
  log('error', 'Erro não capturado', { erro: err.message, stack: err.stack });
  console.error('Erro não capturado:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log('error', 'Promise rejeitada não tratada', { reason, promise });
  console.error('Promise rejeitada não tratada:', reason);
});

*/