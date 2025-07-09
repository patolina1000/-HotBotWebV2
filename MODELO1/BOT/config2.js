const base = require('./config.default');

module.exports = {
  ...base,
  inicio: {
    tipoMidia: 'video',
    midia: './midia/inicial2.mp4',
    textoInicial: `Oi de novo, amor...
Você já me viu se tocando, rebolando, gemendo só pra você.
Mas agora chegou a parte que quase ninguém vê…
Meus vídeos acompanhada.

Por apenas R$29,90 (vitalício):

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
        { texto: '🔓 Acesso Vitalício – R$29,90', callback: 'vitalicio' }
      ]
    }
  },
  planos: [
    { id: 'vitalicio', nome: 'Vitalício', valor: 29.90 }
  ],
  midias: {
    inicial: { video: './midia/inicial2.mp4' }
  },
  downsells: [],
  mensagensPeriodicas: [],
  canalPrevias: null,
  mensagens: {
    ...(base.mensagens || {}),
    boasVindas: '👋 Bem-vindo ao bot2!'
  }
};
