const base = require('./config.default');

// 💰 Valores oficiais dos planos do Bot5
const valorGozadaRapida = 45.00;
const valorGozadaTotal = 80.00;

module.exports = {
  ...base,

  // 🎬 CONFIGURAÇÃO ESPECÍFICA DO BOT5
  midias: {
    inicial: {
      video: './midia/inicial4.mp4', // Usando inicial4.mp4
      imagem: './midia/inicial5.png' // Usando inicial5.png
    }
  },

  inicio: {
    tipoMidia: 'video',
    enviarTodasMidias: true, // Enviar tanto vídeo quanto imagem
    textoInicial: `Agora é só nós dois com a câmera ligada e o tesão rolando de verdade 🥰

😇 Gozada Rápida
• 5 minutos de chamada
• Atendimento com fila (apenas horários livres)
• Provoco com a bucetinha até ver a pica escorrendo leite

😈 Gozada Total
• 30 minutos de chamada
• Agendamento com prioridade (você escolhe a data e hora)
• Escrevo seu nome no corpo e deixo o cuzinho empinado onde quiser
• Faço de tudo na chamada como se fosse sua putinha particular`,
    
    menuInicial: {
      texto: `Tô pronta pra rebolar com o cuzinho empinado gritando seu nome... vai deixar passar? 👇🏻`,
      opcoes: [
        { texto: `😇 Gozada Rápida - R$ ${valorGozadaRapida.toFixed(2)}`, callback: 'plano_gozada_rapida' },
        { texto: `😈 Gozada Total - R$ ${valorGozadaTotal.toFixed(2)}`, callback: 'plano_gozada_total' }
      ]
    }
  },

  // Menu dos planos (aparece quando clica em ESCOLHER PLANO)
  menuPlanos: {
    texto: `Escolha uma experiência abaixo:`,
    opcoes: [
      { texto: `😇 Gozada Rápida - R$ ${valorGozadaRapida.toFixed(2)}`, callback: 'plano_gozada_rapida' },
      { texto: `😈 Gozada Total - R$ ${valorGozadaTotal.toFixed(2)}`, callback: 'plano_gozada_total' }
    ]
  },

  planos: [
    {
      id: 'plano_gozada_rapida',
      nome: 'Gozada Rápida',
      emoji: '😇',
      valor: valorGozadaRapida,
      descricao: '5 minutos de chamada + atendimento com fila + provocação até gozar'
    },
    {
      id: 'plano_gozada_total',
      nome: 'Gozada Total',
      emoji: '😈',
      valor: valorGozadaTotal,
      descricao: '30 minutos de chamada + agendamento prioritário + nome no corpo + putinha particular'
    }
  ],

  // Bot5 não tem downsells (seguindo padrão do Bot2 e Bot Especial)
  downsells: [],

  // Bot5 não tem mensagens periódicas (seguindo padrão do Bot2 e Bot Especial)
  mensagensPeriodicas: [],

  // Configuração especial: redireciona para obrigado_purchase_flow.html com grupo G5
  paginaObrigado: 'obrigado_purchase_flow.html',
  grupoRedirecionamento: 'G5',

  mensagens: {
    ...(base.mensagens || {}),
    boasVindas: '👋 Bem-vindo ao Bot5 - Sua Putinha Particular!'
  }
};
