const axios = require('axios');

/**
 * Serviço de integração com a UTMify
 * Responsável por enviar ordens manuais para rastreamento de conversões
 */
class UTMifyIntegration {
  constructor() {
    this.apiUrl = 'https://api.utmify.com.br/api-credentials/orders';
    this.token = process.env.UTMIFY_API_TOKEN;
    this.maxRetries = 3;
    this.retryDelay = 2000; // 2 segundos
    
    if (!this.token) {
      console.warn('⚠️ UTMIFY_API_TOKEN não configurado - Integração UTMify desabilitada');
    }
  }

  /**
   * Envia uma ordem manual para a UTMify
   * @param {Object} orderData - Dados da transação
   * @param {string} orderData.transactionId - ID da transação
   * @param {number} orderData.value - Valor da transação em reais
   * @param {Object} orderData.utmParams - Parâmetros UTM
   * @param {Date} orderData.orderDate - Data da ordem
   * @returns {Promise<boolean>} - True se enviado com sucesso
   */
  async sendOrder(orderData) {
    if (!this.token) {
      console.log('[UTMify] ⚠️ Token não configurado - ordem não enviada');
      return false;
    }

    const payload = this.buildPayload(orderData);
    
    console.log('[UTMify] 📤 Enviando ordem manual:', {
      transactionId: orderData.transactionId,
      value: orderData.value,
      utmParams: orderData.utmParams
    });

    return await this.sendWithRetry(payload);
  }

  /**
   * Constrói o payload para a API da UTMify
   * @param {Object} orderData - Dados da transação
   * @returns {Object} - Payload formatado
   */
  buildPayload(orderData) {
    const { transactionId, value, utmParams, orderDate } = orderData;
    
    // Payload base obrigatório
    const payload = {
      transaction_id: transactionId,
      order_value: parseFloat(value.toFixed(2)),
      order_date: this.formatDate(orderDate || new Date()),
      currency: 'BRL'
    };

    // Adicionar UTMs apenas se existirem
    if (utmParams) {
      if (utmParams.utm_source) payload.utm_source = utmParams.utm_source;
      if (utmParams.utm_medium) payload.utm_medium = utmParams.utm_medium;
      if (utmParams.utm_campaign) payload.utm_campaign = utmParams.utm_campaign;
      if (utmParams.utm_term) payload.utm_term = utmParams.utm_term;
      if (utmParams.utm_content) payload.utm_content = utmParams.utm_content;
    }

    return payload;
  }

  /**
   * Formata data para o padrão aceito pela UTMify
   * @param {Date} date - Data a ser formatada
   * @returns {string} - Data formatada (ISO 8601)
   */
  formatDate(date) {
    return date.toISOString();
  }

  /**
   * Envia requisição com retry automático
   * @param {Object} payload - Dados a serem enviados
   * @returns {Promise<boolean>} - True se sucesso
   */
  async sendWithRetry(payload) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`[UTMify] 🔄 Tentativa ${attempt}/${this.maxRetries}`);
        
        const response = await axios.post(this.apiUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`,
            'User-Agent': 'SiteHot-UTMify-Integration/1.0'
          },
          timeout: 30000 // 30 segundos
        });

        // Sucesso - verificar status da resposta
        if (response.status >= 200 && response.status < 300) {
          console.log('[UTMify] ✅ Ordem enviada com sucesso:', {
            status: response.status,
            transactionId: payload.transaction_id,
            attempt
          });
          return true;
        }

        throw new Error(`Status HTTP inesperado: ${response.status}`);
        
      } catch (error) {
        lastError = error;
        const isLastAttempt = attempt === this.maxRetries;
        
        // Log detalhado do erro
        console.error(`[UTMify] ❌ Erro na tentativa ${attempt}:`, {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          transactionId: payload.transaction_id
        });

        // Se não é a última tentativa, aguardar antes de tentar novamente
        if (!isLastAttempt) {
          const delay = this.retryDelay * attempt; // Delay exponencial
          console.log(`[UTMify] ⏳ Aguardando ${delay}ms antes da próxima tentativa...`);
          await this.sleep(delay);
        }
      }
    }

    // Todas as tentativas falharam
    console.error('[UTMify] 💥 Falha definitiva após todas as tentativas:', {
      transactionId: payload.transaction_id,
      error: lastError.message
    });
    
    return false;
  }

  /**
   * Função auxiliar para aguardar um tempo
   * @param {number} ms - Milissegundos para aguardar
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Recupera dados UTM da transação do banco de dados
   * @param {string} transactionId - ID da transação
   * @param {Object} db - Instância do banco SQLite
   * @param {Object} pgPool - Pool do PostgreSQL
   * @returns {Promise<Object|null>} - Dados UTM ou null
   */
  async getUTMDataFromTransaction(transactionId, db, pgPool) {
    let utmData = null;

    try {
      // Tentar primeiro no SQLite
      if (db) {
        const row = db.prepare(`
          SELECT utm_source, utm_medium, utm_campaign, utm_term, utm_content
          FROM tokens 
          WHERE id_transacao = ?
        `).get(transactionId);
        
        if (row) {
          utmData = {
            utm_source: row.utm_source,
            utm_medium: row.utm_medium,
            utm_campaign: row.utm_campaign,
            utm_term: row.utm_term,
            utm_content: row.utm_content
          };
        }
      }

      // Se não encontrou no SQLite, tentar no PostgreSQL
      if (!utmData && pgPool) {
        const result = await pgPool.query(`
          SELECT utm_source, utm_medium, utm_campaign, utm_term, utm_content
          FROM tokens 
          WHERE id_transacao = $1
        `, [transactionId]);
        
        if (result.rows.length > 0) {
          const row = result.rows[0];
          utmData = {
            utm_source: row.utm_source,
            utm_medium: row.utm_medium,
            utm_campaign: row.utm_campaign,
            utm_term: row.utm_term,
            utm_content: row.utm_content
          };
        }
      }

      // Filtrar valores nulos/vazios
      if (utmData) {
        const filteredData = {};
        Object.keys(utmData).forEach(key => {
          if (utmData[key] && utmData[key].trim() !== '') {
            filteredData[key] = utmData[key].trim();
          }
        });
        
        return Object.keys(filteredData).length > 0 ? filteredData : null;
      }

    } catch (error) {
      console.error('[UTMify] ❌ Erro ao recuperar dados UTM:', error.message);
    }

    return null;
  }

  /**
   * Função principal para processar webhook de pagamento aprovado
   * Deve ser chamada quando o status for "pago" no webhook da PushinPay
   * @param {string} transactionId - ID da transação
   * @param {number} value - Valor da transação em centavos
   * @param {Object} db - Instância do banco SQLite
   * @param {Object} pgPool - Pool do PostgreSQL
   * @returns {Promise<boolean>} - True se processado com sucesso
   */
  async processPaymentApproved(transactionId, value, db, pgPool) {
    try {
      console.log('[UTMify] 🎯 Processando pagamento aprovado:', { transactionId, value });

      // Recuperar dados UTM da transação
      const utmParams = await this.getUTMDataFromTransaction(transactionId, db, pgPool);
      
      if (!utmParams) {
        console.log('[UTMify] ℹ️ Nenhum parâmetro UTM encontrado para a transação:', transactionId);
        // Ainda assim podemos enviar a ordem sem UTMs para rastreamento básico
      } else {
        console.log('[UTMify] 🏷️ Parâmetros UTM recuperados:', utmParams);
      }

      // Preparar dados da ordem
      const orderData = {
        transactionId: transactionId,
        value: value / 100, // Converter de centavos para reais
        utmParams: utmParams,
        orderDate: new Date()
      };

      // Enviar para UTMify
      const success = await this.sendOrder(orderData);
      
      if (success) {
        console.log('[UTMify] 🎉 Integração concluída com sucesso para transação:', transactionId);
      } else {
        console.error('[UTMify] 💔 Falha na integração para transação:', transactionId);
      }
      
      return success;

    } catch (error) {
      console.error('[UTMify] 💥 Erro crítico no processamento:', {
        transactionId,
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Testa a conectividade com a API da UTMify
   * @returns {Promise<boolean>} - True se API estiver acessível
   */
  async testConnection() {
    if (!this.token) {
      console.log('[UTMify] ❌ Token não configurado - teste não executado');
      return false;
    }

    try {
      console.log('[UTMify] 🔍 Testando conectividade...');
      
      // Enviar ordem de teste
      const testOrder = {
        transactionId: `test_${Date.now()}`,
        value: 0.01, // R$ 0,01 para teste
        utmParams: {
          utm_source: 'test',
          utm_medium: 'api_test',
          utm_campaign: 'connection_test'
        },
        orderDate: new Date()
      };

      const success = await this.sendOrder(testOrder);
      
      if (success) {
        console.log('[UTMify] ✅ Teste de conectividade bem-sucedido');
      } else {
        console.log('[UTMify] ❌ Falha no teste de conectividade');
      }
      
      return success;
      
    } catch (error) {
      console.error('[UTMify] ❌ Erro no teste de conectividade:', error.message);
      return false;
    }
  }
}

// Exportar instância singleton
const utmifyIntegration = new UTMifyIntegration();

module.exports = utmifyIntegration;