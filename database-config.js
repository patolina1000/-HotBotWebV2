// database-config.js - Configurações específicas do banco de dados
require('dotenv').config();

// 🔧 Função para configurar SSL de forma inteligente
function getSSLConfig(environment) {
  // Se PGSSLMODE está definido, usar essa configuração
  if (process.env.PGSSLMODE) {
    switch (process.env.PGSSLMODE.toLowerCase()) {
      case 'disable':
        return false;
      case 'require':
      case 'verify-ca':
      case 'verify-full':
        return { rejectUnauthorized: false };
      default:
        return false;
    }
  }
  
  // Se NODE_ENV é production, usar SSL com rejectUnauthorized: false
  if (environment === 'production') {
    return { rejectUnauthorized: false };
  }
  
  // Para desenvolvimento e teste, desabilitar SSL por padrão
  return false;
}

// Configuração para diferentes ambientes
const config = {
  development: {
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/hotbot_dev',
    ssl: getSSLConfig('development'),
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  },
  production: {
    connectionString: process.env.DATABASE_URL,
    ssl: getSSLConfig('production'),
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
    query_timeout: 30000
  },
  test: {
    connectionString: process.env.TEST_DATABASE_URL || 'postgresql://localhost:5432/hotbot_test',
    ssl: getSSLConfig('test'),
    max: 2,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000
  }
};

// Detectar ambiente
const environment = process.env.NODE_ENV || 'production';

// Exportar configuração do ambiente atual
const currentConfig = config[environment];

if (!currentConfig) {
  throw new Error(`Configuração para ambiente '${environment}' não encontrada`);
}

// Validar configuração
if (!currentConfig.connectionString) {
  throw new Error(`DATABASE_URL não definida para ambiente '${environment}'`);
}

// Log da configuração (sem dados sensíveis)
console.log('🔧 Configuração do banco de dados carregada:');
console.log('- Ambiente:', environment);
console.log('- URL:', currentConfig.connectionString.replace(/:([^:@]+)@/, ':***@'));
console.log('- SSL:', currentConfig.ssl ? 'Habilitado' : 'Desabilitado');
console.log('- Max conexões:', currentConfig.max);

module.exports = {
  config: currentConfig,
  environment,
  allConfigs: config
};