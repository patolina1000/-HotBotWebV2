const base = require('./config.default');

module.exports = {
  ...base,

  inicio: {
    tipoMidia: 'video',
    textoInicial: `Oieee! Seja bem-vindo!

Aqui e onde voces encontram o meu lado mais safado e varias aventuras gostosas rs 👀

Videos exclusivos fu!dendo de todas as formas, e um contato direto comigo!

🌶 Acesso a todos os conteúdos.
🌶 Vídeos novos toda semana.
🤤 Conteúdo exclusivos:
🔥Expl!citos, fu!dendo gostoso e sozinha.
🌶️ Videochamadas`,
    menuInicial: {
      texto: `🔐 𝙶𝟶𝚉𝙰𝙳𝙰 𝙶𝙰𝚁𝙰𝙽𝚃𝙸𝙳𝙰 𝙾𝚄 𝚂𝙴𝚄 𝙳𝙸𝙽𝙷𝙴𝙸𝚁𝙾 𝙳𝙴 𝚅𝙾𝙻𝚃𝙰🔐  

 Aproveite conteúdos exclusivos ao se tornar um membro! Veja os planos disponíveis clicando no botão abaixo.👇🏻`,
      opcoes: [
        { texto: '🌶️ ESCOLHER VIP 🌶️', callback: 'mostrar_planos' },
        { texto: 'Instagram ↗️', url: 'https://www.instagram.com/hadriiimaria_' }
      ]
    }
  },

  // Menu dos planos (aparece quando clica em ESCOLHER VIP)
  menuPlanos: {
    texto: `Escolha uma oferta abaixo:`,
    opcoes: [
      { texto: '🥉 7 Dias de Grupo VIP - R$ 19,90', callback: 'plano_7dias' },
      { texto: '🥈 1 Mês de Grupo VIP - R$ 24,90', callback: 'plano_1mes' },
      { texto: '🥇 VIP Vitalício + Wpp+Mimo - R$ 29,90', callback: 'plano_vitalicio_wpp' },
      { texto: '💎 VIP Vitalício+ Chamadinha - R$ 69,90', callback: 'plano_vitalicio_chamada' }
    ]
  },

  // Configuração do Instagram
  instagram: {
    url: 'https://www.instagram.com/hadriiimaria_'
  },

  planos: [
    {
      id: 'plano_7dias',
      nome: '7 Dias de Grupo VIP',
      emoji: '🥉',
      valor: 19.90,
      descricao: 'Acesso por 7 dias ao grupo VIP'
    },
    {
      id: 'plano_1mes',
      nome: '1 Mês de Grupo VIP',
      emoji: '🥈',
      valor: 24.90,
      descricao: 'Acesso por 1 mês ao grupo VIP'
    },
    {
      id: 'plano_vitalicio_wpp',
      nome: 'VIP Vitalício + Wpp+Mimo',
      emoji: '🥇',
      valor: 29.90,
      descricao: 'Acesso vitalício + WhatsApp + Mimo'
    },
    {
      id: 'plano_vitalicio_chamada',
      nome: 'VIP Vitalício+ Chamadinha',
      emoji: '💎',
      valor: 69.90,
      descricao: 'Acesso vitalício + Chamada de vídeo'
    }
  ],

  downsells: [
    {
      id: 'ds1',
      emoji: '🔴',
      texto: 'Oie Titio, percebi que você não finalizou a sua assinatura 😢\n\n🔴 SEM DESCONTO - Preço de âncora, sem dó!\n\n💗 Entra pro meu grupinho VIP agora, e vem vê sua sobrinha de um jeito que você nunca viu 🙈',
      tipoMidia: 'video',
      planos: [
        { id: 'ds1_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 19.90 },
        { id: 'ds1_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 24.90 },
        { id: 'ds1_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 29.90 },
        { id: 'ds1_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 69.90, valorComDesconto: 69.90 }
      ]
    },
    {
      id: 'ds2',
      emoji: '🟡',
      texto: 'Ei, tá esperando o quê?\nVocê já viu tudo... e quer mais.\n\n🟡 5% DE DESCONTO - Pra fazer charme e começar a dar gosto!\n\n💗 Entra pro meu grupinho VIP agora, e vem vê sua sobrinha de um jeito que você nunca viu 🙈',
      tipoMidia: 'video',
      planos: [
        { id: 'ds2_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 18.90 },
        { id: 'ds2_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 22.90 },
        { id: 'ds2_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 27.90 },
        { id: 'ds2_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 69.90, valorComDesconto: 65.90 }
      ]
    },
    {
      id: 'ds3',
      emoji: '🟡',
      texto: 'Tá indeciso?\nTe entendo... mas teu desejo é maior que tua dúvida.\n\n🟡 5% DE DESCONTO - Pra fazer charme e começar a dar gosto!\n\n💗 Entra pro meu grupinho VIP agora, e vem vê sua sobrinha de um jeito que você nunca viu 🙈',
      tipoMidia: 'video',
      planos: [
        { id: 'ds3_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 18.90 },
        { id: 'ds3_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 22.90 },
        { id: 'ds3_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 27.90 },
        { id: 'ds3_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 69.90, valorComDesconto: 65.90 }
      ]
    },
    {
      id: 'ds4',
      emoji: '🟠',
      texto: 'Você já sabe o que tem lá dentro.\nE já imagina o que vai fazer com aquele conteúdo…\n\n🟠 10% DE DESCONTO - Pra fechar na segunda ou quarta!\n\n💗 Entra pro meu grupinho VIP agora, e vem vê sua sobrinha de um jeito que você nunca viu 🙈',
      tipoMidia: 'video',
      planos: [
        { id: 'ds4_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 17.90 },
        { id: 'ds4_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 21.90 },
        { id: 'ds4_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 26.90 },
        { id: 'ds4_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 69.90, valorComDesconto: 62.90 }
      ]
    },
    {
      id: 'ds5',
      emoji: '🟠',
      texto: 'Te dou 10% agora. Mas é agora mesmo.\n\n🟠 10% DE DESCONTO - Pra fechar na segunda ou quarta!\n\n💗 Entra pro meu grupinho VIP agora, e vem vê sua sobrinha de um jeito que você nunca viu 🙈',
      tipoMidia: 'video',
      planos: [
        { id: 'ds5_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 17.90 },
        { id: 'ds5_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 21.90 },
        { id: 'ds5_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 26.90 },
        { id: 'ds5_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 69.90, valorComDesconto: 62.90 }
      ]
    },
    {
      id: 'ds6',
      emoji: '🔥',
      texto: 'Você tá aqui ainda… então toma mais um empurrãozinho.\n\n🔥 15% DE DESCONTO (MÁXIMO) - Só pra jogar quando quiser estourar as vendas!\n\n💗 Entra pro meu grupinho VIP agora, e vem vê sua sobrinha de um jeito que você nunca viu 🙈',
      tipoMidia: 'video',
      planos: [
        { id: 'ds6_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 16.90 },
        { id: 'ds6_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 20.90 },
        { id: 'ds6_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 24.90 },
        { id: 'ds6_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 69.90, valorComDesconto: 58.90 }
      ]
    },
    {
      id: 'ds7',
      emoji: '🔥',
      texto: 'Tem gente lá dentro aproveitando tudo. Só falta você.\n\n🔥 15% DE DESCONTO (MÁXIMO) - Só pra jogar quando quiser estourar as vendas!\n\n💗 Entra pro meu grupinho VIP agora, e vem vê sua sobrinha de um jeito que você nunca viu 🙈',
      tipoMidia: 'video',
      planos: [
        { id: 'ds7_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 16.90 },
        { id: 'ds7_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 20.90 },
        { id: 'ds7_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 24.90 },
        { id: 'ds7_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 69.90, valorComDesconto: 58.90 }
      ]
    },
    {
      id: 'ds8',
      emoji: '🔥',
      texto: 'Você quase entrou… e eu quase te mostrei tudo.\n\n🔥 15% DE DESCONTO (MÁXIMO) - Só pra jogar quando quiser estourar as vendas!\n\n💗 Entra pro meu grupinho VIP agora, e vem vê sua sobrinha de um jeito que você nunca viu 🙈',
      tipoMidia: 'video',
      planos: [
        { id: 'ds8_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 16.90 },
        { id: 'ds8_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 20.90 },
        { id: 'ds8_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 24.90 },
        { id: 'ds8_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 69.90, valorComDesconto: 58.90 }
      ]
    },
    {
      id: 'ds9',
      emoji: '🔥',
      texto: 'Você viu meu corpo. Sentiu minha vibe.\nSabe que vai se arrepender se sair agora…\n\n🔥 15% DE DESCONTO (MÁXIMO) - Só pra jogar quando quiser estourar as vendas!\n\n💗 Entra pro meu grupinho VIP agora, e vem vê sua sobrinha de um jeito que você nunca viu 🙈',
      tipoMidia: 'video',
      planos: [
        { id: 'ds9_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 16.90 },
        { id: 'ds9_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 20.90 },
        { id: 'ds9_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 24.90 },
        { id: 'ds9_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 69.90, valorComDesconto: 58.90 }
      ]
    },
    {
      id: 'ds10',
      emoji: '🔥',
      texto: 'Se você tá aqui ainda, é porque quer.\nTá testando teu limite?\n\n🔥 15% DE DESCONTO (MÁXIMO) - Só pra jogar quando quiser estourar as vendas!\n\n💗 Entra pro meu grupinho VIP agora, e vem vê sua sobrinha de um jeito que você nunca viu 🙈',
      tipoMidia: 'video',
      planos: [
        { id: 'ds10_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 16.90 },
        { id: 'ds10_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 20.90 },
        { id: 'ds10_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 24.90 },
        { id: 'ds10_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 69.90, valorComDesconto: 58.90 }
      ]
    },
    {
      id: 'ds11',
      emoji: '🔥',
      texto: 'Já recusou várias vezes. Mas tá aqui ainda, né?\n\n🔥 15% DE DESCONTO (MÁXIMO) - Só pra jogar quando quiser estourar as vendas!\n\n💗 Entra pro meu grupinho VIP agora, e vem vê sua sobrinha de um jeito que você nunca viu 🙈',
      tipoMidia: 'video',
      planos: [
        { id: 'ds11_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 16.90 },
        { id: 'ds11_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 20.90 },
        { id: 'ds11_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 24.90 },
        { id: 'ds11_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 69.90, valorComDesconto: 58.90 }
      ]
    },
    {
      id: 'ds12',
      emoji: '🔥',
      texto: 'Última chance real.\nDepois disso, só no print.\n\n🔥 15% DE DESCONTO (MÁXIMO) - Só pra jogar quando quiser estourar as vendas!\n\n💗 Entra pro meu grupinho VIP agora, e vem vê sua sobrinha de um jeito que você nunca viu 🙈',
      tipoMidia: 'video',
      planos: [
        { id: 'ds12_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 16.90 },
        { id: 'ds12_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 20.90 },
        { id: 'ds12_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 24.90 },
        { id: 'ds12_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 69.90, valorComDesconto: 58.90 }
      ]
    }
  ],

  mensagensPeriodicas: [
    {
      horario: '08:00',
      texto: `Por apenas 19,90 você vai ter acesso a:

🔥 Mais de 450 fotos e vídeos 
🔥 Sexo, boquete, anal ménage
🔥 Vídeo chamada gratuita
🔥 Live sem roupa toda noite
🔥 Sorteio pra gravar comigo 

👇🏻ESTOU TE ESPERANDO AQUI👇🏻`,
      midia: './midia/08.mp4'
    },
    {
      horario: '11:00',
      texto: `SÓ 19,90  🎁  
Isso mesmo safadinho, liberei meu VIP (e meu cuzinho) por apenas 19,90 😍  

Corre lá pra ver tudinho e gozar bem gostoso pra sua putinha preferida👇🏻`,
      midia: './midia/11.mp4'
    },
    {
      horario: '18:00',
      texto: `✨ 19,90 REAIS ✨

É o precinho para entrar no meu grupinho agora e se deliciar com meus vídeos já de manhã, para começar o dia jogando leitinho para fora bem gostoso. Vira macho e aperta o botão agora.`,
      midia: './midia/18.mp4'
    },
    {
      horario: '20:00', copiarDe: '08:00'
    },
    {
      horario: '23:00', copiarDe: '11:00'
    }
  ]
};
