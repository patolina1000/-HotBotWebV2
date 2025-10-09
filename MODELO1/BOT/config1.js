const base = require('./config.default');

module.exports = {
  ...base,

  // 🎬 CONFIGURAÇÃO DE DOIS VÍDEOS INICIAIS
  midias: {
    // 🔥 IMPORTANTE: NÃO herdar configuração padrão para sobrescrever completamente
    inicial: {
      video: './midia/inicial.mp4',
      video2: './midia/inicial_2.mp4' // Segundo vídeo obrigatório
    },
    // 🔥 AQUECIMENTO PIX: Imagem PIX para aquecimento rápido
    pix: {
      imagem: './midia/pix_image.png'
    },
    // Manter downsells da configuração padrão
    downsells: base.midias.downsells
  },

  inicio: {
    tipoMidia: 'video',
    // 🔥 NOVA CONFIGURAÇÃO: Forçar envio de múltiplas mídias
    enviarTodasMidias: true,
    textoInicial: `⬆️ Dá uma olhada nesse vídeo e veja o VIP por dentro!
🔐 𝐏𝐑𝐎𝐌𝐎𝐂̧𝐀̃𝐎 𝐄𝐗𝐂𝐋𝐔𝐒𝐈𝐕𝐀 liberada pra VOCÊ 🫵🏼

⚠️ Você tem 𝐒𝐎́ 8️⃣ MINUTOS pra garantir seu acesso antes que TRAVE DE NOVO

🧸 𝐍𝐎𝐕!𝐍𝐇𝟒𝐒 ⁺¹⁸
👩🏼‍🍼 !𝐍𝐂𝟑𝐒𝐓!𝐍𝐇𝟎𝐒 𝐁𝟒𝐍!𝐃𝟎𝐒 ⁺¹⁸
🌸 𝐍𝐎𝐕!𝐍𝐇𝟒𝐒 𝐃𝟒𝐑𝐊 𝐄𝐌 𝐅𝐄𝐒𝐓!𝐍𝐇𝟒𝐒 ⁺¹⁸
🩸 𝐒𝐔𝐑𝐑𝐔𝟒𝟒𝐒 𝐌𝟒𝐂𝟒𝐁𝐑𝟄𝐒 𝐂𝐑ʋ𝐀𝐒 ⁺¹⁸
🚫 𝐌!𝐃!𝐀𝐒 𝐑𝐀𝐑𝟒𝐒, 𝐒𝐄𝐌 𝐂𝐄𝐍𝐒ʋ𝐑𝟒
🚷 𝐓𝐑𝐎𝐂𝐀𝐒 𝐏𝟑𝐒𝟒𝐃𝟒𝐒 𝐃𝐀 𝐃𝐄𝐄𝐏

🪄 𝐌𝐀𝐈𝐒 𝐁𝐎𝐍𝐔𝐒 liberados:

🎁 𝐆𝐑𝐔𝐏𝐎 𝐏𝐀𝐑𝐀 𝐏𝐄𝐃𝐈𝐃𝐎𝐒 de QUALQUER tipo de cont3údo ⁺¹⁸
🎁 𝐏𝐑𝐄𝐌𝐈𝐀𝐂̧𝐎̃𝐄𝐒 𝐃𝐈𝐀́𝐑𝐈𝐀𝐒 de conteúdo PR0!B!D0 ⁺¹⁸
🎁 𝐀𝐂𝐄𝐒𝐒𝐎 𝐂𝐎𝐌𝐏𝐋𝐄𝐓𝐎 às modelos do PR!V4CY / 0NL¥F4N$

🚀 Já são +3.443 m!dias d!árias disponíveis

💥 Por: 𝐀𝐏𝐄𝐍𝐀𝐒 R$ 12,00 com 𝟔𝟓% 𝐃𝐄 𝐃𝐄𝐒𝐂𝐎𝐍𝐓𝐎

👇 Escolha seu plano & realize o pagamento agora
🔐 𝐀𝐍𝐓𝐄𝐒 𝐐𝐔𝐄 𝐒𝐀𝐈𝐀 𝐃𝐎 𝐀𝐑`,
    menuInicial: {
      texto: `🔐 𝙶𝟶𝚉𝙰𝙳𝙰 𝙶𝙰𝚁𝙰𝙽𝚃𝙸𝙳𝙰 𝙾𝚄 𝚂𝙴𝚄 𝙳𝙸𝙽𝙷𝙴𝙸𝚁𝙾 𝙳𝙴 𝚅𝙾𝙻𝚃𝙰🔐  

Prove que é homem de verdade… e escolha agora como vai me ter… 👇🏻`,
      opcoes: [
        { texto: '🔥 VITALICIO - R$ 19,90', callback: 'plano_padrao' },
        { texto: '😈 VITALICIO + INC3ST0S M4C4BR0S - R$ 24,90', callback: 'plano_plus' },
        { texto: '🍼 INC3ST0S M4CABROS + V4Z4D0S DA D33PWEB - R$ 34,90', callback: 'plano_premium' }
      ]
    }
  },

  // Menu dos planos (aparece quando clica em ESCOLHER VIP)
  menuPlanos: {
    texto: `Escolha uma oferta abaixo:`,
    opcoes: [
      { texto: '🔥 VITALICIO - R$ 19,90', callback: 'plano_padrao' },
      { texto: '😈 VITALICIO + INC3ST0S M4C4BR0S - R$ 24,90', callback: 'plano_plus' },
      { texto: '🍼 INC3ST0S M4CABROS + V4Z4D0S DA D33PWEB - R$ 34,90', callback: 'plano_premium' }
    ]
  },

  // Configuração do Instagram
  instagram: {
    url: 'https://www.instagram.com/hadriiimaria_'
  },

  planos: [
    {
      id: 'plano_padrao',
      nome: 'VITALICIO',
      emoji: '🔥',
      valor: 19.90,
      descricao: 'Acesso vitalício à galeria pessoal + atualizações semanais + vídeo personalizado'
    },
    {
      id: 'plano_plus',
      nome: 'VITALICIO + INC3ST0S M4C4BR0S',
      emoji: '💀',
      valor: 24.90,
      descricao: 'Tudo do plano padrão + conteúdo exclusivo + chamada ao vivo + WhatsApp pessoal'
    },
    {
      id: 'plano_premium',
      nome: 'INC3ST0S M4CABROS + V4Z4D0S DA D33PWEB',
      emoji: '🌙',
      valor: 34.90,
      descricao: 'Conteúdo mais exclusivo + acesso completo + suporte premium'
    }
  ],

  downsells: [
    {
      id: 'ds1',
      emoji: '🏥',
      texto: 'MEGA SURUBA NO HOSPITAL\nDE TEREZOPOLIS!\n\nFinalmente os vídeos vazaram, e vou te contar, estão uma delicia!\n\nSuruba proibid4 de respeito disponível no VIP, 4 VÍDEOS 27 MINUTOS.\n\n15 em 1 😁\n\nNosso vip possui conteudos de Onlyfans, vazamentos, cornos, incesto REAL, amador, flagras em cameras, sexo em publico, gestantes, filmes completos e Lives e mais!\n\nTudo separado por topicos, dentro de um so grupo.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds1_padrao', nome: 'VITALICIO + INC3ST0S M4C4BR0S', emoji: '💀', valorOriginal: 24.90, valorComDesconto: 24.90 }
      ]
    },
    {
      id: 'ds2',
      emoji: '📱',
      texto: 'Cavala famosa no TikTok tem seus videos fodendo vazados com seus namorado.\n\nAssine o VIP e tenha acesso à 15 temas diferentes de put4ria.\n\nAmadores, cornos, vazadas, famosas, inc3sto, flagras, filmes nacionais, gestantes, Cuckold, em publico, lives e mais!\n\nAcabamos de mandar centenas de vazados novos que vão te deixar de boca molhada!',
      tipoMidia: 'video',
      planos: [
        { id: 'ds2_padrao', nome: 'VITALICIO + INC3ST0S M4C4BR0S', emoji: '💀', valorOriginal: 24.90, valorComDesconto: 24.90 }
      ]
    },
    {
      id: 'ds3',
      emoji: '💋',
      texto: 'Você já sabe o que tem lá dentro.\nE já imagina o que vai fazer com aquele conteúdo…\nÚltima vez com 5% OFF: R$19,00.\nEntra agora e se entrega.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds3_padrao', nome: 'VITALICIO + INC3ST0S M4C4BR0S', emoji: '💀', valorOriginal: 24.90, valorComDesconto: 23.66 }
      ]
    },
    {
      id: 'ds4',
      emoji: '💋',
      texto: 'Te dou 10% agora. Mas é agora mesmo.\nR$18,00 – PUTA COMPORTADA - 1.\nSaiu dessa tela, acabou.\nVocê sabe que quer. Clica logo.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds4_padrao', nome: 'VITALICIO + INC3ST0S M4C4BR0S', emoji: '💀', valorOriginal: 24.90, valorComDesconto: 22.41 }
      ]
    },
    {
      id: 'ds5',
      emoji: '💋',
      texto: 'Você tá aqui ainda… então toma mais um empurrãozinho.\nR$18,00 – PUTA COMPORTADA - 1.\nSem assinatura. Sem limite. Pagou, entrou.\nDepois disso, esse valor é fixo.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds5_padrao', nome: 'VITALICIO + INC3ST0S M4C4BR0S', emoji: '💀', valorOriginal: 24.90, valorComDesconto: 22.41 }
      ]
    },
    {
      id: 'ds6',
      emoji: '💋',
      texto: 'Tem gente lá dentro aproveitando tudo. Só falta você.\nR$17,00 – PUTA COMPORTADA.\nEsse valor não cai mais. Só falta você entrar.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds6_padrao', nome: 'VITALICIO + INC3ST0S M4C4BR0S', emoji: '💀', valorOriginal: 24.90, valorComDesconto: 21.17 }
      ]
    },
    {
      id: 'ds7',
      emoji: '💋',
      texto: 'Você quase entrou… e eu quase te mostrei tudo.\nR$17,00 – PUTA COMPORTADA.\nÚltima chamada pra quem tem coragem.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds7_padrao', nome: 'VITALICIO + INC3ST0S M4C4BR0S', emoji: '💀', valorOriginal: 24.90, valorComDesconto: 21.17 }
      ]
    },
    {
      id: 'ds8',
      emoji: '💋',
      texto: 'Você viu meu corpo. Sentiu minha vibe.\nSabe que vai se arrepender se sair agora…\nR$17,00 – PUTA COMPORTADA. Fixo. Sem volta.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds8_padrao', nome: 'VITALICIO + INC3ST0S M4C4BR0S', emoji: '💀', valorOriginal: 24.90, valorComDesconto: 21.17 }
      ]
    },
    {
      id: 'ds9',
      emoji: '💋',
      texto: 'Se você tá aqui ainda, é porque quer.\nTá testando teu limite?\nEntão testa isso: R$17,00 PUTA COMPORTADA. Entra ou some.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds9_padrao', nome: 'VITALICIO + INC3ST0S M4C4BR0S', emoji: '💀', valorOriginal: 24.90, valorComDesconto: 21.17 }
      ]
    },
    {
      id: 'ds10',
      emoji: '💋',
      texto: 'Já recusou várias vezes. Mas tá aqui ainda, né?\nR$17,00 – PUTA COMPORTADA. Última chance real.\nDepois disso, só no print.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds10_padrao', nome: 'VITALICIO + INC3ST0S M4C4BR0S', emoji: '💀', valorOriginal: 24.90, valorComDesconto: 21.17 }
      ]
    },
    {
      id: 'ds11',
      emoji: '💋',
      texto: 'Última chance real.\nDepois disso, só no print.\nR$17,00 – PUTA COMPORTADA.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds11_padrao', nome: 'VITALICIO + INC3ST0S M4C4BR0S', emoji: '💀', valorOriginal: 24.90, valorComDesconto: 21.17 }
      ]
    },
    {
      id: 'ds12',
      emoji: '💋',
      texto: 'Fim da linha.\nR$17,00 – PUTA COMPORTADA.\nÚltima vez.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds12_padrao', nome: 'VITALICIO + INC3ST0S M4C4BR0S', emoji: '💀', valorOriginal: 24.90, valorComDesconto: 21.17 }
      ]
    }
  ],

  // Menu específico para mensagens periódicas (plano único de R$ 24,90)
  menuPeriodicas: {
    texto: ``,
    opcoes: [
      { texto: 'R$ 24,90', callback: 'plano_periodico_unico' }
    ]
  },

  // Plano único para mensagens periódicas
  planoPeriodico: {
    id: 'plano_periodico_unico',
    nome: 'VITALICIO + INC3ST0S M4C4BR0S',
    emoji: '💀',
    valor: 24.90,
    descricao: 'VITALICIO + INC3ST0S M4C4BR0S - R$ 24,90'
  },

  mensagensPeriodicas: [
    {
      horario: '08:00',
      texto: ``,
      midia: './midia/downsells/ds1.jpg'
    },
    {
      horario: '19:00',
      texto: ``,
      midia: './midia/downsells/ds2.jpg'
    },
    {
      horario: '21:00',
      texto: ``,
      midia: './midia/downsells/ds1.jpg'
    },
    {
      horario: '23:00',
      texto: ``,
      midia: './midia/downsells/ds2.jpg'
    }
  ]
};
