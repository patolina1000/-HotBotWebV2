const base = require('./config.default');

module.exports = {
  ...base,
  
  inicio: {
    tipoMidia: 'video',
    textoInicial: `🎉 Bem-vindo ao Bot Especial!

Este é um acesso exclusivo para compradores verificados.
Aqui você terá acesso ao conteúdo premium personalizado com verificação completa de identidade.

Por apenas R$2,00 (vitalício):

✅ Acesso premium verificado
🔒 Conteúdo exclusivo personalizado  
👤 Perfil verificado com seus dados
🎯 Experiência personalizada
💎 Acesso vitalício sem renovação
🔐 Máxima discrição e segurança

Compradores verificados têm acesso a uma experiência única e personalizada.`,
    
    menuInicial: {
      texto: `Escolha seu plano especial verificado:

👇 Acesso exclusivo para perfis verificados 👇`,
      opcoes: [
        { texto: '💎 Acesso Premium Verificado - R$2,00', callback: 'premium' }
      ]
    }
  },

  planos: [
    { id: 'premium', nome: 'Acesso Premium Verificado', valor: 2.00 }
  ],

  // Configuração especial: redireciona para obrigado_especial.html
  paginaObrigado: 'obrigado_especial.html',
  
  downsells: [],
  mensagensPeriodicas: [],
  
  mensagens: {
    ...(base.mensagens || {}),
    boasVindas: '👋 Bem-vindo ao Bot Especial - Acesso Verificado!'
  }
};