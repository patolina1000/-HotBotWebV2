// services/sessionMatching.js - Funções para matching de sessões baseado em similaridade

/**
 * Calcula a similaridade entre duas sessões baseado em múltiplos fatores
 * @param {Object} incoming - Dados da sessão atual (vindos do obrigado.js)
 * @param {Object} stored - Dados da sessão armazenada (vindos do redirect.js)
 * @returns {Object} - { score, details }
 */
function calculateSimilarity(incoming, stored) {
    const maxPoints = {
        thumbmark_id: 40,        // 40 pontos
        canvas_hash: 20,         // 20 pontos
        hardware_concurrency: 15, // 15 pontos
        screen_resolution: 10,   // 10 pontos (5 se apenas aspecto igual)
        ip: 15                   // 15 pontos (7.5 se mesma subnet)
    };

    let totalScore = 0;
    let maxPossibleScore = 0;
    const scores = {};
    const details = {};

    // Thumbmark ID comparison (exact match = 40 pontos)
    if (incoming.thumbmark_id && stored.thumbmark_id) {
        maxPossibleScore += maxPoints.thumbmark_id;
        if (incoming.thumbmark_id === stored.thumbmark_id) {
            scores.thumbmark_id = maxPoints.thumbmark_id;
            totalScore += maxPoints.thumbmark_id;
            details.thumbmark_id = 'exact_match';
        } else {
            scores.thumbmark_id = 0;
            details.thumbmark_id = 'no_match';
        }
    } else {
        details.thumbmark_id = 'missing_data';
    }

    // Canvas hash comparison (exact match = 20 pontos)
    if (incoming.canvas_hash && stored.canvas_hash) {
        maxPossibleScore += maxPoints.canvas_hash;
        if (incoming.canvas_hash === stored.canvas_hash) {
            scores.canvas_hash = maxPoints.canvas_hash;
            totalScore += maxPoints.canvas_hash;
            details.canvas_hash = 'exact_match';
        } else {
            scores.canvas_hash = 0;
            details.canvas_hash = 'no_match';
        }
    } else {
        details.canvas_hash = 'missing_data';
    }

    // Hardware concurrency comparison (exact match = 15 pontos)
    if (incoming.hardware_concurrency && stored.hardware_concurrency) {
        maxPossibleScore += maxPoints.hardware_concurrency;
        if (String(incoming.hardware_concurrency) === String(stored.hardware_concurrency)) {
            scores.hardware_concurrency = maxPoints.hardware_concurrency;
            totalScore += maxPoints.hardware_concurrency;
            details.hardware_concurrency = 'exact_match';
        } else {
            scores.hardware_concurrency = 0;
            details.hardware_concurrency = 'no_match';
        }
    } else {
        details.hardware_concurrency = 'missing_data';
    }

    // Screen resolution comparison (exact = 10 pontos, aspecto igual = 5 pontos)
    if (incoming.screen_resolution && stored.screen_resolution) {
        maxPossibleScore += maxPoints.screen_resolution;
        if (incoming.screen_resolution === stored.screen_resolution) {
            scores.screen_resolution = maxPoints.screen_resolution;
            totalScore += maxPoints.screen_resolution;
            details.screen_resolution = 'exact_match';
        } else {
            // Verificar se pelo menos o aspecto é igual (largura/altura)
            const aspectMatch = checkAspectRatio(incoming.screen_resolution, stored.screen_resolution);
            if (aspectMatch) {
                scores.screen_resolution = maxPoints.screen_resolution / 2; // 5 pontos
                totalScore += maxPoints.screen_resolution / 2;
                details.screen_resolution = 'aspect_match';
            } else {
                scores.screen_resolution = 0;
                details.screen_resolution = 'no_match';
            }
        }
    } else {
        details.screen_resolution = 'missing_data';
    }

    // IP comparison (exact = 15 pontos, mesma subnet = 7.5 pontos)
    if (incoming.ip && stored.ip) {
        maxPossibleScore += maxPoints.ip;
        if (incoming.ip === stored.ip) {
            scores.ip = maxPoints.ip;
            totalScore += maxPoints.ip;
            details.ip = 'exact_match';
        } else if (isSameSubnet(incoming.ip, stored.ip)) {
            scores.ip = maxPoints.ip / 2; // 7.5 pontos
            totalScore += maxPoints.ip / 2;
            details.ip = 'subnet_match';
        } else {
            scores.ip = 0;
            details.ip = 'no_match';
        }
    } else {
        details.ip = 'missing_data';
    }

    // Calcular score final (normalizado para 0-100)
    const finalScore = maxPossibleScore > 0 ? (totalScore / maxPossibleScore) * 100 : 0;

    // Log interno para debug
    console.log(`🔢 [CALCULATE-SIMILARITY] Score calculado: ${Math.round(finalScore * 100) / 100}% (${totalScore}/${maxPossibleScore} pontos)`);
    console.log(`🔍 [CALCULATE-SIMILARITY] Detalhes:`, {
        thumbmark_id: `${scores.thumbmark_id || 0}/${maxPoints.thumbmark_id} (${details.thumbmark_id})`,
        canvas_hash: `${scores.canvas_hash || 0}/${maxPoints.canvas_hash} (${details.canvas_hash})`,
        hardware_concurrency: `${scores.hardware_concurrency || 0}/${maxPoints.hardware_concurrency} (${details.hardware_concurrency})`,
        screen_resolution: `${scores.screen_resolution || 0}/${maxPoints.screen_resolution} (${details.screen_resolution})`,
        ip: `${scores.ip || 0}/${maxPoints.ip} (${details.ip})`
    });

    return {
        score: Math.round(finalScore * 100) / 100, // Round to 2 decimal places
        details: {
            scores,
            maxPoints,
            totalScore,
            maxPossibleScore,
            breakdown: details,
            threshold: 65
        }
    };
}

/**
 * Verifica se duas resoluções de tela têm o mesmo aspecto (proporção)
 * @param {string} res1 - Primeira resolução (ex: "1920x1080")
 * @param {string} res2 - Segunda resolução (ex: "1366x768")
 * @returns {boolean} - True se têm o mesmo aspecto
 */
function checkAspectRatio(res1, res2) {
    try {
        const [w1, h1] = res1.split('x').map(Number);
        const [w2, h2] = res2.split('x').map(Number);
        
        if (!w1 || !h1 || !w2 || !h2) return false;
        
        // Calcular aspectos com mais precisão e tolerância
        const aspect1 = w1 / h1;
        const aspect2 = w2 / h2;
        
        // Usar tolerância para comparar aspectos (diferença < 0.01)
        const tolerance = 0.01;
        return Math.abs(aspect1 - aspect2) < tolerance;
    } catch (error) {
        console.warn('⚠️ [SESSION-MATCHING] Erro ao comparar aspectos de tela:', error.message);
        return false;
    }
}

/**
 * Verifica se dois IPs estão na mesma subnet (primeiros 3 octetos)
 * Recebe dois IPs (IPv4) e retorna true se os três primeiros octetos forem iguais
 * Se não conseguir validar (IPv6 ou inválido), retorna false
 * @param {string} ip1 - Primeiro IP
 * @param {string} ip2 - Segundo IP
 * @returns {boolean}
 */
function isSameSubnet(ip1, ip2) {
    try {
        // Verificar se são IPs válidos (IPv4)
        if (!ip1 || !ip2 || typeof ip1 !== 'string' || typeof ip2 !== 'string') {
            return false;
        }
        
        const octets1 = ip1.split('.');
        const octets2 = ip2.split('.');
        
        // Verificar se são IPv4 válidos (4 octetos)
        if (octets1.length !== 4 || octets2.length !== 4) {
            return false;
        }
        
        // Verificar se todos os octetos são números válidos
        for (let i = 0; i < 4; i++) {
            const oct1 = parseInt(octets1[i]);
            const oct2 = parseInt(octets2[i]);
            if (isNaN(oct1) || isNaN(oct2) || oct1 < 0 || oct1 > 255 || oct2 < 0 || oct2 > 255) {
                return false;
            }
        }
        
        // Comparar os três primeiros octetos (exemplo: 192.168.1.x)
        return octets1[0] === octets2[0] && 
               octets1[1] === octets2[1] && 
               octets1[2] === octets2[2];
    } catch (error) {
        console.warn('⚠️ [SESSION-MATCHING] Erro ao comparar IPs:', error.message);
        return false;
    }
}

/**
 * Encontra a melhor sessão correspondente baseada em similaridade
 * @param {Object} incomingSession - Sessão atual
 * @param {Array} storedSessions - Array de sessões armazenadas
 * @param {number} threshold - Threshold mínimo para considerar match (default: 65)
 * @returns {Object|null} - Melhor match ou null se não encontrar
 */
function findBestMatch(incomingSession, storedSessions, threshold = 65) {
    if (!storedSessions || storedSessions.length === 0) {
        return null;
    }

    let bestMatch = null;
    let bestScore = 0;
    let allComparisons = [];

    for (const stored of storedSessions) {
        const similarity = calculateSimilarity(incomingSession, stored.data);
        
        allComparisons.push({
            sessionKey: stored.key,
            score: similarity.score,
            details: similarity.details
        });

        if (similarity.score >= threshold && similarity.score > bestScore) {
            bestMatch = {
                session: stored,
                similarity: similarity,
                score: similarity.score
            };
            bestScore = similarity.score;
        }
    }

    // Log detailed comparison results for debugging
    console.log('🔍 [SESSION-MATCHING] Comparações realizadas:');
    allComparisons.forEach((comp, index) => {
        console.log(`   ${index + 1}. Score: ${comp.score}% (${comp.score >= threshold ? '✅ MATCH' : '❌ NO MATCH'})`);
        console.log(`      Detalhes:`, comp.details.scores);
    });

    if (bestMatch) {
        console.log(`✅ [SESSION-MATCHING] Melhor match encontrado com score: ${bestMatch.score}%`);
    } else {
        console.log(`❌ [SESSION-MATCHING] Nenhum match encontrado acima do threshold de ${threshold}%`);
    }

    return bestMatch;
}

/**
 * Gera uma chave única para a sessão
 * @param {string} thumbmark_id - ID do thumbmark
 * @param {number} timestamp - Timestamp da sessão
 * @returns {string} - Chave única
 */
function generateSessionKey(thumbmark_id, timestamp) {
    const sessionId = thumbmark_id || 'unknown';
    const time = timestamp || Date.now();
    return `session:${sessionId}:${time}`;
}

/**
 * Normaliza dados de sessão para consistência
 * @param {Object} sessionData - Dados brutos da sessão
 * @returns {Object} - Dados normalizados
 */
function normalizeSessionData(sessionData) {
    return {
        thumbmark_id: sessionData.thumbmark_id || null,
        utms: sessionData.utms || {},
        fbclid: sessionData.fbclid || null,
        ip: sessionData.ip || null,
        screen_resolution: sessionData.screen_resolution || null,
        hardware_concurrency: String(sessionData.hardware_concurrency || 'unknown'),
        canvas_hash: sessionData.canvas_hash || null,
        user_agent: sessionData.user_agent || null,
        timestamp: sessionData.timestamp || Date.now()
    };
}

/**
 * Valida se os dados de sessão são suficientes para matching
 * @param {Object} sessionData - Dados da sessão
 * @returns {boolean} - True se válidos
 */
function validateSessionData(sessionData) {
    // Pelo menos thumbmark_id OU canvas_hash devem estar presentes
    const hasThumbmark = sessionData.thumbmark_id && sessionData.thumbmark_id !== 'unknown';
    const hasCanvas = sessionData.canvas_hash && sessionData.canvas_hash !== 'canvas_unavailable';
    
    return hasThumbmark || hasCanvas;
}

module.exports = {
    calculateSimilarity,
    isSameSubnet,
    checkAspectRatio,
    findBestMatch,
    generateSessionKey,
    normalizeSessionData,
    validateSessionData
};
