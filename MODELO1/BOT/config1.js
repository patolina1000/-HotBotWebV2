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

Nosso VIP é o lugar onde tudo é organizada e o prazer rola solto. Aqui, você encontra tudo o que imagina e muito mais, tudo separadinho em tópicos pra você navegar sem perder tempo.

Você encontrar vazamentos, cornos, Only fãns, amador, flagras de câmeras, sex0 em público, filmes completos, Lives e muito mais.

E não para por aí: atualizações diárias pra você nunca ficar na mão, e download liberado pra curtir onde e quando quiser. É pura praticidade. 🔥

Satisfação garantida ou seu dinheiro de volta! Então, bora pro VIP? É só entrar.`,
    menuInicial: {
      texto: `🔐 𝙶𝟶𝚉𝙰𝙳𝙰 𝙶𝙰𝚁𝙰𝙽𝚃𝙸𝙳𝙰 𝙾𝚄 𝚂𝙴𝚄 𝙳𝙸𝙽𝙷𝙴𝙸𝚁𝙾 𝙳𝙴 𝚅𝙾𝙻𝚃𝙰🔐  

Prove que é homem de verdade… e escolha agora como vai me ter… 👇🏻`,
      opcoes: [
        { texto: '⭐ PUTA COMPORTADA - R$ 20,00', callback: 'plano_padrao' },
        { texto: '💎 PUTA DE ESTIMAÇÃO - R$ 35,00', callback: 'plano_plus' }
      ]
    }
  },

  // Menu dos planos (aparece quando clica em ESCOLHER VIP)
  menuPlanos: {
    texto: `Escolha uma oferta abaixo:`,
    opcoes: [
      { texto: '⭐ PUTA COMPORTADA - R$ 20,00', callback: 'plano_padrao' },
      { texto: '💎 PUTA DE ESTIMAÇÃO - R$ 35,00', callback: 'plano_plus' }
    ]
  },

  // Configuração do Instagram
  instagram: {
    url: 'https://www.instagram.com/hadriiimaria_'
  },

  planos: [
    {
      id: 'plano_padrao',
      nome: 'PUTA COMPORTADA',
      emoji: '⭐',
      valor: 20.00,
      descricao: 'Acesso vitalício à galeria pessoal + atualizações semanais + vídeo personalizado'
    },
    {
      id: 'plano_plus',
      nome: 'PUTA DE ESTIMAÇÃO',
      emoji: '💎',
      valor: 35.00,
      descricao: 'Tudo do plano padrão + conteúdo exclusivo + chamada ao vivo + WhatsApp pessoal'
    }
  ],

  downsells: [
    {
      id: 'ds1',
      emoji: '🏥',
      texto: 'MEGA SURUBA NO HOSPITAL\nDE TEREZOPOLIS!\n\nFinalmente os vídeos vazaram, e vou te contar, estão uma delicia!\n\nSuruba proibid4 de respeito disponível no VIP, 4 VÍDEOS 27 MINUTOS.\n\n15 em 1 😁\n\nNosso vip possui conteudos de Onlyfans, vazamentos, cornos, incesto REAL, amador, flagras em cameras, sexo em publico, gestantes, filmes completos e Lives e mais!\n\nTudo separado por topicos, dentro de um so grupo.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds1_padrao', nome: 'VIP COMPLETO', emoji: '🔥', valorOriginal: 29.90, valorComDesconto: 29.90 }
      ]
    },
    {
      id: 'ds2',
      emoji: '📱',
      texto: 'Cavala famosa no TikTok tem seus videos fodendo vazados com seus namorado.\n\nAssine o VIP e tenha acesso à 15 temas diferentes de put4ria.\n\nAmadores, cornos, vazadas, famosas, inc3sto, flagras, filmes nacionais, gestantes, Cuckold, em publico, lives e mais!\n\nAcabamos de mandar centenas de vazados novos que vão te deixar de boca molhada!',
      tipoMidia: 'video',
      planos: [
        { id: 'ds2_padrao', nome: 'VIP COMPLETO', emoji: '🔥', valorOriginal: 29.90, valorComDesconto: 29.90 }
      ]
    },
    {
      id: 'ds3',
      emoji: '💋',
      texto: 'Você já sabe o que tem lá dentro.\nE já imagina o que vai fazer com aquele conteúdo…\nÚltima vez com 5% OFF: R$19,00.\nEntra agora e se entrega.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds3_padrao', nome: 'PUTA COMPORTADA', emoji: '⭐', valorOriginal: 20.00, valorComDesconto: 19.00 },
        { id: 'ds3_plus', nome: 'PUTA DE ESTIMAÇÃO', emoji: '💎', valorOriginal: 35.00, valorComDesconto: 33.25 }
      ]
    },
    {
      id: 'ds4',
      emoji: '💋',
      texto: 'Te dou 10% agora. Mas é agora mesmo.\nR$18,00 – PUTA COMPORTADA - 1.\nSaiu dessa tela, acabou.\nVocê sabe que quer. Clica logo.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds4_padrao', nome: 'PUTA COMPORTADA', emoji: '⭐', valorOriginal: 20.00, valorComDesconto: 18.00 },
        { id: 'ds4_plus', nome: 'PUTA DE ESTIMAÇÃO', emoji: '💎', valorOriginal: 35.00, valorComDesconto: 31.50 }
      ]
    },
    {
      id: 'ds5',
      emoji: '💋',
      texto: 'Você tá aqui ainda… então toma mais um empurrãozinho.\nR$18,00 – PUTA COMPORTADA - 1.\nSem assinatura. Sem limite. Pagou, entrou.\nDepois disso, esse valor é fixo.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds5_padrao', nome: 'PUTA COMPORTADA', emoji: '⭐', valorOriginal: 20.00, valorComDesconto: 18.00 },
        { id: 'ds5_plus', nome: 'PUTA DE ESTIMAÇÃO', emoji: '💎', valorOriginal: 35.00, valorComDesconto: 31.50 }
      ]
    },
    {
      id: 'ds6',
      emoji: '💋',
      texto: 'Tem gente lá dentro aproveitando tudo. Só falta você.\nR$17,00 – PUTA COMPORTADA.\nEsse valor não cai mais. Só falta você entrar.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds6_padrao', nome: 'PUTA COMPORTADA', emoji: '⭐', valorOriginal: 20.00, valorComDesconto: 17.00 },
        { id: 'ds6_plus', nome: 'PUTA DE ESTIMAÇÃO', emoji: '💎', valorOriginal: 35.00, valorComDesconto: 29.75 }
      ]
    },
    {
      id: 'ds7',
      emoji: '💋',
      texto: 'Você quase entrou… e eu quase te mostrei tudo.\nR$17,00 – PUTA COMPORTADA.\nÚltima chamada pra quem tem coragem.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds7_padrao', nome: 'PUTA COMPORTADA', emoji: '⭐', valorOriginal: 20.00, valorComDesconto: 17.00 },
        { id: 'ds7_plus', nome: 'PUTA DE ESTIMAÇÃO', emoji: '💎', valorOriginal: 35.00, valorComDesconto: 29.75 }
      ]
    },
    {
      id: 'ds8',
      emoji: '💋',
      texto: 'Você viu meu corpo. Sentiu minha vibe.\nSabe que vai se arrepender se sair agora…\nR$17,00 – PUTA COMPORTADA. Fixo. Sem volta.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds8_padrao', nome: 'PUTA COMPORTADA', emoji: '⭐', valorOriginal: 20.00, valorComDesconto: 17.00 },
        { id: 'ds8_plus', nome: 'PUTA DE ESTIMAÇÃO', emoji: '💎', valorOriginal: 35.00, valorComDesconto: 29.75 }
      ]
    },
    {
      id: 'ds9',
      emoji: '💋',
      texto: 'Se você tá aqui ainda, é porque quer.\nTá testando teu limite?\nEntão testa isso: R$17,00 PUTA COMPORTADA. Entra ou some.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds9_padrao', nome: 'PUTA COMPORTADA', emoji: '⭐', valorOriginal: 20.00, valorComDesconto: 17.00 },
        { id: 'ds9_plus', nome: 'PUTA DE ESTIMAÇÃO', emoji: '💎', valorOriginal: 35.00, valorComDesconto: 29.75 }
      ]
    },
    {
      id: 'ds10',
      emoji: '💋',
      texto: 'Já recusou várias vezes. Mas tá aqui ainda, né?\nR$17,00 – PUTA COMPORTADA. Última chance real.\nDepois disso, só no print.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds10_padrao', nome: 'PUTA COMPORTADA', emoji: '⭐', valorOriginal: 20.00, valorComDesconto: 17.00 },
        { id: 'ds10_plus', nome: 'PUTA DE ESTIMAÇÃO', emoji: '💎', valorOriginal: 35.00, valorComDesconto: 29.75 }
      ]
    },
    {
      id: 'ds11',
      emoji: '💋',
      texto: 'Última chance real.\nDepois disso, só no print.\nR$17,00 – PUTA COMPORTADA.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds11_padrao', nome: 'PUTA COMPORTADA', emoji: '⭐', valorOriginal: 20.00, valorComDesconto: 17.00 },
        { id: 'ds11_plus', nome: 'PUTA DE ESTIMAÇÃO', emoji: '💎', valorOriginal: 35.00, valorComDesconto: 29.75 }
      ]
    },
    {
      id: 'ds12',
      emoji: '💋',
      texto: 'Fim da linha.\nR$17,00 – PUTA COMPORTADA.\nÚltima vez.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds12_padrao', nome: 'PUTA COMPORTADA', emoji: '⭐', valorOriginal: 20.00, valorComDesconto: 17.00 },
        { id: 'ds12_plus', nome: 'PUTA DE ESTIMAÇÃO', emoji: '💎', valorOriginal: 35.00, valorComDesconto: 29.75 }
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
    nome: 'PUTA COMPORTADA',
    emoji: '⭐',
    valor: 20.00,
    descricao: 'PUTA COMPORTADA - R$ 20,00'
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
