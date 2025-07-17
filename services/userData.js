const crypto = require('crypto');

function sha256(value = '') {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function extractHashedUserData(payer_name = '', payer_cpf = '') {
  const partes = String(payer_name).trim().split(/\s+/);
  const fn = partes[0]?.toLowerCase() || '';
  const ln = partes.at(-1)?.toLowerCase() || '';
  const cpf = String(payer_cpf).replace(/\D/g, '');

  return {
    fn: fn ? sha256(fn) : undefined,
    ln: ln ? sha256(ln) : undefined,
    external_id: cpf ? sha256(cpf) : undefined
  };
}

module.exports = { extractHashedUserData };
