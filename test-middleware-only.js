#!/usr/bin/env node

/**
 * Teste da Lógica do Middleware de Autenticação
 * 
 * Este script testa apenas a lógica do middleware sem precisar do servidor rodando
 */

// Simular o middleware de autenticação
function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  return (req.query.token || '').toString().trim();
}

function authDashboard(req, res, next) {
  const cfg = process.env.PANEL_ACCESS_TOKEN;
  if (!cfg) {
    return res.status(503).json({ error: 'PANEL_ACCESS_TOKEN não configurado' });
  }
  const token = extractToken(req);
  if (!token || token !== cfg) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  return next();
}

// Função para simular uma requisição
function simulateRequest(headers = {}, query = {}) {
  return {
    headers,
    query
  };
}

// Função para simular uma resposta
function simulateResponse() {
  const response = {
    status: null,
    json: null
  };
  
  return {
    status: (code) => {
      response.status = code;
      return {
        json: (data) => {
          response.json = data;
          return response;
        }
      };
    }
  };
}

// Testes
function runTests() {
  console.log('🧪 Testando lógica do middleware de autenticação...');
  
  let testsPassed = 0;
  let totalTests = 0;
  
  // Teste 1: Token via header Authorization
  totalTests++;
  process.env.PANEL_ACCESS_TOKEN = 'test-token-123';
  const req1 = simulateRequest(
    { authorization: 'Bearer test-token-123' },
    {}
  );
  const res1 = simulateResponse();
  const result1 = authDashboard(req1, res1, () => 'next-called');
  
  if (result1 === 'next-called') {
    console.log('✅ Token via header Authorization - aceito');
    testsPassed++;
  } else {
    console.log('❌ Token via header Authorization - rejeitado incorretamente');
  }
  
  // Teste 2: Token via query parameter
  totalTests++;
  const req2 = simulateRequest(
    {},
    { token: 'test-token-123' }
  );
  const res2 = simulateResponse();
  const result2 = authDashboard(req2, res2, () => 'next-called');
  
  if (result2 === 'next-called') {
    console.log('✅ Token via query parameter - aceito');
    testsPassed++;
  } else {
    console.log('❌ Token via query parameter - rejeitado incorretamente');
  }
  
  // Teste 3: Token ausente
  totalTests++;
  process.env.PANEL_ACCESS_TOKEN = 'test-token-123'; // Restaurar token
  const req3 = simulateRequest({}, {});
  const res3 = simulateResponse();
  const result3 = authDashboard(req3, res3, () => 'next-called');
  
  if (result3 !== 'next-called' && res3.status === 401) {
    console.log('✅ Token ausente - rejeitado corretamente');
    testsPassed++;
  } else {
    console.log('❌ Token ausente - aceito incorretamente');
  }
  
  // Teste 4: Token inválido
  totalTests++;
  const req4 = simulateRequest(
    { authorization: 'Bearer invalid-token' },
    {}
  );
  const res4 = simulateResponse();
  const result4 = authDashboard(req4, res4, () => 'next-called');
  
  if (result4 !== 'next-called' && res4.status === 401) {
    console.log('✅ Token inválido - rejeitado corretamente');
    testsPassed++;
  } else {
    console.log('❌ Token inválido - aceito incorretamente');
  }
  
  // Teste 5: PANEL_ACCESS_TOKEN não configurado
  totalTests++;
  delete process.env.PANEL_ACCESS_TOKEN;
  const req5 = simulateRequest(
    { authorization: 'Bearer any-token' },
    {}
  );
  const res5 = simulateResponse();
  const result5 = authDashboard(req5, res5, () => 'next-called');
  
  if (result5 !== 'next-called' && res5.status === 503) {
    console.log('✅ PANEL_ACCESS_TOKEN não configurado - 503 retornado');
    testsPassed++;
  } else {
    console.log('❌ PANEL_ACCESS_TOKEN não configurado - comportamento incorreto');
  }
  
  // Teste 6: Extração de token do header
  totalTests++;
  const req6 = simulateRequest(
    { authorization: 'Bearer test-token-123' },
    {}
  );
  const extractedToken = extractToken(req6);
  
  if (extractedToken === 'test-token-123') {
    console.log('✅ Extração de token do header - funcionando');
    testsPassed++;
  } else {
    console.log('❌ Extração de token do header - falhou');
  }
  
  // Teste 7: Extração de token da query
  totalTests++;
  const req7 = simulateRequest(
    {},
    { token: 'query-token-456' }
  );
  const extractedToken2 = extractToken(req7);
  
  if (extractedToken2 === 'query-token-456') {
    console.log('✅ Extração de token da query - funcionando');
    testsPassed++;
  } else {
    console.log('❌ Extração de token da query - falhou');
  }
  
  // Teste 8: Prioridade do header sobre query
  totalTests++;
  const req8 = simulateRequest(
    { authorization: 'Bearer header-token' },
    { token: 'query-token' }
  );
  const extractedToken3 = extractToken(req8);
  
  if (extractedToken3 === 'header-token') {
    console.log('✅ Prioridade do header sobre query - funcionando');
    testsPassed++;
  } else {
    console.log('❌ Prioridade do header sobre query - falhou');
  }
  
  console.log(`\n📊 Resultado: ${testsPassed}/${totalTests} testes passaram`);
  
  if (testsPassed === totalTests) {
    console.log('🎉 Todos os testes passaram! A lógica do middleware está correta.');
    return true;
  } else {
    console.log('❌ Alguns testes falharam. Verifique a implementação.');
    return false;
  }
}

// Executar testes
const success = runTests();
process.exit(success ? 0 : 1);