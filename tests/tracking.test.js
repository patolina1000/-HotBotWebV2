const fs = require('fs');
const axios = require('axios');
process.env.FB_PIXEL_ID = '123';
process.env.FB_PIXEL_TOKEN = 'token';
const { sendFacebookEvent, generateEventId } = require('../services/facebook');
const { extractHashedUserData } = require('../services/userData');

jest.mock('axios');

beforeEach(() => {
  axios.post.mockReset();
});

test('generateEventId uses token for Purchase events', () => {
  const id = generateEventId('Purchase', 'tok123');
  expect(id).toBe('tok123');
});

test('obrigado.html sends Purchase with token as eventID', () => {
  const html = fs.readFileSync('MODELO1/WEB/obrigado.html', 'utf8');
  expect(html).toMatch(/eventID\s*:\s*token/);
});

test('sendFacebookEvent forwards valid fbp and fbc', async () => {
  axios.post.mockResolvedValue({ data: { success: true } });

  await sendFacebookEvent({
    event_name: 'Purchase',
    event_id: 'tok',
    fbp: 'fbp123',
    fbc: 'fb.1.1700000000.abc',
    value: 1
  });

  const payload = axios.post.mock.calls[0][1];
  const userData = payload.data[0].user_data;
  expect(userData.fbp).toBe('fbp123');
  expect(userData.fbc).toBe('fb.1.1700000000.abc');
});

test('sendFacebookEvent omits invalid user data', async () => {
  axios.post.mockResolvedValue({ data: {} });

  await sendFacebookEvent({
    event_name: 'Purchase',
    event_id: 'tok2',
    fbp: '',
    fbc: 'invalid',
    client_ip_address: '127.0.0.1',
    client_user_agent: 'axios/1.0',
    value: 2
  });

  const payload = axios.post.mock.calls[0][1];
  const userData = payload.data[0].user_data;
  expect(userData.fbp).toBeUndefined();
  expect(userData.fbc).toBeUndefined();
  expect(userData.client_ip_address).toBeUndefined();
});

test('extractHashedUserData ignores invalid inputs', () => {
  const result = extractHashedUserData('{bad}', '123');
  expect(result).toEqual({});
});

test('sendFacebookEvent envia payload completo e correto', async () => {
  axios.post.mockResolvedValue({ data: { success: true } });

  const token = 'tokXYZ';

  await sendFacebookEvent({
    event_name: 'Purchase',
    event_id: token,
    fbp: 'fbp123',
    fbc: 'fbc456',
    value: 1,
    currency: 'BRL',
    event_time: Math.floor(Date.now() / 1000)
  });

  const payload = axios.post.mock.calls[0][1];
  const data = payload.data[0];

  expect(data.event_name).toBe('Purchase');
  expect(data.custom_data.value).toBe(1);
  expect(data.custom_data.currency).toBe('BRL');
  expect(typeof data.event_time).toBe('number');
  expect(data.event_id).toBe(token);
  expect(data.action_source).toBe('website');
});
