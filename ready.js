let ready = false;

function isReady() {
  return ready;
}

function setReady(value) {
  ready = Boolean(value);
}

module.exports = { isReady, setReady };
