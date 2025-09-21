/**
 * EXEMPLO DE USO DO SISTEMA DE GATEWAY PIX
 *
 * Este arquivo demonstra como usar o sistema unificado de PIX
 * para alternar entre PushinPay e Oasyfy
 *
 * IMPORTANTE: quando precisar enviar o campo `amount` diretamente em centavos
 * (por exemplo, `amount: 1990`), inclua também `amount_unit: 'cents'`
 * para informar explicitamente a unidade do valor ao backend.
 */

const axios = require('axios');

// URL base da API (ajuste conforme necessário)
const API_BASE = 'http://localhost:3000';

/**
 * Exemplo 1: Verificar status dos gateways
 */
async function verificarStatusGateways() {
  try {
    console.log('🔍 Verificando status dos gateways...');
    
    const response = await axios.get(`${API_BASE}/api/gateways/status`);
    const status = response.data;
    
    console.log('📊 Status dos Gateways:');
    console.log(`  Gateway ativo: ${status.active_gateway}`);
    console.log('  Gateways disponíveis:');
    
    status.available_gateways.forEach(gateway => {
      console.log(`    - ${gateway.name}: ${gateway.configured ? '✅' : '❌'} ${gateway.active ? '(ATIVO)' : ''}`);
    });
    
    return status;
  } catch (error) {
    console.error('❌ Erro ao verificar status:', error.message);
    throw error;
  }
}

/**
 * Exemplo 2: Alterar gateway ativo
 */
async function alterarGateway(gateway) {
  try {
    console.log(`🔄 Alterando gateway para: ${gateway}`);
    
    const response = await axios.post(`${API_BASE}/api/gateways/set-active`, {
      gateway: gateway
    });
    
    console.log('✅ Gateway alterado:', response.data.message);
    return response.data;
  } catch (error) {
    console.error('❌ Erro ao alterar gateway:', error.message);
    throw error;
  }
}

/**
 * Exemplo 3: Testar conectividade dos gateways
 */
async function testarConectividade() {
  try {
    console.log('🧪 Testando conectividade dos gateways...');
    
    const response = await axios.get(`${API_BASE}/api/gateways/test`);
    const results = response.data;
    
    console.log('📡 Resultados dos testes:');
    console.log(`  PushinPay: ${results.pushinpay.available ? '✅ Disponível' : '❌ Indisponível'}`);
    if (results.pushinpay.error) {
      console.log(`    Erro: ${results.pushinpay.error}`);
    }
    
    console.log(`  Oasyfy: ${results.oasyfy.available ? '✅ Disponível' : '❌ Indisponível'}`);
    if (results.oasyfy.error) {
      console.log(`    Erro: ${results.oasyfy.error}`);
    }
    
    return results;
  } catch (error) {
    console.error('❌ Erro ao testar conectividade:', error.message);
    throw error;
  }
}

/**
 * Exemplo 4: Criar PIX para bot do Telegram
 */
async function criarPixBot() {
  try {
    console.log('🤖 Criando PIX para bot do Telegram...');
    
    const response = await axios.post(`${API_BASE}/api/pix/create`, {
      type: 'bot',
      telegram_id: '123456789',
      plano: {
        id: 'plano_1_mes',
        nome: 'Plano 1 Mês'
      },
      valor: 19.90,
      amount_unit: 'reais',
      tracking_data: {
        utm_source: 'telegram',
        utm_campaign: 'lancamento',
        utm_medium: 'bot'
      },
      bot_id: 'bot1'
    });
    
    const result = response.data;
    
    console.log('✅ PIX criado com sucesso:');
    console.log(`  Transaction ID: ${result.transaction_id}`);
    console.log(`  Gateway usado: ${result.gateway}`);
    console.log(`  Status: ${result.status}`);
    console.log(`  QR Code: ${result.qr_code_base64 ? '✅ Gerado' : '❌ Não gerado'}`);
    console.log(`  Código PIX: ${result.pix_copia_cola ? '✅ Gerado' : '❌ Não gerado'}`);
    
    return result;
  } catch (error) {
    console.error('❌ Erro ao criar PIX do bot:', error.message);
    throw error;
  }
}

/**
 * Exemplo 5: Criar PIX para checkout web
 */
async function criarPixWeb() {
  try {
    console.log('🌐 Criando PIX para checkout web...');
    
    const response = await axios.post(`${API_BASE}/api/pix/create`, {
      type: 'web',
      plano_id: 'plano_3_meses',
      valor: 41.90,
      amount_unit: 'reais',
      client_data: {
        name: 'João Silva',
        email: 'joao@email.com',
        phone: '(11) 99999-9999',
        document: '123.456.789-00'
      },
      tracking_data: {
        utm_source: 'facebook',
        utm_campaign: 'lancamento',
        utm_medium: 'cpc',
        utm_content: 'checkout_web'
      }
    });
    
    const result = response.data;
    
    console.log('✅ PIX web criado com sucesso:');
    console.log(`  Transaction ID: ${result.transaction_id}`);
    console.log(`  Gateway usado: ${result.gateway}`);
    console.log(`  Status: ${result.status}`);
    
    return result;
  } catch (error) {
    console.error('❌ Erro ao criar PIX web:', error.message);
    throw error;
  }
}

/**
 * Exemplo 6: Criar PIX especial
 */
async function criarPixEspecial() {
  try {
    console.log('⭐ Criando PIX especial...');
    
    const response = await axios.post(`${API_BASE}/api/pix/create`, {
      type: 'special',
      valor: 100,
      amount_unit: 'reais',
      metadata: {
        source: 'obrigado_especial',
        test: true
      }
    });
    
    const result = response.data;
    
    console.log('✅ PIX especial criado com sucesso:');
    console.log(`  Transaction ID: ${result.transaction_id}`);
    console.log(`  Gateway usado: ${result.gateway}`);
    console.log(`  Valor: R$ ${result.amount || 100}`);
    
    return result;
  } catch (error) {
    console.error('❌ Erro ao criar PIX especial:', error.message);
    throw error;
  }
}

/**
 * Exemplo 7: Simular webhook (para teste)
 */
async function simularWebhook(gateway = 'pushinpay') {
  try {
    console.log(`📥 Simulando webhook do ${gateway}...`);
    
    let payload;
    
    if (gateway === 'pushinpay') {
      payload = {
        id: 'test_pushinpay_123',
        status: 'paid',
        payer_name: 'João Silva',
        payer_national_registration: '123.456.789-00',
        end_to_end_id: 'E123456789012345678901234567890123456789012345',
        amount: 1990, // em centavos
        created_at: new Date().toISOString(),
        paid_at: new Date().toISOString()
      };
    } else if (gateway === 'oasyfy') {
      payload = {
        event: 'TRANSACTION_PAID',
        token: 'test_token_123',
        transaction: {
          id: 'test_oasyfy_123',
          identifier: 'test_identifier_123',
          status: 'COMPLETED',
          paymentMethod: 'PIX',
          amount: 19.90,
          currency: 'BRL',
          createdAt: new Date().toISOString(),
          payedAt: new Date().toISOString(),
          pixInformation: {
            qrCode: '00020101021126530014BR.GOV.BCB.PIX...',
            endToEndId: 'E123456789012345678901234567890123456789012345'
          }
        },
        client: {
          id: 'client_123',
          name: 'João Silva',
          email: 'joao@email.com',
          phone: '(11) 99999-9999',
          cpf: '123.456.789-00'
        },
        orderItems: [{
          id: 'item_123',
          price: 19.90,
          product: {
            id: 'prod_123',
            name: 'Plano 1 Mês',
            externalId: 'plano_1_mes'
          }
        }]
      };
    }
    
    const response = await axios.post(`${API_BASE}/webhook/unified`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `${gateway}-webhook-test`
      }
    });
    
    console.log('✅ Webhook simulado com sucesso');
    console.log(`  Status: ${response.status}`);
    
    return response.data;
  } catch (error) {
    console.error('❌ Erro ao simular webhook:', error.message);
    throw error;
  }
}

/**
 * Exemplo completo: Demonstração de todas as funcionalidades
 */
async function exemploCompleto() {
  try {
    console.log('🚀 INICIANDO EXEMPLO COMPLETO DO SISTEMA DE GATEWAY PIX\n');
    
    // 1. Verificar status inicial
    await verificarStatusGateways();
    console.log('');
    
    // 2. Testar conectividade
    await testarConectividade();
    console.log('');
    
    // 3. Criar PIX com gateway atual
    await criarPixBot();
    console.log('');
    
    // 4. Alterar para Oasyfy (se disponível)
    try {
      await alterarGateway('oasyfy');
      console.log('');
      
      // 5. Criar PIX com Oasyfy
      await criarPixWeb();
      console.log('');
      
      // 6. Simular webhook Oasyfy
      await simularWebhook('oasyfy');
      console.log('');
      
    } catch (error) {
      console.log('⚠️ Oasyfy não disponível, continuando com PushinPay\n');
    }
    
    // 7. Voltar para PushinPay
    await alterarGateway('pushinpay');
    console.log('');
    
    // 8. Criar PIX especial
    await criarPixEspecial();
    console.log('');
    
    // 9. Simular webhook PushinPay
    await simularWebhook('pushinpay');
    console.log('');
    
    console.log('🎉 EXEMPLO COMPLETO FINALIZADO COM SUCESSO!');
    
  } catch (error) {
    console.error('💥 Erro no exemplo completo:', error.message);
  }
}

// Executar exemplo se chamado diretamente
if (require.main === module) {
  exemploCompleto();
}

module.exports = {
  verificarStatusGateways,
  alterarGateway,
  testarConectividade,
  criarPixBot,
  criarPixWeb,
  criarPixEspecial,
  simularWebhook,
  exemploCompleto
};
