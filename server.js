require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');

// Middleware básico
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Tratamento de erros não capturados
process.on('uncaughtException', (err) => {
  console.error('❌ Erro não capturado:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promise rejeitada não tratada:', reason);
  process.exit(1);
});

// Inicializar módulos
try {
  // Inicializa o backend Web (rotas, tokens etc) - AJUSTAR CAMINHO
  const webModule = require('./MODELO1/WEB/server');
  if (typeof webModule === 'function') {
    webModule(app);
  }
  
  // Ativa o bot (já cuida do setWebHook internamente) - AJUSTAR CAMINHO
  require('./MODELO1/BOT/bot');
  
} catch (error) {
  console.error('❌ Erro ao inicializar módulos:', error);
  
  // Fallback - tentar caminhos alternativos
  try {
    console.log('🔄 Tentando caminhos alternativos...');
    
    // Se os arquivos estão na raiz
    if (require('fs').existsSync('./bot.js')) {
      require('./bot');
    }
    
  } catch (fallbackError) {
    console.error('❌ Erro no fallback:', fallbackError);
    process.exit(1);
  }
}

// Rota de saúde
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Start do servidor
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 Recebido SIGTERM, fechando servidor...');
  server.close(() => {
    console.log('✅ Servidor fechado');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('📴 Recebido SIGINT, fechando servidor...');
  server.close(() => {
    console.log('✅ Servidor fechado');
    process.exit(0);
  });
});