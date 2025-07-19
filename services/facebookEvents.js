const { sendFacebookEvent } = require('./facebook');

function sendAddToCartEvent({ value, event_id, fbp, fbc, client_ip_address, client_user_agent }) {
  return sendFacebookEvent({
    event_name: 'AddToCart',
    value,
    currency: 'BRL',
    event_id,
    fbp,
    fbc,
    client_ip_address,
    client_user_agent
  });
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
