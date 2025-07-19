const { sendFacebookEvent } = require('./facebook');

function sendAddToCartEvent({ value, event_id, fbp, fbc, client_ip_address, client_user_agent }) {
  const params = {
    event_name: 'AddToCart',
    event_time: Math.floor(Date.now() / 1000),
    value,
    currency: 'BRL',
    event_id,
    fbp,
    fbc,
    client_ip_address,
    client_user_agent,
    action_source: 'system_generated'
  };

  if (typeof process.env.FB_TEST_EVENT_CODE === 'string' && process.env.FB_TEST_EVENT_CODE.trim()) {
    params.test_event_code = process.env.FB_TEST_EVENT_CODE.trim();
  }

  return sendFacebookEvent(params);
}

function sendInitiateCheckoutEvent({ value, event_id, fbp, fbc, client_ip_address, client_user_agent, utms = {} }) {
  return sendFacebookEvent({
    event_name: 'InitiateCheckout',
    event_time: Math.floor(Date.now() / 1000),
    value,
    currency: 'BRL',
    event_id,
    fbp,
    fbc,
    client_ip_address,
    client_user_agent,
    action_source: 'system_generated',
    custom_data: utms
  });
}

module.exports = {
  sendAddToCartEvent,
  sendInitiateCheckoutEvent
};
