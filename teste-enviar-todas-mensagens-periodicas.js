const axios = require('axios');

// URL do seu servidor
const SERVER_URL = 'http://localhost:3000'; // Ajuste conforme necessário

async function testarEnviarTodasMensagensPeriodicas() {
  try {
    console.log('🚀 Testando envio de todas as mensagens periódicas...');
    
    const response = await axios.post(`${SERVER_URL}/api/enviar-todas-mensagens-periodicas`);
    
    console.log('✅ Resposta do servidor:', response.data);
    
    if (response.data.success) {
      console.log(`📊 Bots processados: ${response.data.botsProcessados}`);
      console.log(`💬 Mensagem: ${response.data.message}`);
    }
    
  } catch (error) {
    console.error('❌ Erro ao testar:', error.response?.data || error.message);
  }
}

// Executar o teste
testarEnviarTodasMensagensPeriodicas();

/*
INSTRUÇÕES DE USO:

1. Certifique-se de que o servidor está rodando
2. Ajuste a URL do servidor se necessário
3. Execute: node teste-enviar-todas-mensagens-periodicas.js

A função irá:
- Enviar todas as mensagens periódicas configuradas (08:00, 19:00, 21:00, 23:00)
- Para todos os usuários que não pagaram (pagou = 0)
- Com as mídias correspondentes
- Com o menu inicial após cada mensagem
- Com delays apropriados entre mensagens e usuários

RESPOSTA ESPERADA:
{
  "success": true,
  "message": "Envio de todas as mensagens periódicas iniciado com sucesso",
  "botsProcessados": 1
}
*/
