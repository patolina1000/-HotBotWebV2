const { sendFacebookEvent, applyTestEventCode } = require('./facebook');

function sendAddToCartEvent({ value, event_id, fbp, fbc, client_ip_address, client_user_agent }) {
  const params = applyTestEventCode({
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
  });

  return sendFacebookEvent(params);
}

function sendInitiateCheckoutEvent({ value, event_id, fbp, fbc, client_ip_address, client_user_agent, utms = {} }) {
  const params = applyTestEventCode({
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

  return sendFacebookEvent(params);
}

module.exports = {
  sendAddToCartEvent,
  sendInitiateCheckoutEvent
};
