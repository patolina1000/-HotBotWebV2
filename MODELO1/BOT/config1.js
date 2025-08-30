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
        { texto: 'Instagram ↗️', callback: 'redirecionar_instagram' }
      ]
    }
  },

  // Menu dos planos (aparece quando clica em ESCOLHER VIP)
  menuPlanos: {
    texto: `Escolha uma oferta abaixo:`,
    opcoes: [
      { texto: '🥉 7 Dias de Grupo VIP - R$ 20.00', callback: 'plano_7dias' },
      { texto: '🥈 1 Mês de Grupo VIP - R$ 25.00', callback: 'plano_1mes' },
      { texto: '🥇 VIP Vitalício + Wpp+Mimo - R$ 30.00', callback: 'plano_vitalicio_wpp' },
      { texto: '💎 VIP Vitalício+ Chamadinha - R$ 70.00', callback: 'plano_vitalicio_chamada' }
    ]
  },

  // Configuração do Instagram
  instagram: {
    url: 'https://www.instagram.com/hadriiimaria_/'
  },

  planos: [
    { id: 'plano_7dias', nome: '7 Dias de Grupo VIP', valor: 20.00 },
    { id: 'plano_1mes', nome: '1 Mês de Grupo VIP', valor: 25.00 },
    { id: 'plano_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', valor: 30.00 },
    { id: 'plano_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', valor: 70.00 }
  ],

  downsells: [
    ...[19.90, 18.90, 18.90, 15.90, 15.90, 15.90, 15.90, 15.90, 15.90, 15.90].map((preco, i) => ({
      id: `ds${i+1}`,
      emoji: '💋',
      texto: [
        'Ei, tá esperando o quê?\nVocê já viu tudo... e quer mais.\nR$19,90. Vitalício. Sem assinatura. Sem censura.\nPagou, entrou. Entrou, gozou.',
        'Tá indeciso?\nTe entendo... mas teu desejo é maior que tua dúvida.\nToma 5% OFF agora.\nR$18,90 – acesso vitalício.\nNão enrola. Uma vez só.',
        'Você já sabe o que tem lá dentro.\nE já imagina o que vai fazer com aquele conteúdo…\nÚltima vez com 5% OFF: R$18,90.\nEntra agora e se entrega.',
        'Te dou 10% agora. Mas é agora mesmo.\nR$15,90 – vitalício.\nSaiu dessa tela, acabou.\nVocê sabe que quer. Clica logo.',
        'Você tá aqui ainda… então toma mais um empurrãozinho.\nR$15,90 – vitalício.\nSem assinatura. Sem limite. Pagou, entrou.\nDepois disso, esse valor é fixo.',
        'Tem gente lá dentro aproveitando tudo. Só falta você.\nR$15,90 – acesso vitalício.\nEsse valor não cai mais. Só falta você entrar.',
        'Você quase entrou… e eu quase te mostrei tudo.\nR$15,90 – vitalício.\nÚltima chamada pra quem tem coragem.',
        'Você viu meu corpo. Sentiu minha vibe.\nSabe que vai se arrepender se sair agora…\nR$15,90 – fixo. Sem volta.',
        'Se você tá aqui ainda, é porque quer.\nTá testando teu limite?\nEntão testa isso: R$15,90 vitalício. Entra ou some.',
        'Já recusou várias vezes. Mas tá aqui ainda, né?\nR$15,90 – última chance real.\nDepois disso, só no print.'
      ][i],
      tipoMidia: 'video',
      planos: [
        {
          id: `ds${i+1}_vitalicio`,
          nome: 'Vitalício',
          emoji: '💋',
          valorOriginal: 19.90,
          valorComDesconto: preco
        },
        {
          id: `ds${i+1}_uma_semana`,
          nome: '1 Semana',
          emoji: '💥',
          valorOriginal: 9.90,
          valorComDesconto: 9.90
        }
      ]
    }))
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
      texto: `✨ 20 REAIS ✨

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
