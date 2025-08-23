const base = require('./config.default');

module.exports = {
  ...base,

  inicio: {
    tipoMidia: 'video',
    textoInicial: `Oi, gato! 😘
Aqui é onde a magia acontece... sem filtros, sem censura, só eu e você na intimidade total! 🔥

Por apenas R$29,90 (vitalício):

✨ Acesso completo ao meu universo +18
✨ Conteúdo exclusivo que ninguém mais tem
✨ Todos os meus fetiches mais secretos
✨ WhatsApp VIP direto comigo
✨ Sigilo absoluto garantido
✨ Acesso instantâneo após pagamento
✨ Sem renovação, sem surpresas - uma vez só!

Só não entra quem não tem coragem de viver a experiência completa... 😈`,
    menuInicial: {
      texto: `A decisão é sua: ou você clica agora e descobre um mundo novo de prazer, ou volta para a vida comum... mas vai ficar pensando no que perdeu! 💋

👇🏻👇🏻👇🏻`,
      opcoes: [
        { texto: '🔓 Acesso Premium Vitalício – R$29,90', callback: 'plano_vitalicio' },
        { texto: '💎 1 Mês VIP – R$19,90', callback: 'plano_mensal' },
        { texto: '[DEBUG] Pular Pagamento ✅', callback: 'debug_skip_payment' }
      ]
    }
  },

  planos: [
    { id: 'plano_vitalicio', nome: 'Premium Vitalício', valor: 29.90 },
    { id: 'plano_mensal', nome: '1 Mês VIP', valor: 19.90 }
  ],

  downsells: [
    ...[29.90, 27.90, 25.90, 24.90, 23.90, 22.90, 21.90, 20.90, 19.90, 18.90].map((preco, i) => ({
      id: `ds${i+1}`,
      emoji: '💎',
      texto: [
        'Ei, o que você está esperando?\nJá viu o que tem aqui... e quer mais!\nR$29,90. Premium vitalício. Sem renovação. Sem censura.\nPagou, entrou. Entrou, viveu a experiência completa.',
        'Hesitando?\nEntendo... mas seu desejo é maior que sua indecisão.\nTe dou 7% OFF agora.\nR$27,90 – premium vitalício.\nNão perca tempo. Uma chance única.',
        'Você já sabe o que tem aqui dentro.\nE já imagina o que vai viver...\nÚltima chance com 10% OFF: R$25,90.\nEntre agora e transforme sua vida.',
        'Te dou 15% OFF agora. Mas é agora mesmo.\nR$24,90 – premium vitalício.\nSaiu dessa tela, acabou a oportunidade.\nVocê sabe que quer. Clica agora.',
        'Ainda aqui... então vou te dar mais um empurrãozinho.\nR$23,90 – premium vitalício.\nSem renovação. Sem limite. Pagou, entrou.\nDepois disso, esse valor é fixo.',
        'Tem gente lá dentro vivendo tudo. Só falta você.\nR$22,90 – acesso premium vitalício.\nEsse valor não cai mais. Só falta você entrar.',
        'Você quase entrou… e eu quase te mostrei tudo.\nR$21,90 – premium vitalício.\nÚltima chamada para quem tem coragem.',
        'Você viu meu mundo. Sentiu minha energia.\nSabe que vai se arrepender se sair agora…\nR$20,90 – fixo. Sem volta.',
        'Se você está aqui ainda, é porque quer.\nTestando seus limites?\nEntão testa isso: R$19,90 premium vitalício. Entra ou some.',
        'Já recusou várias vezes. Mas está aqui ainda, né?\nR$18,90 – última chance real.\nDepois disso, só no print.'
      ][i],
      tipoMidia: 'video',
      planos: [
        {
          id: `ds${i+1}_vitalicio`,
          nome: 'Premium Vitalício',
          emoji: '💎',
          valorOriginal: 29.90,
          valorComDesconto: preco
        },
        {
          id: `ds${i+1}_mensal`,
          nome: '1 Mês VIP',
          emoji: '💎',
          valorOriginal: 19.90,
          valorComDesconto: 19.90
        }
      ]
    }))
  ],

  mensagensPeriodicas: [
    {
      horario: '08:00',
      texto: `Por apenas 29,90 você vai ter acesso a:

💎 Mais de 600 fotos e vídeos exclusivos
💎 Conteúdo premium que ninguém mais tem
💎 Vídeo chamada VIP gratuita
💎 Live exclusiva toda noite
💎 Sorteio para gravar conteúdo comigo
💎 Acesso ao meu WhatsApp pessoal

👇🏻ESTOU TE ESPERANDO AQUI👇🏻`,
      midia: './midia/08.mp4'
    },
    {
      horario: '11:00',
      texto: `SÓ 29,90  🎁  
Isso mesmo, gato! Liberei meu VIP premium por apenas 29,90 😍  

Corre lá para ver tudo e viver a experiência completa👇🏻`,
      midia: './midia/11.mp4'
    },
    {
      horario: '18:00',
      texto: `✨ 30 REAIS ✨

É o preço para entrar no meu mundo premium agora e se deliciar com conteúdo exclusivo desde o amanhecer. Vira homem e aperta o botão agora.`,
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
