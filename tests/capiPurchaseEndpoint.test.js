const express = require('express');
const request = require('supertest');

jest.mock('../services/facebook', () => ({
  sendFacebookEvent: jest.fn().mockResolvedValue({ success: true })
}));

const { sendFacebookEvent } = require('../services/facebook');
const createHandler = require('../capiPurchaseEndpoint');

test('valid request triggers Facebook CAPI and updates token', async () => {
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
      action_source: 'website',
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
