#!/usr/bin/env node

/**
 * Script para configurar variáveis de ambiente e resolver erro SSL/TLS
 * Execute este script antes de rodar os testes: node env-setup.js
 */

// Configurar variáveis de ambiente para resolver erro SSL/TLS
process.env.PGSSLMODE = 'disable';
process.env.NODE_ENV = 'development';

// Configurações do banco de dados local
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://localhost:5432/hotbot_dev';
}

// Configurações da Kwai (usar valores de teste se não estiverem definidos)
if (!process.env.KWAI_PIXEL_ID) {
  process.env.KWAI_PIXEL_ID = 'TEST_PIXEL_ID';
}

if (!process.env.KWAI_ACCESS_TOKEN) {
  process.env.KWAI_ACCESS_TOKEN = 'TEST_ACCESS_TOKEN';
}

console.log('🔧 Variáveis de ambiente configuradas:');
console.log('✅ PGSSLMODE:', process.env.PGSSLMODE);
console.log('✅ NODE_ENV:', process.env.NODE_ENV);
console.log('✅ DATABASE_URL:', process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':***@'));
console.log('✅ KWAI_PIXEL_ID:', process.env.KWAI_PIXEL_ID);
console.log('✅ KWAI_ACCESS_TOKEN:', process.env.KWAI_ACCESS_TOKEN.substring(0, 10) + '...');

console.log('\n🚀 Agora você pode executar:');
console.log('   node test-tracking-completo.js');
console.log('   ou');
console.log('   node init-postgres.js');

// Exportar configurações para uso em outros módulos
module.exports = {
  PGSSLMODE: process.env.PGSSLMODE,
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  KWAI_PIXEL_ID: process.env.KWAI_PIXEL_ID,
  KWAI_ACCESS_TOKEN: process.env.KWAI_ACCESS_TOKEN
};
