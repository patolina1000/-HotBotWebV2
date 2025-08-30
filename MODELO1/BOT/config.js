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
      { texto: '🌶️ ESCOLHER VIP 🌶️', callback: 'mostrar_planos' },
      { texto: 'Prévias da sobrinha 💗🙈', callback: 'ver_previas' }
    ]
  }
};

// Menu dos planos (aparece quando clica em ESCOLHER VIP)
const menuPlanos = {
  texto: `Escolha uma oferta abaixo:`,
  opcoes: [
    { texto: '🥉 7 Dias de Grupo VIP - R$ 19,90', callback: 'plano_7dias' },
    { texto: '🥈 1 Mês de Grupo VIP - R$ 24,90', callback: 'plano_1mes' },
    { texto: '🥇 VIP Vitalício + Wpp+Mimo - R$ 29,90', callback: 'plano_vitalicio_wpp' },
    { texto: '💎 VIP Vitalício+ Chamadinha - R$ 69,90', callback: 'plano_vitalicio_chamada' }
  ]
};

// Configuração dos planos
const planos = [
  {
    id: 'plano_7dias',
    nome: '7 Dias de Grupo VIP',
    emoji: '🥉',
    valor: 19.90,
    descricao: 'Acesso por 7 dias ao grupo VIP'
  },
  {
    id: 'plano_1mes',
    nome: '1 Mês de Grupo VIP',
    emoji: '🥈',
    valor: 24.90,
    descricao: 'Acesso por 1 mês ao grupo VIP'
  },
  {
    id: 'plano_vitalicio_wpp',
    nome: 'VIP Vitalício + Wpp+Mimo',
    emoji: '🥇',
    valor: 29.90,
    descricao: 'Acesso vitalício + WhatsApp + Mimo'
  },
  {
    id: 'plano_vitalicio_chamada',
    nome: 'VIP Vitalício+ Chamadinha',
    emoji: '💎',
    valor: 69.90,
    descricao: 'Acesso vitalício + Chamada de vídeo'
  }
];

// Configuração dos downsells
const downsells = [
  {
    id: 'ds1',
    emoji: '🔴',
    texto: 'Oie Titio, percebi que você não finalizou a sua assinatura 😢\n\n🔴 SEM DESCONTO - Preço de âncora, sem dó!\n\n💗 Entra pro meu grupinho VIP agora, e vem vê sua sobrinha de um jeito que você nunca viu 🙈',
    tipoMidia: 'video',
    planos: [
      { id: 'ds1_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 19.90 },
      { id: 'ds1_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 24.90 },
      { id: 'ds1_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 29.90 },
      { id: 'ds1_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 69.90, valorComDesconto: 69.90 }
    ]
  },
  {
    id: 'ds2',
    emoji: '🟡',
    texto: 'Oie Titio, percebi que você não finalizou a sua assinatura...\n\n🟡 5% DE DESCONTO - Pra fazer charme e começar a dar gosto!\n\n💗 Pra te dar um incentivo, estou te dando 5% de desconto pra entrar agora pro meu grupinho VIP 😈\n\nVem vê sua sobrinha de um jeitinho que você nunca viu... 😏',
    tipoMidia: 'video',
    planos: [
      { id: 'ds2_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 18.90 },
      { id: 'ds2_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 22.90 },
      { id: 'ds2_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 27.90 },
      { id: 'ds2_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 69.90, valorComDesconto: 65.90 }
    ]
  },
  {
    id: 'ds3',
    emoji: '🟡',
    texto: 'Oiee titio, já veio gozar pra sua ninfetinha hoje?\n\n🟡 5% DE DESCONTO - Pra fazer charme e começar a dar gosto!\n\n💦 Vi que gerou o PIX mas não pagou, então liberei um desconto exclusivo + PRESENTINHO só pra você (não conta pra ninguém, tá?)\n\nMas corre, o desconto acaba a qualquer momento! ⏬',
    tipoMidia: 'video',
    planos: [
      { id: 'ds3_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 18.90 },
      { id: 'ds3_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 22.90 },
      { id: 'ds3_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 27.90 },
      { id: 'ds3_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 69.90, valorComDesconto: 65.90 }
    ]
  },
  {
    id: 'ds4',
    emoji: '🟠',
    texto: '💋 QUANTO TEMPO VAI ME IGNORAR? 💋\n\n🟠 10% DE DESCONTO - Pra fechar na segunda ou quarta!\n\nVocê já me espiou antes… Agora é hora de entrar e ver TUDO sem censura! 😈\n\nSe entrar agora, ainda ganha um brinde no privado... Não vou contar o que é 😏',
    tipoMidia: 'video',
    planos: [
      { id: 'ds4_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 17.90 },
      { id: 'ds4_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 21.90 },
      { id: 'ds4_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 26.90 },
      { id: 'ds4_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 69.90, valorComDesconto: 62.90 }
    ]
  },
  {
    id: 'ds5',
    emoji: '🟠',
    texto: 'Titio, você deixou a loirinha aqui esperando...\n\n🟠 10% DE DESCONTO - Pra fechar na segunda ou quarta!\n\nFiquei molhadinha te imaginando vendo meus vídeos 💋\n\nPra te conquistar: desconto liberado + presentinho do jeitinho que você gosta 😘',
    tipoMidia: 'video',
    planos: [
      { id: 'ds5_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 17.90 },
      { id: 'ds5_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 21.90 },
      { id: 'ds5_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 26.90 },
      { id: 'ds5_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 69.90, valorComDesconto: 62.90 }
    ]
  },
  {
    id: 'ds6',
    emoji: '🔥',
    texto: 'Oie titio, olha só...\n\n🔥 15% DE DESCONTO (MÁXIMO) - Só pra jogar quando quiser estourar as vendas!\n\nLiberei uma promoção secreta só pra você: desconto + bônus extra que ninguém mais vai ganhar 😈\n\nMas não conta pra ninguém... minha calcinha tá te esperando no VIP 💦',
    tipoMidia: 'video',
    planos: [
      { id: 'ds6_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 16.90 },
      { id: 'ds6_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 20.90 },
      { id: 'ds6_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 24.90 },
      { id: 'ds6_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 69.90, valorComDesconto: 58.90 }
    ]
  },
  {
    id: 'ds7',
    emoji: '🔥',
    texto: 'Já imaginou abrir o grupo e dar de cara comigo peladinha? 😳\n\n🔥 15% DE DESCONTO (MÁXIMO) - Só pra jogar quando quiser estourar as vendas!\n\nAgora imagina isso com um desconto especial + presentinho só seu? 🥵\n\nMas tem que correr, hein? Não vou deixar isso aberto por muito tempo!',
    tipoMidia: 'video',
    planos: [
      { id: 'ds7_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 16.90 },
      { id: 'ds7_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 20.90 },
      { id: 'ds7_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 24.90 },
      { id: 'ds7_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 69.90, valorComDesconto: 58.90 }
    ]
  },
  {
    id: 'ds8',
    emoji: '🔥',
    texto: 'Titio... voltei só pra dizer:\n\n🔥 15% DE DESCONTO (MÁXIMO) - Só pra jogar quando quiser estourar as vendas!\n\nSe pagar agora, além de entrar no meu VIP, vai ganhar um mimo pessoal e um descontinho safado ❤️\n\nSó não demora… ou a oferta some... e eu também 😈',
    tipoMidia: 'video',
    planos: [
      { id: 'ds8_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 16.90 },
      { id: 'ds8_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 20.90 },
      { id: 'ds8_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 24.90 },
      { id: 'ds8_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 69.90, valorComDesconto: 58.90 }
    ]
  },
  {
    id: 'ds9',
    emoji: '🔥',
    texto: 'Tô liberando um código secreto...\n\n🔥 15% DE DESCONTO (MÁXIMO) - Só pra jogar quando quiser estourar as vendas!\n\nPra quem travou no final 😳\n\nDesconto ativado + conteúdo surpresa picante liberado. Só pra você, mas só por hoje, viu?',
    tipoMidia: 'video',
    planos: [
      { id: 'ds9_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 16.90 },
      { id: 'ds9_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 20.90 },
      { id: 'ds9_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 24.90 },
      { id: 'ds9_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 69.90, valorComDesconto: 58.90 }
    ]
  },
  {
    id: 'ds10',
    emoji: '🔥',
    texto: 'Vi seu nome na lista de quem quase entrou…\n\n🔥 15% DE DESCONTO (MÁXIMO) - Só pra jogar quando quiser estourar as vendas!\n\nMe deixou com vontade de te recompensar 😘\n\nLiberei 15% OFF + vídeo exclusivo surpresa. Mas só até eu cansar de esperar 🖤',
    tipoMidia: 'video',
    planos: [
      { id: 'ds10_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 16.90 },
      { id: 'ds10_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 20.90 },
      { id: 'ds10_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 24.90 },
      { id: 'ds10_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 69.90, valorComDesconto: 58.90 }
    ]
  },
  {
    id: 'ds11',
    emoji: '🔥',
    texto: 'Oieee… sua ninfetinha loira tá aqui te esperando, sabia?\n\n🔥 15% DE DESCONTO (MÁXIMO) - Só pra jogar quando quiser estourar as vendas!\n\nVi que gerou o PIX e sumiu 🙈\n\nEntão toma: descontinho + surpresinha só pra você terminar logo essa sacanagem toda 💦',
    tipoMidia: 'video',
    planos: [
      { id: 'ds11_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 16.90 },
      { id: 'ds11_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 20.90 },
      { id: 'ds11_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 24.90 },
      { id: 'ds11_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 69.90, valorComDesconto: 58.90 }
    ]
  },
  {
    id: 'ds12',
    emoji: '🔥',
    texto: 'Titio, vai me deixar assim?\n\n🔥 15% DE DESCONTO (MÁXIMO) - Só pra jogar quando quiser estourar as vendas!\n\nCom a calcinha molhada e o grupo fechado? 😭\n\nAproveita: desconto + conteúdo extra surpresa liberado AGORA\n\nMas corre… porque eu enjoo rápido.',
    tipoMidia: 'video',
    planos: [
      { id: 'ds12_7dias', nome: '7 Dias de Grupo VIP', emoji: '🥉', valorOriginal: 19.90, valorComDesconto: 16.90 },
      { id: 'ds12_1mes', nome: '1 Mês de Grupo VIP', emoji: '🥈', valorOriginal: 24.90, valorComDesconto: 20.90 },
      { id: 'ds12_vitalicio_wpp', nome: 'VIP Vitalício + Wpp+Mimo', emoji: '🥇', valorOriginal: 29.90, valorComDesconto: 24.90 },
      { id: 'ds12_vitalicio_chamada', nome: 'VIP Vitalício+ Chamadinha', emoji: '💎', valorOriginal: 69.90, valorComDesconto: 58.90 }
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
    texto: `✨ 19,90 REAIS ✨

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
  menuPlanos,
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