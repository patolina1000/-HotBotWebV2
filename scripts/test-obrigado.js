#!/usr/bin/env node

/**
 * Script para testar manualmente a rota /obrigado
 * Uso: node scripts/test-obrigado.js <token>
 */

const http = require('http');

const token = process.argv[2];

if (!token) {
  console.error('❌ Token não fornecido');
  console.log('Uso: node scripts/test-obrigado.js <token>');
  process.exit(1);
}

const options = {
  hostname: 'localhost',
  port: 3000,
  path: `/obrigado?token=${encodeURIComponent(token)}`,
  method: 'GET',
  headers: {
    'User-Agent': 'test-obrigado-script/1.0'
  }
};

console.log(`🔍 Testando rota /obrigado com token: ${token.substring(0, 8)}...`);
console.log(`📡 URL: http://localhost:3000${options.path}`);

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log(`\n📊 Status: ${res.statusCode} ${res.statusMessage}`);
    console.log(`📋 Headers:`);
    Object.entries(res.headers).forEach(([key, value]) => {
      console.log(`   ${key}: ${value}`);
    });
    console.log(`\n📝 Corpo da resposta:`);
    console.log(data);
    
    if (res.statusCode === 200) {
      console.log('\n✅ Sucesso! Resposta recebida corretamente.');
    } else if (res.statusCode === 429) {
      console.log('\n⚠️  Rate limit atingido. Aguarde um pouco antes de tentar novamente.');
    } else if (res.statusCode >= 400) {
      console.log('\n❌ Erro na requisição.');
    }
  });
});

req.on('error', (err) => {
  console.error('❌ Erro na requisição:', err.message);
  if (err.code === 'ECONNREFUSED') {
    console.log('💡 Certifique-se de que o servidor está rodando em localhost:3000');
  }
});

req.setTimeout(10000, () => {
  console.error('⏰ Timeout da requisição (10s)');
  req.destroy();
});

req.end();
