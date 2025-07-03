module.exports = {
  inicio: {
    tipoMidia: 'video', // 'imagem' ou 'video'
    midia: 'midia/inicial.mp4',
    audio: 'midia/inicial_audio.mp3',

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
  },

  canalPrevias: 'https://t.me/+B9dEZHITEM1iYzMx',

  planos: [
    {
      id: 'plano_vitalicio',
      emoji: '💋',
      nome: 'Vitalício + Presentinho',
      valor: .50
    },
    {
      id: 'plano_espiar',
      emoji: '👀',
      nome: 'Quero só espiar... 💋',
      valor: 20.00
    }
  ],

  mensagemPix: (nome, valor, copia_cola) => `
🌟 <b>Você selecionou o seguinte plano:</b>

🎁 <b>Plano:</b> ${nome}
💰 <b>Valor:</b> R$${valor.toFixed(2)}

💠 <b>Pague via Pix Copia e Cola (ou QR Code em alguns bancos):</b>

<pre>${copia_cola}</pre>

📌 <b>Toque na chave PIX acima para copiá-la</b>
❗ Após o pagamento, clique no botão abaixo para verificar o status:
`.trim(),

    pagamento: {
    aprovado: '✅ Pagamento confirmado com sucesso!\n\n🔓 Aqui está seu acesso ao conteúdo:',
    link: '👉 https://t.me/+UEmVhhccVMw3ODcx',
    pendente: '⏳ O pagamento ainda não foi identificado. Aguarde alguns instantes e clique novamente.',
    expirado: '❌ Este QR Code expirou. Por favor, gere uma nova cobrança.',
    erro: '❌ Erro ao verificar status do pagamento. Tente novamente em alguns instantes.'
  },

  downsells: [
    {
      id: 'ds1',
      texto: 'Oie Titio, percebi que você não finalizou a sua assinatura 😢\n\n💗 Entra pro meu grupinho VIP agora, e vem vê sua sobrinha de um jeito que você nunca viu 🙈',
      midia: 'midia/downsells/ds1.mp4',
      planos: [
        { id: 'ds1_vitalicio', nome: 'Vitalício + Presentinho', emoji: '💋', valorOriginal: 27.00, valorComDesconto: 27.00 },
        { id: 'ds1_espiar', nome: 'Quero só espiar...', emoji: '👀', valorOriginal: 20.00, valorComDesconto: 20.00 }
      ]
    },
    
    {
      id: 'ds2',
      texto: 'Oie Titio, percebi que você não finalizou a sua assinatura...\n\n💗 Pra te dar um incentivo, estou te dando 10% de desconto pra entrar agora pro meu grupinho VIP 😈\n\nVem vê sua sobrinha de um jeitinho que você nunca viu... 😏',
      midia: 'midia/downsells/ds2.mp4',
      planos: [
        { id: 'ds2_vitalicio', nome: 'Vitalício + Presentinho', emoji: '💋', valorOriginal: 27.00, valorComDesconto: 24.30 },
        { id: 'ds2_espiar', nome: 'Quero só espiar...', emoji: '👀', valorOriginal: 20.00, valorComDesconto: 18.00 }
      ]
    },
    {
      id: 'ds3',
      texto: 'Oiee titio, já veio gozar pra sua ninfetinha hoje?\n\n💦 Vi que gerou o PIX mas não pagou, então liberei um desconto exclusivo + PRESENTINHO só pra você (não conta pra ninguém, tá?)\n\nMas corre, o desconto acaba a qualquer momento! ⏬',
      midia: 'midia/downsells/ds3.mp4',
      planos: [
        { id: 'ds3_vitalicio', nome: 'Vitalício + Presentinho', emoji: '💋', valorOriginal: 27.00, valorComDesconto: 25.65 },
        { id: 'ds3_espiar', nome: 'Quero só espiar...', emoji: '👀', valorOriginal: 20.00, valorComDesconto: 19.00 }
      ]
    },
    {
      id: 'ds4',
      texto: '💋 QUANTO TEMPO VAI ME IGNORAR? 💋\n\nVocê já me espiou antes… Agora é hora de entrar e ver TUDO sem censura! 😈\n\nSe entrar agora, ainda ganha um brinde no privado... Não vou contar o que é 😏',
      midia: 'midia/downsells/ds4.mp4',
      planos: [
        { id: 'ds4_vitalicio', nome: 'Vitalício + Presentinho', emoji: '💋', valorOriginal: 27.00, valorComDesconto: 25.65 },
        { id: 'ds4_espiar', nome: 'Quero só espiar...', emoji: '👀', valorOriginal: 20.00, valorComDesconto: 19.00 }
      ]
    },
    {
      id: 'ds5',
      texto: 'Titio, você deixou a loirinha aqui esperando...\n\nFiquei molhadinha te imaginando vendo meus vídeos 💋\n\nPra te conquistar: desconto liberado + presentinho do jeitinho que você gosta 😘',
      midia: 'midia/downsells/ds5.mp4',
      planos: [
        { id: 'ds5_vitalicio', nome: 'Vitalício + Presentinho', emoji: '💋', valorOriginal: 27.00, valorComDesconto: 24.30 },
        { id: 'ds5_espiar', nome: 'Quero só espiar...', emoji: '👀', valorOriginal: 20.00, valorComDesconto: 18.00 }
      ]
    },
    {
      id: 'ds6',
      texto: 'Oie titio, olha só...\n\nLiberei uma promoção secreta só pra você: desconto + bônus extra que ninguém mais vai ganhar 😈\n\nMas não conta pra ninguém... minha calcinha tá te esperando no VIP 💦',
      midia: 'midia/downsells/ds6.mp4',
      planos: [
        { id: 'ds6_vitalicio', nome: 'Vitalício + Presentinho', emoji: '💋', valorOriginal: 27.00, valorComDesconto: 22.95 },
        { id: 'ds6_espiar', nome: 'Quero só espiar...', emoji: '👀', valorOriginal: 20.00, valorComDesconto: 17.00 }
      ]
    },
    {
      id: 'ds7',
      texto: 'Já imaginou abrir o grupo e dar de cara comigo peladinha? 😳\n\nAgora imagina isso com um desconto especial + presentinho só seu? 🥵\n\nMas tem que correr, hein? Não vou deixar isso aberto por muito tempo!',
      midia: 'midia/downsells/ds7.mp4',
      planos: [
        { id: 'ds7_vitalicio', nome: 'Vitalício + Presentinho', emoji: '💋', valorOriginal: 27.00, valorComDesconto: 22.95 },
        { id: 'ds7_espiar', nome: 'Quero só espiar...', emoji: '👀', valorOriginal: 20.00, valorComDesconto: 17.00 }
      ]
    },
    {
      id: 'ds8',
      texto: 'Titio... voltei só pra dizer:\n\nSe pagar agora, além de entrar no meu VIP, vai ganhar um mimo pessoal e um descontinho safado ❤️\n\nSó não demora… ou a oferta some... e eu também 😈',
      midia: 'midia/downsells/ds8.mp4',
      planos: [
        { id: 'ds8_vitalicio', nome: 'Vitalício + Presentinho', emoji: '💋', valorOriginal: 27.00, valorComDesconto: 21.60 },
        { id: 'ds8_espiar', nome: 'Quero só espiar...', emoji: '👀', valorOriginal: 20.00, valorComDesconto: 16.00 }
      ]
    },
    {
      id: 'ds9',
      texto: 'Tô liberando um código secreto...\n\nPra quem travou no final 😳\n\nDesconto ativado + conteúdo surpresa picante liberado. Só pra você, mas só por hoje, viu?',
      midia: 'midia/downsells/ds9.mp4',
      planos: [
        { id: 'ds9_vitalicio', nome: 'Vitalício + Presentinho', emoji: '💋', valorOriginal: 27.00, valorComDesconto: 21.60 },
        { id: 'ds9_espiar', nome: 'Quero só espiar...', emoji: '👀', valorOriginal: 20.00, valorComDesconto: 16.00 }
      ]
    },
    {
      id: 'ds10',
      texto: 'Vi seu nome na lista de quem quase entrou…\n\nMe deixou com vontade de te recompensar 😘\n\nLiberei 25% OFF + vídeo exclusivo surpresa. Mas só até eu cansar de esperar 🖤',
      midia: 'midia/downsells/ds10.mp4',
      planos: [
        { id: 'ds10_vitalicio', nome: 'Vitalício + Presentinho', emoji: '💋', valorOriginal: 27.00, valorComDesconto: 20.25 },
        { id: 'ds10_espiar', nome: 'Quero só espiar...', emoji: '👀', valorOriginal: 20.00, valorComDesconto: 15.00 }
      ]
    },
    {
      id: 'ds11',
      texto: 'Oieee… sua ninfetinha loira tá aqui te esperando, sabia?\n\nVi que gerou o PIX e sumiu 🙈\n\nEntão toma: descontinho + surpresinha só pra você terminar logo essa sacanagem toda 💦',
      midia: 'midia/downsells/ds11.mp4',
      planos: [
        { id: 'ds11_vitalicio', nome: 'Vitalício + Presentinho', emoji: '💋', valorOriginal: 27.00, valorComDesconto: 20.25 },
        { id: 'ds11_espiar', nome: 'Quero só espiar...', emoji: '👀', valorOriginal: 20.00, valorComDesconto: 15.00 }
      ]
    },
    {
      id: 'ds12',
      texto: 'Titio, vai me deixar assim?\n\nCom a calcinha molhada e o grupo fechado? 😭\n\nAproveita: desconto + conteúdo extra surpresa liberado AGORA\n\nMas corre… porque eu enjoo rápido.',
      midia: 'midia/downsells/ds12.mp4',
      planos: [
        { id: 'ds12_vitalicio', nome: 'Vitalício + Presentinho', emoji: '💋', valorOriginal: 27.00, valorComDesconto: 18.90 },
        { id: 'ds12_espiar', nome: 'Quero só espiar...', emoji: '👀', valorOriginal: 20.00, valorComDesconto: 14.00 }
      ]
    }
  ],
  formatarValorCentavos: valor => {
    const numerico = Number(String(valor).replace(',', '.').trim());
    return Math.round((numerico + Number.EPSILON) * 100);
  }
};
