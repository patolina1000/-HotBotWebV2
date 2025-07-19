const crypto = require('crypto');

function sha256(value = '') {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function validStr(v) {
  return typeof v === 'string' && !v.includes('{') && v.trim().length > 0;
}

function validCpf(v) {
  return (
    typeof v === 'string' && !v.includes('{') && v.replace(/\D/g, '').length >= 11
  );
}

function extractHashedUserData(payer_name = '', payer_cpf = '') {
  const partes = String(payer_name).trim().split(/\s+/);
  const fnRaw = partes[0] || '';
  const lnRaw = partes.at(-1) || '';
  const cpfRaw = String(payer_cpf).replace(/\D/g, '');

  const result = {};
  if (validStr(fnRaw)) result.fn = sha256(fnRaw.toLowerCase());
  if (validStr(lnRaw)) result.ln = sha256(lnRaw.toLowerCase());
  if (validCpf(cpfRaw)) result.external_id = sha256(cpfRaw);

  return result;
}

module.exports = { extractHashedUserData, validStr, validCpf };
