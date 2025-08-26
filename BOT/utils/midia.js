const fs = require('fs');
const path = require('path');

/**
 * Classe para gerenciar mídias do bot com cache de file_ids e PRE-WARMING
 */
class GerenciadorMidia {
  constructor(botInstance = null, testChatId = null, config = null) {
    this.baseDir = path.join(__dirname, '../../MODELO1/BOT');
    this.midiaDir = path.join(this.baseDir, 'midia');
    this.downsellDir = path.join(this.midiaDir, 'downsells');
    this.config = config; // Configuração específica do bot
    
    // 🔥 NOVO: Cache de file_ids para evitar re-uploads
    this.fileIdCache = new Map();
    
    // 🚀 PRE-WARMING: Pool rotativo de file_ids
    this.fileIdPool = new Map(); // caminho -> array de file_ids
    this.poolIndex = new Map();  // caminho -> índice atual do pool
    
    // 🚀 PRE-WARMING: Configurações
    this.botInstance = botInstance;
    this.testChatId = testChatId;
    this.preWarmingEnabled = false;
    this.preWarmedFileIds = new Map(); // caminho -> array de file_ids pré-aquecidos
    this.poolSize = 3; // Número de file_ids por mídia
    
    // 🚀 MÉTRICAS: Performance tracking
    this.metricas = {
      preWarmingAtivo: false,
      totalPreAquecidos: 0,
      usoCache: 0,
      usoUpload: 0,
      tempoMedioEnvio: 0,
      falhasCache: 0
    };
    
    // Criar diretórios se não existirem
    this.criarDiretorios();
  }

  /**
   * 🔥 NOVO: Obter file_id do cache (agora com suporte a pool rotativo)
   */
  obterFileId(caminhoMidia) {
    if (!caminhoMidia) return null;
    
    // 🚀 PRIORIDADE 1: Pool pré-aquecido (sistema rotativo)
    if (this.preWarmingEnabled && this.temPoolAtivo(caminhoMidia)) {
      const fileId = this.obterProximoFileIdPool(caminhoMidia);
      if (fileId) {
        this.metricas.usoCache++;
        console.log(`🚀 POOL-HIT: Usando file_id pré-aquecido para ${caminhoMidia}`);
        return fileId;
      }
    }
    
    // 🔥 PRIORIDADE 2: Cache tradicional
    const cachedFileId = this.fileIdCache.get(caminhoMidia);
    if (cachedFileId) {
      this.metricas.usoCache++;
      console.log(`🔥 CACHE-HIT: Usando file_id cacheado para ${caminhoMidia}`);
      return cachedFileId;
    }
    
    return null;
  }

  /**
   * 🔥 NOVO: Salvar file_id no cache
   */
  salvarFileId(caminhoMidia, fileId) {
    if (!caminhoMidia || !fileId) return;
    this.fileIdCache.set(caminhoMidia, fileId);
    console.log(`💾 File ID cacheado para: ${caminhoMidia}`);
  }

  /**
   * 🔥 NOVO: Remover file_id do cache (em caso de erro)
   */
  removerFileId(caminhoMidia) {
    if (!caminhoMidia) return;
    this.fileIdCache.delete(caminhoMidia);
    console.log(`🗑️ File ID removido do cache: ${caminhoMidia}`);
  }

  /**
   * 🔥 NOVO: Verificar se mídia está no cache
   */
  temFileIdCache(caminhoMidia) {
    if (!caminhoMidia) return false;
    return this.fileIdCache.has(caminhoMidia);
  }

  /**
   * 🔥 NOVO: Limpar cache de file_ids
   */
  limparCacheFileIds() {
    this.fileIdCache.clear();
    console.log('🧹 Cache de file_ids limpo');
  }

  /**
   * 🔥 NOVO: Obter estatísticas do cache
   */
  obterEstatisticasCache() {
    return {
      total: this.fileIdCache.size,
      chaves: Array.from(this.fileIdCache.keys()),
      poolSize: this.fileIdPool.size,
      preAquecidos: this.preWarmedFileIds.size,
      metricas: this.metricas
    };
  }

  /**
   * 🚀 PRE-WARMING: Inicializar sistema de pré-aquecimento
   */
  async inicializarPreWarming() {
    if (!this.botInstance || !this.testChatId) {
      console.warn('🚀 PRE-WARMING: Bot ou chat de teste não configurado');
      console.warn(`   botInstance: ${!!this.botInstance}`);
      console.warn(`   testChatId: ${this.testChatId}`);
      return false;
    }

    console.log('🚀 PRE-WARMING: Iniciando pré-aquecimento de mídias...');
    console.log(`   Base dir: ${this.baseDir}`);
    console.log(`   Mídia dir: ${this.midiaDir}`);
    console.log(`   Test chat: ${this.testChatId}`);
    this.metricas.preWarmingAtivo = true;
    
    try {
      // Pré-aquecer mídia inicial
      await this.preAquecerMidia('inicial');
      
      // Pré-aquecer mídias críticas de downsells (primeiros 3)
      const downsellsCriticos = ['ds1', 'ds2', 'ds3'];
      for (const dsId of downsellsCriticos) {
        await this.preAquecerMidia('downsell', dsId);
      }
      
      this.preWarmingEnabled = true;
      console.log(`🚀 PRE-WARMING: Concluído! ${this.metricas.totalPreAquecidos} file_ids pré-aquecidos`);
      
      // ⚠️ NOTA: Monitoramento automático desabilitado - sistema centralizado cuida disso
      // this.iniciarMonitoramentoAutomatico(); // Comentado para evitar duplo início
      
      return true;
      
    } catch (error) {
      console.error('🚀 PRE-WARMING: Erro durante inicialização:', error);
      return false;
    }
  }

  /**
   * 🚀 PRE-WARMING: Pré-aquecer uma mídia específica
   */
  async preAquecerMidia(tipo, dsId = null) {
    console.log(`🚀 PRE-WARMING: Pré-aquecendo ${tipo}${dsId ? ':' + dsId : ''}`);
    
    let midiasParaAquecer = null;
    
    if (tipo === 'inicial') {
      midiasParaAquecer = midias.inicial;
    } else if (tipo === 'downsell' && dsId) {
      midiasParaAquecer = midias.downsells[dsId];
    }
    
    if (!midiasParaAquecer) {
      console.warn(`🚀 PRE-WARMING: Mídia não encontrada - ${tipo}:${dsId}`);
      return;
    }

    console.log(`🚀 PRE-WARMING: Mídias encontradas para ${tipo}:`, Object.keys(midiasParaAquecer));

    // Pré-aquecer cada tipo de mídia disponível
    const tiposMidia = ['video', 'imagem', 'audio'];
    for (const tipoMidia of tiposMidia) {
      const caminhoMidia = midiasParaAquecer[tipoMidia];
      console.log(`🚀 PRE-WARMING: Verificando ${tipoMidia}: ${caminhoMidia}`);
      
      if (caminhoMidia) {
        const existe = this.verificarMidia(caminhoMidia);
        console.log(`🚀 PRE-WARMING: Mídia ${caminhoMidia} existe: ${existe}`);
        
        if (existe) {
          await this.criarPoolFileIds(caminhoMidia, tipoMidia);
        }
      }
    }
  }

  /**
   * 🚀 PRE-WARMING: Criar pool de file_ids para uma mídia
   */
  async criarPoolFileIds(caminhoMidia, tipoMidia) {
    if (!this.botInstance || !this.testChatId) return;
    
    console.log(`🚀 PRE-WARMING: Criando pool para ${caminhoMidia}...`);
    console.log(`📁 MÍDIA: ${caminhoMidia} (tipo: ${tipoMidia})`);
    console.log(`📱 CHAT TESTE: ${this.testChatId}`);
    
    const fileIds = [];
    const mensagensParaDeletar = [];
    
    try {
      for (let i = 0; i < this.poolSize; i++) {
        const stream = this.obterStreamMidia(caminhoMidia);
        if (!stream) continue;
        
        let resultado = null;
        const tipoTelegram = tipoMidia === 'imagem' ? 'photo' : tipoMidia;
        
        // Enviar para chat de teste
        console.log(`📤 Enviando ${tipoTelegram} para chat (tentativa ${i + 1}/${this.poolSize})`);
        
        switch (tipoTelegram) {
          case 'photo':
            resultado = await this.botInstance.sendPhoto(this.testChatId, stream, {
              caption: `📸 TESTE: ${caminhoMidia} (${i + 1}/${this.poolSize})`
            });
            if (resultado.photo && resultado.photo[0]) {
              fileIds.push(resultado.photo[0].file_id);
              console.log(`✅ Photo file_id capturado: ${resultado.photo[0].file_id}`);
            }
            break;
          case 'video':
            resultado = await this.botInstance.sendVideo(this.testChatId, stream, {
              caption: `🎥 TESTE: ${caminhoMidia} (${i + 1}/${this.poolSize})`
            });
            if (resultado.video) {
              fileIds.push(resultado.video.file_id);
              console.log(`✅ Video file_id capturado: ${resultado.video.file_id}`);
            }
            break;
          case 'audio':
            resultado = await this.botInstance.sendVoice(this.testChatId, stream, {
              caption: `🎵 TESTE: ${caminhoMidia} (${i + 1}/${this.poolSize})`
            });
            if (resultado.voice) {
              fileIds.push(resultado.voice.file_id);
              console.log(`✅ Audio file_id capturado: ${resultado.voice.file_id}`);
            }
            break;
        }
        
        if (resultado) {
          mensagensParaDeletar.push(resultado.message_id);
        }
        
        // Pequeno delay entre uploads
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (fileIds.length > 0) {
        this.fileIdPool.set(caminhoMidia, fileIds);
        this.poolIndex.set(caminhoMidia, 0);
        this.metricas.totalPreAquecidos += fileIds.length;
        console.log(`🚀 PRE-WARMING: Pool criado para ${caminhoMidia} - ${fileIds.length} file_ids`);
      }
      
      // 🚨 MODO TESTE: NÃO deletar mensagens para monitoramento
      console.log(`📱 TESTE: ${mensagensParaDeletar.length} mídias enviadas para chat ${this.testChatId} (não apagadas para debug)`);
      
      // Comentado para teste/debug - descomente para produção
      // for (const messageId of mensagensParaDeletar) {
      //   try {
      //     await this.botInstance.deleteMessage(this.testChatId, messageId);
      //   } catch (error) {
      //     // Ignorar erros de deleção
      //   }
      // }
      
    } catch (error) {
      console.error(`🚀 PRE-WARMING: Erro ao criar pool para ${caminhoMidia}:`, error);
    }
  }

  /**
   * 🚀 PRE-WARMING: Obter próximo file_id do pool (sistema rotativo)
   */
  obterProximoFileIdPool(caminhoMidia) {
    const pool = this.fileIdPool.get(caminhoMidia);
    if (!pool || pool.length === 0) {
      return null;
    }
    
    let indiceAtual = this.poolIndex.get(caminhoMidia) || 0;
    const fileId = pool[indiceAtual];
    
    // Avançar para próximo índice (rotativo)
    indiceAtual = (indiceAtual + 1) % pool.length;
    this.poolIndex.set(caminhoMidia, indiceAtual);
    
    return fileId;
  }

  /**
   * 🚀 PRE-WARMING: Verificar se mídia tem pool ativo
   */
  temPoolAtivo(caminhoMidia) {
    const pool = this.fileIdPool.get(caminhoMidia);
    return pool && pool.length > 0;
  }

  /**
   * 🚀 MÉTRICAS: Registrar tempo de envio de mídia
   */
  registrarTempoEnvio(tempoMs, estrategia = 'unknown') {
    // Atualizar média móvel simples
    if (this.metricas.tempoMedioEnvio === 0) {
      this.metricas.tempoMedioEnvio = tempoMs;
    } else {
      this.metricas.tempoMedioEnvio = (this.metricas.tempoMedioEnvio + tempoMs) / 2;
    }
    
    const instantaneo = tempoMs < 500; // Menos de 0.5s é considerado instantâneo
    console.log(`📊 MÉTRICA: Envio ${instantaneo ? '🚀 INSTANTÂNEO' : '⏳ NORMAL'} - ${tempoMs}ms via ${estrategia}`);
  }

  /**
   * 🚀 MÉTRICAS: Obter relatório de performance
   */
  obterRelatorioPerformance() {
    const totalEnvios = this.metricas.usoCache + this.metricas.usoUpload;
    const taxaCache = totalEnvios > 0 ? ((this.metricas.usoCache / totalEnvios) * 100).toFixed(1) : 0;
    
    return {
      preWarmingAtivo: this.metricas.preWarmingAtivo,
      totalPreAquecidos: this.metricas.totalPreAquecidos,
      poolsAtivos: this.fileIdPool.size,
      totalEnvios,
      usoCache: this.metricas.usoCache,
      usoUpload: this.metricas.usoUpload,
      taxaCache: `${taxaCache}%`,
      tempoMedioMs: Math.round(this.metricas.tempoMedioEnvio),
      falhasCache: this.metricas.falhasCache,
      eficiencia: taxaCache > 80 ? '🚀 EXCELENTE' : taxaCache > 60 ? '✅ BOA' : '⚠️ BAIXA'
    };
  }

  /**
   * 🚀 FALLBACK: Recriar pool se necessário
   */
  async recriarPoolSeNecessario(caminhoMidia, tipoMidia) {
    if (!this.preWarmingEnabled || !this.botInstance || !this.testChatId) {
      return false;
    }
    
    const pool = this.fileIdPool.get(caminhoMidia);
    if (!pool || pool.length === 0) {
      console.log(`🚀 FALLBACK: Recriando pool para ${caminhoMidia}`);
      await this.criarPoolFileIds(caminhoMidia, tipoMidia);
      return true;
    }
    
    return false;
  }

  /**
   * 🚀 FALLBACK: Validar e limpar file_ids inválidos
   */
  async validarELimparFileIds() {
    if (!this.preWarmingEnabled || !this.botInstance || !this.testChatId) {
      return;
    }

    console.log('🔍 FALLBACK: Validando file_ids dos pools...');
    let limpezasRealizadas = 0;

    for (const [caminhoMidia, pool] of this.fileIdPool.entries()) {
      const fileIdsValidos = [];
      
      for (const fileId of pool) {
        try {
          // Tentar usar o file_id para validação (sem enviar para usuário real)
          await this.botInstance.getFile(fileId);
          fileIdsValidos.push(fileId);
        } catch (error) {
          console.warn(`🗑️ FALLBACK: File_id inválido removido: ${fileId}`);
          limpezasRealizadas++;
        }
      }
      
      if (fileIdsValidos.length !== pool.length) {
        this.fileIdPool.set(caminhoMidia, fileIdsValidos);
        console.log(`🔧 FALLBACK: Pool ${caminhoMidia} atualizado: ${pool.length} → ${fileIdsValidos.length} file_ids`);
        
        // Se pool ficou muito pequeno, recriar
        if (fileIdsValidos.length < Math.ceil(this.poolSize / 2)) {
          const tipoMidia = caminhoMidia.includes('video') ? 'video' : 
                           caminhoMidia.includes('jpg') || caminhoMidia.includes('png') ? 'imagem' : 'audio';
          await this.criarPoolFileIds(caminhoMidia, tipoMidia);
        }
      }
    }

    if (limpezasRealizadas > 0) {
      console.log(`🧹 FALLBACK: ${limpezasRealizadas} file_ids inválidos removidos`);
    }
  }

  /**
   * 🚀 FALLBACK: Monitoramento automático de pools
   */
  iniciarMonitoramentoAutomatico() {
    if (!this.preWarmingEnabled) return;

    // Validar pools a cada 2 horas
    setInterval(async () => {
      try {
        await this.validarELimparFileIds();
      } catch (error) {
        console.error('🚀 FALLBACK: Erro durante monitoramento automático:', error.message);
      }
    }, 2 * 60 * 60 * 1000);

    // Recriar pools críticos a cada 6 horas
    setInterval(async () => {
      try {
        console.log('🔄 FALLBACK: Recriação periódica de pools críticos...');
        await this.preAquecerMidia('inicial');
        await this.preAquecerMidia('downsell', 'ds1');
      } catch (error) {
        console.error('🚀 FALLBACK: Erro durante recriação periódica:', error.message);
      }
    }, 6 * 60 * 60 * 1000);

    console.log('🚀 FALLBACK: Monitoramento automático iniciado');
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
   * Obter mídia inicial (usando configuração específica do bot)
   */
  obterMidiaInicial() {
    // 🚀 CORREÇÃO: Usar configuração específica do bot
    const midiasIniciais = this.config?.midias?.inicial || this.config?.inicio?.midia || {};
    
    // Se config tem mídia específica (como inicial2.mp4 do bot2)
    if (typeof midiasIniciais === 'string') {
      return {
        tipo: 'video', // Assumir video por padrão
        caminho: midiasIniciais
      };
    }
    
    // Se é objeto com múltiplos tipos
    if (typeof midiasIniciais === 'object') {
      // Verificar na ordem de prioridade: video > imagem > audio
      if (midiasIniciais.video && this.verificarMidia(midiasIniciais.video)) {
        return {
          tipo: 'video',
          caminho: midiasIniciais.video
        };
      }
      
      if (midiasIniciais.imagem && this.verificarMidia(midiasIniciais.imagem)) {
        return {
          tipo: 'photo',
          caminho: midiasIniciais.imagem
        };
      }
      
      if (midiasIniciais.audio && this.verificarMidia(midiasIniciais.audio)) {
        return {
          tipo: 'audio',
          caminho: midiasIniciais.audio
        };
      }
    }
    
    console.warn('⚠️ Mídia inicial não encontrada na configuração do bot');
    return null;
  }

  /**
   * Obter mídia de downsell (usando configuração específica do bot)
   */
  obterMidiaDownsell(downsellId) {
    // 🚀 CORREÇÃO: Usar configuração específica do bot
    const midiasDownsells = this.config?.midias?.downsells;
    
    if (!midiasDownsells || !midiasDownsells[downsellId]) {
      console.warn(`⚠️ Downsell ${downsellId} não encontrado na configuração do bot`);
      return null;
    }
    
    const midiasDownsell = midiasDownsells[downsellId];
    
    // Verificar na ordem de prioridade: video > imagem > audio
    if (midiasDownsell.video && this.verificarMidia(midiasDownsell.video)) {
      return {
        tipo: 'video',
        caminho: midiasDownsell.video
      };
    }
    
    if (midiasDownsell.imagem && this.verificarMidia(midiasDownsell.imagem)) {
      return {
        tipo: 'photo',
        caminho: midiasDownsell.imagem
      };
    }
    
    if (midiasDownsell.audio && this.verificarMidia(midiasDownsell.audio)) {
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
    // 🔥 ATUALIZADO: Limpar cache de file_ids também
    this.limparCacheFileIds();
    console.log('🧹 Cache de mídias limpo');
  }
}

module.exports = GerenciadorMidia;