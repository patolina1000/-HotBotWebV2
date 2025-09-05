#!/usr/bin/env node

// preheat.js - Script para pré-aquecimento manual do sistema
require('dotenv').config();

console.log('🔥 Iniciando pré-aquecimento manual do sistema...');

// Verificar ambiente
const isProduction = process.env.NODE_ENV === 'production' || process.env.DATABASE_URL;
console.log(`🌍 Ambiente: ${isProduction ? 'PRODUÇÃO (Render)' : 'DESENVOLVIMENTO (Local)'}`);

if (!isProduction) {
  console.log('📋 Modo desenvolvimento: Algumas funcionalidades podem não estar disponíveis');
}

// Importar as funções de inicialização do server.js
const path = require('path');
const fs = require('fs');
const express = require('express');

// Variáveis globais (copiadas do server.js)
let bot = null;
let postgres = null;
let databaseConnected = false;
let webModuleLoaded = false;
let databasePool = null;

// Função para carregar bot
function carregarBot() {
  try {
    console.log('🤖 Carregando bot...');
    
    const botPath = path.join(__dirname, 'MODELO1/BOT/bot.js');
    
    if (fs.existsSync(botPath)) {
      // Verificar se credentials.json existe (necessário para Google Sheets)
      const credentialsPath = path.join(__dirname, 'credentials.json');
      if (!fs.existsSync(credentialsPath)) {
        console.log('⚠️ credentials.json não encontrado - criando arquivo mock...');
        // Criar arquivo mock para evitar erro
        fs.writeFileSync(credentialsPath, JSON.stringify({
          "type": "service_account",
          "project_id": "mock-project",
          "private_key_id": "mock-key-id",
          "private_key": "-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----\n",
          "client_email": "mock@mock-project.iam.gserviceaccount.com",
          "client_id": "123456789",
          "auth_uri": "https://accounts.google.com/o/oauth2/auth",
          "token_uri": "https://oauth2.googleapis.com/token"
        }, null, 2));
      }
      
      bot = require(botPath);
      console.log('✅ Bot carregado com sucesso');
      return true;
    } else {
      console.log('⚠️ Arquivo bot.js não encontrado');
      return false;
    }
  } catch (error) {
    console.error('❌ Erro ao carregar bot:', error.message);
    return false;
  }
}

// Função para carregar postgres
function carregarPostgres() {
  try {
    console.log('🗄️ Carregando PostgreSQL...');
    
    if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
      postgres = require('./database/postgres');
      console.log('✅ PostgreSQL carregado');
      return true;
    } else {
      console.log('⚠️ DATABASE_URL não configurado - modo local');
      // Configurar variável mock para desenvolvimento local
      process.env.DATABASE_URL = 'postgresql://mock:mock@localhost:5432/mock';
      
      try {
        postgres = require('./database/postgres');
        console.log('📋 PostgreSQL carregado em modo mock');
        return true;
      } catch (mockError) {
        console.log('⚠️ PostgreSQL não disponível no ambiente local');
        return false;
      }
    }
  } catch (error) {
    console.error('❌ Erro ao carregar PostgreSQL:', error.message);
    return false;
  }
}

// Função para inicializar banco
async function inicializarBanco() {
  if (!postgres) {
    console.log('⚠️ PostgreSQL não carregado - pulando inicialização do banco');
    return false;
  }

  try {
    console.log('🗄️ Inicializando banco de dados...');
    
    const pool = await postgres.initializeDatabase();
    if (pool) {
      databaseConnected = true;
      databasePool = pool;
      console.log('✅ Banco de dados inicializado');
      return true;
    }
    return false;
  } catch (error) {
    console.log('⚠️ Erro ao conectar com banco (normal em ambiente local):', error.message);
    return false;
  }
}

// Função para carregar sistema de tokens
async function carregarSistemaTokens() {
  try {
    console.log('🎯 Carregando sistema de tokens...');
    
    const tokensPath = path.join(__dirname, 'MODELO1/WEB/tokens.js');
    
    if (!fs.existsSync(tokensPath)) {
      console.log('⚠️ Sistema de tokens não encontrado');
      return false;
    }

    if (!databasePool) {
      console.error('❌ Pool de conexões não disponível para tokens');
      return false;
    }

    // Limpar cache do módulo (como no server.js)
    delete require.cache[require.resolve('./MODELO1/WEB/tokens')];
    
    const tokensModule = require('./MODELO1/WEB/tokens');
    
    if (typeof tokensModule === 'function') {
      // Criar express app mock para o sistema de tokens
      const mockApp = express();
      
      const tokenSystem = tokensModule(mockApp, databasePool);
      
      if (tokenSystem) {
        webModuleLoaded = true;
        console.log('✅ Sistema de tokens carregado');
        return true;
      }
    }
    
    console.log('⚠️ Sistema de tokens não encontrado');
    return false;
  } catch (error) {
    console.error('❌ Erro ao carregar sistema de tokens:', error.message);
    return false;
  }
}

// Função principal de inicialização
async function inicializarModulos() {
  console.log('🚀 Inicializando módulos...');
  
  // Carregar bot
  carregarBot();
  
  // Carregar postgres
  const postgresCarregado = carregarPostgres();
  
  // Inicializar banco
  if (postgresCarregado) {
    await inicializarBanco();
  }
  
  // Carregar sistema de tokens
  await carregarSistemaTokens();

  console.log('\n📊 Status final dos módulos:');
  console.log(`🤖 Bot: ${bot ? '✅ OK' : '❌ ERRO'}`);
  console.log(`🗄️ Banco: ${databaseConnected ? '✅ OK' : '❌ ERRO'}`);
  console.log(`🎯 Tokens: ${webModuleLoaded ? '✅ OK' : '❌ ERRO'}`);
  
  console.log('\n🔥 Pré-aquecimento concluído!');
  
  // Fechar conexões se necessário
  if (databasePool) {
    try {
      await databasePool.end();
      console.log('🗄️ Conexões de banco fechadas');
    } catch (error) {
      console.error('⚠️ Erro ao fechar conexões:', error.message);
    }
  }
  
  // Limpar arquivo mock se foi criado
  if (!isProduction) {
    const credentialsPath = path.join(__dirname, 'credentials.json');
    try {
      if (fs.existsSync(credentialsPath)) {
        const content = fs.readFileSync(credentialsPath, 'utf8');
        if (content.includes('mock-project')) {
          fs.unlinkSync(credentialsPath);
          console.log('🧹 Arquivo mock credentials.json removido');
        }
      }
    } catch (error) {
      // Falha silenciosa na limpeza
    }
  }
  
  process.exit(0);
}

// Executar pré-aquecimento
inicializarModulos().catch((error) => {
  console.error('❌ Erro durante pré-aquecimento:', error);
  process.exit(1);
});
