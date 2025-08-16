const base = require('./config.default');

// 💰 Valores oficiais dos planos para o bot3
const valorVitalicio = 29.90;
const valorAcesso = 24.90;

module.exports = {
  ...base,

  inicio: {
    tipoMidia: 'video',
    midia: './midia/inicial3.mp4',
    textoInicial: `Oi, amor... 😘
Bem-vindo ao meu mundo particular, onde tudo é possível e nada é censurado.

Por apenas R$${valorVitalicio.toFixed(2)} (vitalício):

🔥 Conteúdo exclusivo e sem filtros
🔥 Vídeos íntimos e fotos sensuais
🔥 Atualizações semanais garantidas
🔥 Acesso ao meu WhatsApp pessoal
🔥 Sigilo total e discrição absoluta
🔥 Sem assinatura mensal - apenas uma vez
🔥 Acesso imediato após o pagamento

Aqui você vai encontrar tudo que sempre sonhou ver, sem censura e sem limites.

Mas atenção: essa oportunidade é única e pode desaparecer a qualquer momento.`,
    menuInicial: {
      texto: `Decida agora: ou entra no meu mundo particular e vê tudo que sempre quis, ou volta para a realidade comum... mas vai continuar pensando em mim depois. 😈

👇 Escolha seu destino 👇`,
      opcoes: [
        { texto: `💎 Acesso Premium Vitalício – R$${valorVitalicio.toFixed(2)}`, callback: 'premium_vitalicio' },
        { texto: `🔓 Acesso Básico – R$${valorAcesso.toFixed(2)}`, callback: 'basico_acesso' }
      ]
    }
  },

  planos: [
    { id: 'premium_vitalicio', nome: 'Acesso Premium Vitalício', valor: valorVitalicio, emoji: '💎' },
    { id: 'basico_acesso', nome: 'Acesso Básico', valor: valorAcesso, emoji: '🔓' }
  ],

  midias: {
    inicial: { video: './midia/inicial3.mp4' }
  },

  downsells: [
    {
      id: 'ds1_bot3',
      emoji: '💋',
      texto: 'Ei, percebi que você não finalizou sua assinatura... 😢\n\n💋 Entra no meu grupo VIP agora e vem ver sua garota de um jeito que você nunca viu antes 🙈\n\nDesconto especial liberado só para você!',
      tipoMidia: 'video',
      planos: [
        {
          id: 'ds1_bot3_premium',
          nome: 'Premium Vitalício',
          emoji: '💎',
          valorOriginal: valorVitalicio,
          valorComDesconto: 26.90
        },
        {
          id: 'ds1_bot3_basico',
          nome: 'Acesso Básico',
          emoji: '🔓',
          valorOriginal: valorAcesso,
          valorComDesconto: 22.90
        }
      ]
    },
    {
      id: 'ds2_bot3',
      emoji: '🔥',
      texto: 'Você ainda está aqui... então vou te dar mais um empurrãozinho! 🔥\n\n🔥 Desconto especial + conteúdo surpresa liberado agora mesmo!\n\nMas corre, essa oferta não vai durar muito tempo...',
      tipoMidia: 'video',
      planos: [
        {
          id: 'ds2_bot3_premium',
          nome: 'Premium Vitalício',
          emoji: '💎',
          valorOriginal: valorVitalicio,
          valorComDesconto: 24.90
        },
        {
          id: 'ds2_bot3_basico',
          nome: 'Acesso Básico',
          emoji: '🔓',
          valorOriginal: valorAcesso,
          valorComDesconto: 19.90
        }
      ]
    }
  ],

  mensagensPeriodicas: [
    {
      horario: '09:00',
      texto: `Bom dia, amor! ☀️\n\nQue tal começar o dia com um pouco de diversão?\n\nPor apenas R$${valorVitalicio.toFixed(2)} você tem acesso a todo meu conteúdo premium!\n\n🔥 Mais de 500 fotos e vídeos\n🔥 Conteúdo exclusivo semanal\n🔥 Acesso ao meu WhatsApp\n🔥 Sigilo total garantido\n\n👇 Estou te esperando aqui 👇`,
      midia: './midia/09.mp4'
    },
    {
      horario: '14:00',
      texto: `Oi de novo, safadinho! 😈\n\nEstá com saudades? Eu também...\n\nQue tal um almoço diferente hoje?\n\nR$${valorAcesso.toFixed(2)} e você tem acesso completo ao meu mundo particular.\n\nSem censura, sem limites, só diversão pura!\n\n👇 Vem brincar comigo 👇`,
      midia: './midia/14.mp4'
    },
    {
      horario: '19:00',
      texto: `Boa noite, amor! 🌙\n\nQue tal terminar o dia com uma surpresa?\n\nAcesso premium por apenas R$${valorVitalicio.toFixed(2)} - vitalício!\n\n🔥 Conteúdo exclusivo\n🔥 Atualizações semanais\n🔥 Acesso direto ao WhatsApp\n🔥 Sigilo total\n\n👇 Sua garota está te esperando 👇`,
      midia: './midia/19.mp4'
    }
  ],

  canalPrevias: 'https://t.me/+W9Z1JaCM60gzNDcx',

  mensagens: {
    ...(base.mensagens || {}),
    boasVindas: '👋 Bem-vindo ao bot3! Aqui você encontra conteúdo exclusivo e sem censura!'
  }
};
