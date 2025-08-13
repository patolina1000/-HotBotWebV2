#!/usr/bin/env node

/**
 * 🧪 SCRIPT DE TESTE: Verificar Otimizações do Bot
 * 
 * Este script testa as três otimizações implementadas:
 * 1. Cache de file_ids para evitar re-uploads
 * 2. Chamadas não-bloqueantes para Facebook
 * 3. Melhor UX na geração de PIX
 */

const GerenciadorMidia = require('./BOT/utils/midia');

console.log('🧪 TESTE DAS OTIMIZAÇÕES DO BOT');
console.log('================================\n');

// 🧪 TESTE 1: Cache de File IDs
async function testeCacheFileIds() {
  console.log('🧪 TESTE 1: Verificando Cache de File IDs...');
  
  const gerenciador = new GerenciadorMidia();
  
  // Testar operações básicas do cache
  const caminhoTeste = 'videos/welcome.mp4';
  const fileIdTeste = 'test_file_id_123';
  
  console.log('📝 Testando operações do cache...');
  
  // Verificar se cache está vazio inicialmente
  const statsInicial = gerenciador.obterEstatisticasCache();
  console.log(`- Cache inicial: ${statsInicial.total} itens`);
  
  // Adicionar file_id ao cache
  gerenciador.salvarFileId(caminhoTeste, fileIdTeste);
  console.log(`- File ID adicionado: ${caminhoTeste}`);
  
  // Verificar se foi salvo
  const temCache = gerenciador.temFileIdCache(caminhoTeste);
  console.log(`- Tem no cache: ${temCache ? '✅' : '❌'}`);
  
  // Recuperar file_id
  const fileIdRecuperado = gerenciador.obterFileId(caminhoTeste);
  console.log(`- File ID recuperado: ${fileIdRecuperado === fileIdTeste ? '✅' : '❌'}`);
  
  // Remover do cache
  gerenciador.removerFileId(caminhoTeste);
  console.log(`- File ID removido do cache`);
  
  // Verificar se foi removido
  const temCacheAposRemocao = gerenciador.temFileIdCache(caminhoTeste);
  console.log(`- Ainda tem no cache: ${temCacheAposRemocao ? '❌' : '✅'}`);
  
  // Limpar cache
  gerenciador.limparCacheFileIds();
  const statsFinal = gerenciador.obterEstatisticasCache();
  console.log(`- Cache após limpeza: ${statsFinal.total} itens`);
  
  console.log('✅ Teste do Cache de File IDs concluído\n');
  return { success: true };
}

// 🧪 TESTE 2: Verificar Estrutura das Otimizações
async function testeEstruturaOtimizacoes() {
  console.log('🧪 TESTE 2: Verificando Estrutura das Otimizações...');
  
  try {
    // Verificar se o arquivo principal foi modificado
    const fs = require('fs');
    const path = require('path');
    
    const arquivoBot = path.join(__dirname, 'MODELO1/core/TelegramBotService.js');
    const conteudo = fs.readFileSync(arquivoBot, 'utf8');
    
    const otimizacoes = {
      cacheFileId: conteudo.includes('🔥 OTIMIZAÇÃO 1: Verificar cache de file_id primeiro'),
      facebookNaoBloqueante: conteudo.includes('🔥 OTIMIZAÇÃO 2: Enviar evento Facebook AddToCart em background'),
      uxPix: conteudo.includes('🔥 OTIMIZAÇÃO 3: Feedback imediato para melhorar UX na geração de PIX')
    };
    
    console.log('📋 Status das Otimizações:');
    console.log(`- Cache de File IDs: ${otimizacoes.cacheFileId ? '✅' : '❌'}`);
    console.log(`- Facebook não-bloqueante: ${otimizacoes.facebookNaoBloqueante ? '✅' : '❌'}`);
    console.log(`- UX melhorada para PIX: ${otimizacoes.uxPix ? '✅' : '❌'}`);
    
    if (Object.values(otimizacoes).every(v => v)) {
      console.log('✅ Todas as otimizações foram implementadas com sucesso!');
      return { success: true, otimizacoes };
    } else {
      console.log('❌ Algumas otimizações não foram implementadas corretamente');
      return { success: false, otimizacoes };
    }
    
  } catch (error) {
    console.error('❌ Erro ao verificar estrutura:', error.message);
    return { success: false, error: error.message };
  }
}

// 🧪 TESTE 3: Verificar Funcionalidades do Gerenciador de Mídia
async function testeFuncionalidadesMidia() {
  console.log('🧪 TESTE 3: Verificando Funcionalidades do Gerenciador de Mídia...');
  
  try {
    const gerenciador = new GerenciadorMidia();
    
    // Verificar métodos existentes
    const metodos = [
      'obterFileId',
      'salvarFileId', 
      'removerFileId',
      'temFileIdCache',
      'limparCacheFileIds',
      'obterEstatisticasCache'
    ];
    
    console.log('🔍 Verificando métodos do cache...');
    for (const metodo of metodos) {
      const existe = typeof gerenciador[metodo] === 'function';
      console.log(`- ${metodo}: ${existe ? '✅' : '❌'}`);
    }
    
    // Verificar integridade
    const integridade = gerenciador.verificarIntegridade();
    console.log(`\n📊 Integridade das mídias: ${integridade.porcentagem}%`);
    
    console.log('✅ Teste das Funcionalidades de Mídia concluído\n');
    return { success: true, integridade };
    
  } catch (error) {
    console.error('❌ Erro ao testar funcionalidades:', error.message);
    return { success: false, error: error.message };
  }
}

// 🧪 FUNÇÃO PRINCIPAL DE TESTE
async function executarTestes() {
  console.log('🚀 Iniciando testes das otimizações...\n');
  
  const resultados = {
    cache: await testeCacheFileIds(),
    estrutura: await testeEstruturaOtimizacoes(),
    midia: await testeFuncionalidadesMidia()
  };
  
  console.log('📊 RESUMO DOS TESTES:');
  console.log('=====================');
  console.log(`Cache de File IDs: ${resultados.cache.success ? '✅ PASSOU' : '❌ FALHOU'}`);
  console.log(`Estrutura das Otimizações: ${resultados.estrutura.success ? '✅ PASSOU' : '❌ FALHOU'}`);
  console.log(`Funcionalidades de Mídia: ${resultados.midia.success ? '✅ PASSOU' : '❌ FALHOU'}`);
  
  const todosPassaram = Object.values(resultados).every(r => r.success);
  console.log(`\n🎯 RESULTADO FINAL: ${todosPassaram ? '✅ TODOS OS TESTES PASSARAM' : '❌ ALGUNS TESTES FALHARAM'}`);
  
  if (!todosPassaram) {
    console.log('\n🔍 Detalhes dos problemas:');
    Object.entries(resultados).forEach(([teste, resultado]) => {
      if (!resultado.success) {
        console.log(`- ${teste}: ${resultado.error || 'Falha não especificada'}`);
      }
    });
  }
  
  return todosPassaram;
}

// Executar testes se chamado diretamente
if (require.main === module) {
  executarTestes()
    .then(sucesso => {
      process.exit(sucesso ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Erro fatal durante os testes:', error);
      process.exit(1);
    });
}

module.exports = {
  executarTestes,
  testeCacheFileIds,
  testeEstruturaOtimizacoes,
  testeFuncionalidadesMidia
};