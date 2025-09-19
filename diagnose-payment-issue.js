#!/usr/bin/env node

/**
 * Script de Diagnóstico - Problema de Pagamento PIX não Identificado
 * 
 * Este script analisa todos os componentes do sistema para identificar
 * por que os pagamentos PIX não estão sendo identificados após confirmação.
 */

const axios = require('axios');
const sqlite3 = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Configurações
const SERVER_URL = process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:3000';
const DB_PATH = './pagamentos.db';

/**
 * Verifica conectividade com Oasyfy
 */
async function checkOasyfyConnectivity() {
  console.log('\n🔗 Verificando conectividade com Oasyfy...');
  
  try {
    if (!process.env.OASYFY_PUBLIC_KEY || !process.env.OASYFY_SECRET_KEY) {
      console.log('❌ Credenciais Oasyfy não configuradas');
      return false;
    }
    
    const response = await axios.get('https://app.oasyfy.com/api/v1/ping', {
      headers: {
        'x-public-key': process.env.OASYFY_PUBLIC_KEY,
        'x-secret-key': process.env.OASYFY_SECRET_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('✅ Oasyfy API acessível:', response.data);
    return true;
  } catch (error) {
    console.error('❌ Erro ao conectar com Oasyfy:', error.message);
    return false;
  }
}

/**
 * Verifica webhook endpoint
 */
async function checkWebhookEndpoint() {
  console.log('\n📡 Verificando endpoint de webhook...');
  
  const webhookUrl = `${SERVER_URL}/webhook/unified`;
  console.log('📍 URL:', webhookUrl);
  
  try {
    const response = await axios.post(webhookUrl, {
      test: true,
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Diagnostic-Test/1.0'
      },
      timeout: 10000
    });
    
    console.log('✅ Webhook endpoint responde:', response.status);
    return true;
  } catch (error) {
    if (error.response) {
      console.log(`⚠️ Webhook responde com erro: ${error.response.status}`);
      console.log('📋 Resposta:', error.response.data);
      return error.response.status < 500; // 4xx ainda indica que endpoint existe
    } else {
      console.error('❌ Webhook inacessível:', error.message);
      return false;
    }
  }
}

/**
 * Analisa banco de dados
 */
async function analyzeDatabaseState() {
  console.log('\n💾 Analisando estado do banco de dados...');
  
  if (!fs.existsSync(DB_PATH)) {
    console.error('❌ Banco de dados não encontrado:', DB_PATH);
    return false;
  }
  
  try {
    const db = sqlite3(DB_PATH);
    
    // Verificar tabela tokens
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('📋 Tabelas encontradas:', tables.map(t => t.name));
    
    if (!tables.some(t => t.name === 'tokens')) {
      console.error('❌ Tabela tokens não encontrada');
      return false;
    }
    
    // Analisar transações recentes
    const recentTransactions = db.prepare(`
      SELECT id_transacao, telegram_id, bot_id, status, created_at, paid_at, is_paid
      FROM tokens 
      WHERE created_at > datetime('now', '-1 day')
      ORDER BY created_at DESC 
      LIMIT 10
    `).all();
    
    console.log('📊 Transações recentes (últimas 24h):');
    if (recentTransactions.length === 0) {
      console.log('   Nenhuma transação encontrada');
    } else {
      recentTransactions.forEach((tx, i) => {
        console.log(`   ${i + 1}. ${tx.id_transacao}`);
        console.log(`      Status: ${tx.status} | Pago: ${tx.is_paid ? 'Sim' : 'Não'}`);
        console.log(`      Bot: ${tx.bot_id} | Telegram: ${tx.telegram_id}`);
        console.log(`      Criado: ${tx.created_at} | Pago em: ${tx.paid_at || 'N/A'}`);
      });
    }
    
    // Estatísticas gerais
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'pago' THEN 1 END) as paid,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN is_paid = 1 THEN 1 END) as is_paid_true
      FROM tokens
      WHERE created_at > datetime('now', '-7 days')
    `).get();
    
    console.log('📈 Estatísticas (últimos 7 dias):');
    console.log(`   Total: ${stats.total}`);
    console.log(`   Pagos: ${stats.paid} (${((stats.paid / stats.total) * 100).toFixed(1)}%)`);
    console.log(`   Pendentes: ${stats.pending} (${((stats.pending / stats.total) * 100).toFixed(1)}%)`);
    console.log(`   is_paid=1: ${stats.is_paid_true}`);
    
    db.close();
    return true;
  } catch (error) {
    console.error('❌ Erro ao analisar banco de dados:', error.message);
    return false;
  }
}

/**
 * Testa processamento de webhook simulado
 */
async function testWebhookProcessing() {
  console.log('\n🧪 Testando processamento de webhook...');
  
  const testTransactionId = `diag_test_${Date.now()}`;
  const webhookPayload = {
    event: "TRANSACTION_PAID",
    token: "diagtest123",
    client: {
      id: "diag_client_123",
      name: "Diagnóstico Teste",
      email: "diagnostico@teste.com",
      phone: "(11) 99999-9999",
      cpf: "12345678900"
    },
    transaction: {
      id: testTransactionId,
      identifier: `checkout_web_${testTransactionId}`,
      status: "COMPLETED",
      paymentMethod: "PIX",
      originalCurrency: "BRL",
      originalAmount: 1,
      currency: "BRL",
      amount: 1,
      exchangeRate: 1,
      createdAt: new Date().toISOString(),
      payedAt: new Date().toISOString(),
      pixInformation: {
        qrCode: "00020101021226810014br.gov.bcb.pix2559qr.woovi.com/qr/v2/cob/diagnostic",
        endToEndId: "E12345678901234567890123456789012345"
      }
    },
    orderItems: [{
      id: "item_diag_123",
      price: 1,
      product: {
        id: "plano_padrao",
        name: "DIAGNÓSTICO TESTE"
      }
    }]
  };
  
  try {
    console.log('📤 Enviando webhook de teste...');
    
    const response = await axios.post(`${SERVER_URL}/webhook/unified`, webhookPayload, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Diagnostic-Webhook/1.0'
      },
      timeout: 30000
    });
    
    console.log('✅ Webhook processado:');
    console.log('   Status:', response.status);
    console.log('   Resposta:', JSON.stringify(response.data, null, 2));
    
    return true;
  } catch (error) {
    console.error('❌ Erro no processamento do webhook:');
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Resposta:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('   Erro:', error.message);
    }
    return false;
  }
}

/**
 * Verifica configurações do sistema
 */
function checkSystemConfiguration() {
  console.log('\n⚙️ Verificando configurações do sistema...');
  
  const requiredEnvVars = [
    'FRONTEND_URL',
    'OASYFY_PUBLIC_KEY',
    'OASYFY_SECRET_KEY'
  ];
  
  const optionalEnvVars = [
    'NODE_ENV',
    'PORT',
    'DATABASE_URL'
  ];
  
  console.log('📋 Variáveis de ambiente obrigatórias:');
  let hasAllRequired = true;
  
  requiredEnvVars.forEach(varName => {
    const value = process.env[varName];
    const status = value ? '✅' : '❌';
    console.log(`   ${status} ${varName}: ${value ? '***' : 'NÃO CONFIGURADO'}`);
    if (!value) hasAllRequired = false;
  });
  
  console.log('\n📋 Variáveis de ambiente opcionais:');
  optionalEnvVars.forEach(varName => {
    const value = process.env[varName];
    const status = value ? '✅' : '⚪';
    console.log(`   ${status} ${varName}: ${value || 'não configurado'}`);
  });
  
  return hasAllRequired;
}

/**
 * Verifica logs do sistema
 */
function checkSystemLogs() {
  console.log('\n📄 Verificando logs do sistema...');
  
  const logPaths = [
    './logs/server.log',
    './server.log',
    './app.log'
  ];
  
  let foundLogs = false;
  
  for (const logPath of logPaths) {
    if (fs.existsSync(logPath)) {
      console.log(`✅ Log encontrado: ${logPath}`);
      
      try {
        const stats = fs.statSync(logPath);
        console.log(`   Tamanho: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Modificado: ${stats.mtime.toISOString()}`);
        
        // Ler últimas linhas para verificar atividade recente
        const content = fs.readFileSync(logPath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        const recentLines = lines.slice(-10);
        
        console.log('   Últimas 10 linhas:');
        recentLines.forEach((line, i) => {
          console.log(`     ${i + 1}. ${line.substring(0, 100)}${line.length > 100 ? '...' : ''}`);
        });
        
        foundLogs = true;
      } catch (error) {
        console.error(`❌ Erro ao ler log ${logPath}:`, error.message);
      }
    }
  }
  
  if (!foundLogs) {
    console.log('⚠️ Nenhum arquivo de log encontrado');
  }
  
  return foundLogs;
}

/**
 * Função principal de diagnóstico
 */
async function runDiagnosis() {
  console.log('🔍 DIAGNÓSTICO COMPLETO - Problema de Pagamento PIX');
  console.log('=' .repeat(60));
  console.log('🕒 Iniciado em:', new Date().toISOString());
  
  const results = {
    systemConfig: false,
    oasyfyConnectivity: false,
    webhookEndpoint: false,
    databaseState: false,
    webhookProcessing: false,
    systemLogs: false
  };
  
  try {
    // 1. Verificar configurações
    results.systemConfig = checkSystemConfiguration();
    
    // 2. Verificar conectividade Oasyfy
    results.oasyfyConnectivity = await checkOasyfyConnectivity();
    
    // 3. Verificar endpoint webhook
    results.webhookEndpoint = await checkWebhookEndpoint();
    
    // 4. Analisar banco de dados
    results.databaseState = await analyzeDatabaseState();
    
    // 5. Testar processamento webhook
    results.webhookProcessing = await testWebhookProcessing();
    
    // 6. Verificar logs
    results.systemLogs = checkSystemLogs();
    
    // Resumo final
    console.log('\n📊 RESUMO DO DIAGNÓSTICO');
    console.log('=' .repeat(40));
    
    Object.entries(results).forEach(([test, passed]) => {
      const status = passed ? '✅' : '❌';
      const testName = test.replace(/([A-Z])/g, ' $1').toLowerCase();
      console.log(`${status} ${testName}`);
    });
    
    const passedTests = Object.values(results).filter(Boolean).length;
    const totalTests = Object.keys(results).length;
    
    console.log(`\n📈 Score: ${passedTests}/${totalTests} (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
    
    // Recomendações
    console.log('\n🎯 RECOMENDAÇÕES:');
    
    if (!results.systemConfig) {
      console.log('❌ Configurar variáveis de ambiente obrigatórias');
    }
    
    if (!results.oasyfyConnectivity) {
      console.log('❌ Verificar credenciais Oasyfy e conectividade');
    }
    
    if (!results.webhookEndpoint) {
      console.log('❌ Verificar se servidor está rodando e acessível');
    }
    
    if (!results.databaseState) {
      console.log('❌ Verificar integridade do banco de dados');
    }
    
    if (!results.webhookProcessing) {
      console.log('❌ Corrigir processamento de webhooks');
    }
    
    if (passedTests === totalTests) {
      console.log('✅ Todos os testes passaram - sistema aparenta estar funcionando');
      console.log('🔍 Problema pode estar na entrega de webhooks da Oasyfy');
      console.log('💡 Verificar configuração de callback URL no painel Oasyfy');
    }
    
  } catch (error) {
    console.error('\n❌ Erro durante diagnóstico:', error.message);
    process.exit(1);
  }
  
  console.log('\n🏁 Diagnóstico concluído em:', new Date().toISOString());
}

// Executar se chamado diretamente
if (require.main === module) {
  runDiagnosis();
}

module.exports = {
  runDiagnosis,
  checkOasyfyConnectivity,
  checkWebhookEndpoint,
  analyzeDatabaseState,
  testWebhookProcessing,
  checkSystemConfiguration,
  checkSystemLogs
};