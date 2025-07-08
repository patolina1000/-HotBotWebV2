const fs = require('fs');
const path = require('path');

// Configurações das mídias - URLs ou caminhos locais
const midias = {
  inicial: {
    video: '../BOT/midia/inicial.mp4',
    imagem: '../BOT/midia/inicial.jpg',
    audio: '../BOT/midia/inicial_audio.mp3'
  },
  downsells: {
    ds1: {
      video: '../BOT/midia/downsells/ds1.mp4',
      imagem: '../BOT/midia/downsells/ds1.jpg',
      audio: '../BOT/midia/downsells/ds1.mp3'
    },
    ds2: {
      video: '../BOT/midia/downsells/ds2.mp4',
      imagem: '../BOT/midia/downsells/ds2.jpg',
      audio: '../BOT/midia/downsells/ds2.mp3'
    },
    ds3: {
      video: '../BOT/midia/downsells/ds3.mp4',
      imagem: '../BOT/midia/downsells/ds3.jpg',
      audio: '../BOT/midia/downsells/ds3.mp3'
    },
    ds4: {
      video: '../BOT/midia/downsells/ds4.mp4',
      imagem: '../BOT/midia/downsells/ds4.jpg',
      audio: '../BOT/midia/downsells/ds4.mp3'
    },
    ds5: {
      video: '../BOT/midia/downsells/ds5.mp4',
      imagem: '../BOT/midia/downsells/ds5.jpg',
      audio: '../BOT/midia/downsells/ds5.mp3'
    },
    ds6: {
      video: '../BOT/midia/downsells/ds6.mp4',
      imagem: '../BOT/midia/downsells/ds6.jpg',
      audio: '../BOT/midia/downsells/ds6.mp3'
    },
    ds7: {
      video: '../BOT/midia/downsells/ds7.mp4',
      imagem: '../BOT/midia/downsells/ds7.jpg',
      audio: '../BOT/midia/downsells/ds7.mp3'
    },
    ds8: {
      video: '../BOT/midia/downsells/ds8.mp4',
      imagem: '../BOT/midia/downsells/ds8.jpg',
      audio: '../BOT/midia/downsells/ds8.mp3'
    },
    ds9: {
      video: '../BOT/midia/downsells/ds9.mp4',
      imagem: '../BOT/midia/downsells/ds9.jpg',
      audio: '../BOT/midia/downsells/ds9.mp3'
    },
    ds10: {
      video: '../BOT/midia/downsells/ds10.mp4',
      imagem: '../BOT/midia/downsells/ds10.jpg',
      audio: '../BOT/midia/downsells/ds10.mp3'
    },
    ds11: {
      video: '../BOT/midia/downsells/ds11.mp4',
      imagem: '../BOT/midia/downsells/ds11.jpg',
      audio: '../BOT/midia/downsells/ds11.mp3'
    },
    ds12: {
      video: '../BOT/midia/downsells/ds12.mp4',
      imagem: '../BOT/midia/downsells/ds12.jpg',
      audio: '../BOT/midia/downsells/ds12.mp3'
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
😈 <b>Olá, titio! Aqui é o perfil 2 👅</b>

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
    id: 'plano_semanal',
    nome: 'Semanal',
    emoji: '💋',
    valor: 17.90,
    descricao: 'Acesso por 7 dias'
  },
  {
    id: 'plano_mensal',
    nome: 'Mensal',
    emoji: '🔥',
    valor: 19.90,
    descricao: 'Acesso por 30 dias'
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
      { id: 'ds1_semanal', nome: 'Semanal', emoji: '💋', valorOriginal: 17.90, valorComDesconto: 17.90 },
      { id: 'ds1_mensal', nome: 'Mensal', emoji: '🔥', valorOriginal: 19.90, valorComDesconto: 19.90 }
    ]
  },
  {
    id: 'ds2',
    emoji: '💗',
    texto: 'Oie Titio, percebi que você não finalizou a sua assinatura...\n\n💗 Pra te dar um incentivo, estou te dando 10% de desconto pra entrar agora pro meu grupinho VIP 😈\n\nVem vê sua sobrinha de um jeitinho que você nunca viu... 😏',
    tipoMidia: 'video',
    planos: [
      { id: 'ds2_semanal', nome: 'Semanal', emoji: '💋', valorOriginal: 17.90, valorComDesconto: 16.11 },
      { id: 'ds2_mensal', nome: 'Mensal', emoji: '🔥', valorOriginal: 19.90, valorComDesconto: 17.91 }
    ]
  },
  {
    id: 'ds3',
    emoji: '💦',
    texto: 'Oiee titio, já veio gozar pra sua ninfetinha hoje?\n\n💦 Vi que gerou o PIX mas não pagou, então liberei um desconto exclusivo + PRESENTINHO só pra você (não conta pra ninguém, tá?)\n\nMas corre, o desconto acaba a qualquer momento! ⏬',
    tipoMidia: 'video',
    planos: [
      { id: 'ds3_semanal', nome: 'Semanal', emoji: '💋', valorOriginal: 17.90, valorComDesconto: 17.00 },
      { id: 'ds3_mensal', nome: 'Mensal', emoji: '🔥', valorOriginal: 19.90, valorComDesconto: 18.90 }
    ]
  },
  {
    id: 'ds4',
    emoji: '💋',
    texto: '💋 QUANTO TEMPO VAI ME IGNORAR? 💋\n\nVocê já me espiou antes… Agora é hora de entrar e ver TUDO sem censura! 😈\n\nSe entrar agora, ainda ganha um brinde no privado... Não vou contar o que é 😏',
    tipoMidia: 'video',
    planos: [
      { id: 'ds4_semanal', nome: 'Semanal', emoji: '💋', valorOriginal: 17.90, valorComDesconto: 17.00 },
      { id: 'ds4_mensal', nome: 'Mensal', emoji: '🔥', valorOriginal: 19.90, valorComDesconto: 18.90 }
    ]
  },
  {
    id: 'ds5',
    emoji: '💋',
    texto: 'Titio, você deixou a loirinha aqui esperando...\n\nFiquei molhadinha te imaginando vendo meus vídeos 💋\n\nPra te conquistar: desconto liberado + presentinho do jeitinho que você gosta 😘',
    tipoMidia: 'video',
    planos: [
      { id: 'ds5_semanal', nome: 'Semanal', emoji: '💋', valorOriginal: 17.90, valorComDesconto: 16.11 },
      { id: 'ds5_mensal', nome: 'Mensal', emoji: '🔥', valorOriginal: 19.90, valorComDesconto: 17.91 }
    ]
  },
  {
    id: 'ds6',
    emoji: '😈',
    texto: 'Oie titio, olha só...\n\nLiberei uma promoção secreta só pra você: desconto + bônus extra que ninguém mais vai ganhar 😈\n\nMas não conta pra ninguém... minha calcinha tá te esperando no VIP 💦',
    tipoMidia: 'video',
    planos: [
      { id: 'ds6_semanal', nome: 'Semanal', emoji: '💋', valorOriginal: 17.90, valorComDesconto: 15.21 },
      { id: 'ds6_mensal', nome: 'Mensal', emoji: '🔥', valorOriginal: 19.90, valorComDesconto: 16.91 }
    ]
  },
  {
    id: 'ds7',
    emoji: '🥵',
    texto: 'Já imaginou abrir o grupo e dar de cara comigo peladinha? 😳\n\nAgora imagina isso com um desconto especial + presentinho só seu? 🥵\n\nMas tem que correr, hein? Não vou deixar isso aberto por muito tempo!',
    tipoMidia: 'video',
    planos: [
      { id: 'ds7_semanal', nome: 'Semanal', emoji: '💋', valorOriginal: 17.90, valorComDesconto: 15.21 },
      { id: 'ds7_mensal', nome: 'Mensal', emoji: '🔥', valorOriginal: 19.90, valorComDesconto: 16.91 }
    ]
  },
  {
    id: 'ds8',
    emoji: '😈',
    texto: 'Titio... voltei só pra dizer:\n\nSe pagar agora, além de entrar no meu VIP, vai ganhar um mimo pessoal e um descontinho safado ❤️\n\nSó não demora… ou a oferta some... e eu também 😈',
    tipoMidia: 'video',
    planos: [
      { id: 'ds8_semanal', nome: 'Semanal', emoji: '💋', valorOriginal: 17.90, valorComDesconto: 14.32 },
      { id: 'ds8_mensal', nome: 'Mensal', emoji: '🔥', valorOriginal: 19.90, valorComDesconto: 15.92 }
    ]
  },
  {
    id: 'ds9',
    emoji: '😳',
    texto: 'Tô liberando um código secreto...\n\nPra quem travou no final 😳\n\nDesconto ativado + conteúdo surpresa picante liberado. Só pra você, mas só por hoje, viu?',
    tipoMidia: 'video',
    planos: [
      { id: 'ds9_semanal', nome: 'Semanal', emoji: '💋', valorOriginal: 17.90, valorComDesconto: 14.32 },
      { id: 'ds9_mensal', nome: 'Mensal', emoji: '🔥', valorOriginal: 19.90, valorComDesconto: 15.92 }
    ]
  },
  {
    id: 'ds10',
    emoji: '🖤',
    texto: 'Vi seu nome na lista de quem quase entrou…\n\nMe deixou com vontade de te recompensar 😘\n\nLiberei 25% OFF + vídeo exclusivo surpresa. Mas só até eu cansar de esperar 🖤',
    tipoMidia: 'video',
    planos: [
      { id: 'ds10_semanal', nome: 'Semanal', emoji: '💋', valorOriginal: 17.90, valorComDesconto: 13.42 },
      { id: 'ds10_mensal', nome: 'Mensal', emoji: '🔥', valorOriginal: 19.90, valorComDesconto: 14.92 }
    ]
  },
  {
    id: 'ds11',
    emoji: '💦',
    texto: 'Oieee… sua ninfetinha loira tá aqui te esperando, sabia?\n\nVi que gerou o PIX e sumiu 🙈\n\nEntão toma: descontinho + surpresinha só pra você terminar logo essa sacanagem toda 💦',
    tipoMidia: 'video',
    planos: [
      { id: 'ds11_semanal', nome: 'Semanal', emoji: '💋', valorOriginal: 17.90, valorComDesconto: 13.42 },
      { id: 'ds11_mensal', nome: 'Mensal', emoji: '🔥', valorOriginal: 19.90, valorComDesconto: 14.92 }
    ]
  },
  {
    id: 'ds12',
    emoji: '😭',
    texto: 'Titio, vai me deixar assim?\n\nCom a calcinha molhada e o grupo fechado? 😭\n\nAproveita: desconto + conteúdo extra surpresa liberado AGORA\n\nMas corre… porque eu enjoo rápido.',
    tipoMidia: 'video',
    planos: [
      { id: 'ds12_semanal', nome: 'Semanal', emoji: '💋', valorOriginal: 17.90, valorComDesconto: 12.53 },
      { id: 'ds12_mensal', nome: 'Mensal', emoji: '🔥', valorOriginal: 19.90, valorComDesconto: 13.93 }
    ]
  }
];

// Mensagens periódicas
const mensagensPeriodicas = [
  {
    midia: '../BOT/midia/periodica1.jpg',
    texto: `Por apenas 19,90 você vai ter acesso a:
🔥 Mais de 450 fotos e vídeos
🔥 Sexo, boquete, anal ménage
🔥 Vídeo chamada gratuita
🔥 Live sem roupa toda noite
🔥 Sorteio pra gravar comigo
👇🏻ESTOU TE ESPERANDO AQUI👇🏻`
  },
  {
    midia: '../BOT/midia/periodica2.mp4',
    texto: `SÓ 19,90 🎁
Isso mesmo safadinho, liberei meu VIP (e meu cuzinho) por apenas 19,90 😍
Corre lá pra ver tudinho e gozar bem gostoso pra sua putinha preferida👇🏻`
  },
  {
    midia: '../BOT/midia/periodica3.jpg',
    texto: `✨ 20 REAIS ✨
É o precinho para entrar no meu grupinho agora e se deliciar com meus vídeos já de manhã, para começar o dia jogando leitinho para fora bem gostoso. Vira macho e aperta o botão agora.`
  }
];

const horariosEnvioPeriodico = [
  '0 8 * * *',
  '0 11 * * *',
  '0 18 * * *',
  '0 20 * * *',
  '0 23 * * *'
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
🌟 <b>Você selecionou o seguinte plano:</b>

🎁 <b>Plano:</b> ${nome}
💰 <b>Valor:</b> R$${valor.toFixed(2)}

💠 <b>Pague via Pix Copia e Cola (ou QR Code em alguns bancos):</b>

<pre>${pixCopiaCola}</pre>

📌 <b>Toque na chave PIX acima para copiá-la</b>
❗ Após o pagamento, clique no botão abaixo para verificar o status:
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
  mensagensPeriodicas,
  horariosEnvioPeriodico
};
