const crypto = require('crypto');

function uniqueEventId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const timestamp = Date.now().toString(36);
  const randomPart = crypto.randomBytes(8).toString('hex');
  return `${timestamp}-${randomPart}`;
}

module.exports = {
  uniqueEventId
};
