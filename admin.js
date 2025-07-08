#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const postgres = require('./postgres');

dotenv.config();

const pool = postgres.createPool();

async function listTokens() {
  const query = `SELECT token_uuid, telegram_id, valor, bot_id, criado_em
                 FROM pending_tokens
                 WHERE status = 'valido'
                 ORDER BY criado_em DESC
                 LIMIT 10`;
  const res = await postgres.executeQuery(pool, query);
  const rows = res.rows.map(r => ({
    token_uuid: r.token_uuid,
    telegram_id: r.telegram_id,
    valor: r.valor ? Number(r.valor) / 100 : null,
    bot_id: r.bot_id,
    criado_em: r.criado_em
  }));
  console.table(rows);
}

async function listPendingTokens() {
  const query = `SELECT token, telegram_id, valor, bot_id, criado_em
                 FROM pending_tokens
                 WHERE status = 'pendente'
                 ORDER BY criado_em DESC
                 LIMIT 10`;
  const res = await postgres.executeQuery(pool, query);
  const rows = res.rows.map(r => ({
    token: r.token,
    telegram_id: r.telegram_id,
    valor: r.valor ? Number(r.valor) / 100 : null,
    bot_id: r.bot_id,
    criado_em: r.criado_em
  }));
  console.table(rows);
}

function listBots() {
  const botsDir = path.join(__dirname, 'bots');
  if (!fs.existsSync(botsDir)) {
    console.log('Nenhum bot encontrado.');
    return;
  }
  const dirs = fs.readdirSync(botsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => d.name);

  const bots = dirs.map(dir => {
    const envPath = path.join(botsDir, dir, '.env');
    let token = '';
    let redirect = '';
    if (fs.existsSync(envPath)) {
      const env = dotenv.parse(fs.readFileSync(envPath));
      token = env.TELEGRAM_TOKEN || '';
      redirect = env.REDIRECT_FINAL || '';
    }
    return { bot: dir, token, redirect_final: redirect };
  });

  console.table(bots);
}

async function showStats() {
  const resValid = await postgres.executeQuery(
    pool,
    "SELECT COUNT(*) FROM pending_tokens WHERE status = 'valido'"
  );
  const resPend = await postgres.executeQuery(
    pool,
    "SELECT COUNT(*) FROM pending_tokens WHERE status = 'pendente'"
  );
  const botsDir = path.join(__dirname, 'bots');
  const botCount = fs.existsSync(botsDir)
    ? fs.readdirSync(botsDir, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('.')).length
    : 0;

  console.table([
    {
      tokens_validos: parseInt(resValid.rows[0].count, 10),
      tokens_pendentes: parseInt(resPend.rows[0].count, 10),
      bots: botCount
    }
  ]);
}

function showHelp() {
  console.log('Uso: node admin.js <comando>');
  console.log('\nComandos disponíveis:');
  console.log('  tokens            - Lista os últimos 10 tokens validados');
  console.log('  tokens pendentes  - Lista os últimos 10 tokens pendentes');
  console.log('  bots              - Lista bots disponíveis');
  console.log('  stats             - Mostra estatísticas gerais');
}

async function main() {
  const cmd = (process.argv[2] || '').toLowerCase();
  const sub = (process.argv[3] || '').toLowerCase();

  try {
    if (cmd === 'tokens') {
      if (sub === 'pendentes') {
        await listPendingTokens();
      } else {
        await listTokens();
      }
    } else if (cmd === 'bots') {
      listBots();
    } else if (cmd === 'stats') {
      await showStats();
    } else {
      showHelp();
    }
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Erro:', err.message);
    process.exit(1);
  });
}
