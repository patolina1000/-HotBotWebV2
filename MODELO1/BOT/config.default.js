const fs = require('fs');
const path = require('path');

// Configurações das mídias - URLs ou caminhos locais
const midias = {
  inicial: {
    video: './midia/inicial.mp4',
    imagem: './midia/inicial.jpg',
    audio: './midia/inicial_audio.mp3'
  },
  downsells: {
    ds1: {
      video: './midia/downsells/ds1.mp4',
      imagem: './midia/downsells/ds1.jpg',
      audio: './midia/downsells/ds1.mp3'
    },
    ds2: {
      video: './midia/downsells/ds2.mp4',
      imagem: './midia/downsells/ds2.jpg',
      audio: './midia/downsells/ds2.mp3'
    },
    ds3: {
      video: './midia/downsells/ds3.mp4',
      imagem: './midia/downsells/ds3.jpg',
      audio: './midia/downsells/ds3.mp3'
    },
    ds4: {
      video: './midia/downsells/ds4.mp4',
      imagem: './midia/downsells/ds4.jpg',
      audio: './midia/downsells/ds4.mp3'
    },
    ds5: {
      video: './midia/downsells/ds5.mp4',
      imagem: './midia/downsells/ds5.jpg',
      audio: './midia/downsells/ds5.mp3'
    },
    ds6: {
      video: './midia/downsells/ds6.mp4',
      imagem: './midia/downsells/ds6.jpg',
      audio: './midia/downsells/ds6.mp3'
    },
    ds7: {
      video: './midia/downsells/ds7.mp4',
      imagem: './midia/downsells/ds7.jpg',
      audio: './midia/downsells/ds7.mp3'
    },
    ds8: {
      video: './midia/downsells/ds8.mp4',
      imagem: './midia/downsells/ds8.jpg',
      audio: './midia/downsells/ds8.mp3'
    },
    ds9: {
      video: './midia/downsells/ds9.mp4',
      imagem: './midia/downsells/ds9.jpg',
      audio: './midia/downsells/ds9.mp3'
    },
    ds10: {
      video: './midia/downsells/ds10.mp4',
      imagem: './midia/downsells/ds10.jpg',
      audio: './midia/downsells/ds10.mp3'
    },
    ds11: {
      video: './midia/downsells/ds11.mp4',
      imagem: './midia/downsells/ds11.jpg',
      audio: './midia/downsells/ds11.mp3'
    },
    ds12: {
      video: './midia/downsells/ds12.mp4',
      imagem: './midia/downsells/ds12.jpg',
      audio: './midia/downsells/ds12.mp3'
    }
  }
};

// Função para verificar se o arquivo existe
function verificarMidia(caminhoMidia) {
  if (!caminhoMidia) return false;
  
  // Se for URL, assumir que existe
  if (caminhoMidia.startsWith('http')) {
    return true;
  }
  
  // Se for arquivo local, verificar se existe
  try {
    return fs.existsSync(caminhoMidia);
  } catch (error) {
    console.warn(`⚠️ Erro ao verificar mídia ${caminhoMidia}:`, error.message);
    return false;
  }
}

// Função para obter mídia baseada no tipo
function obterMidia(tipo, indice = null) {
  if (tipo === 'inicial') {
    return midias.inicial;
  }
  
  if (tipo === 'downsell' && indice) {
    return midias.downsells[indice];
  }
  
  return null;
}

// Função para obter o melhor tipo de mídia disponível
function obterMelhorMidia(tipo, indice = null) {
  const midiasDisponiveis = obterMidia(tipo, indice);
  
  if (!midiasDisponiveis) return null;
  
  // Prioridade: video > imagem > audio
  const prioridade = ['video', 'imagem', 'audio'];
  
  for (const tipoMidia of prioridade) {
    const caminhoMidia = midiasDisponiveis[tipoMidia];
    if (verificarMidia(caminhoMidia)) {
      return {
        tipo: tipoMidia,
        caminho: caminhoMidia
      };
    }
  }
  
  return null;
}

// Configuração do início
const inicio = {
  tipoMidia: 'video', // 'video', 'imagem', 'audio' ou null
  textoInicial: `
😈 <b>Oi, titio... 👅</b>

Que delícia ter você aqui no meu quartinho…  
Já tava te esperando, sabia? Tô morrendo de vontade de te mostrar umas coisinhas que só quem entra aqui consegue ver… 😘

🎀 <b>Aqui você vai encontrar meus vídeos mais íntimos — só meus, só pra você.</b>

💌 E se quiser algo mais especial… mais safadinho, é só me chamar. Eu adoro quando o titio pede as coisas do jeitinho dele…

<b>Mas cuidado, viu?</b>  
Quem entra no meu quartinho nunca mais quer sair. Lá dentro, tudo fica mais quente… mais profundo… mais nosso. 🔥

✨ Talvez esse seja só o primeiro passo...  
Pra você me conhecer de um jeitinho que ninguém mais conhece.

<b>Vem… a sobrinha aqui tá prontinha pra te mimar, titio.</b> 😏💖
  `.trim(),
  menuInicial: {
    texto: '✨ Escolhe como quer brincar comigo hoje, titio...\nUma espiadinha... ou vem de vez? 😉👇',
    opcoes: [
      { texto: 'Acessar Agora', callback: 'mostrar_planos' },
      { texto: 'Prévias da sobrinha 💗🙈', callback: 'ver_previas' }
    ]
  }
};

// Configuração dos planos
const planos = [
  {
    id: 'plano_vitalicio',
    nome: 'Vitalício + Presentinho',
    emoji: '💋',
    valor: 27.00,
    descricao: 'Acesso completo e vitalício + conteúdo exclusivo'
  },
  {
    id: 'plano_espiar',
    nome: 'Quero só espiar... 💋',
    emoji: '👀',
    valor: 9.90,
    descricao: 'Acesso temporário ao conteúdo'
  }
];

// Configuração dos downsells
const downsells = [
  {
    id: 'ds1',
    emoji: '💗',
    texto: 'Oie Titio, percebi que você não finalizou a sua assinatura 😢\n\n💗 Entra pro meu grupinho VIP agora, e vem vê sua sobrinha de um jeito que você nunca viu 🙈',
    tipoMidia: 'video',
    planos: [
      { id: 'ds1_vitalicio', nome: 'Vitalício + Presentinho', emoji: '💋', valorOriginal: 27.00, valorComDesconto: 27.00 },
      { id: 'ds1_espiar', nome: 'Quero só espiar...', emoji: '👀', valorOriginal: 9.90, valorComDesconto: 9.90 }
    ]
  },
  {
    id: 'ds2',
    emoji: '💗',
    texto: 'Oie Titio, percebi que você não finalizou a sua assinatura...\n\n💗 Pra te dar um incentivo, estou te dando 10% de desconto pra entrar agora pro meu grupinho VIP 😈\n\nVem vê sua sobrinha de um jeitinho que você nunca viu... 😏',
    tipoMidia: 'video',
    planos: [
      { id: 'ds2_vitalicio', nome: 'Vitalício + Presentinho', emoji: '💋', valorOriginal: 27.00, valorComDesconto: 24.30 },
      { id: 'ds2_espiar', nome: 'Quero só espiar...', emoji: '👀', valorOriginal: 9.90, valorComDesconto: 9.90 }
    ]
  },
  {
    id: 'ds3',
    emoji: '💦',
    texto: 'Oiee titio, já veio gozar pra sua ninfetinha hoje?\n\n💦 Vi que gerou o PIX mas não pagou, então liberei um desconto exclusivo + PRESENTINHO só pra você (não conta pra ninguém, tá?)\n\nMas corre, o desconto acaba a qualquer momento! ⏬',
    tipoMidia: 'video',
    planos: [
      { id: 'ds3_vitalicio', nome: 'Vitalício + Presentinho', emoji: '💋', valorOriginal: 27.00, valorComDesconto: 25.65 },
      { id: 'ds3_espiar', nome: 'Quero só espiar...', emoji: '👀', valorOriginal: 9.90, valorComDesconto: 9.90 }
    ]
  },
  {
    id: 'ds4',
    emoji: '💋',
    texto: '💋 QUANTO TEMPO VAI ME IGNORAR? 💋\n\nVocê já me espiou antes… Agora é hora de entrar e ver TUDO sem censura! 😈\n\nSe entrar agora, ainda ganha um brinde no privado... Não vou contar o que é 😏',
    tipoMidia: 'video',
    planos: [
      { id: 'ds4_vitalicio', nome: 'Vitalício + Presentinho', emoji: '💋', valorOriginal: 27.00, valorComDesconto: 25.65 },
      { id: 'ds4_espiar', nome: 'Quero só espiar...', emoji: '👀', valorOriginal: 9.90, valorComDesconto: 9.90 }
    ]
  },
  {
    id: 'ds5',
    emoji: '💋',
    texto: 'Titio, você deixou a loirinha aqui esperando...\n\nFiquei molhadinha te imaginando vendo meus vídeos 💋\n\nPra te conquistar: desconto liberado + presentinho do jeitinho que você gosta 😘',
    tipoMidia: 'video',
    planos: [
      { id: 'ds5_vitalicio', nome: 'Vitalício + Presentinho', emoji: '💋', valorOriginal: 27.00, valorComDesconto: 24.30 },
      { id: 'ds5_espiar', nome: 'Quero só espiar...', emoji: '👀', valorOriginal: 9.90, valorComDesconto: 9.90 }
    ]
  },
  {
    id: 'ds6',
    emoji: '😈',
    texto: 'Oie titio, olha só...\n\nLiberei uma promoção secreta só pra você: desconto + bônus extra que ninguém mais vai ganhar 😈\n\nMas não conta pra ninguém... minha calcinha tá te esperando no VIP 💦',
    tipoMidia: 'video',
    planos: [
      { id: 'ds6_vitalicio', nome: 'Vitalício + Presentinho', emoji: '💋', valorOriginal: 27.00, valorComDesconto: 22.95 },
      { id: 'ds6_espiar', nome: 'Quero só espiar...', emoji: '👀', valorOriginal: 9.90, valorComDesconto: 9.90 }
    ]
  },
  {
    id: 'ds7',
    emoji: '🥵',
    texto: 'Já imaginou abrir o grupo e dar de cara comigo peladinha? 😳\n\nAgora imagina isso com um desconto especial + presentinho só seu? 🥵\n\nMas tem que correr, hein? Não vou deixar isso aberto por muito tempo!',
    tipoMidia: 'video',
    planos: [
      { id: 'ds7_vitalicio', nome: 'Vitalício + Presentinho', emoji: '💋', valorOriginal: 27.00, valorComDesconto: 22.95 },
      { id: 'ds7_espiar', nome: 'Quero só espiar...', emoji: '👀', valorOriginal: 9.90, valorComDesconto: 9.90 }
    ]
  },
  {
    id: 'ds8',
    emoji: '😈',
    texto: 'Titio... voltei só pra dizer:\n\nSe pagar agora, além de entrar no meu VIP, vai ganhar um mimo pessoal e um descontinho safado ❤️\n\nSó não demora… ou a oferta some... e eu também 😈',
    tipoMidia: 'video',
    planos: [
      { id: 'ds8_vitalicio', nome: 'Vitalício + Presentinho', emoji: '💋', valorOriginal: 27.00, valorComDesconto: 21.60 },
      { id: 'ds8_espiar', nome: 'Quero só espiar...', emoji: '👀', valorOriginal: 9.90, valorComDesconto: 9.90 }
    ]
  },
  {
    id: 'ds9',
    emoji: '😳',
    texto: 'Tô liberando um código secreto...\n\nPra quem travou no final 😳\n\nDesconto ativado + conteúdo surpresa picante liberado. Só pra você, mas só por hoje, viu?',
    tipoMidia: 'video',
    planos: [
      { id: 'ds9_vitalicio', nome: 'Vitalício + Presentinho', emoji: '💋', valorOriginal: 27.00, valorComDesconto: 21.60 },
      { id: 'ds9_espiar', nome: 'Quero só espiar...', emoji: '👀', valorOriginal: 9.90, valorComDesconto: 9.90 }
    ]
  },
  {
    id: 'ds10',
    emoji: '🖤',
    texto: 'Vi seu nome na lista de quem quase entrou…\n\nMe deixou com vontade de te recompensar 😘\n\nLiberei 25% OFF + vídeo exclusivo surpresa. Mas só até eu cansar de esperar 🖤',
    tipoMidia: 'video',
    planos: [
      { id: 'ds10_vitalicio', nome: 'Vitalício + Presentinho', emoji: '💋', valorOriginal: 27.00, valorComDesconto: 20.25 },
      { id: 'ds10_espiar', nome: 'Quero só espiar...', emoji: '👀', valorOriginal: 9.90, valorComDesconto: 9.90 }
    ]
  },
  {
    id: 'ds11',
    emoji: '💦',
    texto: 'Oieee… sua ninfetinha loira tá aqui te esperando, sabia?\n\nVi que gerou o PIX e sumiu 🙈\n\nEntão toma: descontinho + surpresinha só pra você terminar logo essa sacanagem toda 💦',
    tipoMidia: 'video',
    planos: [
      { id: 'ds11_vitalicio', nome: 'Vitalício + Presentinho', emoji: '💋', valorOriginal: 27.00, valorComDesconto: 20.25 },
      { id: 'ds11_espiar', nome: 'Quero só espiar...', emoji: '👀', valorOriginal: 9.90, valorComDesconto: 9.90 }
    ]
  },
  {
    id: 'ds12',
    emoji: '😭',
    texto: 'Titio, vai me deixar assim?\n\nCom a calcinha molhada e o grupo fechado? 😭\n\nAproveita: desconto + conteúdo extra surpresa liberado AGORA\n\nMas corre… porque eu enjoo rápido.',
    tipoMidia: 'video',
    planos: [
      { id: 'ds12_vitalicio', nome: 'Vitalício + Presentinho', emoji: '💋', valorOriginal: 27.00, valorComDesconto: 18.90 },
      { id: 'ds12_espiar', nome: 'Quero só espiar...', emoji: '👀', valorOriginal: 9.90, valorComDesconto: 9.90 }
    ]
  }
];
// Mensagens periódicas automáticas
const mensagensPeriodicas = [
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
    texto: `✨ 20 REAIS ✨

É o precinho para entrar no meu grupinho agora e se deliciar com meus vídeos já de manhã, para começar o dia jogando leitinho para fora bem gostoso. Vira macho e aperta o botão agora.`,
    midia: './midia/11.mp4'
  },
  {
    horario: '18:00',
    texto: `Decide agora: ou clica e me vê do jeitinho que imaginava,  
ou volta pro Insta fingindo que não queria me ver... mas vai continuar pensando em mim depois. 😘

👇🏻👇🏻👇🏻`,
    midia: './midia/18.mp4'
  },
  {
    horario: '20:00',
    copiarDe: '08:00'
  },
  {
    horario: '23:00',
    copiarDe: '11:00'
  }
];

// Outras configurações
const canalPrevias = 'https://t.me/+B9dEZHITEM1iYzMx';

// Configurações de pagamento
const pagamento = {
  pendente: '⏳ O pagamento ainda não foi identificado. Aguarde alguns instantes e clique novamente.',
  aprovado: '✅ Pagamento confirmado com sucesso!\n\n🔓 Aqui está seu acesso ao conteúdo:',
  link: '👉 https://t.me/+UEmVhhccVMw3ODcx',
  expirado: '❌ Este QR Code expirou. Por favor, gere uma nova cobrança.',
  erro: '❌ Erro ao verificar status do pagamento. Tente novamente em alguns instantes.'
};

// Configurações de erro
const erros = {
  erroGenerico: '❌ <b>Ops! Algo deu errado.</b>\n\n🔄 Tente novamente em alguns instantes.',
  pagamentoNaoEncontrado: '❌ <b>Pagamento não encontrado.</b>\n\n💡 Verifique se o pagamento foi realizado corretamente.',
  midiaIndisponivel: '❌ <b>Mídia temporariamente indisponível.</b>\n\n🔄 Tente novamente em alguns instantes.'
};

// Função para formatar valor em centavos
function formatarValorCentavos(valor) {
  const numerico = Number(String(valor).replace(',', '.').trim());
  return Math.round((numerico + Number.EPSILON) * 100);
}

// Função para gerar mensagem PIX
function mensagemPix(nome, valor, pixCopiaCola) {
  return `
✅ <b>Como realizar o pagamento:</b>

1️⃣ - Abra o aplicativo do seu banco.
2️⃣ - Selecione a opção "Pagar" ou "Pix".
3️⃣ - Escolha "Pix Copia e Cola".
4️⃣ - Cole o código abaixo e confirme o pagamento com segurança.

<b>Copie o código abaixo:</b>

<pre>${pixCopiaCola}</pre>

<b>Após efetuar o pagamento, clique no botão abaixo</b> ⬇️
  `.trim();
}

// Função para obter downsell por ID
function obterDownsellPorId(id) {
  return downsells.find(ds => ds.id === id);
}

// Função para obter plano por ID
function obterPlanoPorId(id) {
  // Procura nos planos principais
  let plano = planos.find(p => p.id === id);
  if (plano) return plano;
  
  // Procura nos planos de downsells
  for (const downsell of downsells) {
    plano = downsell.planos.find(p => p.id === id);
    if (plano) return plano;
  }
  
  return null;
}

module.exports = {
  inicio,
  planos,
  downsells,
  canalPrevias,
  pagamento,
  erros,
  midias,
  verificarMidia,
  obterMidia,
  obterMelhorMidia,
  formatarValorCentavos,
  mensagemPix,
  obterDownsellPorId,
  obterPlanoPorId,
  mensagensPeriodicas};
