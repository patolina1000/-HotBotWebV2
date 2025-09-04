const base = require('./config.default');

module.exports = {
  ...base,

  inicio: {
    tipoMidia: 'video',
    // 🔥 NOVA CONFIGURAÇÃO: Forçar envio de múltiplas mídias
    enviarTodasMidias: true,
    // 🎬 CONFIGURAÇÃO DE DOIS VÍDEOS INICIAIS
    midias: {
      inicial: { 
        video: './midia/inicial.mp4',
        video2: './midia/inicial_2.mp4' // Segundo vídeo opcional
      }
    },
    textoInicial: `💦 Aos 22 aninhos, virei a PUTINHA VIP mais desejada do Brasil 🇧🇷
✦━━━━━━━━━━━━✦

🔥 VIP 𝐏𝐔𝐓𝐈𝐍𝐇𝐀 𝐂𝐎𝐌𝐏𝐎𝐑𝐓𝐀𝐃𝐀
✔️ Acesso vitalício à minha galeria pessoal (vídeos gozada real)
✔️ Atualizações semanais com putaria molhada 🥵
✔️ Vídeo de boas-vindas exclusivo, com teu nome, gemendo no teu ouvido

💎 VIP  𝐏𝐔𝐓𝐈𝐍𝐇𝐀 𝐃𝐄 𝐄𝐒𝐓𝐈𝐌𝐀ÇÃ  
✔️ Tudo do Plano Padrão ✅ +
✔️ Vídeos EXCLUSIVOS de 4, dedada na bunda e gozada no cu
✔️ Cenas inéditas com meus negões fodendo forte
✔️ Chamada de vídeo AO VIVO até eu gozar pra você
✔️ Avaliação de rola + vídeo personalizado com seus fetiches
✔️ WhatsApp pessoal (só pra quem aguenta ver eu me abrindo sem censura)`,
    menuInicial: {
      texto: `🔐 𝙶𝟶𝚉𝙰𝙳𝙰 𝙶𝙰𝚁𝙰𝙽𝚃𝙸𝙳𝙰 𝙾𝚄 𝚂𝙴𝚄 𝙳𝙸𝙽𝙷𝙴𝙸𝚁𝙾 𝙳𝙴 𝚅𝙾𝙻𝚃𝙰🔐  

 Prove que é homem de verdade… e escolha agora como vai me ter… 👇🏻`,
      opcoes: [
        { texto: '🌶️ ESCOLHER VIP 🌶️', callback: 'mostrar_planos' },
        { texto: 'Instagram', url: 'https://www.instagram.com/hadriiimaria_' }
      ]
    }
  },

  // Menu dos planos (aparece quando clica em ESCOLHER VIP)
  menuPlanos: {
    texto: `Escolha uma oferta abaixo:`,
    opcoes: [
      { texto: '⭐ PUTA COMPORTADA - 1 - R$ 19,99', callback: 'plano_padrao' },
      { texto: '💎 PUTA DE ESTIMAÇÃO - 2 - R$ 34,99', callback: 'plano_plus' }
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
      valor: 19.99,
      descricao: 'Acesso vitalício à galeria pessoal + atualizações semanais + vídeo personalizado'
    },
    {
      id: 'plano_plus',
      nome: 'PUTA DE ESTIMAÇÃO',
      emoji: '💎',
      valor: 34.99,
      descricao: 'Tudo do plano padrão + conteúdo exclusivo + chamada ao vivo + WhatsApp pessoal'
    }
  ],

  downsells: [
    {
      id: 'ds1',
      emoji: '💋',
      texto: 'Ei, tá esperando o quê?\nVocê já viu tudo... e quer mais.\nR$19,99. PUTA COMPORTADA - 1. Sem assinatura. Sem censura.\nPagou, entrou. Entrou, gozou.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds1_padrao', nome: 'PUTA COMPORTADA', emoji: '⭐', valorOriginal: 19.99, valorComDesconto: 19.99 },
        { id: 'ds1_plus', nome: 'PUTA DE ESTIMAÇÃO', emoji: '💎', valorOriginal: 34.99, valorComDesconto: 34.99 }
      ]
    },
    {
      id: 'ds2',
      emoji: '💋',
      texto: 'Tá indeciso?\nTe entendo... mas teu desejo é maior que tua dúvida.\nToma 5% OFF agora.\nR$18,99 – PUTA COMPORTADA - 1.\nNão enrola. Uma vez só.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds2_padrao', nome: 'PUTA COMPORTADA', emoji: '⭐', valorOriginal: 19.99, valorComDesconto: 18.99 },
        { id: 'ds2_plus', nome: 'PUTA DE ESTIMAÇÃO', emoji: '💎', valorOriginal: 34.99, valorComDesconto: 32.99 }
      ]
    },
    {
      id: 'ds3',
      emoji: '💋',
      texto: 'Você já sabe o que tem lá dentro.\nE já imagina o que vai fazer com aquele conteúdo…\nÚltima vez com 5% OFF: R$18,99.\nEntra agora e se entrega.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds3_padrao', nome: 'PUTA COMPORTADA', emoji: '⭐', valorOriginal: 19.99, valorComDesconto: 18.99 },
        { id: 'ds3_plus', nome: 'PUTA DE ESTIMAÇÃO', emoji: '💎', valorOriginal: 34.99, valorComDesconto: 32.99 }
      ]
    },
    {
      id: 'ds4',
      emoji: '💋',
      texto: 'Te dou 10% agora. Mas é agora mesmo.\nR$17,99 – PUTA COMPORTADA - 1.\nSaiu dessa tela, acabou.\nVocê sabe que quer. Clica logo.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds4_padrao', nome: 'PUTA COMPORTADA', emoji: '⭐', valorOriginal: 19.99, valorComDesconto: 17.99 },
        { id: 'ds4_plus', nome: 'PUTA DE ESTIMAÇÃO', emoji: '💎', valorOriginal: 34.99, valorComDesconto: 30.99 }
      ]
    },
    {
      id: 'ds5',
      emoji: '💋',
      texto: 'Você tá aqui ainda… então toma mais um empurrãozinho.\nR$17,99 – PUTA COMPORTADA - 1.\nSem assinatura. Sem limite. Pagou, entrou.\nDepois disso, esse valor é fixo.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds5_padrao', nome: 'PUTA COMPORTADA', emoji: '⭐', valorOriginal: 19.99, valorComDesconto: 17.99 },
        { id: 'ds5_plus', nome: 'PUTA DE ESTIMAÇÃO', emoji: '💎', valorOriginal: 34.99, valorComDesconto: 30.99 }
      ]
    },
    {
      id: 'ds6',
      emoji: '💋',
      texto: 'Tem gente lá dentro aproveitando tudo. Só falta você.\nR$16,99 – PUTA COMPORTADA.\nEsse valor não cai mais. Só falta você entrar.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds6_padrao', nome: 'PUTA COMPORTADA', emoji: '⭐', valorOriginal: 19.99, valorComDesconto: 16.99 },
        { id: 'ds6_plus', nome: 'PUTA DE ESTIMAÇÃO', emoji: '💎', valorOriginal: 34.99, valorComDesconto: 28.99 }
      ]
    },
    {
      id: 'ds7',
      emoji: '💋',
      texto: 'Você quase entrou… e eu quase te mostrei tudo.\nR$16,99 – PUTA COMPORTADA.\nÚltima chamada pra quem tem coragem.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds7_padrao', nome: 'PUTA COMPORTADA', emoji: '⭐', valorOriginal: 19.99, valorComDesconto: 16.99 },
        { id: 'ds7_plus', nome: 'PUTA DE ESTIMAÇÃO', emoji: '💎', valorOriginal: 34.99, valorComDesconto: 28.99 }
      ]
    },
    {
      id: 'ds8',
      emoji: '💋',
      texto: 'Você viu meu corpo. Sentiu minha vibe.\nSabe que vai se arrepender se sair agora…\nR$16,99 – PUTA COMPORTADA. Fixo. Sem volta.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds8_padrao', nome: 'PUTA COMPORTADA', emoji: '⭐', valorOriginal: 19.99, valorComDesconto: 16.99 },
        { id: 'ds8_plus', nome: 'PUTA DE ESTIMAÇÃO', emoji: '💎', valorOriginal: 34.99, valorComDesconto: 28.99 }
      ]
    },
    {
      id: 'ds9',
      emoji: '💋',
      texto: 'Se você tá aqui ainda, é porque quer.\nTá testando teu limite?\nEntão testa isso: R$16,99 PUTA COMPORTADA. Entra ou some.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds9_padrao', nome: 'PUTA COMPORTADA', emoji: '⭐', valorOriginal: 19.99, valorComDesconto: 16.99 },
        { id: 'ds9_plus', nome: 'PUTA DE ESTIMAÇÃO', emoji: '💎', valorOriginal: 34.99, valorComDesconto: 28.99 }
      ]
    },
    {
      id: 'ds10',
      emoji: '💋',
      texto: 'Já recusou várias vezes. Mas tá aqui ainda, né?\nR$16,99 – PUTA COMPORTADA. Última chance real.\nDepois disso, só no print.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds10_padrao', nome: 'PUTA COMPORTADA', emoji: '⭐', valorOriginal: 19.99, valorComDesconto: 16.99 },
        { id: 'ds10_plus', nome: 'PUTA DE ESTIMAÇÃO', emoji: '💎', valorOriginal: 34.99, valorComDesconto: 28.99 }
      ]
    },
    {
      id: 'ds11',
      emoji: '💋',
      texto: 'Última chance real.\nDepois disso, só no print.\nR$16,99 – PUTA COMPORTADA.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds11_padrao', nome: 'PUTA COMPORTADA', emoji: '⭐', valorOriginal: 19.99, valorComDesconto: 16.99 },
        { id: 'ds11_plus', nome: 'PUTA DE ESTIMAÇÃO', emoji: '💎', valorOriginal: 34.99, valorComDesconto: 28.99 }
      ]
    },
    {
      id: 'ds12',
      emoji: '💋',
      texto: 'Fim da linha.\nR$16,99 – PUTA COMPORTADA.\nÚltima vez.',
      tipoMidia: 'video',
      planos: [
        { id: 'ds12_padrao', nome: 'PUTA COMPORTADA', emoji: '⭐', valorOriginal: 19.99, valorComDesconto: 16.99 },
        { id: 'ds12_plus', nome: 'PUTA DE ESTIMAÇÃO', emoji: '💎', valorOriginal: 34.99, valorComDesconto: 28.99 }
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
    valor: 19.99,
    descricao: 'PUTA COMPORTADA - R$ 19,99'
  },

  mensagensPeriodicas: [
    {
      horario: '08:00',
      texto: `Quer gozar antes do trampo?

Seu chefe te deixa de saco cheio? Deixe que eu esvazie seu saco com os conteúdos do meu VIP por só R$ 20,00 😍 Paga um vez e tem acesso a tudo!

Clique aqui e garanta o seu acesso 👇🏻`,
      midia: './midia/downsells/ds1.jpg'
    },
    {
      horario: '19:00',
      texto: `Chegou cansado do trampo e quer gozar?

Isso mesmo safadinho… liberei meu VIP (com todos os conteúdos que já gravei) por só R$ 20 😍

Clica aqui pra entrar👇🏻`,
      midia: './midia/downsells/ds2.jpg'
    },
    {
      horario: '21:00',
      texto: `Quer gozar agora?

Você é um homem de sorte… liberei meu VIP (com todos os conteúdos que já gravei) por só R$ 20 😍

Clica aqui pra entrar e gozar vendo sua putinha preferida 👇🏻`,
      midia: './midia/downsells/ds1.jpg'
    },
    {
      horario: '23:00',
      texto: `Chegou cansado do trampo e quer gozar?

Liberei meu VIP com todos os meus vídeos por só R$20 …
E daqui a pouco começa a live: metendo, gemendo e gozando AO VIVO.🔴

⏳ Corre antes que comece sem você!`,
      midia: './midia/downsells/ds2.jpg'
    }
  ]
};
