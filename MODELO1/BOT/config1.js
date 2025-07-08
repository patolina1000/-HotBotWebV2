const base = require('./config.default');
module.exports = {
  ...base,
  mensagens: {
    ...(base.mensagens || {}),
    boasVindas: '👋 Bem-vindo ao bot1!'
  }
};
