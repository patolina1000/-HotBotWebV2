require('dotenv').config();

function getConfig() {
  // Debug das variáveis de ambiente
  console.log('🔍 [LOADCONFIG] Verificando variáveis de ambiente:');
  console.log('  - SYNCPAY_CLIENT_ID:', process.env.SYNCPAY_CLIENT_ID ? 'DEFINIDO' : 'NÃO DEFINIDO');
  console.log('  - SYNCPAY_CLIENT_SECRET:', process.env.SYNCPAY_CLIENT_SECRET ? 'DEFINIDO' : 'NÃO DEFINIDO');
  console.log('  - PUSHINPAY_TOKEN:', process.env.PUSHINPAY_TOKEN ? 'DEFINIDO' : 'NÃO DEFINIDO');
  console.log('  - GATEWAY:', process.env.GATEWAY || 'não definido (usando pushinpay)');
  
  return {
    gateway: 'pushinpay', // 🔥 SEMPRE usar PushinPay, ignorando GATEWAY env var
    environment: process.env.ENVIRONMENT || 'production',
    generateQRCodeOnMobile: process.env.GENERATE_QR_CODE_ON_MOBILE === 'true',
    
    syncpay: {
      clientId: process.env.SYNCPAY_CLIENT_ID,
      clientSecret: process.env.SYNCPAY_CLIENT_SECRET
    },
    
    pushinpay: {
      token: process.env.PUSHINPAY_TOKEN || 'demo_pushinpay_token'
    },
    
    webhook: {
      baseUrl: process.env.WEBHOOK_BASE_URL || 'https://privacy-sync.vercel.app',
      secret: process.env.WEBHOOK_SECRET || ''
    },
    
    model: {
      name: process.env.MODEL_NAME || 'Hadrielle Maria',
      handle: process.env.MODEL_HANDLE || '@hadriiimaria_',
      bio: process.env.MODEL_BIO || 'Tenho 22 aninhos... 😇 carinha de santinha e a bunda mais grande e gulosa 🍑 que você já viu.\nPeito no ponto 🍒 e corpo de cavala, feito pra você meter com força e gozar sorrindo 😈.\nAqui eu me esfrego, me abro, gozo alto 💦 e ainda te chamo de safado olhando nos teus olhos 👀.\nDe ladinho, de quatro, com o dedo na bunda 👉🍑 e a boceta escorrendo tesão 🔥.\nGravo vídeo com gozada real 🎥💦, sem fingimento, só putaria crua e molhada.\nFaço avaliação de rola 🍆, vídeo sob medida e cumpro teus fetiches no talo 🎁😋.\nSe não vier me ver ABERTINHA 👀💋, vai bater punheta arrependido depois 🖐️💦.'
    },
    
    // 🔥 ESTRUTURA DE PLANOS IGUAL AO BOT (mantendo planos atuais do privacy)
    planos: [
      {
        id: 'monthly',
        nome: process.env.PLAN_MONTHLY_LABEL || '1 mês',
        emoji: '🥉',
        valor: parseFloat(process.env.PLAN_MONTHLY_PRICE) || 19.98,
        descricao: process.env.PLAN_MONTHLY_DESCRIPTION || 'Assinatura mensal',
        buttonId: process.env.PLAN_MONTHLY_BUTTON_ID || 'btn-1-mes',
        priceLabel: process.env.PLAN_MONTHLY_PRICE_LABEL || 'R$ 19,98'
      },
      {
        id: 'quarterly',
        nome: process.env.PLAN_QUARTERLY_LABEL || '3 meses',
        emoji: '🥈',
        valor: parseFloat(process.env.PLAN_QUARTERLY_PRICE) || 59.70,
        descricao: process.env.PLAN_QUARTERLY_DESCRIPTION || 'Assinatura trimestral',
        buttonId: process.env.PLAN_QUARTERLY_BUTTON_ID || 'btn-3-meses',
        priceLabel: process.env.PLAN_QUARTERLY_PRICE_LABEL || 'R$ 59,70'
      },
      {
        id: 'semestrial',
        nome: process.env.PLAN_SEMESTRIAL_LABEL || '6 meses',
        emoji: '🥇',
        valor: parseFloat(process.env.PLAN_SEMESTRIAL_PRICE) || 119.40,
        descricao: process.env.PLAN_SEMESTRIAL_DESCRIPTION || 'Assinatura semestral',
        buttonId: process.env.PLAN_SEMESTRIAL_BUTTON_ID || 'btn-6-meses',
        priceLabel: process.env.PLAN_SEMESTRIAL_PRICE_LABEL || 'R$ 119,40'
      }
    ],

    // 🔥 DOWNSELLS (mesmo conceito do bot, mas vazio por enquanto)
    downsells: [],

    // 🔥 MANTER COMPATIBILIDADE COM ESTRUTURA ANTIGA (FALLBACK)
    plans: {
      monthly: {
        buttonId: process.env.PLAN_MONTHLY_BUTTON_ID || 'btn-1-mes',
        label: process.env.PLAN_MONTHLY_LABEL || '1 mês',
        priceLabel: process.env.PLAN_MONTHLY_PRICE_LABEL || 'R$ 19,98',
        price: parseFloat(process.env.PLAN_MONTHLY_PRICE) || 19.98,
        description: process.env.PLAN_MONTHLY_DESCRIPTION || 'Assinatura mensal'
      },
      quarterly: {
        buttonId: process.env.PLAN_QUARTERLY_BUTTON_ID || 'btn-3-meses',
        label: process.env.PLAN_QUARTERLY_LABEL || '3 meses',
        priceLabel: process.env.PLAN_QUARTERLY_PRICE_LABEL || 'R$ 59,70',
        price: parseFloat(process.env.PLAN_QUARTERLY_PRICE) || 59.70,
        description: process.env.PLAN_QUARTERLY_DESCRIPTION || 'Assinatura trimestral'
      },
      semestrial: {
        buttonId: process.env.PLAN_SEMESTRIAL_BUTTON_ID || 'btn-6-meses',
        label: process.env.PLAN_SEMESTRIAL_LABEL || '6 meses',
        priceLabel: process.env.PLAN_SEMESTRIAL_PRICE_LABEL || 'R$ 119,40',
        price: parseFloat(process.env.PLAN_SEMESTRIAL_PRICE) || 119.40,
        description: process.env.PLAN_SEMESTRIAL_DESCRIPTION || 'Assinatura semestral'
      }
    },
    
    redirectUrl: process.env.REDIRECT_URL || 'https://hadrillmaria.com/compra-aprovada/'
  };
}

function saveConfig(newConfig) {
  console.log('⚠️ Configuração salva em variáveis de ambiente (.env)');
  console.log('Para alterar configurações, edite o arquivo .env');
}

// 🔥 FUNÇÕES AUXILIARES IGUAL AO BOT
/**
 * Buscar plano por ID (igual ao bot)
 */
function obterPlanoPorId(id) {
  const config = getConfig();
  
  // Procura nos planos principais
  let plano = config.planos.find(p => p.id === id);
  if (plano) return plano;
  
  // Procura nos planos de downsells (igual ao bot)
  for (const downsell of config.downsells) {
    plano = downsell.planos.find(p => p.id === id);
    if (plano) return plano;
  }
  
  return null;
}

/**
 * Buscar downsell por ID (igual ao bot)
 */
function obterDownsellPorId(id) {
  const config = getConfig();
  return config.downsells.find(ds => ds.id === id);
}

/**
 * Formatar valor em centavos (igual ao bot)
 */
function formatarValorCentavos(valor) {
  const numerico = parseFloat(valor);
  if (isNaN(numerico)) return 0;
  return Math.round((numerico + Number.EPSILON) * 100);
}

/**
 * Gerar menu de planos (igual ao bot)
 */
function gerarMenuPlanos() {
  const config = getConfig();
  return {
    texto: 'Escolha uma oferta abaixo:',
    opcoes: config.planos.map(plano => ({
      texto: `${plano.emoji} ${plano.nome} - ${plano.priceLabel}`,
      callback: plano.id
    }))
  };
}

/**
 * Obter nome da oferta baseado no plano (igual ao bot)
 */
function obterNomeOferta(plano) {
  const config = getConfig();
  let nomeOferta = 'Oferta Desconhecida';
  
  if (plano) {
    // Buscar o plano na configuração
    const planoEncontrado = config.planos.find(p => p.id === plano || p.nome === plano);
    if (planoEncontrado) {
      nomeOferta = planoEncontrado.nome;
    } else {
      // Buscar nos downsells
      for (const ds of config.downsells) {
        const p = ds.planos.find(pl => pl.id === plano || pl.nome === plano);
        if (p) {
          nomeOferta = p.nome;
          break;
        }
      }
    }
  }
  
  return nomeOferta;
}

module.exports = { 
  getConfig, 
  saveConfig,
  obterPlanoPorId,
  obterDownsellPorId,
  formatarValorCentavos,
  gerarMenuPlanos,
  obterNomeOferta
};
