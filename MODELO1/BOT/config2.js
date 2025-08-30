const base = require('./config.default');

// 💰 Valores oficiais dos planos
const valorVitalicio = 29.90;
const valorAcesso = 34.90;

module.exports = {
  ...base,
  inicio: {
    tipoMidia: 'video',
    midia: './midia/inicial2.mp4',
    textoInicial: `Na minha galeria completa, você vai encontrar todos os vídeos que já gravei na vida.

E não é só isso...

🔹 GALERIA COMPLETA – R$${valorVitalicio.toFixed(2)}
✔️ 20 vídeos e fotos exclusivos com estranhos
✔️ Conteúdo 100% sem censura
✔️ Bônus: 1 vídeo secreto enviado direto no WhatsApp

🔹 GALERIA COMPLETA + AMADORES – R$${valorAcesso.toFixed(2)}
✔️ +50 conteúdos exclusivos
✔️ Vídeos pesados e inéditos com negões
✔️ Amadores com meu ex e minha prima
✔️ Galeria só com conteúdo de respeito
✔️ Bônus no WhatsApp: vídeo secreto da minha primeira vez

E pra quem entrar agora, tem um presentinho especial: Uma chamada de 20 minutos onde eu gemo, brinco e mostro meu corpo todinho...
até você gozar. 🤤

⚠️ Mas é agora ou nunca, essa chamada só vai acontecer se você entrar AGORA.`,
    menuInicial: {
      texto: `Clica aqui e vem ver o que é pultaria de verdade 👇`,
      opcoes: [
        { texto: `LIBERAR ACESSO AGORA`, callback: 'liberar_acesso_agora' }
      ]
    }
  },
  planos: [
    { id: 'galeria_completa', nome: 'GALERIA COMPLETA', valor: valorVitalicio, emoji: '🔹' },
    { id: 'galeria_amadores', nome: 'GALERIA COMPLETA + AMADORES', valor: valorAcesso, emoji: '🔹' }
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
    ...[29.90, 27.90, 27.90, 25.90, 25.90, 23.90, 23.90, 23.90, 23.90, 23.90].map((preco, i) => {
      // Calcular desconto percentual baseado no primeiro plano
      const descontoPercentual = (valorVitalicio - preco) / valorVitalicio;
      const precoSegundoPlano = valorAcesso * (1 - descontoPercentual);
      
      return {
        id: `ds${i+1}`,
        emoji: '✔️',
        texto: [
          'Amor, você viu o que te espera lá dentro...\nVídeos íntimos acompanhada, ménage, lésbico real.\nR$29,90 vitalício. Sem assinatura. Sem censura.\nPagou, entrou. Entrou, se deliciou.',
          'Ainda pensando?\nVocê já imaginou como é me ver com outro... gemendo de verdade.\nToma 5% OFF: R$27,90 – acesso vitalício.\nEssa intimidade não tem preço.',
          'Você já viu meu corpo sozinho...\nAgora imagina ele sendo tocado, beijado, penetrado.\nÚltima chance com 5% OFF: R$27,90.\nDepois disso, só no sonho.',
          'Te dou 10% OFF agora. Mas é só agora.\nR$25,90 – vitalício completo.\nVocê sabe que quer ver... me entregando toda.\nSaiu dessa tela, perdeu.',
          'Ainda aqui? Então você realmente quer...\nR$25,90 – acesso vitalício completo.\nTodos os vídeos acompanhada. Sem limite de tempo.\nEsse valor não cai mais.',
          'Tem gente lá dentro vendo tudo que faço acompanhada.\nR$23,90 – última chamada real.\nMénage, lésbico, com homem... tudo sem censura.\nSó falta você entrar.',
          'Você quase entrou... quase me viu sendo tocada.\nR$23,90 – sem mais desconto.\nÚltima chance de me ver do jeito mais íntimo.\nPra quem tem coragem de verdade.',
          'Viu meu corpo. Sentiu minha energia.\nSabe que vai se arrepender se não ver o resto...\nR$23,90 – fixo. Sem volta.\nMe acompanhada é outro nível.',
          'Se ainda tá aqui, é porque quer me ver sendo tocada.\nTestando seu limite?\nR$23,90 vitalício. Entra ou fica só na imaginação.',
          'Recusou várias vezes. Mas continua aqui, né?\nR$23,90 – última chance de verdade.\nDepois disso, só resta a curiosidade.'
        ][i],
        tipoMidia: 'video',
        planos: [
          {
            id: `ds${i+1}_galeria_completa`,
            nome: 'GALERIA COMPLETA',
            emoji: '🔹',
            valorOriginal: valorVitalicio,
            valorComDesconto: preco
          },
          {
            id: `ds${i+1}_galeria_amadores`,
            nome: 'GALERIA COMPLETA + PUNHETA GUIADA',
            emoji: '🔹',
            valorOriginal: valorAcesso,
            valorComDesconto: precoSegundoPlano
          }
        ]
      };
    })
  ],
  mensagensPeriodicas: [],
  canalPrevias: null,
  mensagens: {
    ...(base.mensagens || {}),
    boasVindas: '👋 Bem-vindo ao bot2!'
  }
};
