const express = require('express');
const request = require('supertest');
const requestId = require('./src/infra/logger/request-id');

test('propaga x-request-id', async () => {
  const app = express();
  app.use(requestId);
  app.get('/', (req, res) => res.json({ id: req.request_id }));
  const res = await request(app).get('/').set('x-request-id', 'abc');
  expect(res.body.id).toBe('abc');
  expect(res.headers['x-request-id']).toBe('abc');
});

test('gera id quando ausente', async () => {
  const app = express();
  app.use(requestId);
  app.get('/', (req, res) => res.json({ id: req.request_id }));
  const res = await request(app).get('/');
  expect(res.headers['x-request-id']).toBeDefined();
  expect(res.body.id).toBe(res.headers['x-request-id']);
});
