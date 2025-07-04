// server.js - Arquivo de entrada principal para o Render
// Compatível com suas versões atuais das dependências

console.log('🚀 Iniciando servidor SiteHot...');
console.log('📁 Executando a partir de:', __dirname);
console.log('🔧 Node.js versão:', process.version);
console.log('🌍 Ambiente:', process.env.NODE_ENV || 'development');

// Verificar se o arquivo principal existe
const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, 'app.js');

if (!fs.existsSync(appPath)) {
  console.error('❌ Arquivo app.js não encontrado!');
  console.log('📂 Arquivos disponíveis:', fs.readdirSync(__dirname));
  process.exit(1);
}

try {
  // Importar e executar o arquivo principal
  require('./app.js');
  console.log('✅ Aplicação principal carregada com sucesso');
} catch (error) {
  console.error('❌ Erro ao carregar aplicação principal:', error.message);
  console.error('📍 Stack trace:', error.stack);
  
  // Tentar diagnóstico adicional
  console.log('\n🔍 Diagnóstico do erro:');
  console.log('- Verificando dependências principais...');
  
  const dependencies = [
    'express',
    'pg', 
    'dotenv',
    'cors',
    'helmet',
    'compression',
    'express-rate-limit',
    'axios',
    'node-telegram-bot-api'
  ];
  
  dependencies.forEach(dep => {
    try {
      require(dep);
      console.log(`  ✅ ${dep}: OK`);
    } catch (e) {
      console.log(`  ❌ ${dep}: ERRO -`, e.message);
    }
  });
  
  console.log('\n🔧 Variáveis de ambiente importantes:');
  console.log('- DATABASE_URL:', process.env.DATABASE_URL ? 'DEFINIDA' : 'NÃO DEFINIDA');
  console.log('- PORT:', process.env.PORT || 'NÃO DEFINIDA');
  console.log('- NODE_ENV:', process.env.NODE_ENV || 'NÃO DEFINIDA');
  console.log('- TELEGRAM_TOKEN:', process.env.TELEGRAM_TOKEN ? 'DEFINIDO' : 'NÃO DEFINIDO');
  
  process.exit(1);
}