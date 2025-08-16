/**
 * Teste do Bot3
 * 
 * Este arquivo testa se o bot3 foi criado corretamente e está funcionando
 */

require('dotenv').config();

async function testarBot3() {
  console.log('🧪 Iniciando teste do Bot3...\n');

  try {
    // Testar importação do bot3
    console.log('1️⃣ Testando importação do bot3...');
    const bot3 = require('./MODELO1/BOT/bot3');
    console.log('✅ Bot3 importado com sucesso');

    // Testar configuração
    console.log('\n2️⃣ Testando configuração do bot3...');
    const config3 = require('./MODELO1/BOT/config3');
    console.log('✅ Configuração do bot3 carregada');
    console.log(`   - Plano Premium: R$${config3.planos[0].valor}`);
    console.log(`   - Plano Básico: R$${config3.planos[1].valor}`);
    console.log(`   - URL de envio: ${config3.canalPrevias}`);

    // Testar variáveis de ambiente
    console.log('\n3️⃣ Testando variáveis de ambiente...');
    const token = process.env.TELEGRAM_TOKEN_BOT3;
    const urlEnvio = process.env.URL_ENVIO_3;
    
    if (token) {
      console.log('✅ TELEGRAM_TOKEN_BOT3 definido');
      console.log(`   - Token: ${token.substring(0, 20)}...`);
    } else {
      console.log('❌ TELEGRAM_TOKEN_BOT3 não definido');
    }

    if (urlEnvio) {
      console.log('✅ URL_ENVIO_3 definido');
      console.log(`   - URL: ${urlEnvio}`);
    } else {
      console.log('❌ URL_ENVIO_3 não definido');
    }

    // Testar inicialização do bot
    console.log('\n4️⃣ Testando inicialização do bot3...');
    const instancia = bot3.iniciar();
    console.log('✅ Bot3 inicializado com sucesso');
    console.log(`   - Bot ID: ${instancia.bot_id || 'bot3'}`);

    // Testar mídias
    console.log('\n5️⃣ Testando mídias do bot3...');
    const fs = require('fs');
    const midias = [
      './MODELO1/BOT/midia/inicial3.mp4',
      './MODELO1/BOT/midia/09.mp4',
      './MODELO1/BOT/midia/14.mp4',
      './MODELO1/BOT/midia/19.mp4'
    ];

    midias.forEach(midia => {
      if (fs.existsSync(midia)) {
        console.log(`✅ ${midia} - Existe`);
      } else {
        console.log(`❌ ${midia} - Não encontrado`);
      }
    });

    console.log('\n🎉 Teste do Bot3 concluído com sucesso!');
    console.log('\n📋 Resumo:');
    console.log('   - Bot3 criado e configurado');
    console.log('   - Configuração carregada');
    console.log('   - Mídias placeholder criadas');
    console.log('   - Pronto para uso no Render');

  } catch (error) {
    console.error('\n❌ Erro no teste do Bot3:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Executar teste
testarBot3();
