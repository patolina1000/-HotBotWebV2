// ===================================================================
// 🔥 FACEBOOK PIXEL + CONVERSION API SERVER
// Versão: 2.0 - Produção Ready com Deduplicação Total
// Backend Node.js para tracking robusto com PostgreSQL/SQLite
// ===================================================================

const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');
const pg = require('pg');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// ===================================================================
// CONFIGURAÇÕES E VARIÁVEIS DE AMBIENTE
// ===================================================================

const CONFIG = {
    // Facebook Pixel e CAPI
    FB_PIXEL_ID: process.env.FB_PIXEL_ID || 'SEU_PIXEL_ID_AQUI',
    FB_PIXEL_TOKEN: process.env.FB_PIXEL_TOKEN || 'SEU_ACCESS_TOKEN_AQUI',
    FB_API_VERSION: process.env.FB_API_VERSION || 'v18.0',
    
    // Banco de dados
    DATABASE_URL: process.env.DATABASE_URL || null,
    SQLITE_PATH: process.env.SQLITE_PATH || './tracking.db',
    
    // Servidor
    PORT: process.env.PORT || 3000,
    NODE_ENV: process.env.NODE_ENV || 'production',
    
    // Deduplicação
    DEDUP_TTL_MINUTES: parseInt(process.env.DEDUP_TTL_MINUTES) || 60,
    MAX_RETRY_ATTEMPTS: parseInt(process.env.MAX_RETRY_ATTEMPTS) || 3,
    
    // Rate limiting
    RATE_LIMIT_WINDOW: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000, // 1 minuto
    RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    
    // Security
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
    API_KEY: process.env.API_KEY || null
};

// Validação de configurações críticas
if (CONFIG.NODE_ENV === 'production') {
    if (CONFIG.FB_PIXEL_ID === 'SEU_PIXEL_ID_AQUI') {
        console.error('❌ ERRO: FB_PIXEL_ID não configurado para produção!');
        process.exit(1);
    }
    if (CONFIG.FB_PIXEL_TOKEN === 'SEU_ACCESS_TOKEN_AQUI') {
        console.error('❌ ERRO: FB_PIXEL_TOKEN não configurado para produção!');
        process.exit(1);
    }
}

// ===================================================================
// SETUP DO SERVIDOR EXPRESS
// ===================================================================

const app = express();

// Middlewares básicos
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS configurável
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (CONFIG.ALLOWED_ORIGINS.includes('*') || CONFIG.ALLOWED_ORIGINS.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin || '*');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-API-Key');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Headers de segurança
app.use((req, res, next) => {
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('X-Frame-Options', 'DENY');
    res.header('X-XSS-Protection', '1; mode=block');
    res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// Rate limiting simples
const rateLimitStore = new Map();
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        const ip = req.ip || req.connection.remoteAddress;
        const key = `${ip}_${Math.floor(Date.now() / CONFIG.RATE_LIMIT_WINDOW)}`;
        
        const current = rateLimitStore.get(key) || 0;
        if (current >= CONFIG.RATE_LIMIT_MAX) {
            return res.status(429).json({
                success: false,
                error: 'Rate limit exceeded',
                retry_after: 60
            });
        }
        
        rateLimitStore.set(key, current + 1);
        
        // Limpeza do cache de rate limiting
        if (Math.random() < 0.01) { // 1% chance
            const cutoff = Math.floor(Date.now() / CONFIG.RATE_LIMIT_WINDOW) - 2;
            for (const [key] of rateLimitStore) {
                if (parseInt(key.split('_')[1]) < cutoff) {
                    rateLimitStore.delete(key);
                }
            }
        }
    }
    next();
});

// Logging de requests
app.use((req, res, next) => {
    if (CONFIG.NODE_ENV === 'development' || req.path.startsWith('/api/')) {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${req.ip}`);
    }
    next();
});

// ===================================================================
// SETUP DO BANCO DE DADOS
// ===================================================================

class DatabaseManager {
    constructor() {
        this.pgPool = null;
        this.sqlite = null;
        this.cache = new Map(); // Cache para deduplicação
        this.initialized = false;
    }
    
    async initialize() {
        console.log('🔧 Inicializando banco de dados...');
        
        // Tenta PostgreSQL primeiro
        if (CONFIG.DATABASE_URL) {
            try {
                this.pgPool = new pg.Pool({
                    connectionString: CONFIG.DATABASE_URL,
                    ssl: CONFIG.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
                });
                
                await this.createPostgreTables();
                console.log('✅ PostgreSQL conectado e tabelas criadas');
            } catch (error) {
                console.error('⚠️ Falha ao conectar PostgreSQL:', error.message);
                this.pgPool = null;
            }
        }
        
        // Fallback para SQLite
        if (!this.pgPool) {
            try {
                this.sqlite = new Database(CONFIG.SQLITE_PATH);
                this.sqlite.pragma('journal_mode = WAL');
                await this.createSQLiteTables();
                console.log('✅ SQLite inicializado e tabelas criadas');
            } catch (error) {
                console.error('❌ Falha crítica ao inicializar SQLite:', error.message);
                throw error;
            }
        }
        
        this.initialized = true;
        this.startCleanupCron();
    }
    
    async createPostgreTables() {
        const query = `
            CREATE TABLE IF NOT EXISTS tokens (
                id SERIAL PRIMARY KEY,
                token VARCHAR(255) UNIQUE NOT NULL,
                telegram_id BIGINT,
                value DECIMAL(10,2),
                currency VARCHAR(3) DEFAULT 'BRL',
                status VARCHAR(50) DEFAULT 'valid',
                
                -- Tracking flags
                pixel_sent BOOLEAN DEFAULT FALSE,
                capi_sent BOOLEAN DEFAULT FALSE,
                cron_sent BOOLEAN DEFAULT FALSE,
                capi_ready BOOLEAN DEFAULT FALSE,
                
                -- Event tracking
                event_id VARCHAR(255),
                first_event_sent_at TIMESTAMP,
                last_event_attempt TIMESTAMP,
                event_attempts INTEGER DEFAULT 0,
                
                -- User data (hashed)
                hashed_email VARCHAR(64),
                hashed_phone VARCHAR(64),
                hashed_fn VARCHAR(64),
                hashed_ln VARCHAR(64),
                external_id VARCHAR(64),
                
                -- Session data
                fbp VARCHAR(255),
                fbc VARCHAR(255),
                ip_address INET,
                user_agent TEXT,
                
                -- Metadata
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                metadata JSONB
            );
            
            CREATE INDEX IF NOT EXISTS idx_tokens_telegram_id ON tokens(telegram_id);
            CREATE INDEX IF NOT EXISTS idx_tokens_event_id ON tokens(event_id);
            CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens(status);
            CREATE INDEX IF NOT EXISTS idx_tokens_capi_flags ON tokens(capi_ready, capi_sent, pixel_sent);
            CREATE INDEX IF NOT EXISTS idx_tokens_created_at ON tokens(created_at);
            
            CREATE TABLE IF NOT EXISTS event_logs (
                id SERIAL PRIMARY KEY,
                event_id VARCHAR(255) NOT NULL,
                event_name VARCHAR(50) NOT NULL,
                source VARCHAR(20) NOT NULL, -- 'pixel', 'capi', 'cron'
                status VARCHAR(20) NOT NULL, -- 'success', 'failed', 'retry'
                
                token VARCHAR(255),
                telegram_id BIGINT,
                value DECIMAL(10,2),
                currency VARCHAR(3),
                
                -- Response data
                fb_response JSONB,
                error_message TEXT,
                retry_count INTEGER DEFAULT 0,
                
                -- Request metadata
                ip_address INET,
                user_agent TEXT,
                request_data JSONB,
                
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE INDEX IF NOT EXISTS idx_event_logs_event_id ON event_logs(event_id);
            CREATE INDEX IF NOT EXISTS idx_event_logs_source ON event_logs(source);
            CREATE INDEX IF NOT EXISTS idx_event_logs_status ON event_logs(status);
            CREATE INDEX IF NOT EXISTS idx_event_logs_created_at ON event_logs(created_at);
        `;
        
        await this.pgPool.query(query);
    }
    
    async createSQLiteTables() {
        const queries = [
            `CREATE TABLE IF NOT EXISTS tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token TEXT UNIQUE NOT NULL,
                telegram_id INTEGER,
                value REAL,
                currency TEXT DEFAULT 'BRL',
                status TEXT DEFAULT 'valid',
                
                pixel_sent INTEGER DEFAULT 0,
                capi_sent INTEGER DEFAULT 0,
                cron_sent INTEGER DEFAULT 0,
                capi_ready INTEGER DEFAULT 0,
                
                event_id TEXT,
                first_event_sent_at DATETIME,
                last_event_attempt DATETIME,
                event_attempts INTEGER DEFAULT 0,
                
                hashed_email TEXT,
                hashed_phone TEXT,
                hashed_fn TEXT,
                hashed_ln TEXT,
                external_id TEXT,
                
                fbp TEXT,
                fbc TEXT,
                ip_address TEXT,
                user_agent TEXT,
                
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                metadata TEXT
            )`,
            
            `CREATE INDEX IF NOT EXISTS idx_tokens_telegram_id ON tokens(telegram_id)`,
            `CREATE INDEX IF NOT EXISTS idx_tokens_event_id ON tokens(event_id)`,
            `CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens(status)`,
            `CREATE INDEX IF NOT EXISTS idx_tokens_created_at ON tokens(created_at)`,
            
            `CREATE TABLE IF NOT EXISTS event_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id TEXT NOT NULL,
                event_name TEXT NOT NULL,
                source TEXT NOT NULL,
                status TEXT NOT NULL,
                
                token TEXT,
                telegram_id INTEGER,
                value REAL,
                currency TEXT,
                
                fb_response TEXT,
                error_message TEXT,
                retry_count INTEGER DEFAULT 0,
                
                ip_address TEXT,
                user_agent TEXT,
                request_data TEXT,
                
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            `CREATE INDEX IF NOT EXISTS idx_event_logs_event_id ON event_logs(event_id)`,
            `CREATE INDEX IF NOT EXISTS idx_event_logs_source ON event_logs(source)`,
            `CREATE INDEX IF NOT EXISTS idx_event_logs_created_at ON event_logs(created_at)`
        ];
        
        for (const query of queries) {
            this.sqlite.exec(query);
        }
    }
    
    async findTokenByToken(token) {
        if (this.pgPool) {
            const result = await this.pgPool.query(
                'SELECT * FROM tokens WHERE token = $1 LIMIT 1',
                [token]
            );
            return result.rows[0] || null;
        } else {
            return this.sqlite.prepare('SELECT * FROM tokens WHERE token = ? LIMIT 1').get(token) || null;
        }
    }
    
    async updateTokenFlags(token, updates) {
        const now = new Date().toISOString();
        const updateFields = [];
        const values = [];
        let paramIndex = 1;
        
        // Monta query dinamicamente
        for (const [key, value] of Object.entries(updates)) {
            updateFields.push(`${key} = $${paramIndex}`);
            values.push(value);
            paramIndex++;
        }
        
        updateFields.push(`updated_at = $${paramIndex}`);
        values.push(now);
        paramIndex++;
        
        values.push(token); // WHERE token = $last
        
        if (this.pgPool) {
            const query = `UPDATE tokens SET ${updateFields.join(', ')} WHERE token = $${paramIndex}`;
            await this.pgPool.query(query, values);
        } else {
            // Converte para SQLite
            const sqliteValues = values.slice(0, -1); // Remove o último (WHERE)
            const sqliteQuery = `UPDATE tokens SET ${updateFields.join(', ').replace(/\$\d+/g, '?')}, updated_at = ? WHERE token = ?`;
            sqliteValues.push(now, token);
            this.sqlite.prepare(sqliteQuery).run(...sqliteValues);
        }
    }
    
    async logEvent(eventData) {
        const logEntry = {
            event_id: eventData.event_id,
            event_name: eventData.event_name,
            source: eventData.source,
            status: eventData.status,
            token: eventData.token,
            telegram_id: eventData.telegram_id,
            value: eventData.value,
            currency: eventData.currency,
            fb_response: JSON.stringify(eventData.fb_response || {}),
            error_message: eventData.error_message,
            retry_count: eventData.retry_count || 0,
            ip_address: eventData.ip_address,
            user_agent: eventData.user_agent,
            request_data: JSON.stringify(eventData.request_data || {})
        };
        
        if (this.pgPool) {
            await this.pgPool.query(`
                INSERT INTO event_logs (
                    event_id, event_name, source, status, token, telegram_id,
                    value, currency, fb_response, error_message, retry_count,
                    ip_address, user_agent, request_data
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            `, Object.values(logEntry));
        } else {
            const query = `
                INSERT INTO event_logs (
                    event_id, event_name, source, status, token, telegram_id,
                    value, currency, fb_response, error_message, retry_count,
                    ip_address, user_agent, request_data
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            this.sqlite.prepare(query).run(...Object.values(logEntry));
        }
    }
    
    // Cache para deduplicação
    addToCache(key, data, ttlMinutes = CONFIG.DEDUP_TTL_MINUTES) {
        const expiry = Date.now() + (ttlMinutes * 60 * 1000);
        this.cache.set(key, { data, expiry });
    }
    
    getFromCache(key) {
        const entry = this.cache.get(key);
        if (!entry) return null;
        
        if (Date.now() > entry.expiry) {
            this.cache.delete(key);
            return null;
        }
        
        return entry.data;
    }
    
    // Limpeza automática
    startCleanupCron() {
        setInterval(() => {
            // Limpeza do cache
            const now = Date.now();
            for (const [key, entry] of this.cache) {
                if (now > entry.expiry) {
                    this.cache.delete(key);
                }
            }
            
            // Limpeza de logs antigos (30 dias)
            if (Math.random() < 0.1) { // 10% chance
                this.cleanupOldLogs();
            }
        }, 5 * 60 * 1000); // A cada 5 minutos
    }
    
    async cleanupOldLogs() {
        const cutoffDate = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)); // 30 dias
        
        try {
            if (this.pgPool) {
                await this.pgPool.query('DELETE FROM event_logs WHERE created_at < $1', [cutoffDate]);
            } else {
                this.sqlite.prepare('DELETE FROM event_logs WHERE created_at < ?').run(cutoffDate.toISOString());
            }
            console.log('🧹 Logs antigos removidos');
        } catch (error) {
            console.error('⚠️ Erro na limpeza de logs:', error.message);
        }
    }
}

// ===================================================================
// FACEBOOK CONVERSION API CLIENT
// ===================================================================

class FacebookCAPI {
    constructor() {
        this.baseUrl = `https://graph.facebook.com/${CONFIG.FB_API_VERSION}/${CONFIG.FB_PIXEL_ID}/events`;
        this.accessToken = CONFIG.FB_PIXEL_TOKEN;
    }
    
    hashData(data) {
        if (!data) return null;
        return crypto.createHash('sha256').update(data.toString().toLowerCase().trim()).digest('hex');
    }
    
    async sendEvent(eventData) {
        const payload = {
            data: [{
                event_name: eventData.event_name,
                event_time: eventData.event_time || Math.floor(Date.now() / 1000),
                event_id: eventData.event_id,
                action_source: 'website',
                event_source_url: eventData.event_source_url,
                
                user_data: {
                    client_ip_address: eventData.client_ip_address,
                    client_user_agent: eventData.client_user_agent,
                    fbp: eventData.fbp,
                    fbc: eventData.fbc,
                    external_id: eventData.external_id
                },
                
                custom_data: {
                    value: eventData.value,
                    currency: eventData.currency || 'BRL'
                }
            }],
            access_token: this.accessToken
        };
        
        // Remove campos vazios/null
        this.cleanPayload(payload);
        
        console.log('📤 Enviando para Facebook CAPI:', {
            event_name: eventData.event_name,
            event_id: eventData.event_id,
            value: eventData.value,
            has_fbp: !!eventData.fbp,
            has_fbc: !!eventData.fbc,
            has_ip: !!eventData.client_ip_address
        });
        
        try {
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'FacebookTrackingServer/2.0'
                },
                body: JSON.stringify(payload)
            });
            
            const result = await response.json();
            
            if (!response.ok) {
                throw new Error(`Facebook API Error: ${result.error?.message || 'Unknown error'}`);
            }
            
            console.log('✅ Facebook CAPI resposta:', result);
            return { success: true, response: result };
            
        } catch (error) {
            console.error('❌ Erro no Facebook CAPI:', error.message);
            throw error;
        }
    }
    
    cleanPayload(obj) {
        for (const key in obj) {
            if (obj[key] === null || obj[key] === undefined || obj[key] === '') {
                delete obj[key];
            } else if (typeof obj[key] === 'object') {
                this.cleanPayload(obj[key]);
                if (Object.keys(obj[key]).length === 0) {
                    delete obj[key];
                }
            }
        }
    }
}

// ===================================================================
// INICIALIZAÇÃO DOS SERVIÇOS
// ===================================================================

const db = new DatabaseManager();
const fbCAPI = new FacebookCAPI();

// ===================================================================
// ENDPOINTS DA API
// ===================================================================

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: '2.0',
        database: db.pgPool ? 'postgresql' : 'sqlite',
        cache_size: db.cache.size
    });
});

// Endpoint principal de tracking
app.post('/api/track-purchase', async (req, res) => {
    const startTime = Date.now();
    let eventLogData = {
        source: 'capi',
        status: 'failed',
        ip_address: req.ip || req.connection.remoteAddress,
        user_agent: req.headers['user-agent'],
        request_data: req.body
    };
    
    try {
        console.log('🎯 Recebida requisição de tracking:', {
            token: req.body.token?.substr(0, 8) + '***',
            eventId: req.body.eventId,
            value: req.body.value,
            source: req.body.source,
            ip: eventLogData.ip_address
        });
        
        // Validação básica
        const { token, eventId, value, currency = 'BRL' } = req.body;
        
        if (!token) {
            throw new Error('Token é obrigatório');
        }
        
        if (!eventId) {
            throw new Error('EventID é obrigatório');
        }
        
        // Busca token no banco
        const tokenData = await db.findTokenByToken(token);
        if (!tokenData) {
            throw new Error('Token não encontrado');
        }
        
        console.log('✅ Token encontrado:', {
            id: tokenData.id,
            telegram_id: tokenData.telegram_id,
            status: tokenData.status,
            pixel_sent: tokenData.pixel_sent,
            capi_sent: tokenData.capi_sent
        });
        
        // Verifica deduplicação
        const dedupKey = `${eventId}_${tokenData.id}_Purchase`;
        if (db.getFromCache(dedupKey)) {
            console.log('⚠️ Evento duplicado detectado:', dedupKey);
            return res.json({
                success: true,
                message: 'Evento já processado (deduplicação)',
                eventId,
                deduplicated: true,
                processing_time: Date.now() - startTime
            });
        }
        
        // Adiciona ao cache de deduplicação
        db.addToCache(dedupKey, { timestamp: Date.now(), token });
        
        // Prepara dados do evento
        const eventData = {
            event_name: 'Purchase',
            event_id: eventId,
            event_time: req.body.timestamp || Math.floor(Date.now() / 1000),
            event_source_url: req.body.url || 'https://example.com/obrigado',
            
            // User data
            client_ip_address: eventLogData.ip_address,
            client_user_agent: eventLogData.user_agent,
            fbp: req.body.fbp || tokenData.fbp,
            fbc: req.body.fbc || tokenData.fbc,
            external_id: tokenData.external_id || fbCAPI.hashData(token),
            
            // Purchase data
            value: parseFloat(value || tokenData.value || 97.00),
            currency: currency
        };
        
        // Atualiza dados do log
        eventLogData = {
            ...eventLogData,
            event_id: eventId,
            event_name: 'Purchase',
            token: token,
            telegram_id: tokenData.telegram_id,
            value: eventData.value,
            currency: eventData.currency
        };
        
        console.log('📊 Dados do evento preparados:', {
            event_id: eventData.event_id,
            value: eventData.value,
            has_fbp: !!eventData.fbp,
            has_fbc: !!eventData.fbc,
            has_external_id: !!eventData.external_id
        });
        
        // Envia para Facebook CAPI
        try {
            const fbResult = await fbCAPI.sendEvent(eventData);
            
            // Atualiza flags no banco
            await db.updateTokenFlags(token, {
                capi_sent: true,
                capi_ready: true,
                event_id: eventId,
                first_event_sent_at: tokenData.first_event_sent_at || new Date().toISOString(),
                last_event_attempt: new Date().toISOString(),
                event_attempts: (tokenData.event_attempts || 0) + 1,
                pixel_sent: req.body.pixel_fired || tokenData.pixel_sent || false
            });
            
            // Log de sucesso
            eventLogData.status = 'success';
            eventLogData.fb_response = fbResult.response;
            await db.logEvent(eventLogData);
            
            console.log('🎉 Purchase enviado com sucesso via CAPI!');
            
            res.json({
                success: true,
                message: 'Evento Purchase enviado com sucesso',
                eventId,
                facebook_response: fbResult.response,
                tokenData: {
                    token: tokenData.token,
                    value: tokenData.value,
                    created_at: tokenData.created_at
                },
                processing_time: Date.now() - startTime
            });
            
        } catch (error) {
            console.error('❌ Erro ao enviar para Facebook CAPI:', error.message);
            
            // Log de erro
            eventLogData.error_message = error.message;
            eventLogData.retry_count = tokenData.event_attempts || 0;
            await db.logEvent(eventLogData);
            
            // Atualiza tentativas
            await db.updateTokenFlags(token, {
                last_event_attempt: new Date().toISOString(),
                event_attempts: (tokenData.event_attempts || 0) + 1
            });
            
            throw error;
        }
        
    } catch (error) {
        console.error('💥 Erro no processamento:', error.message);
        
        // Log de erro geral
        if (eventLogData.event_id) {
            eventLogData.error_message = error.message;
            await db.logEvent(eventLogData);
        }
        
        res.status(400).json({
            success: false,
            error: error.message,
            processing_time: Date.now() - startTime
        });
    }
});

// Endpoint de estatísticas
app.get('/api/stats', async (req, res) => {
    try {
        let stats = {
            cache_size: db.cache.size,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            database_type: db.pgPool ? 'postgresql' : 'sqlite'
        };
        
        // Busca estatísticas do banco
        if (db.pgPool) {
            const queries = await Promise.all([
                db.pgPool.query('SELECT COUNT(*) as total FROM tokens'),
                db.pgPool.query('SELECT COUNT(*) as pixel_sent FROM tokens WHERE pixel_sent = true'),
                db.pgPool.query('SELECT COUNT(*) as capi_sent FROM tokens WHERE capi_sent = true'),
                db.pgPool.query('SELECT COUNT(*) as recent FROM tokens WHERE created_at > NOW() - INTERVAL \'24 hours\''),
                db.pgPool.query('SELECT COUNT(*) as total_events FROM event_logs'),
                db.pgPool.query('SELECT COUNT(*) as success_events FROM event_logs WHERE status = \'success\'')
            ]);
            
            stats.tokens = {
                total: parseInt(queries[0].rows[0].total),
                pixel_sent: parseInt(queries[1].rows[0].pixel_sent),
                capi_sent: parseInt(queries[2].rows[0].capi_sent),
                last_24h: parseInt(queries[3].rows[0].recent)
            };
            
            stats.events = {
                total: parseInt(queries[4].rows[0].total_events),
                success: parseInt(queries[5].rows[0].success_events)
            };
        } else {
            const total = db.sqlite.prepare('SELECT COUNT(*) as count FROM tokens').get().count;
            const pixelSent = db.sqlite.prepare('SELECT COUNT(*) as count FROM tokens WHERE pixel_sent = 1').get().count;
            const capiSent = db.sqlite.prepare('SELECT COUNT(*) as count FROM tokens WHERE capi_sent = 1').get().count;
            const totalEvents = db.sqlite.prepare('SELECT COUNT(*) as count FROM event_logs').get().count;
            const successEvents = db.sqlite.prepare('SELECT COUNT(*) as count FROM event_logs WHERE status = "success"').get().count;
            
            stats.tokens = { total, pixel_sent: pixelSent, capi_sent: capiSent };
            stats.events = { total: totalEvents, success: successEvents };
        }
        
        stats.success_rate = stats.events.total > 0 ? 
            ((stats.events.success / stats.events.total) * 100).toFixed(2) + '%' : '0%';
        
        res.json({
            success: true,
            stats,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint para verificar token específico
app.post('/api/verify-token', async (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            return res.status(400).json({
                success: false,
                error: 'Token é obrigatório'
            });
        }
        
        const tokenData = await db.findTokenByToken(token);
        
        if (!tokenData) {
            return res.status(404).json({
                success: false,
                error: 'Token não encontrado'
            });
        }
        
        res.json({
            success: true,
            token: {
                id: tokenData.id,
                token: tokenData.token,
                value: tokenData.value,
                currency: tokenData.currency,
                status: tokenData.status,
                pixel_sent: tokenData.pixel_sent,
                capi_sent: tokenData.capi_sent,
                cron_sent: tokenData.cron_sent,
                created_at: tokenData.created_at
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Servir arquivos estáticos (incluindo obrigado.html)
app.use(express.static('.', {
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
    }
}));

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint não encontrado',
        path: req.path
    });
});

// Error handler global
app.use((error, req, res, next) => {
    console.error('💥 Erro não tratado:', error);
    
    res.status(500).json({
        success: false,
        error: CONFIG.NODE_ENV === 'production' ? 'Erro interno do servidor' : error.message,
        timestamp: new Date().toISOString()
    });
});

// ===================================================================
// INICIALIZAÇÃO DO SERVIDOR
// ===================================================================

async function startServer() {
    try {
        console.log('🚀 Iniciando Facebook Tracking Server v2.0...');
        console.log(`📊 Ambiente: ${CONFIG.NODE_ENV}`);
        console.log(`🔧 Pixel ID: ${CONFIG.FB_PIXEL_ID}`);
        console.log(`💾 Banco: ${CONFIG.DATABASE_URL ? 'PostgreSQL' : 'SQLite'}`);
        
        // Inicializa banco de dados
        await db.initialize();
        
        // Inicia servidor
        app.listen(CONFIG.PORT, () => {
            console.log(`✅ Servidor rodando na porta ${CONFIG.PORT}`);
            console.log(`🌐 URLs importantes:`);
            console.log(`   - Health: http://localhost:${CONFIG.PORT}/health`);
            console.log(`   - Stats: http://localhost:${CONFIG.PORT}/api/stats`);
            console.log(`   - Tracking: http://localhost:${CONFIG.PORT}/api/track-purchase`);
            console.log(`   - Obrigado: http://localhost:${CONFIG.PORT}/obrigado.html`);
            console.log('');
            console.log('🔥 Sistema pronto para receber eventos Purchase!');
        });
        
    } catch (error) {
        console.error('❌ Falha crítica na inicialização:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('📴 Desligando servidor...');
    if (db.pgPool) db.pgPool.end();
    if (db.sqlite) db.sqlite.close();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('📴 Interrompido pelo usuário...');
    if (db.pgPool) db.pgPool.end();
    if (db.sqlite) db.sqlite.close();
    process.exit(0);
});

// Inicialização
if (require.main === module) {
    startServer();
}

module.exports = { app, db, fbCAPI };
