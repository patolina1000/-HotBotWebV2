#!/usr/bin/env node

/**
 * Teste do Sistema de Autenticação do Dashboard de Logs
 * 
 * Este script testa:
 * 1. Acesso ao dashboard sem token (deve funcionar)
 * 2. APIs negando acesso sem token (deve retornar 401)
 * 3. APIs aceitando token via header Authorization
 * 4. APIs aceitando token via query parameter
 * 5. Comportamento quando PANEL_ACCESS_TOKEN não está configurado
 */

const http = require('http');
const https = require('https');

// Configuração
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_TOKEN = process.env.PANEL_ACCESS_TOKEN || 'test-token-123';
const INVALID_TOKEN = 'invalid-token';

// Função para fazer requisições HTTP
function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const requestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };
    
    const req = client.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = data ? JSON.parse(data) : null;
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: jsonData
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: data
          });
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    
    req.end();
  });
}

// Funções de teste
async function testDashboardAccess() {
  console.log('\n🔍 Testando acesso ao dashboard...');
  
  try {
    const response = await makeRequest('/logs-dashboard');
    if (response.status === 200) {
      console.log('✅ Dashboard acessível sem token (correto)');
      return true;
    } else {
      console.log(`❌ Dashboard retornou status ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Erro ao acessar dashboard: ${error.message}`);
    return false;
  }
}

async function testApiWithoutToken() {
  console.log('\n🔍 Testando APIs sem token...');
  
  const apis = ['/api/logs', '/api/logs/stats', '/api/logs/export'];
  let allPassed = true;
  
  for (const api of apis) {
    try {
      const response = await makeRequest(api);
      if (response.status === 401) {
        console.log(`✅ ${api} - Negado sem token (correto)`);
      } else {
        console.log(`❌ ${api} - Retornou ${response.status} (esperado 401)`);
        allPassed = false;
      }
    } catch (error) {
      console.log(`❌ ${api} - Erro: ${error.message}`);
      allPassed = false;
    }
  }
  
  return allPassed;
}

async function testApiWithHeaderToken() {
  console.log('\n🔍 Testando APIs com token via header...');
  
  const apis = ['/api/logs', '/api/logs/stats', '/api/logs/export'];
  let allPassed = true;
  
  for (const api of apis) {
    try {
      const response = await makeRequest(api, {
        headers: {
          'Authorization': `Bearer ${TEST_TOKEN}`
        }
      });
      
      if (response.status === 200) {
        console.log(`✅ ${api} - Aceito com header token (correto)`);
      } else if (response.status === 503) {
        console.log(`⚠️  ${api} - PANEL_ACCESS_TOKEN não configurado`);
      } else {
        console.log(`❌ ${api} - Retornou ${response.status} (esperado 200 ou 503)`);
        allPassed = false;
      }
    } catch (error) {
      console.log(`❌ ${api} - Erro: ${error.message}`);
      allPassed = false;
    }
  }
  
  return allPassed;
}

async function testApiWithQueryToken() {
  console.log('\n🔍 Testando APIs com token via query...');
  
  const apis = ['/api/logs', '/api/logs/stats', '/api/logs/export'];
  let allPassed = true;
  
  for (const api of apis) {
    try {
      const response = await makeRequest(`${api}?token=${TEST_TOKEN}`);
      
      if (response.status === 200) {
        console.log(`✅ ${api} - Aceito com query token (correto)`);
      } else if (response.status === 503) {
        console.log(`⚠️  ${api} - PANEL_ACCESS_TOKEN não configurado`);
      } else {
        console.log(`❌ ${api} - Retornou ${response.status} (esperado 200 ou 503)`);
        allPassed = false;
      }
    } catch (error) {
      console.log(`❌ ${api} - Erro: ${error.message}`);
      allPassed = false;
    }
  }
  
  return allPassed;
}

async function testInvalidToken() {
  console.log('\n🔍 Testando APIs com token inválido...');
  
  const apis = ['/api/logs', '/api/logs/stats', '/api/logs/export'];
  let allPassed = true;
  
  for (const api of apis) {
    try {
      const response = await makeRequest(`${api}?token=${INVALID_TOKEN}`);
      
      if (response.status === 401) {
        console.log(`✅ ${api} - Negado com token inválido (correto)`);
      } else if (response.status === 503) {
        console.log(`⚠️  ${api} - PANEL_ACCESS_TOKEN não configurado`);
      } else {
        console.log(`❌ ${api} - Retornou ${response.status} (esperado 401 ou 503)`);
        allPassed = false;
      }
    } catch (error) {
      console.log(`❌ ${api} - Erro: ${error.message}`);
      allPassed = false;
    }
  }
  
  return allPassed;
}

// Função principal
async function runTests() {
  console.log('🚀 Iniciando testes do sistema de autenticação do dashboard');
  console.log(`📍 URL base: ${BASE_URL}`);
  console.log(`🔑 Token de teste: ${TEST_TOKEN.substring(0, 3)}***`);
  
  const results = {
    dashboard: await testDashboardAccess(),
    noToken: await testApiWithoutToken(),
    headerToken: await testApiWithHeaderToken(),
    queryToken: await testApiWithQueryToken(),
    invalidToken: await testInvalidToken()
  };
  
  console.log('\n📊 Resumo dos testes:');
  console.log(`Dashboard acessível: ${results.dashboard ? '✅' : '❌'}`);
  console.log(`APIs negam sem token: ${results.noToken ? '✅' : '❌'}`);
  console.log(`APIs aceitam header token: ${results.headerToken ? '✅' : '❌'}`);
  console.log(`APIs aceitam query token: ${results.queryToken ? '✅' : '❌'}`);
  console.log(`APIs negam token inválido: ${results.invalidToken ? '✅' : '❌'}`);
  
  const allPassed = Object.values(results).every(result => result);
  
  if (allPassed) {
    console.log('\n🎉 Todos os testes passaram!');
    process.exit(0);
  } else {
    console.log('\n❌ Alguns testes falharam.');
    process.exit(1);
  }
}

// Executar testes
runTests().catch(error => {
  console.error('💥 Erro durante os testes:', error);
  process.exit(1);
});