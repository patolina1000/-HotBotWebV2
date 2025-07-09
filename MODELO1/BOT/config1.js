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
        { texto: '🔓 Acesso Vitalício – R$19,90', callback: 'plano_1' },
        { texto: '💥 1 Semana – R$17,90', callback: 'plano_2' }
      ]
    }
  },

  planos: [
    { id: 'vitalicio', nome: 'Vitalício', valor: 1990 },
    { id: 'uma_semana', nome: '1 Semana', valor: 1790 }
  ],

  downsells: [
    ...[19.90, 18.90, 18.90, 17.90, 17.90, 16.90, 16.90, 15.90, 15.90, 13.90, 13.90, 13.90].map((preco, i) => ({
      id: `ds${i+1}`,
      emoji: '💋',
      texto: [
        'Ei, tá esperando o quê?\nVocê já viu tudo... e quer mais.\nR$19,90. Vitalício. Sem assinatura. Sem censura.\nPagou, entrou. Entrou, gozou.',
        'Tá indeciso?\nTe entendo... mas teu desejo é maior que tua dúvida.\nToma 5% OFF agora.\nR$18,90 – acesso vitalício.\nNão enrola. Uma vez só.',
        'Você já sabe o que tem lá dentro.\nE já imagina o que vai fazer com aquele conteúdo… 😈\nÚltima vez com 5% OFF: R$18,90.\nEntra agora e se entrega.',
        'Te dou 10% agora. Mas é agora mesmo.\nR$17,90 – vitalício.\nSaiu dessa tela, acabou.\nVocê sabe que quer. Clica logo.',
        'Tem gente lá dentro aproveitando tudo. Só falta você.\nEsse acesso é único, direto, completo.\n10% OFF: R$17,90.\nPaga uma vez, entra pra sempre.',
        'Você quase entrou…\nE eu quase te mostrei tudo.\nQuer mesmo perder? Toma 15% OFF.\nR$16,90. Vitalício. Agora ou nunca. 🔥',
        'Você viu meu corpo. Sentiu minha vibe.\nSabe que vai se arrepender se sair agora…\n15% de desconto só pra você: R$16,90.\nAceita seu desejo.',
        'Se você tá aqui ainda, é porque quer.\nMas tá testando seus próprios limites...\nEu deixo mais fácil: R$15,90. 20% OFF.\nMostra que tem coragem. Vem.',
        'Você tá resistindo por causa de 4 reais? Sério?\n20% OFF: R$15,90 – conteúdo completo, vitalício.\nNem tenta se enganar, você vai amar isso aqui.',
        'Já recusou 9 vezes. Mas tá aqui ainda. Por quê?\nPorque você QUER. E eu quero que você entre.\nÚltima vez com 30% OFF: R$13,90.\nDepois disso, nem adianta pedir. 🔒',
        'Você já viu tudo… mas ainda não pegou.\nTá esperando cair do céu? Não vai.\nR$13,90. Vitalício. Sem reembolso. Sem perdão.\nSó entra, e para de bancar o difícil. 😏',
        'Essa é a última tela. Última chance. Último clique.\nSaiu? Perdeu pra sempre.\nR$13,90 – o menor valor de todos.\nSó entra se tiver coragem de gozar até o fim.'
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
          valorOriginal: 17.90,
          valorComDesconto: 17.90
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
