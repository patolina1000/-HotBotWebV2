const base = require('./config.default');

module.exports = {
  ...base,

  inicio: {
    tipoMidia: 'video',
    textoInicial: `Oi, delícia.
Aqui dentro é sem filtro, sem moralismo. Do jeitinho sujo que você sempre quis me ver: nua, sem censura e pronta. 😈

Por apenas R$19,90 (vitalício):

Acesso a todos os meus conteúdos +18, sem censura
Novidades toda semana. Sempre algo novo pra você gozar
Todos os fetiches. Literalmente todos
Meu WhatsApp liberado. Fala comigo, quando quiser
Sigilo total. Ninguém vai saber
Acesso imediato. Pagou, entrou
Sem assinatura. Sem mensalidade. Uma vez só. E pra sempre.

Só não entra quem tem medo de gozar demais.`,
    menuInicial: {
      texto: `Decide agora: ou clica e me vê do jeitinho que imaginava,  
ou volta pro Insta fingindo que não queria me ver... mas vai continuar pensando em mim depois. 😘

👇🏻👇🏻👇🏻`,
      opcoes: [
        { texto: '🔓 Acesso Vitalício – R$19,90', callback: 'plano_vitalicio' },
        { texto: '💥 1 Semana – R$9,90', callback: 'plano_espiar' }
      ]
    }
  },

  planos: [
    { id: 'plano_vitalicio', nome: 'Vitalício', valor: 19.90 },
    { id: 'plano_espiar', nome: '1 Semana', valor: 15.90 }
  ],

  downsells: [
    ...[19.90, 18.90, 18.90, 17.90, 17.90, 17.90, 17.90, 17.90, 17.90, 17.90].map((preco, i) => ({
      id: `ds${i+1}`,
      emoji: '💋',
      texto: [
        'Ei, tá esperando o quê?\nVocê já viu tudo... e quer mais.\nR$19,90. Vitalício. Sem assinatura. Sem censura.\nPagou, entrou. Entrou, gozou.',
        'Tá indeciso?\nTe entendo... mas teu desejo é maior que tua dúvida.\nToma 5% OFF agora.\nR$18,90 – acesso vitalício.\nNão enrola. Uma vez só.',
        'Você já sabe o que tem lá dentro.\nE já imagina o que vai fazer com aquele conteúdo…\nÚltima vez com 5% OFF: R$18,90.\nEntra agora e se entrega.',
        'Te dou 10% agora. Mas é agora mesmo.\nR$17,90 – vitalício.\nSaiu dessa tela, acabou.\nVocê sabe que quer. Clica logo.',
        'Você tá aqui ainda… então toma mais um empurrãozinho.\nR$17,90 – vitalício.\nSem assinatura. Sem limite. Pagou, entrou.\nDepois disso, esse valor é fixo.',
        'Tem gente lá dentro aproveitando tudo. Só falta você.\nR$17,90 – acesso vitalício.\nEsse valor não cai mais. Só falta você entrar.',
        'Você quase entrou… e eu quase te mostrei tudo.\nR$17,90 – vitalício.\nÚltima chamada pra quem tem coragem.',
        'Você viu meu corpo. Sentiu minha vibe.\nSabe que vai se arrepender se sair agora…\nR$17,90 – fixo. Sem volta.',
        'Se você tá aqui ainda, é porque quer.\nTá testando teu limite?\nEntão testa isso: R$17,90 vitalício. Entra ou some.',
        'Já recusou várias vezes. Mas tá aqui ainda, né?\nR$17,90 – última chance real.\nDepois disso, só no print.'
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
          valorOriginal: 15.90,
          valorComDesconto: 15.90
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
