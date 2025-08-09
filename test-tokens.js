const path = require('path');
require('dotenv').config();

// Aumentar timeout global dos testes que envolvem espera
jest.setTimeout(30000);

const bootstrap = require('./bootstrap');
const { createPool } = require('./database/postgres');
const express = require('express');

function generateHexToken() {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

describe('Tokens TTL e validação', () => {
  let webModule;
  let repository;
  let databasePool;

  beforeAll(async () => {
    // Garantir TTL default alto para testes que não checam expiração
    process.env.TOKEN_TTL_MINUTES = process.env.TOKEN_TTL_MINUTES || '120';

    // Inicializa bootstrap e banco
    await bootstrap.start();
    databasePool = bootstrap.getDatabasePool();

    // Limpar tokens de testes anteriores (somente prefixo jest_ se aplicável)
    await databasePool.query("DELETE FROM tokens WHERE token LIKE 'jest_%'");

    // Carrega módulo web com um app Express real
    const app = express();
    const factory = require('./MODELO1/WEB/tokens.js');
    webModule = factory(app);
    repository = webModule.repository;
  });

  afterAll(async () => {
    const pool = bootstrap.getDatabasePool();
    if (pool) {
      await pool.end();
    }
  });

  test('Criação e busca de token retorna campos corretos', async () => {
    const token = generateHexToken();
    const created = await repository.createToken({ token, valor: 9.9, status: 'valido', usado: false });
    expect(created).toBeTruthy();
    expect(created.token).toBe(token);
    expect(created.usado).toBe(false);
    expect(created.status).toBe('valido');
    expect(Number(created.valor)).toBeCloseTo(9.9);

    const found = await repository.findByToken(token);
    expect(found).toBeTruthy();
    expect(found.token).toBe(token);
    expect(found.usado).toBe(false);
    expect(Number(found.valor)).toBeCloseTo(9.9);
    // Campo de criação deve existir (criado_em no schema atual)
    expect(found.criado_em || found.created_at || found.data_criacao).toBeTruthy();
  });

  test('Validação OK retorna ok:true', async () => {
    const token = generateHexToken();
    await repository.createToken({ token, valor: 1.23, status: 'valido', usado: false });

    const result = await webModule.validateToken(token);
    expect(result).toEqual(expect.objectContaining({ ok: true }));
    expect(result.row).toBeTruthy();
    expect(result.row.token).toBe(token);
  });

  test('Token usado retorna reason:"used"', async () => {
    const token = generateHexToken();
    await repository.createToken({ token, valor: 5.55, status: 'valido', usado: false });

    await repository.markUsed({ token });

    const result = await webModule.validateToken(token);
    expect(result).toEqual(expect.objectContaining({ ok: false, reason: 'used' }));
  });

  test('Expiração via TTL curto retorna reason:"expired" e cleanup remove', async () => {
    // TTL ~1.2s
    process.env.TOKEN_TTL_MINUTES = '0.02';

    const token = generateHexToken();
    await repository.createToken({ token, valor: 7.77, status: 'valido', usado: false });

    // Aguarda expirar
    await new Promise((r) => setTimeout(r, 2000));

    const result = await webModule.validateToken(token);
    expect(result).toEqual(expect.objectContaining({ ok: false, reason: 'expired' }));

    const removed = await webModule.cleanupExpired();
    expect(typeof removed).toBe('number');

    const after = await repository.findByToken(token);
    expect(after).toBeNull();

    // Restaura TTL default para não afetar outros testes
    process.env.TOKEN_TTL_MINUTES = '120';
  });
});