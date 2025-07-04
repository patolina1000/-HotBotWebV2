// server.js - Arquivo de entrada principal para o Render
// Compatível com suas versões atuais das dependências

console.log('🚀 Iniciando servidor SiteHot...');
console.log('📁 Executando a partir de:', __dirname);
console.log('🔧 Node.js versão:', process.version);
console.log('🌍 Ambiente:', process.env.NODE_ENV || 'development');

// Verificar se o arquivo principal existe
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// Verificar variáveis de ambiente essenciais
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const BASE_URL = process.env.BASE_URL;
const PORT = process.env.PORT || 3000;

if (!TELEGRAM_TOKEN) {
  console.error('❌ TELEGRAM_TOKEN não definido!');
  process.exit(1);
}

if (!BASE_URL) {
  console.error('❌ BASE_URL não definido!');
  process.exit(1);
}

console.log('🔐 TELEGRAM_TOKEN:', TELEGRAM_TOKEN ? 'DEFINIDO' : 'NÃO DEFINIDO');
console.log('🌐 BASE_URL:', BASE_URL);
console.log('🚪 PORT:', PORT);

// Inicializar Express
const app = express();

// Middlewares básicos
app.use(helmet({
  contentSecurityPolicy: false, // Desabilitar CSP para compatibilidade
}));

app.use(compression());
app.use(cors({
  origin: true,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // máximo 100 requests por IP por janela
});
app.use(limiter);

// Middlewares para parsing do body
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware para logging
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

// Verificar se o arquivo principal existe
const appPath = path.join(__dirname, 'app.js');
const botPath = path.join(__dirname, 'MODELO1', 'BOT', 'bot.js');

if (!fs.existsSync(appPath)) {
  console.error('❌ Arquivo app.js não encontrado!');
  console.log('📂 Arquivos disponíveis:', fs.readdirSync(__dirname));
  process.exit(1);
}

if (!fs.existsSync(botPath)) {
  console.error('❌ Arquivo bot.js não encontrado!');
  console.log('📂 Arquivos disponíveis na raiz:', fs.readdirSync(__dirname));
  
  // Verificar se existe a pasta MODELO1
  const modelo1Path = path.join(__dirname, 'MODELO1');
  if (fs.existsSync(modelo1Path)) {
    console.log('📂 Arquivos em MODELO1:', fs.readdirSync(modelo1Path));
    
    // Verificar se existe a pasta BOT dentro de MODELO1
    const botFolderPath = path.join(__dirname, 'MODELO1', 'BOT');
    if (fs.existsSync(botFolderPath)) {
      console.log('📂 Arquivos em MODELO1/BOT:', fs.readdirSync(botFolderPath));
    }
  }
  
  process.exit(1);
}

// Importar e configurar o bot
let bot, gerarCobranca, webhookPushinPay, gerenciadorMidia;

try {
  const botModule = require('./MODELO1/BOT/bot.js');
  bot = botModule.bot;
  gerarCobranca = botModule.gerarCobranca;
  webhookPushinPay = botModule.webhookPushinPay;
  gerenciadorMidia = botModule.gerenciadorMidia;
  
  console.log('✅ Bot carregado com sucesso');
} catch (error) {
  console.error('❌ Erro ao carregar bot:', error.message);
  console.error('📍 Stack trace:', error.stack);
  process.exit(1);
}

// Configurar webhook do Telegram
const webhookPath = `/bot${TELEGRAM_TOKEN}`;
console.log('🔗 Configurando webhook no caminho:', webhookPath);

app.post(webhookPath, (req, res) => {
  try {
    console.log('📨 Webhook do Telegram recebido:', {
      body: req.body,
      headers: req.headers['content-type']
    });
    
    if (!bot) {
      console.error('❌ Bot não inicializado');
      return res.status(500).json({ error: 'Bot não inicializado' });
    }
    
    // Processar update do Telegram
    bot.processUpdate(req.body);
    res.sendStatus(200);
    
  } catch (error) {
    console.error('❌ Erro ao processar webhook do Telegram:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Webhook do PushinPay
app.post('/webhook/pushinpay', async (req, res) => {
  try {
    console.log('💰 Webhook PushinPay recebido');
    
    if (!webhookPushinPay) {
      console.error('❌ Função webhookPushinPay não disponível');
      return res.status(500).json({ error: 'Webhook handler não disponível' });
    }
    
    await webhookPushinPay(req, res);
    
  } catch (error) {
    console.error('❌ Erro no webhook PushinPay:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// API para gerar cobrança
app.post('/api/gerar-cobranca', async (req, res) => {
  try {
    console.log('💳 API gerar cobrança chamada');
    
    if (!gerarCobranca) {
      console.error('❌ Função gerarCobranca não disponível');
      return res.status(500).json({ error: 'Função de cobrança não disponível' });
    }
    
    await gerarCobranca(req, res);
    
  } catch (error) {
    console.error('❌ Erro na API de cobrança:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota de teste
app.get('/test', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    webhook_url: `${BASE_URL}${webhookPath}`,
    bot_status: bot ? 'Inicializado' : 'Não inicializado'
  });
});

// Rota de saúde
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

// Rota root
app.get('/', (req, res) => {
  res.json({
    message: 'SiteHot Bot API',
    status: 'running',
    webhook_configured: !!bot,
    webhook_path: webhookPath
  });
});

// Tentar carregar app.js (rotas adicionais)
try {
  const appRoutes = require('./app.js');
  if (typeof appRoutes === 'function') {
    // Se app.js exporta uma função, chamá-la com o app
    appRoutes(app);
  } else if (appRoutes && typeof appRoutes.setup === 'function') {
    // Se app.js exporta um objeto com função setup
    appRoutes.setup(app);
  }
  console.log('✅ Rotas adicionais do app.js carregadas');
} catch (error) {
  console.warn('⚠️ Erro ao carregar app.js (continuando sem ele):', error.message);
}

// Servir arquivos estáticos se a pasta existir
const publicPath = path.join(__dirname, 'public');
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
  console.log('✅ Servindo arquivos estáticos da pasta public');
}

// Middleware para rotas não encontradas
app.use((req, res) => {
  console.log(`❌ Rota não encontrada: ${req.method} ${req.path}`);
  res.status(404).json({
    error: 'Página não encontrada',
    path: req.path,
    method: req.method
  });
});

// Middleware para tratamento de erros
app.use((error, req, res, next) => {
  console.error('❌ Erro não tratado:', error);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Algo deu errado'
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🌐 URL base: ${BASE_URL}`);
  console.log(`🔗 Webhook URL: ${BASE_URL}${webhookPath}`);
  console.log(`📡 Rotas disponíveis:`);
  console.log(`   GET  /              - Informações básicas`);
  console.log(`   GET  /health        - Status de saúde`);
  console.log(`   GET  /test          - Teste de configuração`);
  console.log(`   POST ${webhookPath} - Webhook do Telegram`);
  console.log(`   POST /webhook/pushinpay - Webhook PushinPay`);
  console.log(`   POST /api/gerar-cobranca - API de cobrança`);
  console.log(`\n✅ Servidor pronto para receber webhooks!`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔄 Recebido SIGTERM, encerrando servidor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🔄 Recebido SIGINT, encerrando servidor...');
  process.exit(0);
});

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
  console.error('❌ Erro não capturado:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promise rejeitada não tratada:', reason);
  process.exit(1);
});

console.log('✅ Aplicação principal carregada com sucesso');