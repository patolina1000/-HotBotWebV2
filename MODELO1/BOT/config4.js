const base = require('./config.default');

// 💰 Valores oficiais dos planos do Bot4
const valorSantinha = 70.00;
const valorSafadinha = 100.00;
const valorNamoradinha = 150.00;

module.exports = {
  ...base,

  // 🎬 CONFIGURAÇÃO ESPECÍFICA DO BOT4
  midias: {
    inicial: {
      video: './midia/inicial4.mp4' // Vídeo específico para o bot4
    },
    // Manter downsells da configuração padrão
    downsells: base.midias.downsells
  },

  inicio: {
    tipoMidia: 'video',
    textoInicial: `Não acredito que você vai me ter no privado… estou ansiosa pra sentir você bem pertinho de mim 😍

😇 Conexão Santinha
• Meu WhatsApp pessoal ✅
• Acesso completo a todo o conteúdo já gravado
• 1 foto exclusiva enviada todos os dias

🌶 Conexão Safadinha
• Tudo do Plano Santinha ✅ +
• Vídeos personalizados feitos só pra você
• Contato salvo na minha lista íntima de preferidos
• Chamada de vídeo até 7 vezes por semana

💍 Conexão Namoradinha
• Tudo do Plano Safadinha ✅ +
• Marcações de encontros (Brasil inteiro; exterior sob consulta)
• Presentes íntimos (calcinha usada, toalha de banho e muito mais…)
• Namoradinha particular, pronta pra tudo com você
• Chamada de vídeo ilimitada, sempre que quiser`,
    
    menuInicial: {
      texto: `Agora é com você… vai me mostrar se merece a Santinha, a Safadinha ou a Namoradinha? 👇🏻`,
      opcoes: [
        { texto: `😇 Conexão Santinha - R$ ${valorSantinha.toFixed(2)}`, callback: 'plano_santinha' },
        { texto: `🌶 Conexão Safadinha - R$ ${valorSafadinha.toFixed(2)}`, callback: 'plano_safadinha' },
        { texto: `💍 Conexão Namoradinha - R$ ${valorNamoradinha.toFixed(2)}`, callback: 'plano_namoradinha' }
      ]
    }
  },

  // Menu dos planos (aparece quando clica em ESCOLHER PLANO)
  menuPlanos: {
    texto: `Escolha uma conexão abaixo:`,
    opcoes: [
      { texto: `😇 Conexão Santinha - R$ ${valorSantinha.toFixed(2)}`, callback: 'plano_santinha' },
      { texto: `🌶 Conexão Safadinha - R$ ${valorSafadinha.toFixed(2)}`, callback: 'plano_safadinha' },
      { texto: `💍 Conexão Namoradinha - R$ ${valorNamoradinha.toFixed(2)}`, callback: 'plano_namoradinha' }
    ]
  },

  planos: [
    {
      id: 'plano_santinha',
      nome: 'Conexão Santinha',
      emoji: '😇',
      valor: valorSantinha,
      descricao: 'WhatsApp pessoal + acesso completo ao conteúdo + 1 foto exclusiva diária'
    },
    {
      id: 'plano_safadinha',
      nome: 'Conexão Safadinha',
      emoji: '🌶',
      valor: valorSafadinha,
      descricao: 'Tudo do Santinha + vídeos personalizados + lista íntima + chamadas até 7x/semana'
    },
    {
      id: 'plano_namoradinha',
      nome: 'Conexão Namoradinha',
      emoji: '💍',
      valor: valorNamoradinha,
      descricao: 'Tudo do Safadinha + encontros + presentes íntimos + namoradinha particular + chamadas ilimitadas'
    }
  ],

  // Sistema de downsells escalonados (inspirado no Bot1)
  downsells: [
    {
      id: 'ds1',
      emoji: '😇',
      texto: 'Ei, tá esperando o quê?\nVocê já viu tudo... e quer mais.\nR$70,00. Conexão Santinha - Sem assinatura. Sem censura.\nPagou, entrou. Entrou, gozou.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds1_santinha', nome: 'Conexão Santinha', emoji: '😇', valorOriginal: 70.00, valorComDesconto: 70.00 },
        { id: 'ds1_safadinha', nome: 'Conexão Safadinha', emoji: '🌶', valorOriginal: 100.00, valorComDesconto: 100.00 },
        { id: 'ds1_namoradinha', nome: 'Conexão Namoradinha', emoji: '💍', valorOriginal: 150.00, valorComDesconto: 150.00 }
      ]
    },
    {
      id: 'ds2',
      emoji: '😇',
      texto: 'Tá indeciso?\nTe entendo... mas teu desejo é maior que tua dúvida.\nToma 5% OFF agora.\nR$66,50 – Conexão Santinha.\nNão enrola. Uma vez só.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds2_santinha', nome: 'Conexão Santinha', emoji: '😇', valorOriginal: 70.00, valorComDesconto: 66.50 },
        { id: 'ds2_safadinha', nome: 'Conexão Safadinha', emoji: '🌶', valorOriginal: 100.00, valorComDesconto: 95.00 },
        { id: 'ds2_namoradinha', nome: 'Conexão Namoradinha', emoji: '💍', valorOriginal: 150.00, valorComDesconto: 142.50 }
      ]
    },
    {
      id: 'ds3',
      emoji: '😇',
      texto: 'Você já sabe o que tem lá dentro.\nE já imagina o que vai fazer com aquele conteúdo…\nÚltima vez com 5% OFF: R$66,50.\nEntra agora e se entrega.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds3_santinha', nome: 'Conexão Santinha', emoji: '😇', valorOriginal: 70.00, valorComDesconto: 66.50 },
        { id: 'ds3_safadinha', nome: 'Conexão Safadinha', emoji: '🌶', valorOriginal: 100.00, valorComDesconto: 95.00 },
        { id: 'ds3_namoradinha', nome: 'Conexão Namoradinha', emoji: '💍', valorOriginal: 150.00, valorComDesconto: 142.50 }
      ]
    },
    {
      id: 'ds4',
      emoji: '😇',
      texto: 'Te dou 10% agora. Mas é agora mesmo.\nR$63,00 – Conexão Santinha.\nSaiu dessa tela, acabou.\nVocê sabe que quer. Clica logo.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds4_santinha', nome: 'Conexão Santinha', emoji: '😇', valorOriginal: 70.00, valorComDesconto: 63.00 },
        { id: 'ds4_safadinha', nome: 'Conexão Safadinha', emoji: '🌶', valorOriginal: 100.00, valorComDesconto: 90.00 },
        { id: 'ds4_namoradinha', nome: 'Conexão Namoradinha', emoji: '💍', valorOriginal: 150.00, valorComDesconto: 135.00 }
      ]
    },
    {
      id: 'ds5',
      emoji: '😇',
      texto: 'Você tá aqui ainda… então toma mais um empurrãozinho.\nR$63,00 – Conexão Santinha.\nSem assinatura. Sem limite. Pagou, entrou.\nDepois disso, esse valor é fixo.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds5_santinha', nome: 'Conexão Santinha', emoji: '😇', valorOriginal: 70.00, valorComDesconto: 63.00 },
        { id: 'ds5_safadinha', nome: 'Conexão Safadinha', emoji: '🌶', valorOriginal: 100.00, valorComDesconto: 90.00 },
        { id: 'ds5_namoradinha', nome: 'Conexão Namoradinha', emoji: '💍', valorOriginal: 150.00, valorComDesconto: 135.00 }
      ]
    },
    {
      id: 'ds6',
      emoji: '😇',
      texto: 'Tem gente lá dentro aproveitando tudo. Só falta você.\nR$59,50 – Conexão Santinha.\nEsse valor não cai mais. Só falta você entrar.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds6_santinha', nome: 'Conexão Santinha', emoji: '😇', valorOriginal: 70.00, valorComDesconto: 59.50 },
        { id: 'ds6_safadinha', nome: 'Conexão Safadinha', emoji: '🌶', valorOriginal: 100.00, valorComDesconto: 85.00 },
        { id: 'ds6_namoradinha', nome: 'Conexão Namoradinha', emoji: '💍', valorOriginal: 150.00, valorComDesconto: 127.50 }
      ]
    },
    {
      id: 'ds7',
      emoji: '😇',
      texto: 'Você quase entrou… e eu quase te mostrei tudo.\nR$59,50 – Conexão Santinha.\nÚltima chamada pra quem tem coragem.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds7_santinha', nome: 'Conexão Santinha', emoji: '😇', valorOriginal: 70.00, valorComDesconto: 59.50 },
        { id: 'ds7_safadinha', nome: 'Conexão Safadinha', emoji: '🌶', valorOriginal: 100.00, valorComDesconto: 85.00 },
        { id: 'ds7_namoradinha', nome: 'Conexão Namoradinha', emoji: '💍', valorOriginal: 150.00, valorComDesconto: 127.50 }
      ]
    },
    {
      id: 'ds8',
      emoji: '😇',
      texto: 'Você viu meu corpo. Sentiu minha vibe.\nSabe que vai se arrepender se sair agora…\nR$59,50 – Conexão Santinha. Fixo. Sem volta.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds8_santinha', nome: 'Conexão Santinha', emoji: '😇', valorOriginal: 70.00, valorComDesconto: 59.50 },
        { id: 'ds8_safadinha', nome: 'Conexão Safadinha', emoji: '🌶', valorOriginal: 100.00, valorComDesconto: 85.00 },
        { id: 'ds8_namoradinha', nome: 'Conexão Namoradinha', emoji: '💍', valorOriginal: 150.00, valorComDesconto: 127.50 }
      ]
    },
    {
      id: 'ds9',
      emoji: '😇',
      texto: 'Se você tá aqui ainda, é porque quer.\nTá testando teu limite?\nEntão testa isso: R$59,50 Conexão Santinha. Entra ou some.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds9_santinha', nome: 'Conexão Santinha', emoji: '😇', valorOriginal: 70.00, valorComDesconto: 59.50 },
        { id: 'ds9_safadinha', nome: 'Conexão Safadinha', emoji: '🌶', valorOriginal: 100.00, valorComDesconto: 85.00 },
        { id: 'ds9_namoradinha', nome: 'Conexão Namoradinha', emoji: '💍', valorOriginal: 150.00, valorComDesconto: 127.50 }
      ]
    },
    {
      id: 'ds10',
      emoji: '😇',
      texto: 'Já recusou várias vezes. Mas tá aqui ainda, né?\nR$59,50 – Conexão Santinha. Última chance real.\nDepois disso, só no print.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds10_santinha', nome: 'Conexão Santinha', emoji: '😇', valorOriginal: 70.00, valorComDesconto: 59.50 },
        { id: 'ds10_safadinha', nome: 'Conexão Safadinha', emoji: '🌶', valorOriginal: 100.00, valorComDesconto: 85.00 },
        { id: 'ds10_namoradinha', nome: 'Conexão Namoradinha', emoji: '💍', valorOriginal: 150.00, valorComDesconto: 127.50 }
      ]
    },
    {
      id: 'ds11',
      emoji: '😇',
      texto: 'Última chance real.\nDepois disso, só no print.\nR$59,50 – Conexão Santinha.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds11_santinha', nome: 'Conexão Santinha', emoji: '😇', valorOriginal: 70.00, valorComDesconto: 59.50 },
        { id: 'ds11_safadinha', nome: 'Conexão Safadinha', emoji: '🌶', valorOriginal: 100.00, valorComDesconto: 85.00 },
        { id: 'ds11_namoradinha', nome: 'Conexão Namoradinha', emoji: '💍', valorOriginal: 150.00, valorComDesconto: 127.50 }
      ]
    },
    {
      id: 'ds12',
      emoji: '😇',
      texto: 'Fim da linha.\nR$59,50 – Conexão Santinha.\nÚltima vez.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds12_santinha', nome: 'Conexão Santinha', emoji: '😇', valorOriginal: 70.00, valorComDesconto: 59.50 },
        { id: 'ds12_safadinha', nome: 'Conexão Safadinha', emoji: '🌶', valorOriginal: 100.00, valorComDesconto: 85.00 },
        { id: 'ds12_namoradinha', nome: 'Conexão Namoradinha', emoji: '💍', valorOriginal: 150.00, valorComDesconto: 127.50 }
      ]
    }
  ],

  // Menu específico para mensagens periódicas (plano único de R$ 70,00)
  menuPeriodicas: {
    texto: ``,
    opcoes: [
      { texto: 'R$ 70,00', callback: 'plano_periodico_unico' }
    ]
  },

  // Plano único para mensagens periódicas
  planoPeriodico: {
    id: 'plano_periodico_unico',
    nome: 'Conexão Santinha',
    emoji: '😇',
    valor: 70.00,
    descricao: 'Conexão Santinha - R$ 70,00'
  },

  mensagensPeriodicas: [
    {
      horario: '08:00',
      texto: ``,
      midia: './midia/downsells/ds1.jpg'
    },
    {
      horario: '19:00',
      texto: ``,
      midia: './midia/downsells/ds2.jpg'
    },
    {
      horario: '21:00',
      texto: ``,
      midia: './midia/downsells/ds1.jpg'
    },
    {
      horario: '23:00',
      texto: ``,
      midia: './midia/downsells/ds2.jpg'
    }
  ],

  // Configuração especial: redireciona para obrigado_purchase_flow.html com grupo G4
  paginaObrigado: 'obrigado_purchase_flow.html',
  grupoRedirecionamento: 'G4',

  mensagens: {
    ...(base.mensagens || {}),
    boasVindas: '👋 Bem-vindo ao Bot4 - Sua Conexão Especial!'
  }
};
