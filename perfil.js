function getPerfil() {
  return process.env.MEU_PERFIL || '1';
}

function getPerfilVar(nome, padrao = undefined) {
  const perfil = getPerfil();
  return process.env[`${nome}_${perfil}`] || process.env[nome] || padrao;
}

module.exports = { getPerfil, getPerfilVar };
