jest.mock('../services/facebook', () => {
  const original = jest.requireActual('../services/facebook');
  return {
    ...original,
    sendFacebookEvent: jest.fn().mockResolvedValue({ success: true })
  };
});

const { sendFacebookEvent } = require('../services/facebook');
const {
  sendAddToCartEvent,
  sendInitiateCheckoutEvent
} = require('../services/facebookEvents');

describe('facebook event helpers', () => {
  beforeEach(() => {
    sendFacebookEvent.mockClear();
  });

  test('sendAddToCartEvent forwards correct params', async () => {
    const params = {
      value: 12.34,
      event_id: 'evt123',
      fbp: 'fbp_test',
      fbc: 'fbc_test',
      client_ip_address: '8.8.8.8',
      client_user_agent: 'JestAgent/1.0'
    };

    await sendAddToCartEvent(params);

    expect(sendFacebookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: 'AddToCart',
        event_time: expect.any(Number),
        value: params.value,
        currency: 'BRL',
        event_id: params.event_id,
        fbp: params.fbp,
        fbc: params.fbc,
        client_ip_address: params.client_ip_address,
        client_user_agent: params.client_user_agent,
        action_source: 'system_generated'
    })
  );
  });

  test('sendAddToCartEvent inclui codigo de teste do ambiente', async () => {
    const prev = process.env.FB_TEST_EVENT_CODE;
    process.env.FB_TEST_EVENT_CODE = 'TEST123';

    const params = {
      value: 1,
      event_id: 'evtEnv',
      fbp: 'fbp_env',
      fbc: 'fbc_env',
      client_ip_address: '1.1.1.1',
      client_user_agent: 'JestEnv/1.0'
    };

    await sendAddToCartEvent(params);

    const called = sendFacebookEvent.mock.calls[0][0];
    expect(called.test_event_code).toBe('TEST123');

    if (prev === undefined) {
      delete process.env.FB_TEST_EVENT_CODE;
    } else {
      process.env.FB_TEST_EVENT_CODE = prev;
    }
  });

  test('sendAddToCartEvent omite codigo de teste quando ambiente nao define', async () => {
    const prev = process.env.FB_TEST_EVENT_CODE;
    delete process.env.FB_TEST_EVENT_CODE;

    const params = {
      value: 2,
      event_id: 'evtNoEnv',
      fbp: 'fbp_noenv',
      fbc: 'fbc_noenv',
      client_ip_address: '2.2.2.2',
      client_user_agent: 'JestNoEnv/1.0'
    };

    await sendAddToCartEvent(params);

    const called = sendFacebookEvent.mock.calls[0][0];
    expect(called.test_event_code).toBeUndefined();

    if (prev !== undefined) {
      process.env.FB_TEST_EVENT_CODE = prev;
    }
  });

  test('sendInitiateCheckoutEvent forwards correct params with utms', async () => {
    const utms = {
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'summer',
      utm_term: 'hot',
      utm_content: 'banner'
    };

    const params = {
      value: 99.99,
      event_id: 'evt999',
      fbp: 'fbp_ic',
      fbc: 'fbc_ic',
      client_ip_address: '1.2.3.4',
      client_user_agent: 'JestAgent/2.0',
      utms
    };

    await sendInitiateCheckoutEvent(params);

    expect(sendFacebookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: 'InitiateCheckout',
        value: params.value,
        currency: 'BRL',
        event_id: params.event_id,
        fbp: params.fbp,
        fbc: params.fbc,
        client_ip_address: params.client_ip_address,
        client_user_agent: params.client_user_agent,
        custom_data: expect.objectContaining(utms)
      })
    );
  });
});

