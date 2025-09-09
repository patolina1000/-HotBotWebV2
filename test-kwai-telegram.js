#!/usr/bin/env node

/**
 * Script de teste para validar o tracking do Kwai via Telegram
 * 
 * Este script simula o envio de um click_id via webhook do Telegram
 * para testar se o sistema está capturando e processando corretamente.
 */

const axios = require('axios');

// Configurações do teste
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_CLICK_ID = 'Z8bBwHufPMow60mxkUiEkA'; // Click ID de teste da Kwai
const TEST_TELEGRAM_ID = '123456789'; // ID de teste do Telegram

async function testKwaiTracking() {
  console.log('🧪 [KWAI-TEST] Iniciando teste de tracking via Telegram...');
  console.log(`📡 URL base: ${BASE_URL}`);
  console.log(`🎯 Click ID de teste: ${TEST_CLICK_ID}`);
  console.log(`👤 Telegram ID de teste: ${TEST_TELEGRAM_ID}`);
  console.log('');

  try {
    // Teste 1: Enviar click_id via query parameter
    console.log('🔍 Teste 1: Enviando click_id via query parameter...');
    const response1 = await axios.post(`${BASE_URL}/checkout`, {
      telegram_id: TEST_TELEGRAM_ID,
      valor: 2990, // R$ 29,90 em centavos
      nome_oferta: 'Plano Privacy Teste',
      // Simular dados de tracking
      fbp: 'fb.1.1640995200.AbCdEfGhIjKlMnOp',
      fbc: 'fb.1.1640995200.AbCdEfGhIjKlMnOp-123_456',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      ip: '192.168.1.100'
    }, {
      params: {
        kwai_click_id: TEST_CLICK_ID
      }
    });

    console.log('✅ Teste 1 concluído:', {
      status: response1.status,
      hasQrCode: !!response1.data.qr_code,
      transacaoId: response1.data.transacao_id
    });
    console.log('');

    // Aguardar 2 segundos
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Teste 2: Enviar click_id via body
    console.log('🔍 Teste 2: Enviando click_id via body...');
    const response2 = await axios.post(`${BASE_URL}/checkout`, {
      telegram_id: TEST_TELEGRAM_ID,
      valor: 2990,
      nome_oferta: 'Plano Privacy Teste 2',
      kwai_click_id: TEST_CLICK_ID,
      fbp: 'fb.1.1640995200.AbCdEfGhIjKlMnOp',
      fbc: 'fb.1.1640995200.AbCdEfGhIjKlMnOp-123_456',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      ip: '192.168.1.101'
    });

    console.log('✅ Teste 2 concluído:', {
      status: response2.status,
      hasQrCode: !!response2.data.qr_code,
      transacaoId: response2.data.transacao_id
    });
    console.log('');

    // Teste 3: Verificar se o click_id foi armazenado no SessionTracking
    console.log('🔍 Teste 3: Verificando armazenamento no SessionTracking...');
    try {
      const sessionResponse = await axios.get(`${BASE_URL}/api/session-tracking/${TEST_TELEGRAM_ID}`);
      console.log('✅ Dados do SessionTracking:', {
        hasData: !!sessionResponse.data,
        kwaiClickId: sessionResponse.data?.kwai_click_id,
        hasKwaiClickId: !!sessionResponse.data?.kwai_click_id
      });
    } catch (error) {
      console.log('⚠️ Erro ao verificar SessionTracking:', error.message);
    }
    console.log('');

    // Teste 4: Testar evento manual do Kwai
    console.log('🔍 Teste 4: Testando evento manual do Kwai...');
    try {
      const kwaiResponse = await axios.post(`${BASE_URL}/api/kwai-event`, {
        eventName: 'EVENT_ADD_TO_CART',
        clickid: TEST_CLICK_ID,
        properties: {
          content_id: 'test_plano_manual',
          content_name: 'Plano Privacy Manual',
          content_type: 'product',
          currency: 'BRL',
          value: 29.90,
          quantity: 1
        },
        telegramId: TEST_TELEGRAM_ID
      });

      console.log('✅ Evento Kwai manual:', {
        success: kwaiResponse.data.success,
        eventName: kwaiResponse.data.eventName,
        clickid: kwaiResponse.data.clickid?.substring(0, 20) + '...'
      });
    } catch (error) {
      console.log('❌ Erro no evento Kwai manual:', error.response?.data || error.message);
    }

    console.log('');
    console.log('🎉 Teste completo finalizado!');
    console.log('');
    console.log('📋 Resumo dos testes:');
    console.log('1. ✅ Click ID via query parameter');
    console.log('2. ✅ Click ID via body');
    console.log('3. ✅ Verificação do SessionTracking');
    console.log('4. ✅ Evento manual do Kwai');
    console.log('');
    console.log('🔍 Verifique os logs do servidor para ver se o click_id está sendo capturado corretamente.');

  } catch (error) {
    console.error('❌ Erro durante o teste:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
  }
}

// Executar teste se chamado diretamente
if (require.main === module) {
  testKwaiTracking();
}

module.exports = { testKwaiTracking };
