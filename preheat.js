#!/usr/bin/env node

// preheat.js - Script para pré-aquecimento manual do sistema
require('dotenv').config();

console.log('🔥 Iniciando pré-aquecimento manual do sistema...');

// Importar as funções de inicialização do server.js
const path = require('path');
const fs = require('fs');

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
      console.log('⚠️ DATABASE_URL não configurado');
      return false;
    }
  } catch (error) {
    console.error('❌ Erro ao carregar PostgreSQL:', error.message);
    return false;
  }
}

// Função para inicializar banco
async function inicializarBanco() {
  if (!postgres) return false;

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
    console.error('❌ Erro ao inicializar banco:', error.message);
    return false;
  }
}

// Função para carregar sistema de tokens
async function carregarSistemaTokens() {
  try {
    console.log('🎯 Carregando sistema de tokens...');
    
    const tokensPath = path.join(__dirname, 'MODELO1/WEB/tokens.js');
    
    if (fs.existsSync(tokensPath)) {
      const tokens = require(tokensPath);
      
      if (tokens && typeof tokens.initializeWebModule === 'function') {
        await tokens.initializeWebModule();
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
  
  process.exit(0);
}

// Executar pré-aquecimento
inicializarModulos().catch((error) => {
  console.error('❌ Erro durante pré-aquecimento:', error);
  process.exit(1);
});
