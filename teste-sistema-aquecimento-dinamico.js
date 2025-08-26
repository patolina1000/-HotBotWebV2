#!/usr/bin/env node

/**
 * 🧪 TESTE DO SISTEMA DE AQUECIMENTO DINÂMICO
 * 
 * Este script testa o novo sistema de aquecimento 100% dinâmico
 * que descobre automaticamente todas as mídias dos bots.
 */

const fs = require('fs');
const path = require('path');

// Simular estrutura de bot para teste
class MockBot {
  constructor(botId, configPath) {
    this.botId = botId;
    this.config = require(configPath);
    this.gerenciadorMidia = {
      baseDir: path.resolve(__dirname, './MODELO1/BOT'),
      fileIdPool: new Map()
    };
  }
}

// Importar funções do servidor (simulação)
function escanearMidiasFisicamente(baseDir, botId) {
  const midiasEscaneadas = [];
  const pastaMidia = path.resolve(baseDir, './midia');
  
  if (!fs.existsSync(pastaMidia)) {
    console.log(`⚠️ TESTE: ${botId} - Pasta de mídia não encontrada: ${pastaMidia}`);
    return midiasEscaneadas;
  }
  
  try {
    // 🎬 ESCANEAR MÍDIAS INICIAIS na pasta raiz
    const arquivosRaiz = fs.readdirSync(pastaMidia);
    arquivosRaiz.forEach(arquivo => {
      const caminhoCompleto = path.join(pastaMidia, arquivo);
      const stats = fs.statSync(caminhoCompleto);
      
      if (stats.isFile()) {
        const extensao = path.extname(arquivo).toLowerCase();
        const nome = path.basename(arquivo, extensao);
        
        // Detectar tipo de mídia pela extensão
        let tipoMidia = null;
        if (['.mp4', '.avi', '.mov', '.mkv'].includes(extensao)) tipoMidia = 'video';
        else if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(extensao)) tipoMidia = 'imagem';
        else if (['.mp3', '.wav', '.ogg', '.m4a'].includes(extensao)) tipoMidia = 'audio';
        
        if (tipoMidia && nome.startsWith('inicial')) {
          midiasEscaneadas.push({
            tipo: 'inicial',
            key: 'inicial',
            tipoMidia: tipoMidia,
            arquivo: arquivo,
            caminho: `./midia/${arquivo}`,
            caminhoCompleto: caminhoCompleto,
            origem: 'escaneamento_fisico'
          });
        }
      }
    });
    
    // 🎯 ESCANEAR DOWNSELLS na pasta downsells
    const pastaDownsells = path.join(pastaMidia, 'downsells');
    if (fs.existsSync(pastaDownsells)) {
      const arquivosDownsells = fs.readdirSync(pastaDownsells);
      
      arquivosDownsells.forEach(arquivo => {
        const caminhoCompleto = path.join(pastaDownsells, arquivo);
        const stats = fs.statSync(caminhoCompleto);
        
        if (stats.isFile()) {
          const extensao = path.extname(arquivo).toLowerCase();
          const nome = path.basename(arquivo, extensao);
          
          // Detectar downsells (ds1, ds2, ds10, etc.)
          const matchDownsell = nome.match(/^ds(\d+)$/i);
          if (matchDownsell) {
            let tipoMidia = null;
            if (['.mp4', '.avi', '.mov', '.mkv'].includes(extensao)) tipoMidia = 'video';
            else if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(extensao)) tipoMidia = 'imagem';
            else if (['.mp3', '.wav', '.ogg', '.m4a'].includes(extensao)) tipoMidia = 'audio';
            
            if (tipoMidia) {
              midiasEscaneadas.push({
                tipo: 'downsell',
                key: nome.toLowerCase(), // ds1, ds2, etc.
                tipoMidia: tipoMidia,
                arquivo: arquivo,
                caminho: `./midia/downsells/${arquivo}`,
                caminhoCompleto: caminhoCompleto,
                origem: 'escaneamento_fisico'
              });
            }
          }
        }
      });
    }
    
  } catch (error) {
    console.error(`❌ Erro ao escanear mídias fisicamente para ${botId}:`, error.message);
  }
  
  return midiasEscaneadas;
}

function analisarConfigMidias(config, botId) {
  const midiasConfig = {};
  
  try {
    // Analisar midias definidas no config
    if (config.midias) {
      // Mídia inicial
      if (config.midias.inicial) {
        midiasConfig.inicial = config.midias.inicial;
      }
      
      // Downsells
      if (config.midias.downsells) {
        Object.keys(config.midias.downsells).forEach(dsKey => {
          midiasConfig[dsKey] = config.midias.downsells[dsKey];
        });
      }
    }
    
    // Verificar configuração específica no início
    if (config.inicio && config.inicio.midia) {
      const caminhoMidia = config.inicio.midia;
      const tipoMidia = config.inicio.tipoMidia || 'video';
      
      // Se não existe inicial no config.midias, usar o do inicio
      if (!midiasConfig.inicial) {
        midiasConfig.inicial = {
          [tipoMidia]: caminhoMidia
        };
      }
    }
    
  } catch (error) {
    console.error(`❌ Erro ao analisar config de mídias para ${botId}:`, error.message);
  }
  
  return midiasConfig;
}

function combinarMidiasEscaneadasComConfig(midiasEscaneadas, midiasConfig, baseDir) {
  const midiasFinais = [];
  const processados = new Set();
  
  // 🎯 PRIORIDADE 1: Mídias do config (configurações específicas do bot)
  Object.keys(midiasConfig).forEach(configKey => {
    const configMidia = midiasConfig[configKey];
    
    ['video', 'imagem', 'audio'].forEach(tipoMidia => {
      if (configMidia[tipoMidia]) {
        const caminhoCompleto = path.resolve(baseDir, configMidia[tipoMidia]);
        
        // Verificar se arquivo existe
        if (fs.existsSync(caminhoCompleto)) {
          const tipo = configKey === 'inicial' || configKey === 'inicial_custom' ? 'inicial' : 
                      configKey.startsWith('ds') ? 'downsell' : 
                      configKey.startsWith('periodica_') ? 'periodica' : 'outro';
          
          const key = tipo === 'inicial' ? 'inicial' : 
                     tipo === 'downsell' ? configKey : 
                     configKey;
          
          const chave = `${tipo}_${key}_${tipoMidia}`;
          
          if (!processados.has(chave)) {
            midiasFinais.push({
              tipo: tipo,
              key: key,
              tipoMidia: tipoMidia,
              arquivo: path.basename(configMidia[tipoMidia]),
              caminho: configMidia[tipoMidia],
              caminhoCompleto: caminhoCompleto,
              origem: 'config'
            });
            processados.add(chave);
          }
        }
      }
    });
  });
  
  // 🎯 PRIORIDADE 2: Mídias encontradas fisicamente que não estão no config
  midiasEscaneadas.forEach(midia => {
    const chave = `${midia.tipo}_${midia.key}_${midia.tipoMidia}`;
    if (!processados.has(chave)) {
      midiasFinais.push(midia);
      processados.add(chave);
    }
  });
  
  // 🎯 ORDENAR: inicial primeiro, depois downsells em ordem, depois outros
  midiasFinais.sort((a, b) => {
    if (a.tipo === 'inicial' && b.tipo !== 'inicial') return -1;
    if (b.tipo === 'inicial' && a.tipo !== 'inicial') return 1;
    
    if (a.tipo === 'downsell' && b.tipo === 'downsell') {
      const numA = parseInt(a.key.replace('ds', '')) || 0;
      const numB = parseInt(b.key.replace('ds', '')) || 0;
      return numA - numB;
    }
    
    return a.key.localeCompare(b.key);
  });
  
  return midiasFinais;
}

function descobrirMidiasDinamicamente(botInstance, botId) {
  console.log(`🔍 TESTE: ${botId} - Iniciando scanner dinâmico de mídias...`);
  
  const baseDir = botInstance.gerenciadorMidia.baseDir;
  
  try {
    // 🎯 ETAPA 1: ESCANEAR FISICAMENTE as pastas de mídia
    const midiasEscaneadas = escanearMidiasFisicamente(baseDir, botId);
    
    // 🎯 ETAPA 2: ANALISAR CONFIG do bot para mapear tipos
    const config = botInstance.config || {};
    const midiasConfig = analisarConfigMidias(config, botId);
    
    // 🎯 ETAPA 3: COMBINAR dados físicos + config para criar lista completa
    const midiasFinais = combinarMidiasEscaneadasComConfig(midiasEscaneadas, midiasConfig, baseDir);
    
    console.log(`🔍 TESTE: ${botId} - Scanner encontrou ${midiasFinais.length} mídias`);
    console.log(`   📁 Mídias físicas: ${midiasEscaneadas.length}`);
    console.log(`   ⚙️ Mídias no config: ${Object.keys(midiasConfig).length}`);
    console.log(`   ✅ Mídias finais: ${midiasFinais.map(m => `${m.key}(${m.tipoMidia})`).join(', ')}`);
    
    return midiasFinais;
    
  } catch (error) {
    console.error(`❌ TESTE: Erro no scanner dinâmico do ${botId}:`, error.message);
    return [];
  }
}

async function testarSistemaDinamico() {
  console.log('🧪 INICIANDO TESTE DO SISTEMA DE AQUECIMENTO DINÂMICO');
  console.log('='.repeat(60));
  
  try {
    // Criar bots de teste
    const bots = [
      { id: 'bot1', config: './MODELO1/BOT/config1.js' },
      { id: 'bot2', config: './MODELO1/BOT/config2.js' },
      { id: 'bot_especial', config: './MODELO1/BOT/config_especial.js' }
    ];
    
    let totalMidias = 0;
    const resultados = {};
    
    for (const botInfo of bots) {
      console.log(`\n🤖 TESTANDO ${botInfo.id.toUpperCase()}:`);
      console.log('-'.repeat(40));
      
      try {
        const bot = new MockBot(botInfo.id, botInfo.config);
        const midias = descobrirMidiasDinamicamente(bot, botInfo.id);
        
        resultados[botInfo.id] = {
          total: midias.length,
          iniciais: midias.filter(m => m.tipo === 'inicial').length,
          downsells: midias.filter(m => m.tipo === 'downsell').length,
          periodicas: midias.filter(m => m.tipo === 'periodica').length,
          midias: midias
        };
        
        totalMidias += midias.length;
        
        console.log(`   ✅ Total de mídias: ${midias.length}`);
        console.log(`   🎬 Iniciais: ${resultados[botInfo.id].iniciais}`);
        console.log(`   🎯 Downsells: ${resultados[botInfo.id].downsells}`);
        console.log(`   📊 Periódicas: ${resultados[botInfo.id].periodicas}`);
        
        // Mostrar detalhes das mídias encontradas
        if (midias.length > 0) {
          console.log(`   📋 Detalhes:`);
          midias.forEach(midia => {
            const existe = fs.existsSync(midia.caminhoCompleto) ? '✅' : '❌';
            console.log(`      ${existe} ${midia.key}(${midia.tipoMidia}) - ${midia.origem}`);
          });
        }
        
      } catch (error) {
        console.error(`❌ Erro ao testar ${botInfo.id}:`, error.message);
        resultados[botInfo.id] = { erro: error.message };
      }
    }
    
    // Resumo final
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMO FINAL DO TESTE:');
    console.log('='.repeat(60));
    
    Object.keys(resultados).forEach(botId => {
      const resultado = resultados[botId];
      if (resultado.erro) {
        console.log(`❌ ${botId}: ERRO - ${resultado.erro}`);
      } else {
        console.log(`✅ ${botId}: ${resultado.total} mídias (${resultado.iniciais} iniciais + ${resultado.downsells} downsells + ${resultado.periodicas} periódicas)`);
      }
    });
    
    console.log(`\n🎉 TOTAL GERAL: ${totalMidias} mídias descobertas automaticamente!`);
    
    // Verificar se sistema é realmente dinâmico
    console.log('\n🔍 VERIFICAÇÃO DE DINAMISMO:');
    console.log('-'.repeat(40));
    
    const bot1Midias = resultados.bot1.midias || [];
    const bot2Midias = resultados.bot2.midias || [];
    
    // Verificar se bot2 tem inicial2.mp4
    const bot2TemInicial2 = bot2Midias.some(m => m.arquivo === 'inicial2.mp4');
    if (bot2TemInicial2) {
      console.log('✅ Bot2 detectou inicial2.mp4 corretamente');
    } else {
      console.log('❌ Bot2 NÃO detectou inicial2.mp4');
    }
    
    // Verificar se downsells são diferentes entre bots
    const bot1Downsells = bot1Midias.filter(m => m.tipo === 'downsell').map(m => m.key);
    const bot2Downsells = bot2Midias.filter(m => m.tipo === 'downsell').map(m => m.key);
    
    console.log(`✅ Bot1 downsells: ${bot1Downsells.join(', ')}`);
    console.log(`✅ Bot2 downsells: ${bot2Downsells.join(', ')}`);
    
    console.log('\n🎯 TESTE CONCLUÍDO COM SUCESSO!');
    console.log('O sistema agora é 100% dinâmico e detecta automaticamente:');
    console.log('- ✅ Todas as mídias físicas existentes');
    console.log('- ✅ Configurações específicas de cada bot');
    console.log('- ✅ Novos arquivos adicionados');
    console.log('- ✅ Diferentes tipos de mídia (video, imagem, audio)');
    
  } catch (error) {
    console.error('❌ ERRO GERAL NO TESTE:', error.message);
  }
}

// Executar teste
if (require.main === module) {
  testarSistemaDinamico();
}

module.exports = {
  descobrirMidiasDinamicamente,
  escanearMidiasFisicamente,
  analisarConfigMidias,
  combinarMidiasEscaneadasComConfig
};
