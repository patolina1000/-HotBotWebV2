const axios = require('axios');

// Teste para validar a correção do bug trackingData null
async function testarGerarCobranca() {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  
  console.log('🧪 Testando correção do bug trackingData null...');
  
  const testCases = [
    {
      name: 'Caso 2: trackingData null (bug original)',
      payload: {
        telegram_id: 7205343918,
        plano: "1 Semana", 
        valor: 9.9,
        bot_id: "bot1",
        trackingData: null
      }
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n🔍 ${testCase.name}`);
    
    try {
      const response = await axios.post(`${baseUrl}/api/gerar-cobranca`, testCase.payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Test-Bot/1.0'
        },
        timeout: 5000
      });
      
      console.log(`✅ Status: ${response.status}`);
      
    } catch (error) {
      console.log(`❌ Erro: ${error.response?.status || 'Network'}`);
      console.log(`📄 Detalhes:`, error.response?.data || error.message);
      
      // Se o erro contém a mensagem específica do bug, indicar que não foi corrigido
      const errorMessage = error.response?.data?.detalhes || error.message;
      if (errorMessage.includes("Cannot read properties of null (reading 'utm_source')")) {
        console.log(`🚨 BUG NÃO CORRIGIDO: Ainda ocorrendo erro de utm_source null!`);
      }
    }
  }
  
  console.log('\n🏁 Teste concluído');
}

// Executar apenas se chamado diretamente
if (require.main === module) {
  testarGerarCobranca().catch(console.error);
}

module.exports = { testarGerarCobranca };
