const axios = require('axios');

// Configurações
const BASE_URL = 'http://localhost:3000'; // Ajuste conforme necessário
const TOKEN_TESTE = 'SEU_TOKEN_AQUI'; // Substitua por um token válido

async function testarRotaDadosComprador() {
  console.log('🧪 Testando rota /api/dados-comprador...\n');

  try {
    // Teste 1: Sem token
    console.log('📝 Teste 1: Chamada sem token');
    try {
      const response = await axios.get(`${BASE_URL}/api/dados-comprador`);
      console.log('❌ ERRO: Deveria ter retornado erro 400');
      console.log('Resposta:', response.data);
    } catch (error) {
      if (error.response && error.response.status === 400) {
        console.log('✅ SUCESSO: Erro 400 retornado corretamente');
        console.log('Mensagem:', error.response.data.erro);
      } else {
        console.log('❌ ERRO: Status incorreto:', error.response?.status);
      }
    }
    console.log('');

    // Teste 2: Com token válido
    console.log('📝 Teste 2: Chamada com token válido');
    try {
      const response = await axios.get(`${BASE_URL}/api/dados-comprador?token=${TOKEN_TESTE}`);
      console.log('✅ SUCESSO: Dados retornados');
      console.log('Resposta:', response.data);
      
      // Verificar estrutura da resposta
      if (response.data.sucesso && 
          typeof response.data.nome === 'string' && 
          typeof response.data.cpf === 'string' && 
          typeof response.data.cidade === 'string') {
        console.log('✅ Estrutura da resposta está correta');
      } else {
        console.log('❌ Estrutura da resposta incorreta');
      }
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log('ℹ️ Token não encontrado (esperado se não existir no banco)');
        console.log('Mensagem:', error.response.data.erro);
      } else if (error.response && error.response.status === 500) {
        console.log('❌ Erro interno do servidor');
        console.log('Mensagem:', error.response.data.erro);
      } else {
        console.log('❌ Erro inesperado:', error.message);
      }
    }
    console.log('');

    // Teste 3: Com token inválido
    console.log('📝 Teste 3: Chamada com token inválido');
    try {
      const response = await axios.get(`${BASE_URL}/api/dados-comprador?token=token_invalido_123`);
      console.log('❌ ERRO: Deveria ter retornado erro 404');
      console.log('Resposta:', response.data);
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log('✅ SUCESSO: Erro 404 retornado corretamente');
        console.log('Mensagem:', error.response.data.erro);
      } else {
        console.log('❌ ERRO: Status incorreto:', error.response?.status);
      }
    }

  } catch (error) {
    console.error('❌ Erro geral no teste:', error.message);
  }
}

// Executar teste
if (require.main === module) {
  testarRotaDadosComprador();
}

module.exports = { testarRotaDadosComprador };
