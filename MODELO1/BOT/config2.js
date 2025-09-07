const base = require('./config.default');

// 💰 Valores oficiais dos planos
const valorBonequinha = 25.00;
const valorNinfetinha = 40.00;

module.exports = {
  ...base,
  inicio: {
    tipoMidia: 'video',
    midia: './midia/inicial2.mp4',
    textoInicial: `Aqui você vai descobrir como fui quase banida do Privacy e o verdadeiro motivo de terem me apelidado de Marmitinha 🐒

🎀 BONEQUINHA DO PRAZER
✔️ Acesso vitalício à galeria principal de vídeos
✔️ Atualizações safadas toda semana
✔️ Flagras e momentos íntimos no meu quarto

👑 NINFETINHA PARTICULAR
✔️ Tudo do Plano Bonequinha do Prazer ✅ +
✔️ Todos meus vídeos transando com clientes reais
✔️ Cenas pesadas e inéditas com negões
✔️ Acesso ao meu grupo secreto no WhatsApp
✔️ Lives privadas comigo onde me masturbo ao vivo

Agora é com você... vai me mostrar que merece a Bonequinha ou a Ninfetinha? ↓`,
    menuInicial: {
      texto: `Escolha uma oferta abaixo:`,
      opcoes: [
        { texto: `🎀 BONEQUINHA DO PRAZER - R$ ${valorBonequinha.toFixed(2)}`, callback: 'plano_bonequinha' },
        { texto: `👑 NINFETINHA PARTICULAR - R$ ${valorNinfetinha.toFixed(2)}`, callback: 'plano_ninfetinha' }
      ]
    }
  },
  planos: [
    {
      id: 'plano_bonequinha',
      nome: 'BONEQUINHA DO PRAZER',
      emoji: '🎀',
      valor: valorBonequinha,
      descricao: 'Acesso vitalício à galeria principal de vídeos + atualizações safadas toda semana + flagras e momentos íntimos'
    },
    {
      id: 'plano_ninfetinha',
      nome: 'NINFETINHA PARTICULAR',
      emoji: '👑',
      valor: valorNinfetinha,
      descricao: 'Tudo do plano Bonequinha + vídeos com clientes reais + cenas pesadas + grupo secreto WhatsApp + lives privadas'
    }
  ],
  midias: {
    inicial: { video: './midia/inicial2.mp4' }
  },
  downsells: [],
  mensagensPeriodicas: [],
  canalPrevias: null,
  mensagens: {
    ...(base.mensagens || {}),
    boasVindas: '👋 Bem-vindo ao bot2!'
  }
};
