const base = require('./config.default');

module.exports = {
  ...base,

  // 🎬 CONFIGURAÇÃO SIMPLES PARA TESTE
  midias: {
    inicial: {
      video: './midia/inicial.mp4'
    },
    downsells: base.midias.downsells
  },

  inicio: {
    tipoMidia: 'video',
    enviarTodasMidias: false,
    textoInicial: `🤖 **BOT7 - TESTE**
    
Este é o bot de teste para desenvolvimento.

Escolha uma opção abaixo:`,
    menuInicial: {
      texto: `🔧 **MODO TESTE ATIVO**`,
      opcoes: [
        { texto: '🧪 Teste Básico - R$ 1,00', callback: 'teste_basico' },
        { texto: '🔬 Teste Avançado - R$ 2,00', callback: 'teste_avancado' }
      ]
    }
  },

  planos: [
    {
      id: 'teste_basico',
      nome: 'TESTE BÁSICO',
      emoji: '🧪',
      valor: 1.00,
      descricao: 'Teste básico do sistema'
    },
    {
      id: 'teste_avancado',
      nome: 'TESTE AVANÇADO',
      emoji: '🔬',
      valor: 2.00,
      descricao: 'Teste avançado do sistema'
    }
  ],

  // Configuração do Instagram
  instagram: {
    url: 'https://www.instagram.com/teste'
  },

  // Downsells simples para teste
  downsells: [
    {
      id: 'ds1',
      emoji: '🧪',
      texto: 'Teste de downsell 1 - R$ 1,00',
      tipoMidia: 'video',
      planos: [
        { id: 'ds1_basico', nome: 'TESTE BÁSICO', emoji: '🧪', valorOriginal: 1.00, valorComDesconto: 1.00 }
      ]
    }
  ],

  // Mensagens periódicas de teste
  mensagensPeriodicas: [
    {
      horario: '12:00',
      texto: ``,
      midia: './midia/downsells/ds1.jpg'
    }
  ]
};
