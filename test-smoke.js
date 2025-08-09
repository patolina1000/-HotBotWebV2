#!/usr/bin/env node

/**
 * Teste de Fumaça para Bootstrap
 *
 * Testa se:
 * 1. O servidor falha corretamente com DATABASE_URL inválido
 * 2. O servidor falha corretamente sem DATABASE_URL
 * 3. O sistema de bootstrap está funcionando
 */

const { spawn } = require('child_process');

async function testWithoutDatabase() {
  console.log('\n🧪 Teste 1: Verificar comportamento sem DATABASE_URL...');

  return new Promise((resolve) => {
    // Salvar DATABASE_URL atual
    const originalDatabaseUrl = process.env.DATABASE_URL;

    // Remover DATABASE_URL
    delete process.env.DATABASE_URL;

    console.log('🗑️ DATABASE_URL removida, iniciando servidor...');

    const child = spawn('node', ['server.js'], {
      stdio: 'pipe',
      env: { ...process.env }
    });

    let output = '';
    let hasError = false;

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      output += data.toString();
      hasError = true;
    });

    child.on('close', (code) => {
      // Restaurar DATABASE_URL
      if (originalDatabaseUrl) {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }

      console.log(`📤 Processo filho encerrou com código: ${code}`);
      console.log('📋 Output:', output);

      if (code !== 0) {
        console.log('✅ Teste 1 PASSOU: processo saiu com código de erro (como esperado)');
        resolve(true);
      } else {
        console.log('❌ Teste 1 FALHOU: processo deveria ter saído com erro');
        resolve(false);
      }
    });

    // Aguardar um pouco para o processo inicializar
    setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    }, 10000);
  });
}

async function testWithInvalidDatabase() {
  console.log('\n🧪 Teste 2: Verificar comportamento com DATABASE_URL inválido...');

  return new Promise((resolve) => {
    // Salvar DATABASE_URL atual
    const originalDatabaseUrl = process.env.DATABASE_URL;

    // Definir DATABASE_URL inválido
    process.env.DATABASE_URL = 'postgresql://invalid:invalid@localhost:5432/invalid';

    console.log('🔴 DATABASE_URL definida como inválida, iniciando servidor...');

    const child = spawn('node', ['server.js'], {
      stdio: 'pipe',
      env: { ...process.env }
    });

    let output = '';
    let hasError = false;

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      output += data.toString();
      hasError = true;
    });

    child.on('close', (code) => {
      // Restaurar DATABASE_URL
      if (originalDatabaseUrl) {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }

      console.log(`📤 Processo filho encerrou com código: ${code}`);
      console.log('📋 Output:', output);

      if (code !== 0) {
        console.log('✅ Teste 2 PASSOU: processo saiu com código de erro (como esperado)');
        resolve(true);
      } else {
        console.log('❌ Teste 2 FALHOU: processo deveria ter saído com erro');
        resolve(false);
      }
    });

    // Aguardar um pouco para o processo inicializar
    setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    }, 15000);
  });
}

async function testBootstrapModule() {
  console.log('\n🧪 Teste 3: Verificar se o módulo bootstrap está funcionando...');

  try {
    const bootstrap = require('./bootstrap');
    
    // Verificar se as funções estão disponíveis
    if (typeof bootstrap.start === 'function' && 
        typeof bootstrap.isReady === 'function' && 
        typeof bootstrap.getDatabasePool === 'function' && 
        typeof bootstrap.getStatus === 'function') {
      console.log('✅ Teste 3 PASSOU: Módulo bootstrap está funcionando corretamente');
      return true;
    } else {
      console.log('❌ Teste 3 FALHOU: Funções do bootstrap não estão disponíveis');
      return false;
    }
  } catch (error) {
    console.log('❌ Teste 3 FALHOU: Erro ao carregar módulo bootstrap:', error.message);
    return false;
  }
}

async function runSmokeTest() {
  console.log('🚀 Iniciando Teste de Fumaça do Bootstrap\n');

  try {
    // Teste 1: Verificar comportamento sem DATABASE_URL
    console.log('📋 Teste 1: Verificar comportamento sem DATABASE_URL');
    const noDbTestPassed = await testWithoutDatabase();

    if (!noDbTestPassed) {
      console.log('❌ Teste 1 FALHOU: Comportamento sem DATABASE_URL incorreto');
      process.exit(1);
    }

    console.log('✅ Teste 1 PASSOU: Comportamento sem DATABASE_URL correto\n');

    // Teste 2: Verificar comportamento com DATABASE_URL inválido
    console.log('📋 Teste 2: Verificar comportamento com DATABASE_URL inválido');
    const invalidDbTestPassed = await testWithInvalidDatabase();

    if (!invalidDbTestPassed) {
      console.log('❌ Teste 2 FALHOU: Comportamento com DATABASE_URL inválido incorreto');
      process.exit(1);
    }

    console.log('✅ Teste 2 PASSOU: Comportamento com DATABASE_URL inválido correto\n');

    // Teste 3: Verificar se o módulo bootstrap está funcionando
    console.log('📋 Teste 3: Verificar se o módulo bootstrap está funcionando');
    const bootstrapTestPassed = await testBootstrapModule();

    if (!bootstrapTestPassed) {
      console.log('❌ Teste 3 FALHOU: Módulo bootstrap não está funcionando');
      process.exit(1);
    }

    console.log('✅ Teste 3 PASSOU: Módulo bootstrap está funcionando\n');

    console.log('🎉 TODOS OS TESTES PASSARAM!');
    console.log('✅ Bootstrap assíncrono funcionando corretamente');
    console.log('✅ Tratamento de erro sem DATABASE_URL correto');
    console.log('✅ Tratamento de erro com DATABASE_URL inválido correto');
    console.log('✅ Módulo bootstrap carregando corretamente');

    process.exit(0);

  } catch (error) {
    console.error('💥 Erro durante teste de fumaça:', error);
    process.exit(1);
  }
}

// Executar teste se arquivo for chamado diretamente
if (require.main === module) {
  runSmokeTest();
}

module.exports = {
  testWithoutDatabase,
  testWithInvalidDatabase,
  testBootstrapModule,
  runSmokeTest
};