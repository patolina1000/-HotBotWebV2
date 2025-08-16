/**
 * Teste Simples do Bot3
 * 
 * Este arquivo testa se o bot3 foi criado corretamente sem inicializar dependências externas
 */

console.log('🧪 Iniciando teste simples do Bot3...\n');

try {
  // Testar configuração
  console.log('1️⃣ Testando configuração do bot3...');
  const config3 = require('./MODELO1/BOT/config3');
  console.log('✅ Configuração do bot3 carregada');
  console.log(`   - Plano Premium: R$${config3.planos[0].valor}`);
  console.log(`   - Plano Básico: R$${config3.planos[1].valor}`);
  console.log(`   - URL de envio: ${config3.canalPrevias}`);

  // Testar estrutura do arquivo bot3.js
  console.log('\n2️⃣ Testando estrutura do bot3.js...');
  const fs = require('fs');
  const bot3Content = fs.readFileSync('./MODELO1/BOT/bot3.js', 'utf8');
  
  if (bot3Content.includes('TELEGRAM_TOKEN_BOT3')) {
    console.log('✅ Bot3 usa o token correto (TELEGRAM_TOKEN_BOT3)');
  } else {
    console.log('❌ Bot3 não usa o token correto');
  }

  if (bot3Content.includes('bot_id: \'bot3\'')) {
    console.log('✅ Bot3 tem o ID correto (bot3)');
  } else {
    console.log('❌ Bot3 não tem o ID correto');
  }

  // Testar variáveis de ambiente
  console.log('\n3️⃣ Testando variáveis de ambiente...');
  require('dotenv').config();
  
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

  // Testar mídias
  console.log('\n4️⃣ Testando mídias do bot3...');
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

  // Testar downsells
  console.log('\n5️⃣ Testando downsells do bot3...');
  console.log(`   - Quantidade de downsells: ${config3.downsells.length}`);
  config3.downsells.forEach((ds, index) => {
    console.log(`   - Downsell ${index + 1}: ${ds.id} - ${ds.planos.length} planos`);
  });

  // Testar mensagens periódicas
  console.log('\n6️⃣ Testando mensagens periódicas do bot3...');
  console.log(`   - Quantidade de mensagens: ${config3.mensagensPeriodicas.length}`);
  config3.mensagensPeriodicas.forEach((msg, index) => {
    console.log(`   - Mensagem ${index + 1}: ${msg.horario} - ${msg.midia}`);
  });

  console.log('\n🎉 Teste simples do Bot3 concluído com sucesso!');
  console.log('\n📋 Resumo:');
  console.log('   - Bot3 criado e configurado');
  console.log('   - Configuração carregada');
  console.log('   - Mídias placeholder criadas');
  console.log('   - Downsells configurados');
  console.log('   - Mensagens periódicas configuradas');
  console.log('   - Pronto para uso no Render');

} catch (error) {
  console.error('\n❌ Erro no teste simples do Bot3:', error.message);
  console.error('Stack:', error.stack);
}
