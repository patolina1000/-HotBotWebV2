const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendFacebookEvent } = require('./facebook');
const { enviarConversaoParaUtmify } = require('./utmify');

/**
 * 🔐 SISTEMA DE TRACKING INVISÍVEL
 * Gerencia tokens JWT seguros para continuidade de dados entre módulos
 */

class InvisibleTrackingService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET;
    this.tokenTTL = 300; // 5 minutos
    
    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET não configurado para tracking invisível');
    }
  }

  /**
   * Gerar external_id_hash anônimo baseado em fingerprint
   */
  generateExternalIdHash(ip, userAgent, fbp) {
    const fingerprint = `${ip || 'unknown'}_${userAgent || 'unknown'}_${fbp || Date.now()}`;
    return crypto.createHash('sha256').update(fingerprint).digest('hex').substring(0, 32);
  }

  /**
   * Extrair IP real da requisição
   */
  extractRealIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded ? forwarded.split(',')[0].trim() : req.connection.remoteAddress || req.ip;
    
    // Filtrar IPs locais
    if (ip === '::1' || ip === '127.0.0.1' || ip === 'localhost') {
      return null;
    }
    
    return ip;
  }

  /**
   * Extrair cookies Facebook da requisição
   */
  extractFacebookCookies(req) {
    const cookies = req.headers.cookie;
    let fbp = null;
    let fbc = null;

    if (cookies) {
      const fbpMatch = cookies.match(/_fbp=([^;]+)/);
      const fbcMatch = cookies.match(/_fbc=([^;]+)/);
      
      fbp = fbpMatch ? decodeURIComponent(fbpMatch[1]) : null;
      fbc = fbcMatch ? decodeURIComponent(fbcMatch[1]) : null;
    }

    return { fbp, fbc };
  }

  /**
   * Processar UTM no formato nome|id
   */
  processUTMParameter(utmValue) {
    if (!utmValue) return { raw: null, name: null, id: null };
    
    try {
      const decoded = decodeURIComponent(utmValue);
      const parts = decoded.split('|');
      
      if (parts.length >= 2) {
        const name = parts[0].trim();
        const id = parts[1].trim();
        
        if (name && id && /^\d+$/.test(id)) {
          return { raw: decoded, name, id };
        }
      }
      
      return { raw: decoded, name: decoded, id: null };
    } catch (error) {
      console.error('Erro ao processar UTM:', error);
      return { raw: utmValue, name: utmValue, id: null };
    }
  }

  /**
   * 🎯 CRIAR TRACKING TOKEN
   * Gera JWT assinado com todos os dados de tracking
   */
  async createTrackingToken(req) {
    try {
      // Extrair dados da requisição
      const ip = this.extractRealIP(req);
      const userAgent = req.headers['user-agent'] || null;
      const { fbp, fbc } = this.extractFacebookCookies(req);

      // Extrair UTMs da query string
      const utmSource = this.processUTMParameter(req.query.utm_source);
      const utmMedium = this.processUTMParameter(req.query.utm_medium);
      const utmCampaign = this.processUTMParameter(req.query.utm_campaign);
      const utmTerm = this.processUTMParameter(req.query.utm_term);
      const utmContent = this.processUTMParameter(req.query.utm_content);

      // Gerar external_id_hash anônimo
      const externalIdHash = this.generateExternalIdHash(ip, userAgent, fbp);

      // Timestamp de criação
      const createdAt = Math.floor(Date.now() / 1000);
      const expiresAt = createdAt + this.tokenTTL;

      // Payload do JWT
      const payload = {
        // UTM Parameters processados
        utm_source: utmSource.raw,
        utm_source_name: utmSource.name,
        utm_source_id: utmSource.id,
        
        utm_medium: utmMedium.raw,
        utm_medium_name: utmMedium.name,
        utm_medium_id: utmMedium.id,
        
        utm_campaign: utmCampaign.raw,
        utm_campaign_name: utmCampaign.name,
        utm_campaign_id: utmCampaign.id,
        
        utm_term: utmTerm.raw,
        utm_term_name: utmTerm.name,
        utm_term_id: utmTerm.id,
        
        utm_content: utmContent.raw,
        utm_content_name: utmContent.name,
        utm_content_id: utmContent.id,

        // Facebook tracking
        fbp: fbp,
        fbc: fbc,

        // Device/Session data
        ip: ip,
        user_agent: userAgent,
        external_id_hash: externalIdHash,

        // Metadata
        created_at: createdAt,
        expires_at: expiresAt,
        version: '1.0'
      };

      // Gerar JWT assinado
      const token = jwt.sign(payload, this.jwtSecret, {
        expiresIn: this.tokenTTL,
        issuer: 'invisible-tracking',
        audience: 'privacy-checkout'
      });

      console.log('🔐 Tracking token criado:', {
        external_id_hash: externalIdHash,
        has_fbp: !!fbp,
        has_fbc: !!fbc,
        has_ip: !!ip,
        utm_source: utmSource.name,
        utm_campaign: utmCampaign.name,
        expires_in: this.tokenTTL
      });

      return {
        success: true,
        token: token,
        metadata: {
          external_id_hash: externalIdHash,
          created_at: createdAt,
          expires_at: expiresAt,
          has_facebook_data: !!(fbp || fbc),
          has_utm_data: !!(utmSource.raw || utmCampaign.raw)
        }
      };

    } catch (error) {
      console.error('❌ Erro ao criar tracking token:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 🔓 DECODIFICAR TRACKING TOKEN
   * Valida e decodifica JWT para recuperar dados de tracking
   */
  async decodeTrackingToken(token) {
    try {
      if (!token) {
        throw new Error('Token não fornecido');
      }

      // Verificar e decodificar JWT
      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: 'invisible-tracking',
        audience: 'privacy-checkout'
      });

      // Verificar expiração manual (dupla verificação)
      const now = Math.floor(Date.now() / 1000);
      if (decoded.expires_at && now > decoded.expires_at) {
        throw new Error('Token expirado');
      }

      console.log('🔓 Tracking token decodificado:', {
        external_id_hash: decoded.external_id_hash,
        has_fbp: !!decoded.fbp,
        has_fbc: !!decoded.fbc,
        utm_source: decoded.utm_source_name,
        utm_campaign: decoded.utm_campaign_name,
        age_seconds: now - decoded.created_at
      });

      return {
        success: true,
        data: decoded
      };

    } catch (error) {
      console.error('❌ Erro ao decodificar tracking token:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 🎯 DISPARAR EVENTO ADDTOCART INVISÍVEL
   * Envia evento via Facebook Pixel + CAPI com deduplicação
   */
  async triggerAddToCartEvent(trackingData, eventValue = 19.90, pool = null) {
    try {
      const eventId = `atc_${trackingData.external_id_hash}_${Date.now()}`;
      
      // Dados do evento
      const eventData = {
        event_name: 'AddToCart',
        event_id: eventId,
        event_time: Math.floor(Date.now() / 1000),
        value: eventValue,
        currency: 'BRL',
        content_type: 'product',
        content_name: 'Privacy Checkout',
        content_category: 'Subscription',
        
        // User data do tracking token
        fbp: trackingData.fbp,
        fbc: trackingData.fbc,
        client_ip_address: trackingData.ip,
        client_user_agent: trackingData.user_agent,
        external_id: trackingData.external_id_hash,
        
        // Source
        source: 'invisible_tracking'
      };

      console.log('🎯 Disparando AddToCart invisível:', {
        event_id: eventId,
        value: eventValue,
        external_id_hash: trackingData.external_id_hash.substring(0, 8) + '...',
        has_fbp: !!trackingData.fbp,
        has_fbc: !!trackingData.fbc
      });

      // Enviar via Facebook CAPI
      const result = await sendFacebookEvent(eventData);

      return {
        success: result.success,
        event_id: eventId,
        facebook_result: result
      };

    } catch (error) {
      console.error('❌ Erro ao disparar AddToCart invisível:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 🎯 DISPARAR EVENTO PURCHASE INVISÍVEL
   * Envia evento via Facebook CAPI + UTMify com retry automático
   */
  async triggerPurchaseEvent(trackingData, purchaseData, pool = null) {
    try {
      const { valor, payerName, transactionId, nomeOferta } = purchaseData;
      const eventId = transactionId || `purchase_${trackingData.external_id_hash}_${Date.now()}`;
      
      console.log('🎯 Disparando Purchase invisível:', {
        event_id: eventId,
        valor: valor,
        payer: payerName,
        external_id_hash: trackingData.external_id_hash.substring(0, 8) + '...'
      });

      // 1. Enviar para Facebook CAPI
      const facebookResult = await this.sendFacebookPurchaseWithRetry({
        event_name: 'Purchase',
        event_id: eventId,
        event_time: Math.floor(Date.now() / 1000),
        value: valor,
        currency: 'BRL',
        
        // User data do tracking token
        fbp: trackingData.fbp,
        fbc: trackingData.fbc,
        client_ip_address: trackingData.ip,
        client_user_agent: trackingData.user_agent,
        external_id: trackingData.external_id_hash,
        
        // Source
        source: 'invisible_tracking',
        pool: pool,
        token: eventId
      });

      // 2. Enviar para UTMify
      const utmifyResult = await this.sendUTMifyPurchaseWithRetry({
        payer_name: payerName,
        telegram_id: trackingData.external_id_hash, // Usar external_id como identificador
        transactionValueCents: Math.round(valor * 100),
        orderId: eventId,
        nomeOferta: nomeOferta || 'Privacy Subscription',
        trackingData: {
          utm_source: trackingData.utm_source,
          utm_medium: trackingData.utm_medium,
          utm_campaign: trackingData.utm_campaign,
          utm_term: trackingData.utm_term,
          utm_content: trackingData.utm_content
        }
      });

      return {
        success: facebookResult.success && utmifyResult.success,
        event_id: eventId,
        facebook_result: facebookResult,
        utmify_result: utmifyResult
      };

    } catch (error) {
      console.error('❌ Erro ao disparar Purchase invisível:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 🔄 FACEBOOK CAPI COM RETRY
   */
  async sendFacebookPurchaseWithRetry(eventData, maxRetries = 3) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📤 Facebook CAPI - Tentativa ${attempt}/${maxRetries}`);
        
        const result = await sendFacebookEvent(eventData);
        
        if (result.success) {
          console.log('✅ Facebook CAPI enviado com sucesso');
          return result;
        }
        
        lastError = result.error;
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`⏳ Aguardando ${delay}ms antes da próxima tentativa...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
      } catch (error) {
        lastError = error.message;
        console.error(`❌ Facebook CAPI - Tentativa ${attempt} falhou:`, error.message);
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    return {
      success: false,
      error: `Todas as ${maxRetries} tentativas falharam. Último erro: ${lastError}`
    };
  }

  /**
   * 🔄 UTMIFY COM RETRY
   */
  async sendUTMifyPurchaseWithRetry(purchaseData, maxRetries = 3) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📤 UTMify - Tentativa ${attempt}/${maxRetries}`);
        
        const result = await enviarConversaoParaUtmify(purchaseData);
        
        console.log('✅ UTMify enviado com sucesso');
        return { success: true, data: result };
        
      } catch (error) {
        lastError = error.message;
        console.error(`❌ UTMify - Tentativa ${attempt} falhou:`, error.message);
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`⏳ Aguardando ${delay}ms antes da próxima tentativa...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    return {
      success: false,
      error: `Todas as ${maxRetries} tentativas falharam. Último erro: ${lastError}`
    };
  }

  /**
   * 💾 SALVAR TRACKING NO BANCO
   * Grava dados de tracking no PostgreSQL com deduplicação
   */
  async saveTrackingToDatabase(trackingData, transactionData, pool) {
    if (!pool) {
      console.warn('⚠️ Pool de conexão não fornecido - dados não serão salvos');
      return { success: false, error: 'Pool não disponível' };
    }

    try {
      const query = `
        INSERT INTO invisible_tracking (
          external_id_hash,
          transaction_id,
          utm_source,
          utm_medium,
          utm_campaign,
          utm_term,
          utm_content,
          fbp,
          fbc,
          ip,
          user_agent,
          valor,
          payer_name,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
        ON CONFLICT (transaction_id) DO UPDATE SET
          updated_at = NOW()
        RETURNING id
      `;

      const values = [
        trackingData.external_id_hash,
        transactionData.transactionId,
        trackingData.utm_source,
        trackingData.utm_medium,
        trackingData.utm_campaign,
        trackingData.utm_term,
        trackingData.utm_content,
        trackingData.fbp,
        trackingData.fbc,
        trackingData.ip,
        trackingData.user_agent,
        transactionData.valor,
        transactionData.payerName
      ];

      const result = await pool.query(query, values);

      console.log('💾 Tracking salvo no banco:', {
        id: result.rows[0].id,
        transaction_id: transactionData.transactionId,
        external_id_hash: trackingData.external_id_hash.substring(0, 8) + '...'
      });

      return { success: true, id: result.rows[0].id };

    } catch (error) {
      console.error('❌ Erro ao salvar tracking no banco:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = { InvisibleTrackingService };
