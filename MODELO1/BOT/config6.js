const base = require('./config.default');

// 💰 Valor oficial do plano do Bot6
const valorAgendamentoImediato = 50.00;

module.exports = {
  ...base,

  // 🎬 CONFIGURAÇÃO ESPECÍFICA DO BOT6
  midias: {
    inicial: {
      video: './midia/inicial6.mp4' // Usando inicial6.mp4 específico do Bot6
    }
  },

  inicio: {
    tipoMidia: 'video',
    textoInicial: `você já deve imaginar que nossa agenda é concorrida né amor...

MAS VOU TE DAR UMA CHANCE DE ANTECIPAR NOSSA CHAMADA E ENTRAR NA ⚡ LISTA PREFERENCIAL ⚡

caso não tenha interesse, apenas aguarde nosso contato nos proximos dias.`,
    
    menuInicial: {
      texto: `Escolha uma oferta abaixo:`,
      opcoes: [
        { texto: `AGENDAR IMEDIATAMENTE - R$ ${valorAgendamentoImediato.toFixed(2)}`, callback: 'plano_agendamento_imediato' }
      ]
    }
  },

  // Menu dos planos (aparece quando clica em ESCOLHER PLANO)
  menuPlanos: {
    texto: `Escolha uma oferta abaixo:`,
    opcoes: [
      { texto: `AGENDAR IMEDIATAMENTE - R$ ${valorAgendamentoImediato.toFixed(2)}`, callback: 'plano_agendamento_imediato' }
    ]
  },

  planos: [
    {
      id: 'plano_agendamento_imediato',
      nome: 'Agendamento Imediato',
      emoji: '⚡',
      valor: valorAgendamentoImediato,
      descricao: 'Antecipe nossa chamada e entre na lista preferencial'
    }
  ],

  // Bot6 não tem downsells (seguindo padrão do Bot2, Bot Especial e Bot5)
  downsells: [],

  // Bot6 não tem mensagens periódicas (seguindo padrão do Bot2, Bot Especial e Bot5)
  mensagensPeriodicas: [],

  // Configuração especial: redireciona para obrigado_purchase_flow.html com grupo G6
  paginaObrigado: 'obrigado_purchase_flow.html',
  grupoRedirecionamento: 'G6',

  mensagens: {
    ...(base.mensagens || {}),
    boasVindas: '👋 Bem-vindo ao Bot6 - Lista Preferencial!'
  }
};
