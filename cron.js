// ===================================================================
// 🔥 FACEBOOK CAPI CRON FALLBACK SYSTEM
// Versão: 2.0 - Sistema de Fallback Automático para Eventos
// Executa a cada 5 minutos para reenviar eventos não processados
// ===================================================================

require('dotenv').config();
const { db, fbCAPI } = require('./server');

// Configurações do cron
const CRON_CONFIG = {
    INTERVAL_MINUTES: 5,
    MAX_RETRIES: 3,
    FALLBACK_DELAY_MINUTES: 5,
    BATCH_SIZE: 10,
    DEBUG: process.env.CRON_DEBUG === 'true' || false
};

class CronFallbackService {
    constructor() {
        this.isRunning = false;
        this.stats = {
            totalRuns: 0,
            tokensProcessed: 0,
            successfulEvents: 0,
            failedEvents: 0,
            lastRun: null
        };
    }
    
    log(message, data = null) {
        const timestamp = new Date().toISOString();
        console.log(`[CRON ${timestamp}] ${message}`);
        
        if (CRON_CONFIG.DEBUG && data) {
            console.log(JSON.stringify(data, null, 2));
        }
    }
    
    async findEligibleTokens() {
        const cutoffTime = new Date(Date.now() - (CRON_CONFIG.FALLBACK_DELAY_MINUTES * 60 * 1000));
        
        if (db.pgPool) {
            const result = await db.pgPool.query(`
                SELECT 
                    id, token, telegram_id, value, currency,
                    pixel_sent, capi_sent, cron_sent, event_attempts,
                    fbp, fbc, ip_address, user_agent, external_id,
                    created_at, event_id
                FROM tokens 
                WHERE status = 'valid'
                  AND created_at < $1
                  AND (
                    (pixel_sent = FALSE OR pixel_sent IS NULL) 
                    OR (capi_sent = FALSE OR capi_sent IS NULL)
                  )
                  AND (cron_sent = FALSE OR cron_sent IS NULL)
                  AND (event_attempts < $2 OR event_attempts IS NULL)
                  AND value IS NOT NULL
                  AND value > 0
                ORDER BY created_at ASC
                LIMIT $3
            `, [cutoffTime, CRON_CONFIG.MAX_RETRIES, CRON_CONFIG.BATCH_SIZE]);
            
            return result.rows;
        } else {
            const cutoffTimeStr = cutoffTime.toISOString();
            const query = `
                SELECT 
                    id, token, telegram_id, value, currency,
                    pixel_sent, capi_sent, cron_sent, event_attempts,
                    fbp, fbc, ip_address, user_agent, external_id,
                    created_at, event_id
                FROM tokens 
                WHERE status = 'valid'
                  AND created_at < ?
                  AND (
                    (pixel_sent = 0 OR pixel_sent IS NULL) 
                    OR (capi_sent = 0 OR capi_sent IS NULL)
                  )
                  AND (cron_sent = 0 OR cron_sent IS NULL)
                  AND (event_attempts < ? OR event_attempts IS NULL)
                  AND value IS NOT NULL
                  AND value > 0
                ORDER BY created_at ASC
                LIMIT ?
            `;
            
            return db.sqlite.prepare(query).all(cutoffTimeStr, CRON_CONFIG.MAX_RETRIES, CRON_CONFIG.BATCH_SIZE);
        }
    }
    
    generateEventId(token, attempt = 0) {
        const timestamp = Date.now().toString();
        const random = Math.random().toString(36).substr(2, 9);
        const suffix = attempt > 0 ? `_retry${attempt}` : '';
        const combined = `cron_${timestamp}_${random}_${token}${suffix}`;
        return btoa(combined).replace(/[^a-zA-Z0-9]/g, '').substr(0, 32);
    }
    
    async processToken(tokenData) {
        const { token, telegram_id, value, currency = 'BRL' } = tokenData;
        const attempt = (tokenData.event_attempts || 0) + 1;
        
        this.log(`Processando token ${token} (tentativa ${attempt}/${CRON_CONFIG.MAX_RETRIES})`);
        
        // Verifica se já existe event_id ou gera um novo
        const eventId = tokenData.event_id || this.generateEventId(token, attempt - 1);
        
        // Verifica deduplicação
        const dedupKey = `${eventId}_${tokenData.id}_Purchase_cron`;
        if (db.getFromCache(dedupKey)) {
            this.log(`Evento duplicado detectado para token ${token}, pulando...`);
            return { success: true, skipped: true, reason: 'duplicate' };
        }
        
        // Adiciona ao cache de deduplicação
        db.addToCache(dedupKey, { timestamp: Date.now(), token, source: 'cron' });
        
        // Prepara dados do evento
        const eventData = {
            event_name: 'Purchase',
            event_id: eventId,
            event_time: Math.floor(new Date(tokenData.created_at).getTime() / 1000),
            event_source_url: 'https://example.com/obrigado',
            
            // User data - usa os dados armazenados ou fallbacks
            client_ip_address: tokenData.ip_address,
            client_user_agent: tokenData.user_agent,
            fbp: tokenData.fbp,
            fbc: tokenData.fbc,
            external_id: tokenData.external_id || fbCAPI.hashData(token),
            
            // Purchase data
            value: parseFloat(value),
            currency: currency
        };
        
        const logData = {
            event_id: eventId,
            event_name: 'Purchase',
            source: 'cron',
            token: token,
            telegram_id: telegram_id,
            value: eventData.value,
            currency: eventData.currency,
            retry_count: attempt - 1,
            ip_address: tokenData.ip_address,
            user_agent: tokenData.user_agent,
            request_data: eventData
        };
        
        try {
            // Envia para Facebook CAPI
            const fbResult = await fbCAPI.sendEvent(eventData);
            
            // Atualiza flags no banco - evento enviado com sucesso
            await db.updateTokenFlags(token, {
                cron_sent: true,
                event_id: eventId,
                last_event_attempt: new Date().toISOString(),
                event_attempts: attempt,
                // Se não tinha CAPI nem Pixel, marca como enviado via cron
                capi_sent: tokenData.capi_sent || true,
                pixel_sent: tokenData.pixel_sent || false
            });
            
            // Log de sucesso
            logData.status = 'success';
            logData.fb_response = fbResult.response;
            await db.logEvent(logData);
            
            this.log(`✅ Purchase enviado com sucesso via CAPI (cron) para token ${token}`);
            this.stats.successfulEvents++;
            
            return { success: true, eventId, facebook_response: fbResult.response };
            
        } catch (error) {
            this.log(`❌ Erro ao enviar Purchase para token ${token}: ${error.message}`);
            
            // Log de erro
            logData.status = 'failed';
            logData.error_message = error.message;
            await db.logEvent(logData);
            
            // Atualiza tentativas (sem marcar como enviado)
            await db.updateTokenFlags(token, {
                last_event_attempt: new Date().toISOString(),
                event_attempts: attempt
            });
            
            // Se esgotou tentativas, marca como falhado definitivamente
            if (attempt >= CRON_CONFIG.MAX_RETRIES) {
                await db.updateTokenFlags(token, {
                    cron_sent: true, // Marca como processado mesmo que falhou
                    status: 'failed' // Opcional: marcar como falhado
                });
                this.log(`🚫 Token ${token} esgotou tentativas (${attempt}/${CRON_CONFIG.MAX_RETRIES})`);
            }
            
            this.stats.failedEvents++;
            return { success: false, error: error.message, attempts: attempt };
        }
    }
    
    async run() {
        if (this.isRunning) {
            this.log('Cron já está executando, pulando...');
            return;
        }
        
        this.isRunning = true;
        this.stats.totalRuns++;
        this.stats.lastRun = new Date();
        
        try {
            this.log('🚀 Iniciando execução do cron fallback');
            
            // Aguarda inicialização do banco se necessário
            if (!db.initialized) {
                this.log('Aguardando inicialização do banco de dados...');
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                if (!db.initialized) {
                    throw new Error('Banco de dados não inicializado');
                }
            }
            
            // Busca tokens elegíveis
            const eligibleTokens = await this.findEligibleTokens();
            
            if (eligibleTokens.length === 0) {
                this.log('Nenhum token elegível para fallback encontrado');
                return;
            }
            
            this.log(`Encontrados ${eligibleTokens.length} tokens para processamento`);
            
            // Processa tokens em lote
            const results = [];
            for (const tokenData of eligibleTokens) {
                try {
                    const result = await this.processToken(tokenData);
                    results.push(result);
                    this.stats.tokensProcessed++;
                    
                    // Pequeno delay entre processamentos para não sobrecarregar a API
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                } catch (error) {
                    this.log(`Erro inesperado ao processar token ${tokenData.token}: ${error.message}`);
                    results.push({ 
                        success: false, 
                        error: error.message, 
                        token: tokenData.token 
                    });
                }
            }
            
            // Resumo da execução
            const successful = results.filter(r => r.success).length;
            const failed = results.filter(r => !r.success).length;
            const skipped = results.filter(r => r.skipped).length;
            
            this.log(`📊 Execução concluída: ${successful} sucessos, ${failed} falhas, ${skipped} pulados`);
            
            return {
                success: true,
                processed: eligibleTokens.length,
                successful,
                failed,
                skipped,
                results
            };
            
        } catch (error) {
            this.log(`💥 Erro crítico no cron: ${error.message}`, error);
            return { success: false, error: error.message };
        } finally {
            this.isRunning = false;
        }
    }
    
    getStats() {
        return {
            ...this.stats,
            isRunning: this.isRunning,
            nextRun: this.stats.lastRun ? 
                new Date(this.stats.lastRun.getTime() + (CRON_CONFIG.INTERVAL_MINUTES * 60 * 1000)) : 
                null,
            config: CRON_CONFIG
        };
    }
    
    start() {
        this.log('🕒 Iniciando cron fallback service');
        this.log(`Configuração: intervalo ${CRON_CONFIG.INTERVAL_MINUTES}min, max retries ${CRON_CONFIG.MAX_RETRIES}, delay ${CRON_CONFIG.FALLBACK_DELAY_MINUTES}min`);
        
        // Execução imediata
        this.run().catch(error => {
            this.log(`Erro na execução inicial: ${error.message}`);
        });
        
        // Agenda execuções periódicas
        setInterval(() => {
            this.run().catch(error => {
                this.log(`Erro na execução periódica: ${error.message}`);
            });
        }, CRON_CONFIG.INTERVAL_MINUTES * 60 * 1000);
        
        this.log(`✅ Cron fallback service iniciado (executa a cada ${CRON_CONFIG.INTERVAL_MINUTES} minutos)`);
    }
}

// Instância global do serviço
const cronService = new CronFallbackService();

// Função para execução manual
async function runFallbackManually() {
    console.log('🚀 Executando fallback manualmente...');
    const result = await cronService.run();
    console.log('📊 Resultado:', JSON.stringify(result, null, 2));
    return result;
}

// Se executado diretamente (não importado)
if (require.main === module) {
    console.log('🔥 Iniciando Facebook CAPI Cron Fallback System...');
    
    // Aguarda um pouco para o servidor principal inicializar
    setTimeout(() => {
        cronService.start();
    }, 10000); // 10 segundos
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
        console.log('📴 Encerrando cron service...');
        process.exit(0);
    });
    
    process.on('SIGINT', () => {
        console.log('📴 Interrompido pelo usuário...');
        process.exit(0);
    });
    
    // Keep alive
    process.on('uncaughtException', (error) => {
        console.error('💥 Erro não capturado no cron:', error);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
        console.error('💥 Rejeição não tratada no cron:', reason);
    });
}

module.exports = {
    CronFallbackService,
    cronService,
    runFallbackManually,
    CRON_CONFIG
};