#!/usr/bin/env node

/**
 * 🚀 TESTE DO SISTEMA DE PING - FASE 1.5
 * Script para testar o sistema de keep-alive antes do deploy
 */

const https = require('https');
const http = require('http');

const RENDER_URL = 'https://ohvips.xyz';
const LOCAL_URL = 'http://localhost:3000';

async function testarEndpoint(url, endpoint) {
  return new Promise((resolve) => {
    const fullUrl = `${url}${endpoint}`;
    const client = url.startsWith('https') ? https : http;
    
    console.log(`🔍 Testando: ${fullUrl}`);
    
    const startTime = Date.now();
    
    const req = client.get(fullUrl, (res) => {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          duration,
          data: data.slice(0, 100), // Primeiros 100 chars
          headers: res.headers
        });
      });
    });
    
    req.on('error', (error) => {
      const endTime = Date.now();
      resolve({
        status: 'ERROR',
        duration: endTime - startTime,
        error: error.message
      });
    });
    
    req.setTimeout(10000, () => {
      req.destroy();
      resolve({
        status: 'TIMEOUT',
        duration: 10000,
        error: 'Request timeout'
      });
    });
  });
}

async function testarSistemaLocal() {
  console.log('🏠 TESTANDO ENDPOINTS LOCAIS\n');
  
  const endpoints = ['/ping', '/health-basic', '/debug/status'];
  
  for (const endpoint of endpoints) {
    try {
      const result = await testarEndpoint(LOCAL_URL, endpoint);
      
      if (result.status === 200) {
        console.log(`✅ ${endpoint}: ${result.duration}ms - OK`);
      } else if (result.status === 'ERROR' && result.error.includes('ECONNREFUSED')) {
        console.log(`⚠️ ${endpoint}: Servidor local não está rodando`);
      } else {
        console.log(`❌ ${endpoint}: Status ${result.status} - ${result.duration}ms`);
      }
    } catch (error) {
      console.log(`❌ ${endpoint}: Erro - ${error.message}`);
    }
  }
}

async function testarSistemaRemoto() {
  console.log('\n🌐 TESTANDO ENDPOINTS REMOTOS (ohvips.xyz)\n');
  
  const endpoints = ['/ping', '/health-basic'];
  
  for (const endpoint of endpoints) {
    try {
      const result = await testarEndpoint(RENDER_URL, endpoint);
      
      if (result.status === 200) {
        console.log(`✅ ${endpoint}: ${result.duration}ms - OK`);
        if (endpoint === '/ping' && result.data) {
          console.log(`   📝 Resposta: "${result.data.trim()}"`);
        }
      } else {
        console.log(`❌ ${endpoint}: Status ${result.status} - ${result.duration}ms`);
        if (result.error) {
          console.log(`   🔍 Erro: ${result.error}`);
        }
      }
    } catch (error) {
      console.log(`❌ ${endpoint}: Erro - ${error.message}`);
    }
    
    // Pequena pausa entre requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

async function simularGitHubAction() {
  console.log('\n🤖 SIMULANDO GITHUB ACTION\n');
  
  const startTime = Date.now();
  
  try {
    const result = await testarEndpoint(RENDER_URL, '/ping');
    const endTime = Date.now();
    
    console.log('📊 RESULTADO DA SIMULAÇÃO:');
    console.log(`⏱️  Tempo total: ${endTime - startTime}ms`);
    console.log(`🎯 Status: ${result.status}`);
    console.log(`📡 Latência: ${result.duration}ms`);
    
    if (result.status === 200) {
      console.log('✅ GitHub Action funcionará corretamente!');
    } else {
      console.log('❌ GitHub Action pode falhar');
    }
    
  } catch (error) {
    console.log(`❌ Simulação falhou: ${error.message}`);
  }
}

async function executarTestes() {
  console.log('🚀 TESTE DO SISTEMA DE PING - ANTI COLD START\n');
  console.log('=' .repeat(60));
  
  await testarSistemaLocal();
  await testarSistemaRemoto();
  await simularGitHubAction();
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMO:');
  console.log('🎯 Objetivo: Manter servidor ativo com pings a cada 5min');
  console.log('📡 Endpoint: /ping (ultra-rápido)');
  console.log('🤖 GitHub Action: keep-alive.yml');
  console.log('📈 Resultado esperado: 90% redução de cold starts');
  console.log('\n💡 Próximo passo: Commit + Push para ativar o sistema!');
}

if (require.main === module) {
  executarTestes().catch(console.error);
}
