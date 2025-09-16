const fs = require('fs');
const path = require('path');
// Utiliza a mesma configuração principal do bot (config1)
const { midias } = require('../config1');

/**
 * Classe para gerenciar mídias do bot
 */
class GerenciadorMidia {
  constructor() {
    this.baseDir = path.join(__dirname, '..');
    this.midiaDir = path.join(this.baseDir, 'midia');
    this.downsellDir = path.join(this.midiaDir, 'downsells');
    
    // Criar diretórios se não existirem
    this.criarDiretorios();
  }

  /**
   * Criar diretórios necessários
   */
  criarDiretorios() {
    try {
      if (!fs.existsSync(this.midiaDir)) {
        fs.mkdirSync(this.midiaDir, { recursive: true });
        console.log('📁 Diretório midia/ criado');
      }
      
      if (!fs.existsSync(this.downsellDir)) {
        fs.mkdirSync(this.downsellDir, { recursive: true });
        console.log('📁 Diretório midia/downsells/ criado');
      }
    } catch (error) {
      console.error('❌ Erro ao criar diretórios:', error);
    }
  }

  /**
   * Verificar se uma mídia existe
   */
  verificarMidia(caminhoMidia) {
    if (!caminhoMidia) return false;
    
    // Se for URL, assumir que existe
    if (caminhoMidia.startsWith('http')) {
      return true;
    }
    
    // Resolver caminho absoluto
    const caminhoAbsoluto = path.resolve(this.baseDir, caminhoMidia);
    
    try {
      return fs.existsSync(caminhoAbsoluto);
    } catch (error) {
      console.warn(`⚠️ Erro ao verificar mídia ${caminhoMidia}:`, error.message);
      return false;
    }
  }

  /**
   * Obter mídia inicial
   */
  obterMidiaInicial() {
    const midiasIniciais = midias.inicial;
    
    // Verificar na ordem de prioridade: video > imagem > audio
    if (this.verificarMidia(midiasIniciais.video)) {
      return {
        tipo: 'video',
        caminho: midiasIniciais.video
      };
    }
    
    if (this.verificarMidia(midiasIniciais.imagem)) {
      return {
        tipo: 'photo',
        caminho: midiasIniciais.imagem
      };
    }
    
    if (this.verificarMidia(midiasIniciais.audio)) {
      return {
        tipo: 'audio',
        caminho: midiasIniciais.audio
      };
    }
    
    return null;
  }

  /**
   * Obter mídia de downsell
   */
  obterMidiaDownsell(downsellId) {
    if (!midias.downsells[downsellId]) {
      console.warn(`⚠️ Downsell ${downsellId} não encontrado nas configurações`);
      return null;
    }
    
    const midiasDownsell = midias.downsells[downsellId];
    
    // Verificar na ordem de prioridade: video > imagem > audio
    if (this.verificarMidia(midiasDownsell.video)) {
      return {
        tipo: 'video',
        caminho: midiasDownsell.video
      };
    }
    
    if (this.verificarMidia(midiasDownsell.imagem)) {
      return {
        tipo: 'photo',
        caminho: midiasDownsell.imagem
      };
    }
    
    if (this.verificarMidia(midiasDownsell.audio)) {
      return {
        tipo: 'audio',
        caminho: midiasDownsell.audio
      };
    }
    
    return null;
  }

  /**
   * Obter stream da mídia
   */
  obterStreamMidia(caminhoMidia) {
    if (!caminhoMidia) return null;
    
    // Se for URL, retornar a URL diretamente
    if (caminhoMidia.startsWith('http')) {
      return caminhoMidia;
    }
    
    // Resolver caminho absoluto
    const caminhoAbsoluto = path.resolve(this.baseDir, caminhoMidia);
    
    try {
      if (fs.existsSync(caminhoAbsoluto)) {
        return fs.createReadStream(caminhoAbsoluto);
      }
    } catch (error) {
      console.error(`❌ Erro ao criar stream da mídia ${caminhoMidia}:`, error);
    }
    
    return null;
  }

  /**
   * Listar mídias disponíveis
   */
  listarMidiasDisponiveis() {
    const relatorio = {
      inicial: {},
      pix: {},
      downsells: {}
    };

    console.log('\n📋 RELATÓRIO DE MÍDIAS DISPONÍVEIS:');
    console.log('================================');

    // Verificar mídias iniciais
    console.log('\n🎬 MÍDIA INICIAL:');
    for (const [tipo, caminho] of Object.entries(midias.inicial)) {
      const existe = this.verificarMidia(caminho);
      relatorio.inicial[tipo] = existe;
      console.log(`  ${tipo}: ${existe ? '✅' : '❌'} ${caminho}`);
    }

    // Verificar mídias PIX (se existir)
    if (midias.pix) {
      console.log('\n💰 MÍDIAS PIX:');
      for (const [tipo, caminho] of Object.entries(midias.pix)) {
        const existe = this.verificarMidia(caminho);
        relatorio.pix[tipo] = existe;
        console.log(`  ${tipo}: ${existe ? '✅' : '❌'} ${caminho}`);
      }
    }

    // Verificar mídias de downsells
    console.log('\n🔄 MÍDIAS DE DOWNSELLS:');
    for (const [dsId, midiasDs] of Object.entries(midias.downsells)) {
      console.log(`\n  ${dsId.toUpperCase()}:`);
      relatorio.downsells[dsId] = {};
      
      for (const [tipo, caminho] of Object.entries(midiasDs)) {
        const existe = this.verificarMidia(caminho);
        relatorio.downsells[dsId][tipo] = existe;
        console.log(`    ${tipo}: ${existe ? '✅' : '❌'} ${caminho}`);
      }
    }

    console.log('\n================================\n');
    return relatorio;
  }

  /**
   * Verificar integridade de todas as mídias
   */
  verificarIntegridade() {
    const relatorio = this.listarMidiasDisponiveis();
    let totalMidias = 0;
    let midiasDisponiveis = 0;

    // Contar mídias iniciais
    for (const existe of Object.values(relatorio.inicial)) {
      totalMidias++;
      if (existe) midiasDisponiveis++;
    }

    // Contar mídias PIX (se existir)
    if (relatorio.pix) {
      for (const existe of Object.values(relatorio.pix)) {
        totalMidias++;
        if (existe) midiasDisponiveis++;
      }
    }

    // Contar mídias de downsells
    for (const downsell of Object.values(relatorio.downsells)) {
      for (const existe of Object.values(downsell)) {
        totalMidias++;
        if (existe) midiasDisponiveis++;
      }
    }

    const porcentagem = totalMidias > 0 ? (midiasDisponiveis / totalMidias * 100).toFixed(1) : 0;

    console.log(`📊 RESUMO: ${midiasDisponiveis}/${totalMidias} mídias disponíveis (${porcentagem}%)`);

    return {
      total: totalMidias,
      disponivel: midiasDisponiveis,
      porcentagem: parseFloat(porcentagem),
      relatorio
    };
  }

  /**
   * Obter informações detalhadas de uma mídia
   */
  obterInfoMidia(caminhoMidia) {
    if (!caminhoMidia) return null;

    // Se for URL
    if (caminhoMidia.startsWith('http')) {
      return {
        tipo: 'url',
        caminho: caminhoMidia,
        tamanho: null,
        existe: true
      };
    }

    // Resolver caminho absoluto
    const caminhoAbsoluto = path.resolve(this.baseDir, caminhoMidia);

    try {
      if (fs.existsSync(caminhoAbsoluto)) {
        const stats = fs.statSync(caminhoAbsoluto);
        return {
          tipo: 'arquivo',
          caminho: caminhoMidia,
          caminhoAbsoluto,
          tamanho: stats.size,
          existe: true,
          modificado: stats.mtime
        };
      }
    } catch (error) {
      console.error(`❌ Erro ao obter informações da mídia ${caminhoMidia}:`, error);
    }

    return {
      tipo: 'arquivo',
      caminho: caminhoMidia,
      tamanho: null,
      existe: false
    };
  }

  /**
   * Obter o melhor tipo de mídia disponível (baseado na função do config.js)
   */
  obterMelhorMidia(tipo, indice = null) {
    let midiasDisponiveis = null;
    
    if (tipo === 'inicial') {
      midiasDisponiveis = midias.inicial;
    } else if (tipo === 'downsell' && indice) {
      midiasDisponiveis = midias.downsells[indice];
    }
    
    if (!midiasDisponiveis) return null;
    
    // Prioridade: video > imagem > audio
    const prioridade = ['video', 'imagem', 'audio'];
    
    for (const tipoMidia of prioridade) {
      const caminhoMidia = midiasDisponiveis[tipoMidia];
      if (this.verificarMidia(caminhoMidia)) {
        return {
          tipo: tipoMidia,
          caminho: caminhoMidia,
          tipoTelegram: tipoMidia === 'imagem' ? 'photo' : tipoMidia
        };
      }
    }
    
    return null;
  }

  /**
   * Preparar mídia para envio no Telegram
   */
  prepararMidiaParaTelegram(caminhoMidia, tipoMidia) {
    if (!caminhoMidia) return null;

    // Se for URL, retornar diretamente
    if (caminhoMidia.startsWith('http')) {
      return {
        source: caminhoMidia,
        tipo: tipoMidia === 'imagem' ? 'photo' : tipoMidia
      };
    }

    // Se for arquivo local, criar stream
    const stream = this.obterStreamMidia(caminhoMidia);
    if (stream) {
      return {
        source: stream,
        tipo: tipoMidia === 'imagem' ? 'photo' : tipoMidia
      };
    }

    return null;
  }

  /**
   * Criar arquivo de mídia de exemplo (para testes)
   */
  criarMidiaExemplo(tipo, dsId = null) {
    const textoExemplo = `Este é um arquivo de exemplo para ${tipo}`;
    let caminhoArquivo;

    if (dsId) {
      caminhoArquivo = path.join(this.downsellDir, `${dsId}.txt`);
    } else {
      caminhoArquivo = path.join(this.midiaDir, `inicial.txt`);
    }

    try {
      fs.writeFileSync(caminhoArquivo, textoExemplo);
      console.log(`📝 Arquivo de exemplo criado: ${caminhoArquivo}`);
      return caminhoArquivo;
    } catch (error) {
      console.error(`❌ Erro ao criar arquivo de exemplo:`, error);
      return null;
    }
  }

  /**
   * Limpar cache de mídias (se necessário)
   */
  limparCache() {
    // Esta função pode ser expandida no futuro se implementarmos cache
    console.log('🧹 Cache de mídias limpo');
  }
}

module.exports = GerenciadorMidia;
