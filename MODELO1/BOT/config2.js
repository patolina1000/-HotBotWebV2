const base = require('./config.default');

// 💰 Valores oficiais dos planos
const valorVitalicio = 24.90;
const valorAcesso = 20.90;

module.exports = {
  ...base,
  inicio: {
    tipoMidia: 'video',
    midia: './midia/inicial2.mp4',
    textoInicial: `Oi de novo, amor...
Você já me viu se tocando, rebolando, gemendo só pra você.
Mas agora chegou a parte que quase ninguém vê…
Meus vídeos acompanhada.

  Por apenas R$${valorVitalicio.toFixed(2)} (vitalício):

💋 Cenas com homem, com mulher… e às vezes com os dois

👭 Lésbico quente, íntimo, só com gemido real

🔄 Ménage gostoso, com muita língua, mão e coisa entrando de verdade

🔁 Atualizações toda semana, direto no seu acesso

🎁 só pra quem desbloqueia agora... (e não, não vou contar o que é)

🔐 Discrição total. Acesso vitalício. Sem assinatura. Sem rastros.

Você já viu meu corpo... Agora vai ver o que fazem com ele.

Mas atenção: essa chance aparece uma única vez
Perdeu, perdeu.`,
    menuInicial: {
      texto: `Você já me viu sozinha…
Agora pode me ver de um jeito que poucos viram.
Acompanhada. Entregue. E com uma surpresa só sua. 😌

👇 Quero ver agora, sem censura 👇`,
      opcoes: [
        { texto: `💎 Acesso Vitalício + Punheta Guiada – R$${valorVitalicio.toFixed(2)}`, callback: 'vitalicio' },
        { texto: `🔓 Acesso Vitalício – R$${valorAcesso.toFixed(2)}`, callback: 'semanal' }
      ]
    }
  },
  planos: [
    { id: 'vitalicio', nome: 'Acesso Vitalício + Punheta Guiada', valor: valorVitalicio, emoji: '💎' },
    { id: 'semanal', nome: 'Acesso Vitalício', valor: valorAcesso, emoji: '🔓' }
  ],
  midias: {
    inicial: { video: './midia/inicial2.mp4' },
    downsells: {
      ds1: { imagem: './midia/downsells/ds1.jpg' },
      ds2: { video: './midia/downsells/ds2.mp4' },
      ds3: { imagem: './midia/downsells/ds3.jpg' },
      ds4: { imagem: './midia/downsells/ds4.jpg' },
      ds5: { imagem: './midia/downsells/ds5.jpg' },
      ds6: { imagem: './midia/downsells/ds6.jpg' },
      ds7: { imagem: './midia/downsells/ds7.jpg' },
      ds8: { imagem: './midia/downsells/ds8.jpg' },
      ds9: { video: './midia/downsells/ds9.mp4' },
      ds10: { imagem: './midia/downsells/ds10.jpg' }
    }
  },
  downsells: [
    ...[24.90, 23.90, 23.90, 20.90, 20.90, 20.90, 20.90, 20.90, 20.90, 20.90].map((preco, i) => ({
      id: `ds${i+1}`,
      emoji: '💋',
      texto: [
        'Amor, você viu o que te espera lá dentro...\nVídeos íntimos acompanhada, ménage, lésbico real.\nR$24,90 vitalício. Sem assinatura. Sem censura.\nPagou, entrou. Entrou, se deliciou.',
        'Ainda pensando?\nVocê já imaginou como é me ver com outro... gemendo de verdade.\nToma 5% OFF: R$23,90 – acesso vitalício.\nEssa intimidade não tem preço.',
        'Você já viu meu corpo sozinho...\nAgora imagina ele sendo tocado, beijado, penetrado.\nÚltima chance com 5% OFF: R$23,90.\nDepois disso, só no sonho.',
        'Te dou 15% OFF agora. Mas é só agora.\nR$20,90 – vitalício completo.\nVocê sabe que quer ver... me entregando toda.\nSaiu dessa tela, perdeu.',
        'Ainda aqui? Então você realmente quer...\nR$20,90 – acesso vitalício completo.\nTodos os vídeos acompanhada. Sem limite de tempo.\nEsse valor não cai mais.',
        'Tem gente lá dentro vendo tudo que faço acompanhada.\nR$20,90 – última chamada real.\nMénage, lésbico, com homem... tudo sem censura.\nSó falta você entrar.',
        'Você quase entrou... quase me viu sendo tocada.\nR$20,90 – sem mais desconto.\nÚltima chance de me ver do jeito mais íntimo.\nPra quem tem coragem de verdade.',
        'Viu meu corpo. Sentiu minha energia.\nSabe que vai se arrepender se não ver o resto...\nR$20,90 – fixo. Sem volta.\nMe acompanhada é outro nível.',
        'Se ainda tá aqui, é porque quer me ver sendo tocada.\nTestando seu limite?\nR$20,90 vitalício. Entra ou fica só na imaginação.',
        'Recusou várias vezes. Mas continua aqui, né?\nR$20,90 – última chance de verdade.\nDepois disso, só resta a curiosidade.'
      ][i],
      tipoMidia: 'video',
      planos: [
        {
          id: `ds${i+1}_vitalicio`,
          nome: 'Acesso Vitalício + Punheta Guiada',
          emoji: '💎',
          valorOriginal: valorVitalicio,
          valorComDesconto: preco
        },
        {
          id: `ds${i+1}_acesso`,
          nome: 'Acesso Vitalício',
          emoji: '🔓',
          valorOriginal: valorAcesso,
          valorComDesconto: valorAcesso
        }
      ]
    }))
  ],
  mensagensPeriodicas: [],
  canalPrevias: null,
  mensagens: {
    ...(base.mensagens || {}),
    boasVindas: '👋 Bem-vindo ao bot2!'
  }
};
