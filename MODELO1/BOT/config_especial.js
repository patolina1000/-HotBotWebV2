const base = require('./config.default');

module.exports = {
  ...base,
  
  // 🔥 IMPORTANTE: Sobrescrever configuração de mídias para usar inicial3.mp4
  midias: {
    inicial: {
      video: './midia/inicial3.mp4', // Vídeo específico para o bot especial
      imagem: './midia/inicial.jpg',
      audio: './midia/inicial_audio.mp3'
    },
    // Manter downsells da configuração padrão
    downsells: base.midias.downsells
  },
  
  inicio: {
    tipoMidia: 'video',
    textoInicial: `CLICA NO VÍDEO E AUMENTE O VOLUME 👆🔊

• Todos os conteúdos que foram prometidos desde o inicio estão acumulados e você vai receber tudo de uma vez
• São mais de 1.000 vídeos na GALERIA COMPLETA 😱`,
    
    menuInicial: {
      texto: `Escolha uma oferta abaixo:`,
      opcoes: [
        { texto: '🌻 GALERIA COMPLETA - R$ 30,00', callback: 'plano_galeria_completa' },
        { texto: '🟡 GALERIA COMPLETA + AMADORES - R$ 65,00', callback: 'plano_galeria_amadores' }
      ]
    }
  },

  planos: [
    {
      id: 'plano_galeria_completa',
      nome: 'GALERIA COMPLETA',
      emoji: '🌻',
      valor: 30.00,
      descricao: 'Mais de 1.000 vídeos acumulados desde o início'
    },
    {
      id: 'plano_galeria_amadores',
      nome: 'GALERIA COMPLETA + AMADORES',
      emoji: '🟡',
      valor: 65.00,
      descricao: 'Galeria completa + conteúdo amador exclusivo'
    }
  ],

  // Configuração especial: redireciona para obrigado_purchase_flow.html normal com grupo G3
  paginaObrigado: 'obrigado_purchase_flow.html',
  grupoRedirecionamento: 'G3',
  
  downsells: [],
  mensagensPeriodicas: [],
  
  mensagens: {
    ...(base.mensagens || {}),
    boasVindas: '👋 Bem-vindo ao Bot Especial!'
  }
};
