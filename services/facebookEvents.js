const { sendFacebookEvent } = require('./facebook');

function sendAddToCartEvent({ value, event_id, fbp, fbc, client_ip_address, client_user_agent }) {
  const params = {
    event_name: 'AddToCart',
    value,
    currency: 'BRL',
    event_id,
    fbp,
    fbc,
    client_ip_address,
    client_user_agent
  };

  if (typeof process.env.FB_TEST_EVENT_CODE === 'string' && process.env.FB_TEST_EVENT_CODE.trim()) {
    params.test_event_code = process.env.FB_TEST_EVENT_CODE.trim();
  }

  return sendFacebookEvent(params);
}

function sendInitiateCheckoutEvent({ value, event_id, fbp, fbc, client_ip_address, client_user_agent, utms = {} }) {
  return sendFacebookEvent({
    event_name: 'InitiateCheckout',
    value,
    currency: 'BRL',
    event_id,
    fbp,
    fbc,
    client_ip_address,
    client_user_agent,
    custom_data: utms
  });
}

module.exports = {
  sendAddToCartEvent,
  sendInitiateCheckoutEvent
};
