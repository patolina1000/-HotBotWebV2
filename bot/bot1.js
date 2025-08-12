require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { appendDataToSheet } = require('../services/googleSheets');

// Configuração do bot
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// Função para obter data atual no formato DD/MM/YYYY HH:mm:ss
function getCurrentDateTime() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

// Handler para o comando /start
bot.onText(/\/start(?:\s+(.*))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || 'Sem username';
  const firstName = msg.from.first_name || 'Sem nome';
  
  console.log(`[BOT1] Usuário ${chatId} (${firstName} @${username}) iniciou o bot`);
  
  try {
    // Preparar dados para enviar à planilha
    const currentDateTime = getCurrentDateTime();
    const values = [[currentDateTime, 1]];
    
    // Chamar a função appendDataToSheet para registrar o evento bot1
    await appendDataToSheet(
      process.env.GOOGLE_SHEETS_ID,
      'bot1!A:B',
      values
    );
    
    console.log(`[BOT1] ✅ Evento registrado na planilha para usuário ${chatId}`);
    
  } catch (error) {
    // Tratar erro de forma segura, apenas registrando no console
    console.error(`[BOT1] ❌ Erro ao registrar evento na planilha para usuário ${chatId}:`, error.message);
    // O fluxo do bot continua normalmente mesmo com erro na planilha
  }
  
  // Resposta padrão do bot (pode ser personalizada conforme necessário)
  const welcomeMessage = `🤖 Olá ${firstName}! Bem-vindo ao bot!\n\n` +
                        `Este é um bot de exemplo que registra eventos na planilha do Google Sheets.`;
  
  await bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'HTML' });
});

// Handler para erros gerais do bot
bot.on('error', (error) => {
  console.error('[BOT1] ❌ Erro no bot:', error.message);
});

// Handler para quando o bot é iniciado
bot.on('polling_error', (error) => {
  console.error('[BOT1] ❌ Erro de polling:', error.message);
});

// Função para iniciar o bot
function iniciarBot() {
  if (!process.env.TELEGRAM_TOKEN) {
    console.error('[BOT1] ❌ TELEGRAM_TOKEN não definido nas variáveis de ambiente');
    return;
  }
  
  if (!process.env.GOOGLE_SHEETS_ID) {
    console.error('[BOT1] ❌ GOOGLE_SHEETS_ID não definido nas variáveis de ambiente');
    return;
  }
  
  console.log('[BOT1] 🚀 Bot iniciado com sucesso!');
  console.log('[BOT1] 📊 Integração com Google Sheets ativa');
}

// Iniciar o bot
iniciarBot();

module.exports = { bot, iniciarBot };