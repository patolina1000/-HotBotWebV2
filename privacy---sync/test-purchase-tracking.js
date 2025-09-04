/**
 * Teste simples do sistema de tracking de compra da Kwai
 * Testa a rota /api/kwai/purchase
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000'; // Ajustar conforme necessário

async function testPurchaseTracking() {
    console.log('🧪 TESTANDO SISTEMA DE TRACKING DE COMPRA KWAI');
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('🌐 URL Base:', BASE_URL);
    
    try {
        // Teste 1: Verificar se a rota está funcionando
        console.log('\n📡 TESTE 1: Verificando rota /api/kwai/purchase');
        
        const testClickId = 'test_click_' + Date.now();
        const testData = {
            click_id: testClickId,
            value: 19.98,
            properties: {
                test_mode: true,
                test_timestamp: Date.now(),
                content_name: 'Privacy - Teste de Tracking'
            }
        };
        
        console.log('📤 Enviando dados de teste:', testData);
        
        const response = await axios.post(`${BASE_URL}/api/kwai/purchase`, testData, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });
        
        console.log('✅ Resposta recebida:', response.status);
        console.log('📦 Dados da resposta:', response.data);
        
        if (response.data.success) {
            console.log('🎉 EVENT_PURCHASE enviado com sucesso para Kwai!');
        } else {
            console.warn('⚠️ Evento não foi enviado:', response.data.error);
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Erro no teste:', error.message);
        
        if (error.response) {
            console.error('📡 Status da resposta:', error.response.status);
            console.error('📦 Dados da resposta:', error.response.data);
        }
        
        return false;
    }
}

// Executar teste se chamado diretamente
if (require.main === module) {
    testPurchaseTracking()
        .then(success => {
            if (success) {
                console.log('\n🎯 TESTE CONCLUÍDO COM SUCESSO!');
                console.log('✅ O sistema de tracking está funcionando');
            } else {
                console.log('\n❌ TESTE FALHOU');
                console.log('⚠️ Verificar configurações e logs do servidor');
            }
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('\n💥 ERRO FATAL:', error.message);
            process.exit(1);
        });
}

module.exports = { testPurchaseTracking };
