const path = require('path');
require('dotenv').config();

jest.setTimeout(30000);

const express = require('express');
const { newDb } = require('pg-mem');

function generateHexToken() {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

describe('Tokens TTL e validação (pg-mem)', () => {
  let webModule;
  let repository;
  let memPool;

  beforeAll(async () => {
    process.env.TOKEN_TTL_MINUTES = process.env.TOKEN_TTL_MINUTES || '120';

    // Cria banco em memória compatível com pg
    const db = newDb({ autoCreateForeignKeyIndices: true });
    const { Pool } = db.adapters.createPg();
    memPool = new Pool();

    // Schema mínimo usado pelos testes
    await memPool.query(`
      CREATE TABLE tokens (
        token TEXT PRIMARY KEY,
        valor NUMERIC,
        created_at TIMESTAMP DEFAULT NOW(),
        data_criacao TIMESTAMP DEFAULT NOW(),
        usado_em TIMESTAMP NULL,
        status TEXT DEFAULT 'pendente',
        usado BOOLEAN DEFAULT FALSE,
        utm_campaign TEXT,
        utm_medium TEXT,
        utm_term TEXT,
        utm_content TEXT,
        fbp TEXT,
        fbc TEXT,
        ip_criacao TEXT,
        user_agent_criacao TEXT,
        event_time INTEGER,
        pixel_sent BOOLEAN DEFAULT FALSE,
        capi_sent BOOLEAN DEFAULT FALSE,
        cron_sent BOOLEAN DEFAULT FALSE,
        first_event_sent_at TIMESTAMP,
        event_attempts INTEGER DEFAULT 0,
        capi_ready BOOLEAN DEFAULT FALSE,
        capi_processing BOOLEAN DEFAULT FALSE,
        fn_hash TEXT,
        ln_hash TEXT,
        external_id_hash TEXT,
        nome_oferta TEXT
      );
    `);

    // Mocka bootstrap para tokens.js pegar nosso pool
    const bootstrapPath = require.resolve('./bootstrap');
    jest.resetModules();
    jest.doMock(bootstrapPath, () => ({
      getDatabasePool: () => memPool
    }), { virtual: false });

    // Carrega módulo web com um app Express real
    const app = express();
    const factory = require('./MODELO1/WEB/tokens.js');
    webModule = factory(app);
    repository = webModule.repository;

    // Limpa tokens de testes anteriores
    await memPool.query("DELETE FROM tokens");
  });

  afterAll(async () => {
    if (memPool && memPool.end) await memPool.end();
  });

  test('Criação e busca de token retorna campos corretos', async () => {
    const token = generateHexToken();
    const created = await repository.createToken({ token, valor: 9.9, status: 'valido', usado: false });
    expect(created).toBeTruthy();
    expect(created.token).toBe(token);
    expect(created.usado).toBe(false);
    expect(created.status).toBe('valido');

    const found = await repository.findByToken(token);
    expect(found).toBeTruthy();
    expect(found.token).toBe(token);
    expect(found.usado).toBe(false);
    expect(Number(found.valor)).toBeCloseTo(9.9);
    expect(found.created_at || found.data_criacao).toBeTruthy();
  });

  test('Validação OK retorna ok:true', async () => {
    const token = generateHexToken();
    await repository.createToken({ token, valor: 1.23, status: 'valido', usado: false });

    const result = await webModule.validateToken(token);
    expect(result.ok).toBe(true);
    expect(result.row).toBeTruthy();
    expect(result.row.token).toBe(token);
  });

  test('Token usado retorna reason:"used"', async () => {
    const token = generateHexToken();
    await repository.createToken({ token, valor: 5.55, status: 'valido', usado: false });

    await repository.markUsed({ token });

    const result = await webModule.validateToken(token);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('used');
  });

  test('Expiração via TTL curto retorna reason:"expired" e cleanup remove', async () => {
    process.env.TOKEN_TTL_MINUTES = '0.02';

    const token = generateHexToken();
    await repository.createToken({ token, valor: 7.77, status: 'valido', usado: false });

    await new Promise((r) => setTimeout(r, 2000));

    const result = await webModule.validateToken(token);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('expired');

    const removed = await webModule.cleanupExpired();
    expect(typeof removed).toBe('number');

    const after = await repository.findByToken(token);
    expect(after).toBeNull();

    process.env.TOKEN_TTL_MINUTES = '120';
  });
});