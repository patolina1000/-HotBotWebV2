#!/usr/bin/env node

/**
 * 🧪 TESTE DE CANAIS SEPARADOS POR BOT
 * 
 * Este script testa se cada bot está configurado para usar seu próprio canal
 * para aquecimento de mídias e logs.
 */

console.log('🧪 TESTE DE CANAIS SEPARADOS POR BOT');
console.log('='.repeat(50));

// Simular variáveis de ambiente
const envVars = {
  TEST_CHAT_ID: process.env.TEST_CHAT_ID || null,
  TEST_CHAT_ID_BOT1: process.env.TEST_CHAT_ID_BOT1 || null,
  TEST_CHAT_ID_BOT2: process.env.TEST_CHAT_ID_BOT2 || null,
  TEST_CHAT_ID_BOT_ESPECIAL: process.env.TEST_CHAT_ID_BOT_ESPECIAL || null
};

console.log('\n📋 VARIÁVEIS DE AMBIENTE CONFIGURADAS:');
console.log('-'.repeat(40));
Object.keys(envVars).forEach(key => {
  const value = envVars[key];
  const status = value ? '✅' : '❌';
  console.log(`${status} ${key}: ${value || 'NÃO CONFIGURADO'}`);
});

// Simular lógica de configuração de cada bot
function obterChatIdParaBot(botId) {
  let testChatId = null;
  let variavel = '';
  
  switch (botId) {
    case 'bot1':
      testChatId = envVars.TEST_CHAT_ID_BOT1 || envVars.TEST_CHAT_ID;
      variavel = envVars.TEST_CHAT_ID_BOT1 ? 'TEST_CHAT_ID_BOT1' : 'TEST_CHAT_ID (fallback)';
      break;
    case 'bot2':
      testChatId = envVars.TEST_CHAT_ID_BOT2 || envVars.TEST_CHAT_ID;
      variavel = envVars.TEST_CHAT_ID_BOT2 ? 'TEST_CHAT_ID_BOT2' : 'TEST_CHAT_ID (fallback)';
      break;
    case 'bot_especial':
      testChatId = envVars.TEST_CHAT_ID_BOT_ESPECIAL || envVars.TEST_CHAT_ID;
      variavel = envVars.TEST_CHAT_ID_BOT_ESPECIAL ? 'TEST_CHAT_ID_BOT_ESPECIAL' : 'TEST_CHAT_ID (fallback)';
      break;
    default:
      testChatId = envVars.TEST_CHAT_ID;
      variavel = 'TEST_CHAT_ID';
  }
  
  return { testChatId, variavel };
}

console.log('\n🤖 CONFIGURAÇÃO DE CADA BOT:');
console.log('-'.repeat(40));

const bots = ['bot1', 'bot2', 'bot_especial'];
const resultados = {};

bots.forEach(botId => {
  const { testChatId, variavel } = obterChatIdParaBot(botId);
  const status = testChatId ? '✅' : '❌';
  
  resultados[botId] = {
    configurado: !!testChatId,
    chatId: testChatId,
    variavel: variavel
  };
  
  console.log(`${status} ${botId.toUpperCase()}:`);
  console.log(`   📱 Chat ID: ${testChatId || 'NÃO CONFIGURADO'}`);
  console.log(`   🔧 Variável: ${variavel}`);
  console.log('');
});

console.log('🔍 ANÁLISE DE SEPARAÇÃO:');
console.log('-'.repeat(40));

// Verificar se há canais únicos
const chatsUnicos = new Set();
const conflitos = [];

Object.keys(resultados).forEach(botId => {
  const resultado = resultados[botId];
  if (resultado.configurado) {
    if (chatsUnicos.has(resultado.chatId)) {
      conflitos.push({
        chatId: resultado.chatId,
        bots: Object.keys(resultados).filter(id => 
          resultados[id].chatId === resultado.chatId
        )
      });
    } else {
      chatsUnicos.add(resultado.chatId);
    }
  }
});

if (conflitos.length === 0) {
  console.log('✅ TODOS OS BOTS TÊM CANAIS ÚNICOS');
  console.log('   Cada bot usará seu próprio canal para aquecimento');
} else {
  console.log('⚠️ CONFLITOS ENCONTRADOS:');
  conflitos.forEach(conflito => {
    console.log(`   📱 Chat ${conflito.chatId} usado por: ${conflito.bots.join(', ')}`);
  });
}

console.log('\n📊 RESUMO FINAL:');
console.log('-'.repeat(40));

const botsConfigurados = Object.values(resultados).filter(r => r.configurado).length;
const botsSemCanal = Object.values(resultados).filter(r => !r.configurado).length;
const canaisUnicos = chatsUnicos.size;

console.log(`✅ Bots configurados: ${botsConfigurados}/3`);
console.log(`❌ Bots sem canal: ${botsSemCanal}/3`);
console.log(`📱 Canais únicos: ${canaisUnicos}`);

console.log('\n🎯 RECOMENDAÇÕES:');
console.log('-'.repeat(40));

if (botsSemCanal > 0) {
  console.log('❌ Configure variáveis de ambiente para todos os bots:');
  Object.keys(resultados).forEach(botId => {
    if (!resultados[botId].configurado) {
      const varName = `TEST_CHAT_ID_${botId.toUpperCase()}`;
      console.log(`   $env:${varName}="-1001234567890"`);
    }
  });
}

if (conflitos.length > 0) {
  console.log('⚠️ Crie canais separados para evitar conflitos de file_ids');
}

if (botsConfigurados === 3 && canaisUnicos === 3) {
  console.log('🎉 CONFIGURAÇÃO PERFEITA!');
  console.log('   Cada bot tem seu próprio canal para aquecimento');
}

console.log('\n🔧 EXEMPLO DE CONFIGURAÇÃO COMPLETA:');
console.log('-'.repeat(40));
console.log('# Windows PowerShell:');
console.log('$env:TEST_CHAT_ID_BOT1="-1001234567891"');
console.log('$env:TEST_CHAT_ID_BOT2="-1001234567892"');
console.log('$env:TEST_CHAT_ID_BOT_ESPECIAL="-1001234567893"');
console.log('$env:TEST_CHAT_ID="-1001234567890"  # Fallback');

console.log('\n✨ TESTE CONCLUÍDO!');
