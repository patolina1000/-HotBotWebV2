// services/sessionStorage.js - Serviço para gerenciar sessões com Redis e Postgres fallback

const redis = require('redis');
const { Pool } = require('pg');

class SessionStorage {
    constructor() {
        this.redisClient = null;
        this.pgPool = null;
        this.useRedis = false;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        console.log('🔄 [SESSION-STORAGE] Inicializando sistema de armazenamento de sessões...');

        // Tentar conectar no Redis primeiro
        try {
            const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
            console.log('🔄 [SESSION-STORAGE] Tentando conectar no Redis...');
            
            this.redisClient = redis.createClient({
                url: redisUrl,
                socket: {
                    connectTimeout: 5000,
                    lazyConnect: true
                },
                retry_strategy: (options) => {
                    if (options.error && options.error.code === 'ECONNREFUSED') {
                        console.log('❌ [SESSION-STORAGE] Redis connection refused');
                        return false; // Don't retry
                    }
                    if (options.total_retry_time > 10000) {
                        console.log('❌ [SESSION-STORAGE] Redis retry time exhausted');
                        return false; // Don't retry
                    }
                    return Math.min(options.attempt * 100, 3000);
                }
            });

            this.redisClient.on('error', (err) => {
                console.log('⚠️ [SESSION-STORAGE] Redis error:', err.message);
                this.useRedis = false;
            });

            this.redisClient.on('connect', () => {
                console.log('✅ [SESSION-STORAGE] Redis conectado com sucesso!');
                this.useRedis = true;
            });

            await this.redisClient.connect();
            
            // Test Redis connection
            await this.redisClient.ping();
            this.useRedis = true;
            console.log('✅ [SESSION-STORAGE] Redis funcionando perfeitamente!');
            
        } catch (error) {
            console.log('⚠️ [SESSION-STORAGE] Falha ao conectar no Redis:', error.message);
            console.log('🔄 [SESSION-STORAGE] Usando Postgres como fallback...');
            this.useRedis = false;
        }

        // Configurar Postgres (sempre como fallback)
        try {
            this.pgPool = new Pool({
                connectionString: process.env.DATABASE_URL,
                ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
                max: 5,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 5000,
            });

            // Test Postgres connection
            const client = await this.pgPool.connect();
            await client.query('SELECT NOW()');
            client.release();
            
            console.log('✅ [SESSION-STORAGE] Postgres conectado e funcionando!');
            
            // Create sessions table if it doesn't exist
            await this.createSessionsTable();
            
        } catch (error) {
            console.error('❌ [SESSION-STORAGE] Falha crítica ao conectar no Postgres:', error.message);
            throw error;
        }

        this.initialized = true;
        console.log(`✅ [SESSION-STORAGE] Sistema inicializado usando: ${this.useRedis ? 'Redis (principal)' : 'Postgres (fallback)'}`);
    }

    async createSessionsTable() {
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS sessions (
                id SERIAL PRIMARY KEY,
                thumbmark_id TEXT,
                utms JSONB,
                fbclid TEXT,
                ip INET,
                screen_resolution TEXT,
                hardware_concurrency TEXT,
                canvas_hash TEXT,
                user_agent TEXT,
                timestamp BIGINT,
                expires_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
            
            CREATE INDEX IF NOT EXISTS idx_sessions_thumbmark_timestamp 
            ON sessions(thumbmark_id, timestamp DESC);
            
            CREATE INDEX IF NOT EXISTS idx_sessions_expires_at 
            ON sessions(expires_at);
        `;

        try {
            const client = await this.pgPool.connect();
            await client.query(createTableQuery);
            client.release();
            console.log('✅ [SESSION-STORAGE] Tabela sessions criada/verificada no Postgres');
        } catch (error) {
            console.error('❌ [SESSION-STORAGE] Erro ao criar tabela sessions:', error.message);
            throw error;
        }
    }

    async saveSession(sessionKey, data, ttlSeconds = 172800) { // 48h default
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            if (this.useRedis && this.redisClient?.isOpen) {
                // Save to Redis
                await this.redisClient.set(sessionKey, JSON.stringify(data), {
                    EX: ttlSeconds
                });
                console.log(`✅ [SESSION-STORAGE] Sessão salva no Redis: ${sessionKey}`);
                return true;
            } else {
                // Save to Postgres
                const expiresAt = new Date(Date.now() + (ttlSeconds * 1000));
                const client = await this.pgPool.connect();
                
                const insertQuery = `
                    INSERT INTO sessions (
                        thumbmark_id, utms, fbclid, ip, screen_resolution, 
                        hardware_concurrency, canvas_hash, user_agent, timestamp, expires_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                `;
                
                await client.query(insertQuery, [
                    data.thumbmark_id,
                    JSON.stringify(data.utms),
                    data.fbclid,
                    data.ip,
                    data.screen_resolution,
                    data.hardware_concurrency,
                    data.canvas_hash,
                    data.user_agent,
                    data.timestamp,
                    expiresAt
                ]);
                
                client.release();
                console.log(`✅ [SESSION-STORAGE] Sessão salva no Postgres: ${sessionKey}`);
                return true;
            }
        } catch (error) {
            console.error('❌ [SESSION-STORAGE] Erro ao salvar sessão:', error.message);
            return false;
        }
    }

    async getRecentSessions(limit = 100) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            if (this.useRedis && this.redisClient?.isOpen) {
                // Get from Redis - scan for session keys
                const sessions = [];
                let cursor = 0;
                let count = 0;
                
                do {
                    const result = await this.redisClient.scan(cursor, {
                        MATCH: 'session:*',
                        COUNT: 100
                    });
                    cursor = result.cursor;
                    
                    for (const key of result.keys) {
                        if (count >= limit) break;
                        
                        const data = await this.redisClient.get(key);
                        if (data) {
                            sessions.push({
                                key,
                                data: JSON.parse(data)
                            });
                            count++;
                        }
                    }
                } while (cursor !== 0 && count < limit);
                
                console.log(`✅ [SESSION-STORAGE] ${sessions.length} sessões recuperadas do Redis`);
                return sessions;
                
            } else {
                // Get from Postgres
                const client = await this.pgPool.connect();
                
                const selectQuery = `
                    SELECT * FROM sessions 
                    WHERE expires_at > NOW() 
                    ORDER BY timestamp DESC 
                    LIMIT $1
                `;
                
                const result = await client.query(selectQuery, [limit]);
                client.release();
                
                const sessions = result.rows.map(row => ({
                    key: `session:${row.thumbmark_id}:${row.timestamp}`,
                    data: {
                        thumbmark_id: row.thumbmark_id,
                        utms: row.utms,
                        fbclid: row.fbclid,
                        ip: row.ip,
                        screen_resolution: row.screen_resolution,
                        hardware_concurrency: row.hardware_concurrency,
                        canvas_hash: row.canvas_hash,
                        user_agent: row.user_agent,
                        timestamp: row.timestamp
                    }
                }));
                
                console.log(`✅ [SESSION-STORAGE] ${sessions.length} sessões recuperadas do Postgres`);
                return sessions;
            }
        } catch (error) {
            console.error('❌ [SESSION-STORAGE] Erro ao recuperar sessões:', error.message);
            return [];
        }
    }

    async cleanupExpiredSessions() {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            if (!this.useRedis || !this.redisClient?.isOpen) {
                // Cleanup Postgres only (Redis handles TTL automatically)
                const client = await this.pgPool.connect();
                
                const deleteQuery = 'DELETE FROM sessions WHERE expires_at < NOW()';
                const result = await client.query(deleteQuery);
                
                client.release();
                console.log(`🧹 [SESSION-STORAGE] ${result.rowCount} sessões expiradas removidas do Postgres`);
            }
        } catch (error) {
            console.error('❌ [SESSION-STORAGE] Erro ao limpar sessões expiradas:', error.message);
        }
    }

    getStorageType() {
        return this.useRedis ? 'Redis' : 'Postgres';
    }

    async close() {
        try {
            if (this.redisClient?.isOpen) {
                await this.redisClient.quit();
            }
            if (this.pgPool) {
                await this.pgPool.end();
            }
            console.log('✅ [SESSION-STORAGE] Conexões fechadas');
        } catch (error) {
            console.error('❌ [SESSION-STORAGE] Erro ao fechar conexões:', error.message);
        }
    }
}

// Singleton instance
const sessionStorage = new SessionStorage();

module.exports = sessionStorage;
