const assert = require('assert');
const axios = require('axios');
const PushinPayService = require('../services/pushinpay');

(async () => {
  const originalToken = process.env.PUSHINPAY_TOKEN;
  process.env.PUSHINPAY_TOKEN = 'test-token';

  const originalPost = axios.post;
  const captured = { url: null, payload: null };

  axios.post = async (url, payload) => {
    captured.url = url;
    captured.payload = payload;
    return {
      data: {
        id: 'test-transaction',
        qr_code_base64: null,
        qr_code: '000201010212...',
        qr_code_image: null
      }
    };
  };

  try {
    const service = new PushinPayService();

    const result = await service.createPixPayment({
      identifier: 'order_regression_1990',
      amount: 1990,
      amount_unit: 'cents',
      client: {
        name: 'Test Regression',
        email: 'regression@example.com'
      },
      metadata: {
        reason: 'regression-test'
      }
    });

    assert.strictEqual(result.success, true, 'createPixPayment should return success');
    assert.ok(captured.payload, 'Payload should have been captured');
    assert.strictEqual(
      captured.payload.value,
      1990,
      'PushinPay payload.value must respect cent-based inputs'
    );

    console.log('✅ Regression check: payload.value =', captured.payload.value);
  } catch (error) {
    console.error('❌ Regression check failed:', error);
    process.exitCode = 1;
  } finally {
    axios.post = originalPost;
    if (originalToken === undefined) {
      delete process.env.PUSHINPAY_TOKEN;
    } else {
      process.env.PUSHINPAY_TOKEN = originalToken;
    }
  }
})();
