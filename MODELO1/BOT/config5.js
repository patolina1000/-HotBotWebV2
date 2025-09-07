const base = require('./config.default');

// 💰 Valores oficiais dos planos do Bot5
const valorGozadaRapida = 45.00;
const valorGozadaTotal = 80.00;

module.exports = {
  ...base,

  // 🎬 CONFIGURAÇÃO ESPECÍFICA DO BOT5
  midias: {
    inicial: {
      video: './midia/inicial4.mp4' // Usando inicial4.mp4 como base
    },
    // Manter downsells da configuração padrão
    downsells: base.midias.downsells
  },

  inicio: {
    tipoMidia: 'video',
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

  // Sistema de downsells escalonados (inspirado no Bot1)
  downsells: [
    {
      id: 'ds1',
      emoji: '😇',
      texto: 'Ei, tá esperando o quê?\nVocê já viu tudo... e quer mais.\nR$45,00. Gozada Rápida - Sem assinatura. Sem censura.\nPagou, entrou. Entrou, gozou.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds1_rapida', nome: 'Gozada Rápida', emoji: '😇', valorOriginal: 45.00, valorComDesconto: 45.00 },
        { id: 'ds1_total', nome: 'Gozada Total', emoji: '😈', valorOriginal: 80.00, valorComDesconto: 80.00 }
      ]
    },
    {
      id: 'ds2',
      emoji: '😇',
      texto: 'Tá indeciso?\nTe entendo... mas teu desejo é maior que tua dúvida.\nToma 5% OFF agora.\nR$42,75 – Gozada Rápida.\nNão enrola. Uma vez só.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds2_rapida', nome: 'Gozada Rápida', emoji: '😇', valorOriginal: 45.00, valorComDesconto: 42.75 },
        { id: 'ds2_total', nome: 'Gozada Total', emoji: '😈', valorOriginal: 80.00, valorComDesconto: 76.00 }
      ]
    },
    {
      id: 'ds3',
      emoji: '😇',
      texto: 'Você já sabe o que tem lá dentro.\nE já imagina o que vai fazer com aquele conteúdo…\nÚltima vez com 5% OFF: R$42,75.\nEntra agora e se entrega.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds3_rapida', nome: 'Gozada Rápida', emoji: '😇', valorOriginal: 45.00, valorComDesconto: 42.75 },
        { id: 'ds3_total', nome: 'Gozada Total', emoji: '😈', valorOriginal: 80.00, valorComDesconto: 76.00 }
      ]
    },
    {
      id: 'ds4',
      emoji: '😇',
      texto: 'Te dou 10% agora. Mas é agora mesmo.\nR$40,50 – Gozada Rápida.\nSaiu dessa tela, acabou.\nVocê sabe que quer. Clica logo.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds4_rapida', nome: 'Gozada Rápida', emoji: '😇', valorOriginal: 45.00, valorComDesconto: 40.50 },
        { id: 'ds4_total', nome: 'Gozada Total', emoji: '😈', valorOriginal: 80.00, valorComDesconto: 72.00 }
      ]
    },
    {
      id: 'ds5',
      emoji: '😇',
      texto: 'Você tá aqui ainda… então toma mais um empurrãozinho.\nR$40,50 – Gozada Rápida.\nSem assinatura. Sem limite. Pagou, entrou.\nDepois disso, esse valor é fixo.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds5_rapida', nome: 'Gozada Rápida', emoji: '😇', valorOriginal: 45.00, valorComDesconto: 40.50 },
        { id: 'ds5_total', nome: 'Gozada Total', emoji: '😈', valorOriginal: 80.00, valorComDesconto: 72.00 }
      ]
    },
    {
      id: 'ds6',
      emoji: '😇',
      texto: 'Tem gente lá dentro aproveitando tudo. Só falta você.\nR$38,25 – Gozada Rápida.\nEsse valor não cai mais. Só falta você entrar.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds6_rapida', nome: 'Gozada Rápida', emoji: '😇', valorOriginal: 45.00, valorComDesconto: 38.25 },
        { id: 'ds6_total', nome: 'Gozada Total', emoji: '😈', valorOriginal: 80.00, valorComDesconto: 68.00 }
      ]
    },
    {
      id: 'ds7',
      emoji: '😇',
      texto: 'Você quase entrou… e eu quase te mostrei tudo.\nR$38,25 – Gozada Rápida.\nÚltima chamada pra quem tem coragem.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds7_rapida', nome: 'Gozada Rápida', emoji: '😇', valorOriginal: 45.00, valorComDesconto: 38.25 },
        { id: 'ds7_total', nome: 'Gozada Total', emoji: '😈', valorOriginal: 80.00, valorComDesconto: 68.00 }
      ]
    },
    {
      id: 'ds8',
      emoji: '😇',
      texto: 'Você viu meu corpo. Sentiu minha vibe.\nSabe que vai se arrepender se sair agora…\nR$38,25 – Gozada Rápida. Fixo. Sem volta.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds8_rapida', nome: 'Gozada Rápida', emoji: '😇', valorOriginal: 45.00, valorComDesconto: 38.25 },
        { id: 'ds8_total', nome: 'Gozada Total', emoji: '😈', valorOriginal: 80.00, valorComDesconto: 68.00 }
      ]
    },
    {
      id: 'ds9',
      emoji: '😇',
      texto: 'Se você tá aqui ainda, é porque quer.\nTá testando teu limite?\nEntão testa isso: R$38,25 Gozada Rápida. Entra ou some.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds9_rapida', nome: 'Gozada Rápida', emoji: '😇', valorOriginal: 45.00, valorComDesconto: 38.25 },
        { id: 'ds9_total', nome: 'Gozada Total', emoji: '😈', valorOriginal: 80.00, valorComDesconto: 68.00 }
      ]
    },
    {
      id: 'ds10',
      emoji: '😇',
      texto: 'Já recusou várias vezes. Mas tá aqui ainda, né?\nR$38,25 – Gozada Rápida. Última chance real.\nDepois disso, só no print.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds10_rapida', nome: 'Gozada Rápida', emoji: '😇', valorOriginal: 45.00, valorComDesconto: 38.25 },
        { id: 'ds10_total', nome: 'Gozada Total', emoji: '😈', valorOriginal: 80.00, valorComDesconto: 68.00 }
      ]
    },
    {
      id: 'ds11',
      emoji: '😇',
      texto: 'Última chance real.\nDepois disso, só no print.\nR$38,25 – Gozada Rápida.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds11_rapida', nome: 'Gozada Rápida', emoji: '😇', valorOriginal: 45.00, valorComDesconto: 38.25 },
        { id: 'ds11_total', nome: 'Gozada Total', emoji: '😈', valorOriginal: 80.00, valorComDesconto: 68.00 }
      ]
    },
    {
      id: 'ds12',
      emoji: '😇',
      texto: 'Fim da linha.\nR$38,25 – Gozada Rápida.\nÚltima vez.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds12_rapida', nome: 'Gozada Rápida', emoji: '😇', valorOriginal: 45.00, valorComDesconto: 38.25 },
        { id: 'ds12_total', nome: 'Gozada Total', emoji: '😈', valorOriginal: 80.00, valorComDesconto: 68.00 }
      ]
    }
  ],

  // Menu específico para mensagens periódicas (plano único de R$ 45,00)
  menuPeriodicas: {
    texto: ``,
    opcoes: [
      { texto: 'R$ 45,00', callback: 'plano_periodico_unico' }
    ]
  },

  // Plano único para mensagens periódicas
  planoPeriodico: {
    id: 'plano_periodico_unico',
    nome: 'Gozada Rápida',
    emoji: '😇',
    valor: 45.00,
    descricao: 'Gozada Rápida - R$ 45,00'
  },

  mensagensPeriodicas: [
    {
      horario: '08:00',
      texto: `Quer começar o dia comigo na câmera?

Sua putinha te espera para uma Gozada Rápida por só R$ 45,00 😍 5 minutos de chamada + provocação até você gozar!

Clique aqui e garanta sua sessão 👇🏻`,
      midia: './midia/downsells/ds1.jpg'
    },
    {
      horario: '19:00',
      texto: `Chegou cansado do trampo e quer relaxar?

Sua putinha liberou Gozada Rápida por só R$ 45 😍 5 minutos de chamada + provocação até gozar!

Clica aqui pra conectar👇🏻`,
      midia: './midia/downsells/ds2.jpg'
    },
    {
      horario: '21:00',
      texto: `Quer uma sessão especial agora?

Você é um homem de sorte… liberei Gozada Rápida por só R$ 45 😍 5 minutos de chamada + provocação!

Clica aqui pra conectar com sua putinha 👇🏻`,
      midia: './midia/downsells/ds1.jpg'
    },
    {
      horario: '23:00',
      texto: `Antes de dormir, que tal uma provocação?

Liberei Gozada Rápida com 5 minutos de chamada por só R$45 …
E daqui a pouco começo a provocar na câmera.🔴

⏳ Corre antes que eu vá dormir!`,
      midia: './midia/downsells/ds2.jpg'
    }
  ],

  // Configuração especial: redireciona para obrigado.html com grupo G5
  paginaObrigado: 'obrigado.html',
  grupoRedirecionamento: 'G5',

  mensagens: {
    ...(base.mensagens || {}),
    boasVindas: '👋 Bem-vindo ao Bot5 - Sua Putinha Particular!'
  }
};
