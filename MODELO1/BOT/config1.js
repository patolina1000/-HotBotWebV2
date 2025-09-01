const base = require('./config.default');

module.exports = {
  ...base,

  inicio: {
    tipoMidia: 'video',
    // 🔥 NOVA CONFIGURAÇÃO: Forçar envio de múltiplas mídias
    enviarTodasMidias: true,
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
        { texto: 'Instagram', url: 'https://www.instagram.com/hadriiimaria_' }
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
      { texto: '💎 VIP Vitalício+ Chamadinha - R$ 64,90', callback: 'plano_vitalicio_chamada' }
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
      valor: 64.90,
      descricao: 'Acesso vitalício + Chamada de vídeo'
    }
  ],

  downsells: [
    {
      id: 'ds1',
      emoji: '💋',
      texto: 'Ei, tá esperando o quê?\nVocê já viu tudo... e quer mais.\nR$29,90. VIP Vitalício + Wpp+Mimo. Sem assinatura. Sem censura.\nPagou, entrou. Entrou, gozou.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds1_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 19.90 },
        { id: 'ds1_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 24.90 },
        { id: 'ds1_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 29.90 },
        { id: 'ds1_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 64.90, valorComDesconto: 64.90 }
      ]
    },
    {
      id: 'ds2',
      emoji: '💋',
      texto: 'Tá indeciso?\nTe entendo... mas teu desejo é maior que tua dúvida.\nToma 5% OFF agora.\nR$27,90 – VIP Vitalício + Wpp+Mimo.\nNão enrola. Uma vez só.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds2_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 18.90 },
        { id: 'ds2_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 22.90 },
        { id: 'ds2_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 27.90 },
        { id: 'ds2_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 64.90, valorComDesconto: 60.90 }
      ]
    },
    {
      id: 'ds3',
      emoji: '💋',
      texto: 'Você já sabe o que tem lá dentro.\nE já imagina o que vai fazer com aquele conteúdo…\nÚltima vez com 5% OFF: R$27,90.\nEntra agora e se entrega.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds3_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 18.90 },
        { id: 'ds3_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 22.90 },
        { id: 'ds3_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 27.90 },
        { id: 'ds3_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 64.90, valorComDesconto: 60.90 }
      ]
    },
    {
      id: 'ds4',
      emoji: '💋',
      texto: 'Te dou 10% agora. Mas é agora mesmo.\nR$26,90 – VIP Vitalício + Wpp+Mimo.\nSaiu dessa tela, acabou.\nVocê sabe que quer. Clica logo.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds4_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 17.90 },
        { id: 'ds4_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 21.90 },
        { id: 'ds4_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 26.90 },
        { id: 'ds4_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 64.90, valorComDesconto: 57.90 }
      ]
    },
    {
      id: 'ds5',
      emoji: '💋',
      texto: 'Você tá aqui ainda… então toma mais um empurrãozinho.\nR$26,90 – VIP Vitalício + Wpp+Mimo.\nSem assinatura. Sem limite. Pagou, entrou.\nDepois disso, esse valor é fixo.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds5_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 17.90 },
        { id: 'ds5_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 21.90 },
        { id: 'ds5_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 26.90 },
        { id: 'ds5_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 64.90, valorComDesconto: 57.90 }
      ]
    },
    {
      id: 'ds6',
      emoji: '💋',
      texto: 'Tem gente lá dentro aproveitando tudo. Só falta você.\nR$24,90 – VIP Vitalício + Wpp+Mimo.\nEsse valor não cai mais. Só falta você entrar.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds6_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 16.90 },
        { id: 'ds6_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 20.90 },
        { id: 'ds6_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 24.90 },
        { id: 'ds6_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 64.90, valorComDesconto: 53.90 }
      ]
    },
    {
      id: 'ds7',
      emoji: '💋',
      texto: 'Você quase entrou… e eu quase te mostrei tudo.\nR$24,90 – VIP Vitalício + Wpp+Mimo.\nÚltima chamada pra quem tem coragem.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds7_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 16.90 },
        { id: 'ds7_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 20.90 },
        { id: 'ds7_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 24.90 },
        { id: 'ds7_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 64.90, valorComDesconto: 53.90 }
      ]
    },
    {
      id: 'ds8',
      emoji: '💋',
      texto: 'Você viu meu corpo. Sentiu minha vibe.\nSabe que vai se arrepender se sair agora…\nR$24,90 – VIP Vitalício + Wpp+Mimo. Fixo. Sem volta.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds8_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 16.90 },
        { id: 'ds8_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 20.90 },
        { id: 'ds8_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 24.90 },
        { id: 'ds8_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 64.90, valorComDesconto: 53.90 }
      ]
    },
    {
      id: 'ds9',
      emoji: '💋',
      texto: 'Se você tá aqui ainda, é porque quer.\nTá testando teu limite?\nEntão testa isso: R$24,90 VIP Vitalício + Wpp+Mimo. Entra ou some.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds9_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 16.90 },
        { id: 'ds9_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 20.90 },
        { id: 'ds9_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 24.90 },
        { id: 'ds9_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 64.90, valorComDesconto: 53.90 }
      ]
    },
    {
      id: 'ds10',
      emoji: '💋',
      texto: 'Já recusou várias vezes. Mas tá aqui ainda, né?\nR$24,90 – VIP Vitalício + Wpp+Mimo. Última chance real.\nDepois disso, só no print.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds10_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 16.90 },
        { id: 'ds10_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 20.90 },
        { id: 'ds10_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 24.90 },
        { id: 'ds10_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 64.90, valorComDesconto: 53.90 }
      ]
    },
    {
      id: 'ds11',
      emoji: '💋',
      texto: 'Última chance real.\nDepois disso, só no print.\nR$24,90 – VIP Vitalício + Wpp+Mimo.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds11_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 16.90 },
        { id: 'ds11_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 20.90 },
        { id: 'ds11_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 24.90 },
        { id: 'ds11_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 64.90, valorComDesconto: 53.90 }
      ]
    },
    {
      id: 'ds12',
      emoji: '💋',
      texto: 'Fim da linha.\nR$24,90 – VIP Vitalício + Wpp+Mimo.\nÚltima vez.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds12_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 16.90 },
        { id: 'ds12_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 20.90 },
        { id: 'ds12_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 24.90 },
        { id: 'ds12_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 64.90, valorComDesconto: 53.90 }
      ]
    }
  ],

  // Menu específico para mensagens periódicas (plano único de R$ 20,00)
  menuPeriodicas: {
    texto: ``,
    opcoes: [
      { texto: 'R$ 20,00', callback: 'plano_periodico_unico' }
    ]
  },

  // Plano único para mensagens periódicas
  planoPeriodico: {
    id: 'plano_periodico_unico',
    nome: '',
    emoji: '',
    valor: 20.00,
    descricao: 'R$ 20,00'
  },

  mensagensPeriodicas: [
    {
      horario: '08:00',
      texto: `Quer gozar antes do trampo?

Seu chefe te deixa de saco cheio? Deixe que eu esvazie seu saco com os conteúdos do meu VIP por só R$ 20,00 😍 Paga um vez e tem acesso a tudo!

Clique aqui e garanta o seu acesso 👇🏻`,
      midia: './midia/downsells/ds1.jpg'
    },
    {
      horario: '19:00',
      texto: `Chegou cansado do trampo e quer gozar?

Isso mesmo safadinho… liberei meu VIP (com todos os conteúdos que já gravei) por só R$ 20 😍

Clica aqui pra entrar👇🏻`,
      midia: './midia/downsells/ds2.jpg'
    },
    {
      horario: '21:00',
      texto: `Quer gozar agora?

Você é um homem de sorte… liberei meu VIP (com todos os conteúdos que já gravei) por só R$ 20 😍

Clica aqui pra entrar e gozar vendo sua putinha preferida 👇🏻`,
      midia: './midia/downsells/ds1.jpg'
    },
    {
      horario: '23:00',
      texto: `Chegou cansado do trampo e quer gozar?

Liberei meu VIP com todos os meus vídeos por só R$20 …
E daqui a pouco começa a live: metendo, gemendo e gozando AO VIVO.🔴

⏳ Corre antes que comece sem você!`,
      midia: './midia/downsells/ds2.jpg'
    }
  ]
};
