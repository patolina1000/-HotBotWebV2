#!/usr/bin/env node

const request = require('supertest');
const express = require('express');

console.log('🧪 Testando rota /api/config com supertest (versão isolada)...\n');

// Mock do bootstrap
const mockBootstrap = {
  isReady: () => false,
  getDatabasePool: () => null
};

// Criar app Express simples para teste
const app = express();
app.use(express.json());

// Recriar a rota /api/config isoladamente (sem importar o facebook service)
app.get('/api/config', (req, res) => {
  // Verificar se o bootstrap está pronto
  if (!mockBootstrap.isReady()) {
    console.log('[ROUTES_CONFIG_503] Sistema ainda não está pronto, retornando 503');
    return res.status(503).json({
      status: 'starting',
      message: 'Sistema ainda não está pronto'
    });
  }
  
  console.log('[ROUTES_CONFIG_200] Configuração do Facebook Pixel servida com sucesso');
  res.json({
    FB_PIXEL_ID: process.env.FB_PIXEL_ID || ''
  });
});

// Função para executar testes
async function runTests() {
  console.log('1️⃣ Testando resposta 503 quando bootstrap não está pronto...');
  
  // Configurar mock para retornar false
  mockBootstrap.isReady = () => false;
  
  try {
    const response = await request(app)
      .get('/api/config')
      .expect(503);
    
    console.log('✅ Teste 503 passou:', response.body);
  } catch (err) {
    console.log('❌ Teste 503 falhou:', err.message);
    if (err.response) {
      console.log('   Status:', err.response.status);
      console.log('   Body:', err.response.body);
    }
  }
  
  console.log('\n2️⃣ Testando resposta 200 quando bootstrap está pronto...');
  
  // Configurar mock para retornar true
  mockBootstrap.isReady = () => true;
  
  // Mock da variável de ambiente
  const originalEnv = process.env.FB_PIXEL_ID;
  process.env.FB_PIXEL_ID = 'test_pixel_id';
  
  try {
    const response = await request(app)
      .get('/api/config')
      .expect(200);
    
    console.log('✅ Teste 200 passou:', response.body);
  } catch (err) {
    console.log('❌ Teste 200 falhou:', err.message);
    if (err.response) {
      console.log('   Status:', err.response.status);
      console.log('   Body:', err.response.body);
    }
  }
  
  // Restaurar variável de ambiente
  process.env.FB_PIXEL_ID = originalEnv;
  
  console.log('\n🎯 Testes concluídos!');
}

// Executar testes
runTests().catch(console.error);