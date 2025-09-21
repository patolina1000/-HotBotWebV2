const assert = require('assert');
const { generateSyncedTimestamp } = require('../services/facebook');

function withMockedDateNow(mockedSeconds, fn) {
  const originalDateNow = Date.now;
  Date.now = () => mockedSeconds * 1000;

  try {
    fn();
  } finally {
    Date.now = originalDateNow;
  }
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

runTest('Retorna timestamp do cliente quando está dentro da janela permitida', () => {
  const clientTimestamp = 1_700_000_000;
  const fallbackTimestamp = clientTimestamp - 30;

  withMockedDateNow(clientTimestamp + 10, () => {
    const result = generateSyncedTimestamp(clientTimestamp, fallbackTimestamp);
    assert.strictEqual(result, clientTimestamp);
  });
});

runTest('Retorna fallback quando timestamp do cliente diverge mais que 5 minutos', () => {
  const clientTimestamp = 1_700_000_000;
  const fallbackTimestamp = clientTimestamp - 45;

  withMockedDateNow(clientTimestamp + 600, () => {
    const result = generateSyncedTimestamp(clientTimestamp, fallbackTimestamp);
    assert.strictEqual(result, fallbackTimestamp);
  });
});

runTest('Retorna fallback quando timestamp do cliente não é fornecido', () => {
  const fallbackTimestamp = 1_650_000_000;

  withMockedDateNow(fallbackTimestamp + 120, () => {
    const result = generateSyncedTimestamp(null, fallbackTimestamp);
    assert.strictEqual(result, fallbackTimestamp);
  });
});

runTest('Retorna null quando nenhum timestamp válido está disponível', () => {
  withMockedDateNow(1_650_000_000, () => {
    const result = generateSyncedTimestamp(undefined, undefined);
    assert.strictEqual(result, null);
  });
});

const exitCode = process.exitCode || 0;
process.exit(exitCode);
