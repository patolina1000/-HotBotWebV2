require('dotenv').config();
const TelegramBotService = require('./MODELO1/core/TelegramBotService');
const { initializePostgres } = require('./database/postgres');
const { initializeSQLite } = require('./database/sqlite');

async function enviarMensagemVIP() {
  console.log('🚀 Enviando mensagem VIP para o canal...');
  
  try {
    // Inicializar banco de dados
    const postgres = initializePostgres();
    const sqlite = initializeSQLite();
    
    // Configuração do bot1
    const bot1Config = {
      token: process.env.TELEGRAM_TOKEN_BOT1,
      baseUrl: process.env.BASE_URL,
      postgres: postgres,
      sqlite: sqlite,
      bot_id: 'bot1',
      config: require('./MODELO1/BOT/config.js')
    };
    
    // Criar instância do bot1
    const bot1 = new TelegramBotService(bot1Config);
    
    // Inicializar o bot
    await bot1.iniciar();
    
    console.log('✅ Bot1 inicializado');
    
    // Enviar mensagem VIP
    const resultado = await bot1.enviarMensagemVIPParaCanal();
    
    console.log('✅ Mensagem enviada com sucesso!');
    console.log('📊 ID da mensagem:', resultado.message_id);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

enviarMensagemVIP();
