module.exports = {
  inicio: {
    textoInicial: 'Olá, este é um bot de exemplo.',
  },
  planos: [],
  mensagemPix: (nome, valor, pix) => `Pague R$ ${valor} via PIX: ${pix}`,
  mensagensPeriodicas: [
    { hora: '08:00', texto: 'Mensagem periódica das 8h' },
    { hora: '11:00', texto: 'Mensagem periódica das 11h' },
    { hora: '18:00', texto: 'Mensagem periódica das 18h' },
    { hora: '20:00', texto: 'Mensagem periódica das 20h' },
    { hora: '23:00', texto: 'Mensagem periódica das 23h' }
  ]
};
