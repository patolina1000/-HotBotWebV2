#!/usr/bin/env node

// Teste simples da lógica do middleware

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  return (req.query.token || '').toString().trim();
}

function authDashboard(req, res, next) {
  const cfg = process.env.PANEL_ACCESS_TOKEN;
  if (!cfg) {
    return res.status(503).json({ error: 'PANEL_ACCESS_TOKEN não configurado' });
  }
  const token = extractToken(req);
  if (!token || token !== cfg) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  return next();
}

// Teste 1: Token válido
console.log('Teste 1: Token válido');
process.env.PANEL_ACCESS_TOKEN = 'test123';
const req1 = { headers: { authorization: 'Bearer test123' }, query: {} };
const res1 = { status: null, json: null };
res1.status = (code) => ({ json: (data) => { res1.status = code; res1.json = data; } });
const next1 = () => 'next-called';

const result1 = authDashboard(req1, res1, next1);
console.log('Resultado:', result1);
console.log('Status:', res1.status);
console.log('JSON:', res1.json);
console.log('---');

// Teste 2: Token ausente
console.log('Teste 2: Token ausente');
const req2 = { headers: {}, query: {} };
const res2 = { status: null, json: null };
res2.status = (code) => ({ json: (data) => { res2.status = code; res2.json = data; } });
const next2 = () => 'next-called';

const result2 = authDashboard(req2, res2, next2);
console.log('Resultado:', result2);
console.log('Status:', res2.status);
console.log('JSON:', res2.json);
console.log('---');

// Teste 3: Token inválido
console.log('Teste 3: Token inválido');
const req3 = { headers: { authorization: 'Bearer invalid' }, query: {} };
const res3 = { status: null, json: null };
res3.status = (code) => ({ json: (data) => { res3.status = code; res3.json = data; } });
const next3 = () => 'next-called';

const result3 = authDashboard(req3, res3, next3);
console.log('Resultado:', result3);
console.log('Status:', res3.status);
console.log('JSON:', res3.json);
console.log('---');

// Teste 4: PANEL_ACCESS_TOKEN não configurado
console.log('Teste 4: PANEL_ACCESS_TOKEN não configurado');
delete process.env.PANEL_ACCESS_TOKEN;
const req4 = { headers: { authorization: 'Bearer any' }, query: {} };
const res4 = { status: null, json: null };
res4.status = (code) => ({ json: (data) => { res4.status = code; res4.json = data; } });
const next4 = () => 'next-called';

const result4 = authDashboard(req4, res4, next4);
console.log('Resultado:', result4);
console.log('Status:', res4.status);
console.log('JSON:', res4.json);