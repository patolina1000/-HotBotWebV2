const express = require('express');
const request = require('supertest');

jest.mock('axios');
let axios = require('axios');

test('valid request triggers Facebook CAPI and updates token', async () => {
  jest.resetModules();
  jest.mock('../services/facebook', () => ({
    sendFacebookEvent: jest.fn().mockResolvedValue({ success: true })
  }));
  const { sendFacebookEvent } = require('../services/facebook');
  const createHandler = require('../capiPurchaseEndpoint');
  const pool = {
    query: jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ valor: 5, status: 'valido', usado: false, event_time: 111 }] })
      .mockResolvedValueOnce({})
  };

  const app = express();
  app.use(express.json());
  app.post('/api/capi-purchase', createHandler(() => pool));

  const res = await request(app)
    .post('/api/capi-purchase')
    .send({ token: 'tok1', fbp: 'fbp', fbc: 'fbc' });

  expect(res.status).toBe(200);
  expect(res.body.success).toBe(true);

  expect(sendFacebookEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      event_name: 'Purchase',
      event_id: 'tok1',
      action_source: 'system_generated',
      value: 5,
      currency: 'BRL',
      fbp: 'fbp',
      fbc: 'fbc',
      event_time: 111
    })
  );

  expect(pool.query).toHaveBeenNthCalledWith(
    1,
    'SELECT valor, status, usado, event_time FROM tokens WHERE token = $1',
    ['tok1']
  );
  expect(pool.query).toHaveBeenNthCalledWith(
    2,
    "UPDATE tokens SET status = 'expirado', usado = TRUE, data_uso = CURRENT_TIMESTAMP WHERE token = $1",
    ['tok1']
  );
});

test('capi-purchase inclui test_event_code quando configurado', async () => {
  jest.resetModules();
  jest.unmock('../services/facebook');
  process.env.FB_PIXEL_ID = 'PIXEL_TEST';
  process.env.FB_PIXEL_TOKEN = 'TOKEN_TEST';
  const facebook = require('../services/facebook');
  jest.spyOn(facebook, 'sendFacebookEvent');
  const createHandler = require('../capiPurchaseEndpoint');
  axios = require('axios');
  axios.post.mockResolvedValue({ data: { success: true } });
  const pool = {
    query: jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ valor: 5, status: 'valido', usado: false, event_time: 111 }] })
      .mockResolvedValueOnce({})
  };

  const app = express();
  app.use(express.json());
  app.post('/api/capi-purchase', createHandler(() => pool));

  process.env.FB_TEST_EVENT_CODE = 'PUR123';
  process.env.NODE_ENV = 'production';
  process.env.FORCE_FB_TEST_MODE = '1';

  const res = await request(app)
    .post('/api/capi-purchase')
    .send({ token: 'tok1', fbp: 'fbp', fbc: 'fbc' });

  expect(res.status).toBe(200);
  const payload = facebook.sendFacebookEvent.mock.calls[0][0];
  expect(payload.test_event_code).toBe('PUR123');

  delete process.env.FB_TEST_EVENT_CODE;
  delete process.env.NODE_ENV;
  delete process.env.FORCE_FB_TEST_MODE;
  delete process.env.FB_PIXEL_ID;
  delete process.env.FB_PIXEL_TOKEN;
});
